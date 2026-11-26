import path from 'node:path';
import fs from 'node:fs';
import { getDb, getLocalPastpaperCatalog } from '../config/db.js';
import { getOrSetCache, getCacheMetrics } from '../config/cache.js';
import { STORAGE_USERS_DIR, STORAGE_PAPERS_DIR, isValidAdminSecretSlug } from '../config/env.js';
import {
  getAuthenticatedUser,
  canVerifyStudentIds,
  canAccessAdminPanel,
} from '../middleware/auth.js';
import {
  getRequestStats,
  previewDownloadLimiter,
  adminSecretVerifyLimiter,
} from '../middleware/rateLimiters.js';
import { streamPdfWithByteRange } from '../utils/pdfStorage.js';
import { canAccessPaper } from '../utils/paperHelpers.js';
import { getMaintenanceStatus } from '../utils/maintenance.js';
import { createAsyncRouter } from '../utils/routerHelper.js';

const router = createAsyncRouter();

async function statFileSafe(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

router.get('/', (_req, res) => {
  res.json({
    service: 'Learn JKLU 2.0 Express.js High-Concurrency Engine (JavaScript ESM)',
    status: 'online',
    architecture: 'Elephant & Goldfish (PostgreSQL + Singleflight L1 Cache + Async Crypto Pool)',
  });
});

router.get('/wake', (_req, res) => {
  res.json({ status: 'awake', timestamp: new Date().toISOString() });
});

router.get('/maintenance-status', async (_req, res) => {
  const status = await getMaintenanceStatus();
  res.setHeader('Cache-Control', 'no-store');
  res.json(status);
});

router.post('/admin-access/verify', adminSecretVerifyLimiter, (req, res) => {
  const slug = String(req.body?.slug || '').trim();
  const valid = isValidAdminSecretSlug(slug);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ valid });
});

router.get('/health', async (_req, res) => {
  try {
    const db = await getDb();
    await db.query('SELECT 1');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'healthy',
      database: 'connected',
    });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
    });
  }
});

router.get('/metrics', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  const isStaff = canAccessAdminPanel(user);
  const db = await getDb();
  const counts = await getOrSetCache('metrics:counts', 15000, async () => {
    const [u, c, p, co, pp] = await Promise.all([
      db.query('SELECT COUNT(*)::text as count FROM users'),
      db.query('SELECT COUNT(*)::text as count FROM courses'),
      db.query('SELECT COUNT(*)::text as count FROM papers WHERE UPPER(status) = $1', ['APPROVED']),
      db.query('SELECT COUNT(*)::int as count FROM course_offerings WHERE is_released = TRUE'),
      db.query('SELECT COUNT(*)::int as count FROM professor_profiles WHERE is_public = TRUE'),
    ]);
    const dbCourses = Number(c.rows[0]?.count || 0);
    const dbPapers = Number(p.rows[0]?.count || 0);
    const localStats = getLocalPastpaperCatalog().stats;

    return {
      users: Number(u.rows[0]?.count || 0),
      courses: dbCourses > 0 ? dbCourses : localStats.totalCourses || 748,
      approvedPapers: dbPapers > 0 ? dbPapers : localStats.totalPapers || 1950,
      programmes: Object.keys(localStats.byDept || {}).length || 9,
      byDepartment: localStats.byDept || {},
      activeClassrooms: Number(co.rows[0]?.count || 0),
      facultyCount: Number(pp.rows[0]?.count || 0),
    };
  });

  if (!isStaff) {
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.json({
      counts: {
        courses: counts.courses,
        approvedPapers: counts.approvedPapers,
        programmes: counts.programmes,
        byDepartment: counts.byDepartment,
        activeClassrooms: counts.activeClassrooms,
        facultyCount: counts.facultyCount,
      },
    });
    return;
  }

  const { activeRequests, totalRequestsHandled } = getRequestStats();
  res.json({
    engine: db.engineName,
    counts,
    cache: getCacheMetrics(),
    activeRequests,
    totalRequestsHandled,
  });
});

/**
 * Pure aggregation of approved-paper rows into archive stats (exported for verification).
 * rows: [{ department, year, paper_type, course_code, course_name, school }]
 */
export function aggregateArchiveRows(rows, source = 'database') {
  const byDeptYearType = {};
  const yearTotals = {};
  const typeTotals = {};
  const deptTotals = {};
  const schoolTotals = {};
  const courseMap = new Map();
  for (const r of rows) {
    const dept = String(r.department || 'B.TECH').trim().toUpperCase() || 'B.TECH';
    const year = Number(r.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) continue;
    const type = String(r.paper_type || 'ENDTERM').trim().toUpperCase() || 'ENDTERM';
    const n = Number(r.n || 1);
    if (!byDeptYearType[dept]) byDeptYearType[dept] = {};
    if (!byDeptYearType[dept][year]) byDeptYearType[dept][year] = {};
    byDeptYearType[dept][year][type] = (byDeptYearType[dept][year][type] || 0) + n;
    yearTotals[year] = (yearTotals[year] || 0) + n;
    typeTotals[type] = (typeTotals[type] || 0) + n;
    deptTotals[dept] = (deptTotals[dept] || 0) + n;
    if (r.school) {
      const school = String(r.school).trim().toUpperCase();
      schoolTotals[school] = (schoolTotals[school] || 0) + n;
    }
    const code = String(r.course_code || '').trim().toUpperCase();
    if (code && code !== 'GEN') {
      if (!courseMap.has(code)) {
        courseMap.set(code, { code, name: r.course_name || code, count: 0, years: new Set() });
      }
      const c = courseMap.get(code);
      c.count += n;
      c.years.add(year);
    }
  }
  const courseYears = {};
  const courses = Array.from(courseMap.values());
  for (const c of courses) {
    courseYears[c.code] = Array.from(c.years).sort((a, b) => a - b);
  }
  const topCourses = courses
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 12)
    .map((c) => ({ code: c.code, name: c.name, count: c.count, years: courseYears[c.code] }));
  const years = Object.keys(yearTotals).map(Number).sort((a, b) => a - b);
  const total = Object.values(deptTotals).reduce((s, v) => s + v, 0);
  return {
    source,
    total,
    years,
    programmes: Object.keys(deptTotals).sort((a, b) => deptTotals[b] - deptTotals[a]),
    byDeptYearType,
    yearTotals,
    typeTotals,
    deptTotals,
    schoolTotals,
    topCourses,
    courseYears,
    courseCount: courses.length,
    generatedAt: new Date().toISOString(),
  };
}

