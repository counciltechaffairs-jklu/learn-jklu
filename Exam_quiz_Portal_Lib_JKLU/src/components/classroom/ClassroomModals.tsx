import React from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  FACULTY_ALLOWED_ACCEPT,
  isGoogleDriveOAuthConfigured,
  validateFacultyResourceFile,
  validateSubmissionLink,
} from '@/utils/googleDriveSubmit';
import { safeExternalUrl } from '@/utils/safeUrl';
import {
  COURSE_BANNER_PRESETS,
  COURSE_BANNER_SCRIM_STYLE,
  COURSE_BANNER_TEXT_SHADOW,
  getCourseBannerImage,
} from '@/components/classroom/ClassroomHomeHub';
import { GroupFormationModal } from '@/components/classroom/GroupFormationModal';
import { SubmissionDrawer } from '@/components/classroom/SubmissionDrawer';
import { ReleaseCourseModal } from '@/components/classroom/ReleaseCourseModal';
import { FacultyPhotoCropModal } from '@/components/faculty/FacultyPhotoCropModal';
import type {
  ClassroomWorkspace,
  Offering,
  WorkspacePermissions,
} from '@/types/classroom';

export interface ClassroomModalsProps {
  workspace: ClassroomWorkspace | null;
  off: Offering | undefined;
  perms: WorkspacePermissions;
  user: any;
  activeId: number | null;
  inputSurface: string;
  offeringSectionsList: string[];
  myAssignedSections: string[];
  isUnrestrictedStaff: boolean;
  toggleTargetChip: (currentList: string[], chip: string) => string[];
  loadWorkspace: (id: number, opts?: { forceSilent?: boolean }) => Promise<void>;
  loadOfferingsList: (silent?: boolean) => Promise<void>;
  handleSelectOffering: (id: number, initialTab?: 'stream' | 'classwork') => void;
  showToast: (text: string, type?: 'success' | 'error') => void;

  // Submit assignment modal
  submittingAssignment: any | null;
  setSubmittingAssignment: React.Dispatch<React.SetStateAction<any | null>>;
  submittingWork: boolean;
  submitMode: 'GOOGLE_DRIVE_AUTO' | 'DIRECT_LINK' | 'NATIVE_UPLOAD';
  setSubmitMode: React.Dispatch<
    React.SetStateAction<'GOOGLE_DRIVE_AUTO' | 'DIRECT_LINK' | 'NATIVE_UPLOAD'>
  >;
  selectedFile: File | null;
  setSelectedFile: React.Dispatch<React.SetStateAction<File | null>>;
  uploadProgress: { stage: string; pct: number } | null;
  setUploadProgress: React.Dispatch<React.SetStateAction<{ stage: string; pct: number } | null>>;
  directLinkUrl: string;
  setDirectLinkUrl: React.Dispatch<React.SetStateAction<string>>;
  submissionNotes: string;
  setSubmissionNotes: React.Dispatch<React.SetStateAction<string>>;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleExecuteSubmission: (e: React.FormEvent) => Promise<void> | void;

