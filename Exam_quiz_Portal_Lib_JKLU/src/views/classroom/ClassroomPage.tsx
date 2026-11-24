import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen,
  MessageSquare,
  FileCheck2,
  Users,
  Award,
  UploadCloud,
  Link2,
  ExternalLink,
  CheckCircle2,
  Pin,
  Send,
  Plus,
  Download,
  FileSpreadsheet,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  UserPlus,
  GraduationCap,
  FileText,
  Copy,
  Check,
  X,
  User,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { API } from '@/utils/api';
import {
  uploadFileToStudentGoogleDrive,
  validateSubmissionLink,
  isGoogleDriveOAuthConfigured,
} from '@/utils/googleDriveSubmit';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollProgressBar } from '@/components/animations/MotionPrimitives';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import Footer from '@/components/layout/Footer';
import { ProgressRing } from '@/components/viz/ProgressRing';
import { Sparkline } from '@/components/viz/Sparkline';
import { MetricBarHistogram } from '@/components/viz/MetricBarHistogram';
import { ConfettiBurst } from '@/components/viz/ConfettiBurst';
import { CHART_COLORS, usePrefersReducedMotion } from '@/components/viz/chartTokens';
import { safeExternalUrl } from '@/utils/safeUrl';

const cardSurface =
  'rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/90 dark:bg-[#111117]/85 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]';

const inputSurface =
  'w-full px-3.5 py-2 rounded-xl text-xs bg-[#FAF9F6] dark:bg-[#0A0A0C]/80 border border-[#E5E2DC] dark:border-white/15 text-[#0A0A0C] dark:text-[#F5F4F0] placeholder-[#5C5B57]/60 dark:placeholder-[#94938E]/60 focus:outline-none focus:border-[#896ABD] dark:focus:border-[#C084FC] transition-[border-color]';

