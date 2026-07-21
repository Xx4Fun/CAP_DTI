import React, { useState, useEffect } from 'react';
import { Search, MapPin, ShieldCheck } from 'lucide-react';
import { apiClient, type Establishment } from '../api/client';

export const StoreDirectory: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [stores, setStores] = useState<Establishment[]>([]);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async (query = '') => {
    setLoading(true);
    try {
      const res = await apiClient.get('/public/establishments', {
        params: { query }
      });
      if (res.data.success) {
        setStores(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    fetchStores(val);
  };

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
          Verified Participating Establishments
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
          Directory of registered retail stores under DTI Antique provincial monitoring.
        </p>

        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '14px', color: '#a1a1aa' }} size={18} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '40px' }}
            placeholder="Search store name, SEC number, address..."
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>
          Loading establishment directory...
        </div>
      ) : stores.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>
          No participating establishments found matching "{searchTerm}".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {stores.map((store) => (
            <div
              key={store.id}
              className="glass-panel"
              style={{ marginBottom: 0, cursor: 'pointer' }}
              onClick={() => setSelectedStore(store)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                    {store.store_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginTop: '2px' }}>
                    Registered Owner: <strong>{store.owner_name}</strong>
                  </div>
                </div>
                <span className="badge badge-green">
                  <ShieldCheck size={12} /> VERIFIED
                </span>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#71717a', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="#f59e0b" /> {store.address}
              </div>

              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a1a1aa' }}>
                <span>SEC Registration: <strong>{store.dti_sec_number}</strong></span>
                <span>Location: {Number(store.latitude).toFixed(4)}, {Number(store.longitude).toFixed(4)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Store Detail Modal */}
      {selectedStore && (
        <div className="modal-backdrop" onClick={() => setSelectedStore(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff' }}>
                {selectedStore.store_name}
              </div>
              <span className="badge badge-green">DTI REGISTERED</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '20px' }}>
              <div><strong>Owner:</strong> {selectedStore.owner_name}</div>
              <div><strong>Address:</strong> {selectedStore.address}</div>
              <div><strong>SEC Registration Number:</strong> {selectedStore.dti_sec_number}</div>
              <div><strong>GPS Location:</strong> Latitude {selectedStore.latitude}, Longitude {selectedStore.longitude}</div>
            </div>

            <button className="btn-secondary" onClick={() => setSelectedStore(null)}>
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
