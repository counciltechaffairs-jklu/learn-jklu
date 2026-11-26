import fs from 'node:fs';
import path from 'node:path';
import {
  getDb,
  syncPastPaperFolder,
  syncAuraRepository,
  getLocalPastpaperCatalog,
} from '../config/db.js';
import { getOrSetCache, invalidateCachePrefix } from '../config/cache.js';
import { STORAGE_PAPERS_DIR, parsePositiveInt } from '../config/env.js';
import { hashPasswordNonBlocking } from '../config/cryptoPool.js';
import {
  formatUserResponse,
  requireAdminPanelStaff,
  requirePaperAdmin,
  requireVerificationAdmin,
  requireFullAdmin,
  USER_COLS,
} from '../middleware/auth.js';
import { clearResolvedPathCache } from '../utils/pdfStorage.js';
import { PAPER_SELECT_SQL, formatPaperResponse } from '../utils/paperHelpers.js';
import { getMaintenanceStatus, setMaintenanceStatus } from '../utils/maintenance.js';
import { createAsyncRouter } from '../utils/routerHelper.js';
import { writeAuditLog } from '../utils/security.js';

const router = createAsyncRouter();

const ALLOWED_ADMIN_ROLES = new Set([
  'full_admin',
  'sub_admin',
  'paper_admin',
  'coding_ta',
  'professor',
]);

router.get('/dashboard', requireAdminPanelStaff, async (_req, res) => {
  const stats = await getOrSetCache('admin:dashboard', 30 * 1000, async () => {
    const db = await getDb();
    const [papersAgg, coursesCount, usersCount, recentPapers] = await Promise.all([
      db.query(
        'SELECT UPPER(status) as status, COUNT(*)::text as count FROM papers GROUP BY UPPER(status)'
      ),
      db.query('SELECT COUNT(*)::text as count FROM courses'),
      db.query('SELECT COUNT(*)::text as count FROM users WHERE is_admin = FALSE'),
      db.query(`${PAPER_SELECT_SQL} ORDER BY p.uploaded_at DESC LIMIT 12`),
    ]);

    let approved = 0;
    let pending = 0;
    let rejected = 0;
    for (const row of papersAgg.rows) {
      if (row.status === 'APPROVED') approved = Number(row.count);
      else if (row.status === 'PENDING') pending = Number(row.count);
      else if (row.status === 'REJECTED') rejected = Number(row.count);
    }

    const localCat = getLocalPastpaperCatalog();
    const finalApproved = approved > 0 ? approved : localCat.stats.totalPapers || 1950;
    const finalCourses =
      Number(coursesCount.rows[0]?.count || 0) > 0
        ? Number(coursesCount.rows[0]?.count || 0)
        : localCat.stats.totalCourses || 748;
    const finalRecents =
      recentPapers.rowCount > 0
        ? recentPapers.rows.map((r) => formatPaperResponse(r, true))
        : localCat.papers.slice(0, 12).map((r) => formatPaperResponse(r, false));

    return {
      total_papers: finalApproved + pending + rejected,
      pending_papers: pending,
      approved_papers: finalApproved,
      rejected_papers: rejected,
      total_courses: finalCourses,
      total_users: Number(usersCount.rows[0]?.count || 0),
      recent_uploads: finalRecents,
    };
  });
  res.json(stats);
});

router.post('/papers/approve-all', requirePaperAdmin, async (req, res) => {
  const db = await getDb();
  const result = await db.query(
    `UPDATE papers SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW() WHERE UPPER(status) = 'PENDING'`,
    [req.user.id]
  );
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'APPROVE_ALL_PENDING_PAPERS',
    entityType: 'PAPER',
    metadata: { approved_count: result.rowCount },
  });
  invalidateCachePrefix('papers:');
  invalidateCachePrefix('courses:');
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('metrics:');
  res.json({
    message: `Approved ${result.rowCount} pending papers`,
    approved_count: result.rowCount,
  });
});

router.post('/papers/sync-folder', requireFullAdmin, async (req, res) => {
  try {
    const purgeExisting = Boolean(req.body.purge_existing);
    if (purgeExisting) clearResolvedPathCache();
    const result = await syncPastPaperFolder({ purgeExisting });
    invalidateCachePrefix();
    res.json({
      message: `Synced ${result.imported} PDFs from /pastpaper folder`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message || 'Folder sync failed' });
  }
});

router.post('/papers/sync-aura', requireFullAdmin, async (req, res) => {
  try {
    const purgeExisting = req.body.purge_existing !== false;
    if (purgeExisting) clearResolvedPathCache();
    const result = await syncAuraRepository({ purgeExisting });
    invalidateCachePrefix();
    res.json({
      message: `Synced ${result.imported} official JKLU question papers across ${result.courses} courses from AURA repository`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message || 'AURA repository sync failed' });
  }
});

