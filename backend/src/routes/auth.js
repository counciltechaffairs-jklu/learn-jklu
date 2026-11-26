import crypto from 'node:crypto';
import fs from 'node:fs';
import { getDb, withTransaction } from '../config/db.js';
import { invalidateCachePrefix, checkRateLimitWindow } from '../config/cache.js';
import { JWT_SECRET, parsePositiveInt } from '../config/env.js';
import { verifyPasswordNonBlocking, hashPasswordNonBlocking } from '../config/cryptoPool.js';
import {
  signUserToken,
  formatUserResponse,
  requireAuth,
  requireFullAdmin,
  canAccessAdminPanel,
  getNormalizedRole,
  USER_COLS,
  USER_AUTH_COLS,
} from '../middleware/auth.js';
import {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  profileWriteLimiter,
} from '../middleware/rateLimiters.js';
import { userUpload, validateUploadedFileMagic } from '../middleware/uploads.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { writeAuditLog } from '../utils/security.js';

const router = createAsyncRouter();
const usedCaptchaIds = new Map();
let idCardColsEnsured = false;

async function getTaOfferingIds(db, user) {
  if (!user) return [];
  const isVerifiedAccount = Boolean(user.email_verified && user.id_verified);
  const res = isVerifiedAccount
    ? await db.query(
        'SELECT offering_id FROM course_tas WHERE user_id = $1 OR LOWER(public_email) = LOWER($2)',
        [user.id, user.email]
      )
    : await db.query('SELECT offering_id FROM course_tas WHERE user_id = $1', [user.id]);
  return res.rows.map((r) => Number(r.offering_id));
}

