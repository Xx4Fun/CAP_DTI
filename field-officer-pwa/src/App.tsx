import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Building2, Check, CheckCircle2, ChevronLeft,
  ChevronRight, CloudOff, LocateFixed, LockKeyhole,
  Fingerprint, Plus, Search, ShieldCheck,
  TriangleAlert, Wifi, WifiOff, X
} from 'lucide-react'
import { InstallPrompt } from './components/InstallPrompt'
import { LoginForm } from './components/Login'
import { AuthShell } from './components/AuthShell'
import { DevicePinInput } from './components/DevicePinInput'
import { FieldAppShell, type TopLevelView } from './components/FieldAppShell'
import { ActivityPage, HistoryPage, HomePage, ProfilePage } from './components/FieldPages'
import { SignaturePad } from './components/SignaturePad'
import { apiError, fieldApi } from './services/fieldApi'
import { canFinalizeVisit, createDraft, analyzeLine } from './app/workflow'
import {
  clearVault, createVault, deleteSecret, disableBiometricUnlock, enableBiometricUnlock,
  getBiometricUnlockAvailability, getVaultPinLength, hasBiometricUnlock, hasVault, lockVault, readSecret,
  restoreVaultSession, rewrapVaultPin, unlockVault, unlockVaultWithBiometrics, writeSecret,
} from './app/vault'
import type { BiometricAvailability, VaultUnlockResult } from './app/vault'
import { applyRenewedLease, canFinalizeWithLease, logoutBlock, shouldLockAfterBackground } from './app/sessionPolicy'
import type { BootstrapData, Bulletin, FieldSession, VisitDraft } from './types'

type Gate = 'checking' | 'login' | 'pin' | 'biometric' | 'unlock' | 'migration' | 'attention' | 'ready'
type View = TopLevelView | 'visit'
const EMPTY_BOOTSTRAP: BootstrapData = { version: '', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] }

