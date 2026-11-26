import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { getDb, withTransaction, getLocalPastpaperCatalog } from '../config/db.js';
import { getOrSetCache, invalidateCachePrefix, checkRateLimitWindow } from '../config/cache.js';
import { CDN_BASE_URL, parsePositiveInt } from '../config/env.js';
import {
  getAuthenticatedUser,
  requireAuth,
  requirePaperAdmin,
  canManagePapers,
} from '../middleware/auth.js';
import {
  uploadLimiter,
  previewDownloadLimiter,
  batchDownloadLimiter,
  catalogBulkLimiter,
  acquireIpStreamSlot,
  MAX_ACTIVE_BATCH_ZIPS,
  getBatchZipCount,
  incrementBatchZipCount,
  decrementBatchZipCount,
} from '../middleware/rateLimiters.js';
import { paperUpload } from '../middleware/uploads.js';
import {
  recordDownloadCount,
  resolveOrFetchPdfDiskInfo,
  streamPdfWithByteRange,
  isAllowedAuraUrl,
} from '../utils/pdfStorage.js';
import {
  PAPER_META_COLS,
  PAPER_SELECT_SQL,
  formatPaperResponse,
  buildPaperFilterWhere,
  filterLocalCatalogPapers,
  getApprovedCatalogIndex,
  executeSmartCatalogSearch,
  canAccessPaper,
} from '../utils/paperHelpers.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { writeAuditLog } from '../utils/security.js';

const deflateAsync = promisify(zlib.deflate);
const router = createAsyncRouter();
let paperBlobColEnsured = false;

async function ensurePaperBlobCol(db) {
  if (paperBlobColEnsured) return;
  await db.query('ALTER TABLE papers ADD COLUMN IF NOT EXISTS file_blob BYTEA');
  paperBlobColEnsured = true;
}

async function isValidPdfFile(filePath) {
  let fh;
  try {
    fh = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(5);
    const { bytesRead } = await fh.read(buf, 0, 5, 0);
    return bytesRead === 5 && buf.toString('ascii') === '%PDF-';
  } catch {
    return false;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

router.get('/papers/public/all', catalogBulkLimiter, async (req, res) => {
  const allPapers = await getApprovedCatalogIndex();
  const { items } = executeSmartCatalogSearch(allPapers, req.query);
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.json(items);
});

router.get('/papers/public', async (req, res) => {
  const page = parsePositiveInt(req.query.page) || 1;
  const size = Math.min(100, parsePositiveInt(req.query.limit || req.query.size) || 24);
  const offset = (page - 1) * size;

  const allPapers = await getApprovedCatalogIndex();
  const { items: matchedItems, matchedAcronyms, facets } = executeSmartCatalogSearch(
    allPapers,
    req.query
  );

  const total = matchedItems.length;
  const paginatedItems = matchedItems.slice(offset, offset + size);

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.json({
    items: paginatedItems,
    total,
    page,
    size,
    pages: Math.max(1, Math.ceil(total / size)),
    matched_acronyms: matchedAcronyms,
    facets,
  });
});

router.get('/papers/pending', requirePaperAdmin, async (_req, res) => {
  const db = await getDb();
  const result = await db.query(
    `${PAPER_SELECT_SQL} WHERE UPPER(p.status) = 'PENDING' ORDER BY p.uploaded_at DESC`
  );
  res.json(result.rows.map((r) => formatPaperResponse(r, true)));
});

router.get('/papers', async (req, res) => {
  const user = await getAuthenticatedUser(req);
  const isStaff = canManagePapers(user);
  const forceApproved = !isStaff && req.query.my_papers_only !== 'true';
  const { whereClause, params } = buildPaperFilterWhere(req.query, forceApproved);
  let finalWhere = whereClause;
  if (req.query.my_papers_only === 'true') {
    if (!user) {
      res.status(401).json({ detail: 'Authentication required' });
      return;
    }
    params.push(user.id);
    finalWhere = finalWhere
      ? `${finalWhere} AND p.uploaded_by = $${params.length}`
      : `WHERE p.uploaded_by = $${params.length}`;
  }

  const page = parsePositiveInt(req.query.page) || 1;
  const limit = Math.min(500, parsePositiveInt(req.query.limit) || 200);
  const offset = (page - 1) * limit;

  const db = await getDb();
  const countParams = [...params];
  const queryParams = [...params, limit, offset];
  const [countRes, result] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM papers p LEFT JOIN courses c ON c.id = p.course_id ${finalWhere}`,
      countParams
    ),
    db.query(
      `${PAPER_SELECT_SQL} ${finalWhere} ORDER BY p.uploaded_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      queryParams
    ),
  ]);

  const total = Number(countRes.rows[0]?.total || 0);
  if (total > 0 || req.query.my_papers_only === 'true') {
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json(result.rows.map((r) => formatPaperResponse(r, isStaff)));
    return;
  }

  // Only fall back to static catalog if PostgreSQL papers table itself is empty
  const anyDbPaper = await db.query('SELECT 1 FROM papers LIMIT 1');
  if (anyDbPaper.rowCount > 0) {
    res.setHeader('X-Total-Count', '0');
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.json([]);
    return;
  }

  const localMatched = filterLocalCatalogPapers(req.query, forceApproved);
  res.setHeader('X-Total-Count', String(localMatched.length));
  res.setHeader('X-Page', String(page));
  res.setHeader('X-Limit', String(limit));
  res.json(
    localMatched
      .slice(offset, offset + limit)
      .map((r) => formatPaperResponse(r, isStaff))
  );
});

