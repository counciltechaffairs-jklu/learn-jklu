import jwt from 'jsonwebtoken';
import { getDb } from '../config/db.js';
import { JWT_SECRET } from '../config/env.js';

export const USER_SAFE_COLS = `id, email, name, is_admin, admin_role, age, year, batch_year, university, department, roll_no, student_id, photo_path, id_card_path, id_verified, verified_by, verified_at, email_verified, is_active, token_version, admin_feedback, created_at`;
export const USER_AUTH_COLS = `${USER_SAFE_COLS}, password_hash`;
export const USER_COLS = USER_SAFE_COLS;

export function getNormalizedRole(user) {
  if (!user) return null;
  if (user.is_admin || user.admin_role === 'full_admin') return 'full_admin';
  return user.admin_role ? String(user.admin_role).toLowerCase() : null;
}

export function isFullAdminUser(user) {
  return getNormalizedRole(user) === 'full_admin';
}

export function canVerifyStudentIds(user) {
  const role = getNormalizedRole(user);
  return role === 'full_admin' || role === 'sub_admin';
}

export function canManagePapers(user) {
  const role = getNormalizedRole(user);
  return role === 'full_admin' || role === 'sub_admin' || role === 'paper_admin';
}

export function canManageContests(user) {
  const role = getNormalizedRole(user);
  return role === 'full_admin' || role === 'sub_admin' || role === 'coding_ta';
}

export function canAccessAdminPanel(user) {
  const role = getNormalizedRole(user);
  return role === 'full_admin' || role === 'sub_admin' || role === 'paper_admin' || role === 'coding_ta';
}

export function signUserToken(user) {
  return jwt.sign(
    {
      id: Number(user.id),
      sub: user.email,
      is_admin: Boolean(user.is_admin),
      admin_role: user.admin_role || null,
      tv: Number(user.token_version || 1),
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h' }
  );
}

export function formatUserResponse(u, taOfferingIds = []) {
  const adminRole = u.admin_role || (u.is_admin ? 'full_admin' : null);
  const isProfessor = adminRole === 'professor';
  const normalizedTaIds = Array.isArray(taOfferingIds)
    ? taOfferingIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const isTa = Boolean(normalizedTaIds.length > 0 || adminRole === 'ta');
  const isSubAdmin = Boolean(adminRole && adminRole !== 'full_admin' && !isProfessor && adminRole !== 'ta');
  return {
    id: Number(u.id),
    email: u.email,
    name: u.name,
    is_admin: Boolean(u.is_admin),
    is_sub_admin: isSubAdmin,
    is_professor: isProfessor,
    is_ta: isTa,
    ta_offering_ids: normalizedTaIds,
    admin_role: adminRole,
    age: u.age ?? null,
    year: u.year ?? null,
    batch_year: u.batch_year ?? null,
    university: u.university ?? 'JK Lakshmipat University',
    department: u.department ?? null,
    roll_no: u.roll_no ?? null,
    student_id: u.student_id ?? null,
    photo_path: u.photo_path ?? null,
    id_card_path: u.id_card_path ?? null,
    id_verified: Boolean(u.id_verified),
    verified_by: u.verified_by ?? null,
    verified_at: u.verified_at ?? null,
    email_verified: u.email_verified !== false,
    is_active: u.is_active !== false,
    admin_feedback: u.admin_feedback ?? null,
    created_at: u.created_at,
  };
}

export async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const userId = Number(decoded?.id);
    if (!Number.isInteger(userId) || userId <= 0) return null;

    const db = await getDb();
    const res = await db.query(
      `SELECT ${USER_SAFE_COLS} FROM users WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`,
      [userId]
    );
    if (res.rowCount === 0) return null;
    const user = res.rows[0];

    const tokenVersion = Number(decoded.tv ?? 1);
    const currentVersion = Number(user.token_version ?? 1);
    if (tokenVersion !== currentVersion) return null;

    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ detail: 'Invalid or expired authentication token' });
    return;
  }
  req.user = user;
  next();
}

export async function requireAdminPanelStaff(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!canAccessAdminPanel(user)) {
    res.status(403).json({ detail: 'Admin panel staff privileges required' });
    return;
  }
  req.user = user;
  next();
}

export async function requirePaperAdmin(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!canManagePapers(user)) {
    res.status(403).json({ detail: 'Paper administration privileges required' });
    return;
  }
  req.user = user;
  next();
}

export async function requireVerificationAdmin(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!canVerifyStudentIds(user)) {
    res.status(403).json({ detail: 'Student ID verification privileges required' });
    return;
  }
  req.user = user;
  next();
}

export async function requireContestStaff(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!canManageContests(user)) {
    res.status(403).json({ detail: 'Contest administration privileges required' });
    return;
  }
  req.user = user;
  next();
}

export const requireAdminOrStaff = requireAdminPanelStaff;

export async function requireFullAdmin(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!isFullAdminUser(user)) {
    res.status(403).json({ detail: 'Full admin privileges required' });
    return;
  }
  req.user = user;
  next();
}

export async function requireProfessorOrAdmin(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!user || (!isFullAdminUser(user) && getNormalizedRole(user) !== 'professor')) {
    res.status(403).json({ detail: 'Professor or Admin privileges required' });
    return;
  }
  req.user = user;
  next();
}

export async function requireProfessorTAOrAdmin(req, res, next) {
  const user = await getAuthenticatedUser(req);
  const role = getNormalizedRole(user);
  if (!user || (!isFullAdminUser(user) && role !== 'professor' && role !== 'ta')) {
    res.status(403).json({ detail: 'Faculty, TA, or Admin privileges required' });
    return;
  }
  req.user = user;
  next();
}