export default function App() {
  const [gate, setGate] = useState<Gate>('checking')
  const [session, setSession] = useState<FieldSession | null>(null)
  const [bootstrap, setBootstrap] = useState(EMPTY_BOOTSTRAP)
  const [queue, setQueue] = useState<VisitDraft[]>([])
  const [view, setView] = useState<View>('home')
  const [draft, setDraft] = useState<VisitDraft | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')
  const [biometricAvailability, setBiometricAvailability] = useState<BiometricAvailability>('browser-unsupported')
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const hydrate = useCallback(async (next: FieldSession, renewOnline = true) => {
    const cached = await readSecret<BootstrapData>('bootstrap')
    const cachedQueue = await readSecret<VisitDraft[]>('queue')
    const cachedDraft = await readSecret<VisitDraft>('active-draft')
    let effectiveSession = next
    let effectiveDraft = cachedDraft || null
    if (navigator.onLine && renewOnline) {
      try {
        const lease = await fieldApi.renewLease(next.token)
        const renewed = applyRenewedLease(next, effectiveDraft, lease)
        effectiveSession = renewed.session
        effectiveDraft = renewed.draft
        await writeSecret('session', effectiveSession)
        if (effectiveDraft) await writeSecret('active-draft', effectiveDraft)
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status
        if (status === 401 || status === 403) {
          lockVault(); setGate('attention'); return
        }
        if (!cached || !canFinalizeWithLease(next.offline_lease)) throw error
      }
    }
    setSession(effectiveSession)
    if (cached) setBootstrap(cached)
    if (cachedQueue) setQueue(cachedQueue)
    if (effectiveDraft) setDraft(effectiveDraft)
    if (navigator.onLine) {
      try {
        const downloaded = await fieldApi.bootstrap(effectiveSession.token)
        setBootstrap(downloaded); await writeSecret('bootstrap', downloaded)
      } catch (error) { if (!cached) throw error }
    }
    setBiometricAvailability(await getBiometricUnlockAvailability())
    setBiometricEnabled(await hasBiometricUnlock())
    setGate('ready')
  }, [])

  useEffect(() => {
    void (async () => {
      if (!await hasVault()) { setGate('login'); return }
      if (!await restoreVaultSession()) { setGate('unlock'); return }
      try {
        const saved = await readSecret<FieldSession>('session')
        if (!saved) { lockVault(); setGate('attention'); return }
        await hydrate(saved)
      } catch {
        lockVault()
        setGate('unlock')
      }
    })()
  }, [hydrate])

  const lockWorkspace = useCallback(async () => {
    if (gate !== 'ready' || !session) return
    try {
      await writeSecret('session', session)
      await writeSecret('queue', queue)
      if (draft) await writeSecret('active-draft', draft)
    } finally {
      lockVault()
      setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDraft(null); setView('home'); setGate('unlock')
    }
  }, [draft, gate, queue, session])

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return }
      if (shouldLockAfterBackground(hiddenAt.current, Date.now())) void lockWorkspace()
      hiddenAt.current = null
    }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [lockWorkspace])

  const saveQueue = async (next: VisitDraft[]) => { setQueue(next); await writeSecret('queue', next) }
  const syncQueue = useCallback(async () => {
    if (!session || !navigator.onLine || !queue.length || syncing) return
    setSyncing(true)
    try {
      await fieldApi.sync(session.token, queue.map((item) => ({ ...item, sync_source: 'offline_queue' })))
      await saveQueue([]); setNotice(`${queue.length} queued visit${queue.length === 1 ? '' : 's'} synchronized.`)
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 401 || status === 403) {
        await writeSecret('session', session); await writeSecret('queue', queue)
        if (draft) await writeSecret('active-draft', draft)
        lockVault(); setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setDraft(null); setGate('attention')
      } else setNotice(apiError(error, 'Queued visits remain safely on this device. Try sync again when the connection is stable.'))
    }
    finally { setSyncing(false) }
  }, [draft, queue, session, syncing])

  useEffect(() => { if (online && gate === 'ready') void syncQueue() }, [online, gate, syncQueue])
  useEffect(() => { if (gate === 'ready' && draft) void writeSecret('active-draft', draft) }, [draft, gate])

  const completeUnlock = useCallback(async (result: VaultUnlockResult) => {
    const saved = await readSecret<FieldSession>('session')
    if (!saved) { lockVault(); setGate('attention'); return }
    if (result.requiresPinMigration) { setSession(saved); setGate('migration'); return }
    await hydrate(saved)
  }, [hydrate])

  if (gate !== 'ready') return <AuthShell contentKey={gate}>
    {gate === 'checking' && <SecurityMessage title="Opening secure workspace" detail="Checking this device…" icon={<ShieldCheck />} />}
    {gate === 'login' && <LoginForm onAuthenticated={(next) => { setSession(next); setGate('pin') }} />}
    {gate === 'pin' && session && <PinSetup onDone={async (pin) => {
      await createVault(pin); await writeSecret('session', session)
      setBiometricAvailability(await getBiometricUnlockAvailability())
      setGate('biometric')
    }} />}
    {gate === 'biometric' && session && <BiometricSetup availability={biometricAvailability} onEnable={async () => { await enableBiometricUnlock(); await hydrate(session, false) }} onSkip={() => void hydrate(session, false)} />}
    {gate === 'unlock' && <Unlock onUnlocked={completeUnlock} />}
    {gate === 'migration' && session && <PinSetup migration onDone={async (pin) => { await rewrapVaultPin(pin); await hydrate(session) }} />}
    {gate === 'attention' && <SecurityMessage title="Workspace needs attention" detail="This account is no longer authorized online. Unresolved drafts and queued evidence remain encrypted on this device." icon={<TriangleAlert />}><button type="button" className="primary-button" onClick={() => setGate('unlock')}>Try device unlock again<LockKeyhole size={18} /></button></SecurityMessage>}
  </AuthShell>
  if (!session) return null
  const leaseValid = canFinalizeWithLease(session.offline_lease)
  const startVisit = () => {
    if (!leaseValid) { setNotice('Offline authorization expired. Connect and unlock again before starting another official visit.'); return }
    if (!draft) setDraft(createDraft(session.offline_lease.id)); setView('visit')
  }
  const logoutWorkspace = async () => {
    const blocked = logoutBlock(queue, draft)
    if (blocked === 'queue') { setNotice('Synchronize all completed visits before signing out.'); return }
    if (blocked === 'draft' && !window.confirm('Discard the active draft and sign out? This draft cannot be recovered.')) return
    if (!navigator.onLine) { setNotice('Connect to the internet to revoke this device session before signing out.'); return }
    try {
      if (draft) { await deleteSecret('active-draft'); setDraft(null) }
      await fieldApi.logout(session.token)
      await clearVault(); setSession(null); setBootstrap(EMPTY_BOOTSTRAP); setQueue([]); setView('home'); setGate('login')
    } catch (error) { setNotice(apiError(error, 'Sign out could not revoke this device session. Try again while online.')) }
  }
  const toggleBiometric = async () => {
    if (biometricEnabled) { await disableBiometricUnlock(); setBiometricEnabled(false); setNotice('Device biometric unlock disabled. PIN unlock remains available.') }
    else { await enableBiometricUnlock(); setBiometricEnabled(true); setNotice('Device biometric unlock enabled. PIN unlock remains available.') }
  }
  const shellView: TopLevelView = view === 'visit' ? 'activity' : view
  return <>
    <InstallPrompt />
    <FieldAppShell activeView={shellView} officerName={session.user.name} online={online} queueCount={queue.length} hasActiveDraft={Boolean(draft)} authorizationValid={leaseValid} onNavigate={setView} onStartVisit={startVisit} onLock={() => void lockWorkspace()}>
      {notice && <div className="field-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={17} /></button></div>}
      {!leaseValid && <div className="authorization-warning" role="alert"><TriangleAlert size={18} /><span><strong>Offline authorization expired</strong> Existing work is preserved. Connect and unlock again before starting or finalizing an official visit.</span></div>}
      {view === 'home' && <HomePage name={session.user.name} bootstrap={bootstrap} queueCount={queue.length} activeDraft={draft} online={online} authorizationValid={leaseValid} onStart={startVisit} onViewActivity={() => setView('activity')} />}
      {view === 'activity' && <ActivityPage activeDraft={draft} queue={queue} bootstrap={bootstrap} online={online} syncing={syncing} authorizationValid={leaseValid} onResume={() => setView('visit')} onStart={startVisit} onSync={() => void syncQueue()} />}
      {view === 'visit' && draft && <VisitWizard draft={draft} bootstrap={bootstrap} online={online} authorizationValid={leaseValid} onDraft={setDraft} onCancel={() => setView('home')} onFinish={async (finished) => {
        if (navigator.onLine) {
          try { await fieldApi.sync(session.token, [finished]); setNotice('Visit accepted and added to monitoring history.') }
          catch (error) {
            const status = (error as { response?: { status?: number } }).response?.status
            if (status && status < 500) throw error
            await saveQueue([...queue, { ...finished, sync_source: 'offline_queue' }]); setNotice('Connection changed. The completed visit is encrypted and queued on this device.')
          }
        } else { await saveQueue([...queue, { ...finished, sync_source: 'offline_queue' }]); setNotice('Visit secured offline and queued for synchronization.') }
        await deleteSecret('active-draft'); setDraft(null); setView('home')
      }} />}
      {view === 'history' && <HistoryPage session={session} online={online} />}
      {view === 'profile' && <ProfilePage session={session} online={online} biometricAvailability={biometricAvailability} biometricEnabled={biometricEnabled} onToggleBiometric={toggleBiometric} onLock={() => void lockWorkspace()} onLogout={() => void logoutWorkspace()} />}
    </FieldAppShell>
  </>
}


