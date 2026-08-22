import { describe, expect, it } from 'vitest';
import type { StoredRecentReport } from './recentReports';
import {
  REPORT_LIST_FILTERS,
  filterReportList,
  getReportFilterCounts,
} from './reportListPresentation';

const report = (
  reference: string,
  storeName: string,
  status: string,
  submittedAt: string,
  archivedAt?: string,
): StoredRecentReport => ({ reportReference: reference, storeName, status, submittedAt, archivedAt });

const reports: StoredRecentReport[] = [
  report('REP-PROCESSING', 'Alpha Market', 'Processing receipt', '2026-08-22T01:00:00Z'),
  report('REP-READY', 'Bravo Store', 'Ready for confirmation', '2026-08-21T01:00:00Z'),
  report('REP-RECAPTURE', 'Charlie Mart', 'Needs recapture', '2026-08-20T01:00:00Z'),
  report('REP-FAILED', 'Charlie Mart', 'Processing failed', '2026-08-20T00:30:00Z'),
  report('REP-SUBMITTED', 'Delta Shop', 'Submitted', '2026-08-19T01:00:00Z'),
  report('REP-REVIEW', 'Echo Grocery', 'Under regulatory review', '2026-08-18T01:00:00Z'),
  report('REP-CLOSED', 'Foxtrot Market', 'Resolved', '2026-08-17T01:00:00Z'),
  report('REP-ARCHIVED', 'Gamma Store', 'Submitted', '2026-08-16T01:00:00Z', '2026-08-22T03:00:00Z'),
];

describe('My Reports list presentation', () => {
  it('uses the approved exact-status filter order', () => {
    expect(REPORT_LIST_FILTERS).toEqual([
      'All',
      'Needs recapture',
      'Processing failed',
      'Processing',
      'Ready to review',
      'Submitted',
      'Under review',
      'Closed',
      'Archived',
    ]);
  });

  it('searches active reports by reference, store name, or displayed date without exposing archived results', () => {
    expect(filterReportList(reports, 'alpha', 'All').map((item) => item.reportReference)).toEqual(['REP-PROCESSING']);
    expect(filterReportList(reports, 'rep-ready', 'All').map((item) => item.reportReference)).toEqual(['REP-READY']);
    expect(filterReportList(reports, 'Aug 22, 2026', 'All').map((item) => item.reportReference)).toEqual(['REP-PROCESSING']);
    expect(filterReportList(reports, 'gamma', 'All')).toEqual([]);
  });

  it('returns visible reports newest first regardless of storage order', () => {
    expect(filterReportList([
      report('OLDER', 'Store', 'Submitted', '2026-08-18T01:00:00Z'),
      report('NEWEST', 'Store', 'Submitted', '2026-08-22T01:00:00Z'),
      report('MIDDLE', 'Store', 'Submitted', '2026-08-20T01:00:00Z'),
    ], '', 'All').map((item) => item.reportReference)).toEqual(['NEWEST', 'MIDDLE', 'OLDER']);
  });

  it.each([
    ['Processing', 'REP-PROCESSING'],
    ['Ready to review', 'REP-READY'],
    ['Needs recapture', 'REP-RECAPTURE'],
    ['Processing failed', 'REP-FAILED'],
    ['Submitted', 'REP-SUBMITTED'],
    ['Under review', 'REP-REVIEW'],
    ['Closed', 'REP-CLOSED'],
    ['Archived', 'REP-ARCHIVED'],
  ] as const)('filters %s reports through the canonical public status', (filter, reference) => {
    expect(filterReportList(reports, '', filter).map((item) => item.reportReference)).toEqual([reference]);
  });

  it('counts active statuses separately from archived reports', () => {
    expect(getReportFilterCounts(reports)).toEqual({
      All: 7,
      Processing: 1,
      'Ready to review': 1,
      'Needs recapture': 1,
      'Processing failed': 1,
      Submitted: 1,
      'Under review': 1,
      Closed: 1,
      Archived: 1,
    });
  });

});
