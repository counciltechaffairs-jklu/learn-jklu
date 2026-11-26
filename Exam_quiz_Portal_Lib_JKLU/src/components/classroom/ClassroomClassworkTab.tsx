import React from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  Link2,
  MessageSquare,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import { formatTargetSectionsLabel } from '@/utils/formatters';
import { safeExternalUrl } from '@/utils/safeUrl';
import { AddToCalendarButton } from '@/components/classroom/CommunicationExtras';
import type {
  ClassroomWorkspace,
  Offering,
  SimilarityReport,
  WorkspacePermissions,
} from '@/types/classroom';

export interface ClassroomClassworkTabProps {
  workspace: ClassroomWorkspace;
  off: Offering;
  perms: WorkspacePermissions;
  cardSurface: string;
  sectionViewFilter: string;
  reducedMotion: boolean;
  similarityReports: Record<number, SimilarityReport | any>;
  setSimilarityReports: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  similarityLoadingId: number | null;
  setSimilarityLoadingId: React.Dispatch<React.SetStateAction<number | null>>;
  loadWorkspace: (id: number, opts?: { forceSilent?: boolean }) => Promise<void>;
  handleDeleteAssignment: (assignmentId: number, title: string) => Promise<void> | void;
  setShowNewAssignmentModal: React.Dispatch<React.SetStateAction<boolean>>;
  setSubmittingAssignment: React.Dispatch<React.SetStateAction<any | null>>;
  setDirectLinkUrl: React.Dispatch<React.SetStateAction<string>>;
  setSubmissionNotes: React.Dispatch<React.SetStateAction<string>>;
  setEditingAsgn: React.Dispatch<React.SetStateAction<any | null>>;
  setEditAsgnForm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string;
      due_at: string;
      max_marks: string;
      allow_late: boolean;
    }>
  >;
  setGroupModalAsgn: React.Dispatch<React.SetStateAction<any | null>>;
  setDrawerTarget: React.Dispatch<
    React.SetStateAction<{
      asgn: any;
      sub: any;
      canGrade: boolean;
    } | null>
  >;
  setGradingSub: React.Dispatch<React.SetStateAction<any | null>>;
  setGradeMarks: React.Dispatch<React.SetStateAction<string>>;
  setGradeFeedback: React.Dispatch<React.SetStateAction<string>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export const ClassroomClassworkTab: React.FC<ClassroomClassworkTabProps> = ({
  workspace,
  off,
  perms,
  cardSurface,
  sectionViewFilter,
  reducedMotion,
  similarityReports,
  setSimilarityReports,
  similarityLoadingId,
  setSimilarityLoadingId,
  loadWorkspace,
  handleDeleteAssignment,
  setShowNewAssignmentModal,
  setSubmittingAssignment,
  setDirectLinkUrl,
  setSubmissionNotes,
  setEditingAsgn,
  setEditAsgnForm,
  setGroupModalAsgn,
  setDrawerTarget,
  setGradingSub,
  setGradeMarks,
  setGradeFeedback,
  showToast,
}) => {
  return (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-[#0A0A0C] dark:text-[#F5F4F0]">
                      Assignments, Labs &amp; Quizzes
                    </h2>
                    <p className="text-sm text-[#5C5B57] dark:text-[#A09F9A]">
                      Submit files via Google Drive (≤10 MB for faculty uploads) or paste a direct link.
                    </p>
                  </div>
                  {perms.can_announce && (
                    <button
                      type="button"
                      onClick={() => setShowNewAssignmentModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-[#E04F33] hover:opacity-90 text-white text-sm font-semibold shrink-0 inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Assignment / Quiz</span>
                    </button>
                  )}
                </div>

                {/* Student Due-Soon & Pending Quick-Jump Strip */}
                {!perms.is_instructor &&
                  !perms.is_admin &&
                  !perms.is_ta &&
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
                  (workspace.assignments || [])
                    .filter((asgn: any) => {
                      if (
                        (!perms.is_instructor && !perms.is_ta && !perms.is_admin) ||
                        sectionViewFilter === 'ALL'
                      ) {
                        return true;
                      }
                      const tgts: string[] =
                        Array.isArray(asgn.target_sections) && asgn.target_sections.length > 0
                          ? asgn.target_sections
                          : ['ALL'];
                      return tgts.some(
                        (t) =>
                          t.toUpperCase() === 'ALL' ||
                          t.toLowerCase() === sectionViewFilter.toLowerCase()
                      );
                    })
                    .map((asgn: any) => {
                    const isTcsQuiz = asgn.assignment_type === 'TCS_ION_QUIZ';
                    const mySub = asgn.my_submission;
                    const isGraded =
                      mySub?.marks_obtained !== null && mySub?.marks_obtained !== undefined;
                    const isOverdue =
                      !mySub &&
                      Boolean(asgn.due_at) &&
                      new Date(asgn.due_at).getTime() < Date.now();
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
                              {(() => {
                                const tgts: string[] =
                                  Array.isArray(asgn.target_sections) &&
                                  asgn.target_sections.length > 0
                                    ? asgn.target_sections
                                    : ['ALL'];
                                const isAll = tgts.some((t) => t.toUpperCase() === 'ALL');
                                return (
                                  <span
                                    className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                                      isAll
                                        ? 'bg-[#896ABD]/12 text-[#5B3B96] dark:text-[#D5C4F7]'
                                        : 'bg-[#E04F33]/12 text-[#B93820] dark:text-[#FFA494]'
                                    }`}
                                  >
                                    {formatTargetSectionsLabel(tgts)}
                                  </span>
                                );
                              })()}
                              {(perms.is_instructor || perms.is_ta || perms.is_admin) &&
                                asgn.can_edit === false && (
                                  <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300">
                                    Read-only
                                  </span>
                                )}
                              {isOverdue && (
                                <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-rose-500/15 text-rose-700">
                                  Overdue
                                </span>
                              )}
                              {asgn.is_group_assignment && (
                                <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-[#896ABD]/12 text-[#5B3B96]">
                                  Group (Max {asgn.max_group_size || 4})
                                </span>
                              )}
                              {asgn.tcs_ion_exam_code && (
                                <span className="text-[11px] font-mono-tabular px-2 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08]">
                                  Code: {asgn.tcs_ion_exam_code}
                                </span>
                              )}
                            </div>
                            <h3 className="text-lg font-semibold">{asgn.title}</h3>
                            {asgn.description && (
                              <p className="text-sm sm:text-[15px] text-[#5C5B57] dark:text-[#A09F9A] leading-relaxed">
                                {asgn.description}
                              </p>
                            )}
                            {safeExternalUrl(problemLink) && (
                              <div className="pt-1 flex flex-wrap items-center gap-3">
                                <a
                                  href={safeExternalUrl(problemLink)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#896ABD] dark:text-[#C084FC] hover:underline"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  <span>
                                    {asgn.resource_links?.[0]?.label || 'Problem Statement / Reference'}
                                  </span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <AddToCalendarButton
                                  title={`[${off.course_code}] ${asgn.title}`}
                                  details={asgn.description || off.course_name}
                                  dueAt={asgn.due_at}
                                />
                              </div>
                            )}
                            {!safeExternalUrl(problemLink) && asgn.due_at && (
                              <div className="pt-1">
                                <AddToCalendarButton
                                  title={`[${off.course_code}] ${asgn.title}`}
                                  details={asgn.description || off.course_name}
                                  dueAt={asgn.due_at}
                                />
                              </div>
                            )}
                          </div>

                          {/* Role-Aware Action Slot */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              {(perms.can_announce || perms.can_manage_course) &&
                                asgn.can_edit !== false && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingAsgn(asgn);
                                      setEditAsgnForm({
                                        title: asgn.title || '',
                                        description: asgn.description || '',
                                        due_at: asgn.due_at
                                          ? new Date(asgn.due_at).toISOString().slice(0, 16)
                                          : '',
                                        max_marks: String(asgn.max_marks ?? 100),
                                        allow_late: asgn.allow_late !== false,
                                      });
                                    }}
                                    aria-label="Edit assignment"
                                    className="p-2 rounded-lg border border-[#E5E2DC] text-[#5C5B57] hover:border-[#896ABD] hover:text-[#0A0A0C]"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAssignment(asgn.id, asgn.title)}
                                    aria-label="Delete assignment"
                                    className="p-2 rounded-lg border border-rose-500/25 text-rose-700 hover:bg-rose-500/10"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Clone assignment into this classroom"
                                    onClick={async () => {
                                      try {
                                        const data = await classroomApi.cloneAssignment(asgn.id);
                                        showToast(data?.message || 'Cloned assignment', 'success');
                                        await loadWorkspace(Number(off.id), { forceSilent: true });
                                      } catch (err: any) {
                                        showToast(err?.response?.data?.detail || 'Clone failed', 'error');
                                      }
                                    }}
                                    className="px-2 py-1.5 rounded-lg border border-[#E5E2DC] text-[11px] font-semibold text-[#353430] hover:border-[#896ABD]"
                                  >
                                    Clone
                                  </button>
                                </>
                              )}
                              {asgn.is_group_assignment && (
                                <button
                                  type="button"
                                  onClick={() => setGroupModalAsgn(asgn)}
                                  className="px-2.5 py-1.5 rounded-lg border border-[#896ABD]/40 bg-[#896ABD]/10 text-[#5B3B96] text-[11px] font-semibold inline-flex items-center gap-1"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                  <span>{perms.is_instructor || perms.is_admin || perms.is_ta ? 'Groups' : 'My Group'}</span>
                                </button>
                              )}
                              {(perms.can_grade || perms.can_manage_course) && (
                                <>
                                  <button
                                    type="button"
                                    disabled={similarityLoadingId === asgn.id}
                                    onClick={async () => {
                                      if (similarityReports[asgn.id]) {
                                        const next = { ...similarityReports };
                                        delete next[asgn.id];
                                        setSimilarityReports(next);
                                        return;
                                      }
                                      setSimilarityLoadingId(asgn.id);
                                      try {
                                        const reportData = await classroomApi.getAssignmentSimilarity(
                                          asgn.id,
                                          sectionViewFilter || 'ALL'
                                        );
                                        setSimilarityReports((prev) => ({
                                          ...prev,
                                          [asgn.id]: reportData,
                                        }));
                                      } catch (err: any) {
                                        showToast(
                                          err?.response?.data?.detail || 'Similarity check failed',
                                          'error'
                                        );
                                      } finally {
                                        setSimilarityLoadingId(null);
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] bg-white hover:border-[#896ABD] text-[11px] font-semibold inline-flex items-center gap-1"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 text-[#896ABD]" />
                                    <span>
                                      {similarityLoadingId === asgn.id
                                        ? 'Checking...'
                                        : similarityReports[asgn.id]
                                          ? 'Hide Similarity'
                                          : 'Similarity'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const zipBlob = await classroomApi.downloadSubmissionsZip(
                                          asgn.id,
                                          sectionViewFilter || 'ALL'
                                        );
                                        const blobUrl = URL.createObjectURL(zipBlob);
                                        const a = document.createElement('a');
                                        a.href = blobUrl;
                                        a.download = `${asgn.title.replace(/[^a-zA-Z0-9_-]+/g, '_')}_submissions.zip`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(blobUrl);
                                      } catch (err: any) {
                                        showToast(err?.response?.data?.detail || 'Could not download ZIP', 'error');
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] bg-white hover:border-[#E04F33] text-[11px] font-semibold inline-flex items-center gap-1"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>ZIP</span>
                                  </button>
                                </>
                              )}
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
                              ) : !perms.is_instructor && !perms.is_admin && !perms.is_ta ? (
                                isGraded ? (
                                  <span className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-800 border border-emerald-500/25 inline-flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Graded (Locked)</span>
                                  </span>
                                ) : (
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
                                )
                              ) : (
                                <span className="px-3 py-1.5 rounded-lg font-mono-tabular text-xs font-medium bg-black/[0.04] dark:bg-white/[0.06] text-[#5C5B57] dark:text-[#C4C3BE]">
                                  {asgn.submissions?.length || asgn.submission_count || 0} Submissions
                                </span>
                              )}
                            </div>
                            {asgn.due_at && (
                              <span
                                className={`font-mono-tabular text-[11px] ${
                                  isOverdue
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-[#5C5B57] dark:text-[#8E8D88]'
                                }`}
                              >
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
                                    : mySub.upload_mode === 'EXCEL_SHEET'
                                    ? 'Faculty Marks Sheet'
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
                              {mySub.upload_mode === 'EXCEL_SHEET' ||
                              String(mySub.submission_url || '').startsWith('excel://') ? (
                                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    {mySub.file_name || 'Evaluated via Faculty Marks Sheet'}
                                  </span>
                                </span>
                              ) : safeExternalUrl(mySub.submission_url) ? (
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
                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => setDrawerTarget({ asgn, sub: mySub, canGrade: false })}
                                className="px-2.5 py-1 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-[11px] font-semibold inline-flex items-center gap-1 text-[#5B3B96]"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>Versions &amp; Private Thread</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {perms.can_grade && similarityReports[asgn.id] && (
                          <div className="p-3.5 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] text-xs space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#0A0A0C] flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-[#896ABD]" />
                                Plagiarism &amp; Code Similarity Scan ({similarityReports[asgn.id].checked_count} checked)
                              </span>
                              <span className="font-mono-tabular text-[11px] text-[#5C5B57]">
                                {similarityReports[asgn.id].flagged_pairs?.length || 0} pairs ≥ {similarityReports[asgn.id].threshold_pct || 40}%
                              </span>
                            </div>
                            {(similarityReports[asgn.id].flagged_pairs || []).length === 0 ? (
                              <p className="text-emerald-700 font-medium">
                                No high-overlap text, code, or file hash pairs detected across submissions.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {similarityReports[asgn.id].flagged_pairs.slice(0, 6).map((fp: any, idx: number) => (
                                  <div key={idx} className="p-2 rounded-lg bg-white border border-rose-200 flex items-center justify-between gap-2">
                                    <span>
                                      <strong>{fp.student_a_name}</strong> ↔ <strong>{fp.student_b_name}</strong> ({fp.match_reason})
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 font-mono-tabular font-bold">
                                      {fp.similarity_pct}%
                                    </span>
                                  </div>
                                ))}
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
                                    <div className="flex flex-wrap items-center gap-1.5 font-semibold truncate">
                                      <span>
                                        {sub.student_name} ({sub.student_roll_no || sub.student_email})
                                      </span>
                                      {sub.student_section && (
                                        <span className="px-1.5 py-0.5 rounded bg-black/[0.06] dark:bg-white/10 font-mono-tabular text-[10px] font-medium text-[#5C5B57] dark:text-[#C8C6BE]">
                                          {sub.student_section}
                                        </span>
                                      )}
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
                                  {sub.can_grade_submission === false ? (
                                    <span className="px-2.5 py-1 rounded-lg bg-black/[0.05] dark:bg-white/10 text-[#5C5B57] dark:text-[#A09F9A] font-mono-tabular text-[11px] font-medium shrink-0">
                                      {sub.marks_obtained !== null &&
                                      sub.marks_obtained !== undefined
                                        ? `${sub.marks_obtained}/${asgn.max_marks} · Read-only`
                                        : 'Read-only'}
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDrawerTarget({ asgn, sub, canGrade: true })
                                        }
                                        className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-[11px] font-semibold"
                                      >
                                        Inspect
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setGradingSub({ ...sub, max_marks: asgn.max_marks });
                                          setGradeMarks(
                                            sub.marks_obtained !== null &&
                                              sub.marks_obtained !== undefined
                                              ? String(sub.marks_obtained)
                                              : ''
                                          );
                                          setGradeFeedback(sub.feedback || '');
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white font-semibold shrink-0"
                                      >
                                        {sub.marks_obtained !== null &&
                                        sub.marks_obtained !== undefined
                                          ? `${sub.marks_obtained}/${asgn.max_marks} · Edit`
                                          : 'Grade'}
                                      </button>
                                    </div>
                                  )}
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
  );
};
