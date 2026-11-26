import path from 'node:path';
import JSZip from 'jszip';
import { getDb } from '../config/db.js';
import { parsePositiveInt, PUBLIC_BASE_URL } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { createMemoryUpload } from '../middleware/uploads.js';
import {
  getCourseStaffPermissions,
  getStudentEnrollment,
  mergeOfferingSections,
} from '../utils/classroomAuth.js';
import {
  parseSectionsList,
  resolvePostTargetsForStaff,
  canStaffMutateItem,
  canStaffGradeTarget,
  canStudentViewTargets,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { csvCell, safeContentDispositionFilename } from '../utils/security.js';
import {
  signCalendarToken,
  verifyCalendarToken,
  buildIcsFeed,
} from '../utils/calendarHelper.js';
import {
  notifyUser,
  notifyCourseInstructors,
  resolveFrontendAppUrl,
} from '../utils/emailService.js';
import {
  buildStudentSectionMap,
  formatLateDuration,
  computeLateSubmissionPenalty,
  resolveSubmissionGroupMembers,
} from '../utils/classroomHelpers.js';
import { computeAssignmentSimilarity } from '../utils/similarityCheck.js';

const router = createAsyncRouter();

const ALLOWED_SUBMISSION_EXT = new Set([
  '.pdf', '.zip', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.txt', '.py', '.cpp', '.c', '.ipynb', '.csv',
]);

const submissionBinaryUpload = createMemoryUpload({
  maxFileSizeMb: 25,
  allowedExtensions: ALLOWED_SUBMISSION_EXT,
  invalidTypeMessage: 'Unsupported file type. Upload PDF, ZIP, DOCX, PNG/JPG, TXT, or code notebooks.',
});

/* ============================================================================
 * 1. IN-APP CLASSROOM NOTIFICATIONS
 * ========================================================================== */
router.get('/classroom/notifications', requireAuth, async (req, res) => {
  const db = await getDb();
  const limit = Math.min(50, parsePositiveInt(req.query.limit) || 25);
  const [listRes, countRes] = await Promise.all([
    db.query(
      `SELECT id, offering_id, type, title, body, link_path, is_read, created_at
       FROM classroom_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    ),
    db.query(
      'SELECT COUNT(*)::int AS cnt FROM classroom_notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    ),
  ]);
  res.json({
    unread_count: Number(countRes.rows[0]?.cnt || 0),
    notifications: listRes.rows,
  });
});

router.patch('/classroom/notifications/read-all', requireAuth, async (req, res) => {
  const db = await getDb();
  await db.query('UPDATE classroom_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [
    req.user.id,
  ]);
  res.json({ message: 'All notifications marked as read.' });
});

router.patch('/classroom/notifications/:id/read', requireAuth, async (req, res) => {
  const db = await getDb();
  const notifId = parsePositiveInt(req.params.id);
  if (!notifId) {
    res.status(400).json({ detail: 'Invalid notification ID' });
    return;
  }
  await db.query('UPDATE classroom_notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [
    notifId,
    req.user.id,
  ]);
  res.json({ message: 'Notification marked as read.' });
});

/* ============================================================================
 * 2. PRIVATE 1-ON-1 SUBMISSION COMMENTS
 * ========================================================================== */
async function authorizeSubmissionThread(db, submissionId, user) {
  const lookup = await db.query(
    `SELECT s.id, s.student_id, s.student_email, s.student_name, s.group_id,
            s.assignment_id, ca.offering_id, ca.title AS assignment_title,
            COALESCE(co.course_code, c.code) AS course_code
     FROM assignment_submissions s
     JOIN classroom_assignments ca ON ca.id = s.assignment_id
     JOIN course_offerings co ON co.id = ca.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE s.id = $1 LIMIT 1`,
    [submissionId]
  );
  if (lookup.rowCount === 0) return { error: 404, detail: 'Submission not found' };
  const sub = lookup.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(sub.offering_id), user);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  let isOwner = Number(sub.student_id) === Number(user.id);
  if (!isOwner && sub.group_id) {
    const gm = await db.query(
      'SELECT 1 FROM assignment_group_members WHERE group_id = $1 AND student_id = $2 LIMIT 1',
      [sub.group_id, user.id]
    );
    isOwner = gm.rowCount > 0;
  }
  if (!isStaff && !isOwner) {
    return { error: 403, detail: 'Access denied to this private submission thread.' };
  }
  return { sub, perms, isStaff };
}

router.get('/classroom/submissions/:id/messages', requireAuth, async (req, res) => {
  const db = await getDb();
  const submissionId = parsePositiveInt(req.params.id);
  if (!submissionId) {
    res.status(400).json({ detail: 'Invalid submission ID' });
    return;
  }
  const auth = await authorizeSubmissionThread(db, submissionId, req.user);
  if (auth.error) {
    res.status(auth.error).json({ detail: auth.detail });
    return;
  }
  const msgs = await db.query(
    `SELECT * FROM submission_messages WHERE submission_id = $1 ORDER BY created_at ASC, id ASC`,
    [submissionId]
  );
  res.json({ messages: msgs.rows });
});

router.post('/classroom/submissions/:id/messages', requireAuth, async (req, res) => {
  const db = await getDb();
  const submissionId = parsePositiveInt(req.params.id);
  if (!submissionId) {
    res.status(400).json({ detail: 'Invalid submission ID' });
    return;
  }
  const text = String(req.body?.message || '').trim();
  if (!text) {
    res.status(400).json({ detail: 'Message cannot be empty.' });
    return;
  }
  const auth = await authorizeSubmissionThread(db, submissionId, req.user);
  if (auth.error) {
    res.status(auth.error).json({ detail: auth.detail });
    return;
  }
  const { sub, perms, isStaff } = auth;
  const senderRole = perms.is_instructor || perms.is_admin ? 'Professor' : perms.is_ta ? 'Teaching Assistant' : 'Student';
  const ins = await db.query(
    `INSERT INTO submission_messages (submission_id, offering_id, sender_id, sender_name, sender_role, message)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [submissionId, Number(sub.offering_id), req.user.id, req.user.name, senderRole, text.slice(0, 2000)]
  );

  // Notify opposite party
  if (isStaff) {
    await notifyUser({
      db,
      userId: sub.student_id,
      email: sub.student_email,
      offeringId: Number(sub.offering_id),
      type: 'SUBMISSION_COMMENT',
      title: `${sub.course_code}: Private comment on ${sub.assignment_title}`,
      body: `${req.user.name}: ${text}`,
      linkPath: `/classroom?offeringId=${sub.offering_id}`,
    });
  } else {
    await notifyCourseInstructors({
      db,
      offeringId: Number(sub.offering_id),
      type: 'SUBMISSION_COMMENT',
      title: `${sub.course_code}: ${req.user.name} commented on ${sub.assignment_title}`,
      body: text,
      linkPath: `/classroom?offeringId=${sub.offering_id}`,
    });
  }

  res.status(201).json({ message: ins.rows[0] });
});

/* ============================================================================
 * 3. ANNOUNCEMENT READ RECEIPTS ("SEEN BY")
 * ========================================================================== */
router.post('/classroom/announcements/:id/seen', requireAuth, async (req, res) => {
  const db = await getDb();
  const annId = parsePositiveInt(req.params.id);
  if (!annId) {
    res.status(400).json({ detail: 'Invalid announcement ID' });
    return;
  }
  await db.query(
    `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (announcement_id, user_id) DO NOTHING`,
    [annId, req.user.id]
  );
  res.json({ ok: true });
});

router.get('/classroom/announcements/:id/seen', requireAuth, async (req, res) => {
  const db = await getDb();
  const annId = parsePositiveInt(req.params.id);
  if (!annId) {
    res.status(400).json({ detail: 'Invalid announcement ID' });
    return;
  }
  const annRes = await db.query('SELECT offering_id FROM classroom_announcements WHERE id = $1 LIMIT 1', [annId]);
  if (annRes.rowCount === 0) {
    res.status(404).json({ detail: 'Announcement not found' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, Number(annRes.rows[0].offering_id), req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const reads = await db.query(
    `SELECT u.id, u.name, u.roll_no, ar.read_at
     FROM announcement_reads ar
     JOIN users u ON u.id = ar.user_id
     WHERE ar.announcement_id = $1
     ORDER BY ar.read_at DESC`,
    [annId]
  );
  res.json({ seen_count: reads.rowCount, viewers: reads.rows });
});

/* ============================================================================
 * 4. STREAM POLLS
 * ========================================================================== */
router.get('/classroom/offerings/:id/polls', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const [perms, enrollment, pollsRes] = await Promise.all([
    getCourseStaffPermissions(db, offeringId, req.user),
    getStudentEnrollment(db, offeringId, req.user),
    db.query('SELECT * FROM classroom_polls WHERE offering_id = $1 ORDER BY created_at DESC', [offeringId]),
  ]);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Not enrolled in this classroom.' });
    return;
  }

  const pollIds = pollsRes.rows.map((p) => Number(p.id));
  const votesRes =
    pollIds.length > 0
      ? await db.query('SELECT poll_id, user_id, option_index FROM classroom_poll_votes WHERE poll_id = ANY($1::int[])', [
          pollIds,
        ])
      : { rows: [] };

  const mySec = enrollment?.section || 'Sec A';
  const polls = pollsRes.rows
    .map((p) => {
      const targetSections = parseSectionsList(p.target_sections, ['ALL']);
      if (!isStaff && !canStudentViewTargets(mySec, targetSections)) return null;
      const options = Array.isArray(p.options_json) ? p.options_json : JSON.parse(p.options_json || '[]');
      const pollVotes = votesRes.rows.filter((v) => Number(v.poll_id) === Number(p.id));
      const counts = options.map((_, idx) => pollVotes.filter((v) => Number(v.option_index) === idx).length);
      const myVote = pollVotes.find((v) => Number(v.user_id) === Number(req.user.id));
      return {
        ...p,
        options,
        target_sections: targetSections,
        counts,
        total_votes: pollVotes.length,
        my_vote: myVote ? Number(myVote.option_index) : null,
        can_manage: isStaff ? canStaffMutateItem(perms, targetSections, p.created_by, req.user.id) : false,
      };
    })
    .filter(Boolean);

  res.json({ polls });
});

router.post('/classroom/offerings/:id/polls', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course professors or TAs can create polls.' });
    return;
  }
  const question = String(req.body?.question || '').trim();
  const options = Array.isArray(req.body?.options)
    ? req.body.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  if (!question || options.length < 2) {
    res.status(400).json({ detail: 'Provide a poll question and at least 2 options.' });
    return;
  }
  const targetRes = resolvePostTargetsForStaff(perms, req.body?.target_sections);
  if (!targetRes.ok) {
    res.status(403).json({ detail: targetRes.error });
    return;
  }
  await mergeOfferingSections(db, offeringId, targetRes.sections);

  const ins = await db.query(
    `INSERT INTO classroom_polls (offering_id, created_by, author_name, question, options_json, target_sections)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING *`,
    [offeringId, req.user.id, req.user.name, question, JSON.stringify(options), JSON.stringify(targetRes.sections)]
  );
  res.status(201).json({ message: 'Poll published.', poll: ins.rows[0] });
});

router.post('/classroom/polls/:id/vote', requireAuth, async (req, res) => {
  const db = await getDb();
  const pollId = parsePositiveInt(req.params.id);
  if (!pollId) {
    res.status(400).json({ detail: 'Invalid poll ID' });
    return;
  }
  const pollRes = await db.query('SELECT * FROM classroom_polls WHERE id = $1 LIMIT 1', [pollId]);
  if (pollRes.rowCount === 0) {
    res.status(404).json({ detail: 'Poll not found' });
    return;
  }
  const poll = pollRes.rows[0];
  if (poll.is_closed) {
    res.status(400).json({ detail: 'This poll is closed.' });
    return;
  }
  const [perms, enrollment] = await Promise.all([
    getCourseStaffPermissions(db, Number(poll.offering_id), req.user),
    getStudentEnrollment(db, Number(poll.offering_id), req.user),
  ]);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Not enrolled in this course.' });
    return;
  }
  if (!isStaff && !canStudentViewTargets(enrollment?.section || 'Sec A', poll.target_sections)) {
    res.status(403).json({ detail: 'Poll belongs to another section.' });
    return;
  }
  const options = Array.isArray(poll.options_json) ? poll.options_json : JSON.parse(poll.options_json || '[]');
  const optIdx = Number(req.body?.option_index);
  if (!Number.isInteger(optIdx) || optIdx < 0 || optIdx >= options.length) {
    res.status(400).json({ detail: 'Invalid option index.' });
    return;
  }
  await db.query(
    `INSERT INTO classroom_poll_votes (poll_id, user_id, option_index, voted_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (poll_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index, voted_at = NOW()`,
    [pollId, req.user.id, optIdx]
  );
  res.json({ message: 'Vote recorded.' });
});

router.patch('/classroom/polls/:id/close', requireAuth, async (req, res) => {
  const db = await getDb();
  const pollId = parsePositiveInt(req.params.id);
  const pollRes = await db.query('SELECT * FROM classroom_polls WHERE id = $1 LIMIT 1', [pollId]);
  if (pollRes.rowCount === 0) {
    res.status(404).json({ detail: 'Poll not found' });
    return;
  }
  const p = pollRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(p.offering_id), req.user);
  if (!canStaffMutateItem(perms, p.target_sections, p.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot close this poll.' });
    return;
  }
  await db.query('UPDATE classroom_polls SET is_closed = NOT is_closed WHERE id = $1', [pollId]);
  res.json({ message: 'Poll status updated.' });
});

router.delete('/classroom/polls/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const pollId = parsePositiveInt(req.params.id);
  const pollRes = await db.query('SELECT * FROM classroom_polls WHERE id = $1 LIMIT 1', [pollId]);
  if (pollRes.rowCount === 0) {
    res.status(404).json({ detail: 'Poll not found' });
    return;
  }
  const p = pollRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(p.offering_id), req.user);
  if (!canStaffMutateItem(perms, p.target_sections, p.created_by, req.user.id)) {
    res.status(403).json({ detail: 'Read-only: cannot delete this poll.' });
    return;
  }
  await db.query('DELETE FROM classroom_polls WHERE id = $1', [pollId]);
  res.json({ message: 'Poll deleted.' });
});

