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

export function getAdminSecretPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const slug =
      localStorage.getItem('admin_secret_slug') ||
      sessionStorage.getItem('admin_secret_slug') ||
      '';
    return slug ? `/${slug.replace(/^\/+|\/+$/g, '')}` : null;
  } catch {
    return null;
  }
}

export function setStoredAdminSecretSlug(slug?: string | null) {
  if (typeof window === 'undefined' || !slug) return;
  const clean = String(slug).trim().replace(/^\/+|\/+$/g, '');
  if (!clean) return;
  try {
    sessionStorage.setItem('admin_secret_slug', clean);
    localStorage.setItem('admin_secret_slug', clean);
  } catch {}
}

/**
 * Resolves the post-login/post-register landing route:
 * honors safe `?next=` first, otherwise routes admins via the secret backend slug
 * (never blocked `/admin`), and sends students/TAs/professors to `/classroom`.
 */
export function getPostLoginDestination(
  user?: PostLoginUser | null,
  rawNext?: string | null
): string {
  const safeNext = sanitizeNextPath(rawNext);
  if (safeNext) return safeNext;

  if (
    user?.is_admin ||
    user?.is_sub_admin ||
    user?.admin_role === 'full_admin' ||
    user?.admin_role === 'coding_ta' ||
    user?.admin_role === 'paper_admin' ||
    user?.admin_role === 'sub_admin'
  ) {
    return getAdminSecretPath() || '/home';
  }
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
