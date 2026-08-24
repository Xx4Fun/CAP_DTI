import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, CheckCircle2, ChevronLeft,
  ChevronRight, ClipboardCheck, CloudOff, History, ListChecks, LocateFixed, LockKeyhole,
  LogOut, MapPin, PackageSearch, Plus, RefreshCw, Search, ShieldCheck, Signal,
  TriangleAlert, Wifi, WifiOff, X
} from 'lucide-react'
import { InstallPrompt } from './components/InstallPrompt'
import { SignaturePad } from './components/SignaturePad'
import { apiError, fieldApi } from './services/fieldApi'
import { canFinalizeVisit, createDraft, analyzeLine } from './app/workflow'
import { clearVault, createVault, deleteSecret, hasVault, lockVault, readSecret, unlockVault, writeSecret } from './app/vault'
import type { BootstrapData, Bulletin, FieldSession, MonitoringRecord, Page, VisitDraft } from './types'

type Gate = 'checking' | 'login' | 'password' | 'pin' | 'unlock' | 'ready'
type View = 'home' | 'visit' | 'history'
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

  useEffect(() => { void hasVault().then((exists) => setGate(exists ? 'unlock' : 'login')) }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const hydrate = useCallback(async (next: FieldSession) => {
    setSession(next)
    const cached = await readSecret<BootstrapData>('bootstrap')
    const cachedQueue = await readSecret<VisitDraft[]>('queue')
    const cachedDraft = await readSecret<VisitDraft>('active-draft')
    if (cached) setBootstrap(cached)
    if (cachedQueue) setQueue(cachedQueue)
    if (cachedDraft) setDraft(cachedDraft)
    if (navigator.onLine) {
      try {
        const downloaded = await fieldApi.bootstrap(next.token)
        setBootstrap(downloaded); await writeSecret('bootstrap', downloaded)
      } catch (error) { if (!cached) throw error }
    }
    setGate('ready')
  }, [])

  const saveQueue = async (next: VisitDraft[]) => { setQueue(next); await writeSecret('queue', next) }
  const syncQueue = useCallback(async () => {
    if (!session || !navigator.onLine || !queue.length || syncing) return
    setSyncing(true)
    try {
      await fieldApi.sync(session.token, queue.map((item) => ({ ...item, sync_source: 'offline_queue' })))
      await saveQueue([]); setNotice(`${queue.length} queued visit${queue.length === 1 ? '' : 's'} synchronized.`)
    } catch (error) { setNotice(apiError(error, 'Queued visits remain safely on this device. Try sync again when the connection is stable.')) }
    finally { setSyncing(false) }
  }, [queue, session, syncing])

  useEffect(() => { if (online && gate === 'ready') void syncQueue() }, [online, gate, syncQueue])
  useEffect(() => { if (gate === 'ready' && draft) void writeSecret('active-draft', draft) }, [draft, gate])

  if (gate === 'checking') return <CenteredStatus icon={<ShieldCheck />} title="Opening secure workspace" detail="Checking this device…" />
  if (gate === 'login') return <Login onAuthenticated={(next, mustChange) => { setSession(next); setGate(mustChange ? 'password' : 'pin') }} />
  if (gate === 'password' && session) return <ReplacePassword session={session} onDone={() => setGate('pin')} />
  if (gate === 'pin' && session) return <PinSetup onDone={async (pin) => { await createVault(pin); await writeSecret('session', session); await hydrate(session) }} />
  if (gate === 'unlock') return <Unlock onUnlocked={async () => {
    const saved = await readSecret<FieldSession>('session')
    if (!saved) { await clearVault(); setGate('login'); return }
    await hydrate(saved)
  }} onReset={async () => { await clearVault(); setGate('login') }} />
  if (!session) return null
  if (new Date(session.offline_lease.expires_at).getTime() <= Date.now()) return <RenewAccess email={session.user.email} queueCount={queue.length} onRenewed={async (next) => { await writeSecret('session', next); await hydrate(next) }} />

  const startVisit = () => { if (!draft) setDraft(createDraft(session.offline_lease.id)); setView('visit') }
  return <div className="field-app">
    <InstallPrompt />
    <AppRail view={view} name={session.user.name} online={online} queueCount={queue.length} onNavigate={setView} onLogout={async () => {
      try { if (navigator.onLine) await fieldApi.logout(session.token) } finally { await clearVault(); lockVault(); setSession(null); setGate('login') }
    }} />
    <main className="field-main">
      <header className="mobile-header"><Brand /><span className={`network-chip ${online ? 'online' : ''}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline'}</span></header>
      {notice && <div className="field-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={17} /></button></div>}
      {view === 'home' && <Dashboard name={session.user.name} queue={queue} activeDraft={draft} online={online} bootstrap={bootstrap} onStart={startVisit} onResume={() => setView('visit')} onSync={() => void syncQueue()} syncing={syncing} />}
      {view === 'visit' && draft && <VisitWizard draft={draft} bootstrap={bootstrap} online={online} onDraft={setDraft} onCancel={() => setView('home')} onFinish={async (finished) => {
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
      {view === 'history' && <HistoryView session={session} queue={queue} online={online} onSync={() => void syncQueue()} syncing={syncing} />}
    </main>
    <nav className="bottom-nav" aria-label="Field monitoring navigation">
      <NavButton active={view === 'home'} icon={<ListChecks />} label="Activity" onClick={() => setView('home')} />
      <button type="button" className="bottom-start" onClick={startVisit} aria-label="Start a monitoring visit"><Plus /></button>
      <NavButton active={view === 'history'} icon={<History />} label="History" onClick={() => setView('history')} />
    </nav>
  </div>
}

function Login({ onAuthenticated }: { onAuthenticated: (session: FieldSession, mustChange: boolean) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const result = await fieldApi.login(email, password); onAuthenticated(result, result.must_change_password) } catch (reason) { setError(apiError(reason, 'Sign-in failed. Check the connection and try again.')) } finally { setBusy(false) } }
  return <AuthFrame title="Field Monitoring" detail="Secure access for authorized DTI field officers.">
    <form onSubmit={submit} className="auth-form">
      <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Temporary or current password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}<ArrowRight size={18} /></button>
    </form>
    <p className="auth-footnote"><LockKeyhole size={15} /> First sign-in requires internet. Your Admin-issued temporary password must be replaced.</p>
  </AuthFrame>
}

function ReplacePassword({ session, onDone }: { session: FieldSession; onDone: () => void }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  return <AuthFrame title="Replace temporary password" detail="Create a private password before field data is downloaded."><form className="auth-form" onSubmit={async (event) => {
    event.preventDefault(); if (password !== confirm) { setError('Passwords do not match.'); return } setBusy(true); setError('')
    try { await fieldApi.changePassword(session.token, password); onDone() } catch (reason) { setError(apiError(reason, 'The password could not be changed.')) } finally { setBusy(false) }
  }}><label>New password<input type="password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input type="password" minLength={12} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save private password'}<ArrowRight size={18} /></button></form></AuthFrame>
}

function PinSetup({ onDone }: { onDone: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  return <AuthFrame title="Protect offline access" detail="Set a device-only PIN. It encrypts downloaded stores, drafts, and the sync queue."><form className="auth-form" onSubmit={async (event) => { event.preventDefault(); if (pin !== confirm) { setError('PINs do not match.'); return } if (!/^\d{4,8}$/.test(pin)) { setError('Use a 4 to 8 digit PIN.'); return } setBusy(true); try { await onDone(pin) } catch (reason) { setError(apiError(reason, 'The secure vault could not be created.')) } finally { setBusy(false) } }}><label>New device PIN<input inputMode="numeric" pattern="[0-9]{4,8}" type="password" value={pin} onChange={(event) => setPin(event.target.value)} /></label><label>Confirm PIN<input inputMode="numeric" pattern="[0-9]{4,8}" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Encrypting…' : 'Secure this device'}<ShieldCheck size={18} /></button></form></AuthFrame>
}

function Unlock({ onUnlocked, onReset }: { onUnlocked: () => Promise<void>; onReset: () => Promise<void> }) {
  const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  return <AuthFrame title="Unlock field workspace" detail="Use the PIN created on this device. Internet is not required."><form className="auth-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await unlockVault(pin); await onUnlocked() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unlock failed.') } finally { setBusy(false) } }}><label>Device PIN<input autoFocus inputMode="numeric" type="password" value={pin} onChange={(event) => setPin(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}<LockKeyhole size={18} /></button><button type="button" className="text-button" onClick={() => void onReset()}>Remove offline data and sign in again</button></form></AuthFrame>
}

function RenewAccess({ email, queueCount, onRenewed }: { email: string; queueCount: number; onRenewed: (session: FieldSession) => Promise<void> }) {
  const [password, setPassword] = useState(''); const [replacement, setReplacement] = useState(''); const [confirmation, setConfirmation] = useState(''); const [pending, setPending] = useState<(FieldSession & { must_change_password: boolean }) | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  if (pending?.must_change_password) return <AuthFrame title="Replace reset password" detail="An Admin reset requires a new private password before your secure queue can synchronize."><form className="auth-form" onSubmit={async (event) => { event.preventDefault(); if (replacement !== confirmation) { setError('Passwords do not match.'); return } setBusy(true); setError(''); try { await fieldApi.changePassword(pending.token, replacement); await onRenewed(pending) } catch (reason) { setError(apiError(reason, 'The password could not be changed.')) } finally { setBusy(false) } }}><label>New password<input type="password" minLength={12} required value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label><label>Confirm password<input type="password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Renewing…' : 'Renew secure access'}<ShieldCheck size={18} /></button></form></AuthFrame>
  return <AuthFrame title="Renew field authorization" detail={`This device lease expired. ${queueCount ? `${queueCount} queued visit${queueCount === 1 ? ' is' : 's are'} still encrypted and will be preserved.` : 'Your downloaded field data remains encrypted.'}`}><form className="auth-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { const next = await fieldApi.login(email, password); if (next.must_change_password) setPending(next); else await onRenewed(next) } catch (reason) { setError(apiError(reason, 'Authorization could not be renewed. Connect to the internet and try again.')) } finally { setBusy(false) } }}><label>DTI email address<input value={email} readOnly /></label><label>Current password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy || !navigator.onLine}>{busy ? 'Renewing…' : navigator.onLine ? 'Renew access and synchronize' : 'Internet required'}<RefreshCw size={18} /></button></form></AuthFrame>
}

function AuthFrame({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) { return <main className="auth-page"><section className="auth-brand"><Brand /><div><ShieldCheck /><span>Official DTI field workspace</span></div></section><section className="auth-panel"><h1>{title}</h1><p>{detail}</p>{children}</section></main> }
function Brand() { return <div className="brand"><span>DTI</span><strong>PRICE-Watch</strong><small>Field Monitoring</small></div> }
function CenteredStatus({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <main className="centered-status">{icon}<h1>{title}</h1><p>{detail}</p></main> }

function AppRail({ view, name, online, queueCount, onNavigate, onLogout }: { view: View; name: string; online: boolean; queueCount: number; onNavigate: (v: View) => void; onLogout: () => void }) {
  return <aside className="app-rail"><Brand /><div className={`network-panel ${online ? 'online' : ''}`}>{online ? <Signal /> : <CloudOff />}<span><strong>{online ? 'Connected' : 'Offline mode'}</strong><small>{online ? 'Ready to synchronize' : `${queueCount} visit${queueCount === 1 ? '' : 's'} secured`}</small></span></div><nav><NavButton active={view === 'home'} icon={<ListChecks />} label="Activity" onClick={() => onNavigate('home')} /><NavButton active={view === 'history'} icon={<History />} label="History & queue" onClick={() => onNavigate('history')} /></nav><div className="rail-account"><span className="account-mark">{name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span><span><strong>{name}</strong><small>DTI Field Officer</small></span><button type="button" aria-label="Sign out" onClick={onLogout}><LogOut size={17} /></button></div></aside>
}
function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button type="button" className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button> }

function Dashboard({ name, queue, activeDraft, online, bootstrap, onStart, onResume, onSync, syncing }: { name: string; queue: VisitDraft[]; activeDraft: VisitDraft | null; online: boolean; bootstrap: BootstrapData; onStart: () => void; onResume: () => void; onSync: () => void; syncing: boolean }) {
  return <div className="page dashboard"><div className="page-heading"><div><h1>Good day, {name.split(' ')[0]}</h1><p>Capture a complete store visit, even when the signal drops.</p></div><button type="button" className="primary-button desktop-action" onClick={onStart}><Plus size={18} />Start monitoring visit</button></div>
    <section className="readiness-band"><div><span className="readiness-icon"><BadgeCheck /></span><span><strong>Field data ready</strong><small>{bootstrap.stores.length} active stores · {bootstrap.srp_bulletins.length} current commodity references</small></span></div><span className={`network-chip ${online ? 'online' : ''}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Online' : 'Working offline'}</span></section>
    <div className="dashboard-grid"><section className="start-panel"><MapPin /><div><h2>{activeDraft ? 'Continue saved monitoring visit' : 'Start a price monitoring visit'}</h2><p>{activeDraft ? `${activeDraft.items.length} commodity line${activeDraft.items.length === 1 ? '' : 's'} saved securely on this device.` : 'Select any active registered establishment, record multiple commodity prices, then lock the visit with both signatures and accurate GPS.'}</p></div><button type="button" className="primary-button" onClick={activeDraft ? onResume : onStart}>{activeDraft ? 'Resume visit' : 'Begin visit'}<ArrowRight size={18} /></button></section>
      <section className="queue-panel"><div className="section-title"><div><h2>Secure sync queue</h2><p>Completed visits waiting on this device.</p></div><span className="queue-count">{queue.length}</span></div>{queue.length ? <>{queue.slice(0, 3).map((item) => <div className="queue-row" key={item.client_uuid}><CloudOff /><span><strong>{bootstrap.stores.find((store) => store.id === item.store_id)?.store_name || 'Completed visit'}</strong><small>{item.items.length} recorded item{item.items.length === 1 ? '' : 's'} · locked for sync</small></span><ShieldCheck /></div>)}<button type="button" className="secondary-button full" disabled={!online || syncing} onClick={onSync}><RefreshCw className={syncing ? 'spin' : ''} size={17} />{syncing ? 'Synchronizing…' : 'Synchronize now'}</button></> : <div className="quiet-empty"><CheckCircle2 /><strong>No visits waiting</strong><span>Completed offline visits will remain encrypted here until accepted.</span></div>}</section></div>
    <section className="process-strip" aria-label="Visit process"><Process icon={<Building2 />} title="Choose store" /><Process icon={<PackageSearch />} title="Record prices" /><Process icon={<ClipboardCheck />} title="Review visit" /><Process icon={<ShieldCheck />} title="Lock evidence" /></section>
  </div>
}
function Process({ icon, title }: { icon: React.ReactNode; title: string }) { return <div>{icon}<span>{title}</span></div> }

function VisitWizard({ draft, bootstrap, online, onDraft, onCancel, onFinish }: { draft: VisitDraft; bootstrap: BootstrapData; online: boolean; onDraft: (draft: VisitDraft) => void; onCancel: () => void; onFinish: (draft: VisitDraft) => Promise<void> }) {
  const [step, setStep] = useState(0); const [query, setQuery] = useState(''); const [selectedSrp, setSelectedSrp] = useState(''); const [price, setPrice] = useState(''); const [error, setError] = useState(''); const [locating, setLocating] = useState(false); const [finishing, setFinishing] = useState(false)
  const steps = ['Store', 'Prices', 'Review', 'Evidence', 'Finish']
  const stores = bootstrap.stores.filter((store) => `${store.store_name} ${store.address}`.toLowerCase().includes(query.toLowerCase()))
  const selectedStore = bootstrap.stores.find((store) => store.id === draft.store_id)
  const next = () => { setError(''); if (step === 0 && !draft.store_id) return setError('Choose a registered store to continue.'); if (step === 1 && !draft.items.length) return setError('Add at least one commodity price.'); setStep(Math.min(4, step + 1)) }
  const addItem = () => { const srpId = Number(selectedSrp); const amount = Number(price); if (!srpId || !Number.isFinite(amount) || amount < 0) { setError('Choose a commodity and enter its shelf price.'); return } const without = draft.items.filter((item) => item.srp_id !== srpId); onDraft({ ...draft, items: [...without, { srp_id: srpId, recorded_price: amount }] }); setSelectedSrp(''); setPrice(''); setError('') }
  const captureLocation = () => { setLocating(true); setError(''); navigator.geolocation.getCurrentPosition((position) => { onDraft({ ...draft, location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_meters: position.coords.accuracy, captured_at: new Date(position.timestamp).toISOString() } }); setLocating(false) }, (reason) => { setError(`Location unavailable: ${reason.message}. Allow precise location and try again.`); setLocating(false) }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }) }
  const finish = async () => { const final = { ...draft, finalized_at: new Date().toISOString(), sync_source: (online ? 'online' : 'offline_queue') as VisitDraft['sync_source'] }; const issues = canFinalizeVisit(final); if (issues.length) { setError(issues.join(' ')); return } setFinishing(true); setError(''); try { await onFinish(final) } catch (reason) { setError(apiError(reason, 'The server could not validate this visit. Review the evidence and try again.')) } finally { setFinishing(false) } }
  return <div className="page visit-page"><button type="button" className="back-button" onClick={onCancel}><ArrowLeft size={17} />Back to activity</button><div className="visit-heading"><div><h1>Monitoring visit</h1><p>{selectedStore?.store_name || 'Select an active registered establishment'}</p></div><span className={`network-chip ${online ? 'online' : ''}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? 'Online' : 'Offline capture'}</span></div>
    <ol className="stepper">{steps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'done' : ''}><span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small></li>)}</ol>
    <section className="visit-workspace">
      {step === 0 && <div className="step-content"><h2>Choose the store you are visiting</h2><p>All active establishments are available. Store assignment is not required.</p><label className="search-box"><Search size={18} /><input autoFocus placeholder="Search store or address" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="store-list">{stores.map((store) => <button type="button" className={draft.store_id === store.id ? 'selected' : ''} key={store.id} onClick={() => onDraft({ ...draft, store_id: store.id })}><Building2 /><span><strong>{store.store_name}</strong><small>{store.address}</small></span>{draft.store_id === store.id && <CheckCircle2 />}</button>)}</div></div>}
      {step === 1 && <div className="step-content"><h2>Record commodity prices</h2><p>Add every commodity checked during this visit. Existing lines can be replaced by selecting the same commodity.</p><div className="price-entry"><label>Commodity<select value={selectedSrp} onChange={(event) => setSelectedSrp(event.target.value)}><option value="">Choose commodity</option>{bootstrap.srp_bulletins.map((item) => <option key={item.id} value={item.id}>{item.commodity_name} {item.unit ? `· ${item.unit}` : ''}</option>)}</select></label><label>Shelf price<div className="money-input"><span>₱</span><input inputMode="decimal" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></div></label><button type="button" className="secondary-button" onClick={addItem}><Plus size={17} />Add price</button></div><LineTable draft={draft} bulletins={bootstrap.srp_bulletins} onRemove={(id) => onDraft({ ...draft, items: draft.items.filter((item) => item.srp_id !== id) })} /></div>}
      {step === 2 && <div className="step-content"><h2>Review the visit</h2><p>Confirm the store and recorded shelf prices before collecting evidence.</p><div className="review-store"><Building2 /><span><strong>{selectedStore?.store_name}</strong><small>{selectedStore?.address}</small></span><button type="button" onClick={() => setStep(0)}>Change</button></div><LineTable draft={draft} bulletins={bootstrap.srp_bulletins} /></div>}
      {step === 3 && <div className="step-content"><h2>Lock the visit evidence</h2><p>Both people sign the same completed record. Signatures are stored as private evidence.</p><div className="representative-fields"><label>Store representative name<input value={draft.representative.name} onChange={(event) => onDraft({ ...draft, representative: { ...draft.representative, name: event.target.value } })} /></label><label>Position (optional)<input value={draft.representative.title} onChange={(event) => onDraft({ ...draft, representative: { ...draft.representative, title: event.target.value } })} /></label></div><div className="signature-grid"><SignaturePad label="DTI field officer" value={draft.signatures.officer_png_base64} onChange={(value) => onDraft({ ...draft, signatures: { ...draft.signatures, officer_png_base64: value } })} /><SignaturePad label="Store representative" value={draft.signatures.representative_png_base64} onChange={(value) => onDraft({ ...draft, signatures: { ...draft.signatures, representative_png_base64: value } })} /></div></div>}
      {step === 4 && <div className="step-content finish-step"><h2>Capture location and finish</h2><p>Precise GPS within 100 metres is required. The record will be accepted automatically after server validation.</p><div className={`location-lock ${draft.location && draft.location.accuracy_meters <= 100 ? 'valid' : ''}`}><LocateFixed /><span>{draft.location ? <><strong>{draft.location.accuracy_meters <= 100 ? 'Location verified' : 'Location needs improvement'}</strong><small>{draft.location.latitude.toFixed(6)}, {draft.location.longitude.toFixed(6)} · ±{Math.round(draft.location.accuracy_meters)} m</small></> : <><strong>Location not captured</strong><small>Move near a window or outdoors for better GPS.</small></>}</span><button type="button" className="secondary-button" disabled={locating} onClick={captureLocation}>{locating ? 'Locating…' : draft.location ? 'Capture again' : 'Capture GPS'}</button></div><div className="final-checks"><FinalCheck okay={draft.items.length > 0} label={`${draft.items.length} commodity line${draft.items.length === 1 ? '' : 's'} reviewed`} /><FinalCheck okay={Boolean(draft.signatures.officer_png_base64 && draft.signatures.representative_png_base64)} label="Both signatures captured" /><FinalCheck okay={Boolean(draft.location && draft.location.accuracy_meters <= 100)} label="Precise location locked" /></div><div className={`submission-mode ${online ? 'online' : ''}`}>{online ? <Wifi /> : <CloudOff />}<span><strong>{online ? 'Submit for automatic acceptance' : 'Secure to encrypted queue'}</strong><small>{online ? 'The validated visit appears in Admin monitoring immediately.' : 'It will synchronize after this device reconnects and is unlocked.'}</small></span></div></div>}
      {error && <p className="form-error visit-error" role="alert"><TriangleAlert size={17} />{error}</p>}
      <div className="wizard-actions">{step > 0 && <button type="button" className="secondary-button" onClick={() => { setError(''); setStep(step - 1) }}><ChevronLeft size={17} />Previous</button>}<span />{step < 4 ? <button type="button" className="primary-button" onClick={next}>Continue<ChevronRight size={17} /></button> : <button type="button" className="primary-button" disabled={finishing} onClick={() => void finish()}>{finishing ? 'Securing visit…' : online ? 'Finalize & submit' : 'Finalize offline'}<ShieldCheck size={18} /></button>}</div>
    </section></div>
}

function LineTable({ draft, bulletins, onRemove }: { draft: VisitDraft; bulletins: Bulletin[]; onRemove?: (id: number) => void }) {
  return <div className="line-table"><div className="line-header"><span>Commodity</span><span>SRP</span><span>Shelf price</span><span>Assessment</span>{onRemove && <span />}</div>{draft.items.map((line) => { const item = bulletins.find((entry) => entry.id === line.srp_id); const baseline = Number(item?.baseline_price || 0); const analysis = analyzeLine(line, baseline); return <div className="line-row" key={line.srp_id}><span data-label="Commodity"><strong>{item?.commodity_name || `Commodity #${line.srp_id}`}</strong><small>{item?.unit || 'Current bulletin'}</small></span><span data-label="SRP">₱{baseline.toFixed(2)}</span><span data-label="Shelf price"><strong>₱{line.recorded_price.toFixed(2)}</strong></span><span data-label="Assessment"><em className={analysis.is_anomaly ? 'attention' : 'within'}>{analysis.is_anomaly ? `+${analysis.variance_percent}% above reference` : 'Within reference range'}</em></span>{onRemove && <button type="button" aria-label={`Remove ${item?.commodity_name}`} onClick={() => onRemove(line.srp_id)}><X size={17} /></button>}</div>})}</div>
}
function FinalCheck({ okay, label }: { okay: boolean; label: string }) { return <div className={okay ? 'okay' : ''}>{okay ? <CheckCircle2 /> : <span className="open-check" />}<span>{label}</span></div> }

