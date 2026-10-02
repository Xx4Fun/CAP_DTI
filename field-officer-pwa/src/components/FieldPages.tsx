import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarCheck, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  ClipboardList, Clock, CloudOff, Compass, Eye, Fingerprint,
  History, LockKeyhole, LogOut, MapPin, PackageSearch, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, TriangleAlert, UserRound, WifiOff,
} from 'lucide-react'
import { canFinalizeWithLease } from '../app/sessionPolicy'
import { readSecret, writeSecret, type BiometricAvailability } from '../app/vault'
import { DevicePinInput } from './DevicePinInput'
import { analyzeWithReference, resolveVisitReference } from '../app/workflow'
import { apiError, fieldApi } from '../services/fieldApi'
import type { ArchivedVisit, BootstrapData, FieldSession, FieldVerificationRequest, GeoPosition, MonitoringRecord, MonitoringRecordDetail, Page, QueuedVisit, VisitDraft } from '../types'

interface HomePageProps {
  name: string
  bootstrap: BootstrapData
  queue: VisitDraft[]
  completedToday: number
  officerPosition: GeoPosition | null
  activeDraft: VisitDraft | null
  online: boolean
  authorizationValid: boolean
  verificationCount?: number
  draftCount?: number
  onStart: (storeId?: number) => void
  onViewActivity: (tab: 'verification' | 'work' | 'sync') => void
  onViewHistory?: () => void
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const radiusKm = 6371
  const latitudeDelta = toRad(lat2 - lat1)
  const longitudeDelta = toRad(lon2 - lon1)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(longitudeDelta / 2) ** 2
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

export function HomePage({
  name,
  bootstrap,
  queue,
  completedToday,
  officerPosition,
  activeDraft,
  authorizationValid,
  onStart,
  onViewActivity,
  onViewHistory,
}: HomePageProps) {
  const firstName = name.split(/\s+/)[0]
  const storeCount = bootstrap.stores.length
  const srpCount = bootstrap.srp_bulletins.length
  const queueCount = queue.length
  const totalToday = completedToday + queueCount
  const nearestStores = useMemo(() => {
    if (!officerPosition) return []
    return bootstrap.stores
      .filter((store) => store.is_active && (store.latitude !== 0 || store.longitude !== 0))
      .map((store) => ({
        ...store,
        distanceKm: haversineKm(officerPosition.latitude, officerPosition.longitude, store.latitude, store.longitude),
      }))
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, 3)
  }, [bootstrap.stores, officerPosition])

  return <div className="page field-page field-home-page">
    <div className="field-page-heading">
      <div>
        <h1 tabIndex={-1}>Good day, {firstName}</h1>
        <p>Your field workspace is ready for today’s monitoring work.</p>
      </div>
    </div>

    <section className={`field-hero-card ${activeDraft ? 'has-draft' : ''} ${!authorizationValid && !activeDraft ? 'expired' : ''}`}>
      <div className="field-hero-bg-glow" aria-hidden="true" />
      <div className="field-hero-content">
        <div className="field-hero-pill">
          <span className="field-hero-status-dot" />
          <span>{activeDraft ? 'Visit in progress' : authorizationValid ? 'Inspection terminal ready' : 'Authorization renewal required'}</span>
        </div>
        <h2>
          {activeDraft
            ? 'A monitoring visit is in progress'
            : 'Start a price monitoring visit'}
        </h2>
        <p>
          {activeDraft
            ? `${activeDraft.items.length} commodity line${activeDraft.items.length === 1 ? '' : 's'} saved securely. Open Monitoring to continue without losing work.`
            : authorizationValid
              ? 'Choose an active registered establishment, record shelf prices against official references, and secure signed evidence.'
              : 'Existing evidence remains protected on device. Reconnect and unlock before starting or finalizing a visit.'}
        </p>
        <div className="field-hero-actions">
          <button
            type="button"
            className="primary-button field-hero-cta"
            disabled={!activeDraft && !authorizationValid}
            onClick={activeDraft ? () => onViewActivity('work') : () => onStart()}
          >
            {activeDraft ? 'View current monitoring' : 'Start new visit'}
            <ArrowRight size={18} />
          </button>
          <div className="field-hero-meta">
            <ShieldCheck size={16} />
            <span>Offline AES-256 GCM vault active</span>
          </div>
        </div>
      </div>
      <div className="field-hero-badge-visual" aria-hidden="true">
        {activeDraft ? <ClipboardList size={44} /> : <Building2 size={44} />}
      </div>
    </section>