const ClassroomPage: React.FC = () => {
  const { offeringId } = useParams<{ offeringId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [offerings, setOfferings] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(offeringId ? Number(offeringId) : null);
  const [workspace, setWorkspace] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [submitCelebrationKey, setSubmitCelebrationKey] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stream' | 'classwork' | 'people' | 'tcs_gradebook'>('stream');
  const reducedMotion = usePrefersReducedMotion();
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    setToast({ text, type });
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);
  const [regeneratingJoinCode, setRegeneratingJoinCode] = useState(false);

  // Request sequencing & AbortController refs to prevent stale course switching races
  const workspaceSeqRef = useRef(0);
  const workspaceAbortRef = useRef<AbortController | null>(null);

  // Join by elective code
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Stream: New announcement & comments
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annDriveUrl, setAnnDriveUrl] = useState('');
  const [annPinned, setAnnPinned] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});

  // Classwork: Create Assignment or TCS iON Quiz
  const [showNewAssignmentModal, setShowNewAssignmentModal] = useState(false);
  const [asgnForm, setAsgnForm] = useState({
    title: '',
    description: '',
    topic_module: '',
    assignment_type: 'ASSIGNMENT',
    resource_url: '',
    tcs_ion_launch_url: '',
    tcs_ion_exam_code: '',
    max_marks: '100',
  });

  // Zero-DB-Storage Submission Modal (Google Drive Auto-Upload vs Direct Link)
  const [submittingAssignment, setSubmittingAssignment] = useState<any | null>(null);
  const [submitMode, setSubmitMode] = useState<'GOOGLE_DRIVE_AUTO' | 'DIRECT_LINK'>(
    isGoogleDriveOAuthConfigured() ? 'GOOGLE_DRIVE_AUTO' : 'DIRECT_LINK'
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ stage: string; pct: number } | null>(null);
  const [directLinkUrl, setDirectLinkUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // People Tab: Add Co-Professor or Public TA
  const [coProfEmail, setCoProfEmail] = useState('');
  const [coProfRole, setCoProfRole] = useState('Co-Instructor (Sec B)');
  const [newTaForm, setNewTaForm] = useState({
    public_name: '',
    public_email: '',
    public_phone: '',
    public_batch: 'B.Tech CSE Year 4',
    lab_hours: '',
  });

  // Gradebook & TCS iON Bridge
  const [gradingSub, setGradingSub] = useState<any | null>(null);
  const [gradeMarks, setGradeMarks] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [tcsCsvText, setTcsCsvText] = useState('');

  const isProfessorOrAdmin = Boolean(
    user && (user.admin_role === 'professor' || user.is_professor || user.is_admin)
  );

  const loadOfferingsList = async () => {
    if (!user) {
      setOfferings([]);
      setWorkspace(null);
      setLoading(false);
      return;
    }
    try {
      const res = await API.client.get('/classroom/offerings');
      const list = res.data?.items || [];
      setOfferings(list);
      const targetId = offeringId ? Number(offeringId) : activeId || list[0]?.id || null;
      if (targetId) {
        setActiveId(targetId);
        await loadWorkspace(targetId);
      } else {
        setWorkspace(null);
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load classroom offerings:', err);
      setOfferings([]);
      setWorkspace(null);
      setLoading(false);
    }
  };

  const loadWorkspace = async (id: number) => {
    workspaceAbortRef.current?.abort();
    const controller = new AbortController();
    workspaceAbortRef.current = controller;
    const seq = ++workspaceSeqRef.current;

    setLoading(true);
    setAnalytics(null);
    try {
      const res = await API.client.get(`/classroom/offerings/${id}`, {
        signal: controller.signal,
      });
      if (seq !== workspaceSeqRef.current) return;
      setWorkspace(res.data);
      const p = res.data?.permissions;
      if (p?.can_grade || p?.can_manage_course) {
        API.getClassroomAnalytics(id)
          .then((aRes) => {
            if (seq === workspaceSeqRef.current) {
              setAnalytics(aRes?.data || null);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      if (controller.signal.aborted || seq !== workspaceSeqRef.current) return;
      console.error('Failed to load classroom workspace:', err);
      setWorkspace(null);
      showToast(
        err?.response?.data?.detail ||
          err?.message ||
          'You do not have access to this course classroom.',
        'error'
      );
    } finally {
      if (seq === workspaceSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadOfferingsList();
    return () => {
      workspaceAbortRef.current?.abort();
    };
  }, [offeringId, user?.id]);

  const handleSelectOffering = (id: number) => {
    setActiveId(id);
    navigate(`/classroom/${id}`);
  };

  const handleCopyJoinCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedJoinCode(true);
      showToast(`Copied elective join code ${code}`, 'success');
      setTimeout(() => setCopiedJoinCode(false), 2000);
    } catch {
      showToast(`Elective join code: ${code}`, 'success');
    }
  };

  const handleRegenerateJoinCode = async () => {
    if (!activeId || regeneratingJoinCode) return;
    setRegeneratingJoinCode(true);
    try {
      const res = await API.client.post(
        `/classroom/offerings/${activeId}/regenerate-join-code`
      );
      const newCode = res.data?.join_code;
      if (newCode) {
        setWorkspace((prev: any) =>
          prev
            ? {
                ...prev,
                offering: { ...prev.offering, join_code: newCode },
              }
            : prev
        );
        setOfferings((prev) =>
          prev.map((item) =>
            Number(item.id) === Number(activeId) ? { ...item, join_code: newCode } : item
          )
        );
        setCopiedJoinCode(false);
        showToast(`Generated new random join code: ${newCode}`, 'success');
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to regenerate join code',
        'error'
      );
    } finally {
      setRegeneratingJoinCode(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      const res = await API.client.post('/classroom/offerings/join-code', {
        join_code: joinCodeInput,
      });
      showToast(res.data?.message || 'Joined course classroom!', 'success');
      setJoinCodeInput('');
      await loadOfferingsList();
      if (res.data?.offering_id) {
        handleSelectOffering(res.data.offering_id);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Invalid join code', 'error');
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !annContent.trim()) return;
    try {
      const attachments = annDriveUrl.trim()
        ? [{ label: 'Attached Google Drive Resource', url: annDriveUrl.trim(), type: 'DRIVE' }]
        : [];
      await API.client.post(`/classroom/offerings/${activeId}/announcements`, {
        title: annTitle,
        content: annContent,
        attachment_urls: attachments,
        is_pinned: annPinned,
      });
      setAnnTitle('');
      setAnnContent('');
      setAnnDriveUrl('');
      setAnnPinned(false);
      showToast('Announcement posted to course stream!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to post announcement', 'error');
    }
  };

  const handlePostComment = async (announcementId: number) => {
    const text = (commentInputs[announcementId] || '').trim();
    if (!text || !activeId) return;
    try {
      await API.client.post(`/classroom/announcements/${announcementId}/comments`, {
        content: text,
      });
      setCommentInputs((prev) => ({ ...prev, [announcementId]: '' }));
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail ||
          err?.message ||
          'Please sign in with your JKLU account to comment on class announcements.',
        'error'
      );
    }
  };

  const handleToggleVerifyComment = async (commentId: number) => {
    if (!activeId) return;
    try {
      await API.client.patch(`/classroom/comments/${commentId}/verify`);
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail ||
          err?.message ||
          'Only course faculty or TAs can verify answers',
        'error'
      );
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) return;
    try {
      const links = asgnForm.resource_url.trim()
        ? [{ label: 'Problem Sheet / Reference Link', url: asgnForm.resource_url.trim() }]
        : [];
      const res = await API.client.post(`/classroom/offerings/${activeId}/assignments`, {
        ...asgnForm,
        resource_links: links,
        max_marks: Number(asgnForm.max_marks || 100),
      });
      setShowNewAssignmentModal(false);
      showToast(res.data?.message || 'Published to Classwork!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to publish assignment', 'error');
    }
  };

  const handleExecuteSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingAssignment || !activeId) return;

    try {
      if (submitMode === 'GOOGLE_DRIVE_AUTO') {
        if (!selectedFile) {
          showToast('Please choose a file from your device first', 'error');
          return;
        }
        const shareEmails: string[] = workspace?.auto_share_emails || [];
        const driveRes = await uploadFileToStudentGoogleDrive({
          file: selectedFile,
          courseCode: workspace?.offering?.course_code || 'COURSE',
          studentRollOrName: user?.roll_no || user?.name || 'Student',
          shareEmails,
          onProgress: (stage, pct) => setUploadProgress({ stage, pct }),
        });

        const apiRes = await API.client.post(
          `/classroom/assignments/${submittingAssignment.id}/submit`,
          {
            submission_url: driveRes.submission_url,
            drive_file_id: driveRes.drive_file_id,
            file_name: driveRes.file_name,
            file_sha256: driveRes.file_sha256,
            drive_modified_time: driveRes.drive_modified_time,
            upload_mode: 'GOOGLE_DRIVE_AUTO',
            submission_notes: submissionNotes,
            shared_with_prof: true,
          }
        );
        showToast(apiRes.data?.message || 'Saved to your Google Drive & link stored in DB!', 'success');
      } else {
        const check = validateSubmissionLink(directLinkUrl);
        if (!check.valid) {
          showToast(check.warning || 'Please enter a valid https:// link', 'error');
          return;
        }
        const apiRes = await API.client.post(
          `/classroom/assignments/${submittingAssignment.id}/submit`,
          {
            submission_url: directLinkUrl.trim(),
            file_name: `${check.provider} Submission`,
            upload_mode: 'DIRECT_LINK',
            submission_notes: submissionNotes,
            shared_with_prof: true,
          }
        );
        showToast(apiRes.data?.message || 'Direct link submitted!', 'success');
      }

      setSubmittingAssignment(null);
      setSelectedFile(null);
      setUploadProgress(null);
      setDirectLinkUrl('');
      setSubmissionNotes('');
      setSubmitCelebrationKey((k) => k + 1);
      await loadWorkspace(activeId);
    } catch (err: any) {
      setUploadProgress(null);
      showToast(err?.response?.data?.detail || err?.message || 'Submission failed', 'error');
    }
  };

  const handleAddCoProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !coProfEmail.trim()) return;
    try {
      const res = await API.client.post(`/classroom/offerings/${activeId}/add-instructor`, {
        email: coProfEmail,
        role_label: coProfRole,
      });
      showToast(res.data?.message || 'Added Co-Professor', 'success');
      setCoProfEmail('');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to add co-professor', 'error');
    }
  };

  const handleAddCourseTA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !newTaForm.public_name || !newTaForm.public_email) return;
    try {
      const res = await API.client.post(`/classroom/offerings/${activeId}/add-ta`, {
        ...newTaForm,
        lab_hours: '',
      });
      showToast(res.data?.message || 'Added Course TA', 'success');
      setNewTaForm({
        public_name: '',
        public_email: '',
        public_phone: '',
        public_batch: 'B.Tech CSE Year 4',
        lab_hours: '',
      });
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to add TA', 'error');
    }
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSub || !activeId) return;
    try {
      await API.client.patch(`/classroom/submissions/${gradingSub.id}/grade`, {
        marks_obtained: Number(gradeMarks),
        feedback: gradeFeedback,
      });
      showToast(`Saved marks for ${gradingSub.student_name}`, 'success');
      setGradingSub(null);
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to save grade', 'error');
    }
  };

  const handleImportTcsRoster = async () => {
    if (!activeId || !tcsCsvText.trim()) return;
    try {
      const res = await API.client.post(`/classroom/offerings/${activeId}/tcs-roster-import`, {
        csv_text: tcsCsvText,
      });
      showToast(res.data?.message || 'TCS iON Roster synced!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'TCS iON import failed', 'error');
    }
  };

  const handleDownloadTcsMarksCsv = async () => {
    if (!activeId) return;
    try {
      const res = await API.client.get(`/classroom/offerings/${activeId}/tcs-marks-export`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `TCS_iON_Marks_${workspace?.offering?.course_code || 'COURSE'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      showToast('Downloaded TCS iON Digital Campus Marksheet CSV!', 'success');
    } catch {
      showToast('Only course Professors/TAs can export TCS iON marksheets', 'error');
    }
  };

  const perms = workspace?.permissions || {};
  const off = workspace?.offering;

  const peopleTotal = workspace
    ? (workspace.instructors?.length || 0) +
      (workspace.tas?.length || 0) +
      (workspace.roster_count || 0)
    : 0;

  if (!user) {
    return (
      <div className="relative min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] selection:bg-[#E04F33] selection:text-white overflow-x-hidden">
        <ScrollProgressBar />
        <GlobalNavbar />
        <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-16 flex items-center justify-center">
          <div className={`${cardSurface} w-full p-8 sm:p-10 space-y-5 text-center`}>
            <div className="w-12 h-12 rounded-2xl bg-[#896ABD]/10 text-[#896ABD] dark:text-[#C084FC] flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#E04F33] font-semibold">
                Per-Course RBAC Workspace
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">
                Sign in to access your JKLU Classrooms
              </h1>
              <p className="text-sm text-[#5C5B57] dark:text-[#A09F9A] max-w-lg mx-auto leading-relaxed">
                Course streams, elective join codes, assignments, and TCS iON attendance are private to enrolled @jklu.edu.in students, course faculty, and assigned Course TAs.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to={`/login?next=${encodeURIComponent(offeringId ? `/classroom/${offeringId}` : '/classroom')}`}
                className="px-6 py-2.5 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white text-xs font-semibold transition-[background-color]"
              >
                Sign In with @jklu.edu.in →
              </Link>
              <Link
                to="/past-papers"
                className="px-5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white/70 dark:bg-white/[0.03] text-xs font-medium inline-flex items-center gap-1.5 hover:border-[#896ABD] transition-[border-color]"
              >
                <FileText className="w-3.5 h-3.5 text-[#E04F33]" />
                <span>Verified Past Papers</span>
              </Link>
              <Link
                to="/faculty"
                className="px-5 py-2.5 rounded-xl border border-[#E5E2DC] dark:border-white/15 bg-white/70 dark:bg-white/[0.03] text-xs font-medium inline-flex items-center gap-1.5 hover:border-[#896ABD] transition-[border-color]"
              >
                <GraduationCap className="w-3.5 h-3.5 text-[#896ABD]" />
                <span>Faculty &amp; TA Directory</span>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-transparent text-[#0A0A0C] dark:text-[#F5F4F0] selection:bg-[#E04F33] selection:text-white overflow-x-hidden">
      <ScrollProgressBar />

      {/* Unified Global Navigation Bar */}
      <GlobalNavbar />

      {/* Main Layout: Course Switcher Strip + Active Classroom */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {toast && (
          <div
            className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between backdrop-blur-md border ${
              toast.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/35 text-rose-800 dark:text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-[11px] font-mono-tabular underline ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Course Selector Strip + Role-Aware Utility Slot */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-[#E5E2DC] dark:border-white/10">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {offerings.map((item) => {
              const isSelected = Number(item.id) === Number(activeId);
              const roleTag = item.is_instructor
                ? 'Instructor'
                : item.is_ta
                  ? 'TA'
                  : item.is_enrolled
                    ? 'Enrolled'
                    : null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectOffering(item.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs shrink-0 border text-left transition-[border-color] ${
                    isSelected
                      ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] border-transparent shadow-sm'
                      : 'bg-white/90 dark:bg-[#111117]/85 border-[#E5E2DC] dark:border-white/10 hover:border-[#896ABD]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular font-semibold">{item.course_code}</span>
                    <span
                      className={`text-[10px] font-mono-tabular ${
                        isSelected
                          ? 'text-[#FAF9F6]/75 dark:text-[#0A0A0C]/70'
                          : 'text-[#5C5B57] dark:text-[#8E8D88]'
                      }`}
                    >
                      {item.programme} Sem {item.semester}
                    </span>
                    {roleTag && (
                      <span
                        className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded font-medium ${
                          isSelected
                            ? 'bg-white/15 dark:bg-black/15 text-inherit'
                            : item.is_instructor
                              ? 'bg-[#E04F33]/10 text-[#E04F33]'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {roleTag}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[11px] truncate max-w-[190px] mt-0.5 ${
                      isSelected
                        ? 'text-[#FAF9F6]/80 dark:text-[#0A0A0C]/75'
                        : 'text-[#5C5B57] dark:text-[#94938E]'
                    }`}
                  >
                    {item.course_name}
                  </div>
                </button>
              );
            })}
          </div>

          {isProfessorOrAdmin ? (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Link
                to="/profile"
                className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#E5E2DC] dark:border-white/15 bg-white/90 dark:bg-[#111117]/85 hover:border-[#896ABD]/60 inline-flex items-center gap-1.5 transition-[border-color]"
              >
                <User className="w-3.5 h-3.5 text-[#896ABD]" />
                <span>Faculty Profile</span>
              </Link>
              <Link
                to="/faculty"
                className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#E5E2DC] dark:border-white/15 bg-white/90 dark:bg-[#111117]/85 hover:border-[#E04F33]/60 inline-flex items-center gap-1.5 transition-[border-color]"
              >
                <GraduationCap className="w-3.5 h-3.5 text-[#E04F33]" />
                <span>Directory &amp; Release Course</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleJoinByCode} className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter 7-character join code"
                className="px-3.5 py-2 rounded-xl text-xs font-mono-tabular bg-white/90 dark:bg-[#111117]/85 border border-[#E5E2DC] dark:border-white/15 focus:outline-none focus:border-[#896ABD] w-64 transition-[border-color]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white shrink-0"
              >
                Join Class
              </button>
            </form>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-[#5C5B57] dark:text-[#94938E]">
            Loading Classroom Workspace...
          </div>
        ) : !workspace || !off ? (
          <div className={`${cardSurface} p-8 sm:p-10 text-center space-y-4`}>
            <BookOpen className="w-8 h-8 text-[#896ABD] mx-auto" />
            {offerings.length === 0 ? (
              <>
                <h2 className="text-lg font-semibold">
                  No active course classrooms assigned to your account yet
                </h2>
                <p className="text-xs sm:text-sm text-[#5C5B57] dark:text-[#A09F9A] max-w-md mx-auto leading-relaxed">
                  {isProfessorOrAdmin
                    ? 'Visit the Faculty Directory to release a new course classroom for your batch, or update your Faculty Profile.'
                    : 'Enter an elective join code shared by your course professor above, or browse Past Papers and the Faculty Directory.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <Link
                    to="/faculty"
                    className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 text-xs font-medium hover:border-[#896ABD] transition-[border-color]"
                  >
                    Open Faculty &amp; TA Directory
                  </Link>
                  <Link
                    to="/past-papers"
                    className="px-4 py-2 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] text-xs font-semibold"
                  >
                    Browse Past Exam Papers
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">
                  You do not have access to this course classroom
                </h2>
                <p className="text-xs sm:text-sm text-[#5C5B57] dark:text-[#A09F9A] max-w-md mx-auto leading-relaxed">
                  Classrooms are restricted to enrolled batch/elective students, assigned Course TAs, and teaching faculty.
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectOffering(offerings[0].id)}
                  className="px-5 py-2.5 rounded-xl bg-[#E04F33] text-white text-xs font-semibold"
                >
                  Open Your Assigned Classroom ({offerings[0].course_code})
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <ConfettiBurst triggerKey={submitCelebrationKey} />
            {/* Editorial Course Header Card */}
            <section className={`${cardSurface} overflow-hidden`}>
              <div className="h-[3px] w-full bg-gradient-to-r from-[#E04F33] via-[#896ABD] to-transparent" />
              <div className="p-6 sm:p-7 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-3 max-w-3xl">
                  <div className="flex items-center gap-2.5 flex-wrap text-xs">
                    <span className="px-2.5 py-0.5 rounded-md font-mono-tabular font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]">
                      {off.course_code}
                    </span>
                    <span className="font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                      {off.programme} · Batch {off.batch_year} · Semester {off.semester} ({off.section})
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] bg-black/[0.04] dark:bg-white/[0.06] text-[#5C5B57] dark:text-[#B8B6B0]">
                      TCS iON: {off.tcs_ion_course_id || `TCS-ION-${off.course_code}`}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    {off.course_name}
                  </h1>
                  {off.description && (
                    <p className="text-xs sm:text-sm text-[#5C5B57] dark:text-[#A09F9A] max-w-2xl leading-relaxed">
                      {off.description}
                    </p>
                  )}

                  {/* Flat Dot-Separated Faculty & TA Attribution */}
                  <div className="pt-1 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-mono-tabular text-[11px] uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88]">
                        <GraduationCap className="w-3.5 h-3.5 text-[#896ABD]" />
                        Faculty:
                      </span>
                      <span className="font-medium text-[#0A0A0C] dark:text-[#F5F4F0]">
                        {workspace.instructors
                          .map((inst: any) => `${inst.name} (${inst.role_label})`)
                          .join(' · ')}
                      </span>
                    </div>
                    {workspace.tas.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          Course TAs:
                        </span>
                        <span className="text-[#5C5B57] dark:text-[#C4C3BE]">
                          {workspace.tas
                            .map((ta: any) =>
                              ta.public_phone ? `${ta.public_name} (${ta.public_phone})` : ta.public_name
                            )
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Status Panel */}
                <div className="bg-[#FAF9F6]/90 dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10 rounded-xl p-4 text-xs space-y-2.5 shrink-0 min-w-[265px]">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#5C5B57] dark:text-[#94938E]">Your Role</span>
                    <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {perms.is_instructor
                        ? 'Course Professor'
                        : perms.is_ta
                          ? 'Course TA'
                          : perms.is_enrolled
                            ? `Enrolled (${perms.my_enroll_source || 'Auto'})`
                            : 'Viewer'}
                    </span>
                  </div>

                  {/* Strictly Student-Only TCS iON Attendance */}
                  {!perms.is_instructor &&
                    !perms.is_admin &&
                    (perms.is_enrolled ||
                      (perms.my_attendance_pct !== null && perms.my_attendance_pct !== undefined)) && (
                      <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10">
                        <span className="text-[#5C5B57] dark:text-[#94938E]">TCS iON Attendance</span>
                        {perms.my_attendance_pct !== null && perms.my_attendance_pct !== undefined ? (
                          <span
                            className={`font-mono-tabular font-semibold ${
                              perms.my_attendance_pct < 75
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {perms.my_attendance_pct}%
                          </span>
                        ) : (
                          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88]">
                            Not synced
                          </span>
                        )}
                      </div>
                    )}

                  {/* Instructor / Admin-Only Join Code with 1-Click Copy */}
                  {perms.can_manage_course && off.join_code && (
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10">
                      <span className="text-[#5C5B57] dark:text-[#94938E]">Elective Join Code</span>
                      <div className="flex items-center gap-1.5">
                        <code className="px-2 py-0.5 rounded font-mono-tabular font-semibold bg-black/[0.05] dark:bg-white/[0.08]">
                          {off.join_code}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyJoinCode(off.join_code)}
                          title="Copy join code"
                          aria-label="Copy join code"
                          className="p-1 rounded border border-[#E5E2DC] dark:border-white/15 hover:border-[#896ABD] transition-[border-color]"
                        >
                          {copiedJoinCode ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleRegenerateJoinCode}
                          disabled={regeneratingJoinCode}
                          title="Generate new random join code"
                          aria-label="Generate new random join code"
                          className="p-1 rounded border border-[#E5E2DC] dark:border-white/15 hover:border-[#E04F33] disabled:opacity-40 transition-[border-color]"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${regeneratingJoinCode ? 'animate-spin' : ''}`}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10">
                    <span className="text-[#5C5B57] dark:text-[#94938E]">Registered Students</span>
                    <span className="font-mono-tabular font-semibold">
                      {workspace.roster_count} Enrolled
                    </span>
                  </div>

                  <div className="pt-1.5">
                    <Link
                      to={`/past-papers?q=${encodeURIComponent(off.course_code)}`}
                      className="w-full py-2 px-3 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white/80 dark:bg-white/[0.04] hover:border-[#E04F33] transition-[border-color] inline-flex items-center justify-center gap-1.5 font-medium"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#E04F33]" />
                      <span>View {off.course_code} Past Papers</span>
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* Student Progress Overview Strip (Strictly Student-Only) */}
            {!perms.is_instructor &&
              !perms.is_admin &&
              perms.is_enrolled &&
              (() => {
                const asgns: any[] = Array.isArray(workspace.assignments)
                  ? workspace.assignments
                  : [];
                const totalAsgns = asgns.length;
                const submittedCount = asgns.filter((a) => Boolean(a.my_submission)).length;
                const submissionPct =
                  totalAsgns > 0 ? Math.round((submittedCount / totalAsgns) * 100) : null;
                const gradedSeries = asgns
                  .filter(
                    (a) =>
                      a.my_submission &&
                      a.my_submission.marks_obtained !== null &&
                      a.my_submission.marks_obtained !== undefined &&
                      Number(a.max_marks || 100) > 0
                  )
                  .map((a) => ({
                    label: String(a.title || `Task ${a.id}`),
                    value: Math.round(
                      (Number(a.my_submission.marks_obtained) / Number(a.max_marks || 100)) * 100
                    ),
                  }));
                const attendancePct =
                  perms.my_attendance_pct !== null && perms.my_attendance_pct !== undefined
                    ? Number(perms.my_attendance_pct)
                    : null;

                return (
                  <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`${cardSurface} p-4`}>
                      <ProgressRing
                        value={submissionPct}
                        label="Classwork Completion"
                        sublabel={
                          totalAsgns > 0
                            ? `${submittedCount} of ${totalAsgns} submitted`
                            : 'No assignments published yet'
                        }
                        accentColor={CHART_COLORS.emerald}
                        emptyText="—"
                      />
                    </div>
                    <div className={`${cardSurface} p-4`}>
                      <ProgressRing
                        value={attendancePct}
                        label="TCS iON Attendance"
                        sublabel="75% minimum requirement"
                        thresholdPct={75}
                        accentColor={CHART_COLORS.emerald}
                        belowThresholdColor={CHART_COLORS.vermilion}
                        emptyText="Not synced"
                      />
                    </div>
                    <div className={`${cardSurface} p-4 flex flex-col justify-between gap-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                          Graded Score Trend
                        </span>
                        <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#A09F9A]">
                          {gradedSeries.length > 0
                            ? `${gradedSeries.length} evaluated`
                            : 'Awaiting grades'}
                        </span>
                      </div>
                      {gradedSeries.length > 0 ? (
                        <Sparkline
                          data={gradedSeries}
                          accentColor={CHART_COLORS.lavender}
                          height={44}
                          unitLabel="%"
                          ariaLabel="Your graded assignment scores in this course"
                        />
                      ) : (
                        <p className="text-[11px] text-[#5C5B57] dark:text-[#A09F9A] leading-relaxed">
                          Evaluated assignment percentage scores will chart here once graded by faculty or TAs.
                        </p>
                      )}
                    </div>
                  </section>
                );
              })()}

            {/* Single-Row Scannable Navigation Tabs + Primary CTA */}
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#E5E2DC] dark:border-white/10 pb-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  [
                    {
                      id: 'stream' as const,
                      label: 'Stream',
                      count: workspace.announcements.length,
                      icon: <MessageSquare className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'classwork' as const,
                      label: 'Classwork',
                      count: workspace.assignments.length,
                      icon: <FileCheck2 className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'people' as const,
                      label: 'People',
                      count: peopleTotal,
                      icon: <Users className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'tcs_gradebook' as const,
                      label: 'Grades & TCS iON',
                      count: null,
                      icon: <Award className="w-3.5 h-3.5" />,
                    },
                  ] as const
                ).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 border transition-[border-color] ${
                        isActive
                          ? 'text-[#FAF9F6] dark:text-[#0A0A0C] border-transparent'
                          : 'bg-white/90 dark:bg-[#111117]/85 border-[#E5E2DC] dark:border-white/10 hover:border-[#896ABD]/50 text-[#0A0A0C] dark:text-[#F5F4F0]'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="classroomActiveTab"
                          transition={
                            reducedMotion
                              ? { duration: 0 }
                              : { type: 'spring', stiffness: 420, damping: 32 }
                          }
                          className="absolute inset-0 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] shadow-sm"
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-2">
                        {tab.icon}
                        <span>{tab.label}</span>
                        {tab.count !== null && (
                          <span className="font-mono-tabular text-[10px] opacity-75">
                            {tab.count}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {perms.can_announce && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('classwork');
                    setShowNewAssignmentModal(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E04F33] hover:opacity-90 text-white inline-flex items-center gap-1.5 shadow-sm transition-opacity shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Publish Assignment</span>
                </button>
              )}
            </div>

            {/* TAB 1: STREAM */}
            {activeTab === 'stream' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Sidebar: Clean Flat Course Team Card (Zero time/hours strings) */}
                <aside className={`${cardSurface} lg:col-span-4 p-5 space-y-4`}>
                  <div>
                    <h3 className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88] font-semibold">
                      Course Team
                    </h3>
                  </div>

                  <div className="divide-y divide-[#E5E2DC]/70 dark:divide-white/10">
                    {workspace.instructors.map((inst: any) => (
                      <div key={inst.professor_id} className="py-3 first:pt-0 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{inst.name}</span>
                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] dark:bg-white/[0.08] text-[#5C5B57] dark:text-[#C4C3BE]">
                            {inst.role_label}
                          </span>
                        </div>
                        <div className="text-[#5C5B57] dark:text-[#94938E]">
                          {inst.designation}
                        </div>
                        <div className="space-y-1 pt-0.5">
                          <div className="flex items-center gap-1.5 text-[#5C5B57] dark:text-[#C4C3BE]">
                            <Mail className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                            <a href={`mailto:${inst.public_email}`} className="hover:underline truncate">
                              {inst.public_email}
                            </a>
                          </div>
                          {inst.public_phone && (
                            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <a href={`tel:${inst.public_phone}`} className="hover:underline font-mono-tabular">
                                {inst.public_phone}
                              </a>
                            </div>
                          )}
                          {inst.cabin_number && (
                            <div className="flex items-center gap-1.5 text-[#5C5B57] dark:text-[#8E8D88]">
                              <MapPin className="w-3.5 h-3.5 text-[#E04F33] shrink-0" />
                              <span>{inst.cabin_number}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {workspace.tas.length > 0 && (
                    <div className="pt-3 border-t border-[#E5E2DC] dark:border-white/10 space-y-3">
                      <h4 className="text-[11px] font-mono-tabular uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">
                        Teaching Assistants
                      </h4>
                      <div className="divide-y divide-[#E5E2DC]/70 dark:divide-white/10">
                        {workspace.tas.map((ta: any) => (
                          <div key={ta.id} className="py-2.5 first:pt-0 last:pb-0 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{ta.public_name}</span>
                              <span className="px-1.5 py-0.5 rounded font-mono-tabular text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                                TA
                              </span>
                            </div>
                            {ta.public_batch && (
                              <div className="text-[11px] text-[#5C5B57] dark:text-[#8E8D88]">
                                {ta.public_batch}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-[#5C5B57] dark:text-[#C4C3BE]">
                              <Mail className="w-3 h-3 text-[#896ABD] shrink-0" />
                              <a href={`mailto:${ta.public_email}`} className="hover:underline truncate">
                                {ta.public_email}
                              </a>
                            </div>
                            {ta.public_phone && (
                              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                                <Phone className="w-3 h-3 shrink-0" />
                                <a href={`tel:${ta.public_phone}`} className="hover:underline font-mono-tabular">
                                  {ta.public_phone}
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>

                {/* Right Main Column: Announcement Composer + Stream Feed */}
                <div className="lg:col-span-8 space-y-5">
                  {perms.can_announce ? (
                    <form onSubmit={handlePostAnnouncement} className={`${cardSurface} p-5 space-y-3`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                          Announce to {off.course_code} Classroom{' '}
                          <span className="text-[#5C5B57] dark:text-[#8E8D88] font-normal">
                            (as {user?.name})
                          </span>
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-[#5C5B57] dark:text-[#A09F9A] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={annPinned}
                            onChange={(e) => setAnnPinned(e.target.checked)}
                            className="accent-[#E04F33]"
                          />
                          <span>Pin to top</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        value={annTitle}
                        onChange={(e) => setAnnTitle(e.target.value)}
                        placeholder="Announcement headline (optional)"
                        className={inputSurface}
                      />
                      <textarea
                        rows={3}
                        required
                        value={annContent}
                        onChange={(e) => setAnnContent(e.target.value)}
                        placeholder="Share lecture updates, Google Drive notes links, lab schedules, or TCS iON quiz reminders..."
                        className={inputSurface}
                      />
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="url"
                          value={annDriveUrl}
                          onChange={(e) => setAnnDriveUrl(e.target.value)}
                          placeholder="Optional Google Drive / Slide link (https://drive.google.com/...)"
                          className={`${inputSurface} flex-1`}
                        />
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white shrink-0"
                        >
                          Post Announcement
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className={`${cardSurface} p-3.5 text-xs text-[#5C5B57] dark:text-[#A09F9A]`}>
                      Students can comment and ask doubts on any announcement thread below. Only course professors and TAs can post new announcements.
                    </div>
                  )}

                  {workspace.announcements.length === 0 ? (
                    <div className={`${cardSurface} relative overflow-hidden p-8 text-center`}>
                      <img
                        src="/illustrations/classroom-abstract.jpg"
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-[0.06] dark:opacity-[0.1]"
                      />
                      <div className="relative z-10 space-y-2">
                        <MessageSquare className="w-6 h-6 text-[#896ABD] mx-auto" />
                        <h3 className="text-sm font-semibold">No announcements posted yet</h3>
                        <p className="text-xs text-[#5C5B57] dark:text-[#94938E] max-w-md mx-auto">
                          {perms.can_announce
                            ? 'Post the first announcement above to share syllabus slides, lecture notes, or lab reminders with enrolled students.'
                            : 'Your course professors and TAs will post updates and lecture resources here.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    workspace.announcements.map((ann: any) => (
                      <article key={ann.id} className={`${cardSurface} p-5 space-y-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{ann.author_name}</span>
                              <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-black/[0.05] dark:bg-white/[0.08] text-[#5C5B57] dark:text-[#C4C3BE]">
                                {ann.author_role}
                              </span>
                              {ann.is_pinned && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-[#E04F33]/10 text-[#E04F33]">
                                  <Pin className="w-3 h-3" /> Pinned
                                </span>
                              )}
                            </div>
                            {ann.title && <h4 className="font-semibold text-base mt-1.5">{ann.title}</h4>}
                          </div>
                          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88] shrink-0">
                            {new Date(ann.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-[#3A3936] dark:text-[#D0CEC8] whitespace-pre-line leading-relaxed">
                          {ann.content}
                        </p>

                        {ann.attachment_urls?.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {ann.attachment_urls.map((att: any, idx: number) => {
                              const safeUrl = safeExternalUrl(att.url);
                              if (!safeUrl) return null;
                              return (
                                <a
                                  key={idx}
                                  href={safeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#896ABD]/10 text-[#896ABD] dark:text-[#C084FC] border border-[#896ABD]/25 hover:border-[#896ABD] transition-[border-color]"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  <span>{att.label || 'Google Drive Attachment'}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Threaded Comments */}
                        <div className="pt-3 border-t border-[#E5E2DC]/80 dark:border-white/10 space-y-2.5">
                          <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88]">
                            Comments &amp; Doubts ({ann.comments?.length || 0})
                          </div>

                          {ann.comments?.map((c: any) => (
                            <div
                              key={c.id}
                              className={`p-3 rounded-xl text-xs space-y-1 border ${
                                c.is_verified_ans
                                  ? 'bg-emerald-500/5 border-emerald-500/30'
                                  : 'bg-[#FAF9F6] dark:bg-white/[0.02] border-[#E5E2DC]/70 dark:border-white/5'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{c.author_name}</span>
                                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/10">
                                    {c.author_role}
                                  </span>
                                  {c.is_verified_ans && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                      <CheckCircle2 className="w-3 h-3" /> Verified Faculty/TA Answer
                                    </span>
                                  )}
                                </div>
                                {perms.can_announce && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVerifyComment(c.id)}
                                    className="text-[11px] font-medium text-[#896ABD] dark:text-[#C084FC] hover:underline"
                                  >
                                    {c.is_verified_ans ? 'Unmark Verified' : 'Mark Verified'}
                                  </button>
                                )}
                              </div>
                              <p className="text-[#3A3936] dark:text-[#D0CEC8]">{c.content}</p>
                            </div>
                          ))}

                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              value={commentInputs[ann.id] || ''}
                              onChange={(e) =>
                                setCommentInputs((prev) => ({ ...prev, [ann.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handlePostComment(ann.id);
                                }
                              }}
                              placeholder="Add a class comment or ask a doubt..."
                              className={`${inputSurface} flex-1`}
                            />
                            <button
                              type="button"
                              onClick={() => handlePostComment(ann.id)}
                              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white inline-flex items-center gap-1.5 shrink-0"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Reply</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CLASSWORK */}
            {activeTab === 'classwork' && (
              <div className="space-y-5">
                <div className={`${cardSurface} p-4 text-xs flex flex-wrap items-center justify-between gap-3`}>
                  <div className="space-y-0.5 max-w-3xl">
                    <div className="font-semibold flex items-center gap-1.5 text-[#0A0A0C] dark:text-[#F5F4F0]">
                      <UploadCloud className="w-4 h-4 text-[#896ABD]" />
                      <span>Drive Link-Only Submissions (Zero Database Bloat)</span>
                    </div>
                    <p className="text-[#5C5B57] dark:text-[#A09F9A]">
                      Student uploads go directly to the student&apos;s Google Drive and auto-share with{' '}
                      <span className="font-mono-tabular text-[#0A0A0C] dark:text-[#E2E0DC]">
                        {workspace.auto_share_emails?.join(', ') || 'course faculty'}
                      </span>
                      , storing only the verified URL &amp; SHA-256 digest.
                    </p>
                  </div>
                  {perms.can_announce && (
                    <button
                      type="button"
                      onClick={() => setShowNewAssignmentModal(true)}
                      className="px-4 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white font-semibold shrink-0 inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Assignment / Quiz</span>
                    </button>
                  )}
                </div>

                {/* Student Due-Soon & Pending Quick-Jump Strip */}
                {!perms.is_instructor &&
                  !perms.is_admin &&
                  (() => {
                    const pendingAsgns = (workspace.assignments || [])
                      .filter((a: any) => !a.my_submission && a.assignment_type !== 'TCS_ION_QUIZ')
                      .sort((a: any, b: any) => {
                        const ta = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
                        const tb = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
                        return ta - tb;
                      });
                    if (pendingAsgns.length === 0) return null;
                    return (
                      <div className={`${cardSurface} p-4 space-y-2.5 border-[#E04F33]/35`}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#E04F33]">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending Submissions ({pendingAsgns.length})</span>
                          </span>
                          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                            Click to jump directly
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pendingAsgns.slice(0, 4).map((a: any) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                document.getElementById(`assignment-${a.id}`)?.scrollIntoView({
                                  behavior: reducedMotion ? 'auto' : 'smooth',
                                  block: 'center',
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#E04F33] text-xs font-mono-tabular inline-flex items-center gap-2 transition-[border-color]"
                            >
                              <span className="font-medium text-[#0A0A0C] dark:text-[#F5F4F0] truncate max-w-[180px]">
                                {a.title}
                              </span>
                              {a.due_at && (
                                <span className="text-[10px] text-[#E04F33]">
                                  Due {new Date(a.due_at).toLocaleDateString()}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                {workspace.assignments.length === 0 ? (
                  <div className={`${cardSurface} relative overflow-hidden p-10 text-center`}>
                    <img
                      src="/illustrations/classroom-abstract.jpg"
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-[0.06] dark:opacity-[0.1]"
                    />
                    <div className="relative z-10 space-y-3">
                      <FileCheck2 className="w-7 h-7 text-[#896ABD] mx-auto" />
                      <h3 className="text-base font-semibold">No assignments or quizzes published yet</h3>
                      <p className="text-xs text-[#5C5B57] dark:text-[#94938E] max-w-md mx-auto">
                        {perms.can_announce
                          ? 'Publish an assignment, lab sheet, or TCS iON proctored quiz to begin collecting student submissions.'
                          : 'Assignments and TCS iON quizzes posted by your instructor will appear here.'}
                      </p>
                      {perms.can_announce && (
                        <button
                          type="button"
                          onClick={() => setShowNewAssignmentModal(true)}
                          className="px-4 py-2 rounded-xl bg-[#E04F33] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Publish First Assignment</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  workspace.assignments.map((asgn: any) => {
                    const isTcsQuiz = asgn.assignment_type === 'TCS_ION_QUIZ';
                    const mySub = asgn.my_submission;
                    const problemLink = asgn.resource_links?.[0]?.url || asgn.resource_url;

                    return (
                      <article
                        key={asgn.id}
                        id={`assignment-${asgn.id}`}
                        className={`${cardSurface} p-6 space-y-4`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2.5 py-0.5 rounded font-mono-tabular text-[10px] font-semibold uppercase ${
                                  isTcsQuiz
                                    ? 'bg-[#896ABD]/15 text-[#896ABD] dark:text-[#C084FC]'
                                    : 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C]'
                                }`}
                              >
                                {isTcsQuiz ? 'TCS iON Quiz' : asgn.assignment_type}
                              </span>
                              {asgn.topic_module && (
                                <span className="text-xs text-[#5C5B57] dark:text-[#94938E]">
                                  {asgn.topic_module}
                                </span>
                              )}
                              <span className="font-mono-tabular text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                {asgn.max_marks} Marks
                              </span>
                              {asgn.tcs_ion_exam_code && (
                                <span className="text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08]">
                                  Code: {asgn.tcs_ion_exam_code}
                                </span>
                              )}
                            </div>
                            <h3 className="text-lg font-semibold">{asgn.title}</h3>
                            {asgn.description && (
                              <p className="text-xs sm:text-sm text-[#5C5B57] dark:text-[#A09F9A] leading-relaxed">
                                {asgn.description}
                              </p>
                            )}
                            {safeExternalUrl(problemLink) && (
                              <div className="pt-1">
                                <a
                                  href={safeExternalUrl(problemLink)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#896ABD] dark:text-[#C084FC] hover:underline"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  <span>Problem Statement / Reference</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Role-Aware Action Slot */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            {isTcsQuiz && safeExternalUrl(asgn.tcs_ion_launch_url) ? (
                              <a
                                href={safeExternalUrl(asgn.tcs_ion_launch_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#896ABD] dark:hover:bg-[#896ABD] dark:hover:text-white inline-flex items-center gap-2 shadow-sm"
                              >
                                <span>Launch TCS iON Quiz</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : !perms.is_instructor && !perms.is_admin ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSubmittingAssignment(asgn);
                                  setDirectLinkUrl(mySub?.submission_url || '');
                                  setSubmissionNotes(mySub?.submission_notes || '');
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E04F33] hover:opacity-90 text-white inline-flex items-center gap-2 shadow-sm"
                              >
                                <UploadCloud className="w-4 h-4" />
                                <span>{mySub ? 'Update Submission' : 'Submit Assignment'}</span>
                              </button>
                            ) : (
                              <span className="px-3 py-1.5 rounded-lg font-mono-tabular text-xs font-medium bg-black/[0.04] dark:bg-white/[0.06] text-[#5C5B57] dark:text-[#C4C3BE]">
                                {asgn.submissions?.length || asgn.submission_count || 0} Submissions
                              </span>
                            )}
                            {asgn.due_at && (
                              <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#8E8D88]">
                                Due {new Date(asgn.due_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Student's Own Submission Status Box */}
                        {mySub && (
                          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="font-semibold">
                                  Your Submission (
                                  {mySub.upload_mode === 'GOOGLE_DRIVE_AUTO'
                                    ? 'Google Drive Auto-Share'
                                    : 'Direct Link'}
                                  )
                                </span>
                              </div>
                              {mySub.marks_obtained !== null && mySub.marks_obtained !== undefined ? (
                                <span className="px-2.5 py-0.5 rounded-md font-mono-tabular bg-emerald-600 text-white font-semibold">
                                  Graded: {mySub.marks_obtained} / {asgn.max_marks}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                                  Submitted · Pending Grade
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              {safeExternalUrl(mySub.submission_url) ? (
                                <a
                                  href={safeExternalUrl(mySub.submission_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 font-medium text-[#896ABD] dark:text-[#C084FC] hover:underline break-all"
                                >
                                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{mySub.file_name || mySub.submission_url}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400 text-xs">
                                  Invalid submission link
                                </span>
                              )}
                              {mySub.file_sha256 && (
                                <span
                                  title={`Verified SHA-256: ${mySub.file_sha256}`}
                                  className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                >
                                  SHA-256: {String(mySub.file_sha256).slice(0, 12)}…
                                </span>
                              )}
                            </div>
                            {mySub.feedback && (
                              <div className="text-[#3A3936] dark:text-[#E2E0DC] pt-1.5 border-t border-emerald-500/20">
                                <strong>Feedback ({mySub.graded_by_name}):</strong> {mySub.feedback}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Professor / TA View: All Student Drive Link Submissions */}
                        {perms.can_grade && asgn.submissions && asgn.submissions.length > 0 && (
                          <div className="pt-3 border-t border-[#E5E2DC]/80 dark:border-white/10 space-y-2.5">
                            <div className="text-xs font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88] font-semibold">
                              Student Submissions ({asgn.submissions.length})
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {asgn.submissions.map((sub: any) => (
                                <div
                                  key={sub.id}
                                  className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10 text-xs flex items-center justify-between gap-3"
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    <div className="font-semibold truncate">
                                      {sub.student_name} ({sub.student_roll_no || sub.student_email})
                                    </div>
                                    {safeExternalUrl(sub.submission_url) ? (
                                      <a
                                        href={safeExternalUrl(sub.submission_url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#896ABD] dark:text-[#C084FC] hover:underline inline-flex items-center gap-1 truncate max-w-full"
                                      >
                                        <Link2 className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{sub.file_name || sub.submission_url}</span>
                                      </a>
                                    ) : (
                                      <span className="text-rose-600 dark:text-rose-400 text-[11px]">
                                        Blocked unsafe URL
                                      </span>
                                    )}
                                    <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                                      {sub.upload_mode} · {sub.shared_with_prof ? 'Shared' : 'Link'}
                                      {sub.file_sha256 ? ` · SHA-256: ${String(sub.file_sha256).slice(0, 10)}…` : ''}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setGradingSub({ ...sub, max_marks: asgn.max_marks });
                                      setGradeMarks(
                                        sub.marks_obtained !== null && sub.marks_obtained !== undefined
                                          ? String(sub.marks_obtained)
                                          : ''
                                      );
                                      setGradeFeedback(sub.feedback || '');
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white font-semibold shrink-0"
                                  >
                                    {sub.marks_obtained !== null && sub.marks_obtained !== undefined
                                      ? `${sub.marks_obtained}/${asgn.max_marks} · Edit`
                                      : 'Grade'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: PEOPLE (Zero emojis, zero time/hours strings) */}
            {activeTab === 'people' && (
              <div className="space-y-6">
                {/* Co-Professors Section */}
                <section className={`${cardSurface} p-6 space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">
                        Course Professors &amp; Co-Instructors ({workspace.instructors.length})
                      </h3>
                      <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
                        Multiple professors can co-teach a course and manage classrooms together.
                      </p>
                    </div>
                    {perms.can_manage_course && (
                      <form onSubmit={handleAddCoProfessor} className="flex flex-wrap items-center gap-2 text-xs">
                        <input
                          type="email"
                          required
                          value={coProfEmail}
                          onChange={(e) => setCoProfEmail(e.target.value)}
                          placeholder="Co-Professor Email (@jklu.edu.in)"
                          className="px-3 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD]"
                        />
                        <input
                          type="text"
                          value={coProfRole}
                          onChange={(e) => setCoProfRole(e.target.value)}
                          placeholder="Role (e.g. Co-Instructor)"
                          className="px-3 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD] w-40"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] font-semibold inline-flex items-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add Co-Professor</span>
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {workspace.instructors.map((inst: any) => (
                      <div
                        key={inst.professor_id}
                        className="p-4 rounded-xl border border-[#E5E2DC]/80 dark:border-white/10 bg-[#FAF9F6] dark:bg-white/[0.02] text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{inst.name}</span>
                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] dark:bg-white/[0.08] font-medium">
                            {inst.role_label}
                          </span>
                        </div>
                        <div className="text-[#5C5B57] dark:text-[#94938E]">
                          {inst.designation} · School of {inst.school}
                        </div>
                        <div className="flex flex-wrap gap-4 pt-0.5">
                          <a
                            href={`mailto:${inst.public_email}`}
                            className="inline-flex items-center gap-1.5 text-[#896ABD] dark:text-[#C084FC] hover:underline"
                          >
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            <span>{inst.public_email}</span>
                          </a>
                          {inst.public_phone && (
                            <a
                              href={`tel:${inst.public_phone}`}
                              className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-mono-tabular font-medium hover:underline"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span>{inst.public_phone}</span>
                            </a>
                          )}
                        </div>
                        {inst.cabin_number && (
                          <div className="flex items-center gap-1.5 text-[#5C5B57] dark:text-[#8E8D88]">
                            <MapPin className="w-3.5 h-3.5 text-[#E04F33] shrink-0" />
                            <span>{inst.cabin_number}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Course TAs Section */}
                <section className={`${cardSurface} p-6 space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold">
                          Course Teaching Assistants ({workspace.tas.length})
                        </h3>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 font-medium">
                          Public TA Contact Card Only
                        </span>
                      </div>
                      <p className="text-xs text-[#5C5B57] dark:text-[#94938E] mt-0.5">
                        Public contact email and phone for course doubt support; the TA&apos;s personal student profile stays isolated.
                      </p>
                    </div>
                  </div>

                  {perms.can_manage_course && (
                    <form
                      onSubmit={handleAddCourseTA}
                      className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.02] border border-[#E5E2DC]/80 dark:border-white/10 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs"
                    >
                      <input
                        type="text"
                        required
                        placeholder="TA Public Name"
                        value={newTaForm.public_name}
                        onChange={(e) => setNewTaForm({ ...newTaForm, public_name: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD]"
                      />
                      <input
                        type="email"
                        required
                        placeholder="TA Official Email"
                        value={newTaForm.public_email}
                        onChange={(e) => setNewTaForm({ ...newTaForm, public_email: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD]"
                      />
                      <input
                        type="text"
                        placeholder="TA Contact Phone"
                        value={newTaForm.public_phone}
                        onChange={(e) => setNewTaForm({ ...newTaForm, public_phone: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD]"
                      />
                      <input
                        type="text"
                        placeholder="Batch (e.g. B.Tech Year 4)"
                        value={newTaForm.public_batch}
                        onChange={(e) => setNewTaForm({ ...newTaForm, public_batch: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD]"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-[#E04F33] hover:opacity-90 text-white font-semibold"
                      >
                        + Assign TA
                      </button>
                    </form>
                  )}

                  {workspace.tas.length === 0 ? (
                    <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
                      No TAs assigned to this course yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {workspace.tas.map((ta: any) => (
                        <div
                          key={ta.id}
                          className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm">{ta.public_name}</span>
                            <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                              Teaching Assistant
                            </span>
                          </div>
                          {ta.public_batch && (
                            <div className="text-[#5C5B57] dark:text-[#94938E]">{ta.public_batch}</div>
                          )}
                          <div className="flex flex-wrap gap-4 pt-0.5">
                            <a
                              href={`mailto:${ta.public_email}`}
                              className="inline-flex items-center gap-1.5 text-[#896ABD] dark:text-[#C084FC] hover:underline"
                            >
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              <span>{ta.public_email}</span>
                            </a>
                            {ta.public_phone && (
                              <a
                                href={`tel:${ta.public_phone}`}
                                className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-mono-tabular font-medium hover:underline"
                              >
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                <span>{ta.public_phone}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Enrolled Students Roster */}
                <section className={`${cardSurface} p-6 space-y-4`}>
                  <div>
                    <h3 className="text-base font-semibold">
                      Registered Student Roster ({workspace.roster_count})
                    </h3>
                    <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
                      Auto-enrolled for {off.programme} Semester {off.semester} + synced from TCS iON Course Registration.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#E5E2DC] dark:border-white/10 text-[#5C5B57] dark:text-[#8E8D88] font-mono-tabular text-[11px] uppercase">
                          <th className="py-2 pr-4">Roll No</th>
                          <th className="py-2 pr-4">Student Name</th>
                          <th className="py-2 pr-4">Section</th>
                          <th className="py-2 pr-4">Source</th>
                          {perms.can_grade && <th className="py-2 pr-4">TCS iON Attendance</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {workspace.roster.map((r: any) => (
                          <tr
                            key={r.id}
                            className="border-b border-[#E5E2DC]/60 dark:border-white/5 last:border-b-0"
                          >
                            <td className="py-2.5 pr-4 font-mono-tabular font-semibold">
                              {r.roll_no || 'AUTO'}
                            </td>
                            <td className="py-2.5 pr-4 font-medium">{r.student_name}</td>
                            <td className="py-2.5 pr-4">{r.section || 'Sec A'}</td>
                            <td className="py-2.5 pr-4">
                              <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-black/[0.05] dark:bg-white/[0.08]">
                                {r.enroll_source}
                              </span>
                            </td>
                            {perms.can_grade && (
                              <td className="py-2.5 pr-4 font-mono-tabular">
                                {r.attendance_pct !== null && r.attendance_pct !== undefined ? (
                                  <span
                                    className={`inline-flex items-center gap-1 font-semibold ${
                                      Number(r.attendance_pct) < 75
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                    }`}
                                  >
                                    <span>{r.attendance_pct}%</span>
                                    {Number(r.attendance_pct) < 75 && (
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[#5C5B57] dark:text-[#8E8D88] text-[11px]">
                                    Not synced
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 4: TCS iON BRIDGE & GOOGLE DRIVE GRADEBOOK */}
            {activeTab === 'tcs_gradebook' && (
              <div className="space-y-6">
                {/* Staff Cohort Analytics & Histograms */}
                {(perms.can_grade || perms.can_manage_course) && analytics && (
                  <section className={`${cardSurface} p-6 space-y-6`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E2DC]/70 dark:border-white/10">
                      <div>
                        <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#E04F33]/10 text-[#E04F33]">
                          Cohort Analytics
                        </span>
                        <h3 className="text-lg font-semibold mt-1">
                          Submission Velocity, Grades &amp; Attendance Telemetry
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div className="px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                          <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                            Roster Size
                          </div>
                          <div className="font-mono-tabular font-semibold text-sm">
                            {analytics.roster_size ?? 0}
                          </div>
                        </div>
                        <div className="px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                          <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                            Avg Score
                          </div>
                          <div className="font-mono-tabular font-semibold text-sm">
                            {analytics.grades?.average_pct !== null &&
                            analytics.grades?.average_pct !== undefined
                              ? `${analytics.grades.average_pct}%`
                              : 'Not graded'}
                          </div>
                        </div>
                        <div className="px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                          <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                            Avg Attendance
                          </div>
                          <div className="font-mono-tabular font-semibold text-sm">
                            {analytics.attendance?.average_pct !== null &&
                            analytics.attendance?.average_pct !== undefined
                              ? `${analytics.attendance.average_pct}%`
                              : 'Not synced'}
                          </div>
                        </div>
                        <div className="px-3 py-2 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                          <div className="text-[10px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                            Below 75%
                          </div>
                          <div className="font-mono-tabular font-semibold text-sm text-rose-600 dark:text-rose-400">
                            {analytics.attendance?.below_75_count ?? 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    {Array.isArray(analytics.assignments) && analytics.assignments.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                            Assignment Submission Rates
                          </span>
                          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                            Click an assignment to jump to Classwork
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {analytics.assignments.map((item: any) => {
                            const ratePct =
                              item.rate !== null && item.rate !== undefined
                                ? Math.round(Number(item.rate) * 100)
                                : null;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setActiveTab('classwork');
                                  setTimeout(() => {
                                    document.getElementById(`assignment-${item.id}`)?.scrollIntoView({
                                      behavior: reducedMotion ? 'auto' : 'smooth',
                                      block: 'center',
                                    });
                                  }, 80);
                                }}
                                className="p-3 rounded-xl border border-[#E5E2DC]/80 dark:border-white/10 bg-[#FAF9F6]/70 dark:bg-white/[0.02] hover:border-[#896ABD] text-left space-y-1.5 transition-[border-color]"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-medium truncate text-[#0A0A0C] dark:text-[#F5F4F0]">
                                    {item.title}
                                  </span>
                                  <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A] shrink-0">
                                    {item.submitted}/{analytics.roster_size ?? 0}
                                    {ratePct !== null ? ` (${ratePct}%)` : ''}
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-[#E5E2DC]/70 dark:bg-white/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#896ABD] transition-all duration-300"
                                    style={{ width: `${ratePct !== null ? Math.max(4, ratePct) : 0}%` }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                            Grade Distribution (%)
                          </span>
                          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                            {analytics.grades?.graded_count ?? 0} graded
                          </span>
                        </div>
                        <MetricBarHistogram
                          items={(analytics.grades?.buckets || []).map((b: any, i: number) => ({
                            id: String(b.label),
                            label: String(b.label),
                            value: Number(b.count || 0),
                            color:
                              i >= 5
                                ? CHART_COLORS.emerald
                                : i >= 3
                                  ? CHART_COLORS.lavender
                                  : CHART_COLORS.vermilion,
                          }))}
                          unitLabel="submissions"
                          ariaLabel="Course grade distribution histogram"
                        />
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                            TCS iON Attendance Distribution (%)
                          </span>
                          <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A]">
                            {analytics.attendance?.synced_count ?? 0} synced ·{' '}
                            {analytics.attendance?.not_synced_count ?? 0} unsynced
                          </span>
                        </div>
                        <MetricBarHistogram
                          items={(analytics.attendance?.buckets || []).map((b: any, i: number) => ({
                            id: String(b.label),
                            label: String(b.label),
                            value: Number(b.count || 0),
                            color: i < 3 ? CHART_COLORS.vermilion : CHART_COLORS.emerald,
                          }))}
                          thresholdIndex={3}
                          thresholdLabel="75% min"
                          unitLabel="students"
                          ariaLabel="Course attendance percentage distribution histogram"
                        />
                      </div>
                    </div>
                  </section>
                )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <section className={`${cardSurface} lg:col-span-6 p-6 space-y-4`}>
                  <div>
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#896ABD]/10 text-[#896ABD] dark:text-[#C084FC]">
                      JKLU ERP Integration
                    </span>
                    <h3 className="text-lg font-semibold mt-1.5">
                      TCS iON Digital Campus Roster &amp; Attendance Sync
                    </h3>
                    <p className="text-xs text-[#5C5B57] dark:text-[#94938E] mt-1">
                      Import student registrations, roll numbers, credits, and attendance % from TCS iON, or export graded assignments as a Marksheet CSV.
                    </p>
                  </div>

                  {perms.can_manage_course || perms.can_grade ? (
                    <div className="space-y-2.5 text-xs">
                      {perms.can_manage_course && (
                        <>
                          <label className="font-medium block text-[#5C5B57] dark:text-[#C4C3BE]">
                            Paste TCS iON Registration &amp; Attendance CSV (Roll_No, Name, Email, Section, Attendance_Pct, Credits)
                          </label>
                          <textarea
                            rows={4}
                            value={tcsCsvText}
                            onChange={(e) => setTcsCsvText(e.target.value)}
                            placeholder="2024BTECH042, Student Name, student@jklu.edu.in, Sec A, 94.5, 4"
                            className={`${inputSurface} font-mono-tabular text-[11px]`}
                          />
                        </>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {perms.can_manage_course && (
                          <button
                            type="button"
                            onClick={handleImportTcsRoster}
                            className="px-4 py-2 rounded-xl bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white font-semibold inline-flex items-center gap-1.5"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Sync TCS iON Roster</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleDownloadTcsMarksCsv}
                          className="px-4 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white font-semibold inline-flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" />
                          <span>Export Marks (.csv)</span>
                        </button>
                        {perms.can_manage_course && (
                          <button
                            type="button"
                            onClick={() =>
                              setTcsCsvText(
                                '2024BTECH042, Aman Pratap Singh, aman.student@jklu.edu.in, Sec A, 94.5, 4\n2024BTECH055, Kabir Sharma, kabir.student@jklu.edu.in, Sec A, 86.0, 4'
                              )
                            }
                            className="px-3.5 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 hover:border-[#896ABD] text-[#5C5B57] dark:text-[#C4C3BE] font-medium transition-[border-color]"
                          >
                            Insert Sample Format
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10 text-xs text-[#5C5B57] dark:text-[#A09F9A]">
                      TCS iON roster import and marksheet CSV export are restricted to course instructors and authorized TAs. Your synced attendance and assignment grades are shown on the right.
                    </div>
                  )}
                </section>

                <section className={`${cardSurface} lg:col-span-6 p-6 space-y-4`}>
                  <div>
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      Zero-Bloat Architecture
                    </span>
                    <h3 className="text-lg font-semibold mt-1.5">
                      Google Drive Link-Only Storage Telemetry
                    </h3>
                    <p className="text-xs text-[#5C5B57] dark:text-[#94938E] mt-1">
                      Every student file is uploaded straight from the browser to the student&apos;s own Google Drive and auto-shared with course faculty.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                      <div className="text-[#5C5B57] dark:text-[#8E8D88]">DB Storage per Submission</div>
                      <div className="text-xl font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        ~250 Bytes
                      </div>
                      <div className="text-[11px] text-[#5C5B57] dark:text-[#8E8D88]">
                        Text URL only (0 MB blobs)
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10">
                      <div className="text-[#5C5B57] dark:text-[#8E8D88]">Backend File Bandwidth</div>
                      <div className="text-xl font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        0.00 MB
                      </div>
                      <div className="text-[11px] text-[#5C5B57] dark:text-[#8E8D88]">
                        Direct Browser → Google Drive
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.03] border border-[#E5E2DC]/80 dark:border-white/10 text-xs space-y-1">
                    <div className="font-semibold text-[#0A0A0C] dark:text-[#F5F4F0]">
                      Auto-Shared Faculty &amp; TA Drive Recipients
                    </div>
                    <div className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#C4C3BE]">
                      {workspace.auto_share_emails?.join(' · ') || 'No faculty emails'}
                    </div>
                  </div>
                </section>
              </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL 1: ZERO-DB-STORAGE STUDENT ASSIGNMENT SUBMISSION */}
      {submittingAssignment && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-[#896ABD]/10 text-[#896ABD] dark:text-[#C084FC]">
                  Zero-DB-Storage Submission
                </span>
                <h3 className="text-base font-semibold mt-1">{submittingAssignment.title}</h3>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => {
                  setSubmittingAssignment(null);
                  setUploadProgress(null);
                }}
                className="p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/10 hover:border-[#E04F33] transition-[border-color]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#FAF9F6] dark:bg-white/5 border border-[#E5E2DC]/70 dark:border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSubmitMode('GOOGLE_DRIVE_AUTO')}
                className={`py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-1.5 ${
                  submitMode === 'GOOGLE_DRIVE_AUTO'
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                    : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>1. Select File (Drive)</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmitMode('DIRECT_LINK')}
                className={`py-2 px-3 rounded-lg font-medium flex items-center justify-center gap-1.5 ${
                  submitMode === 'DIRECT_LINK'
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                    : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>2. Paste Direct Link</span>
              </button>
            </div>

            <form onSubmit={handleExecuteSubmission} className="space-y-4 text-xs">
              {submitMode === 'GOOGLE_DRIVE_AUTO' ? (
                !isGoogleDriveOAuthConfigured() ? (
                  <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                    <div className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                      Google Drive OAuth Not Configured in This Sandbox
                    </div>
                    <p className="text-[#3A3936] dark:text-[#D0CEC8] leading-relaxed">
                      One-click browser-to-Drive upload requires{' '}
                      <code className="font-mono-tabular">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to be configured.
                      Without a real Google OAuth client, Learn JKLU 2.0 will never generate a placeholder Drive link. Upload your file directly to Drive, GitHub, Colab, or Overleaf and submit the verified URL below.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubmitMode('DIRECT_LINK')}
                      className="px-4 py-2 rounded-xl bg-[#E04F33] text-white font-semibold"
                    >
                      Switch to 2. Paste Direct Link
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-[#896ABD]/40 hover:border-[#896ABD] rounded-2xl p-6 text-center cursor-pointer bg-[#896ABD]/5 transition-[border-color] space-y-2"
                    >
                      <UploadCloud className="w-8 h-8 text-[#896ABD] mx-auto" />
                      <div className="font-semibold text-sm">
                        {selectedFile
                          ? `Selected: ${selectedFile.name} (${Math.max(1, Math.round(selectedFile.size / 1024))} KB)`
                          : 'Click to select PDF, ZIP, Report, or Code file from your device'}
                      </div>
                      <p className="text-[11px] text-[#5C5B57] dark:text-[#94938E] max-w-md mx-auto">
                        Uploads straight to your Google Drive, shares reader access with{' '}
                        <strong>{workspace?.auto_share_emails?.join(', ')}</strong>, and stores only the Drive URL &amp; SHA-256 digest.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </div>

                    {uploadProgress && (
                      <div className="p-3 rounded-xl bg-[#896ABD]/10 border border-[#896ABD]/30 space-y-1.5">
                        <div className="flex justify-between font-medium font-mono-tabular">
                          <span>{uploadProgress.stage}</span>
                          <span>{uploadProgress.pct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-[#E04F33] transition-all duration-300"
                            style={{ width: `${uploadProgress.pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <label className="font-medium block">
                    Direct Google Drive / GitHub / Colab / Overleaf / Figma URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={directLinkUrl}
                    onChange={(e) => setDirectLinkUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/... or https://github.com/..."
                    className={inputSurface}
                  />
                  {directLinkUrl && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                      Detected Provider: <strong>{validateSubmissionLink(directLinkUrl).provider}</strong>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="font-medium block mb-1">
                  Submission Notes / Comments for Professor &amp; TA
                </label>
                <textarea
                  rows={2}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  placeholder="Optional notes about your implementation or test cases..."
                  className={inputSurface}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmittingAssignment(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitMode === 'GOOGLE_DRIVE_AUTO' && !isGoogleDriveOAuthConfigured()}
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {submitMode === 'GOOGLE_DRIVE_AUTO'
                    ? 'Upload to My Drive & Submit Link'
                    : 'Submit Direct Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE ASSIGNMENT OR TCS iON QUIZ */}
      {showNewAssignmentModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                Publish Assignment or TCS iON Quiz
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setShowNewAssignmentModal(false)}
                className="p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/10 hover:border-[#E04F33] transition-[border-color]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium block mb-1">Classwork Type</label>
                  <select
                    value={asgnForm.assignment_type}
                    onChange={(e) => setAsgnForm({ ...asgnForm, assignment_type: e.target.value })}
                    className={inputSurface}
                  >
                    <option value="ASSIGNMENT">Assignment (Drive / Link Submission)</option>
                    <option value="LAB">Lab Sheet (Drive / Link Submission)</option>
                    <option value="PROJECT">Course Project</option>
                    <option value="TCS_ION_QUIZ">TCS iON Proctored Quiz Launchpad</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium block mb-1">Max Marks</label>
                  <input
                    type="number"
                    value={asgnForm.max_marks}
                    onChange={(e) => setAsgnForm({ ...asgnForm, max_marks: e.target.value })}
                    className={inputSurface}
                  />
                </div>
              </div>

              <div>
                <label className="font-medium block mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={asgnForm.title}
                  onChange={(e) => setAsgnForm({ ...asgnForm, title: e.target.value })}
                  placeholder="e.g. Lab 2: Dijkstra & Bellman-Ford Shortest Path Benchmarks"
                  className={inputSurface}
                />
              </div>

              <div>
                <label className="font-medium block mb-1">Topic / Module</label>
                <input
                  type="text"
                  value={asgnForm.topic_module}
                  onChange={(e) => setAsgnForm({ ...asgnForm, topic_module: e.target.value })}
                  className={inputSurface}
                />
              </div>

              <div>
                <label className="font-medium block mb-1">Instructions / Description</label>
                <textarea
                  rows={3}
                  value={asgnForm.description}
                  onChange={(e) => setAsgnForm({ ...asgnForm, description: e.target.value })}
                  className={inputSurface}
                />
              </div>

              {asgnForm.assignment_type === 'TCS_ION_QUIZ' ? (
                <div className="p-3.5 rounded-xl bg-[#896ABD]/10 border border-[#896ABD]/25 space-y-2">
                  <div className="font-semibold text-[#896ABD] dark:text-[#C084FC]">
                    TCS iON Digital Assessment Platform Link
                  </div>
                  <input
                    type="url"
                    value={asgnForm.tcs_ion_launch_url}
                    onChange={(e) =>
                      setAsgnForm({ ...asgnForm, tcs_ion_launch_url: e.target.value })
                    }
                    placeholder="https://g01.digialm.com/..."
                    className={inputSurface}
                  />
                  <input
                    type="text"
                    value={asgnForm.tcs_ion_exam_code}
                    onChange={(e) =>
                      setAsgnForm({ ...asgnForm, tcs_ion_exam_code: e.target.value })
                    }
                    placeholder="TCS iON Exam Code (e.g. JKLU-TCS-CS1135-Q2)"
                    className={inputSurface}
                  />
                </div>
              ) : (
                <div>
                  <label className="font-medium block mb-1">
                    Problem Statement Google Drive URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={asgnForm.resource_url}
                    onChange={(e) => setAsgnForm({ ...asgnForm, resource_url: e.target.value })}
                    placeholder="https://drive.google.com/file/d/..."
                    className={inputSurface}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewAssignmentModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white font-semibold"
                >
                  Publish to Classroom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GRADE SUBMISSION */}
      {gradingSub && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">
                  Grade Submission — {gradingSub.student_name} ({gradingSub.student_roll_no})
                </h3>
                {safeExternalUrl(gradingSub.submission_url) ? (
                  <a
                    href={safeExternalUrl(gradingSub.submission_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#896ABD] dark:text-[#C084FC] hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>Open Student&apos;s Google Drive File in New Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-rose-600 dark:text-rose-400">
                    Blocked unsafe submission URL
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setGradingSub(null)}
                className="p-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/10 hover:border-[#E04F33] transition-[border-color]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {gradingSub.submission_notes && (
              <div className="p-3 rounded-xl bg-[#FAF9F6] dark:bg-white/5 border border-[#E5E2DC]/70 dark:border-white/10 text-xs">
                <strong>Student Notes:</strong> {gradingSub.submission_notes}
              </div>
            )}

            <form onSubmit={handleSaveGrade} className="space-y-3 text-xs">
              <div>
                <label className="font-medium block mb-1">
                  Marks Obtained (out of {gradingSub.max_marks || 100}) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={gradeMarks}
                  onChange={(e) => setGradeMarks(e.target.value)}
                  className={inputSurface}
                />
              </div>
              <div>
                <label className="font-medium block mb-1">Faculty / TA Evaluation Feedback</label>
                <textarea
                  rows={3}
                  value={gradeFeedback}
                  onChange={(e) => setGradeFeedback(e.target.value)}
                  placeholder="Write feedback for the student..."
                  className={inputSurface}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGradingSub(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white font-semibold"
                >
                  Save Grade &amp; Sync to TCS iON Export
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default ClassroomPage;
