import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  KeyRound,
  Plus,
  QrCode,
  ShieldAlert,
  X,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

interface AttendancePanelProps {
  offeringId: number;
  isStaff: boolean;
  canManage: boolean;
  allowedSections: string[];
  sectionFilter: string;
  roster: any[];
  previewSection?: string | null;
  onRefreshWorkspace: () => Promise<void> | void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const AttendancePanel: React.FC<AttendancePanelProps> = ({
  offeringId,
  isStaff,
  allowedSections,
  sectionFilter,
  roster,
  previewSection,
  onRefreshWorkspace,
  onToast,
}) => {
  const simulateStudent = Boolean(previewSection);
  const effectiveStaff = isStaff && !simulateStudent;

  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessId, setSelectedSessId] = useState<number | null>(null);
  const [newSessSec, setNewSessSec] = useState(
    allowedSections.find((s) => s !== 'ALL') || 'Sec A'
  );
  const [newSessTopic, setNewSessTopic] = useState('');
  const [pinInfo, setPinInfo] = useState<{ pin: string; section: string; expires_at: string } | null>(null);
  const [odRequests, setOdRequests] = useState<any[]>([]);
  const [atRisk, setAtRisk] = useState<any[]>([]);

  // Student view states
  const [myAtt, setMyAtt] = useState<any | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [odForm, setOdForm] = useState({ leave_type: 'OD', from_date: '', to_date: '', reason: '' });
  const [odProof, setOdProof] = useState<File | null>(null);

  const loadStaff = async () => {
    try {
      const [sData, odData, arData] = await Promise.all([
        classroomApi.listAttendanceSessions(offeringId, sectionFilter),
        classroomApi.listOdRequests(offeringId),
        classroomApi.getAttendanceAtRisk(offeringId, sectionFilter),
      ]);
      const sessList = sData?.sessions || [];
      setSessions(sessList);
      if (sessList.length > 0 && !selectedSessId) setSelectedSessId(sessList[0].id);
      setOdRequests(odData?.requests || []);
      setAtRisk(arData?.students || []);
    } catch {}
  };

  const loadStudent = async () => {
    try {
      const data = await classroomApi.getMyAttendance(offeringId, previewSection);
      setMyAtt(data);
    } catch {}
  };

