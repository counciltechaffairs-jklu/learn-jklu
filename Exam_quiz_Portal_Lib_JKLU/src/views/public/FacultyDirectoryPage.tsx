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
  Camera,
  Trash2,
  Sparkles,
  Palette,
  Check,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { ScrollProgressBar } from '@/components/animations/MotionPrimitives';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import { ReleaseCourseModal } from '@/components/classroom/ReleaseCourseModal';
import Footer from '@/components/layout/Footer';
import { DimensionalTitleBlock } from '@/components/dimensional/DimensionalKit';
import { ProportionBar } from '@/components/viz/ProportionBar';
import { ProgrammePictogram, SchoolPictogram } from '@/components/viz/Pictograms';
import { CHART_COLORS, usePrefersReducedMotion } from '@/components/viz/chartTokens';
import type { FacultyGraphLink, FacultyGraphNode } from '@/components/viz/FacultyNetworkGraph';
import { API } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  FACULTY_CARD_STYLE_MAP,
  FACULTY_CARD_STYLES,
  FacultyCardDesignPicker,
  FacultyCardPatternArt,
  type FacultyCardStyleId,
} from '@/components/faculty/facultyCardStyles';
import { FacultyPhotoCropModal } from '@/components/faculty/FacultyPhotoCropModal';
import {
  FacultyPhotoLightbox,
  type LightboxPhotoData,
} from '@/components/faculty/FacultyPhotoLightbox';

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
  photo_path?: string | null;
  card_style?: FacultyCardStyleId;
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [selectedFacultyModal, setSelectedFacultyModal] = useState<FacultyProfile | null>(null);
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
  const [myPhotoPreview, setMyPhotoPreview] = useState<string | null>(null);
  const [myCardStyle, setMyCardStyle] = useState<FacultyCardStyleId>('constellation');
  const [uploadingPhotoForId, setUploadingPhotoForId] = useState<number | null>(null);
  const [cropRequest, setCropRequest] = useState<{ userId: number; file: File } | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhotoData | null>(null);
  const [stylePickerProfId, setStylePickerProfId] = useState<number | null>(null);
  const [savingCardStyleForId, setSavingCardStyleForId] = useState<number | null>(null);
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

  const isProfessorOrAdmin = Boolean(
    user && (user.is_admin || user.admin_role === 'professor' || user.admin_role === 'full_admin')
  );

  const fetchDirectory = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await API.client.get('/faculty/directory');
      setFacultyList(res.data?.items || []);
    } catch (err: any) {
      console.error('Failed to load faculty directory:', err);
      setLoadError(
        err?.message && err.message !== 'Error'
          ? err.message
          : 'Unable to load the Faculty Directory right now. Please try again.'
      );
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
      setMyPhotoPreview(d.photo_path || null);
      setMyCardStyle(
        FACULTY_CARD_STYLE_MAP.has(d.card_style) ? d.card_style : 'constellation'
      );
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

  const handleUploadFacultyPhoto = (targetUserId: number, file: File | null | undefined) => {
    if (!file) return;
    setCropRequest({ userId: targetUserId, file });
  };

  const handleSaveCroppedPhoto = async (dataUrl: string, sizeKb: number) => {
    if (!cropRequest) return;
    const targetUserId = cropRequest.userId;
    setUploadingPhotoForId(targetUserId);
    try {
      const res = await API.client.patch('/faculty/me/photo', {
        user_id: targetUserId,
        photo_data_url: dataUrl,
      });
      const savedPhoto = res.data?.photo_path || dataUrl;
      setFacultyList((prev) =>
        prev.map((f) => (f.user_id === targetUserId ? { ...f, photo_path: savedPhoto } : f))
      );
      if (Number(user?.id) === Number(targetUserId)) {
        setMyPhotoPreview(savedPhoto);
      }
      setCropRequest(null);
      setBannerMsg({
        text: `Faculty photo converted to WebP (${sizeKb} KB) & published — visible to everyone!`,
        type: 'success',
      });
    } catch (err: any) {
      setBannerMsg({
        text: err?.response?.data?.detail || err?.message || 'Failed to upload faculty photo',
        type: 'error',
      });
      throw err;
    } finally {
      setUploadingPhotoForId(null);
    }
  };

  const handleRemoveFacultyPhoto = async (targetUserId: number) => {
    setUploadingPhotoForId(targetUserId);
    try {
      const res = await API.client.patch('/faculty/me/photo', {
        user_id: targetUserId,
        photo_data_url: null,
      });
      setFacultyList((prev) =>
        prev.map((f) => (f.user_id === targetUserId ? { ...f, photo_path: null } : f))
      );
      if (Number(user?.id) === Number(targetUserId)) {
        setMyPhotoPreview(null);
      }
      setBannerMsg({
        text: res.data?.message || 'Faculty photo removed',
        type: 'success',
      });
    } catch (err: any) {
      setBannerMsg({
        text: err?.response?.data?.detail || err?.message || 'Failed to remove faculty photo',
        type: 'error',
      });
    } finally {
      setUploadingPhotoForId(null);
    }
  };

  const handleSelectCardStyle = async (targetUserId: number, styleId: FacultyCardStyleId) => {
    setSavingCardStyleForId(targetUserId);
    try {
      const res = await API.client.patch('/faculty/me/card-style', {
        user_id: targetUserId,
        card_style: styleId,
      });
      const saved = (res.data?.card_style || styleId) as FacultyCardStyleId;
      setFacultyList((prev) =>
        prev.map((f) => (f.user_id === targetUserId ? { ...f, card_style: saved } : f))
      );
      if (Number(user?.id) === Number(targetUserId)) {
        setMyCardStyle(saved);
      }
      setBannerMsg({
        text: res.data?.message || 'Faculty card design updated!',
        type: 'success',
      });
    } catch (err: any) {
      setBannerMsg({
        text: err?.response?.data?.detail || err?.message || 'Could not update card design',
        type: 'error',
      });
    } finally {
      setSavingCardStyleForId(null);
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

  const activeModalProf = useMemo(() => {
    if (!selectedFacultyModal) return null;
    return (
      facultyList.find((f) => f.user_id === selectedFacultyModal.user_id) || selectedFacultyModal
    );
  }, [selectedFacultyModal, facultyList]);

  useEffect(() => {
    if (!selectedFacultyModal) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedFacultyModal(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectedFacultyModal]);

  const getFacultyCardMeta = (prof: FacultyProfile) => {
    const cleanName = prof.name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s*/i, '').trim();
    const nameParts = cleanName.split(/\s+/).filter(Boolean);
    const initials =
      nameParts.length >= 2
        ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
        : cleanName.slice(0, 2).toUpperCase();
    const activeStyleId: FacultyCardStyleId =
      prof.card_style && FACULTY_CARD_STYLE_MAP.has(prof.card_style)
        ? prof.card_style
        : 'constellation';
    const cardStyle = FACULTY_CARD_STYLE_MAP.get(activeStyleId) || FACULTY_CARD_STYLES[0];
    const canEditCard = Boolean(
      user && (user.is_admin || Number(user.id) === Number(prof.user_id))
    );
    const isUploadingThisPhoto = uploadingPhotoForId === prof.user_id;
    const isStylePickerOpen = stylePickerProfId === prof.user_id;
    const hasCoTeachers = (prof.courses || []).some((c) => (c.co_instructors || []).length > 0);
    const totalTAs = new Set(
      (prof.courses || []).flatMap((c) => (c.tas || []).map((t) => t.public_email || t.id))
    ).size;
    return {
      initials,
      activeStyleId,
      cardStyle,
      canEditCard,
      isUploadingThisPhoto,
      isStylePickerOpen,
      hasCoTeachers,
      totalTAs,
    };
  };

  const renderFacultyCard = (prof: FacultyProfile) => {
    const {
      initials,
      activeStyleId,
      cardStyle,
      canEditCard,
      isUploadingThisPhoto,
      isStylePickerOpen,
      hasCoTeachers,
      totalTAs,
    } = getFacultyCardMeta(prof);
    const isExpanded = viewMode === 'detailed' || Boolean(expandedProfs[prof.user_id]);

    const detailBits: string[] = [];
    if (hasCoTeachers) detailBits.push('Co-Instructors');
    if (totalTAs > 0) detailBits.push(`${totalTAs} TA${totalTAs > 1 ? 's' : ''}`);

    // Uniform Equal-Height Summary Grid Card (Default Overview Mode — Click to Open Full Profile Modal)
    if (viewMode === 'overview') {
      const visibleProgrammes = (prof.programmes || []).slice(0, 2);
      const extraProgCount = Math.max(0, (prof.programmes || []).length - 2);
      const visibleCourseCodes = (prof.courses || []).slice(0, 2);
      const extraCourseCount = Math.max(0, (prof.courses || []).length - 2);

      return (
        <article
          key={prof.user_id}
          role="button"
          tabIndex={0}
          onClick={() => setSelectedFacultyModal(prof)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedFacultyModal(prof);
            }
          }}
          className="relative group hover-lift dw-crosshair-card h-full rounded-2xl overflow-hidden border border-[#DDD8CE] bg-white shadow-[0_6px_26px_rgba(10,10,12,0.04)] hover:border-[#896ABD] transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col justify-between cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#896ABD]"
        >
          <FacultyCardPatternArt
            styleId={cardStyle.id}
            accent={cardStyle.accentHex}
            secondary={cardStyle.secondaryHex}
          />

          <div className="relative z-10 p-5 flex-1 flex flex-col justify-between gap-3.5">
            {/* Top Header */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    {prof.photo_path ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxPhoto({
                            src: prof.photo_path!,
                            name: prof.name,
                            designation: prof.designation,
                            school: prof.school,
                          })
                        }
                        title={`View ${prof.name}'s photo`}
                        aria-label={`Enlarge ${prof.name}'s photo`}
                        className={`group/photo block w-14 h-14 rounded-2xl overflow-hidden ring-4 ${cardStyle.ringClass} hover:ring-[#E04F33]/50 shadow-sm cursor-zoom-in transition-[box-shadow,transform] duration-150 active:scale-[0.97]`}
                      >
                        <img
                          src={prof.photo_path}
                          alt={prof.name}
                          className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-300"
                        />
                      </button>
                    ) : (
                      <div
                        className={`w-14 h-14 rounded-2xl overflow-hidden ring-4 ${cardStyle.ringClass} shadow-sm flex items-center justify-center ${cardStyle.avatarBg}`}
                      >
                        <span className="font-mono-tabular font-bold text-base text-white tracking-tight">
                          {initials}
                        </span>
                      </div>
                    )}

                    {canEditCard && (
                      <label
                        title="Upload or change faculty photo"
                        className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#E04F33] hover:bg-[#0A0A0C] text-white flex items-center justify-center shadow-md ring-2 ring-white cursor-pointer transition-colors ${
                          isUploadingThisPhoto ? 'opacity-60 pointer-events-none' : ''
                        }`}
                      >
                        <Camera className="w-3 h-3" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            handleUploadFacultyPhoto(prof.user_id, f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h2 className="text-base sm:text-[17px] font-bold tracking-tight text-[#0A0A0C] leading-snug line-clamp-2 sm:line-clamp-1">
                        {prof.name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-full border font-mono-tabular text-[10px] font-semibold uppercase tracking-wider shrink-0 ${cardStyle.badgeClass}`}
                      >
                        {prof.school}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#353430] mt-0.5 line-clamp-2 sm:line-clamp-1">
                      {prof.designation}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 flex-wrap sm:justify-end">
                    {visibleProgrammes.map((prog) => (
                      <span
                        key={prog}
                        className="px-1.5 py-0.5 rounded-md bg-white/90 border border-[#DDD8CE] font-mono-tabular text-[9px] font-semibold text-[#353430]"
                      >
                        {prog}
                      </span>
                    ))}
                    {extraProgCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-[#FAF9F6] border border-[#DDD8CE] font-mono-tabular text-[9px] font-semibold text-[#5C5B57]">
                        +{extraProgCount}
                      </span>
                    )}
                  </div>

                  {canEditCard && (
                    <div className="flex items-center gap-1">
                      <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#DDD8CE] bg-white/95 hover:border-[#E04F33] hover:text-[#E04F33] text-[10px] font-semibold text-[#353430] cursor-pointer transition-colors">
                        <Camera className="w-2.5 h-2.5" />
                        <span>{isUploadingThisPhoto ? '...' : prof.photo_path ? 'Photo' : 'Add'}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            handleUploadFacultyPhoto(prof.user_id, f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setStylePickerProfId(isStylePickerOpen ? null : prof.user_id)
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold transition-colors ${
                          isStylePickerOpen
                            ? 'border-[#896ABD] bg-[#896ABD]/12 text-[#5B3B96]'
                            : 'border-[#DDD8CE] bg-white/95 text-[#353430] hover:border-[#896ABD] hover:text-[#5B3B96]'
                        }`}
                      >
                        <Palette className="w-2.5 h-2.5" />
                        <span>Design</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {canEditCard && isStylePickerOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="p-3 rounded-xl bg-[#FAF9F6] border border-[#DDD8CE] space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono-tabular uppercase tracking-wider font-semibold text-[#353430]">
                      Card Design
                    </span>
                    <button
                      type="button"
                      onClick={() => setStylePickerProfId(null)}
                      className="text-[#353430] hover:text-[#0A0A0C] font-semibold"
                    >
                      Done
                    </button>
                  </div>
                  <FacultyCardDesignPicker
                    selectedStyle={activeStyleId}
                    onSelect={(styleId) => handleSelectCardStyle(prof.user_id, styleId)}
                    disabled={savingCardStyleForId === prof.user_id}
                    monogram={initials}
                  />
                </div>
              )}

              {/* Uniform Specialization Slot */}
              <div className="min-h-[28px] flex items-center">
                {prof.specialization ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#896ABD]/10 border border-[#896ABD]/25 text-xs font-medium text-[#5B3B96] max-w-full">
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span className="truncate">{prof.specialization}</span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] text-[11px] font-mono-tabular text-[#6A6862]">
                    School of {prof.school} · Academic Faculty
                  </span>
                )}
              </div>

              {/* Uniform Bio Clamped Slot */}
              <p className="text-xs text-[#353430] leading-relaxed line-clamp-2 min-h-[2.4rem]">
                {prof.bio ||
                  'Click this faculty card to view full specialization, courses taught, past paper links, batches, and Teaching Assistant details.'}
              </p>

              {/* Uniform Courses & TAs Summary Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5 min-h-[26px]">
                <span className="px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-[#DDD8CE] font-mono-tabular text-[11px] font-semibold text-[#0A0A0C]">
                  {prof.courses.length} {prof.courses.length === 1 ? 'Course' : 'Courses'}
                </span>
                {visibleCourseCodes.map((c) => (
                  <span
                    key={c.offering_id}
                    className="px-2 py-0.5 rounded-md bg-[#0A0A0C] text-white font-mono-tabular text-[10px] font-semibold"
                  >
                    {c.course_code}
                  </span>
                ))}
                {extraCourseCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#FAF9F6] border border-[#DDD8CE] font-mono-tabular text-[10px] text-[#5C5B57]">
                    +{extraCourseCount} more
                  </span>
                )}
                {totalTAs > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 font-mono-tabular text-[10px] font-semibold text-emerald-700">
                    {totalTAs} TA{totalTAs > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Uniform Footer */}
            <div className="pt-3 border-t border-[#E5E2DC] flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[#353430] min-w-0">
                <Mail className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                <span className="truncate font-mono-tabular text-[11px]">{prof.public_email}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono-tabular text-[11px] font-semibold text-[#5B3B96] group-hover:text-[#E04F33] shrink-0 transition-colors">
                <span>View Details</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        key={prof.user_id}
        className="relative group hover-lift dw-crosshair-card rounded-2xl overflow-hidden border border-[#DDD8CE] bg-white shadow-[0_6px_26px_rgba(10,10,12,0.04)] hover:border-[#896ABD] transition-[border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col"
      >
        {/* Pure Vector Top-Right Corner Design with Decreasing Transparency (No Gradient Fill / No Top Line) */}
        <FacultyCardPatternArt
          styleId={cardStyle.id}
          accent={cardStyle.accentHex}
          secondary={cardStyle.secondaryHex}
        />

        {/* Card Body */}
        <div className="relative z-10 p-5 sm:p-6 flex-1 flex flex-col space-y-4">
          {/* Header: Clean Portrait + Name + School/Programme Pills */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              {/* Faculty Portrait (Click to Enlarge when Photo Uploaded) */}
              <div className="relative shrink-0">
                {prof.photo_path ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxPhoto({
                        src: prof.photo_path!,
                        name: prof.name,
                        designation: prof.designation,
                        school: prof.school,
                      })
                    }
                    title={`View ${prof.name}'s photo`}
                    aria-label={`Enlarge ${prof.name}'s photo`}
                    className={`group/photo block w-[68px] h-[68px] rounded-2xl overflow-hidden ring-4 ${cardStyle.ringClass} hover:ring-[#E04F33]/50 shadow-sm cursor-zoom-in transition-[box-shadow,transform] duration-150 active:scale-[0.97]`}
                  >
                    <img
                      src={prof.photo_path}
                      alt={prof.name}
                      className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-300"
                    />
                  </button>
                ) : (
                  <div
                    className={`w-[68px] h-[68px] rounded-2xl overflow-hidden ring-4 ${cardStyle.ringClass} shadow-sm flex items-center justify-center ${cardStyle.avatarBg}`}
                  >
                    <span className="font-mono-tabular font-bold text-lg text-white tracking-tight">
                      {initials}
                    </span>
                  </div>
                )}

                {canEditCard && (
                  <label
                    title="Upload or change faculty photo (visible to everyone)"
                    className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#E04F33] hover:bg-[#0A0A0C] text-white flex items-center justify-center shadow-md ring-2 ring-white cursor-pointer transition-colors ${
                      isUploadingThisPhoto ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <Camera className="w-3 h-3" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        handleUploadFacultyPhoto(prof.user_id, f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#0A0A0C] leading-tight">
                    {prof.name}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-full border font-mono-tabular text-[10px] font-semibold uppercase tracking-wider ${cardStyle.badgeClass}`}
                  >
                    {prof.school}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-medium text-[#353430] mt-0.5">
                  {prof.designation}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {(prof.programmes || []).map((prog) => (
                  <span
                    key={prog}
                    className="px-2 py-0.5 rounded-md bg-white/90 border border-[#DDD8CE] font-mono-tabular text-[10px] font-semibold text-[#353430]"
                  >
                    {prog}
                  </span>
                ))}
              </div>

              {canEditCard && (
                <div className="flex items-center gap-1.5">
                  <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#DDD8CE] bg-white/95 hover:border-[#E04F33] hover:text-[#E04F33] text-[11px] font-semibold text-[#353430] cursor-pointer transition-colors">
                    <Camera className="w-3 h-3" />
                    <span>{isUploadingThisPhoto ? 'Uploading...' : prof.photo_path ? 'Photo' : 'Add Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        handleUploadFacultyPhoto(prof.user_id, f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setStylePickerProfId(isStylePickerOpen ? null : prof.user_id)
                    }
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                      isStylePickerOpen
                        ? 'border-[#896ABD] bg-[#896ABD]/12 text-[#5B3B96]'
                        : 'border-[#DDD8CE] bg-white/95 text-[#353430] hover:border-[#896ABD] hover:text-[#5B3B96]'
                    }`}
                  >
                    <Palette className="w-3 h-3" />
                    <span>Design</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Inline 1-Click Visual Card Design Picker for Owning Professor / Admin */}
          {canEditCard && isStylePickerOpen && (
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#DDD8CE] space-y-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-mono-tabular uppercase tracking-wider font-semibold text-[#353430]">
                  Choose Card Design (Live Samples · Visible to Everyone)
                </span>
                <button
                  type="button"
                  onClick={() => setStylePickerProfId(null)}
                  className="text-[#353430] hover:text-[#0A0A0C] font-semibold"
                >
                  Done
                </button>
              </div>
              <FacultyCardDesignPicker
                selectedStyle={activeStyleId}
                onSelect={(styleId) => handleSelectCardStyle(prof.user_id, styleId)}
                disabled={savingCardStyleForId === prof.user_id}
                monogram={initials}
              />
            </div>
          )}

          {/* Specialization & Bio */}
          {(prof.specialization || prof.bio || prof.batches_taught.length > 0) && (
            <div className="space-y-2">
              {prof.specialization && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#896ABD]/10 border border-[#896ABD]/25 text-xs font-medium text-[#5B3B96]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>{prof.specialization}</span>
                </div>
              )}
              {prof.bio && (
                <p className="text-xs sm:text-sm text-[#353430] leading-relaxed">
                  {prof.bio}
                </p>
              )}
              {prof.batches_taught.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#44433E] font-semibold">
                    Batches:
                  </span>
                  {prof.batches_taught.map((b) => (
                    <span
                      key={b}
                      className="px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-[#DDD8CE] font-mono-tabular text-[11px] text-[#353430]"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Crisp Contact Pill Bar (Email, Phone, Cabin — Zero Office Hours) */}
          <div className="pt-3 border-t border-[#E5E2DC] flex flex-wrap items-center gap-2 text-xs">
            <a
              href={`mailto:${prof.public_email}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] hover:border-[#E04F33] text-[#0A0A0C] hover:text-[#E04F33] transition-colors max-w-full"
            >
              <Mail className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
              <span className="truncate font-medium">{prof.public_email}</span>
            </a>
            {prof.public_phone && (
              <a
                href={`tel:${prof.public_phone}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] hover:border-[#896ABD] font-mono-tabular text-[#353430] hover:text-[#0A0A0C] transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                <span>{prof.public_phone}</span>
              </a>
            )}
            {prof.cabin_number && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] text-[#353430]">
                <MapPin className="w-3.5 h-3.5 text-[#E04F33] shrink-0" />
                <span>{prof.cabin_number}</span>
              </span>
            )}
          </div>

          {/* Courses Taught — Crisp Mini-Cards */}
          <div className="space-y-2.5 pt-1">
            <div className="font-mono-tabular text-xs uppercase tracking-wider text-[#353430] flex items-center gap-1.5 font-semibold">
              <BookOpen className="w-4 h-4 text-[#896ABD]" />
              <span>Courses Taught ({prof.courses.length})</span>
            </div>

            <div className="space-y-2.5">
              {prof.courses.map((c) => (
                <div
                  key={c.offering_id}
                  className="p-3.5 rounded-xl bg-[#FAF9F6]/90 border border-[#E5E2DC] hover:border-[#896ABD]/60 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-[#0A0A0C] text-white font-mono-tabular text-xs font-semibold">
                          {c.course_code}
                        </span>
                        <h3 className="font-semibold text-sm sm:text-base text-[#0A0A0C] leading-snug">
                          {c.course_name}
                        </h3>
                      </div>
                      <p className="text-xs text-[#353430] mt-1.5">
                        {c.programme} · Sem {c.semester} · {c.batch_year} · <span className="font-medium">{c.role_label}</span>
                      </p>
                    </div>

                    <Link
                      to={`/past-papers?q=${encodeURIComponent(c.course_code)}`}
                      className="px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#E04F33] hover:bg-[#E04F33] hover:text-white text-[#0A0A0C] text-xs font-semibold inline-flex items-center gap-1 transition-colors shrink-0 shadow-xs"
                    >
                      <span>Past Papers</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* Expanded Details: Co-Instructors & Public TA Contacts (Zero Time Strings) */}
                  {isExpanded && c.co_instructors.length > 0 && (
                    <div className="pt-2 border-t border-[#E5E2DC]/80 text-xs text-[#353430] flex items-center gap-1.5 flex-wrap">
                      <Users className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                      <span className="font-semibold text-[#0A0A0C]">Co-Teaching:</span>
                      <span>
                        {c.co_instructors
                          .map((co) => `${co.name} (${co.role_label})`)
                          .join(' · ')}
                      </span>
                    </div>
                  )}

                  {isExpanded && c.tas.length > 0 && (
                    <div className="pt-2 border-t border-[#E5E2DC]/80 space-y-2">
                      <div className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#353430] font-semibold">
                        Teaching Assistants
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {c.tas.map((ta) => (
                          <div
                            key={ta.id}
                            className="p-2.5 rounded-lg bg-white border border-[#E5E2DC] text-xs space-y-1"
                          >
                            <div className="font-semibold text-sm text-[#0A0A0C] truncate">
                              {ta.public_name}{' '}
                              <span className="font-mono-tabular text-[11px] font-semibold text-[#6F4EA8]">
                                · TA
                              </span>
                            </div>
                            {ta.public_batch && (
                              <div className="text-xs text-[#353430] truncate">
                                {ta.public_batch}
                              </div>
                            )}
                            <div className="flex flex-col gap-1 text-xs pt-0.5">
                              <a
                                href={`mailto:${ta.public_email}`}
                                className="inline-flex items-center gap-1.5 text-[#0A0A0C] hover:text-[#E04F33] truncate"
                              >
                                <Mail className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                                <span className="truncate">{ta.public_email}</span>
                              </a>
                              {ta.public_phone && (
                                <a
                                  href={`tel:${ta.public_phone}`}
                                  className="inline-flex items-center gap-1.5 font-mono-tabular text-[#353430] hover:text-[#0A0A0C]"
                                >
                                  <Phone className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
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

        </div>
      </article>
    );
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] selection:bg-[#E04F33] selection:text-white overflow-x-hidden">
      <ScrollProgressBar />

      {/* Unified Global Navigation Bar */}
      <GlobalNavbar />

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6">
        {bannerMsg && (
          <div
            className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between backdrop-blur-md border ${
              bannerMsg.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/35 text-rose-800 dark:text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {bannerMsg.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
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

        {/* Unified Editorial Command & Filter Console with Halo Artwork Backdrop */}
        <section className="relative overflow-hidden rounded-2xl bg-white/95 border border-[#DDD8CE] shadow-[0_6px_28px_rgba(10,10,12,0.05)]">
          {/* 3px Editorial Accent Hairline */}
          <div className="h-[3px] w-full bg-gradient-to-r from-[#E04F33] via-[#896ABD] to-transparent relative z-20" />

          {/* Soft Warm Wash + Delicate Constellation Vector Accent across Header */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                'radial-gradient(480px circle at 12% 18%, rgba(224,79,51,0.07), transparent 65%), radial-gradient(520px circle at 64% 10%, rgba(137,106,189,0.09), transparent 65%)',
            }}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 600 180"
            className="pointer-events-none select-none hidden md:block absolute top-0 right-56 w-[460px] h-44 z-[1] opacity-70"
          >
            <path
              d="M40 30 Q210 -10 380 80 T580 42"
              stroke="#896ABD"
              strokeOpacity="0.22"
              strokeWidth="1.1"
              fill="none"
            />
            <path
              d="M90 110 Q270 30 470 120"
              stroke="#E04F33"
              strokeOpacity="0.18"
              strokeWidth="1"
              strokeDasharray="4 4"
              fill="none"
            />
            <circle cx="220" cy="48" r="3" fill="#896ABD" fillOpacity="0.36" />
            <circle cx="380" cy="80" r="4" fill="#E04F33" fillOpacity="0.34" />
            <circle cx="470" cy="120" r="2.5" fill="#896ABD" fillOpacity="0.3" />
          </svg>

          {/* Dark-Shaded Constellation Artwork Strip with Halo Glow (Right Edge) */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none hidden sm:block absolute inset-y-0 right-0 w-72 md:w-96 overflow-hidden z-0"
            style={{
              maskImage: 'linear-gradient(to left, black 48%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to left, black 48%, transparent 100%)',
            }}
          >
            <div className="absolute inset-0 bg-[#12121A]" />
            <img
              src="/illustrations/network-abstract.jpg"
              alt=""
              className="w-full h-full object-cover opacity-80"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 78% 28%, rgba(137,106,189,0.44), transparent 56%), radial-gradient(circle at 58% 78%, rgba(224,79,51,0.34), transparent 58%), linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(18,18,26,0.56) 44%, rgba(18,18,26,0.32) 100%)',
              }}
            />
          </div>

          <div className="relative z-10 p-6 sm:p-8 space-y-6">
          <DimensionalTitleBlock
            dwgNo="JKLU-FAC-03"
            scope="FACULTY & TA DIRECTORY"
            cells={[
              { label: 'PROFILES', value: String(facultyList.length) },
              { label: 'COURSES', value: String(uniqueCoursesCount) },
            ]}
          />
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="font-mono-tabular text-xs uppercase tracking-wider text-[#E04F33] font-semibold">
                JKLU DIRECTORY · {facultyList.length} FACULTY · {uniqueCoursesCount} COURSES
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 text-[#0A0A0C]">
                Faculty
              </h1>
              <p className="text-sm sm:text-base text-[#353430] mt-1.5 max-w-2xl">
                Find professors, specialization areas, courses taught, and open any faculty card for full details &amp; TA contacts.
              </p>
            </div>

            {isProfessorOrAdmin ? (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={openMyProfileEditor}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#DDD8CE] bg-white/95 text-[#0A0A0C] hover:border-[#0A0A0C] shadow-sm transition-colors"
                >
                  <Edit3 className="w-4 h-4 text-[#896ABD]" />
                  <span>Edit My Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReleaseCourseModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#E04F33] text-white hover:opacity-95 shadow-sm transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                  <span>Release Classroom</span>
                </button>
              </div>
            ) : (
              <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#12121A]/90 text-[#F5F4F0] border border-white/15 shadow-[0_0_20px_rgba(137,106,189,0.35)] text-xs sm:text-sm font-mono-tabular shrink-0">
                <span>Quick search</span>
                <kbd className="px-2 py-0.5 rounded bg-white/15 border border-white/20 text-white text-xs">
                  ⌘K
                </kbd>
              </div>
            )}
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <Search className="w-5 h-5 text-[#896ABD] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search professor, TA, course code (CS1135), or batch..."
              className="w-full pl-12 pr-10 py-3.5 rounded-xl border border-[#DDD8CE] bg-white/95 text-[#0A0A0C] text-base shadow-xs focus:outline-none focus:border-[#896ABD] transition-[border-color]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#353430] hover:text-[#0A0A0C]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Programme & School Pill Filter Row (with Live Counts) */}
          <div className="pt-4 border-t border-[#E5E2DC] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono-tabular uppercase text-[#353430] font-semibold mr-1">
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
                        ? 'bg-[#0A0A0C] text-white border-[#0A0A0C]'
                        : `bg-white/95 border-[#DDD8CE] text-[#0A0A0C] hover:border-[#0A0A0C] ${
                            count === 0 ? 'opacity-55' : ''
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

            <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 border border-[#DDD8CE] shadow-sm">
              <span className="text-[11px] font-mono-tabular uppercase text-[#353430] font-semibold mr-1">
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
                        : `bg-white border-[#DDD8CE] text-[#0A0A0C] hover:border-[#E04F33] ${
                            count === 0 ? 'opacity-55' : ''
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
          </div>
        </section>

        {/* Error Banner with Retry */}
        {!loading && loadError && (
          <div className="px-4 py-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={fetchDirectory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 text-white font-semibold hover:bg-rose-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Interactive School Share Proportion Bar (shown in Network view or when filtering by School to keep default Overview clean) */}
        {!loading &&
        (viewMode === 'network' || selectedSchool !== 'ALL') &&
        (schoolCounts.IET || schoolCounts.IM || schoolCounts.ID) ? (
          <div className="px-5 py-4 rounded-2xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#A09F9A] font-medium">
                JKLU School Composition · Click to Filter
              </span>
              {selectedSchool !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedSchool('ALL')}
                  className="text-xs font-medium text-[#E04F33] hover:underline"
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

        {/* Compact Status Strip + Overview / All Details / Network Switch */}
        <div className="px-5 py-3.5 rounded-xl bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/10 flex flex-wrap items-center justify-between gap-3 text-sm">
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
            Loading JKLU Faculty Directory...
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

            {viewMode === 'overview' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
                {filteredFaculty.map(renderFacultyCard)}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {filteredFaculty.map(renderFacultyCard)}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal 1: Professor Profile Editor (Public vs Private Boundary) */}
      {showEditProfileModal && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="modal-panel-enter bg-[#FAF9F6] dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-[var(--shadow-elevated)]">
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
              {/* Public Faculty Portrait Uploader */}
              <div className="p-3.5 rounded-xl bg-white border border-[#DDD8CE] flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#12131C] text-white font-mono-tabular font-bold text-base flex items-center justify-center shrink-0 border border-[#DDD8CE]">
                    {myPhotoPreview ? (
                      <img
                        src={myPhotoPreview}
                        alt={myProfileForm.name || 'Faculty portrait'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (myProfileForm.name || user?.name || 'JK')
                        .replace(/^(Dr\.|Prof\.)\s*/i, '')
                        .trim()
                        .slice(0, 2)
                        .toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-[#0A0A0C]">
                      Public Faculty Photo
                    </div>
                    <p className="text-[11px] text-[#353430] mt-0.5">
                      JPG, PNG, or WebP — auto-cropped &amp; converted to lightweight WebP (&lt; 120 KB). Visible to everyone.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold cursor-pointer transition-colors">
                    <Camera className="w-3.5 h-3.5" />
                    <span>
                      {uploadingPhotoForId === Number(user?.id)
                        ? 'Uploading...'
                        : myPhotoPreview
                          ? 'Change Photo'
                          : 'Upload Photo'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (user?.id) handleUploadFacultyPhoto(Number(user.id), f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {myPhotoPreview && user?.id && (
                    <button
                      type="button"
                      onClick={() => handleRemoveFacultyPhoto(Number(user.id))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 font-semibold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Public Card Design Selector (Visual Mini-Card Samples) */}
              <div className="p-3.5 rounded-xl bg-white border border-[#DDD8CE] space-y-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-sm text-[#0A0A0C]">
                  <Palette className="w-4 h-4 text-[#896ABD]" />
                  <span>Faculty Card Design (Live Samples)</span>
                </div>
                <FacultyCardDesignPicker
                  selectedStyle={myCardStyle}
                  onSelect={(styleId) => user?.id && handleSelectCardStyle(Number(user.id), styleId)}
                  disabled={savingCardStyleForId === Number(user?.id)}
                  monogram={(myProfileForm.name || user?.name || 'JK')
                    .replace(/^(Dr\.|Prof\.)\s*/i, '')
                    .trim()
                    .slice(0, 2)
                    .toUpperCase()}
                />
              </div>

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
                    Public Email
                  </label>
                  <input
                    type="email"
                    value={myProfileForm.public_email}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, public_email: e.target.value })
                    }
                    placeholder="faculty@jklu.edu.in"
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
                    Specialization &amp; Research Areas (Public)
                  </label>
                  <input
                    type="text"
                    value={myProfileForm.specialization}
                    onChange={(e) =>
                      setMyProfileForm({ ...myProfileForm, specialization: e.target.value })
                    }
                    placeholder="Algorithms, Machine Learning, Database Systems"
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

      {/* Modal 1.5: Faculty Full Detail Modal (Opens when clicking any uniform card) */}
      {activeModalProf && (() => {
        const {
          initials,
          cardStyle,
          canEditCard,
          isUploadingThisPhoto,
        } = getFacultyCardMeta(activeModalProf);
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${activeModalProf.name} faculty details`}
            className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setSelectedFacultyModal(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="modal-panel-enter relative rounded-2xl border border-[#DDD8CE] bg-white max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-[var(--shadow-elevated)]"
            >
              <FacultyCardPatternArt
                styleId={cardStyle.id}
                accent={cardStyle.accentHex}
                secondary={cardStyle.secondaryHex}
              />

              <div className="relative z-10 p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      {activeModalProf.photo_path ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxPhoto({
                              src: activeModalProf.photo_path!,
                              name: activeModalProf.name,
                              designation: activeModalProf.designation,
                              school: activeModalProf.school,
                            })
                          }
                          className={`block w-20 h-20 rounded-2xl overflow-hidden ring-4 ${cardStyle.ringClass} hover:ring-[#E04F33]/50 shadow-sm cursor-zoom-in transition-[box-shadow,transform] duration-150 active:scale-[0.97]`}
                        >
                          <img
                            src={activeModalProf.photo_path}
                            alt={activeModalProf.name}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ) : (
                        <div
                          className={`w-20 h-20 rounded-2xl overflow-hidden ring-4 ${cardStyle.ringClass} shadow-sm flex items-center justify-center ${cardStyle.avatarBg}`}
                        >
                          <span className="font-mono-tabular font-bold text-xl text-white tracking-tight">
                            {initials}
                          </span>
                        </div>
                      )}
                      {canEditCard && (
                        <label
                          title="Upload or change faculty photo"
                          className={`absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-[#E04F33] hover:bg-[#0A0A0C] text-white flex items-center justify-center shadow-md ring-2 ring-white cursor-pointer transition-colors ${
                            isUploadingThisPhoto ? 'opacity-60 pointer-events-none' : ''
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              handleUploadFacultyPhoto(activeModalProf.user_id, f);
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0C]">
                          {activeModalProf.name}
                        </h2>
                        <span
                          className={`px-2.5 py-0.5 rounded-full border font-mono-tabular text-[10px] font-semibold uppercase tracking-wider ${cardStyle.badgeClass}`}
                        >
                          {activeModalProf.school}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#353430]">
                        {activeModalProf.designation}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {(activeModalProf.programmes || []).map((prog) => (
                          <span
                            key={prog}
                            className="px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-[#DDD8CE] font-mono-tabular text-[10px] font-semibold text-[#353430]"
                          >
                            {prog}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFacultyModal(null)}
                    className="p-2 rounded-xl border border-[#DDD8CE] bg-white hover:border-[#0A0A0C] text-[#353430] shrink-0"
                    aria-label="Close faculty details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Specialization, Bio & Batches */}
                {(activeModalProf.specialization ||
                  activeModalProf.bio ||
                  activeModalProf.batches_taught.length > 0) && (
                  <div className="space-y-3 p-4 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
                    {activeModalProf.specialization && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#896ABD]/10 border border-[#896ABD]/25 text-xs font-medium text-[#5B3B96]">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>{activeModalProf.specialization}</span>
                      </div>
                    )}
                    {activeModalProf.bio && (
                      <p className="text-sm text-[#353430] leading-relaxed">{activeModalProf.bio}</p>
                    )}
                    {activeModalProf.batches_taught.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#44433E] font-semibold">
                          Batches:
                        </span>
                        {activeModalProf.batches_taught.map((b) => (
                          <span
                            key={b}
                            className="px-2 py-0.5 rounded-md bg-white border border-[#DDD8CE] font-mono-tabular text-[11px] text-[#353430]"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Contacts (Zero Office Hours) */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={`mailto:${activeModalProf.public_email}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] hover:border-[#E04F33] text-[#0A0A0C] hover:text-[#E04F33] transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#896ABD]" />
                    <span className="font-medium">{activeModalProf.public_email}</span>
                  </a>
                  {activeModalProf.public_phone && (
                    <a
                      href={`tel:${activeModalProf.public_phone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] hover:border-[#896ABD] font-mono-tabular text-[#353430]"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#896ABD]" />
                      <span>{activeModalProf.public_phone}</span>
                    </a>
                  )}
                  {activeModalProf.cabin_number && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] text-[#353430]">
                      <MapPin className="w-3.5 h-3.5 text-[#E04F33]" />
                      <span>{activeModalProf.cabin_number}</span>
                    </span>
                  )}
                </div>

                {/* All Courses Taught + Co-Instructors + TAs */}
                <div className="space-y-3">
                  <div className="font-mono-tabular text-xs uppercase tracking-wider text-[#353430] flex items-center gap-1.5 font-semibold">
                    <BookOpen className="w-4 h-4 text-[#896ABD]" />
                    <span>Courses Taught ({activeModalProf.courses.length})</span>
                  </div>

                  {activeModalProf.courses.length === 0 ? (
                    <div className="p-4 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] text-xs text-[#5C5B57]">
                      No active course classrooms published yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeModalProf.courses.map((c) => (
                        <div
                          key={c.offering_id}
                          className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-[#0A0A0C] text-white font-mono-tabular text-xs font-semibold">
                                  {c.course_code}
                                </span>
                                <h3 className="font-semibold text-sm sm:text-base text-[#0A0A0C]">
                                  {c.course_name}
                                </h3>
                              </div>
                              <p className="text-xs text-[#353430] mt-1.5">
                                {c.programme} · Sem {c.semester} · {c.batch_year} ·{' '}
                                <span className="font-medium">{c.role_label}</span>
                              </p>
                            </div>
                            <Link
                              to={`/past-papers?q=${encodeURIComponent(c.course_code)}`}
                              className="px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#E04F33] hover:bg-[#E04F33] hover:text-white text-[#0A0A0C] text-xs font-semibold inline-flex items-center gap-1 transition-colors shrink-0"
                            >
                              <span>Past Papers</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>

                          {c.co_instructors.length > 0 && (
                            <div className="pt-2 border-t border-[#E5E2DC] text-xs text-[#353430] flex items-center gap-1.5 flex-wrap">
                              <Users className="w-3.5 h-3.5 text-[#896ABD]" />
                              <span className="font-semibold text-[#0A0A0C]">Co-Teaching:</span>
                              <span>
                                {c.co_instructors
                                  .map((co) => `${co.name} (${co.role_label})`)
                                  .join(' · ')}
                              </span>
                            </div>
                          )}

                          {c.tas.length > 0 && (
                            <div className="pt-2 border-t border-[#E5E2DC] space-y-2">
                              <div className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#353430] font-semibold">
                                Teaching Assistants
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {c.tas.map((ta) => (
                                  <div
                                    key={ta.id}
                                    className="p-2.5 rounded-lg bg-white border border-[#E5E2DC] text-xs space-y-1"
                                  >
                                    <div className="font-semibold text-sm text-[#0A0A0C]">
                                      {ta.public_name}{' '}
                                      <span className="font-mono-tabular text-[11px] font-semibold text-[#6F4EA8]">
                                        · TA
                                      </span>
                                    </div>
                                    {ta.public_batch && (
                                      <div className="text-xs text-[#353430]">{ta.public_batch}</div>
                                    )}
                                    <div className="flex flex-col gap-1 text-xs pt-0.5">
                                      <a
                                        href={`mailto:${ta.public_email}`}
                                        className="inline-flex items-center gap-1.5 text-[#0A0A0C] hover:text-[#E04F33] truncate"
                                      >
                                        <Mail className="w-3.5 h-3.5 text-[#896ABD]" />
                                        <span className="truncate">{ta.public_email}</span>
                                      </a>
                                      {ta.public_phone && (
                                        <a
                                          href={`tel:${ta.public_phone}`}
                                          className="inline-flex items-center gap-1.5 font-mono-tabular text-[#353430] hover:text-[#0A0A0C]"
                                        >
                                          <Phone className="w-3.5 h-3.5 text-[#896ABD]" />
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
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal 2: Unified Release New Course Offering Modal */}
      <ReleaseCourseModal
        isOpen={showReleaseCourseModal}
        onClose={() => setShowReleaseCourseModal(false)}
        isAdmin={Boolean(user?.is_admin || user?.admin_role === 'full_admin')}
        onSuccess={(data) => {
          setShowReleaseCourseModal(false);
          setBannerMsg({
            text: data?.message || 'Course classroom released & students enrolled!',
            type: 'success',
          });
          fetchDirectory();
          if (data?.offering?.id) {
            navigate(`/classroom/${data.offering.id}`);
          }
        }}
      />

      <div className="relative z-10">
        <FacultyPhotoLightbox
        photo={lightboxPhoto}
        onClose={() => setLightboxPhoto(null)}
      />

      <FacultyPhotoCropModal
        file={cropRequest?.file || null}
        onCancel={() => setCropRequest(null)}
        onSave={handleSaveCroppedPhoto}
      />

      <Footer />
      </div>
    </div>
  );
};

export default FacultyDirectoryPage;
