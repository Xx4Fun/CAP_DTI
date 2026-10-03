import React, { useState } from 'react';
import { X, Download, Send, FileText, AlertTriangle } from 'lucide-react';
import type { LegalNotice } from '../../app/types';
import { OUTCOME_LABELS, attachmentCategoryLabel, canRespond, formatDate, formatPeso, noticeStatusLabel, reasonLabel, responseBlockedReason, toNumber } from '../../app/rules';
import { CountdownBadge } from '../common/CountdownBadge';

interface NoticeDetailModalProps {
  notice: LegalNotice | null;
  onClose: () => void;
  onStartRebuttal: (notice: LegalNotice) => void;
  onOpenDocument: (notice: LegalNotice) => Promise<void>;
}

export const NoticeDetailModal: React.FC<NoticeDetailModalProps> = ({ notice, onClose, onStartRebuttal, onOpenDocument }) => {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  if (!notice) return null;

  const isSco = notice.notice_type === 'SCO';
  const blocked = responseBlockedReason(notice);

  const openDocument = async () => {
    setOpening(true);
    setError('');
    try {
      await onOpenDocument(notice);
    } catch (requestError) {
      setError(requestError instanceof Error && requestError.message ? requestError.message : 'The official document could not be opened.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="notice-detail-title" onClick={onClose}>
      <div className="modal-dialog" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '720px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--dti-navy)" />
            <h2 id="notice-detail-title">{isSco ? 'Show Cause Order' : 'Letter of Inquiry'}</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            background: isSco ? '#FEF2F2' : '#FFFBEB',
            border: isSco ? '1px solid #FCA5A5' : '1px solid #FDE68A',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`badge ${isSco ? 'badge-danger' : 'badge-warning'}`}>{noticeStatusLabel(notice)}</span>
              <strong style={{ fontSize: '0.84rem' }}>{notice.control_number ?? `Notice #${notice.id}`}</strong>
            </div>
            {notice.status === 'issued' && <CountdownBadge dueAt={notice.due_date_timestamp} portal={notice.intended_delivery_method === 'portal'} />}
          </div>

          <div className="dti-doc-container">
            <div className="dti-doc-recipient">
              <p><strong>Establishment:</strong> {notice.store?.store_name ?? 'Not recorded'}</p>
              <p><strong>Address:</strong> {notice.store?.address ?? 'Not recorded'}</p>
              <p><strong>Issued:</strong> {formatDate(notice.issued_at, true)}</p>
              <p><strong>Delivery:</strong> {notice.delivery_state === 'not_recorded' ? (notice.intended_delivery_method === 'portal' ? 'Not yet opened by you' : 'Not yet recorded') : `${notice.delivery_state} ${notice.delivered_at ? `on ${formatDate(notice.delivered_at, true)}` : ''}`}</p>
              <p><strong>Response deadline:</strong> {notice.due_date_timestamp ? formatDate(notice.due_date_timestamp, true) : notice.intended_delivery_method === 'portal' ? 'Starts when you open the official document' : 'Starts after DTI records delivery'}</p>
              {notice.preceding_control_number && <p><strong>Follows:</strong> Letter of Inquiry {notice.preceding_control_number}</p>}
              {notice.reason && <p><strong>Reason:</strong> {notice.reason}</p>}
              {notice.legal_bases && notice.legal_bases.length > 0 && <p><strong>Legal basis:</strong> {notice.legal_bases.join('; ')}</p>}
            </div>

            {notice.outcome && (
              <div className="notice-outcome" role="status">
                <strong>{notice.outcome === 'withdrawn' ? 'Withdrawn by DTI' : `DTI decision: ${OUTCOME_LABELS[notice.outcome]}`}</strong>
                {notice.outcome === 'escalated_to_sco' && <span>DTI followed this letter with a Show Cause Order, which appears as a separate notice.</span>}
                {notice.outcome_reason && <span>{notice.outcome_reason}</span>}
              </div>
            )}

            <p style={{ marginBottom: '14px' }}>
              During price monitoring on <strong>{formatDate(notice.monitoring_date)}</strong>, the following commodities were recorded above the captured price reference. This summary is for convenience; the signed PDF is the official notice.
            </p>

            {notice.flagged_items.length > 0 && (
              <div className="v-table-wrap" style={{ marginBottom: '16px' }}>
                <table className="v-table">
                  <caption className="sr-only">Observed commodities</caption>
                  <thead>
                    <tr>
                      <th>Commodity</th>
                      <th>Unit</th>
                      <th>Reference</th>
                      <th>Observed price</th>
                      <th>Variance</th>
                      {notice.flagged_items.some((item) => item.decision) && <th>DTI decision</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {notice.flagged_items.map((item, index) => {
                      const variance = toNumber(item.variance_percent);
                      return (
                        <tr key={`${item.commodity_name}-${index}`}>
                          <td>
                            <strong>{item.commodity_name ?? 'Commodity'}</strong>
                            {item.reference_label && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.reference_label}</div>}
                          </td>
                          <td>{item.unit ?? '—'}</td>
                          <td>{formatPeso(item.reference_value)}</td>
                          <td style={{ color: 'var(--danger-color)', fontWeight: 700 }}>{formatPeso(item.observed_price)}</td>
                          <td>{variance !== null ? <span className="badge badge-danger">{variance > 0 ? '+' : ''}{variance.toFixed(1)}%</span> : '—'}</td>
                          {notice.flagged_items.some((entry) => entry.decision) && <td>{item.decision === 'confirmed' ? 'Confirmed' : item.decision === 'not_confirmed' ? 'Not confirmed' : '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {notice.response_received_at && (
              <div style={{ background: '#F1F5F9', padding: '12px', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--dti-navy)' }}>
                <p><strong>{notice.response_channel === 'email' || notice.response_channel === 'paper' ? `Your ${notice.response_channel} reply, as recorded by DTI` : 'Your response'}</strong> • received {formatDate(notice.response_received_at, true)}</p>
                {notice.response_reason_category && <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Reason: {reasonLabel(notice.response_reason_category)}</p>}
                {notice.response_text && <p style={{ fontSize: '0.82rem', marginTop: '6px', whiteSpace: 'pre-wrap' }}>{notice.response_text}</p>}
                {notice.attachments.length > 0 && (
                  <p style={{ fontSize: '0.76rem', marginTop: '6px', color: 'var(--text-muted)' }}>
                    Attachments: {notice.attachments.map((attachment) => `${attachment.original_name} (${attachmentCategoryLabel(attachment.category)})`).join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          {error && <div role="alert" className="portal-error" style={{ marginTop: '14px' }}><AlertTriangle size={16} /><span>{error}</span></div>}
          {blocked && notice.status === 'issued' && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>{blocked}</p>}
        </div>

        <div className="modal-footer">
          {notice.status === 'issued' && notice.intended_delivery_method === 'portal' && ['not_recorded', 'failed'].includes(notice.delivery_state) && (
            <p className="notice-receipt-warning">Opening the official document records that you received this notice and starts your response period.</p>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openDocument()} disabled={opening}>
            <Download size={15} />
            <span>{opening ? 'Opening…' : 'Open official document (PDF)'}</span>
          </button>

          {canRespond(notice) && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onClose();
                onStartRebuttal(notice);
              }}
            >
              <Send size={15} />
              <span>Start Response</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
