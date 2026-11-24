import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  IdCard,
  CheckCircle2,
  Upload,
  Edit2,
  X,
  AlertCircle,
  Phone,
  MapPin,
  GraduationCap,
  BookOpen,
  Lock,
  FileText,
  Save,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { sanitizeErrorMessage } from '@/utils/errorSanitizer';
import { API } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Toast from '@/components/ui/Toast';
import Loader from '@/components/ui/Loader';
import { ScrollProgressBar } from '@/components/animations/MotionPrimitives';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import Footer from '@/components/layout/Footer';
import { ProgressRing } from '@/components/viz/ProgressRing';
import { MetricBarHistogram } from '@/components/viz/MetricBarHistogram';
import { CHART_COLORS } from '@/components/viz/chartTokens';

const LazyActivityCalendar = lazy(() => import('@/components/viz/ActivityCalendar'));

const MAX_UPLOAD_BYTES = 500 * 1024; // 500 KB

type Me = {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
  admin_role?: string | null;
  is_professor?: boolean;
  is_ta?: boolean;
  ta_offering_ids?: number[];
  department?: string | null;
  year?: string | null;
  created_at?: string;
  roll_no?: string;
  student_id?: string;
  id_card_path?: string;
  id_verified?: boolean;
  admin_feedback?: {
    message?: string;
    rejected_at?: string;
    rejected_by?: number;
  } | null;
};

type FacultyFormState = {
  name: string;
  designation: string;
  school: string;
  programmes: string;
  batches_taught: string;
  public_email: string;
  public_phone: string;
  cabin_number: string;
  specialization: string;
  bio: string;
  private_faculty_notes: string;
  tcs_ion_faculty_id: string;
};

type TaughtCourse = {
  id: number;
  course_code: string;
  course_name: string;
  programme: string;
  semester: string;
  batch_year: string;
  section?: string;
  enrolled_count?: number;
  is_instructor?: boolean;
};

const EMPTY_FACULTY_FORM: FacultyFormState = {
  name: '',
  designation: 'Assistant Professor',
  school: 'IET',
  programmes: 'B.TECH',
  batches_taught: '',
  public_email: '',
  public_phone: '',
  cabin_number: '',
  specialization: '',
  bio: '',
  private_faculty_notes: '',
  tcs_ion_faculty_id: '',
};

function formatCommaList(val: unknown, fallback = ''): string {
  if (Array.isArray(val)) {
    return val.map((item) => String(item).trim()).filter(Boolean).join(', ');
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean).join(', ');
        }
      } catch {
        // fallback to raw string
      }
    }
    return trimmed;
  }
  return fallback;
}

function getMonogram(fullName?: string): string {
  const cleaned = String(fullName || '')
    .replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s*/i, '')
    .trim();
  if (!cleaned) return 'FA';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

