import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Building2, Check, CheckCircle2, ChevronLeft, Info,
  CloudOff, LocateFixed, LockKeyhole, MapPin,
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
import { apiError, fieldApi } from './services/fieldApi'
import { canFinalizeVisit, createDraft, isBlankDraft } from './app/workflow'
import {
  clearVault, createVault, deleteSecret, disableBiometricUnlock, enableBiometricUnlock,
  getBiometricUnlockAvailability, getVaultPinLength, hasBiometricUnlock, hasVault, lockVault, readSecret,
  requestPersistentStorage, restoreVaultSession, rewrapVaultPin, unlockVault, unlockVaultWithBiometrics, writeSecret,
} from './app/vault'
import type { BiometricAvailability, VaultUnlockResult } from './app/vault'
import { applyRenewedLease, canFinalizeWithLease, logoutBlock, shouldLockAfterBackground } from './app/sessionPolicy'
import type { BootstrapData, FieldNotification, FieldSession, FieldVerificationRequest, GeoPosition, QueuedVisit, VisitDraft } from './types'

type Gate = 'checking' | 'login' | 'pin' | 'biometric' | 'unlock' | 'repair-login' | 'repair-unlock' | 'migration' | 'attention' | 'recovery' | 'ready'
type View = TopLevelView | 'visit'
type Completion = { status: 'accepted' | 'queued'; storeName: string }
type FieldNotice = { kind: 'success' | 'info' | 'warning' | 'error'; title: string; message: string }
type RecoveryIssue = { code: string; detail: string }
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
const EMPTY_BOOTSTRAP: BootstrapData = {
  version: '',
  is_delta: false,
  stores: [],
  srp_bulletins: [],
  recent_prices: [],
}

