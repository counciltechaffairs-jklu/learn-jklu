import { getDb } from '../config/db.js';
import { parsePositiveInt } from '../config/env.js';
import { requireAuth, requireProfessorOrAdmin } from '../middleware/auth.js';
import {
  getCourseStaffPermissions,
  getStudentEnrollment,
} from '../utils/classroomAuth.js';
import {
  parseSectionsList,
  canStaffMutateItem,
  canStaffGradeTarget,
  canStaffAccessSection,
  canStudentViewTargets,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { writeAuditLog } from '../utils/security.js';
import {
  notifyUser,
  notifyCourseInstructors,
  renderNotificationEmailHtml,
  resolveFrontendAppUrl,
} from '../utils/emailService.js';
import { buildStudentSectionMap } from '../utils/classroomHelpers.js';

const router = createAsyncRouter();

const DEFAULT_WEIGHTS = { ASSIGNMENT: 30, LAB: 20, QUIZ: 20, PROJECT: 30 };

function parseWeights(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  if (!obj || typeof obj !== 'object') return { ...DEFAULT_WEIGHTS };
  return {
    ASSIGNMENT: Number(obj.ASSIGNMENT ?? DEFAULT_WEIGHTS.ASSIGNMENT) || 0,
    LAB: Number(obj.LAB ?? DEFAULT_WEIGHTS.LAB) || 0,
    QUIZ: Number(obj.QUIZ ?? DEFAULT_WEIGHTS.QUIZ) || 0,
    PROJECT: Number(obj.PROJECT ?? DEFAULT_WEIGHTS.PROJECT) || 0,
  };
}

function mapCategory(asgn) {
  const cat = String(asgn.weight_category || asgn.assignment_type || 'ASSIGNMENT')
    .trim()
    .toUpperCase();
  if (cat === 'TCS_ION_QUIZ' || cat === 'QUIZ') return 'QUIZ';
  if (cat === 'LAB') return 'LAB';
  if (cat === 'PROJECT') return 'PROJECT';
  return 'ASSIGNMENT';
}

function computeMedian(sortedNums) {
  if (!sortedNums.length) return null;
  const mid = Math.floor(sortedNums.length / 2);
  if (sortedNums.length % 2 === 0) {
    return Number(((sortedNums[mid - 1] + sortedNums[mid]) / 2).toFixed(2));
  }
  return Number(sortedNums[mid].toFixed(2));
}

function computeClassesNeededFor75(presentCount, totalCount) {
  if (!totalCount || totalCount <= 0) return 0;
  if ((presentCount / totalCount) * 100 >= 75) return 0;
  // Solve (present + x) / (total + x) >= 0.75 => x >= 3*total - 4*present
  return Math.max(0, Math.ceil(3 * totalCount - 4 * presentCount));
}

/**
 * GET /classroom/offerings/:id/my-grades
 * Unified Student Grades, Weighted Average, Class Benchmarks, Attendance & Re-evaluation eligibility.
 */
router.get('/classroom/offerings/:id/my-grades', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }

  const [offRes, perms, enrollment] = await Promise.all([
    db.query(
      `SELECT co.id, co.semester, co.academic_session, co.batch_year, co.reeval_enabled, co.grade_weights,
              COALESCE(co.course_code, c.code) AS course_code,
              COALESCE(co.course_name, c.name) AS course_name
       FROM course_offerings co
       LEFT JOIN courses c ON c.id = co.course_id
       WHERE co.id = $1 LIMIT 1`,
      [offeringId]
    ),
    getCourseStaffPermissions(db, offeringId, req.user),
    getStudentEnrollment(db, offeringId, req.user),
  ]);

  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }
  const off = offRes.rows[0];
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Access denied: not enrolled in this classroom.' });
    return;
  }

  const previewSection = req.query.section ? String(req.query.section).trim() : null;
  const studentSection = isStaff ? previewSection || 'Sec A' : enrollment?.section || 'Sec A';

  const [asgnRes, subRes, reevalRes, attSessRes, attRecRes] = await Promise.all([
    db.query(
      `SELECT id, title, assignment_type, weight_category, max_marks, due_at,
              target_sections, grades_published, reeval_enabled, rubric_json,
              is_group_assignment, created_at
       FROM classroom_assignments
       WHERE offering_id = $1
       ORDER BY created_at ASC`,
      [offeringId]
    ),
    db.query(
      `SELECT s.id, s.assignment_id, s.student_id, s.marks_obtained, s.feedback,
              s.rubric_scores, s.is_late, s.late_minutes, s.late_penalty_applied,
              s.graded_at, s.graded_by_name, s.submitted_at, s.group_id
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       WHERE ca.offering_id = $1 AND s.student_id = $2`,
      [offeringId, req.user.id]
    ),
    db.query(
      `SELECT * FROM reeval_requests
       WHERE offering_id = $1 AND student_id = $2
       ORDER BY created_at DESC`,
      [offeringId, req.user.id]
    ),
    db.query(
      `SELECT id, section, session_date, topic
       FROM attendance_sessions
       WHERE offering_id = $1 AND LOWER(section) = LOWER($2)
       ORDER BY session_date DESC`,
      [offeringId, studentSection]
    ),
    db.query(
      `SELECT ar.session_id, ar.status
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE s.offering_id = $1 AND ar.student_id = $2`,
      [offeringId, req.user.id]
    ),
  ]);

  const mySubByAsgn = new Map();
  for (const s of subRes.rows) {
    mySubByAsgn.set(Number(s.assignment_id), s);
  }
  const reevalBySubId = new Map();
  for (const r of reevalRes.rows) {
    const sid = Number(r.submission_id);
    if (!reevalBySubId.has(sid)) reevalBySubId.set(sid, r);
  }

  const courseReevalEnabled = off.reeval_enabled !== false;
  const weights = parseWeights(off.grade_weights);
  const categoryBuckets = {
    ASSIGNMENT: { obtained: 0, max: 0 },
    LAB: { obtained: 0, max: 0 },
    QUIZ: { obtained: 0, max: 0 },
    PROJECT: { obtained: 0, max: 0 },
  };

  let rawObtainedTotal = 0;
  let rawMaxTotal = 0;

  const items = asgnRes.rows
    .filter((a) => canStudentViewTargets(studentSection, a.target_sections))
    .map((a) => {
      const aid = Number(a.id);
      const mySub = mySubByAsgn.get(aid) || null;
      const published = a.grades_published !== false;
      const effectiveReeval =
        a.reeval_enabled !== null && a.reeval_enabled !== undefined
          ? Boolean(a.reeval_enabled)
          : courseReevalEnabled;

      const showMyMarks = Boolean(
        mySub &&
          mySub.marks_obtained !== null &&
          mySub.marks_obtained !== undefined &&
          (published || isStaff)
      );
      const myMarks = showMyMarks ? Number(mySub.marks_obtained) : null;
      const maxMarks = Number(a.max_marks || 100);
      const category = mapCategory(a);

      if (myMarks !== null && maxMarks > 0) {
        rawObtainedTotal += myMarks;
        rawMaxTotal += maxMarks;
        categoryBuckets[category].obtained += myMarks;
        categoryBuckets[category].max += maxMarks;
      }

      return {
        assignment_id: aid,
        title: a.title,
        assignment_type: a.assignment_type,
        weight_category: category,
        max_marks: maxMarks,
        due_at: a.due_at,
        grades_published: published,
        reeval_enabled: effectiveReeval,
        submission_id: mySub?.id ? Number(mySub.id) : null,
        submitted: Boolean(mySub),
        submitted_at: mySub?.submitted_at || null,
        is_late: Boolean(mySub?.is_late),
        late_minutes: Number(mySub?.late_minutes || 0),
        late_penalty_applied: Number(mySub?.late_penalty_applied || 0),
        marks_obtained: myMarks,
        marks_pending_release: Boolean(
          mySub && mySub.marks_obtained !== null && mySub.marks_obtained !== undefined && !published && !isStaff
        ),
        feedback: published || isStaff ? mySub?.feedback || null : null,
        rubric_json: Array.isArray(a.rubric_json) ? a.rubric_json : [],
        rubric_scores: published || isStaff ? mySub?.rubric_scores || {} : {},
        graded_at: published || isStaff ? mySub?.graded_at || null : null,
        graded_by_name: published || isStaff ? mySub?.graded_by_name || null : null,
        reeval_request: mySub?.id ? reevalBySubId.get(Number(mySub.id)) || null : null,
      };
    });

  let activeWeightSum = 0;
  let weightedEarned = 0;
  const categoryBreakdown = Object.entries(categoryBuckets).map(([cat, bucket]) => {
    const w = weights[cat] || 0;
    const pct = bucket.max > 0 ? Number(((bucket.obtained / bucket.max) * 100).toFixed(2)) : null;
    if (pct !== null && w > 0) {
      activeWeightSum += w;
      weightedEarned += (pct / 100) * w;
    }
    return {
      category: cat,
      weight_pct: w,
      obtained: Number(bucket.obtained.toFixed(2)),
      max: Number(bucket.max.toFixed(2)),
      pct,
    };
  });

  const weightedOverallPct =
    activeWeightSum > 0
      ? Number(((weightedEarned / activeWeightSum) * 100).toFixed(2))
      : rawMaxTotal > 0
        ? Number(((rawObtainedTotal / rawMaxTotal) * 100).toFixed(2))
        : null;

  const recMap = new Map(attRecRes.rows.map((r) => [Number(r.session_id), r.status]));
  const totalSessions = attSessRes.rows.length;
  let presentCount = 0;
  for (const sess of attSessRes.rows) {
    const st = recMap.get(Number(sess.id));
    if (st === 'PRESENT' || st === 'OD') presentCount += 1;
  }

  const storedPct =
    enrollment?.attendance_pct !== null && enrollment?.attendance_pct !== undefined
      ? Number(enrollment.attendance_pct)
      : null;
  const computedPct =
    totalSessions > 0 ? Number(((presentCount / totalSessions) * 100).toFixed(1)) : storedPct;

  res.json({
    offering: {
      id: offeringId,
      course_code: off.course_code,
      course_name: off.course_name,
      reeval_enabled: courseReevalEnabled,
      grade_weights: weights,
    },
    section: studentSection,
    summary: {
      raw_obtained: Number(rawObtainedTotal.toFixed(2)),
      raw_max: Number(rawMaxTotal.toFixed(2)),
      raw_pct: rawMaxTotal > 0 ? Number(((rawObtainedTotal / rawMaxTotal) * 100).toFixed(2)) : null,
      weighted_pct: weightedOverallPct,
      category_breakdown: categoryBreakdown,
    },
    attendance: {
      attendance_pct: computedPct,
      present_count: presentCount,
      total_sessions: totalSessions,
      classes_needed_for_75: computeClassesNeededFor75(presentCount, totalSessions),
    },
    items,
  });
});

