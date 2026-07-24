import { useMemo, useState } from 'react';
import { Check, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import type { Establishment } from '../api/client';

type StorePickerProps = {
  stores: Establishment[];
  selectedId: number | null;
  recentStoreId?: number | null;
  onSelect: (store: Establishment) => void;
  title: string;
};

export function StorePicker({ stores, selectedId, recentStoreId = null, onSelect, title }: StorePickerProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stores.filter((store) => !needle || [store.store_name, store.address, store.owner_name, store.dti_sec_number]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [query, stores]);
  const recentStore = stores.find((store) => store.id === recentStoreId);

  return (
    <section className="store-picker" aria-labelledby="store-picker-title">
      <div className="section-heading"><div><p className="page-kicker">Participating establishment</p><h2 id="store-picker-title">{title}</h2></div></div>
      {recentStore && (
        <button className="recent-store" type="button" aria-pressed={selectedId === recentStore.id} onClick={() => onSelect(recentStore)}>
          <span><small>Recently selected this session</small><strong>{recentStore.store_name}</strong></span>
          {selectedId === recentStore.id && <Check aria-hidden="true" />}
        </button>
      )}
      <div className="search-control">
        <label htmlFor="store-search">Search store name, registration, or address</label>
        <div><Search aria-hidden="true" /><input id="store-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search participating stores" />{query && <button type="button" aria-label="Clear store search" onClick={() => setQuery('')}><X aria-hidden="true" /></button>}</div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state empty-state--compact"><Search aria-hidden="true" /><h3>No participating store found</h3><p>Try a store name, registration number, or part of the address.</p></div>
      ) : (
        <div className="store-list" role="list">
          {filtered.map((store) => {
            const selected = selectedId === store.id;
            return (
              <div role="listitem" key={store.id}>
              <button className={`store-row ${selected ? 'is-selected' : ''}`} type="button" aria-pressed={selected} onClick={() => onSelect(store)}>
                <span className="store-row__icon"><ShieldCheck aria-hidden="true" /></span>
                <span className="store-row__copy"><strong>{store.store_name}</strong><span><MapPin aria-hidden="true" /> {store.address}</span><small>Registration: {store.dti_sec_number}</small></span>
                <span className="store-row__check" aria-hidden="true">{selected && <Check />}</span>
              </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