router.post('/papers/purge-old', requireFullAdmin, async (req, res) => {
  const db = await getDb();
  await db.exec('DELETE FROM papers');
  try {
    const files = await fs.promises.readdir(STORAGE_PAPERS_DIR);
    for (const f of files) {
      await fs.promises.unlink(path.join(STORAGE_PAPERS_DIR, f)).catch(() => {});
    }
  } catch {}
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'PURGE_ALL_PAPERS',
    entityType: 'PAPER',
  });
  clearResolvedPathCache();
  invalidateCachePrefix();
  res.json({ message: 'All old papers purged. Ready for new PDFs!' });
});

router.get('/diagnose/files', requirePaperAdmin, async (_req, res) => {
  const db = await getDb();
  let papersRes;
  try {
    papersRes = await db.query(
      'SELECT id, title, file_path, file_name, (file_blob IS NOT NULL) AS has_db_blob FROM papers ORDER BY id ASC'
    );
  } catch {
    papersRes = await db.query(
      'SELECT id, title, file_path, file_name, FALSE AS has_db_blob FROM papers ORDER BY id ASC'
    );
  }
  let diskFiles = [];
  try {
    diskFiles = await fs.promises.readdir(STORAGE_PAPERS_DIR);
  } catch {}
  const diskSet = new Set(diskFiles.map((f) => f.toLowerCase()));

  let missingCount = 0;
  let dbBlobCount = 0;
  const papers = papersRes.rows.map((p) => {
    const storedPath = p.file_path || p.file_name || '';
    const extractedFilename = path.basename(storedPath);
    const hasDbBlob = Boolean(p.has_db_blob);
    if (hasDbBlob) dbBlobCount++;
    const onDisk =
      diskSet.has(extractedFilename.toLowerCase()) ||
      diskFiles.some((f) => f.toLowerCase().endsWith(extractedFilename.toLowerCase()));
    const isRemote = /^https?:\/\//i.test(storedPath);
    const exists = hasDbBlob || onDisk || isRemote;
    if (!exists) missingCount++;
    return {
      paper_id: Number(p.id),
      paper_title: p.title,
      stored_path: storedPath,
      extracted_filename: extractedFilename,
      file_exists: exists,
      storage_type: hasDbBlob ? 'postgresql_blob' : onDisk ? 'local_disk' : isRemote ? 'remote_url' : 'missing',
    };
  });

  res.json({
    total_papers: papers.length,
    files_on_disk_count: diskFiles.length + dbBlobCount,
    papers_with_existing_files: papers.length - missingCount,
    papers_with_missing_files: missingCount,
    uploads_directory: dbBlobCount > 0 ? 'PostgreSQL BYTEA + /tmp cache' : STORAGE_PAPERS_DIR,
    papers,
  });
});

router.get('/verification-requests', requireVerificationAdmin, async (_req, res) => {
  const db = await getDb();
  const result = await db.query(
    `SELECT ${USER_COLS} FROM users WHERE is_admin = FALSE AND id_card_path IS NOT NULL AND COALESCE(id_verified, FALSE) = FALSE AND verified_at IS NULL ORDER BY created_at DESC`
  );
  res.json(result.rows.map((r) => formatUserResponse(r)));
});

router.post('/verify-user/:user_id', requireVerificationAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.user_id);
  if (!userId) {
    res.status(400).json({ detail: 'Invalid user ID' });
    return;
  }
  const approve = Boolean(req.body.approve);
  const feedback = req.body.admin_feedback ? JSON.stringify(req.body.admin_feedback) : null;
  const admin = req.user;

  const db = await getDb();
  const updated = await db.query(
    `UPDATE users
     SET id_verified = $1,
         verified_by = $2,
         verified_at = NOW(),
         admin_feedback = COALESCE($3::jsonb, admin_feedback),
         updated_at = NOW()
     WHERE id = $4
     RETURNING ${USER_COLS}`,
    [approve, admin.id, feedback, userId]
  );
  if (updated.rowCount === 0) {
    res.status(404).json({ detail: 'User not found' });
    return;
  }
  await writeAuditLog(db, {
    actorId: admin.id,
    action: approve ? 'VERIFY_USER_APPROVED' : 'VERIFY_USER_REJECTED',
    entityType: 'USER',
    entityId: userId,
    metadata: { approve },
  });
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('auth:');
  res.json(formatUserResponse(updated.rows[0]));
});

