import { getDb } from '../config/db.js';
import { parsePositiveInt } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import {
  resolvePostTargetsForStaff,
  canStaffMutateItem,
  canStaffModerateComments,
  canStudentViewTargets,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import {
  getStudentEnrollment,
  mergeOfferingSections,
  getCourseStaffPermissions,
} from '../utils/classroomAuth.js';
import {
  notifyCourseAudience,
  notifyCourseInstructors,
  renderNotificationEmailHtml,
  resolveFrontendAppUrl,
} from '../utils/emailService.js';
import { getOfferingCourseMeta } from '../utils/classroomHelpers.js';
import { validateUrlLinkList, writeAuditLog } from '../utils/security.js';

const router = createAsyncRouter();

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

  const { title, content, attachment_urls, is_pinned, target_sections, scheduled_for } = req.body;
  if (!content || !String(content).trim()) {
    res.status(400).json({ detail: 'Announcement content is required' });
    return;
  }

  let scheduledForIso = null;
  if (scheduled_for) {
    const parsedSched = new Date(scheduled_for);
    if (Number.isNaN(parsedSched.getTime())) {
      res.status(400).json({ detail: 'Invalid scheduled_for date format' });
      return;
    }
    scheduledForIso = parsedSched.toISOString();
  }

  const targetRes = resolvePostTargetsForStaff(perms, target_sections);
  if (!targetRes.ok) {
    res.status(403).json({ detail: targetRes.error });
    return;
  }
  await mergeOfferingSections(db, offeringId, targetRes.sections);

  const roleLabel = perms.is_ta ? 'Teaching Assistant' : 'Professor';
  const attachCheck = validateUrlLinkList(attachment_urls, 'Attachment URL');
  if (!attachCheck.ok) {
    res.status(400).json({ detail: attachCheck.error });
    return;
  }
  const attachments = attachCheck.value;

  const isFutureScheduled = Boolean(
    scheduledForIso && new Date(scheduledForIso).getTime() > Date.now()
  );

  const ins = await db.query(
    `INSERT INTO classroom_announcements (
       offering_id, author_id, author_name, author_role, title, content, attachment_urls, is_pinned, allow_comments, target_sections, scheduled_for, email_dispatched_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, TRUE, $9::jsonb, $10, $11)
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
      JSON.stringify(targetRes.sections),
      scheduledForIso,
      isFutureScheduled ? null : new Date().toISOString(),
    ]
  );

  if (!isFutureScheduled) {
    const offMeta = await getOfferingCourseMeta(db, offeringId);
    const cCode = offMeta?.courseCode || 'COURSE';
    const cName = offMeta?.courseName || 'Classroom';
    const appOrigin = resolveFrontendAppUrl();
    const heading = title ? String(title).trim() : `${cCode} Classroom Announcement`;
    const bodyText = String(content).trim();
    void notifyCourseAudience({
      db,
      offeringId,
      targetSections: targetRes.sections,
      eventType: 'ANNOUNCEMENT',
      title: `${cCode}: ${heading}`,
      body: `${req.user.name}: ${bodyText.slice(0, 240)}`,
      linkPath: `/classroom?offeringId=${offeringId}`,
      emailSubject: `[${cCode}] ${heading}`,
      emailHtml: renderNotificationEmailHtml({
        courseLabel: `${cCode} · ${cName}`,
        heading,
        body: `Posted by ${req.user.name} (${roleLabel}):\n\n${bodyText}`,
        ctaLabel: 'Open Classroom Stream',
        ctaUrl: `${appOrigin}/classroom?offeringId=${offeringId}`,
      }),
      actorUserId: req.user.id,
    });
  }

  res.status(201).json({
    message: isFutureScheduled
      ? `Announcement scheduled for ${new Date(scheduledForIso).toLocaleString()}`
      : `Announcement posted to ${targetRes.sections.includes('ALL') ? 'All Sections' : targetRes.sections.join(', ')}`,
    announcement: { ...ins.rows[0], target_sections: targetRes.sections, comments: [] },
  });
});

/**
 * PATCH /classroom/announcements/:id
 * Edits announcement title/content or toggles pin / allow_comments (enforces read-only on other sections)
 */
router.patch('/classroom/announcements/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const announcementId = parsePositiveInt(req.params.id);
  if (!announcementId) {
    res.status(400).json({ detail: 'Invalid announcement ID' });
    return;
  }
  const existing = await db.query(
    'SELECT * FROM classroom_announcements WHERE id = $1 LIMIT 1',
    [announcementId]
  );
  if (existing.rowCount === 0) {
    res.status(404).json({ detail: 'Announcement not found' });
    return;
  }
  const ann = existing.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(ann.offering_id), req.user);
  if (
    (!perms.can_announce && !perms.can_manage_course) ||
    !canStaffMutateItem(perms, ann.target_sections, ann.author_id, req.user.id)
  ) {
    res.status(403).json({
      detail: 'Read-only: you can view other sections, but only edit content in your assigned section(s) or your own shared posts.',
    });
    return;
  }

  const { title, content, is_pinned, allow_comments, target_sections } = req.body;
  if (content !== undefined && !String(content).trim()) {
    res.status(400).json({ detail: 'Announcement content cannot be empty' });
    return;
  }

  let nextTargetsJson = null;
  if (target_sections !== undefined) {
    const targetRes = resolvePostTargetsForStaff(perms, target_sections);
    if (!targetRes.ok) {
      res.status(403).json({ detail: targetRes.error });
      return;
    }
    nextTargetsJson = JSON.stringify(targetRes.sections);
    await mergeOfferingSections(db, Number(ann.offering_id), targetRes.sections);
  }

  const upd = await db.query(
    `UPDATE classroom_announcements
     SET title = CASE WHEN $1 THEN $2 ELSE title END,
         content = COALESCE($3, content),
         is_pinned = COALESCE($4, is_pinned),
         allow_comments = COALESCE($5, allow_comments),
         target_sections = COALESCE($6::jsonb, target_sections),
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      title !== undefined,
      title ? String(title).trim() : null,
      content !== undefined ? String(content).trim() : null,
      is_pinned !== undefined ? Boolean(is_pinned) : null,
      allow_comments !== undefined ? Boolean(allow_comments) : null,
      nextTargetsJson,
      announcementId,
    ]
  );

  res.json({ message: 'Announcement updated', announcement: upd.rows[0] });
});

