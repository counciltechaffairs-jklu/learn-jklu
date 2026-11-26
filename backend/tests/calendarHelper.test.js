import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signCalendarToken,
  verifyCalendarToken,
  buildGoogleCalendarUrl,
  buildIcsFeed,
} from '../src/utils/calendarHelper.js';

describe('calendarHelper utilities', () => {
  it('signs and verifies HMAC calendar tokens and rejects tampered inputs', () => {
    const token = signCalendarToken(42);
    assert.ok(token.includes('.'));
    assert.equal(verifyCalendarToken(token), 42);

    const [payloadPart, sigPart] = token.split('.');
    const tampered = `${payloadPart}.${sigPart.slice(0, -1)}${sigPart.endsWith('A') ? 'B' : 'A'}`;
    assert.equal(verifyCalendarToken(tampered), null);
    assert.equal(verifyCalendarToken('invalid-token'), null);
    assert.equal(verifyCalendarToken(''), null);
  });

  it('builds Google Calendar event creation links with ISO dates and location', () => {
    const url = buildGoogleCalendarUrl({
      title: '[CS1101] Midsem Quiz',
      details: 'Bring calculator',
      startIso: '2026-11-30T10:00:00.000Z',
      endIso: '2026-11-30T11:30:00.000Z',
      location: 'Academic Block A',
    });

    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://calendar.google.com');
    assert.equal(parsed.searchParams.get('action'), 'TEMPLATE');
    assert.equal(parsed.searchParams.get('text'), '[CS1101] Midsem Quiz');
    assert.equal(parsed.searchParams.get('details'), 'Bring calculator');
    assert.equal(parsed.searchParams.get('location'), 'Academic Block A');
    assert.equal(parsed.searchParams.get('dates'), '20261130T100000Z/20261130T113000Z');
  });

  it('generates valid RFC 5545 iCalendar (.ics) feeds and skips invalid dates', () => {
    const ics = buildIcsFeed(
      [
        {
          uid: 'asgn-1@jklu.edu.in',
          title: 'Lab 1, Graphs; Trees',
          description: 'Submit\nPDF report',
          startIso: '2026-12-01T09:00:00.000Z',
          endIso: '2026-12-01T10:00:00.000Z',
          url: 'https://learn.jklu.edu.in/classroom?offeringId=3',
        },
        {
          uid: 'bad-date',
          title: 'Should Be Skipped',
          startIso: 'not-a-date',
        },
      ],
      'JKLU Deadlines'
    );

    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('X-WR-CALNAME:JKLU Deadlines'));
    assert.ok(ics.includes('SUMMARY:Lab 1\\, Graphs\\; Trees'));
    assert.ok(ics.includes('DESCRIPTION:Submit\\nPDF report'));
    assert.ok(!ics.includes('Should Be Skipped'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  });
});
