import React, { useState, useEffect, useRef } from 'react';
import { Search, Calendar, Tag, Info } from 'lucide-react';
import { apiClient, type Commodity } from '../api/client';
import { fallbackCommodities } from '../data/srpFallback';

export const SrpSearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [commodities, setCommodities] = useState<Commodity[]>(() => {
    // Priority 1: Synced DTI Admin cache from localStorage
    try {
      const cached = localStorage.getItem('price_watch_srp_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading initial localStorage cache:', e);
    }
    // Priority 2: Initial bundled 167 items fallback
    return fallbackCommodities;
  });

  const [loading, setLoading] = useState(false);
  const [isCachedMode, setIsCachedMode] = useState(false);

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchCommodities('');
  }, []);

  const fetchCommodities = async (query = '') => {
    setLoading(true);

    try {
      const res = await apiClient.get('/public/commodities', {
        params: { query }
      });

      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const liveData: Commodity[] = res.data.data;
        setCommodities(liveData);
        setIsCachedMode(false);

        // Update local storage cache with newest DTI Admin prices whenever online
        if (!query && liveData.length > 0) {
          try {
            localStorage.setItem('price_watch_srp_cache', JSON.stringify(liveData));
          } catch (e) {
            console.warn('Unable to save latest DTI Admin prices to localStorage:', e);
          }
        }
      } else {
        throw new Error('Invalid response structure');
      }
    } catch (err) {
      console.warn('API connection offline or unavailable. Operating in local fallback mode:', err);
      setIsCachedMode(true);

      // Determine offline dataset: Priority 1 = Latest synced DTI Admin data, Priority 2 = Bundled fallback
      let baseDataSet = fallbackCommodities;
      try {
        const cached = localStorage.getItem('price_watch_srp_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            baseDataSet = parsed;
          }
        }
      } catch (e) {
        console.warn('Error reading from localStorage cache:', e);
      }

      // Perform fast, local fuzzy search on the latest available dataset
      const q = query.toLowerCase().trim();
      const filtered = q
        ? baseDataSet.filter(
            (item) =>
              item.commodity_name.toLowerCase().includes(q) ||
              (item.category && item.category.toLowerCase().includes(q)) ||
              (item.unit && item.unit.toLowerCase().includes(q)) ||
              (item.regulatory_classification && item.regulatory_classification.toLowerCase().includes(q))
          )
        : baseDataSet;

      setCommodities(filtered);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      fetchCommodities(val);
    }, 200);
  };

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
          Commodity & SRP Bulletin Directory
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
          Search officially regulated prices by commodity name, category, brand, and package size.
        </p>

        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '14px', color: '#a1a1aa' }} size={18} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '40px' }}
            placeholder="Search e.g. 'canned', 'sardines', 'milk', 'coffee', 'rice'..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {isCachedMode && (
        <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', color: '#fbbf24', fontSize: '0.82rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} /> Displaying cached SRP reference ({commodities.length} items available)
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>
          Searching official SRP bulletin records...
        </div>
      ) : commodities.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>
          No regulated commodities found matching "{searchTerm}".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {commodities.map((item) => (
            <div key={item.id} className="glass-panel" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {item.category && (
                      <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                        <Tag size={10} style={{ marginRight: '4px' }} />
                        {item.category}
                      </span>
                    )}
                    {item.regulatory_classification && (
                      <span
                        className={`badge ${item.regulatory_classification === 'BASIC_NECESSITY' ? 'badge-amber' : ''}`}
                        style={{ fontSize: '0.7rem', background: item.regulatory_classification === 'BASIC_NECESSITY' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)', color: item.regulatory_classification === 'BASIC_NECESSITY' ? '#10b981' : '#60a5fa', border: 'none' }}
                      >
                        {item.regulatory_classification === 'BASIC_NECESSITY' ? 'BASIC NECESSITY' : 'PRIME COMMODITY'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', lineHeight: '1.3' }}>
                    {item.commodity_name}
                  </div>
                  {item.unit && (
                    <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '4px' }}>
                      Package / Size: <strong>{item.unit}</strong>
                    </div>
                  )}
                </div>
                <span className="badge badge-amber" style={{ whiteSpace: 'nowrap' }}>
                  SRP ACTIVE
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.75rem', color: '#71717a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} /> Effective Date: {item.effective_date}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase' }}>Reference Price</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>
                    ₱{Number(item.baseline_price).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
