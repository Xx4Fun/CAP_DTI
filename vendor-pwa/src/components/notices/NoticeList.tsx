import React, { useState } from 'react';
import { CheckCircle2, Eye, Send, Search } from 'lucide-react';
import type { LegalNotice } from '../../app/types';
import { canRespond, formatDate, formatPeso, isFinished, noticeStatusLabel, toNumber } from '../../app/rules';
import { CountdownBadge } from '../common/CountdownBadge';

interface NoticeListProps {
  notices: LegalNotice[];
  onViewNotice: (notice: LegalNotice) => void;
  onRespondNotice: (notice: LegalNotice) => void;
}

export const NoticeList: React.FC<NoticeListProps> = ({ notices, onViewNotice, onRespondNotice }) => {
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [search, setSearch] = useState('');

  const filtered = notices.filter((notice) => {
    if (filter === 'ACTIVE' && isFinished(notice)) return false;
    if (filter === 'RESOLVED' && !isFinished(notice)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (notice.control_number ?? '').toLowerCase().includes(query)
      || notice.flagged_items.some((item) => (item.commodity_name ?? '').toLowerCase().includes(query));
  });

  return (
    <div className="notices-view">
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '11px' }} />
          <input
            type="search"
            aria-label="Search notices"
            className="form-control"
            placeholder="Search by notice ref or commodity..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: 'var(--radius-md)' }}>
          {(['ALL', 'ACTIVE', 'RESOLVED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`btn btn-sm ${filter === tab ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(tab)}
              style={{ padding: '6px 12px' }}
            >
              {tab === 'ALL' ? 'All Notices' : tab === 'ACTIVE' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filtered.length === 0 ? (
          <div className="v-card" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={36} color="var(--success-color)" style={{ margin: '0 auto 10px' }} />
            <p><strong>No notices match the selected criteria.</strong></p>
            <p style={{ fontSize: '0.8rem' }}>Notices issued by DTI Antique to this establishment appear here.</p>
          </div>
        ) : (
          filtered.map((notice) => {
            const isSco = notice.notice_type === 'SCO';
            const isClosed = isFinished(notice);

            return (
              <article key={notice.id} className="v-card" aria-label={`Notice ${notice.control_number ?? notice.id}`} style={{ borderLeft: `4px solid ${isClosed ? 'var(--success-color)' : isSco ? 'var(--danger-color)' : '#F59E0B'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className={`badge ${isClosed ? 'badge-success' : isSco ? 'badge-danger' : 'badge-warning'}`}>
                      {isSco ? 'Show Cause Order' : 'Letter of Inquiry'}
                    </span>
                    <strong style={{ fontSize: '0.95rem' }}>{notice.control_number ?? `Notice #${notice.id}`}</strong>
                    <span className="badge badge-navy">{noticeStatusLabel(notice)}</span>
                  </div>
                  {notice.status === 'issued' && <CountdownBadge dueAt={notice.due_date_timestamp} portal={notice.intended_delivery_method === 'portal'} />}
                </div>

                {notice.flagged_items.length > 0 && (
                  <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Observed commodities ({notice.flagged_items.length}):
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {notice.flagged_items.map((item, index) => {
                        const variance = toNumber(item.variance_percent);
                        return (
                          <span key={`${item.commodity_name}-${index}`} className="badge badge-navy" style={{ fontSize: '0.74rem' }}>
                            {item.commodity_name ?? 'Commodity'}{item.unit ? ` (${item.unit})` : ''} • reference {formatPeso(item.reference_value)} → <strong>{formatPeso(item.observed_price)}</strong>{variance !== null ? ` (${variance > 0 ? '+' : ''}${variance.toFixed(1)}%)` : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Issued <strong>{formatDate(notice.issued_at)}</strong> • Monitored {formatDate(notice.monitoring_date)}
                  </span>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onViewNotice(notice)}>
                      <Eye size={14} />
                      <span>View Notice</span>
                    </button>
                    {canRespond(notice) && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onRespondNotice(notice)}>
                        <Send size={14} />
                        <span>Submit Explanation</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
