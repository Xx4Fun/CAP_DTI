import React from 'react';
import { resolveImageUrl, type Commodity } from '../api/client';
import { formatCommodityDisplay } from '../app/commodityFormatter';
import { applicablePrice, type PriceDataSource } from '../app/priceDataPresentation';
import { ProgressiveProductImage } from './ProgressiveProductImage';

interface PriceProductCardProps {
  commodity: Commodity;
  dataSource: PriceDataSource;
  stateOfCalamity?: boolean;
  onSelect: () => void;
  prioritizeImage?: boolean;
  onImageSettled?: () => void;
}

export const PriceProductCard: React.FC<PriceProductCardProps> = ({
  commodity,
  stateOfCalamity,
  onSelect,
  prioritizeImage = false,
  onImageSettled,
}) => {
  const parsed = formatCommodityDisplay(
    commodity.commodity_name || '',
    commodity.category || '',
    commodity.unit || commodity.package_size || '',
    commodity.effective_date || '',
  );
  const displayName = parsed.title || commodity.commodity_name;
  const isUnitInName = Boolean(parsed.unit && displayName.toLowerCase().includes(parsed.unit.toLowerCase()));
  const displaySubheader = parsed.categoryPath
    ? (parsed.unit && !isUnitInName ? `${parsed.categoryPath}, ${parsed.unit}` : parsed.categoryPath)
    : (isUnitInName ? '' : parsed.unit);
  const isBasic = commodity.regulatory_classification === 'BASIC_NECESSITY';
  const price = applicablePrice(commodity, stateOfCalamity);

  return (
    <button
      type="button"
      className="price-product-card"
      aria-label={`View ${displayName} price details`}
      onClick={onSelect}
    >
      <ProgressiveProductImage
        imageUrl={resolveImageUrl(commodity.image_path)}
        altText={displayName}
        variant="card"
        decorative
        loading={prioritizeImage ? 'eager' : 'lazy'}
        onSettled={onImageSettled ? () => onImageSettled() : undefined}
      />

      <span className="price-product-info">
        <span className="price-product-name">{displayName}</span>
        {displaySubheader && <span className="price-product-subheader">{displaySubheader}</span>}
        <span className="price-product-info-divider" aria-hidden="true" />
        <span className={`price-product-classification ${isBasic ? 'is-basic' : 'is-prime'}`}>
          {isBasic ? 'Basic Necessity' : 'Prime Commodity'}
        </span>
      </span>

      <span className={`price-product-price${price.isEmergency ? ' is-emergency' : ''}`}>
        <span className="price-product-price-label">{price.label}</span>
        <span className="price-product-price-rule" aria-hidden="true" />
        <span className={`price-product-price-value${price.value === null ? ' is-unavailable' : ''}`}>{price.value === null ? 'Unavailable' : `₱${Number(price.value).toFixed(2)}`}</span>
      </span>
    </button>
  );
};
