import { getDb, withTransaction } from '../config/db.js';
import { invalidateCachePrefix } from '../config/cache.js';
import { parsePositiveInt } from '../config/env.js';
import {
  requireAuth,
  requireProfessorOrAdmin,
} from '../middleware/auth.js';
import { joinCodeLimiter } from '../middleware/rateLimiters.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { generateUniqueJoinCode } from '../utils/joinCode.js';
import {
  validateHttpsUrl,
  validateUrlLinkList,
  csvCell,
  safeContentDispositionFilename,
  parseCsvRfc4180,
  writeAuditLog,
} from '../utils/security.js';

const router = createAsyncRouter();

function extractGoogleDriveFileId(url) {
  const str = String(url || '').trim();
  const matchD = str.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (matchD) return matchD[1];
  const matchFolders = str.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (matchFolders) return matchFolders[1];
  const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (matchId) return matchId[1];
  return null;
}

async function autoEnrollBatchStudents(db, offeringId, programme, semester) {
  // Batch auto-enrollment sets attendance_pct to NULL until explicitly synced from TCS iON
  const res = await db.query(
    `INSERT INTO course_enrollments (offering_id, student_id, roll_no, student_name, student_email, section, enroll_source, attendance_pct)
     SELECT $1, u.id, u.roll_no, u.name, u.email, 'Sec A', 'AUTO_BATCH', NULL
     FROM users u
     WHERE u.admin_role IS NULL
       AND UPPER(COALESCE(u.department, 'B.TECH')) = UPPER($2)
       AND ($3 = 'ALL' OR COALESCE(u.year, '') = $3)
     ON CONFLICT (offering_id, student_email) DO UPDATE SET
       student_id = COALESCE(course_enrollments.student_id, EXCLUDED.student_id),
       roll_no = COALESCE(course_enrollments.roll_no, EXCLUDED.roll_no)
     RETURNING id`,
    [offeringId, programme || 'B.TECH', String(semester || 'ALL')]
  );
  return res.rowCount;
}

async function isStudentEnrolled(db, offeringId, user) {
  if (!user) return false;
  const res = await db.query(
    `SELECT id FROM course_enrollments
     WHERE offering_id = $1 AND (student_id = $2 OR LOWER(student_email) = LOWER($3))
     LIMIT 1`,
    [offeringId, user.id, user.email]
  );
  return res.rowCount > 0;
}

async function getCourseStaffPermissions(db, offeringId, user) {
  if (!user) {
    return {
      is_admin: false,
      is_instructor: false,
      is_ta: false,
      can_manage_course: false,
      can_announce: false,
      can_grade: false,
    };
  }
  if (user.is_admin || user.admin_role === 'full_admin') {
    return {
      is_admin: true,
      is_instructor: true,
      is_ta: false,
      can_manage_course: true,
      can_announce: true,
      can_grade: true,
    };
  }
  const instRes = await db.query(
    'SELECT id, role_label FROM course_instructors WHERE offering_id = $1 AND professor_id = $2 LIMIT 1',
    [offeringId, user.id]
  );
  if (instRes.rowCount > 0) {
    return {
      is_admin: false,
      is_instructor: true,
      is_ta: false,
      can_manage_course: true,
      can_announce: true,
      can_grade: true,
    };
  }
  const isVerifiedAccount = Boolean(user.email_verified && user.id_verified);
  const taRes = isVerifiedAccount
    ? await db.query(
        'SELECT id, can_grade, can_announce FROM course_tas WHERE offering_id = $1 AND (user_id = $2 OR LOWER(public_email) = LOWER($3)) LIMIT 1',
        [offeringId, user.id, user.email]
      )
    : await db.query(
        'SELECT id, can_grade, can_announce FROM course_tas WHERE offering_id = $1 AND user_id = $2 LIMIT 1',
        [offeringId, user.id]
      );
  if (taRes.rowCount > 0) {
    const ta = taRes.rows[0];
    return {
      is_admin: false,
      is_instructor: false,
      is_ta: true,
      can_manage_course: false,
      can_announce: Boolean(ta.can_announce),
      can_grade: Boolean(ta.can_grade),
    };
  }
  return {
    is_admin: false,
    is_instructor: false,
    is_ta: false,
    can_manage_course: false,
    can_announce: false,
    can_grade: false,
  };
}

/**
 * GET /classroom/offerings
 * Strictly authenticated & SQL-filtered per user with pagination: returns ONLY classrooms the user
 * is enrolled in, assigned as TA for, or teaching (full_admin sees all). Strips join_code from non-instructors.
 */
