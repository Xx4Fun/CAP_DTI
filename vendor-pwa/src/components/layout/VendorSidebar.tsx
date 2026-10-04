import React from 'react';
import {
  Home,
  FileText,
  MessageSquare,
  BookOpen,
  Megaphone,
  ChevronDown,
} from 'lucide-react';
import type { ActiveTab, VendorStore } from '../../app/types';
import { initials } from '../../app/rules';

interface VendorSidebarProps {
  stores: VendorStore[];
  activeStoreId: number | null;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  pendingNoticeCount: number;
  unreadMessageCount?: number;
  userName: string;
  onSelectStore: (storeId: number) => void;
}

const destinations = [
  { id: 'overview' as const, label: 'Dashboard', shortLabel: 'Home', icon: Home },
  { id: 'notices' as const, label: 'Legal Notices', shortLabel: 'Notices', icon: FileText },
  { id: 'messages' as const, label: 'Communications', shortLabel: 'Messages', icon: MessageSquare },
  { id: 'srp' as const, label: 'Official SRP Catalog', shortLabel: 'SRP Guide', icon: BookOpen },
  { id: 'advisories' as const, label: 'DTI Bulletins', shortLabel: 'Advisories', icon: Megaphone },
];

export const VendorSidebar: React.FC<VendorSidebarProps> = ({
  stores,
  activeStoreId,
  activeTab,
  onTabChange,
  pendingNoticeCount,
  unreadMessageCount = 0,
  userName,
  onSelectStore,
}) => {
  return (
    <aside className="vendor-sidebar" data-testid="vendor-sidebar" aria-label="Vendor Portal Navigation">
      {/* 1. Official DTI & PRICE-Watch Brand Header (Mimics Field Monitoring) */}
      <div className="sidebar-brand-header">
        <span className="sidebar-logo-frame">
          <img src="/branding/dti-logo.svg" alt="DTI Official Logo" />
        </span>
        <span>
          <strong>PRICE-Watch</strong>
          <small>Vendor Portal</small>
        </span>
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
        {destinations.map((dest) => {
          const Icon = dest.icon;
          const isActive = activeTab === dest.id || (dest.id === 'notices' && activeTab === 'rebuttals');
          const count = dest.id === 'notices' ? pendingNoticeCount : dest.id === 'messages' ? unreadMessageCount : 0;
          const countClass = dest.id === 'notices' ? 'badge-danger' : 'badge-info';

          return (
            <button
              key={dest.id}
              type="button"
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={dest.label}
              onClick={() => onTabChange(dest.id)}
            >
              <Icon aria-hidden="true" />
              <span className="nav-text-full">{dest.label}</span>
              <span className="nav-text-short">{dest.shortLabel}</span>
              {count > 0 && (
                <span className={`nav-count ${countClass}`} aria-label={`${count} items need attention`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. Account Profile Footer (Mimics Field Monitoring) */}
      <div className="sidebar-account">
        <button
          type="button"
          className={`sidebar-account-btn ${activeTab === 'profile' ? 'active' : ''}`}
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          aria-label="Open profile"
          onClick={() => onTabChange('profile')}
        >
          <span className="account-mark" aria-hidden="true">{initials(userName)}</span>
          <span className="sidebar-account-copy">
            <strong>{userName}</strong>
            <small>Vendor account</small>
          </span>
        </button>
      </div>
    </aside>
  );
};