/* ============================================================================
 * 5. OFFICE HOURS SCHEDULING & BOOKING
 * ========================================================================== */
router.get('/classroom/offerings/:id/office-hours', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const [slotsRes, bookingsRes] = await Promise.all([
    db.query(
      `SELECT * FROM office_hour_slots WHERE offering_id = $1 AND ends_at >= NOW() - INTERVAL '7 days' ORDER BY starts_at ASC`,
      [offeringId]
    ),
    db.query(
      `SELECT b.* FROM office_hour_bookings b
       JOIN office_hour_slots s ON s.id = b.slot_id
       WHERE s.offering_id = $1`,
      [offeringId]
    ),
  ]);
  const slots = slotsRes.rows.map((s) => {
    const slotBookings = bookingsRes.rows.filter((b) => Number(b.slot_id) === Number(s.id));
    return {
      ...s,
      booked_count: slotBookings.length,
      my_booking: slotBookings.find((b) => Number(b.student_id) === Number(req.user.id)) || null,
      bookings: slotBookings,
    };
  });
  res.json({ slots });
});

router.post('/classroom/offerings/:id/office-hours', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Only course instructors or TAs can publish office hour slots.' });
    return;
  }
  const { location, starts_at, ends_at, max_bookings, notes } = req.body;
  const startD = new Date(starts_at);
  const endD = new Date(ends_at);
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime()) || endD <= startD) {
    res.status(400).json({ detail: 'Valid starts_at and ends_at (after start) are required.' });
    return;
  }
  const cap = Math.min(20, Math.max(1, Number(max_bookings || 1)));
  const ins = await db.query(
    `INSERT INTO office_hour_slots (offering_id, professor_id, professor_name, location, starts_at, ends_at, max_bookings, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      offeringId,
      req.user.id,
      req.user.name,
      String(location || 'Faculty Cabin / Online').trim(),
      startD.toISOString(),
      endD.toISOString(),
      cap,
      notes ? String(notes).trim() : null,
    ]
  );
  res.status(201).json({ message: 'Office hour slot added.', slot: ins.rows[0] });
});

router.post('/classroom/office-hours/:id/book', requireAuth, async (req, res) => {
  const db = await getDb();
  const slotId = parsePositiveInt(req.params.id);
  const slotRes = await db.query('SELECT * FROM office_hour_slots WHERE id = $1 LIMIT 1', [slotId]);
  if (slotRes.rowCount === 0) {
    res.status(404).json({ detail: 'Slot not found' });
    return;
  }
  const slot = slotRes.rows[0];
  const enrollment = await getStudentEnrollment(db, Number(slot.offering_id), req.user);
  if (!enrollment) {
    res.status(403).json({ detail: 'Only enrolled students can book office hours.' });
    return;
  }
  const cntRes = await db.query('SELECT COUNT(*)::int AS cnt FROM office_hour_bookings WHERE slot_id = $1', [slotId]);
  if (Number(cntRes.rows[0]?.cnt || 0) >= Number(slot.max_bookings || 1)) {
    res.status(409).json({ detail: 'This office hour slot is full.' });
    return;
  }
  await db.query(
    `INSERT INTO office_hour_bookings (slot_id, student_id, student_name, student_email, topic)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slot_id, student_id) DO UPDATE SET topic = EXCLUDED.topic`,
    [slotId, req.user.id, req.user.name, req.user.email, String(req.body?.topic || 'Course Doubt').trim()]
  );
  res.status(201).json({ message: 'Office hour slot booked!' });
});

router.delete('/classroom/office-hours/:id/book', requireAuth, async (req, res) => {
  const db = await getDb();
  const slotId = parsePositiveInt(req.params.id);
  await db.query('DELETE FROM office_hour_bookings WHERE slot_id = $1 AND student_id = $2', [
    slotId,
    req.user.id,
  ]);
  res.json({ message: 'Booking cancelled.' });
});

router.delete('/classroom/office-hours/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const slotId = parsePositiveInt(req.params.id);
  const slotRes = await db.query('SELECT offering_id, professor_id FROM office_hour_slots WHERE id = $1 LIMIT 1', [slotId]);
  if (slotRes.rowCount === 0) {
    res.status(404).json({ detail: 'Slot not found' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, Number(slotRes.rows[0].offering_id), req.user);
  if (!perms.can_manage_all_sections && Number(slotRes.rows[0].professor_id) !== Number(req.user.id)) {
    res.status(403).json({ detail: 'Only the slot owner or coordinator can remove it.' });
    return;
  }
  await db.query('DELETE FROM office_hour_slots WHERE id = $1', [slotId]);
  res.json({ message: 'Slot removed.' });
});

/* ============================================================================
 * 6. GOOGLE CALENDAR / ICS FEED SYNC
 * ========================================================================== */
router.get('/classroom/calendar/link', requireAuth, async (req, res) => {
  const token = signCalendarToken(req.user.id);
  const icsUrl = `${PUBLIC_BASE_URL}/classroom/calendar/${token}.ics`;
  const googleSubscribeUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
    icsUrl.replace(/^https?:\/\//i, 'webcal://')
  )}`;
  res.json({
    ics_url: icsUrl,
    google_subscribe_url: googleSubscribeUrl,
  });
});

