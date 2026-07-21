import React from 'react';
import { Search, Camera, FileText, ShieldCheck, Info } from 'lucide-react';

interface HomeProps {
  setActiveTab: (tab: string) => void;
  stateOfCalamity: boolean;
}

export const Home: React.FC<HomeProps> = ({ setActiveTab, stateOfCalamity }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hero Section */}
      <div className={`glass-panel ${stateOfCalamity ? 'calamity-active' : ''}`}>
        <span className={`badge ${stateOfCalamity ? 'badge-red' : 'badge-amber'}`} style={{ marginBottom: '12px' }}>
          {stateOfCalamity ? 'EMERGENCY PRICE CONTROL ACTIVE' : 'OFFICIAL REGULATORY SYSTEM'}
        </span>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '8px', lineHeight: 1.2 }}>
          Empowering Consumers with Price Transparency
        </h1>
        <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '20px' }}>
          PRICE-Watch is the official Department of Trade and Industry (DTI) decision-support platform for commodity price monitoring and tamper-evident receipt reporting in San Jose de Buenavista, Antique.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button className="btn-primary" onClick={() => setActiveTab('search')}>
            <Search size={16} /> Search SRP
          </button>
          <button className="btn-secondary" onClick={() => setActiveTab('report')}>
            <FileText size={16} /> Report Concern
          </button>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div
          className="glass-panel"
          style={{ padding: '16px', cursor: 'pointer', marginBottom: 0 }}
          onClick={() => setActiveTab('shelf-scanner')}
        >
          <div style={{ background: 'rgba(245, 158, 11, 0.15)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', marginBottom: '10px' }}>
            <Camera size={20} />
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Shelf Price Check</div>
          <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
            Informational camera comparison vs SRP baseline.
          </div>
        </div>

        <div
          className="glass-panel"
          style={{ padding: '16px', cursor: 'pointer', marginBottom: 0 }}
          onClick={() => setActiveTab('track')}
        >
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', marginBottom: '10px' }}>
            <ShieldCheck size={20} />
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Track Report</div>
          <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
            Check DTI evaluation status with secret token.
          </div>
        </div>
      </div>

      {/* Consumer Regulatory Guidance Notice */}
      <div className="glass-panel" style={{ background: 'rgba(24, 24, 28, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#fbbf24', fontWeight: 700 }}>
          <Info size={18} /> Consumer Rights & Legal Guidance
        </div>
        <p style={{ fontSize: '0.82rem', color: '#a1a1aa', lineHeight: 1.5 }}>
          Under Republic Act 7581 (Philippine Price Act), retailers are legally prohibited from selling basic necessities above the official Suggested Retail Price (SRP). Submitting a formal receipt report creates an official record for human evaluation by DTI officers.
        </p>
        <div style={{ marginTop: '12px', fontSize: '0.75rem', color: '#71717a' }}>
          Data updated: {new Date().toLocaleDateString()} | System Node: San Jose de Buenavista Pilot
        </div>
      </div>
    </div>
  );
};
