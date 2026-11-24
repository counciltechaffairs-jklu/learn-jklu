-- ============================================================================
-- LEARN JKLU 2.0 — SELF-CONTAINED LOCAL SQL SCHEMA & SEED DATA
-- Engine: Embedded PostgreSQL 16 (PGlite) — 100% Offline from Neon / Redis / AuraDB
-- ============================================================================

-- 1. CORE USERS TABLE (Students, TAs, Professors, Admins)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  admin_role TEXT, -- 'full_admin' | 'professor' | 'ta' | 'sub_admin' | 'coding_ta' | NULL (student)
  age INTEGER,
  year TEXT,       -- Semester/Year e.g. '3', '2', '4'
  batch_year TEXT DEFAULT '2024-2028',
  university TEXT DEFAULT 'JK Lakshmipat University',
  department TEXT DEFAULT 'B.TECH',
  roll_no TEXT,
  student_id TEXT,
  photo_path TEXT,
  id_card_path TEXT,
  id_verified BOOLEAN DEFAULT TRUE,
  verified_by INTEGER,
  verified_at TIMESTAMPTZ,
  email_verified BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  token_version INTEGER NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  admin_feedback JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role_dept ON users(admin_role, department);
CREATE INDEX IF NOT EXISTS idx_users_roll_upper ON users(UPPER(roll_no));
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- 2. CORE COURSES & PAPERS TABLES
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT DEFAULT 'B.TECH',
  school TEXT DEFAULT 'IET',
  semester TEXT DEFAULT '1',
  paper_count INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_code_upper ON courses(UPPER(code));

