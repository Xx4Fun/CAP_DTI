import { describe, expect, it, vi } from 'vitest';
import { refreshReceiptReportStatuses } from './receiptStatusRefresh';

describe('receipt status refresh', () => {
  it('refreshes recoverable processing reports without needing the tracking token', async () => {
    const readToken = vi.fn().mockResolvedValue('rsm_device');
    const fetchStatus = vi.fn().mockResolvedValue({ status: 'Ready for confirmation', submitted_at: null });
    const reports = [{ reportReference: 'REP-1', storeName: 'Store', status: 'Processing receipt', submittedAt: '2026-08-16T01:00:00Z' }];

    await expect(refreshReceiptReportStatuses(reports, readToken, fetchStatus)).resolves.toEqual([
      { ...reports[0], status: 'Ready for confirmation' },
    ]);
    expect(fetchStatus).toHaveBeenCalledWith('REP-1', 'rsm_device');
  });

  it('leaves submitted reports and failed refreshes unchanged', async () => {
    const reports = [
      { reportReference: 'REP-1', storeName: 'Store', status: 'Submitted', submittedAt: '2026-08-16T01:00:00Z' },
      { reportReference: 'REP-2', storeName: 'Store', status: 'Processing receipt', submittedAt: '2026-08-16T01:00:00Z' },
    ];
    const readToken = vi.fn().mockImplementation(async (reference) => reference === 'REP-2' ? 'rsm_two' : null);
    const fetchStatus = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(refreshReceiptReportStatuses(reports, readToken, fetchStatus)).resolves.toEqual(reports);
    expect(readToken).toHaveBeenCalledTimes(1);
  });
});