function PinSetup({ onDone, migration = false }: { onDone: (pin: string) => Promise<void>; migration?: boolean }) {
  const [step, setStep] = useState<'create' | 'confirm'>('create'); const [pin, setPin] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const complete = async (next: string) => {
    if (next !== pin) { setError('PINs do not match. Re-enter the four digits.'); setConfirm(''); return }
    setBusy(true); setError('')
    try { await onDone(pin) } catch (reason) { setError(apiError(reason, migration ? 'The PIN could not be updated. Your previous PIN still works.' : 'The secure vault could not be created.')); setConfirm('') } finally { setBusy(false) }
  }
  const title = step === 'create' ? (migration ? 'Create a new 4-digit PIN' : 'Create device PIN') : 'Confirm device PIN'
  return <SecurityMessage title={title} detail={step === 'create' ? (migration ? 'Replace your previous device PIN without changing encrypted field data or biometric enrollment.' : 'Choose four digits used only to unlock encrypted field work on this device.') : 'Enter the same four digits again to secure this device.'} icon={<LockKeyhole />}>
    <form className="auth-form pin-form" onSubmit={(event) => { event.preventDefault(); if (step === 'create' && pin.length === 4) setStep('confirm'); else if (step === 'confirm' && confirm.length === 4) void complete(confirm) }}>
      {step === 'create' ? <DevicePinInput autoFocus disabled={busy} value={pin} onChange={(next) => { setError(''); setPin(next); if (next.length === 4) setStep('confirm') }} /> : <DevicePinInput autoFocus disabled={busy} label="Confirm 4-digit device PIN" value={confirm} onChange={(next) => { setError(''); setConfirm(next); if (next.length === 4) void complete(next) }} />}
      <p className="pin-guidance" aria-live="polite">{busy ? 'Securing encrypted workspace…' : `${step === 'create' ? pin.length : confirm.length} of 4 digits entered`}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </SecurityMessage>
}

