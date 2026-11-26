import path from 'node:path';
import { getDb, withTransaction } from '../config/db.js';
import { parsePositiveInt, PUBLIC_BASE_URL } from '../config/env.js';
import { requireAuth, requireProfessorOrAdmin, isFullAdminUser } from '../middleware/auth.js';
import { createMemoryUpload } from '../middleware/uploads.js';
import {
  getCourseStaffPermissions,
  getStudentEnrollment,
  mergeOfferingSections,
} from '../utils/classroomAuth.js';
import {
  normalizeSectionName,
  parseSectionsList,
  resolvePostTargetsForStaff,
  canStaffAccessSection,
  canStaffMutateItem,
  canStaffGradeTarget,
  canStudentViewTargets,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { generateUniqueJoinCode } from '../utils/joinCode.js';
import { signCalendarToken, buildGoogleCalendarUrl } from '../utils/calendarHelper.js';
import {
  safeContentDispositionFilename,
  validateHttpsUrl,
  writeAuditLog,
} from '../utils/security.js';
import {
  notifyCourseAudience,
  notifyUser,
  renderNotificationEmailHtml,
  resolveFrontendAppUrl,
} from '../utils/emailService.js';
import { getOfferingCourseMeta } from '../utils/classroomHelpers.js';

const router = createAsyncRouter();

const ALLOWED_MODULE_EXT = new Set([
  '.pdf', '.pptx', '.ppt', '.docx', '.doc', '.zip', '.png', '.jpg', '.jpeg', '.txt', '.py', '.ipynb', '.csv',
]);

const moduleItemUpload = createMemoryUpload({
  maxFileSizeMb: 25,
  allowedExtensions: ALLOWED_MODULE_EXT,
  invalidTypeMessage: 'Unsupported material file type.',
});

const odProofUpload = createMemoryUpload({
  maxFileSizeMb: 10,
  allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg'],
  invalidTypeMessage: 'OD proof must be PDF, PNG, or JPG.',
});

async function recomputeOfferingAttendance(db, offeringId) {
  const [sessRes, recRes, enrRes] = await Promise.all([
    db.query('SELECT id, section FROM attendance_sessions WHERE offering_id = $1', [offeringId]),
    db.query(
      `SELECT ar.session_id, ar.student_id, ar.status
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.offering_id = $1`,
      [offeringId]
    ),
    db.query('SELECT id, student_id, section FROM course_enrollments WHERE offering_id = $1', [
      offeringId,
    ]),
  ]);

  const sessCountBySec = new Map();
  const sessSecById = new Map();
  for (const s of sessRes.rows) {
    const secKey = normalizeSectionName(s.section || 'Sec A').toLowerCase();
    sessSecById.set(Number(s.id), secKey);
    sessCountBySec.set(secKey, (sessCountBySec.get(secKey) || 0) + 1);
  }

  const presentByStudent = new Map();
  for (const r of recRes.rows) {
    if (r.status !== 'PRESENT' && r.status !== 'OD') continue;
    const sid = Number(r.student_id);
    const secKey = sessSecById.get(Number(r.session_id)) || 'sec a';
    const key = `${sid}:${secKey}`;
    presentByStudent.set(key, (presentByStudent.get(key) || 0) + 1);
  }

  for (const e of enrRes.rows) {
    if (!e.student_id) continue;
    const secKey = normalizeSectionName(e.section || 'Sec A').toLowerCase();
    const total = sessCountBySec.get(secKey) || 0;
    if (total <= 0) continue;
    const present = presentByStudent.get(`${Number(e.student_id)}:${secKey}`) || 0;
    const pct = Number(((present / total) * 100).toFixed(1));
    await db.query('UPDATE course_enrollments SET attendance_pct = $1 WHERE id = $2', [pct, e.id]);
  }
}

/* ============================================================================
 * 1. COURSE MODULES, MATERIALS & AUTO-LINKED PAST PAPERS
 * ========================================================================== */
router.get('/classroom/offerings/:id/modules', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }

  const [perms, enrollment, modRes] = await Promise.all([
    getCourseStaffPermissions(db, offeringId, req.user),
    getStudentEnrollment(db, offeringId, req.user),
    db.query(
      'SELECT * FROM course_modules WHERE offering_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [offeringId]
    ),
  ]);

  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Access denied.' });
    return;
  }

  const previewSec = req.query.section ? String(req.query.section).trim() : null;
  const studentSec = isStaff ? previewSec || 'Sec A' : enrollment?.section || 'Sec A';
  const simulateStudent = Boolean(req.query.preview === 'student' && isStaff);

  const [itemsRes, progRes] = await Promise.all([
    db.query(
      `SELECT id, module_id, offering_id, title, item_type, resource_url, file_name,
              file_mime, file_size, sort_order, created_by, created_at
       FROM course_module_items
       WHERE offering_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [offeringId]
    ),
    db.query(
      `SELECT p.* FROM module_item_progress p
       JOIN course_module_items cmi ON cmi.id = p.item_id
       WHERE cmi.offering_id = $1 AND p.user_id = $2`,
      [offeringId, req.user.id]
    ),
  ]);

  const progByItem = new Map(progRes.rows.map((p) => [Number(p.item_id), p]));
  const itemsByMod = new Map();
  for (const it of itemsRes.rows) {
    const mid = Number(it.module_id);
    if (!itemsByMod.has(mid)) itemsByMod.set(mid, []);
    const prog = progByItem.get(Number(it.id));
    itemsByMod.get(mid).push({
      ...it,
      has_file: Boolean(it.file_size),
      bookmarked: Boolean(prog?.bookmarked),
      completed: Boolean(prog?.completed),
    });
  }

  const nowMs = Date.now();
  const modules = modRes.rows
    .map((m) => {
      const targetSections = parseSectionsList(m.target_sections, ['ALL']);
      const locked = Boolean(m.unlock_at && new Date(m.unlock_at).getTime() > nowMs);
      if ((!isStaff || simulateStudent) && (!canStudentViewTargets(studentSec, targetSections) || locked)) {
        return null;
      }
      return {
        ...m,
        target_sections: targetSections,
        is_locked: locked,
        can_edit: isStaff && !simulateStudent
          ? canStaffMutateItem(perms, targetSections, m.created_by, req.user.id)
          : false,
        items: itemsByMod.get(Number(m.id)) || [],
      };
    })
    .filter(Boolean);

  res.json({ modules });
});

router.post('/classroom/offerings/:id/modules', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors or authorized TAs can create course modules.' });
    return;
  }
  const title = String(req.body?.title || '').trim();
  if (!title) {
    res.status(400).json({ detail: 'Module title is required.' });
    return;
  }
  const targetRes = resolvePostTargetsForStaff(perms, req.body?.target_sections);
  if (!targetRes.ok) {
    res.status(403).json({ detail: targetRes.error });
    return;
  }
  await mergeOfferingSections(db, offeringId, targetRes.sections);

  let unlockIso = null;
  if (req.body?.unlock_at) {
    const d = new Date(req.body.unlock_at);
    if (!Number.isNaN(d.getTime())) unlockIso = d.toISOString();
  }

  const ins = await db.query(
    `INSERT INTO course_modules (offering_id, title, description, sort_order, target_sections, unlock_at, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *`,
    [
      offeringId,
      title.slice(0, 160),
      req.body?.description ? String(req.body.description).trim() : null,
      Number(req.body?.sort_order || 0),
      JSON.stringify(targetRes.sections),
      unlockIso,
      req.user.id,
    ]
  );
  res.status(201).json({ message: 'Module created.', module: { ...ins.rows[0], items: [] } });
});

router.patch('/classroom/modules/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const moduleId = parsePositiveInt(req.params.id);
  const modRes = await db.query('SELECT * FROM course_modules WHERE id = $1 LIMIT 1', [moduleId]);
  if (modRes.rowCount === 0) {
    res.status(404).json({ detail: 'Module not found' });
    return;
  }
  const mod = modRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(mod.offering_id), req.user);
  if (!canStaffMutateItem(perms, mod.target_sections, mod.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot edit this module.' });
    return;
  }
  const nextTitle = req.body?.title ? String(req.body.title).trim() : mod.title;
  const nextDesc = req.body?.description !== undefined ? String(req.body.description || '').trim() : mod.description;
  const nextUnlock = req.body?.unlock_at === '' ? null : req.body?.unlock_at || mod.unlock_at;
  const upd = await db.query(
    'UPDATE course_modules SET title = $1, description = $2, unlock_at = $3 WHERE id = $4 RETURNING *',
    [nextTitle, nextDesc, nextUnlock, moduleId]
  );
  res.json({ message: 'Module updated.', module: upd.rows[0] });
});

router.delete('/classroom/modules/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const moduleId = parsePositiveInt(req.params.id);
  const modRes = await db.query('SELECT * FROM course_modules WHERE id = $1 LIMIT 1', [moduleId]);
  if (modRes.rowCount === 0) {
    res.status(404).json({ detail: 'Module not found' });
    return;
  }
  const mod = modRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(mod.offering_id), req.user);
  if (!canStaffMutateItem(perms, mod.target_sections, mod.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot delete this module.' });
    return;
  }
  await db.query('DELETE FROM course_modules WHERE id = $1', [moduleId]);
  res.json({ message: 'Module deleted.' });
});

router.post(
  '/classroom/modules/:id/items',
  requireAuth,
  moduleItemUpload.single('file'),
  async (req, res) => {
    const db = await getDb();
    const moduleId = parsePositiveInt(req.params.id);
    const modRes = await db.query('SELECT * FROM course_modules WHERE id = $1 LIMIT 1', [moduleId]);
    if (modRes.rowCount === 0) {
      res.status(404).json({ detail: 'Module not found' });
      return;
    }
    const mod = modRes.rows[0];
    const perms = await getCourseStaffPermissions(db, Number(mod.offering_id), req.user);
    if (!canStaffMutateItem(perms, mod.target_sections, mod.created_by, req.user.id)) {
      res.status(403).json({ detail: 'Read-only: cannot add resources to this module.' });
      return;
    }

    const title = String(req.body?.title || req.file?.originalname || '').trim();
    if (!title) {
      res.status(400).json({ detail: 'Resource title is required.' });
      return;
    }

    if (req.file) {
      const cleanName = path.basename(req.file.originalname || 'resource.bin').slice(0, 180);
      const ins = await db.query(
        `INSERT INTO course_module_items (
           module_id, offering_id, title, item_type, file_name, file_mime, file_data, file_size, created_by
         ) VALUES ($1, $2, $3, 'FILE', $4, $5, $6, $7, $8)
         RETURNING id, module_id, offering_id, title, item_type, file_name, file_mime, file_size, created_at`,
        [
          moduleId,
          mod.offering_id,
          title.slice(0, 180),
          cleanName,
          req.file.mimetype || 'application/octet-stream',
          req.file.buffer,
          req.file.size,
          req.user.id,
        ]
      );
      res.status(201).json({ message: 'File uploaded to module.', item: { ...ins.rows[0], has_file: true } });
      return;
    }

    const urlCheck = validateHttpsUrl(req.body?.resource_url, {
      required: true,
      label: 'Resource URL',
    });
    if (!urlCheck.ok) {
      res.status(400).json({ detail: urlCheck.error });
      return;
    }
    const ins = await db.query(
      `INSERT INTO course_module_items (
         module_id, offering_id, title, item_type, resource_url, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        moduleId,
        mod.offering_id,
        title.slice(0, 180),
        String(req.body?.item_type || 'LINK').toUpperCase(),
        urlCheck.value,
        req.user.id,
      ]
    );
    res.status(201).json({ message: 'Resource link added to module.', item: ins.rows[0] });
  }
);

router.get('/classroom/module-items/:id/file', requireAuth, async (req, res) => {
  const db = await getDb();
  const itemId = parsePositiveInt(req.params.id);
  const itemRes = await db.query('SELECT * FROM course_module_items WHERE id = $1 LIMIT 1', [itemId]);
  if (itemRes.rowCount === 0) {
    res.status(404).json({ detail: 'Resource not found' });
    return;
  }
  const it = itemRes.rows[0];
  const [perms, enrolled] = await Promise.all([
    getCourseStaffPermissions(db, Number(it.offering_id), req.user),
    getStudentEnrollment(db, Number(it.offering_id), req.user),
  ]);
  if (!perms.is_admin && !perms.is_instructor && !perms.is_ta && !enrolled) {
    res.status(403).json({ detail: 'Access denied.' });
    return;
  }
  if (!it.file_data) {
    res.status(404).json({ detail: 'No binary file attached.' });
    return;
  }
  const mime = it.file_mime || 'application/octet-stream';
  const disp = mime === 'application/pdf' || mime.startsWith('image/') ? 'inline' : 'attachment';
  res.setHeader('Content-Type', mime);
  res.setHeader(
    'Content-Disposition',
    `${disp}; filename="${safeContentDispositionFilename(it.file_name || 'resource.bin')}"`
  );
  res.send(Buffer.from(it.file_data));
});

router.delete('/classroom/module-items/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const itemId = parsePositiveInt(req.params.id);
  const itemRes = await db.query(
    `SELECT cmi.*, cm.target_sections, cm.created_by AS mod_creator
     FROM course_module_items cmi
     JOIN course_modules cm ON cm.id = cmi.module_id
     WHERE cmi.id = $1 LIMIT 1`,
    [itemId]
  );
  if (itemRes.rowCount === 0) {
    res.status(404).json({ detail: 'Item not found' });
    return;
  }
  const it = itemRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(it.offering_id), req.user);
  if (!canStaffMutateItem(perms, it.target_sections, it.mod_creator, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot delete module item.' });
    return;
  }
  await db.query('DELETE FROM course_module_items WHERE id = $1', [itemId]);
  res.json({ message: 'Material removed.' });
});

