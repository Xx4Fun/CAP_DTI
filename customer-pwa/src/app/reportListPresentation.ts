import type { RecentReportStatus } from '../components/RecentReportTicket';
import { toRecentReportTicket, type StoredRecentReport } from './recentReports';

export type ReportListFilter = 'All' | RecentReportStatus | 'Archived';

export const REPORT_LIST_FILTERS: ReportListFilter[] = [
  'All',
  'Needs recapture',
  'Processing failed',
  'Processing',
  'Ready to review',
  'Submitted',
  'Under review',
  'Closed',
  'Archived',
];

export function filterReportList(
  reports: StoredRecentReport[],
  query: string,
  filter: ReportListFilter,
): StoredRecentReport[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return reports.filter((report) => {
    const archived = Boolean(report.archivedAt);
    if (filter === 'Archived' ? !archived : archived) return false;
    if (filter !== 'All' && filter !== 'Archived' && toRecentReportTicket(report).status !== filter) return false;
    if (!normalizedQuery) return true;
    const displayedDate = toRecentReportTicket(report).date.toLocaleLowerCase();
    return report.reportReference.toLocaleLowerCase().includes(normalizedQuery)
      || report.storeName.toLocaleLowerCase().includes(normalizedQuery)
      || displayedDate.includes(normalizedQuery);
  }).sort((left, right) => {
    const rightTime = new Date(right.submittedAt ?? right.createdAt ?? '').getTime();
    const leftTime = new Date(left.submittedAt ?? left.createdAt ?? '').getTime();
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}

export function getReportFilterCounts(reports: StoredRecentReport[]): Record<ReportListFilter, number> {
  const counts = Object.fromEntries(REPORT_LIST_FILTERS.map((filter) => [filter, 0])) as Record<ReportListFilter, number>;
  reports.forEach((report) => {
    if (report.archivedAt) {
      counts.Archived += 1;
      return;
    }
    counts.All += 1;
    counts[toRecentReportTicket(report).status] += 1;
  });
  return counts;
}
