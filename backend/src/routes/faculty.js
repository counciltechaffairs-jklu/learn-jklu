import { getDb, withTransaction } from '../config/db.js';
import { getOrSetCache, invalidateCachePrefix } from '../config/cache.js';
import { IS_PRODUCTION } from '../config/env.js';
import { hashPasswordNonBlocking } from '../config/cryptoPool.js';
import {
  requireProfessorOrAdmin,
  requireFullAdmin,
  isFullAdminUser,
  getAuthenticatedUser,
} from '../middleware/auth.js';
import { profileWriteLimiter } from '../middleware/rateLimiters.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { validateHttpsUrl, writeAuditLog } from '../utils/security.js';

const router = createAsyncRouter();

const ALLOWED_CARD_STYLES = new Set([
  'constellation',
  'mesh',
  'prism',
  'halo',
  'minimal',
]);

/**
 * Helper: Fetch public M:N courses & public TAs mapped by professor user_id
 */
async function loadPublicFacultyDirectory() {
  const db = await getDb();

  const profRes = await db.query(
    `SELECT
       pp.id AS profile_id,
       pp.user_id,
       u.name,
       u.department,
       u.photo_path,
       pp.designation,
       pp.school,
       pp.programmes,
       pp.batches_taught,
       pp.public_email,
       pp.public_phone,
       pp.cabin_number,
       pp.office_hours,
       pp.specialization,
       pp.bio,
       pp.google_scholar_url,
       pp.card_style,
       pp.updated_at
     FROM professor_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.is_public = TRUE AND u.is_active = TRUE
     ORDER BY pp.school ASC, u.name ASC`
  );

  const instRes = await db.query(
    `SELECT
       ci.professor_id,
       ci.role_label,
       co.id AS offering_id,
       co.course_code,
       co.course_name,
       co.academic_session,
       co.programme,
       co.batch_year,
       co.semester,
       co.section,
       co.join_code,
       co.is_released,
       co.tcs_ion_course_id,
       co.syllabus_drive_url
     FROM course_instructors ci
     JOIN course_offerings co ON co.id = ci.offering_id
     WHERE co.is_released = TRUE
     ORDER BY co.course_code ASC`
  );

  // Also fetch all co-instructors & public TAs per offering so students see co-teachers (>2 profs, >2 courses)
  const allCoProfsRes = await db.query(
    `SELECT
       ci.offering_id,
       ci.professor_id,
       ci.role_label,
       u.name,
       pp.public_email,
       pp.public_phone,
       pp.cabin_number,
       pp.office_hours,
       pp.designation,
       pp.school
     FROM course_instructors ci
     JOIN users u ON u.id = ci.professor_id
     LEFT JOIN professor_profiles pp ON pp.user_id = u.id`
  );

  const allTasRes = await db.query(
    `SELECT
       id,
       offering_id,
       public_name,
       public_email,
       public_phone,
       public_batch,
       lab_hours
     FROM course_tas
     ORDER BY id ASC`
  );

  const coProfsByOffering = new Map();
  for (const row of allCoProfsRes.rows) {
    const oid = Number(row.offering_id);
    if (!coProfsByOffering.has(oid)) coProfsByOffering.set(oid, []);
    coProfsByOffering.get(oid).push({
      professor_id: Number(row.professor_id),
      name: row.name,
      role_label: row.role_label,
      designation: row.designation || 'Faculty',
      school: row.school || 'IET',
      public_email: row.public_email,
      public_phone: row.public_phone || null,
      cabin_number: row.cabin_number || null,
      office_hours: row.office_hours || null,
    });
  }

  const tasByOffering = new Map();
  for (const row of allTasRes.rows) {
    const oid = Number(row.offering_id);
    if (!tasByOffering.has(oid)) tasByOffering.set(oid, []);
    // Notice: Strictly public TA card fields ONLY — personal student profile fields are never queried or returned
    tasByOffering.get(oid).push({
      id: Number(row.id),
      public_name: row.public_name,
      public_email: row.public_email,
      public_phone: row.public_phone || null,
      public_batch: row.public_batch || null,
      lab_hours: row.lab_hours || null,
    });
  }

  const coursesByProf = new Map();
  for (const row of instRes.rows) {
    const pid = Number(row.professor_id);
    const oid = Number(row.offering_id);
    if (!coursesByProf.has(pid)) coursesByProf.set(pid, []);
    coursesByProf.get(pid).push({
      offering_id: oid,
      course_code: row.course_code,
      course_name: row.course_name,
      role_label: row.role_label,
      academic_session: row.academic_session,
      programme: row.programme,
      batch_year: row.batch_year,
      semester: row.semester,
      section: row.section,
      is_released: Boolean(row.is_released),
      tcs_ion_course_id: row.tcs_ion_course_id || null,
      syllabus_drive_url: row.syllabus_drive_url || null,
      co_instructors: (coProfsByOffering.get(oid) || []).filter((c) => c.professor_id !== pid),
      tas: tasByOffering.get(oid) || [],
    });
  }

  return profRes.rows.map((p) => {
    const uid = Number(p.user_id);
    const programmes = Array.isArray(p.programmes)
      ? p.programmes
      : typeof p.programmes === 'string'
        ? JSON.parse(p.programmes || '["B.TECH"]')
        : ['B.TECH'];
    const batches = Array.isArray(p.batches_taught)
      ? p.batches_taught
      : typeof p.batches_taught === 'string'
        ? JSON.parse(p.batches_taught || '[]')
        : [];
    const courses = coursesByProf.get(uid) || [];

    return {
      user_id: uid,
      profile_id: Number(p.profile_id),
      name: p.name,
      designation: p.designation,
      school: p.school,
      department: p.department,
      photo_path: p.photo_path || null,
      programmes,
      batches_taught: batches,
      public_email: p.public_email,
      public_phone: p.public_phone || null,
      cabin_number: p.cabin_number || null,
      office_hours: p.office_hours || null,
      specialization: p.specialization || null,
      bio: p.bio || null,
      google_scholar_url: p.google_scholar_url || null,
      card_style: ALLOWED_CARD_STYLES.has(String(p.card_style || '')) ? p.card_style : 'constellation',
      course_count: courses.length,
      courses,
      // Explicitly omit private_faculty_notes, password_hash, tcs_ion_faculty_id, admin_feedback
    };
  });
}