router.post('/classroom/module-items/:id/progress', requireAuth, async (req, res) => {
  const db = await getDb();
  const itemId = parsePositiveInt(req.params.id);
  if (!itemId) {
    res.status(400).json({ detail: 'Invalid item ID' });
    return;
  }
  const existing = await db.query(
    'SELECT bookmarked, completed FROM module_item_progress WHERE item_id = $1 AND user_id = $2 LIMIT 1',
    [itemId, req.user.id]
  );
  const prev = existing.rows[0] || { bookmarked: false, completed: false };
  const bookmarked =
    req.body?.bookmarked !== undefined ? Boolean(req.body.bookmarked) : Boolean(prev.bookmarked);
  const completed =
    req.body?.completed !== undefined ? Boolean(req.body.completed) : Boolean(prev.completed);

  await db.query(
    `INSERT INTO module_item_progress (item_id, user_id, bookmarked, completed, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (item_id, user_id) DO UPDATE SET
       bookmarked = EXCLUDED.bookmarked,
       completed = EXCLUDED.completed,
       updated_at = NOW()`,
    [itemId, req.user.id, bookmarked, completed]
  );
  res.json({ bookmarked, completed });
});

router.get('/classroom/offerings/:id/past-papers', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const meta = await getOfferingCourseMeta(db, offeringId);
  if (!meta) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }
  const courseCode = String(meta.course_code || '').trim();
  const papersRes = await db.query(
    `SELECT p.id, p.title, p.paper_type, p.exam_session, p.year, p.semester,
            p.file_name, p.download_count, p.solution_drive_url, c.code AS course_code
     FROM papers p
     JOIN courses c ON c.id = p.course_id
     WHERE UPPER(c.code) = UPPER($1) AND UPPER(COALESCE(p.status, 'APPROVED')) = 'APPROVED'
     ORDER BY p.year DESC NULLS LAST, p.uploaded_at DESC`,
    [courseCode]
  );
  res.json({ course_code: courseCode, papers: papersRes.rows });
});

/* ============================================================================
 * 2. DAILY ATTENDANCE, 60-SEC PIN/QR CHECK-IN, OD LEAVE & AT-RISK ALERTS
 * ========================================================================== */
router.get('/classroom/offerings/:id/attendance/sessions', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const sectionFilter = req.query.section && req.query.section !== 'ALL' ? String(req.query.section).trim() : null;
  const [sessRes, recRes] = await Promise.all([
    db.query(
      `SELECT * FROM attendance_sessions
       WHERE offering_id = $1 ${sectionFilter ? 'AND LOWER(section) = LOWER($2)' : ''}
       ORDER BY session_date DESC, id DESC`,
      sectionFilter ? [offeringId, sectionFilter] : [offeringId]
    ),
    db.query(
      `SELECT ar.* FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.offering_id = $1`,
      [offeringId]
    ),
  ]);

  const recBySess = new Map();
  for (const r of recRes.rows) {
    const sid = Number(r.session_id);
    if (!recBySess.has(sid)) recBySess.set(sid, []);
    recBySess.get(sid).push(r);
  }

  const sessions = sessRes.rows.map((s) => {
    const recs = recBySess.get(Number(s.id)) || [];
    return {
      ...s,
      can_edit: canStaffAccessSection(perms, s.section || 'Sec A'),
      present_count: recs.filter((r) => r.status === 'PRESENT').length,
      absent_count: recs.filter((r) => r.status === 'ABSENT').length,
      od_count: recs.filter((r) => r.status === 'OD').length,
      records: recs,
    };
  });

  res.json({ sessions });
});

