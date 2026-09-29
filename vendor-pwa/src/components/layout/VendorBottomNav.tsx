import React from 'react';
import { Home, FileText, MessageSquare, BookOpen, Megaphone } from 'lucide-react';
import type { ActiveTab } from '../../app/types';

interface VendorBottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  pendingNoticeCount: number;
  unreadMessageCount?: number;
}

export const VendorBottomNav: React.FC<VendorBottomNavProps> = ({
  activeTab,
  onTabChange,
  pendingNoticeCount,
  unreadMessageCount = 0,
}) => {
  // Option A: Notices and Rebuttals are unified under the Notices tab on mobile
  const isNoticesActive = activeTab === 'notices' || activeTab === 'rebuttals';

  return (
    <nav className="vendor-bottom-nav" aria-label="Main Navigation">
      <button
        type="button"
        aria-label="Dashboard Tab"
        className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
        onClick={() => onTabChange('overview')}
      >
        <Home size={20} />
        <span>Dashboard</span>
      </button>

      <button
        type="button"
        aria-label="Notices Tab"
        className={`nav-tab-btn ${isNoticesActive ? 'active' : ''}`}
        onClick={() => onTabChange('notices')}
      >
        <FileText size={20} />
        <span>Notices</span>
        {pendingNoticeCount > 0 && (
          <span className="nav-pill-count">{pendingNoticeCount}</span>
        )}
      </button>

      <button
        type="button"
        aria-label="Messages Tab"
        className={`nav-tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
        onClick={() => onTabChange('messages')}
      >
        <MessageSquare size={20} />
        <span>Messages</span>
        {unreadMessageCount > 0 && (
          <span className="nav-pill-count">{unreadMessageCount}</span>
        )}
      </button>

      <button
        type="button"
        aria-label="SRP Guide Tab"
        className={`nav-tab-btn ${activeTab === 'srp' ? 'active' : ''}`}
        onClick={() => onTabChange('srp')}
      >
        <BookOpen size={20} />
        <span>SRP Guide</span>
      </button>

      <button
        type="button"
        aria-label="Advisories Tab"
        className={`nav-tab-btn ${activeTab === 'advisories' ? 'active' : ''}`}
        onClick={() => onTabChange('advisories')}
      >
        <Megaphone size={20} />
        <span>Advisories</span>
      </button>
    </nav>
  );
};
