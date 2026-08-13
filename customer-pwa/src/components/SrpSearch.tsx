import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  Info,
  X
} from 'lucide-react';
import { apiClient, type Commodity } from '../api/client';
import { ensureApiReady } from '../api/readiness';
import { fallbackCommodities } from '../data/srpFallback';
import { ProductDetail } from './ProductDetail';
import { writeHandoff } from '../app/handoffs';
import {
  commodityMatchesPriceFilters,
  countActivePriceFilters,
  extractPriceCategories,
  sanitizeAppliedCategories,
  type PriceClassification,
} from '../app/priceFilters';
import {
  PUBLIC_COMMODITIES_CACHE_KEY,
  PUBLIC_DIRECTORY_MAX_AGE_MS,
  readVerifiedCache,
  writeVerifiedCache,
} from '../app/verifiedCache';
import { type PriceSortOption } from '../app/priceSort';
import { type PriceDataSource } from '../app/priceDataPresentation';
import {
  getPriceDirectoryEmptyState,
  matchesCommoditySearch,
  readPriceDirectoryView,
  writePriceDirectoryView,
} from '../app/priceDirectoryState';
import { PriceFilterSheet } from './PriceFilterSheet';
import { PriceSortMenu } from './PriceSortMenu';
import { PriceProductCard } from './PriceProductCard';
import { navigate } from '../app/routing';
import { useAppRoute } from '../hooks/useAppRoute';

interface SrpSearchProps {
  setActiveTab?: (tab: string) => void;
  stateOfCalamity?: boolean;
}

const PriceDirectorySkeleton: React.FC = () => (
  <div
    className="price-skeleton-list"
    role="status"
    aria-label="Loading reference prices"
    aria-live="polite"
  >
    <span className="visually-hidden">Loading reference prices…</span>
    {[0, 1, 2].map((item) => (
      <div className="price-product-skeleton" aria-hidden="true" key={item}>
        <span className="price-product-skeleton-media" />
        <span className="price-product-skeleton-info">
          <span />
          <span />
          <span />
        </span>
        <span className="price-product-skeleton-price" />
      </div>
    ))}
  </div>
);

