import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, Building2, Check, CheckCircle2, ChevronLeft, Info,
  CloudOff, LocateFixed, LockKeyhole, LogOut, MapPin,
  Fingerprint, Search, ShieldCheck,
  TriangleAlert, Wifi, WifiOff, X
} from 'lucide-react'
import { InstallPrompt } from './components/InstallPrompt'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { LoginForm } from './components/Login'
import { AuthShell } from './components/AuthShell'
import { DevicePinInput } from './components/DevicePinInput'
import { FieldAppShell, type TopLevelView } from './components/FieldAppShell'
import { formatDistance, haversineKm, HistoryPage, HomePage, MonitoringPage, ProfilePage } from './components/FieldPages'
import { NotificationDrawer } from './components/NotificationDrawer'
import { DtiMonitoringSheet } from './components/DtiMonitoringSheet'
import { SignaturePad } from './components/SignaturePad'
import { RepresentativeReview } from './components/RepresentativeReview'
import { applyRepresentativePrefill } from './app/representative'
import { ReadOnlyVisit } from './components/ReadOnlyVisit'
import { apiError, fieldApi } from './services/fieldApi'
import { canFinalizeVisit, changedVisitReferences, refreshVisitReferences, createDraft, hasDraftActivity, isActionableDraft, isBlankDraft, mergeBootstrapDelta } from './app/workflow'
import {
  archiveUnreadableDrafts, archiveUnreadableQueue, changeVaultPin, clearVault, createVault, deleteSecret, disableBiometricUnlock, enableBiometricUnlock,
  getBiometricUnlockAvailability, getVaultPinLength, hasBiometricUnlock, hasVault, lockVault, readSecret,
  requestPersistentStorage, restoreVaultSession, rewrapVaultPin, unlockVault, unlockVaultWithBiometrics, writeSecret,
} from './app/vault'
import type { BiometricAvailability, VaultUnlockResult } from './app/vault'
import {
  applyRenewedLease, canFinalizeWithLease, logoutBlock, shouldAutoRetry, shouldLockAfterBackground, shouldRetryOnReconnect, syncErrorKind,
} from './app/sessionPolicy'
import type { ArchivedVisit, BootstrapData, FieldNotification, FieldSession, FieldVerificationRequest, GeoPosition, QueuedVisit, ReferenceSnapshot, RoutineRecordView, StoreRecord, VisitDraft } from './types'

type Gate = 'checking' | 'login' | 'pin' | 'biometric' | 'unlock' | 'repair-login' | 'repair-unlock' | 'migration' | 'attention' | 'recovery' | 'ready'
type View = TopLevelView | 'visit'
type Completion = { status: 'accepted' | 'queued'; storeName: string }
type FieldNotice = { kind: 'success' | 'info' | 'warning' | 'error'; title: string; message: string }
type RecoveryIssue = { code: string; detail: string }
type SignOutDialogState =
  | { type: 'draft-block'; count: number }
  | { type: 'queue-block'; count: number }
  | { type: 'offline-block' }
  | { type: 'confirm' }
  | null
class WorkspaceIntegrityError extends Error {
  constructor(readonly issue: RecoveryIssue) { super(issue.detail) }
}
const readRequiredSecret = async <T,>(key: string, issue: RecoveryIssue) => {
  try { return await readSecret<T>(key) }
  catch { throw new WorkspaceIntegrityError(issue) }
}
const readCachedSecret = async <T,>(key: string) => {
  try { return { value: await readSecret<T>(key), failed: false } }
  catch { return { value: undefined, failed: true } }
}
export const fieldNoticeDuration = (kind: FieldNotice['kind']) => kind === 'success' ? 4_000 : kind === 'info' ? 6_000 : 0
const GUIDE_VERSION = 'v1'
const guideKey = (userId: number) => `field-guide:${userId}:${GUIDE_VERSION}`
const TAB_LOCK_NAME = 'price-watch-field-app'
const DRAFT_SAVE_DEBOUNCE_MS = 750
const SYNC_RETRY_CHECK_MS = 30_000
const GPS_REBIND_IMPROVEMENT_METRES = 5
const EMPTY_BOOTSTRAP: BootstrapData = {
  version: '',
  is_delta: false,
  stores: [],
  srp_bulletins: [],
  recent_prices: [],
}

