import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import anime from 'animejs';
import {
  Search,
  X,
  SlidersHorizontal,
  BookOpen,
  Upload,
  LogOut,
  Shield,
  Sparkles,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Download,
  User,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import Footer from '@/components/layout/Footer';
import PaperCard from '@/components/papers/PaperCard';
import FilePreviewModal from '@/components/papers/FilePreviewModal';
import { DimensionalTitleBlock } from '@/components/dimensional/DimensionalKit';
import { ExamTypePictogram, ProgrammePictogram } from '@/components/viz/Pictograms';
import { usePrefersReducedMotion } from '@/components/viz/chartTokens';
import { API } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import techAffairsLogo from '@/assets/technical-affairs-logo.png';

const QUICK_SEARCH_SHORTCUTS = [
  { label: 'DSA (Data Structures)', query: 'DSA' },
  { label: 'RL (Reinforcement Learning)', query: 'RL' },
  { label: 'DAA (Algorithms)', query: 'DAA' },
  { label: 'OS (Operating Systems)', query: 'OS' },
  { label: 'DBMS', query: 'DBMS' },
  { label: 'AI / ML', query: 'AI' },
  { label: 'LADE (Linear Algebra)', query: 'LADE' },
  { label: 'DE (Digital Electronics)', query: 'DE' },
  { label: 'FA (Financial Accounting)', query: 'FA' },
  { label: 'FRM (Risk Management)', query: 'FRM' },
  { label: 'Business Law', query: 'BL' },
];

const PAGE_SIZE = 24;

const PastPapersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Server-paginated state (only 24 items loaded per page to protect DB & bandwidth)
  const [papers, setPapers] = useState<any[]>([]);
  const [totalPapers, setTotalPapers] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [matchedAcronyms, setMatchedAcronyms] = useState<
    Array<{ acronym: string; expansions: string[] }>
  >([]);
  const [availableYears, setAvailableYears] = useState<number[]>([
    2026, 2025, 2024, 2023, 2022, 2021, 2020,
  ]);
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({});
  const [totalInCatalog, setTotalInCatalog] = useState<number>(0);

  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(() =>
    Boolean(searchParams.get('sem') || searchParams.get('year') || searchParams.get('course'))
  );

  // Filter controls
  const [searchInput, setSearchInput] = useState<string>(searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState<string>(searchParams.get('q') || '');
  const [selectedDept, setSelectedDept] = useState<string>(
    (searchParams.get('dept') || searchParams.get('programme') || 'ALL').toUpperCase()
  );
  const [selectedType, setSelectedType] = useState<string>(searchParams.get('type') || 'ALL');
  const [selectedSemester, setSelectedSemester] = useState<string>(searchParams.get('sem') || 'ALL');
  const [selectedYear, setSelectedYear] = useState<string>(searchParams.get('year') || 'ALL');
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>(
    searchParams.get('course') || 'ALL'
  );
  const [sortBy, setSortBy] = useState<string>('newest');

  // Preview Modal & Archive Telemetry
  const [previewPaper, setPreviewPaper] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [archiveStats, setArchiveStats] = useState<any | null>(null);
  const [surpriseLoading, setSurpriseLoading] = useState<boolean>(false);
  const autoOpenedPaperRef = useRef<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Load lightweight course list and archive telemetry once
  useEffect(() => {
    let mounted = true;
    API.getCourses()
      .then((res) => {
        if (!mounted) return;
        setCourses(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {});
    API.getArchiveStats()
      .then((res) => {
        if (!mounted) return;
        setArchiveStats(res?.data || null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Sync URL query params
  useEffect(() => {
    const qParam = searchParams.get('q');
    const deptParam = searchParams.get('dept') || searchParams.get('programme');
    const semParam = searchParams.get('sem');
    const typeParam = searchParams.get('type');
    const yearParam = searchParams.get('year');

    if (qParam !== null) {
      setSearchInput(qParam);
      setDebouncedQuery(qParam);
    }
    if (deptParam !== null) setSelectedDept(deptParam.toUpperCase());
    if (semParam !== null) setSelectedSemester(semParam);
    if (typeParam !== null) setSelectedType(typeParam);
    if (yearParam !== null) setSelectedYear(yearParam);

    if (searchParams.get('focus') === 'search') {
      searchInputRef.current?.focus();
    }
  }, [searchParams]);

  // Debounce search input (220ms) so typing doesn't spam the backend/database
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setCurrentPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page to 1 when any dropdown/pill filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDept, selectedType, selectedSemester, selectedYear, selectedCourseCode, sortBy]);

  // Fetch paginated slice (24 items) from backend smart search engine
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    API.getPublicPapersPaginated(currentPage, PAGE_SIZE, {
      q: debouncedQuery || undefined,
      department: selectedDept !== 'ALL' ? selectedDept : undefined,
      paper_type: selectedType !== 'ALL' ? selectedType : undefined,
      semester: selectedSemester !== 'ALL' ? selectedSemester : undefined,
      year: selectedYear !== 'ALL' ? selectedYear : undefined,
      course_code: selectedCourseCode !== 'ALL' ? selectedCourseCode : undefined,
      sort: sortBy,
    })
      .then((res) => {
        if (!active) return;
        const data = res.data;
        const loadedItems = Array.isArray(data?.items) ? data.items : [];
        setPapers(loadedItems);
        setTotalPapers(Number(data?.total || 0));

        // Auto-open preview if ?paper=<id> was shared (with direct fetch fallback when not on page 1)
        const sharedPaperId = searchParams.get('paper');
        if (sharedPaperId && autoOpenedPaperRef.current !== sharedPaperId) {
          const match = loadedItems.find((p: any) => String(p.id) === sharedPaperId);
          if (match) {
            autoOpenedPaperRef.current = sharedPaperId;
            setPreviewPaper(match);
            setPreviewUrl(`${API.baseURL}/papers/${match.id}/preview`);
          } else {
            const numericId = Number(sharedPaperId);
            if (Number.isInteger(numericId) && numericId > 0) {
              autoOpenedPaperRef.current = sharedPaperId;
              API.getPaper(numericId)
                .then((paperRes) => {
                  if (!active || !paperRes?.data) return;
                  setPreviewPaper(paperRes.data);
                  setPreviewUrl(`${API.baseURL}/papers/${paperRes.data.id}/preview`);
                })
                .catch(() => {});
            }
          }
        }
        setTotalPages(Number(data?.pages || 1));
        setMatchedAcronyms(Array.isArray(data?.matched_acronyms) ? data.matched_acronyms : []);
        if (data?.facets?.availableYears?.length) {
          setAvailableYears(data.facets.availableYears);
        }
        if (data?.facets?.departmentCounts) {
          setDeptCounts(data.facets.departmentCounts);
        }
        if (data?.facets?.totalInCatalog) {
          setTotalInCatalog(data.facets.totalInCatalog);
        }
      })
      .catch((err) => {
        console.error('Failed to load paginated papers:', err);
        if (active) {
          setLoadError(
            err?.message && err.message !== 'Error'
              ? err.message
              : 'Unable to reach the question paper archive right now. Please try again.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    currentPage,
    debouncedQuery,
    selectedDept,
    selectedType,
    selectedSemester,
    selectedYear,
    selectedCourseCode,
    sortBy,
    reloadNonce,
  ]);

  // Keyboard shortcut Cmd/Ctrl + K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Animate visible first row cards on page/filter load (capped decay, non-blocking)
  useEffect(() => {
    if (!loading && papers.length > 0) {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      anime.remove('.paper-card-anim');
      if (prefersReduced) {
        document.querySelectorAll('.paper-card-anim').forEach((el) => {
          (el as HTMLElement).style.opacity = '1';
          (el as HTMLElement).style.transform = 'none';
        });
        return;
      }
      anime({
        targets: '.paper-card-anim',
        translateY: [10, 0],
        opacity: [0, 1],
        duration: 240,
        delay: (_el: Element, i: number) => (i < 6 ? Math.round(Math.pow(i, 0.85) * 18) : 95),
        easing: 'cubicBezier(0.23, 1, 0.32, 1)',
      });
    }
  }, [papers, loading]);

  // Filter course dropdown options by selected department & semester
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (selectedDept !== 'ALL' && c.department && c.department !== selectedDept) return false;
      if (selectedSemester !== 'ALL' && c.semester && String(c.semester) !== selectedSemester)
        return false;
      return true;
    });
  }, [courses, selectedDept, selectedSemester]);

  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchNotice, setBatchNotice] = useState('');

  const handleToggleSelect = (paper: any) => {
    setBatchNotice('');
    setSelectedPaperIds((prev) => {
      if (prev.includes(paper.id)) {
        return prev.filter((id) => id !== paper.id);
      }
      if (prev.length >= 5) {
        setBatchNotice('Maximum 5 papers can be selected at once.');
        return prev;
      }
      return [...prev, paper.id];
    });
  };

  const handleBatchDownload = async () => {
    if (selectedPaperIds.length === 0 || batchDownloading) return;
    setBatchDownloading(true);
    setBatchNotice('');
    try {
      const response = await API.client.post(
        '/papers/batch-download',
        { ids: selectedPaperIds.slice(0, 5) },
        { responseType: 'blob', timeout: 55000 }
      );
      const blob = new Blob([response.data], { type: 'application/zip' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', 'LearnJKLU_Papers_Batch.zip');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setBatchNotice(
        err?.response?.data?.detail ||
          err?.message ||
          'Batch download limit reached or failed. Please try again shortly.'
      );
    } finally {
      setBatchDownloading(false);
    }
  };

  const handlePreview = (paper: any) => {
    const url = `${API.baseURL}/papers/${paper.id}/preview`;
    setPreviewPaper(paper);
    setPreviewUrl(url);
  };

  const handleDownload = (paper: any) => {
    const url = `${API.baseURL}/papers/${paper.id}/download`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', paper.file_name || `${paper.course_code || 'paper'}.pdf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters =
    Boolean(searchInput) ||
    selectedDept !== 'ALL' ||
    selectedType !== 'ALL' ||
    selectedSemester !== 'ALL' ||
    selectedYear !== 'ALL' ||
    selectedCourseCode !== 'ALL';

  const advancedFilterCount =
    (selectedSemester !== 'ALL' ? 1 : 0) +
    (selectedYear !== 'ALL' ? 1 : 0) +
    (selectedCourseCode !== 'ALL' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedQuery('');
    setSelectedDept('ALL');
    setSelectedType('ALL');
    setSelectedSemester('ALL');
    setSelectedYear('ALL');
    setSelectedCourseCode('ALL');
    setSortBy('newest');
    setCurrentPage(1);
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] overflow-x-hidden">

      {/* Unified Global Navigation Bar */}
      <GlobalNavbar />

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6">
        {/* Unified Smart Search & Multi-Faceted Filter Console */}
        <section className="relative overflow-hidden rounded-2xl p-6 sm:p-8 space-y-6 bg-white/95 border border-[#DDD8CE] shadow-[0_6px_28px_rgba(10,10,12,0.05)]">
          {/* Dark-Shaded Archive Artwork Backdrop with Halo Glow (right edge) */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none hidden sm:block absolute inset-y-0 right-0 w-72 md:w-96 overflow-hidden"
            style={{
              maskImage: 'linear-gradient(to left, black 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, black 50%, transparent 100%)',
            }}
          >
            <div className="absolute inset-0 bg-[#12121A]" />
            <img
              src="/illustrations/archive-abstract.jpg"
              alt=""
              className="w-full h-full object-cover opacity-85"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 78% 30%, rgba(224,79,51,0.34), transparent 55%), radial-gradient(circle at 58% 78%, rgba(137,106,189,0.44), transparent 58%), linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(18,18,26,0.55) 45%, rgba(18,18,26,0.32) 100%)',
              }}
            />
          </div>
          <div className="relative z-10 space-y-6">
          <DimensionalTitleBlock
            dwgNo="JKLU-ARC-01"
            scope="VERIFIED EXAM ARCHIVE"
            cells={[
              { label: 'CATALOG', value: totalInCatalog > 0 ? `${totalInCatalog.toLocaleString()} PAPERS` : 'SYNCING' },
              { label: 'SPAN', value: '2012–2026' },
            ]}
          />
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono-tabular text-xs uppercase tracking-wider text-[#E04F33] font-semibold">
                  JKLU VERIFIED ARCHIVE · {totalInCatalog > 0 ? totalInCatalog.toLocaleString() : '—'} PAPERS ·{' '}
                  {courses.length > 0 ? courses.length.toLocaleString() : '—'} COURSES
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 text-[#0A0A0C]">
                Past Question Papers
              </h1>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#12121A]/90 text-[#F5F4F0] border border-white/15 shadow-[0_0_20px_rgba(137,106,189,0.35)] text-xs sm:text-sm font-mono-tabular">
              <span>Try DSA, OS, DBMS, RL</span>
              <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-white/15 border border-white/20 text-white text-xs">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Tier 1: Search Input + Collapsible Filters Trigger */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-[#896ABD] dark:text-[#A855F7] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search course code, subject name, or short-form (e.g. DSA)..."
                className="w-full pl-12 pr-10 py-3.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0B0F] text-base focus:outline-none focus:border-[#896ABD] dark:focus:border-[#A855F7] transition-[border-color]"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedQuery('');
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5C5B57] hover:text-[#0A0A0C] dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={async () => {
                if (surpriseLoading) return;
                setSurpriseLoading(true);
                try {
                  let pool = papers;
                  if (pool.length === 0) {
                    const res = await API.getPublicPapersPaginated(1, 24, { sort: 'newest' });
                    pool = Array.isArray(res.data?.items) ? res.data.items : [];
                  }
                  if (pool.length > 0) {
                    const picked = pool[Math.floor(Math.random() * pool.length)];
                    handlePreview(picked);
                  }
                } catch {
                  // Ignore transient errors
                } finally {
                  setSurpriseLoading(false);
                }
              }}
              disabled={surpriseLoading}
              title="Open a random past paper from the archive"
              className="px-4 py-3.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0B0F] text-sm font-medium text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#E04F33] hover:text-[#E04F33] dark:hover:text-[#FF785A] inline-flex items-center justify-center gap-2 shrink-0 transition-[border-color] disabled:opacity-50"
            >
              <Shuffle className="w-4 h-4 text-[#E04F33]" />
              <span>{surpriseLoading ? 'Picking...' : 'Surprise Me'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={`px-4 py-3.5 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 transition-[border-color] ${
                showAdvancedFilters || advancedFilterCount > 0
                  ? 'border-[#896ABD] bg-[#896ABD]/10 text-[#0A0A0C] dark:text-[#F5F4F0]'
                  : 'border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6]/80 dark:bg-[#0A0A0C]/80 text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#0A0A0C] dark:hover:border-[#F5F4F0]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#896ABD]" />
              <span>More Filters</span>
              {advancedFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#E04F33] text-white text-[10px] leading-none">
                  {advancedFilterCount}
                </span>
              )}
              {showAdvancedFilters ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Smart Acronym Expansion Feedback Banner */}
          {matchedAcronyms.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#896ABD]/15 border border-[#896ABD]/30 text-xs">
              <span className="inline-flex items-center gap-1 font-mono-tabular font-semibold text-[#896ABD] dark:text-[#C084FC]">
                <Sparkles className="w-3.5 h-3.5" />
                Smart Acronym Connected:
              </span>
              {matchedAcronyms.map((item) => (
                <span
                  key={item.acronym}
                  className="font-mono-tabular text-[#0A0A0C] dark:text-[#F5F4F0]"
                >
                  <strong>{item.acronym}</strong> → {item.expansions.join(', ')}
                </span>
              ))}
            </div>
          )}

          {/* Tier 1: Primary Programme Pills & Exam Type Pills */}
          <div className="pt-3.5 border-t border-[#E5E2DC]/80 dark:border-white/10 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Programme Pills with Pictograms, Morphing Highlight & Proportional Volume Bars */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#A09F9A] mr-1">
                  Programme:
                </span>
                {(['ALL', 'B.TECH', 'BBA', 'BCA', 'M.TECH', 'B.DES', 'PHD', 'MBA'] as const).map(
                  (dept) => {
                    const count = dept === 'ALL' ? totalInCatalog : deptCounts[dept];
                    const isActive = selectedDept === dept;
                    const volPct =
                      dept !== 'ALL' && totalInCatalog > 0 && count
                        ? Math.max(8, Math.round((count / totalInCatalog) * 100))
                        : 0;
                    return (
                      <button
                        key={dept}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setSelectedDept(dept)}
                        className={`relative overflow-hidden px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-medium transition-[border-color] border ${
                          isActive
                            ? 'text-[#FAF9F6] dark:text-[#0A0A0C] border-[#0A0A0C] dark:border-[#F5F4F0]'
                            : 'bg-transparent border-[#E5E2DC] dark:border-white/15 text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#0A0A0C] dark:hover:border-[#F5F4F0]'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="pastPapersDeptPill"
                            transition={
                              reducedMotion
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 420, damping: 32 }
                            }
                            className="absolute inset-0 bg-[#0A0A0C] dark:bg-[#F5F4F0]"
                            aria-hidden="true"
                          />
                        )}
                        {volPct > 0 && (
                          <span
                            className="absolute bottom-0 left-0 h-[2px] bg-[#E04F33]/85 dark:bg-[#E04F33] pointer-events-none"
                            style={{ width: `${volPct}%` }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center gap-1.5">
                          {dept !== 'ALL' && (
                            <ProgrammePictogram programme={dept} className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>
                            {dept === 'ALL' ? 'All' : dept}
                            {count !== undefined && count > 0 ? ` (${count})` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  }
                )}
              </div>

              {/* Exam Type Pills with Pictograms, Morphing Highlight & Proportional Volume Bars */}
              <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 border border-[#DDD8CE] shadow-sm">
                <span className="text-[11px] font-mono-tabular uppercase text-[#353430] font-semibold mr-1">
                  Exam Type:
                </span>
                {(['ALL', 'ENDTERM', 'MIDTERM', 'QUIZ'] as const).map((t) => {
                  const isActive = selectedType === t;
                  const typeTotal =
                    t === 'ALL'
                      ? archiveStats?.total || totalInCatalog
                      : Number(archiveStats?.typeTotals?.[t] || 0);
                  const denom = Number(archiveStats?.total || totalInCatalog || 0);
                  const volPct =
                    t !== 'ALL' && denom > 0 && typeTotal > 0
                      ? Math.max(8, Math.round((typeTotal / denom) * 100))
                      : 0;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setSelectedType(t)}
                      className={`relative overflow-hidden px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-medium transition-[border-color] border ${
                        isActive
                          ? 'text-white border-[#E04F33]'
                          : 'bg-white border-[#DDD8CE] text-[#0A0A0C] hover:border-[#E04F33]'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="pastPapersTypePill"
                          transition={
                            reducedMotion
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 420, damping: 32 }
                          }
                          className="absolute inset-0 bg-[#E04F33]"
                          aria-hidden="true"
                        />
                      )}
                      {volPct > 0 && (
                        <span
                          className="absolute bottom-0 left-0 h-[2px] bg-[#896ABD]/85 dark:bg-[#A855F7] pointer-events-none"
                          style={{ width: `${volPct}%` }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        {t !== 'ALL' && (
                          <ExamTypePictogram type={t} className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {t === 'ALL'
                            ? 'All Exams'
                            : t === 'ENDTERM'
                              ? 'End-Term'
                              : t === 'MIDTERM'
                                ? 'Mid-Term'
                                : 'Quiz'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tier 2 Collapsible: Short-Forms + Semester, Year, Course, Sort */}
            <AnimatePresence initial={false}>
              {showAdvancedFilters && (
                <motion.div
                  key="advanced-filters-drawer"
                  initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.14 }}
                >
                  <div className="pt-5 border-t border-[#E5E2DC]/60 dark:border-white/10 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A] shrink-0 mr-1">
                    Quick Short-Forms:
                  </span>
                  {QUICK_SEARCH_SHORTCUTS.map((chip) => {
                    const isSelected = searchInput.trim().toUpperCase() === chip.query.toUpperCase();
                    return (
                      <button
                        key={chip.query}
                        onClick={() => {
                          if (isSelected) {
                            setSearchInput('');
                            setDebouncedQuery('');
                          } else {
                            setSearchInput(chip.query);
                            setDebouncedQuery(chip.query);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-mono-tabular shrink-0 border transition-[border-color] ${
                          isSelected
                            ? 'bg-[#896ABD] text-white border-[#896ABD] shadow-sm'
                            : 'bg-[#FAF9F6] dark:bg-white/[0.04] border-[#E5E2DC] dark:border-white/10 text-[#5C5B57] dark:text-[#C4C3BE] hover:border-[#896ABD] hover:text-[#896ABD] dark:hover:border-[#A855F7] dark:hover:text-[#C084FC]'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Semester Select */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A]">
                      Semester
                    </label>
                    <select
                      value={selectedSemester}
                      onChange={(e) => setSelectedSemester(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0B0F] text-sm focus:outline-none focus:border-[#896ABD]"
                    >
                      <option value="ALL">All Semesters (Sem 1–8)</option>
                      {['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => (
                        <option key={s} value={s}>
                          Semester {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Academic Year Select */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A]">
                      Examination Year
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0B0F] text-sm focus:outline-none focus:border-[#896ABD]"
                    >
                      <option value="ALL">All Years (2020–2026)</option>
                      {availableYears.map((y) => (
                        <option key={y} value={String(y)}>
                          {y} Examination Session
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Course / Subject Select */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A]">
                      Course / Subject ({filteredCourses.length})
                    </label>
                    <select
                      value={selectedCourseCode}
                      onChange={(e) => setSelectedCourseCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0B0F] text-sm focus:outline-none focus:border-[#896ABD]"
                    >
                      <option value="ALL">All Courses ({filteredCourses.length})</option>
                      {filteredCourses.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name} ({c.paper_count || 1})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sort Order */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A] flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>Sort Results</span>
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0B0F] text-sm focus:outline-none focus:border-[#896ABD]"
                    >
                      <option value="newest">Newest Session First (2026 → 2020)</option>
                      <option value="oldest">Oldest Session First (2020 → 2026)</option>
                      <option value="code_asc">Course Code (A → Z)</option>
                      <option value="popular">Most Downloaded</option>
                    </select>
                  </div>
                </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </section>

        {/* Interactive Session Coverage Strip (shown when More Filters is open or a Year is filtered to keep default view uncluttered) */}
        {(showAdvancedFilters || selectedYear !== 'ALL') && (() => {
          const stripYears: number[] =
            Array.isArray(archiveStats?.years) && archiveStats.years.length > 0
              ? archiveStats.years.map(Number)
              : [2020, 2021, 2022, 2023, 2024, 2025, 2026];
          const yearTotals = archiveStats?.yearTotals || {};
          const maxCount = Math.max(
            1,
            ...stripYears.map((y) => Number(yearTotals[String(y)] || 0))
          );

          return (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 rounded-2xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10 shadow-sm">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A] font-medium">
                  Filter by Year
                </span>
                {selectedYear !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedYear('ALL')}
                    className="px-2.5 py-1 rounded-md text-xs font-mono-tabular bg-[#E04F33]/10 text-[#E04F33] border border-[#E04F33]/30 hover:bg-[#E04F33]/20 transition-colors"
                  >
                    All Years ×
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 flex-1 max-w-2xl">
                {stripYears.map((yr) => {
                  const count = Number(yearTotals[String(yr)] || 0);
                  const active = selectedYear === String(yr);
                  const barPct = count > 0 ? Math.max(18, Math.round((count / maxCount) * 100)) : 8;
                  return (
                    <button
                      key={yr}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setSelectedYear((prev) => (prev === String(yr) ? 'ALL' : String(yr)))
                      }
                      className={`group flex flex-col justify-between px-2.5 py-2 rounded-lg border text-left transition-[border-color] ${
                        active
                          ? 'border-[#E04F33] bg-[#E04F33]/10 dark:bg-[#E04F33]/15'
                          : 'border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-white/[0.03] hover:border-[#896ABD]'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <span
                          className={`text-xs font-mono-tabular font-semibold ${
                            active
                              ? 'text-[#E04F33]'
                              : 'text-[#0A0A0C] dark:text-[#F5F4F0]'
                          }`}
                        >
                          {yr}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                          {archiveStats ? count : '—'}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E5E2DC]/70 dark:bg-white/10 overflow-hidden">
                        <div
                          className={`h-full w-full origin-left rounded-full transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                            active
                              ? 'bg-[#E04F33]'
                              : count > 0
                              ? 'bg-[#896ABD]/80 group-hover:bg-[#E04F33]/80'
                              : 'bg-transparent'
                          }`}
                          style={{ transform: `scaleX(${Math.max(0, Math.min(1, Number(barPct || 0) / 100))})` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Results Status Bar with Active Tier-2 Chips */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 rounded-xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2 text-sm text-[#5C5B57] dark:text-[#C4C3BE] mr-1">
              <SlidersHorizontal className="w-4 h-4 text-[#896ABD] dark:text-[#A855F7]" />
              <span>
                Showing{' '}
                <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">
                  {papers.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
                  {Math.min(currentPage * PAGE_SIZE, totalPapers)}
                </strong>{' '}
                of <strong className="text-[#0A0A0C] dark:text-[#F5F4F0]">{totalPapers}</strong>{' '}
                matching papers (Page {currentPage} of {totalPages})
              </span>
            </span>

            {selectedSemester !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedSemester('ALL')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-tabular border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.06] hover:border-[#E04F33]"
              >
                <span>Sem {selectedSemester}</span>
                <X className="w-3 h-3" />
              </button>
            )}
            {selectedYear !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedYear('ALL')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-tabular border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.06] hover:border-[#E04F33]"
              >
                <span>{selectedYear}</span>
                <X className="w-3 h-3" />
              </button>
            )}
            {selectedCourseCode !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedCourseCode('ALL')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-tabular border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.06] hover:border-[#E04F33]"
              >
                <span>{selectedCourseCode}</span>
                <X className="w-3 h-3" />
              </button>
            )}
            {sortBy !== 'newest' && (
              <button
                type="button"
                onClick={() => setSortBy('newest')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-tabular border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.06] hover:border-[#E04F33]"
              >
                <span>Sort: {sortBy}</span>
                <X className="w-3 h-3" />
              </button>
            )}

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono-tabular text-[#E04F33] bg-[#E04F33]/10 hover:bg-[#E04F33]/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset all filters</span>
              </button>
            )}
          </div>

          <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
            Server-side paginated ({PAGE_SIZE} papers/page)
          </span>
        </div>

        {/* Error Banner with Retry */}
        {!loading && loadError && (
          <div className="px-4 py-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 text-white font-semibold hover:bg-rose-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Papers Grid — Full-Width Responsive Multi-Column Layout */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl p-6 sm:p-7 min-h-[268px] bg-white/85 dark:bg-[#111117]/85 backdrop-blur-xl border border-[#E5E2DC] dark:border-white/10 animate-pulse flex flex-col justify-between"
              >
                <div className="flex justify-between">
                  <div className="h-6 w-28 bg-[#E5E2DC] dark:bg-[#232329] rounded-lg" />
                  <div className="h-6 w-24 bg-[#E5E2DC] dark:bg-[#232329] rounded-lg" />
                </div>
                <div className="space-y-3 my-4">
                  <div className="h-6 w-4/5 bg-[#E5E2DC] dark:bg-[#232329] rounded-lg" />
                  <div className="h-4 w-3/5 bg-[#E5E2DC] dark:bg-[#232329] rounded-lg" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-12 bg-[#E5E2DC] dark:bg-[#232329] rounded-xl" />
                  <div className="h-12 bg-[#E5E2DC] dark:bg-[#232329] rounded-xl" />
                  <div className="h-12 bg-[#E5E2DC] dark:bg-[#232329] rounded-xl" />
                </div>
                <div className="h-10 w-full bg-[#E5E2DC] dark:bg-[#232329] rounded-xl mt-4" />
              </div>
            ))}
          </div>
        ) : papers.length === 0 ? (
          <div className="rounded-2xl p-12 text-center space-y-3 bg-white/90 dark:bg-[#111117]/90 backdrop-blur-xl border border-[#E5E2DC] dark:border-white/10">
            <p className="text-base font-medium">No question papers match your current filter.</p>
            <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
              Try searching with a short-form (e.g., DSA, RL, OS, DBMS, FA) or resetting filters.
            </p>
            <button onClick={clearFilters} className="btn-primary text-xs mt-2">
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {papers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  isSelected={selectedPaperIds.includes(paper.id)}
                  onToggleSelect={handleToggleSelect}
                  courseYears={
                    archiveStats?.courseYears?.[String(paper.course_code || '').toUpperCase()]
                  }
                  onSelectYear={(yr) =>
                    setSelectedYear((prev) => (prev === String(yr) ? 'ALL' : String(yr)))
                  }
                />
              ))}
            </div>

            {/* Server-Side Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white/90 dark:bg-[#111117]/90 backdrop-blur-md border border-[#E5E2DC]/80 dark:border-white/10">
                <span className="text-xs font-mono-tabular text-[#5C5B57] dark:text-[#C4C3BE]">
                  Page {currentPage} of {totalPages} ({totalPapers} total papers)
                </span>

                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#121216] text-xs font-mono-tabular disabled:opacity-40 hover:border-[#896ABD] dark:hover:border-[#A855F7] flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === totalPages ||
                        (p >= currentPage - 2 && p <= currentPage + 2)
                    )
                    .map((pageNum, idx, arr) => {
                      const prevNum = arr[idx - 1];
                      const showEllipsis = prevNum && pageNum - prevNum > 1;
                      return (
                        <React.Fragment key={pageNum}>
                          {showEllipsis && (
                            <span className="px-1.5 text-xs font-mono-tabular text-[#5C5B57]">
                              …
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setCurrentPage(pageNum);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={`w-9 h-9 rounded-xl text-xs font-mono-tabular font-medium border transition-colors ${
                              currentPage === pageNum
                                ? 'bg-[#896ABD] text-white border-[#896ABD]'
                                : 'bg-white dark:bg-[#121216] border-[#E5E2DC] dark:border-white/15 hover:border-[#896ABD] dark:hover:border-[#A855F7]'
                            }`}
                          >
                            {pageNum}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#121216] text-xs font-mono-tabular disabled:opacity-40 hover:border-[#896ABD] dark:hover:border-[#A855F7] flex items-center gap-1 transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Batch Download Bar (Max 5 PDFs) */}
      {(selectedPaperIds.length > 0 || batchNotice) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-xl rounded-2xl px-4 py-3 bg-[#0A0A0C]/95 dark:bg-[#16161D]/95 text-[#FAF9F6] border border-white/15 shadow-2xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="text-xs font-mono-tabular font-semibold">
              Selected {selectedPaperIds.length} / 5 PDFs
            </div>
            {batchNotice && <div className="text-[11px] text-[#FF8A75]">{batchNotice}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedPaperIds([]);
                setBatchNotice('');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-mono-tabular border border-white/20 hover:bg-white/10 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={selectedPaperIds.length === 0 || batchDownloading}
              onClick={handleBatchDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#896ABD] hover:bg-[#7A5BAE] disabled:opacity-50 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{batchDownloading ? 'Bundling ZIP...' : 'Download All (ZIP)'}</span>
            </button>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewPaper && previewUrl && (
        <FilePreviewModal
          isOpen={Boolean(previewPaper)}
          onClose={() => {
            setPreviewPaper(null);
            setPreviewUrl(null);
          }}
          fileName={previewPaper.file_name || `${previewPaper.course_code}.pdf`}
          filePath={previewPaper.file_path || ''}
          paperId={previewPaper.id}
          token={typeof window !== 'undefined' ? localStorage.getItem('token') || '' : ''}
          courseCode={previewPaper.course_code}
          onSelectCourse={(code) => {
            setPreviewPaper(null);
            setPreviewUrl(null);
            setSearchInput(code);
            setDebouncedQuery(code);
            setCurrentPage(1);
          }}
        />
      )}

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};

export default PastPapersPage;