router.post('/classroom/offerings/:id/attendance/sessions', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const section = normalizeSectionName(req.body?.section || 'Sec A');
  if (section === 'ALL') {
    res.status(400).json({ detail: 'Select a concrete section (e.g. Sec A) for an attendance session.' });
    return;
  }
  if (!canStaffAccessSection(perms, section)) {
    res.status(403).json({ detail: `You can only create attendance sessions for your assigned sections.` });
    return;
  }
  const sessionDate = req.body?.session_date || new Date().toISOString().slice(0, 10);
  const topic = req.body?.topic ? String(req.body.topic).trim() : null;
  const markAllPresent = req.body?.mark_all_present !== false;

  const ins = await db.query(
    `INSERT INTO attendance_sessions (offering_id, section, session_date, topic, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [offeringId, section, sessionDate, topic, req.user.id]
  );
  const session = ins.rows[0];

  if (markAllPresent) {
    const enrRes = await db.query(
      `SELECT id, student_id FROM course_enrollments
       WHERE offering_id = $1 AND LOWER(section) = LOWER($2) AND student_id IS NOT NULL`,
      [offeringId, section]
    );
    for (const e of enrRes.rows) {
      await db.query(
        `INSERT INTO attendance_records (session_id, student_id, enrollment_id, status, marked_via)
         VALUES ($1, $2, $3, 'PRESENT', 'FACULTY')
         ON CONFLICT (session_id, student_id) DO NOTHING`,
        [session.id, e.student_id, e.id]
      );
    }
    await recomputeOfferingAttendance(db, offeringId);
  }

  res.status(201).json({ message: `Attendance session created for ${section}.`, session });
});

router.put('/classroom/attendance/sessions/:id/records', requireAuth, async (req, res) => {
  const db = await getDb();
  const sessionId = parsePositiveInt(req.params.id);
  const sessRes = await db.query('SELECT * FROM attendance_sessions WHERE id = $1 LIMIT 1', [sessionId]);
  if (sessRes.rowCount === 0) {
    res.status(404).json({ detail: 'Attendance session not found' });
    return;
  }
  const sess = sessRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(sess.offering_id), req.user);
  if (!perms.can_grade || !canStaffAccessSection(perms, sess.section || 'Sec A')) {
    res.status(403).json({ detail: 'Read-only: cannot mark attendance for this section.' });
    return;
  }
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  for (const r of records) {
    const sid = parsePositiveInt(r.student_id);
    const st = String(r.status || 'PRESENT').toUpperCase();
    if (!sid || !['PRESENT', 'ABSENT', 'OD'].includes(st)) continue;
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, enrollment_id, status, marked_via, marked_at)
       VALUES ($1, $2, $3, $4, 'FACULTY', NOW())
       ON CONFLICT (session_id, student_id) DO UPDATE SET
         status = EXCLUDED.status,
         marked_via = 'FACULTY',
         marked_at = NOW()`,
      [sessionId, sid, r.enrollment_id || null, st]
    );
  }
  await recomputeOfferingAttendance(db, Number(sess.offering_id));
  res.json({ message: 'Attendance records saved & percentages updated.' });
});

router.post('/classroom/offerings/:id/attendance/checkin-pin', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const section = normalizeSectionName(req.body?.section || 'Sec A');
  if (!canStaffAccessSection(perms, section)) {
    res.status(403).json({ detail: 'Section outside your assigned teaching scope.' });
    return;
  }
  const durationSec = Math.min(300, Math.max(30, Number(req.body?.duration_seconds || 60)));
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + durationSec * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  let sessionId = parsePositiveInt(req.body?.session_id);
  if (!sessionId) {
    const existing = await db.query(
      'SELECT id FROM attendance_sessions WHERE offering_id = $1 AND LOWER(section) = LOWER($2) AND session_date = $3 ORDER BY id DESC LIMIT 1',
      [offeringId, section, today]
    );
    if (existing.rowCount > 0) {
      sessionId = Number(existing.rows[0].id);
    } else {
      const created = await db.query(
        'INSERT INTO attendance_sessions (offering_id, section, session_date, topic, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [offeringId, section, today, 'Live Class Check-in', req.user.id]
      );
      sessionId = Number(created.rows[0].id);
    }
  }

  await db.query('UPDATE attendance_sessions SET checkin_pin = $1, pin_expires_at = $2 WHERE id = $3', [
    pin,
    expiresAt,
    sessionId,
  ]);

  res.json({
    session_id: sessionId,
    section,
    pin,
    expires_at: expiresAt,
    qr_payload: JSON.stringify({ offering_id: offeringId, session_id: sessionId, pin }),
  });
});

router.post('/classroom/attendance/checkin', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.body?.offering_id);
  const pin = String(req.body?.pin || '').trim();
  if (!offeringId || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ detail: 'Enter a valid 6-digit check-in PIN.' });
    return;
  }
  const enrollment = await getStudentEnrollment(db, offeringId, req.user);
  if (!enrollment) {
    res.status(403).json({ detail: 'Only enrolled students can check in.' });
    return;
  }
  const mySec = enrollment.section || 'Sec A';
  const sessRes = await db.query(
    `SELECT * FROM attendance_sessions
     WHERE offering_id = $1 AND LOWER(section) = LOWER($2) AND checkin_pin = $3
     ORDER BY id DESC LIMIT 1`,
    [offeringId, mySec, pin]
  );
  if (sessRes.rowCount === 0) {
    res.status(400).json({ detail: `Invalid PIN for ${mySec}.` });
    return;
  }
  const sess = sessRes.rows[0];
  if (!sess.pin_expires_at || new Date() > new Date(sess.pin_expires_at)) {
    res.status(400).json({ detail: 'This check-in PIN has expired.' });
    return;
  }

  await db.query(
    `INSERT INTO attendance_records (session_id, student_id, enrollment_id, status, marked_via, marked_at)
     VALUES ($1, $2, $3, 'PRESENT', 'PIN_QR', NOW())
     ON CONFLICT (session_id, student_id) DO UPDATE SET
       status = 'PRESENT',
       marked_via = 'PIN_QR',
       marked_at = NOW()`,
    [sess.id, req.user.id, enrollment.id]
  );
  await recomputeOfferingAttendance(db, offeringId);
  res.json({ message: `Checked in PRESENT for ${mySec}!` });
});

router.get('/classroom/offerings/:id/my-attendance', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const enrollment = await getStudentEnrollment(db, offeringId, req.user);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!enrollment && !isStaff) {
    res.status(403).json({ detail: 'Not enrolled in this classroom.' });
    return;
  }
  const section = isStaff ? String(req.query.section || 'Sec A') : enrollment?.section || 'Sec A';
  const [sessRes, recRes, odRes] = await Promise.all([
    db.query(
      'SELECT id, section, session_date, topic FROM attendance_sessions WHERE offering_id = $1 AND LOWER(section) = LOWER($2) ORDER BY session_date DESC, id DESC',
      [offeringId, section]
    ),
    db.query(
      `SELECT ar.session_id, ar.status, ar.marked_via
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.offering_id = $1 AND ar.student_id = $2`,
      [offeringId, req.user.id]
    ),
    db.query(
      'SELECT * FROM od_leave_requests WHERE offering_id = $1 AND student_id = $2 ORDER BY created_at DESC',
      [offeringId, req.user.id]
    ),
  ]);

  const recMap = new Map(recRes.rows.map((r) => [Number(r.session_id), r]));
  const logs = sessRes.rows.map((s) => ({
    ...s,
    status: recMap.get(Number(s.id))?.status || 'UNMARKED',
    marked_via: recMap.get(Number(s.id))?.marked_via || null,
  }));
  const presentCount = logs.filter((l) => l.status === 'PRESENT' || l.status === 'OD').length;
  const totalCount = logs.length;
  const pct =
    totalCount > 0
      ? Number(((presentCount / totalCount) * 100).toFixed(1))
      : enrollment?.attendance_pct !== null && enrollment?.attendance_pct !== undefined
        ? Number(enrollment.attendance_pct)
        : null;

  res.json({
    section,
    attendance_pct: pct,
    present_count: presentCount,
    total_sessions: totalCount,
    sessions: logs,
    od_requests: odRes.rows.map((r) => ({ ...r, proof_file_data: undefined })),
  });
});

router.post(
  '/classroom/offerings/:id/od-requests',
  requireAuth,
  odProofUpload.single('proof'),
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const enrollment = await getStudentEnrollment(db, offeringId, req.user);
    if (!enrollment) {
      res.status(403).json({ detail: 'Only enrolled students can submit OD / Medical leave requests.' });
      return;
    }
    const { leave_type, from_date, to_date, reason, proof_url } = req.body;
    if (!from_date || !to_date || !reason || String(reason).trim().length < 5) {
      res.status(400).json({ detail: 'Dates and a clear reason (min 5 chars) are required.' });
      return;
    }

    const ins = await db.query(
      `INSERT INTO od_leave_requests (
         offering_id, student_id, student_name, student_email, section,
         leave_type, from_date, to_date, reason, proof_url,
         proof_file_name, proof_file_mime, proof_file_data
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, offering_id, leave_type, from_date, to_date, status, created_at`,
      [
        offeringId,
        req.user.id,
        req.user.name,
        req.user.email,
        enrollment.section || 'Sec A',
        String(leave_type || 'OD').toUpperCase() === 'MEDICAL' ? 'MEDICAL' : 'OD',
        from_date,
        to_date,
        String(reason).trim().slice(0, 1500),
        proof_url || null,
        req.file ? path.basename(req.file.originalname) : null,
        req.file ? req.file.mimetype : null,
        req.file ? req.file.buffer : null,
      ]
    );
    res.status(201).json({ message: 'OD / Medical leave request submitted.', request: ins.rows[0] });
  }
);