    <section className="field-bento-section" aria-label="Field operation statistics">
      <dl className="field-bento-grid field-status-strip">
        <div
          role="button"
          tabIndex={0}
          className="field-bento-card bento-stores clickable"
          onClick={() => onStart()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onStart()
            }
          }}
          aria-label="Open store directory to start a visit"
        >
          <div className="bento-icon-wrap bento-icon-blue"><Building2 size={22} /></div>
          <dt>Store directory</dt>
          <dd className="bento-value">{storeCount} active store{storeCount === 1 ? '' : 's'}</dd>
          <span className="bento-subtext">Monitored outlets</span>
        </div>
        <div
          role="button"
          tabIndex={0}
          className="field-bento-card bento-srp clickable"
          onClick={() => onStart()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onStart()
            }
          }}
          aria-label="Open store directory to monitor SRP baselines"
        >
          <div className="bento-icon-wrap bento-icon-teal"><PackageSearch size={22} /></div>
          <dt>Price references</dt>
          <dd className="bento-value">{srpCount} current reference{srpCount === 1 ? '' : 's'}</dd>
          <span className="bento-subtext">Active DTI SRP baselines</span>
        </div>
        <div
          role="button"
          tabIndex={0}
          className="field-bento-card bento-sync clickable"
          onClick={() => onViewActivity('sync')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onViewActivity('sync')
            }
          }}
          aria-label="Open synchronization queue"
        >
          <div className={`bento-icon-wrap ${queueCount ? 'bento-icon-amber' : 'bento-icon-teal'}`}>
            {queueCount ? <CloudOff size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <dt>Synchronization</dt>
          <dd className="bento-value">{queueCount} pending sync</dd>
          <span className="bento-subtext">{queueCount ? 'Encrypted on device' : 'All visits up to date'}</span>
        </div>
        <div
          role="button"
          tabIndex={0}
          className="field-bento-card bento-access clickable"
          onClick={() => {
            if (onViewHistory) onViewHistory()
            else onViewActivity('work')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (onViewHistory) onViewHistory()
              else onViewActivity('work')
            }
          }}
          aria-label="Open monitoring history"
        >
          <div className="bento-icon-wrap bento-icon-indigo"><CalendarCheck size={22} /></div>
          <dt>Today’s visits</dt>
          <dd className="bento-value">{totalToday} visited</dd>
          <span className="bento-subtext">{totalToday ? 'Outlets visited today' : 'No visits recorded today'}</span>
        </div>
      </dl>
    </section>

    <section className="field-card-section" aria-label="Nearest establishments">
      <div className="field-section-card-header">
        <div className="field-section-title-wrap">
          <div className="field-section-icon bento-icon-blue"><Compass size={18} /></div>
          <div><h3>Nearest establishments</h3><p>Active registered stores based on your current location.</p></div>
        </div>
      </div>
      {nearestStores.length ? <div className="field-nearby-list">
        {nearestStores.map((store) => <article key={store.id} className="field-nearby-item">
          <div className="field-nearby-info">
            <div className="field-nearby-name-row">
              <strong>{store.store_name}</strong>
              <span className="field-distance-pill"><MapPin size={12} />{formatDistance(store.distanceKm)}</span>
            </div>
            <span className="field-nearby-address">{store.address}</span>
          </div>
          <button type="button" className="secondary-button field-nearby-action" disabled={!authorizationValid} onClick={() => onStart(store.id)}>
            Start visit <ArrowRight size={15} />
          </button>
        </article>)}
      </div> : <div className="field-nearby-empty">
        <MapPin className="empty-icon" />
        <strong>Location access not enabled</strong>
        <span>Enable location access to see the closest registered establishments.</span>
      </div>}
    </section>

    <section className="field-card-section" aria-label="Recent activity">
      <div className="field-section-card-header">
        <div className="field-section-title-wrap">
          <div className="field-section-icon bento-icon-amber"><Clock size={18} /></div>
          <div><h3>Recent activity</h3><p>Completed visits currently protected on this device.</p></div>
        </div>
        {queueCount > 0 && <button type="button" className="field-link-action" onClick={() => onViewActivity('sync')}>View all</button>}
      </div>
      {queueCount ? <div className="field-recent-list">
        {queue.slice(0, 3).map((visit) => {
          const store = bootstrap.stores.find((candidate) => candidate.id === visit.store_id)
          return <article key={visit.client_uuid} className="field-recent-item">
            <div className="field-recent-info">
              <div className="field-recent-name-row">
                <strong>{store?.store_name || 'Store not selected'}</strong>
                <span className="field-sync-pill pending"><CloudOff size={11} />Queued locally</span>
              </div>
              <span className="field-recent-meta">{visit.items.length} recorded item{visit.items.length === 1 ? '' : 's'} · {formatDate(visit.finalized_at || visit.started_at)}</span>
            </div>
          </article>
        })}
      </div> : <div className="field-recent-empty">
        <CheckCircle2 className="empty-icon" />
        <strong>All visits synchronized</strong>
        <span>Completed offline visits will appear here until the server accepts them.</span>
      </div>}
    </section>

  </div>
}

interface MonitoringPageProps {
  drafts: VisitDraft[]
  queue: QueuedVisit[]
  bootstrap: BootstrapData
  online: boolean
  syncing: boolean
  authorizationValid: boolean
  requests: FieldVerificationRequest[]
  requestsState: 'loading' | 'ready' | 'unavailable'
  initialTab?: 'verification' | 'work' | 'sync'
  officerPosition?: GeoPosition | null
  onResume: (draftId: string) => void
  onStart: (storeId?: number) => void
  onDiscard: (draftId: string) => void
  onSync: () => void
  onRetry: (clientUuid: string) => void
  archived?: ArchivedVisit[]
  onArchive?: (clientUuid: string) => void
  onStartAssigned: (request: FieldVerificationRequest) => void
  onRelease: (request: FieldVerificationRequest) => void
}

