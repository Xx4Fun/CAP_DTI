import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, RotateCw, Wifi, WifiOff } from 'lucide-react';
import type { ActiveTab, Advisory, LegalNotice, NotificationSettings, ResponseDraft, SrpCatalog, VendorOverview, VendorSession } from './app/types';
import { canRespond, isFinished } from './app/rules';
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

const TAB_TITLES: Record<ActiveTab, string> = {
  overview: 'Dashboard',
  notices: 'Legal Notices',
  messages: 'Communications',
  rebuttals: 'Response & Rebuttal',
  srp: 'Official SRP Catalog',
  advisories: 'DTI Bulletins',
};

const invitationTokenFromUrl = () => window.location.pathname === '/vendor-invitation'
  ? new URLSearchParams(window.location.search).get('token')
  : null;

export const App: React.FC = () => {
  const [invitationToken, setInvitationToken] = useState(invitationTokenFromUrl);
  const [session, setSession] = useState<VendorSession | null>(loadSession);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);

  const signOut = useCallback((notice: string | null) => {
    clearSession();
    setSession(null);
    setLoginNotice(notice);
  }, []);

  let content: React.ReactNode;
  if (invitationToken) {
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
    content = <VendorLogin notice={loginNotice} onSignedIn={(next) => { saveSession(next); setLoginNotice(null); setSession(next); }} />;
  } else {
    content = <VendorWorkspace key={session.token} session={session} onSignOut={signOut} />;
  }

  return (
    <>
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
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
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
      const [nextOverview, nextNotices] = await Promise.all([vendorApi.overview(token), vendorApi.notices(token)]);
      if (request !== coreRequest.current) return;
      setOverview(nextOverview);
      setNotices(nextNotices);
      setStoreId((current) => nextOverview.stores.some((store) => store.id === current) ? current : nextOverview.stores[0]?.id ?? null);
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

  useEffect(() => { void loadCore(); }, [loadCore]);
  // New DTI messages and notices surface on every tab, not only Messages (which polls its own thread).
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine && activeTab !== 'messages') void loadCore();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadCore]);
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

  const logout = () => {
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

  const submitResponse = async (notice: LegalNotice, draft: ResponseDraft) => {
    try {
      const updated = await vendorApi.respond(token, notice.id, draft);
      // Any notices read started before the submission is now stale and must not overwrite this result.
      coreRequest.current++;
      setNotices((current) => current.map((item) => item.id === updated.id ? updated : item));
      setRespondingTo(null);
      setActiveTab('rebuttals');
      showToast(`Response to ${updated.control_number ?? 'the notice'} was submitted to DTI Antique.`);
      void loadCore();
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

  const endSession = useCallback(() => onSignOut('Your session ended. Sign in again to continue.'), [onSignOut]);
  const refreshAfterRead = useCallback(() => { void loadCore(); }, [loadCore]);

  const startResponse = (notice: LegalNotice) => {
    setRespondingTo(notice);
    setActiveTab('rebuttals');
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

  return (
    <div className="vendor-app">
      <VendorSidebar
        stores={overview.stores}
        activeStoreId={storeId}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'rebuttals') setRespondingTo(null);
        }}
        pendingNoticeCount={openNotices.length}
        unreadMessageCount={unreadMessages}
        online={online}
        hasPendingNotices={openNotices.length > 0}
        onSelectStore={(id) => { setStoreId(id); setRespondingTo(null); setActiveTab('overview'); }}
        onOpenNotifications={() => setSettingsOpen(true)}
        onLogout={() => void logout()}
      />

      <div className="vendor-main-wrapper">
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={15} />
            <span>You are offline. Showing the last loaded information; responses need a connection.</span>
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
          hasPendingNotices={openNotices.length > 0}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab !== 'rebuttals') setRespondingTo(null);
          }}
          pendingNoticeCount={openNotices.length}
          unreadMessageCount={unreadMessages}
          online={online}
          onSelectStore={(id) => { setStoreId(id); setRespondingTo(null); setActiveTab('overview'); }}
          onOpenNotifications={() => setSettingsOpen(true)}
          onLogout={() => void logout()}
        />

        <header className="vendor-content-toolbar">
          <strong>{TAB_TITLES[activeTab]}</strong>
          <span className={online ? 'online' : ''}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            {online ? 'Online · Ready' : 'Offline · Showing saved data'}
          </span>
        </header>

        {toast && (
          <div role="status" className="vendor-toast">
            <CheckCircle2 size={16} color="#4ADE80" />
            <span>{toast}</span>
          </div>
        )}

        <main className={`vendor-content ${activeTab === 'overview' ? 'vendor-content--dashboard' : ''} ${activeTab === 'messages' ? 'vendor-content--messages' : ''}`}>
          {!store ? (
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
                  notice={respondingTo}
                  onCancel={() => setRespondingTo(null)}
                  onSubmit={(draft) => submitResponse(respondingTo, draft)}
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
                <MessagesView token={token} storeId={store.id} onSessionInvalid={endSession} onRead={refreshAfterRead} onViewNotice={(id) => {
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

      <VendorBottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'rebuttals') setRespondingTo(null);
        }}
        pendingNoticeCount={openNotices.length}
        unreadMessageCount={unreadMessages}
      />
    </div>
  );
};

export default App;
