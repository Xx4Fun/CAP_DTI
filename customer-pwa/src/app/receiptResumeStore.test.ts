import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteReceiptResumeToken, getReceiptResumeToken, saveReceiptResumeToken } from './receiptResumeStore';

describe('receipt device resume credential storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    localStorage.clear();
  });

  it('stores the limited resume token in IndexedDB instead of localStorage', async () => {
    await saveReceiptResumeToken('REP-20260816-IDB1', 'rsm_device_only');

    await expect(getReceiptResumeToken('REP-20260816-IDB1')).resolves.toBe('rsm_device_only');
    expect(JSON.stringify(localStorage)).not.toContain('rsm_device_only');
  });

  it('removes the resume token after customer confirmation', async () => {
    await saveReceiptResumeToken('REP-20260816-IDB2', 'rsm_remove_me');
    await deleteReceiptResumeToken('REP-20260816-IDB2');

    await expect(getReceiptResumeToken('REP-20260816-IDB2')).resolves.toBeNull();
  });
});