router.get('/classroom/calendar/:token.ics', async (req, res) => {
  const db = await getDb();
  const userId = verifyCalendarToken(req.params.token);
  if (!userId) {
    res.status(403).send('Invalid or expired calendar subscription token.');
    return;
  }

  const userRes = await db.query('SELECT id, email, name, is_admin, admin_role FROM users WHERE id = $1 LIMIT 1', [
    userId,
  ]);
  if (userRes.rowCount === 0) {
    res.status(404).send('User not found.');
    return;
  }
  const u = userRes.rows[0];
  const appOrigin = resolveFrontendAppUrl();

  const [enrRes, instRes, taRes] = await Promise.all([
    db.query(
      'SELECT offering_id, section FROM course_enrollments WHERE student_id = $1 OR LOWER(student_email) = LOWER($2)',
      [u.id, u.email]
    ),
    db.query('SELECT offering_id FROM course_instructors WHERE professor_id = $1', [u.id]),
    db.query('SELECT offering_id FROM course_tas WHERE user_id = $1 OR LOWER(public_email) = LOWER($2)', [
      u.id,
      u.email,
    ]),
  ]);

  const staffOffIds = new Set([
    ...instRes.rows.map((r) => Number(r.offering_id)),
    ...taRes.rows.map((r) => Number(r.offering_id)),
  ]);
  const sectionByOff = new Map(enrRes.rows.map((r) => [Number(r.offering_id), r.section || 'Sec A']));
  const offeringIds = Array.from(new Set([...staffOffIds, ...sectionByOff.keys()]));

  if (offeringIds.length === 0) {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(buildIcsFeed([], 'Learn JKLU Tasks'));
    return;
  }

  const tasksRes = await db.query(
    `SELECT ca.id, ca.offering_id, ca.title, ca.description, ca.assignment_type, ca.due_at,
            ca.max_marks, ca.target_sections,
            COALESCE(co.course_code, c.code) AS course_code,
            COALESCE(co.course_name, c.name) AS course_name
     FROM classroom_assignments ca
     JOIN course_offerings co ON co.id = ca.offering_id
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE ca.offering_id = ANY($1::int[]) AND ca.due_at IS NOT NULL
     ORDER BY ca.due_at ASC`,
    [offeringIds]
  );

  const events = [];
  for (const t of tasksRes.rows) {
    const oid = Number(t.offering_id);
    if (!staffOffIds.has(oid)) {
      const sec = sectionByOff.get(oid) || 'Sec A';
      if (!canStudentViewTargets(sec, t.target_sections)) continue;
    }
    const startMs = new Date(t.due_at).getTime();
    if (Number.isNaN(startMs)) continue;
    events.push({
      uid: `asgn-${t.id}@learn-jklu.edu.in`,
      title: `[${t.course_code}] ${t.title} (${t.assignment_type})`,
      description: `${t.course_name}\nMax Marks: ${t.max_marks || 100}\n${t.description || ''}`,
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(startMs + 60 * 60 * 1000).toISOString(),
      location: 'Learn JKLU Classroom',
      url: `${appOrigin}/classroom?offeringId=${oid}`,
    });
  }

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="Learn_JKLU_Deadlines.ics"');
  res.send(buildIcsFeed(events, 'Learn JKLU Classroom Deadlines'));
});

