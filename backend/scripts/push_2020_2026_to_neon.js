import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '../src/config/db.js';
import { invalidateCachePrefix, closeCache } from '../src/config/cache.js';

const BINARY_OUT_DIR =
  [
    path.resolve(process.cwd(), '../pastpaper_bin'),
    path.resolve(process.cwd(), '../../pastpaper_bin'),
  ].find((dir) => fs.existsSync(path.join(dir, 'binary_manifest.json'))) ||
  path.resolve(process.cwd(), '../../pastpaper_bin');
const MANIFEST_PATH = path.join(BINARY_OUT_DIR, 'binary_manifest.json');

const SCHOOL_BY_DEPT = {
  'B.TECH': 'IET',
  BCA: 'IET',
  'M.TECH': 'IET',
  BBA: 'IM',
  MBA: 'IM',
  'B.COM': 'IM',
  'B.DES': 'ID',
  'M.DES': 'ID',
  PHD: 'PHD',
};

function parseVerifiedCourseCodeAndName(rawTitle, rawFileName, dept, sem) {
  const titleStr = String(rawTitle || '').trim();
  const fileStr = String(rawFileName || '')
    .replace(/\.pdf$/i, '')
    .trim();

  // Known exact overrides for the 3 OCR/untagged edge cases in 2020-2026
  if (/fundaments of automation engineering\s*-?\s*i\b/i.test(titleStr)) {
    return { code: 'ES1111', name: 'Fundamentals of Automation Engineering - I' };
  }
  if (/understanding cons.*ner behaviour/i.test(titleStr) || /^mk\s*10$/i.test(fileStr)) {
    return { code: 'MK10', name: 'Understanding Consumer Behaviour' };
  }
  if (/financial risk management/i.test(titleStr) && dept === 'PHD') {
    return { code: 'PHDFRM', name: 'Financial Risk Management' };
  }

  const candidates = [titleStr, fileStr].filter(Boolean);

  for (const text of candidates) {
    // 1. "Course Name (CS1135)" or "Course Name (TEMTech 223)" or "Course Name (E1407)"
    const parenMatch = text.match(/^(.*?)\(\s*([A-Za-z]{1,8}[-\s]?\d{2,4}[A-Za-z]?)\s*\)\s*$/);
    if (parenMatch) {
      const code = parenMatch[2].replace(/[-\s]/g, '').toUpperCase();
      const name =
        parenMatch[1]
          .replace(/^[-:;,\s]+|[-:;,\s]+$/g, '')
          .replace(/\bCongnitive\b/gi, 'Cognitive')
          .trim() || code;
      return { code, name };
    }

    // 2. "CS1108 - Operating Systems" or "ED1102- Idea To Business Model"
    const prefixMatch = text.match(/^([A-Za-z]{1,8}[-\s]?\d{2,4}[A-Za-z]?)\s*[-:;,.]+\s*(.+)$/);
    if (
      prefixMatch &&
      !/^(b\.?tech|m\.?tech|bba|bca|mba|b\.?com|b\.?des|sem)/i.test(prefixMatch[1])
    ) {
      const code = prefixMatch[1].replace(/[-\s]/g, '').toUpperCase();
      const name = prefixMatch[2].replace(/^[-:;,\s]+|[-:;,\s]+$/g, '').trim() || code;
      return { code, name };
    }

    // 3. "Number Theory AS1207"
    const suffixMatch = text.match(/^(.+?)\s+([A-Za-z]{1,8}[-\s]?\d{2,4}[A-Za-z]?)$/);
    if (suffixMatch && !/^(20\d{2}|sem.*)$/i.test(suffixMatch[2])) {
      const code = suffixMatch[2].replace(/[-\s]/g, '').toUpperCase();
      const name = suffixMatch[1].replace(/^[-:;,\s]+|[-:;,\s]+$/g, '').trim() || code;
      return { code, name };
    }

    // 4. Embedded code anywhere in string
    const anyMatch = text.match(/\b([A-Za-z]{2,7}[-\s]?\d{3,4}[A-Za-z]?)\b/);
    if (anyMatch && !/^20\d{2}$/.test(anyMatch[1])) {
      const code = anyMatch[1].replace(/[-\s]/g, '').toUpperCase();
      const name =
        text
          .replace(anyMatch[0], '')
          .replace(/[()]/g, '')
          .replace(/^[-:;,\s]+|[-:;,\s]+$/g, '')
          .trim() || code;
      return { code, name };
    }
  }

  return {
    code: `${dept.replace(/[^A-Z]/g, '')}${sem}01`,
    name: titleStr || 'University Course',
  };
}

