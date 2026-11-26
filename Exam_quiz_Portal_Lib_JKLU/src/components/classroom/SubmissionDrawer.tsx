import React, { useEffect, useState } from 'react';
import { Clock, ExternalLink, FileText, History, ShieldAlert, X } from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import { formatLateDuration } from '@/utils/formatters';
import { SubmissionPrivateChat } from '@/components/classroom/CommunicationExtras';


interface SubmissionDrawerProps {
  assignment: any;
  submission: any;
  canGrade: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const SubmissionDrawer: React.FC<SubmissionDrawerProps> = ({
  assignment,
  submission,
  canGrade,
  onClose,
  onSaved,
  onToast,
}) => {
  const [versions, setVersions] = useState<any[]>([]);
  const [marks, setMarks] = useState(
    submission.marks_obtained !== null && submission.marks_obtained !== undefined
      ? String(submission.marks_obtained)
      : ''
  );
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [rubricScores, setRubricScores] = useState<Record<string, number>>(
    submission.rubric_scores && typeof submission.rubric_scores === 'object'
      ? submission.rubric_scores
      : {}
  );
  const [saving, setSaving] = useState(false);
  const [nativeBlobUrl, setNativeBlobUrl] = useState<string | null>(null);
  const [similarityInfo, setSimilarityInfo] = useState<{
    max_similarity_pct: number;
    matched_with_name: string | null;
    match_reason: string;
  } | null>(null);

  const rubric: any[] = Array.isArray(assignment.rubric_json) ? assignment.rubric_json : [];
  const maxMarks = Number(assignment.max_marks || 100);
  const penalty = Number(submission.late_penalty_applied || 0);

  useEffect(() => {
    classroomApi
      .getSubmissionVersions(submission.id)
      .then((data) => setVersions(data?.versions || []))
      .catch(() => {});
  }, [submission.id]);

  useEffect(() => {
    if (!canGrade) {
      setSimilarityInfo(null);
      return;
    }
    classroomApi
      .getAssignmentSimilarity(assignment.id)
      .then((data) => {
        const entry = data?.by_submission_id?.[submission.id] || null;
        setSimilarityInfo(entry);
      })
      .catch(() => {});
  }, [assignment.id, submission.id, canGrade]);

  useEffect(() => {
    let activeUrl: string | null = null;
    if (submission.upload_mode !== 'NATIVE_UPLOAD' && !submission.has_native_file) {
      setNativeBlobUrl(null);
      return;
    }
    classroomApi
      .getSubmissionFileBlob(submission.id)
      .then((blobData) => {
        activeUrl = URL.createObjectURL(blobData);
        setNativeBlobUrl(activeUrl);
      })
      .catch(() => {});
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [submission.id, submission.upload_mode, submission.has_native_file]);

  const handleRubricChange = (critId: string, val: number) => {
    const next = { ...rubricScores, [critId]: val };
    setRubricScores(next);
    const total = Object.values(next).reduce((acc, v) => acc + (Number(v) || 0), 0);
    setMarks(String(Math.min(maxMarks, Math.max(0, total))));
  };

  const applyLatePenalty = () => {
    const current = Number(marks || maxMarks);
    const deducted = Math.max(0, Number((current - penalty).toFixed(2)));
    setMarks(String(deducted));
    onToast(`Applied -${penalty} late penalty (${deducted}/${maxMarks})`, 'success');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await classroomApi.gradeSubmission(submission.id, {
        marks_obtained: marks === '' ? null : Number(marks),
        feedback: feedback.trim(),
        rubric_scores: rubricScores,
      });
      onToast('Grade & rubric saved cleanly!', 'success');
      await onSaved();
      onClose();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to save grade', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isNativePdf =
    submission.upload_mode === 'NATIVE_UPLOAD' &&
    String(submission.file_mime || submission.file_name || '').toLowerCase().includes('pdf');
  const isNativeImage =
    submission.upload_mode === 'NATIVE_UPLOAD' &&
    /\.(png|jpe?g|webp)$/i.test(String(submission.file_name || submission.file_mime || ''));

  const previewUrl = submission.drive_file_id
    ? `https://drive.google.com/file/d/${submission.drive_file_id}/preview`
    : nativeBlobUrl || submission.submission_url;

  return (
    <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6">
      <div className="modal-panel-enter w-full max-w-6xl h-[88vh] rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] overflow-hidden flex flex-col text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E5E2DC] bg-[#FAF9F6] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-[#0A0A0C] truncate">
              {submission.student_name} ({submission.student_roll_no || submission.student_email}) ·{' '}
              {assignment.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular text-[#5C5B57] mt-0.5">
              <span>Submitted: {new Date(submission.submitted_at).toLocaleString()}</span>
              {submission.is_late && (
                <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 font-semibold">
                  {`Submitted ${formatLateDuration(submission.late_minutes || 0)}`}
                  {penalty > 0 ? ` · Est. Penalty -${penalty}` : ''}
                </span>
              )}
              {versions.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-[#896ABD]/12 text-[#5B3B96]">
                  v{versions.length} submissions
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(nativeBlobUrl || submission.submission_url) && (
              <a
                href={nativeBlobUrl || submission.submission_url}
                target="_blank"
                rel="noopener noreferrer"
                download={nativeBlobUrl ? submission.file_name || 'submission' : undefined}
                className="px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#896ABD] font-semibold inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {nativeBlobUrl ? 'Download File' : 'Open External'}
              </a>
            )}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg border border-[#DDD8CE] bg-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Side-by-Side Split Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* Left Document Viewer & Version History */}
          <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-[#E5E2DC] bg-[#FAF9F6] flex flex-col min-h-[260px]">
            {isNativeImage && nativeBlobUrl ? (
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-white">
                <img
                  src={nativeBlobUrl}
                  alt={submission.file_name || 'Submission preview'}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            ) : (submission.drive_file_id || isNativePdf) && previewUrl ? (
              <iframe
                src={previewUrl}
                title="Submission Document Preview"
                className="w-full flex-1 border-0 bg-white"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <FileText className="w-10 h-10 text-[#896ABD]" />
                <div className="font-semibold text-sm text-[#0A0A0C]">
                  {submission.file_name || 'External Submission Resource'}
                </div>
                {submission.submission_notes && (
                  <p className="max-w-md text-[#353430] bg-white p-3 rounded-xl border border-[#E5E2DC]">
                    {submission.submission_notes}
                  </p>
                )}
                {(nativeBlobUrl || submission.submission_url) && (
                  <a
                    href={nativeBlobUrl || submission.submission_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={nativeBlobUrl ? submission.file_name || 'submission' : undefined}
                    className="px-4 py-2 rounded-xl bg-[#0A0A0C] text-white font-semibold inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Download / Open Submission
                  </a>
                )}
              </div>
            )}

            {versions.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[#E5E2DC] bg-white flex items-center gap-2 overflow-x-auto">
                <History className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
                <span className="font-mono-tabular font-semibold text-[11px] shrink-0">
                  Versions:
                </span>
                {versions.map((v) => (
                  <a
                    key={v.id}
                    href={v.submission_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#DDD8CE] hover:border-[#896ABD] font-mono-tabular text-[10px] shrink-0"
                  >
                    v{v.version_no} ({new Date(v.created_at).toLocaleDateString()})
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Right Grading Panel + Rubric + Private Thread */}
          <div className="lg:col-span-5 p-5 overflow-y-auto space-y-4">
            {canGrade && similarityInfo && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  similarityInfo.max_similarity_pct >= 70 || similarityInfo.match_reason === 'EXACT_HASH'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : similarityInfo.max_similarity_pct >= 40
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <div className="truncate">
                    <strong>Similarity Check:</strong>{' '}
                    {similarityInfo.match_reason === 'EXACT_HASH'
                      ? 'Exact File Hash Match (100%)'
                      : `${similarityInfo.max_similarity_pct}% overlap`}
                    {similarityInfo.matched_with_name && similarityInfo.max_similarity_pct >= 20
                      ? ` · nearest: ${similarityInfo.matched_with_name}`
                      : ' · Unique work'}
                  </div>
                </div>
                <span className="font-mono-tabular font-bold shrink-0">
                  {similarityInfo.max_similarity_pct}%
                </span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              {rubric.length > 0 && (
                <div className="space-y-2 p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6]">
                  <div className="font-semibold text-[#0A0A0C]">Rubric Breakdown</div>
                  {rubric.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.title}</div>
                        {c.description && <div className="text-[10px] text-[#5C5B57]">{c.description}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={c.max_marks}
                          step="0.5"
                          disabled={!canGrade}
                          value={rubricScores[c.id] ?? ''}
                          onChange={(e) => handleRubricChange(c.id, Number(e.target.value))}
                          className="w-16 px-2 py-1 rounded border border-[#DDD8CE] bg-white font-mono-tabular text-right"
                        />
                        <span className="font-mono-tabular text-[10px] text-[#5C5B57]">
                          /{c.max_marks}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold">Total Marks (out of {maxMarks})</label>
                  {canGrade && penalty > 0 && (
                    <button
                      type="button"
                      onClick={applyLatePenalty}
                      className="text-[11px] font-semibold text-[#E04F33] hover:underline inline-flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3" /> Apply -{penalty} Late Penalty
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  max={maxMarks}
                  step="0.5"
                  disabled={!canGrade}
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  placeholder={`0 – ${maxMarks}`}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular font-semibold"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Evaluator Feedback</label>
                <textarea
                  rows={3}
                  disabled={!canGrade}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Write constructive feedback..."
                  className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
                />
              </div>

              {canGrade && (
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving Grade...' : 'Save Grade & Feedback'}
                </button>
              )}
            </form>

            <SubmissionPrivateChat submissionId={submission.id} onToast={onToast} />
          </div>
        </div>
      </div>
    </div>
  );
};
