import React, { useEffect, useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  MessageSquare,
  FileCheck2,
  Users,
  Award,
  CheckCircle2,
  Plus,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  GraduationCap,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Image as ImageIcon,
  ListChecks,
  Upload,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import {
  uploadFileToStudentGoogleDrive,
  uploadFacultyResourceToGoogleDrive,
  validateSubmissionLink,
  isGoogleDriveOAuthConfigured,
} from '@/utils/googleDriveSubmit';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollProgressBar, EASE_OUT } from '@/components/animations/MotionPrimitives';
import GlobalNavbar from '@/components/layout/GlobalNavbar';
import Footer from '@/components/layout/Footer';
import { ProgressRing } from '@/components/viz/ProgressRing';
import { Sparkline } from '@/components/viz/Sparkline';
import { MetricBarHistogram } from '@/components/viz/MetricBarHistogram';
import { ConfettiBurst } from '@/components/viz/ConfettiBurst';
import { CHART_COLORS, usePrefersReducedMotion } from '@/components/viz/chartTokens';
import {
  ClassroomHomeHub,
  ClassroomSidebar,
  COURSE_BANNER_SCRIM_STYLE,
  COURSE_BANNER_TEXT_SHADOW,
  getCourseBannerImage,
  type ClassroomTaskItem,
} from '@/components/classroom/ClassroomHomeHub';
import { MyGradesAttendancePanel } from '@/components/classroom/MyGradesAttendancePanel';
import { GradebookExtrasPanel } from '@/components/classroom/GradebookExtrasPanel';
import { ModulesResourcesTab } from '@/components/classroom/ModulesResourcesTab';
import { AttendancePanel } from '@/components/classroom/AttendancePanel';
import {
  StudentPreviewBanner,
  StudentSectionTransferButton,
} from '@/components/classroom/RequestsAndPreviewControls';
import { QuizEnginePanel } from '@/components/classroom/QuizEnginePanel';
import { ExcelMarksSheet } from '@/components/classroom/ExcelMarksSheet';
import { ClassroomStreamTab } from '@/components/classroom/ClassroomStreamTab';
import { ClassroomClassworkTab } from '@/components/classroom/ClassroomClassworkTab';
import { ClassroomPeopleTab } from '@/components/classroom/ClassroomPeopleTab';
import { ClassroomModals } from '@/components/classroom/ClassroomModals';

const cardSurface =
  'rounded-2xl border border-[#E5E2DC] dark:border-white/10 bg-white/95 dark:bg-[#13131A]/95 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)]';

const inputSurface =
  'w-full px-4 py-2.5 rounded-xl text-sm bg-[#FAF9F6] dark:bg-[#0B0B0F] border border-[#E5E2DC] dark:border-white/15 text-[#0A0A0C] dark:text-[#F5F4F0] placeholder-[#5C5B57]/60 dark:placeholder-[#94938E]/60 focus:outline-none focus:border-[#896ABD] dark:focus:border-[#C084FC] transition-[border-color]';