router.get('/classroom/offerings/:id/od-requests', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const rowsRes = await db.query(
    `SELECT id, offering_id, student_id, student_name, student_email, section, leave_type,
            from_date, to_date, reason, proof_url, proof_file_name, status, reviewer_note, created_at, reviewed_at
     FROM od_leave_requests
     WHERE offering_id = $1
     ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC`,
    [offeringId]
  );
  res.json({
    requests: rowsRes.rows.map((r) => ({
      ...r,
      has_proof_file: Boolean(r.proof_file_name),
      can_review: canStaffAccessSection(perms, r.section || 'Sec A'),
    })),
  });
});

router.get('/classroom/od-requests/:id/proof', requireAuth, async (req, res) => {
  const db = await getDb();
  const reqId = parsePositiveInt(req.params.id);
  const rRes = await db.query('SELECT * FROM od_leave_requests WHERE id = $1 LIMIT 1', [reqId]);
  if (rRes.rowCount === 0) {
    res.status(404).json({ detail: 'OD request not found' });
    return;
  }
  const r = rRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(r.offering_id), req.user);
  if (Number(r.student_id) !== Number(req.user.id) && !perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Access denied.' });
    return;
  }
  if (!r.proof_file_data) {
    res.status(404).json({ detail: 'No proof file uploaded.' });
    return;
  }
  res.setHeader('Content-Type', r.proof_file_mime || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${safeContentDispositionFilename(r.proof_file_name || 'od_proof.pdf')}"`
  );
  res.send(Buffer.from(r.proof_file_data));
});

router.patch('/classroom/od-requests/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const reqId = parsePositiveInt(req.params.id);
  const rRes = await db.query(
    `SELECT odr.*, COALESCE(co.course_code, c.code) AS course_code
     FROM od_leave_requests odr
     JOIN course_offerings co ON co.id = odr.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE odr.id = $1 LIMIT 1`,
    [reqId]
  );
  if (rRes.rowCount === 0) {
    res.status(404).json({ detail: 'OD request not found' });
    return;
  }
  const odr = rRes.rows[0];
  const offeringId = Number(odr.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade || !canStaffAccessSection(perms, odr.section || 'Sec A')) {
    res.status(403).json({ detail: 'Not authorized to review OD request for this section.' });
    return;
  }
  const status = String(req.body?.status || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ detail: 'status must be APPROVED or REJECTED' });
    return;
  }
  await db.query(
    `UPDATE od_leave_requests SET status = $1, reviewer_id = $2, reviewer_note = $3, reviewed_at = NOW() WHERE id = $4`,
    [status, req.user.id, req.body?.reviewer_note || null, reqId]
  );

  if (status === 'APPROVED') {
    const sessRes = await db.query(
      `SELECT id FROM attendance_sessions
       WHERE offering_id = $1 AND LOWER(section) = LOWER($2)
         AND session_date >= $3 AND session_date <= $4`,
      [offeringId, odr.section || 'Sec A', odr.from_date, odr.to_date]
    );
    for (const s of sessRes.rows) {
      await db.query(
        `INSERT INTO attendance_records (session_id, student_id, status, marked_via, marked_at)
         VALUES ($1, $2, 'OD', 'OD_APPROVED', NOW())
         ON CONFLICT (session_id, student_id) DO UPDATE SET status = 'OD', marked_via = 'OD_APPROVED', marked_at = NOW()`,
        [s.id, odr.student_id]
      );
    }
    await recomputeOfferingAttendance(db, offeringId);
  }

  void notifyUser({
    db,
    userId: odr.student_id,
    email: odr.student_email,
    offeringId,
    type: 'OD_REVIEWED',
    title: `${odr.course_code}: ${odr.leave_type} Request ${status}`,
    body: `Your ${odr.leave_type} request (${odr.from_date} to ${odr.to_date}) was ${status.toLowerCase()} by ${req.user.name}.`,
    linkPath: `/classroom?offeringId=${offeringId}`,
    emailSubject: `[${odr.course_code}] ${odr.leave_type} Leave ${status}`,
  });

  res.json({ message: `Leave request ${status.toLowerCase()}.` });
});

router.get('/classroom/offerings/:id/at-risk', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const sectionFilter = req.query.section && req.query.section !== 'ALL' ? String(req.query.section).trim() : null;
  const [enrRes, pastDueRes, subRes] = await Promise.all([
    db.query('SELECT * FROM course_enrollments WHERE offering_id = $1 ORDER BY student_name ASC', [offeringId]),
    db.query(
      'SELECT id, target_sections FROM classroom_assignments WHERE offering_id = $1 AND due_at IS NOT NULL AND due_at < NOW()',
      [offeringId]
    ),
    db.query(
      `SELECT s.assignment_id, s.student_id
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       WHERE ca.offering_id = $1`,
      [offeringId]
    ),
  ]);

  const subsSet = new Set(subRes.rows.map((s) => `${s.assignment_id}:${s.student_id}`));
  const atRisk = [];
  for (const e of enrRes.rows) {
    const sec = e.section || 'Sec A';
    if (sectionFilter && sec.toLowerCase() !== sectionFilter.toLowerCase()) continue;
    if (!canStaffAccessSection(perms, sec)) continue;

    let missed = 0;
    if (e.student_id) {
      for (const a of pastDueRes.rows) {
        if (!canStudentViewTargets(sec, a.target_sections)) continue;
        if (!subsSet.has(`${a.id}:${e.student_id}`)) missed += 1;
      }
    }
    const lowAtt = e.attendance_pct !== null && e.attendance_pct !== undefined && Number(e.attendance_pct) < 75;
    if (lowAtt || missed >= 2) {
      atRisk.push({
        enrollment_id: e.id,
        student_id: e.student_id,
        student_name: e.student_name,
        roll_no: e.roll_no,
        student_email: e.student_email,
        section: sec,
        attendance_pct: e.attendance_pct !== null ? Number(e.attendance_pct) : null,
        missed_assignments: missed,
      });
    }
  }

  res.json({ students: atRisk });
});

/* ============================================================================
 * 3. SECTION-CHANGE & ENROLLMENT REQUESTS + COURSE CLONE
 * ========================================================================== */
router.post('/classroom/offerings/:id/section-change-request', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const enrollment = await getStudentEnrollment(db, offeringId, req.user);
  if (!enrollment) {
    res.status(403).json({ detail: 'Only enrolled students can request a section transfer.' });
    return;
  }
  const requestedSection = normalizeSectionName(req.body?.requested_section || '');
  if (!requestedSection || requestedSection === 'ALL') {
    res.status(400).json({ detail: 'Choose a valid target section (e.g. Sec B).' });
    return;
  }
  const ins = await db.query(
    `INSERT INTO classroom_requests (
       offering_id, student_id, student_name, student_email, request_type, current_section, requested_section, reason
     ) VALUES ($1, $2, $3, $4, 'SECTION_CHANGE', $5, $6, $7) RETURNING *`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      req.user.email,
      enrollment.section || 'Sec A',
      requestedSection,
      String(req.body?.reason || '').trim().slice(0, 800),
    ]
  );
  res.status(201).json({ message: `Requested transfer to ${requestedSection}.`, request: ins.rows[0] });
});

router.post('/classroom/offerings/:id/enrollment-request', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const enrollment = await getStudentEnrollment(db, offeringId, req.user);
  if (enrollment) {
    res.status(409).json({ detail: 'You are already enrolled in this classroom.' });
    return;
  }
  const requestedSection = normalizeSectionName(req.body?.requested_section || 'Sec A');
  const dup = await db.query(
    `SELECT id FROM classroom_requests WHERE offering_id = $1 AND student_id = $2 AND request_type = 'ENROLLMENT' AND status = 'PENDING' LIMIT 1`,
    [offeringId, req.user.id]
  );
  if (dup.rowCount > 0) {
    res.status(409).json({ detail: 'You already have a pending enrollment request for this course.' });
    return;
  }
  const ins = await db.query(
    `INSERT INTO classroom_requests (
       offering_id, student_id, student_name, student_email, request_type, requested_section, reason
     ) VALUES ($1, $2, $3, $4, 'ENROLLMENT', $5, $6) RETURNING *`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      req.user.email,
      requestedSection === 'ALL' ? 'Sec A' : requestedSection,
      String(req.body?.reason || 'Late registration / elective request').trim().slice(0, 800),
    ]
  );
  res.status(201).json({ message: 'Enrollment request sent to course faculty.', request: ins.rows[0] });
});

router.get('/classroom/offerings/:id/requests', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Instructor permission required.' });
    return;
  }
  const rows = await db.query(
    `SELECT * FROM classroom_requests
     WHERE offering_id = $1
     ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC`,
    [offeringId]
  );
  res.json({ requests: rows.rows });
});

