// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { cache, registerSession, snapshot } from '../offline/workspace';
import { vendorApi } from './vendorApi';
import type { Conversation, NotificationSettings, VendorOverview } from '../app/types';

const http = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => http } }));
const token = 'adapter-token';
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  registerSession({ token, expires_at: new Date(Date.now() + 3600_000).toISOString(), user: { id: 5, name: 'Vendor', email: 'vendor@test.invalid' } });
});

it('retains downloaded earlier pages and opts out of read receipts during preparation', async () => {
  const thread: Conversation = { store: { id: 1, store_name: 'Test', address: 'Test' }, notices: [], has_more: false, messages: [{ id: 1, sender_side: 'dti', sender_name: 'DTI', body: 'Earlier', read_at: null, created_at: new Date().toISOString(), attachment: null }] };
  await cache(token, 'conversation/1', thread);
  http.get.mockResolvedValue({ data: { data: { ...thread, has_more: true, messages: [{ ...thread.messages[0], id: 2, body: 'Latest' }] } } });
  const prepared = await vendorApi.conversation(token, 1, undefined, false);
  expect(http.get).toHaveBeenCalledWith('/vendor/conversations/1', expect.objectContaining({ params: { mark_read: 0 } }));
  expect(prepared.messages.map((message) => message.id)).toEqual([1, 2]);
  const saved = await snapshot<Conversation>(token, 'conversation/1');
  expect(saved?.data.messages.map((message) => message.id)).toEqual([1, 2]);
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await vendorApi.conversation(token, 1);
  expect((await snapshot(token, 'conversation/1'))?.downloadedAt).toBe(saved?.downloadedAt);
  expect(http.get).toHaveBeenCalledTimes(1);
});

it('updates the saved representative and preferences immediately after an online change', async () => {
  const overview = { user: { id: 5, name: 'Vendor', email: 'vendor@test.invalid' }, stores: [{ id: 1, store_name: 'Test', address: 'Test' }], emergency: null } as VendorOverview;
  await cache(token, 'overview', overview);
  const representative = { name: 'New Contact', title: 'Manager', updated_at: new Date().toISOString() };
  http.put.mockResolvedValueOnce({ data: { data: representative } });
  await vendorApi.saveRepresentative(token, 1, { name: 'New Contact', title: 'Manager' });
  expect((await snapshot<VendorOverview>(token, 'overview'))?.data.stores[0].current_representative).toEqual(representative);
  const preferences = { email_enabled: true, email_address: 'saved@test.invalid' } as NotificationSettings;
  http.put.mockResolvedValueOnce({ data: { data: preferences } });
  await vendorApi.savePreferences(token, preferences);
  expect((await snapshot<NotificationSettings>(token, 'preferences'))?.data).toEqual(preferences);
});

it('blocks profile changes offline and includes the caller UUID in online submissions', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  await expect(vendorApi.changePassword(token, 'old', 'new')).rejects.toThrow('requires a connection');
  await expect(vendorApi.saveRepresentative(token, 1, { name: 'Offline', title: 'Owner' })).rejects.toThrow('requires a connection');
  expect(http.put).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  http.post.mockResolvedValue({ data: { data: { id: 1 } } });
  const uuid = crypto.randomUUID();
  await vendorApi.sendMessage(token, 1, { body: 'Hello' }, uuid);
  expect((http.post.mock.calls[0][1] as FormData).get('client_uuid')).toBe(uuid);
});