/* ============================================================================
 * 7. NATIVE FILE SUBMISSIONS, VERSION HISTORY, ZIP BULK DOWNLOAD & CLONE
 * ========================================================================== */
router.post(
  '/classroom/assignments/:id/submit-file',
  requireAuth,
  submissionBinaryUpload.single('file'),
  async (req, res) => {
    const db = await getDb();
    const assignmentId = parsePositiveInt(req.params.id);
    if (!assignmentId) {
      res.status(400).json({ detail: 'Invalid assignment ID' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ detail: 'No submission file uploaded.' });
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
    const enrollment = await getStudentEnrollment(db, Number(asgn.offering_id), req.user);
    const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
    if (!enrollment && !perms.can_manage_course) {
      res.status(403).json({ detail: 'Only enrolled students can submit assignments.' });
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

    const existingSub = await db.query(
      'SELECT id, marks_obtained FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2 LIMIT 1',
      [assignmentId, req.user.id]
    );
    if (
      existingSub.rowCount > 0 &&
      existingSub.rows[0].marks_obtained !== null &&
      existingSub.rows[0].marks_obtained !== undefined
    ) {
      res.status(409).json({
        detail: 'This submission has already been graded. Request re-evaluation or ask faculty to unlock.',
      });
      return;
    }

    const grpRes = await resolveSubmissionGroupMembers(db, {
      assignment: asgn,
      userId: req.user.id,
      isStaff,
    });
    if (!grpRes.ok) {
      res.status(400).json({ detail: grpRes.error });
      return;
    }
    const activeGroupId = grpRes.groupId;
    const groupMembers = grpRes.members;

    const cleanName = path.basename(req.file.originalname || 'submission.bin').slice(0, 180);
    const notes = req.body?.submission_notes ? String(req.body.submission_notes).trim().slice(0, 1500) : null;

    const upRes = await db.query(
      `INSERT INTO assignment_submissions (
         assignment_id, student_id, student_name, student_email, student_roll_no,
         submission_url, file_name, file_mime, file_data, file_size,
         upload_mode, submission_notes, is_late, late_minutes, late_penalty_applied,
         group_id, version_count, submitted_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, '', $6, $7, $8, $9, 'NATIVE_UPLOAD', $10, $11, $12, $13, $14, 1, NOW(), NOW())
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         file_mime = EXCLUDED.file_mime,
         file_data = EXCLUDED.file_data,
         file_size = EXCLUDED.file_size,
         upload_mode = 'NATIVE_UPLOAD',
         submission_notes = EXCLUDED.submission_notes,
         is_late = EXCLUDED.is_late,
         late_minutes = EXCLUDED.late_minutes,
         late_penalty_applied = EXCLUDED.late_penalty_applied,
         group_id = EXCLUDED.group_id,
         version_count = COALESCE(assignment_submissions.version_count, 1) + 1,
         submitted_at = NOW(),
         updated_at = NOW()
       RETURNING id, assignment_id, student_id, file_name, file_mime, file_size, version_count, is_late, late_minutes, late_penalty_applied`,
      [
        assignmentId,
        req.user.id,
        req.user.name,
        req.user.email,
        req.user.roll_no || null,
        cleanName,
        req.file.mimetype || 'application/octet-stream',
        req.file.buffer,
        req.file.size,
        notes,
        isLate,
        lateMinutes,
        latePenaltyApplied,
        activeGroupId,
      ]
    );

    const saved = upRes.rows[0];
    const nativeUrl = `${PUBLIC_BASE_URL}/classroom/submissions/${saved.id}/file`;
    await db.query('UPDATE assignment_submissions SET submission_url = $1 WHERE id = $2', [
      nativeUrl,
      saved.id,
    ]);
    await db.query(
      `INSERT INTO submission_versions (submission_id, version_no, submission_url, submission_notes, file_name, file_mime, file_size, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        saved.id,
        Number(saved.version_count || 1),
        nativeUrl,
        notes,
        cleanName,
        req.file.mimetype || 'application/octet-stream',
        req.file.size,
        req.user.id,
      ]
    );

    if (activeGroupId && groupMembers.length > 0) {
      for (const gm of groupMembers) {
        if (Number(gm.student_id) === Number(req.user.id)) continue;
        await db.query(
          `INSERT INTO assignment_submissions (
             assignment_id, student_id, student_name, student_email,
             submission_url, file_name, file_mime, file_data, file_size,
             upload_mode, submission_notes, is_late, late_minutes, late_penalty_applied,
             group_id, submitted_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'NATIVE_UPLOAD', $10, $11, $12, $13, $14, NOW(), NOW())
           ON CONFLICT (assignment_id, student_id) DO UPDATE SET
             submission_url = EXCLUDED.submission_url,
             file_name = EXCLUDED.file_name,
             file_mime = EXCLUDED.file_mime,
             file_data = EXCLUDED.file_data,
             file_size = EXCLUDED.file_size,
             upload_mode = 'NATIVE_UPLOAD',
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
            nativeUrl,
            cleanName,
            req.file.mimetype || 'application/octet-stream',
            req.file.buffer,
            req.file.size,
            notes,
            isLate,
            lateMinutes,
            latePenaltyApplied,
            activeGroupId,
          ]
        );
      }
    }

    if (isLate && !isStaff) {
      const lateLabel = formatLateDuration(lateMinutes);
      void notifyCourseInstructors({
        db,
        offeringId: Number(asgn.offering_id),
        type: 'LATE_SUBMISSION',
        title: `Late submission: ${asgn.title}`,
        body: `${req.user.name} submitted "${cleanName}" (${lateLabel}).`,
        linkPath: `/classroom?offeringId=${asgn.offering_id}`,
      });
    }

    res.status(201).json({
      message: `Uploaded "${cleanName}" (Version ${saved.version_count}) cleanly!`,
      submission: { ...saved, submission_url: nativeUrl },
    });
  }
);

