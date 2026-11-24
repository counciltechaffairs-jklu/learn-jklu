import assert from 'node:assert/strict';
import http from 'node:http';
import {
  validateHttpsUrl,
  validateUrlLinkList,
  csvCell,
  safeContentDispositionFilename,
  parseCsvRfc4180,
} from '../src/utils/security.js';
import { isAllowedAuraUrl } from '../src/utils/pdfStorage.js';
import {
  canVerifyStudentIds,
  canManagePapers,
  canManageContests,
  canAccessAdminPanel,
  signUserToken,
} from '../src/middleware/auth.js';
import { formatPaperResponse } from '../src/utils/paperHelpers.js';

// 1. URL scheme validation tests
assert.equal(validateHttpsUrl('https://drive.google.com/file/d/abc/view').ok, true);
assert.equal(validateHttpsUrl('javascript:alert(1)').ok, false);
assert.equal(validateHttpsUrl('data:text/html,<script>alert(1)</script>').ok, false);
assert.equal(validateHttpsUrl('http://insecure.example.com').ok, false);
assert.equal(validateHttpsUrl('', { required: false }).ok, true);
assert.equal(validateHttpsUrl('', { required: true }).ok, false);

assert.equal(
  validateUrlLinkList([{ label: 'Good', url: 'https://github.com/org/repo' }]).ok,
  true
);
assert.equal(
  validateUrlLinkList([{ label: 'Evil', url: 'javascript:alert(1)' }]).ok,
  false
);

// 2. CSV formula injection & RFC-4180 tests
assert.equal(csvCell('=CMD("calc")'), `"'=CMD(""calc"")"`);
assert.equal(csvCell('+1+1'), `'+1+1`);
assert.equal(csvCell('-2+3'), `'-2+3`);
assert.equal(csvCell('@SUM(A1:A2)'), `'@SUM(A1:A2)`);
assert.equal(csvCell('Normal, Name'), '"Normal, Name"');
assert.equal(safeContentDispositionFilename('bad\r\nname"../test.csv'), 'bad__name___test.csv');

const parsedCsv = parseCsvRfc4180(
  'Roll_No,Student_Name,Email,Section\r\n2024BTECH001,"Sharma, Aarav",aarav@jklu.edu.in,Sec A\n2024BTECH002,"O""Brien, Sam",sam@jklu.edu.in,"Sec B"'
);
assert.equal(parsedCsv.length, 3);
assert.deepEqual(parsedCsv[1], ['2024BTECH001', 'Sharma, Aarav', 'aarav@jklu.edu.in', 'Sec A']);
assert.deepEqual(parsedCsv[2], ['2024BTECH002', 'O"Brien, Sam', 'sam@jklu.edu.in', 'Sec B']);

// 3. AURA SSRF allowlist tests
assert.equal(isAllowedAuraUrl('https://aura.jklu.edu.in/server/api/core/bitstreams/123/content'), true);
assert.equal(isAllowedAuraUrl('http://aura.jklu.edu.in/server/api/core/bitstreams/123/content'), false);
assert.equal(isAllowedAuraUrl('http://169.254.169.254/latest/meta-data/'), false);
assert.equal(isAllowedAuraUrl('https://evil.com/aura.jklu.edu.in'), false);

// 4. Least-privilege RBAC capability split tests
const professor = { is_admin: false, admin_role: 'professor' };
const codingTa = { is_admin: false, admin_role: 'coding_ta' };
const paperAdmin = { is_admin: false, admin_role: 'paper_admin' };
const subAdmin = { is_admin: false, admin_role: 'sub_admin' };
const fullAdmin = { is_admin: true, admin_role: 'full_admin' };
const student = { is_admin: false, admin_role: null };

assert.equal(canVerifyStudentIds(professor), false, 'professor must NOT verify student IDs');
assert.equal(canVerifyStudentIds(codingTa), false, 'coding_ta must NOT verify student IDs');
assert.equal(canVerifyStudentIds(paperAdmin), false, 'paper_admin must NOT verify student IDs');
assert.equal(canVerifyStudentIds(subAdmin), true);
assert.equal(canVerifyStudentIds(fullAdmin), true);

assert.equal(canManagePapers(professor), false, 'professor must NOT edit/delete arbitrary papers');
assert.equal(canManagePapers(codingTa), false, 'coding_ta must NOT edit/delete arbitrary papers');
assert.equal(canManagePapers(paperAdmin), true);
assert.equal(canManagePapers(fullAdmin), true);

