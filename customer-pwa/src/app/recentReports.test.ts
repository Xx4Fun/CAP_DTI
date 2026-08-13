import { beforeEach, describe, expect, it } from 'vitest';
import {
  getRecentReports,
  saveRecentReport,
  toRecentReportTicket,
  type StoredRecentReport,
} from './recentReports';

const makeReport = (index: number, status = 'Submitted'): StoredRecentReport => ({
  reportReference: `REP-20260809-${index}`,
  storeName: `Store ${index}`,
  status,
  submittedAt: `2026-08-09T0${index}:00:00Z`,
});

describe('recent report storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns no reports when browser storage is missing or malformed', () => {
    expect(getRecentReports()).toEqual([]);

    localStorage.setItem('price-watch-recent-reports', '{broken');
    expect(getRecentReports()).toEqual([]);
  });

  it('stores the five newest reports and replaces an existing reference', () => {
    for (let index = 1; index <= 6; index += 1) {
      saveRecentReport(makeReport(index));
    }

    expect(getRecentReports().map((report) => report.reportReference)).toEqual([
      'REP-20260809-6',
      'REP-20260809-5',
      'REP-20260809-4',
      'REP-20260809-3',
      'REP-20260809-2',
    ]);

    saveRecentReport({ ...makeReport(4), status: 'Resolved' });
    expect(getRecentReports()[0]).toMatchObject({
      reportReference: 'REP-20260809-4',
      status: 'Resolved',
    });
    expect(getRecentReports()).toHaveLength(5);
  });

  it('ignores invalid stored entries and never serializes a secret tracking token', () => {
    localStorage.setItem('price-watch-recent-reports', JSON.stringify([
      makeReport(1),
      { reportReference: 'REP-INCOMPLETE' },
      null,
    ]));

    const reports = getRecentReports();
    expect(reports).toEqual([makeReport(1)]);

    saveRecentReport(makeReport(2));
    expect(localStorage.getItem('price-watch-recent-reports')).not.toContain('secret_tracking_token');
    expect(localStorage.getItem('price-watch-recent-reports')).not.toContain('trk_');
  });

  it.each([
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