router.get('/classroom/submissions/:id/file', requireAuth, async (req, res) => {
  const db = await getDb();
  const submissionId = parsePositiveInt(req.params.id);
  if (!submissionId) {
    res.status(400).json({ detail: 'Invalid submission ID' });
    return;
  }
  const auth = await authorizeSubmissionThread(db, submissionId, req.user);
  if (auth.error) {
    res.status(auth.error).json({ detail: auth.detail });
    return;
  }
  const fileRes = await db.query(
    'SELECT file_name, file_mime, file_data FROM assignment_submissions WHERE id = $1 LIMIT 1',
    [submissionId]
  );
  const row = fileRes.rows[0];
  if (!row || !row.file_data) {
    res.status(404).json({ detail: 'No binary file uploaded for this submission.' });
    return;
  }
  const mime = row.file_mime || 'application/octet-stream';
  const disp = mime === 'application/pdf' || mime.startsWith('image/') ? 'inline' : 'attachment';
  res.setHeader('Content-Type', mime);
  res.setHeader(
    'Content-Disposition',
    `${disp}; filename="${safeContentDispositionFilename(row.file_name || 'submission.bin')}"`
  );
  res.send(Buffer.from(row.file_data));
});

router.get('/classroom/submissions/:id/versions', requireAuth, async (req, res) => {
  const db = await getDb();
  const submissionId = parsePositiveInt(req.params.id);
  if (!submissionId) {
    res.status(400).json({ detail: 'Invalid submission ID' });
    return;
  }
  const auth = await authorizeSubmissionThread(db, submissionId, req.user);
  if (auth.error) {
    res.status(auth.error).json({ detail: auth.detail });
    return;
  }
  const vers = await db.query(
    'SELECT id, version_no, submission_url, submission_notes, file_name, file_mime, file_size, created_at FROM submission_versions WHERE submission_id = $1 ORDER BY version_no DESC',
    [submissionId]
  );
  res.json({ versions: vers.rows });
});