router.get('/classroom/offerings', requireAuth, async (req, res) => {
  const db = await getDb();
  const user = req.user;
  const isFullAdmin = Boolean(user.is_admin || user.admin_role === 'full_admin');
  const isVerifiedAccount = Boolean(user.email_verified && user.id_verified);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;

  let offRes;
  let totalCount = 0;

  if (isFullAdmin) {
    const [cnt, rows] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS total FROM course_offerings'),
      db.query(
        `SELECT
           co.*,
           (SELECT COUNT(*)::int FROM course_enrollments ce WHERE ce.offering_id = co.id) AS enrolled_count,
           (SELECT COUNT(*)::int FROM classroom_announcements ca WHERE ca.offering_id = co.id) AS announcement_count,
           (SELECT COUNT(*)::int FROM classroom_assignments cas WHERE cas.offering_id = co.id) AS assignment_count
         FROM course_offerings co
         ORDER BY co.programme ASC, co.semester ASC, co.course_code ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);
    totalCount = Number(cnt.rows[0]?.total || 0);
    offRes = rows;
  } else {
    const accessPredicate = `
      EXISTS (SELECT 1 FROM course_instructors ci WHERE ci.offering_id = co.id AND ci.professor_id = $1)
      OR EXISTS (
        SELECT 1 FROM course_tas ct
        WHERE ct.offering_id = co.id
          AND (ct.user_id = $1 OR ($3::boolean = TRUE AND LOWER(ct.public_email) = LOWER($2)))
      )
      OR EXISTS (
        SELECT 1 FROM course_enrollments ce
        WHERE ce.offering_id = co.id
          AND (ce.student_id = $1 OR LOWER(ce.student_email) = LOWER($2))
      )
    `;
    const [cnt, rows] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS total FROM course_offerings co WHERE ${accessPredicate}`,
        [user.id, user.email, isVerifiedAccount]
      ),
      db.query(
        `SELECT
           co.*,
           (SELECT COUNT(*)::int FROM course_enrollments ce WHERE ce.offering_id = co.id) AS enrolled_count,
           (SELECT COUNT(*)::int FROM classroom_announcements ca WHERE ca.offering_id = co.id) AS announcement_count,
           (SELECT COUNT(*)::int FROM classroom_assignments cas WHERE cas.offering_id = co.id) AS assignment_count
         FROM course_offerings co
         WHERE ${accessPredicate}
         ORDER BY co.programme ASC, co.semester ASC, co.course_code ASC
         LIMIT $4 OFFSET $5`,
        [user.id, user.email, isVerifiedAccount, limit, offset]
      ),
    ]);
    totalCount = Number(cnt.rows[0]?.total || 0);
    offRes = rows;
  }

  const offeringIds = offRes.rows.map((o) => Number(o.id));
  if (offeringIds.length === 0) {
    res.json({ total: totalCount, page, limit, items: [] });
    return;
  }

  const [instRes, taRes, enrRes] = await Promise.all([
    db.query(
      `SELECT
         ci.offering_id,
         ci.professor_id,
         ci.role_label,
         u.name,
         pp.designation,
         pp.school,
         pp.public_email,
         pp.public_phone,
         pp.cabin_number,
         pp.office_hours
       FROM course_instructors ci
       JOIN users u ON u.id = ci.professor_id
       LEFT JOIN professor_profiles pp ON pp.user_id = u.id
       WHERE ci.offering_id = ANY($1::int[])
       ORDER BY ci.id ASC`,
      [offeringIds]
    ),
    db.query(
      `SELECT
         id,
         offering_id,
         user_id,
         public_name,
         public_email,
         public_phone,
         public_batch,
         lab_hours
       FROM course_tas
       WHERE offering_id = ANY($1::int[])
       ORDER BY id ASC`,
      [offeringIds]
    ),
    db.query(
      `SELECT offering_id FROM course_enrollments
       WHERE offering_id = ANY($1::int[])
         AND (student_id = $2 OR LOWER(student_email) = LOWER($3))`,
      [offeringIds, user.id, user.email]
    ),
  ]);

  const myEnrolledSet = new Set(enrRes.rows.map((r) => Number(r.offering_id)));

  const instByOff = new Map();
  for (const r of instRes.rows) {
    const oid = Number(r.offering_id);
    if (!instByOff.has(oid)) instByOff.set(oid, []);
    instByOff.get(oid).push({
      professor_id: Number(r.professor_id),
      name: r.name,
      role_label: r.role_label,
      designation: r.designation || 'Professor',
      school: r.school || 'IET',
      public_email: r.public_email,
      public_phone: r.public_phone || null,
      cabin_number: r.cabin_number || null,
      office_hours: r.office_hours || null,
    });
  }

  const taByOff = new Map();
  for (const r of taRes.rows) {
    const oid = Number(r.offering_id);
    if (!taByOff.has(oid)) taByOff.set(oid, []);
    taByOff.get(oid).push({
      id: Number(r.id),
      user_id: r.user_id ? Number(r.user_id) : null,
      public_name: r.public_name,
      public_email: r.public_email,
      public_phone: r.public_phone || null,
      public_batch: r.public_batch || null,
      lab_hours: r.lab_hours || null,
    });
  }

  const items = offRes.rows.map((o) => {
    const oid = Number(o.id);
    const instructors = instByOff.get(oid) || [];
    const tas = taByOff.get(oid) || [];
    const isInstructor = Boolean(
      isFullAdmin || instructors.some((i) => i.professor_id === Number(user.id))
    );
    const isTa = Boolean(
      tas.some(
        (t) =>
          (t.user_id && t.user_id === Number(user.id)) ||
          (isVerifiedAccount && String(t.public_email).toLowerCase() === String(user.email).toLowerCase())
      )
    );
    const isEnrolled = myEnrolledSet.has(oid);
    const { join_code, ...safeOffering } = o;
    return {
      ...safeOffering,
      ...(isInstructor || isFullAdmin ? { join_code } : {}),
      id: oid,
      instructors,
      tas,
      is_enrolled: isEnrolled || isInstructor || isTa,
      is_instructor: isInstructor,
      is_ta: isTa,
    };
  });

  res.json({
    total: totalCount,
    page,
    limit,
    items,
  });
});

/**
 * GET /classroom/offerings/:id
 * Full Google Classroom workspace: strictly restricted to enrolled students, assigned TAs,
 * course professors, or full_admin. Strips join_code from non-instructors.
 */
