import React from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Mail,
  MapPin,
  Phone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import { OfficeHoursSection } from '@/components/classroom/CommunicationExtras';
import { PendingRequestsAndClonePanel } from '@/components/classroom/RequestsAndPreviewControls';
import type {
  ClassroomWorkspace,
  Offering,
  WorkspacePermissions,
} from '@/types/classroom';

export interface ClassroomPeopleTabProps {
  workspace: ClassroomWorkspace;
  off: Offering;
  perms: WorkspacePermissions;
  user: any;
  cardSurface: string;
  offeringSectionsList: string[];
  myAssignedSections: string[];
  isUnrestrictedStaff: boolean;
  sectionViewFilter: string;
  studentPreviewSection: string | null;
  coProfEmail: string;
  setCoProfEmail: React.Dispatch<React.SetStateAction<string>>;
  coProfRole: string;
  setCoProfRole: React.Dispatch<React.SetStateAction<string>>;
  coProfSection: string;
  setCoProfSection: React.Dispatch<React.SetStateAction<string>>;
  taSection: string;
  setTaSection: React.Dispatch<React.SetStateAction<string>>;
  newTaForm: {
    public_name: string;
    public_email: string;
    public_phone: string;
    public_batch: string;
    lab_hours: string;
  };
  setNewTaForm: React.Dispatch<
    React.SetStateAction<{
      public_name: string;
      public_email: string;
      public_phone: string;
      public_batch: string;
      lab_hours: string;
    }>
  >;
  rosterDefaultSection: string;
  setRosterDefaultSection: React.Dispatch<React.SetStateAction<string>>;
  rosterUploading: boolean;
  rosterUploadResult: any | null;
  setRosterUploadResult: React.Dispatch<React.SetStateAction<any | null>>;
  rosterInputRef: React.MutableRefObject<HTMLInputElement | null>;
  loadWorkspace: (id: number, opts?: { forceSilent?: boolean }) => Promise<void>;
  loadOfferingsList: (silent?: boolean) => Promise<void>;
  handleSelectOffering: (id: number, initialTab?: 'stream' | 'classwork') => void;
  handleAddCoProfessor: (e: React.FormEvent) => Promise<void> | void;
  handleUpdateInstructorSection: (professorId: number, sectionVal: string) => Promise<void> | void;
  handleRemoveInstructor: (professorId: number, name: string) => Promise<void> | void;
  handleAddCourseTA: (e: React.FormEvent) => Promise<void> | void;
  handleToggleTaPerm: (ta: any, field: 'can_grade' | 'can_announce') => Promise<void> | void;
  handleRemoveTa: (taId: number, name: string) => Promise<void> | void;
  handleUpdateStudentSection: (enrollmentId: number, nextSection: string) => Promise<void> | void;
  handleRemoveStudent: (enrollmentId: number, name: string) => Promise<void> | void;
  handleUploadRosterFile: (file: File | null | undefined) => Promise<void> | void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export const ClassroomPeopleTab: React.FC<ClassroomPeopleTabProps> = ({
  workspace,
  off,
  perms,
  user,
  cardSurface,
  offeringSectionsList,
  myAssignedSections,
  isUnrestrictedStaff,
  sectionViewFilter,
  studentPreviewSection,
  coProfEmail,
  setCoProfEmail,
  coProfRole,
  setCoProfRole,
  coProfSection,
  setCoProfSection,
  taSection,
  setTaSection,
  newTaForm,
  setNewTaForm,
  rosterDefaultSection,
  setRosterDefaultSection,
  rosterUploading,
  rosterUploadResult,
  setRosterUploadResult,
  rosterInputRef,
  loadWorkspace,
  loadOfferingsList,
  handleSelectOffering,
  handleAddCoProfessor,
  handleUpdateInstructorSection,
  handleRemoveInstructor,
  handleAddCourseTA,
  handleToggleTaPerm,
  handleRemoveTa,
  handleUpdateStudentSection,
  handleRemoveStudent,
  handleUploadRosterFile,
  showToast,
}) => {
  return (
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
                    {perms.can_manage_all_sections && (
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
                        <select
                          value={coProfSection}
                          onChange={(e) => setCoProfSection(e.target.value)}
                          aria-label="Co-Professor Section Scope"
                          className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD] font-mono-tabular"
                        >
                          <option value="ALL">All Sections</option>
                          {offeringSectionsList.map((sec) => (
                            <option key={`coprof-sec-${sec}`} value={sec}>
                              {sec}
                            </option>
                          ))}
                        </select>
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
                          <div className="flex items-center gap-2.5 min-w-0">
                            {inst.photo_path ? (
                              <img
                                src={inst.photo_path}
                                alt={inst.name}
                                className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#E5E2DC]"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-[#0A0A0C] text-white text-xs font-semibold flex items-center justify-center shrink-0">
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
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] dark:bg-white/[0.08] font-medium">
                              {inst.role_label}
                            </span>
                            {(() => {
                              const secs: string[] =
                                Array.isArray(inst.assigned_sections) &&
                                inst.assigned_sections.length > 0
                                  ? inst.assigned_sections
                                  : ['ALL'];
                              const isAll = secs.some((s) => s.toUpperCase() === 'ALL');
                              const canEditScope =
                                perms.can_manage_all_sections ||
                                Number(inst.professor_id) === Number(user?.id);
                              if (canEditScope) {
                                const selectVal = isAll ? 'ALL' : secs[0];
                                const selectOptions = Array.from(
                                  new Set([...offeringSectionsList, ...(isAll ? [] : secs)])
                                );
                                return (
                                  <select
                                    value={selectVal}
                                    onChange={(e) =>
                                      handleUpdateInstructorSection(
                                        inst.professor_id,
                                        e.target.value
                                      )
                                    }
                                    aria-label={`Section scope for ${inst.name}`}
                                    className="px-2 py-0.5 rounded border border-[#DDD8CE] dark:border-white/15 bg-white dark:bg-[#0A0A0C] font-mono-tabular text-[10px] font-semibold text-[#5B3B96] dark:text-[#D5C4F7]"
                                  >
                                    <option value="ALL">All Sections</option>
                                    {selectOptions.map((s) => (
                                      <option key={`inst-${inst.professor_id}-${s}`} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                );
                              }
                              return (
                                <span
                                  className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                                    isAll
                                      ? 'bg-[#896ABD]/12 text-[#5B3B96] dark:text-[#D5C4F7]'
                                      : 'bg-[#E04F33]/12 text-[#B93820] dark:text-[#FFA494]'
                                  }`}
                                >
                                  {isAll ? 'All Sections' : secs.join(', ')}
                                </span>
                              );
                            })()}
                            {perms.can_manage_all_sections && workspace.instructors.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveInstructor(inst.professor_id, inst.name)}
                                title="Remove co-professor"
                                aria-label={`Remove ${inst.name}`}
                                className="p-1 rounded-lg border border-rose-500/25 text-rose-700 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
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
                      className="p-3.5 rounded-xl bg-[#FAF9F6] dark:bg-white/[0.02] border border-[#E5E2DC]/80 dark:border-white/10 grid grid-cols-1 sm:grid-cols-6 gap-2 text-xs"
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
                      <select
                        value={taSection}
                        onChange={(e) => setTaSection(e.target.value)}
                        aria-label="TA Section Scope"
                        className="px-2.5 py-1.5 rounded-lg border border-[#E5E2DC] dark:border-white/15 bg-white dark:bg-[#0A0A0C]/80 focus:outline-none focus:border-[#896ABD] font-mono-tabular"
                      >
                        {perms.can_manage_all_sections && (
                          <option value="ALL">All Sections</option>
                        )}
                        {(perms.can_manage_all_sections
                          ? offeringSectionsList
                          : myAssignedSections
                        ).map((sec) => (
                          <option key={`ta-sec-${sec}`} value={sec}>
                            {sec}
                          </option>
                        ))}
                      </select>
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
                          className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm">{ta.public_name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                                Teaching Assistant
                              </span>
                              {(() => {
                                const secs: string[] =
                                  Array.isArray(ta.assigned_sections) &&
                                  ta.assigned_sections.length > 0
                                    ? ta.assigned_sections
                                    : ['ALL'];
                                const isAll = secs.some((s) => s.toUpperCase() === 'ALL');
                                return (
                                  <span
                                    className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                                      isAll
                                        ? 'bg-[#896ABD]/12 text-[#5B3B96] dark:text-[#D5C4F7]'
                                        : 'bg-[#E04F33]/12 text-[#B93820] dark:text-[#FFA494]'
                                    }`}
                                  >
                                    {isAll ? 'All Sections' : secs.join(', ')}
                                  </span>
                                );
                              })()}
                              {(perms.can_manage_all_sections ||
                                (perms.can_manage_course &&
                                  Array.isArray(ta.assigned_sections) &&
                                  ta.assigned_sections.length > 0 &&
                                  !ta.assigned_sections.some(
                                    (s: string) => s.toUpperCase() === 'ALL'
                                  ) &&
                                  ta.assigned_sections.every((s: string) =>
                                    myAssignedSections.some(
                                      (m) => m.toLowerCase() === s.toLowerCase()
                                    )
                                  ))) && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTa(ta.id, ta.public_name)}
                                  title="Remove Course TA"
                                  aria-label={`Remove ${ta.public_name}`}
                                  className="p-1 rounded-lg border border-rose-500/25 text-rose-700 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
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
                          {perms.can_manage_course && (
                            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-emerald-500/15">
                              <button
                                type="button"
                                onClick={() => handleToggleTaPerm(ta, 'can_grade')}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                  ta.can_grade
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white border-[#E5E2DC] text-[#5C5B57]'
                                }`}
                              >
                                {ta.can_grade ? '✓ Can Grade' : 'Grading Off'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleTaPerm(ta, 'can_announce')}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                  ta.can_announce
                                    ? 'bg-[#896ABD] text-white border-[#896ABD]'
                                    : 'bg-white border-[#E5E2DC] text-[#5C5B57]'
                                }`}
                              >
                                {ta.can_announce ? '✓ Can Announce' : 'Announce Off'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Enrolled Students Roster + Excel (.xlsx/.csv) Upload */}
                <section className={`${cardSurface} p-6 space-y-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        Registered Student Roster ({workspace.roster_count})
                      </h3>
                      <p className="text-xs text-[#5C5B57] dark:text-[#94938E]">
                        Enrolled students for {off.programme} Semester {off.semester}. Professors and IT Admin can bulk-import valid @jklu.edu.in emails via Excel (.xlsx) or CSV.
                      </p>
                    </div>

                    {perms.can_manage_course && (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={classroomApi.getRosterTemplateUrl()}
                          download="JKLU_Course_Roster_Template.csv"
                          className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-xs font-semibold text-[#353430] inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-[#896ABD]" />
                          <span>Template (.csv)</span>
                        </a>
                        <select
                          value={rosterDefaultSection}
                          onChange={(e) => setRosterDefaultSection(e.target.value)}
                          aria-label="Default upload section"
                          title="Default section when Excel/CSV rows leave Section blank"
                          className="px-2.5 py-2 rounded-xl border border-[#DDD8CE] dark:border-white/15 bg-white dark:bg-[#0A0A0C] text-xs font-mono-tabular font-semibold text-[#353430] dark:text-[#F5F4F0]"
                        >
                          {Array.from(
                            new Set([
                              ...(isUnrestrictedStaff ? offeringSectionsList : myAssignedSections),
                              rosterDefaultSection,
                            ])
                          ).map((sec) => (
                            <option key={`roster-default-${sec}`} value={sec}>
                              Default: {sec}
                            </option>
                          ))}
                        </select>
                        <label
                          className={`px-3.5 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                            rosterUploading ? 'opacity-60 pointer-events-none' : ''
                          }`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>
                            {rosterUploading
                              ? 'Importing Emails...'
                              : 'Upload Excel / CSV Emails'}
                          </span>
                          <input
                            ref={rosterInputRef}
                            type="file"
                            accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              handleUploadRosterFile(f);
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {rosterUploadResult && (
                    <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2 font-semibold text-emerald-900">
                        <span>{rosterUploadResult.message}</span>
                        <button
                          type="button"
                          onClick={() => setRosterUploadResult(null)}
                          className="text-[11px] underline text-emerald-800"
                        >
                          Dismiss
                        </button>
                      </div>
                      <p className="text-emerald-800 font-mono-tabular text-[11px]">
                        Imported: {rosterUploadResult.imported ?? 0} · Active accounts linked:{' '}
                        {rosterUploadResult.linked_existing ?? 0} · Pre-enrolled for future signup:{' '}
                        {rosterUploadResult.pre_enrolled ?? 0} · Skipped invalid:{' '}
                        {rosterUploadResult.skipped_invalid ?? 0}
                      </p>
                      {Array.isArray(rosterUploadResult.invalid_samples) &&
                        rosterUploadResult.invalid_samples.length > 0 && (
                          <p className="text-amber-800 text-[11px]">
                            Invalid sample rows:{' '}
                            {rosterUploadResult.invalid_samples.join(', ')}
                          </p>
                        )}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#E5E2DC] dark:border-white/10 text-[#5C5B57] dark:text-[#8E8D88] font-mono-tabular text-[11px] uppercase">
                          <th className="py-2 pr-4">Roll No</th>
                          <th className="py-2 pr-4">Student Name</th>
                          <th className="py-2 pr-4">Section</th>
                          <th className="py-2 pr-4">Source</th>
                          {perms.can_grade && <th className="py-2 pr-4">TCS iON Attendance</th>}
                          {perms.can_manage_course && <th className="py-2 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(workspace.roster || [])
                          .filter((r: any) => {
                            if (
                              (!perms.is_instructor && !perms.is_ta && !perms.is_admin) ||
                              sectionViewFilter === 'ALL'
                            ) {
                              return true;
                            }
                            return (
                              String(r.section || 'Sec A').toLowerCase() ===
                              sectionViewFilter.toLowerCase()
                            );
                          })
                          .map((r: any) => (
                          <tr
                            key={r.id}
                            className="border-b border-[#E5E2DC]/60 dark:border-white/5 last:border-b-0"
                          >
                            <td className="py-2.5 pr-4 font-mono-tabular font-semibold">
                              {r.roll_no || 'AUTO'}
                            </td>
                            <td className="py-2.5 pr-4 font-medium">{r.student_name}</td>
                            <td className="py-2.5 pr-4">
                              {perms.can_manage_course && r.can_manage_student !== false ? (
                                <select
                                  value={r.section || 'Sec A'}
                                  onChange={(e) =>
                                    handleUpdateStudentSection(r.id, e.target.value)
                                  }
                                  aria-label={`Section for ${r.student_name}`}
                                  className="px-2 py-1 rounded-lg border border-[#DDD8CE] dark:border-white/15 bg-white dark:bg-[#0A0A0C] font-mono-tabular text-[11px]"
                                >
                                  {Array.from(
                                    new Set([
                                      ...(isUnrestrictedStaff
                                        ? offeringSectionsList
                                        : myAssignedSections),
                                      r.section || 'Sec A',
                                    ])
                                  ).map((sec) => (
                                    <option key={`stu-sec-${r.id}-${sec}`} value={sec}>
                                      {sec}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span>{r.section || 'Sec A'}</span>
                              )}
                            </td>
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
                            {perms.can_manage_course && (
                              <td className="py-2.5 text-right">
                                {r.can_manage_student !== false ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStudent(r.id, r.student_name)}
                                    title="Remove student from roster"
                                    aria-label={`Remove ${r.student_name}`}
                                    className="px-2 py-1 rounded-lg border border-rose-500/25 text-rose-700 hover:bg-rose-500/10 text-[11px] font-medium"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <span className="text-[11px] font-mono-tabular text-[#5C5B57] dark:text-[#8E8D88]">
                                    Read-only
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

                <OfficeHoursSection
                  offeringId={Number(off.id)}
                  isStaff={
                    !studentPreviewSection &&
                    Boolean(perms.is_instructor || perms.is_admin || perms.is_ta)
                  }
                  onToast={showToast}
                />

                {!studentPreviewSection && (
                  <PendingRequestsAndClonePanel
                    offeringId={Number(off.id)}
                    courseCode={off.course_code}
                    canManageCourse={Boolean(perms.can_manage_course)}
                    onRefreshWorkspace={() => loadWorkspace(Number(off.id), { forceSilent: true })}
                    onCloned={async (newId) => {
                      await loadOfferingsList(true);
                      handleSelectOffering(newId, 'stream');
                    }}
                    onToast={showToast}
                  />
                )}
              </div>
  );
};