const Profile: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { theme } = useTheme();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Student ID Card verification state
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idCardBlobUrl, setIdCardBlobUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [extra, setExtra] = useState({
    rollno: '',
    studentId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Faculty profile state
  const [facultyForm, setFacultyForm] = useState<FacultyFormState>(EMPTY_FACULTY_FORM);
  const [initialFacultyForm, setInitialFacultyForm] = useState<FacultyFormState>(EMPTY_FACULTY_FORM);
  const [taughtCourses, setTaughtCourses] = useState<TaughtCourse[]>([]);

  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
  });

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
    setToast({ show: true, message, type });

  const isProfessor = Boolean(
    user?.admin_role === 'professor' ||
      user?.is_professor ||
      me?.admin_role === 'professor' ||
      me?.is_professor
  );

  const isTa = Boolean(
    user?.is_ta ||
      me?.is_ta ||
      (user?.ta_offering_ids && user.ta_offering_ids.length > 0) ||
      (me?.ta_offering_ids && me.ta_offering_ids.length > 0)
  );

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const res = await API.getCurrentUser();
        if (!active) return;
        const data = res.data as Me;
        setMe(data);
        setExtra({
          rollno: data.roll_no || '',
          studentId: data.student_id || '',
        });

        const profRole = Boolean(
          data.admin_role === 'professor' ||
            data.is_professor ||
            user?.admin_role === 'professor' ||
            user?.is_professor
        );

        API.getMyActivity()
          .then((actRes) => {
            if (active) setActivity(actRes?.data || null);
          })
          .catch(() => {});

        if (profRole) {
          const [profRes, coursesRes] = await Promise.all([
            API.client.get('/faculty/me/profile'),
            API.client.get('/classroom/offerings'),
          ]);
          if (!active) return;

          const p = profRes.data || {};
          const populated: FacultyFormState = {
            name: p.name || data.name || '',
            designation: p.designation || 'Assistant Professor',
            school: p.school || 'IET',
            programmes: formatCommaList(p.programmes, 'B.TECH'),
            batches_taught: formatCommaList(p.batches_taught, ''),
            public_email: p.public_email || data.email || '',
            public_phone: p.public_phone || '',
            cabin_number: p.cabin_number || '',
            specialization: p.specialization || '',
            bio: p.bio || '',
            private_faculty_notes: p.private_faculty_notes || '',
            tcs_ion_faculty_id: p.tcs_ion_faculty_id || '',
          };
          setFacultyForm(populated);
          setInitialFacultyForm(populated);

          const items: TaughtCourse[] = (coursesRes.data?.items || []).filter(
            (item: TaughtCourse) => Boolean(item.is_instructor)
          );
          setTaughtCourses(items);
        }
      } catch (err: any) {
        if (!active) return;
        showToast(
          err?.response?.data?.detail || err?.message || 'Unable to load profile',
          'error'
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [token, user?.admin_role, user?.is_professor]);

  useEffect(() => {
    if (isProfessor || !me?.id_card_path) {
      setIdCardBlobUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    const base = me.id_card_path.split(/[\\/]/).pop() || me.id_card_path;
    API.client
      .get(`/uploads/${encodeURIComponent(base)}`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setIdCardBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!active) return;
        setIdCardBlobUrl(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isProfessor, me?.id_card_path]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_UPLOAD_BYTES) {
      showToast('File size must be 500 KB or less.', 'error');
      e.target.value = '';
      setIdFile(null);
      return;
    }
    setIdFile(file);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!extra.rollno || extra.rollno.trim() === '') {
      newErrors.rollno = 'Roll Number is required';
    }
    if (!extra.studentId || extra.studentId.trim() === '') {
      newErrors.studentId = 'Student ID is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (idFile && idFile.size > MAX_UPLOAD_BYTES) {
      showToast('File size must be 500 KB or less.', 'error');
      return;
    }

    setSaving(true);
    try {
      let updated: Me;

      await API.updateProfile({
        roll_no: extra.rollno || undefined,
        student_id: extra.studentId || undefined,
      });

      if (idFile) {
        const res = await API.uploadIdCard(idFile);
        updated = res.data;
      } else {
        const res = await API.getCurrentUser();
        updated = res.data;
      }

      localStorage.setItem('idVerified', updated.id_verified ? 'yes' : 'no');
      setMe(updated);
      setExtra({
        rollno: updated.roll_no || '',
        studentId: updated.student_id || '',
      });
      setIdFile(null);
      setErrors({});
      setIsEditing(false);
      await refreshUser();

      showToast(
        idFile
          ? 'Profile and ID submitted. Awaiting admin verification.'
          : 'Profile saved successfully!',
        'success'
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        !err?.response || (status !== undefined && status >= 500)
          ? 'Error'
          : sanitizeErrorMessage(err?.response?.data?.detail, 'Error');
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFacultyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyForm.name.trim()) {
      showToast('Full name is required.', 'error');
      return;
    }

    setSaving(true);
    try {
      await API.client.put('/faculty/me/profile', {
        ...facultyForm,
        office_hours: '',
      });
      setInitialFacultyForm({ ...facultyForm });
      setMe((prev) => (prev ? { ...prev, name: facultyForm.name.trim() } : prev));
      await refreshUser();
      showToast(
        'Faculty profile updated. Public details are live; private notes remain hidden.',
        'success'
      );
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to update faculty profile',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setErrors({});
    if (me) {
      setExtra({
        rollno: me.roll_no || '',
        studentId: me.student_id || '',
      });
    }
    setIdFile(null);
  };

  const inputClass = (hasError?: boolean) =>
    `w-full px-3.5 py-2.5 bg-[#FAF9F6] dark:bg-[#0A0A0C]/80 border rounded-xl text-sm text-[#0A0A0C] dark:text-[#F5F4F0] placeholder-[#5C5B57]/60 dark:placeholder-[#94938E]/60 focus:outline-none transition-[border-color] ${
      hasError
        ? 'border-red-500 focus:border-red-500'
        : 'border-[#E5E2DC] dark:border-white/15 focus:border-[#896ABD] dark:focus:border-[#C084FC]'
    }`;

  const previewProgrammes = facultyForm.programmes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const previewBatches = facultyForm.batches_taught
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const hasFacultyChanges =
    JSON.stringify(facultyForm) !== JSON.stringify(initialFacultyForm);

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] selection:bg-[#E04F33] selection:text-white overflow-x-hidden pt-[env(safe-area-inset-top)]">
      <ScrollProgressBar />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.show}
        onClose={() => setToast({ ...toast, show: false })}
      />

      <GlobalNavbar />

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader />
          </div>
        ) : isProfessor ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Editorial Faculty Header */}
            <header className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#E04F33] font-semibold">
                    Faculty Profile
                  </span>
                  <span className="text-[#E5E2DC] dark:text-white/20">·</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    JKLU Verified Educator
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                  {facultyForm.name || me?.name || user?.name}
                </h1>
                <p className="text-xs sm:text-sm text-[#5C5B57] dark:text-[#A09F9A]">
                  {facultyForm.designation || 'Faculty'}
                  {facultyForm.school ? ` · School of ${facultyForm.school}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  to="/classroom"
                  className="px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#E04F33]/60 text-xs font-medium inline-flex items-center gap-1.5 transition-[border-color]"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#E04F33]" />
                  <span>My Classrooms</span>
                </Link>
                <Link
                  to="/faculty"
                  className="px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#896ABD]/60 text-xs font-medium inline-flex items-center gap-1.5 transition-[border-color]"
                >
                  <GraduationCap className="w-3.5 h-3.5 text-[#896ABD]" />
                  <span>Faculty Directory</span>
                </Link>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Live Directory Card Preview + Active Courses Taught */}
              <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-24">
                <section className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] font-mono-tabular font-semibold text-sm flex items-center justify-center shrink-0">
                      {getMonogram(facultyForm.name || me?.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold tracking-tight truncate">
                          {facultyForm.name || me?.name}
                        </h2>
                        {facultyForm.school && (
                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] uppercase bg-black/[0.05] dark:bg-white/[0.08] text-[#5C5B57] dark:text-[#C4C3BE]">
                            {facultyForm.school}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-0.5">
                        {facultyForm.designation}
                      </p>
                    </div>
                  </div>

                  {/* Public Contact Strip (No time/office-hours strings) */}
                  <div className="space-y-2 pt-3 border-t border-[#E5E2DC]/70 dark:border-white/10 text-xs">
                    {facultyForm.public_email && (
                      <div className="flex items-center gap-2 text-[#5C5B57] dark:text-[#C4C3BE]">
                        <Mail className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                        <span className="truncate">{facultyForm.public_email}</span>
                      </div>
                    )}
                    {facultyForm.public_phone && (
                      <div className="flex items-center gap-2 text-[#5C5B57] dark:text-[#C4C3BE]">
                        <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-mono-tabular">{facultyForm.public_phone}</span>
                      </div>
                    )}
                    {facultyForm.cabin_number && (
                      <div className="flex items-center gap-2 text-[#5C5B57] dark:text-[#C4C3BE]">
                        <MapPin className="w-3.5 h-3.5 text-[#E04F33] shrink-0" />
                        <span>{facultyForm.cabin_number}</span>
                      </div>
                    )}
                  </div>

                  {/* Programmes & Batches */}
                  {(previewProgrammes.length > 0 || previewBatches.length > 0) && (
                    <div className="space-y-2.5 pt-3 border-t border-[#E5E2DC]/70 dark:border-white/10">
                      {previewProgrammes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {previewProgrammes.map((prog) => (
                            <span
                              key={prog}
                              className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-[#0A0A0C]/[0.05] dark:bg-white/[0.08] text-[#0A0A0C] dark:text-[#F5F4F0]"
                            >
                              {prog}
                            </span>
                          ))}
                        </div>
                      )}
                      {previewBatches.length > 0 && (
                        <p className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                          Batches: {previewBatches.join(' · ')}
                        </p>
                      )}
                    </div>
                  )}

                  {facultyForm.specialization && (
                    <div className="pt-3 border-t border-[#E5E2DC]/70 dark:border-white/10">
                      <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88] block mb-1">
                        Specialization
                      </span>
                      <p className="text-xs text-[#0A0A0C] dark:text-[#E2E0DC] leading-relaxed">
                        {facultyForm.specialization}
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-[#5C5B57] dark:text-[#8E8D88] pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10 leading-relaxed">
                    Public academic details appear on the Faculty &amp; TA Directory and inside your course classrooms.
                  </p>
                </section>

                {/* Active Courses Taught */}
                <section className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E] font-semibold">
                      Courses Taught
                    </h3>
                    <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] bg-black/[0.05] dark:bg-white/[0.08]">
                      {taughtCourses.length}
                    </span>
                  </div>

                  {taughtCourses.length === 0 ? (
                    <div className="space-y-2.5 text-xs text-[#5C5B57] dark:text-[#A09F9A]">
                      <p>No active courses assigned to your faculty account yet.</p>
                      <Link
                        to="/faculty"
                        className="inline-flex items-center gap-1.5 font-medium text-[#E04F33] hover:underline"
                      >
                        <span>Release a Course in Faculty Directory</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#E5E2DC]/70 dark:divide-white/10">
                      {taughtCourses.map((course) => (
                        <div key={course.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]">
                              {course.course_code}
                            </span>
                            <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                              {course.programme} · Sem {course.semester}
                            </span>
                          </div>
                          <div className="text-sm font-medium leading-snug">
                            {course.course_name}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5">
                            <Link
                              to={`/classroom/${course.id}`}
                              className="font-medium text-[#E04F33] hover:underline inline-flex items-center gap-1"
                            >
                              <span>Open Classroom</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                            <Link
                              to={`/past-papers?q=${encodeURIComponent(course.course_code)}`}
                              className="text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#0A0A0C] dark:hover:text-white inline-flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Past Papers</span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Right Column: Editable Public Academic Profile + Private Faculty Records */}
              <form onSubmit={handleSaveFacultyProfile} className="lg:col-span-8 space-y-5">
                {/* Section 1: Public Academic Profile */}
                <section className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E2DC]/70 dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-4 h-4 text-[#896ABD]" />
                      <h2 className="text-base font-semibold tracking-tight">
                        Public Academic Profile
                      </h2>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                      Visible to Students
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={facultyForm.name}
                        onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                        placeholder="Dr. Rajesh Sharma"
                        className={inputClass()}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Designation
                      </label>
                      <input
                        type="text"
                        value={facultyForm.designation}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, designation: e.target.value })
                        }
                        placeholder="Professor & HOD (CSE)"
                        className={inputClass()}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        School
                      </label>
                      <select
                        value={facultyForm.school}
                        onChange={(e) => setFacultyForm({ ...facultyForm, school: e.target.value })}
                        className={inputClass()}
                      >
                        <option value="IET">IET — School of Engineering &amp; Tech</option>
                        <option value="IM">IM — School of Management</option>
                        <option value="ID">ID — Institute of Design</option>
                        <option value="GENERAL">GENERAL — Interdisciplinary</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Cabin / Room
                      </label>
                      <input
                        type="text"
                        value={facultyForm.cabin_number}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, cabin_number: e.target.value })
                        }
                        placeholder="IET Academic Block — Cabin 204"
                        className={inputClass()}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Public Email
                      </label>
                      <input
                        type="email"
                        value={facultyForm.public_email}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, public_email: e.target.value })
                        }
                        placeholder="faculty@jklu.edu.in"
                        className={inputClass()}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Public Contact Phone
                      </label>
                      <input
                        type="text"
                        value={facultyForm.public_phone}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, public_phone: e.target.value })
                        }
                        placeholder="+91-98290-11201"
                        className={inputClass()}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Programmes Taught (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={facultyForm.programmes}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, programmes: e.target.value })
                        }
                        placeholder="B.TECH, M.TECH, BCA"
                        className={inputClass()}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Batches Taught (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={facultyForm.batches_taught}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, batches_taught: e.target.value })
                        }
                        placeholder="B.Tech 2024-2028, M.Tech 2025-2027"
                        className={inputClass()}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                      Specialization &amp; Research Areas
                    </label>
                    <input
                      type="text"
                      value={facultyForm.specialization}
                      onChange={(e) =>
                        setFacultyForm({ ...facultyForm, specialization: e.target.value })
                      }
                      placeholder="Distributed Systems, Graph Algorithms, Database Internals"
                      className={inputClass()}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                      Short Academic Bio
                    </label>
                    <textarea
                      rows={3}
                      value={facultyForm.bio}
                      onChange={(e) => setFacultyForm({ ...facultyForm, bio: e.target.value })}
                      placeholder="Brief overview of courses taught and academic focus..."
                      className={inputClass()}
                    />
                  </div>
                </section>

                {/* Section 2: Private Faculty Records */}
                <section className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E2DC]/70 dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-[#896ABD]" />
                      <h2 className="text-base font-semibold tracking-tight">
                        Private Faculty Records
                      </h2>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#896ABD]/10 border border-[#896ABD]/25 text-[#896ABD] dark:text-[#C084FC]">
                      <Lock className="w-3 h-3" />
                      Private · Hidden from Students
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        TCS iON Faculty ID
                      </label>
                      <input
                        type="text"
                        value={facultyForm.tcs_ion_faculty_id}
                        onChange={(e) =>
                          setFacultyForm({ ...facultyForm, tcs_ion_faculty_id: e.target.value })
                        }
                        placeholder="JKLU-FAC-2026-01"
                        className={`${inputClass()} font-mono-tabular`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#94938E]">
                        Private Faculty Notes (never exposed in public directory)
                      </label>
                      <textarea
                        rows={3}
                        value={facultyForm.private_faculty_notes}
                        onChange={(e) =>
                          setFacultyForm({
                            ...facultyForm,
                            private_faculty_notes: e.target.value,
                          })
                        }
                        placeholder="Syllabus drafts, grading notes, or private reminders..."
                        className={inputClass()}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E5E2DC]/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-[#5C5B57] dark:text-[#8E8D88]">
                      {hasFacultyChanges
                        ? 'Unsaved edits in your faculty profile'
                        : 'All faculty profile details synced'}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={!hasFacultyChanges || saving}
                        onClick={() => setFacultyForm({ ...initialFacultyForm })}
                        className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 text-xs font-medium inline-flex items-center gap-1.5 hover:border-[#0A0A0C] dark:hover:border-white/40 disabled:opacity-40 transition-[border-color]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-opacity disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{saving ? 'Saving Profile...' : 'Save Faculty Profile'}</span>
                      </button>
                    </div>
                  </div>
                </section>
              </form>
            </div>

            {/* Faculty Teaching Load Histogram & Activity Calendar */}
            {activity && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <section className="lg:col-span-5 rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#E04F33] font-semibold">
                        Course Load
                      </span>
                      <h3 className="text-base font-semibold mt-0.5">
                        Enrolled Cohort per Course
                      </h3>
                      <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A] mt-0.5">
                        Click any bar to open that course classroom.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                      {(activity.teaching || []).length} courses
                    </span>
                  </div>

                  {Array.isArray(activity.teaching) && activity.teaching.length > 0 ? (
                    <MetricBarHistogram
                      items={activity.teaching.map((t: any) => ({
                        id: String(t.offering_id),
                        label: String(t.course_code),
                        value: Number(t.students || 0),
                        sublabel: `${Number(t.assignments || 0)} tasks · ${Number(t.pending_grading || 0)} ungraded`,
                        color:
                          Number(t.pending_grading || 0) > 0
                            ? CHART_COLORS.vermilion
                            : CHART_COLORS.lavender,
                      }))}
                      onSelect={(id) => navigate(`/classroom/${id}`)}
                      unitLabel="students"
                      ariaLabel="Faculty teaching load by enrolled students"
                    />
                  ) : (
                    <p className="text-xs text-[#5C5B57] dark:text-[#A09F9A]">
                      No active course offerings assigned yet.
                    </p>
                  )}
                </section>

                <section className="lg:col-span-7 rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#896ABD] font-semibold">
                        Activity Matrix
                      </span>
                      <h3 className="text-base font-semibold mt-0.5">
                        Academic Teaching &amp; Archive Activity
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                      <span>{Number(activity.totals?.announcements || 0)} announcements</span>
                      <span>·</span>
                      <span>{Number(activity.totals?.grades || 0)} grades</span>
                    </div>
                  </div>
                  <Suspense
                    fallback={
                      <div className="h-[190px] rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/60 animate-pulse" />
                    }
                  >
                    <LazyActivityCalendar
                      from={activity.from}
                      to={activity.to}
                      data={Array.isArray(activity.days) ? activity.days : []}
                      ariaLabel="Faculty 6-month activity calendar"
                    />
                  </Suspense>
                </section>
              </div>
            )}
          </motion.div>
        ) : me && me.id_verified ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {isTa && (
              <div className="px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  Course TA · Your personal student profile &amp; ID verification remain isolated from your public Course TA contact card.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
              {/* Left Side - ID Card */}
              <div className="lg:col-span-4">
                <div className="rounded-2xl p-5 sm:p-6 bg-white/90 dark:bg-[#111117]/90 backdrop-blur-md border border-[#E5E2DC] dark:border-white/10 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <IdCard className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-semibold">University ID Card</h3>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>

                  {me.id_card_path && idCardBlobUrl ? (
                    me.id_card_path.toLowerCase().endsWith('.pdf') ? (
                      <div className="w-full h-56 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex flex-col items-center justify-center gap-2">
                        <IdCard className="w-12 h-12 text-[#896ABD]" />
                        <p className="text-xs font-medium text-[#5C5B57] dark:text-[#94938E]">PDF Document</p>
                        <a
                          href={idCardBlobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#896ABD] dark:text-[#C084FC] hover:underline"
                        >
                          View PDF
                        </a>
                      </div>
                    ) : (
                      <img
                        src={idCardBlobUrl}
                        alt="ID Card"
                        className="w-full rounded-xl object-cover border border-[#E5E2DC] dark:border-white/10"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )
                  ) : (
                    <div className="w-full h-56 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex items-center justify-center">
                      <IdCard className="w-12 h-12 text-[#5C5B57]" />
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side - Profile Details */}
              <div className="lg:col-span-8">
                <div className="rounded-2xl p-5 sm:p-6 bg-white/90 dark:bg-[#111117]/90 backdrop-blur-md border border-[#E5E2DC] dark:border-white/10 shadow-sm space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold tracking-tight">Profile Details</h2>
                        <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">Verified student account</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified
                      </span>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setErrors({});
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <form onSubmit={handleSave} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Edit Academic Info</h3>
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="p-1.5 rounded-lg text-[#5C5B57] hover:bg-[#FAF9F6] dark:hover:bg-[#18181F]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                            Roll Number *
                          </label>
                          <input
                            value={extra.rollno}
                            onChange={(e) => setExtra({ ...extra, rollno: e.target.value })}
                            placeholder="eg. 20XXBtech123"
                            required
                            className={inputClass(Boolean(errors.rollno))}
                          />
                          {errors.rollno && <p className="text-xs text-red-500">{errors.rollno}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                            Student ID *
                          </label>
                          <input
                            value={extra.studentId}
                            onChange={(e) => setExtra({ ...extra, studentId: e.target.value })}
                            required
                            className={inputClass(Boolean(errors.studentId))}
                          />
                          {errors.studentId && <p className="text-xs text-red-500">{errors.studentId}</p>}
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="flex-1 py-2.5 px-4 rounded-xl border border-[#E5E2DC] dark:border-white/15 text-sm font-medium hover:bg-[#FAF9F6] dark:hover:bg-[#18181F]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-[#E04F33] text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex items-center gap-3">
                        <User className="w-4 h-4 text-[#896ABD] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">Full Name</p>
                          <p className="text-sm font-semibold truncate">{me.name}</p>
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex items-center gap-3">
                        <Mail className="w-4 h-4 text-[#896ABD] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">Email</p>
                          <p className="text-sm font-semibold break-all">{me.email}</p>
                        </div>
                      </div>
                      {extra.rollno && (
                        <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10">
                          <p className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">Roll Number</p>
                          <p className="text-sm font-semibold mt-0.5">{extra.rollno}</p>
                        </div>
                      )}
                      {extra.studentId && (
                        <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10">
                          <p className="text-[11px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">Student ID</p>
                          <p className="text-sm font-semibold mt-0.5">{extra.studentId}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : me ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {isTa && (
              <div className="px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  Course TA · Your personal student profile &amp; ID verification remain isolated from your public Course TA contact card.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {/* Account Summary */}
              <div className="rounded-2xl p-5 sm:p-6 bg-white/90 dark:bg-[#111117]/90 backdrop-blur-md border border-[#E5E2DC] dark:border-white/10 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#896ABD]/15 text-[#896ABD] dark:text-[#C084FC]">
                    <User className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold tracking-tight">Your Details</h2>
                </div>

                <div className="space-y-2.5 text-sm">
                  <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex items-center gap-2.5">
                    <User className="w-4 h-4 text-[#896ABD] shrink-0" />
                    <span className="font-semibold truncate">{me.name}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#896ABD] shrink-0" />
                    <span className="break-all text-xs sm:text-sm">{me.email}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10 flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs sm:text-sm font-medium">
                      ID verification: <span className="text-amber-600 dark:text-amber-400">Not verified</span>
                    </span>
                  </div>
                </div>

                {!me.id_verified && me.admin_feedback && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-400 space-y-1">
                    <p className="font-semibold">Profile Rejection Feedback</p>
                    <p>{me.admin_feedback.message || 'Your profile was rejected. Please review and resubmit.'}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10">
                    <span className="text-[10px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E] block">Roll No</span>
                    <span className="font-semibold">{extra.rollno || '-'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/70 border border-[#E5E2DC] dark:border-white/10">
                    <span className="text-[10px] font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E] block">Student ID</span>
                    <span className="font-semibold">{extra.studentId || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Upload ID Card & Edit Form */}
              <form
                onSubmit={handleSave}
                className="rounded-2xl p-5 sm:p-6 bg-white/90 dark:bg-[#111117]/90 backdrop-blur-md border border-[#E5E2DC] dark:border-white/10 shadow-sm space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]">
                    <IdCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Upload ID Card</h2>
                    <p className="text-xs font-mono-tabular text-[#5C5B57] dark:text-[#94938E]">MAX 500 KB · JPG, PNG, PDF</p>
                  </div>
                </div>

                <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
                  Upload a clear photo of your university ID to unlock paper uploads.
                </p>

                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 bg-[#FAF9F6] dark:bg-[#0A0A0C]/80 border border-[#E5E2DC] dark:border-white/15 rounded-xl text-xs sm:text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#896ABD]/15 file:text-[#896ABD] dark:file:text-[#C084FC] cursor-pointer"
                />
                {idFile && (
                  <p className="text-xs font-mono-tabular text-[#5C5B57] dark:text-[#94938E]">
                    {idFile.name} ({(idFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                      Roll Number *
                    </label>
                    <input
                      value={extra.rollno}
                      onChange={(e) => setExtra({ ...extra, rollno: e.target.value })}
                      placeholder="eg. 20XXBtech123"
                      required
                      className={inputClass(Boolean(errors.rollno))}
                    />
                    {errors.rollno && <p className="text-xs text-red-500">{errors.rollno}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono-tabular uppercase text-[#5C5B57] dark:text-[#94938E]">
                      Student ID *
                    </label>
                    <input
                      value={extra.studentId}
                      onChange={(e) => setExtra({ ...extra, studentId: e.target.value })}
                      required
                      className={inputClass(Boolean(errors.studentId))}
                    />
                    {errors.studentId && <p className="text-xs text-red-500">{errors.studentId}</p>}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 px-4 rounded-xl bg-[#E04F33] text-white text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Profile'}</span>
                </button>
              </form>
            </div>
          </motion.div>
        ) : null}

        {/* Student Personal Coverage Summary & Activity Calendar */}
        {!loading && !isProfessor && me && activity && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-6"
          >
            <div className="lg:col-span-5 rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-sm space-y-5">
              <div>
                <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#E04F33] font-semibold">
                  Personal Telemetry
                </span>
                <h3 className="text-base font-semibold mt-0.5">
                  Academic Coverage Summary
                </h3>
              </div>

              {(() => {
                const summary = activity.summary || {};
                const asgnTotal = Number(summary.assignments_total || 0);
                const asgnDone = Number(summary.assignments_submitted || 0);
                const completionPct =
                  asgnTotal > 0 ? Math.round((asgnDone / asgnTotal) * 100) : null;
                return (
                  <ProgressRing
                    value={completionPct}
                    label="Classroom Assignments"
                    sublabel={
                      asgnTotal > 0
                        ? `${asgnDone} of ${asgnTotal} submitted across courses`
                        : 'No assignments assigned yet'
                    }
                    accentColor={CHART_COLORS.emerald}
                    emptyText="—"
                  />
                );
              })()}

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10">
                <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                  <div className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                    Papers Uploaded
                  </div>
                  <div className="text-lg font-mono-tabular font-semibold mt-0.5">
                    {Number(activity.summary?.papers_uploaded || 0)}
                  </div>
                  <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                    {Number(activity.summary?.papers_approved || 0)} approved ·{' '}
                    {Number(activity.summary?.papers_pending || 0)} pending
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                  <div className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                    Enrolled Classrooms
                  </div>
                  <div className="text-lg font-mono-tabular font-semibold mt-0.5">
                    {Number(activity.summary?.enrolled_courses || 0)}
                  </div>
                  <Link
                    to="/classroom"
                    className="text-[10px] font-mono-tabular text-[#896ABD] hover:underline"
                  >
                    Open Classrooms →
                  </Link>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#896ABD] font-semibold">
                    6-Month Activity
                  </span>
                  <h3 className="text-base font-semibold mt-0.5">
                    Archive Uploads &amp; Classroom Submissions
                  </h3>
                </div>
                <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                  {Number(activity.totals?.uploads || 0)} uploads ·{' '}
                  {Number(activity.totals?.submissions || 0)} submissions
                </span>
              </div>
              <Suspense
                fallback={
                  <div className="h-[190px] rounded-xl bg-[#FAF9F6] dark:bg-[#0A0A0C]/60 animate-pulse" />
                }
              >
                <LazyActivityCalendar
                  from={activity.from}
                  to={activity.to}
                  data={Array.isArray(activity.days) ? activity.days : []}
                  ariaLabel="Student 6-month academic activity calendar"
                />
              </Suspense>
            </div>
          </motion.section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Profile;
