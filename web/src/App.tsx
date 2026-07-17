import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { StoreOnboarding } from './components/StoreOnboarding';
import { VendorPortal } from './components/VendorPortal';
import 'leaflet/dist/leaflet.css';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'dti_evaluator' | 'field_officer' | 'vendor' | 'consumer';
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'onboarding'>('dashboard');

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
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    document.body.classList.remove('calamity-mode');
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Determine view based on role
  const isDTIUser = ['super_admin', 'dti_evaluator', 'field_officer'].includes(user.role);

  return (
    <div className="app-layout">
      {/* Premium Header */}
      <header className="header glass">
        <div className="header-brand">
          <div className="logo-pulse"></div>
          <h1>PRICE-Watch</h1>
          <span className="app-badge">Antique Office</span>
        </div>

        {isDTIUser && (
          <nav className="header-nav">
            <button 
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard & Volatility
            </button>
            <button 
              className={`nav-link ${activeTab === 'onboarding' ? 'active' : ''}`}
              onClick={() => setActiveTab('onboarding')}
            >
              GIS Store Onboarding
            </button>
          </nav>
        )}

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
        {isDTIUser ? (
          activeTab === 'dashboard' ? <Dashboard /> : <StoreOnboarding />
        ) : user.role === 'vendor' ? (
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