router.get('/papers/:paper_id', async (req, res) => {
  const paperId = parsePositiveInt(req.params.paper_id);
  if (!paperId) {
    res.status(400).json({ detail: 'Invalid paper ID' });
    return;
  }
  const db = await getDb();
  const result = await db.query(`${PAPER_SELECT_SQL} WHERE p.id = $1 LIMIT 1`, [paperId]);
  if (result.rowCount > 0) {
    const paper = result.rows[0];
    if (!(await canAccessPaper(req, paper))) {
      res.status(404).json({ detail: 'Paper not found' });
      return;
    }
    const user = await getAuthenticatedUser(req);
    res.json(formatPaperResponse(paper, canManagePapers(user)));
    return;
  }
  const localPaper = getLocalPastpaperCatalog().papers.find((p) => p.id === paperId);
  if (!localPaper) {
    res.status(404).json({ detail: 'Paper not found' });
    return;
  }
  res.json(formatPaperResponse(localPaper, false));
});

router.post('/papers/upload', requireAuth, uploadLimiter, paperUpload.single('file'), async (req, res) => {
  try {
    const user = req.user;
    const isPaperAdmin = canManagePapers(user);
    if (!isPaperAdmin && !user?.id_verified) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      res.status(403).json({ detail: 'ID verification required to upload papers.' });
      return;
    }
    if (!(await checkRateLimitWindow(`upload:user:${user.id}`, 20, 900))) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      res.status(429).json({ detail: 'Account upload limit reached. Please wait 15 minutes.' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ detail: 'PDF file is required' });
      return;
    }
    if (!(await isValidPdfFile(file.path))) {
      fs.unlink(file.path, () => {});
      res.status(400).json({ detail: 'Uploaded file is not a valid PDF document' });
      return;
    }

    const db = await getDb();
    if (!isPaperAdmin) {
      const recentUpload = await db.query(
        `SELECT id FROM papers
         WHERE uploaded_by = $1
           AND uploaded_at >= NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [user.id]
      );
      if (recentUpload.rowCount > 0) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        res.status(429).json({
          detail: 'Daily upload limit reached. You can only upload 1 paper per day.',
        });
        return;
      }
    }

    let courseId = parsePositiveInt(req.body.course_id) || 0;
    if (!courseId && req.body.course_code) {
      const code = String(req.body.course_code).trim().toUpperCase();
      const name = String(req.body.course_name || code).trim();
      // Never allow non-admins to overwrite an existing official course's name
      const cRes = isPaperAdmin
        ? await db.query(
            `INSERT INTO courses (code, name) VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
             RETURNING id`,
            [code, name]
          )
        : await db.query(
            `INSERT INTO courses (code, name) VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [code, name]
          );
      courseId = Number(cRes.rows[0].id);
    }

    const title = String(req.body.title || file.originalname.replace(/\.pdf$/i, '')).trim();
    const description = req.body.description || null;
    const paperType = String(req.body.paper_type || 'ENDTERM').toUpperCase();
    const year = Number(req.body.year || new Date().getFullYear());
    const semester = String(req.body.semester || '1').replace(/^Sem\s*/i, '').trim() || '1';
    const department = String(req.body.department || 'B.TECH').toUpperCase();
    const status = isPaperAdmin ? 'APPROVED' : 'PENDING';
    const publicLinkId = crypto.randomBytes(8).toString('hex');

    await ensurePaperBlobCol(db);
    const rawPdfBuf = await fs.promises.readFile(file.path);
    const compressedBlob = await deflateAsync(rawPdfBuf);

    const inserted = await db.query(
      `INSERT INTO papers (
        course_id, uploaded_by, title, description, paper_type, year, semester,
        department, file_path, file_name, file_size, file_blob, status, public_link_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [
        courseId || 1,
        user?.id || null,
        title,
        description,
        paperType,
        year,
        semester,
        department,
        file.filename,
        file.originalname,
        file.size,
        compressedBlob,
        status,
        publicLinkId,
      ]
    );

    invalidateCachePrefix('papers:');
    invalidateCachePrefix('courses:');
    invalidateCachePrefix('admin:');
    invalidateCachePrefix('metrics:');

    const fullPaper = await db.query(`${PAPER_SELECT_SQL} WHERE p.id = $1`, [inserted.rows[0].id]);
    res.json(formatPaperResponse(fullPaper.rows[0], isPaperAdmin));
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('[Paper Upload Error]', err);
    res.status(500).json({ detail: 'Failed to upload paper' });
  }
});

router.post('/papers/bulk-upload', requirePaperAdmin, uploadLimiter, paperUpload.array('files', 100), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      res.status(400).json({ detail: 'No PDF files provided' });
      return;
    }
    const validationChecks = await Promise.all(files.map((f) => isValidPdfFile(f.path)));
    if (validationChecks.some((ok) => !ok)) {
      for (const f of files) fs.unlink(f.path, () => {});
      res.status(400).json({ detail: 'All uploaded files must be valid PDF documents' });
      return;
    }

    const db = await getDb();
    await ensurePaperBlobCol(db);
    const year = Number(req.body.year || new Date().getFullYear());
    const semester = String(req.body.semester || '1').replace(/^Sem\s*/i, '').trim() || '1';
    const department = String(req.body.department || 'B.TECH').toUpperCase();
    const paperType = String(req.body.paper_type || 'ENDTERM').toUpperCase();

    // Compress files asynchronously before starting DB transaction
    const preparedFiles = await Promise.all(
      files.map(async (file) => ({
        file,
        compressedBlob: await deflateAsync(await fs.promises.readFile(file.path)),
      }))
    );

    const createdIds = await withTransaction(db, async (tx) => {
      const ids = [];
      for (const { file, compressedBlob } of preparedFiles) {
        const baseName = path.basename(file.originalname, '.pdf').trim();
        const codeMatch = baseName.match(/^([A-Za-z]{2,4}[-\s]?\d{3,4})\s*[;:,-]?\s*(.*)$/);
        const rawCode = codeMatch ? codeMatch[1].replace(/[-\s]/g, '').toUpperCase() : 'GEN1001';
        const rawCourseName = (codeMatch && codeMatch[2] ? codeMatch[2].trim() : baseName) || rawCode;

        const cRes = await tx.query(
          `INSERT INTO courses (code, name, description)
           VALUES ($1, $2, $3)
           ON CONFLICT (code) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [rawCode, rawCourseName, `${department} Course`]
        );
        const courseId = Number(cRes.rows[0].id);
        const title = `${rawCode} - ${rawCourseName} - ${paperType} - Sem ${semester} - ${year}`;
        const description = `Programme: ${department} | Year: ${year} | Semester: ${semester}`;
        const pubId = crypto.randomBytes(8).toString('hex');

        const ins = await tx.query(
          `INSERT INTO papers (
            course_id, uploaded_by, title, description, paper_type, year, semester, department,
            file_path, file_name, file_size, file_blob, status, public_link_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'APPROVED', $13)
          RETURNING id`,
          [
            courseId,
            req.user.id,
            title,
            description,
            paperType,
            year,
            semester,
            department,
            file.filename,
            file.originalname,
            file.size,
            compressedBlob,
            pubId,
          ]
        );
        ids.push(Number(ins.rows[0].id));
      }
      return ids;
    });

    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'BULK_UPLOAD_PAPERS',
      entityType: 'PAPER',
      metadata: { count: createdIds.length, department, year, semester },
    });

    invalidateCachePrefix('papers:');
    invalidateCachePrefix('courses:');
    invalidateCachePrefix('admin:');
    invalidateCachePrefix('metrics:');

    res.json({
      message: `Successfully uploaded and indexed ${createdIds.length} papers`,
      count: createdIds.length,
      ids: createdIds,
    });
  } catch (err) {
    for (const f of req.files || []) fs.unlink(f.path, () => {});
    console.error('[Bulk Upload Error]', err);
    res.status(500).json({ detail: 'Bulk upload failed' });
  }
});