/**
 * PATCH /classroom/offerings/:id/reeval-settings
 * Professor/Admin turns course-wide re-evaluation requests ON or OFF.
 */
router.patch('/classroom/offerings/:id/reeval-settings', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course instructors or admins can configure re-evaluation settings.' });
    return;
  }
  const enabled = Boolean(req.body?.reeval_enabled);
  const upd = await db.query(
    `UPDATE course_offerings SET reeval_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING id, reeval_enabled`,
    [enabled, offeringId]
  );
  if (upd.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }
  res.json({
    message: enabled ? 'Re-evaluation requests enabled for this course.' : 'Re-evaluation requests turned OFF for this course.',
    reeval_enabled: Boolean(upd.rows[0].reeval_enabled),
  });
});

/**
 * PATCH /classroom/assignments/:id/reeval-toggle
 * Professor turns re-evaluation ON, OFF, or inherits course setting (null) per assignment.
 */
router.patch('/classroom/assignments/:id/reeval-toggle', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const existing = await db.query('SELECT * FROM classroom_assignments WHERE id = $1 LIMIT 1', [assignmentId]);
  if (existing.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = existing.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(asgn.offering_id), req.user);
  if (!canStaffMutateItem(perms, asgn.target_sections, asgn.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: you do not have edit permissions for this assignment.' });
    return;
  }

  const rawVal = req.body?.reeval_enabled;
  const nextVal = rawVal === null || rawVal === undefined ? null : Boolean(rawVal);
  const upd = await db.query(
    'UPDATE classroom_assignments SET reeval_enabled = $1 WHERE id = $2 RETURNING id, reeval_enabled',
    [nextVal, assignmentId]
  );
  res.json({
    message: 'Assignment re-evaluation setting updated.',
    reeval_enabled: upd.rows[0].reeval_enabled,
  });
});

