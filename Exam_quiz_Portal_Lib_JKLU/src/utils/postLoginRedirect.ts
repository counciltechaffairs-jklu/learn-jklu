const AUTH_PATHS = new Set(['/login', '/register', '/admin-login', '/forgot-password']);
const GENERIC_LANDING_PATHS = new Set(['/', '/home', ...AUTH_PATHS]);

export interface PostLoginUser {
  is_admin?: boolean;
  is_sub_admin?: boolean;
  admin_role?: string | null;
}

/**
 * Validates a return URL (`?next=`) to strictly allow internal relative paths
 * and block open redirects (`//evil.com`, `https://...`, backslash bypasses, or auth loops).
 */
export function sanitizeNextPath(rawNext?: string | null): string | null {
  if (!rawNext) return null;
  const trimmed = String(rawNext).trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('://') ||
    trimmed.includes('\\') ||
    /[\r\n]/.test(trimmed)
  ) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return null;
    if (AUTH_PATHS.has(parsed.pathname)) return null;
  } catch {
    return null;
  }

  return trimmed;
}

/**
 * Resolves the post-login/post-register landing route:
 * honors safe `?next=` first, otherwise routes admins cleanly and sends
 * students, dual-hat Student · TAs, and professors directly to `/classroom`.
 */
export function getPostLoginDestination(
  user?: PostLoginUser | null,
  rawNext?: string | null
): string {
  const safeNext = sanitizeNextPath(rawNext);
  if (safeNext) return safeNext;

  if (user?.is_admin || user?.admin_role === 'full_admin') return '/admin';
  if (user?.admin_role === 'coding_ta') return '/admin/coding-hour';
  if (user?.is_sub_admin) return '/admin/contests';
  return '/classroom';
}

/**
 * Builds a `/login` URL that remembers meaningful sub-pages (e.g. `/classroom/3`, `/faculty`)
 * so users return where they started after signing in.
 */
export function buildLoginUrl(currentPathname?: string, currentSearch?: string): string {
  if (!currentPathname || GENERIC_LANDING_PATHS.has(currentPathname)) {
    return '/login';
  }
  const candidate = sanitizeNextPath(`${currentPathname}${currentSearch || ''}`);
  return candidate ? `/login?next=${encodeURIComponent(candidate)}` : '/login';
}