export default function App() {
  const [gate, setGate] = useState<Gate>('checking')
  const [session, setSession] = useState<FieldSession | null>(null)
  const [repairingSession, setRepairingSession] = useState(false)
  const [recoveryIssue, setRecoveryIssue] = useState<RecoveryIssue | null>(null)
  const [bootstrap, setBootstrap] = useState(EMPTY_BOOTSTRAP)
  const [queue, setQueue] = useState<QueuedVisit[]>([])
  const [view, setView] = useState<View>('home')
  const [drafts, setDrafts] = useState<VisitDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [visitStep, setVisitStep] = useState(0)
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
  const [monitoringTab, setMonitoringTab] = useState<'verification' | 'work' | 'sync'>('verification')
  const [, setLeaseClock] = useState(0)
  const hiddenAt = useRef<number | null>(null)
  const previousOnline = useRef(online)
  const queueRef = useRef<QueuedVisit[]>([])
  const queueWrite = useRef<Promise<void>>(Promise.resolve())
  const draftWrite = useRef<Promise<void>>(Promise.resolve())
  const syncingRef = useRef(false)
  const lockingRef = useRef(false)
  const draft = drafts.find((item) => item.client_uuid === activeDraftId) || null
  const dismissNotice = useCallback(() => setNotice(null), [])
  const persistDrafts = useCallback(async (next: VisitDraft[]) => {
    const write = draftWrite.current.catch(() => undefined).then(() => writeSecret('drafts', next))
    draftWrite.current = write
    await write
  }, [])
  const requestSessionRepair = useCallback(() => {
    lockVault()
    setSession(null)
    setRepairingSession(true)
    setGate('repair-login')
  }, [])

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
    const [cached, cachedQueue, cachedDrafts, cachedRequests, cachedNotifications] = await Promise.all([
      readCachedSecret<BootstrapData>('bootstrap'),
      readRequiredSecret<QueuedVisit[]>('queue', { code: 'PW-WORK-QUEUE', detail: 'The encrypted upload queue could not be opened.' }),
      readRequiredSecret<VisitDraft[]>('drafts', { code: 'PW-WORK-DRAFTS', detail: 'Encrypted unfinished visits could not be opened.' }),
      readCachedSecret<FieldVerificationRequest[]>('verification-requests'),
      readCachedSecret<FieldNotification[]>('notifications'),
    ])
    const legacyDraft = cachedDrafts === undefined
      ? await readRequiredSecret<VisitDraft>('active-draft', { code: 'PW-WORK-LEGACY', detail: 'An encrypted unfinished visit from an earlier version could not be opened.' })
      : undefined
    let effectiveSession = next
    let effectiveDrafts = cachedDrafts ?? (legacyDraft ? [legacyDraft] : [])
    if (cachedDrafts === undefined && legacyDraft) {
      await persistDrafts(effectiveDrafts)
      try { await deleteSecret('active-draft') } catch { /* canonical copy is already secured */ }
    }
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
    void requestPersistentStorage()
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
        const downloaded = await fieldApi.bootstrap(effectiveSession.token)
        if (lockingRef.current) return
        setBootstrap(downloaded)
        await writeSecret('bootstrap', downloaded)
      } catch {
        if (!lockingRef.current) setNotice({ kind: 'warning', title: 'Online refresh unavailable', message: 'Saved field data is open. Reconnect to refresh authorization and reference data.' })
        return
      }
      if (!lockingRef.current) await refreshOperationalData(effectiveSession.token)
    })()
  }, [persistDrafts, refreshOperationalData])

  const showRecovery = useCallback((error: unknown) => {
    lockVault()
    setSession(null)
    setRecoveryIssue(error instanceof WorkspaceIntegrityError
      ? error.issue
      : { code: 'PW-WORK-STORAGE', detail: 'The encrypted field workspace could not be opened safely.' })
    setGate('recovery')
  }, [])

  // Auto-bind accurate background GPS position to active draft with zero delay
  useEffect(() => {
    if (draft && officerPosition && officerPosition.accuracy_meters <= 150) {
      if (!draft.location || officerPosition.accuracy_meters < draft.location.accuracy_meters) {
        setDrafts((current) => current.map((item) => item.client_uuid === draft.client_uuid ? {
          ...item,
          location: {
            latitude: officerPosition.latitude,
            longitude: officerPosition.longitude,
            accuracy_meters: officerPosition.accuracy_meters,
            captured_at: new Date().toISOString(),
          },
        } : item))
      }
    }
  }, [draft, officerPosition])

  useEffect(() => {
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
  }, [hydrate, requestSessionRepair])

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
      setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setView('home'); setGate('unlock')
    }
  }, [drafts, gate, persistDrafts, queue, session])

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return }
      if (shouldLockAfterBackground(hiddenAt.current, Date.now())) void lockWorkspace()
      hiddenAt.current = null
    }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
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
  const syncQueue = useCallback(async (clientUuid?: string) => {
    const pending = queueRef.current
    if (!session || !navigator.onLine || !pending.length || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    let accepted = 0
    let storageFailed = false
    try {
      for (const item of pending.filter((entry) => !clientUuid || entry.client_uuid === clientUuid)) {
        const record = { ...item }
        delete record.sync_error
        delete record.sync_attempted_at
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
            await saveQueue((current) => current.map((entry) => entry.client_uuid === item.client_uuid ? { ...entry, sync_error: message, sync_attempted_at: new Date().toISOString() } : entry))
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
      void (async () => {
        try {
          const lease = await fieldApi.renewLease(session.token)
          const renewed = applyRenewedLease(session, drafts, lease)
          setSession(renewed.session); setDrafts(renewed.drafts)
          await writeSecret('session', renewed.session); await persistDrafts(renewed.drafts)
          await syncQueue()
        } catch (error) {
          const status = (error as { response?: { status?: number } }).response?.status
          if (status === 401 || status === 403) {
            await writeSecret('session', session); await writeSecret('queue', queueRef.current); await persistDrafts(drafts)
            lockVault(); queueRef.current = []; setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setGate('attention')
          }
        }
      })()
      return
    }
    if (queue.some((item) => !item.sync_attempted_at)) void syncQueue()
  }, [drafts, gate, online, persistDrafts, queue, session, syncQueue])
  useEffect(() => {
    if (gate !== 'ready') return
    void persistDrafts(drafts).catch(() => setNotice({ kind: 'error', title: 'Device storage unavailable', message: 'Recent draft changes could not be secured. Keep this screen open and free device storage before continuing.' }))
  }, [drafts, gate, persistDrafts])
  useEffect(() => {
    if (!session) return
    const remaining = new Date(session.offline_lease.expires_at).getTime() - Date.now()
    if (remaining <= 0 || remaining > 2_147_483_647) return
    const timer = window.setTimeout(() => setLeaseClock(Date.now()), remaining + 1)
    return () => window.clearTimeout(timer)
  }, [session])
  useEffect(() => {
    if (gate !== 'ready' || !session || !online) return
    const refresh = () => { if (document.visibilityState === 'visible') void refreshOperationalData(session.token) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer) }
  }, [gate, online, refreshOperationalData, session])

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

  const leaseValid = session ? canFinalizeWithLease(session.offline_lease) : false
  const startVisit = (storeId?: number, verificationRequestId?: number) => {
    if (!session) return
    if (!leaseValid) { setNotice({ kind: 'warning', title: 'Authorization expired', message: 'Connect and unlock again before starting another official visit.' }); return }
    const next = createDraft(session.offline_lease.id, verificationRequestId)
    if (storeId) next.store_id = storeId
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

  const logoutWorkspace = async () => {
    if (!session) return
    const blocked = logoutBlock(queue, drafts)
    if (blocked === 'queue') { setNotice({ kind: 'warning', title: 'Uploads still pending', message: 'Synchronize all completed visits before signing out.' }); return }
    if (blocked === 'draft') { setNotice({ kind: 'warning', title: 'Unfinished visits remain', message: 'Save or discard every unfinished visit in Current Work before signing out.' }); setMonitoringTab('work'); setView('monitoring'); return }
    if (!navigator.onLine) { setNotice({ kind: 'warning', title: 'Internet connection required', message: 'Connect to the internet to revoke this device session before signing out.' }); return }
    try {
      await fieldApi.logout(session.token)
      await clearVault(); queueRef.current = []; setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDrafts([]); setActiveDraftId(null); setView('home'); setGate('login')
    } catch (error) { setNotice({ kind: 'error', title: 'Sign out failed', message: apiError(error, 'Sign out could not revoke this device session. Try again while online.') }) }
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
  const claimVerification = async (request: FieldVerificationRequest) => {
    const existing = drafts.find((item) => item.verification_request_id === request.id)
    if (existing) { setActiveDraftId(existing.client_uuid); setVisitStep(existing.items.length ? 2 : existing.store_id ? 1 : 0); setView('visit'); return }
    if (!session || !online) return
    try {
      if (request.status === 'open') await fieldApi.claimVerification(session.token, request.id)
      startVisit(request.store.id, request.id)
      await refreshOperationalData(session.token)
    } catch (error) { setNotice({ kind: 'error', title: 'Request unavailable', message: apiError(error, 'Another officer may have claimed this verification request. Refresh and try again.') }) }
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
    if (view === 'visit' && visitStep === 0 && draft && isBlankDraft(draft)) {
      setDrafts((current) => current.filter((item) => item.client_uuid !== draft.client_uuid))
      setActiveDraftId(null)
    }
    if (next === 'monitoring') setMonitoringTab('verification')
    setView(next)
  }
  const chooseAnotherStore = (deleteCurrent: boolean) => {
    if (!session || !draft) return
    const next = createDraft(session.offline_lease.id)
    setDrafts((current) => [...(deleteCurrent ? current.filter((item) => item.client_uuid !== draft.client_uuid) : current), next])
    setActiveDraftId(next.client_uuid)
    setVisitStep(0)
  }
  const shellView: TopLevelView = view
  const unreadCount = notifications.filter((item) => !item.read_at).length

  return (
    <>
      <InstallPrompt />
      <PwaUpdatePrompt />
      {gate === 'checking' ? <StartupGate /> : gate !== 'ready' ? (
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
          {gate === 'recovery' && recoveryIssue && <SecurityMessage title="Encrypted field work needs recovery" detail={`${recoveryIssue.detail} Do not clear site data or reinstall the app. Support code: ${recoveryIssue.code}`} icon={<TriangleAlert />}><button type="button" className="primary-button" onClick={() => { setRecoveryIssue(null); setGate('unlock') }}>Try device unlock again<LockKeyhole size={18} /></button></SecurityMessage>}
        </AuthShell>
      ) : session ? (
        <FieldAppShell activeView={shellView} fullScreenMode={view === 'visit' && visitStep > 0} officerName={session.user.name} online={online} queueCount={queue.length} draftCount={drafts.length} unreadCount={unreadCount} authorizationValid={leaseValid} onNavigate={navigate} onStartVisit={() => requestStartVisit()} onNotifications={() => setNotificationsOpen(true)} onHelp={() => { setGuideStep(0); setGuideOpen(true) }} onLock={() => void lockWorkspace()}>
          {notice && <FieldToast notice={notice} onDismiss={dismissNotice} />}
          {!leaseValid && <div className="authorization-warning" role="alert"><TriangleAlert size={18} /><span><strong>Offline authorization expired</strong> Existing work is preserved. Connect and unlock again before starting or finalizing an official visit.</span></div>}
          {view === 'home' && (completion
            ? <CompletionSummary completion={completion} onViewStatus={() => { setCompletion(null); if (completion.status === 'queued') setMonitoringTab('sync'); setView(completion.status === 'accepted' ? 'history' : 'monitoring') }} onHome={() => setCompletion(null)} />
            : <HomePage name={session.user.name} bootstrap={bootstrap} queue={queue} completedToday={(bootstrap.accepted_today ?? 0) + completedToday} officerPosition={officerPosition} activeDraft={drafts[0] || null} online={online} authorizationValid={leaseValid} verificationCount={verificationRequests.length} draftCount={drafts.length} onStart={(storeId) => requestStartVisit(storeId)} onViewActivity={(tab) => { setMonitoringTab(tab); setView('monitoring') }} />)}
          {view === 'monitoring' && <MonitoringPage key={monitoringTab} initialTab={monitoringTab} drafts={drafts} queue={queue} bootstrap={bootstrap} online={online} syncing={syncing} authorizationValid={leaseValid} requests={verificationRequests} requestsState={requestState} officerPosition={officerPosition} onResume={(draftId) => { const resumed = drafts.find((item) => item.client_uuid === draftId); if (!resumed) return; setActiveDraftId(draftId); setVisitStep(resumed.items.length ? 2 : resumed.store_id ? 1 : 0); setView('visit') }} onStart={(storeId) => startVisit(storeId)} onDiscard={(draftId) => discardDraft(draftId)} onSync={() => void syncQueue()} onRetry={(uuid) => void syncQueue(uuid)} onClaim={(request) => void claimVerification(request)} onRelease={(request) => void releaseVerification(request)} />}
          {view === 'visit' && draft && <VisitWizard key={draft.client_uuid} step={visitStep} onStep={setVisitStep} draft={draft} bootstrap={bootstrap} officerPosition={officerPosition} online={online} authorizationValid={leaseValid} onDraft={updateDraft} onChooseStore={chooseAnotherStore} onFinish={async (finished) => {
            if (!canFinalizeWithLease(session.offline_lease)) throw new Error('Offline authorization expired. Connect before finalizing this visit.')
            const storeName = bootstrap.stores.find((store) => store.id === finished.store_id)?.store_name || 'Completed visit'
            const queuedVisit = { ...finished, sync_source: navigator.onLine ? finished.sync_source : 'offline_queue' as const }
            await saveQueue((current) => current.some((item) => item.client_uuid === finished.client_uuid) ? current : [...current, queuedVisit])
            setCompletedToday((prev) => prev + 1)
            setDrafts((current) => current.filter((item) => item.client_uuid !== finished.client_uuid))
            let completionStatus: Completion['status'] = 'queued'
            if (navigator.onLine) {
              try { await fieldApi.sync(session.token, [queuedVisit]); await saveQueue((current) => current.filter((item) => item.client_uuid !== finished.client_uuid)); completionStatus = 'accepted'; setNotice({ kind: 'success', title: 'Visit accepted', message: 'The completed visit was added to monitoring history.' }) }
              catch (error) {
                const status = (error as { response?: { status?: number } }).response?.status
                const message = apiError(error, 'The server did not accept this visit. Review the error in Sync Queue and retry it.')
                try {
                  await saveQueue((current) => current.map((item) => item.client_uuid === finished.client_uuid ? { ...item, sync_source: 'offline_queue', sync_error: message, sync_attempted_at: new Date().toISOString() } : item))
                  setNotice({ kind: status && status < 500 ? 'error' : 'warning', title: status && status < 500 ? 'Synchronization needs attention' : 'Visit queued securely', message })
                } catch {
                  setNotice({ kind: 'error', title: 'Device storage unavailable', message: 'The accepted visit remains in the encrypted sync queue, but its latest status could not be saved. Keep this screen open and free device storage before retrying.' })
                }
              }
            } else setNotice({ kind: 'success', title: 'Visit saved offline', message: 'The completed visit is encrypted and queued for synchronization.' })
            setActiveDraftId(null); setCompletion({ status: completionStatus, storeName }); setView('home')
          }} />}
          {view === 'history' && <HistoryPage session={session} online={online} />}
          {view === 'profile' && <ProfilePage session={session} online={online} biometricAvailability={biometricAvailability} biometricEnabled={biometricEnabled} onToggleBiometric={toggleBiometric} onReplayGuide={() => { setGuideStep(0); setGuideOpen(true) }} onLock={() => void lockWorkspace()} onLogout={() => void logoutWorkspace()} />}
          {guideOpen && <FirstUseGuide step={guideStep} onStep={setGuideStep} onClose={closeGuide} />}
          <NotificationDrawer open={notificationsOpen} online={online} state={notificationState} notifications={notifications} onClose={() => setNotificationsOpen(false)} onRead={(id) => void readNotification(id)} onReadAll={() => void readAllNotifications()} />
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
  return <SecurityMessage title="Unlock field workspace" detail={mode === 'biometric' || mode === 'checking' ? 'Confirm your identity using this device.' : undefined} icon={mode === 'biometric' || mode === 'checking' ? <Fingerprint /> : <LockKeyhole />}>
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

function SecurityMessage({ title, detail, icon, children }: { title: string; detail?: string; icon: React.ReactNode; children?: React.ReactNode }) { return <div className="security-content"><span className="security-icon" aria-hidden="true">{icon}</span><h2>{title}</h2>{detail && <p>{detail}</p>}{children}</div> }
interface VisitWizardProps {
  step: number
  onStep: (step: number) => void
  draft: VisitDraft
  bootstrap: BootstrapData
  officerPosition: GeoPosition | null
  online: boolean
  authorizationValid: boolean
  onDraft: (draft: VisitDraft) => void
  onChooseStore: (deleteCurrent: boolean) => void
  onFinish: (draft: VisitDraft) => Promise<void>
}

function VisitWizard({
  step,
  onStep,
  draft,
  bootstrap,
  officerPosition,
  online,
  authorizationValid,
  onDraft,
  onChooseStore,
  onFinish,
}: VisitWizardProps) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [gpsRetryVisible, setGpsRetryVisible] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [pendingFinalDraft, setPendingFinalDraft] = useState<VisitDraft | null>(null)

  const steps = ['Choose Store', 'Record Prices', 'Review & Sign']

  const stores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return bootstrap.stores
      .filter((store) => `${store.store_name} ${store.address}`.toLowerCase().includes(normalizedQuery))
      .map((store) => ({
        ...store,
        distanceKm: officerPosition && Number.isFinite(store.latitude) && Number.isFinite(store.longitude)
          && (store.latitude !== 0 || store.longitude !== 0)
          ? haversineKm(officerPosition.latitude, officerPosition.longitude, store.latitude, store.longitude)
          : null,
      }))
      .sort((left, right) => {
        if (left.distanceKm !== null && right.distanceKm !== null) {
          return left.distanceKm - right.distanceKm || left.store_name.localeCompare(right.store_name)
        }
        if (left.distanceKm !== null) return -1
        if (right.distanceKm !== null) return 1
        return left.store_name.localeCompare(right.store_name)
      })
  }, [bootstrap.stores, officerPosition, query])
  const selectedStore = bootstrap.stores.find((store) => store.id === draft.store_id)
  const missingRequirements = canFinalizeVisit(draft)

  const handleUpdatePrice = (srpId: number, recordedPrice: number | null) => {
    if (recordedPrice === null || !Number.isFinite(recordedPrice) || recordedPrice <= 0) {
      onDraft({
        ...draft,
        items: draft.items.filter((item) => item.srp_id !== srpId),
      })
    } else {
      const without = draft.items.filter((item) => item.srp_id !== srpId)
      onDraft({
        ...draft,
        items: [...without, { srp_id: srpId, recorded_price: recordedPrice }],
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
    const missing = canFinalizeVisit(draft).filter((issue) => !issue.startsWith('Capture the visit location') && !issue.startsWith('Location accuracy'))
    if (missing.length) {
      setError(missing.join(' '))
      if (!draft.store_id) onStep(0)
      else if (!draft.items.length) onStep(1)
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

  return (
    <div className="visit-page">
      {step > 0 && <div className="visit-top-bar">
        <button type="button" className="visit-back-btn" aria-label="Back to Choose Store" onClick={() => setConfirmExit(true)}>
          <ArrowLeft size={16} />
          <span>Back to Choose Store</span>
        </button>
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
            <p>Select the establishment you are visiting.</p>
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
            <div className="store-results-summary" aria-live="polite">
              {stores.length} {stores.length === 1 ? 'store' : 'stores'} · {officerPosition ? 'Nearest first' : 'A–Z'}
            </div>
            {stores.length ? (
              <div className="store-list">
                {stores.map((store) => (
                  <button
                    type="button"
                    className="store-selection-card"
                    key={store.id}
                    aria-label={`Choose ${store.store_name} to record prices`}
                    onClick={() => {
                      onDraft({ ...draft, store_id: store.id })
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
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="store-empty-state">
                <Building2 aria-hidden="true" />
                <strong>No stores found</strong>
                <p>Try another establishment name or address.</p>
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
              onUpdatePrice={handleUpdatePrice}
              onPrevious={() => {
                setError('')
                setConfirmExit(true)
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
          <div className="step-content">
            <div className="representative-fields">
              <label>
                Store representative name
                <input
                  placeholder="e.g. Juan Dela Cruz"
                  value={draft.representative.name}
                  onChange={(event) => {
                    onDraft({
                      ...draft,
                      representative: { ...draft.representative, name: event.target.value },
                    })
                    setError('')
                  }}
                />
              </label>
              <label>
                Position / Title (optional)
                <input
                  placeholder="e.g. Store Manager, Cashier, Owner"
                  value={draft.representative.title}
                  onChange={(event) =>
                    onDraft({
                      ...draft,
                      representative: { ...draft.representative, title: event.target.value },
                    })
                  }
                />
              </label>
            </div>

            <div className="signature-grid">
              <SignaturePad
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
          <div className="wizard-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setError('')
                onStep(1)
              }}
            >
              <ChevronLeft size={17} />
              <span>Previous (Prices)</span>
            </button>
            <span />
            <button
                type="button"
                className="primary-button"
                disabled={finishing || !authorizationValid}
                onClick={() => void requestFinish()}
              >
                {!authorizationValid
                  ? 'Authorization expired'
                  : finishing
                    ? 'Securing visit…'
                    : online
                      ? 'Finalize and submit'
                      : 'Finalize and save offline'}
                <ShieldCheck size={18} />
            </button>
          </div>
        )}
      </section>
      {confirmExit && (
        <div className="field-dialog-backdrop" role="presentation">
          <section className="field-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-visit-title">
            <h2 id="exit-visit-title">Choose another store?</h2>
            <p>Keep this visit unchanged in Current Work, delete it, or continue editing.</p>
            <div className="field-dialog-actions visit-exit-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmExit(false)}>Continue editing</button>
              <span />
              <button type="button" className="danger-button" onClick={() => onChooseStore(true)}>Delete draft and choose store</button>
              <button type="button" className="primary-button" onClick={() => onChooseStore(false)}>Save draft and choose store</button>
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
              <button type="button" className="secondary-button" disabled={finishing} onClick={() => setConfirmFinalize(false)}>Go back</button>
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
