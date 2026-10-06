// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, list, put } from './repository';
import { cache, enqueue, registerSession, resource, retryDelay, synchronize, type Submission } from './workspace';
import { vendorApi } from '../services/vendorApi';
import { clearSession, loadSession } from '../app/session';

vi.mock('../services/vendorApi', async (original) => ({ ...await original<typeof import('../services/vendorApi')>(), vendorApi: { sendMessage: vi.fn(), respond: vi.fn() } }));
const session = { token: 'queue-token', expires_at: new Date(Date.now() + 3600_000).toISOString(), user: { id: 5, name: 'Vendor', email: 'vendor@test.local' } };
const message = { id: 12, sender_side: 'vendor' as const, sender_name: 'Vendor', vendor_user_id: 5, body: 'Hello', read_at: null, created_at: new Date().toISOString(), attachment: null };
beforeEach(async () => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  registerSession(session);
  await put('device', 'meta', 'session', session);
  vi.mocked(vendorApi.sendMessage).mockResolvedValue(message);
});

describe('durable submission delivery', () => {
  it('atomically consumes a submitted draft and reuses its UUID across two tabs', async () => {
    const revision = crypto.randomUUID();
    await put(5, 'drafts', 'message/1', { draft: 'Hello', __revision: revision }, { version: revision });
    const first = await enqueue(session.token, 'message', 1, 1, { body: 'Hello' }, revision);
    const replay = await enqueue(session.token, 'message', 1, 1, { body: 'Hello' }, revision);
    expect(first.uuid).toBe(revision);
    expect(replay.uuid).toBe(first.uuid);
    expect(await get(5, 'drafts', 'message/1')).toBeUndefined();
    expect(await list(5, 'outbox')).toHaveLength(1);
  });
  it('never consumes newer edits made in another tab', async () => {
    const older = crypto.randomUUID();
    const newer = crypto.randomUUID();
    await put(5, 'drafts', 'message/1', { draft: 'Newer draft', __revision: newer }, { version: newer });
    await enqueue(session.token, 'message', 1, 1, { body: 'Older draft' }, older);
    expect(await get(5, 'drafts', 'message/1')).toMatchObject({ draft: 'Newer draft' });
  });
  it('recovers a failed enqueue after quota becomes available without poisoning the flush guard', async () => {
    const revision = crypto.randomUUID();
    await put(5, 'drafts', 'message/1', { draft: 'Hello', __revision: revision }, { version: revision });
    const original = IDBObjectStore.prototype.put;
    const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
      if (this.name === 'outbox') throw new DOMException('No space', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(enqueue(session.token, 'message', 1, 1, { body: 'Hello' }, revision)).rejects.toThrow('No space');
    failure.mockRestore();
    await enqueue(session.token, 'message', 1, 1, { body: 'Hello' }, revision);
    expect(await list(5, 'outbox')).toHaveLength(1);
    expect(await get(5, 'drafts', 'message/1')).toBeUndefined();
  });
  it('queues offline without transmitting and acknowledges acceptance before releasing attachment bytes', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const file = new File(['exact message attachment'], 'receipt.pdf', { type: 'application/pdf' });
    const entry = await enqueue(session.token, 'message', 1, 1, { body: 'Hello', attachment: file });
    await synchronize(session.token);
    expect(vendorApi.sendMessage).not.toHaveBeenCalled();
    const saved = await get<Submission>(5, 'outbox', entry.uuid);
    expect(saved?.state).toBe('pending');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await synchronize(session.token);
    expect(vendorApi.sendMessage).toHaveBeenCalledWith(session.token, 1, { body: 'Hello', attachment: expect.any(File) }, entry.uuid);
    expect(await get(5, 'acknowledgements', entry.uuid)).toMatchObject({ result: { id: 12 } });
    expect(await get(5, 'outbox', entry.uuid)).toMatchObject({ state: 'received', payload: {} });
  });
  it('recovers interrupted sending with the original UUID and serializes concurrent tabs', async () => {
    const entry = await enqueue(session.token, 'message', 1, 1, { body: 'Hello' });
    await put(5, 'outbox', entry.uuid, { ...entry, state: 'sending' });
    await Promise.all([synchronize(session.token), synchronize(session.token)]);
    expect(vendorApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(vendorApi.sendMessage).mock.calls[0][3]).toBe(entry.uuid);
    await synchronize(session.token);
    expect(vendorApi.sendMessage).toHaveBeenCalledTimes(1);
  });
  it('recovers a lost acknowledgement using the same UUID and preserves per-store order during backoff', async () => {
    const first = await enqueue(session.token, 'message', 1, 1, { body: 'First' });
    const second = await enqueue(session.token, 'message', 1, 1, { body: 'Second' });
    vi.mocked(vendorApi.sendMessage).mockRejectedValueOnce(new Error('Acknowledgement lost'));
    await synchronize(session.token);
    expect(vendorApi.sendMessage).toHaveBeenCalledTimes(1);
    expect(await get(5, 'outbox', first.uuid)).toMatchObject({ state: 'pending', attempts: 1 });
    expect(await get(5, 'outbox', second.uuid)).toMatchObject({ state: 'pending', attempts: 0 });
    const pending = (await get<Submission>(5, 'outbox', first.uuid))!;
    await put(5, 'outbox', first.uuid, { ...pending, retryAt: 0 });
    await synchronize(session.token);
    expect(vi.mocked(vendorApi.sendMessage).mock.calls.map((call) => call[3])).toEqual([first.uuid, first.uuid, second.uuid]);
  });
  it('preserves permanent deadline/access/validation rejections without retrying', async () => {
    const entry = await enqueue(session.token, 'response', 11, 1, { reason_category: 'WHOLESALE_HIKE', response_text: 'The wholesaler raised the cost.', certified_under_oath: true, attachments: [] });
    vi.mocked(vendorApi.respond).mockRejectedValue({ response: { status: 403, data: { status: 'RESPONSE_PERIOD_EXPIRED', message: 'The response period has expired.' } } });
    await synchronize(session.token);
    await synchronize(session.token);
    expect(vendorApi.respond).toHaveBeenCalledTimes(1);
    expect(await get(5, 'outbox', entry.uuid)).toMatchObject({ state: 'attention', reason: 'The response period has expired.', payload: { certified_under_oath: true } });
  });
  it('retains local work on revoked authorization and resumes only under the same account', async () => {
    const entry = await enqueue(session.token, 'message', 1, 1, { body: 'Hello' });
    vi.mocked(vendorApi.sendMessage).mockRejectedValueOnce({ response: { status: 401 } });
    await synchronize(session.token);
    expect(await get(5, 'outbox', entry.uuid)).toMatchObject({ state: 'pending' });
    const different = { ...session, token: 'different-token', user: { ...session.user, id: 6 } };
    registerSession(different);
    await put('device', 'meta', 'session', different);
    await synchronize(different.token);
    expect(vendorApi.sendMessage).toHaveBeenCalledTimes(1);
    const reauthenticated = { ...session, token: 'renewed-token' };
    registerSession(reauthenticated);
    await put('device', 'meta', 'session', reauthenticated);
    await synchronize(reauthenticated.token);
    expect(vi.mocked(vendorApi.sendMessage).mock.calls[1][3]).toBe(entry.uuid);
  });
  it('does not send a prior account queue after another tab changes the saved session', async () => {
    await enqueue(session.token, 'message', 1, 1, { body: 'Hello' });
    await put('device', 'meta', 'session', { ...session, token: 'other-account', user: { ...session.user, id: 6 } });
    await synchronize(session.token);
    expect(vendorApi.sendMessage).not.toHaveBeenCalled();
    expect((await list(5, 'outbox')).length).toBe(1);
  });
  it('honors Retry-After and bounds exponential backoff', () => {
    expect(retryDelay(new Error('network'), 1)).toBe(30_000);
    expect(retryDelay(new Error('network'), 20)).toBe(900_000);
    expect(retryDelay({ response: { status: 429, headers: { 'retry-after': '1200' } } }, 1)).toBe(1200_000);
    expect(retryDelay({ response: { status: 422 } }, 1)).toBeNull();
  });
});

