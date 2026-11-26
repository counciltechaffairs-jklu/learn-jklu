import { getDb, withTransaction } from '../config/db.js';
import { parsePositiveInt } from '../config/env.js';
import { requireAuth, requireProfessorOrAdmin } from '../middleware/auth.js';
import { rosterUpload } from '../middleware/uploads.js';
import { parseRosterFileBuffer } from '../utils/excelRoster.js';
import { buildXlsxBuffer, parseSpreadsheetRows } from '../utils/excelWorkbook.js';
import {
  normalizeSectionName,
  canStaffAccessSection,
  canStaffGradeTarget,
  canStudentViewTargets,
} from '../utils/sectionScope.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { mergeOfferingSections, getCourseStaffPermissions } from '../utils/classroomAuth.js';
import {
  csvCell,
  safeContentDispositionFilename,
  parseCsvRfc4180,
  writeAuditLog,
} from '../utils/security.js';

const router = createAsyncRouter();

/**
 * POST /classroom/offerings/:id/tcs-roster-import
 * Scoped strictly to THIS course's instructors or Admin
 */
router.post('/classroom/offerings/:id/tcs-roster-import', requireProfessorOrAdmin, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course) {
    res.status(403).json({
      detail: 'Only professors teaching this course or Admin can import TCS iON rosters.',
    });
    return;
  }

  const { csv_text } = req.body;
  if (!csv_text || !String(csv_text).trim()) {
    res.status(400).json({
      detail: 'Paste TCS iON Roster CSV lines: Roll_No, Student_Name, Email, Section, Attendance_Pct',
    });
    return;
  }

  const parsedRows = parseCsvRfc4180(csv_text);
  if (parsedRows.length > 500) {
    res.status(400).json({ detail: 'CSV import is capped at 500 rows per batch.' });
    return;
  }

  for (const parts of parsedRows) {
    if (parts.length < 3 || /^roll_?no$/i.test(parts[0])) continue;
    const attStr = parts[4] ?? '';
    if (attStr !== '') {
      const attNum = Number(attStr);
      if (!Number.isFinite(attNum) || attNum < 0 || attNum > 100) {
        res.status(400).json({
          detail: `Invalid attendance percentage "${attStr}" for ${parts[2] || parts[0]}. Must be between 0 and 100.`,
        });
        return;
      }
    }
  }

  const defaultTcsSection = req.body?.default_section
    ? normalizeSectionName(req.body.default_section)
    : perms.can_manage_all_sections
      ? 'Sec A'
      : perms.assigned_sections[0] || 'Sec A';
  const importedSections = new Set();

  const imported = await withTransaction(db, async (tx) => {
    let count = 0;
    for (const parts of parsedRows) {
      if (parts.length < 3) continue;
      if (/^roll_?no$/i.test(parts[0])) continue;

      const [rollNo, studentName, studentEmail, rawSec = '', attStr = '', credStr = '4'] = parts;
      const cleanEmail = String(studentEmail || '').toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) continue;

      const resolvedSection =
        rawSec && String(rawSec).trim()
          ? normalizeSectionName(rawSec)
          : defaultTcsSection;
      const finalSection =
        !perms.can_manage_all_sections && !canStaffAccessSection(perms, resolvedSection)
          ? perms.assigned_sections[0] || defaultTcsSection
          : resolvedSection === 'ALL'
            ? defaultTcsSection
            : resolvedSection;

      if (!perms.can_manage_all_sections) {
        const curEnr = await tx.query(
          'SELECT section FROM course_enrollments WHERE offering_id = $1 AND LOWER(student_email) = $2 LIMIT 1',
          [offeringId, cleanEmail]
        );
        if (curEnr.rowCount > 0 && !canStaffAccessSection(perms, curEnr.rows[0].section || 'Sec A')) {
          continue;
        }
      }

      const parsedAtt = attStr !== '' && !Number.isNaN(parseFloat(attStr)) ? parseFloat(attStr) : null;

      // Bind existing student account ONLY by exact email (never by roll_no)
      const uMatch = await tx.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [
        cleanEmail,
      ]);

      await tx.query(
        `INSERT INTO course_enrollments (
           offering_id, student_id, roll_no, student_name, student_email,
           section, enroll_source, attendance_pct, tcs_ion_credits
         ) VALUES ($1, $2, $3, $4, $5, $6, 'TCS_ION_CSV', $7, $8)
         ON CONFLICT (offering_id, student_email) DO UPDATE SET
           student_id = COALESCE(course_enrollments.student_id, EXCLUDED.student_id),
           roll_no = EXCLUDED.roll_no,
           student_name = EXCLUDED.student_name,
           section = EXCLUDED.section,
           enroll_source = 'TCS_ION_CSV',
           attendance_pct = COALESCE(EXCLUDED.attendance_pct, course_enrollments.attendance_pct),
           tcs_ion_credits = EXCLUDED.tcs_ion_credits`,
        [
          offeringId,
          uMatch.rows[0]?.id || null,
          rollNo,
          studentName,
          cleanEmail,
          finalSection,
          parsedAtt,
          Number(parseInt(credStr, 10) || 4),
        ]
      );
      importedSections.add(finalSection);
      count += 1;
    }
    return count;
  });

  await mergeOfferingSections(db, offeringId, Array.from(importedSections));

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'TCS_ROSTER_IMPORT',
    entityType: 'OFFERING',
    entityId: offeringId,
    metadata: { imported_count: imported },
  });

  res.json({
    message: `Synced ${imported} student records from TCS iON Digital Campus Roster.`,
    imported_count: imported,
  });
});

