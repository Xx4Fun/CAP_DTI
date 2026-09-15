import type { VendorSession } from './types';

const KEY = 'price-watch-vendor-session';

// ponytail: bearer token in localStorage (online-only app); scoped vendor token, server expiry and revocation limit exposure. Move to an httpOnly cookie session if XSS risk grows.
export function loadSession(): VendorSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as VendorSession;
    if (!session.token || !session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: VendorSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private browsing can block storage; the session still works until the tab closes.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
