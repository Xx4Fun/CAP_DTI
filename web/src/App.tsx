import { useState, useEffect, useCallback, useRef } from 'react';
import { Login, type ServerStatus } from './components/Login';
import { VendorPortal } from './components/VendorPortal';
import { AdminShell } from './components/admin/AdminShell';
import { VendorInvitationAccept } from './components/VendorInvitationAccept';
import type { AdminUser } from './types/admin';
import {
  clearAdminSession,
  getAdminLastActivity,
  getAdminSessionState,
  getAdminToken,
  storeAdminToken,
  touchAdminActivity,
} from './services/adminSession';
import api from './services/api';
import { ensureApiReady } from './services/apiReadiness';
import 'leaflet/dist/leaflet.css';
import './admin-preflight.css';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'dti_evaluator' | 'field_officer' | 'vendor' | 'consumer';
}

interface SessionMetadata {
  expires_at: string | null;
  idle_timeout_seconds: number;
  absolute_timeout_seconds: number;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionMetadata | null>(null);
  const [booting, setBooting] = useState(() => Boolean(getAdminToken()));
  const [sessionWarning, setSessionWarning] = useState(false);
  const [reauthenticationOpen, setReauthenticationOpen] = useState(false);
  const [reauthenticationError, setReauthenticationError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const logoutInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    const startingTimer = window.setTimeout(() => {
      if (active) setServerStatus('starting');
    }, 2_000);

    void ensureApiReady().then(() => {
      window.clearTimeout(startingTimer);
      if (active) setServerStatus('ready');
    }).catch(() => {
      window.clearTimeout(startingTimer);
      if (active) setServerStatus('unavailable');
    });

    return () => {
      active = false;
      window.clearTimeout(startingTimer);
    };
  }, []);

  useEffect(() => {
    const adminToken = getAdminToken();
    if (adminToken) {
      void ensureApiReady().then(() => api.get('/admin/session')).then((response) => {
        setUser(response.data.data.user);
        setSession(response.data.data.session);
        touchAdminActivity();
      }).catch((error) => {
        if (error.response?.status === 401) {
          clearAdminSession();
          setLoginNotice('Your secure session expired. Sign in again to continue.');
          return;
        }

        setLoginNotice('The secure server is temporarily unavailable. Your session was not changed.');
      }).finally(() => setBooting(false));
      return;
    }

    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        if (['vendor', 'consumer'].includes(parsed.role)) {
          setUser(parsed);
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setBooting(false);
  }, []);

  const handleLoginSuccess = (result: { token: string; user: User; session?: SessionMetadata }) => {
    const isDtiUser = ['super_admin', 'dti_evaluator', 'field_officer'].includes(result.user.role);
    if (isDtiUser) {
      storeAdminToken(result.token);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setSession(result.session || null);
    } else {
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
    }
    setLoginNotice('');
    setUser(result.user);
  };

  const handleLogout = useCallback(async (
    reason: 'manual' | 'inactivity' | 'expired' | 'remote' = 'manual',
    broadcast = true,
  ) => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    try {
      if (getAdminToken() || localStorage.getItem('token')) {
        await api.post('/logout');
      }
    } catch {
      // Local lock still occurs if the network is unavailable; server expiry remains authoritative.
    } finally {
      clearAdminSession();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setSession(null);
      setSessionWarning(false);
      setLoginNotice(
        reason === 'inactivity'
          ? 'You were logged out due to inactivity. Sign in again to continue.'
          : reason === 'expired'
            ? 'Your secure session expired. Sign in again to continue.'
            : reason === 'remote'
              ? 'Your session was closed in another tab.'
              : '',
      );
      document.body.classList.remove('calamity-mode');
      if (broadcast === true && typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('price-watch-auth');
        channel.postMessage({ type: 'logout' });
        channel.close();
      }
      logoutInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    const isDtiUser = user && ['super_admin', 'dti_evaluator', 'field_officer'].includes(user.role);
    if (!isDtiUser || !session) return;

    const noteActivity = () => {
      touchAdminActivity();
      setSessionWarning(false);
    };
    const checkSession = () => {
      const state = getAdminSessionState(
        getAdminLastActivity(),
        Date.now(),
        session.idle_timeout_seconds,
      );
      setSessionWarning(state === 'warning');
      if (state === 'expired') void handleLogout('inactivity');
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkSession();
    };
    const onExpired = (event: Event) => {
      const reason = event instanceof CustomEvent && event.detail?.reason === 'inactivity'
        ? 'inactivity'
        : 'expired';
      void handleLogout(reason);
    };
    const onReauthenticationRequired = () => {
      setReauthenticationError('');
      setReauthenticationOpen(true);
    };
    const activityEvents = ['pointerdown', 'keydown', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, noteActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('admin-auth-expired', onExpired);
    window.addEventListener('admin-reauthentication-required', onReauthenticationRequired);
    const checkTimer = window.setInterval(checkSession, 1_000);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible'
        && getAdminSessionState(getAdminLastActivity(), Date.now(), session.idle_timeout_seconds) !== 'expired') {
        void api.get('/admin/session');
      }
    }, 4 * 60_000);
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('price-watch-auth')
      : null;
    if (channel) channel.onmessage = () => {
      if (getAdminToken()) void handleLogout('remote', false);
    };

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, noteActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('admin-auth-expired', onExpired);
      window.removeEventListener('admin-reauthentication-required', onReauthenticationRequired);
      window.clearInterval(checkTimer);
      window.clearInterval(heartbeat);
      channel?.close();
    };
  }, [handleLogout, session, user]);

  const invitationToken = new URLSearchParams(window.location.search).get('token');
  if (window.location.pathname === '/vendor-invitation' && invitationToken) {
    return <VendorInvitationAccept token={invitationToken} />;
  }

  if (booting) {
    return <div className='admin-session-boot' role='status'>Checking secure session...</div>;
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} notice={loginNotice} serverStatus={serverStatus} />;
  }

  // Determine view based on role
  const isDTIUser = ['super_admin', 'dti_evaluator', 'field_officer'].includes(user.role);

  if (isDTIUser) {
    return (
      <div className="admin-app-wrapper">
        <AdminShell user={user as AdminUser} onLogout={() => void handleLogout('manual')} />
        {sessionWarning && (
          <div className="session-warning-dialog" role="alertdialog" aria-modal="true" aria-labelledby="session-warning-title">
            <div className="session-warning-card">
              <div className="session-warning-header">
                <div className="session-warning-icon">
                  <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="session-warning-title">Session Locking Soon</h2>
                  <p className="session-warning-subtitle">Inactivity Timeout Warning</p>
                </div>
              </div>
              <p className="session-warning-body">
                Your DTI Admin session will lock automatically after 15 minutes of inactivity to protect regulatory data.
              </p>
              <div className="session-warning-status">
                <span className="warning-status-dot" />
                <span>Locking soon due to inactivity</span>
              </div>
              <div className="session-warning-actions">
                <button
                  type="button"
                  className="session-btn-primary"
                  onClick={() => {
                    touchAdminActivity();
                    setSessionWarning(false);
                    void api.get('/admin/session');
                  }}
                >
                  <i className="fa-solid fa-shield-halved" aria-hidden="true" /> Stay signed in
                </button>
                <button
                  type="button"
                  className="session-btn-secondary"
                  onClick={() => void handleLogout('manual')}
                >
                  <i className="fa-solid fa-lock" aria-hidden="true" /> Lock now
                </button>
              </div>
            </div>
          </div>
        )}
        {reauthenticationOpen && (
          <div className="session-warning-dialog" role="dialog" aria-modal="true" aria-labelledby="reauthentication-title">
            <form
              className="session-warning-card"
              style={{ borderTopColor: '#1d4ed8' }}
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  await api.post('/admin/reauthenticate', { password: String(form.get('password')) });
                  setReauthenticationOpen(false);
                  setReauthenticationError('');
                  touchAdminActivity();
                } catch (error: any) {
                  setReauthenticationError(error.response?.data?.message || 'Password confirmation failed.');
                }
              }}
            >
              <div className="session-warning-header">
                <div className="session-warning-icon reauth">
                  <i className="fa-solid fa-user-shield" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="reauthentication-title">Confirm sensitive action</h2>
                  <p className="session-warning-subtitle">Security Verification Required</p>
                </div>
              </div>
              <p className="session-warning-body">
                Enter your DTI Officer password to authorize this action. Confirmation remains valid briefly.
              </p>
              <div className="session-form-group">
                <label htmlFor="admin-reauthentication-password">Password</label>
                <input
                  id="admin-reauthentication-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                  placeholder="Enter your password..."
                />
              </div>
              {reauthenticationError && <p className="session-error-alert" role="alert">{reauthenticationError}</p>}
              <div className="session-warning-actions">
                <button type="submit" className="session-btn-primary">
                  <i className="fa-solid fa-check" aria-hidden="true" /> Confirm identity
                </button>
                <button type="button" className="session-btn-secondary" onClick={() => setReauthenticationOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Header for non-DTI users */}
      <header className="header glass">
        <div className="header-brand">
          <div className="logo-pulse"></div>
          <div className="app-title">PRICE-Watch</div>
          <span className="app-badge">Antique Office</span>
        </div>

        <div className="header-user-menu">
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className="user-role">{user.role.toUpperCase().replace('_', ' ')}</span>
          </div>
          <button onClick={() => void handleLogout('manual')} className="btn-secondary logout-btn">
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="content-area">
        {user.role === 'vendor' ? (
          <VendorPortal />
        ) : (
          <div className="glass empty-state-card" style={{ padding: '40px', textAlign: 'center' }}>
            <h2>Citizen Portal</h2>
            <p>Citizen receipt scanning and submission features are accessible via the mobile edge nodes.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer text-muted" style={{ padding: '20px 0', textAlign: 'center', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} DTI Antique PRICE-Watch. SEC Secure Off-line Synchronized Price Regulatory System.
      </footer>
    </div>
  );
}

export default App;
