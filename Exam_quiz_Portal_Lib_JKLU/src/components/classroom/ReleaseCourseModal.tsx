import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  UploadCloud,
  X,
  Download,
  BookOpen,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

interface ReleaseCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (data: { offering?: any; message?: string }) => void;
  isAdmin?: boolean;
}

const INITIAL_FORM = {
  course_code: '',
  course_name: '',
  programme: 'B.TECH',
  semester: '3',
  batch_year: '2024-2028',
  section: 'Sec A, Sec B',
  primary_section_scope: 'ALL',
  credits: '4',
  academic_session: 'Monsoon 2026',
  is_elective: false,
  primary_professor_email: '',
  co_professor_emails: '',
  tcs_ion_course_id: '',
  description: '',
  ta_name: '',
  ta_email: '',
  ta_phone: '',
};

export const ReleaseCourseModal: React.FC<ReleaseCourseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isAdmin = false,
}) => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [catalogCourses, setCatalogCourses] = useState<
    Array<{ code: string; name: string; department?: string; semester?: string }>
  >([]);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [confirmNewCourseCode, setConfirmNewCourseCode] = useState(false);
  const [newCourseConfirmError, setNewCourseConfirmError] = useState(false);

  const [syllabusPdfFile, setSyllabusPdfFile] = useState<File | null>(null);
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || catalogCourses.length > 0) return;
    classroomApi
      .listCatalogCourses()
      .then((data) => {
        const raw = Array.isArray(data) ? data : data?.courses || data?.items || [];
        const normalized = raw
          .map((c: any) => ({
            code: String(c.code || '').trim().toUpperCase(),
            name: String(c.name || c.code || '').trim(),
            department: c.department ? String(c.department).trim().toUpperCase() : '',
            semester: c.semester ? String(c.semester).trim() : '',
          }))
          .filter((c: any) => c.code);
        setCatalogCourses(normalized);
      })
      .catch(() => {});
  }, [isOpen, catalogCourses.length]);

  const normalizedCourseCode = form.course_code.trim().toUpperCase();
  const matchedCatalogCourse = useMemo(
    () =>
      normalizedCourseCode
        ? catalogCourses.find((c) => c.code === normalizedCourseCode) || null
        : null,
    [catalogCourses, normalizedCourseCode]
  );
  const isUnlistedNewCourse = Boolean(
    normalizedCourseCode.length >= 2 && catalogCourses.length > 0 && !matchedCatalogCourse
  );
  const filteredCatalogCourses = useMemo(() => {
    if (!catalogCourses.length) return [];
    const q = normalizedCourseCode.toLowerCase();
    if (!q) return catalogCourses.slice(0, 12);
    return catalogCourses
      .filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [catalogCourses, normalizedCourseCode]);

  const parsedSections = useMemo(() => {
    const raw = String(form.section || '').trim();
    if (!raw) return ['Sec A'];
    const parts = raw
      .split(/[,;/]+/)
      .flatMap((chunk) => {
        if (!chunk.includes('&')) return [chunk.trim()];
        const subs = chunk.split('&').map((s) => s.trim()).filter(Boolean);
        const prefix = /^sec(?:tion)?\s+/i.exec(subs[0] || '');
        return subs.map((tok, i) =>
          i > 0 && prefix && !/^(sec|section)\b/i.test(tok) && /^[A-Za-z0-9]+$/i.test(tok)
            ? `${prefix[0].trim()} ${tok}`
            : tok
        );
      })
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s && !/^all$/i.test(s));
    const unique: string[] = [];
    for (const p of parts) {
      if (!unique.some((u) => u.toLowerCase() === p.toLowerCase())) unique.push(p);
    }
    return unique.length > 0 ? unique : ['Sec A'];
  }, [form.section]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setForm(INITIAL_FORM);
    setConfirmNewCourseCode(false);
    setNewCourseConfirmError(false);
    setSyllabusPdfFile(null);
    setRosterFile(null);
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isUnlistedNewCourse && !confirmNewCourseCode) {
      setNewCourseConfirmError(true);
      return;
    }

    setSubmitting(true);
    try {
      const tasPayload =
        form.ta_name.trim() && form.ta_email.trim()
          ? [
              {
                public_name: form.ta_name.trim(),
                public_email: form.ta_email.trim(),
                public_phone: form.ta_phone.trim(),
              },
            ]
          : [];

      // Support optional "email:Sec B" syntax inside co_professor_emails
      const coProfessorsList = String(form.co_professor_emails || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((token) => {
          const [rawEmail, rawSec] = token.split(':').map((p) => p.trim());
          return {
            email: rawEmail.toLowerCase(),
            role_label: rawSec ? `Instructor (${rawSec})` : 'Co-Instructor',
            assigned_sections: rawSec ? [rawSec] : ['ALL'],
          };
        })
        .filter((cp) => cp.email);

      const resData = await classroomApi.createOffering({
        course_code: normalizedCourseCode,
        course_name: form.course_name.trim(),
        programme: form.programme,
        semester: form.semester.trim(),
        batch_year: form.batch_year.trim(),
        section: parsedSections.join(', '),
        sections: parsedSections,
        primary_assigned_sections:
          form.primary_section_scope === 'ALL' ? ['ALL'] : [form.primary_section_scope],
        credits: Number(form.credits) || 4,
        academic_session: form.academic_session.trim() || 'Monsoon 2026',
        is_elective: form.is_elective,
        auto_enroll: !form.is_elective,
        primary_professor_email:
          isAdmin && form.primary_professor_email.trim()
            ? form.primary_professor_email.trim()
            : undefined,
        co_professors: coProfessorsList,
        tcs_ion_course_id: form.tcs_ion_course_id.trim(),
        description: form.description.trim() || null,
        tas: tasPayload,
        is_released: true,
      });

      const createdOffering = resData?.offering;
      const offeringId = Number(createdOffering?.id);
      const notes: string[] = [];
      if (resData?.message) notes.push(resData.message);

      if (offeringId > 0 && syllabusPdfFile) {
        try {
          const pdfFd = new FormData();
          pdfFd.append('file', syllabusPdfFile);
          await classroomApi.uploadSyllabusPdf(offeringId, pdfFd);
          notes.push('Course Description PDF attached.');
        } catch (pdfErr: any) {
          notes.push(
            `Course created, but PDF upload failed: ${
              pdfErr?.response?.data?.detail || pdfErr?.message || 'error'
            }`
          );
        }
      }

      if (offeringId > 0 && rosterFile) {
        try {
          const rFd = new FormData();
          rFd.append('file', rosterFile);
          const rData = await classroomApi.uploadRoster(offeringId, rFd);
          if (rData?.message) notes.push(rData.message);
        } catch (rosterErr: any) {
          notes.push(
            `Course created, but roster upload failed: ${
              rosterErr?.response?.data?.detail || rosterErr?.message || 'error'
            }`
          );
        }
      }

      const finalMsg = notes.join(' ');
      resetAndClose();
      onSuccess?.({ offering: createdOffering, message: finalMsg });
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail || err?.message || 'Failed to release course classroom'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={resetAndClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel-enter bg-[#FAF9F6] border border-[#DDD8CE] rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto shadow-[var(--shadow-elevated)] text-[#0A0A0C]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#E04F33] font-semibold">
              Core Auto-Enroll · Elective Join Code · Excel/CSV Roster
            </span>
            <h3 className="text-lg font-bold mt-0.5 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#896ABD]" />
              <span>Release New Course Classroom</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#E04F33] text-[#353430]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Course Type Selector: Core (Non-Elective) vs Elective */}
          <div className="space-y-1.5">
            <label className="font-mono-tabular text-[10px] uppercase block text-[#353430] font-semibold">
              Course Enrollment Mode *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setForm({ ...form, is_elective: false })}
                className={`p-3 rounded-xl border text-left transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98] ${
                  !form.is_elective
                    ? 'border-[#0A0A0C] bg-white ring-2 ring-[#0A0A0C]/15'
                    : 'border-[#DDD8CE] bg-white/60 hover:border-[#896ABD]'
                }`}
              >
                <div className="font-semibold text-[#0A0A0C] flex items-center justify-between">
                  <span>Core / Mandatory Course</span>
                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Auto-Enroll
                  </span>
                </div>
                <p className="text-[11px] text-[#5C5B57] mt-0.5">
                  Automatically enrolls registered students matching Programme &amp; Semester.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setForm({ ...form, is_elective: true })}
                className={`p-3 rounded-xl border text-left transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98] ${
                  form.is_elective
                    ? 'border-[#896ABD] bg-white ring-2 ring-[#896ABD]/20'
                    : 'border-[#DDD8CE] bg-white/60 hover:border-[#896ABD]'
                }`}
              >
                <div className="font-semibold text-[#0A0A0C] flex items-center justify-between">
                  <span>Elective Course</span>
                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-[#896ABD]/15 text-[#5B3B96]">
                    Code / Excel
                  </span>
                </div>
                <p className="text-[11px] text-[#5C5B57] mt-0.5">
                  Enrolls only via generated Join Code or Excel/CSV roster email list.
                </p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Course Code * ({catalogCourses.length > 0 ? `${catalogCourses.length} in catalog` : 'loading...'})
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                placeholder="Select or type e.g. CS1135"
                value={form.course_code}
                onFocus={() => setCourseDropdownOpen(true)}
                onBlur={() => setTimeout(() => setCourseDropdownOpen(false), 160)}
                onChange={(e) => {
                  const nextCode = e.target.value.toUpperCase();
                  setForm({ ...form, course_code: nextCode });
                  setConfirmNewCourseCode(false);
                  setNewCourseConfirmError(false);
                  setCourseDropdownOpen(true);
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white font-mono-tabular font-semibold uppercase text-[#0A0A0C] focus:outline-none focus:border-[#896ABD]"
              />

              {courseDropdownOpen && filteredCatalogCourses.length > 0 && (
                <div className="absolute left-0 right-0 sm:w-[340px] mt-1 max-h-56 overflow-y-auto rounded-xl border border-[#DDD8CE] bg-white shadow-xl z-40 divide-y divide-[#EFECE6]">
                  {filteredCatalogCourses.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const validProgs = new Set(['B.TECH', 'BBA', 'BCA', 'B.DES', 'M.TECH']);
                        setForm((prev) => ({
                          ...prev,
                          course_code: c.code,
                          course_name: c.name || prev.course_name,
                          programme:
                            c.department && validProgs.has(c.department)
                              ? c.department
                              : prev.programme,
                          semester: c.semester || prev.semester,
                          tcs_ion_course_id: prev.tcs_ion_course_id || `TCS-ION-${c.code}`,
                        }));
                        setConfirmNewCourseCode(false);
                        setNewCourseConfirmError(false);
                        setCourseDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[#FAF9F6] flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-mono-tabular font-bold text-[#0A0A0C]">
                          {c.code}
                        </span>
                        <span className="text-[#353430] ml-2 truncate inline-block align-bottom max-w-[190px]">
                          {c.name}
                        </span>
                      </div>
                      {c.department && (
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-black/[0.05] text-[#353430] shrink-0">
                          {c.department}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {matchedCatalogCourse && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Existing JKLU catalog course</span>
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Course Title *
              </label>
              <input
                type="text"
                required
                placeholder="Operating Systems & Kernel Design"
                value={form.course_name}
                onChange={(e) => setForm({ ...form, course_name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C] focus:outline-none focus:border-[#896ABD]"
              />
            </div>

            {isUnlistedNewCourse && (
              <div
                className={`sm:col-span-3 p-3 rounded-xl border space-y-2 transition-colors ${
                  newCourseConfirmError
                    ? 'bg-rose-50 border-rose-400 text-rose-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-200/80 font-mono-tabular text-[10px] font-bold uppercase shrink-0">
                    New Course Code
                  </span>
                  <p className="text-xs leading-snug">
                    <strong className="font-mono-tabular">{normalizedCourseCode}</strong> is not in
                    the existing JKLU course catalog ({catalogCourses.length} courses). Confirm below
                    if you want to register it as a brand-new course code.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmNewCourseCode}
                    onChange={(e) => {
                      setConfirmNewCourseCode(e.target.checked);
                      if (e.target.checked) setNewCourseConfirmError(false);
                    }}
                    className="w-4 h-4 accent-[#E04F33] rounded"
                  />
                  <span>
                    Yes, confirm adding{' '}
                    <span className="font-mono-tabular underline">{normalizedCourseCode}</span> as a
                    new JKLU course code
                  </span>
                </label>
                {newCourseConfirmError && (
                  <p className="text-[11px] font-semibold text-rose-700">
                    Please tick the confirmation box above (or select an existing course code from
                    the dropdown) before releasing.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Programme
              </label>
              <select
                value={form.programme}
                onChange={(e) => setForm({ ...form, programme: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              >
                <option value="B.TECH">B.TECH</option>
                <option value="BBA">BBA</option>
                <option value="BCA">BCA</option>
                <option value="B.DES">B.DES</option>
                <option value="M.TECH">M.TECH</option>
              </select>
            </div>
            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Semester
              </label>
              <input
                type="text"
                value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              />
            </div>
            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Target Batch
              </label>
              <input
                type="text"
                value={form.batch_year}
                onChange={(e) => setForm({ ...form, batch_year: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              />
            </div>

            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Course Sections (comma-separated)
              </label>
              <input
                type="text"
                placeholder="Sec A, Sec B"
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              />
            </div>
            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Primary Prof Teaching Scope
              </label>
              <select
                value={form.primary_section_scope}
                onChange={(e) => setForm({ ...form, primary_section_scope: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              >
                <option value="ALL">All Sections (Coordinator)</option>
                {parsedSections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec} Only
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Credits (1–6) · Session
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: e.target.value })}
                  className="w-16 px-2.5 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
                />
                <input
                  type="text"
                  value={form.academic_session}
                  onChange={(e) => setForm({ ...form, academic_session: e.target.value })}
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isAdmin && (
              <div className="sm:col-span-2">
                <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                  Primary Course Professor Email (IT Admin Assignment)
                </label>
                <input
                  type="email"
                  placeholder="dr.rajesh.sharma@jklu.edu.in (defaults to you if empty)"
                  value={form.primary_professor_email}
                  onChange={(e) =>
                    setForm({ ...form, primary_professor_email: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
                />
              </div>
            )}
            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                Co-Professor Emails (optional email:Sec B)
              </label>
              <input
                type="text"
                placeholder="dr.priya@jklu.edu.in:Sec B, prof2@jklu.edu.in"
                value={form.co_professor_emails}
                onChange={(e) => setForm({ ...form, co_professor_emails: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              />
            </div>
            <div>
              <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
                TCS iON Course Code
              </label>
              <input
                type="text"
                placeholder="TCS-ION-CS2104"
                value={form.tcs_ion_course_id}
                onChange={(e) => setForm({ ...form, tcs_ion_course_id: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
              />
            </div>
          </div>

          <div>
            <label className="font-mono-tabular text-[10px] uppercase block mb-1 text-[#353430] font-semibold">
              Course Overview / Description
            </label>
            <textarea
              rows={2}
              placeholder="Topics covered, evaluation weightage, prerequisites..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-[#0A0A0C]"
            />
          </div>

          {/* Course Description PDF & Excel/CSV Roster Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-[#DDD8CE] bg-white space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-tabular text-[10px] uppercase font-semibold text-[#353430] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#E04F33]" />
                  <span>Course Description PDF (≤10 MB)</span>
                </span>
                {syllabusPdfFile && (
                  <button
                    type="button"
                    onClick={() => setSyllabusPdfFile(null)}
                    className="text-[10px] text-rose-700 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && f.size > 10 * 1024 * 1024) {
                    setErrorMsg('Course description PDF must be 10 MB or smaller.');
                    e.target.value = '';
                    return;
                  }
                  setSyllabusPdfFile(f);
                }}
                className="w-full text-[11px] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-[#0A0A0C] file:text-white file:text-[11px] cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-xl border border-[#DDD8CE] bg-white space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-tabular text-[10px] uppercase font-semibold text-[#353430] flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#896ABD]" />
                  <span>Student Roster (.xlsx / .csv)</span>
                </span>
                <a
                  href={classroomApi.getRosterTemplateUrl()}
                  download="JKLU_Course_Roster_Template.csv"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#896ABD] hover:underline"
                >
                  <Download className="w-3 h-3" />
                  <span>Template</span>
                </a>
              </div>
              <input
                type="file"
                accept=".xlsx,.csv,.tsv"
                onChange={(e) => setRosterFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-[#896ABD] file:text-white file:text-[11px] cursor-pointer"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[#DDD8CE] bg-white/80 space-y-2">
            <div className="font-mono-tabular text-[10px] uppercase text-[#5C5B57] font-semibold">
              Optional Course Teaching Assistant
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="TA Name"
                value={form.ta_name}
                onChange={(e) => setForm({ ...form, ta_name: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
              />
              <input
                type="email"
                placeholder="TA Official Email"
                value={form.ta_email}
                onChange={(e) => setForm({ ...form, ta_email: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
              />
              <input
                type="text"
                placeholder="TA Public Phone"
                value={form.ta_phone}
                onChange={(e) => setForm({ ...form, ta_phone: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-4 py-2 rounded-xl border border-[#DDD8CE] bg-white font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#0A0A0C] text-white hover:bg-[#E04F33] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{submitting ? 'Creating & Publishing...' : 'Release Course Classroom'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReleaseCourseModal;
