import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, Clock, ShieldCheck, ArrowLeft, Copy, Check, AlertTriangle, FileSearch, Building2, Calendar } from 'lucide-react';
import { apiClient, type TrackReportResponse } from '../api/client';
import { deriveTimelineItems } from '../app/status';

interface TrackReportProps {
  initialReference?: string;
  initialToken?: string;
  setActiveTab?: (tab: string) => void;
}

export const TrackReport: React.FC<TrackReportProps> = ({
  initialReference = '',
  initialToken = '',
  setActiveTab,
}) => {
  const [reference, setReference] = useState(initialReference);
  const [token, setToken] = useState(initialToken);
  const [report, setReport] = useState<TrackReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);

  useEffect(() => {
    if (initialReference && initialToken) {
      setReference(initialReference);
      setToken(initialToken);
      executeTracking(initialReference, initialToken);
    }
  }, [initialReference, initialToken]);

  const executeTracking = async (refVal: string, tokVal: string) => {
    if (!refVal || !tokVal) {
      setError('Please provide both the Report Reference Code and Secret Tracking Token.');
      return;
    }

    setLoading(true);
    setError('');
    setReport(null);

    try {
      const res = await apiClient.get('/public/reports/track', {
        params: { reference: refVal.trim(), token: tokVal.trim() }
      });

      if (res.data && res.data.success) {
        setReport(res.data.data);
      } else {
        throw new Error('API returned unsuccesful tracking query');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Report not found or invalid tracking token. Please verify your reference and secret code.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeTracking(reference, token);
  };

  const handleCopyRef = () => {
    if (report) {
      navigator.clipboard.writeText(report.report_reference);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('resolved') || s.includes('complete') || s.includes('validated')) {
      return <span className="badge badge-green">✓ {status}</span>;
    }
    if (s.includes('dispatched') || s.includes('inspection')) {
      return <span className="badge badge-blue">🔍 {status}</span>;
    }
    return <span className="badge badge-amber">⏱ {status}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>Track Report Status</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            View the real-time evaluation status and public audit trail for your submitted report.
          </p>
        </div>
        {setActiveTab && (
          <button
            className="btn-secondary"
            style={{ width: 'auto', padding: '8px 14px', fontSize: '0.82rem' }}
            onClick={() => setActiveTab('reports')}
          >
            <ArrowLeft size={16} /> Back to Reports
          </button>
        )}
      </div>

      {/* Tracking Search Card */}
      <div className="glass-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div className="icon-wrapper-green">
            <FileSearch size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>Enter Report Credentials</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Required to access protected report tracking logs</div>
          </div>
        </div>

        <form onSubmit={handleTrackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="report-reference" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              PUBLIC REPORT REFERENCE CODE
            </label>
            <input
              id="report-reference"
              type="text"
              className="input-field"
              placeholder="e.g. PW-2026-00184 or REP-20260724-A8F2"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="tracking-token" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              SECRET TRACKING TOKEN
            </label>
            <input
              id="tracking-token"
              type="password"
              className="input-field"
              placeholder="e.g. trk_9a8b7c6d5e4f3a2b..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>

          {error && (
            <div role="alert" className="banner-warning" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading}>
            <Search size={18} />
            {loading ? 'Checking Status...' : 'Track Report Status'}
          </button>
        </form>
      </div>

      {/* Report Result Timeline */}
      {report && (
        <div className="glass-panel" style={{ margin: 0 }}>
          {/* Header Summary Box */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  PUBLIC REPORT REFERENCE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {report.report_reference}
                  </span>
                  <button
                    onClick={handleCopyRef}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                    title="Copy Reference"
                  >
                    {copiedRef ? <Check size={16} color="var(--accent-green)" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {getStatusBadge(report.current_status)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 size={13} /> ESTABLISHMENT
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)', marginTop: '2px' }}>
                  {report.store_name}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={13} /> SUBMITTED ON
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)', marginTop: '2px' }}>
                  {isNaN(Date.parse(report.submitted_at))
                    ? report.submitted_at
                    : new Date(report.submitted_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            </div>
          </div>

          {/* Stepper Title */}
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="var(--primary)" /> Evaluation Progress & Public Timeline
          </div>

          {/* Timeline Items */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {deriveTimelineItems(report.status_history, report.current_status).map((item, idx: number) => {
              const isCompleted = item.state === 'completed';
              const isActive = item.state === 'current';

              return (
                <div
                  key={idx}
                  className={`stepper-item ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                >
                  <div className="stepper-icon">
                    {isCompleted ? <CheckCircle size={18} /> : (idx + 1)}
                  </div>
                  <div style={{ flex: 1, paddingTop: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span aria-current={isActive ? 'step' : undefined} style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                        {item.status}
                      </span>
                      {isActive && <span className="badge badge-amber" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>In Progress</span>}
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                      {item.public_message}
                    </p>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px', fontWeight: 500 }}>
                      {isNaN(Date.parse(item.timestamp))
                        ? item.timestamp
                        : new Date(item.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Security Note */}
          <div className="banner-info" style={{ marginTop: '16px' }}>
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Privacy & Anonymity Protected:</strong> Specific internal investigative notes and store-owner rebuttal uploads are restricted to authorized DTI legal evaluators.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackReport;