CREATE TABLE IF NOT EXISTS papers (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  aura_uuid TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  paper_type TEXT DEFAULT 'ENDTERM',
  exam_session TEXT,
  year INTEGER DEFAULT 2026,
  semester TEXT DEFAULT '1',
  department TEXT DEFAULT 'B.TECH',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  file_blob BYTEA,
  checksum_md5 TEXT,
  source_uri TEXT,
  status TEXT DEFAULT 'APPROVED',
  reviewed_by INTEGER,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  admin_feedback JSONB,
  public_link_id TEXT UNIQUE,
  solution_drive_url TEXT,
  solution_notes TEXT,
  download_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (UPPER(status) IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_papers_course_id ON papers(course_id);
CREATE INDEX IF NOT EXISTS idx_papers_status_upper ON papers(UPPER(status));
CREATE INDEX IF NOT EXISTS idx_papers_status_year_uploaded ON papers(UPPER(status), year DESC, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_uploaded_by ON papers(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_papers_department ON papers(department);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS daily_contests (
  id SERIAL PRIMARY KEY,
  course_id INTEGER DEFAULT 1 REFERENCES courses(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_contests_course_date ON daily_contests(course_id, date DESC, id DESC);

CREATE TABLE IF NOT EXISTS contest_questions (
  id SERIAL PRIMARY KEY,
  contest_id INTEGER REFERENCES daily_contests(id) ON DELETE CASCADE,
  "order" INTEGER DEFAULT 1,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  code_snippets JSONB DEFAULT '{}'::jsonb,
  explanation TEXT,
  media_link TEXT
);

CREATE INDEX IF NOT EXISTS idx_contest_questions_contest_order ON contest_questions(contest_id, "order" ASC, id ASC);

CREATE TABLE IF NOT EXISTS coding_announcements (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coding_announcements_course_time ON coding_announcements(course_id, created_at DESC);

-- ============================================================================
-- 3. LEARN JKLU 2.0 — PROFESSOR PROFILES (PUBLIC vs PRIVATE SEPARATION)
-- ============================================================================
CREATE TABLE IF NOT EXISTS professor_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  designation TEXT DEFAULT 'Assistant Professor',
  school TEXT DEFAULT 'IET',                     -- 'IET' | 'IM' | 'ID' | 'PHD'
  programmes JSONB DEFAULT '["B.TECH"]'::jsonb,  -- e.g. ["B.TECH", "BCA", "M.TECH"]
  batches_taught JSONB DEFAULT '[]'::jsonb,      -- e.g. ["B.Tech 2023-2027", "B.Tech 2024-2028"]
  public_email TEXT NOT NULL,
  public_phone TEXT,                             -- Visible to students
  cabin_number TEXT,                             -- e.g. 'IET Block - Room 204'
  office_hours TEXT,                             -- e.g. 'Mon & Wed, 3:00 PM - 5:00 PM'
  specialization TEXT,
  bio TEXT,
  google_scholar_url TEXT,
  private_faculty_notes TEXT,                    -- STRICTLY PRIVATE: Never exposed in public/student APIs
  tcs_ion_faculty_id TEXT,                       -- STRICTLY PRIVATE: Internal ERP ID
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. LEARN JKLU 2.0 — COURSE OFFERINGS (GOOGLE CLASSROOM WORKSPACES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_offerings (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  course_code TEXT NOT NULL,
  course_name TEXT NOT NULL,
  academic_session TEXT DEFAULT 'Monsoon 2026',
  programme TEXT DEFAULT 'B.TECH',               -- 'B.TECH' | 'BBA' | 'BCA' | 'B.DES' | 'M.TECH' | 'PHD'
  batch_year TEXT DEFAULT '2024-2028',           -- Target batch for auto-enrollment
  semester TEXT DEFAULT '3',
  section TEXT DEFAULT 'ALL',
  credits INTEGER DEFAULT 4,
  join_code TEXT UNIQUE NOT NULL,
  auto_enroll BOOLEAN DEFAULT TRUE,
  is_released BOOLEAN DEFAULT FALSE,             -- Releasing auto-adds registered students of that course/batch
  tcs_ion_course_id TEXT,                        -- TCS iON Digital Campus course code
  syllabus_drive_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offerings_prog_sem ON course_offerings(programme, semester, is_released);
CREATE INDEX IF NOT EXISTS idx_offerings_code ON course_offerings(UPPER(course_code));

-- ============================================================================
-- 5. M:N PROFESSOR <-> COURSE MAPPING (2+ Professors per Course, 2+ Courses per Professor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_instructors (
  id SERIAL PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  professor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_label TEXT DEFAULT 'Course Coordinator', -- 'Course Coordinator' | 'Co-Instructor' | 'Lab Faculty'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(offering_id, professor_id)
);

-- ============================================================================
-- 6. COURSE TEACHING ASSISTANTS (PUBLIC TA PROFILE ISOLATED FROM PERSONAL PROFILE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_tas (
  id SERIAL PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  public_name TEXT NOT NULL,
  public_email TEXT NOT NULL,
  public_phone TEXT,                             -- Visible on Course page for student doubt support
  public_batch TEXT,                             -- e.g. 'B.Tech CSE (Year 4)'
  roll_no TEXT,
  lab_hours TEXT,                                -- e.g. 'Tue & Thu, 4:00 PM - 5:30 PM (Computer Lab 3)'
  can_grade BOOLEAN DEFAULT TRUE,
  can_announce BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(offering_id, public_email)
);

-- ============================================================================
-- 7. COURSE ENROLLMENTS (AUTO-ENROLLED + TCS iON ROSTER SYNC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS course_enrollments (
  id SERIAL PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  roll_no TEXT,
  student_name TEXT,
  student_email TEXT NOT NULL,
  section TEXT DEFAULT 'Sec A',
  enroll_source TEXT DEFAULT 'AUTO_BATCH',       -- 'AUTO_BATCH' | 'TCS_ION_CSV' | 'JOIN_CODE'
  attendance_pct NUMERIC(5,2) DEFAULT NULL,      -- Null until actually synced from TCS iON attendance sheet
  tcs_ion_credits INTEGER DEFAULT 4,
  fee_cleared BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(offering_id, student_email)
);

-- ============================================================================
-- 8. CLASSROOM STREAM (ANNOUNCEMENTS & THREADED COMMENTS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS classroom_announcements (
  id SERIAL PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT DEFAULT 'Professor',          -- 'Professor' | 'Teaching Assistant'
  title TEXT,
  content TEXT NOT NULL,
  attachment_urls JSONB DEFAULT '[]'::jsonb,     -- Array of { label, url, type } (Drive links only)
  is_pinned BOOLEAN DEFAULT FALSE,
  allow_comments BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_comments (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES classroom_announcements(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT DEFAULT 'Student',            -- 'Student' | 'Professor' | 'Teaching Assistant'
  content TEXT NOT NULL,
  is_verified_ans BOOLEAN DEFAULT FALSE,         -- Professor/TA verified doubt resolution
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. CLASSWORK ASSIGNMENTS, TCS iON QUIZ LAUNCHPAD & ZERO-STORAGE DRIVE SUBMISSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS classroom_assignments (
  id SERIAL PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creator_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  assignment_type TEXT DEFAULT 'ASSIGNMENT',     -- 'ASSIGNMENT' | 'LAB' | 'PROJECT' | 'TCS_ION_QUIZ'
  topic_module TEXT DEFAULT 'General Classwork',
  resource_links JSONB DEFAULT '[]'::jsonb,      -- Array of { label, url }
  tcs_ion_launch_url TEXT,                       -- Direct launch link to TCS iON Digital Assessment
  tcs_ion_exam_code TEXT,                        -- TCS iON Assessment Code
  due_at TIMESTAMPTZ,
  allow_late BOOLEAN DEFAULT TRUE,
  max_marks NUMERIC(6,2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores ONLY Links (~250 bytes/row) — ZERO binary files in DB!
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_name TEXT,
  student_email TEXT,
  student_roll_no TEXT,
  submission_url TEXT NOT NULL,                  -- Google Drive webViewLink or direct GitHub/Colab/Figma link
  drive_file_id TEXT,                            -- Drive File ID for split-screen iframe preview
  file_name TEXT,
  upload_mode TEXT DEFAULT 'GOOGLE_DRIVE_AUTO',  -- 'GOOGLE_DRIVE_AUTO' | 'DIRECT_LINK'
  submission_notes TEXT,
  is_late BOOLEAN DEFAULT FALSE,
  shared_with_prof BOOLEAN DEFAULT TRUE,         -- Auto-shared with Professor & TA @jklu.edu.in emails
  file_sha256 TEXT,                              -- Client-computed SHA-256 fingerprint for tamper detection
  drive_modified_time TIMESTAMPTZ,               -- Google Drive modifiedTime snapshot at submission
  marks_obtained NUMERIC(6,2),
  feedback TEXT,
  graded_by_name TEXT,
  graded_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, student_id),
  CHECK (marks_obtained IS NULL OR marks_obtained >= 0)
);

-- Additional indexes for Faculty, Offerings, Classroom & Grading hot paths
CREATE INDEX IF NOT EXISTS idx_professor_profiles_public_school ON professor_profiles(is_public, school);
CREATE INDEX IF NOT EXISTS idx_offerings_join_code_upper ON course_offerings(UPPER(join_code));
CREATE INDEX IF NOT EXISTS idx_course_instructors_offering ON course_instructors(offering_id);
CREATE INDEX IF NOT EXISTS idx_course_instructors_professor ON course_instructors(professor_id);
CREATE INDEX IF NOT EXISTS idx_course_tas_offering ON course_tas(offering_id);
CREATE INDEX IF NOT EXISTS idx_course_tas_user ON course_tas(user_id);
CREATE INDEX IF NOT EXISTS idx_course_tas_email_lower ON course_tas(LOWER(public_email));
CREATE INDEX IF NOT EXISTS idx_course_enrollments_offering ON course_enrollments(offering_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_email_lower ON course_enrollments(LOWER(student_email));
CREATE INDEX IF NOT EXISTS idx_course_enrollments_roll_upper ON course_enrollments(UPPER(roll_no));
CREATE INDEX IF NOT EXISTS idx_classroom_announcements_offering ON classroom_announcements(offering_id, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classroom_comments_announcement ON classroom_comments(announcement_id, is_verified_ans DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_classroom_assignments_offering ON classroom_assignments(offering_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_email_lower ON assignment_submissions(LOWER(student_email));