/**
 * GET /classroom/offerings/:id/tcs-marks-export
 * Scoped strictly to THIS course's instructors, grading TAs, or Admin
 */
router.get('/classroom/offerings/:id/tcs-marks-export', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course && !perms.can_grade) {
    res.status(403).json({
      detail: 'Only instructors or authorized TAs of this course can export marksheets.',
    });
    return;
  }

  const offRes = await db.query('SELECT * FROM course_offerings WHERE id = $1 LIMIT 1', [offeringId]);
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course offering not found' });
    return;
  }
  const off = offRes.rows[0];

  const sectionParam = req.query.section ? normalizeSectionName(req.query.section) : 'ALL';
  const filterBySection = sectionParam && sectionParam !== 'ALL';

  const [enrRes, asgnRes, subRes] = await Promise.all([
    filterBySection
      ? db.query(
          'SELECT * FROM course_enrollments WHERE offering_id = $1 AND LOWER(COALESCE(section, \'Sec A\')) = LOWER($2) ORDER BY roll_no ASC NULLS LAST, student_email ASC',
          [offeringId, sectionParam]
        )
      : db.query(
          'SELECT * FROM course_enrollments WHERE offering_id = $1 ORDER BY roll_no ASC NULLS LAST, student_email ASC',
          [offeringId]
        ),
    db.query('SELECT id, title, max_marks, target_sections FROM classroom_assignments WHERE offering_id = $1 ORDER BY id ASC', [
      offeringId,
    ]),
    db.query(
      `SELECT s.* FROM assignment_submissions s
       JOIN classroom_assignments a ON a.id = s.assignment_id
       WHERE a.offering_id = $1`,
      [offeringId]
    ),
  ]);

  const assignments = filterBySection
    ? asgnRes.rows.filter((a) => canStudentViewTargets(sectionParam, a.target_sections))
    : asgnRes.rows;
  const subMap = new Map();
  for (const s of subRes.rows) {
    const key = `${Number(s.assignment_id)}:${String(s.student_email || '').toLowerCase()}`;
    subMap.set(key, s);
  }

  const headerCols = [
    'TCS_iON_Course_ID',
    'Course_Code',
    'Roll_No',
    'Student_Name',
    'Student_Email',
    'Section',
    'Attendance_Pct',
    'Credits',
    ...assignments.map((a, idx) => `A${idx + 1}_${String(a.title || '').slice(0, 24)} (${a.max_marks})`),
    'Total_Marks_Obtained',
    'Max_Possible_Marks',
  ].map(csvCell);

  const maxTotal = assignments.reduce((acc, a) => acc + Number(a.max_marks || 0), 0);
  const csvRows = [headerCols.join(',')];

  for (const e of enrRes.rows) {
    let studentTotal = 0;
    const markCells = assignments.map((a) => {
      const key = `${Number(a.id)}:${String(e.student_email || '').toLowerCase()}`;
      const sub = subMap.get(key);
      if (sub && sub.marks_obtained !== null && sub.marks_obtained !== undefined) {
        const m = Number(sub.marks_obtained);
        studentTotal += m;
        return m.toFixed(1);
      }
      return sub ? 'SUBMITTED_UNGRADED' : '0.0';
    });

    const rowValues = [
      off.tcs_ion_course_id || `TCS-ION-${off.course_code}`,
      off.course_code,
      e.roll_no || 'PENDING_ROLL',
      e.student_name || 'Student',
      e.student_email,
      e.section || 'Sec A',
      e.attendance_pct !== null && e.attendance_pct !== undefined
        ? Number(e.attendance_pct).toFixed(1)
        : 'NOT_SYNCED',
      e.tcs_ion_credits || 4,
      ...markCells,
      studentTotal.toFixed(1),
      maxTotal.toFixed(1),
    ].map(csvCell);

    csvRows.push(rowValues.join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const safeFilename = safeContentDispositionFilename(
    `TCS_iON_Marks_${off.course_code}_${off.academic_session || 'Session'}.csv`,
    'TCS_iON_Marks.csv'
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(csvContent);
});

/**
 * Shared transactional marksheet upsert helper used by both Excel workbook uploads and live spreadsheet saves.
 */
async function upsertMarksEntries({ db, offeringId, gradedByName, entries, perms = null }) {
  const [enrRes, asgnRes] = await Promise.all([
    db.query(
      'SELECT * FROM course_enrollments WHERE offering_id = $1',
      [offeringId]
    ),
    db.query(
      'SELECT id, title, max_marks, target_sections FROM classroom_assignments WHERE offering_id = $1',
      [offeringId]
    ),
  ]);

  const byEmail = new Map();
  const byRoll = new Map();
  const missingUserEmails = [];

  for (const enr of enrRes.rows) {
    const em = String(enr.student_email || '').trim().toLowerCase();
    const rn = String(enr.roll_no || '').trim().toLowerCase();
    if (em) byEmail.set(em, enr);
    if (rn) byRoll.set(rn, enr);
    if (!enr.student_id && em) missingUserEmails.push(em);
  }

  const userLookup = new Map();
  if (missingUserEmails.length > 0) {
    const uRes = await db.query(
      'SELECT id, LOWER(email) AS email, name, roll_no FROM users WHERE LOWER(email) = ANY($1::text[])',
      [missingUserEmails]
    );
    for (const u of uRes.rows) {
      userLookup.set(String(u.email).toLowerCase(), u);
    }
  }

  const assignmentMap = new Map();
  for (const a of asgnRes.rows) {
    assignmentMap.set(Number(a.id), a);
  }

  let updatedMarks = 0;
  let skippedCells = 0;
  const studentsMatched = new Set();
  const warnings = [];

  await withTransaction(db, async (tx) => {
    for (const rawEntry of entries) {
      const aid = Number(rawEntry.assignment_id);
      const asgn = assignmentMap.get(aid);
      if (!asgn) {
        skippedCells++;
        if (warnings.length < 10) {
          warnings.push(`Unknown assignment ID ${rawEntry.assignment_id} for this course.`);
        }
        continue;
      }

      const emailKey = String(rawEntry.student_email || '').trim().toLowerCase();
      const rollKey = String(rawEntry.student_roll_no || '').trim().toLowerCase();
      const enr = (emailKey && byEmail.get(emailKey)) || (rollKey && byRoll.get(rollKey)) || null;
      if (!enr) {
        skippedCells++;
        if (warnings.length < 10) {
          warnings.push(
            `Student not on course roster: ${rawEntry.student_email || rawEntry.student_roll_no || 'unknown'}`
          );
        }
        continue;
      }

      const canonicalEmail = String(enr.student_email || '').trim().toLowerCase();
      if (perms && !canStaffGradeTarget(perms, asgn.target_sections, enr.section || 'Sec A')) {
        skippedCells++;
        if (warnings.length < 10) {
          warnings.push(
            `Read-only: ${canonicalEmail} (${enr.section || 'Sec A'}) on section-specific assignment "${asgn.title}" is outside your assigned section(s).`
          );
        }
        continue;
      }

      const fallbackUser = userLookup.get(canonicalEmail);
      const resolvedStudentId = enr.student_id ? Number(enr.student_id) : fallbackUser ? Number(fallbackUser.id) : null;
      if (!resolvedStudentId) {
        skippedCells++;
        if (warnings.length < 10) {
          warnings.push(
            `${enr.student_name || canonicalEmail} (${enr.roll_no || 'No roll'}) hasn't signed in yet — account needed before saving marks.`
          );
        }
        continue;
      }

      const maxMarks = Number(asgn.max_marks || 100);
      const numericMarks = Number(rawEntry.marks_obtained);
      if (!Number.isFinite(numericMarks) || numericMarks < 0 || numericMarks > maxMarks) {
        skippedCells++;
        if (warnings.length < 10) {
          warnings.push(
            `Out-of-range marks (${rawEntry.marks_obtained}) for ${canonicalEmail} on "${asgn.title}" (0–${maxMarks}).`
          );
        }
        continue;
      }

      const roundedMarks = Number(numericMarks.toFixed(2));
      const hasFeedback = rawEntry.feedback !== undefined;
      const feedbackVal = hasFeedback
        ? String(rawEntry.feedback ?? '').trim() || null
        : null;

      await tx.query(
        `INSERT INTO assignment_submissions (
           assignment_id, student_id, student_name, student_email, student_roll_no,
           submission_url, upload_mode, file_name,
           marks_obtained, feedback, graded_by_name, graded_at, submitted_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           'excel://marks-sheet', 'EXCEL_SHEET', 'Evaluated via Faculty Marks Sheet',
           $6, $7, $8, NOW(), NOW(), NOW()
         )
         ON CONFLICT (assignment_id, student_id) DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained,
           feedback = CASE WHEN $9::boolean THEN EXCLUDED.feedback ELSE assignment_submissions.feedback END,
           graded_by_name = EXCLUDED.graded_by_name,
           graded_at = NOW(),
           updated_at = NOW()`,
        [
          aid,
          resolvedStudentId,
          enr.student_name || fallbackUser?.name || canonicalEmail.split('@')[0],
          canonicalEmail,
          enr.roll_no || fallbackUser?.roll_no || null,
          roundedMarks,
          feedbackVal,
          gradedByName || 'Course Faculty',
          hasFeedback,
        ]
      );

      updatedMarks++;
      studentsMatched.add(canonicalEmail);
    }
  });

  return {
    updated_marks: updatedMarks,
    students_matched: studentsMatched.size,
    skipped_cells: skippedCells,
    warnings,
  };
}

/**
 * GET /classroom/offerings/:id/marks-workbook.xlsx
 * Download ready-to-edit Excel (.xlsx) marksheet pre-populated with roster & current grades
 */
router.get('/classroom/offerings/:id/marks-workbook.xlsx', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course && !perms.can_grade) {
    res.status(403).json({
      detail: 'Only instructors or authorized TAs of this course can download marks workbooks.',
    });
    return;
  }

  const offRes = await db.query(
    'SELECT id, course_code, academic_session FROM course_offerings WHERE id = $1 LIMIT 1',
    [offeringId]
  );
  if (offRes.rowCount === 0) {
    res.status(404).json({ detail: 'Course offering not found' });
    return;
  }
  const off = offRes.rows[0];
  const requestedAssignmentId = req.query.assignment_id
    ? parsePositiveInt(req.query.assignment_id)
    : null;
  const requestedSection = req.query.section ? normalizeSectionName(req.query.section) : 'ALL';
  const filterBySection = Boolean(requestedSection && requestedSection !== 'ALL');

  const [enrRes, asgnRes, subRes] = await Promise.all([
    filterBySection
      ? db.query(
          'SELECT * FROM course_enrollments WHERE offering_id = $1 AND LOWER(COALESCE(section, \'Sec A\')) = LOWER($2) ORDER BY roll_no ASC NULLS LAST, student_email ASC',
          [offeringId, requestedSection]
        )
      : db.query(
          'SELECT * FROM course_enrollments WHERE offering_id = $1 ORDER BY roll_no ASC NULLS LAST, student_email ASC',
          [offeringId]
        ),
    db.query(
      requestedAssignmentId
        ? 'SELECT id, title, max_marks, target_sections FROM classroom_assignments WHERE offering_id = $1 AND id = $2 ORDER BY id ASC'
        : 'SELECT id, title, max_marks, target_sections FROM classroom_assignments WHERE offering_id = $1 ORDER BY id ASC',
      requestedAssignmentId ? [offeringId, requestedAssignmentId] : [offeringId]
    ),
    db.query(
      `SELECT s.* FROM assignment_submissions s
       JOIN classroom_assignments a ON a.id = s.assignment_id
       WHERE a.offering_id = $1`,
      [offeringId]
    ),
  ]);

  const assignments =
    !requestedAssignmentId && filterBySection
      ? asgnRes.rows.filter((a) => canStudentViewTargets(requestedSection, a.target_sections))
      : asgnRes.rows;
  const subMap = new Map();
  for (const s of subRes.rows) {
    const key = `${Number(s.assignment_id)}:${String(s.student_email || '').toLowerCase()}`;
    subMap.set(key, s);
  }

  const isSingle = Boolean(requestedAssignmentId && assignments.length === 1);
  let headers;
  let rows;

  if (isSingle) {
    const a = assignments[0];
    headers = [
      'Roll_No',
      'Student_Name',
      'Student_Email',
      'Section',
      `[A${a.id}] Marks (Max ${Number(a.max_marks || 100)})`,
      'Feedback',
    ];
    rows = enrRes.rows.map((e) => {
      const sub = subMap.get(`${Number(a.id)}:${String(e.student_email || '').toLowerCase()}`);
      const markVal =
        sub && sub.marks_obtained !== null && sub.marks_obtained !== undefined
          ? Number(sub.marks_obtained)
          : '';
      return [
        e.roll_no || '',
        e.student_name || '',
        e.student_email || '',
        e.section || 'Sec A',
        markVal,
        sub?.feedback || '',
      ];
    });
  } else {
    const maxTotal = assignments.reduce((acc, a) => acc + Number(a.max_marks || 0), 0);
    headers = [
      'Roll_No',
      'Student_Name',
      'Student_Email',
      'Section',
      ...assignments.map(
        (a) => `[A${a.id}] ${String(a.title || '').slice(0, 26)} (Max ${Number(a.max_marks || 100)})`
      ),
      'Total_Obtained',
      'Total_Max',
      'Percentage',
    ];
    rows = enrRes.rows.map((e) => {
      let total = 0;
      const markCells = assignments.map((a) => {
        const sub = subMap.get(`${Number(a.id)}:${String(e.student_email || '').toLowerCase()}`);
        if (sub && sub.marks_obtained !== null && sub.marks_obtained !== undefined) {
          const m = Number(sub.marks_obtained);
          total += m;
          return m;
        }
        return '';
      });
      const pct = maxTotal > 0 ? Number(((total / maxTotal) * 100).toFixed(1)) : 0;
      return [
        e.roll_no || '',
        e.student_name || '',
        e.student_email || '',
        e.section || 'Sec A',
        ...markCells,
        Number(total.toFixed(2)),
        maxTotal,
        pct,
      ];
    });
  }

  const xlsxBuf = await buildXlsxBuffer({
    sheetName: `${off.course_code}_Marks`,
    headers,
    rows,
  });

  const safeFilename = safeContentDispositionFilename(
    `${off.course_code}_Marks_Sheet.xlsx`,
    'Course_Marks_Sheet.xlsx'
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(xlsxBuf);
});

