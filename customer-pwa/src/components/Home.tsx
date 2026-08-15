import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  FileCheck2,
  ScanLine,
} from 'lucide-react';
import { RecentReportTicket, type RecentReportTicketProps } from './RecentReportTicket';
import './Home.css';

interface HomeProps {
  setActiveTab: (tab: string) => void;
  stateOfCalamity?: boolean;
  bulletinDate?: string;
  totalCommodities?: number;
  bulletinStatus?: 'loading' | 'available' | 'empty' | 'error';
  lastSyncTime?: string;
  dataSource?: 'checking' | 'cached' | 'live' | 'unavailable';
  recentReports?: RecentReportTicketProps[];
}

export const Home: React.FC<HomeProps> = ({
  setActiveTab,
  stateOfCalamity,
  bulletinDate,
  totalCommodities,
  bulletinStatus,
  lastSyncTime,
  dataSource = 'checking',
  recentReports = [],
}) => {
  const [rightsExpanded, setRightsExpanded] = useState(false);
  const monitoringStatus = stateOfCalamity === undefined
    ? null
    : stateOfCalamity
      ? { label: 'Calamity active', tone: 'calamity' }
      : { label: 'Normal monitoring', tone: 'normal' };
  const resolvedBulletinStatus = bulletinStatus
    ?? (bulletinDate || totalCommodities != null ? 'available' : 'empty');
  const unavailableLabel = resolvedBulletinStatus === 'loading'
    ? 'Loading...'
    : resolvedBulletinStatus === 'error'
      ? 'Unable to load'
      : 'Unavailable';
  const hasRecentReports = recentReports.length > 0;

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-welcome-title">
        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <h1 id="home-welcome-title" aria-label="Check prices with confidence">Check prices<br />with confidence</h1>
            <p>Verify prices, report concerns, and stay informed.</p>
          </div>
          <div className="home-hero-art-frame">
            <img
              className="home-hero-art"
              src="/home/1.webp"
              alt="Grocery basket with essential goods"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <div className="home-content-shell">
        <div className="home-main-content">
          <div className="home-action-grid" aria-label="Quick actions">
            <button
              type="button"
              className="home-action-card home-action-card-scan"
              onClick={() => setActiveTab('scan')}
              aria-label="Scan shelf tag"
            >
              <div className="home-action-top">
                <span className="home-action-icon"><ScanLine size={22} aria-hidden="true" /></span>
                <svg className="home-action-dots" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="4" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="31" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="31" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="31" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="31" r="1.5" fill="currentColor" />
                </svg>
              </div>

              <div className="home-action-copy">
                <strong className="home-action-title">Scan shelf tag</strong>
                <span className="home-action-subtitle">Compare any price instantly</span>
              </div>

              <span className="home-action-arrow"><ChevronRight size={18} aria-hidden="true" /></span>
            </button>

            <button
              type="button"
              className="home-action-card home-action-card-report"
              onClick={() => setActiveTab('reports')}
              aria-label="Report concern"
            >
              <div className="home-action-top">
                <span className="home-action-icon"><FileCheck2 size={22} aria-hidden="true" /></span>
                <svg className="home-action-dots" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="4" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="4" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="13" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="22" r="1.5" fill="currentColor" />
                  <circle cx="4" cy="31" r="1.5" fill="currentColor" />
                  <circle cx="13" cy="31" r="1.5" fill="currentColor" />
                  <circle cx="22" cy="31" r="1.5" fill="currentColor" />
                  <circle cx="31" cy="31" r="1.5" fill="currentColor" />
                </svg>
              </div>

              <div className="home-action-copy">
                <strong className="home-action-title">Report concern</strong>
                <span className="home-action-subtitle">Submit receipt to DTI and help others</span>
              </div>

              <span className="home-action-arrow"><ChevronRight size={18} aria-hidden="true" /></span>
            </button>
          </div>

          <section className="home-bulletin" aria-labelledby="current-bulletin-title">
            <div className="home-bulletin-copy">
              <h2 id="current-bulletin-title">Current price bulletin</h2>
              {monitoringStatus && (
                <span className={`home-monitoring-status home-monitoring-status-${monitoringStatus.tone}`}>
                  <span className="home-monitoring-dot" aria-hidden="true" />
                  {monitoringStatus.label}
                </span>
              )}

              <div className="home-bulletin-stats">
                <div>
                  <span>Effective date</span>
                  <strong>{bulletinDate || unavailableLabel}</strong>
                </div>
                <div>
                  <span>Reference prices</span>
                  <strong>{totalCommodities != null ? `${totalCommodities} available` : unavailableLabel}</strong>
                </div>
              </div>

              <div className="home-bulletin-updated">
                <Clock3 size={17} aria-hidden="true" />
                <span>{dataSource === 'cached' ? 'Cached copy' : 'Last updated'}</span>
                <strong>{lastSyncTime || 'Not synced'}</strong>
              </div>

              <button
                type="button"
                className="home-bulletin-link"
                onClick={() => setActiveTab('prices')}
              >
                View bulletin details <ArrowRight size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="home-bulletin-art-frame">
              <img
                className="home-bulletin-art"
                src="/home/2.webp"
                alt="Current price bulletin illustration"
                loading="lazy"
                decoding="async"
              />
            </div>
          </section>

          <section className="home-recent-reports" aria-labelledby="recent-reports-title">
            <div className="home-section-heading">
              <h2 id="recent-reports-title">Recently reported</h2>
              {hasRecentReports && (
                <button
                  type="button"
                  onClick={() => setActiveTab('track')}
                  aria-label="View all recent reports"
                >
                  View all
                </button>
              )}
            </div>

            {hasRecentReports ? (
              <div className="recent-reports-carousel" aria-label="Recent reports">
                {recentReports.map((report) => (
                  <RecentReportTicket key={report.reportId} {...report} />
                ))}
              </div>
            ) : (
              <div className="home-reports-empty">
                <h3>No reports yet</h3>
                <p>Have a price concern? Submit a receipt for DTI review.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  aria-label="Report a price concern"
                >
                  Report concern <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </section>

          <section className={`home-rights-card ${rightsExpanded ? 'home-rights-card-expanded' : ''}`}>
            <div className="home-rights-art-frame">
              <img
                className="home-rights-art"
                src="/home/3.webp"
                alt="Consumer rights protection illustration"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="home-rights-copy">
              <h2>Know your rights as a customer</h2>
              <p>Learn more about fair pricing and reporting violations.</p>
              {rightsExpanded && (
                <p className="home-rights-detail">
                  Compare posted prices with current DTI references and keep your receipt when reporting a concern.
                </p>
              )}
            </div>
            <button
              type="button"
              className="home-rights-action"
              onClick={() => setRightsExpanded((expanded) => !expanded)}
              aria-label="Learn about consumer rights"
              aria-expanded={rightsExpanded}
            >
              <ArrowRight size={22} aria-hidden="true" />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Home;
