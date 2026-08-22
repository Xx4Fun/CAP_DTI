import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuildingColumns,
  faLocationDot,
  faSpinner,
  faStar,
  faStore,
} from '@fortawesome/free-solid-svg-icons';
import { resolveImageUrl, type Establishment } from '../api/client';

export interface StoreSelectionCardProps {
  store: Establishment;
  distanceLabel?: string;
  isFavorite: boolean;
  busy?: boolean;
  disabled?: boolean;
  onToggleFavorite: () => void;
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
  isFavorite,
  busy = false,
  disabled = false,
  onToggleFavorite,
  onActivate,
}) => {
  const imageUrl = resolveImageUrl(store.image_path);
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => getStoreInitials(store.store_name), [store.store_name]);
  const useInstitutionFallback = store.store_name.toLowerCase().includes('market');

  useEffect(() => setImageFailed(false), [imageUrl]);

  return (
    <article className="store-selection-card">
      <button
        type="button"
        className="store-card-select"
        aria-label={`Continue with ${store.store_name}`}
        aria-busy={busy}
        disabled={disabled}
        onClick={onActivate}
      >
        <span className="store-card-media" aria-hidden="true">
          {imageUrl && !imageFailed ? (
            <img
              src={imageUrl}
              alt=""
              className="store-card-photo"
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="store-card-facade-fallback">
              <FontAwesomeIcon icon={useInstitutionFallback ? faBuildingColumns : faStore} />
              <span>{initials}</span>
            </span>
          )}
        </span>

        <span className="store-card-shade" aria-hidden="true" />
        <span className="store-card-copy">
          <strong className="store-card-title">{store.store_name}</strong>
          <span className="store-card-address">
            <FontAwesomeIcon icon={faLocationDot} className="store-card-pin" aria-hidden="true" />
            <span>{store.address}</span>
          </span>
        </span>

        {distanceLabel && (
          <span className="store-card-distance">
            <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
            {distanceLabel.replace(/\s*away$/i, '')}
          </span>
        )}

        {busy && (
          <span className="store-card-loading-overlay" aria-hidden="true">
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          </span>
        )}
      </button>

      <button
        type="button"
        className={`store-card-favorite ${isFavorite ? 'active' : ''}`}
        aria-label={`${isFavorite ? 'Remove' : 'Add'} ${store.store_name} ${isFavorite ? 'from' : 'to'} favorites`}
        aria-pressed={isFavorite}
        disabled={disabled}
        onClick={onToggleFavorite}
      >
        <FontAwesomeIcon icon={faStar} aria-hidden="true" />
        <span>Favorite</span>
      </button>
    </article>
  );
};
