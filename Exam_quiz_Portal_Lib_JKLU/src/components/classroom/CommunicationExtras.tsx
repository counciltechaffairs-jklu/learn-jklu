import React, { useEffect, useState } from 'react';
import {
  BarChart2,
  Calendar,
  Clock,
  Copy,
  Eye,
  Lock,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';
import { buildGoogleCalendarUrl } from '@/utils/calendarLinks';

export const AddToCalendarButton: React.FC<{
  title: string;
  details?: string;
  dueAt?: string | null;
  className?: string;
}> = ({ title, details, dueAt, className = '' }) => {
  if (!dueAt) return null;
  const href = buildGoogleCalendarUrl({
    title,
    details,
    startIso: dueAt,
  });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`px-2.5 py-1 rounded-lg border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-[11px] font-semibold text-[#5B3B96] inline-flex items-center gap-1.5 transition-colors ${className}`}
      title="Add due date to Google Calendar"
    >
      <Calendar className="w-3 h-3 text-[#E04F33]" />
      <span>Add to Google Calendar</span>
    </a>
  );
};

export const GoogleCalendarSyncBar: React.FC<{
  onToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({ onToast }) => {
  const [links, setLinks] = useState<{ ics_url: string; google_subscribe_url: string } | null>(null);

  useEffect(() => {
    classroomApi
      .getCalendarSyncLink()
      .then((data) => setLinks(data))
      .catch(() => {});
  }, []);

  if (!links) return null;

  return (
    <div className="rounded-2xl border border-[#DDD8CE] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <Calendar className="w-4 h-4 text-[#E04F33] shrink-0" />
        <div>
          <span className="font-semibold text-[#0A0A0C]">Google Calendar Deadlines Sync</span>
          <span className="hidden sm:inline text-[#5C5B57] ml-2">
            Auto-sync all course assignments, labs &amp; quizzes directly into Google Calendar.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={links.google_subscribe_url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Sync All to Google Calendar</span>
        </a>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(links.ics_url);
            onToast('ICS calendar feed URL copied!', 'success');
          }}
          className="px-2.5 py-1.5 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD] font-semibold inline-flex items-center gap-1"
        >
          <Copy className="w-3 h-3" />
          <span>Copy .ics</span>
        </button>
      </div>
    </div>
  );
};

export const AnnouncementSeenByChip: React.FC<{
  announcementId: number;
  isStaff: boolean;
}> = ({ announcementId, isStaff }) => {
  const [info, setInfo] = useState<{ seen_count: number; viewers: any[] } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    classroomApi.markAnnouncementSeen(announcementId).catch(() => {});
  }, [announcementId]);

  const loadViewers = async () => {
    if (!isStaff) return;
    if (open) {
      setOpen(false);
      return;
    }
    try {
      const data = await classroomApi.getAnnouncementSeen(announcementId);
      setInfo(data);
      setOpen(true);
    } catch {}
  };

  if (!isStaff) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={loadViewers}
        className="px-2 py-0.5 rounded font-mono-tabular text-[10px] font-medium bg-black/[0.04] hover:bg-black/[0.08] text-[#5C5B57] inline-flex items-center gap-1"
      >
        <Eye className="w-3 h-3 text-[#896ABD]" />
        <span>{info ? `Seen by ${info.seen_count}` : 'Seen by'}</span>
      </button>
      {open && info && (
        <div className="mt-1.5 p-2.5 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] text-[11px] space-y-1 max-w-xs">
          <div className="font-semibold text-[#0A0A0C]">
            Seen by {info.seen_count} member{info.seen_count === 1 ? '' : 's'}
          </div>
          {info.viewers.length === 0 ? (
            <div className="text-[#5C5B57]">No opens recorded yet.</div>
          ) : (
            <div className="max-h-28 overflow-y-auto space-y-0.5">
              {info.viewers.map((v: any) => (
                <div key={v.id} className="text-[#353430] truncate">
                  {v.name} {v.roll_no ? `(${v.roll_no})` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const StreamPollsSection: React.FC<{
  offeringId: number;
  canCreate: boolean;
  allowedSections: string[];
  isUnrestricted: boolean;
  sectionViewFilter: string;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({
  offeringId,
  canCreate,
  allowedSections,
  isUnrestricted,
  sectionViewFilter,
  onToast,
}) => {
  const [polls, setPolls] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [question, setQuestion] = useState('');
  const [optsText, setOptsText] = useState('Option A\nOption B');
  const [targetSec, setTargetSec] = useState('ALL');

  const loadPolls = async () => {
    try {
      const data = await classroomApi.listPolls(offeringId);
      setPolls(data?.polls || []);
    } catch {}
  };

  useEffect(() => {
    loadPolls();
  }, [offeringId]);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const options = optsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!question.trim() || options.length < 2) {
      onToast('Enter a question and at least 2 options', 'error');
      return;
    }
    try {
      await classroomApi.createPoll(offeringId, {
        question: question.trim(),
        options,
        target_sections: targetSec === 'ALL' ? ['ALL'] : [targetSec],
      });
      onToast('Poll published', 'success');
      setQuestion('');
      setOptsText('Option A\nOption B');
      setShowNew(false);
      await loadPolls();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to create poll', 'error');
    }
  };

  const handleVote = async (pollId: number, idx: number) => {
    try {
      await classroomApi.votePoll(pollId, idx);
      await loadPolls();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not record vote', 'error');
    }
  };

  const visiblePolls = polls.filter((p) => {
    if (sectionViewFilter === 'ALL') return true;
    const tgts: string[] = p.target_sections || ['ALL'];
    return tgts.some(
      (t) => t.toUpperCase() === 'ALL' || t.toLowerCase() === sectionViewFilter.toLowerCase()
    );
  });

  if (!canCreate && visiblePolls.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#DDD8CE] bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#0A0A0C]">
          <BarChart2 className="w-4 h-4 text-[#896ABD]" />
          <span>Classroom Polls ({visiblePolls.length})</span>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="px-2.5 py-1 rounded-lg border border-[#DDD8CE] hover:border-[#896ABD] text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> New Poll
          </button>
        )}
      </div>

      {showNew && canCreate && (
        <form onSubmit={handleCreatePoll} className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] space-y-2 text-xs">
          <input
            type="text"
            required
            placeholder="Ask a quick question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
          />
          <textarea
            rows={3}
            required
            value={optsText}
            onChange={(e) => setOptsText(e.target.value)}
            placeholder="One option per line..."
            className="w-full px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
          />
          <div className="flex items-center justify-between gap-2">
            <select
              value={targetSec}
              onChange={(e) => setTargetSec(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
            >
              {(isUnrestricted || allowedSections.includes('ALL') || true) && (
                <option value="ALL">All Sections</option>
              )}
              {allowedSections
                .filter((s) => s !== 'ALL')
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-[#E04F33] text-white font-semibold"
            >
              Publish Poll
            </button>
          </div>
        </form>
      )}

      {visiblePolls.map((p) => (
        <div key={`poll-${p.id}`} className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC] space-y-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-[#0A0A0C]">{p.question}</div>
              <div className="text-[10px] font-mono-tabular text-[#5C5B57]">
                By {p.author_name} · {p.total_votes} vote{p.total_votes === 1 ? '' : 's'} ·{' '}
                {(p.target_sections || ['ALL']).join(', ')}
                {p.is_closed && ' · Closed'}
              </div>
            </div>
            {p.can_manage && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    await classroomApi.closePoll(p.id);
                    await loadPolls();
                  }}
                  title={p.is_closed ? 'Reopen poll' : 'Close poll'}
                  className="p-1 rounded border border-[#DDD8CE] bg-white"
                >
                  {p.is_closed ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await classroomApi.deletePoll(p.id);
                    await loadPolls();
                  }}
                  className="p-1 rounded border border-rose-500/25 text-rose-600 bg-white"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {(p.options || []).map((opt: string, idx: number) => {
              const cnt = p.counts?.[idx] || 0;
              const pct = p.total_votes > 0 ? Math.round((cnt / p.total_votes) * 100) : 0;
              const picked = p.my_vote === idx;
              return (
                <button
                  key={`opt-${p.id}-${idx}`}
                  type="button"
                  disabled={p.is_closed}
                  onClick={() => handleVote(p.id, idx)}
                  className={`relative w-full text-left px-3 py-1.5 rounded-lg border overflow-hidden transition-colors ${
                    picked ? 'border-[#E04F33] bg-white' : 'border-[#DDD8CE] bg-white hover:border-[#896ABD]'
                  }`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 ${
                      picked ? 'bg-[#E04F33]/12' : 'bg-[#896ABD]/10'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-2">
                    <span className="font-medium text-[#0A0A0C]">
                      {picked ? '✓ ' : ''}
                      {opt}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[#5C5B57]">
                      {cnt} ({pct}%)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export const OfficeHoursSection: React.FC<{
  offeringId: number;
  isStaff: boolean;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({ offeringId, isStaff, onToast }) => {
  const [slots, setSlots] = useState<any[]>([]);
  const [form, setForm] = useState({ location: 'Cabin / Google Meet', starts_at: '', ends_at: '', max_bookings: '2' });

  const loadSlots = async () => {
    try {
      const data = await classroomApi.listOfficeHours(offeringId);
      setSlots(data?.slots || []);
    } catch {}
  };

  useEffect(() => {
    loadSlots();
  }, [offeringId]);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await classroomApi.createOfficeHour(offeringId, form);
      onToast('Office hour slot published', 'success');
      setForm({ location: 'Cabin / Google Meet', starts_at: '', ends_at: '', max_bookings: '2' });
      await loadSlots();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to add slot', 'error');
    }
  };

  return (
    <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-4 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-[#0A0A0C] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#E04F33]" />
            <span>Office Hours &amp; Doubt Slots ({slots.length})</span>
          </h3>
          <p className="text-xs text-[#5C5B57]">
            Book a 1-on-1 doubt clearing slot with course faculty.
          </p>
        </div>
      </div>

      {isStaff && (
        <form onSubmit={handleAddSlot} className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
          <input
            type="text"
            required
            placeholder="Location / Link"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
          />
          <input
            type="datetime-local"
            required
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
          />
          <input
            type="datetime-local"
            required
            value={form.ends_at}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={form.max_bookings}
            onChange={(e) => setForm({ ...form, max_bookings: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white font-mono-tabular"
            placeholder="Cap"
          />
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold">
            + Add Slot
          </button>
        </form>
      )}

      {slots.length === 0 ? (
        <p className="text-[#5C5B57]">No upcoming office hour slots posted yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {slots.map((s) => (
            <div key={`oh-${s.id}`} className="p-3.5 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold text-[#0A0A0C] truncate">
                  {s.professor_name} · {s.location}
                </div>
                <div className="font-mono-tabular text-[11px] text-[#5C5B57]">
                  {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString()}
                </div>
                <div className="text-[11px] text-[#896ABD] flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>
                    {s.booked_count}/{s.max_bookings} booked
                  </span>
                </div>
              </div>
              {!isStaff ? (
                s.my_booking ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await classroomApi.cancelOfficeHourBooking(s.id);
                      onToast('Booking cancelled', 'success');
                      await loadSlots();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-700 font-semibold"
                  >
                    Cancel Slot
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={s.booked_count >= s.max_bookings}
                    onClick={async () => {
                      try {
                        await classroomApi.bookOfficeHour(s.id, 'Course Doubt');
                        onToast('Office hour slot booked!', 'success');
                        await loadSlots();
                      } catch (err: any) {
                        onToast(err?.response?.data?.detail || 'Slot unavailable', 'error');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#E04F33] text-white font-semibold disabled:opacity-50"
                  >
                    {s.booked_count >= s.max_bookings ? 'Full' : 'Book Slot'}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await classroomApi.deleteOfficeHour(s.id);
                    await loadSlots();
                  }}
                  className="p-1.5 rounded-lg border border-rose-500/25 text-rose-600 bg-white"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const SubmissionPrivateChat: React.FC<{
  submissionId: number;
  onToast?: (msg: string, type?: 'success' | 'error') => void;
}> = ({ submissionId, onToast }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');

  const loadMsgs = async () => {
    try {
      const data = await classroomApi.getSubmissionMessages(submissionId);
      setMessages(data?.messages || []);
    } catch {}
  };

  useEffect(() => {
    loadMsgs();
  }, [submissionId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await classroomApi.postSubmissionMessage(submissionId, draft.trim());
      setDraft('');
      await loadMsgs();
    } catch (err: any) {
      onToast?.(err?.response?.data?.detail || 'Could not send message', 'error');
    }
  };

  return (
    <div className="rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] p-3 space-y-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-[#0A0A0C]">
        <MessageCircle className="w-3.5 h-3.5 text-[#896ABD]" />
        <span>Private Submission Thread ({messages.length})</span>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1.5">
        {messages.length === 0 ? (
          <p className="text-[11px] text-[#5C5B57] italic">No private messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="p-2 rounded-lg bg-white border border-[#E5E2DC]">
              <div className="flex items-center justify-between text-[10px] text-[#5C5B57]">
                <span className="font-semibold text-[#0A0A0C]">
                  {m.sender_name} · {m.sender_role}
                </span>
                <span>{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p className="text-[#353430] mt-0.5">{m.message}</p>
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Private note to student / instructor..."
          className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white"
        />
        <button
          type="submit"
          className="px-2.5 py-1.5 rounded-lg bg-[#0A0A0C] hover:bg-[#E04F33] text-white inline-flex items-center gap-1 font-semibold"
        >
          <Send className="w-3 h-3" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
