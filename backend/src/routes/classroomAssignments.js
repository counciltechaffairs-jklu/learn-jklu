import { getDb } from '../config/db.js';
import { parsePositiveInt } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import {
  parseSectionsList,
  resolvePostTargetsForStaff,
  canStaffMutateItem,
  canStaffGradeTarget,
  canStudentViewTargets,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import {
  getStudentEnrollment,
  mergeOfferingSections,
  getCourseStaffPermissions,
} from '../utils/classroomAuth.js';
import { buildGoogleCalendarUrl } from '../utils/calendarHelper.js';
import {
  notifyCourseAudience,
  notifyCourseInstructors,
  notifyUser,
  renderNotificationEmailHtml,
  resolveFrontendAppUrl,
} from '../utils/emailService.js';
import {
  getOfferingCourseMeta,
  formatLateDuration,
  computeLateSubmissionPenalty,
  resolveSubmissionGroupMembers,
} from '../utils/classroomHelpers.js';
import {
  validateHttpsUrl,
  validateUrlLinkList,
  writeAuditLog,
} from '../utils/security.js';

const router = createAsyncRouter();

const ALLOWED_ASSIGNMENT_TYPES = new Set([
  'ASSIGNMENT',
  'LAB',
  'QUIZ',
  'TCS_ION_QUIZ',
  'PROJECT',
  'MATERIAL',
]);

function extractGoogleDriveFileId(url) {
  const str = String(url || '').trim();
  if (!str) return null;
  let host = '';
  try {
    host = new URL(str).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host.endsWith('drive.google.com') && !host.endsWith('docs.google.com')) {
    return null;
  }
  const matchD = str.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]{10,})/);
  if (matchD) return matchD[1];
  const matchFolders = str.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (matchFolders) return matchFolders[1];
  const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (matchId) return matchId[1];
  return null;
}


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
    target_sections,
    grades_published,
    reeval_enabled,
    is_group_assignment,
    max_group_size,
    late_penalty_pct_per_day,
    grace_minutes,
    weight_category,
    rubric_json,
  } = req.body;

  if (!title || !String(title).trim()) {
    res.status(400).json({ detail: 'Assignment/Quiz title is required' });
    return;
  }

  const targetRes = resolvePostTargetsForStaff(perms, target_sections);
  if (!targetRes.ok) {
    res.status(403).json({ detail: targetRes.error });
    return;
  }
  await mergeOfferingSections(db, offeringId, targetRes.sections);

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

  const normType = String(assignment_type || 'ASSIGNMENT').trim().toUpperCase();
  if (!ALLOWED_ASSIGNMENT_TYPES.has(normType)) {
    res.status(400).json({ detail: 'Invalid assignment_type' });
    return;
  }
  const parsedMaxMarks =
    max_marks !== undefined && max_marks !== null && max_marks !== '' ? Number(max_marks) : 100;
  if (!Number.isFinite(parsedMaxMarks) || parsedMaxMarks <= 0 || parsedMaxMarks > 9999) {
    res.status(400).json({ detail: 'max_marks must be between 1 and 9999' });
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

  const cleanRubric = Array.isArray(rubric_json)
    ? rubric_json
        .map((c, idx) => ({
          id: String(c?.id || `crit_${idx + 1}`).slice(0, 40),
          title: String(c?.title || '').trim().slice(0, 120),
          max_marks: Number(c?.max_marks || 0),
          description: String(c?.description || '').trim().slice(0, 240),
        }))
        .filter((c) => c.title && c.max_marks > 0)
    : [];
  const parsedGroupSize = Math.min(12, Math.max(2, Number(max_group_size || 4)));
  const parsedLatePenalty = Math.min(100, Math.max(0, Number(late_penalty_pct_per_day || 0)));
  const parsedGraceMinutes = Math.max(0, Math.min(1440, Number(grace_minutes || 0)));
  const resolvedCategory = ['ASSIGNMENT', 'LAB', 'QUIZ', 'PROJECT'].includes(
    String(weight_category || '').toUpperCase()
  )
    ? String(weight_category).toUpperCase()
    : normType === 'TCS_ION_QUIZ' || normType === 'QUIZ'
      ? 'QUIZ'
      : normType === 'LAB'
        ? 'LAB'
        : normType === 'PROJECT'
          ? 'PROJECT'
          : 'ASSIGNMENT';

  const ins = await db.query(
    `INSERT INTO classroom_assignments (
       offering_id, created_by, creator_name, title, description,
       assignment_type, topic_module, resource_links,
       tcs_ion_launch_url, tcs_ion_exam_code, due_at, allow_late, max_marks, target_sections,
       grades_published, reeval_enabled, is_group_assignment, max_group_size,
       late_penalty_pct_per_day, grace_minutes, weight_category, rubric_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19, $20, $21, $22::jsonb)
     RETURNING *`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      String(title).trim(),
      description || null,
      normType,
      topic_module || 'General Classwork',
      JSON.stringify(resLinksCheck.value),
      launchUrlCheck.value,
      tcs_ion_exam_code || null,
      dueAtIso,
      allow_late !== false,
      parsedMaxMarks,
      JSON.stringify(targetRes.sections),
      grades_published !== false,
      reeval_enabled === undefined || reeval_enabled === null ? null : Boolean(reeval_enabled),
      Boolean(is_group_assignment),
      parsedGroupSize,
      parsedLatePenalty,
      parsedGraceMinutes,
      resolvedCategory,
      JSON.stringify(cleanRubric),
    ]
  );

  // Dispatch notifications + Resend email with direct Google Calendar button
  const offMeta = await getOfferingCourseMeta(db, offeringId);
  const cCode = offMeta?.courseCode || 'COURSE';
  const cName = offMeta?.courseName || 'Classroom';
  const appOrigin = resolveFrontendAppUrl();
  const gCalUrl = buildGoogleCalendarUrl({
    title: `[${cCode}] ${String(title).trim()} Due`,
    details: `${cName}\nMax Marks: ${parsedMaxMarks}\n${description || ''}`,
    startIso: dueAtIso,
  });

  void notifyCourseAudience({
    db,
    offeringId,
    targetSections: targetRes.sections,
    eventType: 'ASSIGNMENT_CREATED',
    title: `${cCode}: New ${normType.replace(/_/g, ' ')} — ${String(title).trim()}`,
    body: `Due: ${new Date(dueAtIso).toLocaleString()} · Max Marks: ${parsedMaxMarks}${is_group_assignment ? ` · Group (max ${parsedGroupSize})` : ''}`,
    linkPath: `/classroom?offeringId=${offeringId}`,
    emailSubject: `[${cCode}] New Task: ${String(title).trim()} (Due ${new Date(dueAtIso).toLocaleDateString()})`,
    emailHtml: renderNotificationEmailHtml({
      courseLabel: `${cCode} · ${cName}`,
      heading: `${String(title).trim()}`,
      body: `A new ${normType.replace(/_/g, ' ').toLowerCase()} was published by ${req.user.name}.\nDue: ${new Date(dueAtIso).toLocaleString()}\nMax Marks: ${parsedMaxMarks}\n${description || ''}`,
      ctaLabel: 'Open Assignment',
      ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
      secondaryLabel: 'Add Due Date to Google Calendar',
      secondaryUrl: gCalUrl,
    }),
    actorUserId: req.user.id,
  });

  res.status(201).json({
    message:
      normType === 'TCS_ION_QUIZ'
        ? `TCS iON Quiz published to ${targetRes.sections.includes('ALL') ? 'All Sections' : targetRes.sections.join(', ')}`
        : `Assignment published to ${targetRes.sections.includes('ALL') ? 'All Sections' : targetRes.sections.join(', ')}`,
    assignment: { ...ins.rows[0], target_sections: targetRes.sections },
  });
});