assert.equal(canManageContests(professor), false);
assert.equal(canManageContests(codingTa), true);
assert.equal(canAccessAdminPanel(professor), false);
assert.equal(canAccessAdminPanel(student), false);
assert.equal(canAccessAdminPanel(codingTa), true);

// 5. Paper response PII & file_path omission tests
const sampleRow = {
  id: 10,
  course_id: 2,
  course_code: 'CS1135',
  course_name: 'DSA',
  uploaded_by: 5,
  uploader_name: 'Aman',
  uploader_email: 'aman@jklu.edu.in',
  title: 'DSA Endterm',
  paper_type: 'ENDTERM',
  year: 2025,
  semester: '3',
  department: 'B.TECH',
  file_path: '/secret/server/path/dsa.pdf',
  file_name: 'dsa.pdf',
  file_size: 1024,
  status: 'APPROVED',
  public_link_id: 'abc12345',
  download_count: 5,
};
const publicFormatted = [sampleRow, sampleRow].map((r) => formatPaperResponse(r, false));
assert.equal(publicFormatted[0].uploader_email, null);
assert.equal(publicFormatted[1].uploader_email, null);
assert.equal('file_path' in publicFormatted[0], false, 'file_path must be omitted from public response');

const staffFormatted = formatPaperResponse(sampleRow, true);
assert.equal(staffFormatted.uploader_email, 'aman@jklu.edu.in');
assert.equal(staffFormatted.file_path, '/secret/server/path/dsa.pdf');

// 6. Live Express + PGlite HTTP integration smoke test (ephemeral port)
const { initDatabaseAndSeed, closeDb, getDb } = await import('../src/config/db.js');
const { default: app } = await import('../src/app.js');