router.get('/classroom/offerings/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const user = req.user;

  const offRes = await db.query('SELECT * FROM course_offerings WHERE id = $1 LIMIT 1', [offeringId]);
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }
  const rawOffering = offRes.rows[0];
  const perms = await getCourseStaffPermissions(db, offeringId, user);
  const enrolled = await isStudentEnrolled(db, offeringId, user);

  if (!perms.is_admin && !perms.is_instructor && !perms.is_ta && !enrolled) {
    res.status(403).json({
      detail: 'Access denied: you are not enrolled in or assigned to this course classroom.',
    });
    return;
  }

  const { join_code, ...safeOfferingFields } = rawOffering;
  const offering = perms.can_manage_course ? rawOffering : safeOfferingFields;

  const [instRes, taRes, annRes, asgnRes, enrRes] = await Promise.all([
    db.query(
      `SELECT
         ci.professor_id,
         ci.role_label,
         u.name,
         pp.designation,
         pp.school,
         pp.public_email,
         pp.public_phone,
         pp.cabin_number,
         pp.office_hours,
         pp.specialization
       FROM course_instructors ci
       JOIN users u ON u.id = ci.professor_id
       LEFT JOIN professor_profiles pp ON pp.user_id = u.id
       WHERE ci.offering_id = $1
       ORDER BY ci.id ASC`,
      [offeringId]
    ),
    db.query(
      `SELECT
         id,
         offering_id,
         public_name,
         public_email,
         public_phone,
         public_batch,
         lab_hours,
         can_grade,
         can_announce
       FROM course_tas
       WHERE offering_id = $1
       ORDER BY id ASC`,
      [offeringId]
    ),
    db.query(
      `SELECT * FROM classroom_announcements
       WHERE offering_id = $1
       ORDER BY is_pinned DESC, created_at DESC`,
      [offeringId]
    ),
    db.query(
      `SELECT * FROM classroom_assignments
       WHERE offering_id = $1
       ORDER BY created_at DESC`,
      [offeringId]
    ),
    db.query(
      `SELECT
         id,
         student_id,
         roll_no,
         student_name,
         student_email,
         section,
         enroll_source,
         attendance_pct,
         tcs_ion_credits,
         created_at
       FROM course_enrollments
       WHERE offering_id = $1
       ORDER BY roll_no ASC NULLS LAST, student_name ASC`,
      [offeringId]
    ),
  ]);

  const annIds = annRes.rows.map((a) => Number(a.id));
  const commentsByAnn = new Map();
  if (annIds.length > 0) {
    const cRes = await db.query(
      `SELECT * FROM classroom_comments
       WHERE announcement_id = ANY($1::int[])
       ORDER BY is_verified_ans DESC, created_at ASC`,
      [annIds]
    );
    for (const c of cRes.rows) {
      const aid = Number(c.announcement_id);
      if (!commentsByAnn.has(aid)) commentsByAnn.set(aid, []);
      commentsByAnn.get(aid).push(c);
    }
  }

  // Staff sees all submissions for grading; enrolled student sees ONLY their own submission
  const asgnIds = asgnRes.rows.map((a) => Number(a.id));
  const subsByAsgn = new Map();
  if (asgnIds.length > 0) {
    let subRes;
    if (perms.can_grade) {
      subRes = await db.query(
        `SELECT * FROM assignment_submissions
         WHERE assignment_id = ANY($1::int[])
         ORDER BY submitted_at DESC`,
        [asgnIds]
      );
    } else {
      subRes = await db.query(
        `SELECT * FROM assignment_submissions
         WHERE assignment_id = ANY($1::int[]) AND student_id = $2`,
        [asgnIds, user.id]
      );
    }
    for (const s of subRes.rows) {
      const aid = Number(s.assignment_id);
      if (!subsByAsgn.has(aid)) subsByAsgn.set(aid, []);
      subsByAsgn.get(aid).push(s);
    }
  }

  const myEnrollment = enrRes.rows.find(
    (e) =>
      (e.student_id && Number(e.student_id) === Number(user.id)) ||
      String(e.student_email).toLowerCase() === String(user.email).toLowerCase()
  );

  const autoShareEmails = Array.from(
    new Set([
      ...instRes.rows.map((i) => i.public_email).filter(Boolean),
      ...taRes.rows.map((t) => t.public_email).filter(Boolean),
    ])
  );

  res.json({
    offering,
    instructors: instRes.rows,
    tas: taRes.rows,
    auto_share_emails: autoShareEmails,
    permissions: {
      ...perms,
      is_enrolled: Boolean(myEnrollment || perms.is_instructor || perms.is_ta || perms.is_admin),
      my_attendance_pct:
        myEnrollment?.attendance_pct !== null && myEnrollment?.attendance_pct !== undefined
          ? Number(myEnrollment.attendance_pct)
          : null,
      my_enroll_source: myEnrollment?.enroll_source || null,
    },
    announcements: annRes.rows.map((a) => ({
      ...a,
      attachment_urls: Array.isArray(a.attachment_urls)
        ? a.attachment_urls
        : typeof a.attachment_urls === 'string'
          ? JSON.parse(a.attachment_urls || '[]')
          : [],
      comments: commentsByAnn.get(Number(a.id)) || [],
    })),
    assignments: asgnRes.rows.map((a) => {
      const subs = subsByAsgn.get(Number(a.id)) || [];
      return {
        ...a,
        resource_links: Array.isArray(a.resource_links)
          ? a.resource_links
          : typeof a.resource_links === 'string'
            ? JSON.parse(a.resource_links || '[]')
            : [],
        my_submission: subs.find((s) => Number(s.student_id) === Number(user.id)) || null,
        submissions: perms.can_grade ? subs : [],
        submission_count: perms.can_grade ? subs.length : undefined,
      };
    }),
    roster: perms.can_grade
      ? enrRes.rows
      : enrRes.rows.map((e) => ({
          id: e.id,
          roll_no: e.roll_no,
          student_name: e.student_name,
          section: e.section,
          enroll_source: e.enroll_source,
        })),
    roster_count: enrRes.rowCount,
  });
});

/**
 * Pure bucketing helpers for staff analytics (exported for verification script).
 */
export const GRADE_BUCKETS = [
  { label: '0–39', min: 0, max: 40 },
  { label: '40–49', min: 40, max: 50 },
  { label: '50–59', min: 50, max: 60 },
  { label: '60–69', min: 60, max: 70 },
  { label: '70–79', min: 70, max: 80 },
  { label: '80–89', min: 80, max: 90 },
  { label: '90–100', min: 90, max: Infinity },
];
export const ATTENDANCE_BUCKETS = [
  { label: '<50', min: 0, max: 50 },
  { label: '50–64', min: 50, max: 65 },
  { label: '65–74', min: 65, max: 75 },
  { label: '75–84', min: 75, max: 85 },
  { label: '85–94', min: 85, max: 95 },
  { label: '95–100', min: 95, max: Infinity },
];

export function bucketValues(values, buckets) {
  const out = buckets.map((b) => ({ label: b.label, min: b.min, count: 0 }));
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
    const num = Math.max(0, Number(v));
    const idx = buckets.findIndex((b) => num >= b.min && num < b.max);
    if (idx >= 0) out[idx].count += 1;
  }
  return out;
}

/**
 * GET /classroom/offerings/:id/analytics
 * Staff only (instructor / grading TA / admin): aggregate submission, grade and attendance stats.
 */