describe('saved resources and session migration', () => {
  it('does not persist an older response after a newer refresh completes', async () => {
    let finish!: (data: { version: number }) => void;
    const old = resource(session.token, 'srp', () => new Promise<{ version: number }>((resolve) => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeDefined());
    await resource(session.token, 'srp', async () => ({ version: 2 }));
    finish({ version: 1 });
    await old;
    expect(await get(5, 'snapshots', 'srp')).toMatchObject({ data: { version: 2 } });
  });
  it('merges downloaded pages before a single snapshot commit', async () => {
    await cache(session.token, 'conversation/1', { messages: [1, 2] });
    const result = await resource(session.token, 'conversation/1', async () => ({ messages: [3] }), (incoming, saved) => ({ messages: [...(saved?.messages ?? []), ...incoming.messages] }));
    expect(result.messages).toEqual([1, 2, 3]);
    expect(await get(5, 'snapshots', 'conversation/1')).toMatchObject({ data: { messages: [1, 2, 3] } });
  });
  it('uses saved resources offline and does not fetch unopened official documents', async () => {
    await cache(session.token, 'document/11', new Blob(['%PDF saved document'], { type: 'application/pdf' }));
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const fetch = vi.fn();
    const saved = await resource<Blob>(session.token, 'document/11', fetch);
    expect(new TextDecoder().decode(await saved.arrayBuffer())).toBe('%PDF saved document');
    await expect(resource(session.token, 'document/12', fetch)).rejects.toThrow('has not been saved');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not use cached private resources after an authorization failure', async () => {
    await cache(session.token, 'overview', { secret: true });
    await expect(resource(session.token, 'overview', async () => { throw { response: { status: 401 } }; })).rejects.toMatchObject({ response: { status: 401 } });
  });
  it('migrates a legacy session and preserves local drafts when clearing authentication', async () => {
    await clearSession();
    localStorage.setItem('price-watch-vendor-session', JSON.stringify(session));
    await put(5, 'drafts', 'message/1', { body: 'Keep this draft' });
    expect(await loadSession()).toEqual(session);
    expect(localStorage.getItem('price-watch-vendor-session')).toBeNull();
    await clearSession(session.token);
    expect(await get(5, 'drafts', 'message/1')).toEqual({ body: 'Keep this draft' });
  });
});
