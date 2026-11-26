import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Check, Copy, Eye, Send, X } from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

export const StudentPreviewBanner: React.FC<{
  previewSection: string | null;
  sections: string[];
  onChangePreview: (sec: string | null) => void;
}> = ({ previewSection, sections, onChangePreview }) => {
  if (!previewSection) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5 text-[#896ABD]" />
        <select
          value=""
          onChange={(e) => onChangePreview(e.target.value || null)}
          aria-label="Preview classroom as student"
          className="px-2.5 py-1 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular text-[11px] font-semibold text-[#5B3B96]"
        >
          <option value="">Student View Preview...</option>
          {(sections.length > 0 ? sections : ['Sec A']).map((s) => (
            <option key={`prev-${s}`} value={s}>
              Preview as {s} Student
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#896ABD] bg-[#896ABD]/12 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2 font-semibold text-[#5B3B96]">
        <Eye className="w-4 h-4" />
        <span>Previewing Classroom as Student ({previewSection})</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={previewSection}
          onChange={(e) => onChangePreview(e.target.value)}
          className="px-2 py-1 rounded-lg border border-[#896ABD]/40 bg-white font-mono-tabular text-[11px]"
        >
          {sections.map((s) => (
            <option key={`prev-sw-${s}`} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChangePreview(null)}
          className="px-3 py-1 rounded-lg bg-[#0A0A0C] text-white font-semibold"
        >
          Exit Student Preview
        </button>
      </div>
    </div>
  );
};

export const StudentSectionTransferButton: React.FC<{
  offeringId: number;
  currentSection: string;
  sections: string[];
  onToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({ offeringId, currentSection, sections, onToast }) => {
  const [open, setOpen] = useState(false);
  const [targetSec, setTargetSec] = useState(
    sections.find((s) => s !== currentSection) || sections[0] || 'Sec B'
  );
  const [reason, setReason] = useState('');

  if (sections.length <= 1) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-[#896ABD] hover:underline inline-flex items-center gap-1"
      >
        <ArrowRightLeft className="w-3 h-3" /> Change Section
      </button>

      {open && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-md rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-[#0A0A0C]">
                Request Section Transfer
              </h4>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const resData = await classroomApi.submitSectionChangeRequest(offeringId, {
                    requested_section: targetSec,
                    reason,
                  });
                  onToast(resData?.message || 'Transfer request sent', 'success');
                  setOpen(false);
                  setReason('');
                } catch (err: any) {
                  onToast(err?.response?.data?.detail || 'Request failed', 'error');
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="font-medium block mb-1">
                  Target Section (Currently {currentSection})
                </label>
                <select
                  value={targetSec}
                  onChange={(e) => setTargetSec(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
                >
                  {sections
                    .filter((s) => s !== currentSection)
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                </select>
              </div>
              <textarea
                rows={3}
                required
                placeholder="Timetable clash or reason for section transfer..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-xl border border-[#DDD8CE]">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" /> Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export const PendingRequestsAndClonePanel: React.FC<{
  offeringId: number;
  courseCode: string;
  canManageCourse: boolean;
  onRefreshWorkspace: () => Promise<void> | void;
  onCloned?: (newOfferingId: number) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({
  offeringId,
  courseCode,
  canManageCourse,
  onRefreshWorkspace,
  onCloned,
  onToast,
}) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState({
    academic_session: 'Spring 2027',
    batch_year: '2025-2029',
    semester: '4',
  });

  const loadRequests = async () => {
    if (!canManageCourse) return;
    try {
      const data = await classroomApi.listRequests(offeringId);
      setRequests(data?.requests || []);
    } catch {}
  };

  useEffect(() => {
    loadRequests();
  }, [offeringId, canManageCourse]);

  if (!canManageCourse) return null;

  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-[#0A0A0C]">
              Pending Enrollment &amp; Section Transfer Requests ({requests.filter((r) => r.status === 'PENDING').length})
            </h4>
            <p className="text-[#5C5B57]">Approve or reject student section changes and late-registration access requests.</p>
          </div>
          <button
            type="button"
            onClick={() => setCloneOpen(true)}
            className="px-3.5 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD] font-semibold inline-flex items-center gap-1.5 text-[#0A0A0C]"
          >
            <Copy className="w-3.5 h-3.5 text-[#896ABD]" />
            <span>Clone {courseCode} to New Semester</span>
          </button>
        </div>

        {requests.length === 0 ? (
          <p className="text-[#5C5B57]">No section or enrollment requests yet.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-[#0A0A0C]">{r.student_name}</span>
                  <span className="ml-2 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-[#896ABD]/12 text-[#5B3B96]">
                    {r.request_type === 'SECTION_CHANGE'
                      ? `${r.current_section} → ${r.requested_section}`
                      : `Join (${r.requested_section})`}
                  </span>
                  {r.reason && <p className="text-[#5C5B57] mt-0.5">{r.reason}</p>}
                </div>
                {r.status === 'PENDING' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        await classroomApi.reviewRequest(r.id, 'APPROVED');
                        onToast('Request approved!', 'success');
                        await Promise.all([loadRequests(), onRefreshWorkspace()]);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await classroomApi.reviewRequest(r.id, 'REJECTED');
                        onToast('Request rejected', 'success');
                        await loadRequests();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold inline-flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </div>
                ) : (
                  <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-black/[0.06]">
                    {r.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {cloneOpen && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-md rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4">
            <h4 className="text-base font-semibold text-[#0A0A0C]">
              Clone {courseCode} for Next Semester
            </h4>
            <p className="text-[#5C5B57]">
              Copies syllabus PDF, unit modules, assignments, rubrics, weights, and quizzes into a fresh classroom with zero old student data.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const data = await classroomApi.cloneOffering(offeringId, cloneForm);
                  onToast(data?.message || 'Course cloned!', 'success');
                  setCloneOpen(false);
                  if (data?.offering?.id) onCloned?.(data.offering.id);
                } catch (err: any) {
                  onToast(err?.response?.data?.detail || 'Clone failed', 'error');
                }
              }}
              className="space-y-3"
            >
              <input
                type="text"
                required
                placeholder="Academic Session (e.g. Spring 2027)"
                value={cloneForm.academic_session}
                onChange={(e) => setCloneForm({ ...cloneForm, academic_session: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Batch Year (2025-2029)"
                  value={cloneForm.batch_year}
                  onChange={(e) => setCloneForm({ ...cloneForm, batch_year: e.target.value })}
                  className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
                />
                <input
                  type="text"
                  required
                  placeholder="Semester"
                  value={cloneForm.semester}
                  onChange={(e) => setCloneForm({ ...cloneForm, semester: e.target.value })}
                  className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCloneOpen(false)} className="px-3 py-2 rounded-xl border border-[#DDD8CE]">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold">
                  Clone Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