/**
 * GET /faculty/directory
 * Public Faculty & TA Directory filterable by programme (B.TECH, BBA, BCA, B.DES, M.TECH), school, batch, or search
 */
router.get('/faculty/directory', async (req, res) => {
  const allFaculty = await getOrSetCache('faculty:directory:v2', 60 * 1000, loadPublicFacultyDirectory);

  const progFilter = req.query.programme ? String(req.query.programme).trim().toUpperCase() : null;
  const schoolFilter = req.query.school ? String(req.query.school).trim().toUpperCase() : null;
  const batchFilter = req.query.batch ? String(req.query.batch).trim().toLowerCase() : null;
  const qFilter = req.query.q ? String(req.query.q).trim().toLowerCase() : null;

  const filtered = allFaculty.filter((f) => {
    if (progFilter && progFilter !== 'ALL') {
      const hasProg =
        f.programmes.some((pr) => String(pr).toUpperCase() === progFilter) ||
        f.courses.some((c) => String(c.programme).toUpperCase() === progFilter);
      if (!hasProg) return false;
    }
    if (schoolFilter && schoolFilter !== 'ALL' && String(f.school).toUpperCase() !== schoolFilter) {
      return false;
    }
    if (batchFilter && batchFilter !== 'all') {
      const hasBatch =
        f.batches_taught.some((b) => String(b).toLowerCase().includes(batchFilter)) ||
        f.courses.some((c) => String(c.batch_year).toLowerCase().includes(batchFilter));
      if (!hasBatch) return false;
    }
    if (qFilter) {
      const hay = `${f.name} ${f.designation} ${f.school} ${f.specialization || ''} ${f.public_email} ${f.courses
        .map((c) => `${c.course_code} ${c.course_name}`)
        .join(' ')}`.toLowerCase();
      if (!hay.includes(qFilter)) return false;
    }
    return true;
  });

  res.json({
    total: filtered.length,
    privacy_mode: 'PUBLIC_SAFE_MASKED',
    items: filtered,
  });
});

