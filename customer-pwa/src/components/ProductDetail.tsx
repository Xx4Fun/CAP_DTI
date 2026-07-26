import React, { useState } from 'react';
import {
  ArrowLeft,
  Scan,
  FileCheck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { type Commodity } from '../api/client';

export interface ProductDetailProps {
  commodity: Commodity;
  onBack: () => void;
  onSelectScan?: (commodity: Commodity) => void;
  onSelectReport?: (commodity: Commodity) => void;
  stateOfCalamity?: boolean;
}

// Product illustration component rendering realistic packaging graphics matching prototype designs
const ProductIllustration: React.FC<{ commodity: Commodity; size?: number }> = ({ commodity, size = 90 }) => {
  const name = (commodity.commodity_name || '').toLowerCase();
  const category = (commodity.category || '').toLowerCase();

  const isSardines = name.includes('sardine') || category.includes('sardine');
  const isLuncheon = name.includes('luncheon') || name.includes('meat') || category.includes('meat');
  const isMilk = name.includes('milk') || category.includes('milk');
  const isCoffee = name.includes('coffee') || category.includes('coffee');
  const isWater = name.includes('water') || category.includes('water');

  if (isSardines) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size * 1.1}px`,
          borderRadius: '12px',
          background: 'linear-gradient(145deg, #dc2626 0%, #991b1b 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 6px',
          color: '#ffffff',
          boxShadow: '0 4px 10px rgba(153, 27, 27, 0.25)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)',
            borderRadius: '12px 12px 0 0'
          }}
        />
        <div style={{ textAlign: 'center', marginTop: '6px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em', color: '#fef08a', textTransform: 'uppercase' }}>
            SABA
          </div>
          <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#ffffff', opacity: 0.9 }}>
            PHILIPPINES
          </div>
        </div>

        {/* Fish Graphic */}
        <div style={{ width: '80%', height: '32px', background: 'rgba(255,255,255,0.15)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 10C8 4 20 4 28 10C20 16 8 16 2 10Z" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5" />
            <path d="M28 10L33 5V15L28 10Z" fill="#fbbf24" />
            <circle cx="8" cy="9" r="1.5" fill="#0f172a" />
          </svg>
        </div>

        <div style={{ fontSize: '0.5rem', fontWeight: 600, background: '#f59e0b', color: '#78350f', padding: '1px 6px', borderRadius: '4px', textAlign: 'center', width: '90%' }}>
          IN TOMATO SAUCE
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)',
            borderRadius: '0 0 12px 12px'
          }}
        />
      </div>
    );
  }

  if (isLuncheon) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size * 1.1}px`,
          borderRadius: '12px',
          background: 'linear-gradient(145deg, #1e3a8a 0%, #1e40af 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 6px',
          color: '#ffffff',
          boxShadow: '0 4px 10px rgba(30, 58, 138, 0.25)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)' }} />
        <div style={{ textAlign: 'center', marginTop: '6px' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#ffffff' }}>PUREFOODS</div>
          <div style={{ fontSize: '0.5rem', color: '#fef08a' }}>LUNCHEON MEAT</div>
        </div>
        <div style={{ width: '80%', height: '28px', background: '#f43f5e', borderRadius: '6px', border: '1px solid #fda4af' }} />
        <div style={{ fontSize: '0.5rem', color: '#cbd5e1' }}>CHINESE STYLE</div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #94a3b8 0%, #e2e8f0 50%, #64748b 100%)' }} />
      </div>
    );
  }

  if (isMilk) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size * 1.1}px`,
          borderRadius: '12px',
          background: 'linear-gradient(145deg, #0284c7 0%, #0369a1 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          color: '#ffffff',
          boxShadow: '0 4px 10px rgba(2, 132, 199, 0.2)',
          flexShrink: 0
        }}
      >
        <div style={{ width: '32px', height: '38px', background: '#ffffff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#38bdf8' }} />
        </div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>MILK</div>
      </div>
    );
  }

  if (isCoffee) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size * 1.1}px`,
          borderRadius: '12px',
          background: 'linear-gradient(145deg, #78350f 0%, #451a03 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          color: '#ffffff',
          boxShadow: '0 4px 10px rgba(120, 53, 15, 0.2)',
          flexShrink: 0
        }}
      >
        <div style={{ width: '30px', height: '34px', background: '#d97706', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.7rem' }}>
          NES
        </div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>COFFEE</div>
      </div>
    );
  }

  if (isWater) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size * 1.1}px`,
          borderRadius: '12px',
          background: 'linear-gradient(145deg, #0ea5e9 0%, #0369a1 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          color: '#ffffff',
          boxShadow: '0 4px 10px rgba(14, 165, 233, 0.2)',
          flexShrink: 0
        }}
      >
        <div style={{ width: '24px', height: '32px', border: '2px solid #ffffff', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffffff' }} />
        </div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>WATER</div>
      </div>
    );
  }

  // Default generic container
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size * 1.1}px`,
        borderRadius: '12px',
        background: 'linear-gradient(145deg, #3b82f6 0%, #1d4ed8 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        color: '#ffffff',
        boxShadow: '0 4px 10px rgba(29, 78, 216, 0.2)',
        flexShrink: 0
      }}
    >
      <Layers size={28} />
      <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}>DTI SRP</div>
    </div>
  );
};