router.patch('/classroom/requests/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const reqId = parsePositiveInt(req.params.id);
  const rRes = await db.query(
    `SELECT cr.*, COALESCE(co.course_code, c.code) AS course_code
     FROM classroom_requests cr
     JOIN course_offerings co ON co.id = cr.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE cr.id = $1 LIMIT 1`,
    [reqId]
  );
  if (rRes.rowCount === 0) {
    res.status(404).json({ detail: 'Request not found' });
    return;
  }
  const cr = rRes.rows[0];
  const offeringId = Number(cr.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Instructor permission required.' });
    return;
  }
  const status = String(req.body?.status || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ detail: 'status must be APPROVED or REJECTED' });
    return;
  }
  await db.query(
    'UPDATE classroom_requests SET status = $1, reviewer_id = $2, reviewer_note = $3, reviewed_at = NOW() WHERE id = $4',
    [status, req.user.id, req.body?.reviewer_note || null, reqId]
  );

  if (status === 'APPROVED') {
    const nextSec = normalizeSectionName(cr.requested_section || 'Sec A');
    if (cr.request_type === 'SECTION_CHANGE') {
      await db.query(
        'UPDATE course_enrollments SET section = $1 WHERE offering_id = $2 AND (student_id = $3 OR LOWER(student_email) = LOWER($4))',
        [nextSec === 'ALL' ? 'Sec A' : nextSec, offeringId, cr.student_id, cr.student_email]
      );
      await mergeOfferingSections(db, offeringId, [nextSec]);
    } else if (cr.request_type === 'ENROLLMENT') {
      const stuUser = await db.query('SELECT roll_no FROM users WHERE id = $1 LIMIT 1', [cr.student_id]);
      await db.query(
        `INSERT INTO course_enrollments (offering_id, student_id, roll_no, student_name, student_email, section, enroll_source)
         VALUES ($1, $2, $3, $4, $5, $6, 'REQUEST_APPROVED')
         ON CONFLICT (offering_id, student_email) DO UPDATE SET
           student_id = EXCLUDED.student_id,
           section = EXCLUDED.section`,
        [
          offeringId,
          cr.student_id,
          stuUser.rows[0]?.roll_no || null,
          cr.student_name,
          cr.student_email,
          nextSec === 'ALL' ? 'Sec A' : nextSec,
        ]
      );
      await mergeOfferingSections(db, offeringId, [nextSec]);
    }
  }

  void notifyUser({
    db,
    userId: cr.student_id,
    email: cr.student_email,
    offeringId,
    type: 'CLASSROOM_REQUEST',
    title: `${cr.course_code}: ${cr.request_type.replace('_', ' ')} ${status}`,
    body: `Your request (${cr.requested_section || ''}) was ${status.toLowerCase()}.`,
    linkPath: `/classroom?offeringId=${offeringId}`,
    emailSubject: `[${cr.course_code}] Classroom Request ${status}`,
  });

  res.json({ message: `Request ${status.toLowerCase()}.` });
});

router.post('/classroom/offerings/:id/clone', requireProfessorOrAdmin, async (req, res) => {
  const offeringId = parsePositiveInt(req.params.id);
  const { academic_session, batch_year, semester } = req.body;

  const result = await withTransaction(async (client) => {
    const srcRes = await client.query('SELECT * FROM course_offerings WHERE id = $1 LIMIT 1', [offeringId]);
    if (srcRes.rowCount === 0) return { error: 404, detail: 'Source offering not found' };
    const src = srcRes.rows[0];
    const perms = await getCourseStaffPermissions(client, offeringId, req.user);
    if (!perms.can_manage_course) {
      return { error: 403, detail: 'Only instructors or admins can clone a course offering.' };
    }

    const joinCode = await generateUniqueJoinCode(client, src.course_code);
    const insOff = await client.query(
      `INSERT INTO course_offerings (
         course_id, course_code, course_name, academic_session, programme, batch_year,
         semester, section, sections, credits, join_code, auto_enroll, is_released,
         syllabus_drive_url, description, banner_image_url, course_desc_pdf_name,
         course_desc_pdf_data, course_desc_pdf_size, course_desc_pdf_uploaded_at,
         reeval_enabled, grade_weights
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, FALSE, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
       RETURNING *`,
      [
        src.course_id,
        src.course_code,
        src.course_name,
        academic_session || `${src.academic_session || 'Next'} (Cloned)`,
        src.programme,
        batch_year || src.batch_year,
        semester || src.semester,
        src.section,
        JSON.stringify(src.sections || ['Sec A']),
        src.credits,
        joinCode,
        src.auto_enroll,
        src.syllabus_drive_url,
        src.description,
        src.banner_image_url,
        src.course_desc_pdf_name,
        src.course_desc_pdf_data,
        src.course_desc_pdf_size,
        src.course_desc_pdf_uploaded_at,
        src.reeval_enabled !== false,
        JSON.stringify(src.grade_weights || { ASSIGNMENT: 30, LAB: 20, QUIZ: 20, PROJECT: 30 }),
      ]
    );
    const clonedOff = insOff.rows[0];

    await client.query(
      `INSERT INTO course_instructors (offering_id, professor_id, role_label, assigned_sections)
       VALUES ($1, $2, 'Course Coordinator', '["ALL"]'::jsonb)`,
      [clonedOff.id, req.user.id]
    );

    const [modsRes, itemsRes, asgnsRes, quizzesRes] = await Promise.all([
      client.query('SELECT * FROM course_modules WHERE offering_id = $1', [offeringId]),
      client.query('SELECT * FROM course_module_items WHERE offering_id = $1', [offeringId]),
      client.query('SELECT * FROM classroom_assignments WHERE offering_id = $1', [offeringId]),
      client.query('SELECT * FROM classroom_quizzes WHERE offering_id = $1', [offeringId]),
    ]);

    const modIdMap = new Map();
    for (const m of modsRes.rows) {
      const nm = await client.query(
        `INSERT INTO course_modules (offering_id, title, description, sort_order, target_sections, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
        [clonedOff.id, m.title, m.description, m.sort_order, JSON.stringify(m.target_sections || ['ALL']), req.user.id]
      );
      modIdMap.set(Number(m.id), Number(nm.rows[0].id));
    }
    for (const it of itemsRes.rows) {
      const targetModId = modIdMap.get(Number(it.module_id));
      if (!targetModId) continue;
      await client.query(
        `INSERT INTO course_module_items (module_id, offering_id, title, item_type, resource_url, file_name, file_mime, file_data, file_size, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          targetModId,
          clonedOff.id,
          it.title,
          it.item_type,
          it.resource_url,
          it.file_name,
          it.file_mime,
          it.file_data,
          it.file_size,
          it.sort_order,
          req.user.id,
        ]
      );
    }

    const asgnIdMap = new Map();
    for (const a of asgnsRes.rows) {
      const na = await client.query(
        `INSERT INTO classroom_assignments (
           offering_id, created_by, creator_name, title, description, assignment_type, topic_module,
           resource_links, max_marks, allow_late, target_sections, grades_published, reeval_enabled,
           rubric_json, late_penalty_pct_per_day, grace_minutes, is_group_assignment, max_group_size, weight_category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb, FALSE, $12, $13::jsonb, $14, $15, $16, $17, $18)
         RETURNING id`,
        [
          clonedOff.id,
          req.user.id,
          req.user.name,
          a.title,
          a.description,
          a.assignment_type,
          a.topic_module,
          JSON.stringify(a.resource_links || []),
          a.max_marks,
          a.allow_late,
          JSON.stringify(a.target_sections || ['ALL']),
          a.reeval_enabled,
          JSON.stringify(a.rubric_json || []),
          a.late_penalty_pct_per_day || 0,
          a.grace_minutes || 0,
          Boolean(a.is_group_assignment),
          a.max_group_size || 4,
          a.weight_category || 'ASSIGNMENT',
        ]
      );
      asgnIdMap.set(Number(a.id), Number(na.rows[0].id));
    }

    for (const q of quizzesRes.rows) {
      await client.query(
        `INSERT INTO classroom_quizzes (
           offering_id, assignment_id, created_by, title, description, target_sections,
           duration_minutes, randomize_questions, randomize_options, show_solutions_after, questions_json, max_marks
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12)`,
        [
          clonedOff.id,
          q.assignment_id ? asgnIdMap.get(Number(q.assignment_id)) || null : null,
          req.user.id,
          q.title,
          q.description,
          JSON.stringify(q.target_sections || ['ALL']),
          q.duration_minutes,
          q.randomize_questions,
          q.randomize_options,
          q.show_solutions_after,
          JSON.stringify(q.questions_json || []),
          q.max_marks,
        ]
      );
    }

    await writeAuditLog(client, {
      actorId: req.user.id,
      action: 'CLONE_OFFERING',
      entityType: 'OFFERING',
      entityId: clonedOff.id,
      metadata: { source_offering_id: offeringId },
    });

    return { clonedOff };
  });

  if (result.error) {
    res.status(result.error).json({ detail: result.detail });
    return;
  }
  res.status(201).json({
    message: `Cloned course structure into ${result.clonedOff.academic_session} (${result.clonedOff.join_code}).`,
    offering: { ...result.clonedOff, course_desc_pdf_data: undefined },
  });
});

