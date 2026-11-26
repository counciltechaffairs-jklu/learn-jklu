import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRosterFileBuffer } from '../src/utils/excelRoster.js';
import { buildXlsxBuffer } from '../src/utils/excelWorkbook.js';

describe('excelRoster utilities', () => {
  it('parses CSV rosters with header aliases, section defaults, and attendance percentage', async () => {
    const csv = [
      'Roll No,Full Name,Email,Section,Attendance',
      '2024BT001,Aarav Sharma,aarav@jklu.edu.in,Sec B,88%',
      '2024BT002,Diya Patel,diya@jklu.edu.in,,92.5',
      ',,,',
    ].join('\n');

    const rows = await parseRosterFileBuffer(Buffer.from(csv, 'utf8'), 'students.csv');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      rowNumber: 2,
      email: 'aarav@jklu.edu.in',
      name: 'Aarav Sharma',
      roll_no: '2024BT001',
      section: 'Sec B',
      has_explicit_section: true,
      attendance_raw: '88',
    });
    assert.equal(rows[1].section, 'Sec A');
    assert.equal(rows[1].has_explicit_section, false);
    assert.equal(rows[1].attendance_raw, '92.5');
  });

  it('parses real XLSX buffers produced by buildXlsxBuffer accurately', async () => {
    const xlsxBuffer = await buildXlsxBuffer({
      sheetName: 'Roster',
      headers: ['Roll No', 'Student Name', 'Email', 'Section'],
      rows: [
        ['2024BT010', 'Kabir Verma', 'kabir@jklu.edu.in', 'Sec A'],
        ['2024BT011', 'Meera Nair', 'meera@jklu.edu.in', 'Sec C'],
      ],
    });

    const parsed = await parseRosterFileBuffer(xlsxBuffer, 'class_roster.xlsx');
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].email, 'kabir@jklu.edu.in');
    assert.equal(parsed[0].section, 'Sec A');
    assert.equal(parsed[1].roll_no, '2024BT011');
    assert.equal(parsed[1].section, 'Sec C');
  });
});
