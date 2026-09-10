import React from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  History,
} from 'lucide-react';
import type { StoredComparison } from '../app/recentComparisons';
import { formatComparisonDate } from './MoreView';

interface ComparisonHistoryDetailProps {
  comparison: StoredComparison;
  onBack: () => void;
}

export const ComparisonHistoryDetail: React.FC<ComparisonHistoryDetailProps> = ({
  comparison,
  onBack,
}) => {
  const payload = comparison.resultPayload;
  const label = payload?.regulatory_label || payload?.comparison_label || 'Current SRP';
  const isAbove = comparison.status === 'ABOVE_SRP' || payload?.is_above_reference;
  const isBelow = comparison.status === 'BELOW_SRP';
  const diffVal = comparison.pesoDifference ?? payload?.difference_pesos ?? 0;
  const numDiff = Math.abs(Number(diffVal));

  const verdictTitle = isAbove
    ? `₱${numDiff.toFixed(2)} above ${label}`
    : isBelow
    ? `₱${numDiff.toFixed(2)} below ${label}`
    : `Matches ${label} baseline`;

  const previousVerifiedPrice = payload?.previous_verified_price;
  const previousRecordedDate = payload?.previous_recorded_date;

  return (
    <div className="shelf-compare-page" role="region" aria-label="Comparison History Detail">
      {/* 1. TOP HEADER WITH BACK BUTTON */}
      <div className="shelf-compare-header">
        <button
          type="button"
          className="shelf-compare-back-btn"
          onClick={onBack}
          aria-label="Back to History"
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="shelf-compare-title" style={{ fontSize: '1.25rem', marginBottom: '2px' }}>
            Comparison History
          </h1>
          <p className="shelf-compare-subtitle">
            Recorded on {formatComparisonDate(comparison.comparedAt)}
          </p>
        </div>
      </div>

      {/* 2. HERO RESULT CARD */}
      <div className="shelf-result-hero-card">
        {/* Verdict Banner */}
        <div
          className={`shelf-result-verdict-banner ${
            isAbove ? 'shelf-result-verdict-banner--above' : 'shelf-result-verdict-banner--within'
          }`}
        >
          <div className="shelf-result-verdict-icon">
            {isAbove ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div className="shelf-result-verdict-text">
            <div className="shelf-result-verdict-title">{verdictTitle}</div>
            <div className="shelf-result-verdict-subtitle">
              {isAbove
                ? 'Displayed price exceeds the official ceiling'
                : 'Complies with DTI suggested retail price'}
            </div>
          </div>
        </div>

        {/* Side-by-Side Dual Price Grid */}
        <div className="shelf-result-price-grid">
          <div className="shelf-result-price-card shelf-result-price-card--shelf">
            <div className="shelf-result-price-label">Shelf Price</div>
            <div className="shelf-result-price-amount">
              ₱{Number(comparison.displayedPrice).toFixed(2)}
            </div>
          </div>

          <div className="shelf-result-price-card shelf-result-price-card--srp">
            <div className="shelf-result-price-label">{label}</div>
            <div className="shelf-result-price-amount">
              ₱{Number(comparison.referencePrice).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Historical Benchmark Strip */}
        <div className="shelf-result-history-strip">
          <History size={16} />
          {previousVerifiedPrice ? (
            <div>
              Previous verified store price was{' '}
              <strong style={{ color: '#0f172a' }}>
                ₱{Number(previousVerifiedPrice).toFixed(2)}
              </strong>{' '}
              on {previousRecordedDate}.
            </div>
          ) : (
            <div>No verified historical store price is currently available.</div>
          )}
        </div>

        {/* Item & Store Meta Details */}
        <div className="shelf-result-meta-strip">
          <div className="shelf-result-meta-row">
            <span>Store</span>
            <span>{comparison.storeName}</span>
          </div>
          <div className="shelf-result-meta-row">
            <span>Product</span>
            <span>{comparison.commodityName}</span>
          </div>
          <div className="shelf-result-meta-row">
            <span>Package Size</span>
            <span>
              {comparison.unit || payload?.package_size || payload?.unit || 'Standard'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. MANDATORY CONSUMER DISCLAIMER BANNER (AT THE VERY BOTTOM) */}
      <div
        className="disclaimer-banner"
        style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}
      >
        <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.8rem', color: '#92400e', lineHeight: 1.35 }}>
          This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.
        </div>
      </div>
    </div>
  );
};

export default ComparisonHistoryDetail;
