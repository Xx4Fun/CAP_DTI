import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Info,
  Maximize2,
} from 'lucide-react';
import { type Commodity, resolveImageUrl } from '../api/client';
import { formatCommodityDisplay } from '../app/commodityFormatter';
import { getPriceLabel, type PriceDataSource } from '../app/priceDataPresentation';
import { ProductImageLightbox } from './ProductImageLightbox';
import { ProgressiveProductImage, type ProductImageSettlement } from './ProgressiveProductImage';

export interface ProductDetailProps {
  commodity: Commodity;
  dataSource: PriceDataSource;
  dataFetchedAt: number | null;
  onBack: () => void;
  stateOfCalamity?: boolean;
}

const CATEGORY_ACRONYMS = new Set(['DTI', 'LPG', 'NFA', 'PET', 'SRP']);

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

function formatCategoryDisplay(value: string): string {
  return value
    .split(/\s+-\s+/)
    .map((segment) => {
      let tokenIndex = 0;
      return segment.replace(/[A-Za-z0-9]+/g, (token) => {
        const upperToken = token.toLocaleUpperCase();
        const isAcronym = CATEGORY_ACRONYMS.has(upperToken);
        const normalized = isAcronym ? upperToken : token.toLocaleLowerCase();
        const result = tokenIndex === 0 && !isAcronym
          ? normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
          : normalized;
        tokenIndex += 1;
        return result;
      });
    })
    .join(' - ');
}

const MetadataRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="product-detail-fact">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

export const ProductDetail: React.FC<ProductDetailProps> = ({
  commodity,
  dataSource,
  dataFetchedAt,
  onBack,
  stateOfCalamity,
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const resolvedImageUrl = resolveImageUrl(commodity.image_path);
  const [imageStatus, setImageStatus] = useState<ProductImageSettlement | 'loading'>(
    resolvedImageUrl ? 'loading' : 'missing',
  );
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const imageTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setImageStatus(resolvedImageUrl ? 'loading' : 'missing');
    setIsLightboxOpen(false);
    setIsAccordionOpen(false);
    setIsReferenceOpen(false);
  }, [commodity.id, resolvedImageUrl]);

  const parsed = formatCommodityDisplay(
    commodity.commodity_name,
    commodity.category || '',
    commodity.unit || commodity.package_size || '',
    commodity.effective_date || '',
  );
  const title = parsed.title || commodity.commodity_name;
  const subtitle = formatCategoryDisplay(
    parsed.categoryPath || commodity.category || 'Category not provided',
  );
  const effectiveDate = formatDate(commodity.effective_date);
  const fetchedDate = formatDate(dataFetchedAt);
  const priceLabel = getPriceLabel(dataSource);
  const classification = commodity.regulatory_classification === 'BASIC_NECESSITY'
    ? 'Basic Necessity'
    : commodity.regulatory_classification === 'PRIME_COMMODITY'
      ? 'Prime Commodity'
      : 'Not provided';
  const hasActivePriceFreezeCoverage = stateOfCalamity === true
    && commodity.price_freeze_applicable === true;
  const monitoringLabel = stateOfCalamity === false
    ? 'Normal monitoring'
    : hasActivePriceFreezeCoverage
      ? 'Price freeze coverage'
      : null;

  return (
    <div className="product-detail">
      <button type="button" className="product-detail-back" aria-label="Back to Prices" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to Prices
      </button>

      <section className="product-detail-hero" aria-labelledby="product-detail-title">
        <div className="product-detail-image-stage">
          <ProgressiveProductImage
            imageUrl={resolvedImageUrl}
            altText={commodity.commodity_name}
            variant="detail"
            decorative={false}
            onSettled={setImageStatus}
          />
          {imageStatus === 'loaded' && resolvedImageUrl && (
            <button
              ref={imageTriggerRef}
              type="button"
              className="product-detail-image-trigger"
              aria-label={`View full image of ${commodity.commodity_name}`}
              onClick={() => setIsLightboxOpen(true)}
            >
              <span className="product-detail-image-expand" aria-hidden="true">
                <Maximize2 size={18} />
              </span>
            </button>
          )}
        </div>

        <div className="product-detail-summary">
          <div className="product-detail-category">{subtitle}</div>
          <h1 id="product-detail-title">{title}</h1>
          <div className="product-detail-price-block">
            <div className="product-detail-price-label">{priceLabel}</div>
            <div className="product-detail-price">₱{Number(commodity.baseline_price).toFixed(2)}</div>
          </div>
        </div>
      </section>

      {hasActivePriceFreezeCoverage && (
        <section className="product-detail-freeze">
          <button
            type="button"
            onClick={() => setIsAccordionOpen((open) => !open)}
            aria-expanded={isAccordionOpen}
            aria-controls="product-detail-freeze-content"
          >
            <span className="product-detail-freeze-label">
              <Info size={20} aria-hidden="true" />
              Price-freeze information
            </span>
            {isAccordionOpen ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
          </button>
          {isAccordionOpen && (
            <div id="product-detail-freeze-content" className="product-detail-freeze-content">
              {commodity.price_freeze_treatment || 'A price-freeze treatment is marked for this item. Check the cited bulletin for the applicable terms.'}
            </div>
          )}
        </section>
      )}

      <section className="product-detail-reference">
        <button
          type="button"
          onClick={() => setIsReferenceOpen((open) => !open)}
          aria-expanded={isReferenceOpen}
          aria-controls="product-detail-reference-content"
        >
          <span className="product-detail-reference-label">
            <Info size={18} aria-hidden="true" />
            Reference details
          </span>
          {isReferenceOpen ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
        </button>
        {isReferenceOpen && (
          <div id="product-detail-reference-content" className="product-detail-reference-content">
            <dl className="product-detail-facts">
              <MetadataRow label="Classification">{classification}</MetadataRow>
              {monitoringLabel && (
                <MetadataRow label="Monitoring status">{monitoringLabel}</MetadataRow>
              )}
              <MetadataRow label="Effective date">{effectiveDate || 'Not provided'}</MetadataRow>
              <MetadataRow label="Bulletin source">{commodity.source_reference || 'Not provided'}</MetadataRow>
              <MetadataRow label={dataSource === 'live' ? 'Live data checked' : 'Saved data date'}>
                {fetchedDate || 'Not provided'}
              </MetadataRow>
            </dl>
          </div>
        )}
      </section>

      {resolvedImageUrl && (
        <ProductImageLightbox
          open={isLightboxOpen && imageStatus === 'loaded'}
          imageUrl={resolvedImageUrl}
          altText={commodity.commodity_name}
          triggerRef={imageTriggerRef}
          onDismiss={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  );
};

export default ProductDetail;