/**
 * GET /faculty/course/:course_code
 * Returns active classroom offering, co-professors, and public TAs for a specific course code (e.g. CS1135)
 */
router.get('/faculty/course/:course_code', async (req, res) => {
  const code = String(req.params.course_code || '').trim().toUpperCase();
  const [user, allFaculty] = await Promise.all([
    getAuthenticatedUser(req),
    getOrSetCache('faculty:directory:v2', 60 * 1000, loadPublicFacultyDirectory),
  ]);

  const instructors = [];
  let offeringMeta = null;
  let tas = [];

  for (const prof of allFaculty) {
    for (const c of prof.courses) {
      if (String(c.course_code).toUpperCase() === code) {
        if (!offeringMeta) {
          offeringMeta = {
            offering_id: c.offering_id,
            course_code: c.course_code,
            course_name: c.course_name,
            academic_session: c.academic_session,
            programme: c.programme,
            batch_year: c.batch_year,
            semester: c.semester,
            is_released: c.is_released,
            can_open_classroom: false,
          };
          tas = c.tas || [];
        }
        instructors.push({
          user_id: prof.user_id,
          name: prof.name,
          designation: prof.designation,
          school: prof.school,
          role_label: c.role_label,
          public_email: prof.public_email,
          public_phone: prof.public_phone,
          cabin_number: prof.cabin_number,
          office_hours: prof.office_hours,
        });
      }
    }
  }

  if (offeringMeta && user) {
    const offeringId = Number(offeringMeta.offering_id);
    if (isFullAdminUser(user)) {
      offeringMeta.can_open_classroom = true;
    } else {
      const db = await getDb();
      const isVerifiedAccount = Boolean(user.email_verified && user.id_verified);
      const accessRes = await db.query(
        `SELECT (
           EXISTS (SELECT 1 FROM course_instructors WHERE offering_id = $1 AND professor_id = $2)
           OR EXISTS (SELECT 1 FROM course_tas WHERE offering_id = $1 AND (user_id = $2 OR ($4::boolean = TRUE AND LOWER(public_email) = LOWER($3))))
           OR EXISTS (SELECT 1 FROM course_enrollments WHERE offering_id = $1 AND (student_id = $2 OR LOWER(student_email) = LOWER($3)))
         ) AS can_open`,
        [offeringId, user.id, user.email, isVerifiedAccount]
      );
      offeringMeta.can_open_classroom = Boolean(accessRes.rows[0]?.can_open);
    }
    res.setHeader('Cache-Control', 'private, no-store');
  }

  res.json({
    course_code: code,
    offering: offeringMeta,
    instructors,
    tas,
  });
});

/**
 * GET /faculty/me/profile
 * Authenticated Professor's own profile (includes private faculty fields hidden from students)
 */
