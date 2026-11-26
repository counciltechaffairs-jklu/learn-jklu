/**
 * Pure helper functions for multi-section classroom scoping, read-only cross-section visibility,
 * self-selectable teaching sections, and strict write/edit/grade access control.
 */

export function normalizeSectionName(val) {
  const clean = String(val ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || /^(all|all\s+sections?)$/i.test(clean)) {
    return 'ALL';
  }
  return clean;
}

/**
 * Parses section inputs from JSON strings, arrays, or strings like "Sec A, Sec B" / "Sec A & B".
 */
export function parseSectionsList(raw, fallback = ['ALL']) {
  const defaultList = Array.isArray(fallback) && fallback.length > 0 ? [...fallback] : ['ALL'];
  if (raw === null || raw === undefined) {
    return defaultList;
  }

  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return defaultList;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          items = parsed;
        }
      } catch {
        items = [trimmed];
      }
    } else {
      const commaParts = trimmed.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
      for (const part of commaParts) {
        if (/[&/]/.test(part) && !/^all/i.test(part)) {
          const sub = part.split(/[&/]+/).map((s) => s.trim()).filter(Boolean);
          const prefixMatch = /^sec(?:tion)?\s+/i.exec(sub[0] || '');
          sub.forEach((tok, idx) => {
            if (idx > 0 && prefixMatch && !/^(sec|section)\b/i.test(tok) && /^[A-Za-z0-9]+$/i.test(tok)) {
              items.push(`${prefixMatch[0].trim()} ${tok}`);
            } else {
              items.push(tok);
            }
          });
        } else {
          items.push(part);
        }
      }
    }
  } else {
    items = [String(raw)];
  }

  const seen = new Set();
  const normalized = [];
  for (const rawItem of items) {
    const norm = normalizeSectionName(rawItem);
    const key = norm.toLowerCase();
    if (key === 'all') {
      return ['ALL'];
    }
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(norm);
    }
  }

  return normalized.length > 0 ? normalized : defaultList;
}

export function isUnrestrictedSections(sections) {
  return parseSectionsList(sections).includes('ALL');
}

export function canStaffAccessSection(perms, section) {
  if (!perms) return false;
  if (perms.is_admin || isUnrestrictedSections(perms.assigned_sections)) {
    return true;
  }
  const target = normalizeSectionName(section || 'Sec A').toLowerCase();
  const allowed = parseSectionsList(perms.assigned_sections, []).map((s) =>
    normalizeSectionName(s).toLowerCase()
  );
  return allowed.includes(target);
}

/**
 * Validates target sections when creating a post or assignment.
 * Any professor can post to their own assigned section(s) OR share to ['ALL'].
 */
export function resolvePostTargetsForStaff(perms, requestedTargets) {
  const unrestricted = Boolean(perms?.is_admin || isUnrestrictedSections(perms?.assigned_sections));
  const defaultTargets = unrestricted
    ? ['ALL']
    : parseSectionsList(perms?.assigned_sections, ['ALL']);

  if (
    requestedTargets === undefined ||
    requestedTargets === null ||
    (Array.isArray(requestedTargets) && requestedTargets.length === 0) ||
    (typeof requestedTargets === 'string' && !requestedTargets.trim())
  ) {
    return { ok: true, sections: defaultTargets };
  }

  const reqList = parseSectionsList(requestedTargets, []);
  if (reqList.length === 0) {
    return { ok: true, sections: defaultTargets };
  }

  // Any course instructor/announcer is allowed to share a post or assignment to All Sections
  if (reqList.includes('ALL')) {
    return { ok: true, sections: ['ALL'] };
  }

  if (unrestricted) {
    return { ok: true, sections: reqList };
  }

  const disallowed = reqList.filter((sec) => !canStaffAccessSection(perms, sec));
  if (disallowed.length > 0) {
    const allowedText = parseSectionsList(perms?.assigned_sections, []).join(', ');
    return {
      ok: false,
      error: `You can post to your assigned section(s) (${allowedText || 'None'}) or All Sections, not exclusively to ${disallowed.join(', ')}.`,
    };
  }

  return { ok: true, sections: reqList };
}