router.post('/papers/batch-download', batchDownloadLimiter, async (req, res) => {
  if (!acquireIpStreamSlot(req, res)) return;
  if (getBatchZipCount() >= MAX_ACTIVE_BATCH_ZIPS) {
    res.status(503).json({ detail: 'Batch ZIP builder is busy. Please retry in a few seconds.' });
    return;
  }
  if (!(await checkRateLimitWindow('batch:global', 60, 60))) {
    res.status(429).json({ detail: 'Global batch download limit reached. Please retry in a minute.' });
    return;
  }
  incrementBatchZipCount();
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const uniqueIds = Array.from(
      new Set(rawIds.map((v) => parsePositiveInt(v)).filter((v) => v !== null))
    );
    if (uniqueIds.length === 0) {
      res.status(400).json({ detail: 'Select at least 1 valid paper ID to download.' });
      return;
    }
    if (uniqueIds.length > 5) {
      res.status(400).json({ detail: 'Maximum 5 papers can be downloaded at once.' });
      return;
    }

    const db = await getDb();
    const zip = new JSZip();
    const usedNames = new Set();
    let addedCount = 0;

    for (const paperId of uniqueIds) {
      const paper = await getOrSetCache(`papers:meta:${paperId}`, 120000, async () => {
        const result = await db.query(
          `SELECT ${PAPER_META_COLS} FROM papers p WHERE p.id = $1 LIMIT 1`,
          [paperId]
        );
        if (result.rowCount > 0) return result.rows[0];
        return getLocalPastpaperCatalog().papers.find((p) => p.id === paperId) || null;
      });
      if (!paper || !(await canAccessPaper(req, paper))) continue;

      const diskInfo = await resolveOrFetchPdfDiskInfo(paper);
      if (!diskInfo) continue;

      let baseName = String(paper.file_name || `paper_${paper.id}.pdf`).replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
      );
      if (!baseName.toLowerCase().endsWith('.pdf')) baseName += '.pdf';
      let finalName = baseName;
      let suffix = 1;
      while (usedNames.has(finalName)) {
        finalName = baseName.replace(/\.pdf$/i, `_${suffix++}.pdf`);
      }
      usedNames.add(finalName);

      try {
        const fileBuf = await fs.promises.readFile(diskInfo.diskPath);
        zip.file(finalName, fileBuf);
        recordDownloadCount(req, paperId);
        addedCount++;
      } catch {}
    }

    if (addedCount === 0) {
      res.status(404).json({ detail: 'None of the selected PDFs could be found on storage.' });
      return;
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="LearnJKLU_Papers_Batch.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ detail: err.message || 'Batch download failed' });
  } finally {
    decrementBatchZipCount();
  }
});

