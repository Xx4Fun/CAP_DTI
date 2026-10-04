import React from 'react';
import { Bell, Wifi, WifiOff } from 'lucide-react';
import type { VendorStore } from '../../app/types';
import { initials } from '../../app/rules';

interface VendorNavbarProps {
  stores: VendorStore[];
  activeStoreId: number | null;
  online?: boolean;
  alertCount: number;
  userName: string;
  profileActive: boolean;
  onSelectStore: (storeId: number) => void;
  onOpenAlerts: () => void;
  onOpenProfile: () => void;
}

/** Phone header. From 600px up the sidebar and the content toolbar take over. */
export const VendorNavbar: React.FC<VendorNavbarProps> = ({
  stores,
  activeStoreId,
  online = true,
  alertCount,
  userName,
  profileActive,
  onSelectStore,
  onOpenAlerts,
  onOpenProfile,
}) => {
  return (
    <header className="vendor-header">
      <div className="vendor-header-top">
        <div className="vendor-brand">
          <span className="brand-logo-frame">
            <img src="/branding/dti-logo.svg" alt="DTI Official Logo" className="brand-logo" />
          </span>
          <div className="brand-text">
            <div className="brand-name">
              <span className="brand-price">PRICE-</span>
              <span className="brand-watch">Watch</span>
            </div>
            <small className="brand-sub">Vendor Portal</small>
          </div>
        </div>

        <div className="vendor-header-actions">
          <span
            className={`vendor-header-status ${online ? 'online' : 'offline'}`}
            aria-label={online ? 'Device online' : 'Device offline'}
            title={online ? 'Device network available' : 'Device offline'}
          >
            {online ? <Wifi size={17} /> : <WifiOff size={17} />}
            <span>{online ? 'Online' : 'Offline'}</span>
          </span>

          {stores.length > 1 && (
            <select
              className="header-store-select"
              aria-label="Active establishment"
              value={activeStoreId ?? ''}
              onChange={(event) => onSelectStore(Number(event.target.value))}
            >
              {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
            </select>
          )}

          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenAlerts}
            aria-label={alertCount > 0 ? `Alerts, ${alertCount} new` : 'Alerts'}
          >
            <Bell size={18} />
            {alertCount > 0 && <span className="icon-count" aria-hidden="true">{alertCount}</span>}
          </button>

          <button
            type="button"
            className={`header-icon-btn header-avatar ${profileActive ? 'active' : ''}`}
            onClick={onOpenProfile}
            aria-current={profileActive ? 'page' : undefined}
            aria-label="Open profile"
          >
            <span aria-hidden="true">{initials(userName)}</span>
          </button>
        </div>
      </div>

      <div className="ph-flag-bar" aria-hidden="true">
        <span className="ph-flag-blue" />
        <span className="ph-flag-yellow" />
        <span className="ph-flag-red" />
      </div>
    </header>
  );
};
