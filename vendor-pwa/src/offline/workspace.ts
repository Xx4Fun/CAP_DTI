import type { ResponseDraft, VendorSession } from '../app/types';
import { isSessionInvalid, vendorApi } from '../services/vendorApi';
import { beginRefresh, flushWrites, get, list, put, storageFailure, withAccountLock } from './repository';

export type Snapshot<T> = { data: T; downloadedAt: string };
export type DeliveryState = 'pending' | 'sending' | 'received' | 'attention';
export type Submission = {
  uuid: string; operation: 'message' | 'response'; target: number; storeId: number;
  payload: ResponseDraft | { body?: string; attachment?: File };
  state: DeliveryState; createdAt: string; attempts: number; retryAt: number; reason?: string;
  sequence?: number;
};
const accounts = new Map<string, VendorSession>();
const paused = new Set<string>();
export function invalidateResource(token: string, key: string): Promise<string> {
  return beginRefresh(accountFor(token), key);
}
export function registerSession(session: VendorSession): void { accounts.set(session.token, session); paused.delete(session.token); }
export function forgetSession(token: string): void { accounts.delete(token); paused.delete(token); }
export function accountFor(token: string): number {
  const session = accounts.get(token);
  if (!session) throw new Error('Sign in again to access saved information.');
  return session.user.id;
}
export function assertOnline(): void { if (!navigator.onLine) throw new Error('This change requires a connection.'); }
export async function snapshot<T>(token: string, key: string): Promise<Snapshot<T> | undefined> {
  return get(accountFor(token), 'snapshots', key);
}
export async function cache<T>(token: string, key: string, data: T): Promise<void> {
  if (data !== undefined) await put(accountFor(token), 'snapshots', key, { data, downloadedAt: new Date().toISOString() });
}
export function connectivity(token: string, state: 'reachable' | 'unavailable' | 'authorization'): void {
  window.dispatchEvent(new CustomEvent('vendor-connectivity', { detail: { token, state } }));
}
export async function resource<T>(token: string, key: string, fetch: () => Promise<T>, merge?: (incoming: T, saved?: T) => T): Promise<T> {
  const account = accountFor(token);
  const nonce = navigator.onLine ? await invalidateResource(token, key) : undefined;
  const saved = await snapshot<T>(token, key).catch(() => undefined);
  if (!navigator.onLine) {
    if (saved) return saved.data;
    throw new Error('This information has not been saved. Connect to download it.');
  }
  try {
    let data: T = await fetch();
    connectivity(token, 'reachable');
    // A network read still renders when quota prevents caching; the save failure remains visible.
    await withAccountLock(account, async () => {
      if (!accounts.has(token)) return;
      const current = await snapshot<T>(token, key).catch(() => undefined);
      if (merge) data = merge(data, current?.data);
      await put(account, 'snapshots', key, { data, downloadedAt: new Date().toISOString() }, !key.startsWith('conversation/') && nonce ? { refresh: { key, nonce } } : {});
    }, `snapshot/${key}`, true).catch(storageFailure);
    return data;
  } catch (error) {
    if (isSessionInvalid(error)) { connectivity(token, 'authorization'); throw error; }
    const status = (error as { response?: { status: number } }).response?.status;
    if (status && status < 500 && status !== 408 && status !== 429) throw error;
    connectivity(token, 'unavailable');
    if (saved) return saved.data;
    throw error;
  }
}

