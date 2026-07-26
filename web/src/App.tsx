import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { VendorPortal } from './components/VendorPortal';
import { AdminShell } from './components/admin/AdminShell';
import { VendorInvitationAccept } from './components/VendorInvitationAccept';
import type { AdminUser } from './types/admin';
import 'leaflet/dist/leaflet.css';
import './admin-preflight.css';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'dti_evaluator' | 'field_officer' | 'vendor' | 'consumer';
}

function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check if token and user exist in local storage
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    document.body.classList.remove('calamity-mode');
  };

  const invitationToken = new URLSearchParams(window.location.search).get('token');
  if (window.location.pathname === '/vendor-invitation' && invitationToken) {
    return <VendorInvitationAccept token={invitationToken} />;
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Determine view based on role
  const isDTIUser = ['super_admin', 'dti_evaluator', 'field_officer'].includes(user.role);

  if (isDTIUser) {
    return (
      <div className="admin-app-wrapper">
        <AdminShell user={user as AdminUser} onLogout={handleLogout} />
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
          <button onClick={handleLogout} className="btn-secondary logout-btn">
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