router.get('/faculty/me/profile', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const isAdminActor = isFullAdminUser(req.user);
  const targetUserId =
    isAdminActor && req.query.user_id ? Number(req.query.user_id) : Number(req.user.id);

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    res.status(400).json({ detail: 'Invalid target user ID' });
    return;
  }

  const pRes = await db.query(
    `SELECT pp.*, u.name, u.email, u.department, u.photo_path
     FROM professor_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.user_id = $1 LIMIT 1`,
    [targetUserId]
  );

  if (pRes.rowCount === 0) {
    const uRes = await db.query(
      'SELECT id, name, email, photo_path FROM users WHERE id = $1 LIMIT 1',
      [targetUserId]
    );
    if (uRes.rowCount === 0) {
      res.status(404).json({ detail: 'User not found' });
      return;
    }
    const targetUser = uRes.rows[0];
    res.json({
      user_id: targetUserId,
      name: targetUser.name,
      photo_path: targetUser.photo_path || null,
      public_email: targetUser.email,
      designation: 'Assistant Professor',
      school: 'IET',
      programmes: ['B.TECH'],
      batches_taught: ['B.Tech 2024-2028'],
      public_phone: '',
      cabin_number: '',
      office_hours: '',
      specialization: '',
      bio: '',
      private_faculty_notes: '',
      tcs_ion_faculty_id: '',
    });
    return;
  }

  res.json(pRes.rows[0]);
});

/**
 * PATCH /faculty/me/photo
 * Allows a professor (or admin for any faculty user_id) to upload/update or remove their public faculty portrait.
 * Stores a validated compressed WebP data URL (or https:// URL) in users.photo_path so everyone can see it.
 */
router.patch('/faculty/me/photo', requireProfessorOrAdmin, profileWriteLimiter, async (req, res) => {
  const db = await getDb();
  const targetUserId =
    isFullAdminUser(req.user) && req.body?.user_id
      ? Number(req.body.user_id)
      : Number(req.user.id);

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    res.status(400).json({ detail: 'Invalid target user ID' });
    return;
  }

  const raw = String(req.body?.photo_data_url ?? '').trim();
  let normalizedPhoto = null;

  if (raw) {
    if (raw.startsWith('data:image/')) {
      // Strictly enforce lightweight WebP (< 150 KB binary / ~205 KB base64)
      const validWebpDataUrl = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/i.test(raw);
      if (!validWebpDataUrl) {
        res.status(400).json({
          detail: 'Photos must be converted to WebP format before upload.',
        });
        return;
      }
      const approxBytes = Math.ceil(((raw.length - 'data:image/webp;base64,'.length) * 3) / 4);
      if (approxBytes > 150 * 1024) {
        res.status(400).json({
          detail: 'WebP photo must be 150 KB or smaller.',
        });
        return;
      }
      normalizedPhoto = raw;
    } else {
      const urlCheck = validateHttpsUrl(raw, { required: true, label: 'Faculty photo URL' });
      if (!urlCheck.ok) {
        res.status(400).json({ detail: urlCheck.error });
        return;
      }
      normalizedPhoto = urlCheck.value;
    }
  }

  const upd = await db.query(
    `UPDATE users
     SET photo_path = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, photo_path`,
    [normalizedPhoto, targetUserId]
  );

  if (upd.rowCount === 0) {
    res.status(404).json({ detail: 'Faculty user not found' });
    return;
  }

  await invalidateCachePrefix('faculty:');
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: normalizedPhoto ? 'FACULTY_PHOTO_UPDATED' : 'FACULTY_PHOTO_REMOVED',
    entityType: 'USER',
    entityId: targetUserId,
    metadata: { has_photo: Boolean(normalizedPhoto) },
  });

  res.json({
    message: normalizedPhoto
      ? 'Faculty photo updated — now visible to all students and visitors!'
      : 'Faculty photo removed',
    user_id: targetUserId,
    photo_path: upd.rows[0].photo_path || null,
  });
});

/**
 * PATCH /faculty/me/card-style
 * Allows a professor (or admin for any faculty user_id) to select their public Faculty Directory card design.
 */
