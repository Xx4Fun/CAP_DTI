import React from 'react';
import { FileText, Send, ChevronRight, Clock } from 'lucide-react';
import type { LegalNotice } from '../../app/types';
import { canRespond, formatDate, noticeStatusLabel } from '../../app/rules';
import { CountdownBadge } from '../common/CountdownBadge';

interface ActiveNoticeBannerProps {
  notice: LegalNotice;
  onViewNotice: (notice: LegalNotice) => void;
  onRespondNotice: (notice: LegalNotice) => void;
}

export const ActiveNoticeBanner: React.FC<ActiveNoticeBannerProps> = ({ notice, onViewNotice, onRespondNotice }) => {
  const isSco = notice.notice_type === 'SCO';
  const itemCount = notice.flagged_items.length;
  const respondable = canRespond(notice);

  return (
    <section className={`active-notice-card ${isSco ? 'notice-sco' : 'notice-loi'}`} aria-label="Active regulatory notice">
      <div className="notice-card-header">
        <div className="notice-type-pill">
          <span className="notice-dot" />
          <span className="notice-type-name">{isSco ? 'Show Cause Order' : 'Letter of Inquiry'}</span>
        </div>
        {notice.status === 'issued' ? <CountdownBadge dueAt={notice.due_date_timestamp} /> : <span className="countdown-badge pending">{noticeStatusLabel(notice)}</span>}
      </div>

      <div className="notice-card-body">
        <h2 className="notice-ref-title">Ref: {notice.control_number ?? `Notice #${notice.id}`}</h2>
        <p className="notice-summary-text">
          {itemCount > 0
            ? `${itemCount} ${itemCount === 1 ? 'commodity was' : 'commodities were'} observed above the captured price reference during monitoring.`
            : 'DTI Antique issued this notice to your establishment.'}
        </p>
        <div className="notice-meta-tag">
          <Clock size={13} />
          <span>Monitored on <strong>{formatDate(notice.monitoring_date)}</strong> • {noticeStatusLabel(notice)}</span>
        </div>
      </div>

      <div className="notice-card-actions">
        <button type="button" className="notice-btn notice-btn-secondary" onClick={() => onViewNotice(notice)}>
          <FileText size={16} />
          <span>View Notice</span>
        </button>

        {respondable && (
          <button
            type="button"
            className={`notice-btn ${isSco ? 'notice-btn-danger' : 'notice-btn-primary'}`}
            onClick={() => onRespondNotice(notice)}
          >
            <Send size={15} />
            <span>Submit Formal Explanation</span>
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </section>
  );
};
