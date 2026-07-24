import { useEffect, useState } from 'react';
import { apiClient, type SystemConfig } from './api/client';
import { navigate, type AppRoute } from './app/routing';
import type { RegulatoryStatus } from './app/status';
import { useAppRoute } from './hooks/useAppRoute';
import { useConnectivity } from './hooks/useConnectivity';
import { ConnectivityNotice } from './components/ConnectivityNotice';
import { FormalReport } from './components/FormalReport';
import { Home } from './components/Home';
import { Navbar } from './components/Navbar';
import { ProductDetail } from './components/ProductDetail';
import { ShelfScanner } from './components/ShelfScanner';
import { SrpSearch } from './components/SrpSearch';
import { TrackReport } from './components/TrackReport';

type TrackingCredentials = { reference: string; token: string };

export default function App() {
  const route = useAppRoute();
  const isOnline = useConnectivity();
  const [regulatoryStatus, setRegulatoryStatus] = useState<RegulatoryStatus>({ kind: 'loading' });
  const [trackingCredentials, setTrackingCredentials] = useState<TrackingCredentials | null>(null);

  useEffect(() => {
    let active = true;
    setRegulatoryStatus({ kind: 'loading' });
    apiClient.get('/public/config')
      .then((response) => {
        if (!active) return;
        if (response.data?.success && response.data.data) {
          setRegulatoryStatus({ kind: 'available', config: response.data.data as SystemConfig });
        } else {
          setRegulatoryStatus({ kind: 'unavailable', reason: 'request-failed' });
        }
      })
      .catch(() => {
        if (active) setRegulatoryStatus({ kind: 'unavailable', reason: isOnline ? 'request-failed' : 'offline' });
      });
    return () => { active = false; };
  }, [isOnline]);

  const onNavigate = (next: AppRoute) => navigate(next);
  const scanRoute = route.name === 'scan';

  return (
    <div className={scanRoute ? 'app app--camera-capable' : 'app'}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Navbar route={route} onNavigate={onNavigate} regulatoryStatus={regulatoryStatus} />
      <main id="main-content" className={scanRoute ? 'app-scan-container' : 'app-container'} tabIndex={-1}>
        {!scanRoute && !isOnline && <ConnectivityNotice isOnline={false} />}
        {route.name === 'home' && <Home onNavigate={onNavigate} regulatoryStatus={regulatoryStatus} />}
        {route.name === 'prices' && <SrpSearch onNavigate={onNavigate} isOnline={isOnline} />}
        {route.name === 'product' && <ProductDetail commodityId={route.commodityId} onNavigate={onNavigate} />}
        {route.name === 'scan' && <ShelfScanner onNavigate={onNavigate} isOnline={isOnline} />}
        {(route.name === 'reports' || route.name === 'new-report') && (
          <FormalReport
            mode={route.name === 'new-report' ? 'new' : 'dashboard'}
            onNavigate={onNavigate}
            onTrackReport={(reference, token) => {
              setTrackingCredentials({ reference, token });
              onNavigate({ name: 'track-report' });
            }}
          />
        )}
        {route.name === 'track-report' && (
          <TrackReport
            initialReference={trackingCredentials?.reference}
            initialToken={trackingCredentials?.token}
            onNavigate={onNavigate}
          />
        )}
      </main>
    </div>
  );
}