router.get('/classroom/offerings/:id/analytics', requireAuth, async (req, res) => {
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const db = await getDb();
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course staff can view classroom analytics.' });
    return;
  }
  const offRes = await db.query('SELECT id FROM course_offerings WHERE id = $1 LIMIT 1', [offeringId]);
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }

  const [rosterRes, asgnRes, gradeRes] = await Promise.all([
    db.query('SELECT attendance_pct FROM course_enrollments WHERE offering_id = $1', [offeringId]),
    db.query(
      `SELECT ca.id, ca.title, ca.assignment_type, ca.due_at, ca.max_marks,
              COUNT(s.id)::int AS submitted,
              COUNT(s.marks_obtained)::int AS graded,
              COALESCE(SUM(CASE WHEN s.is_late THEN 1 ELSE 0 END), 0)::int AS late
       FROM classroom_assignments ca
       LEFT JOIN assignment_submissions s ON s.assignment_id = ca.id
       WHERE ca.offering_id = $1
       GROUP BY ca.id, ca.title, ca.assignment_type, ca.due_at, ca.max_marks
       ORDER BY ca.due_at ASC NULLS LAST, ca.id ASC`,
      [offeringId]
    ),
    db.query(
      `SELECT s.marks_obtained, ca.max_marks
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       WHERE ca.offering_id = $1 AND s.marks_obtained IS NOT NULL`,
      [offeringId]
    ),
  ]);

  const rosterSize = rosterRes.rowCount;
  const attendanceValues = rosterRes.rows
    .map((r) => r.attendance_pct)
    .filter((v) => v !== null && v !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  const gradePcts = gradeRes.rows
    .map((r) => {
      const max = Number(r.max_marks || 100);
      if (!Number.isFinite(max) || max <= 0) return null;
      return (Number(r.marks_obtained) / max) * 100;
    })
    .filter((v) => v !== null && Number.isFinite(v));

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    offering_id: offeringId,
    roster_size: rosterSize,
    assignments: asgnRes.rows.map((a) => ({
      id: Number(a.id),
      title: a.title,
      assignment_type: a.assignment_type,
      due_at: a.due_at,
      max_marks: a.max_marks !== null ? Number(a.max_marks) : null,
      submitted: Number(a.submitted || 0),
      graded: Number(a.graded || 0),
      late: Number(a.late || 0),
      rate: rosterSize > 0 ? Math.min(1, Number(a.submitted || 0) / rosterSize) : null,
    })),
    grades: {
      graded_count: gradePcts.length,
      average_pct: gradePcts.length
        ? Number((gradePcts.reduce((s, v) => s + v, 0) / gradePcts.length).toFixed(1))
        : null,
      buckets: bucketValues(gradePcts, GRADE_BUCKETS),
    },
    attendance: {
      synced_count: attendanceValues.length,
      not_synced_count: rosterSize - attendanceValues.length,
      below_75_count: attendanceValues.filter((v) => v < 75).length,
      average_pct: attendanceValues.length
        ? Number((attendanceValues.reduce((s, v) => s + v, 0) / attendanceValues.length).toFixed(1))
        : null,
      buckets: bucketValues(attendanceValues, ATTENDANCE_BUCKETS),
    },
  });
});

/**
 * POST /classroom/offerings
 * Professor creates or releases a new Course Offering (supports M:N co-professors & public TAs)
 */
router.post('/classroom/offerings', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const {
    course_code,
    course_name,
    academic_session,
    programme,
    batch_year,
    semester,
    section,
    tcs_ion_course_id,
    syllabus_drive_url,
    description,
    is_released,
    co_professor_emails,
    tas,
  } = req.body;

  if (!course_code || !course_name) {
    res.status(400).json({ detail: 'course_code and course_name are required' });
    return;
  }

  const syllabusCheck = validateHttpsUrl(syllabus_drive_url, {
    required: false,
    label: 'Syllabus Drive URL',
  });
  if (!syllabusCheck.ok) {
    res.status(400).json({ detail: syllabusCheck.error });
    return;
  }

  const code = String(course_code).trim().toUpperCase();
  const prog = String(programme || 'B.TECH').trim().toUpperCase();
  const sem = String(semester || '3').trim();
  const joinCode = await generateUniqueJoinCode(db);

  const { offering, autoEnrolledCount } = await withTransaction(db, async (tx) => {
    const cRes = await tx.query(
      `INSERT INTO courses (code, name, department, semester, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id`,
      [code, String(course_name).trim(), prog, sem, description || `${prog} Course`]
    );
    const courseId = Number(cRes.rows[0].id);

    const offRes = await tx.query(
      `INSERT INTO course_offerings (
         course_id, course_code, course_name, academic_session,
         programme, batch_year, semester, section, join_code,
         auto_enroll, is_released, tcs_ion_course_id, syllabus_drive_url, description
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12, $13)
       RETURNING *`,
      [
        courseId,
        code,
        String(course_name).trim(),
        academic_session || 'Monsoon 2026',
        prog,
        batch_year || '2024-2028',
        sem,
        section || 'ALL',
        joinCode,
        Boolean(is_released !== false),
        tcs_ion_course_id || `TCS-ION-${code}`,
        syllabusCheck.value,
        description || null,
      ]
    );
    const createdOffering = offRes.rows[0];
    const offeringId = Number(createdOffering.id);

    await tx.query(
      `INSERT INTO course_instructors (offering_id, professor_id, role_label)
       VALUES ($1, $2, 'Course Coordinator')
       ON CONFLICT (offering_id, professor_id) DO NOTHING`,
      [offeringId, req.user.id]
    );

    const coEmails = Array.isArray(co_professor_emails)
      ? co_professor_emails
      : String(co_professor_emails || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

    for (const email of coEmails) {
      const pUser = await tx.query(
        `SELECT id FROM users
         WHERE LOWER(email) = $1
           AND (admin_role = 'professor' OR is_admin = TRUE OR admin_role = 'full_admin')
         LIMIT 1`,
        [email]
      );
      if (pUser.rowCount > 0) {
        await tx.query(
          `INSERT INTO course_instructors (offering_id, professor_id, role_label)
           VALUES ($1, $2, 'Co-Instructor')
           ON CONFLICT (offering_id, professor_id) DO NOTHING`,
          [offeringId, pUser.rows[0].id]
        );
      }
    }

    if (Array.isArray(tas)) {
      for (const ta of tas) {
        if (!ta.public_email || !ta.public_name) continue;
        const cleanEmail = String(ta.public_email).toLowerCase().trim();
        const uLookup = await tx.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [
          cleanEmail,
        ]);
        await tx.query(
          `INSERT INTO course_tas (offering_id, user_id, public_name, public_email, public_phone, public_batch, lab_hours, can_grade, can_announce)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
           ON CONFLICT (offering_id, public_email) DO UPDATE SET
             user_id = COALESCE(course_tas.user_id, EXCLUDED.user_id),
             public_name = EXCLUDED.public_name,
             public_phone = EXCLUDED.public_phone,
             public_batch = EXCLUDED.public_batch,
             lab_hours = EXCLUDED.lab_hours`,
          [
            offeringId,
            uLookup.rows[0]?.id || null,
            ta.public_name,
            cleanEmail,
            ta.public_phone || null,
            ta.public_batch || null,
            ta.lab_hours || null,
          ]
        );
      }
    }

    let enrolledCount = 0;
    if (createdOffering.is_released) {
      enrolledCount = await autoEnrollBatchStudents(tx, offeringId, prog, sem);
    }
    return { offering: createdOffering, autoEnrolledCount: enrolledCount };
  });

  invalidateCachePrefix('faculty:');
  invalidateCachePrefix('metrics:');
  invalidateCachePrefix('courses:');
  res.status(201).json({
    message: `Course ${code} released! Auto-enrolled ${autoEnrolledCount} registered ${prog} (Sem ${sem}) students.`,
    offering,
    auto_enrolled_count: autoEnrolledCount,
  });
});

