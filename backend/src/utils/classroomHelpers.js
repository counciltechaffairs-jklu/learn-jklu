export function buildStudentSectionMap(enrollmentRows = []) {
  const byId = new Map();
  const byEmail = new Map();

  for (const row of enrollmentRows) {
    const sec = row.section || 'Sec A';
    if (row.student_id != null) {
      byId.set(Number(row.student_id), sec);
    }
    if (row.student_email) {
      byEmail.set(String(row.student_email).trim().toLowerCase(), sec);
    }
  }

  return {
    byId,
    byEmail,
    resolve(studentId, studentEmail, fallback = 'Sec A') {
      return (
        (studentId != null ? byId.get(Number(studentId)) : undefined) ||
        (studentEmail ? byEmail.get(String(studentEmail).trim().toLowerCase()) : undefined) ||
        fallback
      );
    },
  };
}

export async function getOfferingCourseMeta(db, offeringId) {
  const res = await db.query(
    `SELECT co.id,
            COALESCE(co.course_code, c.code) AS course_code,
            COALESCE(co.course_name, c.name) AS course_name,
            co.section,
            co.sections,
            co.semester,
            co.academic_year
     FROM course_offerings co
     LEFT JOIN courses c ON c.id = co.course_id
     WHERE co.id = $1
     LIMIT 1`,
    [offeringId]
  );

  const row = res.rows[0] || null;
  if (!row) return null;

  return {
    ...row,
    courseCode: row.course_code || 'COURSE',
    courseName: row.course_name || 'Classroom',
  };
}

export function formatLateDuration(mins) {
  const m = Math.max(0, Math.round(Number(mins || 0)));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}h ${rem}m late` : `${h}h late`;
  }
  return `${m}m late`;
}

export function computeLateSubmissionPenalty(asgn, nowMs = Date.now()) {
  const dueMs = asgn?.due_at ? new Date(asgn.due_at).getTime() : NaN;
  const isLate = Boolean(Number.isFinite(dueMs) && nowMs > dueMs);
  let lateMinutes = 0;
  let latePenaltyApplied = 0;

  if (isLate) {
    const rawDiffMin = Math.max(0, Math.round((nowMs - dueMs) / 60000));
    const graceMin = Number(asgn?.grace_minutes || 0);
    if (rawDiffMin > graceMin) {
      lateMinutes = rawDiffMin;
      const pctPerDay = Number(asgn?.late_penalty_pct_per_day || 0);
      if (pctPerDay > 0) {
        const lateDays = Math.ceil((rawDiffMin - graceMin) / 1440);
        const maxM = Number(asgn?.max_marks || 100);
        latePenaltyApplied = Number(
          Math.min(maxM, (maxM * (pctPerDay * lateDays)) / 100).toFixed(2)
        );
      }
    }
  }

  return { isLate, lateMinutes, latePenaltyApplied };
}

export async function resolveSubmissionGroupMembers(
  db,
  { assignment, userId, isStaff = false, missingGroupMessage = 'This is a group assignment. Create or join a group before submitting.' }
) {
  if (!assignment?.is_group_assignment || isStaff) {
    return { ok: true, groupId: null, members: [] };
  }
  const gm = await db.query(
    'SELECT group_id FROM assignment_group_members WHERE assignment_id = $1 AND student_id = $2 LIMIT 1',
    [Number(assignment.id), userId]
  );
  if (gm.rowCount === 0) {
    return {
      ok: false,
      error: missingGroupMessage,
      groupId: null,
      members: [],
    };
  }
  const groupId = Number(gm.rows[0].group_id);
  const allGm = await db.query(
    'SELECT student_id, student_email, student_name FROM assignment_group_members WHERE group_id = $1',
    [groupId]
  );
  return { ok: true, groupId, members: allGm.rows };
}
