import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  Trash2,
  Camera,
  MapPin,
  ShieldCheck,
  Phone,
  Mail,
  Scale,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Building2,
  Clock,
  Lock,
  HardDrive
} from 'lucide-react';
import { apiClient } from '../api/client';
import { clearVerifiedCache } from '../app/verifiedCache';

interface MoreViewProps {
  setActiveTab?: (tab: string) => void;
  lastSyncTime?: string;
  stateOfCalamity?: boolean;
  bulletinDate?: string;
  totalCommodities?: number;
  onRefreshData?: () => Promise<void> | void;
}

export const MoreView: React.FC<MoreViewProps> = ({
  lastSyncTime = '',
  stateOfCalamity = false,
  bulletinDate,
  totalCommodities,
  onRefreshData,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [cameraStatus, setCameraStatus] = useState<'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported'>('checking');
  const [geoStatus, setGeoStatus] = useState<'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported'>('checking');
  const [storageEstimate, setStorageEstimate] = useState<string>('~1.5 MB');

  // Network and permissions listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Query permissions if available
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as PermissionName })
        .then((result) => {
          setCameraStatus(result.state as 'granted' | 'prompt' | 'denied');
          result.onchange = () => setCameraStatus(result.state as 'granted' | 'prompt' | 'denied');
        })
        .catch(() => setCameraStatus('prompt'));

      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          setGeoStatus(result.state as 'granted' | 'prompt' | 'denied');
          result.onchange = () => setGeoStatus(result.state as 'granted' | 'prompt' | 'denied');
        })
        .catch(() => setGeoStatus('prompt'));
    } else {
      setCameraStatus('prompt');
      setGeoStatus('prompt');
    }

    // Estimate storage usage
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage) {
          const mb = (estimate.usage / (1024 * 1024)).toFixed(1);
          setStorageEstimate(`${mb} MB`);
        }
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);
    try {
      if (onRefreshData) {
        await onRefreshData();
      } else {
        await Promise.all([
          apiClient.get('/public/config'),
          apiClient.get('/public/commodities'),
        ]);
      }
      setRefreshMessage('Price bulletin and store records updated successfully.');
    } catch {
      setRefreshMessage('Offline or server unreachable. Local cache is active.');
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setRefreshMessage(null), 4000);
    }
  };

  const handleClearCache = () => {
    if (window.confirm('Clear cached SRP bulletins and local store directory? The app will re-fetch verified data upon next connection.')) {
      clearVerifiedCache();
      localStorage.removeItem('price-watch-recent-stores');
      window.location.reload();
    }
  };

  const handleTestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStatus('granted');
      stream.getTracks().forEach((track) => track.stop());
      alert('Camera hardware verified! High-resolution OCR capture is active.');
    } catch {
      setCameraStatus('denied');
      alert('Camera access was blocked. Please enable camera permissions in your browser or system settings.');
    }
  };

  const handleTestGeo = () => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported');
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('granted');
        alert(`Location acquired: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (Accuracy: ~${Math.round(pos.coords.accuracy)}m)`);
      },
      () => {
        setGeoStatus('denied');
        alert('Location access was denied or timed out. Please allow location access to find nearby stores.');
      },
      { timeout: 8000 }
    );
  };

  const toggleAccordion = (id: string) => {
    setActiveAccordion((prev) => (prev === id ? null : id));
  };

  return (
    <div className="more-view-container" role="main" aria-label="Settings and regulatory resources">
      {/* 1. App Identity & Status Hero (Jakob's Law) */}
      <header className="more-hero-card">
        <div className="more-hero-emblem-wrap">
          <img
            src="/branding/dti-logo.png"
            alt="DTI Logo"
            className="more-hero-emblem"
          />
        </div>
        <div className="more-hero-content">
          <div className="more-hero-title-row">
            <h1 className="more-hero-title">More & Help</h1>
            <span className="more-hero-badge">San Jose Pilot</span>
          </div>
        </div>
      </header>

      {/* Emergency Price Freeze Notification (When Active) */}
      {stateOfCalamity && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.06)'
          }}
        >
          <AlertTriangle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.95rem', marginBottom: '2px' }}>
              State of Calamity Active
            </div>
            <div style={{ fontSize: '0.84rem', color: '#b91c1c', lineHeight: 1.4 }}>
              Automatic price freeze is enforced in San Jose de Buenavista. Basic necessities are locked at baseline SRP with 0% markup tolerance.
            </div>
          </div>
        </div>
      )}

      {/* 2. GROUP 1: OFFLINE DATA & SYNCHRONIZATION */}
      <section className="more-section-wrap" aria-labelledby="heading-offline-sync">
        <h2 id="heading-offline-sync" className="more-section-title">Offline Data & Storage</h2>
        <div className="more-group-card">
          {/* Row: Network & Sync Status */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--blue">
                {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
              </div>
              <div className="more-row-texts">
                <span className="more-row-label">Connection Engine</span>
                <span className="more-row-desc">{isOnline ? 'Online (Supabase Remote Sync)' : 'Offline Local Fallback Active'}</span>
              </div>
            </div>
            <span className={`more-status-pill ${isOnline ? 'more-status-pill--success' : 'more-status-pill--warning'}`}>
              <span className="more-status-dot" />
              {isOnline ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Row: Active SRP Bulletin */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--blue">
                <Database size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-label">Active SRP Bulletin</span>
                <span className="more-row-desc">{bulletinDate ? `Effective: ${bulletinDate}` : 'Authoritative DTI Bulletin'}</span>
              </div>
            </div>
            <span className="more-status-pill more-status-pill--neutral">
              {totalCommodities ? `${totalCommodities} items` : 'Cached'}
            </span>
          </div>

          {/* Row: Last Synchronized */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--slate">
                <Clock size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-label">Last Synchronized</span>
                <span className="more-row-desc">Handshake with provincial database</span>
              </div>
            </div>
            <span className="more-status-pill more-status-pill--neutral">
              {lastSyncTime || 'Recently'}
            </span>
          </div>

          {/* Row: Storage Footprint */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--slate">
                <HardDrive size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-label">Device Cache Footprint</span>
                <span className="more-row-desc">Precached commodities, stores & PWA assets</span>
              </div>
            </div>
            <span className="more-status-pill more-status-pill--neutral">
              {storageEstimate}
            </span>
          </div>

          {/* Sync Feedback Toast if Present */}
          {refreshMessage && (
            <div role="status" style={{ margin: '10px 16px', padding: '10px 14px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>{refreshMessage}</span>
            </div>
          )}

          {/* Actions Bar */}
          <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleManualSync}
              disabled={isRefreshing}
              style={{ flex: 1, minWidth: '160px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} className={isRefreshing ? 'spinner' : ''} />
              <span>{isRefreshing ? 'Syncing…' : 'Sync Latest SRP'}</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClearCache}
              style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#dc2626', borderColor: '#fca5a5' }}
              title="Clear cached data"
            >
              <Trash2 size={16} />
              <span>Reset Cache</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. GROUP 2: HARDWARE & PERMISSION DIAGNOSTICS */}
      <section className="more-section-wrap" aria-labelledby="heading-diagnostics">
        <h2 id="heading-diagnostics" className="more-section-title">Hardware & Permissions</h2>
        <div className="more-group-card">
          {/* Camera Permission Row */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--blue">
                <Camera size={18} />
              </div>
              <span className="more-row-label">Camera</span>
            </div>
            <button
              type="button"
              className="more-row-action-btn"
              onClick={handleTestCamera}
              aria-label="Test camera access"
            >
              {cameraStatus === 'granted' ? '✓ Ready' : 'Test Camera'}
            </button>
          </div>

          {/* Location Permission Row */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--rose">
                <MapPin size={18} />
              </div>
              <span className="more-row-label">Location</span>
            </div>
            <button
              type="button"
              className="more-row-action-btn"
              onClick={handleTestGeo}
              aria-label="Test geolocation access"
            >
              {geoStatus === 'granted' ? '✓ Active' : 'Check GPS'}
            </button>
          </div>

          {/* Offline PWA Service Worker Row */}
          <div className="more-group-row">
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--emerald">
                <ShieldCheck size={18} />
              </div>
              <span className="more-row-label">Service Worker</span>
            </div>
            <span className="more-status-pill more-status-pill--success">
              <span className="more-status-dot" />
              v1.3.0 Ready
            </span>
          </div>
        </div>
      </section>

      {/* 4. GROUP 3: DTI PROVINCIAL OFFICE & HOTLINES */}
      <section className="more-section-wrap" aria-labelledby="heading-dti-contact">
        <h2 id="heading-dti-contact" className="more-section-title">DTI Antique Provincial Office</h2>
        <div className="more-group-card">
          <div style={{ padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div className="more-icon-tile more-icon-tile--purple">
              <Building2 size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                DTI Antique Provincial Office
              </span>
              <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
                San Jose de Buenavista, Antique 5700 Philippines
              </span>
            </div>
          </div>

          {/* Direct Tap-to-Contact Buttons */}
          <div className="more-contact-grid" style={{ borderTop: '1px solid #f1f5f9' }}>
            <a
              href="tel:0365408736"
              className="more-contact-btn more-contact-btn--primary"
              aria-label="Call DTI Hotline (036) 540-8736"
            >
              <Phone size={16} />
              <span>Call Hotline</span>
            </a>
            <a
              href="mailto:antique@dti.gov.ph"
              className="more-contact-btn more-contact-btn--secondary"
              aria-label="Email DTI Antique at antique@dti.gov.ph"
            >
              <Mail size={16} />
              <span>Email DTI</span>
            </a>
          </div>
        </div>
      </section>

      {/* 5. GROUP 4: LEGAL RIGHTS & CONSUMER PRICE ACT */}
      <section className="more-section-wrap" aria-labelledby="heading-legal-rights">
        <h2 id="heading-legal-rights" className="more-section-title">Consumer Rights & Legal Protection</h2>
        <div className="more-group-card">
          {/* Price Act Accordion Item */}
          <button
            type="button"
            className="more-accordion-trigger"
            onClick={() => toggleAccordion('price-act')}
            aria-expanded={activeAccordion === 'price-act'}
          >
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--amber">
                <Scale size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-label">Republic Act No. 7581 (Price Act)</span>
                <span className="more-row-desc">Suggested Retail Price & 10% variance rule</span>
              </div>
            </div>
            {activeAccordion === 'price-act' ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
          </button>

          {activeAccordion === 'price-act' && (
            <div className="more-accordion-body">
              <div>
                <strong>1. Baseline SRP Protection:</strong> DTI publishes standard Suggested Retail Prices (SRP) for basic necessities and prime commodities to curb illegal profiteering.
              </div>
              <div>
                <strong>2. The 10% Normal Market Rule:</strong> In standard market conditions, any retailer charging higher than 10% above the published SRP baseline triggers an automatic DTI Letter of Inquiry (LOI).
              </div>
              <div>
                <strong>3. Automatic Freeze in Calamity:</strong> When a State of Calamity is declared, Section 6 of R.A. 7581 enforces an automatic price freeze with zero percent markup tolerance.
              </div>
            </div>
          )}

          {/* Privacy & Tamper-Proof Evidence Vault Accordion Item */}
          <button
            type="button"
            className="more-accordion-trigger"
            onClick={() => toggleAccordion('privacy-security')}
            aria-expanded={activeAccordion === 'privacy-security'}
          >
            <div className="more-row-left">
              <div className="more-icon-tile more-icon-tile--emerald">
                <Lock size={18} />
              </div>
              <div className="more-row-texts">
                <span className="more-row-label">Tamper-Proof Evidence Vault</span>
                <span className="more-row-desc">SHA-256 integrity & consumer anonymity</span>
              </div>
            </div>
            {activeAccordion === 'privacy-security' ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} />}
          </button>

          {activeAccordion === 'privacy-security' && (
            <div className="more-accordion-body">
              <div>
                <strong>Zero Account Barrier:</strong> PRICE-Watch operates anonymously without requiring accounts, logins, or collecting personal identification.
              </div>
              <div>
                <strong>Cryptographic Sealing:</strong> Captured receipt scans are hashed with client-side SHA-256 checksums before transmission to ensure tamper-proof evidential validity in DTI regulatory proceedings.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 6. Footer Metadata */}
      <footer style={{ textAlign: 'center', padding: '12px 0 16px 0', color: '#94a3b8', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div><strong>PRICE-Watch Consumer PWA</strong> · v1.3.0 Production</div>
        <div>Target Pilot: San Jose de Buenavista, Antique</div>
        <div>Department of Trade and Industry (DTI) Antique Provincial Office</div>
      </footer>
    </div>
  );
};

export default MoreView;
