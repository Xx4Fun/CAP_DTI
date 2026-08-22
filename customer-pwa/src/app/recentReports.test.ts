import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRecentReports,
  removeRecentReport,
  saveRecentReport,
  setRecentReportArchived,
  toRecentReportTicket,
  type StoredRecentReport,
} from './recentReports';

const makeReport = (index: number, status = 'Submitted'): StoredRecentReport => ({
  reportReference: `REP-20260809-${index}`,
  storeName: `Store ${index}`,
  status,
  submittedAt: `2026-08-${String(index).padStart(2, '0')}T01:00:00Z`,
});

describe('recent report storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns no reports when browser storage is missing or malformed', () => {
    expect(getRecentReports()).toEqual([]);

    localStorage.setItem('price-watch-recent-reports', '{broken');
    expect(getRecentReports()).toEqual([]);
  });

  it('stores the twenty newest reports and replaces an existing reference', () => {
    for (let index = 1; index <= 21; index += 1) {
      saveRecentReport(makeReport(index));
    }

    expect(getRecentReports()).toHaveLength(20);
    expect(getRecentReports()[0].reportReference).toBe('REP-20260809-21');
    expect(getRecentReports()[19].reportReference).toBe('REP-20260809-2');

    saveRecentReport({ ...makeReport(14), status: 'Resolved' });
    expect(getRecentReports()[0].reportReference).toBe('REP-20260809-21');
    expect(getRecentReports().find((report) => report.reportReference === 'REP-20260809-14')).toMatchObject({
      reportReference: 'REP-20260809-14',
      status: 'Resolved',
    });
    expect(getRecentReports()).toHaveLength(20);
  });

  it('ignores invalid stored entries and never serializes a secret tracking token', () => {
    localStorage.setItem('price-watch-recent-reports', JSON.stringify([
      makeReport(1),
      { reportReference: 'REP-INCOMPLETE' },
      { ...makeReport(2), archivedAt: 123 },
      null,
    ]));

    const reports = getRecentReports();
    expect(reports).toEqual([makeReport(1)]);

    saveRecentReport(makeReport(2));
    expect(localStorage.getItem('price-watch-recent-reports')).not.toContain('secret_tracking_token');
    expect(localStorage.getItem('price-watch-recent-reports')).not.toContain('trk_');
  });

  it('archives and restores a report without changing its server status', () => {
    saveRecentReport(makeReport(1, 'Processing receipt'));

    const archived = setRecentReportArchived('REP-20260809-1', '2026-08-22T09:00:00Z');
    expect(archived[0]).toMatchObject({
      reportReference: 'REP-20260809-1',
      status: 'Processing receipt',
      archivedAt: '2026-08-22T09:00:00Z',
    });

    const restored = setRecentReportArchived('REP-20260809-1', null);
    expect(restored[0]).not.toHaveProperty('archivedAt');
  });

  it('preserves archive metadata when a report receives a newer status', () => {
    saveRecentReport({ ...makeReport(1), archivedAt: '2026-08-22T09:00:00Z' });

    saveRecentReport({ ...makeReport(1), status: 'Resolved' });

    expect(getRecentReports()[0]).toMatchObject({
      status: 'Resolved',
      archivedAt: '2026-08-22T09:00:00Z',
    });
  });

  it('removes only the selected local report summary', () => {
    saveRecentReport(makeReport(1));
    saveRecentReport(makeReport(2));

    const remaining = removeRecentReport('REP-20260809-2');

    expect(remaining.map((report) => report.reportReference)).toEqual(['REP-20260809-1']);
    expect(getRecentReports()).toEqual(remaining);
  });

  it.each([
    ['Processing receipt', 'Processing'],
    ['Ready for confirmation', 'Ready to review'],
    ['Needs recapture', 'Needs recapture'],
    ['Processing failed', 'Processing failed'],
    ['Submitted', 'Submitted'],
    ['Under regulatory review', 'Under review'],
    ['Resolved', 'Closed'],
    ['Closed', 'Closed'],
  ] as const)('maps backend status %s to Home status %s', (backendStatus, homeStatus) => {
    const ticket = toRecentReportTicket(makeReport(1, backendStatus));

    expect(ticket).toMatchObject({
      reportId: '#REP-20260809-1',
      store: 'Store 1',
      status: homeStatus,
    });
    expect(ticket.date).not.toBe('');
    expect(ticket.time).not.toBe('');
  });
});