export default function App() {
  const [gate, setGate] = useState<Gate>('checking')
  const [tabLock, setTabLock] = useState<'pending' | 'owned' | 'blocked'>(() => typeof navigator !== 'undefined' && navigator.locks ? 'pending' : 'owned')
  const [tabLockAttempt, setTabLockAttempt] = useState(0)
  const [archivedVisits, setArchivedVisits] = useState<ArchivedVisit[]>([])
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)
  const [session, setSession] = useState<FieldSession | null>(null)
  const [repairingSession, setRepairingSession] = useState(false)
  const [recoveryIssue, setRecoveryIssue] = useState<RecoveryIssue | null>(null)
  const [recoveringDrafts, setRecoveringDrafts] = useState(false)
  const [recoveringQueue, setRecoveringQueue] = useState(false)
  const [bootstrap, setBootstrap] = useState(EMPTY_BOOTSTRAP)
  const bootstrapRef = useRef(bootstrap)
  bootstrapRef.current = bootstrap
  const [queue, setQueue] = useState<QueuedVisit[]>([])
  const [view, setView] = useState<View>('home')
  const [drafts, setDrafts] = useState<VisitDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [visitStep, setVisitStep] = useState(0)
  const [viewingRecord, setViewingRecord] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<FieldNotice | null>(null)
  const [biometricAvailability, setBiometricAvailability] = useState<BiometricAvailability>('browser-unsupported')
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [officerPosition, setOfficerPosition] = useState<GeoPosition | null>(null)
  const [completedToday, setCompletedToday] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideStep, setGuideStep] = useState(0)
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [verificationRequests, setVerificationRequests] = useState<FieldVerificationRequest[]>([])
  const [requestState, setRequestState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [notifications, setNotifications] = useState<FieldNotification[]>([])
  const [notificationState, setNotificationState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [monitoringTab, setMonitoringTab] = useState<'work' | 'verification' | 'sync'>('work')
  const [signOutDialog, setSignOutDialog] = useState<SignOutDialogState>(null)
  const [, setLeaseClock] = useState(0)
  const hiddenAt = useRef<number | null>(null)
  const previousOnline = useRef(online)
  const regulatoryOnline = useRef(online)
  const queueRef = useRef<QueuedVisit[]>([])
  const queueWrite = useRef<Promise<void>>(Promise.resolve())
  const draftWrite = useRef<Promise<void>>(Promise.resolve())
  const bootstrapWrite = useRef<Promise<void>>(Promise.resolve())
  const syncingRef = useRef(false)
  const renewingLeaseRef = useRef(false)
  const lockingRef = useRef(false)
  const archivedRef = useRef<ArchivedVisit[]>([])
  const pendingDraftFlush = useRef<(() => Promise<unknown>) | null>(null)
  const previousLockRequest = useRef<Promise<unknown>>(Promise.resolve())
  const syncQueueRef = useRef<(clientUuids?: string[]) => Promise<void>>(async () => undefined)
  const draft = drafts.find((item) => item.client_uuid === activeDraftId) || null
  const dismissNotice = useCallback(() => setNotice(null), [])
  const persistDrafts = useCallback(async (next: VisitDraft[]) => {
    const write = draftWrite.current.catch(() => undefined).then(() => writeSecret('drafts', next.filter(isActionableDraft)))
    draftWrite.current = write
    await write
  }, [])
  const requestSessionRepair = useCallback(() => {
    lockVault()
    setSession(null)
    setRepairingSession(true)
    setGate('repair-login')
  }, [])

  // One tab owns the workspace: two tabs would overwrite each other's encrypted queue and drafts.
  // StrictMode-safe: cleanup releases and cancels, and a remount requests only after the previous request settles.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.locks) return
    let cancelled = false
    let release: (() => void) | undefined
    const request = previousLockRequest.current.catch(() => undefined).then(() => cancelled ? undefined : navigator.locks.request(TAB_LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (cancelled) return undefined
      if (!lock) { setTabLock('blocked'); return undefined }
      setTabLock('owned')
      return new Promise<void>((resolve) => { release = resolve })
    }))
    // A failed lock request must not leave startup pending forever: show the recoverable gate with "Check again".
    previousLockRequest.current = request.catch(() => { if (!cancelled) setTabLock('blocked') })
    return () => { cancelled = true; release?.() }
  }, [tabLockAttempt])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const refreshOperationalData = useCallback(async (token: string) => {
    if (!navigator.onLine) { setRequestState('unavailable'); setNotificationState('unavailable'); return }
    setRequestState('loading'); setNotificationState('loading')
    const requestsCall = typeof fieldApi.verificationRequests === 'function' ? fieldApi.verificationRequests(token) : Promise.resolve([])
    const notificationsCall = typeof fieldApi.notifications === 'function' ? fieldApi.notifications(token) : Promise.resolve({ data: [], unread_count: 0, meta: { current_page: 1, last_page: 1, per_page: 50, total: 0 } })
    await Promise.all([
      requestsCall.then(async (data) => { setVerificationRequests(data); setRequestState('ready'); await writeSecret('verification-requests', data) }).catch(() => setRequestState('unavailable')),
      notificationsCall.then(async (page) => { setNotifications(page.data); setNotificationState('ready'); await writeSecret('notifications', page.data) }).catch(() => setNotificationState('unavailable')),
    ])
  }, [])

  const persistBootstrap = useCallback(async (update: (current: BootstrapData) => BootstrapData, valid: () => boolean) => {
    const write = bootstrapWrite.current.catch(() => undefined).then(async () => {
      if (!valid()) return
      const next = update(bootstrapRef.current)
      await writeSecret('bootstrap', next)
      if (!valid()) return
      bootstrapRef.current = next
      setBootstrap(next)
    })
    bootstrapWrite.current = write
    await write
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setOfficerPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  const hydrate = useCallback(async (next: FieldSession, renewOnline = true) => {
    lockingRef.current = false
    const [cached, cachedQueue, cachedDrafts, cachedRequests, cachedNotifications, cachedArchived] = await Promise.all([
      readCachedSecret<BootstrapData>('bootstrap'),
      readRequiredSecret<QueuedVisit[]>('queue', { code: 'PW-WORK-QUEUE', detail: 'The encrypted upload queue could not be opened.' }),
      readRequiredSecret<VisitDraft[]>('drafts', { code: 'PW-WORK-DRAFTS', detail: 'Encrypted unfinished visits could not be opened.' }),
      readCachedSecret<FieldVerificationRequest[]>('verification-requests'),
      readCachedSecret<FieldNotification[]>('notifications'),
      // Archived visits are the only copy of refused evidence: unreadable must stop the workspace, not look empty.
      readRequiredSecret<ArchivedVisit[]>('archived-visits', { code: 'PW-WORK-ARCHIVED', detail: 'Archived visits that could not be uploaded could not be opened.' }),
    ])
    const legacyDraft = cachedDrafts === undefined
      ? await readRequiredSecret<VisitDraft>('active-draft', { code: 'PW-WORK-LEGACY', detail: 'An encrypted unfinished visit from an earlier version could not be opened.' })
      : undefined
    let effectiveSession = next
    const storedDrafts = cachedDrafts ?? (legacyDraft ? [legacyDraft] : [])
    let effectiveDrafts = storedDrafts.filter(isActionableDraft)
    if (cachedDrafts === undefined && legacyDraft) {
      await persistDrafts(effectiveDrafts)
      try { await deleteSecret('active-draft') } catch { /* canonical copy is already secured */ }
    }
    if (cachedDrafts !== undefined && effectiveDrafts.length !== storedDrafts.length) await persistDrafts(effectiveDrafts)
    const queuedIds = new Set((cachedQueue ?? []).map((item) => item.client_uuid))
    const reconciledDrafts = effectiveDrafts.filter((item) => !queuedIds.has(item.client_uuid))
    if (reconciledDrafts.length !== effectiveDrafts.length) {
      effectiveDrafts = reconciledDrafts
      await persistDrafts(effectiveDrafts)
    }
    const openWorkspace = () => {
      setSession(effectiveSession)
      if (cached.value) setBootstrap(cached.value)
      if (cachedQueue) { queueRef.current = cachedQueue; setQueue(cachedQueue) }
      archivedRef.current = cachedArchived ?? []; setArchivedVisits(archivedRef.current)
      if (cachedRequests.value) { setVerificationRequests(cachedRequests.value); setRequestState('ready') }
      else if (cachedRequests.failed) setRequestState('unavailable')
      if (cachedNotifications.value) { setNotifications(cachedNotifications.value); setNotificationState('ready') }
      else if (cachedNotifications.failed) setNotificationState('unavailable')
      setDrafts(effectiveDrafts)
      try { setGuideOpen(localStorage.getItem(guideKey(effectiveSession.user.id)) !== 'complete') }
      catch { setGuideOpen(true) }
      if (cached.failed || cachedRequests.failed || cachedNotifications.failed) {
        setNotice({ kind: 'warning', title: 'Downloaded data needs refresh', message: 'Protected field work is available. Connect to refresh downloaded reference data.' })
      }
      setGate('ready')
    }
    openWorkspace()
    void Promise.resolve(requestPersistentStorage()).then((persisted) => { if (!lockingRef.current) setStoragePersisted(persisted) })
    void Promise.all([getBiometricUnlockAvailability(), hasBiometricUnlock()]).then(([availability, enabled]) => {
      if (lockingRef.current) return
      setBiometricAvailability(availability)
      setBiometricEnabled(enabled)
    })
    if (!navigator.onLine) return
    void (async () => {
      if (renewOnline) {
        try {
          const lease = await fieldApi.renewLease(next.token)
          if (lockingRef.current) return
          const renewed = applyRenewedLease(next, effectiveDrafts, lease)
          effectiveSession = renewed.session
          effectiveDrafts = renewed.drafts
          setSession(effectiveSession)
          setDrafts(effectiveDrafts)
          await writeSecret('session', effectiveSession)
          await persistDrafts(effectiveDrafts)
        } catch (error) {
          const status = (error as { response?: { status?: number } }).response?.status
          if (status === 401 || status === 403) {
            lockingRef.current = true
            lockVault(); setGate('attention'); return
          }
          if (!lockingRef.current) setNotice({ kind: 'warning', title: 'Online refresh unavailable', message: 'Saved field data is open. Reconnect to refresh authorization and reference data.' })
          return
        }
      }
      if (lockingRef.current) return
      try {
        const downloaded = mergeBootstrapDelta(cached.value, await fieldApi.bootstrap(effectiveSession.token, cached.value?.monitoring_references ? cached.value.version : undefined))
        if (lockingRef.current) return
        await persistBootstrap(() => downloaded, () => !lockingRef.current)
      } catch {
        if (!lockingRef.current) setNotice({ kind: 'warning', title: 'Online refresh unavailable', message: 'Saved field data is open. Reconnect to refresh authorization and reference data.' })
        return
      }
      if (!lockingRef.current) await refreshOperationalData(effectiveSession.token)
    })()
  }, [persistBootstrap, persistDrafts, refreshOperationalData])

  const showRecovery = useCallback((error: unknown) => {
    lockVault()
    setSession(null)
    setRecoveryIssue(error instanceof WorkspaceIntegrityError
      ? error.issue
      : { code: 'PW-WORK-STORAGE', detail: 'The encrypted field workspace could not be opened safely.' })
    setGate('recovery')
  }, [])

  // Bind a background GPS fix to the active draft until the officer signs, and only when it is meaningfully more accurate.
  useEffect(() => {
    if (viewingRecord || !draft || !officerPosition || officerPosition.accuracy_meters > 150 || draft.signatures.officer_png_base64) return
    if (draft.location && draft.location.accuracy_meters - officerPosition.accuracy_meters < GPS_REBIND_IMPROVEMENT_METRES) return
    setDrafts((current) => current.map((item) => item.client_uuid === draft.client_uuid ? {
      ...item,
      location: {
        latitude: officerPosition.latitude,
        longitude: officerPosition.longitude,
        accuracy_meters: officerPosition.accuracy_meters,
        captured_at: new Date().toISOString(),
      },
    } : item))
  }, [draft, officerPosition, viewingRecord])

  useEffect(() => {
    if (tabLock !== 'owned') return
    void (async () => {
      if (!await hasVault()) { setGate('login'); return }
      if (!await restoreVaultSession()) { setGate('unlock'); return }
      try {
        const saved = await readSecret<FieldSession>('session')
        if (!saved) { requestSessionRepair(); return }
        await hydrate(saved)
      } catch {
        lockVault()
        setGate('unlock')
      }
    })()
  }, [hydrate, requestSessionRepair, tabLock])

  const lockWorkspace = useCallback(async () => {
    if (gate !== 'ready' || !session) return
    lockingRef.current = true
    const queueFlush = queueWrite.current.catch(() => undefined).then(() => writeSecret('queue', queueRef.current))
    queueWrite.current = queueFlush
    try {
      await writeSecret('session', session)
      await queueFlush
      await persistDrafts(drafts)
    } finally {
      lockVault()
      queueRef.current = []
      archivedRef.current = []; setArchivedVisits([])
      setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setView('home'); setGate('unlock')
    }
  }, [drafts, gate, persistDrafts, queue, session])

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); void pendingDraftFlush.current?.(); return }
      if (shouldLockAfterBackground(hiddenAt.current, Date.now())) void lockWorkspace()
      hiddenAt.current = null
    }
    const pageHide = () => { void pendingDraftFlush.current?.() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pageHide)
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pageHide) }
  }, [lockWorkspace])

  const saveQueue = useCallback(async (update: QueuedVisit[] | ((current: QueuedVisit[]) => QueuedVisit[])) => {
    if (lockingRef.current) throw new Error('The workspace is locking.')
    let next: QueuedVisit[] = []
    const write = queueWrite.current.catch(() => undefined).then(async () => {
      next = typeof update === 'function' ? update(queueRef.current) : update
      await writeSecret('queue', next)
      queueRef.current = next
      setQueue(next)
    })
    queueWrite.current = write
    await write
    return next
  }, [])
  // Automatic callers pass only eligible UUIDs; manual "Sync all now" passes nothing and sends every queued visit.
  const syncQueue = useCallback(async (clientUuids?: string[]) => {
    const pending = clientUuids ? queueRef.current.filter((entry) => clientUuids.includes(entry.client_uuid)) : queueRef.current
    if (!session || !navigator.onLine || !pending.length || syncingRef.current || renewingLeaseRef.current) return
    syncingRef.current = true
    setSyncing(true)
    let accepted = 0
    let storageFailed = false
    try {
      for (const item of pending) {
        const record = { ...item }
        delete record.sync_error
        delete record.sync_attempted_at
        delete record.sync_error_kind
        delete record.sync_attempts
        try {
          await fieldApi.sync(session.token, [{ ...record, sync_source: 'offline_queue' }])
          await saveQueue((current) => current.filter((entry) => entry.client_uuid !== item.client_uuid)); accepted += 1
        } catch (error) {
          const status = (error as { response?: { status?: number } }).response?.status
          if (status === 401 || status === 403) {
            await writeSecret('session', session); await writeSecret('queue', queueRef.current); await persistDrafts(drafts)
            lockVault(); queueRef.current = []; setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setGate('attention'); return
          }
          const message = apiError(error, 'The server did not accept this visit. Review the error and retry it.')
          try {
            await saveQueue((current) => current.map((entry) => entry.client_uuid === item.client_uuid ? {
              ...entry, sync_error: message, sync_attempted_at: new Date().toISOString(),
              sync_error_kind: syncErrorKind(status), sync_attempts: (entry.sync_attempts ?? 0) + 1,
            } : entry))
          } catch {
            storageFailed = true
            setNotice({ kind: 'error', title: 'Device storage unavailable', message: 'The visit remains encrypted in the sync queue, but its latest error could not be saved. Keep this screen open and free device storage before retrying.' })
            break
          }
        }
      }
      if (!storageFailed && accepted) setNotice({ kind: 'success', title: 'Synchronization complete', message: `${accepted} queued visit${accepted === 1 ? '' : 's'} synchronized.` })
      else if (!storageFailed) setNotice({ kind: 'error', title: 'Synchronization needs attention', message: 'The visit remains encrypted on this device. Open Sync Queue to review the error and retry.' })
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [drafts, persistDrafts, saveQueue, session])

  useEffect(() => {
    const reconnected = online && !previousOnline.current
    previousOnline.current = online
    if (!online || gate !== 'ready') return
    if (reconnected && session) {
      renewingLeaseRef.current = true
      void (async () => {
        try {
          const lease = await fieldApi.renewLease(session.token)
          const renewed = applyRenewedLease(session, drafts, lease)
          setSession(renewed.session); setDrafts(renewed.drafts)
          await writeSecret('session', renewed.session); await persistDrafts(renewed.drafts)
          renewingLeaseRef.current = false
          await syncQueue(queueRef.current.filter((item) => shouldRetryOnReconnect(item)).map((item) => item.client_uuid))
        } catch (error) {
          const status = (error as { response?: { status?: number } }).response?.status
          if (status === 401 || status === 403) {
            await writeSecret('session', session); await writeSecret('queue', queueRef.current); await persistDrafts(drafts)
            lockVault(); queueRef.current = []; setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setGate('attention')
          }
        } finally { renewingLeaseRef.current = false }
      })()
      return
    }
    const now = Date.now()
    const due = queueRef.current.filter((item) => shouldAutoRetry(item, now))
    if (due.length) void syncQueue(due.map((item) => item.client_uuid))
  }, [drafts, gate, online, persistDrafts, queue, session, syncQueue])
  useEffect(() => { syncQueueRef.current = syncQueue }, [syncQueue])
  useEffect(() => {
    if (gate !== 'ready' || !online) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      const due = queueRef.current.filter((item) => shouldAutoRetry(item, now))
      if (due.length) void syncQueueRef.current(due.map((item) => item.client_uuid))
    }, SYNC_RETRY_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [gate, online])
  useEffect(() => {
    if (gate !== 'ready') return
    // Debounced: re-encrypting every draft on each keystroke or GPS fix drains low-end phones. Hiding the page flushes it.
    const save = () => persistDrafts(drafts).catch(() => setNotice({ kind: 'error', title: 'Device storage unavailable', message: 'Recent draft changes could not be secured. Keep this screen open and free device storage before continuing.' }))
    const timer = window.setTimeout(() => { pendingDraftFlush.current = null; void save() }, DRAFT_SAVE_DEBOUNCE_MS)
    pendingDraftFlush.current = () => { window.clearTimeout(timer); pendingDraftFlush.current = null; return save() }
    return () => { window.clearTimeout(timer); pendingDraftFlush.current = null }
  }, [drafts, gate, persistDrafts])
  useEffect(() => {
    if (!session) return
    const remaining = new Date(session.offline_lease.expires_at).getTime() - Date.now()
    if (remaining <= 0 || remaining > 2_147_483_647) return
    const timer = window.setTimeout(() => setLeaseClock(Date.now()), remaining + 1)
    return () => window.clearTimeout(timer)
  }, [session])
  useEffect(() => {
    const reconnected = online && !regulatoryOnline.current
    regulatoryOnline.current = online
    if (gate !== 'ready' || !session || !online) return
    let request = 0
    let cancelled = false
    let cached = bootstrap
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || lockingRef.current) return
      const current = ++request
      void refreshOperationalData(session.token)
      void (async () => {
        try {
          const fresh = mergeBootstrapDelta(cached, await fieldApi.bootstrap(session.token, cached.version))
          if (cancelled || current !== request || lockingRef.current) return
          await persistBootstrap(() => fresh, () => !cancelled && current === request && !lockingRef.current)
          if (cancelled || current !== request || lockingRef.current) return
          const previous = cached
          cached = fresh
          setNotice((notice) => notice?.title === 'Regulatory data unavailable' ? null : notice)
          // Carry identity across bulletin revisions, only for unfinished work. Captured references stay until reviewed.
          setDrafts((drafts) => drafts.map((draft) => draft.finalized_at ? draft : { ...draft, items: draft.items.map((item) => ({ ...item, commodity_key: item.commodity_key ?? previous.srp_bulletins.find((bulletin) => bulletin.id === item.srp_id)?.commodity_key })) }))
        } catch {
          if (!cancelled && current === request && !lockingRef.current) setNotice({ kind: 'warning', title: 'Regulatory data unavailable', message: 'Using saved protocol, prices and monitoring period. Your saved work is retained. Reconnect to refresh.' })
        }
      })()
    }
    if (reconnected) refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { cancelled = true; request++; window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer) }
  }, [gate, online, persistBootstrap, refreshOperationalData, session])

  const completeUnlock = useCallback(async (result: VaultUnlockResult) => {
    let saved: FieldSession | undefined
    try {
      saved = await readSecret<FieldSession>('session')
    } catch {
      requestSessionRepair()
      return
    }
    if (!saved) {
      requestSessionRepair()
      return
    }
    if (result.requiresPinMigration) { setSession(saved); setGate('migration'); return }
    try { await hydrate(saved) }
    catch (error) { showRecovery(error) }
  }, [hydrate, requestSessionRepair, showRecovery])

  const completeSessionRepair = useCallback(async (result: VaultUnlockResult) => {
    if (!session) return
    if (result.requiresPinMigration) { setGate('migration'); return }
    try {
      await writeSecret('session', session)
      setRepairingSession(false)
      await hydrate(session)
    } catch (error) { showRecovery(error) }
  }, [hydrate, session, showRecovery])

  const recoverUnreadableDrafts = async () => {
    if (!window.confirm('Archive the unreadable unfinished drafts and continue? These drafts will no longer appear in Current Work.')) return
    setRecoveringDrafts(true)
    try {
      await archiveUnreadableDrafts()
      setRecoveryIssue(null)
      setGate('unlock')
    } catch {
      setRecoveryIssue({ code: 'PW-WORK-ARCHIVE', detail: 'The unreadable drafts could not be archived safely.' })
    } finally { setRecoveringDrafts(false) }
  }

  const recoverUnreadableQueue = async () => {
    if (!window.confirm('Archive the unreadable upload queue and continue? Any preserved queued visits will remain backed up securely on this device.')) return
    setRecoveringQueue(true)
    try {
      await archiveUnreadableQueue()
      setRecoveryIssue(null)
      setGate('unlock')
    } catch {
      setRecoveryIssue({ code: 'PW-WORK-ARCHIVE', detail: 'The unreadable upload queue could not be archived safely.' })
    } finally { setRecoveringQueue(false) }
  }

  const leaseValid = session ? canFinalizeWithLease(session.offline_lease) : false
  const startVisit = (storeId?: number, verificationRequestId?: number) => {
    if (!session) return
    if (!leaseValid) { setNotice({ kind: 'warning', title: 'Authorization expired', message: 'Connect and unlock again before starting another official visit.' }); return }
    const next = createDraft(session.offline_lease.id, verificationRequestId)
    if (storeId) {
      const store = bootstrap.stores.find((item) => String(item.id) === String(storeId))
      next.store_id = storeId
      if (store) {
        next.store_name = store.store_name
        next.store_address = store.address
        Object.assign(next, applyRepresentativePrefill(next, store))
      }
      next.current_step = 1
    } else {
      next.current_step = 0
    }
    setDrafts((current) => [...current, next])
    setActiveDraftId(next.client_uuid)
    setVisitStep(storeId ? 1 : 0)
    setView('visit')
  }

  const discardDraft = (draftId: string, notify = true) => {
    setDrafts((current) => current.filter((item) => item.client_uuid !== draftId))
    if (activeDraftId === draftId) setActiveDraftId(null)
    if (notify) setNotice({ kind: 'info', title: 'Draft discarded', message: 'The unfinished monitoring visit was removed from this device.' })
    setMonitoringTab('work'); setView('monitoring')
  }

  const logoutWorkspace = () => {
    if (!session) return
    const blocked = logoutBlock(queue, drafts)
    if (blocked === 'queue') {
      setSignOutDialog({ type: 'queue-block', count: queue.length })
      return
    }
    if (blocked === 'draft') {
      const count = drafts.filter((d) => d.store_id !== null || d.items.length > 0).length || drafts.length
      setSignOutDialog({ type: 'draft-block', count })
      return
    }
    if (!navigator.onLine) {
      setSignOutDialog({ type: 'offline-block' })
      return
    }
    setSignOutDialog({ type: 'confirm' })
  }

  const executeLogout = async () => {
    setSignOutDialog(null)
    if (!session) return
    try {
      await fieldApi.logout(session.token)
      await clearVault()
      queueRef.current = []
      archivedRef.current = []
      setArchivedVisits([])
      setSession(null)
      setBootstrap(EMPTY_BOOTSTRAP)
      setQueue([])
      setDrafts([])
      setActiveDraftId(null)
      setView('home')
      setGate('login')
    } catch (error) {
      setNotice({ kind: 'error', title: 'Sign out failed', message: apiError(error, 'Sign out could not revoke this device session. Try again while online.') })
    }
  }

  const archiveRejectedVisit = async (clientUuid: string) => {
    const item = queueRef.current.find((entry) => entry.client_uuid === clientUuid)
    if (!item || item.sync_error_kind !== 'rejected') return
    if (!window.confirm('Archive this visit? The server refused it, so it will not be uploaded. The evidence stays encrypted only on this device and is deleted if you sign out.')) return
    try {
      // Archive first, then dequeue, both on the queue write chain, so the visit is never in neither list.
      const archive = queueWrite.current.catch(() => undefined).then(async () => {
        const next = [...archivedRef.current.filter((entry) => entry.client_uuid !== clientUuid), { ...item, archived_at: new Date().toISOString() }]
        await writeSecret('archived-visits', next)
        archivedRef.current = next
        setArchivedVisits(next)
      })
      queueWrite.current = archive
      await archive
      await saveQueue((current) => current.filter((entry) => entry.client_uuid !== clientUuid))
      setNotice({ kind: 'info', title: 'Visit archived on this device', message: 'It was removed from the upload queue. Report it to your supervisor.' })
    } catch {
      setNotice({ kind: 'error', title: 'Visit could not be archived', message: 'The visit remains in the sync queue. Free device storage and try again.' })
    }
  }

  const toggleBiometric = async () => {
    if (biometricEnabled) { await disableBiometricUnlock(); setBiometricEnabled(false); setNotice({ kind: 'success', title: 'Biometric unlock disabled', message: 'PIN unlock remains available.' }) }
    else { await enableBiometricUnlock(); setBiometricEnabled(true); setNotice({ kind: 'success', title: 'Biometric unlock enabled', message: 'PIN unlock remains available.' }) }
  }

  const closeGuide = () => {
    if (session) {
      try { localStorage.setItem(guideKey(session.user.id), 'complete') } catch { /* guide remains optional */ }
    }
    setGuideOpen(false)
    setGuideStep(0)
  }

  const updateDraft = (next: VisitDraft) => {
    setDrafts((current) => current.map((item) => item.client_uuid === next.client_uuid ? next : item))
  }
  const cacheRepresentative = async (store: import('./types').RepresentativeStore) => {
    if (lockingRef.current) throw new Error('Workspace is locking')
    await persistBootstrap((current) => ({ ...current, stores: current.stores.map((item) => item.id === store.id ? { ...item, owner_name: store.owner_name, current_representative: store.current_representative } : item) }), () => !lockingRef.current)
  }
  const claimVerification = async (request: FieldVerificationRequest) => {
    const existing = drafts.find((item) => item.verification_request_id === request.id)
    if (existing) { setActiveDraftId(existing.client_uuid); setVisitStep(existing.items.length ? 2 : existing.store_id ? 1 : 0); setView('visit'); return }
    if (!session) return
    startVisit(request.store.id, request.id)
  }
  const releaseVerification = async (request: FieldVerificationRequest) => {
    if (!session || !online) return
    try { await fieldApi.releaseVerification(session.token, request.id); await refreshOperationalData(session.token) }
    catch (error) { setNotice({ kind: 'error', title: 'Request could not be released', message: apiError(error, 'Refresh the verification queue and try again.') }) }
  }
  const readNotification = async (id: string) => {
    if (!session || !online) return
    try { const updated = await fieldApi.readNotification(session.token, id); const next = notifications.map((item) => item.id === id ? updated : item); setNotifications(next); await writeSecret('notifications', next) } catch { setNotificationState('unavailable') }
  }
  const readAllNotifications = async () => {
    if (!session || !online) return
    try { await fieldApi.readAllNotifications(session.token); const readAt = new Date().toISOString(); const next = notifications.map((item) => ({ ...item, read_at: item.read_at || readAt })); setNotifications(next); await writeSecret('notifications', next) } catch { setNotificationState('unavailable') }
  }
  const requestStartVisit = (storeId?: number) => {
    if (!storeId && view === 'visit' && visitStep === 0 && draft && isBlankDraft(draft)) return
    startVisit(storeId)
  }
  const navigate = (next: TopLevelView) => {
    if (view === 'visit' && draft && isBlankDraft(draft)) {
      setDrafts((current) => current.filter((item) => item.client_uuid !== draft.client_uuid))
      setActiveDraftId(null)
    }
    if (next === 'monitoring') setMonitoringTab('work')
    setView(next)
  }
  const chooseAnotherStore = (deleteCurrent: boolean) => {
    if (!session || !draft) return
    const next = createDraft(session.offline_lease.id)
    next.current_step = 0
    const keepCurrent = !deleteCurrent && hasDraftActivity(draft)
    setDrafts((current) => [...(keepCurrent ? current : current.filter((item) => item.client_uuid !== draft.client_uuid)), next])
    setActiveDraftId(next.client_uuid)
    setVisitStep(0)
  }
  const shellView: TopLevelView = view
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const actionableDrafts = drafts.filter(isActionableDraft)

  return (
    <>
      <InstallPrompt />
      <PwaUpdatePrompt />
      {tabLock === 'blocked' ? (
        <AuthShell contentKey="tab-blocked">
          <SecurityMessage title="Workspace already open" detail="PRICE-Watch Field is already open in another tab or window. Close it there, then check again." icon={<TriangleAlert />}>
            <button type="button" className="primary-button" onClick={() => { setTabLock('pending'); setTabLockAttempt((attempt) => attempt + 1) }}>Check again</button>
          </SecurityMessage>
        </AuthShell>
      ) : gate === 'checking' ? <StartupGate /> : gate !== 'ready' ? (
        <AuthShell contentKey={gate}>
          {gate === 'login' && <LoginForm onAuthenticated={(next) => { setRepairingSession(false); setSession(next); setGate('pin') }} />}
          {gate === 'repair-login' && <SecurityMessage title="Repair device session" detail="Sign in online to replace only the unreadable device session. Encrypted drafts and pending uploads will remain on this device." icon={<ShieldCheck />}><LoginForm onAuthenticated={(next) => { setSession(next); setGate('repair-unlock') }} /></SecurityMessage>}
          {gate === 'pin' && session && <PinSetup onDone={async (pin) => {
            await createVault(pin); await writeSecret('session', session)
            setBiometricAvailability(await getBiometricUnlockAvailability())
            setGate('biometric')
          }} />}
          {gate === 'biometric' && session && <BiometricSetup availability={biometricAvailability} onEnable={async () => { await enableBiometricUnlock(); await hydrate(session, false) }} onSkip={() => void hydrate(session, false)} />}
          {gate === 'unlock' && <Unlock onUnlocked={completeUnlock} />}
          {gate === 'repair-unlock' && <Unlock onUnlocked={completeSessionRepair} />}
          {gate === 'migration' && session && <PinSetup migration onDone={async (pin) => { await rewrapVaultPin(pin); if (repairingSession) { await writeSecret('session', session); setRepairingSession(false) } await hydrate(session) }} />}
          {gate === 'attention' && <SecurityMessage title="Workspace needs attention" detail="This account is no longer authorized online. Unresolved drafts and queued evidence remain encrypted on this device." icon={<TriangleAlert />}><button type="button" className="primary-button" onClick={() => setGate('unlock')}>Try device unlock again<LockKeyhole size={18} /></button></SecurityMessage>}
          {gate === 'recovery' && recoveryIssue && <SecurityMessage title="Encrypted field work needs recovery" detail={`${recoveryIssue.detail} Do not clear site data or reinstall the app. Support code: ${recoveryIssue.code}`} icon={<TriangleAlert />}>
            {(recoveryIssue.code === 'PW-WORK-DRAFTS' || recoveryIssue.code === 'PW-WORK-LEGACY') && <button type="button" className="primary-button" disabled={recoveringDrafts || recoveringQueue} onClick={() => void recoverUnreadableDrafts()}>{recoveringDrafts ? 'Archiving drafts…' : 'Archive unreadable drafts and continue'}</button>}
            {recoveryIssue.code === 'PW-WORK-QUEUE' && <button type="button" className="primary-button" disabled={recoveringDrafts || recoveringQueue} onClick={() => void recoverUnreadableQueue()}>{recoveringQueue ? 'Archiving queue…' : 'Archive unreadable queue and continue'}</button>}
            <button type="button" className="secondary-button" disabled={recoveringDrafts || recoveringQueue} onClick={() => { setRecoveryIssue(null); setGate('unlock') }}>Try device unlock again<LockKeyhole size={18} /></button>
          </SecurityMessage>}
        </AuthShell>
      ) : session ? (
        <FieldAppShell activeView={shellView} fullScreenMode={view === 'visit' && (visitStep > 0 || viewingRecord)} officerName={session.user.name} online={online} queueCount={queue.length} draftCount={actionableDrafts.length} unreadCount={unreadCount} authorizationValid={leaseValid} onNavigate={navigate} onStartVisit={() => requestStartVisit()} onNotifications={() => setNotificationsOpen(true)} onHelp={() => { setGuideStep(0); setGuideOpen(true) }} onLock={() => void lockWorkspace()}>
          {notice && <FieldToast notice={notice} onDismiss={dismissNotice} />}
          {!leaseValid && <div className="authorization-warning" role="alert"><TriangleAlert size={18} /><span><strong>Offline authorization expired</strong> Existing work is preserved. Connect and unlock again before starting or finalizing an official visit.</span></div>}
          {storagePersisted === false && (queue.length > 0 || actionableDrafts.length > 0 || archivedVisits.length > 0) && (
            <div className="authorization-warning" role="status"><TriangleAlert size={18} /><span>{queue.length > 0 || actionableDrafts.length > 0
              ? <><strong>Saved visits are at risk</strong> This device may clear saved visits. Connect and sync soon, or install the app to the home screen.</>
              : <><strong>Archived visits are at risk</strong> This device may clear archived visits that could not be uploaded. Install the app to the home screen and report them to your supervisor.</>}</span></div>
          )}
          {view === 'home' && (completion
            ? <CompletionSummary completion={completion} onViewStatus={() => { setCompletion(null); if (completion.status === 'queued') setMonitoringTab('sync'); setView(completion.status === 'accepted' ? 'history' : 'monitoring') }} onHome={() => setCompletion(null)} />
            : <HomePage name={session.user.name} bootstrap={bootstrap} queue={queue} completedToday={(bootstrap.accepted_today ?? 0) + completedToday} officerPosition={officerPosition} activeDraft={actionableDrafts[0] || null} online={online} authorizationValid={leaseValid} verificationCount={verificationRequests.length} draftCount={actionableDrafts.length} onStart={(storeId) => requestStartVisit(storeId)} onViewActivity={(tab) => { setMonitoringTab(tab); setView('monitoring') }} onViewHistory={() => setView('history')} />)}
          {view === 'monitoring' && <MonitoringPage key={monitoringTab} initialTab={monitoringTab} drafts={actionableDrafts} queue={queue} bootstrap={bootstrap} online={online} syncing={syncing} authorizationValid={leaseValid} requests={verificationRequests} requestsState={requestState} officerPosition={officerPosition} onResume={(draftId) => { const resumed = drafts.find((item) => item.client_uuid === draftId); if (!resumed) return; setActiveDraftId(draftId); const targetStep = typeof resumed.current_step === 'number' ? resumed.current_step : (resumed.signatures?.officer_png_base64 || (resumed.representative?.name && resumed.items.length > 0)) ? 2 : resumed.store_id ? 1 : 0; setVisitStep(targetStep); setView('visit') }} onStart={(storeId) => startVisit(storeId)} onDiscard={(draftId) => discardDraft(draftId)} archived={archivedVisits} onSync={() => void syncQueue()} onRetry={(uuid) => void syncQueue([uuid])} onArchive={(uuid) => void archiveRejectedVisit(uuid)} onStartAssigned={(request) => void claimVerification(request)} onRelease={(request) => void releaseVerification(request)} />}
          {view === 'visit' && draft && <VisitWizard key={draft.client_uuid} step={visitStep} onStep={(nextStep) => { setVisitStep(nextStep); setDrafts((current) => current.map((item) => item.client_uuid === draft.client_uuid ? { ...item, current_step: nextStep } : item)) }} draft={draft} bootstrap={bootstrap} token={session.token} onViewingChange={setViewingRecord} officerPosition={officerPosition} online={online} authorizationValid={leaseValid} onDraft={updateDraft} onCacheRepresentative={cacheRepresentative} onChooseStore={chooseAnotherStore} onFinish={async (finished) => {
            if (!canFinalizeWithLease(session.offline_lease)) throw new Error('Offline authorization expired. Connect before finalizing this visit.')
            await pendingDraftFlush.current?.()
            const storeName = bootstrap.stores.find((store) => store.id === finished.store_id)?.store_name || 'Completed visit'
            const queuedVisit = { ...finished, sync_source: navigator.onLine ? finished.sync_source : 'offline_queue' as const }
            let completionStatus: Completion['status'] = 'queued'
            // Claim the sync guard before the visit enters the queue, so automatic sync can't upload the same visit concurrently.
            const uploadNow = navigator.onLine && !syncingRef.current
            if (uploadNow) syncingRef.current = true
            try {
            await saveQueue((current) => current.some((item) => item.client_uuid === finished.client_uuid) ? current : [...current, queuedVisit])
            setCompletedToday((prev) => prev + 1)
            setDrafts((current) => current.filter((item) => item.client_uuid !== finished.client_uuid))
            if (uploadNow) {
              try { await fieldApi.sync(session.token, [queuedVisit]); await saveQueue((current) => current.filter((item) => item.client_uuid !== finished.client_uuid)); completionStatus = 'accepted'; setNotice({ kind: 'success', title: 'Visit accepted', message: 'The completed visit was added to monitoring history.' }) }
              catch (error) {
                const status = (error as { response?: { status?: number } }).response?.status
                // Same as queued sync: an unauthorized account keeps its evidence encrypted and loses the open workspace immediately.
                if (status === 401 || status === 403) {
                  await writeSecret('session', session); await writeSecret('queue', queueRef.current); await persistDrafts(drafts.filter((item) => item.client_uuid !== finished.client_uuid))
                  lockVault(); queueRef.current = []; setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setGate('attention')
                  return
                }
                const message = apiError(error, 'The server did not accept this visit. Review the error in Sync Queue and retry it.')
                try {
                  await saveQueue((current) => current.map((item) => item.client_uuid === finished.client_uuid ? { ...item, sync_source: 'offline_queue', sync_error: message, sync_attempted_at: new Date().toISOString(), sync_error_kind: syncErrorKind(status), sync_attempts: (item.sync_attempts ?? 0) + 1 } : item))
                  setNotice({ kind: status && status < 500 ? 'error' : 'warning', title: status && status < 500 ? 'Synchronization needs attention' : 'Visit queued securely', message })
                } catch {
                  setNotice({ kind: 'error', title: 'Device storage unavailable', message: 'The accepted visit remains in the encrypted sync queue, but its latest status could not be saved. Keep this screen open and free device storage before retrying.' })
                }
              }
            } else if (navigator.onLine) setNotice({ kind: 'info', title: 'Visit queued securely', message: 'Another upload is in progress. This visit will synchronize automatically shortly.' })
            else setNotice({ kind: 'success', title: 'Visit saved offline', message: 'The completed visit is encrypted and queued for synchronization.' })
            } finally {
              if (uploadNow) syncingRef.current = false
            }
            setActiveDraftId(null); setCompletion({ status: completionStatus, storeName }); setView('home')
          }} />}
          {view === 'history' && <HistoryPage session={session} online={online} />}
          {view === 'profile' && <ProfilePage session={session} online={online} biometricAvailability={biometricAvailability} biometricEnabled={biometricEnabled} onToggleBiometric={toggleBiometric} onChangePin={changeVaultPin} onReplayGuide={() => { setGuideStep(0); setGuideOpen(true) }} onLock={() => void lockWorkspace()} onLogout={() => void logoutWorkspace()} />}
          {guideOpen && <FirstUseGuide step={guideStep} onStep={setGuideStep} onClose={closeGuide} />}
          <NotificationDrawer open={notificationsOpen} online={online} state={notificationState} notifications={notifications} onClose={() => setNotificationsOpen(false)} onRead={(id) => void readNotification(id)} onReadAll={() => void readAllNotifications()} />
          {signOutDialog && (
            <div className="field-dialog-backdrop" role="presentation" onClick={() => setSignOutDialog(null)}>
              <section
                className="field-dialog field-signout-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="field-signout-dialog-title"
                onClick={(e) => e.stopPropagation()}
              >
                {signOutDialog.type === 'draft-block' && (
                  <>
                    <div className="field-signout-dialog-icon warning" aria-hidden="true">
                      <TriangleAlert size={26} />
                    </div>
                    <h2 id="field-signout-dialog-title">Cannot Sign Out</h2>
                    <div className="field-signout-dialog-body" role="alert">
                      <p>
                        Save or discard every unfinished visit in Current Work before signing out. You have <strong>{signOutDialog.count} unfinished {signOutDialog.count === 1 ? 'visit draft' : 'visit drafts'}</strong> on this device that must be resolved to prevent evidence loss.
                      </p>
                    </div>
                    <div className="field-dialog-actions">
                      <button type="button" className="secondary-button" autoFocus onClick={() => setSignOutDialog(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          setSignOutDialog(null)
                          setMonitoringTab('work')
                          setView('monitoring')
                        }}
                      >
                        Go to Current Work
                      </button>
                    </div>
                  </>
                )}

                {signOutDialog.type === 'queue-block' && (
                  <>
                    <div className="field-signout-dialog-icon warning" aria-hidden="true">
                      <TriangleAlert size={26} />
                    </div>
                    <h2 id="field-signout-dialog-title">Cannot Sign Out</h2>
                    <div className="field-signout-dialog-body" role="alert">
                      <p>
                        Synchronize all completed visits before signing out. You have <strong>{signOutDialog.count} completed {signOutDialog.count === 1 ? 'visit' : 'visits'}</strong> queued for upload on this device.
                      </p>
                    </div>
                    <div className="field-dialog-actions">
                      <button type="button" className="secondary-button" autoFocus onClick={() => setSignOutDialog(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          setSignOutDialog(null)
                          setMonitoringTab('sync')
                          setView('monitoring')
                        }}
                      >
                        Go to Sync Queue
                      </button>
                    </div>
                  </>
                )}

                {signOutDialog.type === 'offline-block' && (
                  <>
                    <div className="field-signout-dialog-icon info" aria-hidden="true">
                      <WifiOff size={26} />
                    </div>
                    <h2 id="field-signout-dialog-title">Internet Connection Required</h2>
                    <div className="field-signout-dialog-body" role="alert">
                      <p>
                        Connect to the internet to revoke this device session before signing out.
                      </p>
                    </div>
                    <div className="field-dialog-actions">
                      <button type="button" className="secondary-button" autoFocus onClick={() => setSignOutDialog(null)}>
                        Understood
                      </button>
                    </div>
                  </>
                )}

                {signOutDialog.type === 'confirm' && (
                  <>
                    <div className="field-signout-dialog-icon danger" aria-hidden="true">
                      <LogOut size={26} />
                    </div>
                    <h2 id="field-signout-dialog-title">Sign out of PRICE-Watch?</h2>
                    <div className="field-signout-dialog-body">
                      <p>
                        Are you sure you want to sign out? Your offline authorization lease and cached data will be cleared from this device. You will need internet access and your credentials to sign in again.
                      </p>
                      {archivedVisits.length > 0 && (
                        <p role="alert">
                          <strong>{archivedVisits.length} archived {archivedVisits.length === 1 ? 'visit' : 'visits'}</strong> that could not be uploaded will be permanently deleted from this device.
                        </p>
                      )}
                    </div>
                    <div className="field-dialog-actions">
                      <button type="button" className="secondary-button" autoFocus onClick={() => setSignOutDialog(null)}>
                        Stay signed in
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void executeLogout()}
                      >
                        Yes, sign out
                      </button>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </FieldAppShell>
      ) : null}
    </>
  )
}

function FieldToast({ notice, onDismiss }: { notice: FieldNotice; onDismiss: () => void }) {
  useEffect(() => {
    const delay = fieldNoticeDuration(notice.kind)
    if (!delay) return
    const timer = window.setTimeout(onDismiss, delay)
    return () => window.clearTimeout(timer)
  }, [notice, onDismiss])

  const Icon = notice.kind === 'success' ? CheckCircle2 : notice.kind === 'info' ? Info : TriangleAlert
  const urgent = notice.kind === 'warning' || notice.kind === 'error'
  return <div className={`field-toast ${notice.kind}`} role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'} aria-atomic="true">
    <span className="field-toast-icon" aria-hidden="true"><Icon /></span>
    <span className="field-toast-copy"><strong>{notice.title}</strong><small>{notice.message}</small></span>
    <button type="button" aria-label="Dismiss notification" onClick={onDismiss}><X /></button>
  </div>
}

function FirstUseGuide({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const pages = [
    {
      title: 'Welcome to Field Monitoring',
      detail: 'This workspace guides you through official store visits and protects unfinished or offline work on this device.',
    },
    {
      title: 'Know where your work lives',
      detail: 'Home summarizes readiness and the active protocol. Monitoring separates field verification requests, encrypted drafts, and visits waiting to synchronize. History contains visits accepted by the server. Open your avatar for device access and security.',
    },
    {
      title: 'Complete visits in three steps',
      detail: 'Choose a registered store, record only the prices you check, then review the signatures and location before finalizing.',
    },
  ]
  const page = pages[step] || pages[0]
  useEffect(() => {
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [step])
  return <div className="field-dialog-backdrop" role="presentation">
    <section className="field-dialog field-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="field-guide-title">
      <span className="field-guide-progress">{step + 1} of {pages.length}</span>
      <h2 id="field-guide-title" ref={titleRef} tabIndex={-1}>{page.title}</h2>
      <p>{page.detail}</p>
      <div className="field-dialog-actions">
        <button type="button" className="text-button" onClick={onClose}>Skip guide</button>
        <span />
        {step > 0 && <button type="button" className="secondary-button" onClick={() => onStep(step - 1)}>Back</button>}
        <button type="button" className="primary-button" onClick={() => step === pages.length - 1 ? onClose() : onStep(step + 1)}>
          {step === pages.length - 1 ? 'Finish guide' : 'Next'}
        </button>
      </div>
    </section>
  </div>
}

function StartupGate() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 400)
    return () => window.clearTimeout(timer)
  }, [])
  return <main className="field-startup-gate">
    {visible && <div className="field-startup-status" role="status">
      <img src="/branding/dti-logo.svg" alt="" />
      <span className="field-startup-spinner" aria-hidden="true" />
      <span>Opening secure workspace</span>
    </div>}
  </main>
}