  // Create assignment modal
  showNewAssignmentModal: boolean;
  setShowNewAssignmentModal: React.Dispatch<React.SetStateAction<boolean>>;
  asgnAttachMode: 'FILE' | 'LINK';
  setAsgnAttachMode: React.Dispatch<React.SetStateAction<'FILE' | 'LINK'>>;
  asgnFile: File | null;
  setAsgnFile: React.Dispatch<React.SetStateAction<File | null>>;
  asgnUploadProgress: { stage: string; pct: number } | null;
  setAsgnUploadProgress: React.Dispatch<
    React.SetStateAction<{ stage: string; pct: number } | null>
  >;
  asgnPublishing: boolean;
  asgnFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  asgnForm: {
    title: string;
    description: string;
    topic_module: string;
    assignment_type: string;
    resource_url: string;
    tcs_ion_launch_url: string;
    tcs_ion_exam_code: string;
    due_at: string;
    max_marks: string;
    is_group_assignment: boolean;
    max_group_size: string;
    late_penalty_pct_per_day: string;
    grace_minutes: string;
    grades_published: boolean;
  };
  setAsgnForm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string;
      topic_module: string;
      assignment_type: string;
      resource_url: string;
      tcs_ion_launch_url: string;
      tcs_ion_exam_code: string;
      due_at: string;
      max_marks: string;
      is_group_assignment: boolean;
      max_group_size: string;
      late_penalty_pct_per_day: string;
      grace_minutes: string;
      grades_published: boolean;
    }>
  >;
  asgnTargetSections: string[];
  setAsgnTargetSections: React.Dispatch<React.SetStateAction<string[]>>;
  handleCreateAssignment: (e: React.FormEvent) => Promise<void> | void;

  // Grade submission modal
  gradingSub: any | null;
  setGradingSub: React.Dispatch<React.SetStateAction<any | null>>;
  gradeMarks: string;
  setGradeMarks: React.Dispatch<React.SetStateAction<string>>;
  gradeFeedback: string;
  setGradeFeedback: React.Dispatch<React.SetStateAction<string>>;
  savingGrade: boolean;
  handleSaveGrade: (e: React.FormEvent) => Promise<void> | void;

  // Banner & crop modals
  bannerModalOffering: any | null;
  setBannerModalOffering: React.Dispatch<React.SetStateAction<any | null>>;
  bannerDraftUrl: string;
  setBannerDraftUrl: React.Dispatch<React.SetStateAction<string>>;
  bannerUploadKb: number | null;
  setBannerUploadKb: React.Dispatch<React.SetStateAction<number | null>>;
  bannerCropFile: File | null;
  setBannerCropFile: React.Dispatch<React.SetStateAction<File | null>>;
  savingBanner: boolean;
  handleBannerFilePick: (file: File | null | undefined) => void;
  handleSaveCourseBanner: (e: React.FormEvent) => Promise<void> | void;

  // Edit announcement modal
  editingAnn: any | null;
  setEditingAnn: React.Dispatch<React.SetStateAction<any | null>>;
  editAnnTitle: string;
  setEditAnnTitle: React.Dispatch<React.SetStateAction<string>>;
  editAnnContent: string;
  setEditAnnContent: React.Dispatch<React.SetStateAction<string>>;
  savingAnnEdit: boolean;
  handleSaveAnnouncementEdit: (e: React.FormEvent) => Promise<void> | void;

  // Edit assignment modal
  editingAsgn: any | null;
  setEditingAsgn: React.Dispatch<React.SetStateAction<any | null>>;
  editAsgnForm: {
    title: string;
    description: string;
    due_at: string;
    max_marks: string;
    allow_late: boolean;
  };
  setEditAsgnForm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string;
      due_at: string;
      max_marks: string;
      allow_late: boolean;
    }>
  >;
  savingAsgnEdit: boolean;
  handleSaveAssignmentEdit: (e: React.FormEvent) => Promise<void> | void;

  // Sub-modals & drawers
  groupModalAsgn: any | null;
  setGroupModalAsgn: React.Dispatch<React.SetStateAction<any | null>>;
  drawerTarget: { asgn: any; sub: any; canGrade: boolean } | null;
  setDrawerTarget: React.Dispatch<
    React.SetStateAction<{ asgn: any; sub: any; canGrade: boolean } | null>
  >;
  showReleaseModal: boolean;
  setShowReleaseModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ClassroomModals: React.FC<ClassroomModalsProps> = ({
  workspace,
  off,
  perms,
  user,
  activeId,
  inputSurface,
  offeringSectionsList,
  myAssignedSections,
  isUnrestrictedStaff,
  toggleTargetChip,
  loadWorkspace,
  loadOfferingsList,
  handleSelectOffering,
  showToast,
  submittingAssignment,
  setSubmittingAssignment,
  submittingWork,
  submitMode,
  setSubmitMode,
  selectedFile,
  setSelectedFile,
  uploadProgress,
  setUploadProgress,
  directLinkUrl,
  setDirectLinkUrl,
  submissionNotes,
  setSubmissionNotes,
  fileInputRef,
  handleExecuteSubmission,
  showNewAssignmentModal,
  setShowNewAssignmentModal,
  asgnAttachMode,
  setAsgnAttachMode,
  asgnFile,
  setAsgnFile,
  asgnUploadProgress,
  setAsgnUploadProgress,
  asgnPublishing,
  asgnFileInputRef,
  asgnForm,
  setAsgnForm,
  asgnTargetSections,
  setAsgnTargetSections,
  handleCreateAssignment,
  gradingSub,
  setGradingSub,
  gradeMarks,
  setGradeMarks,
  gradeFeedback,
  setGradeFeedback,
  savingGrade,
  handleSaveGrade,
  bannerModalOffering,
  setBannerModalOffering,
  bannerDraftUrl,
  setBannerDraftUrl,
  bannerUploadKb,
  setBannerUploadKb,
  bannerCropFile,
  setBannerCropFile,
  savingBanner,
  handleBannerFilePick,
  handleSaveCourseBanner,
  editingAnn,
  setEditingAnn,
  editAnnTitle,
  setEditAnnTitle,
  editAnnContent,
  setEditAnnContent,
  savingAnnEdit,
  handleSaveAnnouncementEdit,
  editingAsgn,
  setEditingAsgn,
  editAsgnForm,
  setEditAsgnForm,
  savingAsgnEdit,
  handleSaveAssignmentEdit,
  groupModalAsgn,
  setGroupModalAsgn,
  drawerTarget,
  setDrawerTarget,
  showReleaseModal,
  setShowReleaseModal,
}) => {
  return (
    <>
      {/* MODAL 1: ZERO-DB-STORAGE STUDENT ASSIGNMENT SUBMISSION */}
      {submittingAssignment && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="modal-panel-enter bg-white dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-[var(--shadow-elevated)]">
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

            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#FAF9F6] dark:bg-white/5 border border-[#E5E2DC]/70 dark:border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSubmitMode('NATIVE_UPLOAD')}
                className={`py-2 px-2 rounded-lg font-medium flex items-center justify-center gap-1 ${
                  submitMode === 'NATIVE_UPLOAD'
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                    : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload File</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmitMode('GOOGLE_DRIVE_AUTO')}
                className={`py-2 px-2 rounded-lg font-medium flex items-center justify-center gap-1 ${
                  submitMode === 'GOOGLE_DRIVE_AUTO'
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                    : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Drive OAuth</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmitMode('DIRECT_LINK')}
                className={`py-2 px-2 rounded-lg font-medium flex items-center justify-center gap-1 ${
                  submitMode === 'DIRECT_LINK'
                    ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                    : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Direct Link</span>
              </button>
            </div>

            <form onSubmit={handleExecuteSubmission} className="space-y-4 text-xs">
              {submitMode === 'NATIVE_UPLOAD' ? (
                <div className="space-y-2">
                  <label className="font-medium block">
                    Upload PDF / ZIP / DOCX / Code File (max 25 MB) *
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#896ABD]/40 hover:border-[#E04F33] rounded-xl p-5 text-center cursor-pointer bg-[#FAF9F6] space-y-1"
                  >
                    <UploadCloud className="w-6 h-6 text-[#896ABD] mx-auto" />
                    <div className="font-semibold text-[#0A0A0C]">
                      {selectedFile
                        ? `${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`
                        : 'Click to select PDF, ZIP, DOCX, PNG/JPG, PY, CPP, or IPYNB'}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.zip,.docx,.doc,.png,.jpg,.jpeg,.txt,.py,.cpp,.c,.ipynb,.csv"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </div>
                </div>
              ) : submitMode === 'GOOGLE_DRIVE_AUTO' ? (
                !isGoogleDriveOAuthConfigured() ? (
                  <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                    <div className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                      1-Click Google Drive Sign-In Unavailable
                    </div>
                    <p className="text-[#3A3936] dark:text-[#D0CEC8] leading-relaxed">
                      Because JKLU <code className="font-mono-tabular">@jklu.edu.in</code> email runs on Microsoft 365 and 1-click Google Drive OAuth is not active on this host, upload your assignment to your personal Google Drive, GitHub, Colab, or Overleaf first and submit the shared <code className="font-mono-tabular">https://</code> URL below.
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
                        Note: <code className="font-mono-tabular">@jklu.edu.in</code> is Microsoft 365 — sign in with your personal Google account when prompted to save to your Drive and auto-share reader access with{' '}
                        <strong>{workspace?.auto_share_emails?.join(', ')}</strong>.
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
                            className="h-full w-full origin-left bg-[#E04F33] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                            style={{ transform: `scaleX(${Math.max(0, Math.min(1, Number(uploadProgress.pct || 0) / 100))})` }}
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
                  disabled={
                    submittingWork ||
                    (submitMode === 'GOOGLE_DRIVE_AUTO' && !isGoogleDriveOAuthConfigured())
                  }
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {submittingWork
                    ? 'Submitting...'
                    : submitMode === 'NATIVE_UPLOAD'
                      ? 'Upload & Submit File'
                      : submitMode === 'GOOGLE_DRIVE_AUTO'
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
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="modal-panel-enter bg-white dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-[var(--shadow-elevated)]">
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
              <div className="space-y-1.5">
                <label className="font-medium block">Target Audience Sections</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {['ALL', ...(isUnrestrictedStaff ? offeringSectionsList : myAssignedSections)].map(
                    (chip) => {
                      const selected = asgnTargetSections.some(
                        (t) => t.toUpperCase() === chip.toUpperCase()
                      );
                      return (
                        <button
                          key={`asgn-target-${chip}`}
                          type="button"
                          onClick={() =>
                            setAsgnTargetSections((prev) => toggleTargetChip(prev, chip))
                          }
                          className={`px-2.5 py-1 rounded-lg border font-mono-tabular text-[11px] font-medium transition-colors ${
                            selected
                              ? 'bg-[#E04F33] text-white border-[#E04F33]'
                              : 'bg-white dark:bg-white/[0.04] text-[#353430] dark:text-[#C8C6BE] border-[#DDD8CE] dark:border-white/15 hover:border-[#E04F33]'
                          }`}
                        >
                          {chip === 'ALL' ? 'All Sections' : chip}
                        </button>
                      );
                    }
                  )}
                </div>
                <p className="text-[11px] text-[#5C5B57] dark:text-[#94938E]">
                  Posting to All Sections lets any course professor or grading TA grade submissions.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <label className="font-medium block mb-1">Due Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={asgnForm.due_at}
                    onChange={(e) => setAsgnForm({ ...asgnForm, due_at: e.target.value })}
                    className={inputSurface}
                  />
                </div>
                <div>
                  <label className="font-medium block mb-1">Max Marks</label>
                  <input
                    type="number"
                    min={1}
                    max={9999}
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

              {/* Group Assignment, Late Penalty & Draft Grades Controls */}
              <div className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={asgnForm.is_group_assignment}
                      onChange={(e) =>
                        setAsgnForm({ ...asgnForm, is_group_assignment: e.target.checked })
                      }
                      className="accent-[#896ABD]"
                    />
                    <span>Group Assignment (1 group per student)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={asgnForm.grades_published}
                      onChange={(e) =>
                        setAsgnForm({ ...asgnForm, grades_published: e.target.checked })
                      }
                      className="accent-[#E04F33]"
                    />
                    <span>Publish Marks Immediately</span>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {asgnForm.is_group_assignment && (
                    <div>
                      <label className="text-[11px] text-[#5C5B57] block mb-0.5">Max Group Size</label>
                      <input
                        type="number"
                        min={2}
                        max={12}
                        value={asgnForm.max_group_size}
                        onChange={(e) => setAsgnForm({ ...asgnForm, max_group_size: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] text-[#5C5B57] block mb-0.5">Late Penalty (%/day)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={asgnForm.late_penalty_pct_per_day}
                      onChange={(e) =>
                        setAsgnForm({ ...asgnForm, late_penalty_pct_per_day: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[#5C5B57] block mb-0.5">Grace Window (min)</label>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={asgnForm.grace_minutes}
                      onChange={(e) => setAsgnForm({ ...asgnForm, grace_minutes: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                    />
                  </div>
                </div>
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
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-medium block">
                      Assignment Sheet / Notes Attachment (Optional)
                    </label>
                    <span className="font-mono-tabular text-[10px] text-[#5C5B57] dark:text-[#94938E]">
                      PDF / DOC / DOCX ≤ 10 MB or any HTTPS link
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#FAF9F6] dark:bg-white/5 border border-[#E5E2DC]/70 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setAsgnAttachMode('FILE')}
                      className={`py-1.5 px-2.5 rounded-lg font-medium inline-flex items-center justify-center gap-1.5 ${
                        asgnAttachMode === 'FILE'
                          ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                          : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                      }`}
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Upload File (Drive)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsgnAttachMode('LINK')}
                      className={`py-1.5 px-2.5 rounded-lg font-medium inline-flex items-center justify-center gap-1.5 ${
                        asgnAttachMode === 'LINK'
                          ? 'bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] shadow-sm'
                          : 'text-[#5C5B57] dark:text-[#C4C3BE]'
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Paste Any Link</span>
                    </button>
                  </div>

                  {asgnAttachMode === 'FILE' ? (
                    !isGoogleDriveOAuthConfigured() ? (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-[11px] text-[#5C5B57] dark:text-[#C4C3BE]">
                        <p>
                          Google Drive OAuth (<code className="font-mono-tabular">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>) is not configured in this environment. Switch to Paste Any Link to attach a URL directly.
                        </p>
                        <button
                          type="button"
                          onClick={() => setAsgnAttachMode('LINK')}
                          className="px-3 py-1 rounded-lg bg-[#E04F33] text-white font-semibold"
                        >
                          Switch to Paste Any Link
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div
                          onClick={() => asgnFileInputRef.current?.click()}
                          className="border-2 border-dashed border-[#896ABD]/40 hover:border-[#896ABD] rounded-xl p-4 text-center cursor-pointer bg-[#896ABD]/5 transition-[border-color] space-y-1"
                        >
                          <UploadCloud className="w-6 h-6 text-[#896ABD] mx-auto" />
                          <div className="font-semibold">
                            {asgnFile
                              ? `${asgnFile.name} (${(asgnFile.size / (1024 * 1024)).toFixed(2)} MB)`
                              : 'Click to pick a PDF, DOC, or DOCX file (max 10 MB)'}
                          </div>
                          <p className="text-[11px] text-[#5C5B57] dark:text-[#94938E]">
                            Uploads straight to your Google Drive with an unlisted student viewing link.
                          </p>
                          <input
                            ref={asgnFileInputRef}
                            type="file"
                            accept={FACULTY_ALLOWED_ACCEPT}
                            onChange={(e) => {
                              const picked = e.target.files?.[0] || null;
                              if (!picked) {
                                setAsgnFile(null);
                                return;
                              }
                              const check = validateFacultyResourceFile(picked);
                              if (!check.valid) {
                                showToast(check.error || 'Invalid file', 'error');
                                e.target.value = '';
                                return;
                              }
                              setAsgnFile(picked);
                            }}
                            className="hidden"
                          />
                        </div>
                        {asgnFile && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setAsgnFile(null);
                                if (asgnFileInputRef.current) asgnFileInputRef.current.value = '';
                              }}
                              className="text-[11px] text-[#E04F33] hover:underline"
                            >
                              Remove selected file
                            </button>
                          </div>
                        )}
                        {asgnUploadProgress && (
                          <div className="p-2.5 rounded-xl bg-[#896ABD]/10 border border-[#896ABD]/30 space-y-1">
                            <div className="flex justify-between font-mono-tabular text-[11px]">
                              <span>{asgnUploadProgress.stage}</span>
                              <span>{asgnUploadProgress.pct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full w-full origin-left bg-[#E04F33] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                                style={{ transform: `scaleX(${Math.max(0, Math.min(1, Number(asgnUploadProgress.pct || 0) / 100))})` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="url"
                        value={asgnForm.resource_url}
                        onChange={(e) => setAsgnForm({ ...asgnForm, resource_url: e.target.value })}
                        placeholder="https://drive.google.com/..., OneDrive, GitHub, Overleaf, or any link"
                        className={inputSurface}
                      />
                      {asgnForm.resource_url && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          Detected: <strong>{validateSubmissionLink(asgnForm.resource_url).provider}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={asgnPublishing}
                  onClick={() => {
                    setShowNewAssignmentModal(false);
                    setAsgnFile(null);
                    setAsgnUploadProgress(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] dark:border-white/15 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={asgnPublishing}
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-50 text-white font-semibold"
                >
                  {asgnPublishing ? 'Uploading & Publishing...' : 'Publish to Classroom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GRADE SUBMISSION */}
      {gradingSub && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="modal-panel-enter bg-white dark:bg-[#111117] border border-[#E5E2DC] dark:border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-[var(--shadow-elevated)]">
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
                  min={0}
                  max={gradingSub.max_marks || 100}
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
                  disabled={savingGrade}
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-50 text-white font-semibold"
                >
                  {savingGrade ? 'Saving...' : 'Save Grade & Sync to TCS iON Export'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customize Course Banner Modal (Professor / Admin) */}
      {bannerModalOffering && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="modal-panel-enter w-full max-w-xl rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0A0A0C]">
                  Customize Course Banner
                </h2>
                <p className="text-xs text-[#353430] mt-0.5">
                  Choose a curated graphic or paste any https:// image URL. A dark contrast scrim is automatically applied so white course text is always crisp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBannerModalOffering(null)}
                className="p-1.5 rounded-lg hover:bg-black/5 text-[#353430]"
                aria-label="Close banner modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Contrast-Guaranteed Preview */}
            <div className="relative h-32 rounded-xl overflow-hidden bg-[#0F121C] border border-[#DDD8CE]">
              <img
                src={bannerDraftUrl.trim() || getCourseBannerImage(bannerModalOffering)}
                alt="Course banner preview"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.fallback) {
                    target.dataset.fallback = '1';
                    target.src = '/illustrations/course-banner-1.jpg';
                  }
                }}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0" style={COURSE_BANNER_SCRIM_STYLE} />
              <div className="relative z-10 h-full p-4 flex flex-col justify-between">
                <span className="inline-block w-fit px-2 py-0.5 rounded bg-black/55 border border-white/25 font-mono-tabular text-xs font-semibold text-white">
                  {bannerModalOffering.course_code}
                </span>
                <div>
                  <div
                    className="text-base font-bold text-white line-clamp-1"
                    style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                  >
                    {bannerModalOffering.course_name}
                  </div>
                  <div
                    className="text-xs text-white/90"
                    style={{ textShadow: COURSE_BANNER_TEXT_SHADOW }}
                  >
                    Live Preview · Guaranteed White-Text Contrast
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveCourseBanner} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#0A0A0C] block">
                  Select a Curated Preset
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {COURSE_BANNER_PRESETS.map((preset) => {
                    const isSelected = bannerDraftUrl.trim() === preset.image;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setBannerDraftUrl(preset.image)}
                        className={`relative h-16 rounded-xl overflow-hidden border-2 transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.97] text-left ${
                          isSelected
                            ? 'border-[#E04F33] ring-2 ring-[#E04F33]/30'
                            : 'border-[#DDD8CE] hover:border-[#896ABD]'
                        }`}
                      >
                        <img
                          src={preset.image}
                          alt={preset.label}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/45" />
                        <span className="relative z-10 p-1.5 text-[11px] font-semibold text-white leading-tight block">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#0A0A0C] block">
                  Upload Custom Banner Image (Auto-converted to WebP &lt; 150 KB)
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#896ABD] bg-[#896ABD]/8 hover:bg-[#896ABD]/15 text-[#5B3B96] text-xs font-semibold cursor-pointer transition-colors">
                    <UploadCloud className="w-4 h-4" />
                    <span>Choose &amp; Crop Image (JPG / PNG / WebP)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        handleBannerFilePick(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {bannerUploadKb !== null && bannerDraftUrl.startsWith('data:image/webp') && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/12 border border-emerald-500/30 text-emerald-800 text-[11px] font-mono-tabular font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>WebP Ready · {bannerUploadKb} KB</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0A0A0C] block">
                  Or Paste Image URL (https://...)
                </label>
                <input
                  type="text"
                  value={bannerDraftUrl.startsWith('data:image/') ? '' : bannerDraftUrl}
                  onChange={(e) => {
                    setBannerDraftUrl(e.target.value);
                    setBannerUploadKb(null);
                  }}
                  placeholder={
                    bannerDraftUrl.startsWith('data:image/')
                      ? 'Custom uploaded WebP banner selected (click Save Banner)'
                      : 'https://images.unsplash.com/... or leave blank for default'
                  }
                  className={inputSurface}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBannerDraftUrl('')}
                  className="text-xs font-medium text-[#353430] hover:text-[#E04F33] underline"
                >
                  Reset to default
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBannerModalOffering(null)}
                    className="px-4 py-2 rounded-xl border border-[#DDD8CE] text-xs font-semibold text-[#0A0A0C]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingBanner}
                    className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-60 text-white text-xs font-semibold"
                  >
                    {savingBanner ? 'Saving...' : 'Save Banner'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wide 16:5 Interactive Banner Crop, Zoom & WebP Optimizer Modal */}
      <FacultyPhotoCropModal
        file={bannerCropFile}
        viewportWidth={448}
        viewportHeight={140}
        outputWidth={960}
        outputHeight={300}
        maxKb={140}
        title="Crop & Zoom Course Banner"
        subtitle="Drag to reposition, zoom (1.0× – 3.0×), or rotate to fit the wide classroom banner. Converted automatically to WebP (< 140 KB)."
        saveLabel="Apply Cropped Banner"
        onCancel={() => setBannerCropFile(null)}
        onSave={(dataUrl, sizeKb) => {
          setBannerDraftUrl(dataUrl);
          setBannerUploadKb(sizeKb);
          setBannerCropFile(null);
        }}
      />

      {/* MODAL 4: EDIT ANNOUNCEMENT */}
      {editingAnn && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="modal-panel-enter bg-white border border-[#E5E2DC] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-[var(--shadow-elevated)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[#0A0A0C]">Edit Announcement</h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setEditingAnn(null)}
                className="p-1.5 rounded-lg border border-[#E5E2DC] hover:border-[#E04F33]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAnnouncementEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-medium block mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={editAnnTitle}
                  onChange={(e) => setEditAnnTitle(e.target.value)}
                  className={inputSurface}
                />
              </div>
              <div>
                <label className="font-medium block mb-1">Announcement Content *</label>
                <textarea
                  rows={4}
                  required
                  value={editAnnContent}
                  onChange={(e) => setEditAnnContent(e.target.value)}
                  className={inputSurface}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAnn(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAnnEdit}
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-50 text-white font-semibold"
                >
                  {savingAnnEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: EDIT ASSIGNMENT */}
      {editingAsgn && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="modal-panel-enter bg-white border border-[#E5E2DC] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-[var(--shadow-elevated)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[#0A0A0C]">Edit Assignment</h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setEditingAsgn(null)}
                className="p-1.5 rounded-lg border border-[#E5E2DC] hover:border-[#E04F33]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAssignmentEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-medium block mb-1">Assignment Title *</label>
                <input
                  type="text"
                  required
                  value={editAsgnForm.title}
                  onChange={(e) => setEditAsgnForm({ ...editAsgnForm, title: e.target.value })}
                  className={inputSurface}
                />
              </div>
              <div>
                <label className="font-medium block mb-1">Instructions / Description</label>
                <textarea
                  rows={3}
                  value={editAsgnForm.description}
                  onChange={(e) => setEditAsgnForm({ ...editAsgnForm, description: e.target.value })}
                  className={inputSurface}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium block mb-1">Due Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={editAsgnForm.due_at}
                    onChange={(e) => setEditAsgnForm({ ...editAsgnForm, due_at: e.target.value })}
                    className={inputSurface}
                  />
                </div>
                <div>
                  <label className="font-medium block mb-1">Max Marks *</label>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    required
                    value={editAsgnForm.max_marks}
                    onChange={(e) =>
                      setEditAsgnForm({ ...editAsgnForm, max_marks: e.target.value })
                    }
                    className={inputSurface}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAsgnForm.allow_late}
                  onChange={(e) =>
                    setEditAsgnForm({ ...editAsgnForm, allow_late: e.target.checked })
                  }
                  className="rounded border-[#E5E2DC]"
                />
                <span>Allow submissions after due date</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAsgn(null)}
                  className="px-4 py-2 rounded-xl border border-[#E5E2DC] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAsgnEdit}
                  className="px-5 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-50 text-white font-semibold"
                >
                  {savingAsgnEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {groupModalAsgn && (
        <GroupFormationModal
          assignment={groupModalAsgn}
          isStaff={Boolean(perms.is_instructor || perms.is_admin || perms.is_ta)}
          canManageCourse={Boolean(perms.can_manage_course)}
          onClose={() => setGroupModalAsgn(null)}
          onChanged={() => loadWorkspace(Number(off?.id || activeId), { forceSilent: true })}
          onToast={showToast}
        />
      )}

      {drawerTarget && (
        <SubmissionDrawer
          assignment={drawerTarget.asgn}
          submission={drawerTarget.sub}
          canGrade={drawerTarget.canGrade}
          onClose={() => setDrawerTarget(null)}
          onSaved={() => loadWorkspace(Number(off?.id || activeId), { forceSilent: true })}
          onToast={showToast}
        />
      )}

      <ReleaseCourseModal
        isOpen={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        isAdmin={Boolean(user?.is_admin || user?.admin_role === 'full_admin')}
        onSuccess={async (data) => {
          setShowReleaseModal(false);
          showToast(data?.message || 'Course classroom released & enrolled!', 'success');
          await loadOfferingsList(true);
          if (data?.offering?.id) {
            handleSelectOffering(data.offering.id, 'stream');
          }
        }}
      />
    </>
  );
};
