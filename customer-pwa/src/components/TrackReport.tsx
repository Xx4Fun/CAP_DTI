import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Building2, Calendar, Check, CheckCircle, ChevronRight,
  Clock, Copy, FileClock, KeyRound, LoaderCircle, Search, ShieldCheck,
} from 'lucide-react';
import { apiClient, type TrackReportResponse } from '../api/client';
import { getReportTrackingToken, saveReportTrackingToken } from '../app/reportTrackingStore';
import type { StoredRecentReport } from '../app/recentReports';
import { deriveTimelineItems } from '../app/status';
import './TrackReport.css';

interface TrackReportProps {
  recentReports?: StoredRecentReport[];
  initialReference?: string;
  setActiveTab?: (tab: string) => void;
  onReportTracked?: (report: TrackReportResponse) => void;
}

type CredentialAvailability = 'checking' | 'available' | 'missing';

const formatDateTime = (value: string): string => (
  Number.isNaN(Date.parse(value))
    ? value
    : new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
);

const statusTone = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized.includes('resolved') || normalized.includes('closed') || normalized.includes('validated')) return 'success';
  if (normalized.includes('dispatched') || normalized.includes('inspection')) return 'info';
  return 'pending';
};

export const TrackReport: React.FC<TrackReportProps> = ({
  recentReports = [], initialReference = '', setActiveTab, onReportTracked,
}) => {
  const [selectedReference, setSelectedReference] = useState(initialReference || recentReports[0]?.reportReference || '');
  const [reference, setReference] = useState(initialReference);
  const [token, setToken] = useState('');
  const [report, setReport] = useState<TrackReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessNeeded, setAccessNeeded] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);
  const [credentialAvailability, setCredentialAvailability] = useState<Record<string, CredentialAvailability>>({});
  const copyTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const onReportTrackedRef = useRef(onReportTracked);
  const recentReportsRef = useRef(recentReports);
  onReportTrackedRef.current = onReportTracked;
  recentReportsRef.current = recentReports;

  const reportReferencesKey = useMemo(
    () => recentReports.map((item) => item.reportReference).join('|'),
    [recentReports],
  );

  const executeTracking = useCallback(async (refVal: string, tokVal: string, remember: boolean) => {
    const normalizedReference = refVal.trim();
    const normalizedToken = tokVal.trim();
    if (!normalizedReference || !normalizedToken) {
      setError('Please provide both the Report Reference Code and Secret Tracking Token.');
      return false;
    }

    const requestId = ++requestIdRef.current;
    setSelectedReference(normalizedReference);
    setLoading(true);
    setError('');
    setAccessNeeded('');
    setReport(null);

    try {
      const response = await apiClient.get('/public/reports/track', {
        params: { reference: normalizedReference, token: normalizedToken },
      });
      if (!response.data?.success || !response.data.data) {
        throw new Error('The report service returned an invalid response.');
      }
      if (requestId !== requestIdRef.current) return false;

      if (remember) {
        try {
          await saveReportTrackingToken(normalizedReference, normalizedToken);
          setCredentialAvailability((current) => ({ ...current, [normalizedReference]: 'available' }));
        } catch {
          // A valid lookup remains usable even when this browser cannot remember it.
        }
      }

      setReport(response.data.data);
      onReportTrackedRef.current?.(response.data.data);
      return true;
    } catch (caught: any) {
      if (requestId !== requestIdRef.current) return false;
      setError(caught.response?.data?.message || 'Report not found or the tracking credential is invalid.');
      return false;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const openDeviceReport = useCallback(async (reportReference: string) => {
    setSelectedReference(reportReference);
    setReport(null);
    setError('');
    setAccessNeeded('');
    try {
      const storedToken = await getReportTrackingToken(reportReference);
      if (!storedToken) {
        setCredentialAvailability((current) => ({ ...current, [reportReference]: 'missing' }));
        setReference(reportReference);
        setAccessNeeded(reportReference);
        return;
      }
      setCredentialAvailability((current) => ({ ...current, [reportReference]: 'available' }));
      await executeTracking(reportReference, storedToken, false);
    } catch {
      setReference(reportReference);
      setAccessNeeded(reportReference);
    }
  }, [executeTracking]);

  useEffect(() => {
    let active = true;
    const inspectReports = async () => {
      const currentReports = recentReportsRef.current;
      const availabilityEntries = await Promise.all(currentReports.map(async (item) => {
        try {
          return [item.reportReference, await getReportTrackingToken(item.reportReference) ? 'available' : 'missing'] as const;
        } catch {
          return [item.reportReference, 'missing'] as const;
        }
      }));
      if (!active) return;
      setCredentialAvailability(Object.fromEntries(availabilityEntries));

      const requestedReference = initialReference.trim();
      const target = currentReports.find((item) => item.reportReference === requestedReference) ?? currentReports[0];
      if (target) await openDeviceReport(target.reportReference);
    };
    void inspectReports();
    return () => { active = false; };
  }, [initialReference, openDeviceReport, reportReferencesKey]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    requestIdRef.current += 1;
  }, []);

  const handleRecoverySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const recovered = await executeTracking(reference, token, true);
    if (recovered) setToken('');
  };

  const handleCopyRef = () => {
    if (!report) return;
    void navigator.clipboard.writeText(report.report_reference);
    setCopiedRef(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <div className="track-report-page">
      {setActiveTab && (
        <button className="btn-secondary track-report-back" onClick={() => setActiveTab('reports')}>
          <ArrowLeft size={17} /> Back to Reports
        </button>
      )}

      <section className="glass-panel track-report-library" aria-labelledby="my-reports-title">
        <div className="track-report-heading">
          <div className="icon-wrapper-green"><FileClock size={22} /></div>
          <div><h1 id="my-reports-title">My Reports</h1><p>Reports saved on this device open without entering credentials.</p></div>
        </div>

        {recentReports.length > 0 ? (
          <div className="track-report-list" aria-label="Reports saved on this device">
            {recentReports.map((item) => {
              const availability = credentialAvailability[item.reportReference] ?? 'checking';
              return (
                <button
                  key={item.reportReference}
                  type="button"
                  className={`track-report-list-item ${selectedReference === item.reportReference ? 'selected' : ''}`}
                  aria-label={`Open report ${item.reportReference}: ${item.status}`}
                  aria-pressed={selectedReference === item.reportReference}
                  onClick={() => void openDeviceReport(item.reportReference)}
                >
                  <span className="track-report-list-main">
                    <strong>{item.reportReference}</strong>
                    <span><Building2 size={14} /> {item.storeName}</span>
                    <span><Calendar size={14} /> {formatDateTime(item.submittedAt)}</span>
                  </span>
                  <span className="track-report-list-state">
                    <span className={`track-report-status track-report-status-${statusTone(item.status)}`}>{item.status}</span>
                    {availability === 'missing' && <span className="track-report-access-needed">Access needed</span>}
                    <ChevronRight size={18} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="track-report-empty">
            <FileClock size={25} /><div><strong>No reports saved on this device</strong><p>Reports you submit or recover will appear here.</p></div>
          </div>
        )}
      </section>

      {loading && <div className="glass-panel track-report-state" role="status"><LoaderCircle className="track-report-spinner" size={22} /> Loading report updates...</div>}

      {accessNeeded && !loading && (
        <div className="glass-panel track-report-state track-report-state-warning" role="status">
          <KeyRound size={22} /><div><strong>Access needed</strong><p>This older report was saved before automatic device access. Use the recovery section below once.</p></div>
        </div>
      )}

      {error && !loading && <div role="alert" className="banner-warning track-report-error"><AlertTriangle size={18} /><div>{error}</div></div>}

      {report && !loading && (
        <section className="glass-panel track-report-result" aria-label={`Report ${report.report_reference} timeline`}>
          <div className="track-report-summary">
            <div>
              <span className="track-report-eyebrow">PUBLIC REPORT REFERENCE</span>
              <div className="track-report-reference">
                <strong>{report.report_reference}</strong>
                <button type="button" onClick={handleCopyRef} aria-label="Copy report reference">{copiedRef ? <Check size={17} /> : <Copy size={17} />}</button>
              </div>
            </div>
            <span className={`track-report-status track-report-status-${statusTone(report.current_status)}`}>{report.current_status}</span>
            <div className="track-report-summary-meta">
              <span><Building2 size={15} /><span><small>ESTABLISHMENT</small><strong>{report.store_name}</strong></span></span>
              <span><Calendar size={15} /><span><small>SUBMITTED ON</small><strong>{formatDateTime(report.submitted_at)}</strong></span></span>
            </div>
          </div>

          <h2 className="track-report-timeline-title"><Clock size={18} /> Evaluation Progress &amp; Public Timeline</h2>
          <div className="track-report-timeline">
            {deriveTimelineItems(report.status_history, report.current_status).map((item, index) => {
              const completed = item.state === 'completed';
              const active = item.state === 'current';
              return (
                <div key={`${item.status}-${item.timestamp}`} className={`stepper-item ${completed ? 'completed' : ''} ${active ? 'active' : ''}`}>
                  <div className="stepper-icon">{completed ? <CheckCircle size={18} /> : index + 1}</div>
                  <div className="track-report-timeline-copy">
                    <div><strong aria-current={active ? 'step' : undefined}>{item.status}</strong>{active && <span className="track-report-current">In Progress</span>}</div>
                    <p>{item.public_message}</p><time>{formatDateTime(item.timestamp)}</time>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="banner-info track-report-privacy">
            <ShieldCheck size={18} /><div><strong>Privacy protected:</strong> Only public evaluation updates are shown. Receipt evidence and personal details remain restricted.</div>
          </div>
        </section>
      )}

      <details className="glass-panel track-report-recovery" open={Boolean(accessNeeded)}>
        <summary><KeyRound size={19} /> Open a report from another device</summary>
        <div className="track-report-recovery-body">
          <p>Enter the credentials once. After a successful lookup, this browser will remember the report.</p>
          <form onSubmit={handleRecoverySubmit}>
            <div><label htmlFor="report-reference">PUBLIC REPORT REFERENCE CODE</label><input id="report-reference" type="text" className="input-field" value={reference} onChange={(event) => setReference(event.target.value)} required /></div>
            <div><label htmlFor="tracking-token">SECRET TRACKING TOKEN</label><input id="tracking-token" type="password" className="input-field" value={token} onChange={(event) => setToken(event.target.value)} required /></div>
            <button className="btn-primary" type="submit" disabled={loading}><Search size={18} /> {loading ? 'Checking report...' : 'Access report'}</button>
          </form>
        </div>
      </details>
    </div>
  );
};

export default TrackReport;
