import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Copy,
  FileLock2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { apiClient, type TrackReportResponse } from '../api/client';
import { getReportTrackingToken } from '../app/reportTrackingStore';
import { reportStatusTone } from '../app/reportPresentation';
import { deriveTimelineItems } from '../app/status';
import { navigate } from '../app/routing';
import './TrackReport.css';

interface ReportDetailProps {
  reference: string;
  onBack?: () => void;
  onReportTracked?: (report: TrackReportResponse) => void;
}

type DetailState = 'loading' | 'ready' | 'unavailable' | 'error';

const formatDateTime = (value: string): string => (
  Number.isNaN(Date.parse(value))
    ? value
    : new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
);

export const ReportDetail = ({ reference, onBack, onReportTracked }: ReportDetailProps) => {
  const [state, setState] = useState<DetailState>('loading');
  const [report, setReport] = useState<TrackReportResponse | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const requestIdRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);
  const onReportTrackedRef = useRef(onReportTracked);
  onReportTrackedRef.current = onReportTracked;

  const loadReport = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState('loading');
    setError('');
    setReport(null);

    try {
      const token = await getReportTrackingToken(reference);
      if (requestId !== requestIdRef.current) return;
      if (!token) {
        setState('unavailable');
        return;
      }

      const response = await apiClient.get('/public/reports/track', {
        params: { reference, token },
      });
      if (!response.data?.success || !response.data.data) {
        throw new Error('The report service returned an invalid response.');
      }
      if (requestId !== requestIdRef.current) return;

      const tracked = response.data.data as TrackReportResponse;
      setReport(tracked);
      setState('ready');
      onReportTrackedRef.current?.(tracked);
    } catch (caught: unknown) {
      if (requestId !== requestIdRef.current) return;
      const message = caught && typeof caught === 'object' && 'response' in caught
        ? (caught as { response?: { data?: { message?: string } } }).response?.data?.message
        : caught instanceof Error ? caught.message : undefined;
      setError(message || 'Unable to load this report right now.');
      setState('error');
    }
  }, [reference]);

  useEffect(() => {
    void loadReport();
    return () => { requestIdRef.current += 1; };
  }, [loadReport]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const copyReference = () => {
    const value = report?.report_reference ?? reference;
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="track-report-page track-report-detail-page">
      <header className="track-report-heading track-report-detail-app-header">
        {onBack && (
          <button type="button" className="track-report-back" aria-label="Back to My Reports" onClick={onBack}>
            <ArrowLeft size={21} aria-hidden="true" />
          </button>
        )}
        <h1>Report details</h1>
      </header>

      {state === 'loading' && (
        <div className="track-report-detail-loading" role="status">
          <span className="visually-hidden">Loading report updates. Checking the latest public status securely.</span>
          <div className="track-report-skeleton-summary" aria-hidden="true">
            <span className="track-report-skeleton-line track-report-skeleton-short" />
            <span className="track-report-skeleton-line track-report-skeleton-reference" />
            <div className="track-report-skeleton-meta"><span /><span /></div>
          </div>
          <div className="track-report-skeleton-timeline" aria-hidden="true">
            <span className="track-report-skeleton-line track-report-skeleton-title" />
            {[0, 1, 2].map((item) => <span key={item} className="track-report-skeleton-step" />)}
          </div>
        </div>
      )}

      {state === 'unavailable' && (
        <section className="track-report-detail-state track-report-detail-unavailable">
          <span className="track-report-state-icon"><FileLock2 size={28} aria-hidden="true" /></span>
          <h2>Report unavailable on this device</h2>
          <strong className="track-report-unavailable-reference">{reference}</strong>
          <p>This device no longer has the secure access needed to open the report. Its saved summary remains in My Reports.</p>
        </section>
      )}

      {state === 'error' && (
        <section className="track-report-detail-state track-report-detail-error">
          <span className="track-report-state-icon"><AlertTriangle size={28} aria-hidden="true" /></span>
          <h2>Report could not be loaded</h2>
          <p role="alert">{error}</p>
          <button type="button" className="btn-secondary track-report-retry" onClick={() => void loadReport()}>
            <RefreshCw size={17} aria-hidden="true" /> Try again
          </button>
        </section>
      )}

      {state === 'ready' && report && (
        <>
          <section className="track-report-summary" aria-label={`Report ${report.report_reference} summary`}>
            <div className="track-report-summary-status">
              <span>Current status</span>
              <span className={`track-report-status track-report-status-${reportStatusTone(report.current_status)}`}>{report.current_status}</span>
            </div>
            <div className="track-report-reference-block">
              <span>Report reference</span>
              <div className="track-report-reference">
                <strong>{report.report_reference}</strong>
                <button type="button" onClick={copyReference} aria-label={copied ? 'Report reference copied' : 'Copy report reference'}>
                  {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="track-report-summary-meta">
              <span><Building2 size={17} aria-hidden="true" /><span><small>ESTABLISHMENT</small><strong>{report.store_name}</strong></span></span>
              <span><Calendar size={17} aria-hidden="true" /><span><small>{report.submitted_at ? 'SUBMITTED ON' : 'CREATED ON'}</small><strong>{formatDateTime(report.submitted_at ?? report.created_at)}</strong></span></span>
            </div>
          </section>

          <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'receipt-view', reference }, {
            state: { fromReportDetail: true },
          })}>View receipt and results</button>

          <section className="track-report-timeline-section" aria-labelledby="report-progress-title">
            <h2 id="report-progress-title" className="track-report-timeline-title"><Clock size={19} aria-hidden="true" /> Evaluation progress</h2>
            <div className="track-report-timeline">
              {deriveTimelineItems(report.status_history, report.current_status).map((item, index) => {
                const completed = item.state === 'completed';
                const active = item.state === 'current';
                return (
                  <div key={`${item.status}-${item.timestamp}`} className={`stepper-item ${completed ? 'completed' : ''} ${active ? 'active' : ''}`}>
                    <div className="stepper-icon">{completed ? <CheckCircle size={18} aria-hidden="true" /> : index + 1}</div>
                    <div className="track-report-timeline-copy">
                      <div>
                        <strong aria-current={active ? 'step' : undefined}>{item.status}</strong>
                        {active && <span className="track-report-current">Current</span>}
                      </div>
                      <p>{item.public_message}</p>
                      <time>{formatDateTime(item.timestamp)}</time>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="banner-info track-report-privacy">
            <ShieldCheck size={19} aria-hidden="true" />
            <div><strong>Your privacy is protected.</strong> Your saved credential protects access to receipt photos and results. Evaluation updates show only public status information.</div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportDetail;