/**
 * PATCH /classroom/assignments/:id/publish-grades
 * Toggles Draft vs Published marks for an assignment; notifies & emails graded students when published.
 */
router.patch('/classroom/assignments/:id/publish-grades', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const asgnRes = await db.query(
    `SELECT ca.*, co.id AS oid,
            COALESCE(co.course_code, c.code) AS course_code,
            COALESCE(co.course_name, c.name) AS course_name
     FROM classroom_assignments ca
     JOIN course_offerings co ON co.id = ca.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE ca.id = $1 LIMIT 1`,
    [assignmentId]
  );
  if (asgnRes.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = asgnRes.rows[0];
  const offeringId = Number(asgn.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!canStaffGradeTarget(perms, asgn.target_sections)) {
    res.status(403).json({ detail: 'Not authorized to publish/hide grades for this assignment.' });
    return;
  }

  const publishNow = Boolean(req.body?.grades_published);
  const wasPublished = asgn.grades_published !== false;
  await db.query('UPDATE classroom_assignments SET grades_published = $1 WHERE id = $2', [
    publishNow,
    assignmentId,
  ]);

  if (publishNow && !wasPublished) {
    const subsRes = await db.query(
      `SELECT student_id, student_email, student_name, marks_obtained
       FROM assignment_submissions
       WHERE assignment_id = $1 AND marks_obtained IS NOT NULL`,
      [assignmentId]
    );
    const appOrigin = resolveFrontendAppUrl();
    for (const s of subsRes.rows) {
      const scoreText = `${s.marks_obtained}/${asgn.max_marks || 100}`;
      await notifyUser({
        db,
        userId: s.student_id,
        email: s.student_email,
        offeringId,
        type: 'GRADES_PUBLISHED',
        title: `${asgn.course_code}: Marks Published — ${asgn.title}`,
        body: `Your score (${scoreText}) for "${asgn.title}" is now published.`,
        linkPath: `/classroom?offeringId=${offeringId}`,
        emailSubject: `[${asgn.course_code}] Marks Released: ${asgn.title}`,
        emailHtml: renderNotificationEmailHtml({
          courseLabel: `${asgn.course_code} · ${asgn.course_name}`,
          heading: `Marks Released for ${asgn.title}`,
          body: `Hi ${s.student_name || 'Student'},\n\nYour marks (${scoreText}) have been published in Learn JKLU Classroom.`,
          ctaLabel: 'View My Grades',
          ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
        }),
      });
    }
  }

  res.json({
    message: publishNow ? 'Grades published to students.' : 'Grades hidden in draft mode.',
    grades_published: publishNow,
  });
});

