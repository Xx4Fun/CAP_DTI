import React from 'react';
import { Home, Tag, Scale, ClipboardList, AlertTriangle, Menu } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stateOfCalamity?: boolean;
  hideTopHeader?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  stateOfCalamity,
  hideTopHeader = false,
}) => {
  return (
    <>
      {!hideTopHeader && (
        <>
          <header className="navbar-top">
            <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <span className="brand-logo-frame">
                <img
                  className="brand-logo"
                  src="/branding/dti-logo.png"
                  alt=""
                />
              </span>
              <div className="brand-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                <div className="brand-name" style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: '1.1', whiteSpace: 'nowrap', letterSpacing: '-0.025em' }}>
                  <span className="brand-price">PRICE-</span>
                  <span className="brand-watch">Watch</span>
                </div>
              </div>
            </div>
          </header>
          <div className="navbar-top-offset" aria-hidden="true" />
        </>
      )}

      {/* Exceptional Status Notices */}
      {stateOfCalamity && (
        <div
          role="status"
          aria-live="polite"
          onClick={() => setActiveTab('prices')}
          style={{
            background: '#fef2f2',
            borderBottom: '1px solid #fca5a5',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: '#dc2626',
            fontWeight: 600,
            maxWidth: '600px',
            margin: '0 auto',
            cursor: 'pointer'
          }}
        >
          <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0 }} />
          <span>Price Freeze active · View applicable prices</span>
        </div>
      )}

      {/* Fixed five-action bottom navigation */}
      <nav className="nav-bottom" aria-label="Primary navigation">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
        >
          <Home size={20} />
          <span>Home</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'prices' || activeTab === 'search' || activeTab === 'stores' ? 'active' : ''}`}
          onClick={() => setActiveTab('prices')}
          aria-current={activeTab === 'prices' || activeTab === 'search' || activeTab === 'stores' ? 'page' : undefined}
        >
          <Tag size={20} />
          <span>Prices</span>
        </button>

        <button
          className={`nav-item nav-item-scan ${activeTab === 'compare' ? 'active' : ''}`}
          onClick={() => setActiveTab('compare')}
          aria-current={activeTab === 'compare' ? 'page' : undefined}
        >
          <Scale size={20} />
          <span>Compare</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'reports' || activeTab === 'report' || activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
          aria-current={activeTab === 'reports' || activeTab === 'report' || activeTab === 'track' ? 'page' : undefined}
        >
          <ClipboardList size={20} />
          <span>Reports</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'more' ? 'active' : ''}`}
          onClick={() => setActiveTab('more')}
          aria-current={activeTab === 'more' ? 'page' : undefined}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
};

export default Navbar;
