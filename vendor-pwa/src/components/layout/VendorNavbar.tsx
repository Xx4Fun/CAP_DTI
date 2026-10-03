import React from 'react';
import { Bell, LogOut, Store as StoreIcon, Home, FileText, MessageSquare, BookOpen, Megaphone, Wifi, WifiOff } from 'lucide-react';
import type { ActiveTab, VendorStore } from '../../app/types';

interface VendorNavbarProps {
  stores: VendorStore[];
  activeStoreId: number | null;
  hasPendingNotices: boolean;
  activeTab?: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
  pendingNoticeCount?: number;
  unreadMessageCount?: number;
  online?: boolean;
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
  unreadMessageCount = 0,
  online = true,
  onSelectStore,
  onOpenNotifications,
  onLogout,
}) => {
  const activeStore = stores.find((store) => store.id === activeStoreId);

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
              className={`desktop-nav-link ${activeTab === 'notices' || activeTab === 'rebuttals' ? 'active' : ''}`}
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
              className={`desktop-nav-link ${activeTab === 'messages' ? 'active' : ''}`}
              onClick={() => onTabChange('messages')}
            >
              <MessageSquare size={16} />
              <span>Messages</span>
              {unreadMessageCount > 0 && (
                <span className="desktop-nav-badge">{unreadMessageCount}</span>
              )}
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

      <div className="ph-flag-bar" aria-hidden="true">
        <span className="ph-flag-blue" />
        <span className="ph-flag-yellow" />
        <span className="ph-flag-red" />
      </div>
    </header>
  );
};