router.patch('/faculty/me/card-style', requireProfessorOrAdmin, profileWriteLimiter, async (req, res) => {
  const db = await getDb();
  const targetUserId =
    isFullAdminUser(req.user) && req.body?.user_id
      ? Number(req.body.user_id)
      : Number(req.user.id);
  const style = String(req.body?.card_style || '').trim().toLowerCase();

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    res.status(400).json({ detail: 'Invalid target user ID' });
    return;
  }
  if (!ALLOWED_CARD_STYLES.has(style)) {
    res.status(400).json({
      detail: `Invalid card style. Choose one of: ${Array.from(ALLOWED_CARD_STYLES).join(', ')}`,
    });
    return;
  }

  const upd = await db.query(
    `UPDATE professor_profiles
     SET card_style = $1, updated_at = NOW()
     WHERE user_id = $2
     RETURNING user_id, card_style`,
    [style, targetUserId]
  );

  if (upd.rowCount === 0) {
    res.status(404).json({ detail: 'Professor profile not found' });
    return;
  }

  await invalidateCachePrefix('faculty:');
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'FACULTY_CARD_STYLE_UPDATED',
    entityType: 'PROFESSOR_PROFILE',
    entityId: targetUserId,
    metadata: { card_style: style },
  });

  res.json({
    message: 'Card design updated!',
    user_id: targetUserId,
    card_style: upd.rows[0].card_style,
  });
});

/**
 * PUT /faculty/me/profile
 * Professor updates their public academic profile & private notes
 */
router.put('/faculty/me/profile', requireProfessorOrAdmin, profileWriteLimiter, async (req, res) => {
  const db = await getDb();
  const targetUserId =
    isFullAdminUser(req.user) && req.body.user_id
      ? Number(req.body.user_id)
      : Number(req.user.id);

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    res.status(400).json({ detail: 'Invalid target user ID' });
    return;
  }

  const {
    name,
    designation,
    school,
    programmes,
    batches_taught,
    public_email,
    public_phone,
    cabin_number,
    office_hours,
    specialization,
    bio,
    google_scholar_url,
    private_faculty_notes,
    tcs_ion_faculty_id,
  } = req.body;

  const scholarCheck = validateHttpsUrl(google_scholar_url, {
    required: false,
    label: 'Google Scholar URL',
  });
  if (!scholarCheck.ok) {
    res.status(400).json({ detail: scholarCheck.error });
    return;
  }

  const progArr = Array.isArray(programmes)
    ? programmes
    : String(programmes || 'B.TECH')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

  const batchArr = Array.isArray(batches_taught)
    ? batches_taught
    : String(batches_taught || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const targetUserRes = await db.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [
    targetUserId,
  ]);
  if (targetUserRes.rowCount === 0) {
    res.status(404).json({ detail: 'Target faculty user not found' });
    return;
  }
  const fallbackEmail = targetUserRes.rows[0].email;

  const profileRow = await withTransaction(db, async (tx) => {
    if (name) {
      await tx.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [
        String(name).trim(),
        targetUserId,
      ]);
    }

    const upRes = await tx.query(
      `INSERT INTO professor_profiles (
         user_id, designation, school, programmes, batches_taught,
         public_email, public_phone, cabin_number, office_hours,
         specialization, bio, google_scholar_url, private_faculty_notes, tcs_ion_faculty_id, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         designation = EXCLUDED.designation,
         school = EXCLUDED.school,
         programmes = EXCLUDED.programmes,
         batches_taught = EXCLUDED.batches_taught,
         public_email = EXCLUDED.public_email,
         public_phone = EXCLUDED.public_phone,
         cabin_number = EXCLUDED.cabin_number,
         office_hours = EXCLUDED.office_hours,
         specialization = EXCLUDED.specialization,
         bio = EXCLUDED.bio,
         google_scholar_url = EXCLUDED.google_scholar_url,
         private_faculty_notes = EXCLUDED.private_faculty_notes,
         tcs_ion_faculty_id = EXCLUDED.tcs_ion_faculty_id,
         updated_at = NOW()
       RETURNING *`,
      [
        targetUserId,
        designation || 'Assistant Professor',
        school || 'IET',
        JSON.stringify(progArr),
        JSON.stringify(batchArr),
        public_email ? String(public_email).trim() : fallbackEmail,
        public_phone || null,
        cabin_number || null,
        office_hours || null,
        specialization || null,
        bio || null,
        scholarCheck.value,
        private_faculty_notes || null,
        tcs_ion_faculty_id || null,
      ]
    );
    return upRes.rows[0];
  });

  invalidateCachePrefix('faculty:');
  invalidateCachePrefix('auth:');
  res.json({
    message: 'Professor profile updated successfully',
    profile: profileRow,
  });
});

