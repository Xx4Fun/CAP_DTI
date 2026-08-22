import type { RecentReportStatus, RecentReportTicketProps } from '../components/RecentReportTicket';

const RECENT_REPORTS_KEY = 'price-watch-recent-reports';
const MAX_RECENT_REPORTS = 20;

export interface StoredRecentReport {
  reportReference: string;
  storeName: string;
  status: string;
  submittedAt: string | null;
  createdAt?: string;
  archivedAt?: string;
}

const isStoredRecentReport = (value: unknown): value is StoredRecentReport => {
  if (!value || typeof value !== 'object') return false;

  const report = value as Record<string, unknown>;
  return typeof report.reportReference === 'string'
    && report.reportReference.length > 0
    && typeof report.storeName === 'string'
    && report.storeName.length > 0
    && typeof report.status === 'string'
    && report.status.length > 0
    && (report.submittedAt === null || (typeof report.submittedAt === 'string' && report.submittedAt.length > 0))
    && (report.submittedAt !== null || (typeof report.createdAt === 'string' && report.createdAt.length > 0))
    && (report.archivedAt === undefined
      || (typeof report.archivedAt === 'string' && report.archivedAt.length > 0));
};

const newestFirst = (reports: StoredRecentReport[]): StoredRecentReport[] => (
  [...reports].sort((left, right) => {
    const leftTime = Date.parse(left.submittedAt ?? left.createdAt ?? '');
    const rightTime = Date.parse(right.submittedAt ?? right.createdAt ?? '');
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    return rightTime - leftTime;
  })
);

export function getRecentReports(): StoredRecentReport[] {
  try {
    const raw = localStorage.getItem(RECENT_REPORTS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? newestFirst(parsed.filter(isStoredRecentReport)).slice(0, MAX_RECENT_REPORTS)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentReport(report: StoredRecentReport): StoredRecentReport[] {
  const existing = getRecentReports().find((stored) => stored.reportReference === report.reportReference);
  const nextReport = existing?.archivedAt && !report.archivedAt
    ? { ...report, archivedAt: existing.archivedAt }
    : report;
  const reports = newestFirst([
    nextReport,
    ...getRecentReports().filter((stored) => stored.reportReference !== report.reportReference),
  ]).slice(0, MAX_RECENT_REPORTS);

  try {
    localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify(reports));
  } catch {
    // A report submission or tracking result must still succeed when storage is unavailable.
  }

  return reports;
}

export function setRecentReportArchived(reference: string, archivedAt: string | null): StoredRecentReport[] {
  const reports = getRecentReports().map((report) => {
    if (report.reportReference !== reference) return report;
    if (archivedAt) return { ...report, archivedAt };
    const { archivedAt: _archivedAt, ...activeReport } = report;
    return activeReport;
  });
  return persistRecentReports(reports);
}

export function removeRecentReport(reference: string): StoredRecentReport[] {
  return persistRecentReports(
    getRecentReports().filter((report) => report.reportReference !== reference),
  );
}

export function persistRecentReports(reports: StoredRecentReport[]): StoredRecentReport[] {
  const limited = newestFirst(reports.filter(isStoredRecentReport)).slice(0, MAX_RECENT_REPORTS);
  try {
    localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify(limited));
  } catch {
    // Status refresh remains usable when local storage is unavailable.
  }
  return limited;
}

const toTicketStatus = (status: string): RecentReportStatus => {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes('ready for confirmation')) return 'Ready to review';
  if (normalized.includes('needs recapture')) return 'Needs recapture';
  if (normalized.includes('processing failed')) return 'Processing failed';
  if (normalized.includes('processing receipt')) return 'Processing';
  if (normalized.includes('closed') || normalized.includes('resolved')) return 'Closed';
  if (normalized.includes('submitted')) return 'Submitted';
  return 'Under review';
};

export function toRecentReportTicket(report: StoredRecentReport): RecentReportTicketProps {
  const displayTimestamp = report.submittedAt ?? report.createdAt ?? '';
  const submittedAt = new Date(displayTimestamp);
  const hasValidDate = !Number.isNaN(submittedAt.getTime());

  return {
    date: hasValidDate
      ? submittedAt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
      : displayTimestamp,
    time: hasValidDate
      ? submittedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '',
    reportId: `#${report.reportReference.replace(/^#/, '')}`,
    store: report.storeName,
    status: toTicketStatus(report.status),
  };
}
