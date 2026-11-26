import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { classroomApi } from '@/utils/classroomApi';
import { buildGoogleCalendarUrl } from '@/utils/calendarLinks';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  FileText,
  GraduationCap,
  Home,
  Plus,
  User,
  Users,
  ArrowUpRight,
  Image as ImageIcon,
} from 'lucide-react';
import { DimensionalTitleBlock } from '@/components/dimensional/DimensionalKit';

export interface ClassroomTaskItem {
  id: number;
  offering_id: number;
  course_code: string;
  course_name: string;
  title: string;
  assignment_type: string;
  due_at: string | null;
  max_marks: number | null;
  created_at: string;
  submitted: boolean;
  my_marks: number | null;
  total_submissions: number;
  pending_grading: number;
}

interface ClassroomHomeHubProps {
  offerings: any[];
  tasks: ClassroomTaskItem[];
  isProfessorOrAdmin: boolean;
  taOfferingIds?: number[];
  joinCodeInput: string;
  onJoinCodeChange: (val: string) => void;
  onJoinByCode: (e: React.FormEvent) => void;
  onOpenClass: (offeringId: number, initialTab?: 'stream' | 'classwork') => void;
  onPrefetchClass?: (offeringId: number) => void;
  onCustomizeBanner?: (offering: any) => void;
  onOpenReleaseModal?: () => void;
  viewFilter: 'home' | 'todo';
  onChangeViewFilter: (mode: 'home' | 'todo') => void;
}

export const COURSE_BANNER_PRESETS = [
  {
    id: 'midnight-geometry',
    label: 'Midnight Geometry',
    image: '/illustrations/course-banner-1.jpg',
    avatarBg: 'bg-[#0F766E]',
  },
  {
    id: 'academic-constellation',
    label: 'Academic Constellation',
    image: '/illustrations/network-abstract.jpg',
    avatarBg: 'bg-[#E04F33]',
  },
  {
    id: 'studio-prism',
    label: 'Studio Prism',
    image: '/illustrations/classroom-abstract.jpg',
    avatarBg: 'bg-[#896ABD]',
  },
  {
    id: 'editorial-archive',
    label: 'Editorial Archive',
    image: '/illustrations/archive-abstract.jpg',
    avatarBg: 'bg-[#2563EB]',
  },
];

/**
 * Guaranteed high-contrast dark scrim so white banner typography stays >= 10:1
 * legible on ANY background image (white, bright, dark, or custom professor photo).
 */
export const COURSE_BANNER_SCRIM_STYLE: React.CSSProperties = {
  background:
    'linear-gradient(105deg, rgba(8,10,18,0.92) 0%, rgba(12,15,26,0.78) 54%, rgba(12,15,26,0.46) 100%)',
};

export const COURSE_BANNER_TEXT_SHADOW = '0 1px 10px rgba(0, 0, 0, 0.72)';

export function getCourseBannerImage(offering: any, fallbackIndex = 0): string {
  const custom = typeof offering?.banner_image_url === 'string' ? offering.banner_image_url.trim() : '';
  if (custom) return custom;
  const idx = Number.isFinite(Number(offering?.id))
    ? Math.abs(Number(offering.id)) % COURSE_BANNER_PRESETS.length
    : fallbackIndex % COURSE_BANNER_PRESETS.length;
  return COURSE_BANNER_PRESETS[idx].image;
}

