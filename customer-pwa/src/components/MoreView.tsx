import React, { useState, useEffect, useRef } from 'react';
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
  BookOpen,
  FileText,
  ShoppingBag,
  Info,
  Layers,
  Users,
  CheckCircle2,
  GraduationCap,
  Leaf,
  Tag,
} from 'lucide-react';
import { navigate } from '../app/routing';
import { resolveImageUrl } from '../api/client';
import {
  getRecentComparisons,
  clearRecentComparisons,
  type StoredComparison,
} from '../app/recentComparisons';
import { ComparisonHistoryDetail } from './ComparisonHistoryDetail';
import {
  CONSUMER_RIGHTS,
  CONSUMER_RESPONSIBILITIES,
  PRICE_ACT_REGULATIONS,
  PRICE_TAG_REGULATIONS,
} from '../data/termsAndConditions';
import { LegalDocDetail } from './LegalDocDetail';

/**
 * Read the open comparison back out of the current history entry. Module scope so both the
 * useState initializer and the popstate handler share it. Returns null when no detail entry is
 * active or when the referenced comparison has since been deleted or cleared, either of which
 * should show the list rather than a blank detail.
 */
function comparisonFromHistory(): StoredComparison | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state as { moreSubView?: string; comparisonId?: string } | null;
  if (state?.moreSubView !== 'history-detail' || !state.comparisonId) return null;
  return getRecentComparisons().find((item) => item.id === state.comparisonId) ?? null;
}

/** Same restore contract as comparisons: a legal-doc entry must rebuild its screen on remount. */
function legalDocFromHistory(): 'terms' | 'privacy' | null {
  if (typeof window === 'undefined') return null;
  const sub = (window.history.state as { moreSubView?: string } | null)?.moreSubView;
  return sub === 'terms' || sub === 'privacy' ? sub : null;
}

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

