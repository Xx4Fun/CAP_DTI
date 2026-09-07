import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, Star, Store } from 'lucide-react';
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
              {useInstitutionFallback ? <Building2 size={24} /> : <Store size={24} />}
              <span>{initials}</span>
            </span>
          )}
        </span>

        <span className="store-card-shade" aria-hidden="true" />
        <span className="store-card-copy">
          <strong className="store-card-title">{store.store_name}</strong>
          <span className="store-card-address">
            <MapPin size={14} className="store-card-pin" aria-hidden="true" />
            <span>{store.address}</span>
          </span>
        </span>

        {distanceLabel && (
          <span className="store-card-distance">
            <MapPin size={12} aria-hidden="true" />
            {distanceLabel.replace(/\s*away$/i, '')}
          </span>
        )}

        {busy && (
          <span className="store-card-loading-overlay" aria-hidden="true">
            <Loader2 size={32} className="animate-spin" />
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
        <Star size={16} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
        <span>Favorite</span>
      </button>
    </article>
  );
};

export default StoreSelectionCard;
