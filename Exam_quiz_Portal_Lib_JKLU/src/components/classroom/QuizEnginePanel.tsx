import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Database,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

interface QuizEnginePanelProps {
  offeringId: number;
  courseCode: string;
  isStaff: boolean;
  canCreate: boolean;
  allowedSections: string[];
  previewSection?: string | null;
  onRefreshWorkspace: () => Promise<void> | void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const QuizEnginePanel: React.FC<QuizEnginePanelProps> = ({
  offeringId,
  courseCode,
  isStaff,
  canCreate,
  allowedSections,
  previewSection,
  onRefreshWorkspace,
  onToast,
}) => {
  const simulateStudent = Boolean(previewSection);
  const effectiveStaff = isStaff && !simulateStudent;

  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [bankItems, setBankItems] = useState<any[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showBank, setShowBank] = useState(false);

  // Builder state
  const [quizTitle, setQuizTitle] = useState('');
  const [durationMin, setDurationMin] = useState('15');
  const [targetSection, setTargetSection] = useState('ALL');
  const [endsAt, setEndsAt] = useState('');
  const [randomizeQ, setRandomizeQ] = useState(true);
  const [randomizeOpts, setRandomizeOpts] = useState(true);
  const [questions, setQuestions] = useState<any[]>([
    {
      id: 'q1',
      question_type: 'MCQ',
      prompt: '',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_answers: ['Option A'],
      marks: 2,
      explanation: '',
    },
  ]);

  // Student quiz runner state
  const [activeRun, setActiveRun] = useState<{
    quiz: any;
    attempt_id: number;
    expires_at: string;
    questions: any[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [resultModal, setResultModal] = useState<any | null>(null);

  const loadQuizzes = async () => {
    try {
      const data = await classroomApi.listQuizzes(offeringId, previewSection);
      setQuizzes(data?.quizzes || []);
    } catch {}
  };

  const loadBank = async () => {
    if (!effectiveStaff) return;
    try {
      const data = await classroomApi.listQuestionBank(courseCode);
      setBankItems(data?.items || []);
    } catch {}
  };

  useEffect(() => {
    loadQuizzes();
  }, [offeringId, previewSection]);

  useEffect(() => {
    if (showBank && effectiveStaff) loadBank();
  }, [showBank, effectiveStaff]);

  useEffect(() => {
    if (!activeRun) return;
    const tick = () => {
      const rem = Math.max(
        0,
        Math.floor((new Date(activeRun.expires_at).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(rem);
      if (rem === 0) {
        handleSubmitAttempt();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [activeRun?.attempt_id]);

  const handlePublishQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTitle.trim() || questions.some((q) => !q.prompt.trim())) {
      onToast('Fill quiz title and all question prompts', 'error');
      return;
    }
    try {
      const resData = await classroomApi.createQuiz(offeringId, {
        title: quizTitle.trim(),
        duration_minutes: Number(durationMin || 15),
        target_sections: targetSection === 'ALL' ? ['ALL'] : [targetSection],
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        randomize_questions: randomizeQ,
        randomize_options: randomizeOpts,
        show_solutions_after: true,
        questions,
      });
      onToast(resData?.message || 'Quiz published & synced to Gradebook', 'success');
      setShowBuilder(false);
      setQuizTitle('');
      await Promise.all([loadQuizzes(), onRefreshWorkspace()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to create quiz', 'error');
    }
  };

  const handleSaveToBank = async (q: any) => {
    if (!q.prompt.trim()) return;
    try {
      await classroomApi.addQuestionBankItem({
        course_code: courseCode,
        topic: quizTitle || 'General',
        ...q,
      });
      onToast('Saved question to your reusable Question Bank', 'success');
      await loadBank();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not save question', 'error');
    }
  };

  const handleStartQuiz = async (quiz: any) => {
    try {
      const resData = await classroomApi.startQuiz(quiz.id);
      setAnswers({});
      setActiveRun({
        quiz,
        attempt_id: resData.attempt_id,
        expires_at: resData.expires_at,
        questions: resData.questions || [],
      });
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not start quiz', 'error');
    }
  };

  const handleSubmitAttempt = async () => {
    if (!activeRun) return;
    const run = activeRun;
    setActiveRun(null);
    try {
      const resData = await classroomApi.submitQuizAttempt(run.attempt_id, answers);
      onToast(resData?.message || 'Quiz auto-graded!', 'success');
      setResultModal({ title: run.quiz.title, ...resData });
      await Promise.all([loadQuizzes(), onRefreshWorkspace()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to submit quiz', 'error');
    }
  };

  const fmtTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#0A0A0C] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#E04F33]" />
            <span>In-Portal Timed Quizzes &amp; Question Bank</span>
          </h3>
          <p className="text-[#5C5B57] mt-0.5">
            Auto-graded MCQ, multi-select, and short-answer assessments synced directly into Excel Marks Sheet &amp; My Grades.
          </p>
        </div>
        {effectiveStaff && canCreate && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBank(!showBank)}
              className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD] font-semibold inline-flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5 text-[#896ABD]" />
              <span>Question Bank</span>
            </button>
            <button
              type="button"
              onClick={() => setShowBuilder(!showBuilder)}
              className="px-4 py-2 rounded-xl bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Timed Quiz</span>
            </button>
          </div>
        )}
      </div>

      {/* Question Bank Browser */}
      {effectiveStaff && showBank && (
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Saved Question Bank ({bankItems.length})</h4>
            <button type="button" onClick={() => setShowBank(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          {bankItems.length === 0 ? (
            <p className="text-[#5C5B57]">No saved questions for {courseCode} yet. Use &quot;Save to Bank&quot; inside the quiz builder.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {bankItems.map((b) => (
                <div key={b.id} className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono-tabular text-[10px] text-[#896ABD]">
                      {b.question_type} · {b.marks} marks · {b.topic || 'General'}
                    </div>
                    <div className="font-semibold text-[#0A0A0C] mt-0.5">{b.prompt}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBuilder(true);
                        setQuestions((prev) => [
                          ...prev,
                          {
                            id: `q_${Date.now()}`,
                            question_type: b.question_type,
                            prompt: b.prompt,
                            options: b.options_json || [],
                            correct_answers: b.correct_answers || [],
                            marks: Number(b.marks || 1),
                            explanation: b.explanation || '',
                          },
                        ]);
                        onToast('Added question into builder', 'success');
                      }}
                      className="px-2 py-1 rounded bg-[#0A0A0C] text-white text-[10px] font-semibold"
                    >
                      + Use
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await classroomApi.deleteQuestionBankItem(b.id);
                        await loadBank();
                      }}
                      className="p-1 rounded border border-rose-500/25 text-rose-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Faculty Quiz Builder */}
      {effectiveStaff && showBuilder && (
        <form onSubmit={handlePublishQuiz} className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              required
              placeholder="Quiz Title (e.g. Surprise Quiz 2)"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              className="sm:col-span-2 px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
            />
            <input
              type="number"
              min={2}
              max={240}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="Minutes"
              className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular"
            />
            <select
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular"
            >
              <option value="ALL">All Sections</option>
              {allowedSections
                .filter((s) => s !== 'ALL')
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeQ}
                onChange={(e) => setRandomizeQ(e.target.checked)}
                className="accent-[#896ABD]"
              />
              <span>Shuffle Questions</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeOpts}
                onChange={(e) => setRandomizeOpts(e.target.checked)}
                className="accent-[#896ABD]"
              />
              <span>Shuffle Options</span>
            </label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              title="Closing deadline"
              className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6]"
            />
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div key={q.id} className="p-3.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tabular font-semibold">Question {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={q.question_type}
                      onChange={(e) => {
                        const copy = [...questions];
                        copy[idx] = { ...copy[idx], question_type: e.target.value };
                        setQuestions(copy);
                      }}
                      className="px-2 py-1 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                    >
                      <option value="MCQ">MCQ (Single)</option>
                      <option value="MULTI_SELECT">Multi-Select</option>
                      <option value="SHORT_ANSWER">Short Answer</option>
                    </select>
                    <input
                      type="number"
                      min={0.5}
                      step="0.5"
                      value={q.marks}
                      onChange={(e) => {
                        const copy = [...questions];
                        copy[idx] = { ...copy[idx], marks: Number(e.target.value) };
                        setQuestions(copy);
                      }}
                      className="w-16 px-2 py-1 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveToBank(q)}
                      className="px-2 py-1 rounded-lg border border-[#896ABD]/40 text-[#5B3B96] bg-white font-semibold"
                    >
                      Save to Bank
                    </button>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Enter question prompt..."
                  value={q.prompt}
                  onChange={(e) => {
                    const copy = [...questions];
                    copy[idx] = { ...copy[idx], prompt: e.target.value };
                    setQuestions(copy);
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
                />
                {q.question_type !== 'SHORT_ANSWER' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(q.options || []).map((opt: string, oi: number) => (
                      <div key={oi} className="flex items-center gap-1.5">
                        <input
                          type={q.question_type === 'MULTI_SELECT' ? 'checkbox' : 'radio'}
                          checked={(q.correct_answers || []).includes(opt)}
                          onChange={(e) => {
                            const copy = [...questions];
                            if (q.question_type === 'MULTI_SELECT') {
                              const prev = new Set(copy[idx].correct_answers || []);
                              if (e.target.checked) prev.add(opt);
                              else prev.delete(opt);
                              copy[idx] = { ...copy[idx], correct_answers: Array.from(prev) };
                            } else {
                              copy[idx] = { ...copy[idx], correct_answers: [opt] };
                            }
                            setQuestions(copy);
                          }}
                          className="accent-[#10B981]"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const oldVal = opt;
                            const nextVal = e.target.value;
                            const copy = [...questions];
                            const opts = [...(copy[idx].options || [])];
                            opts[oi] = nextVal;
                            const corr = (copy[idx].correct_answers || []).map((c: string) =>
                              c === oldVal ? nextVal : c
                            );
                            copy[idx] = { ...copy[idx], options: opts, correct_answers: corr };
                            setQuestions(copy);
                          }}
                          className="flex-1 px-2.5 py-1 rounded-lg border border-[#DDD8CE] bg-white"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Accepted answer keywords (comma separated, e.g. O(n log n), n log n)"
                    value={(q.correct_answers || []).join(', ')}
                    onChange={(e) => {
                      const copy = [...questions];
                      copy[idx] = {
                        ...copy[idx],
                        correct_answers: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      };
                      setQuestions(copy);
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() =>
                setQuestions([
                  ...questions,
                  {
                    id: `q_${Date.now()}`,
                    question_type: 'MCQ',
                    prompt: '',
                    options: ['Option A', 'Option B', 'Option C', 'Option D'],
                    correct_answers: ['Option A'],
                    marks: 2,
                    explanation: '',
                  },
                ])
              }
              className="px-3 py-1.5 rounded-xl border border-[#DDD8CE] font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Question
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold"
            >
              Publish Quiz &amp; Link Gradebook
            </button>
          </div>
        </form>
      )}

      {/* Quizzes List */}
      {quizzes.length === 0 ? (
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-8 text-center text-[#5C5B57]">
          No timed quizzes published for {courseCode} yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((qz) => {
            const done = qz.my_attempt?.status === 'SUBMITTED';
            return (
              <div key={qz.id} className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-semibold bg-[#896ABD]/12 text-[#5B3B96]">
                        {(qz.target_sections || ['ALL']).join(', ')}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[#5C5B57] inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {qz.duration_minutes} mins · {qz.questions_count} Qs · {qz.max_marks} Marks
                      </span>
                    </div>
                    <h4 className="text-base font-semibold text-[#0A0A0C] mt-1">{qz.title}</h4>
                  </div>
                  {qz.can_edit && (
                    <button
                      type="button"
                      onClick={async () => {
                        await classroomApi.deleteQuiz(qz.id);
                        await Promise.all([loadQuizzes(), onRefreshWorkspace()]);
                      }}
                      className="p-1.5 rounded-lg border border-rose-500/25 text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E5E2DC]">
                  {effectiveStaff ? (
                    <span className="font-mono-tabular text-[11px] text-[#5C5B57]">
                      {qz.attempt_count || 0} student attempts
                    </span>
                  ) : done ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 font-mono-tabular font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Scored {qz.my_attempt.score}/{qz.max_marks}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartQuiz(qz)}
                      className="px-4 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 text-white font-semibold inline-flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{qz.my_attempt ? 'Resume Quiz' : 'Start Timed Quiz'}</span>
                    </button>
                  )}
                  {qz.ends_at && (
                    <span className="font-mono-tabular text-[11px] text-[#5C5B57]">
                      Closes {new Date(qz.ends_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timed Quiz Runner Modal */}
      {activeRun && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#0A0A0C] text-white flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">{activeRun.quiz.title}</h4>
                <p className="text-[11px] text-[#B8B5AD]">Auto-submits automatically when timer hits 00:00</p>
              </div>
              <div className="px-3 py-1 rounded-lg bg-[#E04F33] font-mono-tabular text-sm font-bold">
                {fmtTimer(secondsLeft)}
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {activeRun.questions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] space-y-2.5">
                  <div className="font-semibold text-sm text-[#0A0A0C]">
                    Q{idx + 1}. {q.prompt}{' '}
                    <span className="font-mono-tabular text-[11px] text-[#896ABD]">
                      ({q.marks} marks)
                    </span>
                  </div>
                  {q.question_type === 'SHORT_ANSWER' ? (
                    <input
                      type="text"
                      placeholder="Type your concise answer..."
                      value={answers[q.id] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[#DDD8CE] bg-white"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {(q.options || []).map((opt: string, oi: number) => {
                        const checked =
                          q.question_type === 'MULTI_SELECT'
                            ? Array.isArray(answers[q.id]) && answers[q.id].includes(opt)
                            : answers[q.id] === opt;
                        return (
                          <label
                            key={oi}
                            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer ${
                              checked ? 'border-[#E04F33] bg-[#E04F33]/5' : 'border-[#DDD8CE] bg-white'
                            }`}
                          >
                            <input
                              type={q.question_type === 'MULTI_SELECT' ? 'checkbox' : 'radio'}
                              name={`run-${q.id}`}
                              checked={checked}
                              onChange={(e) => {
                                if (q.question_type === 'MULTI_SELECT') {
                                  const prev = new Set(Array.isArray(answers[q.id]) ? answers[q.id] : []);
                                  if (e.target.checked) prev.add(opt);
                                  else prev.delete(opt);
                                  setAnswers({ ...answers, [q.id]: Array.from(prev) });
                                } else {
                                  setAnswers({ ...answers, [q.id]: opt });
                                }
                              }}
                              className="accent-[#E04F33]"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-[#E5E2DC] flex justify-end gap-2 bg-[#FAF9F6]">
              <button
                type="button"
                onClick={handleSubmitAttempt}
                className="px-5 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold"
              >
                Submit &amp; Auto-Grade Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results & Solution Modal */}
      {resultModal && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-lg rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold text-[#0A0A0C]">
                {resultModal.title} — Results
              </h4>
              <button type="button" onClick={() => setResultModal(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <div className="text-2xl font-bold font-mono-tabular text-emerald-800">
                {resultModal.score} / {resultModal.max_marks}
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                Automatically synced to Course Gradebook
              </div>
            </div>
            <div className="space-y-2">
              {(resultModal.review || []).map((r: any, idx: number) => (
                <div
                  key={r.id}
                  className={`p-2.5 rounded-lg border ${
                    r.is_correct ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'
                  }`}
                >
                  <div className="font-semibold">
                    Q{idx + 1}: {r.is_correct ? 'Correct' : 'Incorrect'} ({r.earned_marks}/{r.max_marks})
                  </div>
                  {r.correct_answers && (
                    <div className="text-[11px] text-[#5C5B57] mt-0.5">
                      Answer: {r.correct_answers.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
