/**
 * Shared security, URL validation, RFC-4180 CSV, and audit logging utilities.
 */

export function validateHttpsUrl(rawUrl, { required = false, label = 'URL' } = {}) {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) {
    if (required) {
      return { ok: false, value: null, error: `${label} is required and must be a valid https:// URL.` };
    }
    return { ok: true, value: null };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return {
        ok: false,
        value: null,
        error: `${label} must use https:// (got ${parsed.protocol}).`,
      };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return {
      ok: false,
      value: null,
      error: `${label} must be a valid https:// URL.`,
    };
  }
}

export function validateUrlLinkList(rawList, label = 'Links') {
  if (!Array.isArray(rawList)) {
    return { ok: true, value: [] };
  }
  const cleaned = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rawUrl = String(item.url || '').trim();
    if (!rawUrl) continue;
    const check = validateHttpsUrl(rawUrl, { required: true, label });
    if (!check.ok) {
      return { ok: false, value: [], error: check.error };
    }
    cleaned.push({
      ...item,
      label: String(item.label || 'Link').trim().slice(0, 200),
      url: check.value,
    });
  }
  return { ok: true, value: cleaned };
}

/**
 * Neutralizes CSV formula injection (=, +, -, @, \t, \r) and applies RFC-4180 quoting.
 */
export function csvCell(value) {
  let str = value === null || value === undefined ? '' : String(value);
  // Strip NUL bytes
  str = str.replace(/\0/g, '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function safeContentDispositionFilename(name, fallback = 'download.bin') {
  const cleaned = String(name || fallback)
    .replace(/[\r\n"\\/:*?<>|\0]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180)
    .trim();
  return cleaned || fallback;
}

/**
 * RFC-4180 compliant CSV parser (handles quoted fields, escaped quotes "", embedded commas/newlines).
 */
export function parseCsvRfc4180(text) {
  const input = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

export async function writeAuditLog(db, { actorId = null, action, entityType, entityId = null, metadata = null }) {
  try {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        actorId ? Number(actorId) : null,
        String(action || 'UNKNOWN'),
        String(entityType || 'SYSTEM'),
        entityId !== null && entityId !== undefined ? String(entityId) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    console.warn('[AuditLog] Failed to write audit log:', err?.message || err);
  }
}
