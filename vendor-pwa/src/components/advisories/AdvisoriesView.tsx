import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Calendar, MapPin, ShieldAlert, AlertTriangle, RotateCw } from 'lucide-react';
import type { Advisory, EmergencyInfo } from '../../app/types';
import { formatDate, formatPeso } from '../../app/rules';

interface AdvisoriesViewProps {
  advisories: Advisory[] | null;
  emergency: EmergencyInfo | null;
  error: string;
  onRetry: () => void;
}

export const AdvisoriesView: React.FC<AdvisoriesViewProps> = ({ advisories, emergency, error, onRetry }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="advisories-view">
      <div className="page-header">
        <div>
          <h2>DTI Regulatory Advisories & Price Freezes</h2>
          <p>Emergency price freezes and recent SRP updates for San Jose de Buenavista</p>
        </div>
      </div>

      <div className="v-card" style={{
        background: emergency ? 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)' : 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
        border: emergency ? '1.5px solid #EF4444' : '1.5px solid #86EFAC',
        marginBottom: '18px',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: emergency ? '#DC2626' : '#16A34A', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {emergency ? <ShieldAlert size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: emergency ? '#991B1B' : '#166534' }}>
              {emergency ? 'PRICE FREEZE IN EFFECT' : 'NO ACTIVE PRICE FREEZE'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: emergency ? '#7F1D1D' : '#14532D', marginTop: '4px', lineHeight: 1.4 }}>
              {emergency
                ? `Declared ${emergency.declaration_reference ?? ''} for ${emergency.location ?? 'the covered area'} from ${formatDate(emergency.starts_on)}${emergency.ends_on ? ` to ${formatDate(emergency.ends_on)}` : ''}. Covered goods are monitored against the official ceiling.`
                : 'Standard monitoring applies: shelf prices are reviewed when they are more than 10% above the current SRP.'}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="v-card portal-status" role="alert">
          <AlertTriangle size={32} color="var(--danger-color)" style={{ margin: '0 auto 10px' }} />
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: '12px' }}><RotateCw size={14} /><span>Retry</span></button>
        </div>
      ) : !advisories ? (
        <div className="v-card portal-status" role="status">Loading advisories…</div>
      ) : advisories.length === 0 ? (
        <div className="v-card portal-status">No recent advisories. Price freezes from the last 90 days and SRP updates from the last 30 days appear here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {advisories.map((advisory) => {
            const isExpanded = expandedId === advisory.id;
            return (
              <div key={advisory.id} className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : advisory.id)}
                  style={{ width: '100%', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', border: 0, background: isExpanded ? '#F8FAFC' : '#FFFFFF', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none' }}
                >
                  <span style={{ flex: 1, paddingRight: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span className={`badge ${advisory.category === 'PRICE_FREEZE' ? 'badge-danger' : 'badge-navy'}`}>{advisory.category === 'PRICE_FREEZE' ? 'Price freeze' : 'SRP update'}</span>
                      {advisory.reference && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Ref: <code>{advisory.reference}</code></span>}
                      {advisory.category === 'PRICE_FREEZE' && <span className={`badge ${advisory.state === 'scheduled' ? 'badge-warning' : advisory.is_active ? 'badge-danger' : 'badge-success'}`}>{advisory.state === 'scheduled' ? 'Scheduled' : advisory.is_active ? 'In effect' : 'Ended'}</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>{advisory.title}</span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /><span>{formatDate(advisory.published_date)}{advisory.ends_on ? ` – ${formatDate(advisory.ends_on)}` : ''}</span></span>
                      {advisory.affected_areas.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /><span>{advisory.affected_areas.join(', ')}</span></span>}
                    </span>
                  </span>
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {isExpanded && (
                  <div style={{ padding: '16px 20px', background: '#FFFFFF', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    {advisory.items.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '18px' }}>
                        {advisory.items.map((item, index) => <li key={`${item.commodity_name}-${index}`}>{item.commodity_name}{item.unit ? ` (${item.unit})` : ''}: {formatPeso(item.baseline_price)}</li>)}
                      </ul>
                    ) : (
                      <p>Covered goods are monitored against official ceilings for the duration of this declaration. Check the SRP Guide for each product's current reference.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