function CompletionSummary({ completion, onViewStatus, onHome }: { completion: Completion; onViewStatus: () => void; onHome: () => void }) {
  const accepted = completion.status === 'accepted'
  return <div className="page field-page field-completion-page">
    <section className="field-completion-summary" role="status">
      <CheckCircle2 size={42} />
      <h1 tabIndex={-1}>{accepted ? 'Visit accepted' : 'Visit safely saved'}</h1>
      <p><strong>{completion.storeName}</strong></p>
      <p>{accepted
        ? 'The server accepted this visit and it is now available in History.'
        : 'The finalized visit is protected on this device and marked as pending upload. It will synchronize when a stable connection is available.'}</p>
      <div className="field-completion-actions">
        <button type="button" className="primary-button" onClick={onViewStatus}>View visit status</button>
        <button type="button" className="secondary-button" onClick={onHome}>Return Home</button>
      </div>
    </section>
  </div>
}


function PinSetup({ onDone, migration = false }: { onDone: (pin: string) => Promise<void>; migration?: boolean }) {
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const complete = async (next: string) => {
    if (next !== pin) {
      setError('PINs do not match. Re-enter the four digits.')
      setConfirm('')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onDone(pin)
    } catch (reason) {
      setError(apiError(reason, migration ? 'The PIN could not be updated. Your previous PIN still works.' : 'The secure vault could not be created.'))
      setConfirm('')
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'create' ? (migration ? 'Create a new 4-digit PIN' : 'Create device PIN') : 'Confirm device PIN'

  return (
    <SecurityMessage title={title} icon={<LockKeyhole />}>
      <form
        className="auth-form pin-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (step === 'create' && pin.length === 4) setStep('confirm')
          else if (step === 'confirm' && confirm.length === 4) void complete(confirm)
        }}
      >
        {step === 'create' ? (
          <DevicePinInput
            autoFocus
            disabled={busy}
            value={pin}
            onChange={(next) => {
              setError('')
              setPin(next)
              if (next.length === 4) setStep('confirm')
            }}
          />
        ) : (
          <DevicePinInput
            autoFocus
            disabled={busy}
            label="Confirm 4-digit device PIN"
            value={confirm}
            onChange={(next) => {
              setError('')
              setConfirm(next)
              if (next.length === 4) void complete(next)
            }}
          />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </SecurityMessage>
  )
}

function biometricCompatibility(availability: Exclude<BiometricAvailability, 'available'>) {
  if (availability === 'browser-unsupported') return { title: 'Biometric unlock needs a newer browser', detail: 'Use Chrome or Edge 133 or newer, then reopen PRICE-Watch from its secure HTTPS address. Your device PIN remains available.' }
  if (availability === 'platform-authenticator-unavailable') return { title: 'Set up biometrics on this device', detail: 'No enrolled fingerprint or facial verification is available to this browser. Set it up in your device settings, then try again. Your PIN remains available.' }
  return { title: 'Biometric vault unlock is not supported', detail: 'This device can verify your identity, but its authenticator cannot provide the encrypted key required by PRICE-Watch. Continue with your device PIN.' }
}

function BiometricSetup({ availability, onEnable, onSkip }: { availability: BiometricAvailability; onEnable: () => Promise<void>; onSkip: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (availability !== 'available') {
    const compatibility = biometricCompatibility(availability)
    return (
      <SecurityMessage title={compatibility.title} detail={compatibility.detail} icon={<Fingerprint />}>
        <div className="auth-form">
          <button type="button" className="login-btn auth-continue-pin-btn" onClick={onSkip}>
            <span>Continue with PIN</span>
            <LockKeyhole size={18} />
          </button>
        </div>
      </SecurityMessage>
    )
  }

  return (
    <SecurityMessage
      title="Enable device biometric unlock"
      detail="Use this device's fingerprint or facial verification to unlock faster. Your device PIN always remains available as backup."
      icon={<Fingerprint />}
    >
      <div className="auth-form">
        <button
          type="button"
          className="login-btn auth-biometric-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await onEnable()
            } catch (reason) {
              setError(apiError(reason, 'Biometric unlock could not be enabled. You can continue with the PIN.'))
            } finally {
              setBusy(false)
            }
          }}
        >
          <Fingerprint size={19} />
          <span>{busy ? 'Waiting for device…' : 'Enable biometric unlock'}</span>
        </button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="text-button auth-skip-btn" disabled={busy} onClick={onSkip}>
          Not now — use PIN
        </button>
      </div>
    </SecurityMessage>
  )
}

