import fs from 'node:fs';
import { getDb, withTransaction } from '../config/db.js';
import { invalidateCachePrefix } from '../config/cache.js';
import { parsePositiveInt } from '../config/env.js';
import {
  requireAuth,
  requireProfessorOrAdmin,
  isFullAdminUser,
} from '../middleware/auth.js';
import { joinCodeLimiter } from '../middleware/rateLimiters.js';
import { paperUpload, validateUploadedFileMagic } from '../middleware/uploads.js';
import {
  normalizeSectionName,
  parseSectionsList,
  isUnrestrictedSections,
  canStaffAccessSection,
  canStaffMutateItem,
  canStaffModerateComments,
  canStaffGradeTarget,
  canStudentViewTargets,
  deriveOfferingSections,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { generateUniqueJoinCode } from '../utils/joinCode.js';
import {
  isStudentEnrolled,
  mergeOfferingSections,
  getCourseStaffPermissions,
} from '../utils/classroomAuth.js';
import {
  notifyCourseAudience,
  renderNotificationEmailHtml,
  resolveFrontendAppUrl,
} from '../utils/emailService.js';
import { getOfferingCourseMeta } from '../utils/classroomHelpers.js';
import {
  validateHttpsUrl,
  safeContentDispositionFilename,
  writeAuditLog,
} from '../utils/security.js';

const router = createAsyncRouter();

function formatOfferingPublicFields(rawRow, includeJoinCode = false) {
  if (!rawRow) return rawRow;
  const { join_code, course_desc_pdf_data, ...rest } = rawRow;
  void course_desc_pdf_data;
  return {
    ...rest,
    ...(includeJoinCode ? { join_code } : {}),
    has_syllabus_pdf: Boolean(rawRow.course_desc_pdf_name),
    is_elective: rawRow.auto_enroll === false,
  };
}

async function autoEnrollBatchStudents(db, offeringId, programme, semester, defaultSection = 'Sec A') {
  const safeDefaultSection =
    normalizeSectionName(defaultSection) === 'ALL'
      ? 'Sec A'
      : normalizeSectionName(defaultSection);
  // Batch auto-enrollment sets attendance_pct to NULL until explicitly synced from TCS iON
  const res = await db.query(
    `INSERT INTO course_enrollments (offering_id, student_id, roll_no, student_name, student_email, section, enroll_source, attendance_pct)
     SELECT $1, u.id, u.roll_no, u.name, u.email, $4, 'AUTO_BATCH', NULL
     FROM users u
     WHERE u.admin_role IS NULL
       AND UPPER(COALESCE(u.department, 'B.TECH')) = UPPER($2)
       AND ($3 = 'ALL' OR COALESCE(u.year, '') = $3)
     ON CONFLICT (offering_id, student_email) DO UPDATE SET
       student_id = COALESCE(course_enrollments.student_id, EXCLUDED.student_id),
       roll_no = COALESCE(course_enrollments.roll_no, EXCLUDED.roll_no)
     RETURNING id`,
    [offeringId, programme || 'B.TECH', String(semester || 'ALL'), safeDefaultSection]
  );
  return res.rowCount;
}

// Permissions, enrollment lookup, and offering section merging live in ../utils/classroomAuth.js

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
  const page = parsePositiveInt(req.query.page) || 1;
  const limit = Math.min(100, parsePositiveInt(req.query.limit) || 50);
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

  const [instRes, taRes, enrRes, tasksRes] = await Promise.all([
    db.query(
      `SELECT
         ci.offering_id,
         ci.professor_id,
         ci.role_label,
         ci.assigned_sections,
         u.name,
         u.photo_path,
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
         lab_hours,
         assigned_sections
       FROM course_tas
       WHERE offering_id = ANY($1::int[])
       ORDER BY id ASC`,
      [offeringIds]
    ),
    db.query(
      `SELECT offering_id, section FROM course_enrollments
       WHERE offering_id = ANY($1::int[])
         AND (student_id = $2 OR LOWER(student_email) = LOWER($3))`,
      [offeringIds, user.id, user.email]
    ),
    db.query(
      `SELECT
         ca.id,
         ca.offering_id,
         co.course_code,
         co.course_name,
         ca.title,
         ca.assignment_type,
         ca.due_at,
         ca.max_marks,
         ca.target_sections,
         ca.grades_published,
         ca.created_at,
         s.id AS my_submission_id,
         s.marks_obtained AS my_marks,
         (SELECT COUNT(*)::int FROM assignment_submissions sub WHERE sub.assignment_id = ca.id) AS total_submissions,
         (SELECT COUNT(*)::int FROM assignment_submissions sub WHERE sub.assignment_id = ca.id AND sub.marks_obtained IS NULL) AS pending_grading
       FROM classroom_assignments ca
       JOIN course_offerings co ON co.id = ca.offering_id
       LEFT JOIN assignment_submissions s ON s.assignment_id = ca.id AND s.student_id = $2
       WHERE ca.offering_id = ANY($1::int[])
       ORDER BY ca.due_at ASC NULLS LAST, ca.created_at DESC
       LIMIT 60`,
      [offeringIds, user.id]
    ),
  ]);

  const myEnrolledSectionByOff = new Map();
  for (const r of enrRes.rows) {
    myEnrolledSectionByOff.set(Number(r.offering_id), r.section || 'Sec A');
  }

  const instByOff = new Map();
  for (const r of instRes.rows) {
    const oid = Number(r.offering_id);
    if (!instByOff.has(oid)) instByOff.set(oid, []);
    instByOff.get(oid).push({
      professor_id: Number(r.professor_id),
      name: r.name,
      photo_path: r.photo_path || null,
      role_label: r.role_label,
      assigned_sections: parseSectionsList(r.assigned_sections, ['ALL']),
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
      assigned_sections: parseSectionsList(r.assigned_sections, ['ALL']),
    });
  }

  const staffOfferingIds = new Set();
  for (const o of offRes.rows) {
    const oid = Number(o.id);
    const instructors = instByOff.get(oid) || [];
    const tas = taByOff.get(oid) || [];
    const isInst = Boolean(
      isFullAdmin || instructors.some((i) => i.professor_id === Number(user.id))
    );
    const isTa = tas.some(
      (t) =>
        (t.user_id && t.user_id === Number(user.id)) ||
        (isVerifiedAccount &&
          String(t.public_email).toLowerCase() === String(user.email).toLowerCase())
    );
    if (isInst || isTa) staffOfferingIds.add(oid);
  }

  const tasksByOff = new Map();
  const tasks = [];
  for (const r of tasksRes.rows) {
    const oid = Number(r.offering_id);
    const targets = parseSectionsList(r.target_sections, ['ALL']);
    const isStaffHere = staffOfferingIds.has(oid);
    if (!isStaffHere) {
      const stuSec = myEnrolledSectionByOff.get(oid) || 'Sec A';
      if (!canStudentViewTargets(stuSec, targets)) continue;
    }
    const task = {
      id: Number(r.id),
      offering_id: oid,
      course_code: r.course_code,
      course_name: r.course_name,
      title: r.title,
      assignment_type: r.assignment_type,
      due_at: r.due_at,
      max_marks: r.max_marks !== null ? Number(r.max_marks) : null,
      target_sections: targets,
      created_at: r.created_at,
      submitted: Boolean(r.my_submission_id),
      my_marks:
        (isStaffHere || r.grades_published !== false) &&
        r.my_marks !== null &&
        r.my_marks !== undefined
          ? Number(r.my_marks)
          : null,
      total_submissions: Number(r.total_submissions || 0),
      pending_grading: Number(r.pending_grading || 0),
    };
    tasks.push(task);
    if (!tasksByOff.has(oid)) tasksByOff.set(oid, []);
    tasksByOff.get(oid).push(task);
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
    const isEnrolled = myEnrolledSectionByOff.has(oid);
    const safeOffering = formatOfferingPublicFields(o, isInstructor || isFullAdmin);
    return {
      ...safeOffering,
      id: oid,
      sections: deriveOfferingSections(o, [], instructors),
      my_section: !isInstructor && !isTa ? myEnrolledSectionByOff.get(oid) || null : null,
      instructors,
      tas,
      is_enrolled: isEnrolled || isInstructor || isTa,
      is_instructor: isInstructor,
      is_ta: isTa,
      upcoming_tasks: (tasksByOff.get(oid) || []).slice(0, 3),
    };
  });

  res.json({
    total: totalCount,
    page,
    limit,
    items,
    tasks,
  });
});

