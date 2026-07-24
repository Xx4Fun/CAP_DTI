import { useState } from 'react';
import { ClipboardList, Home, Menu, ScanLine, Tag, X } from 'lucide-react';
import type { AppRoute } from '../app/routing';
import type { RegulatoryStatus } from '../app/status';
import { Dialog } from './ui/Dialog';
import { IconButton } from './ui/IconButton';

type NavbarProps = {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  regulatoryStatus: RegulatoryStatus;
};

const primaryItems: Array<{
  label: string;
  route: AppRoute;
  icon: typeof Home;
  active: AppRoute['name'][];
}> = [
  { label: 'Home', route: { name: 'home' }, icon: Home, active: ['home'] },
  { label: 'Prices', route: { name: 'prices' }, icon: Tag, active: ['prices', 'product'] },
  { label: 'Scan', route: { name: 'scan' }, icon: ScanLine, active: ['scan'] },
  { label: 'Reports', route: { name: 'reports' }, icon: ClipboardList, active: ['reports', 'new-report', 'track-report'] },
];

export function Navbar({ route, onNavigate, regulatoryStatus }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'how' | 'privacy' | 'about' | null>(null);

  const statusText = regulatoryStatus.kind === 'available'
    ? regulatoryStatus.config.state_of_calamity ? 'Price freeze active' : 'Current bulletin'
    : regulatoryStatus.kind === 'loading' ? 'Checking bulletin' : 'Status unavailable';

  return (
    <>
      <header className="site-header">
        <a className="brand-lockup" href="/" onClick={(event) => {
          event.preventDefault();
          onNavigate({ name: 'home' });
        }}>
          <img src="/brand-mark.webp" alt="" width="48" height="48" />
          <span>
            <strong>PRICE-<em>Watch</em></strong>
            <small>DTI Consumer Price Guide</small>
          </span>
        </a>
        <div className="header-actions">
          <span className={`bulletin-pill bulletin-pill--${regulatoryStatus.kind}`}>
            <span aria-hidden="true" />
            {statusText}
          </span>
          <IconButton label={menuOpen ? 'Close information menu' : 'Open information menu'} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </IconButton>
        </div>
      </header>

      {menuOpen && (
        <nav className="secondary-menu" aria-label="Information menu">
          <button type="button" onClick={() => { setDialog('how'); setMenuOpen(false); }}>How PRICE-Watch works</button>
          <button type="button" onClick={() => { setDialog('privacy'); setMenuOpen(false); }}>Privacy and evidence</button>
          <button type="button" onClick={() => { setDialog('about'); setMenuOpen(false); }}>About and language readiness</button>
        </nav>
      )}

      <nav className="nav-bottom" aria-label="Primary">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = item.active.includes(route.name);
          return (
            <button
              key={item.label}
              type="button"
              className={`nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.route)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={
        dialog === 'how' ? 'How PRICE-Watch works' :
          dialog === 'privacy' ? 'Privacy and evidence' :
            'About PRICE-Watch'
      }>
        {dialog === 'how' && (
          <div className="prose">
            <p>Check an official DTI reference price, compare a shelf tag, or submit a checkout receipt for human evaluation.</p>
            <ol>
              <li>Find the exact product and package size.</li>
              <li>Use Scan for an informational shelf-price comparison.</li>
              <li>Use Reports only after checkout when you have the physical receipt.</li>
            </ol>
          </div>
        )}
        {dialog === 'privacy' && (
          <div className="prose">
            <p>Receipt evidence is captured live and sent through a secure, tamper-evident workflow. Images remain in memory until submission and are not stored in this browser.</p>
            <p>Each report is reviewed by authorized DTI personnel. A comparison result alone does not confirm a violation.</p>
          </div>
        )}
        {dialog === 'about' && (
          <div className="prose">
            <p>PRICE-Watch is a consumer price-transparency service for DTI monitoring.</p>
            <p>The interface currently uses English. Filipino and regional-language support is planned.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}