/* ============================================================================
 * 4. QUESTION BANK & IN-PORTAL TIMED QUIZZES (WITH AUTO-GRADE SYNC)
 * ========================================================================== */
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sanitizeQuestionsInput(rawList = []) {
  const out = [];
  for (let i = 0; i < Math.min(100, rawList.length); i++) {
    const q = rawList[i] || {};
    const prompt = String(q.prompt || '').trim();
    if (!prompt) continue;
    const qType = ['MCQ', 'MULTI_SELECT', 'SHORT_ANSWER'].includes(String(q.question_type || 'MCQ').toUpperCase())
      ? String(q.question_type || 'MCQ').toUpperCase()
      : 'MCQ';
    const options = Array.isArray(q.options_json || q.options)
      ? (q.options_json || q.options).map((o) => String(o || '').trim()).filter(Boolean)
      : [];
    const correct = Array.isArray(q.correct_answers)
      ? q.correct_answers.map((a) => String(a || '').trim()).filter(Boolean)
      : q.correct_answer
        ? [String(q.correct_answer).trim()]
        : [];
    const marks = Math.min(100, Math.max(0.5, Number(q.marks || 1)));
    out.push({
      id: String(q.id || `q_${i + 1}`),
      question_type: qType,
      prompt: prompt.slice(0, 2000),
      options,
      correct_answers: correct,
      marks,
      explanation: q.explanation ? String(q.explanation).trim().slice(0, 1000) : '',
    });
  }
  return out;
}

router.get('/classroom/question-bank', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const courseCode = req.query.course_code ? String(req.query.course_code).trim().toUpperCase() : null;
  const topic = req.query.topic ? String(req.query.topic).trim().toLowerCase() : null;
  const rowsRes = await db.query(
    `SELECT * FROM question_bank_items
     WHERE ($1 = TRUE OR owner_id = $2)
     ORDER BY created_at DESC
     LIMIT 200`,
    [isFullAdminUser(req.user), req.user.id]
  );
  const items = rowsRes.rows.filter((q) => {
    if (courseCode && String(q.course_code || '').toUpperCase() !== courseCode) return false;
    if (topic && !String(q.topic || '').toLowerCase().includes(topic)) return false;
    return true;
  });
  res.json({ items });
});

router.post('/classroom/question-bank', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const sanitized = sanitizeQuestionsInput([req.body]);
  if (sanitized.length === 0) {
    res.status(400).json({ detail: 'Question prompt is required.' });
    return;
  }
  const q = sanitized[0];
  const ins = await db.query(
    `INSERT INTO question_bank_items (
       owner_id, course_code, topic, question_type, prompt, options_json, correct_answers, marks, explanation
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) RETURNING *`,
    [
      req.user.id,
      req.body?.course_code ? String(req.body.course_code).trim().toUpperCase() : null,
      req.body?.topic ? String(req.body.topic).trim() : null,
      q.question_type,
      q.prompt,
      JSON.stringify(q.options),
      JSON.stringify(q.correct_answers),
      q.marks,
      q.explanation,
    ]
  );
  res.status(201).json({ message: 'Saved to Question Bank.', item: ins.rows[0] });
});

router.delete('/classroom/question-bank/:id', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const id = parsePositiveInt(req.params.id);
  const existing = await db.query('SELECT owner_id FROM question_bank_items WHERE id = $1 LIMIT 1', [id]);
  if (existing.rowCount === 0) {
    res.status(404).json({ detail: 'Question not found' });
    return;
  }
  if (!isFullAdminUser(req.user) && Number(existing.rows[0].owner_id) !== Number(req.user.id)) {
    res.status(403).json({ detail: 'Only the question owner or admin can delete it.' });
    return;
  }
  await db.query('DELETE FROM question_bank_items WHERE id = $1', [id]);
  res.json({ message: 'Deleted from Question Bank.' });
});

router.get('/classroom/offerings/:id/quizzes', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const [perms, enrollment, qRes] = await Promise.all([
    getCourseStaffPermissions(db, offeringId, req.user),
    getStudentEnrollment(db, offeringId, req.user),
    db.query('SELECT * FROM classroom_quizzes WHERE offering_id = $1 ORDER BY created_at DESC', [offeringId]),
  ]);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Not enrolled in this classroom.' });
    return;
  }
  const simulateStudent = Boolean(req.query.preview === 'student' && isStaff);
  const studentSec = isStaff ? String(req.query.section || 'Sec A') : enrollment?.section || 'Sec A';

  const quizIds = qRes.rows.map((q) => Number(q.id));
  const attRes =
    quizIds.length > 0
      ? isStaff && !simulateStudent
        ? await db.query('SELECT id, quiz_id, student_id, score, status, submitted_at FROM classroom_quiz_attempts WHERE quiz_id = ANY($1::int[])', [
            quizIds,
          ])
        : await db.query('SELECT * FROM classroom_quiz_attempts WHERE quiz_id = ANY($1::int[]) AND student_id = $2', [
            quizIds,
            req.user.id,
          ])
      : { rows: [] };

  const quizzes = qRes.rows
    .map((q) => {
      const targetSections = parseSectionsList(q.target_sections, ['ALL']);
      if ((!isStaff || simulateStudent) && (!canStudentViewTargets(studentSec, targetSections) || q.is_published === false)) {
        return null;
      }
      const attempts = attRes.rows.filter((a) => Number(a.quiz_id) === Number(q.id));
      const myAttempt = attempts.find((a) => Number(a.student_id) === Number(req.user.id)) || null;
      const revealSolutions = Boolean(
        (isStaff && !simulateStudent) ||
          (myAttempt?.status === 'SUBMITTED' && q.show_solutions_after !== false)
      );
      const rawQuestions = Array.isArray(q.questions_json)
        ? q.questions_json
        : JSON.parse(q.questions_json || '[]');
      const safeQuestions = rawQuestions.map((item) => ({
        id: item.id,
        question_type: item.question_type,
        prompt: item.prompt,
        options: item.options || [],
        marks: item.marks,
        ...(revealSolutions
          ? { correct_answers: item.correct_answers, explanation: item.explanation }
          : {}),
      }));

      return {
        ...q,
        target_sections: targetSections,
        questions_count: safeQuestions.length,
        questions: safeQuestions,
        my_attempt: myAttempt,
        attempt_count: isStaff && !simulateStudent ? attempts.length : undefined,
        can_edit:
          isStaff && !simulateStudent
            ? canStaffMutateItem(perms, targetSections, q.created_by, req.user.id)
            : false,
      };
    })
    .filter(Boolean);

  res.json({ quizzes });
});

router.post('/classroom/offerings/:id/quizzes', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors or authorized TAs can publish timed quizzes.' });
    return;
  }
  const title = String(req.body?.title || '').trim();
  const questions = sanitizeQuestionsInput(req.body?.questions || []);
  if (!title || questions.length === 0) {
    res.status(400).json({ detail: 'Quiz title and at least 1 valid question are required.' });
    return;
  }
  const targetRes = resolvePostTargetsForStaff(perms, req.body?.target_sections);
  if (!targetRes.ok) {
    res.status(403).json({ detail: targetRes.error });
    return;
  }
  await mergeOfferingSections(db, offeringId, targetRes.sections);

  const totalMarks = Number(questions.reduce((acc, q) => acc + Number(q.marks || 1), 0).toFixed(2));
  const durationMinutes = Math.min(240, Math.max(2, Number(req.body?.duration_minutes || 15)));
  const endsAtIso = req.body?.ends_at
    ? new Date(req.body.ends_at).toISOString()
    : new Date(Date.now() + 7 * 86400000).toISOString();
  const startsAtIso = req.body?.starts_at ? new Date(req.body.starts_at).toISOString() : new Date().toISOString();

  // Auto-create linked assignment row so quiz marks flow directly into ExcelMarksSheet & My Grades!
  const asgnIns = await db.query(
    `INSERT INTO classroom_assignments (
       offering_id, created_by, creator_name, title, description, assignment_type,
       topic_module, due_at, allow_late, max_marks, target_sections, grades_published, weight_category
     ) VALUES ($1, $2, $3, $4, $5, 'QUIZ', 'In-Portal Timed Quiz', $6, FALSE, $7, $8::jsonb, TRUE, 'QUIZ')
     RETURNING id`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      title,
      req.body?.description ? String(req.body.description).trim() : null,
      endsAtIso,
      totalMarks,
      JSON.stringify(targetRes.sections),
    ]
  );
  const linkedAssignmentId = Number(asgnIns.rows[0].id);

  const quizIns = await db.query(
    `INSERT INTO classroom_quizzes (
       offering_id, assignment_id, created_by, title, description, target_sections,
       duration_minutes, randomize_questions, randomize_options, show_solutions_after,
       questions_json, max_marks, starts_at, ends_at, is_published
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, TRUE)
     RETURNING *`,
    [
      offeringId,
      linkedAssignmentId,
      req.user.id,
      title,
      req.body?.description ? String(req.body.description).trim() : null,
      JSON.stringify(targetRes.sections),
      durationMinutes,
      req.body?.randomize_questions !== false,
      req.body?.randomize_options !== false,
      req.body?.show_solutions_after !== false,
      JSON.stringify(questions),
      totalMarks,
      startsAtIso,
      endsAtIso,
    ]
  );

  const offMeta = await getOfferingCourseMeta(db, offeringId);
  const cCode = offMeta?.courseCode || 'COURSE';
  const cName = offMeta?.courseName || 'Classroom';
  const appOrigin = resolveFrontendAppUrl();
  const gCalUrl = buildGoogleCalendarUrl({
    title: `[${cCode}] Quiz Due: ${title}`,
    details: `${cName}\nDuration: ${durationMinutes} mins · Max Marks: ${totalMarks}`,
    startIso: endsAtIso,
  });
  void notifyCourseAudience({
    db,
    offeringId,
    targetSections: targetRes.sections,
    eventType: 'QUIZ_PUBLISHED',
    title: `${cCode}: Timed Quiz — ${title}`,
    body: `${questions.length} questions · ${durationMinutes} minutes · Auto-synced to Gradebook.`,
    linkPath: `/classroom?offeringId=${offeringId}`,
    emailSubject: `[${cCode}] New Timed Quiz: ${title}`,
    emailHtml: renderNotificationEmailHtml({
      courseLabel: `${cCode} · ${cName}`,
      heading: title,
      body: `A new ${durationMinutes}-minute timed quiz (${questions.length} questions, ${totalMarks} marks) is live in Learn JKLU Classroom.\nCloses: ${new Date(endsAtIso).toLocaleString()}`,
      ctaLabel: 'Open Quiz Tab',
      ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
      secondaryLabel: 'Add Closing Time to Google Calendar',
      secondaryUrl: gCalUrl,
    }),
    actorUserId: req.user.id,
  });

  res.status(201).json({ message: 'Timed quiz published & linked to Gradebook.', quiz: quizIns.rows[0] });
});