router.get('/papers/:paper_id/preview', previewDownloadLimiter, async (req, res) => {
  const paperId = parsePositiveInt(req.params.paper_id);
  if (!paperId) {
    res.status(400).json({ detail: 'Invalid paper ID' });
    return;
  }
  if (!acquireIpStreamSlot(req, res)) return;

  const paper = await getOrSetCache(`papers:meta:${paperId}`, 120000, async () => {
    const db = await getDb();
    const result = await db.query(
      `SELECT ${PAPER_META_COLS} FROM papers p WHERE p.id = $1 LIMIT 1`,
      [paperId]
    );
    if (result.rowCount > 0) return result.rows[0];
    return getLocalPastpaperCatalog().papers.find((p) => p.id === paperId) || null;
  });
  if (!paper || !(await canAccessPaper(req, paper))) {
    res.status(404).json({ detail: 'Paper not found' });
    return;
  }
  const diskInfo = await resolveOrFetchPdfDiskInfo(paper);
  if (!diskInfo) {
    if (isAllowedAuraUrl(paper.file_path || '')) {
      res.redirect(302, paper.file_path);
      return;
    }
    res.status(404).json({ detail: 'PDF file not found on storage' });
    return;
  }
  const isPublicApproved = !paper.status || String(paper.status).toLowerCase() === 'approved';
  streamPdfWithByteRange(
    req,
    res,
    diskInfo,
    paper.file_name || `paper_${paper.id}.pdf`,
    'inline',
    isPublicApproved
  );
});

