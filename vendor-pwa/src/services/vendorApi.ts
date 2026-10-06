import axios from 'axios';
import { accountFor, assertOnline, cache, invalidateResource, resource, snapshot } from '../offline/workspace';
import { storageFailure, withAccountLock } from '../offline/repository';
import type { Advisory, Conversation, LegalNotice, StoreMessage, NotificationSettings, ResponseDraft, SrpCatalog, VendorOverview, VendorSession, VendorUser } from '../app/types';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const vendorApi = {
  async login(email: string, password: string): Promise<VendorSession> {
    return (await client.post('/vendor/login', { email, password })).data;
  },
  async logout(token: string): Promise<void> {
    await client.post('/vendor/logout', {}, auth(token));
  },
  async changePassword(token: string, currentPassword: string, password: string): Promise<void> {
    assertOnline();
    await client.post('/vendor/password', { current_password: currentPassword, password, password_confirmation: password }, auth(token));
  },
  async overview(token: string): Promise<VendorOverview> {
    return resource(token, 'overview', async () => (await client.get('/vendor/overview', auth(token))).data.data);
  },
  async saveRepresentative(token: string, storeId: number, details: { name: string; title: 'Owner' | 'Manager' }): Promise<import('../app/types').CurrentRepresentative> {
    assertOnline();
    const representative = (await client.put(`/vendor/stores/${storeId}/representative`, details, auth(token))).data.data;
    await invalidateResource(token, 'overview');
    await withAccountLock(accountFor(token), async () => {
      const saved = await snapshot<VendorOverview>(token, 'overview');
      if (saved) await cache(token, 'overview', { ...saved.data, stores: saved.data.stores.map((store) => store.id === storeId ? { ...store, current_representative: representative } : store) });
    }, 'snapshot/overview', true).catch(storageFailure);
    return representative;
  },
  async notices(token: string): Promise<LegalNotice[]> {
    return resource<LegalNotice[]>(token, 'notices', async () => (await client.get('/vendor/notices', auth(token))).data, (incoming, saved) => incoming.map((notice) => {
      const accepted = saved?.find((known) => known.id === notice.id && known.response_received_at);
      return accepted && !notice.response_received_at ? accepted : notice;
    }));
  },
  async document(token: string, noticeId: number): Promise<Blob> {
    return resource(token, `document/${noticeId}`, async () => (await client.get(`/vendor/notices/${noticeId}/document`, { ...auth(token), responseType: 'blob' })).data);
  },
  async respond(token: string, noticeId: number, draft: ResponseDraft, clientUuid: string = crypto.randomUUID()): Promise<LegalNotice> {
    const body = new FormData();
    body.append('client_uuid', clientUuid);
    body.append('reason_category', draft.reason_category);
    body.append('response_text', draft.response_text);
    // The vendor's own acknowledgement; the server rejects anything but an explicit oath.
    body.append('certified_under_oath', draft.certified_under_oath ? '1' : '0');
    draft.attachments.forEach(({ file, category }) => {
      body.append('attachments[]', file);
      body.append('attachment_categories[]', category);
    });
    // Uploads over slow mobile connections need more than the default timeout.
    return (await client.post(`/vendor/notices/${noticeId}/response`, body, { ...auth(token), timeout: 120_000 })).data.notice;
  },
  async conversation(token: string, storeId: number, beforeId?: number, markRead = true): Promise<Conversation> {
    const key = `conversation/${storeId}`;
    if (beforeId && !navigator.onLine) throw new Error('Connect to download earlier messages. Previously downloaded messages are already shown.');
    return resource<Conversation>(token, key, async () => (await client.get(`/vendor/conversations/${storeId}`, { ...auth(token), params: { ...(beforeId ? { before_id: beforeId } : {}), mark_read: markRead ? 1 : 0 } })).data.data, (value, saved) => {
      const messages = new Map(saved?.messages.map((message) => [message.id, message]));
      value.messages.forEach((message) => messages.set(message.id, { ...message, read_at: message.read_at ?? messages.get(message.id)?.read_at ?? null }));
      return { ...value, messages: [...messages.values()].sort((a, b) => a.id - b.id), has_more: beforeId ? value.has_more : (saved?.has_more ?? value.has_more) };
    });
  },
  async sendMessage(token: string, storeId: number, payload: { body?: string; attachment?: File }, clientUuid: string = crypto.randomUUID()): Promise<StoreMessage> {
    const body = new FormData();
    body.append('client_uuid', clientUuid);
    if (payload.body) body.append('body', payload.body);
    if (payload.attachment) body.append('attachment', payload.attachment);
    return (await client.post(`/vendor/conversations/${storeId}/messages`, body, { ...auth(token), timeout: 120_000 })).data.data;
  },
  async messageAttachment(token: string, storeId: number, messageId: number): Promise<Blob> {
    return resource(token, `message-attachment/${storeId}/${messageId}`, async () => (await client.get(`/vendor/conversations/${storeId}/messages/${messageId}/attachment`, { ...auth(token), responseType: 'blob' })).data);
  },
  async srp(token: string): Promise<SrpCatalog> {
    return resource(token, 'srp', async () => (await client.get('/vendor/srp', auth(token))).data.data);
  },
  async advisories(token: string): Promise<Advisory[]> {
    return resource(token, 'advisories', async () => (await client.get('/vendor/advisories', auth(token))).data.data);
  },
  async preferences(token: string): Promise<NotificationSettings> {
    return resource(token, 'preferences', async () => (await client.get('/vendor/preferences', auth(token))).data.data);
  },
  async savePreferences(token: string, settings: NotificationSettings): Promise<NotificationSettings> {
    assertOnline();
    const saved = (await client.put('/vendor/preferences', settings, auth(token))).data.data;
    await invalidateResource(token, 'preferences');
    await cache(token, 'preferences', saved).catch(storageFailure);
    return saved;
  },
  async acceptInvitation(invitationToken: string, payload: { name: string; password: string; password_confirmation: string }): Promise<{ message: string; existing_account: boolean; user: Pick<VendorUser, 'id' | 'email'> }> {
    return (await client.post(`/vendor-invitations/${encodeURIComponent(invitationToken)}/accept`, payload)).data;
  },
};

type ApiFailure = { response?: { status?: number; data?: { status?: string; message?: string; errors?: Record<string, string[]> } } };

export function apiError(error: unknown, fallback: string): string {
  const response = (error as ApiFailure).response;
  return (response?.data?.errors && Object.values(response.data.errors).flat()[0]) || response?.data?.message || (error instanceof Error ? error.message : fallback);
}

export const apiStatus = (error: unknown) => (error as ApiFailure).response?.data?.status;

/** Only an invalid or revoked session signs the vendor out; deadline and access denials stay in the current screen. */
export function isSessionInvalid(error: unknown): boolean {
  const response = (error as ApiFailure).response;
  return response?.status === 401 || (response?.status === 403 && response.data?.status === 'VENDOR_ACCESS_REVOKED');
}
