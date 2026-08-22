import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteReportTrackingToken,
  getReportTrackingToken,
  saveReportTrackingToken,
} from './reportTrackingStore';

describe('report tracking credential storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
    localStorage.clear();
  });

  it('keeps a report tracking token in IndexedDB and out of localStorage', async () => {
    await saveReportTrackingToken('REP-20260822-IDB1', 'trk_device_only');

    await expect(getReportTrackingToken('REP-20260822-IDB1')).resolves.toBe('trk_device_only');
    expect(localStorage.getItem('price-watch-recent-reports') ?? '').not.toContain('trk_device_only');
  });

  it('rejects malformed report credentials instead of persisting them', async () => {
    await expect(saveReportTrackingToken('', 'trk_device_only')).rejects.toThrow('Invalid report tracking credential.');
    await expect(saveReportTrackingToken('REP-20260822-IDB2', 'not-a-token')).rejects.toThrow('Invalid report tracking credential.');
  });

  it('removes a saved report tracking token', async () => {
    await saveReportTrackingToken('REP-20260822-IDB3', 'trk_remove_me');
    await deleteReportTrackingToken('REP-20260822-IDB3');

    await expect(getReportTrackingToken('REP-20260822-IDB3')).resolves.toBeNull();
  });
});
