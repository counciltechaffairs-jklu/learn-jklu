import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import { MetricBarHistogram } from '@/components/viz/MetricBarHistogram';

interface GradebookExtrasPanelProps {
  offeringId: number;
  reevalEnabledInitial?: boolean;
  gradeWeightsInitial?: Record<string, number>;
  assignments: any[];
  sectionFilter: string;
  canManageCourse: boolean;
  onRefreshWorkspace: () => Promise<void> | void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const GradebookExtrasPanel: React.FC<GradebookExtrasPanelProps> = ({
  offeringId,
  reevalEnabledInitial = true,
  gradeWeightsInitial,
  assignments,
  sectionFilter,
  canManageCourse,
  onRefreshWorkspace,
  onToast,
}) => {
  const [reevalEnabled, setReevalEnabled] = useState<boolean>(reevalEnabledInitial);
  const [weights, setWeights] = useState({
    ASSIGNMENT: Number(gradeWeightsInitial?.ASSIGNMENT ?? 30),
    LAB: Number(gradeWeightsInitial?.LAB ?? 20),
    QUIZ: Number(gradeWeightsInitial?.QUIZ ?? 20),
    PROJECT: Number(gradeWeightsInitial?.PROJECT ?? 30),
  });
  const [distData, setDistData] = useState<any | null>(null);
  const [reevalQueue, setReevalQueue] = useState<any[]>([]);
  const [rubricTarget, setRubricTarget] = useState<any | null>(null);
  const [rubricCriteria, setRubricCriteria] = useState<any[]>([]);
  const [reviewMarksMap, setReviewMarksMap] = useState<Record<number, string>>({});
  const [reviewNoteMap, setReviewNoteMap] = useState<Record<number, string>>({});

  useEffect(() => {
    setReevalEnabled(reevalEnabledInitial);
  }, [reevalEnabledInitial]);

  useEffect(() => {
    if (gradeWeightsInitial) {
      setWeights({
        ASSIGNMENT: Number(gradeWeightsInitial.ASSIGNMENT ?? 30),
        LAB: Number(gradeWeightsInitial.LAB ?? 20),
        QUIZ: Number(gradeWeightsInitial.QUIZ ?? 20),
        PROJECT: Number(gradeWeightsInitial.PROJECT ?? 30),
      });
    }
  }, [JSON.stringify(gradeWeightsInitial)]);

  const loadExtras = async () => {
    try {
      const [distPayload, rqPayload] = await Promise.all([
        classroomApi.getGradeDistribution(offeringId, sectionFilter || 'ALL'),
        classroomApi.listReevalRequests(offeringId),
      ]);
      setDistData(distPayload);
      setReevalQueue(rqPayload?.requests || []);
    } catch {
      // ignore initial permissions or empty
    }
  };

  useEffect(() => {
    loadExtras();
  }, [offeringId, sectionFilter]);

  const handleToggleCourseReeval = async () => {
    const nextVal = !reevalEnabled;
    try {
      const resData = await classroomApi.updateReevalSettings(offeringId, nextVal);
      setReevalEnabled(Boolean(resData?.reeval_enabled));
      onToast(resData?.message || 'Re-evaluation setting updated', 'success');
      await onRefreshWorkspace();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to update re-evaluation setting', 'error');
    }
  };

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resData = await classroomApi.updateGradeWeights(offeringId, weights);
      onToast(resData?.message || 'Weights saved', 'success');
      await onRefreshWorkspace();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to save weights', 'error');
    }
  };

  const handleTogglePublishGrades = async (asgn: any) => {
    const nextPub = asgn.grades_published === false;
    try {
      const resData = await classroomApi.publishAssignmentGrades(asgn.id, nextPub);
      onToast(resData?.message || 'Updated release status', 'success');
      await Promise.all([onRefreshWorkspace(), loadExtras()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to toggle marks release', 'error');
    }
  };

  const handleToggleAsgnReeval = async (asgn: any) => {
    const currentEffective = asgn.effective_reeval_enabled !== false;
    try {
      await classroomApi.toggleAssignmentReeval(asgn.id, !currentEffective);
      onToast(
        !currentEffective ? 'Re-eval enabled for task' : 'Re-eval turned OFF for task',
        'success'
      );
      await onRefreshWorkspace();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to toggle task re-evaluation', 'error');
    }
  };

  const handleSaveRubric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rubricTarget) return;
    try {
      await classroomApi.updateAssignmentRubric(rubricTarget.id, rubricCriteria);
      onToast('Rubric criteria saved', 'success');
      setRubricTarget(null);
      await onRefreshWorkspace();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to save rubric', 'error');
    }
  };

  const handleReviewReeval = async (reqItem: any, status: 'APPROVED' | 'REJECTED') => {
    try {
      const newMarksVal = reviewMarksMap[reqItem.id];
      const payload: any = {
        status,
        reviewer_note: reviewNoteMap[reqItem.id] || '',
      };
      if (status === 'APPROVED' && newMarksVal !== undefined && newMarksVal !== '') {
        payload.new_marks = Number(newMarksVal);
      }
      const resData = await classroomApi.resolveReevalRequest(reqItem.id, payload);
      onToast(resData?.message || `Request ${status.toLowerCase()}`, 'success');
      await Promise.all([loadExtras(), onRefreshWorkspace()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to review request', 'error');
    }
  };

  const weightSum =
    Number(weights.ASSIGNMENT || 0) +
    Number(weights.LAB || 0) +
    Number(weights.QUIZ || 0) +
    Number(weights.PROJECT || 0);

  return (
    <div className="space-y-6">
      {/* Row 1: Re-evaluation Toggle + Weighted Categories + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Course Grading Policy Card */}
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-[#E04F33]" />
              <span>Grade Policy &amp; Re-evaluation</span>
            </h4>
            <button
              type="button"
              disabled={!canManageCourse}
              onClick={handleToggleCourseReeval}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold font-mono-tabular transition-colors ${
                reevalEnabled
                  ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                  : 'bg-black/[0.06] text-[#5C5B57] border border-[#DDD8CE]'
              } disabled:opacity-60`}
            >
              {reevalEnabled ? 'Re-eval ON' : 'Re-eval OFF'}
            </button>
          </div>
          <p className="text-[11px] text-[#5C5B57]">
            Control whether students can request grade re-evaluation for this course (can also override per task below).
          </p>

          <form onSubmit={handleSaveWeights} className="space-y-2.5 pt-2 border-t border-[#E5E2DC]">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span>Category Weights</span>
              <span
                className={`font-mono-tabular ${
                  Math.round(weightSum * 100) / 100 === 100 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                Total: {weightSum}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(['ASSIGNMENT', 'LAB', 'QUIZ', 'PROJECT'] as const).map((key) => (
                <label key={key} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
                  <span className="font-mono-tabular text-[10px] font-semibold text-[#5C5B57]">
                    {key}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weights[key]}
                    disabled={!canManageCourse}
                    onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                    className="w-14 text-right font-mono-tabular font-semibold bg-white border border-[#DDD8CE] rounded px-1.5 py-0.5"
                  />
                </label>
              ))}
            </div>
            {canManageCourse && (
              <button
                type="submit"
                className="w-full py-1.5 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white text-xs font-semibold transition-colors"
              >
                Save Grade Weights
              </button>
            )}
          </form>
        </div>

        {/* Grade Distribution Histogram */}
        <div className="lg:col-span-2 rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#896ABD]" />
              <span>Grade Curve &amp; Distribution ({sectionFilter === 'ALL' ? 'All Sections' : sectionFilter})</span>
            </h4>
            <button
              type="button"
              onClick={loadExtras}
              className="p-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {distData?.histogram ? (
            <MetricBarHistogram
              items={distData.histogram.map((b: any) => ({
                id: b.label,
                label: b.label,
                value: b.count,
                color: b.label === '0-39%' ? '#E04F33' : '#896ABD',
              }))}
              unitLabel="scores"
              ariaLabel="Course grade distribution"
            />
          ) : (
            <p className="text-xs text-[#5C5B57]">No graded submissions yet to plot histogram.</p>
          )}
        </div>
      </div>

      {/* Row 2: Assignment Release Controls & Rubrics */}
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
        <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-1.5">
          <ListChecks className="w-4 h-4 text-[#896ABD]" />
          <span>Publish Marks Toggle, Per-Task Re-eval &amp; Rubrics</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {assignments.map((asgn) => (
            <div
              key={`gb-ctl-${asgn.id}`}
              className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[#0A0A0C] truncate">{asgn.title}</div>
                <div className="text-[11px] font-mono-tabular text-[#5C5B57]">
                  Max {asgn.max_marks} · {asgn.rubric_json?.length || 0} rubric criteria
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleTogglePublishGrades(asgn)}
                  className={`px-2.5 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold inline-flex items-center gap-1 border ${
                    asgn.grades_published !== false
                      ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-800 border-amber-500/30'
                  }`}
                >
                  {asgn.grades_published !== false ? (
                    <>
                      <Eye className="w-3 h-3" /> Published
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3 h-3" /> Draft
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAsgnReeval(asgn)}
                  className={`px-2 py-1 rounded-lg font-mono-tabular text-[11px] font-semibold border ${
                    asgn.effective_reeval_enabled !== false
                      ? 'bg-white border-[#896ABD]/40 text-[#5B3B96]'
                      : 'bg-black/[0.05] border-[#DDD8CE] text-[#5C5B57]'
                  }`}
                >
                  {asgn.effective_reeval_enabled !== false ? 'Re-eval ON' : 'Re-eval OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRubricTarget(asgn);
                    setRubricCriteria(
                      Array.isArray(asgn.rubric_json) && asgn.rubric_json.length > 0
                        ? asgn.rubric_json
                        : [{ id: 'crit_1', title: 'Implementation & Accuracy', max_marks: asgn.max_marks || 100, description: '' }]
                    );
                  }}
                  className="px-2 py-1 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#E04F33] text-[11px] font-medium"
                >
                  Rubric
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Pending Re-evaluation Requests Queue */}
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#0A0A0C]">
            Student Re-evaluation Requests ({reevalQueue.filter((r) => r.status === 'PENDING').length} pending)
          </h4>
        </div>
        {reevalQueue.length === 0 ? (
          <p className="text-xs text-[#5C5B57]">No re-evaluation requests submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {reevalQueue.map((r) => (
              <div
                key={`rr-${r.id}`}
                className="p-3.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] text-xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[#0A0A0C]">{r.student_name}</span>
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-black/[0.05] font-mono-tabular text-[10px]">
                      {r.student_section || 'Sec A'}
                    </span>
                    <span className="ml-2 text-[#5C5B57]">· {r.assignment_title}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold ${
                      r.status === 'APPROVED'
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : r.status === 'REJECTED'
                          ? 'bg-rose-500/15 text-rose-700'
                          : 'bg-amber-500/15 text-amber-800'
                    }`}
                  >
                    {r.status} · Prev: {r.old_marks}/{r.max_marks}
                    {r.new_marks !== null && r.new_marks !== r.old_marks ? ` → ${r.new_marks}` : ''}
                  </span>
                </div>
                <p className="text-[#353430] bg-white p-2.5 rounded-lg border border-[#E5E2DC]">
                  {r.reason}
                </p>
                {r.status === 'PENDING' && r.can_review && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={r.max_marks}
                      placeholder={`New marks (was ${r.old_marks})`}
                      value={reviewMarksMap[r.id] ?? ''}
                      onChange={(e) =>
                        setReviewMarksMap({ ...reviewMarksMap, [r.id]: e.target.value })
                      }
                      className="w-40 px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                    />
                    <input
                      type="text"
                      placeholder="Reviewer note..."
                      value={reviewNoteMap[r.id] ?? ''}
                      onChange={(e) =>
                        setReviewNoteMap({ ...reviewNoteMap, [r.id]: e.target.value })
                      }
                      className="flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleReviewReeval(r, 'APPROVED')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewReeval(r, 'REJECTED')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rubric Builder Modal */}
      {rubricTarget && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-lg rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-[#0A0A0C]">
                Rubric Builder — {rubricTarget.title}
              </h4>
              <button type="button" onClick={() => setRubricTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRubric} className="space-y-3 text-xs">
              {rubricCriteria.map((c, idx) => (
                <div key={`rc-${idx}`} className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Criterion Title"
                      value={c.title}
                      onChange={(e) => {
                        const copy = [...rubricCriteria];
                        copy[idx] = { ...copy[idx], title: e.target.value };
                        setRubricCriteria(copy);
                      }}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
                    />
                    <input
                      type="number"
                      min={1}
                      step="0.5"
                      required
                      value={c.max_marks}
                      onChange={(e) => {
                        const copy = [...rubricCriteria];
                        copy[idx] = { ...copy[idx], max_marks: Number(e.target.value) };
                        setRubricCriteria(copy);
                      }}
                      className="w-20 px-2 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRubricCriteria(rubricCriteria.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Short grading guideline..."
                    value={c.description || ''}
                    onChange={(e) => {
                      const copy = [...rubricCriteria];
                      copy[idx] = { ...copy[idx], description: e.target.value };
                      setRubricCriteria(copy);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setRubricCriteria([
                      ...rubricCriteria,
                      {
                        id: `crit_${rubricCriteria.length + 1}_${Date.now()}`,
                        title: '',
                        max_marks: 10,
                        description: '',
                      },
                    ])
                  }
                  className="px-3 py-1.5 rounded-xl border border-[#DDD8CE] font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Criterion
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold"
                >
                  Save Rubric
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
