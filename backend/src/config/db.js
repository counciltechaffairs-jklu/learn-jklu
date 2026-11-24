import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { IS_PRODUCTION, STORAGE_PAPERS_DIR } from './env.js';
import { generateUniqueJoinCode, LEGACY_STATIC_JOIN_CODES } from '../utils/joinCode.js';

const { Pool } = pg;

export const prisma = null;
let dbAdapter = null;

export function isExternalPostgresUrl(url) {
  return /^postgres(?:ql)?:\/\//i.test(String(url || '').trim());
}

export async function getDb() {
  if (dbAdapter) return dbAdapter;

  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (isExternalPostgresUrl(databaseUrl)) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    await pool.query('SELECT 1');

    dbAdapter = {
      engineName: 'PostgreSQL (pg.Pool External Connection)',
      isExternalPg: true,
      prisma: null,
      async query(sql, params = []) {
        const res = await pool.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      },
      async exec(sql) {
        await pool.query(sql);
      },
      async withTransaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const txAdapter = {
            async query(sql, params = []) {
              const res = await client.query(sql, params);
              return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
            },
            async exec(sql) {
              await client.query(sql);
            },
          };
          const result = await fn(txAdapter);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {}
          throw err;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
    return dbAdapter;
  }

  const dataDir = path.resolve(process.cwd(), './data/pgdata_v2');
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  dbAdapter = {
    engineName: 'PostgreSQL 16 (Local Embedded SQL — Learn JKLU 2.0 Offline Sandbox)',
    isExternalPg: false,
    prisma: null,
    async query(sql, params = []) {
      const res = await pglite.query(sql, params);
      return { rows: res.rows, rowCount: res.rows.length || res.affectedRows || 0 };
    },
    async exec(sql) {
      await pglite.exec(sql);
    },
    async withTransaction(fn) {
      return pglite.transaction(async (tx) => {
        const txAdapter = {
          async query(sql, params = []) {
            const res = await tx.query(sql, params);
            return { rows: res.rows, rowCount: res.rows.length || res.affectedRows || 0 };
          },
          async exec(sql) {
            await tx.exec(sql);
          },
        };
        return fn(txAdapter);
      });
    },
    async close() {
      await pglite.close();
    },
  };

  return dbAdapter;
}

export async function withTransaction(dbOrFn, maybeFn) {
  const db = typeof dbOrFn === 'function' ? await getDb() : dbOrFn;
  const fn = typeof dbOrFn === 'function' ? dbOrFn : maybeFn;
  if (typeof db?.withTransaction === 'function') {
    return db.withTransaction(fn);
  }
  await db.query('BEGIN');
  try {
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch {}
    throw err;
  }
}

export async function closeDb() {
  if (dbAdapter && typeof dbAdapter.close === 'function') {
    await dbAdapter.close();
    dbAdapter = null;
  }
}

