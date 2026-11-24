import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail,
  Phone,
  MapPin,
  BookOpen,
  Users,
  Lock,
  Plus,
  Edit3,
  Search,
  Share2,
  X,
  CheckCircle2,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { ScrollProgressBar } from '@/components/animations/MotionPrimitives';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import Footer from '@/components/layout/Footer';
import { ProportionBar } from '@/components/viz/ProportionBar';
import { ProgrammePictogram, SchoolPictogram } from '@/components/viz/Pictograms';
import { CHART_COLORS, usePrefersReducedMotion } from '@/components/viz/chartTokens';
import type { FacultyGraphLink, FacultyGraphNode } from '@/components/viz/FacultyNetworkGraph';
import { API } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const LazyFacultyNetworkGraph = lazy(() => import('@/components/viz/FacultyNetworkGraph'));

interface PublicTA {
  id: number;
  public_name: string;
  public_email: string;
  public_phone: string | null;
  public_batch: string | null;
  lab_hours: string | null;
}

interface CoInstructor {
  professor_id: number;
  name: string;
  role_label: string;
  designation: string;
  school: string;
  public_email: string;
  public_phone: string | null;
  cabin_number: string | null;
  office_hours: string | null;
}

interface FacultyCourse {
  offering_id: number;
  course_code: string;
  course_name: string;
  role_label: string;
  academic_session: string;
  programme: string;
  batch_year: string;
  semester: string;
  section: string;
  is_released: boolean;
  tcs_ion_course_id: string | null;
  syllabus_drive_url: string | null;
  co_instructors: CoInstructor[];
  tas: PublicTA[];
}

interface FacultyProfile {
  user_id: number;
  profile_id: number;
  name: string;
  designation: string;
  school: string;
  department: string;
  programmes: string[];
  batches_taught: string[];
  public_email: string;
  public_phone: string | null;
  cabin_number: string | null;
  office_hours: string | null;
  specialization: string | null;
  bio: string | null;
  course_count: number;
  courses: FacultyCourse[];
}

const PROGRAMMES = ['ALL', 'B.TECH', 'BBA', 'BCA', 'B.DES', 'M.TECH', 'PHD'] as const;
const SCHOOLS = [
  { value: 'ALL', label: 'All Schools' },
  { value: 'IET', label: 'IET' },
  { value: 'IM', label: 'IM' },
  { value: 'ID', label: 'ID' },
] as const;

