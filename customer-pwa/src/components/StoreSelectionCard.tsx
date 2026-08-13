import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronRight,
  faLocationDot,
  faSpinner,
  faStore,
} from '@fortawesome/free-solid-svg-icons';
import { resolveImageUrl, type Establishment } from '../api/client';

interface StoreSelectionCardProps {
  store: Establishment;
  distanceLabel?: string;
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
  busy = false,
  disabled = false,
  onActivate,
}) => {
  const imageUrl = resolveImageUrl(store.image_path);
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => getStoreInitials(store.store_name), [store.store_name]);

  useEffect(() => setImageFailed(false), [imageUrl]);

  return (
    <button
      type="button"
      className="store-selection-card"
      aria-label={`Continue with ${store.store_name}`}
      aria-busy={busy}
      disabled={disabled}
      onClick={onActivate}
    >
      <span className="store-selection-thumbnail" aria-hidden="true">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="store-selection-fallback">
            <FontAwesomeIcon icon={faStore} />
            <span>{initials}</span>
          </span>
        )}
      </span>

      <span className="store-selection-content">
        {distanceLabel && (
          <span className="store-selection-meta">
            <span className="store-selection-distance">{distanceLabel}</span>
          </span>
        )}

        <span className="store-selection-name">{store.store_name}</span>
        <span className="store-selection-address">
          <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
          <span>{store.address}</span>
        </span>
      </span>

      <span className="store-selection-next" aria-hidden="true">
        <FontAwesomeIcon
          className={busy ? 'store-selection-spinner' : undefined}
          icon={busy ? faSpinner : faChevronRight}
        />
      </span>
    </button>
  );
};