/**
 * GET / PUT /classroom/offerings/:id/grade-weights
 */
router.get('/classroom/offerings/:id/grade-weights', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const off = await db.query('SELECT grade_weights FROM course_offerings WHERE id = $1 LIMIT 1', [
    offeringId,
  ]);
  if (off.rowCount === 0) {
    res.status(404).json({ detail: 'Course classroom not found' });
    return;
  }
  res.json({ grade_weights: parseWeights(off.rows[0].grade_weights) });
});

router.put('/classroom/offerings/:id/grade-weights', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors or admins can edit grading weights.' });
    return;
  }
  const next = {
    ASSIGNMENT: Number(req.body?.ASSIGNMENT ?? 0),
    LAB: Number(req.body?.LAB ?? 0),
    QUIZ: Number(req.body?.QUIZ ?? 0),
    PROJECT: Number(req.body?.PROJECT ?? 0),
  };
  for (const [k, v] of Object.entries(next)) {
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      res.status(400).json({ detail: `Invalid weight for ${k}` });
      return;
    }
  }
  const sum = next.ASSIGNMENT + next.LAB + next.QUIZ + next.PROJECT;
  if (Math.round(sum * 100) / 100 !== 100) {
    res.status(400).json({ detail: `Category weights must sum to 100% (currently ${sum}%).` });
    return;
  }

  await db.query(
    'UPDATE course_offerings SET grade_weights = $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(next), offeringId]
  );
  res.json({ message: 'Grading weights saved.', grade_weights: next });
});