function signCaptchaPayload(id, answer, expiresAt) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${id}:${answer}:${expiresAt}`)
    .digest('hex');
}

async function verifyHumanChallenge(req) {
  if (process.env.RECAPTCHA_SECRET_KEY) {
    const token = String(req.body?.captcha_token || '').trim();
    if (!token) return { ok: false, detail: 'Please complete the "I am not a robot" check' };
    try {
      const form = new URLSearchParams();
      form.append('secret', process.env.RECAPTCHA_SECRET_KEY);
      form.append('response', token);
      if (req.ip) form.append('remoteip', req.ip);
      const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: form,
      });
      const data = await r.json();
      return data.success
        ? { ok: true }
        : { ok: false, detail: 'Google reCAPTCHA verification failed. Please try again.' };
    } catch {
      return { ok: false, detail: 'Unable to verify reCAPTCHA right now.' };
    }
  }

  if (process.env.TURNSTILE_SECRET_KEY) {
    const token = String(req.body?.captcha_token || '').trim();
    if (!token) return { ok: false, detail: 'Please complete the "I am not a robot" check' };
    try {
      const form = new URLSearchParams();
      form.append('secret', process.env.TURNSTILE_SECRET_KEY);
      form.append('response', token);
      if (req.ip) form.append('remoteip', req.ip);
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
      });
      const data = await r.json();
      return data.success
        ? { ok: true }
        : { ok: false, detail: 'Human verification failed. Please try again.' };
    } catch {
      return { ok: false, detail: 'Unable to verify human check right now.' };
    }
  }

  let challenge = req.body?.captcha_challenge;
  if (typeof challenge === 'string') {
    try {
      challenge = JSON.parse(challenge);
    } catch {
      challenge = null;
    }
  }
  if (!challenge || typeof challenge !== 'object') {
    return { ok: false, detail: 'Please complete the "I am not a robot" verification' };
  }
  const { id, answer, expiresAt, signature } = challenge;
  if (!id || answer === undefined || !expiresAt || !signature) {
    return { ok: false, detail: 'Please complete the "I am not a robot" verification' };
  }
  const now = Date.now();
  if (now > Number(expiresAt)) {
    return { ok: false, detail: 'Verification expired. Please refresh the robot check.' };
  }
  for (const [k, exp] of usedCaptchaIds.entries()) {
    if (now > exp) usedCaptchaIds.delete(k);
  }
  if (usedCaptchaIds.has(String(id))) {
    return { ok: false, detail: 'Verification already used. Please check "I am not a robot" again.' };
  }
  const expected = signCaptchaPayload(String(id), String(answer).trim(), Number(expiresAt));
  const sigBuf = Buffer.from(String(signature), 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, detail: 'Incorrect answer for "I am not a robot" check.' };
  }
  usedCaptchaIds.set(String(id), Number(expiresAt));
  return { ok: true };
}

router.get('/captcha/challenge', apiLimiter, (_req, res) => {
  if (process.env.RECAPTCHA_SECRET_KEY) {
    res.json({ mode: 'recaptcha' });
    return;
  }
  if (process.env.TURNSTILE_SECRET_KEY) {
    res.json({ mode: 'turnstile' });
    return;
  }
  const a = crypto.randomInt(2, 15);
  const b = crypto.randomInt(2, 15);
  const id = crypto.randomBytes(12).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const signature = signCaptchaPayload(id, String(a + b), expiresAt);
  res.json({
    mode: 'builtin',
    id,
    question: `${a} + ${b} = ?`,
    expiresAt,
    signature,
  });
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const captchaCheck = await verifyHumanChallenge(req);
    if (!captchaCheck.ok) {
      res.status(400).json({ detail: captchaCheck.detail });
      return;
    }
    const email = String(req.body.email || req.body.username || '')
      .toLowerCase()
      .trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      res.status(400).json({ detail: 'Email and password are required' });
      return;
    }
    if (!(await checkRateLimitWindow(`login:email:${email}`, 10, 900))) {
      res.status(429).json({ detail: 'Too many login attempts for this account. Try again in 15 minutes.' });
      return;
    }

    const db = await getDb();
    const userRes = await db.query(
      `SELECT ${USER_AUTH_COLS} FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    const user = userRes.rowCount > 0 ? userRes.rows[0] : null;
    if (!user || user.is_active === false) {
      res.status(401).json({ detail: 'Invalid email or password' });
      return;
    }

    const valid = await verifyPasswordNonBlocking(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ detail: 'Invalid email or password' });
      return;
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
    const taOfferingIds = await getTaOfferingIds(db, user);
    const access_token = signUserToken(user);
    res.json({
      access_token,
      token_type: 'bearer',
      user: formatUserResponse(user, taOfferingIds),
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ detail: 'Error' });
  }
});