const RIGHT_ICONS: Record<number, { icon: React.ComponentType<{ size?: number }>; badgeStyle: React.CSSProperties }> = {
  1: { icon: ShoppingBag, badgeStyle: { background: '#eff6ff', color: '#2563eb' } },
  2: { icon: Shield, badgeStyle: { background: '#fff1f2', color: '#e11d48' } },
  3: { icon: Info, badgeStyle: { background: '#fffbeb', color: '#d97706' } },
  4: { icon: Layers, badgeStyle: { background: '#faf5ff', color: '#9333ea' } },
  5: { icon: Users, badgeStyle: { background: '#eef2ff', color: '#4f46e5' } },
  6: { icon: CheckCircle2, badgeStyle: { background: '#ecfdf5', color: '#059669' } },
  7: { icon: GraduationCap, badgeStyle: { background: '#ecfeff', color: '#0891b2' } },
  8: { icon: Leaf, badgeStyle: { background: '#f0fdf4', color: '#16a34a' } },
};

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
  // Resolved from history on mount, not just on popstate: App unmounts MoreView on a tab switch,
  // so returning by hardware back remounts it and the detail has to be recoverable from the entry
  // alone. A record that has since been deleted resolves to null, which shows the list.
  const [selectedComparison, setSelectedComparison] = useState<StoredComparison | null>(
    () => comparisonFromHistory(),
  );
  const [selectedLegalDoc, setSelectedLegalDoc] = useState<'terms' | 'privacy' | null>(
    () => legalDocFromHistory(),
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [highlightRights, setHighlightRights] = useState(false);

  const rightsSectionRef = useRef<HTMLElement>(null);
  const clearDialogRef = useRef<HTMLElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  const clearTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;

    const checkHash = () => {
      if (window.location.hash === '#consumer-rights' || window.location.hash === 'consumer-rights') {
        setActiveAccordion('consumer-rights-8');
        if (typeof rightsSectionRef.current?.scrollIntoView === 'function') {
          rightsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setHighlightRights(true);
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => {
          setHighlightRights(false);
        }, 2400);
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => {
      window.removeEventListener('hashchange', checkHash);
      clearTimeout(highlightTimer);
    };
  }, []);

  // A detail entry whose comparison has since been deleted would render the list here, and the
  // next Back would render the list again from the original entry: a dead press. Drop the entry
  // rather than leaving it in the stack. The resulting popstate finds no moreSubView and settles.
  const dropStaleDetailEntry = () => {
    const sub = (window.history.state as { moreSubView?: string } | null)?.moreSubView;
    if (sub !== 'history-detail' || comparisonFromHistory() !== null) return false;
    window.history.back();
    return true;
  };

  useEffect(() => {
    dropStaleDetailEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (dropStaleDetailEntry()) return;
      setSelectedComparison(comparisonFromHistory());
      setSelectedLegalDoc(legalDocFromHistory());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showClearConfirm) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelClearRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowClearConfirm(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = clearDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const returnTarget = clearTriggerRef.current;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [showClearConfirm]);

  const toggleAccordion = (id: string) => {
    setActiveAccordion((prev) => (prev === id ? null : id));
  };

  const handleClearClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    clearTriggerRef.current = event.currentTarget;
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    clearRecentComparisons();
    setComparisons([]);
    setShowClearConfirm(false);
  };

  const handleSelectComparison = (item: StoredComparison) => {
    // The id is what makes the entry restorable: without it a later back press knows a detail was
    // open but not which comparison it held.
    window.history.pushState({ moreSubView: 'history-detail', comparisonId: item.id }, '');
    setSelectedComparison(item);
  };

  const handleBackFromDetail = () => {
    setSelectedComparison(null);
    // Pop the entry this detail pushed, matching handleBackFromLegal. Without this the entry is
    // orphaned and the next hardware back moves history without changing the screen.
    if (typeof window !== 'undefined' && window.history.state?.moreSubView) {
      window.history.back();
    }
  };

  const handleSelectLegalDoc = (type: 'terms' | 'privacy') => {
    window.history.pushState({ moreSubView: type }, '');
    setSelectedLegalDoc(type);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const handleBackFromLegal = () => {
    setSelectedLegalDoc(null);
    if (typeof window !== 'undefined' && window.history.state?.moreSubView) {
      window.history.back();
    }
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

  if (selectedLegalDoc) {
    return (
      <div
        className="more-view-container"
        role="main"
        aria-label={selectedLegalDoc === 'terms' ? 'Terms of Use' : 'Privacy Notice'}
      >
        <LegalDocDetail
          docType={selectedLegalDoc}
          onBack={handleBackFromLegal}
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
              Pursuant to Section 6 of R.A. 7581, an automatic price freeze is enforced in San Jose de Buenavista. Covered basic necessities use the confirmed official APC or SRP-held ceiling with 0% markup tolerance.
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
              onClick={handleClearClick}
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
          <div className="more-comparison-scroll-container" tabIndex={0} aria-label="Scrollable price comparison list">
            <div className="more-comparison-list" role="feed" aria-label="Recent price comparisons">
              {comparisons.map((item) => {
              const resolvedThumbUrl = resolveImageUrl(item.imagePath);

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
          </div>
        )}
      </section>

      {/* 3. LEGAL RIGHTS & CONSUMER PRICE ACT */}
      <section
        ref={rightsSectionRef}
        id="consumer-rights"
        className={`more-section-wrap ${highlightRights ? 'rights-highlight-pulse' : ''}`}
        aria-labelledby="heading-legal-rights"
      >
        <h2 id="heading-legal-rights" className="more-section-title">Consumer Rights & Legal Protection</h2>
        <div className="report-accordion-group" style={{ paddingBottom: 0 }}>
          {/* Accordion 1: Consumer Rights (R.A. 7394) */}
          <div className="report-accordion-item">
            <button
              type="button"
              className="report-accordion-trigger"
              aria-expanded={activeAccordion === 'consumer-rights-8'}
              aria-label="Consumer Rights (R.A. 7394)"
              onClick={() => toggleAccordion('consumer-rights-8')}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="icon-wrapper-blue" style={{ width: '36px', height: '36px' }}>
                  <BookOpen size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main, #0f172a)' }}>
                  Consumer Rights (R.A. 7394)
                </div>
              </div>
              <div>
                <ChevronDown
                  size={18}
                  className={`report-accordion-chevron ${activeAccordion === 'consumer-rights-8' ? 'report-accordion-chevron--open' : ''}`}
                />
              </div>
            </button>

            {activeAccordion === 'consumer-rights-8' && (
              <div className="report-accordion-body">
                <div className="report-steps-container">
                  {CONSUMER_RIGHTS.map((right) => {
                    const itemConfig = RIGHT_ICONS[right.id] ?? {
                      icon: BookOpen,
                      badgeStyle: { background: '#eff6ff', color: '#2563eb' },
                    };
                    const IconComp = itemConfig.icon;

                    return (
                      <div key={right.id} className="report-step-item">
                        <div className="report-step-icon-badge" style={itemConfig.badgeStyle}>
                          <IconComp size={18} />
                        </div>
                        <div className="report-step-content">
                          <div className="report-step-title">{right.id}. {right.title}:</div>
                          <div className="report-step-desc">
                            {right.description} {right.dtiProtection}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldCheck size={16} color="#2563eb" />
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a' }}>
                      5 Consumer Responsibilities
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {CONSUMER_RESPONSIBILITIES.map((resp) => (
                      <span
                        key={resp.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '4px 8px',
                          fontSize: '0.78rem',
                          color: '#334155',
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ color: '#2563eb', fontWeight: 700 }}>{resp.id}.</span>
                        {resp.title}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: Price Act (R.A. 7581) */}
          <div className="report-accordion-item">
            <button
              type="button"
              className="report-accordion-trigger"
              aria-expanded={activeAccordion === 'price-act'}
              aria-label="Price Act (R.A. 7581)"
              onClick={() => toggleAccordion('price-act')}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="icon-wrapper-amber" style={{ width: '36px', height: '36px' }}>
                  <Scale size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main, #0f172a)' }}>
                  Price Act (R.A. 7581)
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
                  {PRICE_ACT_REGULATIONS.map((item, idx) => {
                    let badgeStyle: React.CSSProperties = { background: '#fffbeb', color: '#d97706' };
                    let IconComponent = Scale;
                    if (idx === 1) {
                      badgeStyle = { background: '#eff6ff', color: '#2563eb' };
                      IconComponent = TrendingUp;
                    } else if (idx === 2) {
                      badgeStyle = { background: '#fef2f2', color: '#dc2626' };
                      IconComponent = AlertTriangle;
                    }

                    return (
                      <div key={item.id} className="report-step-item">
                        <div className="report-step-icon-badge" style={badgeStyle}>
                          <IconComponent size={18} />
                        </div>
                        <div className="report-step-content">
                          <div className="report-step-title">{idx + 1}. {item.heading}:</div>
                          <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>
                            {item.lawReference}
                          </div>
                          <div className="report-step-desc">
                            {item.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 3: Price Tag Law (R.A. 71) */}
          <div className="report-accordion-item">
            <button
              type="button"
              className="report-accordion-trigger"
              aria-expanded={activeAccordion === 'price-tag'}
              aria-label="Price Tag Law (R.A. 71)"
              onClick={() => toggleAccordion('price-tag')}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="icon-wrapper-green" style={{ width: '36px', height: '36px' }}>
                  <Tag size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main, #0f172a)' }}>
                  Price Tag Law (R.A. 71)
                </div>
              </div>
              <div>
                <ChevronDown
                  size={18}
                  className={`report-accordion-chevron ${activeAccordion === 'price-tag' ? 'report-accordion-chevron--open' : ''}`}
                />
              </div>
            </button>

            {activeAccordion === 'price-tag' && (
              <div className="report-accordion-body">
                <div className="report-steps-container">
                  {PRICE_TAG_REGULATIONS.map((item, idx) => {
                    let badgeStyle: React.CSSProperties = { background: '#f0fdf4', color: '#16a34a' };
                    let IconComponent = Tag;
                    if (idx === 1) {
                      badgeStyle = { background: '#eff6ff', color: '#2563eb' };
                      IconComponent = Scale;
                    } else if (idx === 2) {
                      badgeStyle = { background: '#fffbeb', color: '#d97706' };
                      IconComponent = AlertTriangle;
                    }

                    return (
                      <div key={item.id} className="report-step-item">
                        <div className="report-step-icon-badge" style={badgeStyle}>
                          <IconComponent size={18} />
                        </div>
                        <div className="report-step-content">
                          <div className="report-step-title">{idx + 1}. {item.heading}:</div>
                          <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>
                            {item.lawReference}
                          </div>
                          <div className="report-step-desc">
                            {item.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Accordion 4: Tamper-Proof Evidence Vault */}
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

                  <div className="report-security-point">
                    <div className="report-security-point-icon">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <strong>Automated Receipt Reading:</strong> Receipt photos may be read by Google’s Gemini service on DTI’s behalf to list the printed items and prices. The results are read-only and always checked by DTI staff.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. LEGAL & REGULATORY POLICIES */}
      <section className="more-section-wrap" aria-labelledby="heading-legal-policies">
        <h2 id="heading-legal-policies" className="more-section-title">Legal & Regulatory Policies</h2>
        <div className="more-group-card">
          <button
            type="button"
            className="more-group-row more-group-row-interactive"
            aria-label="View Terms of Use"
            onClick={() => handleSelectLegalDoc('terms')}
            style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', font: 'inherit', color: 'inherit' }}
          >
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--blue">
                <FileText size={18} />
              </div>
              <div className="more-row-texts">
                <div
                  className="more-row-label"
                  style={{
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: '0.98rem',
                    color: 'var(--text-main, #0f172a)',
                  }}
                >
                  Terms of Use
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="more-comparison-chevron" />
          </button>

          <button
            type="button"
            className="more-group-row more-group-row-interactive"
            aria-label="View Privacy Notice"
            onClick={() => handleSelectLegalDoc('privacy')}
            style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', font: 'inherit', color: 'inherit' }}
          >
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--emerald">
                <ShieldCheck size={18} />
              </div>
              <div className="more-row-texts">
                <div
                  className="more-row-label"
                  style={{
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: '0.98rem',
                    color: 'var(--text-main, #0f172a)',
                  }}
                >
                  Privacy Notice
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="more-comparison-chevron" />
          </button>
        </div>
      </section>

      {/* 5. Footer Metadata */}
      <footer className="more-footer">
        <div className="more-footer-tag">
          <Building2 size={12} />
          <span>Official Regulatory Portal</span>
        </div>
        <div><strong>PRICE-Watch Consumer PWA</strong> · v1.3.0 Production</div>
        <div>Target Pilot: San Jose de Buenavista, Antique</div>
        <div>Department of Trade and Industry (DTI) Antique Provincial Office</div>
        <div className="more-footer-links" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px', fontSize: '0.8rem' }}>
          <button
            type="button"
            onClick={() => handleSelectLegalDoc('terms')}
            className="more-footer-link-btn"
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Terms of Use
          </button>
          <span aria-hidden="true" style={{ color: '#cbd5e1' }}>·</span>
          <button
            type="button"
            onClick={() => handleSelectLegalDoc('privacy')}
            className="more-footer-link-btn"
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Privacy Notice
          </button>
        </div>
      </footer>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div
          className="more-dialog-scrim"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowClearConfirm(false);
            }
          }}
        >
          <section
            ref={clearDialogRef}
            className="more-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-history-title"
          >
            <span className="more-delete-icon" aria-hidden="true">
              <Trash2 size={24} />
            </span>
            <h2 id="clear-history-title">Clear comparison history?</h2>
            <p>
              This will remove all saved price comparison items from this device. Your official DTI references will remain unaffected.
            </p>
            <div className="more-dialog-actions">
              <button
                type="button"
                className="more-dialog-delete"
                onClick={handleConfirmClear}
              >
                Clear History
              </button>
              <button
                ref={cancelClearRef}
                type="button"
                className="more-dialog-cancel"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default MoreView;
