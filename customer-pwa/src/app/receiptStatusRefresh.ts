import type { StoredRecentReport } from './recentReports';

const isRecoverableDraft = (status: string): boolean => {
  const normalized = status.toLowerCase();
  return normalized.includes('processing')
    || normalized.includes('ready for confirmation')
    || normalized.includes('needs recapture');
};

export async function refreshReceiptReportStatuses(
  reports: StoredRecentReport[],
  readResumeToken: (reference: string) => Promise<string | null>,
  fetchStatus: (reference: string, token: string) => Promise<{ status: string; submitted_at?: string | null }>,
): Promise<StoredRecentReport[]> {
  return Promise.all(reports.slice(0, 5).map(async (report) => {
    if (!isRecoverableDraft(report.status)) return report;
    try {
      const token = await readResumeToken(report.reportReference);
      if (!token) return report;
      const latest = await fetchStatus(report.reportReference, token);
      return {
        ...report,
        status: latest.status,
        submittedAt: latest.submitted_at ?? report.submittedAt,
      };
    } catch {
      return report;
    }
  }));
}
