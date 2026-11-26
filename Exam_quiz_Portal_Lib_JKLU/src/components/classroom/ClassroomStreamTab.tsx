import React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Pin,
  Send,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  FACULTY_ALLOWED_ACCEPT,
  validateFacultyResourceFile,
} from '@/utils/googleDriveSubmit';
import { formatTargetSectionsLabel } from '@/utils/formatters';
import { safeExternalUrl } from '@/utils/safeUrl';
import {
  AddToCalendarButton,
  AnnouncementSeenByChip,
  GoogleCalendarSyncBar,
  StreamPollsSection,
} from '@/components/classroom/CommunicationExtras';
import type {
  ClassroomWorkspace,
  Offering,
  WorkspacePermissions,
} from '@/types/classroom';

export interface ClassroomStreamTabProps {
  workspace: ClassroomWorkspace;
  off: Offering;
  perms: WorkspacePermissions;
  user: any;
  cardSurface: string;
  inputSurface: string;
  offeringSectionsList: string[];
  myAssignedSections: string[];
  isUnrestrictedStaff: boolean;
  sectionViewFilter: string;
  setSectionViewFilter: React.Dispatch<React.SetStateAction<string>>;
  studentPreviewSection: string | null;
  annTitle: string;
  setAnnTitle: React.Dispatch<React.SetStateAction<string>>;
  annContent: string;
  setAnnContent: React.Dispatch<React.SetStateAction<string>>;
  annDriveUrl: string;
  setAnnDriveUrl: React.Dispatch<React.SetStateAction<string>>;
  annPinned: boolean;
  setAnnPinned: React.Dispatch<React.SetStateAction<boolean>>;
  annScheduledFor: string;
  setAnnScheduledFor: React.Dispatch<React.SetStateAction<string>>;
  annFile: File | null;
  setAnnFile: React.Dispatch<React.SetStateAction<File | null>>;
  annUploadProgress: { stage: string; pct: number } | null;
  annUploading: boolean;
  annFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  annTargetSections: string[];
  setAnnTargetSections: React.Dispatch<React.SetStateAction<string[]>>;
  toggleTargetChip: (currentList: string[], chip: string) => string[];
  commentInputs: Record<number, string>;
  setCommentInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  expandedStreamIds: Record<string, boolean>;
  setExpandedStreamIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  syllabusInputRef: React.MutableRefObject<HTMLInputElement | null>;
  syllabusUploading: boolean;
  syllabusViewing: boolean;
  handleUploadSyllabusPdf: (file: File | null | undefined) => Promise<void> | void;
  handleOpenSyllabusPdf: (download?: boolean) => Promise<void> | void;
  handleDeleteSyllabusPdf: () => Promise<void> | void;
  handlePostAnnouncement: (e: React.FormEvent) => Promise<void> | void;
  handlePostComment: (announcementId: number) => Promise<void> | void;
  handleToggleVerifyComment: (commentId: number) => Promise<void> | void;
  handleTogglePinAnnouncement: (ann: any) => Promise<void> | void;
  handleToggleAllowComments: (ann: any) => Promise<void> | void;
  handleDeleteAnnouncement: (announcementId: number) => Promise<void> | void;
  handleDeleteComment: (commentId: number) => Promise<void> | void;
  handleDeleteAssignment: (assignmentId: number, title: string) => Promise<void> | void;
  setActiveTab: React.Dispatch<
    React.SetStateAction<
      'stream' | 'classwork' | 'materials' | 'quizzes' | 'attendance' | 'people' | 'tcs_gradebook'
    >
  >;
  setSubmittingAssignment: React.Dispatch<React.SetStateAction<any | null>>;
  setDirectLinkUrl: React.Dispatch<React.SetStateAction<string>>;
  setSubmissionNotes: React.Dispatch<React.SetStateAction<string>>;
  setEditingAnn: React.Dispatch<React.SetStateAction<any | null>>;
  setEditAnnTitle: React.Dispatch<React.SetStateAction<string>>;
  setEditAnnContent: React.Dispatch<React.SetStateAction<string>>;
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
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export const ClassroomStreamTab: React.FC<ClassroomStreamTabProps> = ({
  workspace,
  off,
  perms,
  user,
  cardSurface,
  inputSurface,
  offeringSectionsList,
  myAssignedSections,
  isUnrestrictedStaff,
  sectionViewFilter,
  setSectionViewFilter,
  studentPreviewSection,
  annTitle,
  setAnnTitle,
  annContent,
  setAnnContent,
  annDriveUrl,
  setAnnDriveUrl,
  annPinned,
  setAnnPinned,
  annScheduledFor,
  setAnnScheduledFor,
  annFile,
  setAnnFile,
  annUploadProgress,
  annUploading,
  annFileInputRef,
  annTargetSections,
  setAnnTargetSections,
  toggleTargetChip,
  commentInputs,
  setCommentInputs,
  expandedStreamIds,
  setExpandedStreamIds,
  syllabusInputRef,
  syllabusUploading,
  syllabusViewing,
  handleUploadSyllabusPdf,
  handleOpenSyllabusPdf,
  handleDeleteSyllabusPdf,
  handlePostAnnouncement,
  handlePostComment,
  handleToggleVerifyComment,
  handleTogglePinAnnouncement,
  handleToggleAllowComments,
  handleDeleteAnnouncement,
  handleDeleteComment,
  handleDeleteAssignment,
  setActiveTab,
  setSubmittingAssignment,
  setDirectLinkUrl,
  setSubmissionNotes,
  setEditingAnn,
  setEditAnnTitle,
  setEditAnnContent,
  setEditingAsgn,
  setEditAsgnForm,
  showToast,
}) => {
  return (
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
                          <div className="flex items-center gap-2.5 min-w-0">
                            {inst.photo_path ? (
                              <img
                                src={inst.photo_path}
                                alt={inst.name}
                                className="w-8 h-8 rounded-lg object-cover shrink-0 border border-[#E5E2DC]"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[#0A0A0C] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                                {String(inst.name || 'JK')
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .map((p: string) => p[0] || '')
                                  .join('')
                                  .toUpperCase()}
                              </div>
                            )}
                            <span className="font-semibold text-sm truncate">{inst.name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] dark:bg-white/[0.08] text-[#5C5B57] dark:text-[#C4C3BE] shrink-0">
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

                  {/* Course Description / Official Syllabus PDF Box (Always Shown: Live PDF or Clean Empty Area) */}
                  <div className="pt-3 border-t border-[#E5E2DC] dark:border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57] dark:text-[#8E8D88] font-semibold">
                        Course Description PDF
                      </h4>
                      {off.is_elective !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                            off.is_elective
                              ? 'bg-[#896ABD]/15 text-[#5B3B96]'
                              : 'bg-emerald-500/10 text-emerald-700'
                          }`}
                        >
                          {off.is_elective ? 'Elective' : 'Core'}
                          {off.credits ? ` · ${off.credits} Cr` : ''}
                        </span>
                      )}
                    </div>

                    {off.has_syllabus_pdf ? (
                      <div className="p-3 rounded-xl border border-[#896ABD]/30 bg-[#896ABD]/[0.04] space-y-2.5 text-xs">
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-4 h-4 text-[#E04F33] shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[#0A0A0C] truncate">
                              {off.course_desc_pdf_name || 'Course_Description.pdf'}
                            </p>
                            {off.course_desc_pdf_size && (
                              <p className="font-mono-tabular text-[10px] text-[#5C5B57]">
                                {Math.max(1, Math.round(Number(off.course_desc_pdf_size) / 1024))} KB · Official PDF
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={syllabusViewing}
                            onClick={() => handleOpenSyllabusPdf(false)}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold text-[11px] inline-flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{syllabusViewing ? 'Opening...' : 'View PDF'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={syllabusViewing}
                            onClick={() => handleOpenSyllabusPdf(true)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-[#0A0A0C] font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </button>
                        </div>
                        {perms.can_manage_course && (
                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#E5E2DC]/80 text-[11px]">
                            <label className="font-semibold text-[#5B3B96] hover:text-[#E04F33] cursor-pointer inline-flex items-center gap-1">
                              <Upload className="w-3 h-3" />
                              <span>{syllabusUploading ? 'Uploading...' : 'Replace PDF'}</span>
                              <input
                                ref={syllabusInputRef}
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  handleUploadSyllabusPdf(f);
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleDeleteSyllabusPdf}
                              className="text-rose-700 hover:underline font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl border border-dashed border-[#D6D2C9] bg-[#FAF9F6] text-xs space-y-2.5">
                        <p className="text-[11px] text-[#5C5B57] leading-relaxed">
                          Course description PDF has not been uploaded yet. Once added by the course professor, the official syllabus &amp; outline will appear here.
                        </p>
                        {perms.can_manage_course && (
                          <label
                            className={`w-full py-2 px-3 rounded-lg bg-white border border-[#DDD8CE] hover:border-[#E04F33] hover:text-[#E04F33] text-[#0A0A0C] font-semibold text-[11px] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                              syllabusUploading ? 'opacity-60 pointer-events-none' : ''
                            }`}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {syllabusUploading
                                ? 'Uploading Syllabus PDF...'
                                : 'Upload Course Description PDF (<=10 MB)'}
                            </span>
                            <input
                              ref={syllabusInputRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                handleUploadSyllabusPdf(f);
                                e.currentTarget.value = '';
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </aside>

                {/* Right Main Column: Calendar Sync + Polls + Announcement Composer + Stream Feed */}
                <div className="lg:col-span-8 space-y-5">
                  <GoogleCalendarSyncBar onToast={showToast} />
                  <StreamPollsSection
                    offeringId={Number(off.id)}
                    canCreate={Boolean(perms.can_announce && !studentPreviewSection)}
                    allowedSections={isUnrestrictedStaff ? offeringSectionsList : myAssignedSections}
                    isUnrestricted={isUnrestrictedStaff}
                    sectionViewFilter={sectionViewFilter}
                    onToast={showToast}
                  />

                  {perms.can_announce && !studentPreviewSection ? (
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
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-mono-tabular uppercase tracking-wider text-[10px] text-[#5C5B57] dark:text-[#A09F9A] mr-1">
                          Audience:
                        </span>
                        {['ALL', ...(isUnrestrictedStaff ? offeringSectionsList : myAssignedSections)].map(
                          (chip) => {
                            const selected = annTargetSections.some(
                              (t) => t.toUpperCase() === chip.toUpperCase()
                            );
                            return (
                              <button
                                key={`ann-target-${chip}`}
                                type="button"
                                onClick={() =>
                                  setAnnTargetSections((prev) => toggleTargetChip(prev, chip))
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
                      <div className="space-y-2.5">
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <input
                            type="url"
                            value={annDriveUrl}
                            onChange={(e) => setAnnDriveUrl(e.target.value)}
                            placeholder="Optional link: Drive, OneDrive, Slides, GitHub, or any https:// URL"
                            className={`${inputSurface} flex-1`}
                          />
                          <input
                            ref={annFileInputRef}
                            type="file"
                            accept={FACULTY_ALLOWED_ACCEPT}
                            onChange={(e) => {
                              const picked = e.target.files?.[0] || null;
                              if (!picked) {
                                setAnnFile(null);
                                return;
                              }
                              const check = validateFacultyResourceFile(picked);
                              if (!check.valid) {
                                showToast(check.error || 'Invalid file', 'error');
                                e.target.value = '';
                                return;
                              }
                              setAnnFile(picked);
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={annUploading}
                            onClick={() => annFileInputRef.current?.click()}
                            title="Upload PDF, DOC, or DOCX (max 10 MB) via Google Drive"
                            className="px-3.5 py-2 rounded-xl text-xs font-medium border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-white/[0.04] hover:border-[#896ABD] text-[#0A0A0C] dark:text-[#F5F4F0] inline-flex items-center justify-center gap-1.5 shrink-0 transition-[border-color] disabled:opacity-50"
                          >
                            <UploadCloud className="w-3.5 h-3.5 text-[#896ABD]" />
                            <span>Upload PDF / DOC (≤10 MB)</span>
                          </button>
                          <input
                            type="datetime-local"
                            value={annScheduledFor}
                            onChange={(e) => setAnnScheduledFor(e.target.value)}
                            title="Optional: schedule announcement for future time"
                            aria-label="Schedule announcement publish time"
                            className="px-2.5 py-2 rounded-xl text-xs border border-[#E5E2DC] bg-[#FAF9F6] text-[#353430]"
                          />
                          <button
                            type="submit"
                            disabled={annUploading}
                            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] dark:bg-[#F5F4F0] text-[#FAF9F6] dark:text-[#0A0A0C] hover:bg-[#E04F33] dark:hover:bg-[#E04F33] dark:hover:text-white shrink-0 disabled:opacity-50"
                          >
                            {annUploading
                              ? 'Uploading...'
                              : annScheduledFor
                                ? 'Schedule Post'
                                : 'Post Announcement'}
                          </button>
                        </div>

                        {annFile && (
                          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#896ABD]/10 border border-[#896ABD]/25 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                              <span className="font-medium truncate">{annFile.name}</span>
                              <span className="font-mono-tabular text-[11px] text-[#5C5B57] dark:text-[#A09F9A] shrink-0">
                                ({(annFile.size / (1024 * 1024)).toFixed(2)} MB · via Google Drive)
                              </span>
                            </div>
                            <button
                              type="button"
                              aria-label="Remove attached file"
                              onClick={() => {
                                setAnnFile(null);
                                if (annFileInputRef.current) annFileInputRef.current.value = '';
                              }}
                              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-[#5C5B57] dark:text-[#A09F9A]"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {annUploadProgress && (
                          <div className="p-2.5 rounded-xl bg-[#896ABD]/10 border border-[#896ABD]/30 space-y-1 text-xs">
                            <div className="flex justify-between font-mono-tabular text-[11px]">
                              <span>{annUploadProgress.stage}</span>
                              <span>{annUploadProgress.pct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                              <div
                                className="h-full w-full origin-left bg-[#E04F33] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                                style={{ transform: `scaleX(${Math.max(0, Math.min(1, Number(annUploadProgress.pct || 0) / 100))})` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </form>
                  ) : (
                    <div className={`${cardSurface} p-3.5 text-xs text-[#5C5B57] dark:text-[#A09F9A]`}>
                      Students can comment and ask doubts on any announcement thread below. Only course professors and TAs can post new announcements.
                    </div>
                  )}

                  {(workspace.announcements?.length || 0) === 0 &&
                  (workspace.assignments?.length || 0) === 0 ? (
                    <div className={`${cardSurface} relative overflow-hidden p-8 text-center`}>
                      <img
                        src="/illustrations/classroom-abstract.jpg"
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-[0.06] dark:opacity-[0.1]"
                      />
                      <div className="relative z-10 space-y-2">
                        <MessageSquare className="w-6 h-6 text-[#896ABD] mx-auto" />
                        <h3 className="text-sm font-semibold">No stream activity yet</h3>
                        <p className="text-xs text-[#5C5B57] dark:text-[#94938E] max-w-md mx-auto">
                          {perms.can_announce
                            ? 'Post an announcement above or publish classwork/quizzes to share updates with enrolled students.'
                            : 'Announcements and classwork uploaded by your course professors and TAs will appear here.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    (() => {
                      type StreamEntry =
                        | {
                            kind: 'announcement';
                            streamKey: string;
                            isPinned: boolean;
                            sortTime: number;
                            data: any;
                          }
                        | {
                            kind: 'classwork';
                            streamKey: string;
                            isPinned: boolean;
                            sortTime: number;
                            data: any;
                          };

                      const isStaffUser = Boolean(
                        perms.is_instructor || perms.is_ta || perms.is_admin
                      );
                      const matchesSectionView = (targets?: string[]) => {
                        if (!isStaffUser || sectionViewFilter === 'ALL') return true;
                        const norm =
                          Array.isArray(targets) && targets.length > 0 ? targets : ['ALL'];
                        return norm.some(
                          (t) =>
                            t.toUpperCase() === 'ALL' ||
                            t.toLowerCase() === sectionViewFilter.toLowerCase()
                        );
                      };
                      const streamEntries: StreamEntry[] = [
                        ...(workspace.announcements || [])
                          .filter((ann: any) => matchesSectionView(ann.target_sections))
                          .map((ann: any) => ({
                            kind: 'announcement' as const,
                            streamKey: `ann-${ann.id}`,
                            isPinned: Boolean(ann.is_pinned),
                            sortTime: new Date(ann.created_at || 0).getTime(),
                            data: ann,
                          })),
                        ...(workspace.assignments || [])
                          .filter((asgn: any) => matchesSectionView(asgn.target_sections))
                          .map((asgn: any) => ({
                            kind: 'classwork' as const,
                            streamKey: `asgn-${asgn.id}`,
                            isPinned: false,
                            sortTime: new Date(asgn.created_at || asgn.due_at || 0).getTime(),
                            data: asgn,
                          })),
                      ];

                      if (streamEntries.length === 0) {
                        return (
                          <div className={`${cardSurface} p-8 text-center space-y-2`}>
                            <p className="text-sm font-semibold text-[#0A0A0C]">
                              No posts targeted to {sectionViewFilter} yet
                            </p>
                            <button
                              type="button"
                              onClick={() => setSectionViewFilter('ALL')}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#DDD8CE] bg-white hover:border-[#E04F33]"
                            >
                              View All Sections
                            </button>
                          </div>
                        );
                      }

                      streamEntries.sort((a, b) => {
                        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                        return b.sortTime - a.sortTime;
                      });

                      const toggleStreamExpand = (key: string) => {
                        setExpandedStreamIds((prev) => ({ ...prev, [key]: !prev[key] }));
                      };

                      return (
                        <div className="space-y-3">
                          {streamEntries.map((entry) => {
                            const isOpen = Boolean(expandedStreamIds[entry.streamKey]);

                            if (entry.kind === 'classwork') {
                              const asgn = entry.data;
                              const isTcsQuiz = asgn.assignment_type === 'TCS_ION_QUIZ';
                              const mySub = asgn.my_submission;
                              const isGraded =
                                mySub?.marks_obtained !== null &&
                                mySub?.marks_obtained !== undefined;
                              const isOverdue =
                                !mySub &&
                                Boolean(asgn.due_at) &&
                                new Date(asgn.due_at).getTime() < Date.now();
                              const problemLink =
                                asgn.resource_links?.[0]?.url || asgn.resource_url;

                              return (
                                <article
                                  key={entry.streamKey}
                                  className={`${cardSurface} overflow-hidden transition-colors hover:border-[#896ABD]/55`}
                                >
                                  <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    onClick={() => toggleStreamExpand(entry.streamKey)}
                                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-[#FAF9F6]/80 transition-colors"
                                  >
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                      <div
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                          isTcsQuiz
                                            ? 'bg-[#896ABD]/15 text-[#5B3B96]'
                                            : 'bg-[#E04F33]/12 text-[#E04F33]'
                                        }`}
                                      >
                                        <FileCheck2 className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span
                                            className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold uppercase ${
                                              isTcsQuiz
                                                ? 'bg-[#896ABD]/15 text-[#5B3B96]'
                                                : 'bg-[#0A0A0C] text-white'
                                            }`}
                                          >
                                            {isTcsQuiz ? 'TCS iON Quiz' : asgn.assignment_type || 'Classwork'}
                                          </span>
                                          <span className="font-mono-tabular text-[11px] font-semibold text-emerald-700">
                                            {asgn.max_marks} Marks
                                          </span>
                                          {(() => {
                                            const tgts: string[] =
                                              Array.isArray(asgn.target_sections) &&
                                              asgn.target_sections.length > 0
                                                ? asgn.target_sections
                                                : ['ALL'];
                                            const isAll = tgts.some(
                                              (t) => t.toUpperCase() === 'ALL'
                                            );
                                            return (
                                              <span
                                                className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                                                  isAll
                                                    ? 'bg-[#896ABD]/12 text-[#5B3B96]'
                                                    : 'bg-[#E04F33]/12 text-[#B93820]'
                                                }`}
                                              >
                                                {formatTargetSectionsLabel(tgts)}
                                              </span>
                                            );
                                          })()}
                                          {(perms.is_instructor || perms.is_ta || perms.is_admin) &&
                                            asgn.can_edit === false && (
                                              <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-amber-500/15 text-amber-800">
                                                Read-only
                                              </span>
                                            )}
                                          {!perms.is_instructor &&
                                            !perms.is_admin &&
                                            !perms.is_ta && (
                                              <span
                                                className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                                                  isGraded
                                                    ? 'bg-emerald-500/15 text-emerald-800'
                                                    : mySub
                                                    ? 'bg-amber-500/15 text-amber-800'
                                                    : isOverdue
                                                    ? 'bg-rose-500/15 text-rose-700'
                                                    : 'bg-black/[0.05] text-[#353430]'
                                                }`}
                                              >
                                                {isGraded
                                                  ? `Graded ${mySub.marks_obtained}/${asgn.max_marks}`
                                                  : mySub
                                                  ? 'Submitted'
                                                  : isOverdue
                                                  ? 'Overdue'
                                                  : 'Pending'}
                                              </span>
                                            )}
                                          {(perms.is_instructor || perms.is_admin || perms.is_ta) && (
                                            <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] text-[#353430]">
                                              {asgn.submissions?.length || asgn.submission_count || 0} Submissions
                                            </span>
                                          )}
                                        </div>
                                        <h4 className="font-semibold text-sm sm:text-base text-[#0A0A0C] truncate">
                                          {asgn.title}
                                        </h4>
                                        {asgn.description && (
                                          <p className="text-xs text-[#5C5B57] line-clamp-1">
                                            {asgn.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2.5 shrink-0">
                                      <span className="hidden sm:inline-block font-mono-tabular text-[11px] text-[#5C5B57]">
                                        {asgn.due_at
                                          ? `Due ${new Date(asgn.due_at).toLocaleDateString()}`
                                          : new Date(asgn.created_at || Date.now()).toLocaleDateString()}
                                      </span>
                                      <span className="p-1.5 rounded-lg border border-[#E5E2DC] bg-white text-[#353430]">
                                        {isOpen ? (
                                          <ChevronUp className="w-4 h-4" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4" />
                                        )}
                                      </span>
                                    </div>
                                  </button>

                                  {isOpen && (
                                    <div className="px-5 pb-5 pt-4 border-t border-[#E5E2DC] space-y-4">
                                      {asgn.description ? (
                                        <p className="text-sm text-[#3A3936] whitespace-pre-line leading-relaxed">
                                          {asgn.description}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-[#5C5B57] italic">
                                          No additional written instructions provided.
                                        </p>
                                      )}

                                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                        {asgn.topic_module && (
                                          <span className="px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] text-[#353430]">
                                            Module: {asgn.topic_module}
                                          </span>
                                        )}
                                        {asgn.is_group_assignment && (
                                <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-[#896ABD]/12 text-[#5B3B96]">
                                  Group (Max {asgn.max_group_size || 4})
                                </span>
                              )}
                              {asgn.tcs_ion_exam_code && (
                                          <span className="px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] font-mono-tabular text-[#0A0A0C]">
                                            Exam Code: {asgn.tcs_ion_exam_code}
                                          </span>
                                        )}
                                        {asgn.due_at && (
                                          <span className="px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] font-mono-tabular text-[#353430]">
                                            Due: {new Date(asgn.due_at).toLocaleString()}
                                          </span>
                                        )}
                                      </div>

                                      {safeExternalUrl(problemLink) && (
                                        <div>
                                          <a
                                            href={safeExternalUrl(problemLink)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#896ABD]/10 text-[#5B3B96] border border-[#896ABD]/25 hover:border-[#896ABD]"
                                          >
                                            <Link2 className="w-3.5 h-3.5" />
                                            <span>
                                              {asgn.resource_links?.[0]?.label ||
                                                'Problem Statement / Reference'}
                                            </span>
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        </div>
                                      )}

                                      {mySub?.feedback && (
                                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                                          <strong>Evaluator Feedback:</strong> {mySub.feedback}
                                        </div>
                                      )}

                                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E2DC]/70">
                                        <div className="flex flex-wrap items-center gap-2">
                                          {isTcsQuiz && safeExternalUrl(asgn.tcs_ion_launch_url) ? (
                                            <a
                                              href={safeExternalUrl(asgn.tcs_ion_launch_url)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] text-white hover:bg-[#896ABD] inline-flex items-center gap-1.5"
                                            >
                                              <span>Launch TCS iON Quiz</span>
                                              <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                          ) : !perms.is_instructor &&
                                            !perms.is_admin &&
                                            !perms.is_ta &&
                                            !isGraded ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSubmittingAssignment(asgn);
                                                setDirectLinkUrl(mySub?.submission_url || '');
                                                setSubmissionNotes(mySub?.submission_notes || '');
                                              }}
                                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E04F33] hover:opacity-90 text-white inline-flex items-center gap-1.5"
                                            >
                                              <UploadCloud className="w-3.5 h-3.5" />
                                              <span>
                                                {mySub ? 'Update Submission' : 'Submit Assignment'}
                                              </span>
                                            </button>
                                          ) : null}

                                          <button
                                            type="button"
                                            onClick={() => setActiveTab('classwork')}
                                            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-[#0A0A0C]"
                                          >
                                            Open in Classwork
                                          </button>
                                          <AddToCalendarButton
                                            title={`[${off.course_code}] ${asgn.title}`}
                                            details={asgn.description || off.course_name}
                                            dueAt={asgn.due_at}
                                          />
                                        </div>

                                        {(perms.can_announce || perms.can_manage_course) &&
                                          asgn.can_edit !== false && (
                                          <div className="flex items-center gap-1.5">
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
                                              className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] text-xs font-medium text-[#353430] hover:border-[#896ABD] inline-flex items-center gap-1"
                                            >
                                              <Edit3 className="w-3 h-3" />
                                              <span>Edit</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteAssignment(asgn.id, asgn.title)
                                              }
                                              className="px-2.5 py-1.5 rounded-lg border border-rose-500/25 text-xs font-medium text-rose-700 hover:bg-rose-500/10 inline-flex items-center gap-1"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              <span>Delete</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </article>
                              );
                            }

                            const ann = entry.data;
                            const headline =
                              ann.title ||
                              String(ann.content || '')
                                .split('\n')[0]
                                .slice(0, 85);

                            return (
                              <article
                                key={entry.streamKey}
                                className={`${cardSurface} overflow-hidden transition-colors hover:border-[#896ABD]/55`}
                              >
                                {/* Click-to-Expand Announcement Header */}
                                <button
                                  type="button"
                                  aria-expanded={isOpen}
                                  onClick={() => toggleStreamExpand(entry.streamKey)}
                                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-[#FAF9F6]/80 transition-colors"
                                >
                                  <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className="w-9 h-9 rounded-xl bg-[#896ABD]/12 text-[#5B3B96] flex items-center justify-center shrink-0 mt-0.5">
                                      <MessageSquare className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-xs sm:text-sm text-[#0A0A0C]">
                                          {ann.author_name}
                                        </span>
                                        <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-black/[0.05] text-[#5C5B57]">
                                          {ann.author_role}
                                        </span>
                                        {(() => {
                                          const tgts: string[] =
                                            Array.isArray(ann.target_sections) &&
                                            ann.target_sections.length > 0
                                              ? ann.target_sections
                                              : ['ALL'];
                                          const isAll = tgts.some(
                                            (t) => t.toUpperCase() === 'ALL'
                                          );
                                          return (
                                            <span
                                              className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                                                isAll
                                                  ? 'bg-[#896ABD]/12 text-[#5B3B96]'
                                                  : 'bg-[#E04F33]/12 text-[#B93820]'
                                              }`}
                                            >
                                              {formatTargetSectionsLabel(tgts)}
                                            </span>
                                          );
                                        })()}
                                        {(perms.is_instructor || perms.is_ta || perms.is_admin) &&
                                          ann.can_edit === false && (
                                            <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-amber-500/15 text-amber-800">
                                              Read-only
                                            </span>
                                          )}
                                        {ann.is_scheduled && (
                                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-amber-500/15 text-amber-800">
                                            Scheduled ({new Date(ann.scheduled_for).toLocaleString()})
                                          </span>
                                        )}
                                        {ann.is_pinned && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-[#E04F33]/10 text-[#E04F33]">
                                            <Pin className="w-3 h-3" /> Pinned
                                          </span>
                                        )}
                                        {ann.allow_comments === false && (
                                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-amber-500/10 text-amber-800">
                                            Comments Locked
                                          </span>
                                        )}
                                        {(ann.attachment_urls?.length || 0) > 0 && (
                                          <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-[#896ABD]/10 text-[#5B3B96]">
                                            {ann.attachment_urls.length} Attachment
                                            {ann.attachment_urls.length > 1 ? 's' : ''}
                                          </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-[#FAF9F6] border border-[#E5E2DC] text-[#5C5B57]">
                                          {ann.comments?.length || 0} Comments
                                        </span>
                                        <AnnouncementSeenByChip
                                          announcementId={ann.id}
                                          isStaff={Boolean(
                                            perms.is_instructor || perms.is_admin || perms.is_ta
                                          )}
                                        />
                                      </div>
                                      <h4 className="font-semibold text-sm sm:text-base text-[#0A0A0C] truncate">
                                        {headline}
                                      </h4>
                                      {ann.content && (
                                        <p className="text-xs text-[#5C5B57] line-clamp-1">
                                          {ann.content}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span className="hidden sm:inline-block font-mono-tabular text-[11px] text-[#5C5B57]">
                                      {new Date(ann.created_at).toLocaleDateString()}
                                    </span>
                                    <span className="p-1.5 rounded-lg border border-[#E5E2DC] bg-white text-[#353430]">
                                      {isOpen ? (
                                        <ChevronUp className="w-4 h-4" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4" />
                                      )}
                                    </span>
                                  </div>
                                </button>

                                {/* Expanded Full Post, Attachments, Staff Controls & Comments */}
                                {isOpen && (
                                  <div className="px-5 pb-5 pt-4 border-t border-[#E5E2DC] space-y-4">
                                    {(perms.can_announce || perms.can_manage_course) &&
                                      ann.can_edit !== false && (
                                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => handleTogglePinAnnouncement(ann)}
                                          className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                                            ann.is_pinned
                                              ? 'border-[#E04F33]/40 bg-[#E04F33]/10 text-[#E04F33]'
                                              : 'border-[#E5E2DC] text-[#5C5B57] hover:border-[#896ABD]'
                                          }`}
                                        >
                                          {ann.is_pinned ? 'Unpin' : 'Pin'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleAllowComments(ann)}
                                          className="px-2 py-1 rounded-lg border border-[#E5E2DC] text-[11px] font-medium text-[#5C5B57] hover:border-[#896ABD]"
                                        >
                                          {ann.allow_comments === false
                                            ? 'Unlock Comments'
                                            : 'Lock Comments'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingAnn(ann);
                                            setEditAnnTitle(ann.title || '');
                                            setEditAnnContent(ann.content || '');
                                          }}
                                          aria-label="Edit announcement"
                                          className="p-1.5 rounded-lg border border-[#E5E2DC] text-[#5C5B57] hover:border-[#896ABD] hover:text-[#0A0A0C]"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAnnouncement(ann.id)}
                                          aria-label="Delete announcement"
                                          className="p-1.5 rounded-lg border border-rose-500/25 text-rose-700 hover:bg-rose-500/10"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}

                                    <p className="text-sm sm:text-[15px] text-[#3A3936] whitespace-pre-line leading-relaxed">
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
                                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#896ABD]/10 text-[#896ABD] border border-[#896ABD]/25 hover:border-[#896ABD] transition-[border-color]"
                                            >
                                              <Link2 className="w-3.5 h-3.5" />
                                              <span>{att.label || 'Google Drive Attachment'}</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Threaded Comments (No Delete Button for Students) */}
                                    <div className="pt-3 border-t border-[#E5E2DC]/80 space-y-2.5">
                                      <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#5C5B57]">
                                        Comments &amp; Doubts ({ann.comments?.length || 0})
                                      </div>

                                      {ann.comments?.map((c: any) => (
                                        <div
                                          key={c.id}
                                          className={`p-3 rounded-xl text-xs space-y-1 border ${
                                            c.is_verified_ans
                                              ? 'bg-emerald-500/5 border-emerald-500/30'
                                              : 'bg-[#FAF9F6] border-[#E5E2DC]/70'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-semibold text-[#0A0A0C]">
                                                {c.author_name}
                                              </span>
                                              <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-black/[0.06] text-[#353430]">
                                                {c.author_role}
                                              </span>
                                              {c.created_at && (
                                                <span className="font-mono-tabular text-[10px] text-[#44433E]">
                                                  {new Date(c.created_at).toLocaleString([], {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                  })}
                                                </span>
                                              )}
                                              {c.is_verified_ans && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800">
                                                  <CheckCircle2 className="w-3 h-3" /> Verified Faculty/TA Answer
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {perms.can_announce &&
                                                ann.can_moderate_comments !== false && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleVerifyComment(c.id)}
                                                  className="text-[11px] font-medium text-[#896ABD] hover:underline"
                                                >
                                                  {c.is_verified_ans
                                                    ? 'Unmark Verified'
                                                    : 'Mark Verified'}
                                                </button>
                                              )}
                                              {(perms.can_announce || perms.can_manage_course) &&
                                                ann.can_moderate_comments !== false && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteComment(c.id)}
                                                  title="Delete comment"
                                                  aria-label="Delete comment"
                                                  className="p-1 rounded text-rose-700 hover:bg-rose-500/10"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-[#3A3936]">{c.content}</p>
                                        </div>
                                      ))}

                                      {ann.allow_comments === false && !perms.can_announce ? (
                                        <p className="text-[11px] text-[#5C5B57] italic pt-1">
                                          Comments are locked by the course instructor on this post.
                                        </p>
                                      ) : (
                                        <div className="flex items-center gap-2 pt-1">
                                          <input
                                            type="text"
                                            value={commentInputs[ann.id] || ''}
                                            onChange={(e) =>
                                              setCommentInputs((prev) => ({
                                                ...prev,
                                                [ann.id]: e.target.value,
                                              }))
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
                                            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#0A0A0C] text-[#FAF9F6] hover:bg-[#E04F33] inline-flex items-center gap-1.5 shrink-0"
                                          >
                                            <Send className="w-3.5 h-3.5" />
                                            <span>Reply</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
  );
};