/**
 * POST /classroom/offerings/:id/release
 * Releases course & auto-enrolls matching students (scoped strictly to course instructors or admin)
 */
router.post('/classroom/offerings/:id/release', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors assigned to this course or Admin can release it.' });
    return;
  }

  const offRes = await db.query(
    'UPDATE course_offerings SET is_released = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *',
    [offeringId]
  );
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course offering not found' });
    return;
  }
  const off = offRes.rows[0];
  const count = await autoEnrollBatchStudents(db, offeringId, off.programme, off.semester);
  await invalidateCachePrefix('faculty:');
  await invalidateCachePrefix('metrics:');
  res.json({
    message: `Course ${off.course_code} is now live! Automatically enrolled ${count} registered students.`,
    auto_enrolled_count: count,
    offering: off,
  });
});

/**
 * POST /classroom/offerings/:id/regenerate-join-code
 * Generates a fresh random join code for a course (instructors or full_admin only)
 */
router.post(
  '/classroom/offerings/:id/regenerate-join-code',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    if (!offeringId) {
      res.status(400).json({ detail: 'Invalid offering ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      res
        .status(403)
        .json({ detail: 'Only instructors assigned to this course or Admin can regenerate join codes.' });
      return;
    }

    const currentRes = await db.query(
      'SELECT id, course_code, join_code FROM course_offerings WHERE id = $1 LIMIT 1',
      [offeringId]
    );
    if (currentRes.rowCount === 0) {
      res.status(404).json({ detail: 'Course offering not found' });
      return;
    }

    const current = currentRes.rows[0];
    const newJoinCode = await generateUniqueJoinCode(db, { excludeCode: current.join_code });

    await db.query(
      'UPDATE course_offerings SET join_code = $1, updated_at = NOW() WHERE id = $2',
      [newJoinCode, offeringId]
    );

    await invalidateCachePrefix('faculty:');
    res.json({
      message: 'Generated new random elective join code',
      offering_id: offeringId,
      course_code: current.course_code,
      join_code: newJoinCode,
    });
  }
);

/**
 * POST /classroom/offerings/:id/add-ta
 * Assigns a TA to THIS course (scoped strictly to course instructors or admin)
 */
router.post('/classroom/offerings/:id/add-ta', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors of this course or Admin can assign TAs.' });
    return;
  }

  const { public_name, public_email, public_phone, public_batch, lab_hours } = req.body;
  if (!public_name || !public_email) {
    res.status(400).json({ detail: 'TA public_name and public_email are required' });
    return;
  }

  const cleanEmail = String(public_email).toLowerCase().trim();
  const uLookup = await db.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);

  const ins = await db.query(
    `INSERT INTO course_tas (offering_id, user_id, public_name, public_email, public_phone, public_batch, lab_hours, can_grade, can_announce)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
     ON CONFLICT (offering_id, public_email) DO UPDATE SET
       user_id = COALESCE(course_tas.user_id, EXCLUDED.user_id),
       public_name = EXCLUDED.public_name,
       public_phone = EXCLUDED.public_phone,
       public_batch = EXCLUDED.public_batch,
       lab_hours = EXCLUDED.lab_hours
     RETURNING id, offering_id, public_name, public_email, public_phone, public_batch, lab_hours`,
    [
      offeringId,
      uLookup.rows[0]?.id || null,
      String(public_name).trim(),
      cleanEmail,
      public_phone || null,
      public_batch || null,
      lab_hours || null,
    ]
  );

  await invalidateCachePrefix('faculty:');
  res.status(201).json({
    message: `TA ${public_name} added to course with public contact card.`,
    ta: ins.rows[0],
  });
});

/**
 * POST /classroom/offerings/:id/add-instructor
 * Assigns an additional Co-Professor to THIS course (scoped strictly to course instructors or admin)
 */