/**
 * PUT /classroom/assignments/:id/rubric
 */
router.put('/classroom/assignments/:id/rubric', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const asgnRes = await db.query('SELECT * FROM classroom_assignments WHERE id = $1 LIMIT 1', [
    assignmentId,
  ]);
  if (asgnRes.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = asgnRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(asgn.offering_id), req.user);
  if (!canStaffMutateItem(perms, asgn.target_sections, asgn.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot edit rubric for this assignment.' });
    return;
  }

  const rawCriteria = Array.isArray(req.body?.criteria) ? req.body.criteria : [];
  const sanitized = [];
  for (let i = 0; i < Math.min(20, rawCriteria.length); i++) {
    const c = rawCriteria[i];
    const title = String(c?.title || '').trim().slice(0, 120);
    const maxMarks = Number(c?.max_marks ?? 0);
    if (!title || !Number.isFinite(maxMarks) || maxMarks <= 0) continue;
    sanitized.push({
      id: String(c?.id || `crit_${i + 1}`).slice(0, 40),
      title,
      max_marks: Number(maxMarks.toFixed(2)),
      description: String(c?.description || '').trim().slice(0, 240),
    });
  }

  await db.query('UPDATE classroom_assignments SET rubric_json = $1::jsonb WHERE id = $2', [
    JSON.stringify(sanitized),
    assignmentId,
  ]);
  res.json({ message: 'Rubric updated.', rubric_json: sanitized });
});

/**
 * GET /classroom/offerings/:id/grade-distribution
 */