function Unlock({ onUnlocked }: { onUnlocked: (result: VaultUnlockResult) => Promise<void> }) {
  const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [compatibilityNote, setCompatibilityNote] = useState(''); const [busy, setBusy] = useState(false); const [opening, setOpening] = useState<'pin' | 'biometric' | null>(null); const [canReturnToChoices, setCanReturnToChoices] = useState(false); const [mode, setMode] = useState<'checking' | 'biometric' | 'choices' | 'pin'>('checking')
  const biometricAttempt = useRef<Promise<void> | null>(null); const automaticAttempted = useRef(false)
  const finishBiometric = useCallback(() => {
    if (biometricAttempt.current) return biometricAttempt.current
    setMode('biometric'); setBusy(true); setError('')
    const attempt = (async () => { try { const result = await unlockVaultWithBiometrics(); setOpening('biometric'); await onUnlocked(result) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Biometric unlock failed. Use the device PIN.'); setMode('choices') } finally { setBusy(false); setOpening(null) } })()
    biometricAttempt.current = attempt
    void attempt.finally(() => { if (biometricAttempt.current === attempt) biometricAttempt.current = null })
    return attempt
  }, [onUnlocked])
  useEffect(() => {
    let cancelled = false
    void Promise.all([hasBiometricUnlock(), getBiometricUnlockAvailability(), getVaultPinLength()]).then(([enabled, availability, pinLength]) => {
      if (cancelled) return
      if (enabled && availability === 'available' && (pinLength === null || pinLength === 4)) {
        if (!automaticAttempted.current) { automaticAttempted.current = true; void finishBiometric() }
      } else {
        if (enabled && availability !== 'available') setCompatibilityNote(biometricCompatibility(availability).detail)
        setMode('pin')
      }
    })
    return () => { cancelled = true }
  }, [finishBiometric])
  const finishPin = async (nextPin: string) => { if (!/^\d{4}$/.test(nextPin) || busy) return; setBusy(true); setError(''); try { const result = await unlockVault(nextPin); setOpening('pin'); await onUnlocked(result) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unlock failed.'); setPin('') } finally { setBusy(false); setOpening(null) } }
  return <SecurityMessage title="Unlock field workspace" detail={mode === 'biometric' || mode === 'checking' ? 'Confirm your identity using this device.' : undefined} icon={mode === 'biometric' || mode === 'checking' ? <Fingerprint /> : <LockKeyhole />} hideIcon={mode !== 'pin'}>
    {(mode === 'biometric' || mode === 'checking') && <div className="biometric-wait" role="status"><span className="biometric-pulse"><Fingerprint /></span><strong>{opening === 'biometric' ? 'Device verified. Opening secure workspace…' : busy ? 'Waiting for device verification…' : 'Checking biometric enrollment…'}</strong></div>}
    {mode === 'choices' && <div className="auth-form unlock-choices-container"><div className="unlock-choices-card"><button type="button" className="unlock-choice-btn unlock-choice-bio" disabled={busy} onClick={() => void finishBiometric()}><span className="unlock-choice-icon-wrap"><Fingerprint size={28} /></span><span className="unlock-choice-label">Try biometric again</span></button><div className="unlock-choices-divider" /><button type="button" className="unlock-choice-btn unlock-choice-pin" onClick={() => { setPin(''); setError(''); setCanReturnToChoices(true); setMode('pin') }}><span className="unlock-choice-icon-wrap"><LockKeyhole size={28} /></span><span className="unlock-choice-label">Use device PIN</span></button></div>{error && <p className="form-error" role="alert">{error}</p>}</div>}
    {mode === 'pin' && <div className="auth-form pin-form">
      <DevicePinInput autoFocus disabled={busy} length={4} label="4-digit device PIN" value={pin} onChange={(next) => { setError(''); setPin(next); if (next.length === 4) void finishPin(next) }} />
      {opening === 'pin' && <p className="compatibility-note" role="status">PIN verified. Opening secure workspace…</p>}
      {canReturnToChoices && <button type="button" className="text-button pin-back-button" disabled={busy} onClick={() => { setPin(''); setError(''); setCanReturnToChoices(false); setMode('choices') }}><ArrowLeft size={17} />Back to unlock options</button>}
      {compatibilityNote && <p className="compatibility-note" role="status">{compatibilityNote}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </SecurityMessage>
}

function SecurityMessage({ title, detail, icon, children, hideIcon }: { title: string; detail?: string; icon: React.ReactNode; children?: React.ReactNode; hideIcon?: boolean }) { return <div className="security-content"><span className={`security-icon ${hideIcon ? 'security-icon-hidden' : ''}`} aria-hidden="true">{hideIcon ? null : icon}</span><h2>{title}</h2>{detail && <p>{detail}</p>}{children}</div> }
interface VisitWizardProps {
  onCacheRepresentative: (store: import('./types').RepresentativeStore) => Promise<void>
  step: number
  onStep: (step: number) => void
  draft: VisitDraft
  bootstrap: BootstrapData
  token: string
  onViewingChange: (viewing: boolean) => void
  officerPosition: GeoPosition | null
  online: boolean
  authorizationValid: boolean
  onDraft: (draft: VisitDraft) => void
  onChooseStore: (deleteCurrent: boolean) => void
  onFinish: (draft: VisitDraft) => Promise<void>
}

function VisitWizard({
  onCacheRepresentative,
  step,
  onStep,
  draft,
  bootstrap,
  token,
  onViewingChange,
  officerPosition,
  online,
  authorizationValid,
  onDraft,
  onChooseStore,
  onFinish,
}: VisitWizardProps) {
  const cadence = bootstrap.monitoring_period?.cadence ?? 'weekly'
  const routineStatusOf = (store: StoreRecord): 'due' | 'completed' => {
    if (store.routine_status) return store.routine_status
    return store.weekly_routine_status === 'monitored_this_week' ? 'completed' : 'due'
  }
  const [query, setQuery] = useState('')
  const [routineStatus, setRoutineStatus] = useState<'all' | 'due' | 'completed'>('all')
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [signingReady, setSigningReady] = useState(false)
  const [gpsRetryVisible, setGpsRetryVisible] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [pendingFinalDraft, setPendingFinalDraft] = useState<VisitDraft | null>(null)
  // View-only access to a store already monitored this period. Never touches the draft.
  const [viewOnlyStore, setViewOnlyStore] = useState<StoreRecord | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState('')
  const [viewStale, setViewStale] = useState(false)
  const [viewRecord, setViewRecord] = useState<RoutineRecordView | null>(null)
  const viewRequestRef = useRef(0)
  useEffect(() => () => { viewRequestRef.current += 1 }, [])
  useEffect(() => {
    onViewingChange(Boolean(viewRecord))
    return () => onViewingChange(false)
  }, [onViewingChange, viewRecord])
  const periodWord = cadence === 'daily' ? 'today' : 'this week'

  const closeViewOnly = () => {
    viewRequestRef.current += 1
    setViewOnlyStore(null); setViewLoading(false); setViewError(''); setViewStale(false)
  }
  const proceedToViewing = async () => {
    if (!viewOnlyStore) return
    const requestId = ++viewRequestRef.current
    setViewLoading(true); setViewError(''); setViewStale(false)
    try {
      const record = await fieldApi.currentRoutineRecord(token, viewOnlyStore.id, bootstrap.monitoring_period)
      if (requestId !== viewRequestRef.current) return
      if (!record) { setViewStale(true); return }
      setViewOnlyStore(null)
      setViewRecord(record)
    } catch (err) {
      if (requestId === viewRequestRef.current) setViewError(apiError(err, 'The submitted visit could not be loaded.'))
    } finally {
      if (requestId === viewRequestRef.current) setViewLoading(false)
    }
  }

  const steps = ['Choose Store', 'Record Prices', 'Review & Sign']

  const stores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return bootstrap.stores
      .filter((store) => `${store.store_name} ${store.address}`.toLowerCase().includes(normalizedQuery))
      .filter((store) => routineStatus === 'all' || routineStatusOf(store) === routineStatus)
      .map((store) => ({
        ...store,
        distanceKm: officerPosition && Number.isFinite(store.latitude) && Number.isFinite(store.longitude)
          && (store.latitude !== 0 || store.longitude !== 0)
          ? haversineKm(officerPosition.latitude, officerPosition.longitude, store.latitude, store.longitude)
          : null,
      }))
      .sort((left, right) => {
        const leftRank = routineStatusOf(left) === 'due' ? 0 : 1
        const rightRank = routineStatusOf(right) === 'due' ? 0 : 1
        return leftRank - rightRank || left.store_name.localeCompare(right.store_name)
      })
  }, [bootstrap.stores, officerPosition, query, routineStatus])
  const selectedStore = bootstrap.stores.find((store) => String(store.id) === String(draft.store_id))
  // This store's last verified price per comparable commodity — the second basis the officer is reviewed against.
  // Keyed exactly as the server grouped the payload, so one entry exists per commodity even across SRP revisions.
  //
  // Withheld rather than guessed when the payload cannot be trusted: a cache taken before comparable_since existed
  // carries observations chosen under the old unbounded window (that is how a month-old price produced a +81%
  // reading), and a cache whose monitoring period has closed was filtered against a window that has since moved.
  // In both cases the rows are shown as no comparable record until a refresh, never as a comparison.
  const previousPrices = useMemo(() => {
    const since = bootstrap.comparable_since ? Date.parse(bootstrap.comparable_since) : NaN
    const periodEnds = bootstrap.monitoring_period?.ends_at ? Date.parse(bootstrap.monitoring_period.ends_at) : NaN
    if (Number.isNaN(since) || Number.isNaN(periodEnds) || Date.now() >= periodEnds) return new Map<string, number | null>()
    return new Map<string, number | null>(bootstrap.recent_prices
      .filter((price) => String(price.store_id) === String(draft.store_id)
        && price.comparability_key !== undefined
        && Date.parse(price.inspection_timestamp) >= since)
      .map((price) => [price.comparability_key as string, Number(price.recorded_price)]))
  }, [bootstrap.recent_prices, bootstrap.comparable_since, bootstrap.monitoring_period?.ends_at, draft.store_id])
  const missingRequirements = canFinalizeVisit(draft)
  const referencesChanged = changedVisitReferences(draft, bootstrap)
  useEffect(() => {
    if (referencesChanged) { setSigningReady(false); setConfirmFinalize(false); setPendingFinalDraft(null) }
  }, [referencesChanged, bootstrap])

  // The issued reference must travel with the price: leases require a snapshot, and sync refuses visits without one.
  const handleUpdatePrice = (srpId: number, recordedPrice: number | null, reference?: ReferenceSnapshot) => {
    if (recordedPrice === null || !Number.isFinite(recordedPrice) || recordedPrice <= 0) {
      onDraft({
        ...draft,
        items: draft.items.filter((item) => item.srp_id !== srpId),
      })
    } else {
      const without = draft.items.filter((item) => item.srp_id !== srpId)
      onDraft({
        ...draft,
        items: [...without, { srp_id: srpId, commodity_key: bootstrap.srp_bulletins.find((bulletin) => bulletin.id === srpId)?.commodity_key, recorded_price: recordedPrice, ...(reference ? { reference_snapshot: reference } : {}) }],
      })
    }
    setError('')
  }

  const captureLocation = async () => {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 15000,
      })
    })
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy_meters: pos.coords.accuracy,
      captured_at: new Date().toISOString(),
    }
  }

  const retryLocation = async () => {
    setError('')
    setFinishing(true)
    try {
      const location = await captureLocation()
      onDraft({ ...draft, location })
      if (location.accuracy_meters > 100) {
        setError('Location accuracy must be within 100 metres. Move to an open area and choose Redo GPS scan.')
        return
      }
      setGpsRetryVisible(false)
    } catch {
      setError('Location could not be captured. Enable location access, then choose Redo GPS scan.')
    } finally {
      setFinishing(false)
    }
  }

  const requestFinish = async () => {
    setError('')
    if (referencesChanged) { setError('Review and refresh changed monitoring references before signing.'); return }
    if (!signingReady) { setError('Confirm the representative name and role before signing and finalizing.'); return }
    const missing = canFinalizeVisit(draft).filter((issue) => !issue.startsWith('Capture the visit location') && !issue.startsWith('Location accuracy'))
    if (missing.length) {
      setError(missing.join(' '))
      if (!draft.store_id) onStep(0)
      else if (!draft.items.length || draft.items.some((item) => !item.reference_snapshot)) onStep(1)
      return
    }

    let finalLocation = draft.location
    if (!finalLocation || finalLocation.accuracy_meters > 100) {
      try {
        setFinishing(true)
        finalLocation = await captureLocation()
        onDraft({ ...draft, location: finalLocation })
      } catch {
        setFinishing(false)
        setGpsRetryVisible(true)
        return setError('Location could not be captured. Enable location access, then choose Redo GPS scan.')
      }
    }
    if (finalLocation.accuracy_meters > 100) {
      setFinishing(false)
      setGpsRetryVisible(true)
      return setError('Location accuracy must be within 100 metres. Move to an open area and choose Redo GPS scan.')
    }
    setGpsRetryVisible(false)
    setFinishing(false)
    setPendingFinalDraft({ ...draft, location: finalLocation, finalized_at: new Date().toISOString() })
    setConfirmFinalize(true)
  }

  const confirmFinish = async () => {
    if (referencesChanged) { setConfirmFinalize(false); setError('Review and refresh changed monitoring references before signing.'); return }
    if (!pendingFinalDraft) return
    try {
      setFinishing(true)
      await onFinish(pendingFinalDraft)
    } catch (err) {
      setError(apiError(err, 'Unable to finalize visit.'))
    } finally {
      setFinishing(false)
      setConfirmFinalize(false)
    }
  }

  if (viewRecord) return <ReadOnlyVisit record={viewRecord} onClose={() => setViewRecord(null)} />

  return (
    <div className="visit-page">
      {referencesChanged && <div className="field-inline-alert" role="alert">
        <p>Monitoring references changed or are unavailable. Review the current references below before signing. Refresh keeps entered prices and clears both signatures and signer confirmation. Products no longer listed must be reselected.</p>
        <ul>{draft.items.map((item) => { const current = bootstrap.monitoring_references?.find((reference) => item.commodity_key ? reference.commodity_key === item.commodity_key : reference.srp_id === item.srp_id); return <li key={item.srp_id}>{bootstrap.srp_bulletins.find((bulletin) => bulletin.id === (current?.srp_id ?? item.srp_id))?.commodity_name ?? `Commodity #${item.srp_id}`}: {item.reference_snapshot?.value ?? 'Unavailable'} → {current?.value ?? 'Unavailable'} ({current?.label ?? 'Reference unavailable'})</li> })}</ul>
        <button type="button" className="secondary-button" onClick={() => { onDraft(refreshVisitReferences(draft, bootstrap)); setSigningReady(false); setConfirmFinalize(false); setPendingFinalDraft(null); setError('') }}>Review and refresh references</button>
      </div>}
      {step > 0 && <div className="visit-top-bar">
        <div className="visit-top-left">
          <button
            type="button"
            className="visit-back-btn"
            aria-label="Back to Choose Store"
            onClick={() => {
              if (hasDraftActivity(draft)) {
                setConfirmExit(true)
              } else {
                onStep(0)
              }
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Choose Store</span>
          </button>
          <div className="visit-top-store-title">
            <strong title={selectedStore?.store_name || draft.store_name || 'Store Visit'}>
              {selectedStore?.store_name || draft.store_name || 'Store Visit'}
            </strong>
          </div>
        </div>
        <div className="visit-top-actions">
          <span className={`network-chip ${online ? 'online' : ''}`}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            {online ? 'Online' : 'Offline capture'}
          </span>
        </div>
      </div>}

      {/* Row 2: Classic Circle Stepper Wizard */}
      <ol className="stepper">
        {steps.map((label, index) => (
          <li
            key={label}
            className={index === step ? 'current' : index < step ? 'done' : ''}
          >
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>

      <section className="visit-workspace">
        {/* Step 1: Select Store */}
        {step === 0 && (
          <div className="step-content store-step-content">
            <h2>Choose a store</h2>

            <div className="store-search-filter-row">
              <div className="search-box">
                <Search size={18} />
                <input
                  aria-label="Search establishments"
                  placeholder="Search establishment name or address"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && <button type="button" className="store-search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}
              </div>
              <div className="store-filter-dropdown-wrap">
                <label htmlFor="store-routine-select" className="sr-only">Routine status</label>
                <select
                  id="store-routine-select"
                  aria-label="Routine status"
                  value={routineStatus}
                  onChange={(event) => setRoutineStatus(event.target.value as typeof routineStatus)}
                >
                  <option value="all">All</option>
                  <option value="due">{cadence === 'daily' ? 'Due Today' : 'Not Yet Monitored'}</option>
                  <option value="completed">{cadence === 'daily' ? 'Monitored Today' : 'Monitored This Week'}</option>
                </select>
              </div>
            </div>

            <div className="store-pills-filter" role="group" aria-label="Filter stores by routine status">
              <button
                type="button"
                className={`store-pill-btn ${routineStatus === 'all' ? 'active' : ''}`}
                onClick={() => setRoutineStatus('all')}
                aria-pressed={routineStatus === 'all'}
              >
                All
              </button>
              <button
                type="button"
                className={`store-pill-btn ${routineStatus === 'due' ? 'active' : ''}`}
                onClick={() => setRoutineStatus('due')}
                aria-pressed={routineStatus === 'due'}
              >
                {cadence === 'daily' ? 'Due Today' : 'Not Yet Monitored'}
              </button>
              <button
                type="button"
                className={`store-pill-btn ${routineStatus === 'completed' ? 'active' : ''}`}
                onClick={() => setRoutineStatus('completed')}
                aria-pressed={routineStatus === 'completed'}
              >
                {cadence === 'daily' ? 'Monitored Today' : 'Monitored This Week'}
              </button>
            </div>

            <div className="store-results-summary" aria-live="polite">
              {stores.length} {stores.length === 1 ? 'store' : 'stores'} · Routine priority
            </div>
            {stores.length ? (
              <div className="store-list">
                {stores.map((store) => (
                  <button
                    type="button"
                    className="store-selection-card"
                    key={store.id}
                    aria-label={routineStatusOf(store) === 'completed' ? `View ${store.store_name}, already monitored ${periodWord}` : `Choose ${store.store_name} to record prices`}
                    onClick={() => {
                      if (routineStatusOf(store) === 'completed') { setViewOnlyStore(store); return }
                      onDraft({
                        ...applyRepresentativePrefill(draft, store),
                        store_id: store.id,
                        store_name: store.store_name,
                        store_address: store.address,
                        current_step: 1,
                      })
                      setError('')
                      onStep(1)
                    }}
                  >
                    <span className="store-card-fallback" aria-hidden="true"><Building2 /></span>
                    {store.image_path && (
                      <img
                        src={store.image_path}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => { event.currentTarget.hidden = true }}
                      />
                    )}
                    <span className="store-card-shade" aria-hidden="true" />
                    {store.distanceKm !== null && (
                      <span className="store-distance-pill"><MapPin aria-hidden="true" />{formatDistance(store.distanceKm)}</span>
                    )}
                    <span className="store-card-copy">
                      <strong>{store.store_name}</strong>
                      <small>{store.address}</small>
                      <span className="store-status-row"><span>{routineStatusOf(store) === 'completed' ? (cadence === 'daily' ? 'Monitored Today' : 'Monitored This Week') : (cadence === 'daily' ? 'Due Today' : 'Not Yet Monitored')}</span></span>
                      {!store.latest_routine_monitoring_at && store.has_prior_routine_monitoring === false && <small>No previous routine visits</small>}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="store-empty-state">
                <Building2 aria-hidden="true" />
                <strong>No stores found</strong>
                <p>Try another establishment name or address.</p>
                {query && (
                  <button
                    type="button"
                    className="secondary-button store-empty-clear-btn"
                    onClick={() => setQuery('')}
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Monitoring Form & Review Matrix */}
        {step === 1 && (
          <div className="step-content dti-step-content">
            <DtiMonitoringSheet
              store={selectedStore}
              draft={draft}
              bulletins={bootstrap.srp_bulletins}
              protocol={bootstrap.protocol}
              regulatoryPrices={bootstrap.regulatory_prices}
              monitoringReferences={bootstrap.monitoring_references}
              previousPrices={previousPrices}
              onUpdatePrice={handleUpdatePrice}
              onPrevious={() => {
                setError('')
                if (hasDraftActivity(draft)) {
                  setConfirmExit(true)
                } else {
                  onStep(0)
                }
              }}
              onProceedToReview={() => {
                if (!draft.items.length) {
                  setError('Add at least one commodity price.')
                  return
                }
                setError('')
                onStep(2)
              }}
            />
          </div>
        )}

        {/* Step 3: Review and sign */}
        {step === 2 && (
          <div className="step-content signatures-step-content">
            <h2>Store Representative & Dual Signatures</h2>
            <p>Enter on-duty personnel details and secure dual official signatures.</p>
            <RepresentativeReview draft={draft} store={selectedStore} token={token} online={online} onDraft={onDraft} onCache={onCacheRepresentative} onReady={(ready) => setSigningReady(ready && !referencesChanged)} />

            <fieldset className="signature-gate" disabled={!signingReady}>
            <div className="signature-grid">
              <SignaturePad
                disabled={!signingReady}
                label="Store representative signature"
                value={draft.signatures.representative_png_base64}
                onChange={(value) => {
                  onDraft({
                    ...draft,
                    signatures: { ...draft.signatures, representative_png_base64: value },
                  })
                  setError('')
                }}
              />
              <SignaturePad
                disabled={!signingReady}
                label="DTI field monitoring officer"
                value={draft.signatures.officer_png_base64}
                onChange={(value) => {
                  onDraft({
                    ...draft,
                    signatures: { ...draft.signatures, officer_png_base64: value },
                  })
                  setError('')
                }}
              />
            </div>

            </fieldset>

            <div className="final-checks">
              <FinalCheck
                okay={draft.items.length > 0}
                label={`${draft.items.length} commodity line${draft.items.length === 1 ? '' : 's'} recorded`}
              />
              <FinalCheck
                okay={Boolean(draft.signatures.officer_png_base64 && draft.signatures.representative_png_base64)}
                label="Dual signatures secured"
              />
              <FinalCheck
                okay={Boolean(draft.location && draft.location.accuracy_meters <= 100)}
                label={
                  draft.location
                    ? `GPS Location locked (${draft.location.latitude.toFixed(4)}, ${draft.location.longitude.toFixed(4)} · ±${Math.round(draft.location.accuracy_meters)}m)`
                    : 'Acquiring high-precision GPS lock…'
                }
              />
            </div>

            {(!draft.location ? gpsRetryVisible : draft.location.accuracy_meters > 100) && (
              <button
                type="button"
                className="secondary-button field-location-action"
                disabled={finishing}
                onClick={() => void retryLocation()}
              >
                <LocateFixed size={17} />
                Redo GPS scan
              </button>
            )}

            {missingRequirements.length > 0 && (
              <div className="field-missing-requirements" aria-live="polite">
                <strong>Required before finalizing</strong>
                <ul>{missingRequirements.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              </div>
            )}

            {!online && (
              <div className="submission-mode">
                <CloudOff />
                <span>
                  <strong>Secure to encrypted offline vault</strong>
                  <small>Encrypted with AES-256 GCM in local device vault until reconnected.</small>
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="form-error visit-error" role="alert">
            <TriangleAlert size={17} />
            {error}
          </p>
        )}

        {step === 2 && (
          <div className="dti-floating-bottom-bar">
            <div className="dti-floating-bottom-bar-inner dti-signatures-bar-inner">
              <button
                type="button"
                className="secondary-button bottom-prev-btn"
                aria-label="Back to Record Prices"
                onClick={() => {
                  setError('')
                  onStep(1)
                }}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button
                type="button"
                className="primary-button proceed-review-btn"
                aria-label={!authorizationValid ? 'Authorization expired' : finishing ? 'Securing visit…' : online ? 'Finalize and submit' : 'Finalize and save offline'}
                disabled={finishing || !authorizationValid || !signingReady}
                onClick={() => void requestFinish()}
              >
                <span>
                  {!authorizationValid
                    ? 'Authorization expired'
                    : finishing
                      ? 'Securing visit…'
                      : 'Submit'}
                </span>
                <ShieldCheck size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      {viewOnlyStore && createPortal(
        <div className="field-dialog-backdrop" role="presentation" onClick={closeViewOnly}>
          <section
            className="field-dialog field-discard-dialog field-view-only-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-view-only-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="field-view-only-title">Already monitored {periodWord}</h2>
            {viewStale ? (
              <p role="status">No visit has been submitted for <strong>{viewOnlyStore.store_name}</strong> in the current period. Your store list is out of date; it refreshes the next time the app reloads its data online.</p>
            ) : (
              <p><strong>{viewOnlyStore.store_name}</strong> was already monitored {periodWord}. You can open the submitted visit in view-only mode; it can't be edited.</p>
            )}
            {!online && !viewStale && <p className="field-view-only-note">Connect to the internet to view the submitted visit.</p>}
            {viewError && <p className="form-error" role="alert">{viewError}</p>}
            <div className="field-dialog-actions">
              <button type="button" className="secondary-button" autoFocus onClick={closeViewOnly}>Go back</button>
              {!viewStale && (
                <button type="button" className="primary-button" disabled={!online || viewLoading} onClick={() => void proceedToViewing()}>
                  {viewLoading ? 'Opening…' : 'Proceed to viewing'}
                </button>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
      {confirmExit && (
        <div className="field-dialog-backdrop" role="presentation">
          <section className="field-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-visit-title">
            <h2 id="exit-visit-title">Choose another store?</h2>
            <p>Keep this visit unchanged in Current Work, delete it, or continue editing.</p>
            <div className="field-dialog-actions visit-exit-actions">
              <button
                type="button"
                className="secondary-button visit-exit-continue"
                autoFocus
                aria-label="Continue editing"
                onClick={() => setConfirmExit(false)}
              >
                Continue
              </button>
              <div className="visit-exit-right-group">
                <button
                  type="button"
                  className="primary-button"
                  aria-label="Save draft and choose store"
                  onClick={() => onChooseStore(false)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="danger-button"
                  aria-label="Delete draft and choose store"
                  onClick={() => onChooseStore(true)}
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {confirmFinalize && (
        <div className="field-dialog-backdrop" role="presentation">
          <section className="field-dialog" role="dialog" aria-modal="true" aria-labelledby="finalize-title">
            <h2 id="finalize-title">Finalize this visit?</h2>
            <p>After finalization, the signatures, recorded prices, and location cannot be edited.</p>
            <div className="field-dialog-actions">
              <button type="button" className="secondary-button" autoFocus disabled={finishing} onClick={() => setConfirmFinalize(false)}>Go back</button>
              <button type="button" className="primary-button" disabled={finishing} onClick={() => void confirmFinish()}>{finishing ? 'Finalizing…' : 'Confirm finalization'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function FinalCheck({ okay, label }: { okay: boolean; label: string }) {
  return (
    <div className={okay ? 'okay' : ''}>
      {okay ? <CheckCircle2 /> : <span className="open-check" />}
      <span>{label}</span>
    </div>
  )
}
