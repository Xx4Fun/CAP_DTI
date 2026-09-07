import React, { useId, type ReactNode } from 'react';
import { ArrowLeft, History, Search, Star, Store, X, type LucideIcon } from 'lucide-react';

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

const filters: Array<{ value: StoreDirectoryFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: 'All', icon: Store },
  { value: 'recent', label: 'Recent', icon: History },
  { value: 'favorite', label: 'Favorite', icon: Star },
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
            <ArrowLeft size={20} aria-hidden="true" />
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
          <Search size={18} className="store-search-icon" aria-hidden="true" />
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
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="store-filter-pills" role="group" aria-label="Filter store directory">
        {filters.map((filter) => {
          const IconComponent = filter.icon;
          return (
            <button
              key={filter.value}
              type="button"
              className={`store-filter-pill ${activeFilter === filter.value ? 'active' : ''}`}
              aria-pressed={activeFilter === filter.value}
              onClick={() => onFilterChange(filter.value)}
            >
              <IconComponent size={16} aria-hidden="true" />
              <span>{filter.label}</span>
            </button>
          );
        })}
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
            {activeFilter === 'favorite' ? (
              <Star size={40} className="store-empty-icon" aria-hidden="true" />
            ) : (
              <Store size={40} className="store-empty-icon" aria-hidden="true" />
            )}
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

export default StoreSelectionView;