export function retryDelay(error: unknown, attempts: number, now = Date.now()): number | null {
  const response = (error as { response?: { status: number; headers?: Record<string, string> } }).response;
  if (response && ![408, 429].includes(response.status) && response.status < 500) return null;
  const header = response?.headers?.['retry-after'];
  const requested = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now) : 0;
  return Math.max(Math.min(30_000 * 2 ** Math.min(attempts - 1, 5), 900_000), Number.isFinite(requested) ? requested : 0);
}
export async function enqueue(token: string, operation: Submission['operation'], target: number, storeId: number, payload: Submission['payload'], draftRevision?: string): Promise<Submission> {
  const account = accountFor(token);
  await flushWrites();
  const submission: Submission = { uuid: draftRevision ?? crypto.randomUUID(), operation, target, storeId, payload, state: 'pending', createdAt: new Date().toISOString(), attempts: 0, retryAt: 0 };
  // Attachments and immutable content commit together before any HTTP request.
  await put(account, 'outbox', submission.uuid, submission, { immutable: true, consumeDraft: { key: `${operation}/${target}`, version: draftRevision } });
  return (await get<Submission>(account, 'outbox', submission.uuid))!;
}
const activeDeliveries = new Set<Promise<void>>();
export function synchronize(token: string): Promise<void> {
  const work = runSynchronization(token);
  activeDeliveries.add(work);
  void work.then(() => activeDeliveries.delete(work), () => activeDeliveries.delete(work));
  return work;
}
export async function waitForDeliveryIdle(): Promise<void> { await Promise.allSettled(activeDeliveries); }
async function runSynchronization(token: string): Promise<void> {
  const session = accounts.get(token);
  if (!session || paused.has(token)) return;
  if (Date.parse(session.expires_at) <= Date.now()) { connectivity(token, 'authorization'); return; }
  const current = await get<VendorSession>('device', 'meta', 'session');
  if (!current || current.token !== token) { paused.add(token); connectivity(token, 'authorization'); return; }
  if (!navigator.onLine) return;
  await withAccountLock(session.user.id, async () => {
    const pending = (await list<Submission>(session.user.id, 'outbox')).map(({ value }) => value).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.createdAt.localeCompare(b.createdAt));
    const blockedStores = new Set<number>();
    for (const original of pending) {
      if (!accounts.has(token)) return;
      const active = await get<VendorSession>('device', 'meta', 'session');
      if (active?.token !== token || Date.parse(session.expires_at) <= Date.now()) { connectivity(token, 'authorization'); return; }
      if (original.state === 'received' || original.state === 'attention') continue;
      if (original.operation === 'message' && blockedStores.has(original.storeId)) continue;
      if (original.retryAt > Date.now()) { if (original.operation === 'message') blockedStores.add(original.storeId); continue; }
      // A prior sending state can mean a crash after server commit; keep its UUID.
      const entry = { ...original, state: 'sending' as DeliveryState, attempts: original.attempts + 1 };
      await put(session.user.id, 'outbox', entry.uuid, entry);
      try {
        const result = entry.operation === 'message'
          ? await vendorApi.sendMessage(token, entry.target, entry.payload as { body?: string; attachment?: File }, entry.uuid)
          : await vendorApi.respond(token, entry.target, entry.payload as ResponseDraft, entry.uuid);
        // If local persistence fails after server acceptance, the next attempt replays the same receipt.
        await put(session.user.id, 'acknowledgements', entry.uuid, { result, acceptedAt: new Date().toISOString(), operation: entry.operation, target: entry.target });
        if (entry.operation === 'response') {
          if (accounts.has(token)) await invalidateResource(token, 'notices');
          await withAccountLock(session.user.id, async () => {
            const notices = await get<Snapshot<import('../app/types').LegalNotice[]>>(session.user.id, 'snapshots', 'notices');
            if (notices) await put(session.user.id, 'snapshots', 'notices', { ...notices, data: notices.data.map((notice) => notice.id === entry.target ? result : notice) });
          }, 'snapshot/notices', true);
        } else {
          await withAccountLock(session.user.id, async () => {
            const thread = await get<Snapshot<import('../app/types').Conversation>>(session.user.id, 'snapshots', `conversation/${entry.target}`);
            if (thread) {
              const message = result as import('../app/types').StoreMessage;
              await put(session.user.id, 'snapshots', `conversation/${entry.target}`, { ...thread, data: { ...thread.data, messages: [...thread.data.messages.filter((item) => item.id !== message.id), message].sort((a, b) => a.id - b.id) } });
            }
          }, `snapshot/conversation/${entry.target}`, true);
        }
        await put(session.user.id, 'outbox', entry.uuid, { ...entry, state: 'received', payload: {}, reason: undefined });
        window.dispatchEvent(new CustomEvent('vendor-delivered', { detail: { token, operation: entry.operation, target: entry.target, result } }));
        connectivity(token, 'reachable');
      } catch (error) {
        if (isSessionInvalid(error)) {
          await put(session.user.id, 'outbox', entry.uuid, { ...entry, state: 'pending', reason: 'Authorization required. Sign in to the same account.' });
          paused.add(token);
          connectivity(token, 'authorization'); return;
        }
        const delay = retryDelay(error, entry.attempts);
        const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response?.data;
        const reason = data?.errors ? Object.values(data.errors).flat().join(' ') : data?.message ?? (error instanceof Error ? error.message : 'Server unavailable.');
        await put(session.user.id, 'outbox', entry.uuid, { ...entry, state: delay === null ? 'attention' : 'pending', retryAt: Date.now() + (delay ?? 0), reason });
        if (delay !== null) { connectivity(token, 'unavailable'); if (entry.operation === 'message') blockedStores.add(entry.storeId); }
      }
    }
  });
}

export async function hasUnresolvedWork(account: number): Promise<boolean> {
  return (await list(account, 'drafts')).length > 0 || (await list<Submission>(account, 'outbox')).some(({ value }) => value.state !== 'received');
}