router.post('/classroom/offerings/:id/add-instructor', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors of this course or Admin can add co-professors.' });
    return;
  }

  const { email, role_label } = req.body;
  if (!email) {
    res.status(400).json({ detail: 'Co-professor email is required' });
    return;
  }

  const pUser = await db.query(
    `SELECT id, name, email, is_admin, admin_role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [String(email).trim()]
  );
  if (pUser.rowCount === 0) {
    res.status(404).json({ detail: `No faculty user found with email ${email}` });
    return;
  }
  const targetUser = pUser.rows[0];
  if (
    targetUser.admin_role !== 'professor' &&
    !targetUser.is_admin &&
    targetUser.admin_role !== 'full_admin'
  ) {
    res.status(400).json({
      detail: 'Only accounts with the professor (or full admin) role can be assigned as co-instructors.',
    });
    return;
  }

  await db.query(
    `INSERT INTO course_instructors (offering_id, professor_id, role_label)
     VALUES ($1, $2, $3)
     ON CONFLICT (offering_id, professor_id) DO UPDATE SET role_label = EXCLUDED.role_label`,
    [offeringId, targetUser.id, role_label || 'Co-Instructor']
  );

  invalidateCachePrefix('faculty:');
  res.json({
    message: `Added ${targetUser.name} as ${role_label || 'Co-Instructor'}`,
  });
});

/**
 * POST /classroom/offerings/join-code
 * Student joins an elective course via private 7-character class code (attendance NULL until synced)
 */
router.post('/classroom/offerings/join-code', requireAuth, joinCodeLimiter, async (req, res) => {
  const db = await getDb();
  const code = String(req.body.join_code || '').trim().toUpperCase();
  if (!code) {
    res.status(400).json({ detail: 'Class join code is required' });
    return;
  }

  const offRes = await db.query(
    'SELECT * FROM course_offerings WHERE UPPER(join_code) = $1 AND is_released = TRUE LIMIT 1',
    [code]
  );
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Invalid or unreleased class join code' });
    return;
  }
  const offering = offRes.rows[0];

  await db.query(
    `INSERT INTO course_enrollments (offering_id, student_id, roll_no, student_name, student_email, section, enroll_source, attendance_pct)
     VALUES ($1, $2, $3, $4, $5, 'Elective', 'JOIN_CODE', NULL)
     ON CONFLICT (offering_id, student_email) DO UPDATE SET student_id = EXCLUDED.student_id`,
    [offering.id, req.user.id, req.user.roll_no || null, req.user.name, req.user.email]
  );

  res.json({
    message: `Enrolled in ${offering.course_code} — ${offering.course_name}`,
    offering_id: Number(offering.id),
  });
});

/**
 * POST /classroom/offerings/:id/announcements
 * Course Professor or assigned TA posts an announcement to THIS course stream
 */
router.post('/classroom/offerings/:id/announcements', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce) {
    res.status(403).json({
      detail: 'Only instructors or authorized TAs of this course can post announcements.',
    });
    return;
  }

  const { title, content, attachment_urls, is_pinned } = req.body;
  if (!content || !String(content).trim()) {
    res.status(400).json({ detail: 'Announcement content is required' });
    return;
  }

  const roleLabel = perms.is_ta ? 'Teaching Assistant' : 'Professor';
  const attachCheck = validateUrlLinkList(attachment_urls, 'Attachment URL');
  if (!attachCheck.ok) {
    res.status(400).json({ detail: attachCheck.error });
    return;
  }
  const attachments = attachCheck.value;

  const ins = await db.query(
    `INSERT INTO classroom_announcements (
       offering_id, author_id, author_name, author_role, title, content, attachment_urls, is_pinned, allow_comments
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, TRUE)
     RETURNING *`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      roleLabel,
      title ? String(title).trim() : null,
      String(content).trim(),
      JSON.stringify(attachments),
      Boolean(is_pinned),
    ]
  );

  res.status(201).json({
    message: 'Announcement posted to classroom stream',
    announcement: { ...ins.rows[0], comments: [] },
  });
});

/**
 * POST /classroom/announcements/:id/comments
 * Strictly restricted to students enrolled in THIS course or THIS course's faculty/TAs
 */
router.post('/classroom/announcements/:id/comments', requireAuth, async (req, res) => {
  const db = await getDb();
  const announcementId = parsePositiveInt(req.params.id);
  if (!announcementId) {
    res.status(400).json({ detail: 'Invalid announcement ID' });
    return;
  }
  const { content } = req.body;

  if (!content || !String(content).trim()) {
    res.status(400).json({ detail: 'Comment text is required' });
    return;
  }

  const annRes = await db.query('SELECT offering_id FROM classroom_announcements WHERE id = $1 LIMIT 1', [
    announcementId,
  ]);
  if (annRes.rowCount === 0) {
    res.status(404).json({ detail: 'Announcement not found' });
    return;
  }

  const offeringId = Number(annRes.rows[0].offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  const enrolled = await isStudentEnrolled(db, offeringId, req.user);
  if (!perms.is_admin && !perms.is_instructor && !perms.is_ta && !enrolled) {
    res.status(403).json({
      detail: 'Only enrolled students, assigned TAs, or course professors can comment.',
    });
    return;
  }

  const roleLabel = perms.is_instructor
    ? 'Professor'
    : perms.is_ta
      ? 'Teaching Assistant'
      : 'Student';

  const ins = await db.query(
    `INSERT INTO classroom_comments (announcement_id, author_id, author_name, author_role, content, is_verified_ans)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      announcementId,
      req.user.id,
      req.user.name,
      roleLabel,
      String(content).trim(),
      Boolean(perms.is_instructor || perms.is_ta),
    ]
  );

  res.status(201).json({
    comment: ins.rows[0],
  });
});

/**
 * PATCH /classroom/comments/:id/verify
 * Scoped strictly to THIS course's professors or TAs
 */
router.patch('/classroom/comments/:id/verify', requireAuth, async (req, res) => {
  const db = await getDb();
  const commentId = parsePositiveInt(req.params.id);
  if (!commentId) {
    res.status(400).json({ detail: 'Invalid comment ID' });
    return;
  }

  const lookup = await db.query(
    `SELECT ca.offering_id
     FROM classroom_comments cc
     JOIN classroom_announcements ca ON ca.id = cc.announcement_id
     WHERE cc.id = $1 LIMIT 1`,
    [commentId]
  );
  if (lookup.rowCount === 0) {
    res.status(404).json({ detail: 'Comment not found' });
    return;
  }
  const offeringId = Number(lookup.rows[0].offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce) {
    res.status(403).json({ detail: 'Only professors or TAs of this course can verify answers.' });
    return;
  }

  const upd = await db.query(
    `UPDATE classroom_comments
     SET is_verified_ans = NOT is_verified_ans
     WHERE id = $1
     RETURNING *`,
    [commentId]
  );
  res.json({ comment: upd.rows[0] });
});

/**
 * POST /classroom/offerings/:id/assignments
 * Creates an Assignment, Lab, Project, or TCS iON Proctored Quiz Launchpad for THIS course
 */