/**
 * POST /classroom/offerings/:id/marks-upload
 * Upload filled Excel (.xlsx) or CSV/TSV marksheet to grade enrolled students in batch
 */
router.post(
  '/classroom/offerings/:id/marks-upload',
  requireAuth,
  rosterUpload.single('file'),
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    if (!offeringId) {
      res.status(400).json({ detail: 'Invalid offering ID' });
      return;
    }
    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course && !perms.can_grade) {
      res.status(403).json({
        detail: 'Only instructors or authorized TAs of this course can upload marksheets.',
      });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ detail: 'Please attach an .xlsx or .csv file.' });
      return;
    }

    let parsed;
    try {
      parsed = await parseSpreadsheetRows(req.file.buffer, req.file.originalname);
    } catch (err) {
      res.status(400).json({ detail: err?.message || 'Unable to read Excel/CSV marks file.' });
      return;
    }

    if (!parsed.headers.length || !parsed.rows.length) {
      res.status(400).json({ detail: 'No student rows found inside the uploaded marksheet.' });
      return;
    }

    const asgnRes = await db.query(
      'SELECT id, title, max_marks FROM classroom_assignments WHERE offering_id = $1 ORDER BY id ASC',
      [offeringId]
    );
    const courseAssignments = asgnRes.rows;
    if (courseAssignments.length === 0) {
      res.status(400).json({
        detail: 'Create at least one assignment/quiz in this classroom before importing marks.',
      });
      return;
    }

    const byId = new Map(courseAssignments.map((a) => [Number(a.id), a]));
    const byTitle = new Map(
      courseAssignments.map((a) => [String(a.title || '').trim().toLowerCase(), a])
    );

    const headersLower = parsed.headers.map((h) => String(h || '').trim().toLowerCase());
    const emailCol = headersLower.findIndex((h) => h.includes('email') || h === 'mail');
    const rollCol = headersLower.findIndex((h) => h.includes('roll'));
    const feedbackCol = headersLower.findIndex(
      (h) => h === 'feedback' || h.includes('remark') || h.includes('comment')
    );

    if (emailCol < 0 && rollCol < 0) {
      res.status(400).json({
        detail: 'Spreadsheet must include a Student_Email or Roll_No column.',
      });
      return;
    }

    const fallbackAssignmentId = req.body?.assignment_id
      ? parsePositiveInt(req.body.assignment_id)
      : courseAssignments.length === 1
      ? Number(courseAssignments[0].id)
      : null;

    const assignmentCols = [];
    parsed.headers.forEach((rawHeader, colIdx) => {
      if (colIdx === emailCol || colIdx === rollCol || colIdx === feedbackCol) return;
      const hTrim = String(rawHeader || '').trim();
      const hLow = hTrim.toLowerCase();
      if (
        !hLow ||
        ['roll_no', 'student_name', 'student_email', 'section', 'total_obtained', 'total_max', 'percentage'].includes(
          hLow
        )
      ) {
        return;
      }

      const tagMatch = /\[a(\d+)\]/i.exec(hTrim);
      if (tagMatch && byId.has(Number(tagMatch[1]))) {
        assignmentCols.push({ colIdx, assignmentId: Number(tagMatch[1]) });
        return;
      }

      const titleMatch = byTitle.get(hLow);
      if (titleMatch) {
        assignmentCols.push({ colIdx, assignmentId: Number(titleMatch.id) });
        return;
      }

      if (
        fallbackAssignmentId &&
        byId.has(fallbackAssignmentId) &&
        (hLow.includes('mark') || hLow.includes('score') || hLow === 'grade')
      ) {
        assignmentCols.push({ colIdx, assignmentId: fallbackAssignmentId });
      }
    });

    if (assignmentCols.length === 0) {
      res.status(400).json({
        detail:
          'No matching assignment mark columns found. Download the course Excel sheet first or name a column with [A<id>] / exact assignment title.',
      });
      return;
    }

    const entries = [];
    for (const row of parsed.rows) {
      const stuEmail = emailCol >= 0 ? String(row[emailCol] || '').trim() : '';
      const stuRoll = rollCol >= 0 ? String(row[rollCol] || '').trim() : '';
      if (!stuEmail && !stuRoll) continue;
      const fb = feedbackCol >= 0 ? String(row[feedbackCol] ?? '').trim() : undefined;

      for (const col of assignmentCols) {
        const rawCell = String(row[col.colIdx] ?? '').trim();
        if (
          !rawCell ||
          rawCell === '—' ||
          rawCell === '-' ||
          rawCell.toUpperCase() === 'N/A' ||
          rawCell.toUpperCase() === 'SUBMITTED_UNGRADED'
        ) {
          continue;
        }
        const entry = {
          student_email: stuEmail,
          student_roll_no: stuRoll,
          assignment_id: col.assignmentId,
          marks_obtained: rawCell,
        };
        if (assignmentCols.length === 1 && feedbackCol >= 0) {
          entry.feedback = fb;
        }
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      res.status(400).json({ detail: 'No numeric marks found inside the uploaded spreadsheet.' });
      return;
    }

    const summary = await upsertMarksEntries({
      db,
      offeringId,
      gradedByName: req.user.name,
      entries,
      perms,
    });

    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'EXCEL_MARKS_UPLOAD',
      entityType: 'OFFERING',
      entityId: offeringId,
      metadata: summary,
    });

    res.json({
      message: `Updated ${summary.updated_marks} mark cell(s) across ${summary.students_matched} student(s) (${summary.skipped_cells} skipped).`,
      ...summary,
    });
  }
);

