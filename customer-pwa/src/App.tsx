import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { OfflineBanner } from './components/OfflineBanner';
import { Home } from './components/Home';
import { SrpSearch } from './components/SrpSearch';
import { ShelfScanner } from './components/ShelfScanner';
import { FormalReport } from './components/FormalReport';
import { TrackReport } from './components/TrackReport';
import { apiClient, type SystemConfig } from './api/client';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [trackingParams, setTrackingParams] = useState<{ reference: string; token: string } | null>(null);

  useEffect(() => {
    fetchConfig();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await apiClient.get('/public/config');
      if (res.data.success) {
        setConfig(res.data.data);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Offline or unable to fetch system config:', err);
    }
  };

  const isScanTab = activeTab === 'scan' || activeTab === 'shelf-scanner';

  return (
    <div>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stateOfCalamity={config?.state_of_calamity || false}
      />

      <main className={isScanTab ? 'app-scan-container' : 'app-container'}>
        {!isScanTab && <OfflineBanner isOffline={isOffline} lastSyncTime={lastSyncTime} />}

        {activeTab === 'home' && (
          <Home
            setActiveTab={setActiveTab}
            stateOfCalamity={config?.state_of_calamity || false}
          />
        )}

        {(activeTab === 'prices' || activeTab === 'search' || activeTab === 'stores') && (
          <SrpSearch
            setActiveTab={setActiveTab}
            stateOfCalamity={config?.state_of_calamity || false}
          />
        )}

        {(activeTab === 'scan' || activeTab === 'shelf-scanner') && (
          <ShelfScanner setActiveTab={setActiveTab} />
        )}

        {(activeTab === 'reports' || activeTab === 'report') && (
          <FormalReport
            setActiveTab={setActiveTab}
            onTrackReport={(ref, tok) => {
              setTrackingParams({ reference: ref, token: tok });
              setActiveTab('track');
            }}
          />
        )}

        {activeTab === 'track' && (
          <TrackReport
            initialReference={trackingParams?.reference}
            initialToken={trackingParams?.token}
            setActiveTab={setActiveTab}
          />
        )}
      </main>
    </div>
  );
};

export default App;