router.get('/users', requireFullAdmin, async (req, res) => {
  const db = await getDb();
  const page = parsePositiveInt(req.query.page) || 1;
  const limit = Math.min(500, parsePositiveInt(req.query.limit) || 200);
  const offset = (page - 1) * limit;
  const q = String(req.query.q || '').trim();

  const whereClause = q ? `WHERE name ILIKE $1 OR email ILIKE $1 OR COALESCE(roll_no, '') ILIKE $1` : '';
  const queryParams = q ? [`%${q}%`, limit, offset] : [limit, offset];
  const countParams = q ? [`%${q}%`] : [];

  const [countRes, result] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM users ${whereClause}`, countParams),
    db.query(
      `SELECT ${USER_COLS} FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}`,
      queryParams
    ),
  ]);

  const total = Number(countRes.rows[0]?.total || 0);
  res.setHeader('X-Total-Count', String(total));
  res.setHeader('X-Page', String(page));
  res.setHeader('X-Limit', String(limit));
  res.json(result.rows.map((r) => formatUserResponse(r)));
});

router.post('/create-sub-admin', requireFullAdmin, async (req, res) => {
  const email = String(req.body.email || '')
    .toLowerCase()
    .trim();
  const name = String(req.body.name || 'Sub Admin').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.admin_role || 'coding_ta').toLowerCase().trim();
  if (!email || password.length < 6) {
    res.status(400).json({ detail: 'Valid email and password (min 6 chars) are required' });
    return;
  }
  if (!ALLOWED_ADMIN_ROLES.has(role)) {
    res.status(400).json({ detail: 'Invalid admin_role specified' });
    return;
  }

  const db = await getDb();
  const hash = await hashPasswordNonBlocking(password, 10);
  const isFullAdminFlag = role === 'full_admin';
  const inserted = await db.query(
    `INSERT INTO users (email, name, password_hash, is_admin, admin_role, id_verified, email_verified)
     VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
     ON CONFLICT (email) DO UPDATE SET
       is_admin = EXCLUDED.is_admin,
       admin_role = EXCLUDED.admin_role,
       token_version = users.token_version + 1
     RETURNING ${USER_COLS}`,
    [email, name, hash, isFullAdminFlag, role]
  );
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'CREATE_SUB_ADMIN',
    entityType: 'USER',
    entityId: inserted.rows[0].id,
    metadata: { email, role },
  });
  invalidateCachePrefix('auth:');
  invalidateCachePrefix('admin:');
  res.json(formatUserResponse(inserted.rows[0]));
});

router.put('/users/:user_id', requireFullAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.user_id);
  if (!userId) {
    res.status(400).json({ detail: 'Invalid user ID' });
    return;
  }
  const hasAdminRoleKey = Object.prototype.hasOwnProperty.call(req.body, 'admin_role');
  const rawRole = hasAdminRoleKey ? req.body.admin_role : undefined;
  let normalizedRole = null;
  if (hasAdminRoleKey && rawRole !== null && rawRole !== '') {
    const candidate = String(rawRole).toLowerCase().trim();
    if (!ALLOWED_ADMIN_ROLES.has(candidate)) {
      res.status(400).json({ detail: 'Invalid admin_role specified' });
      return;
    }
    normalizedRole = candidate;
  }

  const { name, email, is_admin, id_verified, is_active } = req.body;
  const db = await getDb();
  const existingRes = await db.query(
    'SELECT id, is_admin, admin_role, is_active FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  if (existingRes.rowCount === 0) {
    res.status(404).json({ detail: 'User not found' });
    return;
  }
  const existing = existingRes.rows[0];

  let nextIsAdmin = is_admin !== undefined ? Boolean(is_admin) : Boolean(existing.is_admin);
  let nextRole = hasAdminRoleKey ? normalizedRole : existing.admin_role;

  if (hasAdminRoleKey && (normalizedRole === null || normalizedRole === 'professor') && is_admin === undefined) {
    nextIsAdmin = false;
  }
  if (is_admin === false && !hasAdminRoleKey && nextRole !== 'professor') {
    nextRole = null;
  }
  if (hasAdminRoleKey && normalizedRole === 'full_admin') {
    nextIsAdmin = true;
  }
  if (is_admin === true && !hasAdminRoleKey && (!nextRole || nextRole === 'professor')) {
    nextRole = 'full_admin';
  }

  const nextIsActive = is_active !== undefined ? Boolean(is_active) : existing.is_active !== false;
  if (userId === Number(req.user.id) && (!nextIsActive || (!nextIsAdmin && nextRole !== 'full_admin'))) {
    res.status(400).json({ detail: 'You cannot demote or deactivate your own admin account' });
    return;
  }

  const shouldRevokeSessions =
    is_admin !== undefined || hasAdminRoleKey || is_active === false;

  const updated = await db.query(
    `UPDATE users
     SET name = COALESCE($1, name),
         email = COALESCE($2, email),
         is_admin = $3,
         admin_role = $4,
         id_verified = COALESCE($5, id_verified),
         is_active = COALESCE($6, is_active),
         token_version = CASE WHEN $7 THEN token_version + 1 ELSE token_version END,
         updated_at = NOW()
     WHERE id = $8
     RETURNING ${USER_COLS}`,
    [
      name !== undefined ? String(name).trim() : null,
      email !== undefined ? String(email).toLowerCase().trim() : null,
      nextIsAdmin,
      nextRole,
      id_verified !== undefined ? Boolean(id_verified) : null,
      is_active !== undefined ? Boolean(is_active) : null,
      shouldRevokeSessions,
      userId,
    ]
  );
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'UPDATE_USER',
    entityType: 'USER',
    entityId: userId,
    metadata: {
      is_admin: updated.rows[0].is_admin,
      admin_role: updated.rows[0].admin_role,
      is_active: updated.rows[0].is_active,
    },
  });
  invalidateCachePrefix('auth:');
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('faculty:');
  invalidateCachePrefix('metrics:');
  res.json(formatUserResponse(updated.rows[0]));
});

router.put('/users/:user_id/reset-password', requireFullAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.user_id);
  if (!userId) {
    res.status(400).json({ detail: 'Invalid user ID' });
    return;
  }
  const newPassword = String(req.body?.new_password || '');
  if (newPassword.length < 8) {
    res.status(400).json({ detail: 'New password must be at least 8 characters' });
    return;
  }
  const db = await getDb();
  const hash = await hashPasswordNonBlocking(newPassword, 10);
  const updated = await db.query(
    `UPDATE users
     SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, name`,
    [hash, userId]
  );
  if (updated.rowCount === 0) {
    res.status(404).json({ detail: 'User not found' });
    return;
  }
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'ADMIN_RESET_PASSWORD',
    entityType: 'USER',
    entityId: userId,
    metadata: { email: updated.rows[0].email },
  });
  invalidateCachePrefix('auth:');
  invalidateCachePrefix('admin:');
  res.json({ message: `Password reset for ${updated.rows[0].email}` });
});

router.get('/audit-logs', requireAdminPanelStaff, async (req, res) => {
  const db = await getDb();
  const page = parsePositiveInt(req.query.page) || 1;
  const limit = Math.min(100, parsePositiveInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;
  const action = String(req.query.action || '').trim().toUpperCase();

  const whereClause = action ? 'WHERE UPPER(al.action) = $1' : '';
  const countParams = action ? [action] : [];
  const queryParams = action ? [action, limit, offset] : [limit, offset];

  const [countRes, rowsRes] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`, countParams),
    db.query(
      `SELECT al.id, al.actor_id, u.name AS actor_name, u.email AS actor_email,
              al.action, al.entity_type, al.entity_id, al.metadata, al.created_at
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${action ? 2 : 1} OFFSET $${action ? 3 : 2}`,
      queryParams
    ),
  ]);

  const total = Number(countRes.rows[0]?.total || 0);
  res.setHeader('X-Total-Count', String(total));
  res.json({
    items: rowsRes.rows,
    total,
    page,
    limit,
  });
});

