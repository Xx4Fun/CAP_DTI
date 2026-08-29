import { useEffect, useState } from 'react'
import {
  ArrowRight, BadgeCheck, Building2, CheckCircle2, ClipboardList, CloudOff, Fingerprint,
  History, LockKeyhole, PackageSearch, RefreshCw, ShieldCheck, UserRound, Wifi, WifiOff,
} from 'lucide-react'
import { canFinalizeWithLease } from '../app/sessionPolicy'
import type { BiometricAvailability } from '../app/vault'
import { apiError, fieldApi } from '../services/fieldApi'
import type { BootstrapData, FieldSession, MonitoringRecord, Page, VisitDraft } from '../types'

interface HomePageProps {
  name: string
  bootstrap: BootstrapData
  queueCount: number
  activeDraft: VisitDraft | null
  online: boolean
  authorizationValid: boolean
  onStart: () => void
  onViewActivity: () => void
}

export function HomePage({ name, bootstrap, queueCount, activeDraft, online, authorizationValid, onStart, onViewActivity }: HomePageProps) {
  const firstName = name.split(/\s+/)[0]
  const storeCount = bootstrap.stores.length
  const srpCount = bootstrap.srp_bulletins.length

  return <div className="page field-page field-home-page">
    <div className="field-page-heading">
      <div>
        <h1 tabIndex={-1}>Good day, {firstName}</h1>
        <p>Your field workspace is ready for today’s monitoring work.</p>
      </div>
      <div className="field-header-badge-group">
        <span className={`network-chip ${online ? 'online' : ''}`}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {online ? 'Online · Live Sync' : 'Working offline · Vault Active'}
        </span>
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
            ? `${activeDraft.items.length} commodity line${activeDraft.items.length === 1 ? '' : 's'} saved securely. Open Activity to continue without losing work.`
            : authorizationValid
              ? 'Choose an active registered establishment, record shelf prices against official SRP baselines, and secure tamper-proof evidence.'
              : 'Existing evidence remains protected on device. Reconnect and unlock before starting or finalizing a visit.'}
        </p>
        <div className="field-hero-actions">
          <button
            type="button"
            className="primary-button field-hero-cta"
            disabled={!activeDraft && !authorizationValid}
            onClick={activeDraft ? onViewActivity : onStart}
          >
            {activeDraft ? 'View current activity' : 'Start new visit'}
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
        <div className="field-bento-card bento-stores">
          <div className="bento-icon-wrap bento-icon-blue">
            <Building2 size={22} />
          </div>
          <dt>Store directory</dt>
          <dd className="bento-value">
            {storeCount} active store{storeCount === 1 ? '' : 's'}
          </dd>
          <span className="bento-subtext">Monitored outlets</span>
        </div>

        <div className="field-bento-card bento-srp">
          <div className="bento-icon-wrap bento-icon-teal">
            <PackageSearch size={22} />
          </div>
          <dt>Price references</dt>
          <dd className="bento-value">
            {srpCount} current reference{srpCount === 1 ? '' : 's'}
          </dd>
          <span className="bento-subtext">Active DTI SRP baselines</span>
        </div>

        <div className="field-bento-card bento-sync">
          <div className="bento-icon-wrap bento-icon-amber">
            <CloudOff size={22} />
          </div>
          <dt>Synchronization</dt>
          <dd className="bento-value">
            {queueCount} pending sync
          </dd>
          <span className="bento-subtext">{queueCount > 0 ? 'Encrypted on device' : 'All visits up to date'}</span>
        </div>

        <div className="field-bento-card bento-access">
          <div className="bento-icon-wrap bento-icon-indigo">
            <BadgeCheck size={22} />
          </div>
          <dt>Device access</dt>
          <dd className={`bento-value ${authorizationValid ? 'status-ok' : 'status-warn'}`}>
            {authorizationValid ? 'Authorized' : 'Renew online'}
          </dd>
          <span className="bento-subtext">{authorizationValid ? 'Cryptographic lease active' : 'Connect to refresh'}</span>
        </div>
      </dl>
    </section>

    <section className="field-pipeline-card field-process" aria-label="Monitoring visit process">
      <div className="field-pipeline-header">
        <div className="field-pipeline-title-group">
          <span className="field-pipeline-indicator" />
          <div>
            <h3>R.A. 7581 Monitoring Process</h3>
            <p>Standard regulatory procedure for on-site commodity inspection</p>
          </div>
        </div>
        <span className="field-pipeline-tag">Price Act Compliance</span>
      </div>
      <div className="field-pipeline-steps">
        <div className="pipeline-step">
          <span className="pipeline-step-num">1</span>
          <div className="pipeline-step-icon"><Building2 size={18} /></div>
          <div className="pipeline-step-info">
            <strong>Choose store</strong>
            <small>Verified outlet</small>
          </div>
        </div>
        <div className="pipeline-connector" aria-hidden="true" />
        <div className="pipeline-step">
          <span className="pipeline-step-num">2</span>
          <div className="pipeline-step-icon"><PackageSearch size={18} /></div>
          <div className="pipeline-step-info">
            <strong>Record prices</strong>
            <small>Shelf inspection</small>
          </div>
        </div>
        <div className="pipeline-connector" aria-hidden="true" />
        <div className="pipeline-step">
          <span className="pipeline-step-num">3</span>
          <div className="pipeline-step-icon"><ClipboardList size={18} /></div>
          <div className="pipeline-step-info">
            <strong>Review visit</strong>
            <small>Variance check</small>
          </div>
        </div>
        <div className="pipeline-connector" aria-hidden="true" />
        <div className="pipeline-step">
          <span className="pipeline-step-num">4</span>
          <div className="pipeline-step-icon"><ShieldCheck size={18} /></div>
          <div className="pipeline-step-info">
            <strong>Lock evidence</strong>
            <small>Signatures & GPS</small>
          </div>
        </div>
      </div>
    </section>
  </div>
}