/**
 * POST /classroom/offerings/:id/marks-bulk
 * Batch save directly from the in-browser Excel-style marks grid
 */
router.post('/classroom/offerings/:id/marks-bulk', requireAuth, async (req, res) => {
  const db = await getDb();
  const offeringId = parsePositiveInt(req.params.id);
  if (!offeringId) {
    res.status(400).json({ detail: 'Invalid offering ID' });
    return;
  }
  const perms = await getCourseStaffPermissions(db, offeringId, req.user);
  if (!perms.can_manage_course && !perms.can_grade) {
    res.status(403).json({
      detail: 'Only instructors or authorized TAs of this course can save bulk marks.',
    });
    return;
  }

  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (entries.length === 0) {
    res.status(400).json({ detail: 'No mark entries provided.' });
    return;
  }
  if (entries.length > 2000) {
    res.status(400).json({ detail: 'Maximum 2000 mark cells per save request.' });
    return;
  }

  const summary = await upsertMarksEntries({
    db,
    offeringId,
    gradedByName: req.user.name,
    entries,
    perms,
  });

  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'BULK_MARKS_SAVE',
    entityType: 'OFFERING',
    entityId: offeringId,
    metadata: summary,
  });

  res.json({
    message: `Saved ${summary.updated_marks} mark(s) across ${summary.students_matched} student(s)${
      summary.skipped_cells > 0 ? ` (${summary.skipped_cells} skipped)` : ''
    }.`,
    ...summary,
  });
});

