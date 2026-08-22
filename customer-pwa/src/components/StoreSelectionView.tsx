import React, { useId, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faClockRotateLeft,
  faMagnifyingGlass,
  faStar,
  faStore,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

export type StoreDirectoryFilter = 'all' | 'recent' | 'favorite';

interface StoreSelectionViewProps {
  subtitle: string;
  backAction?: {
    label: string;
    onActivate: () => void;
  };
  searchValue: string;
  onSearchChange: (value: string) => void;
  activeFilter: StoreDirectoryFilter;
  onFilterChange: (filter: StoreDirectoryFilter) => void;
  isLoading?: boolean;
  resultCount: number;
  geoError?: string;
  emptyTitle: string;
  emptyDescription: string;
  onReset?: () => void;
  children: ReactNode;
}

const filters = [
  { value: 'all' as const, label: 'All', icon: faStore },
  { value: 'recent' as const, label: 'Recent', icon: faClockRotateLeft },
  { value: 'favorite' as const, label: 'Favorite', icon: faStar },
];

export const StoreSelectionView: React.FC<StoreSelectionViewProps> = ({
  subtitle,
  backAction,
  searchValue,
  onSearchChange,
  activeFilter,
  onFilterChange,
  isLoading = false,
  resultCount,
  geoError,
  emptyTitle,
  emptyDescription,
  onReset,
  children,
}) => {
  const searchId = useId();
  return (
    <section className="store-selection-container" aria-labelledby={`${searchId}-title`}>
      <header className={`store-hero-banner ${backAction ? 'store-hero-banner--with-back' : ''}`}>
        {backAction && (
          <button
            type="button"
            className="store-hero-back-btn"
            onClick={backAction.onActivate}
            aria-label={backAction.label}
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </button>
        )}

        <div className="store-hero-text">
          <h1 id={`${searchId}-title`} className="store-hero-title">Choose a store</h1>
          <p className="store-hero-subtitle">{subtitle}</p>
        </div>
      </header>

      <div className="store-search-floating-wrapper">
        <div className="store-search-floating-card" role="search">
          <label className="visually-hidden" htmlFor={searchId}>Search stores</label>
          <FontAwesomeIcon icon={faMagnifyingGlass} className="store-search-icon" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            className="store-search-input"
            placeholder="Search store or address"
            aria-label="Search verified stores"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchValue && (
            <button
              type="button"
              className="store-search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Clear store search"
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="store-filter-pills" role="group" aria-label="Filter store directory">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`store-filter-pill ${activeFilter === filter.value ? 'active' : ''}`}
            aria-pressed={activeFilter === filter.value}
            onClick={() => onFilterChange(filter.value)}
          >
            <FontAwesomeIcon icon={filter.icon} aria-hidden="true" />
            <span>{filter.label}</span>
          </button>
        ))}
      </div>

      {geoError && (
        <p role="status" className="store-geo-error">{geoError}</p>
      )}

      <div className="store-cards-list" aria-busy={isLoading}>
        {isLoading ? (
          <>
            {[1, 2, 3].map((key) => (
              <div key={key} className="store-card-skeleton" aria-hidden="true" data-testid="store-card-skeleton">
                <div className="store-skeleton-shimmer" />
              </div>
            ))}
          </>
        ) : resultCount > 0 ? (
          children
        ) : (
          <div className="store-empty-state">
            <FontAwesomeIcon icon={activeFilter === 'favorite' ? faStar : faStore} className="store-empty-icon" aria-hidden="true" />
            <p className="store-empty-title">{emptyTitle}</p>
            <p className="store-empty-desc">{emptyDescription}</p>
            {onReset && (
              <button type="button" className="btn-secondary store-empty-reset-btn" onClick={onReset}>
                View all stores
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