/**
 * DELETE /classroom/announcements/:id
 * Deletes an announcement from THIS course stream (enforces read-only on other sections)
 */
router.delete('/classroom/announcements/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const announcementId = parsePositiveInt(req.params.id);
  if (!announcementId) {
    res.status(400).json({ detail: 'Invalid announcement ID' });
    return;
  }
  const existing = await db.query(
    'SELECT offering_id, author_id, target_sections FROM classroom_announcements WHERE id = $1 LIMIT 1',
    [announcementId]
  );
  if (existing.rowCount === 0) {
    res.status(404).json({ detail: 'Announcement not found' });
    return;
  }
  const ann = existing.rows[0];
  const offeringId = Number(ann.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (
    (!perms.can_announce && !perms.can_manage_course) ||
    !canStaffMutateItem(perms, ann.target_sections, ann.author_id, req.user.id)
  ) {
    res.status(403).json({
      detail: 'Read-only: you can view other sections, but only delete content in your assigned section(s) or your own shared posts.',
    });
    return;
  }

  await db.query('DELETE FROM classroom_announcements WHERE id = $1', [announcementId]);
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'DELETE_ANNOUNCEMENT',
    entityType: 'ANNOUNCEMENT',
    entityId: announcementId,
    metadata: { offering_id: offeringId },
  });
  res.json({ message: 'Announcement deleted' });
});

