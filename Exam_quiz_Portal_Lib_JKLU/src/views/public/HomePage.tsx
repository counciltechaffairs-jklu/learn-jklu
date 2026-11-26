import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import anime from 'animejs';
import {
  Search,
  X,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  FileText,
  KeyRound,
  Mail,
  Phone,
  Plus,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import {
  FacultyCardPatternArt,
  resolveFacultyCardStyle,
} from '@/components/faculty/facultyCardStyles';
import HeroBackgroundAnimation from '@/components/layout/HeroBackgroundAnimation';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import { ReleaseCourseModal } from '@/components/classroom/ReleaseCourseModal';
import Footer from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { BackgroundBeams } from '@/components/aceternity/background-beams';
import { TextGenerateEffect } from '@/components/aceternity/text-generate-effect';
import { HeroPaperDeck } from '@/components/aceternity/hero-paper-deck';
import { StudentStageshowSection } from '@/components/home/StudentStageshowSection';
import TechText from '@/components/animations/TechText';
import {
  DimensionalSpecDivider,
  DimensionalDraftCard,
} from '@/components/dimensional/DimensionalKit';
import { ScrollProgressBar } from '@/components/animations/MotionPrimitives';
import { CountUp } from '@/components/viz/CountUp';
import { Sparkline } from '@/components/viz/Sparkline';
import { ProportionBar } from '@/components/viz/ProportionBar';
import { ExamTypePictogram } from '@/components/viz/Pictograms';
import { API } from '@/utils/api';
import { classroomApi } from '@/utils/classroomApi';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import jkluCampusHeroImg from '@/assets/generated/jklu_campus_hero.png';

const LazyArchiveHeatmap = lazy(() => import('@/components/viz/ArchiveHeatmap'));

const ARCHIVE_PROGRAMMES = [
  { code: 'B.TECH', label: 'Engineering & Tech', sem: 'Sem 1–8' },
  { code: 'BBA', label: 'Management Studies', sem: 'Sem 1–6' },
  { code: 'BCA', label: 'Computer Applications', sem: 'Sem 1–6' },
  { code: 'M.TECH', label: 'Postgraduate Engg', sem: 'Sem 1–4' },
  { code: 'B.DES', label: 'Institute of Design', sem: 'Sem 1–8' },
  { code: 'PHD', label: 'Doctoral Research', sem: 'Research' },
];

const SCHOOLS = [
  { code: 'IET', name: 'Engineering & Technology' },
  { code: 'IM', name: 'Institute of Management' },
  { code: 'ID', name: 'Institute of Design' },
];

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const consoleSectionRef = useRef<HTMLElement>(null);

  const [offerings, setOfferings] = useState<any[]>([]);
  const [faculty, setFaculty] = useState<any[]>([]);
  const [archiveStats, setArchiveStats] = useState<any | null>(null);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [metrics, setMetrics] = useState({
    approvedPapers: 0,
    courses: 0,
    activeClassrooms: 0,
    facultyCount: 0,
    byDepartment: {} as Record<string, number>,
  });
  const [loading, setLoading] = useState(true);

  // Search & Inline Join Box State
  const [queryInput, setQueryInput] = useState('');
  const [showJoinBox, setShowJoinBox] = useState(false);

  // Elective Join Code Form
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Release Course Modal (for Professor / Admin)
  const [showReleaseModal, setShowReleaseModal] = useState(false);

  const isProfessorOrAdmin = Boolean(
    user && (user.is_admin || user.admin_role === 'full_admin' || user.admin_role === 'professor')
  );

  const loadAcademicHub = async () => {
    setLoading(true);
    try {
      const [metricsRes, facRes, archiveRes, offRes] = await Promise.all([
        API.getSystemMetrics().catch(() => null),
        API.client.get('/faculty/directory'),
        API.getArchiveStats().catch(() => null),
        user
          ? classroomApi.listOfferings().then((data) => ({ data }))
          : Promise.resolve({ data: { items: [] } }),
      ]);
      if (metricsRes?.data?.counts) {
        const c = metricsRes.data.counts;
        setMetrics({
          approvedPapers: Number(c.approvedPapers ?? 0),
          courses: Number(c.courses ?? 0),
          activeClassrooms: Number(c.activeClassrooms ?? 0),
          facultyCount: Number(c.facultyCount ?? 0),
          byDepartment: c.byDepartment || {},
        });
        setMetricsLoaded(true);
      }
      if (archiveRes?.data) {
        setArchiveStats(archiveRes.data);
      }
      setFaculty(Array.isArray(facRes.data?.items) ? facRes.data.items : []);
      setOfferings(Array.isArray(offRes.data?.items) ? offRes.data.items : []);
    } catch (err) {
      console.error('Failed to load Academic Hub:', err);
      setOfferings([]);
    } finally {
      setLoading(false);
    }
  };

  const scrollToConsoleAndFocus = () => {
    consoleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
  };

  useEffect(() => {
    loadAcademicHub();
  }, [user?.id]);

  // Hero entrance animation respecting reduced-motion & UI speed budget
  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      document.querySelectorAll('.anim-hero-line, .anim-hero-card').forEach((el) => {
        (el as HTMLElement).style.opacity = '1';
      });
      return;
    }
    anime
      .timeline({ easing: 'cubicBezier(0.23, 1, 0.32, 1)' })
      .add({
        targets: '.anim-hero-line',
        translateY: [12, 0],
        opacity: [0, 1],
        duration: 360,
        delay: (_el: Element, i: number) => (i === 0 ? 0 : i === 1 ? 65 : 115),
      })
      .add(
        {
          targets: '.anim-hero-card',
          translateY: [14, 0],
          opacity: [0, 1],
          duration: 360,
          delay: (_el: Element, i: number) => (i === 0 ? 0 : Math.min(120, i * 40)),
        },
        '-=240'
      );
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K or '/' focuses the command search input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        scrollToConsoleAndFocus();
      } else if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        e.preventDefault();
        scrollToConsoleAndFocus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const schoolCounts = useMemo(() => {
    const counts: Record<string, number> = { IET: 0, IM: 0, ID: 0 };
    for (const f of faculty) {
      const s = String(f.school || '').toUpperCase();
      if (counts[s] !== undefined) counts[s] += 1;
    }
    return counts;
  }, [faculty]);

  const uniqueTaCount = useMemo(() => {
    const emails = new Set<string>();
    for (const f of faculty) {
      for (const c of f.courses || []) {
        for (const ta of c.tas || []) {
          if (ta.public_email) emails.add(String(ta.public_email).toLowerCase());
        }
      }
    }
    return emails.size;
  }, [faculty]);

  const yearTrendPoints = useMemo(() => {
    const yrs = (archiveStats?.years?.length
      ? archiveStats.years
      : [2020, 2021, 2022, 2023, 2024, 2025, 2026]
    ).map(Number);
    return yrs.map((yr: number) => ({
      label: String(yr),
      value: Number(archiveStats?.yearTotals?.[yr] || 0),
    }));
  }, [archiveStats]);

  const heatmapSeries = useMemo(() => {
    if (!archiveStats?.byDeptYearType) return [];
    const yrs = (archiveStats.years?.length
      ? archiveStats.years
      : [2020, 2021, 2022, 2023, 2024, 2025, 2026]
    ).map(Number);
    const progs: string[] = (archiveStats.programmes || []).slice(0, 6);
    return progs.map((prog: string) => ({
      id: prog,
      data: yrs.map((yr: number) => {
        const typesObj = archiveStats.byDeptYearType[prog]?.[yr] || {};
        const count = Object.values(typesObj).reduce<number>(
          (sum, v) => sum + Number(v || 0),
          0
        );
        return { x: String(yr), y: count };
      }),
    }));
  }, [archiveStats]);

  const examMixSegments = useMemo(() => {
    const totals = archiveStats?.typeTotals || {};
    const ordered = [
      { id: 'ENDTERM', label: 'End-Term', color: '#E04F33' },
      { id: 'MIDTERM', label: 'Mid-Term', color: '#896ABD' },
      { id: 'QUIZ', label: 'Quiz', color: '#10B981' },
    ];
    const items = ordered
      .map((item) => ({
        ...item,
        value: Number(totals[item.id] || 0),
        icon: <ExamTypePictogram type={item.id} className="w-3 h-3" />,
      }))
      .filter((s) => s.value > 0);
    return items;
  }, [archiveStats]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = queryInput.trim();
    navigate(q ? `/past-papers?q=${encodeURIComponent(q)}` : '/past-papers');
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setStatusFeedback(null);
    try {
      const resData = await classroomApi.joinByCode({ join_code: code });
      setStatusFeedback({
        type: 'success',
        text: resData?.message || `Enrolled in course ${code}`,
      });
      setJoinCodeInput('');
      setShowJoinBox(false);
      await loadAcademicHub();
      if (resData?.offering_id) {
        navigate(`/classroom/${resData.offering_id}`);
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        text:
          err?.response?.data?.detail ||
          err?.message ||
          'Please sign in with your JKLU student account to enroll with an elective join code.',
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] selection:bg-[#E04F33] selection:text-white overflow-x-hidden">
      <ScrollProgressBar />

      {/* Unified Minimalist Global Navbar */}
      <GlobalNavbar />

      {/* Full-Viewport Light Editorial Hero Section (Cohesive with full-page AeroShards & Light mode) */}
      <section className="relative min-h-[calc(100svh-3.5rem)] sm:min-h-[calc(100vh-4rem)] w-full flex items-center bg-transparent text-[#0A0A0C] border-b border-[#E5E2DC]/90 overflow-hidden">
        {/* Subtle smoky-obsidian halo vignette behind shards so shards pop while keeping the hero cohesive & Light */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'radial-gradient(640px circle at 24% 40%, rgba(15,15,24,0.06), transparent 65%), radial-gradient(680px circle at 78% 48%, rgba(137,106,189,0.12), rgba(224,79,51,0.07) 48%, transparent 72%)',
          }}
        />
        <HeroBackgroundAnimation />
        <BackgroundBeams className="z-[1] opacity-55" />

        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 sm:gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-7 space-y-4 sm:space-y-6">
              <div className="anim-hero-line inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded-full border border-[#DDD8CE] bg-white/95 backdrop-blur-sm text-xs shadow-sm max-w-full">
                <span className="w-2 h-2 rounded-full bg-[#E04F33] animate-pulse shrink-0" />
                <span className="font-mono-tabular uppercase tracking-[0.04em] sm:tracking-wider text-[9px] sm:text-[11px] text-[#353430] font-medium">
                  JKLU · COUNCIL OF TECHNICAL AFFAIRS · LEARN JKLU 2.0
                </span>
              </div>

              <h1 className="anim-hero-line text-[32px] sm:text-6xl lg:text-[64px] font-light tracking-tight leading-[1.08] sm:leading-[1.05] text-[#0A0A0C]">
                Classrooms, faculty &amp;{' '}
                <span className="font-serif-editorial italic font-normal text-[#E04F33]">
                  past papers
                </span>{' '}
                for every semester.
              </h1>

              <p className="anim-hero-line text-sm sm:text-lg text-[#353430] max-w-2xl leading-relaxed font-normal">
                <TextGenerateEffect words="Access live course classrooms, co-professors, public TA support, zero-bloat Drive submissions, and verified past exam papers across B.Tech, BBA, BCA, M.Tech, and B.Des." />
              </p>

              {/* Quick Search Trigger + Explore CTA */}
              <div className="anim-hero-line pt-1 sm:pt-2 flex flex-col sm:flex-row gap-2.5 sm:gap-3 max-w-xl">
                <button
                  type="button"
                  onClick={scrollToConsoleAndFocus}
                  className="flex-1 flex items-center justify-between px-3.5 sm:px-4 py-3 sm:py-3.5 rounded-md bg-white/95 backdrop-blur-sm border border-[#0A0A0C]/25 hover:border-[#E04F33] transition-[border-color,transform] duration-150 active:scale-[0.98] group text-left shadow-sm min-w-0"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <Search className="w-4 h-4 text-[#E04F33] shrink-0" />
                    <span className="text-xs sm:text-sm text-[#353430] group-hover:text-[#0A0A0C] transition-colors truncate">
                      Search courses, faculty, or papers...
                    </span>
                  </div>
                  <span className="hidden sm:inline-block font-mono-tabular text-xs px-2 py-0.5 rounded bg-[#FAF9F6] text-[#353430] border border-[#DDD8CE] shrink-0 ml-2">
                    ⌘K
                  </span>
                </button>

                <Button
                  onClick={() => navigate('/past-papers')}
                  size="lg"
                  className="w-full sm:w-auto h-auto py-3 sm:py-3.5 px-6 whitespace-nowrap bg-[#0A0A0C] hover:bg-[#E04F33] text-white border-0 shadow-sm"
                >
                  <span>Explore Papers</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </div>

              {/* 1-Tap Trending Course Shortcuts */}
              <div className="anim-hero-line flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#353430] font-medium">
                  Trending:
                </span>
                {['CS1135', 'CS1108', 'ID1114', 'MA1121'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => navigate(`/past-papers?q=${encodeURIComponent(code)}`)}
                    className="font-mono-tabular text-[11px] px-2.5 py-1 rounded-full border border-[#DDD8CE] bg-white/90 text-[#0A0A0C] font-medium hover:border-[#E04F33] hover:text-[#E04F33] transition-colors shadow-xs"
                  >
                    {code}
                  </button>
                ))}
              </div>

              {/* Key University Portal Interactive Stats Band */}
              <div className="anim-hero-line pt-4 sm:pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4 border-t border-[#DDD8CE]">
                <div className="space-y-1">
                  <Link to="/past-papers" className="group block">
                    <div className="font-mono-tabular text-xl sm:text-2xl lg:text-[26px] font-semibold text-[#0A0A0C] whitespace-nowrap group-hover:text-[#E04F33] transition-colors">
                      {metricsLoaded ? <CountUp value={metrics.approvedPapers} /> : '—'}
                    </div>
                    <div className="text-[11px] sm:text-xs text-[#353430] mt-0.5 inline-flex items-center gap-1">
                      <span>Verified Papers</span>
                      <ArrowUpRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                    </div>
                  </Link>
                  {yearTrendPoints.some((p: any) => p.value > 0) && (
                    <Sparkline
                      data={yearTrendPoints}
                      height={26}
                      accentColor="#E04F33"
                      unitLabel="papers"
                      ariaLabel="Papers trend 2020 to 2026"
                      onSelectPoint={(pt) =>
                        navigate(`/past-papers?year=${encodeURIComponent(pt.label)}`)
                      }
                    />
                  )}
                </div>

                <Link to="/past-papers?focus=search" className="group block">
                  <div className="font-mono-tabular text-xl sm:text-2xl lg:text-[26px] font-semibold text-[#0A0A0C] whitespace-nowrap group-hover:text-[#896ABD] transition-colors">
                    {metricsLoaded ? <CountUp value={metrics.courses} /> : '—'}
                  </div>
                  <div className="text-[11px] sm:text-xs text-[#353430] mt-0.5 inline-flex items-center gap-1">
                    <span>University Courses</span>
                    <ArrowUpRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                  </div>
                </Link>

                <Link to="/classroom" className="group block">
                  <div className="font-mono-tabular text-xl sm:text-2xl lg:text-[26px] font-semibold text-[#6F4EA8] whitespace-nowrap group-hover:underline">
                    {metricsLoaded ? (
                      <CountUp
                        value={metrics.activeClassrooms}
                        formatter={(v) => `${Math.round(v)} Live`}
                      />
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs text-[#353430] mt-0.5 inline-flex items-center gap-1">
                    <span>Course Classrooms</span>
                    <ArrowUpRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                  </div>
                </Link>

                <Link to="/faculty" className="group block">
                  <div className="font-mono-tabular text-xl sm:text-2xl lg:text-[26px] font-semibold text-[#E04F33] whitespace-nowrap group-hover:underline">
                    {metricsLoaded ? (
                      <CountUp value={metrics.facultyCount || faculty.length} />
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs text-[#353430] mt-0.5 inline-flex items-center gap-1">
                    <span>Faculty &amp; Mentors</span>
                    <ArrowUpRight className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                  </div>
                </Link>
              </div>
            </div>

            {/* Right 5 Columns: Interactive 3D-Tilt Paper Deck Showcase with Soft Halo */}
            <div className="lg:col-span-5 anim-hero-card relative">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-5 rounded-3xl blur-2xl opacity-45"
                style={{
                  background:
                    'radial-gradient(circle at 50% 48%, rgba(137,106,189,0.42), rgba(224,79,51,0.22) 55%, transparent 74%)',
                }}
              />
              <div className="relative z-10 space-y-2">
                <div className="w-full h-[94px] sm:h-[104px] lg:h-[110px] relative">
                  <TechText
                    text="JKLU"
                    logoSrc="/black_jklu_logo.png"
                    logoLabel="LOGO"
                    logoScale={1.2}
                    logoGap={0.22}
                    fontWeight={400}
                    fontSize={88}
                    reveal="letter"
                    dashLength={4}
                    dashGap={2}
                    specks={15}
                    intro="none"
                    introDuration={2}
                    clickKick
                    guides={false}
                    fontFamily="'Instrument Serif', Georgia, serif"
                    letterSpacing={0.01}
                    color="#0A0A0C"
                    accentColor="#E04F33"
                    reach={200}
                    softness={0.7}
                    lineStyle="dashed"
                    strokeWidth={1.3}
                    speed={1}
                    bounce={0.4}
                    selection
                    labels
                    align="center"
                    draggable
                    sweep
                  />
                </div>
                <HeroPaperDeck
                  heroImageSrc={(jkluCampusHeroImg as any)?.src || jkluCampusHeroImg}
                  papersCount={metrics.approvedPapers}
                  onSelectCourse={(code) => navigate(`/past-papers?q=${encodeURIComponent(code)}`)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Below the Fold */}
      <main
        ref={consoleSectionRef}
        id="hub-console"
        className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-10 sm:py-14 space-y-8"
      >
        {statusFeedback && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between backdrop-blur-md ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-[#E04F33]/10 border-[#E04F33]/30 text-[#E04F33]'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusFeedback.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{statusFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="font-mono-tabular underline ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Interactive Student Walkthrough (Stageshow: Past Papers & Student Classroom) */}
        <DimensionalSpecDivider code="SEC 01" label="STUDENT WALKTHROUGH" metric="STAGESHOW INTERACTIVE" />
        <StudentStageshowSection />

        {/* Slim Global Search Bar + Inline Join Code Option */}
        <section className="rounded-2xl p-4 sm:p-5 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md border border-[#E5E2DC]/90 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)] space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#896ABD] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={`Search ${metricsLoaded ? `${metrics.approvedPapers.toLocaleString()} ` : ''}past exam papers by subject, acronym (DSA, DBMS), or code...`}
                className="w-full pl-11 pr-14 py-3 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6]/90 dark:bg-[#0A0A0C]/90 text-sm focus:outline-none focus:border-[#896ABD] transition-[border-color]"
              />
              {queryInput ? (
                <button
                  type="button"
                  onClick={() => setQueryInput('')}
                  aria-label="Clear search"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5C5B57] hover:text-[#0A0A0C] dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block absolute right-3.5 top-1/2 -translate-y-1/2 font-mono-tabular text-[11px] px-1.5 py-0.5 rounded border border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#8E8D88]">
                  ⌘K
                </kbd>
              )}
            </div>

            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-[#E04F33] text-white text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <span>Search Papers</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88] mr-1">
                Try:
              </span>
              {['DSA', 'CS1135', 'DBMS', 'ID1114'].map((tag) => (
                <Link
                  key={tag}
                  to={`/past-papers?q=${encodeURIComponent(tag)}`}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono-tabular border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#E04F33] hover:text-[#E04F33] inline-flex items-center gap-1 transition-[border-color]"
                >
                  <span>{tag}</span>
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </Link>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowJoinBox((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono-tabular font-medium text-[#896ABD] dark:text-[#C084FC] hover:text-[#E04F33]"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Have an elective Join Code?</span>
              {showJoinBox ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {showJoinBox && (
            <form
              onSubmit={handleJoinSubmit}
              className="pt-3 border-t border-[#E5E2DC]/70 dark:border-white/10 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center"
            >
              <input
                type="text"
                required
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter 7-character elective classroom join code..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0A0A0C] font-mono-tabular text-xs focus:outline-none focus:border-[#896ABD]"
              />
              <button
                type="submit"
                disabled={joining}
                className="px-4 py-2.5 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white text-xs font-semibold shrink-0 transition-[border-color]"
              >
                {joining ? 'Enrolling...' : 'Enroll in Classroom →'}
              </button>
              <span className="text-[11px] text-[#5C5B57] dark:text-[#8E8D88] sm:max-w-[210px]">
                {user
                  ? 'Entered codes auto-add electives to your LMS.'
                  : 'Requires @jklu.edu.in sign-in.'}
              </span>
            </form>
          )}
        </section>

        {/* 3-Pillar "What's Inside Learn JKLU 2.0" Overview Grid */}
        <section className="space-y-4">
          <DimensionalSpecDivider code="SEC 02" label="ACADEMIC WORKSPACE PILLARS" metric="3 MODULES" />
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#E04F33] font-semibold">
                Explore Learn JKLU 2.0
              </span>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight mt-0.5">
                Everything Available in One Academic Workspace
              </h2>
            </div>
            <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A]">
              Pick a destination below to browse directly — no guesswork needed.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Pillar 1: Verified Past Question Papers */}
            <DimensionalDraftCard specCode="DWG-01" specLabel="R16" delay={0}>
            <article className="dw-crosshair-card h-full rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white dark:bg-[#111117] p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#E04F33]/10 text-[#E04F33] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="dw-note-box whitespace-nowrap shrink-0">[01] DWG-ARC</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                    {metricsLoaded
                      ? `${metrics.approvedPapers.toLocaleString()} papers · ${metrics.courses.toLocaleString()} courses`
                      : 'Loading catalog...'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold tracking-tight">Past Question Papers</h3>
                  <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-1 leading-relaxed">
                    End-Term &amp; Mid-Term exam archives (2020–2026) organized by degree, semester, and course code.
                  </p>
                </div>

                {/* Clear Clickable Programme Links with Live Counts */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {ARCHIVE_PROGRAMMES.map((p) => {
                    const liveCount =
                      metrics.byDepartment?.[p.code] ??
                      metrics.byDepartment?.[p.code.replace('.', '')];
                    return (
                      <Link
                        key={p.code}
                        to={`/past-papers?dept=${encodeURIComponent(p.code)}`}
                        className="px-3 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.03] hover:border-[#E04F33] hover:text-[#E04F33] transition-[border-color] flex items-center justify-between text-xs"
                      >
                        <span className="font-mono-tabular font-semibold">{p.code}</span>
                        <span className="font-mono-tabular text-[11px] text-[#E04F33]">
                          {metricsLoaded ? (liveCount ?? 0) : '—'} ↗
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <Link
                to="/past-papers"
                className="w-full py-2.5 px-4 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-[border-color]"
              >
                <span>Browse Past Papers</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>
            </DimensionalDraftCard>

            {/* Pillar 2: Course Classrooms (LMS) */}
            <DimensionalDraftCard specCode="DWG-02" specLabel="R16" delay={0.055}>
            <article className="dw-crosshair-card h-full rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white dark:bg-[#111117] p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#896ABD]/12 text-[#896ABD] flex items-center justify-center shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <span className="dw-note-box">[02] DWG-LMS</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                    {user
                      ? `${offerings.length} assigned to you`
                      : `${metricsLoaded ? metrics.activeClassrooms : '—'} active this semester`}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold tracking-tight">Course Classrooms</h3>
                  <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-1 leading-relaxed">
                    Private per-course workspaces scoped to enrolled @jklu.edu.in students, faculty, and TAs.
                  </p>
                </div>

                {/* Borderless Info List (Clearly non-clickable capability highlights) */}
                <ul className="space-y-2 text-xs text-[#5C5B57] dark:text-[#C4C3BE] pt-1">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#896ABD] shrink-0 mt-0.5" />
                    <span>Announcements &amp; TA-verified Q&amp;A streams</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#896ABD] shrink-0 mt-0.5" />
                    <span>Drive-linked submissions with SHA-256 verification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#896ABD] shrink-0 mt-0.5" />
                    <span>TCS iON roster sync &amp; attendance tracking</span>
                  </li>
                </ul>

                {user && offerings.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {offerings.slice(0, 3).map((o) => (
                      <Link
                        key={o.id}
                        to={`/classroom/${o.id}`}
                        className="px-2.5 py-1 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#896ABD] hover:text-[#896ABD] font-mono-tabular text-[11px] font-medium inline-flex items-center gap-1"
                      >
                        <span>{o.course_code}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {user ? (
                  <>
                    <Link
                      to="/classroom"
                      className="w-full py-2.5 px-4 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#896ABD] dark:hover:bg-[#896ABD] dark:hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-[border-color]"
                    >
                      <span>Open My Classrooms</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    {isProfessorOrAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowReleaseModal(true)}
                        className="w-full py-2 px-4 rounded-xl border border-[#E5E2DC] dark:border-white/15 hover:border-[#E04F33] hover:text-[#E04F33] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-[border-color]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Release New Classroom</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link
                      to="/login?next=%2Fclassroom"
                      className="w-full py-2.5 px-4 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-[border-color]"
                    >
                      <span>Sign In to Access Classrooms</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setShowJoinBox(true);
                        consoleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-[11px] font-mono-tabular text-[#896ABD] hover:underline text-center"
                    >
                      Or enroll with an elective Join Code ↑
                    </button>
                  </div>
                )}
              </div>
            </article>
            </DimensionalDraftCard>

            {/* Pillar 3: Faculty & TA Directory */}
            <DimensionalDraftCard specCode="DWG-03" specLabel="R16" delay={0.095}>
            <article className="dw-crosshair-card h-full rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white dark:bg-[#111117] p-5 sm:p-6 flex flex-col justify-between space-y-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#0A0A0C]/8 dark:bg-white/10 text-[#0A0A0C] dark:text-[#F5F4F0] flex items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <span className="dw-note-box">[03] DWG-FAC</span>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                    {metricsLoaded ? metrics.facultyCount : faculty.length} faculty · {uniqueTaCount} course TAs
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold tracking-tight">Faculty</h3>
                  <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-1 leading-relaxed">
                    Look up professors, co-instructors, cabin locations, emails, and Teaching Assistant contacts.
                  </p>
                </div>

                {/* Clear 1-Click School Buttons with Live Counts */}
                <div className="space-y-2 pt-1">
                  {SCHOOLS.map((sc) => (
                    <Link
                      key={sc.code}
                      to={`/faculty?school=${sc.code}`}
                      className="px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.03] hover:border-[#896ABD] hover:text-[#896ABD] transition-[border-color] flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate">
                        <strong className="font-mono-tabular">{sc.code}</strong>{' '}
                        <span className="text-[#5C5B57] dark:text-[#A09F9A]">· {sc.name}</span>
                      </span>
                      <span className="font-mono-tabular text-[11px] shrink-0">
                        {schoolCounts[sc.code] || 0} ↗
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <Link
                to="/faculty"
                className="w-full py-2.5 px-4 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#0A0A0C] dark:hover:border-[#F5F4F0] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-[border-color]"
              >
                <span>Explore Faculty Directory</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </article>
            </DimensionalDraftCard>
          </div>
        </section>

        {/* Interactive Archive Coverage Heatmap & Exam Mix Teaser */}
        {heatmapSeries.length > 0 && (
          <section className="relative overflow-hidden rounded-2xl border border-[#DDD8CE] bg-white/95 backdrop-blur-md p-5 sm:p-7 shadow-[0_6px_28px_rgba(10,10,12,0.05)]">
            {/* Dark-Shaded Archive Artwork Backdrop with Halo Glow (right edge) */}
            <div
              aria-hidden="true"
              className="pointer-events-none select-none hidden md:block absolute right-0 top-0 bottom-0 w-[38%] overflow-hidden"
              style={{
                maskImage: 'linear-gradient(to left, black 45%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to left, black 45%, transparent 100%)',
              }}
            >
              <div className="absolute inset-0 bg-[#12121A]" />
              <img
                src="/illustrations/archive-abstract.jpg"
                alt=""
                className="w-full h-full object-cover opacity-80 mix-blend-luminosity"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at 75% 32%, rgba(224,79,51,0.34), transparent 55%), radial-gradient(circle at 60% 72%, rgba(137,106,189,0.42), transparent 60%), linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(18,18,26,0.58) 42%, rgba(18,18,26,0.28) 100%)',
                }}
              />
            </div>

            <div className="relative z-10 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <span className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#E04F33] font-semibold">
                    Interactive Archive Atlas · Live Data
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight mt-0.5 text-[#0A0A0C]">
                    Coverage by Programme &amp; Exam Session
                  </h2>
                  <p className="text-xs text-[#353430] mt-0.5">
                    Click any heatmap cell, trend node, or exam bar segment to jump straight into matching Past Papers.
                  </p>
                </div>

                <Link
                  to="/past-papers"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono-tabular font-semibold bg-[#12121A] text-white border border-white/15 shadow-[0_0_20px_rgba(137,106,189,0.35)] hover:bg-[#E04F33] transition-colors shrink-0"
                >
                  <span>Open Full Archive</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8">
                  <Suspense
                    fallback={
                      <div className="h-56 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/60 dark:border-white/10 animate-pulse" />
                    }
                  >
                    <LazyArchiveHeatmap
                      data={heatmapSeries}
                      onSelectCell={(prog, yr) =>
                        navigate(
                          `/past-papers?dept=${encodeURIComponent(prog)}&year=${encodeURIComponent(yr)}`
                        )
                      }
                    />
                  </Suspense>
                </div>

                <div className="lg:col-span-4 space-y-5">
                  <div className="p-4 rounded-xl bg-[#FAF9F6]/90 dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular uppercase text-[10px] tracking-wider text-[#5C5B57] dark:text-[#94938E] font-semibold">
                        Papers Per Year (2020–2026)
                      </span>
                      <span className="font-mono-tabular text-[11px] font-semibold text-[#E04F33]">
                        {archiveStats?.total?.toLocaleString() || metrics.approvedPapers.toLocaleString()}
                      </span>
                    </div>
                    <Sparkline
                      data={yearTrendPoints}
                      height={54}
                      accentColor="#896ABD"
                      unitLabel="papers"
                      ariaLabel="Archive growth across sessions"
                      onSelectPoint={(pt) =>
                        navigate(`/past-papers?year=${encodeURIComponent(pt.label)}`)
                      }
                    />
                    <p className="text-[11px] text-[#5C5B57] dark:text-[#8E8D88]">
                      Click any year point to filter that session.
                    </p>
                  </div>

                  {examMixSegments.length > 0 && (
                    <div className="p-4 rounded-xl bg-[#FAF9F6]/90 dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10 space-y-2.5">
                      <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E] font-semibold">
                        Exam Type Mix (Clickable)
                      </div>
                      <ProportionBar
                        segments={examMixSegments}
                        unitLabel="papers"
                        ariaLabel="Exam type breakdown"
                        onSelect={(typeId) =>
                          navigate(`/past-papers?type=${encodeURIComponent(typeId)}`)
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Signed-In User's Assigned Classrooms (Only rendered when user has enrolled/taught courses) */}
        {user && offerings.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#896ABD]" />
                <h2 className="text-base sm:text-lg font-semibold tracking-tight">
                  Your Active Classrooms ({offerings.length})
                </h2>
              </div>
              <Link
                to="/classroom"
                className="text-xs font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#0A0A0C] dark:hover:text-white inline-flex items-center gap-1"
              >
                <span>Open Full LMS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {offerings.map((c) => {
                const statusLabel = c.is_instructor
                  ? c.join_code
                    ? `INSTRUCTOR · ${c.join_code}`
                    : 'INSTRUCTOR'
                  : c.is_ta
                    ? 'COURSE TA'
                    : c.is_enrolled
                      ? 'ENROLLED'
                      : 'ASSIGNED';
                return (
                  <article
                    key={c.id}
                    className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-xs font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                          {c.course_code}{' '}
                          <span className="font-normal text-[#5C5B57] dark:text-[#A09F9A]">
                            · {c.programme} Sem {c.semester}
                          </span>
                        </span>
                        <span className="font-mono-tabular text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {statusLabel}
                        </span>
                      </div>

                      <h3 className="font-semibold text-base leading-snug">{c.course_name}</h3>

                      <p className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                        Batch {c.batch_year} · {c.enrolled_count || 0} enrolled
                      </p>

                      {c.instructors?.length > 0 && (
                        <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] truncate pt-2 border-t border-[#E5E2DC]/60 dark:border-white/10">
                          {c.instructors.map((i: any) => i.name).join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Link
                        to={`/past-papers?q=${encodeURIComponent(c.course_code)}`}
                        className="py-2 px-3 rounded-xl border border-[#E5E2DC] dark:border-white/15 text-xs font-medium text-center hover:border-[#E04F33] hover:text-[#E04F33] transition-[border-color]"
                      >
                        Papers ↗
                      </Link>
                      <Link
                        to={`/classroom/${c.id}`}
                        className="py-2 px-3 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white text-xs font-semibold text-center inline-flex items-center justify-center gap-1"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Faculty Directory Quick Preview (Flat Info vs Interactive Links) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#896ABD]" />
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">
                Faculty &amp; Public TA Quick Directory
              </h2>
            </div>
            <Link
              to="/faculty"
              className="text-xs font-mono-tabular text-[#896ABD] dark:text-[#C084FC] hover:text-[#E04F33] inline-flex items-center gap-1 font-medium"
            >
              <span>View Full Directory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="p-6 rounded-2xl border border-[#E5E2DC] dark:border-white/10 bg-white/80 dark:bg-[#111117]/80 text-center text-xs font-mono-tabular text-[#5C5B57]">
              Loading faculty directory...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {faculty.slice(0, 4).map((prof) => {
                const cardStyle = resolveFacultyCardStyle(prof.card_style);
                const initials = String(prof.name || 'JK')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p: string) => p[0] || '')
                  .join('')
                  .toUpperCase();
                return (
                <article
                  key={prof.user_id}
                  className="relative overflow-hidden rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/95 dark:bg-[#111117]/85 backdrop-blur-md p-5 space-y-3"
                >
                  <FacultyCardPatternArt
                    styleId={cardStyle.id}
                    accent={cardStyle.accentHex}
                    secondary={cardStyle.secondaryHex}
                    compact
                  />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {prof.photo_path ? (
                        <img
                          src={prof.photo_path}
                          alt={prof.name}
                          className="w-11 h-11 rounded-xl object-cover shrink-0 border border-[#E5E2DC] shadow-sm"
                        />
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-xl ${cardStyle.avatarBg} text-white font-semibold text-sm flex items-center justify-center shrink-0 shadow-sm`}
                        >
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-base truncate">{prof.name}</h3>
                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] dark:bg-white/[0.08] text-[#5C5B57] dark:text-[#C4C3BE]">
                            {prof.school}
                          </span>
                        </div>
                        <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-0.5 truncate">
                          {prof.designation}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88] shrink-0">
                      {(prof.programmes || []).join(' · ')}
                    </span>
                  </div>

                  <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-2.5 border-t border-[#E5E2DC]/60 dark:border-white/10">
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
                  </div>

                  <div className="relative z-10 flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88] mr-1">
                      Papers:
                    </span>
                    {(prof.courses || []).map((c: any) => (
                      <Link
                        key={c.offering_id}
                        to={`/past-papers?q=${encodeURIComponent(c.course_code)}`}
                        className="px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#E04F33] hover:text-[#E04F33] inline-flex items-center gap-1 transition-[border-color]"
                      >
                        <span>{c.course_code}</span>
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      </Link>
                    ))}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Professor / Admin Modal: Release New Course Classroom */}
      <ReleaseCourseModal
        isOpen={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        isAdmin={Boolean(user?.is_admin || user?.admin_role === 'full_admin')}
        onSuccess={async (data) => {
          setShowReleaseModal(false);
          setStatusFeedback({
            type: 'success',
            text: data?.message || 'Course classroom released & students enrolled.',
          });
          await loadAcademicHub();
          if (data?.offering?.id) {
            navigate(`/classroom/${data.offering.id}`);
          }
        }}
      />

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};

export default HomePage;
