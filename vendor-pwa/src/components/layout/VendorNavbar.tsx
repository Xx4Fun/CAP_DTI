import React from 'react';
import { Bell, LogOut, Store as StoreIcon, Home, FileText, Send, BookOpen, Megaphone } from 'lucide-react';
import type { ActiveTab, VendorStore } from '../../app/types';

interface VendorNavbarProps {
  stores: VendorStore[];
  activeStoreId: number | null;
  hasPendingNotices: boolean;
  activeTab?: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
  pendingNoticeCount?: number;
  onSelectStore: (storeId: number) => void;
  onOpenNotifications: () => void;
  onLogout: () => void;
}

export const VendorNavbar: React.FC<VendorNavbarProps> = ({
  stores,
  activeStoreId,
  hasPendingNotices,
  activeTab = 'overview',
  onTabChange,
  pendingNoticeCount = 0,
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

        {onTabChange && (
          <nav className="vendor-desktop-nav" aria-label="Desktop Navigation">
            <button
              type="button"
              className={`desktop-nav-link ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => onTabChange('overview')}
            >
              <Home size={16} />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              className={`desktop-nav-link ${activeTab === 'notices' ? 'active' : ''}`}
              onClick={() => onTabChange('notices')}
            >
              <FileText size={16} />
              <span>Notices</span>
              {pendingNoticeCount > 0 && (
                <span className="desktop-nav-badge">{pendingNoticeCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`desktop-nav-link ${activeTab === 'rebuttals' ? 'active' : ''}`}
              onClick={() => onTabChange('rebuttals')}
            >
              <Send size={16} />
              <span>Rebuttals</span>
            </button>

            <button
              type="button"
              className={`desktop-nav-link ${activeTab === 'srp' ? 'active' : ''}`}
              onClick={() => onTabChange('srp')}
            >
              <BookOpen size={16} />
              <span>SRP Guide</span>
            </button>

            <button
              type="button"
              className={`desktop-nav-link ${activeTab === 'advisories' ? 'active' : ''}`}
              onClick={() => onTabChange('advisories')}
            >
              <Megaphone size={16} />
              <span>Advisories</span>
            </button>
          </nav>
        )}

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