router.get('/classroom/offerings/:id/grade-distribution', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const sectionFilter = req.query.section && req.query.section !== 'ALL' ? String(req.query.section).trim() : null;
  const [asgnRes, subRes, enrRes] = await Promise.all([
    db.query('SELECT id, title, max_marks, grades_published FROM classroom_assignments WHERE offering_id = $1 ORDER BY created_at ASC', [offeringId]),
    db.query(
      `SELECT s.assignment_id, s.student_id, s.student_email, s.marks_obtained
       FROM assignment_submissions s
       JOIN classroom_assignments ca ON ca.id = s.assignment_id
       WHERE ca.offering_id = $1 AND s.marks_obtained IS NOT NULL`,
      [offeringId]
    ),
    db.query('SELECT student_id, student_email, section FROM course_enrollments WHERE offering_id = $1', [offeringId]),
  ]);

  const secMap = buildStudentSectionMap(enrRes.rows);

  const pcts = [];
  const perAssignment = [];
  for (const a of asgnRes.rows) {
    const aid = Number(a.id);
    const maxM = Number(a.max_marks || 100);
    const matching = subRes.rows.filter((s) => {
      if (Number(s.assignment_id) !== aid) return false;
      if (!sectionFilter) return true;
      const stuSec = secMap.resolve(s.student_id, s.student_email);
      return stuSec.toLowerCase() === sectionFilter.toLowerCase();
    });
    const scores = matching.map((s) => Number(s.marks_obtained)).sort((x, y) => x - y);
    for (const sc of scores) {
      pcts.push(maxM > 0 ? (sc / maxM) * 100 : 0);
    }
    perAssignment.push({
      assignment_id: aid,
      title: a.title,
      max_marks: maxM,
      grades_published: a.grades_published !== false,
      graded_count: scores.length,
      avg: scores.length ? Number((scores.reduce((acc, v) => acc + v, 0) / scores.length).toFixed(2)) : null,
      median: computeMedian(scores),
      highest: scores.length ? scores[scores.length - 1] : null,
      lowest: scores.length ? scores[0] : null,
    });
  }

  const buckets = [
    { label: '0-39%', min: 0, max: 40, count: 0 },
    { label: '40-54%', min: 40, max: 55, count: 0 },
    { label: '55-69%', min: 55, max: 70, count: 0 },
    { label: '70-84%', min: 70, max: 85, count: 0 },
    { label: '85-100%', min: 85, max: Infinity, count: 0 },
  ];
  for (const p of pcts) {
    const b = buckets.find((x) => p >= x.min && p < x.max);
    if (b) b.count += 1;
  }

  res.json({
    section: sectionFilter || 'ALL',
    histogram: buckets.map(({ label, count }) => ({ label, count })),
    assignments: perAssignment,
  });
});

/**
 * POST /classroom/submissions/:id/reeval
 * Student requests re-evaluation ONLY when professor's course/assignment toggle is ON.
 */
router.post('/classroom/submissions/:id/reeval', requireAuth, async (req, res) => {
  const db = await getDb();
  const submissionId = parsePositiveInt(req.params.id);
  if (!submissionId) {
    res.status(400).json({ detail: 'Invalid submission ID' });
    return;
  }
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) {
    res.status(400).json({ detail: 'Please provide a clear re-evaluation reason (at least 5 characters).' });
    return;
  }

  const subRes = await db.query(
    `SELECT s.*, ca.offering_id, ca.title AS assignment_title, ca.grades_published,
            ca.reeval_enabled AS asgn_reeval_enabled, ca.target_sections,
            co.reeval_enabled AS course_reeval_enabled,
            COALESCE(co.course_code, c.code) AS course_code
     FROM assignment_submissions s
     JOIN classroom_assignments ca ON ca.id = s.assignment_id
     JOIN course_offerings co ON co.id = ca.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE s.id = $1 LIMIT 1`,
    [submissionId]
  );
  if (subRes.rowCount === 0) {
    res.status(404).json({ detail: 'Submission not found' });
    return;
  }
  const sub = subRes.rows[0];

  let ownsSubmission = Number(sub.student_id) === Number(req.user.id);
  if (!ownsSubmission && sub.group_id) {
    const gm = await db.query(
      'SELECT 1 FROM assignment_group_members WHERE group_id = $1 AND student_id = $2 LIMIT 1',
      [sub.group_id, req.user.id]
    );
    ownsSubmission = gm.rowCount > 0;
  }
  if (!ownsSubmission) {
    res.status(403).json({ detail: 'You can only request re-evaluation for your own submission.' });
    return;
  }

  const effectiveReeval =
    sub.asgn_reeval_enabled !== null && sub.asgn_reeval_enabled !== undefined
      ? Boolean(sub.asgn_reeval_enabled)
      : sub.course_reeval_enabled !== false;

  if (!effectiveReeval) {
    res.status(403).json({
      detail: 'Re-evaluation requests are currently turned off by the professor for this assignment.',
    });
    return;
  }
  if (sub.grades_published === false || sub.marks_obtained === null || sub.marks_obtained === undefined) {
    res.status(400).json({ detail: 'Re-evaluation can only be requested after marks are published.' });
    return;
  }

  const dup = await db.query(
    `SELECT id FROM reeval_requests WHERE submission_id = $1 AND status = 'PENDING' LIMIT 1`,
    [submissionId]
  );
  if (dup.rowCount > 0) {
    res.status(409).json({ detail: 'A pending re-evaluation request already exists for this submission.' });
    return;
  }

  const ins = await db.query(
    `INSERT INTO reeval_requests (offering_id, assignment_id, submission_id, student_id, reason, status, old_marks)
     VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
     RETURNING *`,
    [
      Number(sub.offering_id),
      Number(sub.assignment_id),
      submissionId,
      req.user.id,
      reason.slice(0, 1500),
      Number(sub.marks_obtained),
    ]
  );

  // Notify course professors
  await notifyCourseInstructors({
    db,
    offeringId: Number(sub.offering_id),
    type: 'REEVAL_REQUEST',
    title: `${sub.course_code}: Re-evaluation Request from ${req.user.name}`,
    body: `Assignment: ${sub.assignment_title} (Current marks: ${sub.marks_obtained}). Reason: ${reason}`,
    linkPath: `/classroom?offeringId=${sub.offering_id}`,
  });

  res.status(201).json({
    message: 'Re-evaluation request submitted to course faculty.',
    request: ins.rows[0],
  });
});