/**
 * POST /admin/faculty/create
 * Admin creates or promotes a Professor account with initial batch & school metadata
 */
router.post('/admin/faculty/create', requireFullAdmin, async (req, res) => {
  const db = await getDb();
  const {
    email,
    name,
    password,
    designation,
    school,
    programmes,
    batches_taught,
    public_phone,
    cabin_number,
    office_hours,
    specialization,
    bio,
    google_scholar_url,
  } = req.body;

  if (!email || !name) {
    res.status(400).json({ detail: 'Professor email and name are required' });
    return;
  }

  const scholarCheck = validateHttpsUrl(google_scholar_url, {
    required: false,
    label: 'Google Scholar URL',
  });
  if (!scholarCheck.ok) {
    res.status(400).json({ detail: scholarCheck.error });
    return;
  }

  const rawPass = String(password || '').trim();
  if (IS_PRODUCTION && rawPass.length < 6) {
    res.status(400).json({ detail: 'A password of at least 6 characters is required in production' });
    return;
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const hash = await hashPasswordNonBlocking(rawPass || 'jklu123', 10);

  const progArr = Array.isArray(programmes)
    ? programmes
    : String(programmes || 'B.TECH')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
  const batchArr = Array.isArray(batches_taught)
    ? batches_taught
    : String(batches_taught || 'B.Tech 2024-2028')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const createdUser = await withTransaction(db, async (tx) => {
    const uRes = await tx.query(
      `INSERT INTO users (email, name, password_hash, is_admin, admin_role, department, year, batch_year, id_verified, email_verified)
       VALUES ($1, $2, $3, FALSE, 'professor', $4, 'FACULTY', 'FACULTY', TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         admin_role = 'professor',
         id_verified = TRUE,
         token_version = users.token_version + 1
       RETURNING id, email, name, admin_role`,
      [cleanEmail, String(name).trim(), hash, progArr[0] || 'B.TECH']
    );
    const userId = Number(uRes.rows[0].id);

    await tx.query(
      `INSERT INTO professor_profiles (
         user_id, designation, school, programmes, batches_taught,
         public_email, public_phone, cabin_number, office_hours, specialization, bio, google_scholar_url
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         designation = EXCLUDED.designation,
         school = EXCLUDED.school,
         programmes = EXCLUDED.programmes,
         batches_taught = EXCLUDED.batches_taught,
         public_phone = EXCLUDED.public_phone,
         cabin_number = EXCLUDED.cabin_number,
         office_hours = EXCLUDED.office_hours,
         specialization = EXCLUDED.specialization,
         bio = EXCLUDED.bio,
         google_scholar_url = EXCLUDED.google_scholar_url`,
      [
        userId,
        designation || 'Assistant Professor',
        school || 'IET',
        JSON.stringify(progArr),
        JSON.stringify(batchArr),
        cleanEmail,
        public_phone || null,
        cabin_number || null,
        office_hours || null,
        specialization || null,
        bio || null,
        scholarCheck.value,
      ]
    );
    return uRes.rows[0];
  });

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'CREATE_FACULTY',
    entityType: 'USER',
    entityId: createdUser.id,
    metadata: { email: cleanEmail },
  });

  invalidateCachePrefix('faculty:');
  invalidateCachePrefix('metrics:');
  invalidateCachePrefix('admin:');
  res.status(201).json({
    message: `Professor account ready for ${name} (${cleanEmail})`,
    user: createdUser,
  });
});

export default router;
