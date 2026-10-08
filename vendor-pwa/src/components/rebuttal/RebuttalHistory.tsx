import React from 'react';
import { CheckCircle2, Clock, Paperclip, FileCheck, Eye } from 'lucide-react';
import type { LegalNotice } from '../../app/types';
import { OUTCOME_LABELS, attachmentCategoryLabel, canRespond, formatDate, isFinished, reasonLabel } from '../../app/rules';

interface RebuttalHistoryProps {
  notices: LegalNotice[];
  onViewNotice: (notice: LegalNotice) => void;
  onStartNewRebuttal: () => void;
  onBackToNotices?: () => void;
}

export const RebuttalHistory: React.FC<RebuttalHistoryProps> = ({ notices, onViewNotice, onStartNewRebuttal, onBackToNotices }) => {
  const responses = notices
    .filter((notice) => notice.response_received_at)
    .sort((a, b) => new Date(b.response_received_at ?? 0).getTime() - new Date(a.response_received_at ?? 0).getTime());
  const hasOpenNotice = notices.some(canRespond);

  return (
    <div className="rebuttals-view">
      <div className="v-card-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--dti-navy)' }}>Submitted Responses & Explanations</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Record of explanations submitted to DTI Antique for this establishment</p>
        </div>
        {hasOpenNotice ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onStartNewRebuttal}>Respond to an open notice</button>
        ) : (
          <span className="badge badge-success" style={{ padding: '6px 12px' }}>
            <CheckCircle2 size={13} />
            <span>No pending inquiries</span>
          </span>
        )}
      </div>

      <div className="notices-mode-switch" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {onBackToNotices && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onBackToNotices}
            style={{ borderRadius: 'var(--radius-full)', padding: '6px 14px', fontWeight: 600 }}
          >
            Issued Notices ({notices.length})
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ borderRadius: 'var(--radius-full)', padding: '6px 14px', fontWeight: 700 }}
        >
          Response History ({responses.length})
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {responses.length === 0 ? (
          <div className="v-card" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
            <FileCheck size={36} color="var(--dti-navy)" style={{ margin: '0 auto 10px' }} />
            <p><strong>No responses submitted yet.</strong></p>
            <p style={{ fontSize: '0.8rem' }}>When you respond to a notice, the submission is recorded here.</p>
          </div>
        ) : (
          responses.map((notice) => (
            <article key={notice.id} className="v-card" aria-label={`Response to ${notice.control_number ?? notice.id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--dti-navy)' }}>{notice.control_number ?? `Notice #${notice.id}`}</strong>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>Submitted {formatDate(notice.response_received_at, true)}</div>
                </div>
                {notice.status === 'cancelled' ? (
                  <span className="badge badge-navy"><CheckCircle2 size={13} /><span>Withdrawn by DTI</span></span>
                ) : isFinished(notice) ? (
                  <span className="badge badge-success"><CheckCircle2 size={13} /><span>{notice.outcome ? OUTCOME_LABELS[notice.outcome] : 'Notice closed'}</span></span>
                ) : (
                  <span className="badge badge-warning"><Clock size={13} /><span>Under DTI review</span></span>
                )}
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                {notice.response_reason_category
                  ? <strong style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Reason: {reasonLabel(notice.response_reason_category)}</strong>
                  : notice.response_channel && notice.response_channel !== 'portal' && <strong style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Your {notice.response_channel} reply, as recorded by DTI</strong>}
                {notice.response_text && <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{notice.response_text}</p>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {notice.attachments.map((attachment, index) => (
                    <span key={attachment.id ? `att-${attachment.id}` : `${notice.id}-${index}-${attachment.original_name}`} className="badge badge-navy">
                      <Paperclip size={12} />
                      <span>{attachment.original_name} • {attachmentCategoryLabel(attachment.category)}</span>
                    </span>
                  ))}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onViewNotice(notice)}>
                  <Eye size={14} />
                  <span>View Notice</span>
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
