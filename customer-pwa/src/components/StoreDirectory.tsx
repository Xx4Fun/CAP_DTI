import React, { useState, useEffect } from 'react';
import { Search, MapPin, ShieldCheck, CheckCircle2, ChevronRight, X, Scan } from 'lucide-react';
import { apiClient, type Establishment, defaultStoresList } from '../api/client';
import { ensureApiReady } from '../api/readiness';
import {
  PUBLIC_DIRECTORY_MAX_AGE_MS,
  PUBLIC_ESTABLISHMENTS_CACHE_KEY,
  readVerifiedCache,
  writeVerifiedCache,
} from '../app/verifiedCache';
import { StoreFacadeImage } from './ShelfScanner';
import { writeHandoff } from '../app/handoffs';

interface StoreDirectoryProps {
  setActiveTab?: (tab: string) => void;
}



export const StoreDirectory: React.FC<StoreDirectoryProps> = ({ setActiveTab }) => {
  const [initialCache] = useState(() => readVerifiedCache<Establishment[]>(
    PUBLIC_ESTABLISHMENTS_CACHE_KEY,
    PUBLIC_DIRECTORY_MAX_AGE_MS,
  ));
  const [searchTerm, setSearchTerm] = useState('');
  const [stores, setStores] = useState<Establishment[]>(initialCache?.data ?? defaultStoresList);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<'live' | 'cached' | 'bundled'>(initialCache ? 'cached' : 'bundled');

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async (query = '') => {
    setError('');
    try {
      await ensureApiReady();
      const res = await apiClient.get('/public/establishments', {
        params: { query }
      });
      if (!res.data?.success || !Array.isArray(res.data.data)) {
        throw new Error('Invalid establishments response');
      }
      setStores(res.data.data);
      setDataSource('live');
      if (!query) {
        writeVerifiedCache(PUBLIC_ESTABLISHMENTS_CACHE_KEY, res.data.data);
      }
    } catch (err) {
      console.warn('API connection unavailable. Using the safest available store directory:', err);
      const cached = readVerifiedCache<Establishment[]>(
        PUBLIC_ESTABLISHMENTS_CACHE_KEY,
        PUBLIC_DIRECTORY_MAX_AGE_MS,
      );
      if (cached) {
        setStores(cached.data);
        setDataSource('cached');
        setError('Live directory unavailable. Showing the last verified cached directory.');
      } else {
        setStores(defaultStoresList);
        setDataSource('bundled');
        setError('Unable to connect to store directory. Showing local reference data.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    fetchStores(val);
  };

  const filteredStores = stores.filter((s) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      s.store_name.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.owner_name.toLowerCase().includes(q) ||
      (s.dti_sec_number && s.dti_sec_number.toLowerCase().includes(q))
    );
  });

  const handleStartScanForStore = (store: Establishment) => {
    writeHandoff({ kind: 'store-to-scan', storeId: store.id });
    if (setActiveTab) {
      setActiveTab('scan');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Panel */}
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px', letterSpacing: '-0.02em' }}>
          Stores Directory
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.4 }}>
          Verified retail establishments participating in DTI Antique provincial monitoring.
        </p>
      </div>

      {/* Search Input Bar */}
      <div style={{ position: 'relative' }}>
        <Search style={{ position: 'absolute', left: '14px', top: '15px', color: '#94a3b8' }} size={18} />
        <input
          aria-label="Search participating stores"
          type="text"
          className="input-field"
          style={{
            paddingLeft: '42px',
            paddingRight: searchTerm ? '40px' : '16px',
            height: '48px',
            borderRadius: '14px',
            fontSize: '0.92rem',
            border: '1px solid #e2e8f0',
            background: '#ffffff'
          }}
          placeholder="Search store name, SEC number, or address..."
          value={searchTerm}
          onChange={handleSearch}
        />
        {searchTerm && (
          <button
            aria-label="Clear store search"
            onClick={() => {
              setSearchTerm('');
              fetchStores('');
            }}
            style={{ position: 'absolute', right: '12px', top: '13px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="banner-warning" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {dataSource === 'cached' && !error && (
        <div role="status" className="banner-warning">
          Showing verified cached directory while live data reconnects.
        </div>
      )}

      {/* Item Count */}
      <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
        {filteredStores.length} participating stores found
      </div>

      {/* Store Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Loading participating establishments...
        </div>
      ) : filteredStores.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          No participating establishments found matching "{searchTerm}".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredStores.map((store) => (
            <div
              key={store.id}
              onClick={() => setSelectedStore(store)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '14px',
                display: 'flex',
                gap: '12px',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Left Photo Facade */}
              <StoreFacadeImage photoType={(store as any).photoType} storeName={store.store_name} />

              {/* Right Store Info */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="badge badge-green" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      <CheckCircle2 size={12} /> VERIFIED
                    </span>
                    <ChevronRight size={16} color="#94a3b8" />
                  </div>

                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', lineHeight: 1.25, marginBottom: '4px' }}>
                    {store.store_name}
                  </div>

                  <div style={{ fontSize: '0.82rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {store.address}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    SEC: <strong>{store.dti_sec_number}</strong>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartScanForStore(store);
                    }}
                    style={{
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <Scan size={13} /> Scan shelf tag
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Store Detail Modal */}
      {selectedStore && (
        <div className="modal-backdrop" onClick={() => setSelectedStore(null)}>
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedStore.store_name} details`}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#0f172a' }}>
                {selectedStore.store_name}
              </div>
              <span className="badge badge-green">
                <ShieldCheck size={12} /> DTI REGISTERED
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: '#475569', marginBottom: '20px' }}>
              <div><strong>Owner / Entity:</strong> {selectedStore.owner_name}</div>
              <div><strong>Address:</strong> {selectedStore.address}</div>
              <div><strong>SEC Registration:</strong> {selectedStore.dti_sec_number}</div>
              <div><strong>GPS Location:</strong> {Number(selectedStore.latitude).toFixed(4)}, {Number(selectedStore.longitude).toFixed(4)}</div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  const storeToScan = selectedStore;
                  setSelectedStore(null);
                  handleStartScanForStore(storeToScan);
                }}
              >
                <Scan size={16} /> Scan shelf tag at this store
              </button>

              <button className="btn-secondary" onClick={() => setSelectedStore(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreDirectory;
