import React from 'react';
import { Home as HomeIcon, Search, Store, Camera, FileCheck, HelpCircle } from 'lucide-react';

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
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: stateOfCalamity ? '#ef4444' : '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            PW
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
              PRICE-Watch
            </div>
            <div style={{ fontSize: '0.68rem', color: '#a1a1aa', fontWeight: 500 }}>
              DTI Regulatory Transparency PWA
            </div>
          </div>
        </div>

        {stateOfCalamity && (
          <span className="badge badge-red" style={{ animation: 'pulse 2s infinite' }}>
            ⚠️ CALAMITY PROTOCOLS
          </span>
        )}
      </header>

      <nav className="nav-bottom">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <HomeIcon size={20} />
          <span>Home</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={20} />
          <span>SRP Search</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'stores' ? 'active' : ''}`}
          onClick={() => setActiveTab('stores')}
        >
          <Store size={20} />
          <span>Stores</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'shelf-scanner' ? 'active' : ''}`}
          onClick={() => setActiveTab('shelf-scanner')}
        >
          <Camera size={20} />
          <span>Shelf Scan</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          <FileCheck size={20} />
          <span>Report</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('track')}
        >
          <HelpCircle size={20} />
          <span>Track</span>
        </button>
      </nav>
    </>
  );
};
