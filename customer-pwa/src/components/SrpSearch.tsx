import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronRight,
  Info,
  X,
  Layers
} from 'lucide-react';
import { apiClient, type Commodity } from '../api/client';
import { fallbackCommodities } from '../data/srpFallback';
import { ProductDetail } from './ProductDetail';
import { writeHandoff } from '../app/handoffs';

interface SrpSearchProps {
  setActiveTab?: (tab: string) => void;
  stateOfCalamity?: boolean;
}

// Product illustration component for list cards
const CardProductIllustration: React.FC<{ commodity: Commodity }> = ({ commodity }) => {
  if (commodity.image_path) {
    return (
      <div
        style={{
          width: '54px',
          height: '62px',
          borderRadius: '10px',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <img
          src={commodity.image_path}
          alt={commodity.commodity_name}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  const name = (commodity.commodity_name || '').toLowerCase();
  const category = (commodity.category || '').toLowerCase();

  const isSardines = name.includes('sardine') || category.includes('sardine');
  const isLuncheon = name.includes('luncheon') || name.includes('meat') || category.includes('meat');
  const isMilk = name.includes('milk') || category.includes('milk');
  const isCoffee = name.includes('coffee') || category.includes('coffee');

  if (isSardines) {
    return (
      <div
        style={{
          width: '54px',
          height: '62px',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, #dc2626 0%, #991b1b 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 3px',
          color: '#ffffff',
          boxShadow: '0 2px 6px rgba(153, 27, 27, 0.2)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)' }} />
        <div style={{ textAlign: 'center', marginTop: '3px' }}>
          <div style={{ fontSize: '0.48rem', fontWeight: 800, color: '#fef08a', letterSpacing: '0.04em' }}>SABA</div>
        </div>
        <div style={{ width: '82%', height: '20px', background: 'rgba(255,255,255,0.18)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="12" viewBox="0 0 34 20" fill="none">
            <path d="M2 10C8 4 20 4 28 10C20 16 8 16 2 10Z" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5" />
          </svg>
        </div>
        <div style={{ fontSize: '0.42rem', fontWeight: 700, background: '#f59e0b', color: '#78350f', padding: '1px 3px', borderRadius: '3px', textAlign: 'center', width: '92%' }}>
          TOMATO
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)' }} />
      </div>
    );
  }

  if (isLuncheon) {
    return (
      <div
        style={{
          width: '54px',
          height: '62px',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, #1e3a8a 0%, #1e40af 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 3px',
          color: '#ffffff',
          boxShadow: '0 2px 6px rgba(30, 58, 138, 0.2)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)' }} />
        <div style={{ textAlign: 'center', marginTop: '3px' }}>
          <div style={{ fontSize: '0.45rem', fontWeight: 800, color: '#ffffff' }}>PUREFOODS</div>
        </div>
        <div style={{ width: '80%', height: '18px', background: '#f43f5e', borderRadius: '4px' }} />
        <div style={{ fontSize: '0.4rem', color: '#cbd5e1' }}>MEAT</div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)' }} />
      </div>
    );
  }

  if (isMilk) {
    return (
      <div
        style={{
          width: '54px',
          height: '62px',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, #0284c7 0%, #0369a1 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          color: '#ffffff',
          flexShrink: 0
        }}
      >
        <div style={{ width: '22px', height: '26px', background: '#ffffff', borderRadius: '4px' }} />
        <div style={{ fontSize: '0.5rem', fontWeight: 700 }}>MILK</div>
      </div>
    );
  }

  if (isCoffee) {
    return (
      <div
        style={{
          width: '54px',
          height: '62px',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, #78350f 0%, #451a03 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          color: '#ffffff',
          flexShrink: 0
        }}
      >
        <div style={{ width: '22px', height: '24px', background: '#d97706', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.55rem' }}>
          NES
        </div>
        <div style={{ fontSize: '0.5rem', fontWeight: 700 }}>COFFEE</div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '54px',
        height: '62px',
        borderRadius: '10px',
        background: 'linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        color: '#ffffff',
        flexShrink: 0
      }}
    >
      <Layers size={22} />
      <div style={{ fontSize: '0.45rem', fontWeight: 700 }}>SRP</div>
    </div>
  );
};

export const SrpSearch: React.FC<SrpSearchProps> = ({ setActiveTab, stateOfCalamity = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'BASIC_NECESSITY' | 'PRIME_COMMODITY'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedCommodity, setSelectedCommodity] = useState<Commodity | null>(null);
  const [sortOption, setSortOption] = useState<'default' | 'price_low' | 'price_high' | 'name'>('default');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const activeFiltersCount = (categoryFilter !== 'ALL' ? 1 : 0) + (selectedCategory !== 'ALL' ? 1 : 0) + (sortOption !== 'default' ? 1 : 0);

  const [commodities, setCommodities] = useState<Commodity[]>(() => {
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
    return fallbackCommodities;
  });

  const availableCategories = React.useMemo(() => {
    const categories = new Set<string>();
    commodities.forEach((item) => {
      if (item.category && item.category.trim()) {
        categories.add(item.category.trim());
      }
    });
    return Array.from(categories).sort();
  }, [commodities]);

  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<'live' | 'cached' | 'bundled'>('bundled');
  const [lastUpdatedTime, setLastUpdatedTime] = useState('');
  const isCachedMode = dataSource !== 'live';
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedTerm = sessionStorage.getItem('srp_search_term');
    if (savedTerm) {
      setSearchTerm(savedTerm);
      fetchCommodities(savedTerm);
      sessionStorage.removeItem('srp_search_term');
    } else {
      fetchCommodities('');
    }
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const refreshLiveBulletin = () => {
      if (document.visibilityState !== 'hidden') {
        void fetchCommodities(searchTerm);
      }
    };

    window.addEventListener('focus', refreshLiveBulletin);
    document.addEventListener('visibilitychange', refreshLiveBulletin);
    return () => {
      window.removeEventListener('focus', refreshLiveBulletin);
      document.removeEventListener('visibilitychange', refreshLiveBulletin);
    };
  }, [searchTerm]);

  const fetchCommodities = async (query = '') => {
    setLoading(true);
    try {
      const res = await apiClient.get('/public/commodities', {
        params: { query }
      });

      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const liveData: Commodity[] = res.data.data;
        setCommodities(liveData);
        setDataSource('live');
        setLastUpdatedTime(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
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
      console.warn('API connection offline. Using fallback commodities:', err);
      let baseDataSet = fallbackCommodities;
      let fallbackSource: 'cached' | 'bundled' = 'bundled';
      try {
        const cached = localStorage.getItem('price_watch_srp_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            baseDataSet = parsed;
            fallbackSource = 'cached';
          }
        }
      } catch (e) {
        console.warn('Error reading from localStorage cache:', e);
      }

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
      setDataSource(fallbackSource);
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

  // Helper formatting for list items
  const parseItem = (item: Commodity) => {
    let name = item.commodity_name;
    let category = item.category || '';
    let unit = item.unit || item.package_size || '';

    if (name.includes(' - ')) {
      const parts = name.split(' - ');
      if (parts.length >= 2) {
        if (!item.category) category = parts[0].trim();
        name = parts.slice(1).join(' - ').trim();
      }
    }

    const sizeMatch = name.match(/\(([^)]+)\)$/);
    if (sizeMatch) {
      if (!unit) unit = sizeMatch[1];
      name = name.replace(/\s*\([^)]+\)$/, '');
    }

    let effDate = item.effective_date || '2026-05-11';
    if (effDate.includes('T')) {
      effDate = effDate.split('T')[0];
    }
    if (effDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Keep clean YYYY-MM-DD e.g. 2026-05-11
      effDate = effDate.trim();
    }


    return { name, category, unit, effDate };
  };

  // Filter list by category chip selection and selected category dropdown
  const filteredList = commodities.filter((item) => {
    const matchesClassification =
      categoryFilter === 'ALL'
        ? true
        : categoryFilter === 'BASIC_NECESSITY'
        ? item.regulatory_classification === 'BASIC_NECESSITY'
        : item.regulatory_classification === 'PRIME_COMMODITY';

    const matchesCategory =
      selectedCategory === 'ALL'
        ? true
        : (item.category || '').toLowerCase().trim() === selectedCategory.toLowerCase().trim();

    return matchesClassification && matchesCategory;
  });

  // Apply sorting
  const sortedList = [...filteredList].sort((a, b) => {
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

  // If a commodity is selected, render ProductDetail view
  if (selectedCommodity) {
    return (
      <ProductDetail
        commodity={selectedCommodity}
        onBack={() => setSelectedCommodity(null)}
        onSelectScan={handleSelectScan}
        onSelectReport={handleSelectReport}
        stateOfCalamity={stateOfCalamity}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header removed */}

      {/* 2. Search Input Bar */}
      <div style={{ position: 'relative' }}>
        <Search
          style={{ position: 'absolute', left: '14px', top: '14px', color: '#64748b' }}
          size={18}
        />
        <input
          aria-label="Search products or brands"
          type="text"
          className="input-field"
          style={{
            paddingLeft: '42px',
            paddingRight: searchTerm ? '40px' : '16px',
            fontSize: '0.95rem',
            borderRadius: '12px',
            height: '46px',
            border: '1px solid #e2e8f0'
          }}
          placeholder="Search products or brands"
          value={searchTerm}
          onChange={handleSearchChange}
        />
        {searchTerm && (
          <button
            aria-label="Clear product search"
            onClick={() => {
              setSearchTerm('');
              fetchCommodities('');
            }}
            style={{
              position: 'absolute',
              right: '12px',
              top: '13px',
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 3. Category Filter Chips Bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'none'
        }}
      >
        <button
          onClick={() => setCategoryFilter('ALL')}
          style={{
            padding: '8px 18px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: categoryFilter === 'ALL' ? 700 : 500,
            background: categoryFilter === 'ALL' ? '#2563eb' : '#ffffff',
            color: categoryFilter === 'ALL' ? '#ffffff' : '#334155',
            border: categoryFilter === 'ALL' ? 'none' : '1px solid #e2e8f0',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: categoryFilter === 'ALL' ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          All
        </button>

        <button
          onClick={() => setCategoryFilter('BASIC_NECESSITY')}
          style={{
            padding: '8px 18px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: categoryFilter === 'BASIC_NECESSITY' ? 700 : 500,
            background: categoryFilter === 'BASIC_NECESSITY' ? '#2563eb' : '#ffffff',
            color: categoryFilter === 'BASIC_NECESSITY' ? '#ffffff' : '#334155',
            border: categoryFilter === 'BASIC_NECESSITY' ? 'none' : '1px solid #e2e8f0',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: categoryFilter === 'BASIC_NECESSITY' ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          Basic Necessities
        </button>

        <button
          onClick={() => setCategoryFilter('PRIME_COMMODITY')}
          style={{
            padding: '8px 18px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: categoryFilter === 'PRIME_COMMODITY' ? 700 : 500,
            background: categoryFilter === 'PRIME_COMMODITY' ? '#2563eb' : '#ffffff',
            color: categoryFilter === 'PRIME_COMMODITY' ? '#ffffff' : '#334155',
            border: categoryFilter === 'PRIME_COMMODITY' ? 'none' : '1px solid #e2e8f0',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: categoryFilter === 'PRIME_COMMODITY' ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          Prime Commodities
        </button>
      </div>

      {/* Category Select Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <label htmlFor="category-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
          Category:
        </label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#0f172a',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="ALL">All Categories ({commodities.length})</option>
          {availableCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* 4. Filters & Sort Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {/* Filters Button */}
        <button
          onClick={() => setIsFilterModalOpen(!isFilterModalOpen)}
          style={{
            background: '#ffffff',
            border: '1px solid #2563eb',
            borderRadius: '12px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          <SlidersHorizontal size={18} />
          Filters
          <span
            style={{
              background: '#2563eb',
              color: '#ffffff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            {activeFiltersCount}
          </span>
        </button>

        {/* Sort Button */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as any)}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '10px 16px 10px 36px',
              width: '100%',
              color: '#0f172a',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              appearance: 'none'
            }}
          >
            <option value="default">Default Order</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="name">Name: A-Z</option>
          </select>
          <ArrowUpDown size={18} style={{ position: 'absolute', left: '12px', pointerEvents: 'none', color: '#64748b' }} />
        </div>
      </div>

      {/* Filter Modal Drawer if active */}
      {isFilterModalOpen && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Filter Options</span>
            <button
              onClick={() => setIsFilterModalOpen(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Regulatory Classification</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600
              }}
            >
              <option value="ALL">All</option>
              <option value="BASIC_NECESSITY">Basic Necessity</option>
              <option value="PRIME_COMMODITY">Prime Commodity</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={() => {
                setCategoryFilter('ALL');
                setIsFilterModalOpen(false);
              }}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#f1f5f9', color: '#334155', fontWeight: 600, border: 'none' }}
            >
              Reset
            </button>
            <button
              onClick={() => setIsFilterModalOpen(false)}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', background: '#2563eb', color: '#ffffff', fontWeight: 600, border: 'none' }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* 5. Live Status Bar */}
      <div
        style={{
          background: isCachedMode ? '#fffbeb' : '#f0fdf4',
          border: isCachedMode ? '1px solid #fde68a' : '1px solid #bbf7d0',
          borderRadius: '12px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: isCachedMode ? '#b45309' : '#166534',
          fontSize: '0.85rem',
          fontWeight: 600
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isCachedMode ? '#d97706' : '#16a34a',
            display: 'inline-block',
            boxShadow: isCachedMode ? '0 0 0 3px rgba(217, 119, 6, 0.2)' : '0 0 0 3px rgba(22, 163, 74, 0.2)'
          }}
        />
        <span>
          {dataSource === 'cached' ? (
            <>
              <Info size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Offline mode · Displaying cached SRP bulletin
            </>
          ) : dataSource === 'bundled' ? (
            <>
              <Info size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Bundled DTI reference list · Live prices unavailable
            </>
          ) : (
            `Current · Updated ${lastUpdatedTime}`
          )}
        </span>
      </div>

      {/* 6. Total Item Count */}
      <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
        {sortedList.length} prices{selectedCategory !== 'ALL' ? ` in ${selectedCategory}` : ''}
      </div>

      {/* 7. Product Cards List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Loading reference prices...
        </div>
      ) : sortedList.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            padding: '40px 16px',
            color: '#64748b'
          }}
        >
          No regulated commodities found matching "{searchTerm}".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedList.map((item) => {
            const { name, category, unit, effDate } = parseItem(item);
            const isBasic = item.regulatory_classification === 'BASIC_NECESSITY';

            return (
              <div
                key={item.id}
                onClick={() => setSelectedCommodity(item)}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Left Product Illustration */}
                <CardProductIllustration commodity={item} />

                {/* Middle Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: '#0f172a',
                      lineHeight: 1.25,
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {name}
                  </div>

                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '6px' }}>
                    {category}{unit ? ` · ${unit}` : ''}
                  </div>

                  <div>
                    <span
                      className={`badge ${isBasic ? 'badge-green' : 'badge-blue'}`}
                      style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    >
                      {isBasic ? 'Basic Necessity' : 'Prime Commodity'}
                    </span>
                  </div>
                </div>

                {/* Right Price & Chevron */}
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb' }}>
                      ₱{Number(item.baseline_price).toFixed(2)}
                    </span>
                    <ChevronRight size={18} color="#0f172a" />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    Effective {effDate}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SrpSearch;
