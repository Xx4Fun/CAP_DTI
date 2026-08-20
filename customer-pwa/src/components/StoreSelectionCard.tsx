import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLocationDot,
  faSpinner,
  faStore,
  faBuildingColumns,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { resolveImageUrl, type Establishment } from '../api/client';

export interface StoreSelectionCardProps {
  store: Establishment;
  distanceLabel?: string;
  isClosest?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onActivate: () => void;
}

function getStoreInitials(storeName: string): string {
  const words = storeName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ST';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

export const StoreSelectionCard: React.FC<StoreSelectionCardProps> = ({
  store,
  distanceLabel,
  isClosest = false,
  busy = false,
  disabled = false,
  onActivate,
}) => {
  const imageUrl = resolveImageUrl(store.image_path);
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => getStoreInitials(store.store_name), [store.store_name]);

  useEffect(() => setImageFailed(false), [imageUrl]);

  const nameLower = store.store_name.toLowerCase();
  const formattedDistance = distanceLabel
    ? distanceLabel.toLowerCase().includes('away')
      ? distanceLabel
      : `${distanceLabel} away`
    : undefined;

  return (
    <button
      type="button"
      className="store-selection-card store-selection-card-horizontal"
      aria-label={`Continue with ${store.store_name}`}
      aria-busy={busy}
      disabled={disabled}
      onClick={onActivate}
    >
      {/* Left Thumbnail Photo / Facade */}
      <div className="store-card-thumbnail" aria-hidden="true">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            className="store-thumbnail-photo"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className={`store-thumbnail-facade-fallback ${nameLower.includes('market') ? 'facade-market' : 'facade-mart'}`}>
            <FontAwesomeIcon icon={nameLower.includes('market') ? faBuildingColumns : faStore} className="store-thumbnail-icon" />
            <span className="store-thumbnail-initials">{initials}</span>
          </div>
        )}
      </div>

      {/* Right Details Column */}
      <div className="store-card-content">
        <div className="store-card-header-row">
          <h2 className="store-card-title">
            <FontAwesomeIcon icon={faStore} className="store-card-title-icon" aria-hidden="true" />
            <span>{store.store_name}</span>
          </h2>
          <div className="store-card-header-actions">
            {isClosest && <span className="store-closest-chip">Closest</span>}
            <FontAwesomeIcon icon={faChevronRight} className="store-card-chevron" aria-hidden="true" />
          </div>
        </div>

        <p className="store-card-address">
          <FontAwesomeIcon icon={faLocationDot} className="store-card-pin" aria-hidden="true" />
          <span className="store-card-address-text">{store.address}</span>
          {formattedDistance && (
            <span className="store-card-distance-inline">• {formattedDistance}</span>
          )}
        </p>
      </div>

      {busy && (
        <div className="store-card-loading-overlay" aria-hidden="true">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
        </div>
      )}
    </button>
  );
};

