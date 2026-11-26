export interface Offering {
  id: number;
  course_id?: number | null;
  course_code: string;
  course_name: string;
  academic_session?: string | null;
  semester?: string | null;
  programme?: string | null;
  department?: string | null;
  section?: string | null;
  sections?: string[];
  my_sections?: string[];
  join_code?: string | null;
  banner_image_url?: string | null;
  is_released?: boolean;
  is_elective?: boolean;
  auto_enroll?: boolean;
  reeval_enabled?: boolean;
  grade_weights?: Record<string, number> | null;
  has_syllabus_pdf?: boolean;
  course_desc_pdf_name?: string | null;
  course_desc_pdf_size?: number | null;
  student_count?: number;
  instructor_names?: string | null;
  my_role?: string | null;
  [key: string]: any;
}

export interface CourseInstructor {
  id: number;
  professor_id: number;
  name: string;
  email: string;
  designation?: string | null;
  sections?: string[];
  is_primary?: boolean;
  [key: string]: any;
}

export interface CourseTA {
  id: number;
  student_id?: number | null;
  student_email?: string | null;
  name: string;
  email: string;
  can_grade?: boolean;
  can_post_announcement?: boolean;
  sections?: string[];
  [key: string]: any;
}

export interface RosterStudent {
  id: number;
  student_id?: number | null;
  roll_no?: string | null;
  student_name?: string | null;
  student_email?: string | null;
  section?: string | null;
  attendance_pct?: number | null;
  enroll_source?: string | null;
  [key: string]: any;
}

export interface AnnouncementComment {
  id: number;
  announcement_id?: number;
  author_id?: number | null;
  author_name: string;
  author_role?: string | null;
  content: string;
  is_verified?: boolean;
  created_at: string;
  [key: string]: any;
}

export interface Announcement {
  id: number;
  offering_id: number;
  author_id?: number | null;
  author_name: string;
  author_role?: string | null;
  title?: string | null;
  content: string;
  is_pinned?: boolean;
  comments_locked?: boolean;
  target_sections?: string[];
  links_json?: Array<{ label?: string; title?: string; url: string }>;
  scheduled_for?: string | null;
  published_at?: string | null;
  created_at: string;
  comments?: AnnouncementComment[];
  [key: string]: any;
}

export interface RubricCriterion {
  id: string;
  title: string;
  max_marks: number;
  description?: string;
}

export interface Submission {
  id: number;
  assignment_id: number;
  student_id?: number | null;
  student_name?: string | null;
  student_email?: string | null;
  student_roll_no?: string | null;
  student_section?: string | null;
  submission_url?: string | null;
  submission_notes?: string | null;
  upload_mode?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  has_native_file?: boolean;
  version_count?: number;
  submitted_at?: string | null;
  marks_obtained?: number | null;
  feedback?: string | null;
  graded_by_name?: string | null;
  graded_at?: string | null;
  is_late?: boolean;
  late_minutes?: number;
  late_penalty_applied?: number;
  rubric_scores?: Record<string, number> | null;
  group_id?: number | null;
  group_name?: string | null;
  [key: string]: any;
}

export interface Assignment {
  id: number;
  offering_id: number;
  title: string;
  description?: string | null;
  assignment_type: 'ASSIGNMENT' | 'LAB' | 'QUIZ' | 'TCS_ION_QUIZ' | 'PROJECT' | 'MATERIAL' | string;
  due_at?: string | null;
  max_marks?: number | null;
  allow_late?: boolean;
  late_penalty_per_day?: number | null;
  grace_minutes?: number | null;
  is_group_assignment?: boolean;
  max_group_size?: number | null;
  grades_published?: boolean;
  reeval_enabled?: boolean;
  target_sections?: string[];
  links_json?: Array<{ label?: string; title?: string; url: string }>;
  rubric_json?: RubricCriterion[] | null;
  tcs_ion_quiz_url?: string | null;
  google_calendar_url?: string | null;
  my_submission?: Submission | null;
  submissions?: Submission[];
  submission_count?: number;
  [key: string]: any;
}

export interface WorkspacePermissions {
  is_admin?: boolean;
  is_instructor?: boolean;
  is_ta?: boolean;
  is_enrolled?: boolean;
  can_manage_course?: boolean;
  can_post_announcement?: boolean;
  can_grade?: boolean;
  assigned_sections?: string[];
  my_section?: string | null;
  [key: string]: any;
}

export interface ClassroomWorkspace {
  offering: Offering;
  permissions: WorkspacePermissions;
  instructors: CourseInstructor[];
  tas: CourseTA[];
  students: RosterStudent[];
  announcements: Announcement[];
  assignments: Assignment[];
  [key: string]: any;
}

export interface ReevalRequest {
  id: number;
  offering_id: number;
  assignment_id: number;
  submission_id: number;
  assignment_title?: string;
  student_name?: string;
  student_email?: string;
  student_section?: string;
  current_marks?: number | null;
  max_marks?: number | null;
  reason: string;
  status: 'PENDING' | 'REVIEWED' | 'UPDATED' | 'REJECTED' | string;
  faculty_response?: string | null;
  updated_marks?: number | null;
  created_at?: string;
  [key: string]: any;
}

export interface ClassroomNotification {
  id: number;
  offering_id?: number | null;
  type?: string;
  title: string;
  body?: string | null;
  link_path?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface StreamPoll {
  id: number;
  offering_id: number;
  question: string;
  options: Array<{ text?: string; votes?: number } | string>;
  counts?: number[];
  my_vote?: number | null;
  is_closed?: boolean;
  target_sections?: string[];
  created_at?: string;
  [key: string]: any;
}

export interface OfficeHourSlot {
  id: number;
  offering_id: number;
  professor_id?: number;
  instructor_name?: string;
  slot_start: string;
  slot_end?: string | null;
  location_or_link?: string | null;
  max_bookings?: number;
  booked_by_id?: number | null;
  booked_by_name?: string | null;
  topic?: string | null;
  [key: string]: any;
}

export interface CourseModuleItem {
  id: number;
  module_id: number;
  title: string;
  item_type?: string;
  url?: string | null;
  file_name?: string | null;
  completed?: boolean;
  [key: string]: any;
}

export interface CourseModule {
  id: number;
  offering_id: number;
  title: string;
  description?: string | null;
  target_sections?: string[];
  items?: CourseModuleItem[];
  [key: string]: any;
}

export interface AttendanceSession {
  id: number;
  offering_id: number;
  session_date: string;
  section: string;
  topic?: string | null;
  checkin_pin?: string | null;
  records?: Array<{
    student_id: number;
    student_name?: string;
    roll_no?: string;
    status: 'PRESENT' | 'ABSENT' | 'OD' | string;
  }>;
  [key: string]: any;
}

export interface QuizQuestion {
  prompt: string;
  options: string[];
  correct_index?: number;
  marks?: number;
}

export interface QuizItem {
  id: number;
  offering_id: number;
  title: string;
  duration_minutes: number;
  total_marks?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  target_sections?: string[];
  questions?: QuizQuestion[];
  my_attempt?: any;
  [key: string]: any;
}

export interface SimilarityPair {
  a_submission_id: number;
  b_submission_id: number;
  a_name?: string;
  b_name?: string;
  similarity_pct: number;
  matched_shingles?: number;
}

export interface SimilarityReport {
  assignment_id?: number;
  pairs?: SimilarityPair[];
  flagged_pairs?: SimilarityPair[];
  by_submission_id?: Record<number, any>;
  [key: string]: any;
}