/**
 * Checks whether staff can edit/delete an announcement or assignment.
 * - Coordinator / Admin (['ALL']): always true.
 * - Shared ['ALL'] item: only the author (or Coordinator/Admin) can edit/delete; other co-professors view read-only.
 * - Section-specific item: only staff assigned to those section(s) can edit/delete.
 */
export function canStaffMutateItem(perms, targetSections, authorId = null, currentUserId = null) {
  if (!perms) return false;
  if (perms.is_admin || isUnrestrictedSections(perms.assigned_sections)) {
    return true;
  }
  const targets = parseSectionsList(targetSections, ['ALL']);
  if (targets.includes('ALL')) {
    return Boolean(authorId && currentUserId && Number(authorId) === Number(currentUserId));
  }
  return targets.every((sec) => canStaffAccessSection(perms, sec));
}

export function canStaffModerateComments(perms, targetSections) {
  if (!perms) return false;
  if (perms.is_admin || isUnrestrictedSections(perms.assigned_sections)) {
    return true;
  }
  if (!perms.can_announce && !perms.can_manage_course) {
    return false;
  }
  const targets = parseSectionsList(targetSections, ['ALL']);
  if (targets.includes('ALL')) {
    return true;
  }
  return targets.every((sec) => canStaffAccessSection(perms, sec));
}

/**
 * Checks whether staff can grade an assignment (optionally for a specific student's section).
 * - If assignment is shared to ['ALL']: ANY course professor or grading-enabled TA can grade it.
 * - If assignment is section-specific: ONLY staff assigned to those sections (and the student's section) can grade it.
 */
export function canStaffGradeTarget(perms, assignmentTargetSections, studentSection = null) {
  if (!perms?.can_grade) return false;
  if (perms.is_admin || isUnrestrictedSections(perms.assigned_sections)) {
    return true;
  }
  const targets = parseSectionsList(assignmentTargetSections, ['ALL']);
  if (targets.includes('ALL')) {
    return true;
  }
  const targetAllowed = targets.every((sec) => canStaffAccessSection(perms, sec));
  if (!targetAllowed) return false;
  if (studentSection !== null && studentSection !== undefined && String(studentSection).trim() !== '') {
    return canStaffAccessSection(perms, studentSection);
  }
  return true;
}

export function canStudentViewTargets(studentSection, targetSections) {
  const targets = parseSectionsList(targetSections, ['ALL']);
  if (targets.includes('ALL')) return true;
  const normalizedStudent = normalizeSectionName(studentSection || 'Sec A').toLowerCase();
  return targets.some((t) => normalizeSectionName(t).toLowerCase() === normalizedStudent);
}

/**
 * Computes the unique ordered list of sections configured or populated for a course offering.
 */
export function deriveOfferingSections(offeringRow, enrollmentRows = [], instructorRows = []) {
  const seen = new Set();
  const out = [];

  const pushAll = (vals) => {
    for (const v of vals) {
      const norm = normalizeSectionName(v);
      if (norm === 'ALL' || !norm) continue;
      const key = norm.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(norm);
      }
    }
  };

  if (offeringRow?.sections) {
    pushAll(parseSectionsList(offeringRow.sections, []));
  }
  if (offeringRow?.section) {
    pushAll(parseSectionsList(offeringRow.section, []));
  }
  for (const enr of enrollmentRows || []) {
    if (enr?.section) {
      pushAll([enr.section]);
    }
  }
  for (const inst of instructorRows || []) {
    if (inst?.assigned_sections) {
      pushAll(parseSectionsList(inst.assigned_sections, []));
    }
  }

  return out.length > 0 ? out : ['Sec A'];
}
