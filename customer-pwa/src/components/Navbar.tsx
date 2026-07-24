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
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: stateOfCalamity ? '#ef4444' : '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(29, 78, 216, 0.2)'
          }}>
            <Tag size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a' }}>
              PRICE-Watch
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
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