interface ActivityPageProps {
  activeDraft: VisitDraft | null
  queue: VisitDraft[]
  bootstrap: BootstrapData
  online: boolean
  syncing: boolean
  authorizationValid: boolean
  onResume: () => void
  onStart: () => void
  onSync: () => void
}

export function ActivityPage({ activeDraft, queue, bootstrap, online, syncing, authorizationValid, onResume, onStart, onSync }: ActivityPageProps) {
  const storeName = (item: VisitDraft) => bootstrap.stores.find((store) => store.id === item.store_id)?.store_name || 'Store not yet selected'
  return <div className="page field-page field-activity-page">
    <div className="field-page-heading"><div><h1 tabIndex={-1}>Activity</h1><p>Resume current work and synchronize finalized visits protected on this device.</p></div></div>
    {activeDraft ? <section className="field-active-work"><div className="field-active-work-mark"><ClipboardList /></div><div><span className="field-state-label">Active draft</span><h2>{storeName(activeDraft)}</h2><p>{activeDraft.items.length} commodity line{activeDraft.items.length === 1 ? '' : 's'} saved · Started {formatDate(activeDraft.started_at)}</p></div><button type="button" className="primary-button" onClick={onResume}>Resume visit<ArrowRight /></button></section> : <section className="field-activity-empty"><CheckCircle2 /><div><h2>No visit in progress</h2><p>Start a monitoring visit when you arrive at an active registered establishment.</p></div><button type="button" className="secondary-button" disabled={!authorizationValid} onClick={onStart}>New visit</button></section>}
    <section className="field-sync-section">
      <div className="field-section-heading"><div><h2>Waiting to synchronize</h2><p>Finalized records stay encrypted here until the server accepts them.</p></div><span>{queue.length}</span></div>
      {queue.length ? <div className="field-sync-list">{queue.map((item) => <article key={item.client_uuid}><CloudOff /><div><strong>{storeName(item)}</strong><span>{item.items.length} recorded item{item.items.length === 1 ? '' : 's'} · {item.finalized_at ? formatDate(item.finalized_at) : 'Finalized locally'}</span></div><em>Encrypted and waiting to sync</em></article>)}</div> : <div className="field-quiet-state"><ShieldCheck /><strong>Nothing waiting to sync</strong><span>Finalized offline visits will appear here until accepted.</span></div>}
      {queue.length > 0 && <button type="button" className="primary-button field-sync-action" disabled={!online || syncing} onClick={onSync}><RefreshCw className={syncing ? 'spin' : ''} />{syncing ? 'Synchronizing…' : 'Synchronize now'}</button>}
      {!online && queue.length > 0 && <p className="field-inline-note"><WifiOff />Reconnect to synchronize. Your records remain encrypted.</p>}
    </section>
  </div>
}