  useEffect(() => {
    if (effectiveStaff) {
      loadStaff();
    } else {
      loadStudent();
    }
  }, [offeringId, effectiveStaff, sectionFilter, previewSection]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resData = await classroomApi.createAttendanceSession(offeringId, {
        section: newSessSec,
        topic: newSessTopic.trim() || 'Class Lecture',
        mark_all_present: true,
      });
      onToast(resData?.message || 'Session created (all present)', 'success');
      setNewSessTopic('');
      setSelectedSessId(resData?.session?.id ?? null);
      await Promise.all([loadStaff(), onRefreshWorkspace()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to create attendance session', 'error');
    }
  };

  const handleGeneratePin = async () => {
    try {
      const data = await classroomApi.generateCheckinPin(offeringId, {
        section: newSessSec,
        duration_seconds: 90,
      });
      setPinInfo(data);
      onToast(`Live Check-in PIN generated for ${data.section}`, 'success');
      await loadStaff();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not generate PIN', 'error');
    }
  };

  const handleMarkStatus = async (sessId: number, stu: any, status: 'PRESENT' | 'ABSENT' | 'OD') => {
    try {
      await classroomApi.saveAttendanceRecords(sessId, [
        { student_id: stu.student_id, enrollment_id: stu.id, status },
      ]);
      await Promise.all([loadStaff(), onRefreshWorkspace()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not update attendance', 'error');
    }
  };

  if (!effectiveStaff) {
    return (
      <div className="space-y-6 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
            <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#E04F33]" />
              <span>Class Check-in (6-Digit PIN)</span>
            </h4>
            <p className="text-[#5C5B57]">
              Enter the live 6-digit PIN shared on the classroom projector to mark yourself Present.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const resData = await classroomApi.studentCheckin(offeringId, pinInput.trim());
                  onToast(resData?.message || 'Checked in!', 'success');
                  setPinInput('');
                  await Promise.all([loadStudent(), onRefreshWorkspace()]);
                } catch (err: any) {
                  onToast(err?.response?.data?.detail || 'Invalid or expired PIN', 'error');
                }
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                maxLength={6}
                pattern="\d{6}"
                required
                placeholder="123456"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-36 px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular text-base tracking-widest font-bold text-center"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold"
              >
                Check In Present
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
            <h4 className="text-sm font-semibold text-[#0A0A0C]">Request OD / Medical Leave</h4>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const fd = new FormData();
                  fd.append('leave_type', odForm.leave_type);
                  fd.append('from_date', odForm.from_date);
                  fd.append('to_date', odForm.to_date);
                  fd.append('reason', odForm.reason);
                  if (odProof) fd.append('proof', odProof);
                  await classroomApi.submitOdRequest(offeringId, fd);
                  onToast('OD / Medical leave request submitted', 'success');
                  setOdForm({ leave_type: 'OD', from_date: '', to_date: '', reason: '' });
                  setOdProof(null);
                  await loadStudent();
                } catch (err: any) {
                  onToast(err?.response?.data?.detail || 'Failed to submit leave request', 'error');
                }
              }}
              className="space-y-2"
            >
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={odForm.leave_type}
                  onChange={(e) => setOdForm({ ...odForm, leave_type: e.target.value })}
                  className="px-2 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6]"
                >
                  <option value="OD">On-Duty (OD)</option>
                  <option value="MEDICAL">Medical Leave</option>
                </select>
                <input
                  type="date"
                  required
                  value={odForm.from_date}
                  onChange={(e) => setOdForm({ ...odForm, from_date: e.target.value })}
                  className="px-2 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6]"
                />
                <input
                  type="date"
                  required
                  value={odForm.to_date}
                  onChange={(e) => setOdForm({ ...odForm, to_date: e.target.value })}
                  className="px-2 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="Event or medical reason..."
                  value={odForm.reason}
                  onChange={(e) => setOdForm({ ...odForm, reason: e.target.value })}
                  className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6]"
                />
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setOdProof(e.target.files?.[0] || null)}
                  className="text-[11px] max-w-[180px]"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#E04F33] text-white font-semibold"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Session Log */}
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#0A0A0C]">
              My Attendance History ({myAtt?.section || 'Sec A'})
            </h4>
            <span className="font-mono-tabular font-semibold text-sm">
              {myAtt?.attendance_pct !== null && myAtt?.attendance_pct !== undefined
                ? `${myAtt.attendance_pct}%`
                : 'Not synced'}
            </span>
          </div>
          {(myAtt?.sessions || []).length === 0 ? (
            <p className="text-[#5C5B57]">No lecture attendance sessions recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {myAtt.sessions.map((s: any) => (
                <div key={s.id} className="p-2.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.topic || 'Lecture'}</div>
                    <div className="font-mono-tabular text-[10px] text-[#5C5B57]">
                      {String(s.session_date).slice(0, 10)}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                      s.status === 'PRESENT' || s.status === 'OD'
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : s.status === 'ABSENT'
                          ? 'bg-rose-500/15 text-rose-700'
                          : 'bg-black/[0.06] text-[#5C5B57]'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeSession = sessions.find((s) => Number(s.id) === Number(selectedSessId)) || null;
  const activeStudents = roster.filter(
    (r) =>
      r.student_id &&
      (!activeSession ||
        String(r.section || 'Sec A').toLowerCase() ===
          String(activeSession.section || 'Sec A').toLowerCase())
  );
  const recStatusMap = new Map(
    (activeSession?.records || []).map((r: any) => [Number(r.student_id), r.status])
  );

  return (
    <div className="space-y-6 text-xs">
      {/* Staff Controls: Create Session & 60s Live PIN Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form
          onSubmit={handleCreateSession}
          className="lg:col-span-2 rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#E04F33]" />
              <span>Daily Section Attendance Sheet</span>
            </h4>
            <button
              type="button"
              onClick={handleGeneratePin}
              className="px-3 py-1.5 rounded-xl bg-[#896ABD] hover:opacity-90 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" /> Start 90s PIN Check-in
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newSessSec}
              onChange={(e) => setNewSessSec(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular font-semibold"
            >
              {allowedSections
                .filter((s) => s !== 'ALL')
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <input
              type="text"
              placeholder="Lecture Topic (e.g. Trees Traversal)"
              value={newSessTopic}
              onChange={(e) => setNewSessTopic(e.target.value)}
              className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Mark All Present
            </button>
          </div>
          {pinInfo && (
            <div className="p-3.5 rounded-xl bg-[#0A0A0C] text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-amber-300">
                  Live Self Check-in PIN ({pinInfo.section})
                </div>
                <div className="text-2xl font-mono-tabular font-bold tracking-[0.25em] mt-0.5">
                  {pinInfo.pin}
                </div>
              </div>
              <div className="text-right font-mono-tabular text-[11px] text-[#C8C6BE]">
                Valid until {new Date(pinInfo.expires_at).toLocaleTimeString()}
              </div>
            </div>
          )}
        </form>

        {/* At-Risk Student Alerts */}
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-2.5">
          <h4 className="text-sm font-semibold text-rose-700 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            <span>At-Risk Students ({atRisk.length})</span>
          </h4>
          {atRisk.length === 0 ? (
            <p className="text-[#5C5B57]">No students below 75% attendance or missing ≥2 tasks.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {atRisk.map((st, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
                  <span className="font-semibold text-rose-900 truncate">
                    {st.student_name} ({st.section})
                  </span>
                  <span className="font-mono-tabular text-[10px] text-rose-700 shrink-0">
                    {st.attendance_pct !== null ? `${st.attendance_pct}%` : ''}
                    {st.missed_assignments > 0 ? ` · ${st.missed_assignments} missed` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Session Roster Toggles */}
      {sessions.length > 0 && (
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#0A0A0C]">Session Attendance Roll</h4>
            <select
              value={selectedSessId || ''}
              onChange={(e) => setSelectedSessId(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.session_date).slice(0, 10)} · {s.section} · {s.topic || 'Lecture'} ({s.present_count}P/{s.absent_count}A)
                </option>
              ))}
            </select>
          </div>
          {activeSession && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {activeStudents.map((stu) => {
                const st = recStatusMap.get(Number(stu.student_id)) || 'UNMARKED';
                return (
                  <div key={stu.id} className="p-2.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{stu.student_name}</div>
                      <div className="font-mono-tabular text-[10px] text-[#5C5B57]">{stu.roll_no}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(['PRESENT', 'ABSENT', 'OD'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={!activeSession.can_edit}
                          onClick={() => handleMarkStatus(activeSession.id, stu, opt)}
                          className={`px-2 py-1 rounded font-mono-tabular text-[10px] font-bold transition-colors ${
                            st === opt
                              ? opt === 'PRESENT'
                                ? 'bg-emerald-600 text-white'
                                : opt === 'ABSENT'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-[#896ABD] text-white'
                              : 'bg-white border border-[#DDD8CE] text-[#5C5B57]'
                          }`}
                        >
                          {opt === 'PRESENT' ? 'P' : opt === 'ABSENT' ? 'A' : 'OD'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* OD / Medical Leave Approval Queue */}
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
        <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>OD &amp; Medical Leave Requests ({odRequests.filter((r) => r.status === 'PENDING').length} pending)</span>
        </h4>
        {odRequests.length === 0 ? (
          <p className="text-[#5C5B57]">No leave requests submitted.</p>
        ) : (
          <div className="space-y-2">
            {odRequests.map((r) => (
              <div key={r.id} className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    {r.student_name} ({r.section}) · {r.leave_type}
                  </div>
                  <div className="font-mono-tabular text-[11px] text-[#5C5B57]">
                    {String(r.from_date).slice(0, 10)} → {String(r.to_date).slice(0, 10)} · {r.reason}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.status === 'PENDING' && r.can_review ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await classroomApi.reviewOdRequest(r.id, 'APPROVED');
                          onToast('Leave approved & attendance updated', 'success');
                          await Promise.all([loadStaff(), onRefreshWorkspace()]);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await classroomApi.reviewOdRequest(r.id, 'REJECTED');
                          onToast('Leave rejected', 'success');
                          await loadStaff();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold inline-flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Reject
                      </button>
                    </>
                  ) : (
                    <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-black/[0.06]">
                      {r.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