function HistoryView({ session, queue, online, onSync, syncing }: { session: FieldSession; queue: VisitDraft[]; online: boolean; onSync: () => void; syncing: boolean }) {
  const [page, setPage] = useState<Page<MonitoringRecord> | null>(null); const [current, setCurrent] = useState(1); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  useEffect(() => { if (!online) return; setLoading(true); setError(''); void fieldApi.history(session.token, current).then(setPage).catch((reason) => setError(apiError(reason, 'Monitoring history could not load.'))).finally(() => setLoading(false)) }, [current, online, session.token])
  return <div className="page history-page"><div className="page-heading"><div><h1>History & sync queue</h1><p>Accepted visits are read-only. Pending visits remain encrypted on this device.</p></div>{queue.length > 0 && <button type="button" className="primary-button" disabled={!online || syncing} onClick={onSync}><RefreshCw className={syncing ? 'spin' : ''} size={17} />Synchronize {queue.length}</button>}</div>
    {queue.length > 0 && <section className="pending-section"><div className="section-title"><div><h2>Waiting to synchronize</h2><p>Do not remove local data until these visits are accepted.</p></div><span className="queue-count">{queue.length}</span></div>{queue.map((item) => <div className="pending-record" key={item.client_uuid}><CloudOff /><span><strong>Visit {item.client_uuid.slice(0, 8).toUpperCase()}</strong><small>{item.items.length} item{item.items.length === 1 ? '' : 's'} · finalized {item.finalized_at ? formatDate(item.finalized_at) : 'as draft'}</small></span><em>Encrypted</em></div>)}</section>}
    <section className="history-section"><div className="section-title"><div><h2>Accepted monitoring visits</h2><p>Server-validated evidence visible to Admin monitoring.</p></div></div>{!online && <div className="offline-message"><WifiOff /><span><strong>History needs a connection</strong><small>Your offline queue remains available above.</small></span></div>}{error && <p className="form-error" role="alert">{error}</p>}{loading ? <div className="history-loading">Loading accepted visits…</div> : page?.data.length ? <div className="history-table"><div className="history-head"><span>Establishment</span><span>Officer visit</span><span>Items</span><span>Observations</span><span>Status</span></div>{page.data.map((record) => <div className="history-row" key={record.id}><span data-label="Establishment"><strong>{record.store.store_name}</strong><small>{record.store.address}</small></span><span data-label="Officer visit">{formatDate(record.finalized_at)}</span><span data-label="Items">{record.items_count}</span><span data-label="Observations"><em className={record.anomaly_count ? 'attention' : 'within'}>{record.anomaly_count || 'None'}</em></span><span data-label="Status"><em className="accepted">Accepted</em></span></div>)}</div> : online && <div className="quiet-empty"><History /><strong>No accepted visits yet</strong><span>Your completed monitoring records will appear here.</span></div>}{page && page.last_page > 1 && <div className="pagination"><span>Showing {page.from}–{page.to} of {page.total}</span><div><button type="button" disabled={current <= 1} onClick={() => setCurrent(current - 1)}><ChevronLeft /></button><strong>Page {current} of {page.last_page}</strong><button type="button" disabled={current >= page.last_page} onClick={() => setCurrent(current + 1)}><ChevronRight /></button></div></div>}</section>
  </div>
}
function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
