import React from 'react';
import { CalendarDays, MapPin } from 'lucide-react';

export type RecentReportStatus = 'Processing' | 'Ready to review' | 'Needs recapture' | 'Submitted' | 'Under review' | 'Closed';

export interface RecentReportTicketProps {
  date: string;
  time: string;
  reportId: string;
  store: string;
  status: RecentReportStatus;
  onOpen?: () => void;
}

const statusClassName: Record<RecentReportStatus, string> = {
  Submitted: 'recent-report-ticket-blue',
  Processing: 'recent-report-ticket-processing',
  'Ready to review': 'recent-report-ticket-ready',
  'Needs recapture': 'recent-report-ticket-attention',
  'Under review': 'recent-report-ticket-orange',
  Closed: 'recent-report-ticket-green',
};

export const RecentReportTicket: React.FC<RecentReportTicketProps> = ({
  date,
  time,
  reportId,
  store,
  status,
  onOpen,
}) => {
  const content = <>
    <div className="recent-report-ticket-meta">
      <CalendarDays size={18} aria-hidden="true" />
      <span>{date}</span>
      <span className="recent-report-ticket-separator" aria-hidden="true">•</span>
      <span>{time}</span>
    </div>

    <strong className="recent-report-ticket-id">{reportId}</strong>

    <div className="recent-report-ticket-store">
      <MapPin size={14} aria-hidden="true" />
      <span>{store}</span>
    </div>

    <div className="recent-report-ticket-footer">
      <span className="recent-report-ticket-status">
        <span className="recent-report-ticket-status-dot" aria-hidden="true" />
        {status}
      </span>
      <span className="recent-report-ticket-barcode" aria-hidden="true" />
    </div>
  </>;

  return onOpen ? (
    <button
      type="button"
      className={`recent-report-ticket recent-report-ticket-button ${statusClassName[status]}`}
      aria-label={`Open report ${reportId.replace(/^#/, '')}: ${status}`}
      onClick={onOpen}
    >
      {content}
    </button>
  ) : (
    <article className={`recent-report-ticket ${statusClassName[status]}`} aria-label={`Report ${reportId.replace(/^#/, '')}`}>
      {content}
    </article>
  );
};

export default RecentReportTicket;