router.delete('/users/:user_id', requireFullAdmin, async (req, res) => {
  const userId = parsePositiveInt(req.params.user_id);
  if (!userId) {
    res.status(400).json({ detail: 'Invalid user ID' });
    return;
  }
  if (userId === Number(req.user.id)) {
    res.status(400).json({ detail: 'You cannot delete your own admin account' });
    return;
  }
  const db = await getDb();
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: 'DELETE_USER',
    entityType: 'USER',
    entityId: userId,
  });
  invalidateCachePrefix('auth:');
  invalidateCachePrefix('admin:');
  invalidateCachePrefix('faculty:');
  invalidateCachePrefix('metrics:');
  res.json({ message: 'User deleted' });
});

router.get('/maintenance', requireFullAdmin, async (_req, res) => {
  const status = await getMaintenanceStatus();
  res.json(status);
});

router.post('/maintenance', requireFullAdmin, async (req, res) => {
  const enabled = Boolean(req.body?.enabled);
  const message = typeof req.body?.message === 'string' ? req.body.message : undefined;
  const status = await setMaintenanceStatus({
    enabled,
    message,
    updatedBy: req.user?.email || req.user?.id,
  });
  const db = await getDb();
  await writeAuditLog(db, {
    actorId: req.user.id,
    action: enabled ? 'MAINTENANCE_ENABLED' : 'MAINTENANCE_DISABLED',
    entityType: 'SYSTEM',
    metadata: { message: status.message },
  });
  res.json(status);
});

export default router;
