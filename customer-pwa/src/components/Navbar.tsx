import React from 'react';
import { Home, Tag, Scan, ClipboardList, AlertTriangle } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  stateOfCalamity: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, stateOfCalamity }) => {
  return (
    <>
      <header className="navbar-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/logo_icon.png"
            alt="PRICE-Watch Tag Icon"
            style={{
              height: '40px',
              width: 'auto',
              objectFit: 'contain',
              mixBlendMode: 'multiply'
            }}
          />
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              <span style={{ color: '#0f172a' }}>PRICE-</span>
              <span style={{ color: '#1d4ed8' }}>Watch</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, letterSpacing: '0.01em' }}>
              Consumer Price Guide
            </div>
          </div>
        </div>

        {stateOfCalamity ? (
          <span className="badge badge-red" style={{ animation: 'pulse 2s infinite' }}>
            <AlertTriangle size={12} /> CALAMITY PROTOCOLS
          </span>
        ) : (
          <span className="badge badge-green">
            NORMAL MONITORING
          </span>
        )}
      </header>

      <nav className="nav-bottom">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Home size={20} />
          <span>Home</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'prices' || activeTab === 'search' || activeTab === 'stores' ? 'active' : ''}`}
          onClick={() => setActiveTab('prices')}
        >
          <Tag size={20} />
          <span>Prices</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'scan' || activeTab === 'shelf-scanner' ? 'active' : ''}`}
          onClick={() => setActiveTab('scan')}
        >
          <Scan size={20} />
          <span>Scan</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'reports' || activeTab === 'report' || activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <ClipboardList size={20} />
          <span>Reports</span>
        </button>
      </nav>
    </>
  );
};

export default Navbar;