router.get('/papers/:paper_id/download', previewDownloadLimiter, async (req, res) => {
  const paperId = parsePositiveInt(req.params.paper_id);
  if (!paperId) {
    res.status(400).json({ detail: 'Invalid paper ID' });
    return;
  }
  if (!acquireIpStreamSlot(req, res)) return;

  const paper = await getOrSetCache(`papers:meta:${paperId}`, 120000, async () => {
    const db = await getDb();
    const result = await db.query(
      `SELECT ${PAPER_META_COLS} FROM papers p WHERE p.id = $1 LIMIT 1`,
      [paperId]
    );
    if (result.rowCount > 0) return result.rows[0];
    return getLocalPastpaperCatalog().papers.find((p) => p.id === paperId) || null;
  });
  if (!paper || !(await canAccessPaper(req, paper))) {
    res.status(404).json({ detail: 'Paper not found' });
    return;
  }
  recordDownloadCount(req, paperId);

  const isPublicApproved = !paper.status || String(paper.status).toLowerCase() === 'approved';
  if (isPublicApproved && CDN_BASE_URL && !/^https?:\/\//i.test(paper.file_path || '')) {
    res.redirect(302, `${CDN_BASE_URL}/${encodeURIComponent(paper.file_path)}`);
    return;
  }

  const diskInfo = await resolveOrFetchPdfDiskInfo(paper);
  if (!diskInfo) {
    if (isAllowedAuraUrl(paper.file_path || '')) {
      res.redirect(302, paper.file_path);
      return;
    }
    res.status(404).json({ detail: 'PDF file not found on storage' });
    return;
  }
  streamPdfWithByteRange(
    req,
    res,
    diskInfo,
    paper.file_name || `paper_${paper.id}.pdf`,
    'attachment',
    isPublicApproved
  );
});

router.get('/public/papers/:public_link_id', previewDownloadLimiter, async (req, res) => {
  const pubId = String(req.params.public_link_id || '').trim();
  if (!pubId || pubId.length > 64) {
    res.status(400).json({ detail: 'Invalid shared paper link' });
    return;
  }
  if (!acquireIpStreamSlot(req, res)) return;
  const paper = await getOrSetCache(`papers:publink:${pubId}`, 120000, async () => {
    const db = await getDb();
    const result = await db.query(
      `SELECT ${PAPER_META_COLS} FROM papers p WHERE p.public_link_id = $1 AND UPPER(p.status) = 'APPROVED' LIMIT 1`,
      [pubId]
    );
    if (result.rowCount > 0) return result.rows[0];
    return (
      getLocalPastpaperCatalog().papers.find(
        (p) => p.public_link_id === pubId && String(p.status || 'APPROVED').toUpperCase() === 'APPROVED'
      ) || null
    );
  });
  if (!paper) {
    res.status(404).json({ detail: 'Shared paper link not found' });
    return;
  }
  const diskInfo = await resolveOrFetchPdfDiskInfo(paper);
  if (!diskInfo) {
    if (isAllowedAuraUrl(paper.file_path || '')) {
      res.redirect(302, paper.file_path);
      return;
    }
    res.status(404).json({ detail: 'PDF file not found on storage' });
    return;
  }
  streamPdfWithByteRange(
    req,
    res,
    diskInfo,
    paper.file_name || `paper_${paper.id}.pdf`,
    'inline',
    true
  );
});

