import React, { useState, useEffect } from 'react';
import {
  Building2,
  Clock,
  Phone,
  Mail,
  AlertTriangle,
  Scale,
  Shield,
  ShieldCheck,
  Lock,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  History,
  Trash2,
  Package,
} from 'lucide-react';
import { navigate } from '../app/routing';
import { resolveImageUrl } from '../api/client';
import { fallbackCommodities } from '../data/srpFallback';
import {
  getRecentComparisons,
  clearRecentComparisons,
  type StoredComparison,
} from '../app/recentComparisons';
import { ComparisonHistoryDetail } from './ComparisonHistoryDetail';

export function formatComparisonDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

interface MoreViewProps {
  setActiveTab?: (tab: string) => void;
  lastSyncTime?: string;
  stateOfCalamity?: boolean;
  bulletinDate?: string;
  totalCommodities?: number;
  onRefreshData?: () => Promise<void> | void;
}

export const MoreView: React.FC<MoreViewProps> = ({
  setActiveTab,
  stateOfCalamity = false,
}) => {
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState<StoredComparison[]>(getRecentComparisons);
  const [selectedComparison, setSelectedComparison] = useState<StoredComparison | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setSelectedComparison(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const toggleAccordion = (id: string) => {
    setActiveAccordion((prev) => (prev === id ? null : id));
  };

  const handleClearHistory = () => {
    clearRecentComparisons();
    setComparisons([]);
  };

  const handleSelectComparison = (item: StoredComparison) => {
    window.history.pushState({ moreSubView: 'history-detail' }, '');
    setSelectedComparison(item);
  };

  const handleBackFromDetail = () => {
    setSelectedComparison(null);
  };

  if (selectedComparison) {
    return (
      <div className="more-view-container" role="main" aria-label="Comparison History Record">
        <ComparisonHistoryDetail
          comparison={selectedComparison}
          onBack={handleBackFromDetail}
        />
      </div>
    );
  }

  return (
    <div className="more-view-container" role="main" aria-label="Settings and regulatory resources">
      {/* 1. TOP CARD: DTI Antique Provincial Office */}
      <section className="more-dti-top-card" aria-labelledby="heading-dti-top">
        <div className="more-dti-top-header">
          <div className="more-dti-logo-wrap">
            <img
              src="/branding/dti-logo.svg"
              alt="DTI Antique Provincial Office Logo"
              className="more-dti-logo-img"
            />
          </div>
          <div className="more-dti-header-texts">
            <h1 id="heading-dti-top" className="more-dti-title">DTI Antique Provincial Office</h1>
            <div className="more-dti-subtitle">Government Consumer Protection</div>
            <div className="more-dti-hours-pill">
              <Clock size={12} />
              <span>Status: Mon – Fri · 8:00 AM – 5:00 PM</span>
            </div>
          </div>
        </div>

        {/* Direct Call & Email Actions */}
        <div className="more-contact-grid">
          <a
            href="tel:0365408736"
            className="more-contact-btn more-contact-btn--white"
            aria-label="Call DTI Hotline (036) 540-8736"
          >
            <Phone size={16} />
            <span>Call Hotline</span>
          </a>
          <a
            href="mailto:antique@dti.gov.ph"
            className="more-contact-btn more-contact-btn--white"
            aria-label="Email DTI Antique at antique@dti.gov.ph"
          >
            <Mail size={16} />
            <span>Email DTI</span>
          </a>
        </div>
      </section>

      {/* Emergency Price Freeze Notification (When Active) */}
      {stateOfCalamity && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#fef2f2',
            border: '1.5px solid #f87171',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxShadow: '0 2px 10px rgba(220, 38, 38, 0.08)',
          }}
        >
          <AlertTriangle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.95rem', marginBottom: '2px' }}>
              State of Calamity Active
            </div>
            <div style={{ fontSize: '0.84rem', color: '#b91c1c', lineHeight: 1.45 }}>
              Pursuant to Section 6 of R.A. 7581, an automatic price freeze is enforced in San Jose de Buenavista. Basic necessities are locked at baseline SRP with 0% markup tolerance.
            </div>
          </div>
        </div>
      )}

      {/* 2. PRICE COMPARISON HISTORY SECTION */}
      <section className="more-section-wrap" aria-labelledby="heading-comparison-history">
        <div className="more-history-header">
          <h2 id="heading-comparison-history" className="more-section-title" style={{ marginBottom: 0 }}>
            Price Comparison History
          </h2>
          {comparisons.length > 0 && (
            <button
              type="button"
              className="more-history-clear-btn"
              onClick={handleClearHistory}
              aria-label="Clear all comparison history"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>

        {comparisons.length === 0 ? (
          <div className="more-history-empty-card">
            <div className="more-history-empty-icon-wrap">
              <History size={26} color="#64748b" />
            </div>
            <h3 className="more-history-empty-title">No Price Comparisons Yet</h3>
            <p className="more-history-empty-desc">
              When you compare shelf prices in the Compare tab against official DTI SRP baselines, your comparisons will appear here for quick reference.
            </p>
            <button
              type="button"
              className="more-history-empty-cta"
              onClick={() => {
                if (setActiveTab) {
                  setActiveTab('compare');
                } else {
                  navigate({ name: 'compare' });
                }
              }}
            >
              <Scale size={16} />
              <span>Start a Price Check</span>
            </button>
          </div>
        ) : (
          <div className="more-comparison-list" role="feed" aria-label="Recent price comparisons">
            {comparisons.map((item) => {
              const matchedCommodity = fallbackCommodities.find(
                (c) => c.id === item.commodityId || c.commodity_name.trim().toLowerCase() === item.commodityName.trim().toLowerCase()
              );
              const rawImagePath = item.imagePath || matchedCommodity?.image_path || null;
              const resolvedThumbUrl = resolveImageUrl(rawImagePath);

              return (
                <article
                  key={item.id}
                  className="more-comparison-card"
                  onClick={() => handleSelectComparison(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectComparison(item);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View comparison for ${item.commodityName} at ${item.storeName}`}
                >
                  <div className="more-comparison-thumb-box">
                    {resolvedThumbUrl ? (
                      <img
                        src={resolvedThumbUrl}
                        alt={item.commodityName}
                        className="more-comparison-thumb-img"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector(
                            '.more-comparison-thumb-fallback'
                          ) as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className="more-comparison-thumb-fallback"
                      style={{ display: resolvedThumbUrl ? 'none' : 'flex' }}
                    >
                      <Package size={22} className="more-comparison-thumb-icon" />
                    </div>
                  </div>

                  <div className="more-comparison-card-content">
                    <div className="more-comparison-establishment-tag">
                      {item.storeName}
                    </div>
                    <h3 className="more-comparison-product-title">{item.commodityName}</h3>
                    <div className="more-comparison-date-tag">
                      {formatComparisonDate(item.comparedAt)}
                    </div>
                  </div>

                  <ChevronRight size={18} className="more-comparison-chevron" />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. LEGAL RIGHTS & CONSUMER PRICE ACT */}
      <section className="more-section-wrap" aria-labelledby="heading-legal-rights">
        <h2 id="heading-legal-rights" className="more-section-title">Consumer Rights & Legal Protection</h2>
        <div className="report-accordion-group" style={{ paddingBottom: 0 }}>
          {/* Card 1: Republic Act No. 7581 (Price Act) */}
          <div className="report-accordion-item">
            <button
              type="button"
              className="report-accordion-trigger"
              aria-expanded={activeAccordion === 'price-act'}
              aria-label="Republic Act No. 7581 (Price Act)"
              onClick={() => toggleAccordion('price-act')}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="icon-wrapper-amber" style={{ width: '36px', height: '36px' }}>
                  <Scale size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main, #0f172a)' }}>
                  Republic Act No. 7581 (Price Act)
                </div>
              </div>
              <div>
                <ChevronDown
                  size={18}
                  className={`report-accordion-chevron ${activeAccordion === 'price-act' ? 'report-accordion-chevron--open' : ''}`}
                />
              </div>
            </button>

            {activeAccordion === 'price-act' && (
              <div className="report-accordion-body">
                <div className="report-steps-container">
                  <div className="report-step-item">
                    <div className="report-step-icon-badge">
                      <Scale size={18} />
                    </div>
                    <div className="report-step-content">
                      <div className="report-step-title">1. Baseline SRP Protection:</div>
                      <div className="report-step-desc">
                        DTI publishes standard Suggested Retail Prices (SRP) for basic necessities and prime commodities to curb illegal profiteering.
                      </div>
                    </div>
                  </div>

                  <div className="report-step-item">
                    <div className="report-step-icon-badge" style={{ background: '#eff6ff', color: '#2563eb' }}>
                      <TrendingUp size={18} />
                    </div>
                    <div className="report-step-content">
                      <div className="report-step-title">2. The 10% Normal Market Rule:</div>
                      <div className="report-step-desc">
                        In standard market conditions, any retailer charging higher than 10% above the published SRP baseline triggers an automatic DTI Letter of Inquiry (LOI).
                      </div>
                    </div>
                  </div>

                  <div className="report-step-item">
                    <div className="report-step-icon-badge" style={{ background: '#fef2f2', color: '#dc2626' }}>
                      <AlertTriangle size={18} />
                    </div>
                    <div className="report-step-content">
                      <div className="report-step-title">3. Automatic Freeze in Calamity:</div>
                      <div className="report-step-desc">
                        When a State of Calamity is declared, Section 6 of R.A. 7581 enforces an automatic price freeze with zero percent markup tolerance.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Tamper-Proof Evidence Vault */}
          <div className="report-accordion-item">
            <button
              type="button"
              className="report-accordion-trigger"
              aria-expanded={activeAccordion === 'privacy-security'}
              aria-label="Tamper-Proof Evidence Vault"
              onClick={() => toggleAccordion('privacy-security')}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="icon-wrapper-blue" style={{ width: '36px', height: '36px' }}>
                  <Shield size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main, #0f172a)' }}>
                  Tamper-Proof Evidence Vault
                </div>
              </div>
              <div>
                <ChevronDown
                  size={18}
                  className={`report-accordion-chevron ${activeAccordion === 'privacy-security' ? 'report-accordion-chevron--open' : ''}`}
                />
              </div>
            </button>

            {activeAccordion === 'privacy-security' && (
              <div className="report-accordion-body">
                <div className="report-security-points">
                  <div className="report-security-point">
                    <div className="report-security-point-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <strong>Zero Account Barrier:</strong> PRICE-Watch operates anonymously without requiring accounts, logins, or collecting personal identification.
                    </div>
                  </div>

                  <div className="report-security-point">
                    <div className="report-security-point-icon">
                      <Lock size={18} />
                    </div>
                    <div>
                      <strong>Cryptographic Sealing:</strong> Captured receipt scans are hashed with client-side SHA-256 checksums before transmission to ensure tamper-proof evidential validity in DTI regulatory proceedings.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Footer Metadata */}
      <footer className="more-footer">
        <div className="more-footer-tag">
          <Building2 size={12} />
          <span>Official Regulatory Portal</span>
        </div>
        <div><strong>PRICE-Watch Consumer PWA</strong> · v1.3.0 Production</div>
        <div>Target Pilot: San Jose de Buenavista, Antique</div>
        <div>Department of Trade and Industry (DTI) Antique Provincial Office</div>
      </footer>
    </div>
  );
};

export default MoreView;
