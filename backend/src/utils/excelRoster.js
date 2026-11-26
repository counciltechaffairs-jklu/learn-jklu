import path from 'node:path';
import { parseCsvRfc4180 } from './security.js';
import { parseXlsxBufferToMatrix } from './excelWorkbook.js';

function normalizeHeader(cell) {
  const clean = String(cell || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (clean.includes('email') || clean === 'mail') return 'email';
  if (clean === 'name' || clean === 'student_name' || clean === 'full_name') return 'name';
  if (clean.includes('roll')) return 'roll_no';
  if (clean === 'section' || clean === 'sec') return 'section';
  if (clean.includes('attendance') || clean === 'att_pct' || clean === 'pct') return 'attendance_pct';
  return clean;
}

function normalizeRosterRows(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return [];
  }
  const firstRowNormalized = rawRows[0].map(normalizeHeader);
  const looksLikeHeader =
    firstRowNormalized.includes('email') ||
    firstRowNormalized.includes('roll_no') ||
    firstRowNormalized.includes('name') ||
    firstRowNormalized.includes('attendance_pct');

  let startIndex = 0;
  let colMap = new Map();

  if (looksLikeHeader) {
    firstRowNormalized.forEach((h, i) => {
      if (h && !colMap.has(h)) colMap.set(h, i);
    });
    startIndex = 1;
  } else {
    // Support headerless lists (e.g. a single column of @jklu.edu.in emails or roll_no,name,email)
    const sample = rawRows[0];
    let emailCol = sample.findIndex((c) => /@/.test(String(c || '')));
    if (emailCol < 0) emailCol = 0;
    colMap.set('email', emailCol);
    if (sample.length >= 2) {
      const otherCol = emailCol === 0 ? 1 : 0;
      colMap.set('name', otherCol);
    }
  }

  const parsed = [];
  for (let r = startIndex; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    const emailIdx = colMap.get('email') ?? 0;
    const rawEmail = String(row[emailIdx] || '').trim();
    const rawRoll = colMap.has('roll_no') ? String(row[colMap.get('roll_no')] || '').trim() : '';
    const rawName = colMap.has('name') ? String(row[colMap.get('name')] || '').trim() : '';
    const rawSec = colMap.has('section') ? String(row[colMap.get('section')] || '').trim() : '';
    const rawAtt = colMap.has('attendance_pct')
      ? String(row[colMap.get('attendance_pct')] || '').replace('%', '').trim()
      : '';

    if (!rawEmail && !rawRoll && !rawName) continue;
    parsed.push({
      rowNumber: r + 1,
      email: rawEmail,
      name: rawName,
      roll_no: rawRoll,
      section: rawSec || 'Sec A',
      has_explicit_section: Boolean(rawSec),
      attendance_raw: rawAtt,
    });
  }
  return parsed;
}

/**
 * Parses .xlsx Excel or .csv/.tsv student roster buffers into normalized roster rows.
 */
export async function parseRosterFileBuffer(buffer, originalName = 'roster.csv') {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (ext === '.xlsx') {
    try {
      const rawRows = await parseXlsxBufferToMatrix(buffer);
      return normalizeRosterRows(rawRows);
    } catch (err) {
      if (err?.message?.includes('No worksheet')) {
        throw new Error('Excel workbook contains no readable worksheet');
      }
      throw err;
    }
  }

  let text = buffer.toString('utf8');
  if (ext === '.tsv' || (!text.includes(',') && text.includes('\t'))) {
    text = text
      .split(/\r?\n/)
      .map((line) =>
        line
          .split('\t')
          .map((c) => `"${c.replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
  }
  const rawRows = parseCsvRfc4180(text);
  return normalizeRosterRows(rawRows);
}
