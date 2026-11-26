import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Download,
  MessageSquarePlus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import { formatLateDuration } from '@/utils/formatters';
import { ProgressRing } from '@/components/viz/ProgressRing';

interface MyGradesAttendancePanelProps {
  offeringId: number;
  previewSection?: string | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const MyGradesAttendancePanel: React.FC<MyGradesAttendancePanelProps> = ({
  offeringId,
  previewSection,
  onToast,
}) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [reevalTarget, setReevalTarget] = useState<any | null>(null);
  const [reevalReason, setReevalReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadGrades = async () => {
    setLoading(true);
    try {
      const payload = await classroomApi.getMyGrades(offeringId, previewSection);
      setData(payload);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to load grade summary', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrades();
  }, [offeringId, previewSection]);

  const handleSubmitReeval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reevalTarget?.submission_id || reevalReason.trim().length < 5) return;
    setSubmitting(true);
    try {
      const resData = await classroomApi.createReevalRequest(
        reevalTarget.submission_id,
        reevalReason.trim()
      );
      onToast(resData?.message || 'Re-evaluation request submitted', 'success');
      setReevalTarget(null);
      setReevalReason('');
      await loadGrades();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not submit re-evaluation request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!data?.items) return;
    const rows = [
      ['Task Title', 'Category', 'Status', 'Marks Obtained', 'Max Marks', 'Late Penalty', 'Feedback'],
      ...data.items.map((it: any) => [
        `"${String(it.title || '').replace(/"/g, '""')}"`,
        it.weight_category,
        it.marks_pending_release
          ? 'Pending Release'
          : it.marks_obtained !== null
            ? 'Graded'
            : it.submitted
              ? 'Submitted'
              : 'Pending',
        it.marks_obtained ?? '',
        it.max_marks,
        it.late_penalty_applied ?? 0,
        `"${String(it.feedback || '').replace(/"/g, '""')}"`,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.offering?.course_code || 'Course'}_Grade_Report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-8 text-center text-xs text-[#5C5B57]">
        Loading your gradebook and attendance telemetry...
      </div>
    );
  }

  if (!data) return null;

  const att = data.attendance || {};
  const summary = data.summary || {};

  return (
    <div className="space-y-6">
      {/* Top KPI Cards: Weighted Overall % + Attendance Meter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-[#0A0A0C] flex items-center gap-2">
                <Award className="w-4 h-4 text-[#E04F33]" />
                <span>
                  My Grade Report ({data.offering?.course_code} · {data.section})
                </span>
              </h3>
              <p className="text-xs text-[#5C5B57]">
                Weighted aggregate across published classwork and quizzes.
                {data.offering?.reeval_enabled === false && (
                  <span className="ml-2 text-amber-700 font-medium">
                    · Re-evaluation requests turned OFF by instructor
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadGrades}
                className="p-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD] text-[#353430]"
                title="Refresh grades"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="px-3 py-1.5 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Report (.csv)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
              <div className="text-[10px] font-mono-tabular uppercase text-[#5C5B57]">
                Weighted Score
              </div>
              <div className="text-xl font-bold font-mono-tabular text-[#0A0A0C] mt-0.5">
                {summary.weighted_pct !== null && summary.weighted_pct !== undefined
                  ? `${summary.weighted_pct}%`
                  : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
              <div className="text-[10px] font-mono-tabular uppercase text-[#5C5B57]">
                Raw Total
              </div>
              <div className="text-xl font-bold font-mono-tabular text-[#896ABD] mt-0.5">
                {summary.raw_max > 0 ? `${summary.raw_obtained}/${summary.raw_max}` : '—'}
              </div>
            </div>
            {(summary.category_breakdown || []).slice(0, 2).map((cb: any) => (
              <div key={cb.category} className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
                <div className="text-[10px] font-mono-tabular uppercase text-[#5C5B57]">
                  {cb.category} ({cb.weight_pct}%)
                </div>
                <div className="text-base font-semibold font-mono-tabular text-[#0A0A0C] mt-1">
                  {cb.pct !== null ? `${cb.pct}%` : 'No grades'}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(summary.category_breakdown || []).map((cb: any) => (
              <span
                key={`wt-${cb.category}`}
                className="px-2.5 py-1 rounded-lg bg-black/[0.04] font-mono-tabular text-[11px] text-[#353430]"
              >
                {cb.category}: {cb.weight_pct}% weight{' '}
                {cb.max > 0 ? `(${cb.obtained}/${cb.max})` : ''}
              </span>
            ))}
          </div>
        </div>

        {/* Personal Attendance Meter */}
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#0A0A0C]">My Attendance</span>
            <span
              className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                att.attendance_pct !== null && att.attendance_pct < 75
                  ? 'bg-rose-500/15 text-rose-700'
                  : 'bg-emerald-500/15 text-emerald-700'
              }`}
            >
              Min 75% Req
            </span>
          </div>

          <ProgressRing
            value={att.attendance_pct}
            max={100}
            label="Personal Attendance"
            thresholdPct={75}
            displayValue={
              att.attendance_pct !== null && att.attendance_pct !== undefined
                ? `${att.attendance_pct}%`
                : 'N/A'
            }
            sublabel={
              att.total_sessions > 0
                ? `${att.present_count} of ${att.total_sessions} classes attended`
                : 'Synced via TCS iON or daily sheet'
            }
          />

          {att.attendance_pct !== null && att.attendance_pct < 75 && att.total_sessions > 0 && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Attend next <strong>{att.classes_needed_for_75}</strong> consecutive classes to recover 75%.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Assignment Grades Table */}
      <div className="rounded-2xl border border-[#DDD8CE] bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E5E2DC] flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#896ABD]" />
            <span>Task-Wise Grade Breakdown</span>
          </h4>
          <span className="text-xs font-mono-tabular text-[#5C5B57]">
            {data.items?.length || 0} tasks
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E5E2DC] bg-[#FAF9F6] text-[11px] font-mono-tabular uppercase text-[#5C5B57]">
                <th className="py-2.5 px-4">Task</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">My Score</th>
                <th className="py-2.5 px-3">Feedback / Rubric</th>
                <th className="py-2.5 px-4 text-right">Re-evaluation</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((it: any) => {
                const rr = it.reeval_request;
                return (
                  <tr key={it.assignment_id} className="border-b border-[#E5E2DC]/60 last:border-b-0">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0A0A0C]">{it.title}</div>
                      <div className="text-[11px] font-mono-tabular text-[#5C5B57]">
                        Max {it.max_marks}
                        {it.is_late && (
                          <span className="ml-2 text-rose-600">
                            · {`Submitted ${formatLateDuration(it.late_minutes)}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-black/[0.05] text-[#353430]">
                        {it.weight_category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular font-semibold">
                      {it.marks_pending_release ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 text-[10px]">
                          <Clock className="w-3 h-3" /> Pending Release
                        </span>
                      ) : it.marks_obtained !== null ? (
                        <span className="text-emerald-700">
                          {it.marks_obtained} / {it.max_marks}
                        </span>
                      ) : it.submitted ? (
                        <span className="text-amber-700">Submitted</span>
                      ) : (
                        <span className="text-[#5C5B57]">Not submitted</span>
                      )}
                    </td>
                    <td className="py-3 px-3 max-w-[260px]">
                      {it.feedback && <p className="text-[#353430] line-clamp-2">{it.feedback}</p>}
                      {Array.isArray(it.rubric_json) &&
                        it.rubric_json.length > 0 &&
                        it.rubric_scores &&
                        Object.keys(it.rubric_scores).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {it.rubric_json.map((c: any) => (
                              <span
                                key={c.id}
                                className="px-1.5 py-0.5 rounded bg-[#896ABD]/10 text-[#5B3B96] font-mono-tabular text-[10px]"
                              >
                                {c.title}: {it.rubric_scores[c.id] ?? '—'}/{c.max_marks}
                              </span>
                            ))}
                          </div>
                        )}
                      {!it.feedback &&
                        (!it.rubric_scores || Object.keys(it.rubric_scores).length === 0) && (
                          <span className="text-[#8E8D88]">—</span>
                        )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {rr ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                            rr.status === 'APPROVED'
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : rr.status === 'REJECTED'
                                ? 'bg-rose-500/15 text-rose-700'
                                : 'bg-amber-500/15 text-amber-800'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {rr.status}
                        </span>
                      ) : it.reeval_enabled && it.marks_obtained !== null && it.submission_id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReevalTarget(it);
                            setReevalReason('');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-[#896ABD]/40 text-[#5B3B96] hover:bg-[#896ABD]/10 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          <span>Request Recheck</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#8E8D88]">
                          {it.reeval_enabled ? '—' : 'Off'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Re-evaluation Request Modal */}
      {reevalTarget && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-md rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4">
            <div>
              <h4 className="text-base font-semibold text-[#0A0A0C]">
                Request Re-evaluation
              </h4>
              <p className="text-xs text-[#5C5B57] mt-0.5">
                {reevalTarget.title} · Current score: {reevalTarget.marks_obtained}/{reevalTarget.max_marks}
              </p>
            </div>
            <form onSubmit={handleSubmitReeval} className="space-y-3">
              <textarea
                rows={4}
                required
                minLength={5}
                value={reevalReason}
                onChange={(e) => setReevalReason(e.target.value)}
                placeholder="Explain clearly which question or rubric criterion needs a recheck..."
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] text-xs focus:outline-none focus:border-[#896ABD]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReevalTarget(null)}
                  className="px-3.5 py-2 rounded-xl border border-[#DDD8CE] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-[#E04F33] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
