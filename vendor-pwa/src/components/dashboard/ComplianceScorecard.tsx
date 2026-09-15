import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileWarning,
  FileText,
  Send,
  BookOpen,
  Calculator,
  ChevronRight,
  CalendarCheck2,
} from 'lucide-react';
import type { ActiveTab, EmergencyInfo, LegalNotice, VendorStore } from '../../app/types';
import { formatDate } from '../../app/rules';
import { ActiveNoticeBanner } from './ActiveNoticeBanner';

interface ComplianceScorecardProps {
  store: VendorStore;
  emergency: EmergencyInfo | null;
  activeNoticeCount: number;
  onNavigateTab: (tab: ActiveTab) => void;
  activeNotice: LegalNotice | null;
  onViewNotice: (notice: LegalNotice) => void;
  onRespondNotice: (notice: LegalNotice) => void;
}

const STATUS_LABELS: Record<VendorStore['compliance_status'], string> = {
  IN_GOOD_STANDING: 'No open notices',
  UNDER_INQUIRY: 'Letter of Inquiry open',
  SHOW_CAUSE_ISSUED: 'Show Cause Order open',
};

export const ComplianceScorecard: React.FC<ComplianceScorecardProps> = ({
  store,
  emergency,
  activeNoticeCount,
  onNavigateTab,
  activeNotice,
  onViewNotice,
  onRespondNotice,
}) => {
  const isGoodStanding = store.compliance_status === 'IN_GOOD_STANDING';
  const isLoi = store.compliance_status === 'UNDER_INQUIRY';
  const isSco = store.compliance_status === 'SHOW_CAUSE_ISSUED';
  const recidivism = store.recidivism_index ?? 0;

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero" aria-label="Establishment Profile">
        <div className="dashboard-hero-inner">
          <div className="dashboard-hero-top">
            <div className={`hero-status-pill ${emergency ? 'pill-calamity' : 'pill-normal'}`}>
              <span className="hero-status-dot" />
              <span>{emergency ? 'Price Freeze in effect' : 'Standard price monitoring'}</span>
            </div>
          </div>

          <div className="dashboard-hero-content">
            <h1 className="dashboard-store-name">{store.store_name}</h1>
            <p className="dashboard-store-meta">
              {store.dti_sec_number ? <>DTI-SEC Reg. <strong>{store.dti_sec_number}</strong> • </> : null}{store.address}
            </p>
          </div>
        </div>
      </section>

      <div className="dashboard-content-shell">
        <div className="dashboard-main-flow">
          {activeNotice && (
            <ActiveNoticeBanner notice={activeNotice} onViewNotice={onViewNotice} onRespondNotice={onRespondNotice} />
          )}

          <section className="dashboard-stats-strip" aria-label="Regulatory Standing & Metrics">
            <div className={`stat-strip-card ${isGoodStanding ? 'stat-success' : isLoi ? 'stat-warning' : 'stat-danger'}`}>
              <span className="stat-card-label">Notice Status</span>
              <div className="stat-card-value-wrap">
                {isGoodStanding && <ShieldCheck size={18} className="text-success" />}
                {isLoi && <AlertTriangle size={18} className="text-warning" />}
                {isSco && <FileWarning size={18} className="text-danger" />}
                <strong className="stat-card-title">{STATUS_LABELS[store.compliance_status]}</strong>
              </div>
            </div>

            <div className="stat-strip-card">
              <span className="stat-card-label">Price Reference</span>
              <div className="stat-card-value-wrap">
                <span className="stat-big-num text-navy">{emergency ? 'Ceiling' : '+10%'}</span>
                <span className="stat-sub-label">{emergency ? 'Covered goods use the official ceiling' : 'Review threshold over SRP'}</span>
              </div>
            </div>

            <div className="stat-strip-card">
              <span className="stat-card-label">Repeat Offenses</span>
              <div className="stat-card-value-wrap">
                <span className={`stat-big-num ${recidivism > 0 ? 'text-danger' : 'text-slate'}`}>{recidivism}</span>
                <span className="stat-sub-label">{recidivism === 0 ? 'Clean Record' : 'Recorded escalations'}</span>
              </div>
            </div>
          </section>

          <section className="dashboard-services" aria-label="Vendor Services">
            <div className="services-heading">
              <h2>Quick Actions</h2>
              <span className="services-sub">Manage notices, check prices, and submit explanations</span>
            </div>

            <div className="services-grid">
              <button type="button" className="service-card service-notices" onClick={() => onNavigateTab('notices')}>
                <div className="service-top">
                  <div className="service-icon-wrap icon-blue"><FileText size={22} /></div>
                  {activeNoticeCount > 0 ? <span className="service-tag tag-urgent">{activeNoticeCount} Open</span> : <span className="service-tag tag-clean">Up to date</span>}
                </div>
                <div className="service-body">
                  <strong>Legal Notices</strong>
                  <span>Letters of Inquiry & Show Cause Orders</span>
                </div>
                <div className="service-arrow"><ChevronRight size={18} /></div>
              </button>

              <button type="button" className="service-card service-rebuttal" onClick={() => onNavigateTab('rebuttals')}>
                <div className="service-top">
                  <div className="service-icon-wrap icon-emerald"><Send size={22} /></div>
                  <span className="service-tag tag-clean">Responses</span>
                </div>
                <div className="service-body">
                  <strong>Submitted Responses</strong>
                  <span>Explanations and evidence sent to DTI</span>
                </div>
                <div className="service-arrow"><ChevronRight size={18} /></div>
              </button>

              <button type="button" className="service-card service-srp" onClick={() => onNavigateTab('srp')}>
                <div className="service-top">
                  <div className="service-icon-wrap icon-amber"><BookOpen size={22} /></div>
                  <span className="service-tag tag-clean">Official</span>
                </div>
                <div className="service-body">
                  <strong>Official DTI SRP</strong>
                  <span>Current price references</span>
                </div>
                <div className="service-arrow"><ChevronRight size={18} /></div>
              </button>

              <button type="button" className="service-card service-calc" onClick={() => onNavigateTab('srp')}>
                <div className="service-top">
                  <div className="service-icon-wrap icon-purple"><Calculator size={22} /></div>
                  <span className="service-tag tag-clean">Tool</span>
                </div>
                <div className="service-body">
                  <strong>Price Self-Check</strong>
                  <span>Compare a shelf price with the reference</span>
                </div>
                <div className="service-arrow"><ChevronRight size={18} /></div>
              </button>
            </div>
          </section>

          <div className="recent-inspection-card">
            <div className="inspection-icon"><CalendarCheck2 size={20} /></div>
            <div className="inspection-info">
              <span className="inspection-label">Latest DTI Monitoring</span>
              <strong className="inspection-date">{store.last_inspected_at ? formatDate(store.last_inspected_at) : 'No accepted monitoring visit recorded yet'}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