export const ProductDetail: React.FC<ProductDetailProps> = ({
  commodity,
  onBack,
  onSelectScan,
  onSelectReport,
  stateOfCalamity = false
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  // Helper formatting for name, category, and dates
  const formatInfo = () => {
    let title = commodity.commodity_name;
    let subtitle = commodity.category || 'Regulated commodity item';
    let sizeStr = commodity.unit || commodity.package_size || '';

    // If name is structured like "Category - Product (Size)"
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length >= 2) {
        if (!commodity.category) {
          subtitle = parts[0].trim();
        }
        title = parts.slice(1).join(' - ').trim();
      }
    }

    // Extract size in parenthesis if needed
    const sizeMatch = title.match(/\(([^)]+)\)$/);
    if (sizeMatch && !sizeStr) {
      sizeStr = sizeMatch[1];
      title = title.replace(/\s*\([^)]+\)$/, '');
    }

    // Format date string
    let effDate = commodity.effective_date || '2026-05-11';
    if (effDate.includes('T')) {
      effDate = effDate.split('T')[0];
    }
    if (effDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      effDate = effDate.trim();
    }


    return { title, subtitle, sizeStr, effDate };
  };

  const { title, subtitle, sizeStr, effDate } = formatInfo();
  const isBasic = commodity.regulatory_classification === 'BASIC_NECESSITY';
  const isCalamity = stateOfCalamity || commodity.regulatory_state === 'CALAMITY_ACTIVE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px' }}>
      {/* 1. Top Back Button */}
      <div>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#2563eb',
            fontWeight: 600,
            fontSize: '0.92rem',
            cursor: 'pointer',
            padding: '4px 0'
          }}
        >
          <ArrowLeft size={18} />
          Back to Prices
        </button>
      </div>

      {/* 2. Product Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <ProductIllustration commodity={commodity} size={76} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.25
            }}
          >
            {title}
          </h1>
          <div style={{ fontSize: '0.88rem', color: '#475569', fontWeight: 500 }}>
            {subtitle}
          </div>
          {sizeStr && (
            <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
              {sizeStr}
            </div>
          )}
        </div>
      </div>

      {/* 3. Large Current Reference Price Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
      >
        <div>
          <div style={{ fontSize: '0.88rem', color: '#475569', fontWeight: 600, marginBottom: '6px' }}>
            Current reference price
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#2563eb', lineHeight: 1.1 }}>
            ₱{Number(commodity.baseline_price).toFixed(2)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <span
              className="badge badge-green"
              style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700 }}
            >
              Current SRP
            </span>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              · Effective {effDate}
            </span>
          </div>
        </div>

        {/* Regulatory Specifications Table */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Row 1: Classification */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Classification</span>
            <span
              className={`badge ${isBasic ? 'badge-green' : 'badge-blue'}`}
              style={{ fontSize: '0.75rem', fontWeight: 700 }}
            >
              {isBasic ? 'Basic Necessity' : 'Prime Commodity'}
            </span>
          </div>

          {/* Row 2: Geographic Scope */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Geographic scope</span>
            <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600 }}>Nationwide</span>
          </div>

          {/* Row 3: Regulatory State */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Regulatory state</span>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: isCalamity ? '#dc2626' : '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isCalamity ? '#dc2626' : '#059669' }} />
              {isCalamity ? 'Calamity active' : 'Normal monitoring'}
            </span>
          </div>

          {/* Row 4: Last Updated */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Last updated</span>
            <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 500 }}>24 Jul 2026, 3:21 PM</span>
          </div>
        </div>
      </div>

      {/* 4. Price-freeze Information Accordion */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <button
          onClick={() => setIsAccordionOpen(!isAccordionOpen)}
          style={{
            width: '100%',
            padding: '16px',
            background: 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={20} color="#0f172a" />
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
              Price-freeze information
            </span>
          </div>
          {isAccordionOpen ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
        </button>

        {isAccordionOpen && (
          <div
            style={{
              padding: '16px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.85rem',
              color: '#334155',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <ShieldCheck size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Republic Act No. 7581 (Price Act):</strong> Mandates that prices of basic necessities are automatically frozen at prevailing rates upon declaration of a State of Calamity or Emergency.
              </div>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
              • Price freezes remain in effect for up to <strong>60 days</strong> unless lifted earlier by executive order or DTI bulletin.
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
              • Illegal price manipulation, hoarding, or selling above the official SRP ceiling during active price freezes incurs strict administrative penalties and legal sanctions.
            </div>
          </div>
        )}
      </div>

      {/* 5. Action Buttons Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Scan Shelf Price */}
        <button
          onClick={() => onSelectScan?.(commodity)}
          style={{
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '16px',
            padding: '18px 16px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            textAlign: 'left',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            transition: 'all 0.15s ease'
          }}
        >
          <div>
            <Scan size={28} style={{ marginBottom: '12px' }} />
            <div style={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.25 }}>
              Scan shelf price
            </div>
            <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: '4px' }}>
              Compare a displayed shelf price.
            </div>
          </div>
        </button>

        {/* Report a Concern */}
        <button
          onClick={() => onSelectReport?.(commodity)}
          style={{
            background: '#ffffff',
            color: '#2563eb',
            border: '1px solid #bfdbfe',
            borderRadius: '16px',
            padding: '18px 16px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            textAlign: 'left',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.15s ease'
          }}
        >
          <div>
            <FileCheck size={28} color="#2563eb" style={{ marginBottom: '12px' }} />
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#2563eb', lineHeight: 1.25 }}>
              Report a concern
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
              Requires a checkout receipt.
            </div>
          </div>
        </button>
      </div>

      {/* 6. Bulletin Source Link */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
            Bulletin source
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
            DTI price bulletin · Effective {effDate}
          </div>
        </div>
        <ChevronRight size={20} color="#64748b" />
      </div>
    </div>
  );
};

export default ProductDetail;