/**
 * GET /classroom/offerings/:id/reeval-requests
 */
router.get('/classroom/offerings/:id/reeval-requests', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_grade) {
    res.status(403).json({ detail: 'Only course grading staff can view re-evaluation requests.' });
    return;
  }

  const rowsRes = await db.query(
    `SELECT rr.*, ca.title AS assignment_title, ca.max_marks, ca.target_sections,
            u.name AS student_name, u.email AS student_email, ce.section AS student_section
     FROM reeval_requests rr
     JOIN classroom_assignments ca ON ca.id = rr.assignment_id
     JOIN users u ON u.id = rr.student_id
     LEFT JOIN course_enrollments ce ON ce.offering_id = rr.offering_id AND ce.student_id = rr.student_id
     WHERE rr.offering_id = $1
     ORDER BY CASE WHEN rr.status = 'PENDING' THEN 0 ELSE 1 END, rr.created_at DESC`,
    [offeringId]
  );

  const items = rowsRes.rows.map((r) => ({
    ...r,
    can_review: canStaffGradeTarget(perms, r.target_sections, r.student_section || 'Sec A'),
  }));

  res.json({ requests: items });
});

/**
 * PATCH /classroom/reeval-requests/:id
 * Professor/TA reviews and approves/rejects re-evaluation, updating marks + audit log + Resend email.
 */