function biometricCompatibility(availability: Exclude<BiometricAvailability, 'available'>) {
  if (availability === 'browser-unsupported') return { title: 'Biometric unlock needs a newer browser', detail: 'Use Chrome or Edge 133 or newer, then reopen PRICE-Watch from its secure HTTPS address. Your device PIN remains available.' }
  if (availability === 'platform-authenticator-unavailable') return { title: 'Set up biometrics on this device', detail: 'No enrolled fingerprint or facial verification is available to this browser. Set it up in your device settings, then try again. Your PIN remains available.' }
  return { title: 'Biometric vault unlock is not supported', detail: 'This device can verify your identity, but its authenticator cannot provide the encrypted key required by PRICE-Watch. Continue with your device PIN.' }
}

function BiometricSetup({ availability, onEnable, onSkip }: { availability: BiometricAvailability; onEnable: () => Promise<void>; onSkip: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  if (availability !== 'available') {
    const compatibility = biometricCompatibility(availability)
    return <SecurityMessage title={compatibility.title} detail={compatibility.detail} icon={<Fingerprint />}><button type="button" className="primary-button" onClick={onSkip}>Continue with PIN<LockKeyhole size={18} /></button></SecurityMessage>
  }
  return <SecurityMessage title="Enable device biometric unlock" detail="Use this device's fingerprint or facial verification to unlock faster. PRICE-Watch receives only verification success or failure; your PIN always remains available." icon={<Fingerprint />}><div className="auth-form"><button type="button" className="primary-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onEnable() } catch (reason) { setError(apiError(reason, 'Biometric unlock could not be enabled. You can continue with the PIN.')) } finally { setBusy(false) } }}><Fingerprint size={18} />{busy ? 'Waiting for device…' : 'Enable biometric unlock'}</button>{error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="text-button" disabled={busy} onClick={onSkip}>Not now — use PIN</button></div></SecurityMessage>
}

function Unlock({ onUnlocked }: { onUnlocked: (result: VaultUnlockResult) => Promise<void> }) {
  const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [compatibilityNote, setCompatibilityNote] = useState(''); const [busy, setBusy] = useState(false); const [canReturnToChoices, setCanReturnToChoices] = useState(false); const [mode, setMode] = useState<'checking' | 'biometric' | 'choices' | 'pin'>('checking')
  const biometricAttempt = useRef<Promise<void> | null>(null); const automaticAttempted = useRef(false)
  const finishBiometric = useCallback(() => {
    if (biometricAttempt.current) return biometricAttempt.current
    setMode('biometric'); setBusy(true); setError('')
    const attempt = (async () => { try { await onUnlocked(await unlockVaultWithBiometrics()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Biometric unlock failed. Use the device PIN.'); setMode('choices') } finally { setBusy(false) } })()
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
  const finishPin = async (nextPin: string) => { if (!/^\d{4}$/.test(nextPin) || busy) return; setBusy(true); setError(''); try { await onUnlocked(await unlockVault(nextPin)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unlock failed.'); setPin('') } finally { setBusy(false) } }
  return <SecurityMessage title="Unlock field workspace" detail={mode === 'biometric' || mode === 'checking' ? 'Confirm your identity using this device.' : 'Your encrypted visits and downloaded field data stay on this device.'} icon={mode === 'biometric' || mode === 'checking' ? <Fingerprint /> : <LockKeyhole />}>
    {(mode === 'biometric' || mode === 'checking') && <div className="biometric-wait" role="status"><span className="biometric-pulse"><Fingerprint /></span><strong>{busy ? 'Waiting for device verification…' : 'Checking biometric enrollment…'}</strong></div>}
    {mode === 'choices' && <div className="auth-form unlock-choices-container"><div className="unlock-choices-card"><button type="button" className="unlock-choice-btn unlock-choice-bio" disabled={busy} onClick={() => void finishBiometric()}><span className="unlock-choice-icon-wrap"><Fingerprint size={28} /></span><span className="unlock-choice-label">Try biometric again</span></button><div className="unlock-choices-divider" /><button type="button" className="unlock-choice-btn unlock-choice-pin" onClick={() => { setPin(''); setError(''); setCanReturnToChoices(true); setMode('pin') }}><span className="unlock-choice-icon-wrap"><LockKeyhole size={28} /></span><span className="unlock-choice-label">Use device PIN</span></button></div>{error && <p className="form-error" role="alert">{error}</p>}</div>}
    {mode === 'pin' && <div className="auth-form pin-form">
      <DevicePinInput autoFocus disabled={busy} length={4} label="4-digit device PIN" value={pin} onChange={(next) => { setError(''); setPin(next); if (next.length === 4) void finishPin(next) }} />
      {canReturnToChoices && <button type="button" className="text-button pin-back-button" disabled={busy} onClick={() => { setPin(''); setError(''); setCanReturnToChoices(false); setMode('choices') }}><ArrowLeft size={17} />Back to unlock options</button>}
      {compatibilityNote && <p className="compatibility-note" role="status">{compatibilityNote}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </SecurityMessage>
}

function SecurityMessage({ title, detail, icon, children }: { title: string; detail: string; icon: React.ReactNode; children?: React.ReactNode }) { return <div className="security-content"><span className="security-icon" aria-hidden="true">{icon}</span><h2>{title}</h2><p>{detail}</p>{children}</div> }
function VisitWizard({ draft, bootstrap, online, authorizationValid, onDraft, onCancel, onFinish }: { draft: VisitDraft; bootstrap: BootstrapData; online: boolean; authorizationValid: boolean; onDraft: (draft: VisitDraft) => void; onCancel: () => void; onFinish: (draft: VisitDraft) => Promise<void> }) {
  const [step, setStep] = useState(0); const [query, setQuery] = useState(''); const [selectedSrp, setSelectedSrp] = useState(''); const [price, setPrice] = useState(''); const [error, setError] = useState(''); const [locating, setLocating] = useState(false); const [finishing, setFinishing] = useState(false)
  const steps = ['Store', 'Prices', 'Review', 'Evidence', 'Finish']
  const stores = bootstrap.stores.filter((store) => `${store.store_name} ${store.address}`.toLowerCase().includes(query.toLowerCase()))
  const selectedStore = bootstrap.stores.find((store) => store.id === draft.store_id)
  const next = () => { setError(''); if (step === 0 && !draft.store_id) return setError('Choose a registered store to continue.'); if (step === 1 && !draft.items.length) return setError('Add at least one commodity price.'); setStep(Math.min(4, step + 1)) }
  const addItem = () => { const srpId = Number(selectedSrp); const amount = Number(price); if (!srpId || !Number.isFinite(amount) || amount < 0) { setError('Choose a commodity and enter its shelf price.'); return } const without = draft.items.filter((item) => item.srp_id !== srpId); onDraft({ ...draft, items: [...without, { srp_id: srpId, recorded_price: amount }] }); setSelectedSrp(''); setPrice(''); setError('') }
  const captureLocation = () => { setLocating(true); setError(''); navigator.geolocation.getCurrentPosition((position) => { onDraft({ ...draft, location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_meters: position.coords.accuracy, captured_at: new Date(position.timestamp).toISOString() } }); setLocating(false) }, (reason) => { setError(`Location unavailable: ${reason.message}. Allow precise location and try again.`); setLocating(false) }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }) }
  const finish = async () => { if (!authorizationValid) { setError('Offline authorization expired. Your draft is preserved; connect and unlock again before finalizing.'); return } const final = { ...draft, finalized_at: new Date().toISOString(), sync_source: (online ? 'online' : 'offline_queue') as VisitDraft['sync_source'] }; const issues = canFinalizeVisit(final); if (issues.length) { setError(issues.join(' ')); return } setFinishing(true); setError(''); try { await onFinish(final) } catch (reason) { setError(apiError(reason, 'The server could not validate this visit. Review the evidence and try again.')) } finally { setFinishing(false) } }
  return <div className="page visit-page"><button type="button" className="back-button" onClick={onCancel}><ArrowLeft size={17} />Back to activity</button><div className="visit-heading"><div><h1>Monitoring visit</h1><p>{selectedStore?.store_name || 'Select an active registered establishment'}</p></div><span className={`network-chip ${online ? 'online' : ''}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline capture'}</span></div>
    <ol className="stepper">{steps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'done' : ''}><span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small></li>)}</ol>
    <section className="visit-workspace">
      {step === 0 && <div className="step-content"><h2>Choose the store you are visiting</h2><p>All active establishments are available. Store assignment is not required.</p><label className="search-box"><Search size={18} /><input autoFocus placeholder="Search store or address" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="store-list">{stores.map((store) => <button type="button" className={draft.store_id === store.id ? 'selected' : ''} key={store.id} onClick={() => onDraft({ ...draft, store_id: store.id })}><Building2 /><span><strong>{store.store_name}</strong><small>{store.address}</small></span>{draft.store_id === store.id && <CheckCircle2 />}</button>)}</div></div>}
      {step === 1 && <div className="step-content"><h2>Record commodity prices</h2><p>Add every commodity checked during this visit. Existing lines can be replaced by selecting the same commodity.</p><div className="price-entry"><label>Commodity<select value={selectedSrp} onChange={(event) => setSelectedSrp(event.target.value)}><option value="">Choose commodity</option>{bootstrap.srp_bulletins.map((item) => <option key={item.id} value={item.id}>{item.commodity_name} {item.unit ? `· ${item.unit}` : ''}</option>)}</select></label><label>Shelf price<div className="money-input"><span>₱</span><input inputMode="decimal" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></div></label><button type="button" className="secondary-button" onClick={addItem}><Plus size={17} />Add price</button></div><LineTable draft={draft} bulletins={bootstrap.srp_bulletins} onRemove={(id) => onDraft({ ...draft, items: draft.items.filter((item) => item.srp_id !== id) })} /></div>}
      {step === 2 && <div className="step-content"><h2>Review the visit</h2><p>Confirm the store and recorded shelf prices before collecting evidence.</p><div className="review-store"><Building2 /><span><strong>{selectedStore?.store_name}</strong><small>{selectedStore?.address}</small></span><button type="button" onClick={() => setStep(0)}>Change</button></div><LineTable draft={draft} bulletins={bootstrap.srp_bulletins} /></div>}
      {step === 3 && <div className="step-content"><h2>Lock the visit evidence</h2><p>Both people sign the same completed record. Signatures are stored as private evidence.</p><div className="representative-fields"><label>Store representative name<input value={draft.representative.name} onChange={(event) => onDraft({ ...draft, representative: { ...draft.representative, name: event.target.value } })} /></label><label>Position (optional)<input value={draft.representative.title} onChange={(event) => onDraft({ ...draft, representative: { ...draft.representative, title: event.target.value } })} /></label></div><div className="signature-grid"><SignaturePad label="DTI field officer" value={draft.signatures.officer_png_base64} onChange={(value) => onDraft({ ...draft, signatures: { ...draft.signatures, officer_png_base64: value } })} /><SignaturePad label="Store representative" value={draft.signatures.representative_png_base64} onChange={(value) => onDraft({ ...draft, signatures: { ...draft.signatures, representative_png_base64: value } })} /></div></div>}
      {step === 4 && <div className="step-content finish-step"><h2>Capture location and finish</h2><p>Precise GPS within 100 metres is required. The record will be accepted automatically after server validation.</p><div className={`location-lock ${draft.location && draft.location.accuracy_meters <= 100 ? 'valid' : ''}`}><LocateFixed /><span>{draft.location ? <><strong>{draft.location.accuracy_meters <= 100 ? 'Location verified' : 'Location needs improvement'}</strong><small>{draft.location.latitude.toFixed(6)}, {draft.location.longitude.toFixed(6)} · ±{Math.round(draft.location.accuracy_meters)} m</small></> : <><strong>Location not captured</strong><small>Move near a window or outdoors for better GPS.</small></>}</span><button type="button" className="secondary-button" disabled={locating} onClick={captureLocation}>{locating ? 'Locating…' : draft.location ? 'Capture again' : 'Capture GPS'}</button></div><div className="final-checks"><FinalCheck okay={draft.items.length > 0} label={`${draft.items.length} commodity line${draft.items.length === 1 ? '' : 's'} reviewed`} /><FinalCheck okay={Boolean(draft.signatures.officer_png_base64 && draft.signatures.representative_png_base64)} label="Both signatures captured" /><FinalCheck okay={Boolean(draft.location && draft.location.accuracy_meters <= 100)} label="Precise location locked" /></div><div className={`submission-mode ${online ? 'online' : ''}`}>{online ? <Wifi /> : <CloudOff />}<span><strong>{online ? 'Submit for automatic acceptance' : 'Secure to encrypted queue'}</strong><small>{online ? 'The validated visit appears in Admin monitoring immediately.' : 'It will synchronize after this device reconnects and is unlocked.'}</small></span></div></div>}
      {error && <p className="form-error visit-error" role="alert"><TriangleAlert size={17} />{error}</p>}
      <div className="wizard-actions">{step > 0 && <button type="button" className="secondary-button" onClick={() => { setError(''); setStep(step - 1) }}><ChevronLeft size={17} />Previous</button>}<span />{step < 4 ? <button type="button" className="primary-button" onClick={next}>Continue<ChevronRight size={17} /></button> : <button type="button" className="primary-button" disabled={finishing || !authorizationValid} onClick={() => void finish()}>{!authorizationValid ? 'Authorization expired' : finishing ? 'Securing visit…' : online ? 'Finalize & submit' : 'Finalize offline'}<ShieldCheck size={18} /></button>}</div>
    </section></div>
}

function LineTable({ draft, bulletins, onRemove }: { draft: VisitDraft; bulletins: Bulletin[]; onRemove?: (id: number) => void }) {
  return <div className="line-table"><div className="line-header"><span>Commodity</span><span>SRP</span><span>Shelf price</span><span>Assessment</span>{onRemove && <span />}</div>{draft.items.map((line) => { const item = bulletins.find((entry) => entry.id === line.srp_id); const baseline = Number(item?.baseline_price || 0); const analysis = analyzeLine(line, baseline); return <div className="line-row" key={line.srp_id}><span data-label="Commodity"><strong>{item?.commodity_name || `Commodity #${line.srp_id}`}</strong><small>{item?.unit || 'Current bulletin'}</small></span><span data-label="SRP">₱{baseline.toFixed(2)}</span><span data-label="Shelf price"><strong>₱{line.recorded_price.toFixed(2)}</strong></span><span data-label="Assessment"><em className={analysis.is_anomaly ? 'attention' : 'within'}>{analysis.is_anomaly ? `+${analysis.variance_percent}% above reference` : 'Within reference range'}</em></span>{onRemove && <button type="button" aria-label={`Remove ${item?.commodity_name}`} onClick={() => onRemove(line.srp_id)}><X size={17} /></button>}</div>})}</div>
}
function FinalCheck({ okay, label }: { okay: boolean; label: string }) { return <div className={okay ? 'okay' : ''}>{okay ? <CheckCircle2 /> : <span className="open-check" />}<span>{label}</span></div> }