/**
 * PATCH /classroom/offerings/:id/banner
 * Allows course professor or admin to choose a curated preset or custom https:// banner image.
 */
router.patch('/classroom/offerings/:id/banner', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }

  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course instructors or admins can customize the course banner.' });
    return;
  }

  const rawUrl = String(req.body?.banner_image_url ?? '').trim();
  let normalizedUrl = null;
  if (rawUrl) {
    const isPresetPath = /^\/illustrations\/[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(rawUrl);
    if (isPresetPath) {
      normalizedUrl = rawUrl;
    } else if (rawUrl.startsWith('data:image/')) {
      const validWebp = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/i.test(rawUrl);
      if (!validWebp) {
        res.status(400).json({
          detail: 'Uploaded banner images must be converted to WebP format.',
        });
        return;
      }
      const approxBytes = Math.ceil(((rawUrl.length - 'data:image/webp;base64,'.length) * 3) / 4);
      if (approxBytes > 180 * 1024) {
        res.status(400).json({
          detail: 'Uploaded WebP banner must be 180 KB or smaller.',
        });
        return;
      }
      normalizedUrl = rawUrl;
    } else {
      const check = validateHttpsUrl(rawUrl, { required: true, label: 'Banner image URL' });
      if (!check.ok) {
        res.status(400).json({
          detail:
            check.error ||
            'Please upload an image, select a preset banner, or provide a valid https:// URL.',
        });
        return;
      }
      normalizedUrl = check.value;
    }
  }

  const upd = await db.query(
    `UPDATE course_offerings
     SET banner_image_url = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, course_code, course_name, banner_image_url`,
    [normalizedUrl, offeringId]
  );
  if (upd.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }

  await invalidateCachePrefix('faculty:');
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'CLASSROOM_BANNER_UPDATED',
    entityType: 'COURSE_OFFERING',
    entityId: offeringId,
    metadata: { banner_image_url: normalizedUrl },
  });

  res.json({
    message: normalizedUrl ? 'Course banner updated' : 'Course banner reset to default',
    offering: upd.rows[0],
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

  const [offRes, perms, enrolled] = await Promise.all([
    db.query('SELECT * FROM course_offerings WHERE id = $1 LIMIT 1', [offeringId]),
    getCourseStaffPermissions(db, offeringId, user),
    isStudentEnrolled(db, offeringId, user),
  ]);
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }
  const rawOffering = offRes.rows[0];

  if (!perms.is_admin && !perms.is_instructor && !perms.is_ta && !enrolled) {
    res.status(403).json({
      detail: 'Access denied: you are not enrolled in or assigned to this course classroom.',
    });
    return;
  }

  const offering = formatOfferingPublicFields(rawOffering, perms.can_manage_course);

  const [instRes, taRes, annRes, asgnRes, enrRes] = await Promise.all([
    db.query(
      `SELECT
         ci.professor_id,
         ci.role_label,
         ci.assigned_sections,
         u.name,
         u.photo_path,
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
         can_announce,
         assigned_sections
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
  const asgnIds = asgnRes.rows.map((a) => Number(a.id));
  const commentsByAnn = new Map();
  const subsByAsgn = new Map();

  // Fetch announcement comments & assignment submissions in parallel (cuts remote DB RTT in half)
  const [cRes, subRes] = await Promise.all([
    annIds.length > 0
      ? db.query(
          `SELECT * FROM classroom_comments
           WHERE announcement_id = ANY($1::int[])
           ORDER BY created_at ASC, id ASC`,
          [annIds]
        )
      : Promise.resolve({ rows: [] }),
    asgnIds.length > 0
      ? perms.can_grade
        ? db.query(
            `SELECT * FROM assignment_submissions
             WHERE assignment_id = ANY($1::int[])
             ORDER BY submitted_at DESC`,
            [asgnIds]
          )
        : db.query(
            `SELECT * FROM assignment_submissions
             WHERE assignment_id = ANY($1::int[]) AND student_id = $2`,
            [asgnIds, user.id]
          )
      : Promise.resolve({ rows: [] }),
  ]);

  for (const c of cRes.rows) {
    const aid = Number(c.announcement_id);
    if (!commentsByAnn.has(aid)) commentsByAnn.set(aid, []);
    commentsByAnn.get(aid).push(c);
  }

  for (const s of subRes.rows) {
    const aid = Number(s.assignment_id);
    if (!subsByAsgn.has(aid)) subsByAsgn.set(aid, []);
    subsByAsgn.get(aid).push(s);
  }

  const myEnrollment = enrRes.rows.find(
    (e) =>
      (e.student_id && Number(e.student_id) === Number(user.id)) ||
      String(e.student_email).toLowerCase() === String(user.email).toLowerCase()
  );

  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  const mySection = myEnrollment?.section || 'Sec A';
  const availableSections = deriveOfferingSections(rawOffering, enrRes.rows, instRes.rows);

  const studentSectionById = new Map();
  const studentSectionByEmail = new Map();
  for (const e of enrRes.rows) {
    const sec = e.section || 'Sec A';
    if (e.student_id) studentSectionById.set(Number(e.student_id), sec);
    if (e.student_email) studentSectionByEmail.set(String(e.student_email).toLowerCase(), sec);
  }

  const autoShareEmails = Array.from(
    new Set([
      ...instRes.rows.map((i) => i.public_email).filter(Boolean),
      ...taRes.rows.map((t) => t.public_email).filter(Boolean),
    ])
  );

  const formattedInstructors = instRes.rows.map((inst) => ({
    ...inst,
    assigned_sections: parseSectionsList(inst.assigned_sections, ['ALL']),
  }));
  const formattedTas = taRes.rows.map((ta) => ({
    ...ta,
    assigned_sections: parseSectionsList(ta.assigned_sections, ['ALL']),
  }));

  const nowMs = Date.now();
  const visibleAnnouncements = annRes.rows
    .map((a) => {
      const targetSections = parseSectionsList(a.target_sections, ['ALL']);
      const isFutureScheduled = Boolean(
        a.scheduled_for && new Date(a.scheduled_for).getTime() > nowMs
      );
      return {
        ...a,
        target_sections: targetSections,
        is_scheduled: isFutureScheduled,
        can_edit: isStaff
          ? canStaffMutateItem(perms, targetSections, a.author_id, user.id)
          : false,
        can_moderate_comments: isStaff
          ? canStaffModerateComments(perms, targetSections)
          : false,
        attachment_urls: Array.isArray(a.attachment_urls)
          ? a.attachment_urls
          : typeof a.attachment_urls === 'string'
            ? JSON.parse(a.attachment_urls || '[]')
            : [],
        comments: commentsByAnn.get(Number(a.id)) || [],
      };
    })
    .filter((a) => {
      if (isStaff) return true;
      if (a.is_scheduled) return false;
      return canStudentViewTargets(mySection, a.target_sections);
    });

  const visibleAssignments = asgnRes.rows
    .map((a) => {
      const targetSections = parseSectionsList(a.target_sections, ['ALL']);
      const gradesPublished = a.grades_published !== false;
      const effectiveReeval =
        a.reeval_enabled !== null && a.reeval_enabled !== undefined
          ? Boolean(a.reeval_enabled)
          : rawOffering.reeval_enabled !== false;
      const rawSubs = subsByAsgn.get(Number(a.id)) || [];
      const annotatedSubs = perms.can_grade
        ? rawSubs.map((s) => {
            const subSec =
              studentSectionById.get(Number(s.student_id)) ||
              studentSectionByEmail.get(String(s.student_email || '').toLowerCase()) ||
              'Sec A';
            return {
              ...s,
              file_data: undefined,
              has_native_file: Boolean(s.file_size),
              student_section: subSec,
              can_grade_submission: canStaffGradeTarget(perms, targetSections, subSec),
            };
          })
        : [];

      const rawMySub = rawSubs.find((s) => Number(s.student_id) === Number(user.id)) || null;
      const safeMySub = rawMySub
        ? {
            ...rawMySub,
            file_data: undefined,
            has_native_file: Boolean(rawMySub.file_size),
            marks_obtained:
              isStaff || gradesPublished ? rawMySub.marks_obtained : null,
            feedback: isStaff || gradesPublished ? rawMySub.feedback : null,
            rubric_scores:
              isStaff || gradesPublished ? rawMySub.rubric_scores : {},
            graded_at: isStaff || gradesPublished ? rawMySub.graded_at : null,
            marks_pending_release: Boolean(
              !isStaff &&
                !gradesPublished &&
                rawMySub.marks_obtained !== null &&
                rawMySub.marks_obtained !== undefined
            ),
          }
        : null;

      return {
        ...a,
        target_sections: targetSections,
        grades_published: gradesPublished,
        effective_reeval_enabled: effectiveReeval,
        rubric_json: Array.isArray(a.rubric_json) ? a.rubric_json : [],
        can_edit: isStaff
          ? canStaffMutateItem(perms, targetSections, a.created_by, user.id)
          : false,
        can_grade_assignment: isStaff
          ? canStaffGradeTarget(perms, targetSections)
          : false,
        resource_links: Array.isArray(a.resource_links)
          ? a.resource_links
          : typeof a.resource_links === 'string'
            ? JSON.parse(a.resource_links || '[]')
            : [],
        my_submission: safeMySub,
        submissions: annotatedSubs,
        submission_count: perms.can_grade ? annotatedSubs.length : undefined,
      };
    })
    .filter((a) => (isStaff ? true : canStudentViewTargets(mySection, a.target_sections)));

  res.json({
    offering: {
      ...offering,
      sections: availableSections,
    },
    instructors: formattedInstructors,
    tas: formattedTas,
    auto_share_emails: autoShareEmails,
    permissions: {
      ...perms,
      is_enrolled: Boolean(myEnrollment || perms.is_instructor || perms.is_ta || perms.is_admin),
      my_section: !isStaff && myEnrollment ? mySection : null,
      my_attendance_pct:
        myEnrollment?.attendance_pct !== null && myEnrollment?.attendance_pct !== undefined
          ? Number(myEnrollment.attendance_pct)
          : null,
      my_enroll_source: myEnrollment?.enroll_source || null,
    },
    announcements: visibleAnnouncements,
    assignments: visibleAssignments,
    roster: perms.can_grade
      ? enrRes.rows.map((e) => ({
          ...e,
          can_manage_student: canStaffAccessSection(perms, e.section || 'Sec A'),
        }))
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

  const sectionParam = req.query.section ? normalizeSectionName(req.query.section) : 'ALL';
  const filterBySection = sectionParam && sectionParam !== 'ALL';

  const [rosterRes, asgnRes, gradeRes] = await Promise.all([
    filterBySection
      ? db.query(
          'SELECT attendance_pct FROM course_enrollments WHERE offering_id = $1 AND LOWER(COALESCE(section, \'Sec A\')) = LOWER($2)',
          [offeringId, sectionParam]
        )
      : db.query('SELECT attendance_pct FROM course_enrollments WHERE offering_id = $1', [offeringId]),
    db.query(
      `SELECT ca.id, ca.title, ca.assignment_type, ca.due_at, ca.max_marks, ca.target_sections,
              COUNT(s.id) FILTER (
                WHERE $2::boolean = FALSE OR LOWER(COALESCE(ce.section, 'Sec A')) = LOWER($3)
              )::int AS submitted,
              COUNT(s.marks_obtained) FILTER (
                WHERE $2::boolean = FALSE OR LOWER(COALESCE(ce.section, 'Sec A')) = LOWER($3)
              )::int AS graded,
              COALESCE(SUM(CASE WHEN s.is_late AND ($2::boolean = FALSE OR LOWER(COALESCE(ce.section, 'Sec A')) = LOWER($3)) THEN 1 ELSE 0 END), 0)::int AS late
       FROM classroom_assignments ca
       LEFT JOIN assignment_submissions s ON s.assignment_id = ca.id
       LEFT JOIN course_enrollments ce ON ce.offering_id = ca.offering_id AND (ce.student_id = s.student_id OR LOWER(ce.student_email) = LOWER(s.student_email))
       WHERE ca.offering_id = $1
       GROUP BY ca.id, ca.title, ca.assignment_type, ca.due_at, ca.max_marks, ca.target_sections
       ORDER BY ca.due_at ASC NULLS LAST, ca.id ASC`,
      [offeringId, filterBySection, sectionParam]
    ),
    db.query(
      `SELECT s.marks_obtained, ca.max_marks
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       LEFT JOIN course_enrollments ce ON ce.offering_id = ca.offering_id AND (ce.student_id = s.student_id OR LOWER(ce.student_email) = LOWER(s.student_email))
       WHERE ca.offering_id = $1
         AND s.marks_obtained IS NOT NULL
         AND ($2::boolean = FALSE OR LOWER(COALESCE(ce.section, 'Sec A')) = LOWER($3))`,
      [offeringId, filterBySection, sectionParam]
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
    sections,
    primary_assigned_sections,
    credits,
    is_elective,
    auto_enroll,
    primary_professor_email,
    tcs_ion_course_id,
    syllabus_drive_url,
    description,
    is_released,
    co_professor_emails,
    co_professors,
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
  const parsedCredits = Math.min(6, Math.max(1, parsePositiveInt(credits) || 4));
  const shouldAutoEnroll =
    is_elective === true || is_elective === 'true'
      ? false
      : auto_enroll === false || auto_enroll === 'false'
        ? false
        : true;
  const joinCode = await generateUniqueJoinCode(db);

  const configuredSections = deriveOfferingSections({
    sections,
    section: section || 'Sec A',
  });
  const primaryAssigned = primary_assigned_sections
    ? parseSectionsList(primary_assigned_sections, ['ALL'])
    : ['ALL'];
  for (const s of primaryAssigned) {
    if (s !== 'ALL' && !configuredSections.some((c) => c.toLowerCase() === s.toLowerCase())) {
      configuredSections.push(s);
    }
  }

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
         programme, batch_year, semester, section, sections, credits, join_code,
         auto_enroll, is_released, tcs_ion_course_id, syllabus_drive_url, description
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        courseId,
        code,
        String(course_name).trim(),
        academic_session || 'Monsoon 2026',
        prog,
        batch_year || '2024-2028',
        sem,
        section || configuredSections.join(', '),
        JSON.stringify(configuredSections),
        parsedCredits,
        joinCode,
        shouldAutoEnroll,
        Boolean(is_released !== false),
        tcs_ion_course_id || `TCS-ION-${code}`,
        syllabusCheck.value,
        description || null,
      ]
    );
    const createdOffering = offRes.rows[0];
    const offeringId = Number(createdOffering.id);

    let primaryProfId = req.user.id;
    const requestedProfEmail = String(primary_professor_email || '').trim().toLowerCase();
    if (isFullAdminUser(req.user) && requestedProfEmail) {
      const targetProf = await tx.query(
        `SELECT id FROM users
         WHERE LOWER(email) = $1
           AND (admin_role = 'professor' OR is_admin = TRUE OR admin_role = 'full_admin')
         LIMIT 1`,
        [requestedProfEmail]
      );
      if (targetProf.rowCount > 0) {
        primaryProfId = Number(targetProf.rows[0].id);
      }
    }

    await tx.query(
      `INSERT INTO course_instructors (offering_id, professor_id, role_label, assigned_sections)
       VALUES ($1, $2, 'Course Coordinator', $3::jsonb)
       ON CONFLICT (offering_id, professor_id) DO UPDATE SET assigned_sections = EXCLUDED.assigned_sections`,
      [offeringId, primaryProfId, JSON.stringify(primaryAssigned)]
    );

    const coEntries = [];
    if (Array.isArray(co_professors)) {
      for (const cp of co_professors) {
        const em = String(cp?.email || '').trim().toLowerCase();
        if (!em) continue;
        coEntries.push({
          email: em,
          role_label: String(cp?.role_label || 'Co-Instructor').trim(),
          assigned_sections: parseSectionsList(cp?.assigned_sections, ['ALL']),
        });
      }
    }
    const coEmails = Array.isArray(co_professor_emails)
      ? co_professor_emails
      : String(co_professor_emails || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
    for (const email of coEmails) {
      if (!coEntries.some((c) => c.email === email)) {
        coEntries.push({
          email,
          role_label: 'Co-Instructor',
          assigned_sections: ['ALL'],
        });
      }
    }

    for (const cp of coEntries) {
      const pUser = await tx.query(
        `SELECT id FROM users
         WHERE LOWER(email) = $1
           AND (admin_role = 'professor' OR is_admin = TRUE OR admin_role = 'full_admin')
         LIMIT 1`,
        [cp.email]
      );
      if (pUser.rowCount > 0) {
        await tx.query(
          `INSERT INTO course_instructors (offering_id, professor_id, role_label, assigned_sections)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (offering_id, professor_id) DO UPDATE SET
             role_label = EXCLUDED.role_label,
             assigned_sections = EXCLUDED.assigned_sections`,
          [offeringId, pUser.rows[0].id, cp.role_label, JSON.stringify(cp.assigned_sections)]
        );
      }
    }

    if (Array.isArray(tas)) {
      for (const ta of tas) {
        if (!ta.public_email || !ta.public_name) continue;
        const cleanEmail = String(ta.public_email).toLowerCase().trim();
        const taSections = parseSectionsList(ta.assigned_sections, ['ALL']);
        const uLookup = await tx.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [
          cleanEmail,
        ]);
        await tx.query(
          `INSERT INTO course_tas (offering_id, user_id, public_name, public_email, public_phone, public_batch, lab_hours, can_grade, can_announce, assigned_sections)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE, $8::jsonb)
           ON CONFLICT (offering_id, public_email) DO UPDATE SET
             user_id = COALESCE(course_tas.user_id, EXCLUDED.user_id),
             public_name = EXCLUDED.public_name,
             public_phone = EXCLUDED.public_phone,
             public_batch = EXCLUDED.public_batch,
             lab_hours = EXCLUDED.lab_hours,
             assigned_sections = EXCLUDED.assigned_sections`,
          [
            offeringId,
            uLookup.rows[0]?.id || null,
            ta.public_name,
            cleanEmail,
            ta.public_phone || null,
            ta.public_batch || null,
            ta.lab_hours || null,
            JSON.stringify(taSections),
          ]
        );
      }
    }

    let enrolledCount = 0;
    if (createdOffering.is_released && createdOffering.auto_enroll) {
      enrolledCount = await autoEnrollBatchStudents(
        tx,
        offeringId,
        prog,
        sem,
        configuredSections[0] || 'Sec A'
      );
    }
    return { offering: createdOffering, autoEnrolledCount: enrolledCount };
  });

  invalidateCachePrefix('faculty:');
  invalidateCachePrefix('metrics:');
  invalidateCachePrefix('courses:');
  res.status(201).json({
    message: shouldAutoEnroll
      ? `Core course ${code} released! Auto-enrolled ${autoEnrolledCount} registered ${prog} (Sem ${sem}) students.`
      : `Elective course ${code} created! Share Join Code ${offering.join_code} or upload an Excel/CSV student roster.`,
    offering: formatOfferingPublicFields(offering, true),
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
 * PATCH /classroom/offerings/:id/me/sections
 * Allows any assigned professor (or full_admin instructor) to select which section(s) they teach
 */
router.patch('/classroom/offerings/:id/me/sections', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }

  const offRes = await db.query('SELECT id, sections, section FROM course_offerings WHERE id = $1 LIMIT 1', [
    offeringId,
  ]);
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }

  const instRes = await db.query(
    'SELECT id FROM course_instructors WHERE offering_id = $1 AND professor_id = $2 LIMIT 1',
    [offeringId, req.user.id]
  );
  if (instRes.rowCount === 0 && !isFullAdminUser(req.user)) {
    res.status(403).json({ detail: 'Only professors assigned to this course can select their sections.' });
    return;
  }

  const parsedSections = parseSectionsList(req.body?.assigned_sections, ['ALL']);
  if (instRes.rowCount > 0) {
    await db.query(
      'UPDATE course_instructors SET assigned_sections = $1::jsonb WHERE offering_id = $2 AND professor_id = $3',
      [JSON.stringify(parsedSections), offeringId, req.user.id]
    );
  } else {
    await db.query(
      `INSERT INTO course_instructors (offering_id, professor_id, role_label, assigned_sections)
       VALUES ($1, $2, 'Course Coordinator', $3::jsonb)
       ON CONFLICT (offering_id, professor_id) DO UPDATE SET assigned_sections = EXCLUDED.assigned_sections`,
      [offeringId, req.user.id, JSON.stringify(parsedSections)]
    );
  }

  const updatedOfferingSections = await mergeOfferingSections(db, offeringId, parsedSections);
  await invalidateCachePrefix('faculty:');
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'UPDATE_OWN_INSTRUCTOR_SECTIONS',
    entityType: 'COURSE_OFFERING',
    entityId: offeringId,
    metadata: { assigned_sections: parsedSections },
  });

  res.json({
    message: isUnrestrictedSections(parsedSections)
      ? 'Updated your teaching scope to All Sections.'
      : `Updated your teaching section(s) to ${parsedSections.join(', ')}.`,
    assigned_sections: parsedSections,
    sections: updatedOfferingSections || deriveOfferingSections(offRes.rows[0]),
  });
});

/**
 * PATCH /classroom/offerings/:id/sections
 * Updates the offering's configured sections list (e.g. ["Sec A", "Sec B", "Sec C"])
 */
router.patch('/classroom/offerings/:id/sections', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course instructors or admins can manage course sections.' });
    return;
  }

  const nextList = parseSectionsList(req.body?.sections, []).filter((s) => s !== 'ALL');
  if (nextList.length === 0) {
    res.status(400).json({ detail: 'Provide at least one section name (e.g. Sec A, Sec B).' });
    return;
  }

  const upd = await db.query(
    'UPDATE course_offerings SET sections = $1::jsonb, section = $2, updated_at = NOW() WHERE id = $3 RETURNING id',
    [JSON.stringify(nextList), nextList.join(', '), offeringId]
  );
  if (upd.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'UPDATE_COURSE_SECTIONS',
    entityType: 'COURSE_OFFERING',
    entityId: offeringId,
    metadata: { sections: nextList },
  });
  res.json({ message: 'Course sections updated', sections: nextList });
});

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

  const { public_name, public_email, public_phone, public_batch, lab_hours, assigned_sections } =
    req.body;
  if (!public_name || !public_email) {
    res.status(400).json({ detail: 'TA public_name and public_email are required' });
    return;
  }

  const defaultTaSections = perms.can_manage_all_sections ? ['ALL'] : perms.assigned_sections;
  const parsedTaSections = parseSectionsList(assigned_sections, defaultTaSections);
  if (!perms.can_manage_all_sections) {
    if (
      parsedTaSections.includes('ALL') ||
      parsedTaSections.some((sec) => !canStaffAccessSection(perms, sec))
    ) {
      res.status(403).json({
        detail: `Section-scoped professors can only assign TAs to their own section(s): ${perms.assigned_sections.join(', ')}.`,
      });
      return;
    }
  }

  const cleanEmail = String(public_email).toLowerCase().trim();
  const uLookup = await db.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);

  const ins = await db.query(
    `INSERT INTO course_tas (offering_id, user_id, public_name, public_email, public_phone, public_batch, lab_hours, can_grade, can_announce, assigned_sections)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE, $8::jsonb)
     ON CONFLICT (offering_id, public_email) DO UPDATE SET
       user_id = COALESCE(course_tas.user_id, EXCLUDED.user_id),
       public_name = EXCLUDED.public_name,
       public_phone = EXCLUDED.public_phone,
       public_batch = EXCLUDED.public_batch,
       lab_hours = EXCLUDED.lab_hours,
       assigned_sections = EXCLUDED.assigned_sections
     RETURNING id, offering_id, public_name, public_email, public_phone, public_batch, lab_hours, assigned_sections`,
    [
      offeringId,
      uLookup.rows[0]?.id || null,
      String(public_name).trim(),
      cleanEmail,
      public_phone || null,
      public_batch || null,
      lab_hours || null,
      JSON.stringify(parsedTaSections),
    ]
  );

  await mergeOfferingSections(db, offeringId, parsedTaSections);
  await invalidateCachePrefix('faculty:');
  res.status(201).json({
    message: `TA ${public_name} added to course (${parsedTaSections.join(', ')}).`,
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
  if (!perms.can_manage_all_sections) {
    res.status(403).json({
      detail: 'Only Course Coordinators (All Sections) or Admin can add co-professors.',
    });
    return;
  }

  const { email, role_label, assigned_sections } = req.body;
  if (!email) {
    res.status(400).json({ detail: 'Co-professor email is required' });
    return;
  }

  const parsedSections = parseSectionsList(assigned_sections, ['ALL']);
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
    `INSERT INTO course_instructors (offering_id, professor_id, role_label, assigned_sections)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (offering_id, professor_id) DO UPDATE SET
       role_label = EXCLUDED.role_label,
       assigned_sections = EXCLUDED.assigned_sections`,
    [offeringId, targetUser.id, role_label || 'Co-Instructor', JSON.stringify(parsedSections)]
  );

  await mergeOfferingSections(db, offeringId, parsedSections);
  await invalidateCachePrefix('faculty:');
  res.json({
    message: `Added ${targetUser.name} as ${role_label || 'Co-Instructor'} (${parsedSections.join(', ')})`,
  });
});

/**
 * PATCH /classroom/offerings/:id/instructors/:professorId/sections
 * Coordinator / Admin updates a co-professor's assigned sections or role label
 */
router.patch(
  '/classroom/offerings/:id/instructors/:professorId/sections',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const professorId = parsePositiveInt(req.params.professorId);
    if (!offeringId || !professorId) {
      res.status(400).json({ detail: 'Invalid offering or professor ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_all_sections && Number(req.user.id) !== professorId) {
      res.status(403).json({
        detail: 'Only Course Coordinators or Admin can change another professor\'s sections.',
      });
      return;
    }

    const parsedSections = parseSectionsList(req.body?.assigned_sections, ['ALL']);
    const roleLabel = req.body?.role_label ? String(req.body.role_label).trim() : null;
    const upd = await db.query(
      `UPDATE course_instructors
       SET assigned_sections = $1::jsonb,
           role_label = COALESCE($2, role_label)
       WHERE offering_id = $3 AND professor_id = $4
       RETURNING professor_id, role_label, assigned_sections`,
      [JSON.stringify(parsedSections), roleLabel, offeringId, professorId]
    );
    if (upd.rowCount === 0) {
      res.status(404).json({ detail: 'Instructor assignment not found for this course' });
      return;
    }

    await mergeOfferingSections(db, offeringId, parsedSections);
    await invalidateCachePrefix('faculty:');
    res.json({
      message: 'Instructor section assignment updated',
      instructor: upd.rows[0],
    });
  }
);

/**
 * DELETE /classroom/offerings/:id/instructors/:professorId
 * Removes a Co-Professor from THIS course (cannot remove the last remaining instructor)
 */
router.delete(
  '/classroom/offerings/:id/instructors/:professorId',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const professorId = parsePositiveInt(req.params.professorId);
    if (!offeringId || !professorId) {
      res.status(400).json({ detail: 'Invalid offering or professor ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_all_sections) {
      res.status(403).json({ detail: 'Only Course Coordinators or Admin can remove co-professors.' });
      return;
    }

    const cntRes = await db.query(
      'SELECT COUNT(*)::int AS cnt FROM course_instructors WHERE offering_id = $1',
      [offeringId]
    );
    if (Number(cntRes.rows[0]?.cnt || 0) <= 1) {
      res.status(400).json({ detail: 'A course classroom must retain at least one instructor.' });
      return;
    }

    const del = await db.query(
      'DELETE FROM course_instructors WHERE offering_id = $1 AND professor_id = $2 RETURNING id',
      [offeringId, professorId]
    );
    if (del.rowCount === 0) {
      res.status(404).json({ detail: 'Instructor assignment not found for this course' });
      return;
    }

    await invalidateCachePrefix('faculty:');
    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'REMOVE_COURSE_INSTRUCTOR',
      entityType: 'COURSE_OFFERING',
      entityId: offeringId,
      metadata: { professor_id: professorId },
    });
    res.json({ message: 'Removed co-instructor from course' });
  }
);

/**
 * PATCH /classroom/offerings/:id/tas/:taId
 * Updates a TA's permissions or assigned sections
 */
router.patch(
  '/classroom/offerings/:id/tas/:taId',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const taId = parsePositiveInt(req.params.taId);
    if (!offeringId || !taId) {
      res.status(400).json({ detail: 'Invalid offering or TA ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      res.status(403).json({ detail: 'Only instructors of this course or Admin can update TAs.' });
      return;
    }

    const existingTa = await db.query(
      'SELECT assigned_sections FROM course_tas WHERE id = $1 AND offering_id = $2 LIMIT 1',
      [taId, offeringId]
    );
    if (existingTa.rowCount === 0) {
      res.status(404).json({ detail: 'TA not found in this course' });
      return;
    }

    const { can_grade, can_announce, assigned_sections } = req.body;
    let nextTaSections = null;
    if (assigned_sections !== undefined) {
      const parsed = parseSectionsList(assigned_sections, ['ALL']);
      if (!perms.can_manage_all_sections) {
        if (parsed.includes('ALL') || parsed.some((s) => !canStaffAccessSection(perms, s))) {
          res.status(403).json({
            detail: `You can only assign TAs to your own section(s): ${perms.assigned_sections.join(', ')}.`,
          });
          return;
        }
      }
      nextTaSections = JSON.stringify(parsed);
      await mergeOfferingSections(db, offeringId, parsed);
    }

    const upd = await db.query(
      `UPDATE course_tas
       SET can_grade = COALESCE($1, can_grade),
           can_announce = COALESCE($2, can_announce),
           assigned_sections = COALESCE($3::jsonb, assigned_sections)
       WHERE id = $4 AND offering_id = $5
       RETURNING id, offering_id, public_name, public_email, public_phone, public_batch, can_grade, can_announce, assigned_sections`,
      [
        can_grade !== undefined ? Boolean(can_grade) : null,
        can_announce !== undefined ? Boolean(can_announce) : null,
        nextTaSections,
        taId,
        offeringId,
      ]
    );

    await invalidateCachePrefix('faculty:');
    res.json({ message: 'TA permissions updated', ta: upd.rows[0] });
  }
);

/**
 * DELETE /classroom/offerings/:id/tas/:taId
 * Removes a TA from THIS course
 */
router.delete(
  '/classroom/offerings/:id/tas/:taId',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const taId = parsePositiveInt(req.params.taId);
    if (!offeringId || !taId) {
      res.status(400).json({ detail: 'Invalid offering or TA ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      res.status(403).json({ detail: 'Only instructors of this course or Admin can remove TAs.' });
      return;
    }

    const existingTa = await db.query(
      'SELECT public_name, assigned_sections FROM course_tas WHERE id = $1 AND offering_id = $2 LIMIT 1',
      [taId, offeringId]
    );
    if (existingTa.rowCount === 0) {
      res.status(404).json({ detail: 'TA not found in this course' });
      return;
    }
    if (
      !perms.can_manage_all_sections &&
      !canStaffMutateItem(perms, existingTa.rows[0].assigned_sections, null, null)
    ) {
      res.status(403).json({ detail: 'Read-only: you cannot remove a TA assigned to another section.' });
      return;
    }

    await db.query('DELETE FROM course_tas WHERE id = $1 AND offering_id = $2', [taId, offeringId]);

    await invalidateCachePrefix('faculty:');
    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'REMOVE_COURSE_TA',
      entityType: 'COURSE_OFFERING',
      entityId: offeringId,
      metadata: { ta_id: taId },
    });
    res.json({ message: `Removed TA ${existingTa.rows[0].public_name} from course` });
  }
);

/**
 * PATCH /classroom/offerings/:id/students/:enrollmentId/section
 * Updates an enrolled student's section
 */
router.patch(
  '/classroom/offerings/:id/students/:enrollmentId/section',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const enrollmentId = parsePositiveInt(req.params.enrollmentId);
    if (!offeringId || !enrollmentId) {
      res.status(400).json({ detail: 'Invalid offering or enrollment ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      res.status(403).json({ detail: 'Only course instructors or Admin can change student sections.' });
      return;
    }

    const nextSection = normalizeSectionName(req.body?.section);
    if (!nextSection || nextSection === 'ALL') {
      res.status(400).json({ detail: 'Provide a valid student section (e.g. Sec A or Sec B).' });
      return;
    }

    const cur = await db.query(
      'SELECT id, student_name, section FROM course_enrollments WHERE id = $1 AND offering_id = $2 LIMIT 1',
      [enrollmentId, offeringId]
    );
    if (cur.rowCount === 0) {
      res.status(404).json({ detail: 'Student enrollment not found in this course' });
      return;
    }
    if (
      !perms.can_manage_all_sections &&
      (!canStaffAccessSection(perms, cur.rows[0].section || 'Sec A') ||
        !canStaffAccessSection(perms, nextSection))
    ) {
      res.status(403).json({
        detail: 'Read-only: you cannot reassign students outside your own assigned section(s).',
      });
      return;
    }

    const upd = await db.query(
      'UPDATE course_enrollments SET section = $1 WHERE id = $2 AND offering_id = $3 RETURNING *',
      [nextSection, enrollmentId, offeringId]
    );
    await mergeOfferingSections(db, offeringId, [nextSection]);
    res.json({
      message: `Moved ${cur.rows[0].student_name || 'student'} to ${nextSection}`,
      enrollment: upd.rows[0],
    });
  }
);

/**
 * DELETE /classroom/offerings/:id/students/:enrollmentId
 * Removes a student enrollment from THIS course (scoped by professor section)
 */
router.delete(
  '/classroom/offerings/:id/students/:enrollmentId',
  requireProfessorOrAdmin,
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    const enrollmentId = parsePositiveInt(req.params.enrollmentId);
    if (!offeringId || !enrollmentId) {
      res.status(400).json({ detail: 'Invalid offering or enrollment ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      res.status(403).json({ detail: 'Only instructors of this course or Admin can remove students.' });
      return;
    }

    const existing = await db.query(
      'SELECT id, student_name, section FROM course_enrollments WHERE id = $1 AND offering_id = $2 LIMIT 1',
      [enrollmentId, offeringId]
    );
    if (existing.rowCount === 0) {
      res.status(404).json({ detail: 'Student enrollment not found in this course' });
      return;
    }
    if (!canStaffAccessSection(perms, existing.rows[0].section || 'Sec A')) {
      res.status(403).json({
        detail: `Read-only: you cannot remove students belonging to ${existing.rows[0].section || 'another section'}.`,
      });
      return;
    }

    await db.query('DELETE FROM course_enrollments WHERE id = $1 AND offering_id = $2', [
      enrollmentId,
      offeringId,
    ]);

    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'REMOVE_COURSE_STUDENT',
      entityType: 'COURSE_OFFERING',
      entityId: offeringId,
      metadata: { enrollment_id: enrollmentId },
    });
    res.json({ message: `Removed ${existing.rows[0].student_name} from classroom roster` });
  }
);

/**
 * DELETE /classroom/offerings/:id/leave
 * Enrolled student leaves an elective (JOIN_CODE) classroom
 */
router.delete('/classroom/offerings/:id/leave', requireAuth, async (_req, res) => {
  res.status(403).json({
    detail: 'Students cannot self-unenroll from courses. Contact your course professor or IT admin.',
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
 * POST /classroom/offerings/:id/syllabus-pdf
 * Upload or replace official Course Description / Syllabus PDF (<=10 MB)
 */
router.post(
  '/classroom/offerings/:id/syllabus-pdf',
  requireAuth,
  paperUpload.single('file'),
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    if (!offeringId) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      res.status(400).json({ detail: 'Invalid offering ID' });
      return;
    }

    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      res.status(403).json({ detail: 'Only course instructors or IT Admin can upload the course description PDF.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ detail: 'PDF file is required.' });
      return;
    }

    const isPdf = await validateUploadedFileMagic(req.file.path, ['pdf']);
    if (!isPdf) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ detail: 'Uploaded file header is not a valid PDF document.' });
      return;
    }

    const pdfBuf = await fs.promises.readFile(req.file.path);
    fs.unlink(req.file.path, () => {});

    const cleanName = safeContentDispositionFilename(
      req.file.originalname || 'Course_Description.pdf',
      'Course_Description.pdf'
    );

    await db.query(
      `UPDATE course_offerings
       SET course_desc_pdf_name = $1,
           course_desc_pdf_data = $2,
           course_desc_pdf_size = $3,
           course_desc_pdf_uploaded_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [cleanName, pdfBuf, pdfBuf.length, offeringId]
    );

    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'UPLOAD_COURSE_SYLLABUS_PDF',
      entityType: 'OFFERING',
      entityId: offeringId,
      metadata: { filename: cleanName, bytes: pdfBuf.length },
    });

    const offMeta = await getOfferingCourseMeta(db, offeringId);
    const cCode = offMeta?.courseCode || 'COURSE';
    const cName = offMeta?.courseName || 'Classroom';
    const appOrigin = resolveFrontendAppUrl();
    void notifyCourseAudience({
      db,
      offeringId,
      targetSections: ['ALL'],
      eventType: 'SYLLABUS_UPDATED',
      title: `${cCode}: Course Description / Syllabus PDF Updated`,
      body: `${req.user.name} uploaded "${cleanName}". Open the classroom header to read it.`,
      linkPath: `/classroom?offeringId=${offeringId}`,
      emailSubject: `[${cCode}] Course Syllabus PDF Updated`,
      emailHtml: renderNotificationEmailHtml({
        courseLabel: `${cCode} · ${cName}`,
        heading: 'Course Description & Syllabus Updated',
        body: `${req.user.name} uploaded a new syllabus PDF (${cleanName}) to ${cCode}.`,
        ctaLabel: 'Open Classroom',
        ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
      }),
      actorUserId: req.user.id,
    });

    res.json({
      message: 'Course description PDF uploaded!',
      has_syllabus_pdf: true,
      course_desc_pdf_name: cleanName,
      course_desc_pdf_size: pdfBuf.length,
    });
  }
);