router.patch('/papers/:paper_id/review', requirePaperAdmin, async (req, res) => {
  const paperId = parsePositiveInt(req.params.paper_id);
  if (!paperId) {
    res.status(400).json({ detail: 'Invalid paper ID' });
    return;
  }
  const status = String(req.body.status || 'APPROVED').toUpperCase();
  if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
    res.status(400).json({ detail: 'Status must be APPROVED, REJECTED, or PENDING' });
    return;
  }
  const rejectionReason = req.body.rejection_reason || null;
  const adminFeedback = req.body.admin_feedback ? JSON.stringify(req.body.admin_feedback) : null;
  const user = req.user;

  const db = await getDb();
  const updRes = await db.query(
    `UPDATE papers
     SET status = $1,
         reviewed_by = $2,
         reviewed_at = NOW(),
         rejection_reason = $3,
         admin_feedback = COALESCE($4::jsonb, admin_feedback),
         updated_at = NOW()
     WHERE id = $5`,
    [status, user.id, rejectionReason, adminFeedback, paperId]
  );
  if (updRes.rowCount === 0) {
    res.status(404).json({ detail: 'Paper not found' });
    return;
  }
  await writeAuditLog(db, {
    actorId: user.id,
    action: `REVIEW_PAPER_${status}`,
    entityType: 'PAPER',
    entityId: paperId,
    metadata: { status, rejectionReason },
  });
  invalidateCachePrefix('papers:');
  invalidateCachePrefix('courses:');
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('metrics:');
  const updated = await db.query(`${PAPER_SELECT_SQL} WHERE p.id = $1`, [paperId]);
  res.json(formatPaperResponse(updated.rows[0], true));
});

router.put('/papers/:paper_id/edit', requirePaperAdmin, paperUpload.none(), async (req, res) => {
  const paperId = parsePositiveInt(req.params.paper_id);
  if (!paperId) {
    res.status(400).json({ detail: 'Invalid paper ID' });
    return;
  }
  const { course_id, course_code, paper_type, year, semester, title, department } = req.body;
  const db = await getDb();

  let resolvedCourseId = parsePositiveInt(course_id);
  const codeCandidate =
    !resolvedCourseId && (course_code || (course_id && String(course_id).trim()))
      ? String(course_code || course_id)
          .trim()
          .toUpperCase()
      : null;

  if (!resolvedCourseId && codeCandidate) {
    const cLookup = await db.query('SELECT id FROM courses WHERE UPPER(code) = $1 LIMIT 1', [
      codeCandidate,
    ]);
    if (cLookup.rowCount > 0) {
      resolvedCourseId = Number(cLookup.rows[0].id);
    } else {
      res.status(400).json({ detail: `Course code "${codeCandidate}" not found.` });
      return;
    }
  }

  const parsedYear = year !== undefined && year !== '' ? parsePositiveInt(year) : null;
  const normalizedSemester =
    semester !== undefined && semester !== ''
      ? String(semester).replace(/^Sem\s*/i, '').trim()
      : null;

  await db.query(
    `UPDATE papers
     SET course_id = COALESCE($1, course_id),
         paper_type = COALESCE($2, paper_type),
         year = COALESCE($3, year),
         semester = COALESCE($4, semester),
         title = COALESCE($5, title),
         department = COALESCE($6, department),
         updated_at = NOW()
     WHERE id = $7`,
    [
      resolvedCourseId || null,
      paper_type ? String(paper_type).toUpperCase() : null,
      parsedYear,
      normalizedSemester,
      title ? String(title).trim() : null,
      department ? String(department).trim().toUpperCase() : null,
      paperId,
    ]
  );
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'EDIT_PAPER',
    entityType: 'PAPER',
    entityId: paperId,
    metadata: { course_id: resolvedCourseId, paper_type, year: parsedYear, semester: normalizedSemester },
  });
  invalidateCachePrefix('papers:');
  invalidateCachePrefix('courses:');
  invalidateCachePrefix('admin:');
  const updated = await db.query(`${PAPER_SELECT_SQL} WHERE p.id = $1`, [paperId]);
  if (updated.rowCount === 0) {
    res.status(404).json({ detail: 'Paper not found' });
    return;
  }
  res.json(formatPaperResponse(updated.rows[0], true));
});

router.delete('/papers/:paper_id', requirePaperAdmin, async (req, res) => {
  const paperId = parsePositiveInt(req.params.paper_id);
  if (!paperId) {
    res.status(400).json({ detail: 'Invalid paper ID' });
    return;
  }
  const db = await getDb();
  await db.query('DELETE FROM papers WHERE id = $1', [paperId]);
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'DELETE_PAPER',
    entityType: 'PAPER',
    entityId: paperId,
  });
  invalidateCachePrefix('papers:');
  invalidateCachePrefix('courses:');
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('metrics:');
  res.json({ message: 'Paper deleted' });
});

export default router;