function getInitials(name?: string, fallback?: string): string {
  const clean = String(name || fallback || 'JK')
    .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s+/i, '')
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export const ClassroomSidebar: React.FC<{
  offerings: any[];
  activeOfferingId: number | null;
  pendingCount: number;
  homeViewMode: 'home' | 'todo';
  onGoHome: (mode: 'home' | 'todo') => void;
  onSelectOffering: (id: number) => void;
  onPrefetchOffering?: (id: number) => void;
}> = ({
  offerings,
  activeOfferingId,
  pendingCount,
  homeViewMode,
  onGoHome,
  onSelectOffering,
  onPrefetchOffering,
}) => {
  const avatarPalette = [
    'bg-[#896ABD]',
    'bg-[#0F766E]',
    'bg-[#E04F33]',
    'bg-[#2563EB]',
    'bg-[#D97706]',
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10 p-3 space-y-2 shadow-sm">
      <button
        type="button"
        onClick={() => onGoHome('home')}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          activeOfferingId === null && homeViewMode === 'home'
            ? 'bg-[#896ABD]/15 text-[#5B3B96] dark:bg-[#896ABD]/25 dark:text-[#DDD6FE] font-semibold'
            : 'text-[#3A3936] dark:text-[#D0CEC8] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
        }`}
      >
        <Home className="w-4 h-4 shrink-0" />
        <span>Home</span>
      </button>

      <button
        type="button"
        onClick={() => onGoHome('todo')}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          activeOfferingId === null && homeViewMode === 'todo'
            ? 'bg-[#E04F33]/15 text-[#B9381F] dark:bg-[#E04F33]/25 dark:text-[#FF9E8A] font-semibold'
            : 'text-[#3A3936] dark:text-[#D0CEC8] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
        }`}
      >
        <span className="inline-flex items-center gap-3">
          <ClipboardList className="w-4 h-4 shrink-0" />
          <span>To-do &amp; Tasks</span>
        </span>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-mono-tabular font-semibold bg-[#E04F33] text-white">
            {pendingCount}
          </span>
        )}
      </button>

      <div className="pt-2 mt-1 border-t border-[#E5E2DC]/80 dark:border-white/10 space-y-1">
        <div className="px-3 py-1 text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E] font-medium">
          Your Classes ({offerings.length})
        </div>
        {offerings.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[#5C5B57] dark:text-[#94938E]">
            No classes yet
          </p>
        ) : (
          offerings.map((item, idx) => {
            const isSelected = Number(activeOfferingId) === Number(item.id);
            const letter = String(item.course_name || item.course_code || 'C')[0].toUpperCase();
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectOffering(Number(item.id))}
                onMouseEnter={() => onPrefetchOffering?.(Number(item.id))}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isSelected
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]'
                    : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[#0A0A0C] dark:text-[#F5F4F0]'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full text-xs font-bold text-white flex items-center justify-center shrink-0 ${
                    avatarPalette[idx % avatarPalette.length]
                  }`}
                >
                  {letter}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{item.course_name}</div>
                  <div
                    className={`text-xs font-mono-tabular truncate ${
                      isSelected
                        ? 'text-[#FAF9F6]/75 dark:text-[#0A0A0C]/70'
                        : 'text-[#5C5B57] dark:text-[#94938E]'
                    }`}
                  >
                    {item.course_code} · Sem {item.semester}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="pt-2 mt-1 border-t border-[#E5E2DC]/80 dark:border-white/10 space-y-1">
        <Link
          to="/past-papers"
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-[#5C5B57] dark:text-[#A09F9A] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[#0A0A0C] dark:hover:text-white transition-colors"
        >
          <FileText className="w-4 h-4 text-[#E04F33]" />
          <span>Past Papers</span>
        </Link>
        <Link
          to="/faculty"
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-[#5C5B57] dark:text-[#A09F9A] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[#0A0A0C] dark:hover:text-white transition-colors"
        >
          <GraduationCap className="w-4 h-4 text-[#896ABD]" />
          <span>Faculty</span>
        </Link>
        <Link
          to="/profile"
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-[#5C5B57] dark:text-[#A09F9A] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[#0A0A0C] dark:hover:text-white transition-colors"
        >
          <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>My Profile</span>
        </Link>
      </div>
    </aside>
  );
};

export const ClassroomHomeHub: React.FC<ClassroomHomeHubProps> = ({
  offerings,
  tasks,
  isProfessorOrAdmin,
  taOfferingIds = [],
  joinCodeInput,
  onJoinCodeChange,
  onJoinByCode,
  onOpenClass,
  onPrefetchClass,
  onCustomizeBanner,
  onOpenReleaseModal,
  viewFilter,
  onChangeViewFilter,
}) => {
  const [showJoinBar, setShowJoinBar] = useState(false);
  const [stuOverview, setStuOverview] = useState<any | null>(null);
  const [facOverview, setFacOverview] = useState<any | null>(null);
  const taSet = new Set((taOfferingIds || []).map((id) => Number(id)));
  const isStaffUser = isProfessorOrAdmin || taSet.size > 0;

  useEffect(() => {
    if (isStaffUser) {
      classroomApi
        .getFacultyOverview()
        .then((data) => setFacOverview(data))
        .catch(() => {});
    } else {
      classroomApi
        .getStudentOverview()
        .then((data) => setStuOverview(data))
        .catch(() => {});
    }
  }, [isStaffUser, offerings.length]);
  const isStaffForTask = (t: ClassroomTaskItem) =>
    isProfessorOrAdmin || taSet.has(Number(t.offering_id));

  const actionableTasks = tasks.filter((t) =>
    isStaffForTask(t)
      ? t.pending_grading > 0 || !t.due_at || new Date(t.due_at).getTime() >= Date.now()
      : !t.submitted
  );

  const displayedTasks = viewFilter === 'todo' ? tasks : actionableTasks.slice(0, 4);

  return (
    <div className="space-y-6">
      <DimensionalTitleBlock
        dwgNo="JKLU-LMS-02"
        scope="SECTION-SCOPED CLASSROOMS"
        cells={[
          { label: 'COURSES', value: String(offerings.length) },
          { label: 'PRIVACY', value: 'OWN GRADES ONLY' },
          { label: 'CALENDAR', value: 'GOOGLE SYNC' },
        ]}
      />
      {/* Section 1: Due Soon & Tasks Card (Google Classroom style) */}
      <section className="rounded-2xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-[#E04F33]" />
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[#0A0A0C] dark:text-[#F5F4F0]">
              {viewFilter === 'todo'
                ? isProfessorOrAdmin
                  ? 'All Published Assignments & Reviews'
                  : 'All To-do & Classwork Tasks'
                : isProfessorOrAdmin
                  ? 'Due Soon & To Review'
                  : 'Due soon'}
            </h2>
            {actionableTasks.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono-tabular font-semibold bg-[#E04F33]/12 text-[#E04F33]">
                {actionableTasks.length} {isProfessorOrAdmin ? 'active' : 'pending'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isStaffUser && stuOverview?.google_subscribe_url && (
              <a
                href={stuOverview.google_subscribe_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-full bg-[#0A0A0C] hover:bg-[#E04F33] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Sync All Dates to Google Calendar</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => onChangeViewFilter(viewFilter === 'todo' ? 'home' : 'todo')}
              className="px-4 py-2 rounded-full border border-[#896ABD] text-sm font-medium text-[#5B3B96] dark:text-[#DDD6FE] hover:bg-[#896ABD]/10 transition-colors"
            >
              {viewFilter === 'todo' ? 'Back to Classes' : 'View To-do'}
            </button>
          </div>
        </div>

        {/* Cross-Course Student Summary Strip OR Cross-Course Faculty Needs-Grading & Workload */}
        {!isStaffUser && stuOverview && (stuOverview.recent_grades?.length > 0 || stuOverview.courses?.some((c: any) => c.attendance_pct !== null)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {stuOverview.recent_grades?.length > 0 && (
              <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] text-xs space-y-1.5">
                <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#5C5B57] font-semibold">
                  Recent Published Grades
                </div>
                <div className="flex flex-wrap gap-2">
                  {stuOverview.recent_grades.slice(0, 4).map((g: any, i: number) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onOpenClass(g.offering_id, 'classwork')}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#DDD8CE] hover:border-[#896ABD] font-mono-tabular"
                    >
                      <strong>{g.course_code}</strong>: {g.marks_obtained}/{g.max_marks}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {stuOverview.courses?.some((c: any) => c.attendance_pct !== null) && (
              <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] text-xs space-y-1.5">
                <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#5C5B57] font-semibold">
                  Course Attendance Overview
                </div>
                <div className="flex flex-wrap gap-2">
                  {stuOverview.courses.map((c: any) => (
                    <button
                      key={c.offering_id}
                      type="button"
                      onClick={() => onOpenClass(c.offering_id, 'stream')}
                      className={`px-2.5 py-1 rounded-lg border font-mono-tabular font-semibold ${
                        c.attendance_pct !== null && c.attendance_pct < 75
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-white border-[#DDD8CE] text-[#0A0A0C]'
                      }`}
                    >
                      {c.course_code} ({c.section}):{' '}
                      {c.attendance_pct !== null ? `${c.attendance_pct}%` : '—'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isStaffUser && facOverview && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#E04F33] font-semibold">
                  Needs Grading Inbox ({facOverview.pending_counts?.needs_grading ?? 0})
                </span>
                <span className="font-mono-tabular text-[10px] text-[#5C5B57]">
                  Re-eval: {facOverview.pending_counts?.reeval ?? 0} · OD: {facOverview.pending_counts?.od_leave ?? 0} · Req: {facOverview.pending_counts?.requests ?? 0}
                </span>
              </div>
              {(facOverview.needs_grading_queue || []).length === 0 ? (
                <p className="text-[#5C5B57]">All submissions graded across your courses!</p>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {facOverview.needs_grading_queue.slice(0, 6).map((item: any) => (
                    <button
                      key={item.submission_id}
                      type="button"
                      onClick={() => onOpenClass(item.offering_id, 'classwork')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white border border-[#DDD8CE] hover:border-[#E04F33] flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-medium">
                        <strong>{item.course_code}</strong> · {item.student_name} — {item.assignment_title}
                      </span>
                      <span className="font-mono-tabular text-[10px] text-[#5C5B57] shrink-0">
                        {item.student_section || 'Sec A'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] space-y-2">
              <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#5B3B96] font-semibold">
                TA &amp; Faculty Grading Workload Log
              </div>
              {(facOverview.ta_workload || []).length === 0 ? (
                <p className="text-[#5C5B57]">Grading audit actions will appear here.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {facOverview.ta_workload.map((w: any, idx: number) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#DDD8CE] font-mono-tabular text-[11px]"
                    >
                      {w.grader}: <strong>{w.graded_actions}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {displayedTasks.length === 0 ? (
          <div className="py-5 text-center text-sm text-[#5C5B57] dark:text-[#A09F9A]">
            {isProfessorOrAdmin
              ? 'No ungraded submissions or upcoming deadlines right now.'
              : "You don't have any pending work due soon — all caught up!"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedTasks.map((task) => {
              const staffForTask = isStaffForTask(task);
              const isOverdue =
                !staffForTask &&
                !task.submitted &&
                Boolean(task.due_at) &&
                new Date(task.due_at!).getTime() < Date.now();
              return (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenClass(task.offering_id, 'classwork')}
                className="group flex items-center justify-between gap-4 p-4 rounded-xl border border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6]/80 dark:bg-white/[0.03] hover:border-[#896ABD] text-left transition-[border-color]"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded font-mono-tabular text-xs font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]">
                      {task.course_code}
                    </span>
                    <span className="text-xs text-[#5C5B57] dark:text-[#94938E] truncate">
                      {task.course_name}
                    </span>
                  </div>
                  <div className="text-sm sm:text-base font-semibold text-[#0A0A0C] dark:text-[#F5F4F0] group-hover:text-[#E04F33] truncate transition-colors">
                    {task.title}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#5C5B57] dark:text-[#A09F9A] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {task.due_at
                        ? `Due ${new Date(task.due_at).toLocaleDateString()}`
                        : 'No due date'}
                    </span>
                    {task.max_marks && <span>{task.max_marks} marks</span>}
                    {task.due_at && (
                      <a
                        href={buildGoogleCalendarUrl({
                          title: `[${task.course_code}] ${task.title}`,
                          details: `${task.course_name}\nDue Date Task`,
                          startIso: task.due_at,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-semibold text-[#5B3B96] hover:underline"
                      >
                        + Google Cal
                      </a>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {staffForTask ? (
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono-tabular font-semibold ${
                        task.pending_grading > 0
                          ? 'bg-[#E04F33]/15 text-[#E04F33]'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {task.pending_grading > 0
                        ? `${task.pending_grading} to grade`
                        : `${task.total_submissions} turned in`}
                    </span>
                  ) : task.submitted ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {task.my_marks !== null ? `${task.my_marks}/${task.max_marks}` : 'Turned in'}
                      </span>
                    </span>
                  ) : isOverdue ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-700">
                      Overdue
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#E04F33]/15 text-[#E04F33]">
                      Assigned
                    </span>
                  )}
                  <ArrowUpRight className="w-4 h-4 text-[#5C5B57] group-hover:text-[#E04F33]" />
                </div>
              </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Classes Grid (hidden when focusing solely on full To-do list, or shown below) */}
      {viewFilter === 'home' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C] dark:text-[#F5F4F0]">
                Classes
              </h2>
              <span className="text-sm font-mono-tabular text-[#5C5B57] dark:text-[#94938E]">
                ({offerings.length})
              </span>
            </div>

            {isProfessorOrAdmin ? (
              onOpenReleaseModal ? (
                <button
                  type="button"
                  onClick={onOpenReleaseModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white text-sm font-semibold shadow-sm transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  <span>Release Class</span>
                </button>
              ) : (
                <Link
                  to="/faculty"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white text-sm font-semibold shadow-sm transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  <span>Release Class</span>
                </Link>
              )
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {showJoinBar ? (
                  <form onSubmit={onJoinByCode} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
                      placeholder="7-char join code"
                      className="px-3.5 py-2 rounded-xl text-sm font-mono-tabular bg-white dark:bg-[#13131A] border border-[#E5E2DC] dark:border-white/15 focus:outline-none focus:border-[#896ABD] w-48"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white"
                    >
                      Join
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowJoinBar(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#5B3B96] dark:text-[#DDD6FE] bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/15 hover:border-[#896ABD] transition-[border-color]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Join class</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {offerings.length === 0 ? (
            <div className="rounded-2xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10 p-10 text-center space-y-3">
              <BookOpen className="w-9 h-9 text-[#896ABD] mx-auto" />
              <h3 className="text-lg font-semibold">No classrooms yet</h3>
              <p className="text-sm text-[#5C5B57] dark:text-[#A09F9A] max-w-md mx-auto">
                {isProfessorOrAdmin
                  ? 'Release a course classroom from the Faculty Directory to get started.'
                  : 'Click "Join class" above and enter the elective join code shared by your professor.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {offerings.map((item, idx) => {
                const preset = COURSE_BANNER_PRESETS[idx % COURSE_BANNER_PRESETS.length];
                const bannerSrc = getCourseBannerImage(item, idx);
                const primaryInst = item.instructors?.[0];
                const initials = getInitials(primaryInst?.name, item.course_code);
                const cardTasks: ClassroomTaskItem[] = Array.isArray(item.upcoming_tasks)
                  ? item.upcoming_tasks
                  : [];
                const roleLabel = item.is_instructor
                  ? 'Instructor'
                  : item.is_ta
                    ? 'Course TA'
                    : 'Enrolled';
                const canCustomize = Boolean(item.is_instructor || isProfessorOrAdmin);

                return (
                  <article
                    key={item.id}
                    onMouseEnter={() => onPrefetchClass?.(Number(item.id))}
                    className="group hover-lift dw-crosshair-card rounded-2xl overflow-hidden bg-white border border-[#DDD8CE] hover:border-[#896ABD] shadow-sm transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col"
                  >
                    {/* Illustrated Course Banner Header with Guaranteed Dark Scrim Contrast */}
                    <div className="relative h-32 w-full overflow-hidden bg-[#0F121C]">
                      <button
                        type="button"
                        onClick={() => onOpenClass(Number(item.id), 'stream')}
                        className="relative h-full w-full text-left p-4 flex flex-col justify-between overflow-hidden"
                      >
                        <img
                          src={bannerSrc}
                          alt=""
                          aria-hidden="true"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.fallback) {
                              target.dataset.fallback = '1';
                              target.src = '/illustrations/course-banner-1.jpg';
                            }
                          }}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {/* Guaranteed dark scrim so white text is NEVER washed out on light/white/custom banners */}
                        <div
                          className="absolute inset-0"
                          style={COURSE_BANNER_SCRIM_STYLE}
                          aria-hidden="true"
                        />

                        <div className="relative z-10 pr-12 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-black/55 border border-white/25 backdrop-blur-sm font-mono-tabular text-xs font-semibold text-white">
                              {item.course_code}
                            </span>
                            <span
                              className="text-xs font-mono-tabular text-white/95 font-medium"
                              style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                            >
                              {item.programme} · Sem {item.semester}
                            </span>
                          </div>
                          <h3
                            className="text-lg font-bold text-white leading-snug line-clamp-1 group-hover:underline"
                            style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                          >
                            {item.course_name}
                          </h3>
                        </div>

                        <div
                          className="relative z-10 pr-16 text-xs text-white/95 font-medium truncate"
                          style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                        >
                          {primaryInst?.name || 'JKLU Faculty'} · {item.academic_session || 'Monsoon 2026'}
                        </div>
                      </button>

                      {canCustomize && onCustomizeBanner && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCustomizeBanner(item);
                          }}
                          title="Customize course banner image"
                          aria-label={`Customize ${item.course_code} banner`}
                          className="absolute top-2.5 right-2.5 z-20 p-1.5 rounded-lg bg-black/60 hover:bg-[#E04F33] text-white border border-white/25 backdrop-blur-sm transition-colors"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Overlapping Photo / Monogram Avatar + Upcoming Tasks Body */}
                    <div className="relative px-4 pt-4 pb-3 flex-1 flex flex-col justify-between">
                      <div
                        className={`absolute -top-8 right-4 w-14 h-14 rounded-full overflow-hidden ${preset.avatarBg} text-white font-semibold text-lg flex items-center justify-center shadow-md ring-4 ring-white`}
                      >
                        {primaryInst?.photo_path ? (
                          <img
                            src={primaryInst.photo_path}
                            alt={primaryInst.name || 'Course Instructor'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          initials
                        )}
                      </div>

                      <div className="space-y-2 pr-2 pt-1 min-h-[96px]">
                        <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#5C5B57] dark:text-[#94938E]">
                          <span className="dw-note-box">
                            [{String(idx + 1).padStart(2, '0')}]
                          </span>
                          <span className="px-2 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] font-medium">
                            {roleLabel}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {item.enrolled_count || 0} students
                          </span>
                        </div>

                        {cardTasks.length > 0 ? (
                          <div className="space-y-1.5 pt-1">
                            {cardTasks.slice(0, 2).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => onOpenClass(Number(item.id), 'classwork')}
                                className="w-full text-left text-sm text-[#3A3936] dark:text-[#D0CEC8] hover:text-[#E04F33] truncate block"
                              >
                                • {t.title}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#5C5B57] dark:text-[#94938E] pt-1">
                            {Number(item.assignment_count || 0) > 0
                              ? `${item.assignment_count} classwork item(s) published`
                              : 'No upcoming tasks posted yet'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer Quick-Action Icons Bar */}
                    <div className="px-4 py-2.5 border-t border-[#E5E2DC]/80 dark:border-white/10 flex items-center justify-between gap-2 bg-[#FAF9F6]/60 dark:bg-white/[0.02]">
                      <button
                        type="button"
                        onClick={() => onOpenClass(Number(item.id), 'stream')}
                        className="text-xs font-semibold text-[#5B3B96] dark:text-[#DDD6FE] hover:underline"
                      >
                        Open Classroom →
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenClass(Number(item.id), 'classwork')}
                          title="Open Classwork"
                          aria-label={`Open ${item.course_code} classwork`}
                          className="p-2 rounded-lg text-[#5C5B57] dark:text-[#A09F9A] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hover:text-[#0A0A0C] dark:hover:text-white transition-colors"
                        >
                          <FileCheck2 className="w-4 h-4" />
                        </button>
                        <Link
                          to={`/past-papers?q=${encodeURIComponent(item.course_code)}`}
                          title={`View ${item.course_code} Past Papers`}
                          aria-label={`View ${item.course_code} past papers`}
                          className="p-2 rounded-lg text-[#5C5B57] dark:text-[#A09F9A] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] hover:text-[#E04F33] transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
