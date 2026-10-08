import { useEffect, useMemo, useState } from 'react';
import { apiClient, type Establishment } from '../api/client';
import { getRecentStoreIds } from '../app/recentStores';
import { getFavoriteStoreIds, toggleFavoriteStore } from '../app/favoriteStores';
import { matchesPublicStoreSearch } from '../app/storeSearch';
import { StoreSelectionView, type StoreDirectoryFilter } from './StoreSelectionView';
import { StoreSelectionCard } from './StoreSelectionCard';

export const ReceiptStoreSelector = ({ busy, onCancel, onSelect }: {
  busy: boolean;
  onCancel: () => void;
  onSelect: (store: Establishment) => void;
}) => {
  const [stores, setStores] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StoreDirectoryFilter>('all');
  const [favorites, setFavorites] = useState(getFavoriteStoreIds);
  const recent = useMemo(getRecentStoreIds, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void apiClient.get('/public/establishments', { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) {
        if (!Array.isArray(response.data?.data)) throw new Error('Invalid store directory');
        setStores(response.data.data);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError('The store directory could not be loaded. Your receipt has not changed.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const visible = useMemo(() => stores.filter(store => matchesPublicStoreSearch(store, query)
    && (filter !== 'favorite' || favorites.includes(store.id)) && (filter !== 'recent' || recent.includes(store.id)))
    .sort((a, b) => filter === 'recent' ? recent.indexOf(a.id) - recent.indexOf(b.id) : a.store_name.localeCompare(b.store_name)),
  [stores, query, filter, favorites, recent]);

  return <>
    <StoreSelectionView subtitle="Select the store shown on your receipt. Your uploaded photos will be kept."
      backAction={{ label: 'Back to receipt', onActivate: () => { if (!busy) onCancel(); } }}
      searchValue={query} onSearchChange={setQuery} activeFilter={filter} onFilterChange={setFilter}
      isLoading={loading} resultCount={visible.length} emptyTitle="No matching stores"
      emptyDescription="Try another store name, address, or filter."
      onReset={query || filter !== 'all' ? () => { setQuery(''); setFilter('all'); } : undefined}>
      {visible.map(store => <StoreSelectionCard key={store.id} store={store} isFavorite={favorites.includes(store.id)}
        disabled={busy} onActivate={() => onSelect(store)} onToggleFavorite={() => setFavorites(toggleFavoriteStore(store.id))} />)}
    </StoreSelectionView>
    {error && <div className="receipt-form-error" role="alert"><p>{error}</p>
      <button type="button" className="btn-secondary" onClick={() => setRefresh(value => value + 1)}>Retry loading stores</button>
    </div>}
    {busy && <p role="status">Checking your receipt against the selected store…</p>}
  </>;
};