const ClassroomPage: React.FC = () => {
  const { offeringId } = useParams<{ offeringId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [offerings, setOfferings] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<ClassroomTaskItem[]>([]);
  const [homeViewMode, setHomeViewMode] = useState<'home' | 'todo'>('home');
  const [activeId, setActiveId] = useState<number | null>(offeringId ? Number(offeringId) : null);
  const [workspace, setWorkspace] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [submitCelebrationKey, setSubmitCelebrationKey] = useState<number>(0);
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'stream' | 'classwork' | 'materials' | 'quizzes' | 'attendance' | 'people' | 'tcs_gradebook'
  >('stream');
  const [studentPreviewSection, setStudentPreviewSection] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') =>
    setToast({ text, type });
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);
  const [regeneratingJoinCode, setRegeneratingJoinCode] = useState(false);

  // Customize course banner modal state (Professor/Admin)
  const [bannerModalOffering, setBannerModalOffering] = useState<any | null>(null);
  const [bannerDraftUrl, setBannerDraftUrl] = useState('');
  const [bannerUploadKb, setBannerUploadKb] = useState<number | null>(null);
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);

  // Request sequencing, AbortController, and instant in-memory workspace cache
  const workspaceSeqRef = useRef(0);
  const workspaceAbortRef = useRef<AbortController | null>(null);
  const workspaceCacheRef = useRef<Map<number, any>>(new Map());
  const analyticsCacheRef = useRef<Map<number, any>>(new Map());
  const prefetchInFlightRef = useRef<Set<number>>(new Set());

  // Join by elective code
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Stream: New announcement / lecture notes & comments
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annDriveUrl, setAnnDriveUrl] = useState('');
  const [annPinned, setAnnPinned] = useState(false);
  const [annScheduledFor, setAnnScheduledFor] = useState('');
  const [annFile, setAnnFile] = useState<File | null>(null);
  const [annUploadProgress, setAnnUploadProgress] = useState<{ stage: string; pct: number } | null>(
    null
  );
  const [annUploading, setAnnUploading] = useState(false);
  const annFileInputRef = useRef<HTMLInputElement | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});

  // Classwork: Create Assignment or TCS iON Quiz
  const [showNewAssignmentModal, setShowNewAssignmentModal] = useState(false);
  const [asgnAttachMode, setAsgnAttachMode] = useState<'FILE' | 'LINK'>(
    isGoogleDriveOAuthConfigured() ? 'FILE' : 'LINK'
  );
  const [asgnFile, setAsgnFile] = useState<File | null>(null);
  const [asgnUploadProgress, setAsgnUploadProgress] = useState<{
    stage: string;
    pct: number;
  } | null>(null);
  const [asgnPublishing, setAsgnPublishing] = useState(false);
  const asgnFileInputRef = useRef<HTMLInputElement | null>(null);
  const [asgnForm, setAsgnForm] = useState({
    title: '',
    description: '',
    topic_module: '',
    assignment_type: 'ASSIGNMENT',
    resource_url: '',
    tcs_ion_launch_url: '',
    tcs_ion_exam_code: '',
    due_at: '',
    max_marks: '100',
    is_group_assignment: false,
    max_group_size: '4',
    late_penalty_pct_per_day: '0',
    grace_minutes: '0',
    grades_published: true,
  });

  // Zero-DB-Storage Submission Modal (Google Drive Auto-Upload vs Native Upload vs Direct Link)
  const [submittingAssignment, setSubmittingAssignment] = useState<any | null>(null);
  const [submittingWork, setSubmittingWork] = useState(false);
  const [submitMode, setSubmitMode] = useState<'GOOGLE_DRIVE_AUTO' | 'DIRECT_LINK' | 'NATIVE_UPLOAD'>(
    isGoogleDriveOAuthConfigured() ? 'GOOGLE_DRIVE_AUTO' : 'NATIVE_UPLOAD'
  );
  const [groupModalAsgn, setGroupModalAsgn] = useState<any | null>(null);
  const [drawerTarget, setDrawerTarget] = useState<{
    asgn: any;
    sub: any;
    canGrade: boolean;
  } | null>(null);
  const [similarityReports, setSimilarityReports] = useState<Record<number, any>>({});
  const [similarityLoadingId, setSimilarityLoadingId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ stage: string; pct: number } | null>(null);
  const [directLinkUrl, setDirectLinkUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit Announcement / Edit Assignment Modals & Leave State
  const [editingAnn, setEditingAnn] = useState<any | null>(null);
  const [editAnnTitle, setEditAnnTitle] = useState('');
  const [editAnnContent, setEditAnnContent] = useState('');
  const [savingAnnEdit, setSavingAnnEdit] = useState(false);

  const [editingAsgn, setEditingAsgn] = useState<any | null>(null);
  const [editAsgnForm, setEditAsgnForm] = useState({
    title: '',
    description: '',
    due_at: '',
    max_marks: '100',
    allow_late: true,
  });
  const [savingAsgnEdit, setSavingAsgnEdit] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [workspaceAccessError, setWorkspaceAccessError] = useState<string | null>(null);
  const [expandedStreamIds, setExpandedStreamIds] = useState<Record<string, boolean>>({});
  const [syllabusUploading, setSyllabusUploading] = useState(false);
  const [syllabusViewing, setSyllabusViewing] = useState(false);
  const syllabusInputRef = useRef<HTMLInputElement | null>(null);
  const [rosterUploading, setRosterUploading] = useState(false);
  const [rosterUploadResult, setRosterUploadResult] = useState<any | null>(null);
  const rosterInputRef = useRef<HTMLInputElement | null>(null);

  // Multi-Section Scoping State (Cross-Section Read + Strict Write/Edit/Grade Isolation)
  const [sectionViewFilter, setSectionViewFilter] = useState<string>('ALL');
  const [annTargetSections, setAnnTargetSections] = useState<string[]>(['ALL']);
  const [asgnTargetSections, setAsgnTargetSections] = useState<string[]>(['ALL']);
  const [savingMySections, setSavingMySections] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [rosterDefaultSection, setRosterDefaultSection] = useState('Sec A');

  // People Tab: Add Co-Professor or Public TA
  const [coProfEmail, setCoProfEmail] = useState('');
  const [coProfRole, setCoProfRole] = useState('Co-Instructor');
  const [coProfSection, setCoProfSection] = useState('ALL');
  const [taSection, setTaSection] = useState('ALL');
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
  const [savingGrade, setSavingGrade] = useState(false);
  const [tcsCsvText, setTcsCsvText] = useState('');

  const isProfessorOrAdmin = Boolean(
    user && (user.admin_role === 'professor' || user.is_professor || user.is_admin)
  );
  const taOfferingSet = new Set((user?.ta_offering_ids || []).map((id: any) => Number(id)));

  const loadOfferingsList = async (silent = false) => {
    if (!user) {
      setOfferings([]);
      setAllTasks([]);
      setWorkspace(null);
      setOfferingsLoading(false);
      setWorkspaceLoading(false);
      workspaceCacheRef.current.clear();
      analyticsCacheRef.current.clear();
      return;
    }
    if (!silent) setOfferingsLoading(true);
    try {
      const data = await classroomApi.listOfferings();
      const list = data?.items || [];
      setOfferings(list);
      setAllTasks(Array.isArray(data?.tasks) ? data.tasks : []);
    } catch (err) {
      console.error('Failed to load classroom offerings:', err);
      if (!silent) {
        setOfferings([]);
        setAllTasks([]);
      }
    } finally {
      setOfferingsLoading(false);
    }
  };

  const prefetchWorkspace = (id: number) => {
    if (!user || !id || workspaceCacheRef.current.has(id) || prefetchInFlightRef.current.has(id)) {
      return;
    }
    prefetchInFlightRef.current.add(id);
    classroomApi
      .getWorkspace(id)
      .then((data) => {
        if (data) {
          workspaceCacheRef.current.set(id, data);
        }
      })
      .catch(() => {})
      .finally(() => {
        prefetchInFlightRef.current.delete(id);
      });
  };

  const loadWorkspace = async (id: number, { forceSilent = false }: { forceSilent?: boolean } = {}) => {
    workspaceAbortRef.current?.abort();
    const controller = new AbortController();
    workspaceAbortRef.current = controller;
    const seq = ++workspaceSeqRef.current;

    const cached = workspaceCacheRef.current.get(id);
    if (cached) {
      setWorkspace(cached);
      setWorkspaceLoading(false);
      const cachedAnalytics = analyticsCacheRef.current.get(id);
      setAnalytics(cachedAnalytics ?? null);
    } else if (!forceSilent) {
      setWorkspace(null);
      setAnalytics(null);
      setWorkspaceLoading(true);
    }

    try {
      const wsData = await classroomApi.getWorkspace(id, {
        signal: controller.signal,
      });
      if (seq !== workspaceSeqRef.current) return;
      workspaceCacheRef.current.set(id, wsData);
      setWorkspaceAccessError(null);
      setWorkspace(wsData);
      const p = wsData?.permissions;
      if (p?.can_grade || p?.can_manage_course) {
        classroomApi
          .getAnalytics(id)
          .then((aData) => {
            if (aData) {
              analyticsCacheRef.current.set(id, aData);
            }
            if (seq === workspaceSeqRef.current) {
              setAnalytics(aData || null);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      if (controller.signal.aborted || seq !== workspaceSeqRef.current) return;
      const errStatus = err?.response?.status;
      const accessMsg =
        err?.response?.data?.detail ||
        err?.message ||
        'You are not enrolled in or assigned to this course classroom.';
      if (errStatus !== 403 && errStatus !== 404) {
        console.error('Failed to load classroom workspace:', err);
      }
      if (!cached) {
        setWorkspace(null);
        setWorkspaceAccessError(accessMsg);
      }
    } finally {
      if (seq === workspaceSeqRef.current) setWorkspaceLoading(false);
    }
  };

  // Load offerings & cross-course tasks ONCE per authenticated user (never re-fetch on class clicks!)
  useEffect(() => {
    workspaceCacheRef.current.clear();
    analyticsCacheRef.current.clear();
    loadOfferingsList();
  }, [user?.id]);

  // Switch between Home Hub (0 ms) and Course Workspace (0 ms when cached/prefetched)
  useEffect(() => {
    if (!user) return;
    if (!offeringId) {
      workspaceAbortRef.current?.abort();
      setActiveId(null);
      setWorkspace(null);
      setAnalytics(null);
      setWorkspaceLoading(false);
      return;
    }
    const targetId = Number(offeringId);
    if (!Number.isFinite(targetId) || targetId <= 0) return;
    setActiveId(targetId);
    loadWorkspace(targetId);
    return () => {
      workspaceAbortRef.current?.abort();
    };
  }, [offeringId, user?.id]);

  const openBannerModal = (targetOffering: any) => {
    if (!targetOffering) return;
    setBannerModalOffering(targetOffering);
    setBannerDraftUrl(targetOffering.banner_image_url || '');
    setBannerUploadKb(null);
    setBannerCropFile(null);
  };

  const handleBannerFilePick = (file: File | null | undefined) => {
    if (!file) return;
    setBannerCropFile(file);
  };

  const handleSaveCourseBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerModalOffering) return;
    const targetId = Number(bannerModalOffering.id);
    setSavingBanner(true);
    try {
      const resData = await classroomApi.updateBanner(
        targetId,
        bannerDraftUrl.trim() || null
      );
      const updatedUrl = resData?.offering?.banner_image_url ?? null;
      setOfferings((prev) =>
        prev.map((item) =>
          Number(item.id) === targetId ? { ...item, banner_image_url: updatedUrl } : item
        )
      );
      setWorkspace((prev: any) =>
        prev && Number(prev.offering?.id) === targetId
          ? { ...prev, offering: { ...prev.offering, banner_image_url: updatedUrl } }
          : prev
      );
      const cached = workspaceCacheRef.current.get(targetId);
      if (cached?.offering) {
        workspaceCacheRef.current.set(targetId, {
          ...cached,
          offering: { ...cached.offering, banner_image_url: updatedUrl },
        });
      }
      setBannerModalOffering(null);
      showToast(resData?.message || 'Course banner updated!', 'success');
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Could not update course banner',
        'error'
      );
    } finally {
      setSavingBanner(false);
    }
  };

  const handleSelectOffering = (id: number, initialTab: 'stream' | 'classwork' = 'stream') => {
    setActiveTab(initialTab);
    setActiveId(id);
    navigate(`/classroom/${id}`);
  };

  const handleGoClassroomHome = (mode: 'home' | 'todo' = 'home') => {
    setHomeViewMode(mode);
    setActiveId(null);
    setWorkspace(null);
    navigate('/classroom');
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
      const resData = await classroomApi.regenerateJoinCode(activeId);
      const newCode = resData?.join_code;
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
      const resData = await classroomApi.joinByCode({
        join_code: joinCodeInput,
      });
      showToast(resData?.message || 'Joined course classroom!', 'success');
      setJoinCodeInput('');
      await loadOfferingsList();
      if (resData?.offering_id) {
        handleSelectOffering(resData.offering_id);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Invalid join code', 'error');
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !annContent.trim() || annUploading) return;
    setAnnUploading(true);
    try {
      const attachments: Array<{ label: string; url: string; type: string }> = [];

      if (annFile) {
        const uploaded = await uploadFacultyResourceToGoogleDrive({
          file: annFile,
          courseCode: workspace?.offering?.course_code || 'COURSE',
          category: 'NOTES',
          onProgress: (stage, pct) => setAnnUploadProgress({ stage, pct }),
        });
        attachments.push({
          label: uploaded.file_name,
          url: uploaded.url,
          type: 'DRIVE',
        });
      }

      if (annDriveUrl.trim()) {
        const linkCheck = validateSubmissionLink(annDriveUrl);
        if (!linkCheck.valid) {
          showToast(linkCheck.warning || 'Attachment link must start with https://', 'error');
          setAnnUploadProgress(null);
          setAnnUploading(false);
          return;
        }
        attachments.push({
          label: linkCheck.provider,
          url: annDriveUrl.trim(),
          type: linkCheck.provider.includes('Drive') ? 'DRIVE' : 'LINK',
        });
      }

      const postData = await classroomApi.createAnnouncement(activeId, {
        title: annTitle,
        content: annContent,
        attachment_urls: attachments,
        is_pinned: annPinned,
        target_sections: annTargetSections,
        scheduled_for: annScheduledFor ? new Date(annScheduledFor).toISOString() : null,
      });
      setAnnTitle('');
      setAnnContent('');
      setAnnDriveUrl('');
      setAnnPinned(false);
      setAnnScheduledFor('');
      setAnnFile(null);
      setAnnUploadProgress(null);
      if (annFileInputRef.current) annFileInputRef.current.value = '';
      showToast(
        postData?.message ||
          (annFile
            ? 'Notes uploaded to Google Drive & posted to classroom stream!'
            : 'Announcement posted to course stream!'),
        'success'
      );
      await loadWorkspace(activeId);
    } catch (err: any) {
      setAnnUploadProgress(null);
      showToast(err?.response?.data?.detail || err?.message || 'Failed to post announcement', 'error');
    } finally {
      setAnnUploading(false);
    }
  };

  const handlePostComment = async (announcementId: number) => {
    const text = (commentInputs[announcementId] || '').trim();
    if (!text || !activeId) return;
    try {
      await classroomApi.addComment(announcementId, { content: text });
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
      await classroomApi.verifyComment(commentId);
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

  const handleTogglePinAnnouncement = async (ann: any) => {
    if (!activeId) return;
    try {
      await classroomApi.updateAnnouncement(ann.id, {
        is_pinned: !ann.is_pinned,
      });
      showToast(!ann.is_pinned ? 'Announcement pinned' : 'Announcement unpinned', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to update pin status', 'error');
    }
  };

  const handleToggleAllowComments = async (ann: any) => {
    if (!activeId) return;
    const nextAllow = !(ann.allow_comments !== false);
    try {
      await classroomApi.updateAnnouncement(ann.id, {
        allow_comments: nextAllow,
      });
      showToast(nextAllow ? 'Comments enabled' : 'Comments locked on this post', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to update comment setting', 'error');
    }
  };

  const handleSaveAnnouncementEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAnn || !activeId || savingAnnEdit) return;
    setSavingAnnEdit(true);
    try {
      await classroomApi.updateAnnouncement(editingAnn.id, {
        title: editAnnTitle,
        content: editAnnContent,
      });
      setEditingAnn(null);
      showToast('Announcement updated', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to update announcement', 'error');
    } finally {
      setSavingAnnEdit(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: number) => {
    if (!activeId || !window.confirm('Delete this announcement and all its comments?')) return;
    try {
      await classroomApi.deleteAnnouncement(announcementId);
      showToast('Announcement deleted', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to delete announcement', 'error');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!activeId || !(perms.can_announce || perms.can_manage_course)) return;
    if (!window.confirm('Delete this comment?')) return;
    try {
      await classroomApi.deleteComment(commentId);
      showToast('Comment deleted', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to delete comment', 'error');
    }
  };

  const handleSaveAssignmentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsgn || !activeId || savingAsgnEdit) return;
    setSavingAsgnEdit(true);
    try {
      await classroomApi.updateAssignment(editingAsgn.id, {
        title: editAsgnForm.title,
        description: editAsgnForm.description,
        due_at: editAsgnForm.due_at ? new Date(editAsgnForm.due_at).toISOString() : null,
        max_marks: Number(editAsgnForm.max_marks) || 100,
        allow_late: editAsgnForm.allow_late,
      });
      setEditingAsgn(null);
      showToast('Assignment updated', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to update assignment', 'error');
    } finally {
      setSavingAsgnEdit(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: number, title: string) => {
    if (
      !activeId ||
      !window.confirm(`Delete assignment "${title}" and all student submissions for it?`)
    ) {
      return;
    }
    try {
      await classroomApi.deleteAssignment(assignmentId);
      showToast('Assignment deleted', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to delete assignment', 'error');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || asgnPublishing) return;
    setAsgnPublishing(true);
    try {
      const links: Array<{ label: string; url: string }> = [];

      if (asgnForm.assignment_type !== 'TCS_ION_QUIZ') {
        if (asgnAttachMode === 'FILE' && asgnFile) {
          const uploaded = await uploadFacultyResourceToGoogleDrive({
            file: asgnFile,
            courseCode: workspace?.offering?.course_code || 'COURSE',
            category: 'ASSIGNMENT',
            onProgress: (stage, pct) => setAsgnUploadProgress({ stage, pct }),
          });
          links.push({ label: uploaded.file_name, url: uploaded.url });
        } else if (asgnForm.resource_url.trim()) {
          const linkCheck = validateSubmissionLink(asgnForm.resource_url);
          if (!linkCheck.valid) {
            showToast(linkCheck.warning || 'Resource link must start with https://', 'error');
            setAsgnUploadProgress(null);
            setAsgnPublishing(false);
            return;
          }
          links.push({
            label: `${linkCheck.provider} — Problem Sheet / Reference`,
            url: asgnForm.resource_url.trim(),
          });
        }
      }

      const resData = await classroomApi.createAssignment(activeId, {
        ...asgnForm,
        target_sections: asgnTargetSections,
        resource_links: links,
        due_at: asgnForm.due_at ? new Date(asgnForm.due_at).toISOString() : null,
        max_marks: Number(asgnForm.max_marks || 100),
        max_group_size: Number(asgnForm.max_group_size || 4),
        late_penalty_pct_per_day: Number(asgnForm.late_penalty_pct_per_day || 0),
        grace_minutes: Number(asgnForm.grace_minutes || 0),
      });
      setShowNewAssignmentModal(false);
      setAsgnFile(null);
      setAsgnUploadProgress(null);
      if (asgnFileInputRef.current) asgnFileInputRef.current.value = '';
      setAsgnForm({
        title: '',
        description: '',
        topic_module: '',
        assignment_type: 'ASSIGNMENT',
        resource_url: '',
        tcs_ion_launch_url: '',
        tcs_ion_exam_code: '',
        due_at: '',
        max_marks: '100',
        is_group_assignment: false,
        max_group_size: '4',
        late_penalty_pct_per_day: '0',
        grace_minutes: '0',
        grades_published: true,
      });
      showToast(resData?.message || 'Published to Classwork!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      setAsgnUploadProgress(null);
      showToast(err?.response?.data?.detail || err?.message || 'Failed to publish assignment', 'error');
    } finally {
      setAsgnPublishing(false);
    }
  };

  const handleExecuteSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingAssignment || !activeId || submittingWork) return;

    setSubmittingWork(true);
    try {
      if (submitMode === 'NATIVE_UPLOAD') {
        if (!selectedFile) {
          showToast('Please choose a file from your device first', 'error');
          return;
        }
        const fd = new FormData();
        fd.append('file', selectedFile);
        if (submissionNotes.trim()) fd.append('submission_notes', submissionNotes.trim());
        const apiData = await classroomApi.submitAssignmentFile(submittingAssignment.id, fd);
        showToast(apiData?.message || 'File submitted directly!', 'success');
        setSubmittingAssignment(null);
        setSelectedFile(null);
        setSubmissionNotes('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadWorkspace(activeId);
      } else if (submitMode === 'GOOGLE_DRIVE_AUTO') {
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

        const apiData = await classroomApi.submitAssignment(submittingAssignment.id, {
          submission_url: driveRes.submission_url,
          drive_file_id: driveRes.drive_file_id,
          file_name: driveRes.file_name,
          file_sha256: driveRes.file_sha256,
          drive_modified_time: driveRes.drive_modified_time,
          upload_mode: 'GOOGLE_DRIVE_AUTO',
          submission_notes: submissionNotes,
          shared_with_prof: driveRes.shared_with_prof,
        });
        showToast(apiData?.message || 'Saved to your Google Drive & link stored in DB!', 'success');
      } else {
        const check = validateSubmissionLink(directLinkUrl);
        if (!check.valid) {
          showToast(check.warning || 'Please enter a valid https:// link', 'error');
          return;
        }
        const apiData = await classroomApi.submitAssignment(submittingAssignment.id, {
          submission_url: directLinkUrl.trim(),
          file_name: `${check.provider} Submission`,
          upload_mode: 'DIRECT_LINK',
          submission_notes: submissionNotes,
          shared_with_prof: true,
        });
        showToast(apiData?.message || 'Direct link submitted!', 'success');
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
    } finally {
      setSubmittingWork(false);
    }
  };

  const handleAddCoProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !coProfEmail.trim()) return;
    try {
      const resData = await classroomApi.addInstructor(activeId, {
        email: coProfEmail,
        role_label:
          coProfSection !== 'ALL' && coProfRole === 'Co-Instructor'
            ? `Instructor (${coProfSection})`
            : coProfRole,
        assigned_sections: coProfSection === 'ALL' ? ['ALL'] : [coProfSection],
      });
      showToast(resData?.message || 'Added Co-Professor', 'success');
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
      const resData = await classroomApi.addTA(activeId, {
        ...newTaForm,
        assigned_sections: taSection === 'ALL' ? ['ALL'] : [taSection],
        lab_hours: '',
      });
      showToast(resData?.message || 'Added Course TA', 'success');
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

  const handleSelectMyTeachingSections = async (nextSections: string[]) => {
    if (!activeId || savingMySections || nextSections.length === 0) return;
    setSavingMySections(true);
    try {
      const resData = await classroomApi.updateMySections(activeId, nextSections);
      showToast(resData?.message || 'Teaching section preference updated', 'success');
      await loadWorkspace(activeId, { forceSilent: true });
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Could not update teaching section(s)',
        'error'
      );
    } finally {
      setSavingMySections(false);
    }
  };

  const handleAddCourseSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSectionName.replace(/\s+/g, ' ').trim();
    if (!activeId || !cleaned || addingSection) return;
    const currentSecs: string[] = Array.isArray(workspace?.offering?.sections)
      ? workspace.offering.sections
      : ['Sec A'];
    if (currentSecs.some((s) => s.toLowerCase() === cleaned.toLowerCase())) {
      setNewSectionName('');
      return;
    }
    setAddingSection(true);
    try {
      const resData = await classroomApi.updateOfferingSections(activeId, [...currentSecs, cleaned]);
      setNewSectionName('');
      showToast(resData?.message || `Added section ${cleaned}`, 'success');
      await loadWorkspace(activeId, { forceSilent: true });
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to add section', 'error');
    } finally {
      setAddingSection(false);
    }
  };

  const handleUpdateInstructorSection = async (professorId: number, sectionVal: string) => {
    if (!activeId) return;
    try {
      const resData = await classroomApi.updateInstructorSections(
        activeId,
        professorId,
        sectionVal === 'ALL' ? ['ALL'] : [sectionVal]
      );
      showToast(resData?.message || 'Updated instructor section scope', 'success');
      await loadWorkspace(activeId, { forceSilent: true });
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to update instructor sections',
        'error'
      );
    }
  };

  const handleUpdateStudentSection = async (enrollmentId: number, nextSection: string) => {
    if (!activeId || !nextSection) return;
    try {
      const resData = await classroomApi.updateStudentSection(activeId, enrollmentId, nextSection);
      showToast(resData?.message || `Moved student to ${nextSection}`, 'success');
      await loadWorkspace(activeId, { forceSilent: true });
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to move student section',
        'error'
      );
    }
  };

  const handleRemoveInstructor = async (professorId: number, name: string) => {
    if (!activeId || !window.confirm(`Remove ${name} as an instructor from this course?`)) return;
    try {
      const resData = await classroomApi.removeInstructor(activeId, professorId);
      showToast(resData?.message || 'Removed instructor', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to remove instructor', 'error');
    }
  };

  const handleToggleTaPerm = async (ta: any, field: 'can_grade' | 'can_announce') => {
    if (!activeId) return;
    try {
      await classroomApi.updateTA(activeId, ta.id, {
        [field]: !ta[field],
      });
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to update TA permission', 'error');
    }
  };

  const handleRemoveTa = async (taId: number, name: string) => {
    if (!activeId || !window.confirm(`Remove Course TA ${name}?`)) return;
    try {
      await classroomApi.removeTA(activeId, taId);
      showToast('Course TA removed', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to remove TA', 'error');
    }
  };

  const handleRemoveStudent = async (enrollmentId: number, name: string) => {
    if (!activeId || !window.confirm(`Remove ${name} from the course roster?`)) return;
    try {
      await classroomApi.removeStudent(activeId, enrollmentId);
      showToast('Student removed from roster', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to remove student', 'error');
    }
  };

  const handleUploadSyllabusPdf = async (file: File | null | undefined) => {
    if (!activeId || !file || syllabusUploading) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Only PDF files (.pdf) are allowed for the course description.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Course description PDF must be 10 MB or smaller.', 'error');
      return;
    }
    setSyllabusUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resData = await classroomApi.uploadSyllabusPdf(activeId, fd);
      showToast(resData?.message || 'Course description PDF uploaded!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to upload course description PDF',
        'error'
      );
    } finally {
      setSyllabusUploading(false);
    }
  };

  const handleOpenSyllabusPdf = async (download = false) => {
    if (!activeId || syllabusViewing) return;
    setSyllabusViewing(true);
    try {
      const rawBlob = await classroomApi.downloadSyllabusPdf(activeId, download);
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = off?.course_desc_pdf_name || `${off?.course_code || 'Course'}_Description.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);
      } else {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Could not load course description PDF', 'error');
    } finally {
      setSyllabusViewing(false);
    }
  };

  const handleDeleteSyllabusPdf = async () => {
    if (!activeId || !window.confirm('Remove the uploaded course description PDF?')) return;
    try {
      await classroomApi.deleteSyllabusPdf(activeId);
      showToast('Course description PDF removed', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Failed to remove course description PDF', 'error');
    }
  };

  const handleUploadRosterFile = async (file: File | null | undefined) => {
    if (!activeId || !file || rosterUploading) return;
    setRosterUploading(true);
    setRosterUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (rosterDefaultSection) {
        fd.append('default_section', rosterDefaultSection);
      }
      const resData = await classroomApi.uploadRoster(activeId, fd);
      setRosterUploadResult(resData || null);
      showToast(resData?.message || 'Student email roster imported!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to import roster file',
        'error'
      );
    } finally {
      setRosterUploading(false);
    }
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingSub || !activeId || savingGrade) return;
    setSavingGrade(true);
    try {
      await classroomApi.gradeSubmission(gradingSub.id, {
        marks_obtained: Number(gradeMarks),
        feedback: gradeFeedback,
      });
      showToast(`Saved marks for ${gradingSub.student_name}`, 'success');
      setGradingSub(null);
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'Failed to save grade', 'error');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleImportTcsRoster = async () => {
    if (!activeId || !tcsCsvText.trim()) return;
    try {
      const resData = await classroomApi.importTcsRoster(activeId, tcsCsvText);
      showToast(resData?.message || 'TCS iON Roster synced!', 'success');
      await loadWorkspace(activeId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || err?.message || 'TCS iON import failed', 'error');
    }
  };

  const handleDownloadTcsMarksCsv = async () => {
    if (!activeId) return;
    try {
      const rawBlob = await classroomApi.exportTcsMarksCsv(activeId);
      const blobUrl = window.URL.createObjectURL(new Blob([rawBlob], { type: 'text/csv' }));
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

  const offeringSectionsList: string[] = React.useMemo(() => {
    const raw: string[] = Array.isArray(off?.sections) ? off.sections : [];
    const cleaned = raw.map((s) => String(s || '').trim()).filter((s) => s && !/^all$/i.test(s));
    return cleaned.length > 0 ? cleaned : ['Sec A'];
  }, [off?.sections]);

  const myAssignedSections: string[] = React.useMemo(() => {
    const raw: string[] = Array.isArray(perms.assigned_sections) ? perms.assigned_sections : ['ALL'];
    return raw.length > 0 ? raw : ['ALL'];
  }, [perms.assigned_sections]);

  const isUnrestrictedStaff = Boolean(
    perms.is_admin || myAssignedSections.some((s) => s.toUpperCase() === 'ALL')
  );

  // Sync section defaults cleanly when entering a classroom or changing teaching sections
  useEffect(() => {
    if (!off?.id) return;
    if (isUnrestrictedStaff) {
      setSectionViewFilter('ALL');
      setAnnTargetSections(['ALL']);
      setAsgnTargetSections(['ALL']);
      setRosterDefaultSection(offeringSectionsList[0] || 'Sec A');
      setTaSection('ALL');
    } else {
      setSectionViewFilter(myAssignedSections.length === 1 ? myAssignedSections[0] : 'ALL');
      setAnnTargetSections(myAssignedSections);
      setAsgnTargetSections(myAssignedSections);
      setRosterDefaultSection(myAssignedSections[0] || offeringSectionsList[0] || 'Sec A');
      setTaSection(myAssignedSections[0] || 'Sec A');
    }
  }, [off?.id, isUnrestrictedStaff, JSON.stringify(myAssignedSections)]);

  const toggleTargetChip = (currentList: string[], chip: string): string[] => {
    if (chip === 'ALL') return ['ALL'];
    const base = currentList.filter((s) => s.toUpperCase() !== 'ALL');
    const exists = base.some((s) => s.toLowerCase() === chip.toLowerCase());
    if (exists) {
      const rem = base.filter((s) => s.toLowerCase() !== chip.toLowerCase());
      return rem.length > 0 ? rem : [chip];
    }
    return [...base, chip];
  };

  const toggleMySectionChip = (sec: string) => {
    if (sec === 'ALL') {
      handleSelectMyTeachingSections(['ALL']);
      return;
    }
    const base = myAssignedSections.filter((s) => s.toUpperCase() !== 'ALL');
    const exists = base.some((s) => s.toLowerCase() === sec.toLowerCase());
    let next: string[];
    if (exists) {
      const rem = base.filter((s) => s.toLowerCase() !== sec.toLowerCase());
      next = rem.length > 0 ? rem : ['ALL'];
    } else {
      next = [...base, sec];
    }
    handleSelectMyTeachingSections(next);
  };

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
                <span>Faculty</span>
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

      {/* Full-Width Classroom Shell: Persistent Left Sidebar + Home Hub or Active Course */}
      <main className="relative z-10 flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-start gap-6">
          <ClassroomSidebar
            offerings={offerings}
            activeOfferingId={offeringId ? Number(offeringId) : null}
            pendingCount={
              allTasks.filter((t) =>
                isProfessorOrAdmin || taOfferingSet.has(Number(t.offering_id))
                  ? t.pending_grading > 0
                  : !t.submitted
              ).length
            }
            homeViewMode={homeViewMode}
            onGoHome={handleGoClassroomHome}
            onSelectOffering={(id) => handleSelectOffering(id, 'stream')}
            onPrefetchOffering={prefetchWorkspace}
          />

          <div className="flex-1 min-w-0 space-y-6">
        <AnimatePresence>
          {toast && (
            <div className="fixed top-20 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
              <motion.div
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className={`pointer-events-auto max-w-lg w-full sm:w-auto px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-4 border shadow-[var(--shadow-elevated)] backdrop-blur-md ${
                  toast.type === 'error'
                    ? 'bg-rose-50/95 dark:bg-[#1E1316]/95 border-rose-500/35 text-rose-800 dark:text-rose-200'
                    : 'bg-white/95 dark:bg-[#131817]/95 border-emerald-500/35 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {toast.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="font-medium truncate">{toast.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="text-xs font-mono-tabular underline ml-2 shrink-0 hover:opacity-80 active:scale-[0.95] transition-transform duration-150"
                >
                  Dismiss
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Mobile / Compact Back-to-Home & Course Switcher Bar when inside a specific course */}
        {offeringId && (
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E5E2DC] dark:border-white/10">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleGoClassroomHome('home')}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white/95 dark:bg-[#13131A]/95 border border-[#E5E2DC] dark:border-white/15 hover:border-[#896ABD] transition-[border-color]"
              >
                <span>← All Classes &amp; Tasks</span>
              </button>
              <button
                type="button"
                onClick={() => handleGoClassroomHome('todo')}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#896ABD]/10 text-[#5B3B96] border border-[#896ABD]/30 hover:bg-[#896ABD]/15"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>To-do</span>
              </button>
            </div>

            <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-1">
              {offerings.map((item) => {
                const isSelected = Number(item.id) === Number(activeId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectOffering(item.id, 'stream')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold shrink-0 border ${
                      isSelected
                        ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] border-transparent'
                        : 'bg-white/95 dark:bg-[#13131A]/95 border-[#E5E2DC] dark:border-white/15'
                    }`}
                  >
                    {item.course_code}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!offeringId ? (
          offeringsLoading && offerings.length === 0 ? (
            <div className="space-y-4">
              <div className={`${cardSurface} p-6 animate-pulse space-y-3`}>
                <div className="h-5 w-40 rounded bg-black/10" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="h-20 rounded-xl bg-black/[0.06]" />
                  <div className="h-20 rounded-xl bg-black/[0.06]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`${cardSurface} h-64 animate-pulse`} />
                ))}
              </div>
            </div>
          ) : (
            <ClassroomHomeHub
              offerings={offerings}
              tasks={allTasks}
              isProfessorOrAdmin={isProfessorOrAdmin}
              taOfferingIds={user?.ta_offering_ids || []}
              joinCodeInput={joinCodeInput}
              onJoinCodeChange={setJoinCodeInput}
              onJoinByCode={handleJoinByCode}
              onOpenClass={handleSelectOffering}
              onPrefetchClass={prefetchWorkspace}
              onCustomizeBanner={openBannerModal}
              onOpenReleaseModal={() => setShowReleaseModal(true)}
              viewFilter={homeViewMode}
              onChangeViewFilter={setHomeViewMode}
            />
          )
        ) : workspaceLoading && !workspace ? (
          (() => {
            const previewOff = offerings.find((o) => Number(o.id) === Number(offeringId));
            return (
              <div className="space-y-5">
                <section className={`${cardSurface} overflow-hidden`}>
                  <div className="relative h-36 bg-[#0F121C] overflow-hidden p-6 flex flex-col justify-end">
                    {previewOff && (
                      <img
                        src={getCourseBannerImage(previewOff)}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover opacity-85"
                      />
                    )}
                    <div className="absolute inset-0" style={COURSE_BANNER_SCRIM_STYLE} />
                    <div className="relative z-10 space-y-1.5">
                      {previewOff ? (
                        <>
                          <span className="inline-block px-2.5 py-0.5 rounded bg-black/55 border border-white/25 font-mono-tabular text-xs font-semibold text-white">
                            {previewOff.course_code}
                          </span>
                          <h1
                            className="text-2xl font-bold text-white"
                            style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                          >
                            {previewOff.course_name}
                          </h1>
                        </>
                      ) : (
                        <div className="h-7 w-64 rounded bg-white/20 animate-pulse" />
                      )}
                    </div>
                  </div>
                  <div className="p-6 space-y-3 animate-pulse">
                    <div className="h-4 w-2/3 rounded bg-black/[0.08]" />
                    <div className="h-4 w-1/2 rounded bg-black/[0.06]" />
                  </div>
                </section>
                <div className={`${cardSurface} p-6 space-y-3 animate-pulse`}>
                  <div className="h-5 w-48 rounded bg-black/[0.08]" />
                  <div className="h-24 rounded-xl bg-black/[0.05]" />
                </div>
              </div>
            );
          })()
        ) : !workspace || !off ? (
          <div className={`${cardSurface} p-8 sm:p-10 text-center space-y-4 max-w-2xl mx-auto`}>
            <ShieldCheck className="w-9 h-9 text-[#E04F33] mx-auto" />
            <div className="space-y-1.5">
              <span className="inline-flex px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                Access Restricted · Not Enrolled
              </span>
              <h2 className="text-lg font-semibold text-[#0A0A0C]">
                {offerings.length === 0
                  ? 'You are not enrolled in this classroom'
                  : 'You do not have permission to open this classroom'}
              </h2>
              <p className="text-xs sm:text-sm text-[#5C5B57] max-w-md mx-auto leading-relaxed">
                {workspaceAccessError ||
                  'Course classrooms are restricted to enrolled batch/elective students, teaching assistants, and assigned instructors.'}
              </p>
            </div>

            {!isProfessorOrAdmin && (
              <form
                onSubmit={handleJoinByCode}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-md mx-auto pt-1"
              >
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="Have an elective join code? e.g. JK-CS302"
                  className={`${inputSurface} flex-1 font-mono-tabular uppercase text-xs`}
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white text-xs font-semibold transition-colors shrink-0"
                >
                  Join Elective
                </button>
              </form>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              {activeId && !isProfessorOrAdmin && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const resData = await classroomApi.submitEnrollmentRequest(activeId, {
                        reason: 'Late registration / classroom access request',
                      });
                      showToast(resData?.message || 'Enrollment request sent to faculty', 'success');
                    } catch (err: any) {
                      showToast(
                        err?.response?.data?.detail || 'Could not submit enrollment request',
                        'error'
                      );
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#896ABD] text-white text-xs font-semibold"
                >
                  Request Enrollment Access
                </button>
              )}
              <button
                type="button"
                onClick={() => handleGoClassroomHome('home')}
                className="px-4 py-2 rounded-xl bg-[#E04F33] text-white text-xs font-semibold hover:opacity-90"
              >
                Back to My Classrooms
              </button>
              {offerings.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSelectOffering(offerings[0].id)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] bg-white text-xs font-semibold hover:border-[#896ABD]"
                >
                  Open {offerings[0].course_code}
                </button>
              )}
              <Link
                to="/past-papers"
                className="px-4 py-2 rounded-xl border border-[#E5E2DC] text-xs font-medium hover:border-[#896ABD]"
              >
                Browse Past Papers
              </Link>
              <Link
                to="/faculty"
                className="px-4 py-2 rounded-xl border border-[#E5E2DC] text-xs font-medium hover:border-[#896ABD]"
              >
                Faculty
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ConfettiBurst triggerKey={submitCelebrationKey} />
            {/* Editorial Course Header Card with Guaranteed-Contrast Banner */}
            <section className={`${cardSurface} overflow-hidden`}>
              {/* Visual Course Banner Strip (Custom Professor Image or Preset + Guaranteed Dark Scrim) */}
              <div className="relative h-36 sm:h-44 w-full overflow-hidden bg-[#0F121C]">
                <img
                  src={getCourseBannerImage(off)}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.fallback) {
                      target.dataset.fallback = '1';
                      target.src = '/illustrations/course-banner-1.jpg';
                    }
                  }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={COURSE_BANNER_SCRIM_STYLE}
                  aria-hidden="true"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(420px circle at 88% 25%, rgba(224,79,51,0.28), transparent 62%), radial-gradient(460px circle at 18% 85%, rgba(137,106,189,0.28), transparent 60%)',
                  }}
                />
                <div className="relative z-10 h-full p-5 sm:p-7 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="px-2.5 py-0.5 rounded-md font-mono-tabular font-semibold bg-black/55 border border-white/25 text-white backdrop-blur-sm">
                        {off.course_code}
                      </span>
                      <span
                        className="font-mono-tabular text-white/95 font-medium"
                        style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                      >
                        {off.programme} · Batch {off.batch_year} · Semester {off.semester} ({off.section})
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] bg-black/45 border border-white/20 text-white/95 backdrop-blur-sm">
                        TCS iON: {off.tcs_ion_course_id || `TCS-ION-${off.course_code}`}
                      </span>
                    </div>

                    {perms.can_manage_course && (
                      <button
                        type="button"
                        onClick={() => openBannerModal(off)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/60 hover:bg-[#E04F33] text-white border border-white/25 backdrop-blur-sm shadow-sm transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Customize Banner</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <h1
                      className="text-2xl sm:text-3xl font-bold tracking-tight text-white"
                      style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                    >
                      {off.course_name}
                    </h1>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-7 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-3 max-w-3xl">
                  {off.description && (
                    <p className="text-xs sm:text-sm text-[#353430] max-w-2xl leading-relaxed">
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

                  {!perms.is_instructor && !perms.is_admin && !perms.is_ta && perms.my_section && (
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10">
                      <span className="text-[#5C5B57] dark:text-[#94938E]">Your Section</span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] font-semibold bg-[#896ABD]/12 text-[#5B3B96]">
                          {perms.my_section}
                        </span>
                        <StudentSectionTransferButton
                          offeringId={Number(off.id)}
                          currentSection={perms.my_section}
                          sections={offeringSectionsList}
                          onToast={showToast}
                        />
                      </div>
                    </div>
                  )}

                  {(perms.is_instructor || perms.is_ta || perms.is_admin) && (
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E5E2DC]/70 dark:border-white/10">
                      <span className="text-[#5C5B57] dark:text-[#94938E]">Teaching Scope</span>
                      <span className="px-2 py-0.5 rounded font-mono-tabular text-[11px] font-semibold bg-[#896ABD]/12 text-[#5B3B96]">
                        {isUnrestrictedStaff ? 'All Sections' : myAssignedSections.join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Strictly Student-Only TCS iON Attendance */}
                  {!perms.is_instructor &&
                    !perms.is_admin &&
                    !perms.is_ta &&
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

                  <div className="pt-1.5 space-y-2">
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
              !perms.is_ta &&
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

            {/* Staff Multi-Section Self-Selection & Cross-Section View Filter Bar */}
            {(perms.is_instructor || perms.is_ta || perms.is_admin) && (
              <div className={`${cardSurface} px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs`}>
                {perms.is_instructor && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-tabular text-[10px] uppercase tracking-wider font-semibold text-[#5C5B57]">
                      I Teach Section(s):
                    </span>
                    <button
                      type="button"
                      disabled={savingMySections}
                      onClick={() => toggleMySectionChip('ALL')}
                      className={`px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold border transition-colors ${
                        isUnrestrictedStaff
                          ? 'bg-[#0A0A0C] text-white border-[#0A0A0C]'
                          : 'bg-[#FAF9F6] text-[#353430] border-[#DDD8CE] hover:border-[#896ABD]'
                      }`}
                    >
                      All Sections
                    </button>
                    {offeringSectionsList.map((sec) => {
                      const active =
                        !isUnrestrictedStaff &&
                        myAssignedSections.some((s) => s.toLowerCase() === sec.toLowerCase());
                      return (
                        <button
                          key={sec}
                          type="button"
                          disabled={savingMySections}
                          onClick={() => toggleMySectionChip(sec)}
                          className={`px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold border transition-colors ${
                            active
                              ? 'bg-[#E04F33] text-white border-[#E04F33]'
                              : 'bg-[#FAF9F6] text-[#353430] border-[#DDD8CE] hover:border-[#896ABD]'
                          }`}
                        >
                          {sec}
                        </button>
                      );
                    })}
                    <form onSubmit={handleAddCourseSection} className="inline-flex items-center gap-1 ml-1">
                      <input
                        type="text"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                        placeholder="+ Sec C"
                        className="w-20 px-2 py-1 rounded-lg border border-[#DDD8CE] bg-white text-[11px] focus:outline-none focus:border-[#896ABD]"
                      />
                      {newSectionName.trim() && (
                        <button
                          type="submit"
                          disabled={addingSection}
                          className="px-2 py-1 rounded-lg bg-[#896ABD] text-white text-[10px] font-semibold"
                        >
                          Add
                        </button>
                      )}
                    </form>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono-tabular text-[10px] uppercase tracking-wider font-semibold text-[#5C5B57] mr-1">
                    View Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSectionViewFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold border transition-colors ${
                      sectionViewFilter === 'ALL'
                        ? 'bg-[#896ABD] text-white border-[#896ABD]'
                        : 'bg-white text-[#353430] border-[#DDD8CE] hover:border-[#896ABD]'
                    }`}
                  >
                    All Sections
                  </button>
                  {offeringSectionsList.map((sec) => {
                    const isMine =
                      isUnrestrictedStaff ||
                      myAssignedSections.some((s) => s.toLowerCase() === sec.toLowerCase());
                    return (
                      <button
                        key={`view-${sec}`}
                        type="button"
                        onClick={() => setSectionViewFilter(sec)}
                        className={`px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold border transition-colors ${
                          sectionViewFilter.toLowerCase() === sec.toLowerCase()
                            ? 'bg-[#896ABD] text-white border-[#896ABD]'
                            : 'bg-white text-[#353430] border-[#DDD8CE] hover:border-[#896ABD]'
                        }`}
                      >
                        {sec}
                        {!isMine ? ' (Read-only)' : ''}
                      </button>
                    );
                  })}
                  <div className="ml-auto">
                    <StudentPreviewBanner
                      previewSection={studentPreviewSection}
                      sections={offeringSectionsList}
                      onChangePreview={(sec) => {
                        setStudentPreviewSection(sec);
                        if (sec) setSectionViewFilter(sec);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {studentPreviewSection && (
              <StudentPreviewBanner
                previewSection={studentPreviewSection}
                sections={offeringSectionsList}
                onChangePreview={(sec) => {
                  setStudentPreviewSection(sec);
                  if (sec) setSectionViewFilter(sec);
                }}
              />
            )}

            {/* Single-Row Scannable Navigation Tabs + Primary CTA */}
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#E5E2DC] dark:border-white/10 pb-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  [
                    {
                      id: 'stream' as const,
                      label: 'Stream',
                      count:
                        (workspace.announcements?.length || 0) +
                        (workspace.assignments?.length || 0),
                      icon: <MessageSquare className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'classwork' as const,
                      label: 'Classwork',
                      count: workspace.assignments.length,
                      icon: <FileCheck2 className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'materials' as const,
                      label: 'Materials',
                      count: null,
                      icon: <BookOpen className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'quizzes' as const,
                      label: 'Quizzes',
                      count: null,
                      icon: <Clock className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'attendance' as const,
                      label: 'Attendance',
                      count: null,
                      icon: <ListChecks className="w-3.5 h-3.5" />,
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
                      className={`relative px-4 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 border transition-[border-color] ${
                        isActive
                          ? 'text-[#FAF9F6] dark:text-[#0A0A0C] border-transparent'
                          : 'bg-white/95 dark:bg-[#13131A]/95 border-[#E5E2DC] dark:border-white/10 hover:border-[#896ABD]/50 text-[#0A0A0C] dark:text-[#F5F4F0]'
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
              <ClassroomStreamTab
                workspace={workspace}
                off={off}
                perms={perms}
                user={user}
                cardSurface={cardSurface}
                inputSurface={inputSurface}
                offeringSectionsList={offeringSectionsList}
                myAssignedSections={myAssignedSections}
                isUnrestrictedStaff={isUnrestrictedStaff}
                sectionViewFilter={sectionViewFilter}
                setSectionViewFilter={setSectionViewFilter}
                studentPreviewSection={studentPreviewSection}
                annTitle={annTitle}
                setAnnTitle={setAnnTitle}
                annContent={annContent}
                setAnnContent={setAnnContent}
                annDriveUrl={annDriveUrl}
                setAnnDriveUrl={setAnnDriveUrl}
                annPinned={annPinned}
                setAnnPinned={setAnnPinned}
                annScheduledFor={annScheduledFor}
                setAnnScheduledFor={setAnnScheduledFor}
                annFile={annFile}
                setAnnFile={setAnnFile}
                annUploadProgress={annUploadProgress}
                annUploading={annUploading}
                annFileInputRef={annFileInputRef}
                annTargetSections={annTargetSections}
                setAnnTargetSections={setAnnTargetSections}
                toggleTargetChip={toggleTargetChip}
                commentInputs={commentInputs}
                setCommentInputs={setCommentInputs}
                expandedStreamIds={expandedStreamIds}
                setExpandedStreamIds={setExpandedStreamIds}
                syllabusInputRef={syllabusInputRef}
                syllabusUploading={syllabusUploading}
                syllabusViewing={syllabusViewing}
                handleUploadSyllabusPdf={handleUploadSyllabusPdf}
                handleOpenSyllabusPdf={handleOpenSyllabusPdf}
                handleDeleteSyllabusPdf={handleDeleteSyllabusPdf}
                handlePostAnnouncement={handlePostAnnouncement}
                handlePostComment={handlePostComment}
                handleToggleVerifyComment={handleToggleVerifyComment}
                handleTogglePinAnnouncement={handleTogglePinAnnouncement}
                handleToggleAllowComments={handleToggleAllowComments}
                handleDeleteAnnouncement={handleDeleteAnnouncement}
                handleDeleteComment={handleDeleteComment}
                handleDeleteAssignment={handleDeleteAssignment}
                setActiveTab={setActiveTab}
                setSubmittingAssignment={setSubmittingAssignment}
                setDirectLinkUrl={setDirectLinkUrl}
                setSubmissionNotes={setSubmissionNotes}
                setEditingAnn={setEditingAnn}
                setEditAnnTitle={setEditAnnTitle}
                setEditAnnContent={setEditAnnContent}
                setEditingAsgn={setEditingAsgn}
                setEditAsgnForm={setEditAsgnForm}
                showToast={showToast}
              />
            )}

            {/* TAB 2: CLASSWORK */}
            {activeTab === 'classwork' && (
              <ClassroomClassworkTab
                workspace={workspace}
                off={off}
                perms={perms}
                cardSurface={cardSurface}
                sectionViewFilter={sectionViewFilter}
                reducedMotion={reducedMotion}
                similarityReports={similarityReports}
                setSimilarityReports={setSimilarityReports}
                similarityLoadingId={similarityLoadingId}
                setSimilarityLoadingId={setSimilarityLoadingId}
                loadWorkspace={loadWorkspace}
                handleDeleteAssignment={handleDeleteAssignment}
                setShowNewAssignmentModal={setShowNewAssignmentModal}
                setSubmittingAssignment={setSubmittingAssignment}
                setDirectLinkUrl={setDirectLinkUrl}
                setSubmissionNotes={setSubmissionNotes}
                setEditingAsgn={setEditingAsgn}
                setEditAsgnForm={setEditAsgnForm}
                setGroupModalAsgn={setGroupModalAsgn}
                setDrawerTarget={setDrawerTarget}
                setGradingSub={setGradingSub}
                setGradeMarks={setGradeMarks}
                setGradeFeedback={setGradeFeedback}
                showToast={showToast}
              />
            )}

            {/* TAB 3: PEOPLE (Zero emojis, zero time/hours strings) */}
            {activeTab === 'people' && (
              <ClassroomPeopleTab
                workspace={workspace}
                off={off}
                perms={perms}
                user={user}
                cardSurface={cardSurface}
                offeringSectionsList={offeringSectionsList}
                myAssignedSections={myAssignedSections}
                isUnrestrictedStaff={isUnrestrictedStaff}
                sectionViewFilter={sectionViewFilter}
                studentPreviewSection={studentPreviewSection}
                coProfEmail={coProfEmail}
                setCoProfEmail={setCoProfEmail}
                coProfRole={coProfRole}
                setCoProfRole={setCoProfRole}
                coProfSection={coProfSection}
                setCoProfSection={setCoProfSection}
                taSection={taSection}
                setTaSection={setTaSection}
                newTaForm={newTaForm}
                setNewTaForm={setNewTaForm}
                rosterDefaultSection={rosterDefaultSection}
                setRosterDefaultSection={setRosterDefaultSection}
                rosterUploading={rosterUploading}
                rosterUploadResult={rosterUploadResult}
                setRosterUploadResult={setRosterUploadResult}
                rosterInputRef={rosterInputRef}
                loadWorkspace={loadWorkspace}
                loadOfferingsList={loadOfferingsList}
                handleSelectOffering={handleSelectOffering}
                handleAddCoProfessor={handleAddCoProfessor}
                handleUpdateInstructorSection={handleUpdateInstructorSection}
                handleRemoveInstructor={handleRemoveInstructor}
                handleAddCourseTA={handleAddCourseTA}
                handleToggleTaPerm={handleToggleTaPerm}
                handleRemoveTa={handleRemoveTa}
                handleUpdateStudentSection={handleUpdateStudentSection}
                handleRemoveStudent={handleRemoveStudent}
                handleUploadRosterFile={handleUploadRosterFile}
                showToast={showToast}
              />
            )}

            {/* TAB: STRUCTURED MATERIALS, MODULES & AUTO-LINKED PAST PAPERS */}
            {activeTab === 'materials' && (
              <ModulesResourcesTab
                offeringId={Number(off.id)}
                courseCode={off.course_code}
                isStaff={Boolean(perms.is_instructor || perms.is_admin || perms.is_ta)}
                canCreate={Boolean(perms.can_announce || perms.can_manage_course)}
                allowedSections={isUnrestrictedStaff ? offeringSectionsList : myAssignedSections}
                previewSection={studentPreviewSection}
                onToast={showToast}
              />
            )}

            {/* TAB: IN-PORTAL TIMED QUIZZES */}
            {activeTab === 'quizzes' && (
              <QuizEnginePanel
                offeringId={Number(off.id)}
                courseCode={off.course_code}
                isStaff={Boolean(perms.is_instructor || perms.is_admin || perms.is_ta)}
                canCreate={Boolean(perms.can_announce || perms.can_manage_course)}
                allowedSections={isUnrestrictedStaff ? offeringSectionsList : myAssignedSections}
                previewSection={studentPreviewSection}
                onRefreshWorkspace={() => loadWorkspace(Number(off.id), { forceSilent: true })}
                onToast={showToast}
              />
            )}

            {/* TAB: DAILY ATTENDANCE, PIN/QR CHECK-IN & OD LEAVE */}
            {activeTab === 'attendance' && (
              <AttendancePanel
                offeringId={Number(off.id)}
                isStaff={Boolean(perms.is_instructor || perms.is_admin || perms.is_ta)}
                canManage={Boolean(perms.can_manage_course)}
                allowedSections={isUnrestrictedStaff ? offeringSectionsList : myAssignedSections}
                sectionFilter={sectionViewFilter}
                roster={workspace.roster || []}
                previewSection={studentPreviewSection}
                onRefreshWorkspace={() => loadWorkspace(Number(off.id), { forceSilent: true })}
                onToast={showToast}
              />
            )}

            {/* TAB 4: TCS iON BRIDGE & GOOGLE DRIVE GRADEBOOK */}
            {activeTab === 'tcs_gradebook' && (
              <div className="space-y-6">
                {((!perms.can_grade && !perms.can_manage_course) || studentPreviewSection) && (
                  <MyGradesAttendancePanel
                    offeringId={Number(off.id)}
                    previewSection={studentPreviewSection}
                    onToast={showToast}
                  />
                )}

                {/* Interactive Excel Marks Sheet & Offline .xlsx Download / Upload (Faculty & Grading TAs) */}
                {(perms.can_manage_course || perms.can_grade) && !studentPreviewSection && (
                  <>
                    <ExcelMarksSheet
                      offeringId={Number(off.id)}
                      courseCode={off.course_code}
                      roster={workspace.roster || []}
                      assignments={workspace.assignments || []}
                      sections={offeringSectionsList}
                      assignedSections={myAssignedSections}
                      onMarksSaved={async () => {
                        await loadWorkspace(Number(off.id), { forceSilent: true });
                        await loadOfferingsList(true);
                      }}
                      showToast={showToast}
                    />
                    <GradebookExtrasPanel
                      offeringId={Number(off.id)}
                      reevalEnabledInitial={off.reeval_enabled !== false}
                      gradeWeightsInitial={off.grade_weights}
                      assignments={workspace.assignments || []}
                      sectionFilter={sectionViewFilter}
                      canManageCourse={Boolean(perms.can_manage_course)}
                      onRefreshWorkspace={() => loadWorkspace(Number(off.id), { forceSilent: true })}
                      onToast={showToast}
                    />
                  </>
                )}

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
                                    className="h-full w-full origin-left rounded-full bg-[#896ABD] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, (ratePct !== null ? Math.max(4, ratePct) : 0) / 100))})` }}
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

                {perms.can_manage_course || perms.can_grade ? (
                  <section className={`${cardSurface} lg:col-span-6 p-6 space-y-4`}>
                    <div>
                      <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700">
                        Zero-Bloat Architecture
                      </span>
                      <h3 className="text-lg font-semibold mt-1.5">
                        Google Drive Link-Only Storage Telemetry
                      </h3>
                      <p className="text-xs text-[#353430] mt-1">
                        Every student file is uploaded straight from the browser to their Drive and shared with course faculty.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
                        <div className="text-[#353430]">DB Storage per Submission</div>
                        <div className="text-xl font-mono-tabular font-semibold text-emerald-700 mt-0.5">
                          ~250 Bytes
                        </div>
                        <div className="text-[11px] text-[#44433E]">
                          Text URL only (0 MB blobs)
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
                        <div className="text-[#353430]">Backend File Bandwidth</div>
                        <div className="text-xl font-mono-tabular font-semibold text-emerald-700 mt-0.5">
                          0.00 MB
                        </div>
                        <div className="text-[11px] text-[#44433E]">
                          Direct Browser → Drive Link
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] text-xs space-y-1">
                      <div className="font-semibold text-[#0A0A0C]">
                        Auto-Shared Faculty &amp; TA Recipients
                      </div>
                      <div className="font-mono-tabular text-[11px] text-[#353430]">
                        {workspace.auto_share_emails?.join(' · ') || 'No faculty emails'}
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className={`${cardSurface} lg:col-span-6 p-6 space-y-4`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/12 text-emerald-800">
                          Student Gradebook Summary
                        </span>
                        <h3 className="text-lg font-semibold mt-1.5 text-[#0A0A0C]">
                          Your Assignment Grades &amp; Attendance
                        </h3>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-[#FAF9F6] border border-[#DDD8CE] text-xs font-mono-tabular">
                        Attendance:{' '}
                        <strong
                          className={
                            perms.my_attendance_pct !== null &&
                            perms.my_attendance_pct !== undefined &&
                            perms.my_attendance_pct < 75
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                          }
                        >
                          {perms.my_attendance_pct !== null && perms.my_attendance_pct !== undefined
                            ? `${perms.my_attendance_pct}%`
                            : 'Not Synced'}
                        </strong>
                      </div>
                    </div>

                    {workspace.assignments.length === 0 ? (
                      <p className="text-xs text-[#353430] py-4">
                        No graded classwork items published yet in this course.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {workspace.assignments.map((asgn: any) => {
                          const mySub = asgn.my_submission;
                          const hasMarks =
                            mySub &&
                            mySub.marks_obtained !== null &&
                            mySub.marks_obtained !== undefined;
                          const maxM = Number(asgn.max_marks || 100);
                          const pct =
                            hasMarks && maxM > 0
                              ? Math.round((Number(mySub.marks_obtained) / maxM) * 100)
                              : null;

                          return (
                            <div
                              key={asgn.id}
                              className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#DDD8CE] text-xs space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-sm text-[#0A0A0C] truncate">
                                    {asgn.title}
                                  </div>
                                  <div className="font-mono-tabular text-[11px] text-[#353430]">
                                    {asgn.assignment_type} · Max {maxM} marks
                                    {asgn.due_at
                                      ? ` · Due ${new Date(asgn.due_at).toLocaleDateString()}`
                                      : ''}
                                  </div>
                                </div>

                                {hasMarks ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-mono-tabular font-semibold shrink-0">
                                    {mySub.marks_obtained} / {maxM}
                                    {pct !== null ? ` (${pct}%)` : ''}
                                  </span>
                                ) : mySub ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-semibold shrink-0">
                                    Turned In · Pending Grade
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-semibold shrink-0">
                                    Not Submitted
                                  </span>
                                )}
                              </div>

                              {mySub?.feedback && (
                                <p className="p-2.5 rounded-lg bg-white border border-[#E5E2DC] text-[#353430] leading-relaxed">
                                  <strong className="text-[#0A0A0C]">
                                    {mySub.graded_by_name
                                      ? `${mySub.graded_by_name}: `
                                      : 'Feedback: '}
                                  </strong>
                                  {mySub.feedback}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>
              </div>
            )}
          </>
        )}
          </div>
        </div>
      </main>

      <ClassroomModals
        workspace={workspace}
        off={off}
        perms={perms}
        user={user}
        activeId={activeId}
        inputSurface={inputSurface}
        offeringSectionsList={offeringSectionsList}
        myAssignedSections={myAssignedSections}
        isUnrestrictedStaff={isUnrestrictedStaff}
        toggleTargetChip={toggleTargetChip}
        loadWorkspace={loadWorkspace}
        loadOfferingsList={loadOfferingsList}
        handleSelectOffering={handleSelectOffering}
        showToast={showToast}
        submittingAssignment={submittingAssignment}
        setSubmittingAssignment={setSubmittingAssignment}
        submittingWork={submittingWork}
        submitMode={submitMode}
        setSubmitMode={setSubmitMode}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        uploadProgress={uploadProgress}
        setUploadProgress={setUploadProgress}
        directLinkUrl={directLinkUrl}
        setDirectLinkUrl={setDirectLinkUrl}
        submissionNotes={submissionNotes}
        setSubmissionNotes={setSubmissionNotes}
        fileInputRef={fileInputRef}
        handleExecuteSubmission={handleExecuteSubmission}
        showNewAssignmentModal={showNewAssignmentModal}
        setShowNewAssignmentModal={setShowNewAssignmentModal}
        asgnAttachMode={asgnAttachMode}
        setAsgnAttachMode={setAsgnAttachMode}
        asgnFile={asgnFile}
        setAsgnFile={setAsgnFile}
        asgnUploadProgress={asgnUploadProgress}
        setAsgnUploadProgress={setAsgnUploadProgress}
        asgnPublishing={asgnPublishing}
        asgnFileInputRef={asgnFileInputRef}
        asgnForm={asgnForm}
        setAsgnForm={setAsgnForm}
        asgnTargetSections={asgnTargetSections}
        setAsgnTargetSections={setAsgnTargetSections}
        handleCreateAssignment={handleCreateAssignment}
        gradingSub={gradingSub}
        setGradingSub={setGradingSub}
        gradeMarks={gradeMarks}
        setGradeMarks={setGradeMarks}
        gradeFeedback={gradeFeedback}
        setGradeFeedback={setGradeFeedback}
        savingGrade={savingGrade}
        handleSaveGrade={handleSaveGrade}
        bannerModalOffering={bannerModalOffering}
        setBannerModalOffering={setBannerModalOffering}
        bannerDraftUrl={bannerDraftUrl}
        setBannerDraftUrl={setBannerDraftUrl}
        bannerUploadKb={bannerUploadKb}
        setBannerUploadKb={setBannerUploadKb}
        bannerCropFile={bannerCropFile}
        setBannerCropFile={setBannerCropFile}
        savingBanner={savingBanner}
        handleBannerFilePick={handleBannerFilePick}
        handleSaveCourseBanner={handleSaveCourseBanner}
        editingAnn={editingAnn}
        setEditingAnn={setEditingAnn}
        editAnnTitle={editAnnTitle}
        setEditAnnTitle={setEditAnnTitle}
        editAnnContent={editAnnContent}
        setEditAnnContent={setEditAnnContent}
        savingAnnEdit={savingAnnEdit}
        handleSaveAnnouncementEdit={handleSaveAnnouncementEdit}
        editingAsgn={editingAsgn}
        setEditingAsgn={setEditingAsgn}
        editAsgnForm={editAsgnForm}
        setEditAsgnForm={setEditAsgnForm}
        savingAsgnEdit={savingAsgnEdit}
        handleSaveAssignmentEdit={handleSaveAssignmentEdit}
        groupModalAsgn={groupModalAsgn}
        setGroupModalAsgn={setGroupModalAsgn}
        drawerTarget={drawerTarget}
        setDrawerTarget={setDrawerTarget}
        showReleaseModal={showReleaseModal}
        setShowReleaseModal={setShowReleaseModal}
      />

      <Footer />
    </div>
  );
};

export default ClassroomPage;
