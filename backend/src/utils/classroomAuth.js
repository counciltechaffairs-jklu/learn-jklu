import {
  normalizeSectionName,
  parseSectionsList,
  isUnrestrictedSections,
  deriveOfferingSections,
} from './sectionScope.js';

export async function getStudentEnrollment(db, offeringId, user) {
  if (!user) return null;
  const res = await db.query(
    `SELECT * FROM course_enrollments
     WHERE offering_id = $1 AND (student_id = $2 OR LOWER(student_email) = LOWER($3))
     LIMIT 1`,
    [offeringId, user.id, user.email]
  );
  return res.rowCount > 0 ? res.rows[0] : null;
}

export async function isStudentEnrolled(db, offeringId, user) {
  const row = await getStudentEnrollment(db, offeringId, user);
  return Boolean(row);
}

export async function mergeOfferingSections(db, offeringId, extraSections = []) {
  const cleanExtra = (extraSections || [])
    .map((s) => normalizeSectionName(s))
    .filter((s) => s && s !== 'ALL');
  if (cleanExtra.length === 0) return null;

  const offRes = await db.query(
    'SELECT sections, section FROM course_offerings WHERE id = $1 LIMIT 1',
    [offeringId]
  );
  if (offRes.rowCount === 0) return null;
  const merged = deriveOfferingSections(
    offRes.rows[0],
    cleanExtra.map((s) => ({ section: s }))
  );
  await db.query(
    'UPDATE course_offerings SET sections = $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(merged), offeringId]
  );
  return merged;
}

export async function getCourseStaffPermissions(db, offeringId, user) {
  if (!user) {
    return {
      is_admin: false,
      is_instructor: false,
      is_ta: false,
      can_manage_course: false,
      can_manage_all_sections: false,
      can_announce: false,
      can_grade: false,
      assigned_sections: [],
    };
  }
  if (user.is_admin || user.admin_role === 'full_admin') {
    return {
      is_admin: true,
      is_instructor: true,
      is_ta: false,
      can_manage_course: true,
      can_manage_all_sections: true,
      can_announce: true,
      can_grade: true,
      assigned_sections: ['ALL'],
    };
  }
  const isVerifiedAccount = Boolean(user.email_verified && user.id_verified);
  const [instRes, taRes] = await Promise.all([
    db.query(
      'SELECT id, role_label, assigned_sections FROM course_instructors WHERE offering_id = $1 AND professor_id = $2 LIMIT 1',
      [offeringId, user.id]
    ),
    isVerifiedAccount
      ? db.query(
          'SELECT id, can_grade, can_announce, assigned_sections FROM course_tas WHERE offering_id = $1 AND (user_id = $2 OR LOWER(public_email) = LOWER($3)) LIMIT 1',
          [offeringId, user.id, user.email]
        )
      : db.query(
          'SELECT id, can_grade, can_announce, assigned_sections FROM course_tas WHERE offering_id = $1 AND user_id = $2 LIMIT 1',
          [offeringId, user.id]
        ),
  ]);
  if (instRes.rowCount > 0) {
    const instSections = parseSectionsList(instRes.rows[0].assigned_sections, ['ALL']);
    return {
      is_admin: false,
      is_instructor: true,
      is_ta: false,
      can_manage_course: true,
      can_manage_all_sections: isUnrestrictedSections(instSections),
      can_announce: true,
      can_grade: true,
      assigned_sections: instSections,
    };
  }
  if (taRes.rowCount > 0) {
    const ta = taRes.rows[0];
    const taSections = parseSectionsList(ta.assigned_sections, ['ALL']);
    return {
      is_admin: false,
      is_instructor: false,
      is_ta: true,
      can_manage_course: false,
      can_manage_all_sections: false,
      can_announce: Boolean(ta.can_announce),
      can_grade: Boolean(ta.can_grade),
      assigned_sections: taSections,
    };
  }
  return {
    is_admin: false,
    is_instructor: false,
    is_ta: false,
    can_manage_course: false,
    can_manage_all_sections: false,
    can_announce: false,
    can_grade: false,
    assigned_sections: [],
  };
}