export async function initDatabaseAndSeed() {
  const db = await getDb();

  // 1. Execute self-contained local SQL schema file (Learn JKLU 2.0)
  const sqlFileRel = process.env.LOCAL_SQL_SEED_FILE || './data/learn_jklu_2_local.sql';
  const sqlFilePath = path.resolve(process.cwd(), sqlFileRel);
  if (fs.existsSync(sqlFilePath)) {
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    await db.exec(sqlContent);
    console.log(`🗄️ [Local SQL] Executed schema from ${sqlFileRel}`);
  }

  // Idempotent migrations to align existing local PGlite/PG data with current security & integrity schema
  await db.exec(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE assignment_submissions
      ADD COLUMN IF NOT EXISTS file_sha256 TEXT,
      ADD COLUMN IF NOT EXISTS drive_modified_time TIMESTAMPTZ;
    ALTER TABLE course_enrollments ALTER COLUMN attendance_pct DROP DEFAULT;
    UPDATE users SET admin_role = NULL WHERE admin_role = 'ta';
    UPDATE course_enrollments SET attendance_pct = NULL WHERE enroll_source = 'AUTO_BATCH';
  `);

  // 2. Ensure core Admin account exists in SQL DB without overwriting existing credentials
  const adminEmail = (
    process.env.DEFAULT_ADMIN_EMAIL || 'counciloftechnicalaffairs@jklu.edu.in'
  )
    .toLowerCase()
    .trim();
  const configuredAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (IS_PRODUCTION && !configuredAdminPassword) {
    console.warn(
      '⚠️ [Auth] DEFAULT_ADMIN_PASSWORD is not set in production; skipping default admin bootstrap.'
    );
  } else {
    const adminPassword = configuredAdminPassword || 'admin123';
    const adminHash = await bcrypt.hash(adminPassword, 10);

    await db.query(
      `INSERT INTO users (email, name, password_hash, is_admin, admin_role, id_verified, email_verified, department, university)
       VALUES ($1, $2, $3, TRUE, 'full_admin', TRUE, TRUE, 'ADMINISTRATION', 'JK Lakshmipat University')
       ON CONFLICT (email) DO NOTHING`,
      [adminEmail, 'Council of Technical Affairs (JKLU Admin)', adminHash]
    );
  }

  // 3. Seed courses from local pastpaper catalog into SQL if empty
  const courseCountRes = await db.query('SELECT COUNT(*)::int AS cnt FROM courses');
  const existingCourses = Number(courseCountRes.rows[0]?.cnt || 0);
  if (existingCourses < 10) {
    const { courses } = getLocalPastpaperCatalog();
    for (const c of courses) {
      const school =
        c.department === 'BBA' || c.department === 'MBA'
          ? 'IM'
          : c.department === 'B.DES' || c.department === 'M.DES'
            ? 'ID'
            : c.department === 'PHD'
              ? 'PHD'
              : 'IET';
      await db.query(
        `INSERT INTO courses (code, name, department, school, semester, paper_count, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           department = EXCLUDED.department,
           school = EXCLUDED.school,
           paper_count = EXCLUDED.paper_count`,
        [
          c.code,
          c.name,
          c.department || 'B.TECH',
          school,
          String(c.semester || '1'),
          Number(c.paper_count || 0),
          c.description || `${c.department} Course`,
        ]
      );
    }
    console.log(`📚 [Local SQL] Seeded ${courses.length} JKLU courses into local database.`);
  }

  // 4. Seed Learn JKLU 2.0 Professors, TAs, Students, M:N Course Offerings, Classroom & TCS iON sample data (non-production only)
  if (!IS_PRODUCTION) {
    await seedLearnJklu2SandboxData(db);
  }

  // 5. Rotate any legacy static seeded join codes into cryptographically random codes
  await migrateLegacyStaticJoinCodes(db);

  console.log(`🔐 [Auth] Database Ready — Core Admin Account: ${adminEmail}`);
}

async function migrateLegacyStaticJoinCodes(db) {
  const legacyRes = await db.query(
    `SELECT id, course_code, join_code
     FROM course_offerings
     WHERE UPPER(join_code) = ANY($1::text[])
     ORDER BY id ASC`,
    [LEGACY_STATIC_JOIN_CODES]
  );

  if (legacyRes.rowCount === 0) return;

  for (const row of legacyRes.rows) {
    const freshCode = await generateUniqueJoinCode(db, { excludeCode: row.join_code });
    await db.query(
      'UPDATE course_offerings SET join_code = $1, updated_at = NOW() WHERE id = $2',
      [freshCode, row.id]
    );
  }
  console.log(`🔑 [Classroom] Rotated ${legacyRes.rowCount} legacy join code(s) to random codes.`);
}

async function seedLearnJklu2SandboxData(db) {
  const profCountRes = await db.query('SELECT COUNT(*)::int AS cnt FROM professor_profiles');
  if (Number(profCountRes.rows[0]?.cnt || 0) > 0) {
    return;
  }

  const defaultPassHash = await bcrypt.hash('jklu123', 10);

  // Ensure key courses exist even if catalog was minimal
  const coreCourses = [
    { code: 'CS1135', name: 'Data Structures & Algorithms', dept: 'B.TECH', school: 'IET', sem: '3' },
    { code: 'CS1108', name: 'Design & Analysis of Algorithms', dept: 'B.TECH', school: 'IET', sem: '4' },
    { code: 'CS1112', name: 'Database Management Systems', dept: 'BCA', school: 'IET', sem: '3' },
    { code: 'CS2104', name: 'Artificial Intelligence & Machine Learning', dept: 'B.TECH', school: 'IET', sem: '5' },
    { code: 'ID1114', name: 'Business Statistics & Analytics', dept: 'BBA', school: 'IM', sem: '2' },
    { code: 'MA1121', name: 'Marketing Research & Strategy', dept: 'BBA', school: 'IM', sem: '4' },
    { code: 'DS1102', name: 'Visual Design & Interaction Studio', dept: 'B.DES', school: 'ID', sem: '2' },
  ];
  for (const c of coreCourses) {
    await db.query(
      `INSERT INTO courses (code, name, department, school, semester, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO NOTHING`,
      [c.code, c.name, c.dept, c.school, c.sem, `${c.dept} Core Course (Sem ${c.sem})`]
    );
  }

  // Create 4 Professors across B.Tech, BCA, M.Tech, BBA, B.Des
  const professors = [
    {
      email: 'dr.rajesh.sharma@jklu.edu.in',
      name: 'Dr. Rajesh Sharma',
      department: 'B.TECH',
      designation: 'Professor & HOD (CSE)',
      school: 'IET',
      programmes: ['B.TECH', 'M.TECH', 'PHD'],
      batches: ['B.Tech 2023-2027', 'B.Tech 2024-2028', 'M.Tech 2025-2027'],
      phone: '+91-98290-11201',
      cabin: 'IET Academic Block — Cabin 204 (2nd Floor)',
      office_hours: 'Mon, Wed & Fri · 3:00 PM – 4:30 PM',
      specialization: 'Algorithms, Graph Theory, Distributed Systems & Applied AI',
      bio: 'Ph.D. in Computer Science with 16+ years of teaching and research experience at JKLU. Coordinates Data Structures, DAA, and AI/ML tracks.',
      private_notes: 'INTERNAL FACULTY NOTE: Moderation chair for End-Term CS1135 & CS1108 exam panels.',
      tcs_id: 'TCS-FAC-IET-101',
    },
    {
      email: 'dr.priya.mehta@jklu.edu.in',
      name: 'Dr. Priya Mehta',
      department: 'B.TECH',
      designation: 'Associate Professor (CSE & Data Science)',
      school: 'IET',
      programmes: ['B.TECH', 'BCA'],
      batches: ['B.Tech 2024-2028', 'BCA 2024-2027', 'B.Tech 2025-2029'],
      phone: '+91-98290-11202',
      cabin: 'IET Academic Block — Cabin 308 (3rd Floor)',
      office_hours: 'Tue & Thu · 2:30 PM – 4:30 PM',
      specialization: 'Database Internals, Data Structures, Cloud Computing & NoSQL',
      bio: 'Co-teaches Data Structures & Algorithms (Section B & Labs) and leads Database Management Systems for B.Tech and BCA cohorts.',
      private_notes: 'INTERNAL FACULTY NOTE: Reviewing TCS iON lab rubric weights for Sem 3.',
      tcs_id: 'TCS-FAC-IET-104',
    },
    {
      email: 'prof.vikram.singh@jklu.edu.in',
      name: 'Prof. Vikram Singh Rathore',
      department: 'BBA',
      designation: 'Professor (Institute of Management)',
      school: 'IM',
      programmes: ['BBA', 'MBA'],
      batches: ['BBA 2024-2027', 'BBA 2025-2028', 'MBA 2025-2027'],
      phone: '+91-98290-11305',
      cabin: 'IM Wing — Faculty Suite 105',
      office_hours: 'Mon & Thu · 11:30 AM – 1:00 PM',
      specialization: 'Business Statistics, Quantitative Finance, Marketing Research & Econometrics',
      bio: 'Leads quantitative and analytics courses at the Institute of Management, integrating real-world case datasets and statistical modeling.',
      private_notes: 'INTERNAL FACULTY NOTE: Case study repository synced with TCS iON assessment bank.',
      tcs_id: 'TCS-FAC-IM-201',
    },
    {
      email: 'prof.ananya.sen@jklu.edu.in',
      name: 'Prof. Ananya Sen',
      department: 'B.DES',
      designation: 'Assistant Professor (Institute of Design)',
      school: 'ID',
      programmes: ['B.DES', 'BBA'],
      batches: ['B.Des 2023-2027', 'B.Des 2024-2028', 'BBA 2025-2028'],
      phone: '+91-98290-11410',
      cabin: 'Design Studio Block — Room 112',
      office_hours: 'Wed & Fri · 2:00 PM – 4:00 PM',
      specialization: 'Interaction Design (UI/UX), Data Visualization & Design Systems',
      bio: 'Guides studio critiques at the Institute of Design and co-instructs data storytelling & visual analytics modules.',
      private_notes: 'INTERNAL FACULTY NOTE: Jury evaluation sheets restricted to ID panel.',
      tcs_id: 'TCS-FAC-ID-301',
    },
  ];

  const profIds = {};
  for (const p of professors) {
    const uRes = await db.query(
      `INSERT INTO users (email, name, password_hash, is_admin, admin_role, department, year, batch_year, id_verified, email_verified)
       VALUES ($1, $2, $3, FALSE, 'professor', $4, 'FACULTY', 'FACULTY', TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         admin_role = 'professor',
         department = EXCLUDED.department
       RETURNING id`,
      [p.email, p.name, defaultPassHash, p.department]
    );
    const uid = Number(uRes.rows[0].id);
    profIds[p.email] = uid;

    await db.query(
      `INSERT INTO professor_profiles (
         user_id, designation, school, programmes, batches_taught,
         public_email, public_phone, cabin_number, office_hours,
         specialization, bio, private_faculty_notes, tcs_ion_faculty_id, is_public
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         designation = EXCLUDED.designation,
         school = EXCLUDED.school,
         programmes = EXCLUDED.programmes,
         batches_taught = EXCLUDED.batches_taught,
         public_phone = EXCLUDED.public_phone,
         cabin_number = EXCLUDED.cabin_number,
         office_hours = EXCLUDED.office_hours`,
      [
        uid,
        p.designation,
        p.school,
        JSON.stringify(p.programmes),
        JSON.stringify(p.batches),
        p.email,
        p.phone,
        p.cabin,
        p.office_hours,
        p.specialization,
        p.bio,
        p.private_notes,
        p.tcs_id,
      ]
    );
  }

  // Create 2 TA users (whose personal student profile has private fields, while CourseTA has only public TA card fields)
  const taUsers = [
    {
      email: 'arjun.verma.ta@jklu.edu.in',
      name: 'Arjun Verma',
      dept: 'B.TECH',
      year: '7',
      batch: '2022-2026',
      roll: '2022BTECH014',
      phone: '+91-94140-55101',
      id_card_path: '/private_storage/id_cards/arjun_private_id_card.png',
    },
    {
      email: 'neha.kapoor.ta@jklu.edu.in',
      name: 'Neha Kapoor',
      dept: 'M.TECH',
      year: '3',
      batch: '2025-2027',
      roll: '2025MTECH008',
      phone: '+91-94140-55102',
      id_card_path: '/private_storage/id_cards/neha_private_id_card.png',
    },
  ];
  const taIds = {};
  for (const t of taUsers) {
    // TAs are regular student/PG user accounts whose per-course TA permissions live solely in course_tas
    const res = await db.query(
      `INSERT INTO users (email, name, password_hash, is_admin, admin_role, age, year, batch_year, department, roll_no, student_id, id_card_path, id_verified, email_verified, admin_feedback)
       VALUES ($1, $2, $3, FALSE, NULL, 21, $4, $5, $6, $7, $7, $8, TRUE, TRUE, '{"private_cgpa": "9.42", "personal_stipend_account": "XXXX-9912"}'::jsonb)
       ON CONFLICT (email) DO UPDATE SET admin_role = NULL
       RETURNING id`,
      [t.email, t.name, defaultPassHash, t.year, t.batch, t.dept, t.roll, t.id_card_path]
    );
    taIds[t.email] = Number(res.rows[0].id);
  }

  // Create 3 Student accounts across B.Tech and BBA
  const students = [
    {
      email: 'aman.student@jklu.edu.in',
      name: 'Aman Pratap Singh',
      dept: 'B.TECH',
      year: '3',
      batch: '2024-2028',
      roll: '2024BTECH042',
    },
    {
      email: 'kabir.student@jklu.edu.in',
      name: 'Kabir Sharma',
      dept: 'B.TECH',
      year: '3',
      batch: '2024-2028',
      roll: '2024BTECH055',
    },
    {
      email: 'riya.bba@jklu.edu.in',
      name: 'Riya Agarwal',
      dept: 'BBA',
      year: '2',
      batch: '2025-2028',
      roll: '2025BBA018',
    },
  ];
  const studentIds = {};
  for (const s of students) {
    const res = await db.query(
      `INSERT INTO users (email, name, password_hash, is_admin, admin_role, age, year, batch_year, department, roll_no, student_id, id_verified, email_verified)
       VALUES ($1, $2, $3, FALSE, NULL, 19, $4, $5, $6, $7, $7, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET department = EXCLUDED.department, year = EXCLUDED.year, batch_year = EXCLUDED.batch_year, roll_no = EXCLUDED.roll_no
       RETURNING id`,
      [s.email, s.name, defaultPassHash, s.year, s.batch, s.dept, s.roll]
    );
    studentIds[s.email] = Number(res.rows[0].id);
  }

  // Create 5 Released Course Offerings demonstrating M:N (>2 professors teaching >2 courses & co-teaching)
  const offeringsData = [
    {
      code: 'CS1135',
      name: 'Data Structures & Algorithms',
      session: 'Monsoon 2026',
      programme: 'B.TECH',
      batch: '2024-2028',
      sem: '3',
      section: 'Sec A & B (Combined)',
      tcs_id: 'TCS-ION-CS1135-M26',
      syllabus: 'https://drive.google.com/file/d/1JkluDsaSyllabus2026/view',
      desc: 'Core B.Tech CSE Semester 3 classroom covering Trees, Graphs, Hashing, Priority Queues, and Dynamic Programming with weekly lab submissions and TCS iON quizzes.',
      instructors: [
        { email: 'dr.rajesh.sharma@jklu.edu.in', role: 'Course Coordinator (Sec A)' },
        { email: 'dr.priya.mehta@jklu.edu.in', role: 'Co-Instructor (Sec B & Labs)' },
      ],
      tas: [
        {
          email: 'arjun.verma.ta@jklu.edu.in',
          name: 'Arjun Verma',
          phone: '+91-94140-55101',
          batch: 'B.Tech CSE (Year 4 · Roll 2022BTECH014)',
          lab_hours: 'Tue & Thu · 4:00 PM – 5:30 PM (Computer Lab 3)',
        },
        {
          email: 'neha.kapoor.ta@jklu.edu.in',
          name: 'Neha Kapoor',
          phone: '+91-94140-55102',
          batch: 'M.Tech CSE (Year 2 · Roll 2025MTECH008)',
          lab_hours: 'Mon & Fri · 4:00 PM – 5:30 PM (Algorithm Lab 1)',
        },
      ],
    },
    {
      code: 'CS1108',
      name: 'Design & Analysis of Algorithms',
      session: 'Monsoon 2026',
      programme: 'B.TECH',
      batch: '2024-2028',
      sem: '3',
      section: 'ALL',
      tcs_id: 'TCS-ION-CS1108-M26',
      syllabus: 'https://drive.google.com/file/d/1JkluDaaSyllabus2026/view',
      desc: 'Asymptotic complexity, Divide & Conquer, Greedy paradigms, Network Flow, NP-Completeness, and approximation algorithms.',
      instructors: [
        { email: 'dr.rajesh.sharma@jklu.edu.in', role: 'Course Coordinator' },
        { email: 'dr.priya.mehta@jklu.edu.in', role: 'Co-Instructor' },
      ],
      tas: [
        {
          email: 'arjun.verma.ta@jklu.edu.in',
          name: 'Arjun Verma',
          phone: '+91-94140-55101',
          batch: 'B.Tech CSE (Year 4 · Roll 2022BTECH014)',
          lab_hours: 'Wed · 3:30 PM – 5:00 PM (IET Tutorial Room 2)',
        },
      ],
    },
    {
      code: 'CS1112',
      name: 'Database Management Systems',
      session: 'Monsoon 2026',
      programme: 'BCA',
      batch: '2024-2027',
      sem: '3',
      section: 'ALL',
      tcs_id: 'TCS-ION-CS1112-M26',
      syllabus: 'https://drive.google.com/file/d/1JkluDbmsSyllabus2026/view',
      desc: 'Relational Algebra, SQL, Normalization (1NF-BCNF), ACID Transactions, Indexing (B+ Trees), and Graph/NoSQL overview.',
      instructors: [
        { email: 'dr.priya.mehta@jklu.edu.in', role: 'Course Coordinator' },
      ],
      tas: [
        {
          email: 'neha.kapoor.ta@jklu.edu.in',
          name: 'Neha Kapoor',
          phone: '+91-94140-55102',
          batch: 'M.Tech CSE (Year 2 · Roll 2025MTECH008)',
          lab_hours: 'Thu · 3:00 PM – 5:00 PM (DBMS Lab 2)',
        },
      ],
    },
    {
      code: 'ID1114',
      name: 'Business Statistics & Analytics',
      session: 'Monsoon 2026',
      programme: 'BBA',
      batch: '2025-2028',
      sem: '2',
      section: 'ALL',
      tcs_id: 'TCS-ION-ID1114-M26',
      syllabus: 'https://drive.google.com/file/d/1JkluBstatSyllabus2026/view',
      desc: 'Probability distributions, hypothesis testing, ANOVA, linear/logistic regression, and executive dashboard storytelling.',
      instructors: [
        { email: 'prof.vikram.singh@jklu.edu.in', role: 'Course Coordinator (IM)' },
        { email: 'prof.ananya.sen@jklu.edu.in', role: 'Co-Instructor (Data Visualization Module)' },
      ],
      tas: [],
    },
    {
      code: 'MA1121',
      name: 'Marketing Research & Strategy',
      session: 'Monsoon 2026',
      programme: 'BBA',
      batch: '2025-2028',
      sem: '2',
      section: 'ALL',
      tcs_id: 'TCS-ION-MA1121-M26',
      syllabus: 'https://drive.google.com/file/d/1JkluMktrSyllabus2026/view',
      desc: 'Consumer insights, survey design, factor & cluster analysis, conjoint modeling, and brand positioning campaigns.',
      instructors: [
        { email: 'prof.vikram.singh@jklu.edu.in', role: 'Course Coordinator' },
      ],
      tas: [],
    },
  ];

  const offeringIds = {};
  for (const o of offeringsData) {
    const cLookup = await db.query('SELECT id FROM courses WHERE UPPER(code) = $1 LIMIT 1', [o.code]);
    const cid = cLookup.rows[0]?.id || null;

    const existingOff = await db.query(
      `SELECT id FROM course_offerings
       WHERE UPPER(course_code) = UPPER($1)
         AND academic_session = $2
         AND programme = $3
         AND batch_year = $4
         AND semester = $5
       LIMIT 1`,
      [o.code, o.session, o.programme, o.batch, o.sem]
    );

    let oid;
    if (existingOff.rowCount > 0) {
      oid = Number(existingOff.rows[0].id);
      await db.query(
        'UPDATE course_offerings SET is_released = TRUE, updated_at = NOW() WHERE id = $1',
        [oid]
      );
    } else {
      const joinCode = await generateUniqueJoinCode(db);
      const offRes = await db.query(
        `INSERT INTO course_offerings (
           course_id, course_code, course_name, academic_session,
           programme, batch_year, semester, section, join_code,
           auto_enroll, is_released, tcs_ion_course_id, syllabus_drive_url, description
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, TRUE, $10, $11, $12)
         RETURNING id`,
        [cid, o.code, o.name, o.session, o.programme, o.batch, o.sem, o.section, joinCode, o.tcs_id, o.syllabus, o.desc]
      );
      oid = Number(offRes.rows[0].id);
    }
    offeringIds[o.code] = oid;

    for (const inst of o.instructors) {
      const pid = profIds[inst.email];
      if (pid) {
        await db.query(
          `INSERT INTO course_instructors (offering_id, professor_id, role_label)
           VALUES ($1, $2, $3)
           ON CONFLICT (offering_id, professor_id) DO UPDATE SET role_label = EXCLUDED.role_label`,
          [oid, pid, inst.role]
        );
      }
    }

    for (const ta of o.tas) {
      const tid = taIds[ta.email] || null;
      await db.query(
        `INSERT INTO course_tas (offering_id, user_id, public_name, public_email, public_phone, public_batch, lab_hours, can_grade, can_announce)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
         ON CONFLICT (offering_id, public_email) DO NOTHING`,
        [oid, tid, ta.name, ta.email, ta.phone, ta.batch, ta.lab_hours]
      );
    }

    // Auto-enroll matching students by programme + semester (attendance remains NULL until synced from TCS iON)
    await db.query(
      `INSERT INTO course_enrollments (offering_id, student_id, roll_no, student_name, student_email, section, enroll_source, attendance_pct)
       SELECT $1, u.id, u.roll_no, u.name, u.email, 'Sec A', 'AUTO_BATCH', NULL
       FROM users u
       WHERE u.admin_role IS NULL AND UPPER(u.department) = UPPER($2) AND u.year = $3
       ON CONFLICT (offering_id, student_email) DO NOTHING`,
      [oid, o.programme, o.sem]
    );
  }

  // Seed Announcements, Threaded Comments, Assignments, TCS iON Quiz Launchpad & Drive Link Submissions for CS1135
  const dsaOfferingId = offeringIds['CS1135'];
  if (dsaOfferingId) {
    const ann1 = await db.query(
      `INSERT INTO classroom_announcements (offering_id, author_id, author_name, author_role, title, content, attachment_urls, is_pinned, allow_comments)
       VALUES ($1, $2, 'Dr. Rajesh Sharma', 'Professor', 'Welcome to CS1135 Data Structures & Algorithms + TCS iON Roster Synced',
               'All B.Tech CSE Semester 3 (Batch 2024-2028) students registered in TCS iON Digital Campus have been automatically enrolled into this classroom. Lab sheets and lecture slides are linked via Google Drive below. Remember: when submitting assignments, either use the 1-Click Google Drive Upload (auto-shares with Dr. Priya, TAs, and me) or paste your shared Drive/GitHub link directly.',
               '[{"label":"CS1135 Lecture Notes — Module 1 & 2 (Google Drive)","url":"https://drive.google.com/file/d/1JkluDsaSlidesMod1/view","type":"DRIVE"}]'::jsonb,
               TRUE, TRUE)
       RETURNING id`,
      [dsaOfferingId, profIds['dr.rajesh.sharma@jklu.edu.in']]
    );
    const ann1Id = Number(ann1.rows[0].id);

    await db.query(
      `INSERT INTO classroom_comments (announcement_id, author_id, author_name, author_role, content, is_verified_ans)
       VALUES
       ($1, $2, 'Aman Pratap Singh', 'Student', 'Sir, for Lab Assignment 1 (AVL & Red-Black Trees), can we submit a single PDF report + C++ source ZIP via the Google Drive uploader?', FALSE),
       ($1, $3, 'Arjun Verma (TA)', 'Teaching Assistant', 'Yes Aman! Upload the PDF or ZIP using the Drive Upload tab — it automatically saves to your own Google Drive under "Learn JKLU Submissions / CS1135" and grants reader access to Dr. Rajesh, Dr. Priya, and both TAs.', TRUE)`,
      [ann1Id, studentIds['aman.student@jklu.edu.in'], taIds['arjun.verma.ta@jklu.edu.in']]
    );

    // Assignment 1: Google Drive / Direct Link Lab Assignment
    const asgn1 = await db.query(
      `INSERT INTO classroom_assignments (
         offering_id, created_by, creator_name, title, description,
         assignment_type, topic_module, resource_links, due_at, allow_late, max_marks
       ) VALUES (
         $1, $2, 'Dr. Rajesh Sharma & Dr. Priya Mehta',
         'Assignment 1: Self-Balancing BSTs (AVL Tree Rotations & Red-Black Insertion Analysis)',
         'Implement AVL tree insertion/deletion with height rebalancing and benchmark lookup latency against an unbalanced BST on 100,000 keys. Submit via automatic Google Drive upload (stored in your Drive, only link saved in DB) or paste a direct Drive/GitHub link.',
         'ASSIGNMENT', 'Module 2: Balanced Search Trees',
         '[{"label":"Problem Statement & Test Cases (Drive PDF)","url":"https://drive.google.com/file/d/1AvlProblemSheetJklu/view"}]'::jsonb,
         NOW() + INTERVAL '7 days', TRUE, 50
       ) RETURNING id`,
      [dsaOfferingId, profIds['dr.rajesh.sharma@jklu.edu.in']]
    );
    const asgn1Id = Number(asgn1.rows[0].id);

    // Sample zero-DB-storage Drive link submission from Aman
    await db.query(
      `INSERT INTO assignment_submissions (
         assignment_id, student_id, student_name, student_email, student_roll_no,
         submission_url, drive_file_id, file_name, upload_mode, submission_notes,
         is_late, shared_with_prof, marks_obtained, feedback, graded_by_name, graded_at
       ) VALUES (
         $1, $2, 'Aman Pratap Singh', 'aman.student@jklu.edu.in', '2024BTECH042',
         'https://drive.google.com/file/d/1AmanAvlTreeReport2024BTECH042/view?usp=drivesdk',
         '1AmanAvlTreeReport2024BTECH042',
         '2024BTECH042_Aman_AVL_Benchmark_Report.pdf',
         'GOOGLE_DRIVE_AUTO',
         'Implemented LL, RR, LR, RL rotations in C++20 and plotted empirical O(log N) height curves.',
         FALSE, TRUE, 48, 'Excellent rotation trace analysis and clean benchmark plots. Verified by TA & Faculty.',
         'Dr. Rajesh Sharma', NOW()
       )`,
      [asgn1Id, studentIds['aman.student@jklu.edu.in']]
    );

    // Assignment 2: TCS iON Digital Assessment Quiz Launchpad
    await db.query(
      `INSERT INTO classroom_assignments (
         offering_id, created_by, creator_name, title, description,
         assignment_type, topic_module, tcs_ion_launch_url, tcs_ion_exam_code, due_at, allow_late, max_marks
       ) VALUES (
         $1, $2, 'Dr. Priya Mehta',
         'Quiz 1 (Proctored on TCS iON): Asymptotic Complexity, Heaps & Graph Traversals',
         'Official 30-minute proctored quiz conducted on JKLU TCS iON Digital Assessment Platform. Click "Launch on TCS iON Assessment" during the exam window using your JKLU TCS iON credentials. Marks will be synced back to your classroom gradebook.',
         'TCS_ION_QUIZ', 'Module 3: Heaps & Graphs Assessment',
         'https://g01.digialm.com/EForms/configuredHtml/1181/74291/login.html',
         'JKLU-TCS-CS1135-Q1',
         NOW() + INTERVAL '3 days', FALSE, 25
       )`,
      [dsaOfferingId, profIds['dr.priya.mehta@jklu.edu.in']]
    );
  }
}

let cachedLocalCatalog = null;

export function getLocalPastpaperCatalog() {
  if (cachedLocalCatalog) return cachedLocalCatalog;

  let pastpaperRoot = path.resolve(process.cwd(), '../pastpaper');
  if (!fs.existsSync(path.join(pastpaperRoot, 'aura_catalog.json'))) {
    pastpaperRoot = path.resolve(process.cwd(), '../../pastpaper');
  }
  const catalogPath = path.join(pastpaperRoot, 'aura_catalog.json');
  if (!fs.existsSync(catalogPath)) {
    return { papers: [], courses: [], stats: { totalPapers: 0, totalCourses: 0, byDept: {} } };
  }

  const rawItems = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const coursesMap = new Map();
  const byDept = {};
  const papers = [];

  rawItems.forEach((item, idx) => {
    const dept = item.department || 'B.TECH';
    const sem = String(item.semester || '1');
    byDept[dept] = (byDept[dept] || 0) + 1;

    const { code, name } = parseAuraCourseCodeAndName(
      item.title,
      item.file_name,
      dept,
      sem
    );

    let courseEntry = coursesMap.get(code);
    if (!courseEntry) {
      courseEntry = {
        id: coursesMap.size + 1,
        code,
        name,
        department: dept,
        semester: sem,
        paper_count: 0,
        description: `${dept} Course (Semester ${sem})`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      coursesMap.set(code, courseEntry);
    }
    courseEntry.paper_count += 1;

    const absFilePath = path.join(pastpaperRoot, item.local_path || '');
    const pubId = String(item.uuid || `paper_${idx + 1}`).replace(/-/g, '').slice(0, 16);

    papers.push({
      id: idx + 1,
      course_id: courseEntry.id,
      course_code: code,
      course_name: name,
      uploaded_by: null,
      uploader_name: 'JKLU Examinations Cell (AURA)',
      uploader_email: null,
      aura_uuid: item.uuid || null,
      title: `${code} - ${name}${item.abstract ? ` (${item.abstract})` : ''}`,
      description: `Programme: ${dept} | Semester: ${sem} | Session: ${item.abstract || item.issued || item.year}`,
      paper_type: String(item.paper_type || 'ENDTERM').toUpperCase(),
      exam_session: item.abstract || String(item.year || 2026),
      year: Number(item.year || 2026),
      semester: sem,
      department: dept,
      file_path: absFilePath,
      file_name: item.file_name || `${code}_${item.year}.pdf`,
      file_size: Number(item.expected_size || 0),
      status: 'APPROVED',
      public_link_id: pubId,
      download_count: 0,
      uploaded_at: new Date(`${Number(item.year) || 2026}-01-01T00:00:00Z`).toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  const courses = Array.from(coursesMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  cachedLocalCatalog = {
    papers,
    courses,
    stats: {
      totalPapers: papers.length,
      totalCourses: courses.length,
      byDept,
    },
  };
  return cachedLocalCatalog;
}

export async function syncPastPaperFolder(options = {}) {
  const db = await getDb();
  const pastpaperRoot = path.resolve(process.cwd(), '../pastpaper');
  const storagePapersDir = STORAGE_PAPERS_DIR;
  await fs.promises.mkdir(storagePapersDir, { recursive: true });

  if (options.purgeExisting) {
    await db.query('DELETE FROM papers');
    const existingFiles = await fs.promises.readdir(storagePapersDir);
    for (const f of existingFiles) {
      try {
        await fs.promises.unlink(path.join(storagePapersDir, f));
      } catch {}
    }
  }

  if (!fs.existsSync(pastpaperRoot)) {
    return { imported: 0, message: 'pastpaper directory not found' };
  }

  const pdfFiles = [];
  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        pdfFiles.push(full);
      }
    }
  }
  await walk(pastpaperRoot);

  let imported = 0;
  for (const pdfPath of pdfFiles) {
    const rel = path.relative(pastpaperRoot, pdfPath);
    const baseName = path.basename(pdfPath, '.pdf').trim();

    const yearMatch = rel.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

    let department = 'B.TECH';
    if (/\bBBA\b/i.test(rel)) department = 'BBA';
    else if (/\bBCA\b/i.test(rel)) department = 'BCA';
    else if (/\bM\.?Tech\b/i.test(rel)) department = 'M.TECH';
    else if (/\bB\.?Des\b/i.test(rel)) department = 'B.DES';

    let semester = '1';
    const romanMap = {
      VIII: '8',
      VII: '7',
      VI: '6',
      V: '5',
      IV: '4',
      III: '3',
      II: '2',
      I: '1',
    };
    const semRomanMatch = rel.match(/\bSEM(?:ESTER)?\s+(VIII|VII|VI|IV|III|II|I|V)\b/i);
    const semDigitMatch = rel.match(/\bSEM(?:ESTER)?\s*(\d)\b/i);
    if (semRomanMatch) {
      semester = romanMap[semRomanMatch[1].toUpperCase()] || '1';
    } else if (semDigitMatch) {
      semester = semDigitMatch[1];
    }

    const codeMatch = baseName.match(/^([A-Za-z]{2,4}[-\s]?\d{3,4})\s*[;:,-]?\s*(.*)$/);
    const rawCode = codeMatch ? codeMatch[1].replace(/[-\s]/g, '').toUpperCase() : 'GEN1001';
    const rawCourseName = (codeMatch && codeMatch[2] ? codeMatch[2].trim() : baseName) || rawCode;

    let paperType = 'ENDTERM';
    if (/mid\s*term|midsem/i.test(rel)) paperType = 'MIDTERM';
    else if (/quiz/i.test(rel)) paperType = 'QUIZ';

    const courseRes = await db.query(
      `INSERT INTO courses (code, name, department, semester, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [rawCode, rawCourseName, department, semester, `${department} Course`]
    );
    const courseId = Number(courseRes.rows[0].id);

    const stat = await fs.promises.stat(pdfPath);
    const cleanFile = `${Date.now()}_${imported}_${rawCode}_${baseName.replace(
      /[^a-zA-Z0-9.-]/g,
      '_'
    )}.pdf`;
    await fs.promises.copyFile(pdfPath, path.join(storagePapersDir, cleanFile));

    const title = `${rawCode} - ${rawCourseName} - ${paperType} - Sem ${semester} - ${year}`;
    const description = `Programme: ${department} | Year: ${year} | Semester: ${semester}`;
    const publicLinkId = crypto.randomBytes(8).toString('hex');

    await db.query(
      `INSERT INTO papers (
         course_id, title, description, paper_type, year, semester, department,
         file_path, file_name, file_size, status, public_link_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPROVED', $11)`,
      [
        courseId,
        title,
        description,
        paperType,
        year,
        semester,
        department,
        cleanFile,
        path.basename(pdfPath),
        stat.size,
        publicLinkId,
      ]
    );
    imported++;
  }

  return { imported, totalScanned: pdfFiles.length };
}

const AURA_BASE_URL = 'https://aura.jklu.edu.in/server/api';

const AURA_PROGRAMME_SCOPES = [
  { scope: '645b2f36-eb15-4c31-a073-02b5b87bf059', department: 'B.TECH', label: 'B.Tech' },
  { scope: 'b0a8406b-2f12-450c-933d-e05a86bdf9ed', department: 'BCA', label: 'BCA' },
  { scope: '3c8f5757-7928-45c1-b9da-fb6866695bc1', department: 'M.TECH', label: 'M.Tech' },
  { scope: '32e4c401-b311-4d76-844f-41b3e38e64ed', department: 'BBA', label: 'BBA' },
  { scope: 'cf73dd65-1f17-4030-9a73-1201de5c26c5', department: 'B.COM', label: 'B.Com' },
  { scope: 'b840bf5e-fb7c-40f0-88cf-1692f0432a97', department: 'MBA', label: 'MBA' },
  { scope: '55123063-babb-484f-91aa-6eb770434f00', department: 'B.DES', label: 'B.Des' },
  { scope: 'ea77bb9e-7e12-4985-8ec3-1b5437ecb86b', department: 'M.DES', label: 'M.Des' },
  { scope: '9cb6ebc4-6601-4a7d-83af-7b25339c07f6', department: 'PHD', label: 'PhD' },
];

function parseAuraCourseCodeAndName(rawTitle, rawBitstreamName, department, semester) {
  const candidates = [
    String(rawTitle || '').trim(),
    String(rawBitstreamName || '').replace(/\.pdf$/i, '').trim(),
  ].filter(Boolean);

  for (const text of candidates) {
    // Pattern 1: "Course Name (CS1135)" or "Course Name (CS 1258)" or "Course Name (AC09)"
    const parenMatch = text.match(/^(.*?)\(\s*([A-Za-z]{2,5}[-\s]?\d{2,4}[A-Za-z]?)\s*\)\s*$/);
    if (parenMatch) {
      const code = parenMatch[2].replace(/[-\s]/g, '').toUpperCase();
      const name = parenMatch[1].replace(/^[-:;,\s]+|[-:;,\s]+$/g, '').trim() || code;
      return { code, name };
    }

    // Pattern 2: "CS1108 - Operating Systems" or "ED1102- Idea To Business Model"
    const prefixMatch = text.match(/^([A-Za-z]{2,5}[-\s]?\d{2,4}[A-Za-z]?)\s*[-:;,.]+\s*(.+)$/);
    if (prefixMatch) {
      const code = prefixMatch[1].replace(/[-\s]/g, '').toUpperCase();
      const name = prefixMatch[2].replace(/^[-:;,\s]+|[-:;,\s]+$/g, '').trim() || code;
      return { code, name };
    }

    // Pattern 3: "Number Theory AS1207"
    const suffixMatch = text.match(/^(.+?)\s+([A-Za-z]{2,5}[-\s]?\d{2,4}[A-Za-z]?)$/);
    if (suffixMatch) {
      const code = suffixMatch[2].replace(/[-\s]/g, '').toUpperCase();
      const name = suffixMatch[1].replace(/^[-:;,\s]+|[-:;,\s]+$/g, '').trim() || code;
      return { code, name };
    }
  }

  // Fallback: derive deterministic code from subject initials + semester so courses stay distinct
  const cleanTitle = (candidates[0] || 'General Subject')
    .replace(/\b(end[\s-]*term|mid[\s-]*term|examination|may|dec|nov|20\d{2})\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'General Subject';
  const words = cleanTitle
    .replace(/[^A-Za-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(and|the|for|with|from)$/i.test(w));
  const initials =
    words
      .slice(0, 3)
      .map((w) => w[0].toUpperCase())
      .join('') || department.replace(/[^A-Z]/g, '').slice(0, 3) || 'GEN';
  const hashNum =
    (Array.from(cleanTitle.toLowerCase()).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 900, 0) +
      100) %
    900 +
    100;
  return {
    code: `${initials}${semester}${String(hashNum).slice(0, 2)}`,
    name: cleanTitle,
  };
}

function parseAuraSemester(...sources) {
  const romanMap = {
    VIII: '8',
    VII: '7',
    VI: '6',
    V: '5',
    IV: '4',
    III: '3',
    II: '2',
    I: '1',
  };
  for (const src of sources) {
    if (!src) continue;
    const text = String(src);
    const ordinalMatch = text.match(/\b([1-8])(?:st|nd|rd|th)?\s*sem(?:ester)?\b/i);
    if (ordinalMatch) return ordinalMatch[1];

    const semDigitMatch = text.match(/\bsem(?:ester)?\s*[-:]?\s*([1-8])\b/i);
    if (semDigitMatch) return semDigitMatch[1];

    const romanMatch = text.match(/\bsem(?:ester)?\s*[-:]?\s*(VIII|VII|VI|IV|III|II|I|V)\b/i);
    if (romanMatch) return romanMap[romanMatch[1].toUpperCase()] || '1';

    const prefixRomanMatch = text.match(/\b(VIII|VII|VI|IV|III|II|I|V)\s+sem(?:ester)?\b/i);
    if (prefixRomanMatch) return romanMap[prefixRomanMatch[1].toUpperCase()] || '1';
  }
  return '1';
}

export async function syncAuraRepository(options = {}) {
  const db = await getDb();
  const storagePapersDir = path.resolve(process.cwd(), 'storage/papers');
  const seedDir = path.resolve(process.cwd(), 'seed_data');
  const auraCachePath = path.join(seedDir, 'aura_catalog.json');
  fs.mkdirSync(storagePapersDir, { recursive: true });
  fs.mkdirSync(seedDir, { recursive: true });

  let discoveredPapers = [];
  let courseList = [];

  if (options.useCachedSnapshot && fs.existsSync(auraCachePath)) {
    console.log('⚡ [AURA Sync] Loading cached AURA snapshot from seed_data/aura_catalog.json ...');
    const cached = JSON.parse(fs.readFileSync(auraCachePath, 'utf8'));
    discoveredPapers = cached.papers || [];
    courseList = cached.courses || [];
  } else {
    console.log('🌐 [AURA Sync] Fetching official question papers from https://aura.jklu.edu.in ...');
    const coursesMap = new Map();
    const seenUuids = new Set();

    for (const prog of AURA_PROGRAMME_SCOPES) {
      const firstUrl = `${AURA_BASE_URL}/discover/search/objects?scope=${prog.scope}&size=100&page=0&sort=dc.date.issued,DESC&embed=bundles/bitstreams&embed=owningCollection`;
      const firstRes = await fetch(firstUrl).then((r) => r.json());
      const searchResult = firstRes?._embedded?.searchResult;
      if (!searchResult) continue;

      const totalPages = Number(searchResult.page?.totalPages || 1);
      const allObjects = [...(searchResult._embedded?.objects || [])];

      const remainingPages = [];
      for (let p = 1; p < totalPages; p++) remainingPages.push(p);

      // Fetch in parallel batches of 4
      for (let i = 0; i < remainingPages.length; i += 4) {
        const batch = remainingPages.slice(i, i + 4);
        const batchResults = await Promise.all(
          batch.map((page) =>
            fetch(
              `${AURA_BASE_URL}/discover/search/objects?scope=${prog.scope}&size=100&page=${page}&sort=dc.date.issued,DESC&embed=bundles/bitstreams&embed=owningCollection`
            )
              .then((r) => r.json())
              .catch(() => null)
          )
        );
        for (const res of batchResults) {
          const objs = res?._embedded?.searchResult?._embedded?.objects || [];
          allObjects.push(...objs);
        }
      }

      console.log(`📚 [AURA Sync] ${prog.department}: fetched ${allObjects.length} items`);

      for (const obj of allObjects) {
        const item = obj?._embedded?.indexableObject;
        if (!item || item.type !== 'item' || !item.uuid) continue;
        if (seenUuids.has(item.uuid)) continue;

        const bundles = item._embedded?.bundles?._embedded?.bundles || [];
        const origBundle = bundles.find((b) => b.name === 'ORIGINAL');
        const bitstream = origBundle?._embedded?.bitstreams?._embedded?.bitstreams?.[0];
        const contentHref = bitstream?._links?.content?.href;
        if (!contentHref) continue;

        seenUuids.add(item.uuid);

        const meta = item.metadata || {};
        const rawTitle = meta['dc.title']?.[0]?.value || item.name || 'Question Paper';
        const issued = meta['dc.date.issued']?.[0]?.value || '';
        const abstractText = meta['dc.description.abstract']?.[0]?.value || '';
        const citation = meta['dc.identifier.citation']?.[0]?.value || '';
        const subjects = (meta['dc.subject'] || []).map((s) => s.value).join(' ');
        const accessioned = meta['dc.date.accessioned']?.[0]?.value || '';
        const handleUri =
          meta['dc.identifier.uri']?.[0]?.value || `https://aura.jklu.edu.in/items/${item.uuid}`;
        const colName = item._embedded?.owningCollection?.name || '';

        const semester = parseAuraSemester(colName, citation, subjects, rawTitle, abstractText);

        const yearMatch =
          issued.match(/\b(20\d{2})\b/) ||
          abstractText.match(/\b(20\d{2})\b/) ||
          rawTitle.match(/\b(20\d{2})\b/) ||
          accessioned.match(/\b(20\d{2})\b/);
        const year = yearMatch ? Number(yearMatch[1]) : 2024;

        const combinedTypeText = `${abstractText} ${rawTitle} ${bitstream.name || ''}`;
        let paperType = 'ENDTERM';
        if (/mid[\s-]*term|mid[\s-]*sem|\bmte\b|cat[\s-]*[12]/i.test(combinedTypeText)) {
          paperType = 'MIDTERM';
        } else if (/quiz/i.test(combinedTypeText)) {
          paperType = 'QUIZ';
        } else if (/assign/i.test(combinedTypeText)) {
          paperType = 'ASSIGNMENT';
        }

        const { code: courseCode, name: courseName } = parseAuraCourseCodeAndName(
          rawTitle,
          bitstream.name,
          prog.department,
          semester
        );

        if (!coursesMap.has(courseCode)) {
          coursesMap.set(courseCode, {
            code: courseCode,
            name: courseName,
            description: `${prog.label} Course (Semester ${semester})`,
          });
        }

        const title = `${courseCode} - ${courseName} (${abstractText || `${paperType} ${year}`})`;
        const description = `Programme: ${prog.department} | Semester: ${semester} | Session: ${
          abstractText || issued || year
        } | Source: JKLU AURA (${handleUri})`;

        discoveredPapers.push({
          courseCode,
          title,
          description,
          paper_type: paperType,
          year,
          semester,
          department: prog.department,
          file_path: contentHref,
          file_name: bitstream.name || `${courseCode}_${year}.pdf`,
          file_size: Number(bitstream.sizeBytes || 0),
          status: 'APPROVED',
          public_link_id: item.uuid.replace(/-/g, '').slice(0, 16),
        });
      }
    }

    courseList = Array.from(coursesMap.values());
    fs.writeFileSync(
      auraCachePath,
      JSON.stringify({ courses: courseList, papers: discoveredPapers }, null, 2)
    );
    console.log(`💾 [AURA Sync] Saved snapshot (${discoveredPapers.length} papers) to seed_data/aura_catalog.json`);
  }

  if (discoveredPapers.length === 0) {
    return { imported: 0, courses: 0, message: 'No items returned from AURA API' };
  }

  let importedCount = 0;
  await withTransaction(db, async (tx) => {
    if (options.purgeExisting !== false) {
      console.log('🧹 [AURA Sync] Purging old papers from database...');
      await tx.query('DELETE FROM papers');
      const existingFiles = await fs.promises.readdir(storagePapersDir);
      for (const f of existingFiles) {
        try {
          await fs.promises.unlink(path.join(storagePapersDir, f));
        } catch {}
      }
    }

    for (const c of courseList) {
      await tx.query(
        `INSERT INTO courses (code, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
        [String(c.code).trim().toUpperCase(), String(c.name).trim(), c.description || null]
      );
    }

    const allCourses = await tx.query('SELECT id, code FROM courses');
    const codeToId = new Map(allCourses.rows.map((c) => [String(c.code).toUpperCase(), Number(c.id)]));

    for (const p of discoveredPapers) {
      const courseId = codeToId.get(String(p.courseCode).toUpperCase());
      if (!courseId) continue;
      await tx.query(
        `INSERT INTO papers (
           course_id, uploaded_by, title, description, paper_type, year, semester,
           department, file_path, file_name, file_size, status, public_link_id
         ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPROVED', $11)
         ON CONFLICT (public_link_id) DO NOTHING`,
        [
          courseId,
          p.title,
          p.description || null,
          p.paper_type,
          Number(p.year || 2024),
          String(p.semester || '1'),
          p.department || 'B.TECH',
          p.file_path,
          p.file_name,
          Number(p.file_size || 0),
          p.public_link_id,
        ]
      );
      importedCount++;
    }
  });

  console.log(
    `✅ [AURA Sync] Imported ${importedCount} official JKLU papers across ${courseList.length} courses!`
  );

  return {
    imported: importedCount,
    courses: courseList.length,
    source: 'https://aura.jklu.edu.in',
  };
}
