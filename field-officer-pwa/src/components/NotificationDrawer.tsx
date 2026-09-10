import { useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import type { FieldNotification } from '../types'

interface NotificationDrawerProps {
  open: boolean
  online: boolean
  state: 'loading' | 'ready' | 'unavailable'
  notifications: FieldNotification[]
  onClose: () => void
  onRead: (id: string) => void
  onReadAll: () => void
}

export function NotificationDrawer({ open, online, state, notifications, onClose, onRead, onReadAll }: NotificationDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    closeRef.current?.focus()
    return () => { document.removeEventListener('keydown', closeOnEscape); previousFocus?.focus() }
  }, [onClose, open])
  if (!open) return null
  const unread = notifications.filter((item) => !item.read_at)
  return <div className="field-drawer-backdrop" onMouseDown={onClose}>
    <aside className="field-notification-drawer" role="dialog" aria-modal="true" aria-labelledby="notification-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><Bell /><h2 id="notification-title">Notifications</h2></div><button ref={closeRef} type="button" aria-label="Close notifications" onClick={onClose}><X /></button></header>
      {unread.length > 0 && <button type="button" className="field-read-all" disabled={!online} onClick={onReadAll}><CheckCheck />Mark all as read</button>}
      {state === 'loading' ? <div className="field-drawer-state" role="status">Loading notifications…</div>
        : state === 'unavailable' ? <div className="field-drawer-state"><strong>Notifications unavailable</strong><span>{online ? 'Try again shortly.' : 'Reconnect to refresh. Cached alerts remain listed below.'}</span></div>
          : null}
      <div className="field-notification-list">
        {notifications.map((item) => <article key={item.id} className={item.read_at ? 'read' : 'unread'}>
          <div><strong>{notificationTitle(item.event)}</strong><time>{formatDate(item.created_at)}</time></div>
          <p>{notificationMessage(item)}</p>
          {!item.read_at && <button type="button" aria-label="Mark notification as read" disabled={!online} onClick={() => onRead(item.id)}><Check />Mark read</button>}
        </article>)}
      </div>
      {state === 'ready' && notifications.length === 0 && <div className="field-drawer-state"><Bell /><strong>No notifications</strong><span>Verification, protocol, and synchronization updates will appear here.</span></div>}
    </aside>
  </div>
}

function notificationTitle(event: string | null) {
  if (event === 'verification_assigned') return 'Additional visit assigned'
  if (event === 'verification_requested' || event === 'field_verification_requested') return 'New field verification request'
  if (event === 'monitoring_record_accepted') return 'Monitoring record synchronized'
  if (event?.includes('emergency') || event?.includes('protocol')) return 'Monitoring protocol updated'
  if (event?.includes('failed')) return 'Synchronization needs attention'
  return 'Field monitoring update'
}

function notificationMessage(notification: FieldNotification) {
  const payload = notification.payload
  if (typeof payload.message === 'string') return payload.message
  if (typeof payload.store_name === 'string') return notification.event === 'verification_assigned' ? `Visit ${payload.store_name} for the assigned follow-up.` : `${payload.store_name} needs field verification.`
  return 'Open PRICE-Watch to review this update.'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
