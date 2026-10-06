import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, RotateCw, Wifi, WifiOff } from 'lucide-react';
import type { ActiveTab, Advisory, LegalNotice, NotificationSettings, ResponseDraft, SrpCatalog, VendorOverview, VendorSession } from './app/types';
import { canRespond, isFinished, needsVendorAction } from './app/rules';
import { clearSession, loadSession, saveSession } from './app/session';
import { apiError, isSessionInvalid, vendorApi } from './services/vendorApi';
import { VendorNavbar } from './components/layout/VendorNavbar';
import { VendorSidebar } from './components/layout/VendorSidebar';
import { VendorBottomNav } from './components/layout/VendorBottomNav';
import { ComplianceScorecard } from './components/dashboard/ComplianceScorecard';
import { NoticeList } from './components/notices/NoticeList';
import { NoticeDetailModal } from './components/notices/NoticeDetailModal';
import { RebuttalWizard } from './components/rebuttal/RebuttalWizard';
import { RebuttalHistory } from './components/rebuttal/RebuttalHistory';
import { SrpDirectory } from './components/srp/SrpDirectory';
import { AdvisoriesView } from './components/advisories/AdvisoriesView';
import { VendorLogin } from './components/auth/VendorLogin';
import { InvitationAccept } from './components/auth/InvitationAccept';
import { NotificationSettingsModal } from './components/settings/NotificationSettingsModal';
import { PwaUpdatePrompt } from './components/common/PwaUpdatePrompt';
import { MessagesView } from './components/messages/MessagesView';
import { AlertsDrawer } from './components/alerts/AlertsDrawer';
import { VendorProfile } from './components/profile/VendorProfile';
import { enqueue, hasUnresolvedWork, registerSession, snapshot, synchronize } from './offline/workspace';
import { flushWrites, hasUnsavedChanges, storageFailure } from './offline/repository';
import { LocalWork } from './offline/LocalWork';

const TAB_TITLES: Record<ActiveTab, string> = {
  overview: 'Dashboard',
  notices: 'Legal Notices',
  messages: 'Communications',
  rebuttals: 'Legal Notices',
  srp: 'Official SRP Catalog',
  advisories: 'DTI Bulletins',
  profile: 'Profile',
};

const invitationTokenFromUrl = () => window.location.pathname === '/vendor-invitation'
  ? new URLSearchParams(window.location.search).get('token')
  : null;