router.post('/classroom/offerings/:id/assignments', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Not authorized to create classwork for this course.' });
    return;
  }

  const {
    title,
    description,
    assignment_type,
    topic_module,
    resource_links,
    tcs_ion_launch_url,
    tcs_ion_exam_code,
    due_at,
    allow_late,
    max_marks,
  } = req.body;

  if (!title || !String(title).trim()) {
    res.status(400).json({ detail: 'Assignment/Quiz title is required' });
    return;
  }

  const resLinksCheck = validateUrlLinkList(resource_links, 'Resource link');
  if (!resLinksCheck.ok) {
    res.status(400).json({ detail: resLinksCheck.error });
    return;
  }
  const launchUrlCheck = validateHttpsUrl(tcs_ion_launch_url, {
    required: false,
    label: 'TCS iON launch URL',
  });
  if (!launchUrlCheck.ok) {
    res.status(400).json({ detail: launchUrlCheck.error });
    return;
  }

  let dueAtIso = new Date(Date.now() + 7 * 86400000).toISOString();
  if (due_at) {
    const parsedDue = new Date(due_at);
    if (Number.isNaN(parsedDue.getTime())) {
      res.status(400).json({ detail: 'Invalid due_at date format' });
      return;
    }
    dueAtIso = parsedDue.toISOString();
  }

  const ins = await db.query(
    `INSERT INTO classroom_assignments (
       offering_id, created_by, creator_name, title, description,
       assignment_type, topic_module, resource_links,
       tcs_ion_launch_url, tcs_ion_exam_code, due_at, allow_late, max_marks
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      String(title).trim(),
      description || null,
      String(assignment_type || 'ASSIGNMENT').toUpperCase(),
      topic_module || 'General Classwork',
      JSON.stringify(resLinksCheck.value),
      launchUrlCheck.value,
      tcs_ion_exam_code || null,
      dueAtIso,
      allow_late !== false,
      Number(max_marks || 100),
    ]
  );

  res.status(201).json({
    message:
      assignment_type === 'TCS_ION_QUIZ'
        ? 'TCS iON Quiz Launchpad published to classroom'
        : 'Assignment published to classroom',
    assignment: ins.rows[0],
  });
});

/**
 * POST /classroom/assignments/:id/submit
 * Enrolled students ONLY: saves external URL/Drive link + optional SHA-256 fingerprint (~250 bytes)
 */
router.post('/classroom/assignments/:id/submit', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const {
    submission_url,
    drive_file_id,
    file_name,
    upload_mode,
    submission_notes,
    shared_with_prof,
    file_sha256,
    drive_modified_time,
  } = req.body;

  const urlCheck = validateHttpsUrl(submission_url, {
    required: true,
    label: 'Submission link',
  });
  if (!urlCheck.ok) {
    res.status(400).json({
      detail: 'A valid https:// link (Google Drive, GitHub, Colab, Overleaf, or Figma) is required.',
    });
    return;
  }
  const cleanUrl = urlCheck.value;

  const asgnRes = await db.query('SELECT * FROM classroom_assignments WHERE id = $1 LIMIT 1', [
    assignmentId,
  ]);
  if (asgnRes.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = asgnRes.rows[0];

  const perms = await getCourseStaffPermissions(db, Number(asgn.offering_id), req.user);
  const enrolled = await isStudentEnrolled(db, Number(asgn.offering_id), req.user);
  if (!enrolled && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only students enrolled in this course can submit assignments.' });
    return;
  }

  const isLate = Boolean(asgn.due_at && new Date() > new Date(asgn.due_at));
  if (isLate && asgn.allow_late === false) {
    res.status(400).json({ detail: 'Submission deadline has passed and late submissions are disabled.' });
    return;
  }

  let driveModIso = null;
  if (drive_modified_time) {
    const parsedMod = new Date(drive_modified_time);
    if (Number.isNaN(parsedMod.getTime())) {
      res.status(400).json({ detail: 'Invalid drive_modified_time date format' });
      return;
    }
    driveModIso = parsedMod.toISOString();
  }

  const extractedDriveId = drive_file_id || extractGoogleDriveFileId(cleanUrl);

  const subRes = await db.query(
    `INSERT INTO assignment_submissions (
       assignment_id, student_id, student_name, student_email, student_roll_no,
       submission_url, drive_file_id, file_name, upload_mode,
       submission_notes, is_late, shared_with_prof, file_sha256, drive_modified_time,
       submitted_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET
       submission_url = EXCLUDED.submission_url,
       drive_file_id = EXCLUDED.drive_file_id,
       file_name = EXCLUDED.file_name,
       upload_mode = EXCLUDED.upload_mode,
       submission_notes = EXCLUDED.submission_notes,
       is_late = EXCLUDED.is_late,
       shared_with_prof = EXCLUDED.shared_with_prof,
       file_sha256 = EXCLUDED.file_sha256,
       drive_modified_time = EXCLUDED.drive_modified_time,
       updated_at = NOW()
     RETURNING *`,
    [
      assignmentId,
      req.user.id,
      req.user.name,
      req.user.email,
      req.user.roll_no || null,
      cleanUrl,
      extractedDriveId,
      file_name || (extractedDriveId ? `Drive_Submission_${extractedDriveId.slice(0, 8)}.pdf` : 'External_Link_Submission'),
      upload_mode || (extractedDriveId ? 'GOOGLE_DRIVE_AUTO' : 'DIRECT_LINK'),
      submission_notes || null,
      isLate,
      Boolean(shared_with_prof !== false),
      file_sha256 ? String(file_sha256).slice(0, 128) : null,
      driveModIso,
    ]
  );

  res.status(201).json({
    message:
      upload_mode === 'GOOGLE_DRIVE_AUTO'
        ? 'File uploaded to your Google Drive, shared with course Professors/TAs, and link saved (0 DB bloat)!'
        : 'Submission link saved to classroom (0 DB bloat)!',
    submission: subRes.rows[0],
  });
});

/**
 * PATCH /classroom/submissions/:id/grade
 * Scoped strictly to THIS course's instructors or TAs with grading permission
 */
router.patch('/classroom/submissions/:id/grade', requireAuth, async (req, res) => {
  const db = await getDb();
  const submissionId = parsePositiveInt(req.params.id);
  if (!submissionId) {
    res.status(400).json({ detail: 'Invalid submission ID' });
    return;
  }

  const subLookup = await db.query(
    `SELECT ca.offering_id
     FROM assignment_submissions s
     JOIN classroom_assignments ca ON ca.id = s.assignment_id
     WHERE s.id = $1 LIMIT 1`,
    [submissionId]
  );
  if (subLookup.rowCount === 0) {
    res.status(404).json({ detail: 'Submission not found' });
    return;
  }
  const offeringId = Number(subLookup.rows[0].offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade) {
    res.status(403).json({
      detail: 'Only instructors or grading-enabled TAs of this course can grade submissions.',
    });
    return;
  }

  const { marks_obtained, feedback } = req.body;
  let parsedMarks = null;
  if (marks_obtained !== undefined && marks_obtained !== null && marks_obtained !== '') {
    const num = Number(marks_obtained);
    if (!Number.isFinite(num) || num < 0) {
      res.status(400).json({ detail: 'marks_obtained must be a valid non-negative number' });
      return;
    }
    parsedMarks = num;
  }

  const upd = await db.query(
    `UPDATE assignment_submissions
     SET marks_obtained = $1,
         feedback = $2,
         graded_by_name = $3,
         graded_at = NOW(),
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      parsedMarks,
      feedback || null,
      req.user.name,
      submissionId,
    ]
  );

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'GRADE_SUBMISSION',
    entityType: 'SUBMISSION',
    entityId: submissionId,
    metadata: { offering_id: offeringId, marks_obtained: upd.rows[0]?.marks_obtained ?? null },
  });

  res.json({
    message: 'Grade & feedback saved',
    submission: upd.rows[0],
  });
});