/**
 * GET /classroom/offerings/:id/syllabus-pdf
 * Stream official Course Description / Syllabus PDF to enrolled students, TAs, instructors, or admin
 */
router.get('/classroom/offerings/:id/syllabus-pdf', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }

  const [perms, enrolled] = await Promise.all([
    getCourseStaffPermissions(db, offeringId, req.user),
    isStudentEnrolled(db, offeringId, req.user),
  ]);
  if (!perms.is_admin && !perms.is_instructor && !perms.is_ta && !enrolled) {
    res.status(403).json({ detail: 'Access denied to this course syllabus PDF.' });
    return;
  }

  const pdfRes = await db.query(
    'SELECT course_desc_pdf_name, course_desc_pdf_data FROM course_offerings WHERE id = $1 LIMIT 1',
    [offeringId]
  );
  if (pdfRes.rowCount === 0 || !pdfRes.rows[0].course_desc_pdf_data) {
    res.status(404).json({ detail: 'No course description PDF uploaded yet.' });
    return;
  }

  const row = pdfRes.rows[0];
  const rawBuf = Buffer.isBuffer(row.course_desc_pdf_data)
    ? row.course_desc_pdf_data
    : Buffer.from(row.course_desc_pdf_data);
  const safeName = safeContentDispositionFilename(
    row.course_desc_pdf_name || 'Course_Description.pdf',
    'Course_Description.pdf'
  );
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(rawBuf);
});

/**
 * DELETE /classroom/offerings/:id/syllabus-pdf
 * Remove Course Description PDF
 */
router.delete('/classroom/offerings/:id/syllabus-pdf', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course instructors or IT Admin can remove the course description PDF.' });
    return;
  }
  await db.query(
    `UPDATE course_offerings
     SET course_desc_pdf_name = NULL,
         course_desc_pdf_data = NULL,
         course_desc_pdf_size = NULL,
         course_desc_pdf_uploaded_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [offeringId]
  );
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'DELETE_COURSE_SYLLABUS_PDF',
    entityType: 'OFFERING',
    entityId: offeringId,
  });
  res.json({ message: 'Course description PDF removed' });
});

export default router;