/**
 * POST /classroom/announcements/:id/comments
 * Students can only comment on posts targeting ALL or their enrolled section
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

  const annRes = await db.query(
    'SELECT offering_id, allow_comments, target_sections FROM classroom_announcements WHERE id = $1 LIMIT 1',
    [announcementId]
  );
  if (annRes.rowCount === 0) {
    res.status(404).json({ detail: 'Announcement not found' });
    return;
  }

  const ann = annRes.rows[0];
  const offeringId = Number(ann.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  const enrollment = await getStudentEnrollment(db, offeringId, req.user);
  const isStaff = Boolean(perms.is_admin || perms.is_instructor || perms.is_ta);
  if (!isStaff && !enrollment) {
    res.status(403).json({
      detail: 'Only enrolled students, assigned TAs, or course professors can comment.',
    });
    return;
  }
  if (!isStaff && enrollment && !canStudentViewTargets(enrollment.section || 'Sec A', ann.target_sections)) {
    res.status(403).json({
      detail: 'This announcement is scoped to a different section.',
    });
    return;
  }
  if (ann.allow_comments === false && !perms.can_announce && !perms.can_manage_course) {
    res.status(403).json({ detail: 'Comments are disabled on this announcement.' });
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

  // Notify course instructors on student doubt, or notify commenters when faculty replies
  if (!isStaff) {
    void notifyCourseInstructors({
      db,
      offeringId,
      type: 'COMMENT_DOUBT',
      title: `New doubt from ${req.user.name}`,
      body: String(content).trim().slice(0, 200),
      linkPath: `/classroom?offeringId=${offeringId}`,
    });
  }

  res.status(201).json({
    comment: ins.rows[0],
  });
});

/**
 * DELETE /classroom/comments/:id
 * Allows course staff within section scope (or on ALL-section posts) to moderate comments
 */
router.delete('/classroom/comments/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const commentId = parsePositiveInt(req.params.id);
  if (!commentId) {
    res.status(400).json({ detail: 'Invalid comment ID' });
    return;
  }
  const lookup = await db.query(
    `SELECT cc.author_id, ca.offering_id, ca.target_sections
     FROM classroom_comments cc
     JOIN classroom_announcements ca ON ca.id = cc.announcement_id
     WHERE cc.id = $1 LIMIT 1`,
    [commentId]
  );
  if (lookup.rowCount === 0) {
    res.status(404).json({ detail: 'Comment not found' });
    return;
  }
  const row = lookup.rows[0];
  const perms = await getCourseStaffPermissions(db, Number(row.offering_id), req.user);
  if (!canStaffModerateComments(perms, row.target_sections)) {
    res.status(403).json({
      detail: 'Read-only: only faculty or TAs assigned to this section (or ALL-section staff) can delete comments here.',
    });
    return;
  }

  await db.query('DELETE FROM classroom_comments WHERE id = $1', [commentId]);
  res.json({ message: 'Comment deleted' });
});

/**
 * PATCH /classroom/comments/:id/verify
 * Scoped to course professors/TAs matching the post's section scope
 */
router.patch('/classroom/comments/:id/verify', requireAuth, async (req, res) => {
  const db = await getDb();
  const commentId = parsePositiveInt(req.params.id);
  if (!commentId) {
    res.status(400).json({ detail: 'Invalid comment ID' });
    return;
  }

  const lookup = await db.query(
    `SELECT ca.offering_id, ca.target_sections
     FROM classroom_comments cc
     JOIN classroom_announcements ca ON ca.id = cc.announcement_id
     WHERE cc.id = $1 LIMIT 1`,
    [commentId]
  );
  if (lookup.rowCount === 0) {
    res.status(404).json({ detail: 'Comment not found' });
    return;
  }
  const row = lookup.rows[0];
  const offeringId = Number(row.offering_id);
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!canStaffModerateComments(perms, row.target_sections)) {
    res.status(403).json({
      detail: 'Read-only: only faculty or TAs assigned to this section can verify answers here.',
    });
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

export default router;