export const App: React.FC = () => {
  const [invitationToken, setInvitationToken] = useState(invitationTokenFromUrl);
  const [session, setSession] = useState<VendorSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  const signOut = useCallback(async (notice: string | null) => {
    try {
      // Even an expired session must not unmount the only copy of a failed local save.
      await flushWrites();
      await clearSession(session?.token);
      setSession(null);
      setLoginNotice(notice);
    } catch (error) { storageFailure(error); }
  }, [session?.token]);

  useEffect(() => {
    let active = true;
    const failed = (event: Event) => setStorageError((event as CustomEvent<string>).detail);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('vendor-storage-error', failed);
    window.addEventListener('beforeunload', beforeUnload);
    void loadSession().then((saved) => { if (active) setSession(saved); }).catch(storageFailure).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; window.removeEventListener('vendor-storage-error', failed); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  let content: React.ReactNode;
  if (restoring) {
    content = <p role="status">Restoring saved workspace…</p>;
  } else if (invitationToken) {
    content = (
      <InvitationAccept
        token={invitationToken}
        onDone={(notice) => {
          window.history.replaceState({}, '', '/');
          setInvitationToken(null);
          signOut(notice);
        }}
      />
    );
  } else if (!session) {
    content = <VendorLogin notice={loginNotice} onSignedIn={async (next) => { await saveSession(next); setLoginNotice(null); setSession(next); }} />;
  } else {
    content = <VendorWorkspace key={session.token} session={session} onSignOut={signOut} />;
  }

  return (
    <>
      {storageError && <div role="alert" className="offline-banner">Local save failed: {storageError} Keep this page open until your work is saved.<button className="btn btn-secondary btn-sm" onClick={() => setStorageError('')}>Dismiss</button></div>}
      {content}
      <PwaUpdatePrompt />
    </>
  );
};

const VendorWorkspace: React.FC<{ session: VendorSession; onSignOut: (notice: string | null) => void }> = ({ session, onSignOut }) => {
  const token = session.token;
  const [overview, setOverview] = useState<VendorOverview | null>(null);
  const [notices, setNotices] = useState<LegalNotice[]>([]);
  const [loadError, setLoadError] = useState('');
  const [storeId, setStoreId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [srp, setSrp] = useState<SrpCatalog | null>(null);
  const [srpError, setSrpError] = useState('');
  const [advisories, setAdvisories] = useState<Advisory[] | null>(null);
  const [advisoriesError, setAdvisoriesError] = useState('');
  // Open views keep only the notice id and read the current record, so a refresh (delivery recorded,
  // deadline changed, notice closed, store unlinked) is reflected in an open detail or draft immediately.
  const [selectedNoticeId, setSelectedNoticeId] = useState<number | null>(null);
  const [respondingToId, setRespondingToId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [reachability, setReachability] = useState<'reachable' | 'unavailable' | 'authorization'>('unavailable');
  // Refreshes overlap (foreground, reconnect, tab entry, after submitting); only each resource's newest request may apply.
  const coreRequest = useRef(0);
  const srpRequest = useRef(0);
  const advisoriesRequest = useRef(0);

  const selectedNotice = notices.find((notice) => notice.id === selectedNoticeId) ?? null;
  const respondingTo = notices.find((notice) => notice.id === respondingToId) ?? null;
  const setSelectedNotice = (notice: LegalNotice | null) => setSelectedNoticeId(notice?.id ?? null);
  const setRespondingTo = (notice: LegalNotice | null) => setRespondingToId(notice?.id ?? null);

  /** Rethrows after signing out when the session is no longer valid, so callers stop their own work. */
  const guard = useCallback((error: unknown) => {
    if (isSessionInvalid(error)) onSignOut('Your session ended. Sign in again to continue.');
    throw error;
  }, [onSignOut]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadCore = useCallback(async () => {
    const request = ++coreRequest.current;
    setLoadError('');
    try {
      const results = await Promise.allSettled([
        (async () => {
          const nextOverview = await vendorApi.overview(token);
          if (request !== coreRequest.current) return;
          setOverview(nextOverview);
          setStoreId((current) => nextOverview.stores.some((store) => store.id === current) ? current : nextOverview.stores[0]?.id ?? null);
        })(),
        (async () => {
          const nextNotices = await vendorApi.notices(token);
          if (request !== coreRequest.current) return;
          setNotices(nextNotices);
        })(),
      ]);
      if (request !== coreRequest.current) return;
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } catch (error) {
      if (request !== coreRequest.current) return;
      if (isSessionInvalid(error)) return onSignOut('Your session ended. Sign in again to continue.');
      setLoadError(apiError(error, 'The Vendor Portal could not load. Check your connection and try again.'));
    }
  }, [token, onSignOut]);

  const loadSrp = useCallback(async () => {
    const request = ++srpRequest.current;
    setSrpError('');
    try {
      const catalog = await vendorApi.srp(token);
      if (request === srpRequest.current) setSrp(catalog);
    } catch (error) {
      if (request !== srpRequest.current) return;
      if (isSessionInvalid(error)) return onSignOut('Your session ended. Sign in again to continue.');
      setSrpError(apiError(error, 'Price references could not load.'));
    }
  }, [token, onSignOut]);

  const loadAdvisories = useCallback(async () => {
    const request = ++advisoriesRequest.current;
    setAdvisoriesError('');
    try {
      const list = await vendorApi.advisories(token);
      if (request === advisoriesRequest.current) setAdvisories(list);
    } catch (error) {
      if (request !== advisoriesRequest.current) return;
      if (isSessionInvalid(error)) return onSignOut('Your session ended. Sign in again to continue.');
      setAdvisoriesError(apiError(error, 'Advisories could not load.'));
    }
  }, [token, onSignOut]);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      await Promise.allSettled([
        snapshot<VendorOverview>(token, 'overview').then((saved) => { if (active && saved) { setOverview(saved.data); setStoreId(saved.data.stores[0]?.id ?? null); } }),
        snapshot<LegalNotice[]>(token, 'notices').then((saved) => { if (active && saved) setNotices(saved.data); }),
        snapshot<SrpCatalog>(token, 'srp').then((saved) => { if (active && saved) setSrp(saved.data); }),
        snapshot<Advisory[]>(token, 'advisories').then((saved) => { if (active && saved) setAdvisories(saved.data); }),
      ]);
      if (active) { void loadCore(); void loadSrp(); void loadAdvisories(); }
    };
    void hydrate();
    return () => { active = false; coreRequest.current++; srpRequest.current++; advisoriesRequest.current++; };
  }, [token, loadCore, loadSrp, loadAdvisories]);

  useEffect(() => {
    const changed = (event: Event) => { const detail = (event as CustomEvent<{ token: string; state: typeof reachability }>).detail; if (detail.token === token) { setReachability(detail.state); if (detail.state === 'authorization') onSignOut('Authorization required. Your saved work is retained. Sign in to the same account.'); } };
    window.addEventListener('vendor-connectivity', changed);
    return () => window.removeEventListener('vendor-connectivity', changed);
  }, [token, onSignOut]);

  useEffect(() => {
    registerSession(session);
    void navigator.storage?.persist?.().then((granted) => { if (!granted) showToast('Persistent storage was not granted. This browser may remove saved data.'); }).catch(storageFailure);
    const tick = () => { if (document.visibilityState === 'visible') void synchronize(token).catch(storageFailure); };
    tick();
    const timer = window.setInterval(tick, 5000);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', tick); };
  }, [token]);

  useEffect(() => {
    const accepted = (event: Event) => {
      const detail = (event as CustomEvent<{ token: string; operation: string; result: LegalNotice }>).detail;
      if (detail.token !== token) return;
      if (detail.operation === 'response') { coreRequest.current++; setNotices((current) => current.map((notice) => notice.id === detail.result.id ? detail.result : notice)); }
    };
    window.addEventListener('vendor-delivered', accepted);
    return () => window.removeEventListener('vendor-delivered', accepted);
  }, [token]);

  useEffect(() => {
    const prepare = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      void Promise.allSettled([
        loadSrp(),
        loadAdvisories(),
        (async () => { await vendorApi.preferences(token); })(),
        ...(overview?.stores ?? []).map(async (item) => { await vendorApi.conversation(token, item.id, undefined, false); }),
      ]);
    };
    prepare();
    window.addEventListener('online', prepare);
    document.addEventListener('visibilitychange', prepare);
    return () => { window.removeEventListener('online', prepare); document.removeEventListener('visibilitychange', prepare); };
  }, [token, overview?.stores, loadSrp, loadAdvisories]);
  // New DTI messages and notices surface on every tab. Messages polls only its open thread, so the bell
  // would miss another linked store's notices and messages if this stopped there.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void loadCore();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadCore]);
  // canRespond depends on the clock, and the poll above does not run offline: re-render at the nearest
  // response deadline so the bell, the alerts and the respond actions drop an expired notice on time.
  useEffect(() => {
    const now = Date.now();
    const next = Math.min(...notices
      .filter((notice) => notice.status === 'issued' && notice.due_date_timestamp)
      .map((notice) => new Date(notice.due_date_timestamp as string).getTime())
      .filter((due) => due > now));
    if (!Number.isFinite(next)) return;
    // setTimeout overflows past 2^31-1 ms; a clamped timer fires early and this effect schedules the rest.
    const timer = window.setTimeout(() => setClock((tick) => tick + 1), Math.min(next - now, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [notices, clock]);
  // Revalidate on every tab entry; the last loaded data stays visible while the refresh runs.
  useEffect(() => { if (activeTab === 'srp') void loadSrp(); }, [activeTab, loadSrp]);
  useEffect(() => { if (activeTab === 'advisories') void loadAdvisories(); }, [activeTab, loadAdvisories]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    // An installed PWA can sit in the background for days: refresh notices, deadlines, and references when it returns.
    const revalidate = () => {
      update();
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      void loadCore();
      if (activeTab === 'srp') void loadSrp();
      if (activeTab === 'advisories') void loadAdvisories();
    };
    window.addEventListener('online', revalidate);
    window.addEventListener('offline', update);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('online', revalidate);
      window.removeEventListener('offline', update);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [activeTab, loadCore, loadSrp, loadAdvisories]);

  const store = overview?.stores.find((candidate) => candidate.id === storeId) ?? null;
  const storeNotices = useMemo(() => notices.filter((notice) => notice.store_id === storeId), [notices, storeId]);
  const openNotices = storeNotices.filter((notice) => !isFinished(notice));
  const activeNotice = openNotices.find((notice) => canRespond(notice)) ?? openNotices[0] ?? null;
  // The tab badge counts every linked store, so a message to another store is not missed.
  const unreadMessages = overview?.stores.reduce((total, item) => total + (item.unread_messages ?? 0), 0) ?? 0;

  const logout = async () => {
    try {
      await flushWrites();
      if (await hasUnresolvedWork(session.user.id)) { setActiveTab('profile'); showToast('Review or explicitly discard saved drafts and pending submissions before signing out.'); return; }
    } catch (error) { storageFailure(error); return; }
    onSignOut('You have signed out.');
    void vendorApi.logout(token).catch(() => { /* Local sign-out must not wait for network access. */ });
  };

  const openDocument = async (notice: LegalNotice) => {
    // Open the window synchronously so mobile browsers do not block it as a popup.
    const opened = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await vendorApi.document(token, notice.id));
      if (opened) opened.location.href = url; else window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      // For portal delivery, the first open records receipt and starts the deadline; show it right away.
      void loadCore();
    } catch (error) {
      opened?.close();
      if (isSessionInvalid(error)) onSignOut('Your session ended. Sign in again to continue.');
      throw new Error(apiError(error, 'The official document is not available yet.'));
    }
  };

  const submitResponse = async (notice: LegalNotice, draft: ResponseDraft, revision?: string) => {
    try {
      await enqueue(token, 'response', notice.id, notice.store_id, draft, revision);
      setRespondingTo(null);
      setActiveTab('rebuttals');
      showToast('Response saved for delivery. It is received by DTI only after server acceptance.');
      void synchronize(token).catch(storageFailure);
    } catch (error) {
      guard(error);
    }
  };

  const loadPreferences = useCallback(async (): Promise<NotificationSettings> => {
    try { return await vendorApi.preferences(token); }
    catch (error) { return guard(error); }
  }, [token, guard]);

  const savePreferences = async (settings: NotificationSettings) => {
    try {
      await vendorApi.savePreferences(token, settings);
      showToast('Notification preferences saved.');
    } catch (error) {
      guard(error);
    }
  };

  const changePassword = async (currentPassword: string, password: string) => {
    try {
      await vendorApi.changePassword(token, currentPassword, password);
      showToast('Password changed.');
    } catch (error) {
      guard(error);
    }
  };

  const closeAlerts = useCallback(() => setAlertsOpen(false), []);
  const endSession = useCallback(() => onSignOut('Your session ended. Sign in again to continue.'), [onSignOut]);
  const refreshAfterRead = useCallback(() => { void loadCore(); }, [loadCore]);

  const transition = async (action: () => void): Promise<boolean> => {
    try { await flushWrites(); action(); return true; }
    catch (error) { storageFailure(error); return false; }
  };

  const startResponse = async (notice: LegalNotice) => {
    await transition(() => { setRespondingTo(notice); setActiveTab('rebuttals'); });
  };

  const changeStore = async (id: number) => {
    await transition(() => { setStoreId(id); setRespondingTo(null); setActiveTab('overview'); });
  };

  const changeTab = async (tab: ActiveTab) => {
    return transition(() => { setActiveTab(tab); if (tab !== 'rebuttals') setRespondingTo(null); });
  };

  const openAlertNotice = async (notice: LegalNotice) => {
    // Leave Communications before changing the store: its thread fetch marks that store's DTI messages read.
    if (!await changeTab('notices')) return;
    setStoreId(notice.store_id);
    setSelectedNotice(notice);
    setAlertsOpen(false);
  };

  const openAlertMessages = async (id: number) => {
    if (!await changeTab('messages')) return;
    setStoreId(id);
    setAlertsOpen(false);
    mainRef.current?.focus();
  };

  if (!overview) {
    return (
      <div className="vendor-app vendor-loading-screen">
        <div className="v-card portal-status" role={loadError ? 'alert' : 'status'}>
          {loadError ? (
            <div className="portal-error-card-content">
              <div className="portal-error-icon-badge">
                <AlertCircle size={32} color="var(--danger-color)" />
              </div>
              <h2 className="portal-status-title">Unable to Load Establishment</h2>
              <p className="portal-status-text">{loadError}</p>
              <div className="portal-status-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void loadCore()}>
                  <RotateCw size={14} />
                  <span>Retry</span>
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void logout()}>
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="portal-loading-body">
              <div className="portal-loading-seal-wrap">
                <img src="/branding/dti-logo.svg" alt="DTI Official Seal" className="portal-loading-logo" />
                <div className="portal-loading-spinner-ring" aria-hidden="true" />
              </div>
              <h2 className="portal-loading-title">Loading your establishment…</h2>
              <p className="portal-loading-desc">
                Synchronizing store profile, compliance records, and active regulatory notices.
              </p>
              <div className="portal-loading-bar-wrap" aria-hidden="true">
                <div className="portal-loading-bar-fill" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Alerts cover every linked store, unlike the tab badges, which follow the active store.
  const alertNotices = notices.filter((notice) => needsVendorAction(notice) && overview.stores.some((item) => item.id === notice.store_id));
  const alertCount = alertNotices.length + unreadMessages;
  const alertsLabel = alertCount > 0 ? `Alerts, ${alertCount} new` : 'Alerts';

  return (
    <div className="vendor-app">
      <VendorSidebar
        stores={overview.stores}
        activeStoreId={storeId}
        activeTab={activeTab}
        onTabChange={changeTab}
        pendingNoticeCount={openNotices.length}
        unreadMessageCount={unreadMessages}
        userName={overview.user.name}
        onSelectStore={(id) => void changeStore(id)}
      />

      <div className="vendor-main-wrapper">
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            <span>You are offline. Showing saved information. Explicitly submitted work will wait for delivery.</span>
          </div>
        )}

        {loadError && (
          <div className="offline-banner" role="alert">
            <AlertCircle size={15} />
            <span>{loadError} Showing the last loaded information.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadCore()}>Retry</button>
          </div>
        )}

        <VendorNavbar
          stores={overview.stores}
          activeStoreId={storeId}
          online={online}
          alertCount={alertCount}
          userName={overview.user.name}
          profileActive={activeTab === 'profile'}
          onSelectStore={(id) => void changeStore(id)}
          onOpenAlerts={() => setAlertsOpen(true)}
          onOpenProfile={() => changeTab('profile')}
        />

        <header className="vendor-content-toolbar">
          <strong>{TAB_TITLES[activeTab]}</strong>
          <span className={online ? 'online' : ''}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            {online ? (reachability === 'reachable' ? 'Connected to DTI' : 'Server unavailable · Showing saved data') : 'Offline · Showing saved data'}
          </span>
          <button type="button" className="toolbar-icon-btn" aria-label={alertsLabel} onClick={() => setAlertsOpen(true)}>
            <Bell size={19} />
            {alertCount > 0 && <span className="icon-count" aria-hidden="true">{alertCount}</span>}
          </button>
        </header>

        {toast && (
          <div role="status" className="vendor-toast">
            <CheckCircle2 size={16} color="#4ADE80" />
            <span>{toast}</span>
          </div>
        )}

        <main ref={mainRef} tabIndex={-1} className={`vendor-content ${activeTab === 'overview' ? 'vendor-content--dashboard' : ''} ${activeTab === 'messages' ? 'vendor-content--messages' : ''}`}>
          {(activeTab === 'profile' || activeTab === 'rebuttals' || activeTab === 'notices') && <LocalWork token={token} storeId={activeTab === 'profile' ? undefined : storeId ?? undefined} operation={activeTab === 'profile' ? undefined : 'response'} hideDraftKey={respondingToId ? `response/${respondingToId}` : undefined} onResume={(target, kind) => { void transition(() => { if (kind === 'message') { setStoreId(target); setActiveTab('messages'); } else { const notice = notices.find((item) => item.id === target); if (notice) setStoreId(notice.store_id); setRespondingToId(target); setActiveTab('rebuttals'); } }); }} />}
          {activeTab === 'profile' ? (
            // Outside the establishment check: an account with no linked store must still reach Sign out.
            <VendorProfile
              user={overview.user}
              store={store}
              onSaveRepresentative={async (id, details) => {
                try {
                  const saved = await vendorApi.saveRepresentative(token, id, details);
                  coreRequest.current++;
                  setOverview((current) => current ? { ...current, stores: current.stores.map((item) => item.id === id ? { ...item, current_representative: saved } : item) } : current);
                  showToast('Current establishment representative saved.');
                } catch (error) { guard(error); }
              }}
              onOpenNotifications={() => setSettingsOpen(true)}
              onChangePassword={changePassword}
              onLogout={() => void logout()}
            />
          ) : !store ? (
            <div className="v-card portal-status">
              <p><strong>No establishment is linked to this account.</strong></p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px' }}>Ask DTI Antique to send an invitation for your establishment.</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <ComplianceScorecard
                  store={store}
                  emergency={overview.emergency}
                  activeNoticeCount={openNotices.length}
                  onNavigateTab={setActiveTab}
                  activeNotice={activeNotice}
                  onViewNotice={setSelectedNotice}
                  onRespondNotice={startResponse}
                />
              )}

              {activeTab === 'notices' && (
                <NoticeList
                  notices={storeNotices}
                  onViewNotice={setSelectedNotice}
                  onRespondNotice={startResponse}
                  onNavigateRebuttals={() => setActiveTab('rebuttals')}
                />
              )}

              {activeTab === 'rebuttals' && (respondingToId !== null && !respondingTo ? (
                <div className="v-card portal-status" role="alert">
                  <p><strong>This notice is no longer available to this account.</strong></p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '6px' }}>It may have been withdrawn or your establishment link changed. Contact DTI Antique if you still need to respond.</p>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }} onClick={() => setRespondingTo(null)}>Return</button>
                </div>
              ) : respondingTo ? (
                <RebuttalWizard
                  key={respondingTo.id}
                  accountId={session.user.id}
                  notice={respondingTo}
                  onCancel={() => { void transition(() => setRespondingTo(null)); }}
                  onSubmit={(draft, revision) => submitResponse(respondingTo, draft, revision)}
                />
              ) : (
                <RebuttalHistory
                  notices={storeNotices}
                  onViewNotice={setSelectedNotice}
                  onStartNewRebuttal={() => {
                    const next = storeNotices.find((notice) => canRespond(notice));
                    if (next) startResponse(next);
                    else showToast('No notice is currently open for a response.');
                  }}
                  onBackToNotices={() => setActiveTab('notices')}
                />
              ))}

              {activeTab === 'messages' && (
                // Keyed by store: an alert can change the store while this stays open, and a draft or attachment
                // written for one establishment must never be sent to another.
                <MessagesView key={store.id} token={token} storeId={store.id} onSessionInvalid={endSession} onRead={refreshAfterRead} onViewNotice={(id) => {
                  setSelectedNoticeId(id);
                  if (!notices.some((notice) => notice.id === id)) void loadCore();
                }} />
              )}

              {activeTab === 'srp' && <SrpDirectory catalog={srp} error={srpError} onRetry={() => void loadSrp()} />}

              {activeTab === 'advisories' && (
                <AdvisoriesView advisories={advisories} emergency={overview.emergency} error={advisoriesError} onRetry={() => void loadAdvisories()} />
              )}
            </>
          )}
        </main>
      </div>

      <NoticeDetailModal notice={selectedNotice} onClose={() => setSelectedNotice(null)} onStartRebuttal={startResponse} onOpenDocument={openDocument} />

      <NotificationSettingsModal isOpen={settingsOpen} load={loadPreferences} onClose={() => setSettingsOpen(false)} onSave={savePreferences} />

      {alertsOpen && (
        <AlertsDrawer notices={alertNotices} stores={overview.stores} onClose={closeAlerts} onOpenNotice={openAlertNotice} onOpenMessages={openAlertMessages} />
      )}

      <VendorBottomNav
        activeTab={activeTab}
        onTabChange={changeTab}
        pendingNoticeCount={openNotices.length}
        unreadMessageCount={unreadMessages}
      />
    </div>
  );
};

export default App;