/**
 * GET /classroom/roster-template.csv
 * Downloadable template showing valid columns for Excel (.xlsx) or CSV student roster upload
 */
router.get('/classroom/roster-template.csv', (_req, res) => {
  const sampleCsv = [
    'email,name,roll_no,section,attendance_pct',
    'student1@jklu.edu.in,Aarav Sharma,2024BTECH001,Sec A,92',
    'student2@jklu.edu.in,Diya Patel,2024BTECH002,Sec A,86',
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="JKLU_Course_Roster_Template.csv"');
  res.send(sampleCsv);
});

/**
 * POST /classroom/offerings/:id/roster-upload
 * Allows assigned course professor or IT full_admin to bulk-enroll @jklu.edu.in emails via .xlsx or .csv
 */
router.post(
  '/classroom/offerings/:id/roster-upload',
  requireAuth,
  rosterUpload.single('file'),
  async (req, res) => {
    const db = await getDb();
    const offeringId = parsePositiveInt(req.params.id);
    if (!offeringId) {
      res.status(400).json({ detail: 'Invalid offering ID' });
      return;
    }

    const perms = await getCourseStaffPermissions(db, offeringId, req.user);
    if (!perms.can_manage_course) {
      res.status(403).json({ detail: 'Only course instructors or IT Admin can upload course rosters.' });
      return;
    }
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ detail: 'Excel (.xlsx) or CSV roster file is required.' });
      return;
    }

    let parsedRows = [];
    try {
      parsedRows = await parseRosterFileBuffer(req.file.buffer, req.file.originalname);
    } catch (err) {
      res.status(400).json({ detail: err?.message || 'Unable to read Excel/CSV roster file.' });
      return;
    }

    if (parsedRows.length === 0) {
      res.status(400).json({ detail: 'No student rows found in the uploaded file.' });
      return;
    }
    if (parsedRows.length > 500) {
      res.status(400).json({
        detail: 'Maximum 500 student rows per roster upload. Please split larger files.',
      });
      return;
    }

    let defaultRosterSection = req.body?.default_section
      ? normalizeSectionName(req.body.default_section)
      : perms.can_manage_all_sections
        ? 'Sec A'
        : perms.assigned_sections[0] || 'Sec A';
    if (!defaultRosterSection || defaultRosterSection === 'ALL') {
      defaultRosterSection = perms.can_manage_all_sections
        ? 'Sec A'
        : perms.assigned_sections[0] || 'Sec A';
    }
    if (!perms.can_manage_all_sections && !canStaffAccessSection(perms, defaultRosterSection)) {
      res.status(403).json({
        detail: `Section-scoped faculty can only upload rosters to their assigned section(s): ${perms.assigned_sections.join(', ')}.`,
      });
      return;
    }

    let imported = 0;
    let linkedExisting = 0;
    let preEnrolled = 0;
    let skippedInvalid = 0;
    const invalidSamples = [];
    const importedSections = new Set();

    await withTransaction(db, async (tx) => {
      for (const row of parsedRows) {
        const email = String(row.email || '').toLowerCase().trim();
        if (!email || !/^[^\s@]+@jklu\.edu\.in$/i.test(email)) {
          skippedInvalid++;
          if (invalidSamples.length < 5) {
            invalidSamples.push(`Row ${row.rowNumber}: ${row.email || '(missing email)'}`);
          }
          continue;
        }

        const candidateSection = row.has_explicit_section
          ? normalizeSectionName(row.section)
          : defaultRosterSection;
        const targetSection =
          candidateSection === 'ALL' ? defaultRosterSection : candidateSection;

        if (!perms.can_manage_all_sections && !canStaffAccessSection(perms, targetSection)) {
          skippedInvalid++;
          if (invalidSamples.length < 5) {
            invalidSamples.push(
              `Row ${row.rowNumber}: ${email} targets ${targetSection} (outside your section)`
            );
          }
          continue;
        }

        if (!perms.can_manage_all_sections) {
          const curEnr = await tx.query(
            'SELECT section FROM course_enrollments WHERE offering_id = $1 AND LOWER(student_email) = $2 LIMIT 1',
            [offeringId, email]
          );
          if (curEnr.rowCount > 0 && !canStaffAccessSection(perms, curEnr.rows[0].section || 'Sec A')) {
            skippedInvalid++;
            if (invalidSamples.length < 5) {
              invalidSamples.push(
                `Row ${row.rowNumber}: ${email} already belongs to ${curEnr.rows[0].section}`
              );
            }
            continue;
          }
        }

        let attVal = null;
        if (row.attendance_raw !== undefined && row.attendance_raw !== '') {
          const parsedAtt = Number(row.attendance_raw);
          if (!Number.isFinite(parsedAtt) || parsedAtt < 0 || parsedAtt > 100) {
            skippedInvalid++;
            if (invalidSamples.length < 5) {
              invalidSamples.push(`Row ${row.rowNumber}: invalid attendance (${row.attendance_raw})`);
            }
            continue;
          }
          attVal = Number(parsedAtt.toFixed(2));
        }

        const existingUser = await tx.query(
          'SELECT id, name, roll_no FROM users WHERE LOWER(email) = $1 LIMIT 1',
          [email]
        );
        const uRow = existingUser.rowCount > 0 ? existingUser.rows[0] : null;
        const resolvedStudentId = uRow ? Number(uRow.id) : null;
        const resolvedName = row.name || uRow?.name || email.split('@')[0];
        const resolvedRoll = row.roll_no || uRow?.roll_no || null;

        await tx.query(
          `INSERT INTO course_enrollments (
             offering_id, student_id, roll_no, student_name, student_email,
             section, enroll_source, attendance_pct
           ) VALUES ($1, $2, $3, $4, $5, $6, 'ROSTER_EXCEL', $7)
           ON CONFLICT (offering_id, student_email) DO UPDATE SET
             student_id = COALESCE(course_enrollments.student_id, EXCLUDED.student_id),
             roll_no = COALESCE(NULLIF(EXCLUDED.roll_no, ''), course_enrollments.roll_no),
             student_name = COALESCE(NULLIF(EXCLUDED.student_name, ''), course_enrollments.student_name),
             section = COALESCE(NULLIF(EXCLUDED.section, ''), course_enrollments.section),
             attendance_pct = COALESCE(EXCLUDED.attendance_pct, course_enrollments.attendance_pct)`,
          [
            offeringId,
            resolvedStudentId,
            resolvedRoll,
            resolvedName,
            email,
            targetSection,
            attVal,
          ]
        );

        importedSections.add(targetSection);
        imported++;
        if (resolvedStudentId) linkedExisting++;
        else preEnrolled++;
      }
    });

    await mergeOfferingSections(db, offeringId, Array.from(importedSections));

    await writeAuditLog(db, {
      actorId: req.user.id,
      action: 'UPLOAD_COURSE_ROSTER',
      entityType: 'OFFERING',
      entityId: offeringId,
      metadata: { imported, linkedExisting, preEnrolled, skippedInvalid },
    });

    res.json({
      message: `Enrolled ${imported} @jklu.edu.in student(s) (${linkedExisting} active accounts linked, ${preEnrolled} pre-enrolled for first login, ${skippedInvalid} skipped).`,
      imported,
      linked_existing: linkedExisting,
      pre_enrolled: preEnrolled,
      skipped_invalid: skippedInvalid,
      invalid_samples: invalidSamples,
    });
  }
);

export default router;