await initDatabaseAndSeed();
const db = await getDb();

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  // Health & maintenance
  const healthRes = await fetch(`${base}/health`);
  assert.equal(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.equal(healthJson.status, 'healthy');

  // Verify internal cache prefix blocked on /uploads
  const cacheUploadRes = await fetch(`${base}/uploads/db_1_secret.pdf`);
  assert.equal(cacheUploadRes.status, 404);

  // Verify professor token cannot access /admin/verification-requests or DELETE /courses/1
  const profRes = await db.query(
    `SELECT id, email, is_admin, admin_role, token_version FROM users WHERE admin_role = 'professor' LIMIT 1`
  );
  if (profRes.rowCount > 0) {
    const profToken = signUserToken(profRes.rows[0]);
    const verRes = await fetch(`${base}/admin/verification-requests`, {
      headers: { Authorization: `Bearer ${profToken}` },
    });
    assert.equal(verRes.status, 403, 'Professor must be 403 on verification-requests');

    const delCourseRes = await fetch(`${base}/courses/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${profToken}` },
    });
    assert.equal(delCourseRes.status, 403, 'Professor must be 403 on DELETE /courses/:id');

    // Verify token_version mismatch revokes token immediately
    const staleToken = signUserToken({ ...profRes.rows[0], token_version: 999 });
    const meStale = await fetch(`${base}/me`, {
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    assert.equal(meStale.status, 401, 'Stale token_version must be rejected with 401');
  }

  // Verify /classroom/offerings returns paginated items for authenticated user
  const studentRes = await db.query(
    `SELECT id, email, is_admin, admin_role, token_version FROM users WHERE admin_role IS NULL AND is_admin = FALSE LIMIT 1`
  );
  if (studentRes.rowCount > 0) {
    const stuToken = signUserToken(studentRes.rows[0]);
    const offRes = await fetch(`${base}/classroom/offerings?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${stuToken}` },
    });
    assert.equal(offRes.status, 200);
    const offJson = await offRes.json();
    assert.equal(Array.isArray(offJson.items), true);
    assert.equal(typeof offJson.total, 'number');

    // Invalid :id must return 400 instead of 500 PostgreSQL NaN error
    const badOffRes = await fetch(`${base}/classroom/offerings/notanid`, {
      headers: { Authorization: `Bearer ${stuToken}` },
    });
    assert.equal(badOffRes.status, 400, 'Non-integer offering ID must return 400');

    const badGradeIdRes = await fetch(`${base}/classroom/submissions/notanid/grade`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${stuToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ marks_obtained: 10 }),
    });
    assert.equal(badGradeIdRes.status, 400, 'Non-integer submission ID must return 400');
  }

  // Verify invalid due_at and invalid/null marks_obtained on classroom grading
  const adminRes = await db.query(
    `SELECT id, email, is_admin, admin_role, token_version FROM users WHERE is_admin = TRUE LIMIT 1`
  );
  if (adminRes.rowCount > 0) {
    const adminToken = signUserToken(adminRes.rows[0]);
    const anyOff = await db.query('SELECT id FROM course_offerings LIMIT 1');
    if (anyOff.rowCount > 0) {
      const badDueRes = await fetch(`${base}/classroom/offerings/${anyOff.rows[0].id}/assignments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Bad Due Date Test', due_at: 'not-a-valid-date' }),
      });
      assert.equal(badDueRes.status, 400, 'Invalid due_at must return 400 instead of 500');
    }

    const anySub = await db.query('SELECT id, marks_obtained, feedback FROM assignment_submissions LIMIT 1');
    if (anySub.rowCount > 0) {
      const subId = anySub.rows[0].id;
      const origMarks = anySub.rows[0].marks_obtained;
      const origFeedback = anySub.rows[0].feedback;

      const negMarksRes = await fetch(`${base}/classroom/submissions/${subId}/grade`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ marks_obtained: -5 }),
      });
      assert.equal(negMarksRes.status, 400, 'Negative marks_obtained must return 400');

      const nullMarksRes = await fetch(`${base}/classroom/submissions/${subId}/grade`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ marks_obtained: null, feedback: origFeedback }),
      });
      assert.equal(nullMarksRes.status, 200);
      const nullMarksJson = await nullMarksRes.json();
      assert.equal(nullMarksJson.submission.marks_obtained, null, 'null marks_obtained must clear grade to NULL, not 0');

      // Restore original marks
      await fetch(`${base}/classroom/submissions/${subId}/grade`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ marks_obtained: origMarks, feedback: origFeedback }),
      });
    }

    // Verify CORS exposes X-Total-Count on /admin/users
    const usersCorsRes = await fetch(`${base}/admin/users?page=1&limit=5`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Origin: 'http://localhost:3000',
      },
    });
    assert.equal(usersCorsRes.status, 200);
    const exposed = usersCorsRes.headers.get('access-control-expose-headers') || '';
    assert.equal(exposed.toLowerCase().includes('x-total-count'), true, 'CORS must expose X-Total-Count');
  }

  // Verify admin-login returns uniform 401 for non-admin user (no enumeration)
  const capRes = await fetch(`${base}/captcha/challenge`);
  const cap = await capRes.json();
  assert.equal(cap.mode, 'builtin');
  const [a, b] = cap.question.match(/\d+/g).map(Number);
  const adminLoginRes = await fetch(`${base}/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'aman.student@jklu.edu.in',
      password: 'wrongpassword',
      captcha_challenge: {
        id: cap.id,
        answer: String(a + b),
        expiresAt: cap.expiresAt,
        signature: cap.signature,
      },
    }),
  });
  assert.equal(adminLoginRes.status, 401);

  // Verify /register rejects non-@jklu.edu.in email
  const capRes2 = await fetch(`${base}/captcha/challenge`);
  const cap2 = await capRes2.json();
  const [a2, b2] = cap2.question.match(/\d+/g).map(Number);
  const regRes = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'External Attacker',
      email: 'attacker@gmail.com',
      password: 'password123',
      confirm_password: 'password123',
      captcha_challenge: {
        id: cap2.id,
        answer: String(a2 + b2),
        expiresAt: cap2.expiresAt,
        signature: cap2.signature,
      },
    }),
  });
  assert.equal(regRes.status, 400, 'Non-@jklu.edu.in registration must be rejected with 400');

  // 7. Interactive data-viz endpoints
  const { aggregateArchiveRows } = await import('../src/routes/system.js');
  const { bucketValues, GRADE_BUCKETS, ATTENDANCE_BUCKETS } = await import('../src/routes/classroom.js');
  const agg = aggregateArchiveRows([
    { department: 'b.tech', year: 2024, paper_type: 'endterm', course_code: 'CS1', course_name: 'A', school: 'IET', n: 3 },
    { department: 'BBA', year: 2022, paper_type: 'MIDTERM', course_code: 'CS1', course_name: 'A', school: 'IM', n: 2 },
    { department: 'BBA', year: 'bad', paper_type: 'MIDTERM', n: 9 },
  ]);
  assert.equal(agg.total, 5, 'invalid years must be skipped');
  assert.equal(agg.byDeptYearType['B.TECH'][2024].ENDTERM, 3);
  assert.deepEqual(agg.courseYears.CS1, [2022, 2024]);
  assert.deepEqual(agg.years, [2022, 2024]);
  assert.equal(agg.schoolTotals.IM, 2);
  const gb = bucketValues([0, 39.9, 40, 99, 100, 120, null], GRADE_BUCKETS);
  assert.equal(gb[0].count, 2);
  assert.equal(gb[1].count, 1);
  assert.equal(gb[6].count, 3, '>=90 (incl. >100 bonus) lands in top bucket; null ignored');
  const ab = bucketValues([74.99, 75, 100], ATTENDANCE_BUCKETS);
  assert.equal(ab[2].count, 1);
  assert.equal(ab[3].count, 1);
  assert.equal(ab[5].count, 1);

  const archiveRes = await fetch(`${base}/stats/archive`);
  assert.equal(archiveRes.status, 200);
  const archive = await archiveRes.json();
  assert.equal(typeof archive.total, 'number');
  assert.equal(archive.total > 0, true, '/stats/archive must report approved papers');
  assert.equal(typeof archive.byDeptYearType, 'object');
  assert.equal(typeof archive.courseYears, 'object');
  assert.equal(Array.isArray(archive.topCourses), true);
  const approvedCount = await db.query(`SELECT COUNT(*)::int AS n FROM papers WHERE UPPER(status) = 'APPROVED'`);
  if (Number(approvedCount.rows[0].n) > 0) {
    assert.equal(archive.source, 'database');
    assert.equal(archive.total, Number(approvedCount.rows[0].n), 'archive total must equal approved paper count');
  }

  const anaNoAuth = await fetch(`${base}/classroom/offerings/1/analytics`);
  assert.equal(anaNoAuth.status, 401, 'analytics must require auth');
  const actNoAuth = await fetch(`${base}/me/activity`);
  assert.equal(actNoAuth.status, 401, '/me/activity must require auth');

  if (studentRes.rowCount > 0) {
    const stuToken = signUserToken(studentRes.rows[0]);
    const badAna = await fetch(`${base}/classroom/offerings/notanid/analytics`, {
      headers: { Authorization: `Bearer ${stuToken}` },
    });
    assert.equal(badAna.status, 400, 'non-integer analytics id must be 400');
    const anyOff2 = await db.query('SELECT id FROM course_offerings LIMIT 1');
    if (anyOff2.rowCount > 0) {
      const stuAna = await fetch(`${base}/classroom/offerings/${anyOff2.rows[0].id}/analytics`, {
        headers: { Authorization: `Bearer ${stuToken}` },
      });
      assert.equal(stuAna.status, 403, 'students must be 403 on staff analytics');
    }
    const act = await fetch(`${base}/me/activity`, { headers: { Authorization: `Bearer ${stuToken}` } });
    assert.equal(act.status, 200);
    const actJson = await act.json();
    assert.equal(Array.isArray(actJson.days), true);
    assert.equal(typeof actJson.summary.enrolled_courses, 'number');
  }

  if (adminRes.rowCount > 0) {
    const adminToken = signUserToken(adminRes.rows[0]);
    const anyOff3 = await db.query('SELECT id FROM course_offerings LIMIT 1');
    if (anyOff3.rowCount > 0) {
      const admAna = await fetch(`${base}/classroom/offerings/${anyOff3.rows[0].id}/analytics`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(admAna.status, 200);
      const admJson = await admAna.json();
      assert.equal(typeof admJson.roster_size, 'number');
      assert.equal(Array.isArray(admJson.assignments), true);
      assert.equal(admJson.grades.buckets.length, GRADE_BUCKETS.length);
      assert.equal(
        admJson.attendance.synced_count + admJson.attendance.not_synced_count,
        admJson.roster_size
      );
    }
    const missingAna = await fetch(`${base}/classroom/offerings/999999/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(missingAna.status, 404);
  }

  console.log('✅ ALL BACKEND AUDIT VERIFICATION TESTS PASSED!');
} finally {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
}