/**
 * PATCH /classroom/assignments/:id
 * Edits assignment title, description, due_at, max_marks, allow_late (enforces read-only on other sections)
 */
router.patch('/classroom/assignments/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const existing = await db.query('SELECT * FROM classroom_assignments WHERE id = $1 LIMIT 1', [
    assignmentId,
  ]);
  if (existing.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = existing.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(asgn.offering_id), req.user);
  if (
    (!perms.can_announce && !perms.can_manage_course) ||
    !canStaffMutateItem(perms, asgn.target_sections, asgn.created_by, req.user.id)
  ) {
    res.status(403).json({
      detail: 'Read-only: you can view other sections, but only edit assignments in your assigned section(s) or your own shared classwork.',
    });
    return;
  }

  const { title, description, due_at, allow_late, max_marks, target_sections } = req.body;
  let nextTargetsJson = null;
  if (target_sections !== undefined) {
    const targetRes = resolvePostTargetsForStaff(perms, target_sections);
    if (!targetRes.ok) {
      res.status(403).json({ detail: targetRes.error });
      return;
    }
    nextTargetsJson = JSON.stringify(targetRes.sections);
    await mergeOfferingSections(db, Number(asgn.offering_id), targetRes.sections);
  }

  let nextMaxMarks = null;
  if (max_marks !== undefined && max_marks !== null && max_marks !== '') {
    const num = Number(max_marks);
    if (!Number.isFinite(num) || num <= 0 || num > 9999) {
      res.status(400).json({ detail: 'max_marks must be between 1 and 9999' });
      return;
    }
    nextMaxMarks = num;
  }
  let nextDueIso = undefined;
  if (due_at !== undefined) {
    if (!due_at) {
      nextDueIso = null;
    } else {
      const parsed = new Date(due_at);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ detail: 'Invalid due_at date format' });
        return;
      }
      nextDueIso = parsed.toISOString();
    }
  }

  const upd = await db.query(
    `UPDATE classroom_assignments
     SET title = COALESCE($1, title),
         description = CASE WHEN $2 THEN $3 ELSE description END,
         due_at = CASE WHEN $4 THEN $5::timestamptz ELSE due_at END,
         allow_late = COALESCE($6, allow_late),
         max_marks = COALESCE($7, max_marks),
         target_sections = COALESCE($8::jsonb, target_sections),
         updated_at = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      title !== undefined && String(title).trim() ? String(title).trim() : null,
      description !== undefined,
      description || null,
      nextDueIso !== undefined,
      nextDueIso === undefined ? null : nextDueIso,
      allow_late !== undefined ? Boolean(allow_late) : null,
      nextMaxMarks,
      nextTargetsJson,
      assignmentId,
    ]
  );

  res.json({ message: 'Assignment updated', assignment: upd.rows[0] });
});

/**
 * DELETE /classroom/assignments/:id
 * Deletes an assignment or quiz from THIS course (enforces read-only on other sections)
 */
router.delete('/classroom/assignments/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const existing = await db.query(
    'SELECT offering_id, title, created_by, target_sections FROM classroom_assignments WHERE id = $1 LIMIT 1',
    [assignmentId]
  );
  if (existing.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = existing.rows[0];
  const offeringId = Number(asgn.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (
    (!perms.can_announce && !perms.can_manage_course) ||
    !canStaffMutateItem(perms, asgn.target_sections, asgn.created_by, req.user.id)
  ) {
    res.status(403).json({
      detail: 'Read-only: you can view other sections, but only delete assignments in your assigned section(s) or your own shared classwork.',
    });
    return;
  }

  await db.query('DELETE FROM classroom_assignments WHERE id = $1', [assignmentId]);
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'DELETE_ASSIGNMENT',
    entityType: 'ASSIGNMENT',
    entityId: assignmentId,
    metadata: { offering_id: offeringId, title: asgn.title },
  });
  res.json({ message: 'Assignment deleted from classroom' });
});

/**
 * POST /classroom/assignments/:id/submit
 * Enrolled students ONLY (matching ALL or student's section): saves external URL/Drive link
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
  const enrollment = await getStudentEnrollment(db, Number(asgn.offering_id), req.user);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!enrollment && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only students enrolled in this course can submit assignments.' });
    return;
  }
  if (!isStaff && enrollment && !canStudentViewTargets(enrollment.section || 'Sec A', asgn.target_sections)) {
    res.status(403).json({ detail: 'This assignment belongs to a different section.' });
    return;
  }

  const { isLate, lateMinutes, latePenaltyApplied } = computeLateSubmissionPenalty(asgn);
  if (isLate && asgn.allow_late === false) {
    res.status(400).json({ detail: 'Submission deadline has passed and late submissions are disabled.' });
    return;
  }

  const grpRes = await resolveSubmissionGroupMembers(db, {
    assignment: asgn,
    userId: req.user.id,
    isStaff,
    missingGroupMessage: 'This is a group assignment. Create or join a group in the assignment card before submitting.',
  });
  if (!grpRes.ok) {
    res.status(400).json({ detail: grpRes.error });
    return;
  }
  const activeGroupId = grpRes.groupId;
  const groupMembers = grpRes.members;

  let driveModIso = null;
  if (drive_modified_time) {
    const parsedMod = new Date(drive_modified_time);
    if (Number.isNaN(parsedMod.getTime())) {
      res.status(400).json({ detail: 'Invalid drive_modified_time date format' });
      return;
    }
    driveModIso = parsedMod.toISOString();
  }

  const existingSub = await db.query(
    'SELECT id, graded_at, marks_obtained FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2 LIMIT 1',
    [assignmentId, req.user.id]
  );
  if (
    existingSub.rowCount > 0 &&
    existingSub.rows[0].marks_obtained !== null &&
    existingSub.rows[0].marks_obtained !== undefined
  ) {
    res.status(409).json({
      detail: 'This submission has already been graded. Ask your instructor to reopen grading if you need to resubmit.',
    });
    return;
  }

  let validatedDriveId = null;
  if (drive_file_id !== undefined && drive_file_id !== null && String(drive_file_id).trim() !== '') {
    const trimmedId = String(drive_file_id).trim();
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(trimmedId)) {
      res.status(400).json({ detail: 'Invalid Google Drive file ID format' });
      return;
    }
    validatedDriveId = trimmedId;
  }
  const extractedDriveId = validatedDriveId || extractGoogleDriveFileId(cleanUrl);

  const subRes = await db.query(
    `INSERT INTO assignment_submissions (
       assignment_id, student_id, student_name, student_email, student_roll_no,
       submission_url, drive_file_id, file_name, upload_mode,
       submission_notes, is_late, late_minutes, late_penalty_applied,
       shared_with_prof, file_sha256, drive_modified_time, group_id,
       version_count, submitted_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 1, NOW(), NOW())
     ON CONFLICT (assignment_id, student_id) DO UPDATE SET
       submission_url = EXCLUDED.submission_url,
       drive_file_id = EXCLUDED.drive_file_id,
       file_name = EXCLUDED.file_name,
       upload_mode = EXCLUDED.upload_mode,
       submission_notes = EXCLUDED.submission_notes,
       is_late = EXCLUDED.is_late,
       late_minutes = EXCLUDED.late_minutes,
       late_penalty_applied = EXCLUDED.late_penalty_applied,
       shared_with_prof = EXCLUDED.shared_with_prof,
       file_sha256 = EXCLUDED.file_sha256,
       drive_modified_time = EXCLUDED.drive_modified_time,
       group_id = EXCLUDED.group_id,
       version_count = COALESCE(assignment_submissions.version_count, 1) + 1,
       submitted_at = NOW(),
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
      lateMinutes,
      latePenaltyApplied,
      Boolean(shared_with_prof !== false),
      file_sha256 ? String(file_sha256).slice(0, 128) : null,
      driveModIso,
      activeGroupId,
    ]
  );

  const savedSub = subRes.rows[0];
  await db.query(
    `INSERT INTO submission_versions (submission_id, version_no, submission_url, submission_notes, file_name, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      savedSub.id,
      Number(savedSub.version_count || 1),
      savedSub.submission_url,
      savedSub.submission_notes,
      savedSub.file_name,
      req.user.id,
    ]
  );

  if (activeGroupId && groupMembers.length > 0) {
    for (const gm of groupMembers) {
      if (Number(gm.student_id) === Number(req.user.id)) continue;
      await db.query(
        `INSERT INTO assignment_submissions (
           assignment_id, student_id, student_name, student_email,
           submission_url, drive_file_id, file_name, upload_mode,
           submission_notes, is_late, late_minutes, late_penalty_applied,
           shared_with_prof, group_id, submitted_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
         ON CONFLICT (assignment_id, student_id) DO UPDATE SET
           submission_url = EXCLUDED.submission_url,
           drive_file_id = EXCLUDED.drive_file_id,
           file_name = EXCLUDED.file_name,
           upload_mode = EXCLUDED.upload_mode,
           submission_notes = EXCLUDED.submission_notes,
           is_late = EXCLUDED.is_late,
           late_minutes = EXCLUDED.late_minutes,
           late_penalty_applied = EXCLUDED.late_penalty_applied,
           group_id = EXCLUDED.group_id,
           submitted_at = NOW(),
           updated_at = NOW()`,
        [
          assignmentId,
          gm.student_id,
          gm.student_name,
          gm.student_email,
          savedSub.submission_url,
          savedSub.drive_file_id,
          savedSub.file_name,
          savedSub.upload_mode,
          savedSub.submission_notes,
          isLate,
          lateMinutes,
          latePenaltyApplied,
          Boolean(shared_with_prof !== false),
          activeGroupId,
        ]
      );
    }
  }

  if (isLate && !isStaff) {
    const lateText = formatLateDuration(lateMinutes);
    void notifyCourseInstructors({
      db,
      offeringId: Number(asgn.offering_id),
      type: 'LATE_SUBMISSION',
      title: `Late submission: ${asgn.title}`,
      body: `${req.user.name} submitted "${asgn.title}" (${lateText}).`,
      linkPath: `/classroom?offeringId=${asgn.offering_id}`,
    });
  }

  res.status(201).json({
    message:
      upload_mode === 'GOOGLE_DRIVE_AUTO'
        ? 'File uploaded to your Google Drive, shared with course Professors/TAs, and link saved (0 DB bloat)!'
        : 'Submission saved to classroom!',
    submission: { ...savedSub, file_data: undefined },
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
    `SELECT ca.offering_id, ca.max_marks, ca.target_sections, ca.grades_published, ca.title AS assignment_title,
            s.assignment_id, s.student_id, s.student_email, s.student_name, s.marks_obtained AS prev_marks, s.group_id,
            COALESCE(co.course_code, c.code) AS course_code,
            COALESCE(co.course_name, c.name) AS course_name
     FROM assignment_submissions s
     JOIN classroom_assignments ca ON ca.id = s.assignment_id
     JOIN course_offerings co ON co.id = ca.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE s.id = $1 LIMIT 1`,
    [submissionId]
  );
  if (subLookup.rowCount === 0) {
    res.status(404).json({ detail: 'Submission not found' });
    return;
  }
  const subRow = subLookup.rows[0];
  const offeringId = Number(subRow.offering_id);
  const maxMarks = Number(subRow.max_marks || 100);
  const [perms, enrRes] = await Promise.all([
    getCourseStaffPermissions(db, offeringId, req.user),
    db.query(
      'SELECT section FROM course_enrollments WHERE offering_id = $1 AND (student_id = $2 OR LOWER(student_email) = LOWER($3)) LIMIT 1',
      [offeringId, subRow.student_id, subRow.student_email || '']
    ),
  ]);
  const stuSec = enrRes.rows[0]?.section || 'Sec A';
  if (!canStaffGradeTarget(perms, subRow.target_sections, stuSec)) {
    res.status(403).json({
      detail: perms.can_grade
        ? `Read-only: this assignment belongs to ${parseSectionsList(subRow.target_sections).join(', ')} (${stuSec}), outside your assigned section(s).`
        : 'Only instructors or grading-enabled TAs of this course can grade submissions.',
    });
    return;
  }

  const { marks_obtained, feedback, rubric_scores } = req.body;
  let parsedMarks = null;
  if (marks_obtained !== undefined && marks_obtained !== null && marks_obtained !== '') {
    const num = Number(marks_obtained);
    if (!Number.isFinite(num) || num < 0) {
      res.status(400).json({ detail: 'marks_obtained must be a valid non-negative number' });
      return;
    }
    if (num > maxMarks || num > 9999.99) {
      res.status(400).json({
        detail: `marks_obtained cannot exceed the assignment maximum of ${maxMarks}`,
      });
      return;
    }
    parsedMarks = num;
  }

  const safeRubricScores =
    rubric_scores && typeof rubric_scores === 'object' && !Array.isArray(rubric_scores)
      ? rubric_scores
      : {};

  const upd = await db.query(
    `UPDATE assignment_submissions
     SET marks_obtained = $1,
         feedback = $2,
         rubric_scores = $3::jsonb,
         graded_by_name = CASE WHEN $1 IS NULL AND $2 IS NULL THEN NULL ELSE $4 END,
         graded_at = CASE WHEN $1 IS NULL AND $2 IS NULL THEN NULL ELSE NOW() END,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      parsedMarks,
      feedback || null,
      JSON.stringify(safeRubricScores),
      req.user.name,
      submissionId,
    ]
  );

  // Sync grade & rubric across teammates if part of an assignment group
  if (subRow.group_id) {
    await db.query(
      `UPDATE assignment_submissions
       SET marks_obtained = $1,
           feedback = $2,
           rubric_scores = $3::jsonb,
           graded_by_name = CASE WHEN $1 IS NULL AND $2 IS NULL THEN NULL ELSE $4 END,
           graded_at = CASE WHEN $1 IS NULL AND $2 IS NULL THEN NULL ELSE NOW() END,
           updated_at = NOW()
       WHERE group_id = $5 AND assignment_id = $6 AND id <> $7`,
      [
        parsedMarks,
        feedback || null,
        JSON.stringify(safeRubricScores),
        req.user.name,
        subRow.group_id,
        subRow.assignment_id,
        submissionId,
      ]
    );
  }

  await db.query(
    `INSERT INTO grading_audit_logs (offering_id, assignment_id, submission_id, student_id, grader_id, grader_name, grader_role, old_marks, new_marks, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'MANUAL_GRADE')`,
    [
      offeringId,
      subRow.assignment_id,
      submissionId,
      subRow.student_id,
      req.user.id,
      req.user.name,
      perms.is_ta ? 'TA' : 'Professor',
      subRow.prev_marks ?? null,
      upd.rows[0]?.marks_obtained ?? null,
    ]
  );

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'GRADE_SUBMISSION',
    entityType: 'SUBMISSION',
    entityId: submissionId,
    metadata: { offering_id: offeringId, marks_obtained: upd.rows[0]?.marks_obtained ?? null },
  });

  if (subRow.grades_published !== false && parsedMarks !== null) {
    const appOrigin = resolveFrontendAppUrl();
    void notifyUser({
      db,
      userId: subRow.student_id,
      email: subRow.student_email,
      offeringId,
      type: 'SUBMISSION_GRADED',
      title: `${subRow.course_code}: Graded — ${subRow.assignment_title}`,
      body: `You scored ${parsedMarks}/${maxMarks}${feedback ? `. Feedback: ${feedback}` : ''}`,
      linkPath: `/classroom?offeringId=${offeringId}`,
      emailSubject: `[${subRow.course_code}] Graded: ${subRow.assignment_title}`,
      emailHtml: renderNotificationEmailHtml({
        courseLabel: `${subRow.course_code} · ${subRow.course_name}`,
        heading: `Assignment Graded: ${subRow.assignment_title}`,
        body: `Hi ${subRow.student_name || 'Student'},\n\nGraded by ${req.user.name}.\nScore: ${parsedMarks} / ${maxMarks}${feedback ? `\nFeedback: ${feedback}` : ''}`,
        ctaLabel: 'View Feedback & Score',
        ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
      }),
    });
  }

  res.json({
    message: 'Grade & feedback saved',
    submission: { ...upd.rows[0], file_data: undefined },
  });
});

export default router;
