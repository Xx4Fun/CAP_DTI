import type { VendorSession } from './types';
import { get, put, remove } from '../offline/repository';
import { forgetSession, registerSession } from '../offline/workspace';

const KEY = 'price-watch-vendor-session';

export async function loadSession(): Promise<VendorSession | null> {
    let session = await get<VendorSession>('device', 'meta', 'session');
    if (!session) {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      session = JSON.parse(raw) as VendorSession;
      if (!session.token || !session.user?.id) throw new Error('The saved session could not be restored. Sign in again.');
      // The old copy survives quota, encryption, or transaction failure.
      await put('device', 'meta', 'session', session);
      localStorage.removeItem(KEY);
    }
    if (!session.token || !session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) {
      await remove('device', 'meta', 'session');
      return null;
    }
    registerSession(session);
    return session;
}

export async function saveSession(session: VendorSession): Promise<void> {
  await put('device', 'meta', 'session', session);
  localStorage.removeItem(KEY);
  registerSession(session);
}

export async function clearSession(token?: string): Promise<void> {
  localStorage.removeItem(KEY);
  const current = await get<VendorSession>('device', 'meta', 'session');
  if (!token || !current || current.token === token) await remove('device', 'meta', 'session');
  if (token) forgetSession(token);
}
