const REDIRECT_STORAGE_KEY = 'vault_login_redirect';
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

/**
 * Returns true if path is a safe internal relative route and not an auth page.
 */
export function isSafeInternalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return false;
  }
  const pathname = path.split('?')[0].split('#')[0];
  return !AUTH_PATHS.some((authPath) => pathname === authPath || pathname.startsWith(`${authPath}/`));
}

/**
 * Formats a React Router location object or string into a path string.
 */
export function formatLocationPath(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  const pathname = loc.pathname || '';
  const search = loc.search || '';
  const hash = loc.hash || '';
  return `${pathname}${search}${hash}`;
}

/**
 * Persists a safe post-login redirect target in sessionStorage.
 */
export function saveLoginRedirect(target) {
  const path = formatLocationPath(target);
  if (!isSafeInternalPath(path)) return '';
  try {
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, path);
  } catch {
    // Ignore storage quota/privacy mode errors
  }
  return path;
}

/**
 * Resolves and clears the saved post-login redirect target from query, state, or sessionStorage.
 */
export function consumeLoginRedirect(location) {
  let candidate = '';
  const params = new URLSearchParams(location?.search || '');
  const queryRedirect = params.get('redirect');

  if (isSafeInternalPath(queryRedirect)) {
    candidate = queryRedirect;
  } else if (location?.state?.from) {
    const statePath = formatLocationPath(location.state.from);
    if (isSafeInternalPath(statePath)) {
      candidate = statePath;
    }
  }

  if (!candidate) {
    try {
      const stored = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
      if (isSafeInternalPath(stored)) {
        candidate = stored;
      }
    } catch {
      // Ignore storage errors
    }
  }

  try {
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }

  return candidate;
}

/**
 * Navigates to /login while preserving the user's current route so login returns them there.
 */
export function navigateToLogin(navigate, fromLocation) {
  const target =
    fromLocation ||
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '');
  const saved = saveLoginRedirect(target);
  navigate('/login', saved ? { state: { from: saved } } : undefined);
}