router.get('/stats/archive', async (_req, res) => {
  // `papers:` prefix is cleared by every existing paper/course mutation (upload, approve, delete, sync).
  const stats = await getOrSetCache('papers:stats:archive:v1', 120 * 1000, async () => {
    const db = await getDb();
    const result = await db.query(
      `SELECT UPPER(COALESCE(p.department, 'B.TECH')) AS department,
              p.year,
              UPPER(COALESCE(p.paper_type, 'ENDTERM')) AS paper_type,
              c.code AS course_code,
              c.name AS course_name,
              c.school AS school,
              COUNT(*)::int AS n
       FROM papers p
       LEFT JOIN courses c ON c.id = p.course_id
       WHERE UPPER(p.status) = 'APPROVED'
       GROUP BY 1, 2, 3, 4, 5, 6`
    );
    if (result.rowCount > 0) {
      return aggregateArchiveRows(result.rows, 'database');
    }
    const local = getLocalPastpaperCatalog().papers.filter(
      (p) => String(p.status || 'APPROVED').toUpperCase() === 'APPROVED'
    );
    return aggregateArchiveRows(local, 'local_catalog');
  });
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.json(stats);
});

router.get('/uploads/:filename(*)', previewDownloadLimiter, async (req, res) => {
  const filename = req.params.filename || '';
  const base = path.basename(filename);
  if (!base || base === '.' || base === '..') {
    res.status(404).json({ detail: 'File not found' });
    return;
  }

  // Never expose internal cache artifacts via /uploads
  if (/^(db|bin|aura)_/i.test(base)) {
    res.status(404).json({ detail: 'File not found' });
    return;
  }

  const userFile = path.join(STORAGE_USERS_DIR, base);
  const userStat = await statFileSafe(userFile);
  if (userStat) {
    const user = await getAuthenticatedUser(req);
    const canVerify = canVerifyStudentIds(user);
    const isOwner = Boolean(user && user.id_card_path && path.basename(user.id_card_path) === base);
    if (!user || (!canVerify && !isOwner)) {
      res.status(403).json({ detail: 'Authentication required to access user files' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(userFile);
    return;
  }

  // Serverless fallback: load ID card binary from PostgreSQL when /tmp disk is ephemeral
  try {
    const user = await getAuthenticatedUser(req);
    if (user) {
      const db = await getDb();
      const rowRes = await db.query(
        `SELECT id, id_card_path, id_card_data, id_card_mime FROM users WHERE id_card_path = $1 LIMIT 1`,
        [base]
      );
      if (rowRes.rowCount > 0 && rowRes.rows[0].id_card_data) {
        const record = rowRes.rows[0];
        const canVerify = canVerifyStudentIds(user);
        const isOwner = Number(record.id) === Number(user.id);
        if (!canVerify && !isOwner) {
          res.status(403).json({ detail: 'Authentication required to access user files' });
          return;
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', record.id_card_mime || 'application/octet-stream');
        res.send(Buffer.from(record.id_card_data));
        return;
      }
    }
  } catch {
    // Column may not exist yet before first upload
  }

  // Exact-match only inside the papers store.
  const paperFile = path.join(STORAGE_PAPERS_DIR, base);
  const paperStat = await statFileSafe(paperFile);
  if (!paperStat) {
    res.status(404).json({ detail: 'File not found' });
    return;
  }

  // Enforce paper access rules & public cacheability strictly
  const db = await getDb();
  const owner = await db.query(
    'SELECT id, status, uploaded_by FROM papers WHERE file_path = $1 LIMIT 1',
    [base]
  );
  if (owner.rowCount > 0) {
    const paperRecord = owner.rows[0];
    if (!(await canAccessPaper(req, paperRecord))) {
      res.status(404).json({ detail: 'File not found' });
      return;
    }
    const isPublicApproved = String(paperRecord.status || '').toUpperCase() === 'APPROVED';
    streamPdfWithByteRange(
      req,
      res,
      { diskPath: paperFile, fileSize: paperStat.size },
      base,
      'inline',
      isPublicApproved
    );
    return;
  }

  // Check if it's a coding announcement attachment (exact suffix match, immune to SQL LIKE wildcards)
  const annSuffix = `/${base}`;
  const annRes = await db.query(
    'SELECT id FROM coding_announcements WHERE RIGHT(attachment_url, LENGTH($1)) = $1 LIMIT 1',
    [annSuffix]
  );
  if (annRes.rowCount > 0) {
    streamPdfWithByteRange(
      req,
      res,
      { diskPath: paperFile, fileSize: paperStat.size },
      base,
      'inline',
      true
    );
    return;
  }

  res.status(404).json({ detail: 'File not found' });
});

export default router;