export const SrpSearch: React.FC<SrpSearchProps> = ({ setActiveTab, stateOfCalamity = false }) => {
  const route = useAppRoute();
  const [initialView] = useState(() => readPriceDirectoryView(sessionStorage));
  const [searchTerm, setSearchTerm] = useState(initialView.searchTerm);
  const [categoryFilter, setCategoryFilter] = useState<PriceClassification>(initialView.classification);
  const [appliedCategories, setAppliedCategories] = useState<string[]>(initialView.categories);
  const [sortOption, setSortOption] = useState<PriceSortOption>(initialView.sort);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const priceListScrollYRef = useRef(initialView.scrollY);
  const activeFiltersCount = countActivePriceFilters(categoryFilter, appliedCategories);

  const [initialCache] = useState(() =>
    readVerifiedCache<Commodity[]>(PUBLIC_COMMODITIES_CACHE_KEY, PUBLIC_DIRECTORY_MAX_AGE_MS)
  );
  const [commodities, setCommodities] = useState<Commodity[]>(initialCache?.data ?? []);
  const [availableCategories, setAvailableCategories] = useState<string[]>(() =>
    extractPriceCategories(initialCache?.data ?? [])
  );

  const [refreshing, setRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [dataSource, setDataSource] = useState<PriceDataSource>(initialCache ? 'cached' : 'bundled');
  const [dataFetchedAt, setDataFetchedAt] = useState<number | null>(initialCache?.fetchedAt ?? null);
  const [backendUnavailable, setBackendUnavailable] = useState(false);
  const isCachedMode = dataSource !== 'live';
  const shouldShowDataNotice = isCachedMode
    && (commodities.length > 0 || initialLoadComplete)
    && (!navigator.onLine || (initialLoadComplete && backendUnavailable && !refreshing));
  const requestGenerationRef = useRef(0);

  const updateAvailableCategories = (source: Commodity[]) => {
    const nextCategories = extractPriceCategories(source);
    setAvailableCategories((current) => (
      current.length === nextCategories.length
      && current.every((category, index) => category === nextCategories[index])
        ? current
        : nextCategories
    ));
  };

  useEffect(() => {
    if (availableCategories.length > 0 || initialLoadComplete) {
      setAppliedCategories((current) => sanitizeAppliedCategories(current, availableCategories));
    }
  }, [availableCategories, initialLoadComplete]);

  useEffect(() => {
    const savedTerm = sessionStorage.getItem('srp_search_term');
    if (savedTerm) {
      setSearchTerm(savedTerm);
      sessionStorage.removeItem('srp_search_term');
    }
    void fetchCommodities();
  }, []);

  useEffect(() => {
    const refreshLiveBulletin = () => {
      if (document.visibilityState !== 'hidden') {
        void fetchCommodities();
      }
    };

    window.addEventListener('focus', refreshLiveBulletin);
    document.addEventListener('visibilitychange', refreshLiveBulletin);
    return () => {
      window.removeEventListener('focus', refreshLiveBulletin);
      document.removeEventListener('visibilitychange', refreshLiveBulletin);
    };
  }, []);

  useEffect(() => {
    writePriceDirectoryView(sessionStorage, {
      searchTerm,
      classification: categoryFilter,
      categories: appliedCategories,
      sort: sortOption,
      scrollY: priceListScrollYRef.current,
    });
  }, [searchTerm, categoryFilter, appliedCategories, sortOption]);

  const fetchCommodities = async () => {
    const requestGeneration = ++requestGenerationRef.current;
    const isLatestRequest = () => requestGeneration === requestGenerationRef.current;
    setRefreshing(true);
    try {
      await ensureApiReady();
      if (!isLatestRequest()) return;
      const res = await apiClient.get('/public/commodities');
      if (!isLatestRequest()) return;

      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const liveData: Commodity[] = res.data.data;
        const fetchedAt = Date.now();
        setCommodities(liveData);
        setDataSource('live');
        setDataFetchedAt(fetchedAt);
        setBackendUnavailable(false);
        updateAvailableCategories(liveData);
        writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, liveData, fetchedAt);
      } else {
        if (!initialCache) {
          setCommodities(fallbackCommodities);
          updateAvailableCategories(fallbackCommodities);
          setDataSource('bundled');
        }
        setBackendUnavailable(true);
      }
    } catch {
      if (!isLatestRequest()) return;
      if (!initialCache) {
        setCommodities(fallbackCommodities);
        updateAvailableCategories(fallbackCommodities);
        setDataSource('bundled');
      }
      setBackendUnavailable(true);
    } finally {
      if (isLatestRequest()) {
        setRefreshing(false);
        setInitialLoadComplete(true);
      }
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const filteredCommodities = commodities.filter((c) => (
    matchesCommoditySearch(c, searchTerm)
    && commodityMatchesPriceFilters(c, categoryFilter, appliedCategories)
  ));

  const sortedList = [...filteredCommodities].sort((a, b) => {
    if (sortOption === 'price_low') {
      return Number(a.baseline_price) - Number(b.baseline_price);
    }
    if (sortOption === 'price_high') {
      return Number(b.baseline_price) - Number(a.baseline_price);
    }
    if (sortOption === 'name') {
      return a.commodity_name.localeCompare(b.commodity_name);
    }
    return 0;
  });
  const resultCountLabel = `${sortedList.length} ${sortedList.length === 1 ? 'Reference Price' : 'Reference Prices'}`;
  const emptyState = getPriceDirectoryEmptyState(searchTerm, categoryFilter, appliedCategories);

  const handleSelectScan = (item: Commodity) => {
    writeHandoff({ kind: 'price-to-scan', commodityId: item.id });
    if (setActiveTab) {
      setActiveTab('scan');
    }
  };

  const handleSelectReport = (item: Commodity) => {
    writeHandoff({ kind: 'price-to-report', commodityId: item.id });
    if (setActiveTab) {
      setActiveTab('reports');
    }
  };

  const selectedCommodity = route.name === 'product'
    ? commodities.find((commodity) => commodity.id === route.commodityId)
    : undefined;
  const previousRouteNameRef = useRef(route.name);

  useLayoutEffect(() => {
    const previousRouteName = previousRouteNameRef.current;
    previousRouteNameRef.current = route.name;
    if (route.name !== 'prices' || previousRouteName !== 'product') return;

    const state = history.state as { priceListScrollY?: unknown } | null;
    const savedScrollY = typeof state?.priceListScrollY === 'number'
      ? state.priceListScrollY
      : priceListScrollYRef.current;
    window.scrollTo(0, savedScrollY);
  }, [route.name]);

  useEffect(() => {
    if (route.name === 'product' && initialLoadComplete && !selectedCommodity) {
      navigate({ name: 'prices' }, { replace: true });
    }
  }, [initialLoadComplete, route, selectedCommodity]);

  const openProduct = (item: Commodity) => {
    priceListScrollYRef.current = window.scrollY;
    writePriceDirectoryView(sessionStorage, {
      searchTerm,
      classification: categoryFilter,
      categories: appliedCategories,
      sort: sortOption,
      scrollY: priceListScrollYRef.current,
    });
    const existingState = typeof history.state === 'object' && history.state !== null
      ? history.state as Record<string, unknown>
      : {};
    history.replaceState({ ...existingState, priceListScrollY: priceListScrollYRef.current }, '', location.href);
    navigate(
      { name: 'product', commodityId: item.id },
      { state: { fromPriceList: true } },
    );
    window.scrollTo(0, 0);
  };

  const returnToPrices = () => {
    const state = history.state as { fromPriceList?: unknown } | null;
    if (state?.fromPriceList === true) {
      history.back();
      return;
    }
    navigate({ name: 'prices' }, { replace: true });
  };

  if (route.name === 'product' && selectedCommodity) {
    return (
      <ProductDetail
        commodity={selectedCommodity}
        onBack={returnToPrices}
        onSelectScan={handleSelectScan}
        onSelectReport={handleSelectReport}
        stateOfCalamity={stateOfCalamity}
        dataSource={dataSource}
        dataFetchedAt={dataFetchedAt}
      />
    );
  }

  if (route.name === 'product') {
    return (
      <div role="status" aria-live="polite" className="empty-state">
        {initialLoadComplete ? 'Returning to Prices…' : 'Loading product details…'}
      </div>
    );
  }

  return (
    <div className="price-directory" data-testid="price-directory">
      <h1 className="visually-hidden">Price directory</h1>

      {/* 2. Search Input Bar */}
      <div className="price-search-field">
        <label className="visually-hidden" htmlFor="price-directory-search">Search products or brands</label>
        <Search
          className="price-search-icon"
          size={18}
          aria-hidden="true"
        />
        <input
          id="price-directory-search"
          aria-label="Search products or brands"
          type="text"
          className="input-field price-search-input"
          placeholder="Search products or brands"
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {searchTerm && (
          <button
            aria-label="Clear product search"
            className="price-search-clear"
            onClick={() => {
              setSearchTerm('');
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 3. Regulatory classification */}
      <div className="price-classification-tabs" role="group" aria-label="Price classification">
        <button
          type="button"
          aria-label="All classifications"
          aria-pressed={categoryFilter === 'ALL'}
          className={`price-classification-pill price-classification-pill--short${categoryFilter === 'ALL' ? ' is-selected' : ''}`}
          onClick={() => setCategoryFilter('ALL')}
        >
          All
        </button>

        <button
          type="button"
          aria-label="Basic Necessities"
          aria-pressed={categoryFilter === 'BASIC_NECESSITY'}
          className={`price-classification-pill price-classification-pill--equal${categoryFilter === 'BASIC_NECESSITY' ? ' is-selected' : ''}`}
          onClick={() => setCategoryFilter('BASIC_NECESSITY')}
        >
          Basic Necessities
        </button>

        <button
          type="button"
          aria-label="Prime Commodities"
          aria-pressed={categoryFilter === 'PRIME_COMMODITY'}
          className={`price-classification-pill price-classification-pill--equal${categoryFilter === 'PRIME_COMMODITY' ? ' is-selected' : ''}`}
          onClick={() => setCategoryFilter('PRIME_COMMODITY')}
        >
          Prime Commodities
        </button>
      </div>

      {/* 4. Categories & Sort Buttons */}
      <div className="price-toolbar">
        {/* Categories Button */}
        <button
          ref={filtersButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isFilterSheetOpen}
          aria-label="Categories"
          onClick={() => setIsFilterSheetOpen(true)}
          className={`price-toolbar-control${activeFiltersCount > 0 ? ' is-active' : ''}`}
        >
          <span className="price-toolbar-icon" aria-hidden="true"><SlidersHorizontal size={18} /></span>
          <span className="price-toolbar-label">Categories</span>
          {activeFiltersCount > 0 && (
            <span
              aria-label={`${activeFiltersCount} active ${activeFiltersCount === 1 ? 'category' : 'categories'}`}
              className="price-toolbar-count"
            >
              {activeFiltersCount}
            </span>
          )}
        </button>

        <PriceSortMenu value={sortOption} onChange={setSortOption} />
      </div>

      {/* Active Filter Chips */}
      {appliedCategories.length > 0 && (
        <div className="price-active-filters" aria-label="Active category filters">
          {appliedCategories.map((cat) => (
            <span
              key={cat}
              className="price-filter-chip"
            >
              {cat}
              <button
                type="button"
                aria-label={`Remove ${cat} filter`}
                className="price-filter-chip-remove"
                onClick={() => setAppliedCategories(appliedCategories.filter((c) => c !== cat))}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="price-filter-chip-clear"
            onClick={() => setAppliedCategories([])}
          >
            Clear all
          </button>
        </div>
      )}
      {/* 5. Data limitation notice */}
      {shouldShowDataNotice && (
        <div className="price-data-notice">
          <Info size={16} aria-hidden="true" />
          <span>
            {dataSource === 'cached'
              ? navigator.onLine
                ? 'Saved SRP bulletin · Live update unavailable'
                : 'Offline · Showing saved SRP bulletin'
              : navigator.onLine
                ? 'Bundled DTI reference list · Live bulletin unavailable'
                : 'Offline · Showing the reference list included with the app'}
          </span>
        </div>
      )}

      {backendUnavailable && navigator.onLine && dataSource !== 'live' && (
        <button type="button" className="price-inline-retry" onClick={() => void fetchCommodities()}>
          Try live bulletin again
        </button>
      )}

      {/* 6. Total Item Count */}
      {(commodities.length > 0 || initialLoadComplete) && (
        <div className="price-results-summary" role="status" aria-live="polite" aria-atomic="true">
          <div className="price-results-count">{resultCountLabel}</div>
        </div>
      )}

      {/* 7. Product Cards List */}
      {commodities.length === 0 && refreshing && !initialLoadComplete ? (
        <PriceDirectorySkeleton />
      ) : sortedList.length === 0 ? (
        <div className="price-empty-state">
          <span className="price-empty-icon" aria-hidden="true"><Search size={20} /></span>
          <p>{emptyState.message}</p>
          {emptyState.action !== 'none' && (
            <button
              type="button"
              className="price-empty-action"
              onClick={() => {
                if (emptyState.action === 'clear-search' || emptyState.action === 'clear-all') {
                  setSearchTerm('');
                }
                if (emptyState.action === 'clear-filters' || emptyState.action === 'clear-all') {
                  setCategoryFilter('ALL');
                  setAppliedCategories([]);
                }
              }}
            >
              {emptyState.action === 'clear-search'
                ? 'Clear search'
                : emptyState.action === 'clear-filters'
                  ? 'Clear filters'
                  : 'Clear search and filters'}
            </button>
          )}
        </div>
      ) : (
        <div className="price-product-list">
          {sortedList.map((item) => (
            <PriceProductCard
              key={item.id}
              commodity={item}
              dataSource={dataSource}
              onSelect={() => openProduct(item)}
            />
          ))}
        </div>
      )}
      <PriceFilterSheet
        open={isFilterSheetOpen}
        categories={availableCategories}
        appliedCategories={appliedCategories}
        triggerRef={filtersButtonRef}
        onCancel={() => setIsFilterSheetOpen(false)}
        onApply={(categories) => {
          setAppliedCategories(sanitizeAppliedCategories(categories, availableCategories));
          setIsFilterSheetOpen(false);
        }}
      />
    </div>
  );
};

export default SrpSearch;
