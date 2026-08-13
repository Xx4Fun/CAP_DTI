import type { RecentReportStatus, RecentReportTicketProps } from '../components/RecentReportTicket';

const RECENT_REPORTS_KEY = 'price-watch-recent-reports';
const MAX_RECENT_REPORTS = 5;

export interface StoredRecentReport {
  reportReference: string;
  storeName: string;
  status: string;
  submittedAt: string;
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
    && typeof report.submittedAt === 'string'
    && report.submittedAt.length > 0;
};

export function getRecentReports(): StoredRecentReport[] {
  try {
    const raw = localStorage.getItem(RECENT_REPORTS_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isStoredRecentReport).slice(0, MAX_RECENT_REPORTS)
      : [];
  } catch {
    return [];
  }
}

export function saveRecentReport(report: StoredRecentReport): StoredRecentReport[] {
  const reports = [
    report,
    ...getRecentReports().filter((stored) => stored.reportReference !== report.reportReference),
  ].slice(0, MAX_RECENT_REPORTS);

  try {
    localStorage.setItem(RECENT_REPORTS_KEY, JSON.stringify(reports));
  } catch {
    // A report submission or tracking result must still succeed when storage is unavailable.
  }

  return reports;
}

const toTicketStatus = (status: string): RecentReportStatus => {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes('closed') || normalized.includes('resolved')) return 'Closed';
  if (normalized.includes('submitted')) return 'Submitted';
  return 'Under review';
};

export function toRecentReportTicket(report: StoredRecentReport): RecentReportTicketProps {
  const submittedAt = new Date(report.submittedAt);
  const hasValidDate = !Number.isNaN(submittedAt.getTime());

  return {
    date: hasValidDate
      ? submittedAt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
      : report.submittedAt,
    time: hasValidDate
      ? submittedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '',
    reportId: `#${report.reportReference.replace(/^#/, '')}`,
    store: report.storeName,
    status: toTicketStatus(report.status),
  };
}