router.patch('/classroom/reeval-requests/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const reqId = parsePositiveInt(req.params.id);
  if (!reqId) {
    res.status(400).json({ detail: 'Invalid re-evaluation request ID' });
    return;
  }

  const lookup = await db.query(
    `SELECT rr.*, ca.max_marks, ca.target_sections, ca.title AS assignment_title,
            s.group_id, s.student_email, s.student_name, ce.section AS student_section,
            COALESCE(co.course_code, c.code) AS course_code,
            COALESCE(co.course_name, c.name) AS course_name
     FROM reeval_requests rr
     JOIN classroom_assignments ca ON ca.id = rr.assignment_id
     JOIN assignment_submissions s ON s.id = rr.submission_id
     JOIN course_offerings co ON co.id = rr.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     LEFT JOIN course_enrollments ce ON ce.offering_id = rr.offering_id AND ce.student_id = rr.student_id
     WHERE rr.id = $1 LIMIT 1`,
    [reqId]
  );
  if (lookup.rowCount === 0) {
    res.status(404).json({ detail: 'Re-evaluation request not found' });
    return;
  }
  const rr = lookup.rows[0];
  const offeringId = Number(rr.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!canStaffGradeTarget(perms, rr.target_sections, rr.student_section || 'Sec A')) {
    res.status(403).json({ detail: 'Not authorized to review re-evaluation requests for this section.' });
    return;
  }

  const status = String(req.body?.status || '').trim().toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ detail: 'status must be APPROVED or REJECTED' });
    return;
  }

  let nextMarks = rr.old_marks !== null ? Number(rr.old_marks) : null;
  if (status === 'APPROVED' && req.body?.new_marks !== undefined && req.body?.new_marks !== null && req.body?.new_marks !== '') {
    const parsed = Number(req.body.new_marks);
    const maxMarks = Number(rr.max_marks || 100);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxMarks) {
      res.status(400).json({ detail: `new_marks must be between 0 and ${maxMarks}` });
      return;
    }
    nextMarks = parsed;
    if (rr.group_id) {
      await db.query(
        `UPDATE assignment_submissions
         SET marks_obtained = $1, graded_by_name = $2, graded_at = NOW(), updated_at = NOW()
         WHERE group_id = $3 AND assignment_id = $4`,
        [nextMarks, req.user.name, rr.group_id, rr.assignment_id]
      );
    } else {
      await db.query(
        `UPDATE assignment_submissions
         SET marks_obtained = $1, graded_by_name = $2, graded_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [nextMarks, req.user.name, rr.submission_id]
      );
    }
    await db.query(
      `INSERT INTO grading_audit_logs (offering_id, assignment_id, submission_id, student_id, grader_id, grader_name, grader_role, old_marks, new_marks, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'REEVAL')`,
      [
        offeringId,
        rr.assignment_id,
        rr.submission_id,
        rr.student_id,
        req.user.id,
        req.user.name,
        perms.is_ta ? 'TA' : 'Professor',
        rr.old_marks,
        nextMarks,
      ]
    );
  }

  const reviewerNote = req.body?.reviewer_note ? String(req.body.reviewer_note).trim().slice(0, 1000) : null;
  const upd = await db.query(
    `UPDATE reeval_requests
     SET status = $1, reviewer_id = $2, reviewer_name = $3, reviewer_note = $4, new_marks = $5, reviewed_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [status, req.user.id, req.user.name, reviewerNote, nextMarks, reqId]
  );

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'REVIEW_REEVAL',
    entityType: 'REEVAL_REQUEST',
    entityId: reqId,
    metadata: { offering_id: offeringId, status, new_marks: nextMarks },
  });

  const appOrigin = resolveFrontendAppUrl();
  await notifyUser({
    db,
    userId: rr.student_id,
    email: rr.student_email,
    offeringId,
    type: 'REEVAL_REVIEWED',
    title: `${rr.course_code}: Re-evaluation ${status} (${rr.assignment_title})`,
    body: `Your re-evaluation request was ${status.toLowerCase()} by ${req.user.name}.${nextMarks !== null ? ` Marks: ${nextMarks}/${rr.max_marks}.` : ''}${reviewerNote ? ` Note: ${reviewerNote}` : ''}`,
    linkPath: `/classroom?offeringId=${offeringId}`,
    emailSubject: `[${rr.course_code}] Re-evaluation ${status}: ${rr.assignment_title}`,
    emailHtml: renderNotificationEmailHtml({
      courseLabel: `${rr.course_code} · ${rr.course_name}`,
      heading: `Re-evaluation ${status}`,
      body: `Hi ${rr.student_name || 'Student'},\n\nYour re-evaluation request for "${rr.assignment_title}" has been ${status.toLowerCase()}.${nextMarks !== null ? `\nUpdated Marks: ${nextMarks}/${rr.max_marks}` : ''}${reviewerNote ? `\nFaculty Note: ${reviewerNote}` : ''}`,
      ctaLabel: 'Open Classroom',
      ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
    }),
  });

  res.json({ message: `Re-evaluation request ${status.toLowerCase()}.`, request: upd.rows[0] });
});

export default router;
