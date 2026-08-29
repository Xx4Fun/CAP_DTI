import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

export function AuthShell({ children, contentKey = 'login' }: { children: ReactNode; contentKey?: string }) {
  return <main className="login-container auth-shell">
    <div className="login-left-column">
      <img src="/branding/login-artwork.webp" alt="DTI fair trade and consumer protection illustration" className="login-artwork-img" />
    </div>
    <div className="login-right-column">
      <div className="login-card">
        <header className="login-header">
          <img src="/branding/dti-logo.svg" alt="DTI Official Logo" className="login-dti-logo" />
          <h1 className="login-title">PRICE-<span className="login-title-highlight">Watch</span></h1>
          <div className="login-subtitle-row" aria-label="DTI Field Monitoring">
            <span className="login-subtitle-line" />
            <span>— DTI Field Monitoring —</span>
            <span className="login-subtitle-line" />
          </div>
        </header>
        <section className="auth-card-content" key={contentKey}>{children}</section>
        <footer className="login-footer">
          <div className="login-footer-guarantee"><ShieldCheck size={18} className="login-shield-icon" /><span>Secure. Official. Committed to Fair Trade.</span></div>
          <div className="login-footer-tagline">Protecting Consumers. Supporting Businesses.</div>
          <div className="login-ph-bar" aria-hidden="true"><span className="login-ph-blue" /><span className="login-ph-yellow" /><span className="login-ph-red" /></div>
        </footer>
      </div>
    </div>
  </main>
}
