import React, { useEffect, useRef } from 'react';
import { Bell, ChevronRight, FileText, MessageSquare, X } from 'lucide-react';
import type { LegalNotice, VendorStore } from '../../app/types';
import { noticeStatusLabel } from '../../app/rules';
import { CountdownBadge } from '../common/CountdownBadge';
import { trapTabKey } from '../common/focus';

interface AlertsDrawerProps {
  /** Notices that still need the vendor: an unopened portal notice, or a response that is due. */
  notices: LegalNotice[];
  stores: VendorStore[];
  onClose: () => void;
  onOpenNotice: (notice: LegalNotice) => void;
  onOpenMessages: (storeId: number) => void;
}

/** Derived from what the portal already loaded; nothing here is stored as read or unread. */
export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({ notices, stores, onClose, onOpenNotice, onOpenMessages }) => {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // A row hands focus to its destination; only dismissing the drawer returns focus to the bell.
  const restoreFocus = useRef(true);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      trapTabKey(event, drawerRef.current);
    };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (restoreFocus.current) opener?.focus();
    };
  }, [onClose]);

  // A row can disappear while it holds focus (deadline passed, thread read on another device): keep focus in the dialog.
  useEffect(() => {
    if (drawerRef.current && !drawerRef.current.contains(document.activeElement)) closeRef.current?.focus();
  });

  const unreadStores = stores.filter((store) => (store.unread_messages ?? 0) > 0);
  const storeName = (notice: LegalNotice) => notice.store?.store_name ?? stores.find((store) => store.id === notice.store_id)?.store_name ?? 'Your establishment';
  const leave = (go: () => void) => { restoreFocus.current = false; go(); };

  return (
    <div className="alerts-backdrop" onMouseDown={onClose}>
      <aside ref={drawerRef} className="alerts-drawer" role="dialog" aria-modal="true" aria-labelledby="alerts-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <Bell size={20} />
            <h2 id="alerts-title">Alerts</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Close alerts" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {notices.length === 0 && unreadStores.length === 0 ? (
          <div className="alerts-empty">
            <Bell size={28} />
            <strong>Nothing needs your attention</strong>
            <span>New notices and messages from DTI Antique appear here.</span>
          </div>
        ) : (
          <div className="alerts-list">
            {notices.map((notice) => (
              <button key={`notice-${notice.id}`} type="button" className={`alerts-row ${notice.notice_type === 'SCO' ? 'alerts-row--sco' : 'alerts-row--loi'}`} onClick={() => leave(() => onOpenNotice(notice))}>
                <span className="alerts-row-icon"><FileText size={18} /></span>
                <span className="alerts-row-body">
                  <strong>{notice.notice_type === 'SCO' ? 'Show Cause Order' : 'Letter of Inquiry'} {notice.control_number ?? `#${notice.id}`}</strong>
                  <small>{storeName(notice)} · {noticeStatusLabel(notice)}</small>
                  <CountdownBadge dueAt={notice.due_date_timestamp} portal={notice.intended_delivery_method === 'portal'} />
                </span>
                <ChevronRight size={18} className="alerts-row-arrow" />
              </button>
            ))}
            {unreadStores.map((store) => (
              <button key={`messages-${store.id}`} type="button" className="alerts-row alerts-row--messages" onClick={() => leave(() => onOpenMessages(store.id))}>
                <span className="alerts-row-icon"><MessageSquare size={18} /></span>
                <span className="alerts-row-body">
                  <strong>{store.unread_messages} new {store.unread_messages === 1 ? 'message' : 'messages'} from DTI</strong>
                  <small>{store.store_name}</small>
                </span>
                <ChevronRight size={18} className="alerts-row-arrow" />
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
};