router.get('/classroom/assignments/:id/submissions-zip', requireAuth, async (req, res) => {
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
  if (!perms.can_grade) {
    res.status(403).json({ detail: 'Staff grading permission required for bulk download.' });
    return;
  }

  const sectionFilter = req.query.section && req.query.section !== 'ALL' ? String(req.query.section).trim() : null;
  const [subsRes, enrRes] = await Promise.all([
    db.query('SELECT * FROM assignment_submissions WHERE assignment_id = $1 ORDER BY student_roll_no ASC NULLS LAST', [
      assignmentId,
    ]),
    db.query('SELECT student_id, student_email, section FROM course_enrollments WHERE offering_id = $1', [
      Number(asgn.offering_id),
    ]),
  ]);

  const secMap = buildStudentSectionMap(enrRes.rows);

  const zip = new JSZip();
  const manifestLines = ['RollNo,Name,Email,Section,Mode,SubmittedAt,Late,URL'];

  for (const s of subsRes.rows) {
    const stuSec = secMap.resolve(s.student_id, s.student_email);
    if (sectionFilter && stuSec.toLowerCase() !== sectionFilter.toLowerCase()) continue;
    if (!canStaffGradeTarget(perms, asgn.target_sections, stuSec)) continue;

    manifestLines.push(
      [
        csvCell(s.student_roll_no || ''),
        csvCell(s.student_name || ''),
        csvCell(s.student_email || ''),
        csvCell(stuSec),
        csvCell(s.upload_mode || ''),
        csvCell(s.submitted_at ? new Date(s.submitted_at).toISOString() : ''),
        csvCell(s.is_late ? 'YES' : 'NO'),
        csvCell(s.submission_url || ''),
      ].join(',')
    );

    if (s.file_data) {
      const prefix = `${(s.student_roll_no || `stu_${s.student_id}`).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const fname = path.basename(s.file_name || 'submission.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
      zip.file(`${prefix}_${fname}`, Buffer.from(s.file_data));
    }
  }

  zip.file('links_manifest.csv', manifestLines.join('\r\n'));
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zipFilename = safeContentDispositionFilename(`${asgn.title || 'submissions'}_bundle.zip`);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
  res.send(zipBuf);
});

router.post('/classroom/assignments/:id/clone', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const origRes = await db.query('SELECT * FROM classroom_assignments WHERE id = $1 LIMIT 1', [assignmentId]);
  if (origRes.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const orig = origRes.rows[0];
  const targetOfferingId = parsePositiveInt(req.body?.target_offering_id) || Number(orig.offering_id);
  const perms = await getCourseStaffPermissions(db, targetOfferingId, req.user);
  if (!perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Not authorized to clone into target course.' });
    return;
  }
  const nextTitle = String(req.body?.title || `${orig.title} (Copy)`).trim();
  const targetRes = resolvePostTargetsForStaff(perms, orig.target_sections);
  const nextTargets = targetRes.ok ? targetRes.sections : ['ALL'];

  const ins = await db.query(
    `INSERT INTO classroom_assignments (
       offering_id, created_by, creator_name, title, description, assignment_type, topic_module,
       resource_links, tcs_ion_launch_url, tcs_ion_exam_code, due_at, allow_late, max_marks,
       target_sections, grades_published, reeval_enabled, rubric_json, late_penalty_pct_per_day,
       grace_minutes, is_group_assignment, max_group_size, weight_category
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14::jsonb, FALSE, $15, $16::jsonb, $17, $18, $19, $20, $21)
     RETURNING *`,
    [
      targetOfferingId,
      req.user.id,
      req.user.name,
      nextTitle,
      orig.description,
      orig.assignment_type,
      orig.topic_module,
      JSON.stringify(orig.resource_links || []),
      orig.tcs_ion_launch_url,
      orig.tcs_ion_exam_code,
      orig.due_at || new Date(Date.now() + 7 * 86400000).toISOString(),
      orig.allow_late !== false,
      orig.max_marks || 100,
      JSON.stringify(nextTargets),
      orig.reeval_enabled,
      JSON.stringify(orig.rubric_json || []),
      orig.late_penalty_pct_per_day || 0,
      orig.grace_minutes || 0,
      Boolean(orig.is_group_assignment),
      orig.max_group_size || 4,
      orig.weight_category || 'ASSIGNMENT',
    ]
  );

  res.status(201).json({ message: `Cloned assignment as "${nextTitle}"`, assignment: ins.rows[0] });
});

/* ============================================================================
 * 8. STRICT IN-PORTAL GROUP FORMATION (AT MOST 1 GROUP PER STUDENT PER ASSIGNMENT)
 * ========================================================================== */
router.get('/classroom/assignments/:id/groups', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  if (!assignmentId) {
    res.status(400).json({ detail: 'Invalid assignment ID' });
    return;
  }
  const asgnRes = await db.query('SELECT id, offering_id, max_group_size, is_group_assignment FROM classroom_assignments WHERE id = $1 LIMIT 1', [
    assignmentId,
  ]);
  if (asgnRes.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = asgnRes.rows[0];
  const [groupsRes, membersRes] = await Promise.all([
    db.query('SELECT * FROM assignment_groups WHERE assignment_id = $1 ORDER BY created_at ASC', [assignmentId]),
    db.query('SELECT * FROM assignment_group_members WHERE assignment_id = $1 ORDER BY joined_at ASC', [assignmentId]),
  ]);

  let myGroupId = null;
  const membersByGroup = new Map();
  for (const m of membersRes.rows) {
    const gid = Number(m.group_id);
    if (Number(m.student_id) === Number(req.user.id)) myGroupId = gid;
    if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
    membersByGroup.get(gid).push(m);
  }

  const groups = groupsRes.rows.map((g) => ({
    ...g,
    members: membersByGroup.get(Number(g.id)) || [],
  }));

  res.json({
    is_group_assignment: Boolean(asgn.is_group_assignment),
    max_group_size: Number(asgn.max_group_size || 4),
    my_group_id: myGroupId,
    groups,
  });
});

router.post('/classroom/assignments/:id/groups', requireAuth, async (req, res) => {
  const db = await getDb();
  const assignmentId = parsePositiveInt(req.params.id);
  const name = String(req.body?.name || '').trim();
  if (!assignmentId || !name) {
    res.status(400).json({ detail: 'Group name is required.' });
    return;
  }
  const asgnRes = await db.query('SELECT * FROM classroom_assignments WHERE id = $1 LIMIT 1', [assignmentId]);
  if (asgnRes.rowCount === 0) {
    res.status(404).json({ detail: 'Assignment not found' });
    return;
  }
  const asgn = asgnRes.rows[0];
  const offeringId = Number(asgn.offering_id);
  const [perms, enrollment] = await Promise.all([
    getCourseStaffPermissions(db, offeringId, req.user),
    getStudentEnrollment(db, offeringId, req.user),
  ]);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({ detail: 'Only enrolled students can form assignment groups.' });
    return;
  }

  if (!isStaff) {
    const existingMember = await db.query(
      'SELECT group_id FROM assignment_group_members WHERE assignment_id = $1 AND student_id = $2 LIMIT 1',
      [assignmentId, req.user.id]
    );
    if (existingMember.rowCount > 0) {
      res.status(409).json({
        detail: 'You already belong to a group in this assignment. Leave your current group before creating a new one.',
      });
      return;
    }
  }

  const grpIns = await db.query(
    `INSERT INTO assignment_groups (assignment_id, offering_id, name, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [assignmentId, offeringId, name.slice(0, 80), req.user.id]
  );
  const group = grpIns.rows[0];

  if (!isStaff) {
    await db.query(
      `INSERT INTO assignment_group_members (group_id, assignment_id, student_id, student_email, student_name, role)
       VALUES ($1, $2, $3, $4, $5, 'leader')`,
      [group.id, assignmentId, req.user.id, req.user.email, req.user.name]
    );
  }

  res.status(201).json({ message: `Group "${group.name}" created.`, group });
});

router.post('/classroom/groups/:id/join', requireAuth, async (req, res) => {
  const db = await getDb();
  const groupId = parsePositiveInt(req.params.id);
  if (!groupId) {
    res.status(400).json({ detail: 'Invalid group ID' });
    return;
  }
  const grpRes = await db.query(
    `SELECT ag.*, ca.max_group_size, ca.target_sections
     FROM assignment_groups ag
     JOIN classroom_assignments ca ON ca.id = ag.assignment_id
     WHERE ag.id = $1 LIMIT 1`,
    [groupId]
  );
  if (grpRes.rowCount === 0) {
    res.status(404).json({ detail: 'Group not found' });
    return;
  }
  const grp = grpRes.rows[0];
  if (grp.is_locked) {
    res.status(403).json({ detail: 'This group has been locked by faculty.' });
    return;
  }
  const enrollment = await getStudentEnrollment(db, Number(grp.offering_id), req.user);
  if (!enrollment) {
    res.status(403).json({ detail: 'Only enrolled students can join groups.' });
    return;
  }
  if (!canStudentViewTargets(enrollment.section || 'Sec A', grp.target_sections)) {
    res.status(403).json({ detail: 'Assignment belongs to a different section.' });
    return;
  }

  const existing = await db.query(
    'SELECT group_id FROM assignment_group_members WHERE assignment_id = $1 AND student_id = $2 LIMIT 1',
    [grp.assignment_id, req.user.id]
  );
  if (existing.rowCount > 0) {
    res.status(409).json({
      detail: 'A student can only join one group per assignment. Leave your existing group first.',
    });
    return;
  }

  const cntRes = await db.query('SELECT COUNT(*)::int AS cnt FROM assignment_group_members WHERE group_id = $1', [
    groupId,
  ]);
  if (Number(cntRes.rows[0]?.cnt || 0) >= Number(grp.max_group_size || 4)) {
    res.status(409).json({ detail: `Group is already full (max ${grp.max_group_size || 4} members).` });
    return;
  }

  try {
    await db.query(
      `INSERT INTO assignment_group_members (group_id, assignment_id, student_id, student_email, student_name, role)
       VALUES ($1, $2, $3, $4, $5, 'member')`,
      [groupId, grp.assignment_id, req.user.id, req.user.email, req.user.name]
    );
  } catch (err) {
    if (err?.code === '23505') {
      res.status(409).json({ detail: 'You already belong to a group for this assignment.' });
      return;
    }
    throw err;
  }

  res.json({ message: `Joined group "${grp.name}".` });
});

router.delete('/classroom/groups/:id/leave', requireAuth, async (req, res) => {
  const db = await getDb();
  const groupId = parsePositiveInt(req.params.id);
  const grpRes = await db.query('SELECT * FROM assignment_groups WHERE id = $1 LIMIT 1', [groupId]);
  if (grpRes.rowCount === 0) {
    res.status(404).json({ detail: 'Group not found' });
    return;
  }
  const grp = grpRes.rows[0];
  if (grp.is_locked) {
    res.status(403).json({ detail: 'Group is locked by instructor; ask faculty to unlock or remove you.' });
    return;
  }
  await db.query('DELETE FROM assignment_group_members WHERE group_id = $1 AND student_id = $2', [
    groupId,
    req.user.id,
  ]);
  const rem = await db.query('SELECT COUNT(*)::int AS cnt FROM assignment_group_members WHERE group_id = $1', [
    groupId,
  ]);
  if (Number(rem.rows[0]?.cnt || 0) === 0) {
    await db.query('DELETE FROM assignment_groups WHERE id = $1', [groupId]);
  }
  res.json({ message: 'Left assignment group.' });
});

router.patch('/classroom/groups/:id/lock', requireAuth, async (req, res) => {
  const db = await getDb();
  const groupId = parsePositiveInt(req.params.id);
  const grpRes = await db.query('SELECT * FROM assignment_groups WHERE id = $1 LIMIT 1', [groupId]);
  if (grpRes.rowCount === 0) {
    res.status(404).json({ detail: 'Group not found' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, Number(grpRes.rows[0].offering_id), req.user);
  if (!perms.can_manage_course && !perms.can_announce) {
    res.status(403).json({ detail: 'Staff permission required.' });
    return;
  }
  const nextLock = req.body?.is_locked !== undefined ? Boolean(req.body.is_locked) : !grpRes.rows[0].is_locked;
  await db.query('UPDATE assignment_groups SET is_locked = $1 WHERE id = $2', [nextLock, groupId]);
  res.json({ message: nextLock ? 'Group locked.' : 'Group unlocked.', is_locked: nextLock });
});

router.post('/classroom/groups/:id/members', requireAuth, async (req, res) => {
  const db = await getDb();
  const groupId = parsePositiveInt(req.params.id);
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!groupId || !email) {
    res.status(400).json({ detail: 'Student email is required.' });
    return;
  }
  const grpRes = await db.query(
    `SELECT ag.*, ca.max_group_size FROM assignment_groups ag JOIN classroom_assignments ca ON ca.id = ag.assignment_id WHERE ag.id = $1 LIMIT 1`,
    [groupId]
  );
  if (grpRes.rowCount === 0) {
    res.status(404).json({ detail: 'Group not found' });
    return;
  }
  const grp = grpRes.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(grp.offering_id), req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Only instructors can manually add students to a group.' });
    return;
  }
  const uRes = await db.query('SELECT id, name, email FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  if (uRes.rowCount === 0) {
    res.status(404).json({ detail: 'Student account not found.' });
    return;
  }
  const stu = uRes.rows[0];
  const dup = await db.query(
    'SELECT group_id FROM assignment_group_members WHERE assignment_id = $1 AND student_id = $2 LIMIT 1',
    [grp.assignment_id, stu.id]
  );
  if (dup.rowCount > 0) {
    res.status(409).json({ detail: `${stu.name} is already in a group for this assignment.` });
    return;
  }
  const cntRes = await db.query('SELECT COUNT(*)::int AS cnt FROM assignment_group_members WHERE group_id = $1', [
    groupId,
  ]);
  if (Number(cntRes.rows[0]?.cnt || 0) >= Number(grp.max_group_size || 4)) {
    res.status(409).json({ detail: 'Group has reached maximum size.' });
    return;
  }
  await db.query(
    `INSERT INTO assignment_group_members (group_id, assignment_id, student_id, student_email, student_name, role)
     VALUES ($1, $2, $3, $4, $5, 'member')`,
    [groupId, grp.assignment_id, stu.id, stu.email, stu.name]
  );
  res.status(201).json({ message: `Added ${stu.name} to "${grp.name}".` });
});

router.delete('/classroom/groups/:id/members/:studentId', requireAuth, async (req, res) => {
  const db = await getDb();
  const groupId = parsePositiveInt(req.params.id);
  const studentId = parsePositiveInt(req.params.studentId);
  const grpRes = await db.query('SELECT offering_id FROM assignment_groups WHERE id = $1 LIMIT 1', [groupId]);
  if (grpRes.rowCount === 0) {
    res.status(404).json({ detail: 'Group not found' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, Number(grpRes.rows[0].offering_id), req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({ detail: 'Instructor permission required.' });
    return;
  }
  await db.query('DELETE FROM assignment_group_members WHERE group_id = $1 AND student_id = $2', [
    groupId,
    studentId,
  ]);
  res.json({ message: 'Removed student from group.' });
});

/* ============================================================================
 * 9. BUILT-IN PLAGIARISM / SIMILARITY CHECK (TEXT, CODE & FILE HASHES)
 * ========================================================================== */
router.get('/classroom/assignments/:id/similarity', requireAuth, async (req, res) => {
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
  if (!perms.can_grade && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Staff grading permission required to run similarity checks.' });
    return;
  }

  const sectionFilter =
    req.query.section && req.query.section !== 'ALL' ? String(req.query.section).trim() : null;

  const [subsRes, enrRes] = await Promise.all([
    db.query(
      `SELECT id, student_id, student_name, student_email, student_roll_no,
              submission_notes, file_name, file_mime, file_data, file_sha256, group_id
       FROM assignment_submissions
       WHERE assignment_id = $1`,
      [assignmentId]
    ),
    db.query(
      'SELECT student_id, student_email, section FROM course_enrollments WHERE offering_id = $1',
      [Number(asgn.offering_id)]
    ),
  ]);

  const secMap = buildStudentSectionMap(enrRes.rows);

  const scopedSubs = subsRes.rows.filter((s) => {
    const stuSec = secMap.resolve(s.student_id, s.student_email);
    if (sectionFilter && stuSec.toLowerCase() !== sectionFilter.toLowerCase()) return false;
    return canStaffGradeTarget(perms, asgn.target_sections, stuSec);
  });

  const report = computeAssignmentSimilarity(scopedSubs, 40);
  res.json(report);
});

export default router;
