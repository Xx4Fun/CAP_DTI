import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, ClipboardPaste, FileSearch, MapPin, Search } from 'lucide-react';
import { apiClient, type TrackReportResponse } from '../api/client';
import type { AppRoute } from '../app/routing';
import { deriveTimelineItems } from '../app/status';
import { CopyButton } from './ui/CopyButton';
import { Field, PasswordField } from './ui/Field';
import { StatusBanner } from './ui/StatusBanner';

type TrackReportProps = { initialReference?: string; initialToken?: string; onNavigate: (route: AppRoute) => void };

export function TrackReport({ initialReference = '', initialToken = '', onNavigate }: TrackReportProps) {
  const [reference, setReference] = useState(initialReference);
  const [token, setToken] = useState(initialToken);
  const [report, setReport] = useState<TrackReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState('');

  const execute = async (referenceValue: string, tokenValue: string) => {
    if (!referenceValue.trim() || !tokenValue.trim()) { setError('Enter both the report reference and secret tracking token.'); return; }
    setLoading(true); setError(''); setReport(null);
    try {
      const response = await apiClient.get('/public/reports/track', { params: { reference: referenceValue.trim(), token: tokenValue.trim() } });
      if (!response.data?.success || !response.data.data) throw new Error(response.data?.message || 'No report matched those credentials.');
      setReport(response.data.data);
    } catch (reason) {
      const message = typeof reason === 'object' && reason !== null && 'response' in reason
        ? (reason as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || (reason instanceof Error ? reason.message : 'No report matched those credentials. Check both codes and try again.'));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (initialReference && initialToken) void execute(initialReference, initialToken); }, [initialReference, initialToken]);
  const submit = (event: FormEvent) => { event.preventDefault(); void execute(reference, token); };
  const pasteToken = async () => {
    try { const value = await navigator.clipboard.readText(); setToken(value); setPasteFeedback('Secret token pasted.'); }
    catch { setPasteFeedback('Clipboard permission was not available. Paste into the field manually.'); }
  };
  const timeline = report ? deriveTimelineItems(report.status_history, report.current_status) : [];

  return <section className="tracking-page" aria-labelledby="tracking-title">
    <button className="back-link" type="button" onClick={() => onNavigate({ name: 'reports' })}><ArrowLeft aria-hidden="true" /> Back to reports</button>
    <header className="page-header"><p className="page-kicker">Private report access</p><h1 id="tracking-title">Track report status</h1><p className="page-intro">Enter both credentials exactly as shown after submission. The secret token is not stored in this browser.</p></header>
    <div className="tracking-layout">
      <form className="workflow-card tracking-form" onSubmit={submit}>
        <div className="section-heading"><FileSearch aria-hidden="true" /><div><h2>Report credentials</h2><p>Both fields are required.</p></div></div>
        <Field label="Report reference number" name="reference" autoComplete="off" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. REP-20260725-A8F2" />
        <div className="token-field-row"><PasswordField label="Secret tracking token" revealLabel="secret tracking token" name="token" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter the private token" />{'clipboard' in navigator && typeof navigator.clipboard.readText === 'function' && <button className="button button--quiet" type="button" onClick={() => void pasteToken()}><ClipboardPaste aria-hidden="true" /> Paste</button>}</div>
        <span className="ui-sr-only" role="status" aria-live="polite">{pasteFeedback}</span>
        {error && <StatusBanner variant="error" title="Report not found">{error}</StatusBanner>}
        <button className="button button--primary" type="submit" disabled={loading}><Search aria-hidden="true" /> {loading ? 'Checking status…' : 'Track report'}</button>
      </form>

      {report ? <article className="tracking-result" aria-labelledby="tracking-result-title">
        <div className="tracking-summary"><div><p className="page-kicker">Public report reference</p><div className="reference-line"><h2 id="tracking-result-title">{report.report_reference}</h2><CopyButton value={report.report_reference} label="Copy reference number" /></div></div><span className="status-chip">{report.current_status}</span></div>
        <dl className="tracking-meta"><div><dt><MapPin aria-hidden="true" /> Establishment</dt><dd>{report.store_name}</dd></div><div><dt><CalendarDays aria-hidden="true" /> Submitted</dt><dd>{Number.isNaN(Date.parse(report.submitted_at)) ? report.submitted_at : new Date(report.submitted_at).toLocaleString()}</dd></div></dl>
        <section className="timeline" aria-labelledby="timeline-title"><h3 id="timeline-title">Evaluation timeline</h3><ol>{timeline.map((item, index) => <li className={`timeline-item is-${item.state}`} key={`${item.status}-${index}`}><span className="timeline-marker" aria-hidden="true" /><div><div className="timeline-label"><strong aria-current={item.state === 'current' ? 'step' : undefined}>{item.status}</strong><small>{item.state === 'completed' ? 'Completed' : item.state === 'current' ? 'Current status' : 'Upcoming'}</small></div><p>{item.public_message}</p><time>{Number.isNaN(Date.parse(item.timestamp)) ? item.timestamp : new Date(item.timestamp).toLocaleString()}</time></div></li>)}</ol></section>
        <StatusBanner title="Status comes from the DTI reporting service">Updates appear here after authorized personnel record them.</StatusBanner>
      </article> : <aside className="tracking-placeholder"><FileSearch aria-hidden="true" /><h2>Your report timeline will appear here</h2><p>Credentials are checked securely and are not added to the page URL.</p></aside>}
    </div>
  </section>;
}
