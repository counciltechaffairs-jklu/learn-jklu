import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFrontendAppUrl,
  renderNotificationEmailHtml,
  sendResendEmail,
  notifyUser,
  notifyCourseInstructors,
} from '../src/utils/emailService.js';

describe('emailService utilities', () => {
  it('resolves frontend URL and renders escaped HTML email cleanly', () => {
    const appUrl = resolveFrontendAppUrl();
    assert.ok(appUrl.startsWith('http'));

    const html = renderNotificationEmailHtml({
      courseLabel: 'CS1101 <Algorithms>',
      heading: 'Quiz & Assignment',
      body: 'Line 1\nCheck <script>alert(1)</script>',
      ctaLabel: 'Open Classroom',
      ctaUrl: 'https://example.com/classroom?offeringId=1',
      secondaryLabel: 'Add to Google Calendar',
      secondaryUrl: 'https://calendar.google.com/event',
    });

    assert.ok(html.includes('CS1101 &lt;Algorithms&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('Line 1<br />Check &lt;script&gt;'));
    assert.ok(html.includes('Open Classroom'));
    assert.ok(html.includes('Add to Google Calendar'));
  });

  it('skips invalid emails safely and stubs Resend HTTP calls cleanly', async () => {
    const invalid = await sendResendEmail({
      to: 'not-an-email',
      subject: 'Hi',
      html: '<p>Test</p>',
    });
    assert.deepEqual(invalid, { ok: false, status: 'SKIPPED_INVALID_EMAIL' });

    const prevKey = process.env.RESEND_API_KEY;
    const prevFetch = globalThis.fetch;
    try {
      process.env.RESEND_API_KEY = '';
      const noKey = await sendResendEmail({
        to: 'student@jklu.edu.in',
        subject: 'Hi',
        html: '<p>Test</p>',
      });
      assert.deepEqual(noKey, { ok: false, status: 'SKIPPED_NO_KEY' });

      process.env.RESEND_API_KEY = 're_test_dummy_key';
      let calledUrl = null;
      globalThis.fetch = async (url) => {
        calledUrl = url;
        return {
          ok: true,
          json: async () => ({ id: 'msg_123' }),
        };
      };

      const queries = [];
      const mockDb = {
        query: async (sql, params) => {
          queries.push({ sql, params });
          return { rows: [], rowCount: 0 };
        },
      };

      const sent = await sendResendEmail({
        db: mockDb,
        to: 'student@jklu.edu.in',
        subject: 'Notice',
        html: '<p>Body</p>',
        eventType: 'ANNOUNCEMENT',
        offeringId: 7,
      });
      assert.equal(calledUrl, 'https://api.resend.com/emails');
      assert.deepEqual(sent, { ok: true, status: 'SENT', id: 'msg_123' });
      assert.ok(queries.some((q) => q.sql.includes('email_notification_logs')));
    } finally {
      process.env.RESEND_API_KEY = prevKey;
      globalThis.fetch = prevFetch;
    }
  });

  it('inserts in-app notifications via notifyUser and fans out notifyCourseInstructors', async () => {
    const queries = [];
    const mockDb = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('FROM course_instructors')) {
          return { rows: [{ professor_id: 10 }, { professor_id: 20 }], rowCount: 2 };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    await notifyUser({
      db: mockDb,
      userId: 5,
      offeringId: 2,
      type: 'GRADE_PUBLISHED',
      title: 'Marks Published',
      body: 'Check Gradebook',
      linkPath: '/classroom?offeringId=2',
    });
    assert.ok(queries.some((q) => q.sql.includes('INSERT INTO classroom_notifications')));

    queries.length = 0;
    const delivered = await notifyCourseInstructors({
      db: mockDb,
      offeringId: 9,
      type: 'COMMENT_DOUBT',
      title: 'New doubt',
      body: 'Question on Q2',
      linkPath: '/classroom?offeringId=9',
      excludeUserId: 10,
    });
    assert.equal(delivered, 1);
    const notifInserts = queries.filter((q) => q.sql.includes('classroom_notifications'));
    assert.equal(notifInserts.length, 1);
    assert.equal(notifInserts[0].params[0], 20);
  });
});