router.post('/admin-login', authLimiter, async (req, res) => {
  try {
    const captchaCheck = await verifyHumanChallenge(req);
    if (!captchaCheck.ok) {
      res.status(400).json({ detail: captchaCheck.detail });
      return;
    }
    const email = String(req.body.username || req.body.email || '')
      .toLowerCase()
      .trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      res.status(400).json({ detail: 'Email and password are required' });
      return;
    }
    if (!(await checkRateLimitWindow(`admin:email:${email}`, 8, 900))) {
      res.status(429).json({ detail: 'Too many admin login attempts for this account. Try again in 15 minutes.' });
      return;
    }

    const db = await getDb();
    const userRes = await db.query(
      `SELECT ${USER_AUTH_COLS} FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    const user = userRes.rowCount > 0 ? userRes.rows[0] : null;
    if (!user || user.is_active === false) {
      res.status(401).json({ detail: 'Invalid admin credentials' });
      return;
    }

    const valid = await verifyPasswordNonBlocking(password, user.password_hash);
    const hasStaffLogin = canAccessAdminPanel(user) || getNormalizedRole(user) === 'professor';
    if (!valid || !hasStaffLogin) {
      res.status(401).json({ detail: 'Invalid admin credentials' });
      return;
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
    const taOfferingIds = await getTaOfferingIds(db, user);
    const access_token = signUserToken(user);
    res.json({
      access_token,
      token_type: 'bearer',
      user: formatUserResponse(user, taOfferingIds),
    });
  } catch (err) {
    console.error('[Admin Login Error]', err);
    res.status(500).json({ detail: 'Error' });
  }
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const captchaCheck = await verifyHumanChallenge(req);
    if (!captchaCheck.ok) {
      res.status(400).json({ detail: captchaCheck.detail });
      return;
    }
    const email = String(req.body.email || '')
      .toLowerCase()
      .trim();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirm_password ?? req.body.password ?? '');

    if (!email || !name || !password) {
      res.status(400).json({ detail: 'Name, email, and password are required' });
      return;
    }
    if (!/^[^\s@]+@jklu\.edu\.in$/i.test(email)) {
      res.status(400).json({ detail: 'Please register using your official @jklu.edu.in email address' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ detail: 'Password must be at least 6 characters' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ detail: 'Passwords do not match' });
      return;
    }

    const db = await getDb();
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [
      email,
    ]);
    if (existing.rowCount > 0) {
      res.status(400).json({ detail: 'Email is already registered' });
      return;
    }

    const hash = await hashPasswordNonBlocking(password, 10);
    const department = req.body.department ? String(req.body.department).trim().toUpperCase() : 'B.TECH';
    const year = req.body.year ? String(req.body.year).trim() : null;
    const batchYear = req.body.batch_year ? String(req.body.batch_year).trim() : null;
    const rollNo = req.body.roll_no ? String(req.body.roll_no).trim().toUpperCase() : null;

    const newUser = await withTransaction(db, async (tx) => {
      const inserted = await tx.query(
        `INSERT INTO users (email, name, password_hash, department, year, batch_year, roll_no, student_id, is_admin, email_verified, id_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, FALSE, TRUE, FALSE)
         RETURNING ${USER_COLS}`,
        [email, name, hash, department, year, batchYear, rollNo]
      );
      const created = inserted.rows[0];

      // Reconcile pre-imported TCS iON roster rows ONLY by exact email (never by self-declared roll_no)
      await tx.query(
        `UPDATE course_enrollments
         SET student_id = $1,
             student_name = COALESCE(student_name, $2)
         WHERE student_id IS NULL
           AND LOWER(student_email) = LOWER($3)`,
        [created.id, created.name, email]
      );

      // Auto-enroll newly registered student into released core offerings matching programme + semester
      if (department) {
        await tx.query(
          `INSERT INTO course_enrollments (
             offering_id, student_id, roll_no, student_name, student_email, section, enroll_source, attendance_pct
           )
           SELECT co.id, $1, $2, $3, $4, 'Sec A', 'AUTO_BATCH', NULL
           FROM course_offerings co
           WHERE co.is_released = TRUE
             AND co.auto_enroll = TRUE
             AND UPPER(co.programme) = UPPER($5)
             AND (co.semester = 'ALL' OR ($6::text IS NOT NULL AND co.semester = $6::text))
           ON CONFLICT (offering_id, student_email) DO NOTHING`,
          [created.id, rollNo, created.name, email, department, year]
        );
      }

      return created;
    });

    const taOfferingIds = await getTaOfferingIds(db, newUser);
    const access_token = signUserToken(newUser);
    invalidateCachePrefix('admin:');
    invalidateCachePrefix('auth:');
    invalidateCachePrefix('metrics:');

    res.json({
      message: 'Registration successful',
      access_token,
      token_type: 'bearer',
      user: formatUserResponse(newUser, taOfferingIds),
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ detail: 'Error' });
  }
});

router.post('/create-admin', requireFullAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .toLowerCase()
      .trim();
    const name = String(req.body.name || 'Admin').trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      res.status(400).json({ detail: 'Email and password are required' });
      return;
    }
    const db = await getDb();
    const hash = await hashPasswordNonBlocking(password, 10);
    const inserted = await db.query(
      `INSERT INTO users (email, name, password_hash, is_admin, admin_role, id_verified, email_verified)
       VALUES ($1, $2, $3, TRUE, 'full_admin', TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         is_admin = TRUE,
         admin_role = 'full_admin',
         password_hash = EXCLUDED.password_hash,
         token_version = users.token_version + 1
       RETURNING ${USER_COLS}`,
      [email, name, hash]
    );
    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'CREATE_OR_PROMOTE_ADMIN',
      entityType: 'USER',
      entityId: inserted.rows[0].id,
      metadata: { email },
    });
    invalidateCachePrefix('auth:');
    invalidateCachePrefix('admin:');
    res.json(formatUserResponse(inserted.rows[0]));
  } catch (err) {
    console.error('[Create Admin Error]', err);
    res.status(500).json({ detail: 'Error' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const db = await getDb();
  const taOfferingIds = await getTaOfferingIds(db, req.user);
  res.json(formatUserResponse(req.user, taOfferingIds));
});

/**
 * GET /me/activity
 * Signed-in user's OWN daily activity counts (last 365 days, IST day buckets) + summaries.
 * Students: paper uploads + assignment submissions. Staff: announcements, classwork, grades given.
 */
const IST_DAY_SQL = (col) =>
  `to_char((${col} AT TIME ZONE 'UTC') + INTERVAL '330 minutes', 'YYYY-MM-DD')`;

router.get('/me/activity', requireAuth, async (req, res) => {
  const db = await getDb();
  const user = req.user;
  const uid = Number(user.id);
  const since = new Date(Date.now() - 366 * 86400000).toISOString();

  const [uploads, submissions, announcements, classwork, grades] = await Promise.all([
    db.query(
      `SELECT ${IST_DAY_SQL('uploaded_at')} AS day, COUNT(*)::int AS n
       FROM papers WHERE uploaded_by = $1 AND uploaded_at >= $2 GROUP BY 1`,
      [uid, since]
    ),
    db.query(
      `SELECT ${IST_DAY_SQL('submitted_at')} AS day, COUNT(*)::int AS n
       FROM assignment_submissions WHERE student_id = $1 AND submitted_at >= $2 GROUP BY 1`,
      [uid, since]
    ),
    db.query(
      `SELECT ${IST_DAY_SQL('created_at')} AS day, COUNT(*)::int AS n
       FROM classroom_announcements WHERE author_id = $1 AND created_at >= $2 GROUP BY 1`,
      [uid, since]
    ),
    db.query(
      `SELECT ${IST_DAY_SQL('created_at')} AS day, COUNT(*)::int AS n
       FROM classroom_assignments WHERE created_by = $1 AND created_at >= $2 GROUP BY 1`,
      [uid, since]
    ),
    db.query(
      `SELECT ${IST_DAY_SQL('created_at')} AS day, COUNT(*)::int AS n
       FROM audit_logs WHERE actor_id = $1 AND action = 'GRADE_SUBMISSION' AND created_at >= $2 GROUP BY 1`,
      [uid, since]
    ),
  ]);

  const dayMap = new Map();
  const totals = { uploads: 0, submissions: 0, announcements: 0, classwork: 0, grades: 0 };
  const addRows = (rows, key) => {
    for (const r of rows) {
      if (!r.day) continue;
      const n = Number(r.n || 0);
      if (!dayMap.has(r.day)) dayMap.set(r.day, { day: r.day, value: 0 });
      const entry = dayMap.get(r.day);
      entry.value += n;
      entry[key] = (entry[key] || 0) + n;
      totals[key] += n;
    }
  };
  addRows(uploads.rows, 'uploads');
  addRows(submissions.rows, 'submissions');
  addRows(announcements.rows, 'announcements');
  addRows(classwork.rows, 'classwork');
  addRows(grades.rows, 'grades');

  // Student coverage summary (own data only)
  const [paperStatus, enrolled, asgnTotals] = await Promise.all([
    db.query(
      `SELECT UPPER(status) AS status, COUNT(*)::int AS n FROM papers WHERE uploaded_by = $1 GROUP BY 1`,
      [uid]
    ),
    db.query(
      `SELECT COUNT(DISTINCT offering_id)::int AS n FROM course_enrollments
       WHERE student_id = $1 OR LOWER(student_email) = LOWER($2)`,
      [uid, user.email]
    ),
    db.query(
      `SELECT COUNT(DISTINCT ca.id)::int AS total,
              COUNT(DISTINCT s.assignment_id)::int AS submitted
       FROM classroom_assignments ca
       JOIN course_enrollments ce ON ce.offering_id = ca.offering_id
         AND (ce.student_id = $1 OR LOWER(ce.student_email) = LOWER($2))
       LEFT JOIN assignment_submissions s ON s.assignment_id = ca.id AND s.student_id = $1`,
      [uid, user.email]
    ),
  ]);
  const papersByStatus = {};
  for (const r of paperStatus.rows) papersByStatus[r.status] = Number(r.n || 0);

  // Faculty course load (offerings the user teaches)
  const teachingRes = await db.query(
    `SELECT co.id, co.course_code, co.course_name,
            (SELECT COUNT(*)::int FROM course_enrollments ce WHERE ce.offering_id = co.id) AS students,
            (SELECT COUNT(*)::int FROM classroom_assignments ca WHERE ca.offering_id = co.id) AS assignments,
            (SELECT COUNT(*)::int FROM assignment_submissions s
               JOIN classroom_assignments ca ON ca.id = s.assignment_id
              WHERE ca.offering_id = co.id AND s.marks_obtained IS NULL) AS pending_grading
     FROM course_offerings co
     JOIN course_instructors ci ON ci.offering_id = co.id AND ci.professor_id = $1
     ORDER BY co.course_code ASC`,
    [uid]
  );

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    from: since.slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    days: Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day)),
    totals,
    summary: {
      papers_uploaded: Object.values(papersByStatus).reduce((s, v) => s + v, 0),
      papers_approved: papersByStatus.APPROVED || 0,
      papers_pending: papersByStatus.PENDING || 0,
      enrolled_courses: Number(enrolled.rows[0]?.n || 0),
      assignments_total: Number(asgnTotals.rows[0]?.total || 0),
      assignments_submitted: Number(asgnTotals.rows[0]?.submitted || 0),
    },
    teaching: teachingRes.rows.map((r) => ({
      offering_id: Number(r.id),
      course_code: r.course_code,
      course_name: r.course_name,
      students: Number(r.students || 0),
      assignments: Number(r.assignments || 0),
      pending_grading: Number(r.pending_grading || 0),
    })),
  });
});

router.put('/profile', requireAuth, profileWriteLimiter, async (req, res) => {
  const user = req.user;
  const { roll_no, student_id, name, department, year, semester } = req.body;
  const db = await getDb();

  let semYearStr = year !== undefined ? String(year).trim() : user.year;
  if (semester !== undefined && semester !== null && String(semester).trim() !== '') {
    const semNum = parsePositiveInt(semester);
    if (!semNum || semNum < 1 || semNum > 10) {
      res.status(400).json({ detail: 'Semester must be a number between 1 and 10' });
      return;
    }
    semYearStr = `Semester ${semNum}`;
  }

  const isStaff = Boolean(user.is_admin || user.admin_role);
  const nextRoll = roll_no !== undefined ? String(roll_no).trim() : user.roll_no;
  const nextStudentId = student_id !== undefined ? String(student_id).trim() : user.student_id;
  const nextDept = department !== undefined ? String(department).trim() : user.department;
  const nextYear = semYearStr;

  const identityChanged =
    !isStaff &&
    ((roll_no !== undefined && nextRoll !== (user.roll_no ?? '')) ||
      (student_id !== undefined && nextStudentId !== (user.student_id ?? '')) ||
      (department !== undefined && nextDept !== (user.department ?? '')) ||
      ((year !== undefined || semester !== undefined) && nextYear !== (user.year ?? '')));

  const updated = await db.query(
    `UPDATE users
     SET roll_no = COALESCE($1, roll_no),
         student_id = COALESCE($2, student_id),
         name = COALESCE($3, name),
         department = COALESCE($4, department),
         year = COALESCE($5, year),
         id_verified = CASE WHEN $6 THEN FALSE ELSE id_verified END,
         verified_by = CASE WHEN $6 THEN NULL ELSE verified_by END,
         verified_at = CASE WHEN $6 THEN NULL ELSE verified_at END,
         updated_at = NOW()
     WHERE id = $7
     RETURNING ${USER_COLS}`,
    [
      roll_no !== undefined ? nextRoll : null,
      student_id !== undefined ? nextStudentId : null,
      name !== undefined ? String(name).trim() || user.name : null,
      department !== undefined ? nextDept : null,
      year !== undefined || semester !== undefined ? nextYear : null,
      identityChanged,
      user.id,
    ]
  );
  invalidateCachePrefix('auth:');
  invalidateCachePrefix('admin:');
  const taOfferingIds = await getTaOfferingIds(db, updated.rows[0]);
  res.json(formatUserResponse(updated.rows[0], taOfferingIds));
});

router.post('/change-password', requireAuth, profileWriteLimiter, async (req, res) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');
  if (!currentPassword || newPassword.length < 8) {
    res.status(400).json({ detail: 'Current password and new password (min 8 chars) are required' });
    return;
  }
  const db = await getDb();
  const uRes = await db.query(
    `SELECT ${USER_AUTH_COLS} FROM users WHERE id = $1 LIMIT 1`,
    [req.user.id]
  );
  const u = uRes.rowCount > 0 ? uRes.rows[0] : null;
  if (!u || !(await verifyPasswordNonBlocking(currentPassword, u.password_hash))) {
    res.status(400).json({ detail: 'Current password is incorrect' });
    return;
  }
  const nextHash = await hashPasswordNonBlocking(newPassword, 10);
  const updated = await db.query(
    'UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2 RETURNING token_version',
    [nextHash, req.user.id]
  );
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'CHANGE_PASSWORD',
    entityType: 'USER',
    entityId: req.user.id,
  });
  invalidateCachePrefix('auth:');
  const freshToken = signUserToken({
    ...u,
    token_version: Number(updated.rows[0]?.token_version ?? Number(u.token_version || 0) + 1),
  });
  res.json({ message: 'Password changed successfully', access_token: freshToken });
});

router.post('/logout', async (_req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ message: 'Signed out successfully' });
});

router.post('/profile/id-card', requireAuth, uploadLimiter, userUpload.single('file'), async (req, res) => {
  const user = req.user;
  const file = req.file;
  if (!file) {
    res.status(400).json({ detail: 'ID card file is required' });
    return;
  }
  if (!(await validateUploadedFileMagic(file.path, ['png', 'jpeg', 'webp', 'pdf']))) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ detail: 'Uploaded file header does not match a valid image or PDF document' });
    return;
  }
  const db = await getDb();
  if (!idCardColsEnsured) {
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_data BYTEA, ADD COLUMN IF NOT EXISTS id_card_mime TEXT`);
    idCardColsEnsured = true;
  }
  const fileBuffer = await fs.promises.readFile(file.path);
  const updated = await db.query(
    `UPDATE users SET id_card_path = $1, id_card_data = $2, id_card_mime = $3, id_verified = FALSE, verified_by = NULL, verified_at = NULL WHERE id = $4 RETURNING ${USER_COLS}`,
    [file.filename, fileBuffer, file.mimetype || 'application/octet-stream', user.id]
  );
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('auth:');
  const taOfferingIds = await getTaOfferingIds(db, updated.rows[0]);
  res.json(formatUserResponse(updated.rows[0], taOfferingIds));
});

export default router;