router.delete('/classroom/quizzes/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const quizId = parsePositiveInt(req.params.id);
  const qRes = await db.query('SELECT * FROM classroom_quizzes WHERE id = $1 LIMIT 1', [quizId]);
  if (qRes.rowCount === 0) {
    res.status(404).json({ detail: 'Quiz not found' });
    return;
  }
  const q = qRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(q.offering_id), req.user);
  if (!canStaffMutateItem(perms, q.target_sections, q.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot delete this quiz.' });
    return;
  }
  await db.query('DELETE FROM classroom_quizzes WHERE id = $1', [quizId]);
  if (q.assignment_id) {
    await db.query('DELETE FROM classroom_assignments WHERE id = $1', [q.assignment_id]);
  }
  res.json({ message: 'Quiz deleted.' });
});

router.post('/classroom/quizzes/:id/start', requireAuth, async (req, res) => {
  const db = await getDb();
  const quizId = parsePositiveInt(req.params.id);
  const qRes = await db.query('SELECT * FROM classroom_quizzes WHERE id = $1 LIMIT 1', [quizId]);
  if (qRes.rowCount === 0) {
    res.status(404).json({ detail: 'Quiz not found' });
    return;
  }
  const quiz = qRes.rows[0];
  const [perms, enrollment] = await Promise.all([
    getCourseStaffPermissions(db, Number(quiz.offering_id), req.user),
    getStudentEnrollment(db, Number(quiz.offering_id), req.user),
  ]);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Only enrolled students can attempt this quiz.' });
    return;
  }
  if (!isStaff && !canStudentViewTargets(enrollment?.section || 'Sec A', quiz.target_sections)) {
    res.status(403).json({ detail: 'Quiz belongs to another section.' });
    return;
  }
  if (quiz.ends_at && new Date() > new Date(quiz.ends_at)) {
    res.status(400).json({ detail: 'Quiz submission window has closed.' });
    return;
  }

  let attRes = await db.query(
    'SELECT * FROM classroom_quiz_attempts WHERE quiz_id = $1 AND student_id = $2 LIMIT 1',
    [quizId, req.user.id]
  );
  if (attRes.rowCount === 0) {
    attRes = await db.query(
      `INSERT INTO classroom_quiz_attempts (quiz_id, student_id, max_marks, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS') RETURNING *`,
      [quizId, req.user.id, quiz.max_marks]
    );
  }
  const attempt = attRes.rows[0];
  if (attempt.status === 'SUBMITTED') {
    res.status(409).json({ detail: 'You have already submitted this quiz.', attempt });
    return;
  }

  const startedMs = new Date(attempt.started_at || Date.now()).getTime();
  const durEndMs = startedMs + Number(quiz.duration_minutes || 15) * 60000;
  const hardEndMs = quiz.ends_at ? new Date(quiz.ends_at).getTime() : durEndMs;
  const expiresAtIso = new Date(Math.min(durEndMs, hardEndMs)).toISOString();

  const rawQuestions = Array.isArray(quiz.questions_json)
    ? quiz.questions_json
    : JSON.parse(quiz.questions_json || '[]');
  let prepared = rawQuestions.map((item) => ({
    id: item.id,
    question_type: item.question_type,
    prompt: item.prompt,
    options: quiz.randomize_options ? shuffleArray(item.options || []) : item.options || [],
    marks: item.marks,
  }));
  if (quiz.randomize_questions) {
    prepared = shuffleArray(prepared);
  }

  res.json({
    attempt_id: attempt.id,
    expires_at: expiresAtIso,
    duration_minutes: quiz.duration_minutes,
    questions: prepared,
  });
});

