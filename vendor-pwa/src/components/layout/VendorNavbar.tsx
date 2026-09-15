import React from 'react';
import { Bell, LogOut, Store as StoreIcon } from 'lucide-react';
import type { VendorStore } from '../../app/types';

interface VendorNavbarProps {
  stores: VendorStore[];
  activeStoreId: number | null;
  hasPendingNotices: boolean;
  onSelectStore: (storeId: number) => void;
  onOpenNotifications: () => void;
  onLogout: () => void;
}

export const VendorNavbar: React.FC<VendorNavbarProps> = ({
  stores,
  activeStoreId,
  hasPendingNotices,
  onSelectStore,
  onOpenNotifications,
  onLogout,
}) => {
  const activeStore = stores.find((store) => store.id === activeStoreId);

  return (
    <header className="vendor-header">
      <div className="vendor-header-top">
        <div className="vendor-brand">
          <div className="vendor-brand-logo">
            <img src="/icons/dti-pwa-192x192.png" alt="DTI Logo" />
          </div>
          <div className="vendor-brand-text">
            <h1>PRICE-Watch</h1>
            <p>DTI Region VI • Vendor Portal</p>
          </div>
        </div>

        <div className="vendor-header-actions">
          {stores.length > 1 ? (
            <select
              className="header-store-select"
              aria-label="Active establishment"
              value={activeStoreId ?? ''}
              onChange={(event) => onSelectStore(Number(event.target.value))}
            >
              {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name}</option>)}
            </select>
          ) : activeStore ? (
            <span className="header-store-badge" title={activeStore.store_name}>
              <StoreIcon size={14} className="header-store-icon" />
              <span className="header-store-name">{activeStore.store_name}</span>
            </span>
          ) : null}

          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenNotifications}
            aria-label="Notification settings"
            title="Notification settings"
          >
            <Bell size={18} />
            {hasPendingNotices && <span className="header-badge-dot" />}
          </button>

          <button
            type="button"
            className="header-icon-btn"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
