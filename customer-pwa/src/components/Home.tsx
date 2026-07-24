import React from 'react';
import {
  Scan,
  FileCheck,
  ClipboardCheck,
  FileText,
  ChevronRight,
  Fish,
  Milk,
  Coffee,
  Droplet,
  Info
} from 'lucide-react';

interface HomeProps {
  setActiveTab: (tab: string) => void;
  stateOfCalamity: boolean;
}

export const Home: React.FC<HomeProps> = ({ setActiveTab, stateOfCalamity }) => {
  const handleCategoryClick = (category: string) => {
    sessionStorage.setItem('srp_search_term', category);
    setActiveTab('prices');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Hero Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px', lineHeight: 1.25 }}>
          Check current commodity prices
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.4 }}>
          Scan a shelf tag or submit a checkout receipt for DTI evaluation.
        </p>
      </div>

      {/* 2. Primary Action Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Scan Shelf Tag Card */}
        <div
          onClick={() => setActiveTab('scan')}
          style={{
            background: '#f0f7ff',
            border: '1px solid #bfdbfe',
            borderRadius: '16px',
            padding: '18px 16px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
          <div>
            <div style={{ color: '#2563eb', marginBottom: '14px' }}>
              <Scan size={36} strokeWidth={1.75} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
              Scan shelf tag
            </div>
            <div style={{ width: '24px', height: '2px', background: '#2563eb', margin: '6px 0 8px 0', borderRadius: '1px' }} />
            <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.35 }}>
              Compare a displayed shelf price.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <ChevronRight size={20} color="#2563eb" />
          </div>
        </div>

        {/* Report Concern Card */}
        <div
          onClick={() => setActiveTab('reports')}
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '16px',
            padding: '18px 16px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
          <div>
            <div style={{ color: '#d97706', marginBottom: '14px' }}>
              <FileCheck size={36} strokeWidth={1.75} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
              Report concern
            </div>
            <div style={{ width: '24px', height: '2px', background: '#d97706', margin: '6px 0 8px 0', borderRadius: '1px' }} />
            <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.35 }}>
              Submit a checkout receipt for DTI evaluation.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <ChevronRight size={20} color="#d97706" />
          </div>
        </div>
      </div>

      {/* 3. Track Report Card */}
      <div
        onClick={() => setActiveTab('reports')}
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0f172a'
          }}>
            <ClipboardCheck size={20} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
            Track an existing report
          </span>
        </div>
        <ChevronRight size={20} color="#2563eb" />
      </div>

      {/* 4. Current Price Bulletin Status Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '18px 16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}>
        {/* Header line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="#0f172a" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
              Current price bulletin
            </span>
          </div>
          {stateOfCalamity ? (
            <span style={{
              background: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
              Calamity active
            </span>
          ) : (
            <span style={{
              background: '#d1fae5',
              color: '#059669',
              border: '1px solid #6ee7b7',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
              Normal monitoring
            </span>
          )}
        </div>

        {/* Details Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          background: '#f8fafc',
          borderRadius: '12px',
          padding: '12px 14px',
          marginBottom: '14px'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '2px' }}>
              Effective date
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
              11 May 2026
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '14px' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '2px' }}>
              Reference prices
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
              167 available
            </div>
          </div>
        </div>

        {/* Subtext */}
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '14px' }}>
          Last updated: <span style={{ color: '#334155', fontWeight: 500 }}>24 Jul 2026 · 3:21 PM</span>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
          <button
            onClick={() => setActiveTab('prices')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#2563eb',
              fontWeight: 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            View bulletin details <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 5. Popular Categories Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Popular categories
          </h2>
          <span
            onClick={() => setActiveTab('prices')}
            style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            View all
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {/* Sardines */}
          <div
            onClick={() => handleCategoryClick('Sardines')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ color: '#2563eb' }}>
              <Fish size={24} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>Sardines</span>
          </div>

          {/* Milk */}
          <div
            onClick={() => handleCategoryClick('Milk')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ color: '#2563eb' }}>
              <Milk size={24} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>Milk</span>
          </div>

          {/* Coffee */}
          <div
            onClick={() => handleCategoryClick('Coffee')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ color: '#2563eb' }}>
              <Coffee size={24} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>Coffee</span>
          </div>

          {/* Water */}
          <div
            onClick={() => handleCategoryClick('Water')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ color: '#2563eb' }}>
              <Droplet size={24} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>Water</span>
          </div>
        </div>
      </div>

      {/* 6. Info Footer Card */}
      <div
        onClick={() => setActiveTab('prices')}
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#eff6ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb'
          }}>
            <Info size={18} />
          </div>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
            How price checking and reporting work
          </span>
        </div>
        <ChevronRight size={18} color="#2563eb" />
      </div>
    </div>
  );
};

export default Home;
