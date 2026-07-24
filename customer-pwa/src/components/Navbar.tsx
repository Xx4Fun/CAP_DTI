import React, { useState, useEffect } from 'react';
import { Home, Tag, Scan, ClipboardList, AlertTriangle, Menu, WifiOff, X } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stateOfCalamity?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, stateOfCalamity }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);



  return (
    <>
      <header className="navbar-top" style={{ height: '68px', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <img
            className="brand-logo"
            src="/logo_icon.png"
            alt=""
            style={{
              height: '38px',
              width: 'auto',
              objectFit: 'contain',
              mixBlendMode: 'multiply',
              flexShrink: 0
            }}
          />
          <div className="brand-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
            <div className="brand-name" style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: '1.1', whiteSpace: 'nowrap', letterSpacing: '-0.025em' }}>
              <span style={{ color: '#0f172a' }}>PRICE-</span>
              <span style={{ color: '#1d4ed8' }}>Watch</span>
            </div>
            <div className="brand-subtitle" style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400, lineHeight: '1.1', whiteSpace: 'nowrap', marginTop: '2px' }}>
              Consumer Price Guide
            </div>
          </div>
        </div>

        <button
          className="menu-button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          style={{
            minWidth: '44px',
            minHeight: '44px',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            borderRadius: '10px',
            color: '#0f172a',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background-color 0.15s ease'
          }}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Exceptional Status Notices (Rendered BELOW Header, NOT inside Header) */}
      {stateOfCalamity && (
        <div
          role="status"
          aria-live="polite"
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
            margin: '0 auto'
          }}
        >
          <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0 }} />
          <span>Price Freeze active · View applicable prices</span>
        </div>
      )}

      {stateOfCalamity === undefined && !isOffline && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: '#b45309',
            fontWeight: 600,
            maxWidth: '600px',
            margin: '0 auto'
          }}
        >
          <AlertTriangle size={15} color="#b45309" style={{ flexShrink: 0 }} />
          <span>Regulatory status unavailable</span>
        </div>
      )}

      {isOffline && !stateOfCalamity && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: '#b45309',
            fontWeight: 600,
            maxWidth: '600px',
            margin: '0 auto'
          }}
        >
          <WifiOff size={15} color="#b45309" style={{ flexShrink: 0 }} />
          <span>Offline · Showing previously saved public price information</span>
        </div>
      )}

      {/* Compact Quick Menu Drawer */}
      {isMenuOpen && (
        <div
          style={{
            position: 'fixed',
            top: '68px',
            left: 0,
            right: 0,
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            zIndex: 99,
            padding: '16px',
            maxWidth: '600px',
            margin: '0 auto'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }}
              style={{ padding: '12px', textAlign: 'left', background: activeTab === 'home' ? '#eff6ff' : 'none', border: 'none', borderRadius: '8px', fontWeight: 600, color: activeTab === 'home' ? '#1d4ed8' : '#0f172a', cursor: 'pointer' }}
            >
              Home Dashboard
            </button>
            <button
              onClick={() => { setActiveTab('prices'); setIsMenuOpen(false); }}
              style={{ padding: '12px', textAlign: 'left', background: activeTab === 'prices' ? '#eff6ff' : 'none', border: 'none', borderRadius: '8px', fontWeight: 600, color: activeTab === 'prices' ? '#1d4ed8' : '#0f172a', cursor: 'pointer' }}
            >
              SRP Price Directory
            </button>
            <button
              onClick={() => { setActiveTab('scan'); setIsMenuOpen(false); }}
              style={{ padding: '12px', textAlign: 'left', background: activeTab === 'scan' ? '#eff6ff' : 'none', border: 'none', borderRadius: '8px', fontWeight: 600, color: activeTab === 'scan' ? '#1d4ed8' : '#0f172a', cursor: 'pointer' }}
            >
              Live Shelf Tag Scanner
            </button>
            <button
              onClick={() => { setActiveTab('reports'); setIsMenuOpen(false); }}
              style={{ padding: '12px', textAlign: 'left', background: activeTab === 'reports' ? '#eff6ff' : 'none', border: 'none', borderRadius: '8px', fontWeight: 600, color: activeTab === 'reports' ? '#1d4ed8' : '#0f172a', cursor: 'pointer' }}
            >
              Formal Receipt Reporting
            </button>
          </div>
        </div>
      )}

      {/* Fixed 4-tab bottom navigation */}
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
          className={`nav-item ${activeTab === 'scan' || activeTab === 'shelf-scanner' ? 'active' : ''}`}
          onClick={() => setActiveTab('scan')}
          aria-current={activeTab === 'scan' || activeTab === 'shelf-scanner' ? 'page' : undefined}
        >
          <Scan size={20} />
          <span>Scan</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'reports' || activeTab === 'report' || activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
          aria-current={activeTab === 'reports' || activeTab === 'report' || activeTab === 'track' ? 'page' : undefined}
        >
          <ClipboardList size={20} />
          <span>Reports</span>
        </button>
      </nav>
    </>
  );
};

export default Navbar;
