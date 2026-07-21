import React, { useState, useEffect } from 'react';
import { Search, Calendar } from 'lucide-react';
import { apiClient, type Commodity } from '../api/client';

export const SrpSearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCommodities();
  }, []);

  const fetchCommodities = async (query = '') => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/public/commodities', {
        params: { query }
      });
      if (res.data.success) {
        setCommodities(res.data.data);
      }
    } catch (err) {
      setError('Unable to load current SRP bulletin records. Displaying cached reference.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    fetchCommodities(val);
  };

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
          Commodity & SRP Bulletin Directory
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
          Search officially regulated prices by commodity name, brand, variant, and package size.
        </p>

        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '14px', color: '#a1a1aa' }} size={18} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '40px' }}
            placeholder="Search e.g. 'Regular Milled Rice', 'Refined White Sugar'..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>
          Loading official SRP bulletin records...
        </div>
      ) : commodities.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>
          No regulated commodities found matching "{searchTerm}".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {commodities.map((item) => (
            <div key={item.id} className="glass-panel" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                    {item.commodity_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                    {item.brand && <span>Brand: <strong>{item.brand}</strong></span>}
                    {item.variant && <span>Variant: <strong>{item.variant}</strong></span>}
                    {item.package_size && <span>Size: <strong>{item.package_size}</strong></span>}
                  </div>
                </div>
                <span className="badge badge-amber">
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
