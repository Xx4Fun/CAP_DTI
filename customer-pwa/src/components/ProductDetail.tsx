import React, { useState } from 'react';
import {
  ArrowLeft,
  Scan,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Info,
  ImageOff,
} from 'lucide-react';
import { type Commodity, resolveImageUrl } from '../api/client';
import { formatCommodityDisplay } from '../app/commodityFormatter';
import { getPriceLabel, type PriceDataSource } from '../app/priceDataPresentation';

export interface ProductDetailProps {
  commodity: Commodity;
  dataSource: PriceDataSource;
  dataFetchedAt: number | null;
  onBack: () => void;
  onSelectScan?: (commodity: Commodity) => void;
  onSelectReport?: (commodity: Commodity) => void;
  stateOfCalamity?: boolean;
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: 'var(--shadow-sm)',
};

function formatDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? new Date(value)
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(parsed);
}

function formatRegulatoryState(value: string | undefined, stateOfCalamity: boolean): string {
  if (value === 'CALAMITY_ACTIVE') return 'Calamity active';
  if (value) {
    return value
      .toLocaleLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
      .join(' ');
  }
  if (stateOfCalamity) return 'Calamity notice active';
  return 'Not provided';
}

const ProductImage: React.FC<{ commodity: Commodity }> = ({ commodity }) => {
  const [imageError, setImageError] = useState(false);
  const resolvedUrl = resolveImageUrl(commodity.image_path);

  return (
    <div
      style={{
        width: '88px',
        height: '100px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {resolvedUrl && !imageError ? (
        <img
          src={resolvedUrl}
          alt={commodity.commodity_name}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
          onError={() => setImageError(true)}
        />
      ) : (
        <span className="price-product-fallback price-product-fallback--neutral">
          <ImageOff size={24} aria-hidden="true" />
          <span>No image</span>
        </span>
      )}
    </div>
  );
};

const MetadataRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px' }}>
    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600, textAlign: 'right' }}>{children}</span>
  </div>
);

export const ProductDetail: React.FC<ProductDetailProps> = ({
  commodity,
  dataSource,
  dataFetchedAt,
  onBack,
  onSelectScan,
  onSelectReport,
  stateOfCalamity = false,
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const parsed = formatCommodityDisplay(
    commodity.commodity_name,
    commodity.category || '',
    commodity.unit || commodity.package_size || '',
    commodity.effective_date || '',
  );
  const title = parsed.title || commodity.commodity_name;
  const subtitle = parsed.categoryPath || commodity.category || 'Category not provided';
  const size = parsed.unit || commodity.unit || commodity.package_size;
  const effectiveDate = formatDate(commodity.effective_date);
  const fetchedDate = formatDate(dataFetchedAt);
  const priceLabel = getPriceLabel(dataSource);
  const classification = commodity.regulatory_classification === 'BASIC_NECESSITY'
    ? 'Basic Necessity'
    : commodity.regulatory_classification === 'PRIME_COMMODITY'
      ? 'Prime Commodity'
      : 'Not provided';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>
      <div>
        <button
          type="button"
          aria-label="Back to Prices"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '0.92rem',
            cursor: 'pointer',
            padding: '12px 16px',
            minHeight: '44px',
            borderRadius: '8px',
            marginLeft: '-16px',
          }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Back to Prices
        </button>
      </div>

      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
        <ProductImage commodity={commodity} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
            {title}
          </h1>
          <div style={{ fontSize: '0.88rem', color: '#475569', fontWeight: 500 }}>{subtitle}</div>
          {size && <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>{size}</div>}
        </div>
      </div>

      <section style={{ ...cardStyle, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '0.88rem', color: '#475569', fontWeight: 600, marginBottom: '6px' }}>
            {priceLabel}
          </div>
          <div style={{ fontSize: '2.35rem', fontWeight: 800, color: '#2563eb', lineHeight: 1.1 }}>
            ₱{Number(commodity.baseline_price).toFixed(2)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <span className={dataSource === 'live' ? 'badge badge-green' : 'badge badge-blue'}>
              {priceLabel}
            </span>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              {effectiveDate ? `Effective ${effectiveDate}` : 'Effective date not provided'}
            </span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <MetadataRow label="Classification">{classification}</MetadataRow>
          <MetadataRow label="Regulatory state">
            {formatRegulatoryState(commodity.regulatory_state, stateOfCalamity)}
          </MetadataRow>
          <MetadataRow label={dataSource === 'live' ? 'Live data checked' : 'Saved data date'}>
            {fetchedDate || 'Not provided'}
          </MetadataRow>
        </div>
      </section>

      {commodity.price_freeze_applicable && (
        <section style={{ ...cardStyle, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setIsAccordionOpen((open) => !open)}
            aria-expanded={isAccordionOpen}
            style={{
              width: '100%',
              minHeight: '52px',
              padding: '14px 16px',
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, color: '#0f172a' }}>
              <Info size={20} aria-hidden="true" />
              Price-freeze information
            </span>
            {isAccordionOpen ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
          </button>
          {isAccordionOpen && (
            <div style={{ padding: '16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.88rem', color: '#334155', lineHeight: 1.55 }}>
              {commodity.price_freeze_treatment || 'A price-freeze treatment is marked for this item. Check the cited bulletin for the applicable terms.'}
            </div>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <button
          type="button"
          onClick={() => onSelectScan?.(commodity)}
          style={{ background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '16px', padding: '18px 16px', minHeight: '132px', cursor: 'pointer', textAlign: 'left' }}
        >
          <Scan size={28} aria-hidden="true" style={{ marginBottom: '12px' }} />
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Scan shelf price</div>
          <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: '4px' }}>Compare a displayed shelf price.</div>
        </button>
        <button
          type="button"
          onClick={() => onSelectReport?.(commodity)}
          style={{ background: '#ffffff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '16px', padding: '18px 16px', minHeight: '132px', cursor: 'pointer', textAlign: 'left' }}
        >
          <FileCheck size={28} aria-hidden="true" style={{ marginBottom: '12px' }} />
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Report a concern</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Requires a checkout receipt.</div>
        </button>
      </div>

      <section style={{ ...cardStyle, padding: '16px' }} aria-label="Bulletin source">
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>Bulletin source</div>
        <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '6px', overflowWrap: 'anywhere' }}>
          {commodity.source_reference || 'Not provided'}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
          {effectiveDate ? `Effective ${effectiveDate}` : 'Effective date not provided'}
        </div>
      </section>
    </div>
  );
};

export default ProductDetail;
