import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentSectionMap,
  formatLateDuration,
  computeLateSubmissionPenalty,
  resolveSubmissionGroupMembers,
} from '../src/utils/classroomHelpers.js';

describe('classroomHelpers utilities', () => {
  it('resolves student sections by student_id or case-insensitive email', () => {
    const map = buildStudentSectionMap([
      { student_id: 11, student_email: 'Aarav@jklu.edu.in', section: 'Sec B' },
      { student_id: null, student_email: 'Meera@jklu.edu.in', section: 'Sec C' },
    ]);

    assert.equal(map.resolve(11, 'other@jklu.edu.in'), 'Sec B');
    assert.equal(map.resolve(999, 'meera@jklu.edu.in'), 'Sec C');
    assert.equal(map.resolve(999, 'unknown@jklu.edu.in'), 'Sec A');
  });

  it('formats late durations cleanly across minutes and hours', () => {
    assert.equal(formatLateDuration(0), '0m late');
    assert.equal(formatLateDuration(45), '45m late');
    assert.equal(formatLateDuration(120), '2h late');
    assert.equal(formatLateDuration(135), '2h 15m late');
  });

  it('computes late status, grace window, and multi-day penalties accurately', () => {
    const dueIso = '2026-11-26T10:00:00.000Z';
    const dueMs = new Date(dueIso).getTime();

    const onTime = computeLateSubmissionPenalty(
      { due_at: dueIso, grace_minutes: 15, late_penalty_pct_per_day: 10, max_marks: 100 },
      dueMs - 60000
    );
    assert.deepEqual(onTime, { isLate: false, lateMinutes: 0, latePenaltyApplied: 0 });

    const inGrace = computeLateSubmissionPenalty(
      { due_at: dueIso, grace_minutes: 15, late_penalty_pct_per_day: 10, max_marks: 100 },
      dueMs + 10 * 60000
    );
    assert.deepEqual(inGrace, { isLate: true, lateMinutes: 0, latePenaltyApplied: 0 });

    const twoDaysLate = computeLateSubmissionPenalty(
      { due_at: dueIso, grace_minutes: 15, late_penalty_pct_per_day: 10, max_marks: 50 },
      dueMs + (24 * 60 + 30) * 60000
    );
    assert.equal(twoDaysLate.isLate, true);
    assert.equal(twoDaysLate.lateMinutes, 1470);
    assert.equal(twoDaysLate.latePenaltyApplied, 10);

    const capped = computeLateSubmissionPenalty(
      { due_at: dueIso, grace_minutes: 0, late_penalty_pct_per_day: 60, max_marks: 50 },
      dueMs + 3 * 1440 * 60000
    );
    assert.equal(capped.latePenaltyApplied, 50);
  });

  it('resolves group submission membership cleanly for students and staff', async () => {
    const noopDb = {
      query: async () => {
        throw new Error('Should not query for non-group or staff submissions');
      },
    };

    const nonGroup = await resolveSubmissionGroupMembers(noopDb, {
      assignment: { id: 1, is_group_assignment: false },
      userId: 5,
      isStaff: false,
    });
    assert.deepEqual(nonGroup, { ok: true, groupId: null, members: [] });

    const staffBypass = await resolveSubmissionGroupMembers(noopDb, {
      assignment: { id: 1, is_group_assignment: true },
      userId: 5,
      isStaff: true,
    });
    assert.deepEqual(staffBypass, { ok: true, groupId: null, members: [] });

    const missingDb = { query: async () => ({ rows: [], rowCount: 0 }) };
    const missing = await resolveSubmissionGroupMembers(missingDb, {
      assignment: { id: 1, is_group_assignment: true },
      userId: 5,
      isStaff: false,
    });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /group/i);

    const membersDb = {
      query: async (sql) => {
        if (sql.includes('SELECT group_id')) {
          return { rows: [{ group_id: 77 }], rowCount: 1 };
        }
        return {
          rows: [
            { student_id: 5, student_email: 'a@jklu.edu.in', student_name: 'Student A' },
            { student_id: 6, student_email: 'b@jklu.edu.in', student_name: 'Student B' },
          ],
          rowCount: 2,
        };
      },
    };
    const found = await resolveSubmissionGroupMembers(membersDb, {
      assignment: { id: 1, is_group_assignment: true },
      userId: 5,
      isStaff: false,
    });
    assert.equal(found.ok, true);
    assert.equal(found.groupId, 77);
    assert.equal(found.members.length, 2);
  });
});
