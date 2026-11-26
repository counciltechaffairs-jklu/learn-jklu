import { PUBLIC_BASE_URL } from '../config/env.js';
import { canStudentViewTargets } from './sectionScope.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function resolveFrontendAppUrl() {
  if (process.env.FRONTEND_URL) {
    return String(process.env.FRONTEND_URL).replace(/\/+$/, '');
  }
  if (PUBLIC_BASE_URL.includes('localhost') || PUBLIC_BASE_URL.includes('127.0.0.1')) {
    return 'http://localhost:3000';
  }
  return 'https://exam-quiz-portal-lib-jklu.vercel.app';
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderNotificationEmailHtml({
  courseLabel = 'Learn JKLU Classroom',
  heading,
  body,
  ctaLabel = null,
  ctaUrl = null,
  secondaryLabel = null,
  secondaryUrl = null,
}) {
  const safeHeading = escapeHtml(heading);
  const safeBody = escapeHtml(body).replace(/\r?\n/g, '<br />');
  const safeCourse = escapeHtml(courseLabel);

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#FAF9F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0A0A0C;">
    <div style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E2DC;border-radius:16px;overflow:hidden;">
      <div style="background:#0A0A0C;color:#FAF9F6;padding:18px 24px;border-bottom:3px solid #E04F33;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#B8B5AD;">${safeCourse}</div>
        <h1 style="margin:6px 0 0;font-size:18px;font-weight:700;line-height:1.3;">${safeHeading}</h1>
      </div>
      <div style="padding:22px 24px;font-size:14px;line-height:1.6;color:#353430;">
        <p style="margin:0 0 18px;">${safeBody}</p>
        ${
          ctaUrl
            ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:10px 18px;background:#E04F33;color:#FFFFFF;text-decoration:none;border-radius:10px;font-weight:600;font-size:13px;margin-right:8px;">${escapeHtml(ctaLabel || 'Open Classroom')}</a>`
            : ''
        }
        ${
          secondaryUrl
            ? `<a href="${escapeHtml(secondaryUrl)}" style="display:inline-block;padding:10px 18px;background:#896ABD;color:#FFFFFF;text-decoration:none;border-radius:10px;font-weight:600;font-size:13px;">${escapeHtml(secondaryLabel || 'Add to Google Calendar')}</a>`
            : ''
        }
      </div>
      <div style="padding:14px 24px;background:#FAF9F6;border-top:1px solid #E5E2DC;font-size:11px;color:#5C5B57;">
        Learn JKLU 2.0 · Academic LMS Notification
      </div>
    </div>
  </body>
</html>`;
}

async function logEmailAttempt(db, { offeringId, eventType, recipientEmail, subject, status, providerId, errorDetail }) {
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO email_notification_logs (offering_id, event_type, recipient_email, subject, status, provider_id, error_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        offeringId || null,
        String(eventType || 'GENERAL').slice(0, 64),
        String(recipientEmail || '').slice(0, 255),
        String(subject || '').slice(0, 300),
        status,
        providerId || null,
        errorDetail ? String(errorDetail).slice(0, 500) : null,
      ]
    );
  } catch {
    // Non-fatal logging failure
  }
}

/**
 * Dispatches an email via Resend REST API (native fetch).
 * Gracefully records SKIPPED_NO_KEY if RESEND_API_KEY is not configured.
 */
export async function sendResendEmail({
  db = null,
  to,
  subject,
  html,
  offeringId = null,
  eventType = 'CLASSROOM_EVENT',
}) {
  const recipient = String(to || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return { ok: false, status: 'SKIPPED_INVALID_EMAIL' };
  }

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const fromEmail = String(process.env.RESEND_FROM_EMAIL || 'Learn JKLU <onboarding@resend.dev>').trim();

  if (!apiKey || apiKey === 're_xxxxxxxxxxxx') {
    await logEmailAttempt(db, {
      offeringId,
      eventType,
      recipientEmail: recipient,
      subject,
      status: 'SKIPPED_NO_KEY',
      errorDetail: 'RESEND_API_KEY not configured',
    });
    return { ok: false, status: 'SKIPPED_NO_KEY' };
  }

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: String(subject || 'Learn JKLU Notification').slice(0, 240),
        html: String(html || ''),
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const errMsg = json?.message || `HTTP ${resp.status}`;
      await logEmailAttempt(db, {
        offeringId,
        eventType,
        recipientEmail: recipient,
        subject,
        status: 'FAILED',
        errorDetail: errMsg,
      });
      return { ok: false, status: 'FAILED', error: errMsg };
    }

    await logEmailAttempt(db, {
      offeringId,
      eventType,
      recipientEmail: recipient,
      subject,
      status: 'SENT',
      providerId: json?.id || null,
    });
    return { ok: true, status: 'SENT', id: json?.id || null };
  } catch (err) {
    const errMsg = err?.message || 'Network error';
    await logEmailAttempt(db, {
      offeringId,
      eventType,
      recipientEmail: recipient,
      subject,
      status: 'FAILED',
      errorDetail: errMsg,
    });
    return { ok: false, status: 'FAILED', error: errMsg };
  }
}

export async function notifyUser({
  db,
  userId = null,
  email = null,
  offeringId = null,
  type = 'INFO',
  title,
  body = '',
  linkPath = '/classroom',
  emailSubject = null,
  emailHtml = null,
}) {
  if (!db) return;
  try {
    let targetUserId = userId ? Number(userId) : null;
    let targetEmail = email ? String(email).trim() : null;

    if (!targetUserId && targetEmail) {
      const u = await db.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [
        targetEmail,
      ]);
      if (u.rowCount > 0) targetUserId = Number(u.rows[0].id);
    } else if (targetUserId && !targetEmail) {
      const u = await db.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [targetUserId]);
      if (u.rowCount > 0) targetEmail = u.rows[0].email;
    }

    if (targetUserId) {
      await db.query(
        `INSERT INTO classroom_notifications (user_id, offering_id, type, title, body, link_path)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          targetUserId,
          offeringId || null,
          String(type).slice(0, 50),
          String(title || 'Notification').slice(0, 240),
          body ? String(body).slice(0, 1000) : null,
          linkPath || '/classroom',
        ]
      );
    }

    if (targetEmail && emailSubject) {
      const appOrigin = resolveFrontendAppUrl();
      const dest = linkPath || '/classroom';
      const html =
        emailHtml ||
        renderNotificationEmailHtml({
          heading: title,
          body: body || title,
          ctaUrl: dest.startsWith('http') ? dest : `${appOrigin}${dest}`,
        });
      void sendResendEmail({
        db,
        to: targetEmail,
        subject: emailSubject,
        html,
        offeringId,
        eventType: type,
      });
    }
  } catch (err) {
    console.warn('[NotifyUser Warning]', err?.message || err);
  }
}

