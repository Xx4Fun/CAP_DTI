import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  FileWarning,
  FileText,
  BookOpen,
  ChevronRight,
  CalendarCheck2,
  MapPin,
  Building2,
  Scale,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import type { ActiveTab, EmergencyInfo, LegalNotice, VendorStore } from '../../app/types';
import { formatDate } from '../../app/rules';
import { resolveStoreImage, getStoreInitials } from '../../app/storeImage';
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

  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = resolveStoreImage(store);
  const initials = getStoreInitials(store.store_name);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero" aria-label="Establishment Profile">
        <div className="dashboard-hero-media" aria-hidden="true">
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt=""
              className="dashboard-hero-photo"
              loading="eager"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="dashboard-hero-fallback">
              <Building2 size={40} className="dashboard-hero-fallback-icon" />
              <span className="dashboard-hero-fallback-initials">{initials}</span>
            </div>
          )}
          <div className="dashboard-hero-shade" />
        </div>

        <div className="dashboard-hero-inner">
          <div className="dashboard-hero-avatar" aria-hidden="true">
            {imageUrl && !imageFailed ? (
              <img
                src={imageUrl}
                alt=""
                className="dashboard-hero-avatar-img"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <span className="dashboard-hero-avatar-fallback">{initials}</span>
            )}
          </div>

          <div className="dashboard-hero-content">
            <div className="dashboard-hero-status-row">
              <span className={`hero-status-pill ${emergency ? 'pill-calamity' : 'pill-normal'}`}>
                <span className="hero-status-dot" />
                <span>{emergency ? 'Emergency price references in effect' : 'Standard price monitoring'}</span>
              </span>
            </div>

            <h1 className="dashboard-store-name">{store.store_name}</h1>

            <div className="dashboard-store-meta-group">
              <span className="dashboard-store-address">
                <MapPin size={14} className="dashboard-store-pin" aria-hidden="true" />
                <span>{store.address}</span>
              </span>
              {store.dti_sec_number && (
                <span className="dashboard-store-sec">
                  <span className="dashboard-sec-bullet">•</span>
                  <span>Registration no. <strong>{store.dti_sec_number}</strong></span>
                </span>
              )}
            </div>
          </div>

          <div className="dashboard-hero-side-badge">
            <div className="hero-inspection-chip">
              <CalendarCheck2 size={15} aria-hidden="true" />
              <span>{store.last_inspected_at ? `Monitored: ${formatDate(store.last_inspected_at)}` : 'Pending initial inspection'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-content-shell">
        <div className="dashboard-main-flow">
          <div className="dashboard-primary-column">
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
                <span className="stat-card-label">Confirmed cases</span>
                <div className="stat-card-value-wrap">
                  <span className={`stat-big-num ${recidivism > 0 ? 'text-danger' : 'text-slate'}`}>{recidivism}</span>
                  <span className="stat-sub-label">{recidivism === 0 ? 'No confirmed cases recorded' : 'Distinct confirmed findings'}</span>
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
                    {activeNoticeCount > 0 ? <span className="service-tag tag-urgent">{activeNoticeCount} Open</span> : <span className="service-tag tag-clean">No open notices</span>}
                  </div>
                  <div className="service-body">
                    <strong>Legal Notices</strong>
                    <span>Letters of Inquiry & Show Cause Orders</span>
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
              </div>
            </section>
          </div>

          <aside className="dashboard-secondary-column" aria-label="Regulatory Compliance and Inspection Timeline">
            <div className="recent-inspection-card">
              <div className="inspection-icon"><CalendarCheck2 size={20} /></div>
              <div className="inspection-info">
                <span className="inspection-label">Latest DTI Monitoring</span>
                <strong className="inspection-date">{store.last_inspected_at ? formatDate(store.last_inspected_at) : 'No accepted monitoring visit recorded yet'}</strong>
              </div>
            </div>

            <div className="v-card compliance-guidance-card">
              <div className="guidance-card-header">
                <div className="guidance-header-icon-wrap">
                  <Scale size={18} />
                </div>
                <div className="guidance-header-title-wrap">
                  <h3>Price &amp; Notice Guidance</h3>
                </div>
              </div>

              <div className="guidance-items-list">
                <div className="guidance-item-row">
                  <div className="guidance-item-icon icon-amber">
                    <Clock size={16} />
                  </div>
                  <div className="guidance-item-content">
                    <strong>Notice response timing</strong>
                    <span>Check each issued notice for its recorded delivery status and response deadline.</span>
                  </div>
                </div>

                <div className="guidance-item-row">
                  <div className="guidance-item-icon icon-rose">
                    <ShieldAlert size={16} />
                  </div>
                  <div className="guidance-item-content">
                    <strong>Emergency price references</strong>
                    <span>When an official emergency reference applies, covered goods use its ceiling; other goods keep their SRP reference.</span>
                  </div>
                </div>

              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
