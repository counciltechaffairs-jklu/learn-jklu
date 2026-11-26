import crypto from 'node:crypto';
import { JWT_SECRET } from '../config/env.js';

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(String(str || ''), 'base64url');
}

/**
 * Signs a compact stateless HMAC-SHA256 calendar feed token bound to a userId.
 */
export function signCalendarToken(userId) {
  const payload = `v1.${Number(userId)}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest();
  return `${base64UrlEncode(payload)}.${base64UrlEncode(sig)}`;
}

/**
 * Verifies a calendar feed token and returns the numeric userId or null.
 */
export function verifyCalendarToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const payloadBuf = base64UrlDecode(parts[0]);
    const sigBuf = base64UrlDecode(parts[1]);
    const payload = payloadBuf.toString('utf8');
    if (!payload.startsWith('v1.')) return null;

    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest();
    if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) {
      return null;
    }
    const uid = Number(payload.slice(3));
    return Number.isInteger(uid) && uid > 0 ? uid : null;
  } catch {
    return null;
  }
}

function toGoogleCalStamp(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds a one-click Google Calendar event template URL.
 */
export function buildGoogleCalendarUrl({
  title,
  details = '',
  startIso,
  endIso = null,
  location = 'Learn JKLU Classroom',
}) {
  const startDate = new Date(startIso || Date.now() + 86400000);
  const safeStart = Number.isNaN(startDate.getTime()) ? new Date(Date.now() + 86400000) : startDate;
  const parsedEnd = endIso ? new Date(endIso) : new Date(safeStart.getTime() + 60 * 60 * 1000);
  const safeEnd = Number.isNaN(parsedEnd.getTime())
    ? new Date(safeStart.getTime() + 60 * 60 * 1000)
    : parsedEnd;

  const dates = `${toGoogleCalStamp(safeStart)}/${toGoogleCalStamp(safeEnd)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: String(title || 'Learn JKLU Task').slice(0, 180),
    dates,
    details: String(details || '').slice(0, 1500),
    location: String(location || 'Learn JKLU Classroom').slice(0, 200),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(val) {
  return String(val ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Generates an RFC-5545 VCALENDAR feed string for classroom deadlines & office hours.
 */
export function buildIcsFeed(events = [], calendarName = 'Learn JKLU Deadlines') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Learn JKLU 2.0//Classroom Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Kolkata',
  ];

  const nowStamp = toGoogleCalStamp(new Date());
  for (const ev of events) {
    const startStamp = toGoogleCalStamp(ev.startIso);
    if (!startStamp) continue;
    const endDate = ev.endIso
      ? new Date(ev.endIso)
      : new Date(new Date(ev.startIso).getTime() + 60 * 60 * 1000);
    const endStamp = toGoogleCalStamp(endDate) || startStamp;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(ev.uid || `${startStamp}-${Math.random().toString(36).slice(2)}@jklu.edu.in`)}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${startStamp}`);
    lines.push(`DTEND:${endStamp}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.title || 'Classroom Task')}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    }
    if (ev.location) {
      lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    }
    if (ev.url) {
      lines.push(`URL:${ev.url}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
