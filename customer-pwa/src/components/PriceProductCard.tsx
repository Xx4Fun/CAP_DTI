import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { type Commodity } from '../api/client';
import { formatCommodityDisplay } from '../app/commodityFormatter';
import { getPriceLabel, type PriceDataSource } from '../app/priceDataPresentation';

interface PriceProductCardProps {
  commodity: Commodity;
  dataSource: PriceDataSource;
  onSelect: () => void;
}

const ProductFallback: React.FC = () => {
  return (
    <span className="price-product-fallback price-product-fallback--neutral">
      <ImageOff size={24} aria-hidden="true" />
      <span>No image</span>
    </span>
  );
};

export const PriceProductCard: React.FC<PriceProductCardProps> = ({ commodity, dataSource, onSelect }) => {
  const [failedImagePath, setFailedImagePath] = useState<string | null>(null);
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

  const imageFailed = Boolean(commodity.image_path && failedImagePath === commodity.image_path);

  return (
    <button
      type="button"
      className="price-product-card"
      aria-label={`View ${displayName} price details`}
      onClick={onSelect}
    >
      <span className="price-product-media" aria-hidden="true">
        {commodity.image_path && !imageFailed ? (
          <img
            className="price-product-image"
            src={commodity.image_path}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedImagePath(commodity.image_path || null)}
          />
        ) : (
          <ProductFallback />
        )}
      </span>

      <span className="price-product-info">
        <span className="price-product-name">{displayName}</span>
        {displaySubheader && <span className="price-product-subheader">{displaySubheader}</span>}
        <span className="price-product-info-divider" aria-hidden="true" />
        <span className={`price-product-classification ${isBasic ? 'is-basic' : 'is-prime'}`}>
          {isBasic ? 'Basic Necessity' : 'Prime Commodity'}
        </span>
      </span>

      <span className="price-product-price">
        <span className="price-product-price-label">{getPriceLabel(dataSource)}</span>
        <span className="price-product-price-rule" aria-hidden="true" />
        <span className="price-product-price-value">₱{Number(commodity.baseline_price).toFixed(2)}</span>
      </span>
    </button>
  );
};