export function HistoryPage({ session, online }: { session: FieldSession; online: boolean }) {
  const [page, setPage] = useState<Page<MonitoringRecord> | null>(null)
  const [current, setCurrent] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!online) return
    setLoading(true); setError('')
    void fieldApi.history(session.token, current).then(setPage).catch((reason) => setError(apiError(reason, 'Monitoring history could not load.'))).finally(() => setLoading(false))
  }, [current, online, session.token])
  return <div className="page field-page field-history-page">
    <div className="field-page-heading"><div><h1 tabIndex={-1}>History</h1><p>Accepted monitoring visits are read-only and available to authorized DTI review.</p></div></div>
    <section className="field-history-section">
      {!online && <div className="field-offline-state"><WifiOff /><div><h2>History needs a connection</h2><p>Current drafts and pending synchronization remain available in Activity.</p></div></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="field-history-loading" role="status">Loading accepted visits…</div> : online && page?.data.length ? <div className="field-history-records"><div className="field-history-head"><span>Establishment</span><span>Officer visit</span><span>Items</span><span>Observations</span><span>Status</span></div>{page.data.map((record) => <article key={record.id}><div data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></div><span data-label="Officer visit">{formatDate(record.finalized_at)}</span><span data-label="Items">{record.items_count}</span><span data-label="Observations"><em className={record.anomaly_count ? 'attention' : 'within'}>{record.anomaly_count || 'None'}</em></span><span data-label="Status"><em className="accepted">Accepted</em></span></article>)}</div> : online && !loading && <div className="field-quiet-state"><History /><strong>No accepted visits yet</strong><span>Server-accepted monitoring records will appear here.</span></div>}
      {page && page.last_page > 1 && <div className="pagination"><span>Showing {page.from}–{page.to} of {page.total}</span><div><button type="button" disabled={current <= 1} onClick={() => setCurrent(current - 1)}>Previous</button><strong>Page {current} of {page.last_page}</strong><button type="button" disabled={current >= page.last_page} onClick={() => setCurrent(current + 1)}>Next</button></div></div>}
    </section>
  </div>
}

interface ProfilePageProps {
  session: FieldSession
  online: boolean
  biometricAvailability: BiometricAvailability
  biometricEnabled: boolean
  onToggleBiometric: () => Promise<void>
  onLock: () => void
  onLogout: () => void
}

export function ProfilePage({ session, online, biometricAvailability, biometricEnabled, onToggleBiometric, onLock, onLogout }: ProfilePageProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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

  return <div className="page field-page field-profile-page">
    <div className="field-page-heading"><div><h1 tabIndex={-1}>Profile</h1><p>Review your officer account, device authorization, and workspace security.</p></div></div>
    <section className="field-profile-identity"><span className="field-profile-avatar"><UserRound /></span><div><h2>{session.user.name}</h2><p>{session.user.email}</p><span>DTI Field Monitoring Officer</span></div></section>
    <div className="field-profile-grid">
      <section><div className="field-settings-heading"><span><BadgeCheck /></span><div><h2>Device authorization</h2><p>Authority to work with downloaded field data.</p></div></div><dl><div><dt>Connection</dt><dd className={online ? 'positive' : ''}>{online ? 'Online' : 'Offline'}</dd></div><div><dt>Offline authorization</dt><dd className={authorizationValid ? 'positive' : 'attention'}>{authorizationValid ? 'Active' : 'Expired'}</dd></div><div><dt>Valid until</dt><dd>{formatDate(session.offline_lease.expires_at)}</dd></div></dl></section>
      <section><div className="field-settings-heading"><span><Fingerprint /></span><div><h2>Biometric unlock</h2><p>{biometricDetail}</p></div></div>{biometricAvailability === 'available' && <button type="button" className="secondary-button" disabled={busy} onClick={() => void toggleBiometric()}>{busy ? 'Updating…' : biometricEnabled ? 'Disable biometric unlock' : 'Enable biometric unlock'}</button>}{error && <p className="form-error" role="alert">{error}</p>}</section>
    </div>
    <section className="field-security-actions"><div><LockKeyhole /><span><h2>Workspace access</h2><p>Lock this device without deleting drafts, queued evidence, or downloaded field data.</p></span></div><div><button type="button" className="secondary-button" onClick={onLock}>Lock now</button><button type="button" className="field-signout-button" onClick={onLogout}>Sign out</button></div></section>
  </div>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