function formatExamSession(item) {
  const abs = String(item.abstract || '').trim();
  const issued = String(item.issued || '').trim();
  const year = item.year;

  if (abs && /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|term|sem)/i.test(abs)) {
    return abs;
  }
  if (/^\d{4}-\d{2}$/.test(issued)) {
    const [y, m] = issued.split('-');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const mName = months[Math.max(0, Math.min(11, Number(m) - 1))];
    return `${item.paper_type === 'MIDTERM' ? 'Mid-Term' : 'End-Term'} Examination ${mName} ${y}`;
  }
  return `${item.paper_type === 'MIDTERM' ? 'Mid-Term' : 'End-Term'} Examination ${year}`;
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Binary manifest not found at ${MANIFEST_PATH}`);
  }

  const allManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const targetItems = allManifest.filter((x) => x.year >= 2020 && x.year <= 2026);

  console.log(
    `🚀 Preparing to push ${targetItems.length} verified papers (2020–2026) + binary blobs into Supabase PostgreSQL...`
  );

  const db = await getDb();
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await db.query('SELECT 1');
      break;
    } catch {
      console.log(`⏳ Waking PostgreSQL (Attempt ${attempt}/4)...`);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  try {
    // Build unique courses map with accurate paper counts (non-destructive: preserves existing classroom/course data)
    const coursesMap = new Map();
    const enrichedPapers = [];

    for (const item of targetItems) {
      const dept = item.department || 'B.TECH';
      const sem = String(item.semester || '1');
      const school = SCHOOL_BY_DEPT[dept] || 'IET';
      const { code, name } = parseVerifiedCourseCodeAndName(
        item.title,
        item.file_name,
        dept,
        sem
      );
      const examSession = formatExamSession(item);

      let courseEntry = coursesMap.get(code);
      if (!courseEntry) {
        courseEntry = {
          code,
          name,
          department: dept,
          school,
          semester: sem,
          paper_count: 0,
          description: `${dept} (${school}) — Semester ${sem}`,
        };
        coursesMap.set(code, courseEntry);
      }
      courseEntry.paper_count += 1;

      const cleanTitle = `${code} — ${name} (${examSession})`;
      const cleanDescription = `Programme: ${dept} (${school}) | Semester: ${sem} | Course: ${code} - ${name} | Session: ${examSession} | Issued: ${
        item.issued || item.year
      } | MD5: ${item.checksum_md5.slice(0, 12)}`;

      enrichedPapers.push({
        ...item,
        courseCode: code,
        courseName: name,
        school,
        examSession,
        cleanTitle,
        cleanDescription,
      });
    }

    const courseList = Array.from(coursesMap.values());
    console.log(`📚 Upserting ${courseList.length} unique courses into Supabase PostgreSQL...`);
    const COURSE_BATCH = 200;
    for (let i = 0; i < courseList.length; i += COURSE_BATCH) {
      const batch = courseList.slice(i, i + COURSE_BATCH);
      await db.query(
        `INSERT INTO courses (code, name, department, school, semester, paper_count, description)
         SELECT * FROM UNNEST(
           $1::text[],
           $2::text[],
           $3::text[],
           $4::text[],
           $5::text[],
           $6::int[],
           $7::text[]
         )
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           department = EXCLUDED.department,
           school = EXCLUDED.school,
           paper_count = EXCLUDED.paper_count`,
        [
          batch.map((r) => r.code),
          batch.map((r) => r.name),
          batch.map((r) => r.department),
          batch.map((r) => r.school),
          batch.map((r) => r.semester),
          batch.map((r) => r.paper_count),
          batch.map((r) => r.description),
        ]
      );
    }

    const dbCoursesRes = await db.query('SELECT id, code FROM courses');
    const codeToId = new Map(dbCoursesRes.rows.map((c) => [String(c.code).toUpperCase(), Number(c.id)]));

    console.log(
      `📦 Uploading ${enrichedPapers.length} papers with compressed binary (.bin) BYTEA blobs (Concurrency: 5)...`
    );

    const UPSERT_PAPER_SQL = `
      INSERT INTO papers (
        course_id, uploaded_by, aura_uuid, title, description, paper_type,
        exam_session, year, semester, department, file_path, file_name,
        file_size, file_blob, checksum_md5, source_uri, status, public_link_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'APPROVED',$17)
      ON CONFLICT (aura_uuid) DO UPDATE SET
        course_id = EXCLUDED.course_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        paper_type = EXCLUDED.paper_type,
        exam_session = EXCLUDED.exam_session,
        year = EXCLUDED.year,
        semester = EXCLUDED.semester,
        department = EXCLUDED.department,
        file_path = EXCLUDED.file_path,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        file_blob = EXCLUDED.file_blob,
        checksum_md5 = EXCLUDED.checksum_md5,
        source_uri = EXCLUDED.source_uri,
        status = 'APPROVED',
        public_link_id = EXCLUDED.public_link_id,
        updated_at = NOW()
    `;

    let uploaded = 0;
    let totalBinMB = 0;
    let idx = 0;
    const CONCURRENCY = 5;

    async function upsertPaperWithRetry(params) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await db.query(UPSERT_PAPER_SQL, params);
          return;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    }

    async function worker() {
      while (idx < enrichedPapers.length) {
        const current = enrichedPapers[idx++];
        const courseId = codeToId.get(current.courseCode.toUpperCase()) || null;
        const binAbsPath = path.join(BINARY_OUT_DIR, current.bin_path);
        const binBuffer = fs.existsSync(binAbsPath) ? fs.readFileSync(binAbsPath) : null;
        const publicLinkId = current.uuid.replace(/-/g, '').slice(0, 16);

        await upsertPaperWithRetry([
          courseId,
          null,
          current.uuid,
          current.cleanTitle,
          current.cleanDescription,
          current.paper_type,
          current.examSession,
          current.year,
          String(current.semester),
          current.department,
          current.local_pdf_path,
          current.file_name,
          current.raw_size_bytes,
          binBuffer,
          current.checksum_md5,
          current.bitstream_url,
          publicLinkId,
        ]);

        uploaded++;
        totalBinMB += (binBuffer ? binBuffer.length : 0) / 1024 / 1024;
        if (uploaded % 50 === 0 || uploaded === enrichedPapers.length) {
          console.log(
            `   ✅ Uploaded ${uploaded}/${enrichedPapers.length} papers to Supabase PostgreSQL (${totalBinMB.toFixed(
              2
            )} MB binary stored)`
          );
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    await db.query(
      `DELETE FROM courses
       WHERE id NOT IN (SELECT DISTINCT course_id FROM papers WHERE course_id IS NOT NULL)
         AND code NOT IN (SELECT DISTINCT course_code FROM course_offerings WHERE course_code IS NOT NULL)`
    );

    await db.exec(`SELECT setval('courses_id_seq', COALESCE((SELECT MAX(id) FROM courses), 1), true)`);
    await db.exec(`SELECT setval('papers_id_seq', COALESCE((SELECT MAX(id) FROM papers), 1), true)`);

    invalidateCachePrefix('papers:');
    invalidateCachePrefix('courses:');
    invalidateCachePrefix('metrics:');
    invalidateCachePrefix('stats:');
    await new Promise((r) => setTimeout(r, 800));

    const [uRes, cRes, pRes, dbSizeRes] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS c FROM users'),
      db.query('SELECT COUNT(*)::int AS c FROM courses'),
      db.query('SELECT COUNT(*)::int AS c FROM papers'),
      db.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`),
    ]);

    const finalCounts = {
      users: uRes.rows[0]?.c || 0,
      courses: cRes.rows[0]?.c || 0,
      papers: pRes.rows[0]?.c || 0,
    };

    console.log(`\n🎉 SUPABASE POSTGRESQL UPLOAD COMPLETE!`);
    console.log(`   📊 Final Counts           :`, finalCounts);
    console.log(`   🗜️  Binary Payload         : ${totalBinMB.toFixed(2)} MB`);
    console.log(`   🐘 Total Supabase DB Size : ${dbSizeRes.rows[0]?.db_size} / 500 MB`);
  } finally {
    await closeCache();
    await closeDb();
  }
}

main().catch((err) => {
  console.error('❌ Push failed:', err);
  process.exit(1);
});
