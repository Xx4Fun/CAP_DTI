import React from 'react';
import {
  Home,
  FileText,
  MessageSquare,
  Send,
  BookOpen,
  Megaphone,
  Store as StoreIcon,
  Bell,
  LogOut,
  Wifi,
  WifiOff,
  ChevronDown,
} from 'lucide-react';
import type { ActiveTab, VendorStore } from '../../app/types';

interface VendorSidebarProps {
  stores: VendorStore[];
  activeStoreId: number | null;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  pendingNoticeCount: number;
  unreadMessageCount?: number;
  online?: boolean;
  hasPendingNotices?: boolean;
  onSelectStore: (storeId: number) => void;
  onOpenNotifications: () => void;
  onLogout: () => void;
}

export const VendorSidebar: React.FC<VendorSidebarProps> = ({
  stores,
  activeStoreId,
  activeTab,
  onTabChange,
  pendingNoticeCount,
  unreadMessageCount = 0,
  online = true,
  hasPendingNotices = false,
  onSelectStore,
  onOpenNotifications,
  onLogout,
}) => {
  return (
    <aside className="vendor-sidebar" aria-label="Vendor Portal Navigation">
      {/* 1. Official DTI & PRICE-Watch Header */}
      <div className="sidebar-brand-header">
        <div className="sidebar-brand-left">
          <div className="sidebar-dti-seal" title="Department of Trade and Industry">
            <img src="/branding/dti-logo.svg" alt="Department of Trade and Industry Logo" className="sidebar-seal-img" />
          </div>
          <div className="sidebar-brand-copy">
            <div className="sidebar-brand-title">
              <span className="brand-price">PRICE-</span>
              <span className="brand-watch">Watch</span>
            </div>
            <p className="sidebar-brand-subtitle">Vendor Portal</p>
          </div>
        </div>
        <div className="ph-flag-bar" aria-hidden="true">
          <span className="ph-flag-blue" />
          <span className="ph-flag-yellow" />
          <span className="ph-flag-red" />
        </div>
      </div>

      {/* Multi-Store Switcher (only if vendor manages >1 store) */}
      {stores.length > 1 && (
        <div className="sidebar-store-switcher">
          <select
            className="sidebar-store-select"
            aria-label="Switch active establishment"
            value={activeStoreId ?? ''}
            onChange={(e) => onSelectStore(Number(e.target.value))}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store_name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="store-select-chevron" />
        </div>
      )}

      {/* 2. Primary Navigation */}
      <nav className="sidebar-nav" aria-label="Portal Modules">
        <div className="sidebar-nav-category">
          <span>PORTAL MODULES</span>
        </div>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => onTabChange('overview')}
        >
          <div className="nav-item-content">
            <Home size={19} />
            <span className="nav-text-full">Dashboard</span>
            <span className="nav-text-short">Home</span>
          </div>
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'notices' ? 'active' : ''}`}
          onClick={() => onTabChange('notices')}
        >
          <div className="nav-item-content">
            <FileText size={19} />
            <span className="nav-text-full">Legal Notices</span>
            <span className="nav-text-short">Notices</span>
          </div>
          {pendingNoticeCount > 0 && (
            <span className="sidebar-nav-badge badge-danger">{pendingNoticeCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => onTabChange('messages')}
        >
          <div className="nav-item-content">
            <MessageSquare size={19} />
            <span className="nav-text-full">Communications</span>
            <span className="nav-text-short">Messages</span>
          </div>
          {unreadMessageCount > 0 && (
            <span className="sidebar-nav-badge badge-info">{unreadMessageCount}</span>
          )}
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'rebuttals' ? 'active' : ''}`}
          onClick={() => onTabChange('rebuttals')}
        >
          <div className="nav-item-content">
            <Send size={19} />
            <span className="nav-text-full">Response & Rebuttal</span>
            <span className="nav-text-short">Rebuttals</span>
          </div>
        </button>

        <div className="sidebar-nav-divider" />
        <div className="sidebar-nav-category">
          <span>REFERENCE & ADVISORIES</span>
        </div>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'srp' ? 'active' : ''}`}
          onClick={() => onTabChange('srp')}
        >
          <div className="nav-item-content">
            <BookOpen size={19} />
            <span className="nav-text-full">Official SRP Catalog</span>
            <span className="nav-text-short">SRP Guide</span>
          </div>
        </button>

        <button
          type="button"
          className={`sidebar-nav-item ${activeTab === 'advisories' ? 'active' : ''}`}
          onClick={() => onTabChange('advisories')}
        >
          <div className="nav-item-content">
            <Megaphone size={19} />
            <span className="nav-text-full">DTI Bulletins</span>
            <span className="nav-text-short">Advisories</span>
          </div>
        </button>
      </nav>

      {/* 3. Sidebar Footer Utilities */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-status">
          <span className={`connectivity-pill ${online ? 'online' : 'offline'}`} title={online ? 'System Online' : 'Offline Mode'}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="footer-status-text">{online ? 'System Online' : 'Offline Mode'}</span>
          </span>
        </div>

        <div className="sidebar-footer-actions">
          <button
            type="button"
            className="sidebar-utility-btn"
            onClick={onOpenNotifications}
            title="Notification Preferences"
            aria-label="Notification settings"
          >
            <Bell size={17} />
            <span className="utility-btn-text">Alerts</span>
            {hasPendingNotices && <span className="footer-dot-badge" />}
          </button>

          <button
            type="button"
            className="sidebar-utility-btn logout-btn"
            onClick={onLogout}
            title="Sign out of Vendor Portal"
            aria-label="Sign out"
          >
            <LogOut size={17} />
            <span className="utility-btn-text">Log Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
