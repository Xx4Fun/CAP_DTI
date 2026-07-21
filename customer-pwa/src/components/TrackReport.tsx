import React, { useState } from 'react';
import { Search, CheckCircle } from 'lucide-react';
import { apiClient, type TrackReportResponse } from '../api/client';

export const TrackReport: React.FC = () => {
  const [reference, setReference] = useState('');
  const [token, setToken] = useState('');
  const [report, setReport] = useState<TrackReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference || !token) {
      setError('Please provide both the Report Reference and Secret Tracking Token.');
      return;
    }

    setLoading(true);
    setError('');
    setReport(null);

    try {
      const res = await apiClient.get('/public/reports/track', {
        params: { reference: reference.trim(), token: token.trim() }
      });

      if (res.data.success) {
        setReport(res.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Report not found or invalid tracking token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
          Track Formal Report Status
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
          Enter your public reference and secret tracking token to check DTI evaluation progress.
        </p>

        <form onSubmit={handleTrack} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              PUBLIC REPORT REFERENCE
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. REP-20260722-A8F2"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              SECRET TRACKING TOKEN
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. trk_9a8b7c6d5e4f3a2b..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ padding: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.82rem' }}>
              {error}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading}>
            <Search size={16} /> {loading ? 'Checking Status...' : 'Track Report Status'}
          </button>
        </form>
      </div>

      {report && (
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>STORE / ESTABLISHMENT</div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>
                {report.store_name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '2px' }}>
                Reference: <strong>{report.report_reference}</strong>
              </div>
            </div>

            <span className="badge badge-amber">
              {report.current_status}
            </span>
          </div>

          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
            Sanitized Status Timeline
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {report.status_history.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '50%', padding: '6px', marginTop: '2px' }}>
                  <CheckCircle size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                    {item.status}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '2px' }}>
                    {item.public_message}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
