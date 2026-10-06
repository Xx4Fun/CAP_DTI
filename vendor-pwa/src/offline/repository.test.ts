// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { database, get, list, put, remove, withAccountLock } from './repository';

describe('encrypted Vendor repository', () => {
  it('reads record and attachment bytes from one snapshot during concurrent replacement', async () => {
    await put(5, 'drafts', 'response/11', { file: new File(['original evidence'], 'invoice.pdf') });
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    let replaced = false;
    const interception = vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
      if (!replaced) {
        replaced = true;
        await put(5, 'drafts', 'response/11', { text: 'new revision without attachment' });
      }
      return decrypt(...args);
    });
    try {
      const saved = await get<{ file: File }>(5, 'drafts', 'response/11');
      expect(new TextDecoder().decode(await saved!.file.arrayBuffer())).toBe('original evidence');
    } finally { interception.mockRestore(); }
    expect(await get(5, 'drafts', 'response/11')).toEqual({ text: 'new revision without attachment' });
  });
  it('rolls back all writes and retains the draft when attachment storage fails during conversion', async () => {
    const revision = crypto.randomUUID();
    const file = new File(['preserved evidence'], 'keep.pdf');
    await put(5, 'drafts', 'message/1', { file, __revision: revision }, { version: revision });
    const original = IDBObjectStore.prototype.put;
    const failure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (value, key) {
      if (this.name === 'attachments') throw new DOMException('Quota exhausted', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    const options = { immutable: true, consumeDraft: { key: 'message/1', version: revision } };
    await expect(put(5, 'outbox', revision, { file }, options)).rejects.toThrow('Quota exhausted');
    failure.mockRestore();
    expect(await get(5, 'outbox', revision)).toBeUndefined();
    expect(await get(5, 'drafts', 'message/1')).toMatchObject({ __revision: revision });
    // Recovery commits both sides and clears the failed-save guard.
    await put(5, 'outbox', revision, { file }, options);
    expect(await get(5, 'drafts', 'message/1')).toBeUndefined();
    expect(await get(5, 'outbox', revision)).toBeDefined();
  });
  it('restores exact text, file bytes and categories while keeping private records encrypted', async () => {
    const file = new File(['evidence bytes'], 'invoice.pdf', { type: 'application/pdf', lastModified: 45 });
    await put(5, 'drafts', 'response/11', { text: 'Private explanation\nwith new line', step: 3, attachments: [{ file, category: 'INVOICE' }] });
    const restored = await get<{ text: string; step: number; attachments: { file: File; category: string }[] }>(5, 'drafts', 'response/11');
    expect(restored?.text).toBe('Private explanation\nwith new line');
    expect(restored?.step).toBe(3);
    expect(restored?.attachments[0].category).toBe('INVOICE');
    expect(restored?.attachments[0].file.name).toBe('invoice.pdf');
    expect(new TextDecoder().decode(await restored!.attachments[0].file.arrayBuffer())).toBe('evidence bytes');
    const db = await database();
    const raw = await new Promise<{ bytes: ArrayBuffer }>((resolve) => { const read = db.transaction('drafts').objectStore('drafts').get('5/response/11'); read.onsuccess = () => resolve(read.result); });
    expect(new TextDecoder().decode(raw.bytes)).not.toContain('Private explanation');
    const key = await new Promise<CryptoKey>((resolve) => { const read = db.transaction('meta').objectStore('meta').get('browser-key'); read.onsuccess = () => resolve(read.result); });
    expect(key.extractable).toBe(false);
  });
  it('isolates accounts and removes attachment bytes only with their owning record', async () => {
    await put(5, 'drafts', 'message/1', { attachment: new File(['one'], 'one.pdf') });
    await put(6, 'drafts', 'message/1', { text: 'other account' });
    expect(await get(6, 'drafts', 'response/11')).toBeUndefined();
    await remove(5, 'drafts', 'message/1');
    expect(await list(5, 'drafts')).toEqual([]);
    expect(await get(6, 'drafts', 'message/1')).toEqual({ text: 'other account' });
    const db = await database();
    const count = await new Promise<number>((resolve) => { const read = db.transaction('attachments').objectStore('attachments').count(); read.onsuccess = () => resolve(read.result); });
    expect(count).toBe(0);
  });
  it('does not erase corrupt pending work', async () => {
    await put(5, 'outbox', 'uuid', { body: 'keep me' });
    const db = await database();
    await new Promise<void>((resolve) => { const tx = db.transaction('outbox', 'readwrite'); tx.objectStore('outbox').put({ iv: new Uint8Array(12), bytes: new ArrayBuffer(1) }, '5/uuid'); tx.oncomplete = () => resolve(); });
    await expect(get(5, 'outbox', 'uuid')).rejects.toThrow('has not been deleted');
    const count = await new Promise<number>((resolve) => { const read = db.transaction('outbox').objectStore('outbox').count(); read.onsuccess = () => resolve(read.result); });
    expect(count).toBe(1);
  });
  it('allows only one concurrent delivery owner through the transactional fallback', async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const first = withAccountLock(5, async () => { started(); await new Promise<void>((resolve) => { release = resolve; }); return 'first'; });
    await ready;
    expect(await withAccountLock(5, async () => 'second')).toBeUndefined();
    release();
    expect(await first).toBe('first');
    expect(await withAccountLock(5, async () => 'next')).toBe('next');
  });
});