const FacultyDirectoryPage: React.FC = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [facultyList, setFacultyList] = useState<FacultyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgramme, setSelectedProgramme] = useState<string>(
    () => searchParams.get('prog')?.toUpperCase() || 'ALL'
  );
  const [selectedSchool, setSelectedSchool] = useState<string>(
    () => searchParams.get('school')?.toUpperCase() || 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>(() => searchParams.get('q') || '');
  const [viewMode, setViewMode] = useState<'overview' | 'detailed' | 'network'>('overview');
  const [focusedNodeLabel, setFocusedNodeLabel] = useState<string | null>(null);
  const [expandedProfs, setExpandedProfs] = useState<Record<number, boolean>>({});
  const [bannerMsg, setBannerMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const s = searchParams.get('school')?.toUpperCase();
    const p = searchParams.get('prog')?.toUpperCase();
    const q = searchParams.get('q');
    if (s) setSelectedSchool(s);
    if (p) setSelectedProgramme(p);
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  // Professor Own Profile Editor state (Private + Public fields)
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [myProfileForm, setMyProfileForm] = useState({
    name: '',
    designation: 'Professor',
    school: 'IET',
    programmes: 'B.TECH, M.TECH',
    batches_taught: 'B.Tech 2024-2028, B.Tech 2023-2027',
    public_email: '',
    public_phone: '',
    cabin_number: '',
    office_hours: '',
    specialization: '',
    bio: '',
    private_faculty_notes: '',
    tcs_ion_faculty_id: '',
  });

  // New Course Classroom Release Modal
  const [showReleaseCourseModal, setShowReleaseCourseModal] = useState(false);
  const [newCourseForm, setNewCourseForm] = useState({
    course_code: '',
    course_name: '',
    programme: 'B.TECH',
    batch_year: '2024-2028',
    semester: '3',
    section: 'Sec A & B',
    co_professor_emails: '',
    tcs_ion_course_id: '',
    syllabus_drive_url: '',
    description: '',
    ta_name: '',
    ta_email: '',
    ta_phone: '',
    ta_batch: '',
    ta_lab_hours: '',
  });

  const isProfessorOrAdmin = Boolean(
    user && (user.is_admin || user.admin_role === 'professor' || user.admin_role === 'full_admin')
  );

  const fetchDirectory = async () => {
    setLoading(true);
    try {
      const res = await API.client.get('/faculty/directory');
      setFacultyList(res.data?.items || []);
    } catch (err) {
      console.error('Failed to load faculty directory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectory();
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K or '/' focuses search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openMyProfileEditor = async () => {
    try {
      const res = await API.client.get('/faculty/me/profile');
      const d = res.data || {};
      setMyProfileForm({
        name: d.name || user?.name || '',
        designation: d.designation || 'Assistant Professor',
        school: d.school || 'IET',
        programmes: Array.isArray(d.programmes) ? d.programmes.join(', ') : 'B.TECH',
        batches_taught: Array.isArray(d.batches_taught)
          ? d.batches_taught.join(', ')
          : 'B.Tech 2024-2028',
        public_email: d.public_email || user?.email || '',
        public_phone: d.public_phone || '',
        cabin_number: d.cabin_number || '',
        office_hours: d.office_hours || '',
        specialization: d.specialization || '',
        bio: d.bio || '',
        private_faculty_notes: d.private_faculty_notes || '',
        tcs_ion_faculty_id: d.tcs_ion_faculty_id || '',
      });
      setShowEditProfileModal(true);
    } catch (err: any) {
      setBannerMsg({
        text: err?.response?.data?.detail || err?.message || 'Could not load professor profile',
        type: 'error',
      });
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.client.put('/faculty/me/profile', myProfileForm);
      setShowEditProfileModal(false);
      setBannerMsg({
        text: 'Professor profile updated! Public fields are live; private notes remain hidden.',
        type: 'success',
      });
      fetchDirectory();
    } catch (err: any) {
      setBannerMsg({
        text: err?.response?.data?.detail || err?.message || 'Failed to update profile',
        type: 'error',
      });
    }
  };

  const handleReleaseCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tasPayload =
        newCourseForm.ta_name && newCourseForm.ta_email
          ? [
              {
                public_name: newCourseForm.ta_name,
                public_email: newCourseForm.ta_email,
                public_phone: newCourseForm.ta_phone,
                public_batch: newCourseForm.ta_batch,
                lab_hours: newCourseForm.ta_lab_hours,
              },
            ]
          : [];
      const res = await API.client.post('/classroom/offerings', {
        ...newCourseForm,
        is_released: true,
        tas: tasPayload,
      });
      setShowReleaseCourseModal(false);
      setBannerMsg({
        text: res.data?.message || 'Course classroom released & batch students auto-enrolled!',
        type: 'success',
      });
      fetchDirectory();
      if (res.data?.offering?.id) {
        navigate(`/classroom/${res.data.offering.id}`);
      }
    } catch (err: any) {
      setBannerMsg({
        text: err?.response?.data?.detail || err?.message || 'Failed to release course',
        type: 'error',
      });
    }
  };

  const filteredFaculty = useMemo(() => {
    return facultyList.filter((prof) => {
      if (selectedProgramme !== 'ALL') {
        const hasProg =
          prof.programmes.some((p) => p.toUpperCase() === selectedProgramme) ||
          prof.courses.some((c) => c.programme.toUpperCase() === selectedProgramme);
        if (!hasProg) return false;
      }
      if (selectedSchool !== 'ALL' && prof.school.toUpperCase() !== selectedSchool) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${prof.name} ${prof.designation} ${prof.school} ${prof.specialization || ''} ${
          prof.public_email
        } ${prof.batches_taught.join(' ')} ${prof.courses
          .map((c) => `${c.course_code} ${c.course_name} ${c.tas.map((t) => t.public_name).join(' ')}`)
          .join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [facultyList, selectedProgramme, selectedSchool, searchQuery]);

  const uniqueCoursesCount = useMemo(() => {
    return new Set(facultyList.flatMap((f) => (f.courses || []).map((c) => c.offering_id))).size;
  }, [facultyList]);

  const filteredCoursesCount = useMemo(() => {
    return new Set(filteredFaculty.flatMap((f) => (f.courses || []).map((c) => c.offering_id))).size;
  }, [filteredFaculty]);

  const programmeCounts = useMemo(() => {
    const map: Record<string, number> = { ALL: facultyList.length };
    for (const prog of PROGRAMMES) {
      if (prog === 'ALL') continue;
      map[prog] = facultyList.filter(
        (prof) =>
          prof.programmes.some((p) => p.toUpperCase() === prog) ||
          prof.courses.some((c) => c.programme.toUpperCase() === prog)
      ).length;
    }
    return map;
  }, [facultyList]);

  const schoolCounts = useMemo(() => {
    const map: Record<string, number> = { ALL: facultyList.length };
    for (const sc of SCHOOLS) {
      if (sc.value === 'ALL') continue;
      map[sc.value] = facultyList.filter(
        (prof) => prof.school.toUpperCase() === sc.value
      ).length;
    }
    return map;
  }, [facultyList]);

  const hasActiveFilters =
    selectedProgramme !== 'ALL' || selectedSchool !== 'ALL' || searchQuery.trim().length > 0;

  const clearAllFilters = () => {
    setSelectedProgramme('ALL');
    setSelectedSchool('ALL');
    setSearchQuery('');
    if (searchParams.toString()) {
      setSearchParams({});
    }
  };

  const toggleProfExpanded = (userId: number) => {
    setExpandedProfs((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  // Balanced 2-column masonry partition (accounts for overview vs expanded height)
  const { leftCol, rightCol } = useMemo(() => {
    const estimateWeight = (prof: FacultyProfile) => {
      const isExpanded = viewMode === 'detailed' || Boolean(expandedProfs[prof.user_id]);
      return (
        2.2 +
        (prof.courses || []).reduce(
          (sum, c) =>
            sum +
            1.4 +
            (isExpanded && c.co_instructors?.length ? 0.5 : 0) +
            (isExpanded ? Math.ceil((c.tas?.length || 0) / 2) * 1.3 : 0),
          0
        )
      );
    };

    const sorted = [...filteredFaculty].sort((a, b) => estimateWeight(b) - estimateWeight(a));
    const left: FacultyProfile[] = [];
    const right: FacultyProfile[] = [];
    let leftWeight = 0;
    let rightWeight = 0;

    for (const prof of sorted) {
      const w = estimateWeight(prof);
      if (leftWeight <= rightWeight) {
        left.push(prof);
        leftWeight += w;
      } else {
        right.push(prof);
        rightWeight += w;
      }
    }

    return { leftCol: left, rightCol: right };
  }, [filteredFaculty, viewMode, expandedProfs]);

  const renderFacultyCard = (prof: FacultyProfile) => {
    const initials = prof.name
      .replace(/^(Dr\.|Prof\.)\s*/i, '')
      .trim()
      .slice(0, 2)
      .toUpperCase();
    const isExpanded = viewMode === 'detailed' || Boolean(expandedProfs[prof.user_id]);
    const hasCoTeachers = (prof.courses || []).some((c) => (c.co_instructors || []).length > 0);
    const totalTAs = new Set(
      (prof.courses || []).flatMap((c) => (c.tas || []).map((t) => t.public_email || t.id))
    ).size;

    const detailBits: string[] = [];
    if (hasCoTeachers) detailBits.push('Co-Instructors');
    if (totalTAs > 0) detailBits.push(`${totalTAs} TA${totalTAs > 1 ? 's' : ''}`);

    return (
      <article
        key={prof.user_id}
        className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:border-[#896ABD]/50 transition-[border-color] flex flex-col space-y-4"
      >
        {/* Header: Monochrome Monogram + Name + Borderless School Tint + Programmes */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] font-mono-tabular font-semibold text-sm flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                  {prof.name}
                </h2>
                <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] uppercase bg-black/[0.05] dark:bg-white/[0.08] text-[#5C5B57] dark:text-[#C4C3BE]">
                  {prof.school}
                </span>
              </div>
              <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-0.5 truncate">
                {prof.designation}
              </p>
            </div>
          </div>

          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88] shrink-0 text-right pt-0.5">
            {(prof.programmes || []).join(' · ')}
          </span>
        </div>

        {/* Bio & Quiet Batches Metadata */}
        {(prof.bio || prof.batches_taught.length > 0) && (
          <div className="space-y-1">
            {prof.bio && (
              <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] leading-relaxed">
                {prof.bio}
              </p>
            )}
            {prof.batches_taught.length > 0 && (
              <p className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88] truncate">
                Batches: {prof.batches_taught.join(' · ')}
              </p>
            )}
          </div>
        )}

        {/* Borderless Top-Hairline Contact Row (Email, Phone, Cabin — No Time / Office Hours) */}
        <div className="pt-3 border-t border-[#E5E2DC]/70 dark:border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <a
            href={`mailto:${prof.public_email}`}
            className="inline-flex items-center gap-1.5 text-[#0A0A0C] dark:text-[#F5F4F0] hover:text-[#E04F33] truncate"
          >
            <Mail className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
            <span className="truncate">{prof.public_email}</span>
          </a>
          {prof.public_phone && (
            <a
              href={`tel:${prof.public_phone}`}
              className="inline-flex items-center gap-1.5 font-mono-tabular text-[#5C5B57] dark:text-[#C4C3BE] hover:text-[#0A0A0C] dark:hover:text-white"
            >
              <Phone className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
              <span>{prof.public_phone}</span>
            </a>
          )}
          {prof.cabin_number && (
            <span className="inline-flex items-center gap-1.5 text-[#5C5B57] dark:text-[#A09F9A]">
              <MapPin className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
              <span>{prof.cabin_number}</span>
            </span>
          )}
        </div>

        {/* Courses Taught — Flat Divider List (Info vs Action clearly separated) */}
        <div className="space-y-2 pt-1">
          <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88] flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#896ABD]" />
            <span>COURSES TAUGHT ({prof.courses.length})</span>
          </div>

          <div className="divide-y divide-[#E5E2DC]/60 dark:divide-white/10 border-t border-[#E5E2DC]/60 dark:border-white/10">
            {prof.courses.map((c) => (
              <div key={c.offering_id} className="py-3 last:pb-0 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono-tabular text-xs font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                        {c.course_code}
                      </span>
                      <h3 className="font-medium text-sm leading-snug">{c.course_name}</h3>
                    </div>
                    <p className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88] mt-0.5">
                      {c.programme} · Sem {c.semester} · {c.batch_year} · {c.role_label}
                    </p>
                  </div>

                  <Link
                    to={`/past-papers?q=${encodeURIComponent(c.course_code)}`}
                    className="px-2.5 py-1 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.06] hover:border-[#E04F33] hover:text-[#E04F33] text-[11px] font-mono-tabular font-medium inline-flex items-center gap-1 transition-[border-color] shrink-0"
                  >
                    <span>Past Papers</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Expanded Details: Co-Instructors & Public TA Contacts (Plain Info, Zero Time Strings) */}
                {isExpanded && c.co_instructors.length > 0 && (
                  <div className="text-[11px] text-[#5C5B57] dark:text-[#A09F9A] flex items-center gap-1.5 flex-wrap">
                    <Users className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                    <span className="font-medium">Co-Teaching:</span>
                    <span>
                      {c.co_instructors
                        .map((co) => `${co.name} (${co.role_label})`)
                        .join(' · ')}
                    </span>
                  </div>
                )}

                {isExpanded && c.tas.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88]">
                      Teaching Assistants
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {c.tas.map((ta) => (
                        <div
                          key={ta.id}
                          className="pl-2.5 border-l-2 border-[#E5E2DC] dark:border-white/15 text-[11px] space-y-0.5"
                        >
                          <div className="font-semibold text-[#0A0A0C] dark:text-[#F5F4F0] truncate">
                            {ta.public_name}{' '}
                            <span className="font-mono-tabular text-[10px] font-normal text-[#896ABD] dark:text-[#C084FC]">
                              · TA
                            </span>
                          </div>
                          {ta.public_batch && (
                            <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88] truncate">
                              {ta.public_batch}
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5 text-[10px] pt-0.5">
                            <a
                              href={`mailto:${ta.public_email}`}
                              className="inline-flex items-center gap-1.5 text-[#0A0A0C] dark:text-[#E5E2DC] hover:text-[#E04F33] truncate"
                            >
                              <Mail className="w-3 h-3 text-[#896ABD] shrink-0" />
                              <span className="truncate">{ta.public_email}</span>
                            </a>
                            {ta.public_phone && (
                              <a
                                href={`tel:${ta.public_phone}`}
                                className="inline-flex items-center gap-1.5 font-mono-tabular text-[#5C5B57] dark:text-[#C4C3BE] hover:text-[#0A0A0C] dark:hover:text-white"
                              >
                                <Phone className="w-3 h-3 text-[#896ABD] shrink-0" />
                                <span>{ta.public_phone}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Progressive Disclosure Toggle Footer in Overview Mode */}
        {(hasCoTeachers || totalTAs > 0) && viewMode === 'overview' && (
          <div className="pt-2.5 border-t border-[#E5E2DC]/60 dark:border-white/10 flex items-center justify-between text-[11px]">
            <span className="font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
              {detailBits.join(' · ')}
            </span>
            <button
              type="button"
              onClick={() => toggleProfExpanded(prof.user_id)}
              className="font-mono-tabular font-medium text-[#896ABD] dark:text-[#C084FC] hover:text-[#E04F33] inline-flex items-center gap-1"
            >
              <span>{isExpanded ? 'Hide Details' : `Show ${detailBits.join(' & ')}`}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] selection:bg-[#E04F33] selection:text-white overflow-x-hidden">
      <ScrollProgressBar />

      {/* Unified Global Navigation Bar */}
      <GlobalNavbar />

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {bannerMsg && (
          <div
            className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between backdrop-blur-md border ${
              bannerMsg.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/35 text-rose-800 dark:text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{bannerMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerMsg(null)}
              className="font-mono-tabular underline ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Unified Editorial Command & Filter Console */}
        <section className="rounded-2xl p-5 sm:p-7 space-y-5 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md border border-[#E5E2DC]/90 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#E04F33] dark:text-[#C084FC] font-semibold">
                JKLU FACULTY &amp; TA DIRECTORY · {facultyList.length} FACULTY · {uniqueCoursesCount} COURSES
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                Faculty, Co-Instructors &amp; Course TAs
              </h1>
              <p className="text-xs sm:text-sm text-[#5C5B57] dark:text-[#A09F9A] mt-1">
                Browse official academic profiles, courses taught, co-instructors, and public Teaching Assistant contacts across JKLU programmes.
              </p>
            </div>

            {isProfessorOrAdmin ? (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openMyProfileEditor}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#111117] hover:border-[#0A0A0C] dark:hover:border-[#F5F4F0] transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#896ABD]" />
                  <span>Edit My Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReleaseCourseModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#E04F33] text-white hover:opacity-95 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Release Classroom</span>
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 text-xs text-[#5C5B57] dark:text-[#A09F9A] font-mono-tabular shrink-0">
                <span>search faculty, code, or TA</span>
                <kbd className="px-1.5 py-0.5 rounded border border-[#E5E2DC] dark:border-white/15">
                  ⌘K
                </kbd>
              </div>
            )}
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#896ABD] dark:text-[#A855F7] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search professor, TA, course code (CS1135, ID1114), or batch (2024-2028)..."
              className="w-full pl-11 pr-10 py-3.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6]/90 dark:bg-[#0A0A0C]/90 text-sm focus:outline-none focus:border-[#896ABD] dark:focus:border-[#A855F7] transition-[border-color]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5C5B57] hover:text-[#0A0A0C] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Programme & School Pill Filter Row (with Live Counts) */}
          <div className="pt-4 border-t border-[#E5E2DC]/80 dark:border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#A09F9A] mr-1">
                Programme:
              </span>
              {PROGRAMMES.map((prog) => {
                const active = selectedProgramme === prog;
                const count = programmeCounts[prog] ?? 0;
                return (
                  <button
                    key={prog}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedProgramme(prog)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-medium transition-[border-color] border ${
                      active
                        ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] border-[#0A0A0C] dark:border-[#F5F4F0]'
                        : `bg-transparent border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#0A0A0C] dark:hover:border-[#F5F4F0] ${
                            count === 0 ? 'opacity-50' : ''
                          }`
                    }`}
                  >
                    {prog !== 'ALL' && (
                      <ProgrammePictogram programme={prog} className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {prog === 'ALL' ? 'All' : prog} ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#A09F9A] mr-1">
                School:
              </span>
              {SCHOOLS.map((sc) => {
                const active = selectedSchool === sc.value;
                const count = schoolCounts[sc.value] ?? 0;
                return (
                  <button
                    key={sc.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedSchool(sc.value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-medium transition-[border-color] border ${
                      active
                        ? 'bg-[#E04F33] text-white border-[#E04F33]'
                        : `bg-transparent border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#E04F33] ${
                            count === 0 ? 'opacity-50' : ''
                          }`
                    }`}
                  >
                    {sc.value !== 'ALL' && (
                      <SchoolPictogram school={sc.value} className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {sc.label} ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Interactive School Share Proportion Bar */}
        {!loading && (schoolCounts.IET || schoolCounts.IM || schoolCounts.ID) ? (
          <div className="px-4 py-3.5 rounded-xl bg-white/85 dark:bg-[#111117]/85 backdrop-blur-md border border-[#E5E2DC]/90 dark:border-white/10">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A]">
                JKLU School Composition · Click to Filter
              </span>
              {selectedSchool !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedSchool('ALL')}
                  className="text-[11px] font-mono-tabular text-[#E04F33] hover:underline"
                >
                  Show All Schools
                </button>
              )}
            </div>
            <ProportionBar
              segments={[
                {
                  id: 'IET',
                  label: 'IET · Eng & Tech',
                  value: Number(schoolCounts.IET || 0),
                  color: CHART_COLORS.vermilion,
                  icon: <SchoolPictogram school="IET" className="w-3.5 h-3.5" />,
                },
                {
                  id: 'IM',
                  label: 'IM · Management',
                  value: Number(schoolCounts.IM || 0),
                  color: CHART_COLORS.lavender,
                  icon: <SchoolPictogram school="IM" className="w-3.5 h-3.5" />,
                },
                {
                  id: 'ID',
                  label: 'ID · Design',
                  value: Number(schoolCounts.ID || 0),
                  color: CHART_COLORS.emerald,
                  icon: <SchoolPictogram school="ID" className="w-3.5 h-3.5" />,
                },
              ]}
              activeId={selectedSchool !== 'ALL' ? selectedSchool : null}
              onSelect={(id) => setSelectedSchool((prev) => (prev === id ? 'ALL' : id))}
              ariaLabel="Faculty distribution by JKLU school"
              unitLabel="faculty"
              heightClass="h-3"
            />
          </div>
        ) : null}

        {/* Compact Status Strip + Overview / All Details Switch */}
        <div className="px-4 py-3 rounded-xl bg-white/80 dark:bg-[#111117]/80 backdrop-blur-md border border-[#E5E2DC]/90 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#896ABD]" />
              <span>
                Showing <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">{filteredFaculty.length}</strong> faculty ·{' '}
                <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">{filteredCoursesCount}</strong> courses
              </span>
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="font-mono-tabular text-[#E04F33] hover:underline"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center p-0.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0A0A0C] font-mono-tabular text-[11px]">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'detailed', label: 'All Details' },
                  { id: 'network', label: 'Network', icon: true },
                ] as const
              ).map((tab) => {
                const active = viewMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setViewMode(tab.id)}
                    className={`relative px-2.5 py-1 rounded-md transition-colors ${
                      active
                        ? 'text-[#FAF9F6] dark:text-[#0A0A0C] font-medium'
                        : 'text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#0A0A0C] dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="facultyViewMode"
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 440, damping: 34 }
                        }
                        className="absolute inset-0 rounded-md bg-[#0A0A0C] dark:bg-[#F5F4F0]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1">
                      {'icon' in tab && tab.icon && <Share2 className="w-3 h-3" />}
                      <span>{tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
              <Link to="/home" className="hover:text-[#0A0A0C] dark:hover:text-white">
                Academic Hub →
              </Link>
              <Link to="/past-papers" className="text-[#E04F33] font-semibold hover:underline">
                Past Papers →
              </Link>
            </div>
          </div>
        </div>

        {/* Faculty Grid */}
        {loading ? (
          <div className="p-10 rounded-2xl border border-[#E5E2DC] dark:border-white/10 bg-white/80 dark:bg-[#111117]/80 text-center text-xs font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
            Loading JKLU Faculty &amp; Course TA Directory...
          </div>
        ) : filteredFaculty.length === 0 ? (
          <div className="p-10 rounded-2xl border border-[#E5E2DC] dark:border-white/10 bg-white/80 dark:bg-[#111117]/80 text-center space-y-3">
            <p className="text-sm font-semibold">No faculty profiles match the current filter.</p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-4 py-2 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-medium"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === 'network' ? (
          (() => {
            const nodesMap = new Map<string, FacultyGraphNode>();
            const linksMap = new Map<string, FacultyGraphLink>();

            filteredFaculty.forEach((prof) => {
              const facId = `fac-${prof.profile_id || prof.user_id}`;
              if (!nodesMap.has(facId)) {
                nodesMap.set(facId, {
                  id: facId,
                  label: prof.name,
                  sublabel: `${prof.designation || 'Faculty'} · ${prof.school || 'JKLU'}`,
                  kind: 'faculty',
                  searchQuery: prof.name,
                });
              }

              (prof.courses || []).forEach((course) => {
                const cKey = String(course.course_code || course.offering_id || '')
                  .trim()
                  .toUpperCase();
                if (!cKey) return;
                const courseId = `course-${cKey}`;
                if (!nodesMap.has(courseId)) {
                  nodesMap.set(courseId, {
                    id: courseId,
                    label: course.course_code || cKey,
                    sublabel: course.course_name || 'Course Offering',
                    kind: 'course',
                    searchQuery: course.course_code || cKey,
                  });
                }

                const facCourseKey = `${facId}->${courseId}`;
                if (!linksMap.has(facCourseKey)) {
                  linksMap.set(facCourseKey, {
                    source: facId,
                    target: courseId,
                    relation: course.role_label || 'Teaches',
                  });
                }

                (course.tas || []).forEach((ta) => {
                  const taId = `ta-${ta.id}`;
                  if (!nodesMap.has(taId)) {
                    nodesMap.set(taId, {
                      id: taId,
                      label: ta.public_name,
                      sublabel: ta.public_batch ? `Course TA · ${ta.public_batch}` : 'Course TA',
                      kind: 'ta',
                      searchQuery: ta.public_name,
                    });
                  }
                  const courseTaKey = `${courseId}->${taId}`;
                  if (!linksMap.has(courseTaKey)) {
                    linksMap.set(courseTaKey, {
                      source: courseId,
                      target: taId,
                      relation: 'Supports',
                    });
                  }
                });
              });
            });

            const graphNodes = Array.from(nodesMap.values());
            const graphLinks = Array.from(linksMap.values());

            return (
              <section className="relative overflow-hidden rounded-2xl border border-[#E5E2DC] dark:border-white/10 bg-white/90 dark:bg-[#111117]/90 backdrop-blur-md p-5 sm:p-6 space-y-4">
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#E5E2DC]/70 dark:border-white/10">
                  <img
                    src="/illustrations/network-abstract.jpg"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none select-none absolute -top-5 -right-5 h-28 w-64 object-cover opacity-[0.09] dark:opacity-[0.14] mix-blend-multiply dark:mix-blend-screen [mask-image:linear-gradient(to_left,black_25%,transparent_100%)]"
                  />
                  <div className="relative z-10 space-y-1">
                    <h2 className="text-base sm:text-lg font-serif-editorial font-semibold tracking-tight text-[#0A0A0C] dark:text-[#F5F4F0]">
                      Faculty, Course &amp; TA Constellation
                    </h2>
                    <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A]">
                      Live relationship map for the {filteredFaculty.length} matching faculty profiles. Click any node to filter matching cards in Overview.
                    </p>
                  </div>
                  <div className="relative z-10 flex items-center gap-3 flex-wrap text-[11px] font-mono-tabular">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-white/[0.04]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#E04F33]" />
                      Faculty
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-white/[0.04]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#896ABD]" />
                      Course
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-white/[0.04]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                      Course TA
                    </span>
                  </div>
                </div>

                {graphNodes.length === 0 ? (
                  <div className="p-10 text-center text-xs font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                    No connected course or TA relationships for the selected filter.
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <div className="h-[420px] rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/60 border border-[#E5E2DC]/60 dark:border-white/10 animate-pulse flex items-center justify-center text-xs font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                        Rendering academic constellation graph...
                      </div>
                    }
                  >
                    <LazyFacultyNetworkGraph
                      nodes={graphNodes}
                      links={graphLinks}
                      onSelectNode={(node) => {
                        setSearchQuery(node.searchQuery);
                        setFocusedNodeLabel(node.label);
                        setViewMode('overview');
                      }}
                    />
                  </Suspense>
                )}
              </section>
            );
          })()
        ) : (
          <>
            {focusedNodeLabel && searchQuery.trim() && (
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-[#896ABD]/40 bg-[#896ABD]/10 text-xs font-mono-tabular">
                <span>
                  Focused from Constellation:{' '}
                  <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">{focusedNodeLabel}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFocusedNodeLabel(null);
                    setSearchQuery('');
                  }}
                  className="text-[#E04F33] hover:underline"
                >
                  Clear Focus ×
                </button>
              </div>
            )}

            {/* Mobile / Tablet: Single column preserving order */}
            <div className="flex flex-col gap-6 lg:hidden">
              {filteredFaculty.map(renderFacultyCard)}
            </div>

            {/* Desktop: Balanced 2-column masonry preventing stretched card heights */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-6 items-start">
              <div className="flex flex-col gap-6">{leftCol.map(renderFacultyCard)}</div>
              <div className="flex flex-col gap-6">{rightCol.map(renderFacultyCard)}</div>
            </div>
          </>
        )}
      </main>

      {/* Modal 1: Professor Profile Editor (Public vs Private Boundary) */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FAF9F6] dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Edit My Professor Profile</h3>
                <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-0.5">
                  Public fields appear in the Student Directory; Private Faculty Notes are visible only to you.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditProfileModal(false)}
                className="text-xs px-2.5 py-1 rounded-lg border border-[#E5E2DC] dark:border-white/15"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveMyProfile} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Full Name (Public)
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.name}
                    onChange={(e) => setMyProfileForm({ ...myProfileForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                    required
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Designation (Public)
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.designation}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, designation: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    School (IET / IM / ID)
                  </label>
                  <select
                    value={myProfileForm.school}
                    onChange={(e) => setMyProfileForm({ ...myProfileForm, school: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  >
                    <option value="IET">IET (Engineering &amp; Technology)</option>
                    <option value="IM">IM (Institute of Management)</option>
                    <option value="ID">ID (Institute of Design)</option>
                  </select>
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Programmes Taught (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.programmes}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, programmes: e.target.value })
                    }
                    placeholder="B.TECH, BCA, M.TECH"
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Batches Taught (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.batches_taught}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, batches_taught: e.target.value })
                    }
                    placeholder="B.Tech 2024-2028, B.Tech 2023-2027"
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Public Contact Phone
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.public_phone}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, public_phone: e.target.value })
                    }
                    placeholder="+91-98290-XXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Cabin / Room Number (Public)
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.cabin_number}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, cabin_number: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                  Public Bio &amp; Research Interests
                </label>
                <textarea
                  rows={2}
                  value={myProfileForm.bio}
                  onChange={(e) => setMyProfileForm({ ...myProfileForm, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                />
              </div>

              {/* Strictly Private Faculty Section */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private Faculty Section (Never Visible to Students)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-amber-900/80 dark:text-amber-200/80">
                      TCS iON Faculty Employee ID
                    </label>
                    <input
                      type="text"
                      value={myProfileForm.tcs_ion_faculty_id}
                      onChange={(e) =>
                        setMyProfileForm({
                          ...myProfileForm,
                          tcs_ion_faculty_id: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-amber-500/30 bg-white dark:bg-[#0A0A0C]"
                    />
                  </div>
                  <div>
                    <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-amber-900/80 dark:text-amber-200/80">
                      Private Moderation / Grading Notes
                    </label>
                    <input
                      type="text"
                      value={myProfileForm.private_faculty_notes}
                      onChange={(e) =>
                        setMyProfileForm({
                          ...myProfileForm,
                          private_faculty_notes: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-amber-500/30 bg-white dark:bg-[#0A0A0C]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProfileModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white font-semibold transition-colors"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Release New Course Offering (Auto-Enrolls Batch Students + Co-Professors + TA) */}
      {showReleaseCourseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FAF9F6] dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono-tabular text-[10px] uppercase text-[#E04F33] font-semibold">
                  Auto-Enrolls Matching Batch Students
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  Release New Course Classroom
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReleaseCourseModal(false)}
                className="text-xs px-2.5 py-1 rounded-lg border border-[#E5E2DC] dark:border-white/15"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleReleaseCourse} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="CS2104"
                    value={newCourseForm.course_code}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, course_code: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Course Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Operating Systems & Kernel Design"
                    value={newCourseForm.course_name}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, course_name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Programme
                  </label>
                  <select
                    value={newCourseForm.programme}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, programme: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  >
                    <option value="B.TECH">B.TECH</option>
                    <option value="BBA">BBA</option>
                    <option value="BCA">BCA</option>
                    <option value="B.DES">B.DES</option>
                    <option value="M.TECH">M.TECH</option>
                  </select>
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Semester
                  </label>
                  <input
                    type="text"
                    value={newCourseForm.semester}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, semester: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Target Batch
                  </label>
                  <input
                    type="text"
                    value={newCourseForm.batch_year}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, batch_year: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    Co-Professor Emails (M:N)
                  </label>
                  <input
                    type="text"
                    value={newCourseForm.co_professor_emails}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, co_professor_emails: e.target.value })
                    }
                    placeholder="co.professor@jklu.edu.in"
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
                <div>
                  <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#5C5B57] dark:text-[#A09F9A]">
                    TCS iON Course Code
                  </label>
                  <input
                    type="text"
                    value={newCourseForm.tcs_ion_course_id}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, tcs_ion_course_id: e.target.value })
                    }
                    placeholder="TCS-ION-CS2104"
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
              </div>

              {/* Optional Public TA Assignment Section */}
              <div className="p-3.5 rounded-xl border border-[#E5E2DC] dark:border-white/10 space-y-2">
                <div className="font-mono-tabular text-[10px] uppercase text-[#5C5B57] dark:text-[#A09F9A]">
                  Optional Public Course TA Card
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="TA Name"
                    value={newCourseForm.ta_name}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, ta_name: e.target.value })
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                  <input
                    type="email"
                    placeholder="TA Official Email"
                    value={newCourseForm.ta_email}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, ta_email: e.target.value })
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                  <input
                    type="text"
                    placeholder="TA Public Phone"
                    value={newCourseForm.ta_phone}
                    onChange={(e) =>
                      setNewCourseForm({ ...newCourseForm, ta_phone: e.target.value })
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReleaseCourseModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white font-semibold transition-colors"
                >
                  Release &amp; Auto-Enroll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};

export default FacultyDirectoryPage;
