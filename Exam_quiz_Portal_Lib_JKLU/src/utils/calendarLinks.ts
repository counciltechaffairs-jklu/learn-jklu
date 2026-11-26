function toGoogleCalStamp(dateInput: string | number | Date): string {
  const d = new Date(dateInput);
  const safe = Number.isNaN(d.getTime()) ? new Date(Date.now() + 86400000) : d;
  return safe.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl(opts: {
  title: string;
  details?: string;
  startIso?: string | null;
  endIso?: string | null;
  location?: string;
}): string {
  const baseStart = opts.startIso ? new Date(opts.startIso) : new Date(Date.now() + 86400000);
  const safeStart = Number.isNaN(baseStart.getTime()) ? new Date(Date.now() + 86400000) : baseStart;
  const baseEnd = opts.endIso ? new Date(opts.endIso) : new Date(safeStart.getTime() + 60 * 60 * 1000);
  const safeEnd = Number.isNaN(baseEnd.getTime()) ? new Date(safeStart.getTime() + 60 * 60 * 1000) : baseEnd;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: String(opts.title || 'Learn JKLU Task').slice(0, 180),
    dates: `${toGoogleCalStamp(safeStart)}/${toGoogleCalStamp(safeEnd)}`,
    details: String(opts.details || 'Learn JKLU Classroom Task').slice(0, 1400),
    location: String(opts.location || 'Learn JKLU Classroom').slice(0, 200),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadSingleIcs(opts: {
  uid: string;
  title: string;
  description?: string;
  startIso?: string | null;
  location?: string;
}) {
  const start = toGoogleCalStamp(opts.startIso || new Date(Date.now() + 86400000));
  const endDate = opts.startIso
    ? new Date(new Date(opts.startIso).getTime() + 60 * 60 * 1000)
    : new Date(Date.now() + 90000000);
  const end = toGoogleCalStamp(endDate);
  const esc = (s: string) =>
    String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Learn JKLU 2.0//Classroom//EN',
    'BEGIN:VEVENT',
    `UID:${opts.uid}@learn-jklu.edu.in`,
    `DTSTAMP:${toGoogleCalStamp(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description || '')}`,
    `LOCATION:${esc(opts.location || 'Learn JKLU Classroom')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.title.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
