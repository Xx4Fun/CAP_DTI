import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Filter, Search, X } from 'lucide-react';
import { apiClient, type Commodity } from '../api/client';
import type { AppRoute } from '../app/routing';
import { fallbackCommodities } from '../data/srpFallback';
import { ConnectivityNotice } from './ConnectivityNotice';

type SrpSearchProps = {
  onNavigate: (route: AppRoute) => void;
  isOnline: boolean;
};

type Classification = 'all' | 'BASIC_NECESSITY' | 'PRIME_COMMODITY';
type SortOrder = 'name' | 'price-low' | 'price-high';

export function SrpSearch({ onNavigate, isOnline }: SrpSearchProps) {
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [query, setQuery] = useState(() => sessionStorage.getItem('srp_search_term') ?? '');
  const [classification, setClassification] = useState<Classification>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('name');
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'live' | 'bundled'>('live');

  useEffect(() => {
    sessionStorage.removeItem('srp_search_term');
    let active = true;
    apiClient.get('/public/commodities')
      .then((response) => {
        const data = response.data?.data;
        if (!active) return;
        if (response.data?.success && Array.isArray(data)) {
          setCommodities(data);
          setSource('live');
        } else {
          setCommodities(fallbackCommodities);
          setSource('bundled');
        }
      })
      .catch(() => {
        if (active) {
          setCommodities(fallbackCommodities);
          setSource('bundled');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commodities
      .filter((item) => classification === 'all' || item.regulatory_classification === classification)
      .filter((item) => !needle || [
        item.commodity_name, item.category, item.brand, item.variant, item.package_size, item.unit,
      ].some((value) => value?.toLowerCase().includes(needle)))
      .sort((left, right) => {
        if (sortOrder === 'price-low') return left.baseline_price - right.baseline_price;
        if (sortOrder === 'price-high') return right.baseline_price - left.baseline_price;
        return left.commodity_name.localeCompare(right.commodity_name);
      });
  }, [classification, commodities, query, sortOrder]);

  const reset = () => {
    setQuery('');
    setClassification('all');
    setSortOrder('name');
  };

  const submit = (event: FormEvent) => event.preventDefault();

  return (
    <section className="directory-page" aria-labelledby="prices-title">
      <header className="page-header">
        <p className="page-kicker">Official reference directory</p>
        <h1 id="prices-title">DTI reference prices</h1>
        <p className="page-intro">Match the exact brand, variant, and package size before comparing a price.</p>
      </header>

      <ConnectivityNotice isOnline={isOnline} freshness={source} updatedAt={source === 'bundled' ? fallbackCommodities[0]?.effective_date : null} />

      <form className="directory-controls" role="search" onSubmit={submit}>
        <div className="search-control">
          <label htmlFor="price-search">Search product, brand, or package size</label>
          <div><Search aria-hidden="true" /><input id="price-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. sardines 155g" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X aria-hidden="true" /></button>}</div>
        </div>
        <div className="filter-row">
          <label><span><Filter aria-hidden="true" /> Classification</span>
            <select value={classification} onChange={(event) => setClassification(event.target.value as Classification)}>
              <option value="all">All classifications</option>
              <option value="BASIC_NECESSITY">Basic necessities</option>
              <option value="PRIME_COMMODITY">Prime commodities</option>
            </select>
          </label>
          <label><span>Sort by</span>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
              <option value="name">Product name</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </select>
          </label>
        </div>
        {(query || classification !== 'all' || sortOrder !== 'name') && (
          <div className="active-filters">
            <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={reset}>Reset filters</button>
          </div>
        )}
      </form>

      <div className="results-heading" aria-live="polite">
        <strong>{loading ? 'Loading current prices…' : `${results.length} reference prices`}</strong>
        <span>{source === 'live' ? 'Live DTI data' : 'Bundled DTI reference list'}</span>
      </div>

      {loading ? (
        <div className="skeleton-list" aria-label="Loading prices">{[1, 2, 3, 4].map((value) => <div key={value} />)}</div>
      ) : results.length === 0 ? (
        <div className="empty-state"><Search aria-hidden="true" /><h2>No matching prices</h2><p>Try a shorter product name or reset the classification filter.</p><button className="button button--secondary" type="button" onClick={reset}>Reset filters</button></div>
      ) : (
        <div className="product-list">
          {results.map((commodity) => (
            <button className="product-row" type="button" key={commodity.id} onClick={() => onNavigate({ name: 'product', commodityId: commodity.id })}>
              <span className="product-row__copy">
                <small>{commodity.category || 'DTI monitored product'}</small>
                <strong>{commodity.commodity_name}</strong>
                <span>{commodity.unit || commodity.package_size || 'Package size listed in detail'}</span>
              </span>
              <span className="product-row__price"><small>Reference</small><strong>₱{commodity.baseline_price.toFixed(2)}</strong></span>
              <ArrowRight aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