/**
 * POST /classroom/offerings/:id/tcs-roster-import
 * Scoped strictly to THIS course's instructors or Admin
 */
router.post('/classroom/offerings/:id/tcs-roster-import', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({
      detail: 'Only professors teaching this course or Admin can import TCS iON rosters.',
    });
    return;
  }

  const { csv_text } = req.body;
  if (!csv_text || !String(csv_text).trim()) {
    res.status(400).json({
      detail: 'Paste TCS iON Roster CSV lines: Roll_No, Student_Name, Email, Section, Attendance_Pct',
    });
    return;
  }

  const parsedRows = parseCsvRfc4180(csv_text);

  const imported = await withTransaction(db, async (tx) => {
    let count = 0;
    for (const parts of parsedRows) {
      if (parts.length < 3) continue;
      if (/^roll_?no$/i.test(parts[0])) continue;

      const [rollNo, studentName, studentEmail, section = 'Sec A', attStr = '', credStr = '4'] = parts;
      const cleanEmail = String(studentEmail || '').toLowerCase().trim();
      if (!cleanEmail.includes('@')) continue;

      const parsedAtt = attStr !== '' && !Number.isNaN(parseFloat(attStr)) ? parseFloat(attStr) : null;

      // Bind existing student account ONLY by exact email (never by roll_no)
      const uMatch = await tx.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [
        cleanEmail,
      ]);

      await tx.query(
        `INSERT INTO course_enrollments (
           offering_id, student_id, roll_no, student_name, student_email,
           section, enroll_source, attendance_pct, tcs_ion_credits
         ) VALUES ($1, $2, $3, $4, $5, $6, 'TCS_ION_CSV', $7, $8)
         ON CONFLICT (offering_id, student_email) DO UPDATE SET
           student_id = COALESCE(course_enrollments.student_id, EXCLUDED.student_id),
           roll_no = EXCLUDED.roll_no,
           student_name = EXCLUDED.student_name,
           section = EXCLUDED.section,
           enroll_source = 'TCS_ION_CSV',
           attendance_pct = COALESCE(EXCLUDED.attendance_pct, course_enrollments.attendance_pct),
           tcs_ion_credits = EXCLUDED.tcs_ion_credits`,
        [
          offeringId,
          uMatch.rows[0]?.id || null,
          rollNo,
          studentName,
          cleanEmail,
          section || 'Sec A',
          parsedAtt,
          Number(parseInt(credStr, 10) || 4),
        ]
      );
      count += 1;
    }
    return count;
  });

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'TCS_ROSTER_IMPORT',
    entityType: 'OFFERING',
    entityId: offeringId,
    metadata: { imported_count: imported },
  });

  res.json({
    message: `Synced ${imported} student records from TCS iON Digital Campus Roster.`,
    imported_count: imported,
  });
});

/**
 * GET /classroom/offerings/:id/tcs-marks-export
 * Scoped strictly to THIS course's instructors, grading TAs, or Admin
 */
router.get('/classroom/offerings/:id/tcs-marks-export', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course && !perms.can_grade) {
    res.status(403).json({
      detail: 'Only instructors or authorized TAs of this course can export marksheets.',
    });
    return;
  }

  const offRes = await db.query('SELECT * FROM course_offerings WHERE id = $1 LIMIT 1', [offeringId]);
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course offering not found' });
    return;
  }
  const off = offRes.rows[0];

  const [enrRes, asgnRes, subRes] = await Promise.all([
    db.query(
      'SELECT * FROM course_enrollments WHERE offering_id = $1 ORDER BY roll_no ASC NULLS LAST, student_email ASC',
      [offeringId]
    ),
    db.query('SELECT id, title, max_marks FROM classroom_assignments WHERE offering_id = $1 ORDER BY id ASC', [
      offeringId,
    ]),
    db.query(
      `SELECT s.* FROM assignment_submissions s
       JOIN classroom_assignments a ON a.id = s.assignment_id
       WHERE a.offering_id = $1`,
      [offeringId]
    ),
  ]);

  const assignments = asgnRes.rows;
  const subMap = new Map();
  for (const s of subRes.rows) {
    const key = `${Number(s.assignment_id)}:${String(s.student_email || '').toLowerCase()}`;
    subMap.set(key, s);
  }

  const headerCols = [
    'TCS_iON_Course_ID',
    'Course_Code',
    'Roll_No',
    'Student_Name',
    'Student_Email',
    'Section',
    'Attendance_Pct',
    'Credits',
    ...assignments.map((a, idx) => `A${idx + 1}_${String(a.title || '').slice(0, 24)} (${a.max_marks})`),
    'Total_Marks_Obtained',
    'Max_Possible_Marks',
  ].map(csvCell);

  const maxTotal = assignments.reduce((acc, a) => acc + Number(a.max_marks || 0), 0);
  const csvRows = [headerCols.join(',')];

  for (const e of enrRes.rows) {
    let studentTotal = 0;
    const markCells = assignments.map((a) => {
      const key = `${Number(a.id)}:${String(e.student_email || '').toLowerCase()}`;
      const sub = subMap.get(key);
      if (sub && sub.marks_obtained !== null && sub.marks_obtained !== undefined) {
        const m = Number(sub.marks_obtained);
        studentTotal += m;
        return m.toFixed(1);
      }
      return sub ? 'SUBMITTED_UNGRADED' : '0.0';
    });

    const rowValues = [
      off.tcs_ion_course_id || `TCS-ION-${off.course_code}`,
      off.course_code,
      e.roll_no || 'PENDING_ROLL',
      e.student_name || 'Student',
      e.student_email,
      e.section || 'Sec A',
      e.attendance_pct !== null && e.attendance_pct !== undefined
        ? Number(e.attendance_pct).toFixed(1)
        : 'NOT_SYNCED',
      e.tcs_ion_credits || 4,
      ...markCells,
      studentTotal.toFixed(1),
      maxTotal.toFixed(1),
    ].map(csvCell);

    csvRows.push(rowValues.join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const safeFilename = safeContentDispositionFilename(
    `TCS_iON_Marks_${off.course_code}_${off.academic_session || 'Session'}.csv`,
    'TCS_iON_Marks.csv'
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(csvContent);
});

export default router;