export function MonitoringPage({
  drafts,
  queue,
  bootstrap,
  online,
  syncing,
  authorizationValid,
  requests,
  requestsState,
  initialTab = 'work',
  onResume,
  onStart,
  onDiscard,
  onSync,
  onRetry,
  archived = [],
  onArchive,
  onStartAssigned,
  onRelease,
}: MonitoringPageProps) {
  const [tab, setTab] = useState<'work' | 'verification' | 'sync'>(initialTab)
  const [expandedQueue, setExpandedQueue] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)
  const [confirmRelease, setConfirmRelease] = useState<FieldVerificationRequest | null>(null)
  const actionableDrafts = drafts.filter((d) => d.store_id !== null || d.items.length > 0)
  const sortedDrafts = [...actionableDrafts].sort((a, b) => b.started_at.localeCompare(a.started_at))
  const countAnomalies = (items: VisitDraft['items']) => items.reduce((count, item) => {
    const srp = bootstrap.srp_bulletins.find((bulletin) => bulletin.id === item.srp_id)
    if (!srp) return count
    return analyzeWithReference(item, resolveVisitReference(item, srp, bootstrap.protocol?.mode || 'standard', bootstrap.regulatory_prices || [], bootstrap.monitoring_references || [])).is_anomaly ? count + 1 : count
  }, 0)

  const toggleQueueItem = (uuid: string) => {
    setExpandedQueue((prev) => (prev === uuid ? null : uuid))
  }

  return (
    <div className="page field-page field-activity-page">
      <h1 className="sr-only" tabIndex={-1}>Monitoring</h1>
      <div className="field-monitoring-tabs" role="tablist" aria-label="Monitoring work">
        <button type="button" role="tab" aria-selected={tab === 'work'} onClick={() => setTab('work')}>Current Work <span className="tab-badge">{actionableDrafts.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'verification'} onClick={() => setTab('verification')}>Assigned Visits <span className="tab-badge">{requests.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'sync'} onClick={() => setTab('sync')}>Sync Queue <span className="tab-badge">{queue.length}</span></button>
      </div>

      {tab === 'verification' && <div role="tabpanel" className="field-verification-tabpanel">
        {requestsState === 'unavailable' && <div className="field-offline-state"><WifiOff /><div><h2>Showing saved assigned visits</h2><p>Reconnect to refresh assignments. Saved assignments remain available offline.</p></div></div>}
        {requestsState === 'loading' && requests.length === 0 ? <div role="status">Loading assigned visits…</div>
          : requests.length ? (
            <div className="field-verification-cards">
              {requests.map((request) => {
                const isComplaint = request.source_type === 'complaint'
                const hasDraft = drafts.some((draft) => draft.verification_request_id === request.id)
                return (
                  <section
                    key={request.id}
                    className="field-active-work-card field-assigned-work-card"
                    aria-label={`Assigned visit for ${request.store.store_name}`}
                  >
                    <div className="field-draft-banner field-assigned-banner">
                      <span className="field-draft-badge field-assigned-badge">
                        <span className="field-draft-pulse field-assigned-pulse" />
                        {isComplaint ? 'Complaint Verification' : 'Supervisor Directive'}
                      </span>
                      <span className="field-draft-timestamp">
                        Requested {formatDate(request.requested_at)}
                      </span>
                    </div>

                    <div className="field-draft-body">
                      <div className="field-draft-store-info">
                        <div className="field-draft-store-icon field-assigned-store-icon">
                          <Building2 size={24} />
                        </div>
                        <div>
                          <h2>{request.store.store_name}</h2>
                          <p>{request.store.address}</p>
                        </div>
                      </div>

                      <div className="field-draft-stats-grid field-assigned-stats">
                        <div className="field-draft-stat">
                          <small>Directive Type</small>
                          <strong>{isComplaint ? 'Citizen Complaint' : 'Supervisor Directive'}</strong>
                        </div>
                        <div className="field-draft-stat">
                          <small>Assignment Scope</small>
                          <strong>Full Retail Audit</strong>
                        </div>
                      </div>

                      {request.reason && (
                        <div className="field-assigned-reason-box">
                          <div className="field-assigned-reason-header">
                            <ClipboardList size={15} />
                            <span>Evaluator Instructions / Reason</span>
                          </div>
                          <p className="field-assigned-reason-text">{request.reason}</p>
                        </div>
                      )}

                      <div className="field-draft-actions-bar">
                        <button
                          type="button"
                          className="primary-button field-draft-resume"
                          onClick={() => onStartAssigned(request)}
                        >
                          <ArrowRight size={18} />
                          <span>Start assigned visit</span>
                        </button>

                        {!hasDraft && (
                          <button
                            type="button"
                            className="secondary-button field-assigned-return-btn"
                            disabled={!online}
                            onClick={() => setConfirmRelease(request)}
                          >
                            <RotateCcw size={16} />
                            <span>Return to Admin</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          ) : requestsState === 'ready' ? (
            <section className="field-card-section field-activity-empty-card">
              <div className="field-empty-visual">
                <CheckCircle2 size={36} />
              </div>
              <div className="field-empty-text">
                <h2>No assigned visits</h2>
                <p>Complaint and supervisor assignments will appear here.</p>
              </div>
            </section>
          ) : null}

        {confirmRelease && createPortal(
          <div className="field-dialog-backdrop" role="presentation" onClick={() => setConfirmRelease(null)}>
            <section
              className="field-dialog field-discard-dialog field-release-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="field-release-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="field-release-title">Return this visit to Admin?</h2>
              <p>
                The assigned visit for <strong>{confirmRelease.store.store_name}</strong> will be removed from your list and sent back to Admin for reassignment.
              </p>
              <div className="field-dialog-actions">
                <button type="button" className="primary-button" autoFocus onClick={() => setConfirmRelease(null)}>
                  Keep assignment
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={!online}
                  onClick={() => {
                    const request = confirmRelease
                    setConfirmRelease(null)
                    onRelease(request)
                  }}
                >
                  Yes, return
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
      </div>}

      {tab === 'work' && <div role="tabpanel">
      {sortedDrafts.length ? sortedDrafts.map((activeDraft) => {
        const activeStore = bootstrap.stores.find((store) => store.id === activeDraft.store_id)
        const activeStoreName = activeStore?.store_name || (activeDraft.store_id ? `Store #${activeDraft.store_id}` : 'Store not yet chosen')
        const activeStoreAddress = activeStore?.address || 'Establishment selection pending'
        const activeAnomalies = countAnomalies(activeDraft.items)
        return (
        <section key={activeDraft.client_uuid} className="field-active-work-card" aria-label={`Unfinished visit for ${activeStoreName}`}>
          <div className="field-draft-banner">
            <span className="field-draft-badge">
              <span className="field-draft-pulse" />
              Inspection Draft
            </span>
            <span className="field-draft-timestamp">Started {formatDate(activeDraft.started_at)}</span>
          </div>

          <div className="field-draft-body">
            <div className="field-draft-store-info">
              <div className="field-draft-store-icon">
                <Building2 size={24} />
              </div>
              <div>
                <h2>{activeStoreName}</h2>
                <p>{activeStoreAddress}</p>
              </div>
            </div>

            <div className="field-draft-stats-grid">
              <div className="field-draft-stat">
                <small>Prices Encoded</small>
                <strong>{activeDraft.items.length} line{activeDraft.items.length === 1 ? '' : 's'}</strong>
              </div>
              <div className="field-draft-stat">
                <small>Reference assessment</small>
                <strong className={activeAnomalies > 0 ? 'stat-warn' : 'stat-ok'}>
                  {activeAnomalies > 0 ? `${activeAnomalies} for review` : 'Within reference range'}
                </strong>
              </div>
              <div className="field-draft-stat">
                <small>Signatures</small>
                <strong>
                  {activeDraft.signatures.officer_png_base64 && activeDraft.signatures.representative_png_base64
                    ? 'Both signed'
                    : 'Signatures pending'}
                </strong>
              </div>
              <div className="field-draft-stat">
                <small>GPS Location</small>
                <strong>{activeDraft.location ? `±${Math.round(activeDraft.location.accuracy_meters)} m locked` : 'GPS pending'}</strong>
              </div>
            </div>

            <div className="field-draft-actions-bar">
              <button type="button" className="primary-button field-draft-resume" onClick={() => onResume(activeDraft.client_uuid)}>
                <ArrowRight size={18} />
                <span>Resume inspection</span>
              </button>

              <button
                type="button"
                className="secondary-button field-draft-discard-trigger"
                onClick={() => setConfirmDiscard(activeDraft.client_uuid)}
              >
                <Trash2 size={16} />
                <span>Discard draft</span>
              </button>
            </div>
          </div>
        </section>
        )
      }) : (
        <section className="field-card-section field-activity-empty-card">
          <div className="field-empty-visual">
            <CheckCircle2 size={36} />
          </div>
          <div className="field-empty-text">
            <h2>No active monitoring visit</h2>
            <p>Start a new official inspection when you arrive at a registered retail establishment.</p>
          </div>
          <button
            type="button"
            className="primary-button field-empty-cta"
            disabled={!authorizationValid}
            onClick={() => onStart()}
          >
            <Plus size={18} />
            <span>Start new visit</span>
          </button>
        </section>
      )}

      {confirmDiscard && (() => {
        const targetDraft = drafts.find((d) => d.client_uuid === confirmDiscard)
        const targetStore = bootstrap.stores.find((s) => s.id === targetDraft?.store_id)
        const storeName = targetStore?.store_name || (targetDraft?.store_id ? `Store #${targetDraft.store_id}` : 'Store not yet chosen')
        return createPortal(
          <div className="field-dialog-backdrop" role="presentation" onClick={() => setConfirmDiscard(null)}>
            <section
              className="field-dialog field-discard-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="field-discard-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="field-discard-dialog-icon" aria-hidden="true">
                <Trash2 size={24} />
              </div>
              <h2 id="field-discard-title">Discard this draft?</h2>
              <p>
                The unfinished monitoring visit for <strong>{storeName}</strong> will be permanently deleted from this device. Any recorded prices will be lost.
              </p>
              <div className="field-dialog-actions">
                <button type="button" className="secondary-button" autoFocus onClick={() => setConfirmDiscard(null)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    const uuid = confirmDiscard
                    setConfirmDiscard(null)
                    onDiscard(uuid)
                  }}
                >
                  Yes, discard
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )
      })()}
      </div>}

      {tab === 'sync' && <div role="tabpanel" aria-label="Queued offline visits" className="field-verification-tabpanel">
        <section className="field-sync-hero">
          <div className="field-section-icon bento-icon-amber">
            <CloudOff size={20} />
          </div>
          <div className="field-sync-hero-text">
            <h3>Pending uploads</h3>
            <span className="field-queue-counter-badge">{queue.length} pending</span>
          </div>
          {queue.length > 0 && (
            <button
              type="button"
              className="primary-button field-sync-btn"
              disabled={!online || syncing}
              onClick={onSync}
            >
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Synchronizing…' : 'Sync all now'}</span>
            </button>
          )}
        </section>

        {queue.length > 0 ? queue.map((item) => {
          const store = bootstrap.stores.find((s) => s.id === item.store_id)
          const storeName = store?.store_name || 'Store not selected'
          const isExpanded = expandedQueue === item.client_uuid
          const anomalies = countAnomalies(item.items)

          return (
            <section key={item.client_uuid} className="field-active-work-card field-assigned-work-card" aria-label={`Pending upload for ${storeName}`}>
              <div className="field-draft-banner field-queue-banner">
                <span className="field-draft-badge field-queue-badge">
                  <span className="field-draft-pulse field-queue-pulse" />
                  Pending upload
                </span>
                <span className="field-draft-timestamp">Finalized {item.finalized_at ? formatDate(item.finalized_at) : 'locally'}</span>
              </div>

              <div className="field-draft-body">
                <div className="field-draft-store-info">
                  <div className="field-draft-store-icon">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h2>{storeName}</h2>
                    <p>{store?.address || 'Address unavailable'}</p>
                  </div>
                </div>

                <div className="field-draft-stats-grid">
                  <div className="field-draft-stat">
                    <small>Prices Encoded</small>
                    <strong>{item.items.length} line{item.items.length === 1 ? '' : 's'}</strong>
                  </div>
                  <div className="field-draft-stat">
                    <small>Reference assessment</small>
                    <strong className={anomalies > 0 ? 'stat-warn' : 'stat-ok'}>
                      {anomalies > 0 ? `${anomalies} for review` : 'Within reference range'}
                    </strong>
                  </div>
                  <div className="field-draft-stat">
                    <small>Signatures</small>
                    <strong>{item.signatures.officer_png_base64 && item.signatures.representative_png_base64 ? 'Both signed' : 'Signatures pending'}</strong>
                  </div>
                  <div className="field-draft-stat">
                    <small>GPS Location</small>
                    <strong>{item.location ? `±${Math.round(item.location.accuracy_meters)} m locked` : 'GPS pending'}</strong>
                  </div>
                </div>

                {item.sync_error && <p className="form-error" role="alert">{item.sync_error}</p>}

                {isExpanded && (
                  <div className="field-queue-expanded-content">
                    {item.location && (
                      <div className="field-queue-evidence-strip">
                        <span><MapPin size={14} /> GPS {item.location.latitude.toFixed(4)}, {item.location.longitude.toFixed(4)}</span>
                      </div>
                    )}

                    <div className="field-queue-items-table">
                      <div className="field-queue-table-head">
                        <span>Commodity</span>
                        <span>Active Reference</span>
                        <span>Recorded Price</span>
                        <span>Variance</span>
                      </div>
                      {item.items.map((line) => {
                        const bulletin = bootstrap.srp_bulletins.find((b) => b.id === line.srp_id)
                        const reference = bulletin ? resolveVisitReference(line, bulletin, bootstrap.protocol?.mode || 'standard', bootstrap.regulatory_prices || [], bootstrap.monitoring_references || []) : { status: 'unavailable' as const, type: 'standard_srp' as const, value: null }
                        const analysis = analyzeWithReference(line, reference)
                        return (
                          <div key={line.srp_id} className="field-queue-table-row">
                            <span className="queue-col-name"><strong>{bulletin?.commodity_name || `Item #${line.srp_id}`}</strong></span>
                            <span className="queue-col-ref">{reference.value === null ? 'Unavailable' : `₱${reference.value.toFixed(2)}`}</span>
                            <span className="queue-col-price"><strong>₱{line.recorded_price.toFixed(2)}</strong></span>
                            <span className="queue-col-variance">
                              <em className={analysis.is_anomaly ? 'variance-anomaly' : 'variance-ok'}>
                                {analysis.label === 'Regulatory reference unavailable' ? 'Unavailable' : analysis.is_anomaly ? `+${analysis.variance_percent}%` : 'Within reference'}
                              </em>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="field-draft-actions-bar">
                  <div className="field-queue-card-actions">
                    {item.sync_error && <button type="button" className="secondary-button" disabled={!online || syncing} onClick={() => onRetry(item.client_uuid)}>Retry this visit</button>}
                    {item.sync_error_kind === 'rejected' && onArchive && <button type="button" className="secondary-button" disabled={syncing} onClick={() => onArchive(item.client_uuid)}>Archive this visit</button>}
                  </div>
                  <button
                    type="button"
                    className="field-queue-toggle-btn"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Hide recorded items' : 'View recorded items'}
                    onClick={() => toggleQueueItem(item.client_uuid)}
                  >
                    <span>{isExpanded ? 'Hide' : 'Details'}</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>
            </section>
          )
        }) : (
          <section className="field-card-section field-activity-empty-card">
            <div className="field-empty-visual">
              <ShieldCheck size={36} />
            </div>
            <div className="field-empty-text">
              <h2>All visits synchronized</h2>
              <p>Completed visits are encrypted locally and automatically dispatched once online.</p>
            </div>
          </section>
        )}

        {archived.length > 0 && (
          <section className="field-card-section field-queue-accordion-list" aria-label="Archived visits">
            <h3>Archived on this device ({archived.length})</h3>
            <p className="field-inline-note">
              <TriangleAlert size={16} />
              The server refused these visits. They stay encrypted only on this device and are deleted if you sign out. Report them to your supervisor.
            </p>
            {archived.map((item) => (
              <article key={item.client_uuid} className="field-queue-card">
                <div className="field-queue-card-summary">
                  <div className="field-queue-summary-left">
                    <div className="field-queue-store-name-row">
                      <strong>{bootstrap.stores.find((s) => s.id === item.store_id)?.store_name || 'Store not selected'}</strong>
                      <span className="field-sync-pill pending">Archived</span>
                    </div>
                    <small className="field-queue-meta-text">
                      {item.items.length} item{item.items.length === 1 ? '' : 's'} recorded · Archived {formatDate(item.archived_at)}
                    </small>
                    {item.sync_error && <p className="form-error">{item.sync_error}</p>}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {!online && queue.length > 0 && (
          <p className="field-inline-note">
            <WifiOff size={16} />
            Connect to the internet to upload {queue.length} secured inspection record{queue.length === 1 ? '' : 's'}.
          </p>
        )}
      </div>}
    </div>
  )
}

interface HistoryCache {
  updated_at: string
  pages: Record<number, Page<MonitoringRecord>>
  details: Record<number, MonitoringRecordDetail>
}

export function HistoryPage({ session, online }: { session: FieldSession; online: boolean }) {
  const [page, setPage] = useState<Page<MonitoringRecord> | null>(null)
  const [current, setCurrent] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<MonitoringRecordDetail | null>(null)
  const [cachedAt, setCachedAt] = useState('')
  const cacheRef = useRef<HistoryCache>({ updated_at: '', pages: {}, details: {} })
  const cacheWrite = useRef<Promise<void>>(Promise.resolve())
  const cacheKey = `history:${session.user.id}`

  const persistCache = (next: HistoryCache) => {
    cacheRef.current = next; setCachedAt(next.updated_at)
    const write = cacheWrite.current.catch(() => undefined).then(() => writeSecret(cacheKey, next))
    cacheWrite.current = write
    return write
  }

  useEffect(() => {
    cacheRef.current = { updated_at: '', pages: {}, details: {} }
    setPage(null); setDetail(null); setCachedAt('')
  }, [cacheKey])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError('')
      if (!cacheRef.current.updated_at) {
        try {
          const saved = await readSecret<HistoryCache>(cacheKey)
          if (saved?.pages && saved?.details) {
            cacheRef.current = saved
            if (!cancelled) setCachedAt(saved.updated_at)
          }
        } catch {
          if (!online && !cancelled) setError('Saved history could not be opened. Reconnect to download it again.')
        }
      }
      if (cancelled) return
      const cachedPage = cacheRef.current.pages[current]
      setPage(cachedPage || null)
      if (!online) { setLoading(false); return }
      try {
        const fresh = await fieldApi.history(session.token, current)
        if (cancelled) return
        const next = { ...cacheRef.current, updated_at: new Date().toISOString(), pages: { ...cacheRef.current.pages, [current]: fresh } }
        setPage(fresh)
        try { await persistCache(next) }
        catch { if (!cancelled) setError('History loaded, but it could not be saved for offline use.') }
      } catch (reason) {
        if (!cancelled) setError(cachedPage ? 'Showing saved history because the latest records could not be downloaded.' : apiError(reason, 'Monitoring history could not load.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [cacheKey, current, online, session.token])

  const openDetail = (record: MonitoringRecord) => {
    const cachedDetail = cacheRef.current.details[record.id]
    setError('')
    if (cachedDetail) setDetail(cachedDetail)
    if (!online) {
      setLoading(false)
      if (!cachedDetail) setError('Connect to download this visit before opening it offline.')
      return
    }
    setLoading(!cachedDetail)
    void fieldApi.historyDetail(session.token, record.id).then(async (fresh) => {
      setDetail(fresh)
      const next = { ...cacheRef.current, updated_at: new Date().toISOString(), details: { ...cacheRef.current.details, [record.id]: fresh } }
      try { await persistCache(next) }
      catch { setError('Visit loaded, but it could not be saved for offline use.') }
    }).catch((reason) => {
      if (!cachedDetail) setError(apiError(reason, 'Visit details could not load.'))
    }).finally(() => setLoading(false))
  }
  if (detail) return <div className="page field-page field-history-page">
    <button type="button" className="text-button field-history-back" onClick={() => { setDetail(null); setError('') }}><ArrowLeft />Back to history</button>
    {!online && <div className="field-offline-state"><WifiOff /><div><h2>Showing saved visit details</h2><p>{cachedAt ? `History saved ${formatDate(cachedAt)}.` : 'Reconnect to refresh this visit.'}</p></div></div>}
    <section className="field-history-detail">
      <div className="field-page-heading"><div><h1 tabIndex={-1}>{detail.store.store_name}</h1><p>{detail.store.address}</p></div></div>
      <dl><div><dt>Finalized</dt><dd>{formatDate(detail.finalized_at)}</dd></div><div><dt>Synchronization</dt><dd>{detail.sync_source === 'offline_queue' ? 'Uploaded from offline queue' : 'Accepted online'}</dd></div><div><dt>Store representative</dt><dd>{detail.representative.name}{detail.representative.title ? ` · ${detail.representative.title}` : ''}</dd></div><div><dt>Signatures</dt><dd>{detail.signatures.officer_present && detail.signatures.representative_present ? 'Both signatures captured' : 'Signature evidence incomplete'}</dd></div><div><dt>Locked GPS</dt><dd>{detail.location.latitude.toFixed(5)}, {detail.location.longitude.toFixed(5)} · ±{Math.round(detail.location.accuracy_meters)} m</dd></div>{detail.field_verification_request_id && <div><dt>Field verification</dt><dd>Verification request #{detail.field_verification_request_id}</dd></div>}</dl>
      <div className="field-history-detail-items"><h2>Recorded products</h2>{detail.items.map((item) => <article key={item.id}><div><strong>{item.commodity_name || `Item #${item.srp_id}`}</strong><small>{item.unit}</small></div><span>₱{Number(item.recorded_price).toFixed(2)}</span><em className={item.reference_status === 'unavailable' || item.is_anomaly ? 'attention' : 'within'}>{item.reference_status === 'unavailable' ? 'Regulatory reference unavailable' : item.is_anomaly ? 'For review' : 'Within reference'}</em><small>{item.reference_label || item.reference_source || 'Reference unavailable'}{item.reference_effective_date ? ` · ${item.reference_effective_date}` : ''}</small></article>)}</div>
    </section>
  </div>
  return <div className="page field-page field-history-page">
    <section className="field-history-section">
      {!online && <div className="field-offline-state"><WifiOff /><div><h2>{page ? 'Showing history saved on this device' : 'No saved history on this device'}</h2><p>{page && cachedAt ? `History saved ${formatDate(cachedAt)}. Reconnect to refresh it.` : 'Reconnect once to download accepted visits.'}</p></div></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? (
        <div className="field-history-loading" role="status">Loading accepted visits…</div>
      ) : page?.data.length ? (
        <div className="field-history-records">
          {page.data.map((record) => (
            <button key={record.id} type="button" className="field-history-card" aria-label={`View ${record.store?.store_name || 'Store'} visit details`} onClick={() => openDetail(record)}>
              <div className="field-history-card-header">
                <strong className="field-history-store-name">{record.store?.store_name || 'Store'}</strong>
                <span className="field-history-status">{record.anomaly_count > 0 ? <em className="attention"><TriangleAlert size={12} className="field-history-status-icon fa-status-icon" aria-hidden="true" /><span>{record.anomaly_count} {record.anomaly_count === 1 ? 'anomaly' : 'anomalies'}</span></em> : <em className="accepted"><Check size={12} className="field-history-status-icon fa-status-icon" aria-hidden="true" /><span>Accepted</span></em>}</span>
              </div>
              <small className="field-history-store-address">{record.store?.address || ''}</small>
              <div className="field-history-card-footer"><span className="field-history-date"><Clock size={12} className="field-history-date-icon fa-date-icon" aria-hidden="true" /><span>{formatDate(record.finalized_at)}</span></span><span className="field-history-chevron" aria-hidden="true"><ChevronRight size={16} /></span></div>
            </button>
          ))}
        </div>
      ) : page && !loading ? (
        <div className="field-quiet-state"><History /><strong>No accepted visits yet</strong><span>{online ? 'Server-accepted monitoring records will appear here.' : 'No accepted visits were saved on this page.'}</span></div>
      ) : null}
      {page && page.last_page > 1 && <div className="pagination"><span>Showing {page.from}–{page.to} of {page.total}</span><div><button type="button" disabled={current <= 1 || (!online && !cacheRef.current.pages[current - 1])} onClick={() => setCurrent(current - 1)}>Previous</button><strong>Page {current} of {page.last_page}</strong><button type="button" disabled={current >= page.last_page || (!online && !cacheRef.current.pages[current + 1])} onClick={() => setCurrent(current + 1)}>Next</button></div></div>}
    </section>
  </div>
}

interface ProfilePageProps {
  session: FieldSession
  online: boolean
  biometricAvailability: BiometricAvailability
  biometricEnabled: boolean
  onToggleBiometric: () => Promise<void>
  onChangePin: (currentPin: string, newPin: string) => Promise<void>
  onReplayGuide?: () => void
  onLock?: () => void
  onLogout: () => void
}

export function ProfilePage({ session, online, biometricAvailability, biometricEnabled, onToggleBiometric, onChangePin, onReplayGuide, onLogout }: ProfilePageProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pinEditing, setPinEditing] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinChanged, setPinChanged] = useState(false)
  const authorizationValid = canFinalizeWithLease(session.offline_lease)
  const biometricDetail = biometricAvailability === 'available'
    ? (biometricEnabled ? 'Enabled on this device. Your four-digit PIN remains available.' : 'Use this device’s fingerprint or facial verification. Your PIN remains the fallback.')
    : biometricAvailability === 'browser-unsupported'
      ? 'Biometric unlock requires Chrome or Edge 133 or newer on a secure HTTPS connection.'
      : biometricAvailability === 'platform-authenticator-unavailable'
        ? 'Set up fingerprint or facial verification in this device’s settings before enabling it here.'
        : 'This authenticator cannot provide the encrypted key required for biometric vault unlock.'

  const toggleBiometric = async () => {
    setBusy(true); setError('')
    try { await onToggleBiometric() } catch (reason) { setError(apiError(reason, 'Biometric security could not be changed.')) } finally { setBusy(false) }
  }

  const closePinForm = () => {
    setPinEditing(false); setCurrentPin(''); setNewPin(''); setConfirmPin(''); setPinError('')
  }
  const submitPinChange = async () => {
    if (busy) return
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
      setPinError('Enter four digits in each PIN field.'); return
    }
    if (newPin !== confirmPin) { setPinError('PINs do not match. Re-enter the confirmation.'); return }
    setBusy(true); setPinError('')
    try {
      await onChangePin(currentPin, newPin)
      closePinForm()
      setPinChanged(true)
    } catch (reason) {
      setCurrentPin('')
      setPinError(reason instanceof Error ? reason.message : 'The device PIN could not be changed. Your previous PIN still works.')
    } finally { setBusy(false) }
  }

  return <div className="page field-page field-profile-page">
    <section className="field-profile-identity"><span className="field-profile-avatar"><UserRound /></span><div><h2>{session.user.name}</h2><p>{session.user.email}</p><span>DTI Field Monitoring Officer</span></div></section>
    <div className="field-profile-grid">
      <section><div className="field-settings-heading"><span><BadgeCheck /></span><div><h2>Device authorization</h2><p>Authority to work with downloaded field data.</p></div></div><dl><div><dt>Connection</dt><dd className={online ? 'positive' : ''}>{online ? 'Online' : 'Offline'}</dd></div><div><dt>Offline authorization</dt><dd className={authorizationValid ? 'positive' : 'attention'}>{authorizationValid ? 'Active' : 'Expired'}</dd></div><div><dt>Valid until</dt><dd>{formatDate(session.offline_lease.expires_at)}</dd></div></dl></section>
      <section><div className="field-settings-heading"><span><Fingerprint /></span><div><h2>Biometric unlock</h2><p>{biometricDetail}</p></div></div>{biometricAvailability === 'available' && <button type="button" className="secondary-button" disabled={busy} onClick={() => void toggleBiometric()}>{busy && !pinEditing ? 'Updating…' : biometricEnabled ? 'Disable biometric unlock' : 'Enable biometric unlock'}</button>}{error && <p className="form-error" role="alert">{error}</p>}</section>
      <section><div className="field-settings-heading"><span><LockKeyhole /></span><div><h2>Device PIN</h2><p>Change the four-digit PIN for this device. Your saved visits stay protected.</p></div></div>
        {pinEditing ? <form className="field-profile-pin-form" onSubmit={(event) => { event.preventDefault(); void submitPinChange() }}>
          <div className="field-profile-pin-field"><span>Current PIN</span><DevicePinInput autoFocus label="Current 4-digit device PIN" value={currentPin} onChange={setCurrentPin} disabled={busy} /></div>
          <div className="field-profile-pin-field"><span>New PIN</span><DevicePinInput label="New 4-digit device PIN" value={newPin} onChange={setNewPin} disabled={busy} /></div>
          <div className="field-profile-pin-field"><span>Confirm new PIN</span><DevicePinInput label="Confirm new 4-digit device PIN" value={confirmPin} onChange={setConfirmPin} disabled={busy} /></div>
          {pinError && <p className="form-error" role="alert">{pinError}</p>}
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save new PIN'}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={closePinForm}>Cancel PIN change</button>
        </form> : <button type="button" className="secondary-button" disabled={busy} onClick={() => { setPinChanged(false); setPinEditing(true) }}>Change device PIN</button>}
        {pinChanged && <p role="status">Device PIN changed. Use the new PIN at your next unlock.</p>}
      </section>
      {onReplayGuide && <section><div className="field-settings-heading"><span><Eye /></span><div><h2>App guide</h2><p>Review what each section does and how to complete a visit.</p></div></div><button type="button" className="secondary-button" onClick={onReplayGuide}>Replay app guide</button></section>}
    </div>
    <div className="field-profile-signout-section">
      <button type="button" className="field-signout-button" disabled={busy} onClick={onLogout}>
        <LogOut size={18} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </div>
  </div>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