router.post('/classroom/quiz-attempts/:id/submit', requireAuth, async (req, res) => {
  const db = await getDb();
  const attemptId = parsePositiveInt(req.params.id);
  const attRes = await db.query('SELECT * FROM classroom_quiz_attempts WHERE id = $1 LIMIT 1', [attemptId]);
  if (attRes.rowCount === 0) {
    res.status(404).json({ detail: 'Quiz attempt not found' });
    return;
  }
  const attempt = attRes.rows[0];
  if (Number(attempt.student_id) !== Number(req.user.id)) {
    res.status(403).json({ detail: 'Unauthorized quiz attempt submission.' });
    return;
  }
  if (attempt.status === 'SUBMITTED') {
    res.json({ message: 'Quiz already submitted.', attempt });
    return;
  }

  const qRes = await db.query('SELECT * FROM classroom_quizzes WHERE id = $1 LIMIT 1', [attempt.quiz_id]);
  const quiz = qRes.rows[0];
  const rawQuestions = Array.isArray(quiz.questions_json)
    ? quiz.questions_json
    : JSON.parse(quiz.questions_json || '[]');
  const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};

  let totalScore = 0;
  const review = [];
  for (const q of rawQuestions) {
    const qId = String(q.id);
    const stuAns = answers[qId];
    const correctList = (q.correct_answers || []).map((x) => String(x).trim().toLowerCase());
    let isCorrect = false;

    if (q.question_type === 'MULTI_SELECT') {
      const stuList = Array.isArray(stuAns)
        ? stuAns.map((x) => String(x).trim().toLowerCase()).sort()
        : [];
      const sortedCorrect = [...correctList].sort();
      isCorrect =
        sortedCorrect.length > 0 &&
        stuList.length === sortedCorrect.length &&
        stuList.every((v, idx) => v === sortedCorrect[idx]);
    } else if (q.question_type === 'SHORT_ANSWER') {
      const stuStr = String(stuAns || '').trim().toLowerCase();
      isCorrect = Boolean(stuStr && correctList.includes(stuStr));
    } else {
      const stuStr = String(stuAns || '').trim().toLowerCase();
      isCorrect = Boolean(stuStr && correctList[0] === stuStr);
    }

    const earned = isCorrect ? Number(q.marks || 1) : 0;
    totalScore += earned;
    review.push({
      id: qId,
      is_correct: isCorrect,
      earned_marks: earned,
      max_marks: Number(q.marks || 1),
      ...(quiz.show_solutions_after !== false
        ? { correct_answers: q.correct_answers, explanation: q.explanation }
        : {}),
    });
  }

  totalScore = Number(totalScore.toFixed(2));
  const upd = await db.query(
    `UPDATE classroom_quiz_attempts
     SET submitted_at = NOW(), answers_json = $1::jsonb, score = $2, status = 'SUBMITTED'
     WHERE id = $3 RETURNING *`,
    [JSON.stringify(answers), totalScore, attemptId]
  );

  // Auto-sync quiz score directly into assignment_submissions & ExcelMarksSheet!
  if (quiz.assignment_id) {
    const subUpd = await db.query(
      `INSERT INTO assignment_submissions (
         assignment_id, student_id, student_name, student_email, student_roll_no,
         submission_url, upload_mode, marks_obtained, graded_by_name, graded_at, submitted_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, '', 'IN_PORTAL_QUIZ', $6, 'Auto-Grader', NOW(), NOW(), NOW())
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         marks_obtained = EXCLUDED.marks_obtained,
         upload_mode = 'IN_PORTAL_QUIZ',
         graded_by_name = 'Auto-Grader',
         graded_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [quiz.assignment_id, req.user.id, req.user.name, req.user.email, req.user.roll_no || null, totalScore]
    );
    await db.query(
      `INSERT INTO grading_audit_logs (offering_id, assignment_id, submission_id, student_id, grader_id, grader_name, grader_role, new_marks, source)
       VALUES ($1, $2, $3, $4, $5, 'Auto-Grader', 'System', $6, 'AUTO_QUIZ')`,
      [quiz.offering_id, quiz.assignment_id, subUpd.rows[0]?.id || null, req.user.id, req.user.id, totalScore]
    );
  }

  res.json({
    message: `Quiz submitted! Score: ${totalScore}/${quiz.max_marks}`,
    score: totalScore,
    max_marks: Number(quiz.max_marks),
    attempt: upd.rows[0],
    review,
  });
});

/* ============================================================================
 * 5. UNIFIED CROSS-COURSE STUDENT & FACULTY OVERVIEW HUBS
 * ========================================================================== */
router.get('/classroom/student/overview', requireAuth, async (req, res) => {
  const db = await getDb();
  const [enrRes, notifRes] = await Promise.all([
    db.query(
      `SELECT ce.offering_id, ce.section, ce.attendance_pct,
              COALESCE(co.course_code, c.code) AS course_code,
              COALESCE(co.course_name, c.name) AS course_name,
              co.academic_session
       FROM course_enrollments ce
       JOIN course_offerings co ON co.id = ce.offering_id
       LEFT JOIN courses c ON c.id = co.course_id
       WHERE ce.student_id = $1 OR LOWER(ce.student_email) = LOWER($2)`,
      [req.user.id, req.user.email]
    ),
    db.query(
      'SELECT COUNT(*)::int AS unread FROM classroom_notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    ),
  ]);

  const token = signCalendarToken(req.user.id);
  const icsUrl = `${PUBLIC_BASE_URL}/classroom/calendar/${token}.ics`;
  const googleSubscribeUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
    icsUrl.replace(/^https?:\/\//i, 'webcal://')
  )}`;

  const offIds = enrRes.rows.map((e) => Number(e.offering_id));
  if (offIds.length === 0) {
    res.json({
      unread_notifications: Number(notifRes.rows[0]?.unread || 0),
      google_subscribe_url: googleSubscribeUrl,
      ics_url: icsUrl,
      courses: [],
      upcoming_deadlines: [],
      recent_grades: [],
    });
    return;
  }

  const secByOff = new Map(enrRes.rows.map((e) => [Number(e.offering_id), e.section || 'Sec A']));
  const [asgnRes, subRes] = await Promise.all([
    db.query(
      `SELECT ca.*, COALESCE(co.course_code, c.code) AS course_code, COALESCE(co.course_name, c.name) AS course_name
       FROM classroom_assignments ca
       JOIN course_offerings co ON co.id = ca.offering_id
       LEFT JOIN courses c ON c.id = co.course_id
       WHERE ca.offering_id = ANY($1::int[])
       ORDER BY ca.due_at ASC NULLS LAST`,
      [offIds]
    ),
    db.query(
      `SELECT s.*, ca.offering_id
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       WHERE ca.offering_id = ANY($1::int[]) AND s.student_id = $2`,
      [offIds, req.user.id]
    ),
  ]);

  const subByAsgn = new Map(subRes.rows.map((s) => [Number(s.assignment_id), s]));
  const upcoming = [];
  const recentGrades = [];

  for (const a of asgnRes.rows) {
    const oid = Number(a.offering_id);
    const sec = secByOff.get(oid) || 'Sec A';
    if (!canStudentViewTargets(sec, a.target_sections)) continue;
    const sub = subByAsgn.get(Number(a.id));
    if (!sub) {
      upcoming.push({
        id: a.id,
        offering_id: oid,
        course_code: a.course_code,
        course_name: a.course_name,
        title: a.title,
        assignment_type: a.assignment_type,
        due_at: a.due_at,
        max_marks: Number(a.max_marks || 100),
      });
    } else if (
      sub.marks_obtained !== null &&
      sub.marks_obtained !== undefined &&
      a.grades_published !== false
    ) {
      recentGrades.push({
        assignment_id: a.id,
        offering_id: oid,
        course_code: a.course_code,
        title: a.title,
        marks_obtained: Number(sub.marks_obtained),
        max_marks: Number(a.max_marks || 100),
        graded_at: sub.graded_at,
      });
    }
  }

  recentGrades.sort((a, b) => new Date(b.graded_at || 0).getTime() - new Date(a.graded_at || 0).getTime());

  res.json({
    unread_notifications: Number(notifRes.rows[0]?.unread || 0),
    google_subscribe_url: googleSubscribeUrl,
    ics_url: icsUrl,
    courses: enrRes.rows.map((e) => ({
      offering_id: Number(e.offering_id),
      course_code: e.course_code,
      course_name: e.course_name,
      section: e.section || 'Sec A',
      attendance_pct: e.attendance_pct !== null ? Number(e.attendance_pct) : null,
    })),
    upcoming_deadlines: upcoming.slice(0, 12),
    recent_grades: recentGrades.slice(0, 8),
  });
});

router.get('/classroom/faculty/overview', requireAuth, async (req, res) => {
  const db = await getDb();
  const isFullAdmin = isFullAdminUser(req.user);
  const offRes = isFullAdmin
    ? await db.query(
        `SELECT co.id, COALESCE(co.course_code, c.code) AS course_code, COALESCE(co.course_name, c.name) AS course_name
         FROM course_offerings co LEFT JOIN courses c ON c.id = co.course_id`
      )
    : await db.query(
        `SELECT DISTINCT co.id, COALESCE(co.course_code, c.code) AS course_code, COALESCE(co.course_name, c.name) AS course_name
         FROM course_offerings co
         LEFT JOIN courses c ON c.id = co.course_id
         LEFT JOIN course_instructors ci ON ci.offering_id = co.id
         LEFT JOIN course_tas ct ON ct.offering_id = co.id
         WHERE ci.professor_id = $1 OR ct.user_id = $1 OR LOWER(ct.public_email) = LOWER($2)`,
        [req.user.id, req.user.email]
      );

  const offIds = offRes.rows.map((o) => Number(o.id));
  if (offIds.length === 0) {
    res.json({ needs_grading_queue: [], pending_counts: {}, ta_workload: [], audit_logs: [] });
    return;
  }

  const [ungradedRes, reevalRes, odRes, reqsRes, auditRes] = await Promise.all([
    db.query(
      `SELECT s.id AS submission_id, s.student_name, s.student_email, s.submitted_at,
              ca.id AS assignment_id, ca.offering_id, ca.title AS assignment_title, ca.target_sections,
              COALESCE(co.course_code, c.code) AS course_code, ce.section AS student_section
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       JOIN course_offerings co ON co.id = ca.offering_id
       LEFT JOIN courses c ON c.id = co.course_id
       LEFT JOIN course_enrollments ce ON ce.offering_id = ca.offering_id AND ce.student_id = s.student_id
       WHERE ca.offering_id = ANY($1::int[]) AND s.marks_obtained IS NULL
       ORDER BY s.submitted_at ASC
       LIMIT 60`,
      [offIds]
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM reeval_requests WHERE offering_id = ANY($1::int[]) AND status = 'PENDING'`,
      [offIds]
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM od_leave_requests WHERE offering_id = ANY($1::int[]) AND status = 'PENDING'`,
      [offIds]
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM classroom_requests WHERE offering_id = ANY($1::int[]) AND status = 'PENDING'`,
      [offIds]
    ),
    db.query(
      `SELECT gal.*, COALESCE(co.course_code, c.code) AS course_code
       FROM grading_audit_logs gal
       JOIN course_offerings co ON co.id = gal.offering_id
       LEFT JOIN courses c ON c.id = co.course_id
       WHERE gal.offering_id = ANY($1::int[])
       ORDER BY gal.created_at DESC
       LIMIT 30`,
      [offIds]
    ),
  ]);

  const permsMap = new Map();
  for (const oid of offIds) {
    permsMap.set(oid, await getCourseStaffPermissions(db, oid, req.user));
  }

  const needsGradingQueue = ungradedRes.rows.filter((row) => {
    const perms = permsMap.get(Number(row.offering_id));
    return perms ? canStaffGradeTarget(perms, row.target_sections, row.student_section || 'Sec A') : false;
  });

  const workloadMap = new Map();
  for (const log of auditRes.rows) {
    const key = `${log.grader_name || 'Staff'} (${log.grader_role || 'Staff'})`;
    workloadMap.set(key, (workloadMap.get(key) || 0) + 1);
  }
  const taWorkload = Array.from(workloadMap.entries()).map(([grader, graded_actions]) => ({
    grader,
    graded_actions,
  }));

  res.json({
    needs_grading_queue: needsGradingQueue.slice(0, 25),
    pending_counts: {
      needs_grading: needsGradingQueue.length,
      reeval: Number(reevalRes.rows[0]?.cnt || 0),
      od_leave: Number(odRes.rows[0]?.cnt || 0),
      requests: Number(reqsRes.rows[0]?.cnt || 0),
    },
    ta_workload: taWorkload,
    audit_logs: auditRes.rows.slice(0, 20),
  });
});

export default router;