/**
 * Sends in-app notifications + Resend emails to enrolled students (matching targetSections)
 * and optionally co-instructors. Runs non-blocking for emails.
 */
export async function notifyCourseAudience({
  db,
  offeringId,
  targetSections = ['ALL'],
  eventType = 'ANNOUNCEMENT',
  title,
  body = '',
  linkPath = null,
  emailSubject = null,
  emailHtml = null,
  actorUserId = null,
}) {
  if (!db || !offeringId) return;
  try {
    const [enrRes, instRes] = await Promise.all([
      db.query(
        `SELECT ce.student_id, ce.student_email, ce.section, u.id AS resolved_uid
         FROM course_enrollments ce
         LEFT JOIN users u ON LOWER(u.email) = LOWER(ce.student_email)
         WHERE ce.offering_id = $1`,
        [offeringId]
      ),
      db.query(
        `SELECT u.id AS user_id, u.email
         FROM course_instructors ci
         JOIN users u ON u.id = ci.professor_id
         WHERE ci.offering_id = $1`,
        [offeringId]
      ),
    ]);

    const seenUserIds = new Set();
    const emailTargets = new Set();

    for (const row of enrRes.rows) {
      if (!canStudentViewTargets(row.section || 'Sec A', targetSections)) continue;
      const uid = Number(row.student_id || row.resolved_uid || 0);
      if (uid && (!actorUserId || uid !== Number(actorUserId))) {
        seenUserIds.add(uid);
      }
      if (row.student_email) {
        emailTargets.add(String(row.student_email).trim().toLowerCase());
      }
    }

    for (const inst of instRes.rows) {
      const uid = Number(inst.user_id || 0);
      if (actorUserId && uid === Number(actorUserId)) continue;
      if (uid) seenUserIds.add(uid);
      if (inst.email) emailTargets.add(String(inst.email).trim().toLowerCase());
    }

    const destPath = linkPath || `/classroom?offeringId=${offeringId}`;
    const uidArr = Array.from(seenUserIds);
    if (uidArr.length > 0) {
      await db.query(
        `INSERT INTO classroom_notifications (user_id, offering_id, type, title, body, link_path)
         SELECT uid, $2, $3, $4, $5, $6
         FROM UNNEST($1::int[]) AS uid`,
        [
          uidArr,
          offeringId,
          String(eventType).slice(0, 50),
          String(title || 'Course Update').slice(0, 240),
          body ? String(body).slice(0, 1000) : null,
          destPath,
        ]
      );
    }

    if (emailSubject && emailTargets.size > 0) {
      const appOrigin = resolveFrontendAppUrl();
      const html =
        emailHtml ||
        renderNotificationEmailHtml({
          heading: title,
          body: body || title,
          ctaLabel: 'Open Classroom',
          ctaUrl: destPath.startsWith('http') ? destPath : `${appOrigin}${destPath}`,
        });

      const emails = Array.from(emailTargets);
      void Promise.allSettled(
        emails.map((to) =>
          sendResendEmail({
            db,
            to,
            subject: emailSubject,
            html,
            offeringId,
            eventType,
          })
        )
      );
    }
  } catch (err) {
    console.warn('[NotifyCourseAudience Warning]', err?.message || err);
  }
}

export async function notifyCourseInstructors({
  db,
  offeringId,
  type,
  title,
  body,
  linkPath,
  excludeUserId = null,
  emailSubject = null,
  emailHtml = null,
}) {
  const instRes = await db.query(
    `SELECT ci.professor_id, u.email
     FROM course_instructors ci
     LEFT JOIN users u ON u.id = ci.professor_id
     WHERE ci.offering_id = $1`,
    [Number(offeringId)]
  );
  const targets = instRes.rows.filter(
    (inst) => excludeUserId == null || Number(inst.professor_id) !== Number(excludeUserId)
  );
  await Promise.all(
    targets.map((inst) =>
      notifyUser({
        db,
        userId: inst.professor_id,
        email: inst.email || null,
        offeringId: Number(offeringId),
        type,
        title,
        body,
        linkPath,
        emailSubject,
        emailHtml,
      })
    )
  );
  return targets.length;
}
