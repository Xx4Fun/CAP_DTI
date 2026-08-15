import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { InstallPrompt } from './components/InstallPrompt';
import { OfflineBanner } from './components/OfflineBanner';
import { PageLoader, type PageLoaderDestination } from './components/PageLoader';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { ServiceStartStatus } from './components/ServiceStartStatus';
import {
  apiClient,
  type Commodity,
  type FormalReportResponse,
  type SystemConfig,
  type TrackReportResponse,
} from './api/client';
import { ensureApiReady } from './api/readiness';
import { navigate, type AppRoute } from './app/routing';
import { shouldShowServiceStartStatus, type PublicDataSource } from './app/pageLoading';
import { useAppRoute } from './hooks/useAppRoute';
import { BackNavigationProvider } from './app/backNavigation';
import { useConnectivity } from './hooks/useConnectivity';
import {
  getRecentReports,
  saveRecentReport,
  toRecentReportTicket,
  type StoredRecentReport,
} from './app/recentReports';
import {
  PUBLIC_COMMODITIES_CACHE_KEY,
  PUBLIC_CONFIG_CACHE_KEY,
  PUBLIC_CONFIG_MAX_AGE_MS,
  PUBLIC_DIRECTORY_MAX_AGE_MS,
  readVerifiedCache,
  writeVerifiedCache,
} from './app/verifiedCache';

const Home = lazy(() => import('./components/Home').then((module) => ({ default: module.Home })));
const SrpSearch = lazy(() => import('./components/SrpSearch').then((module) => ({ default: module.SrpSearch })));
const ShelfScanner = lazy(() => import('./components/ShelfScanner').then((module) => ({ default: module.ShelfScanner })));
const FormalReport = lazy(() => import('./components/FormalReport').then((module) => ({ default: module.FormalReport })));
const TrackReport = lazy(() => import('./components/TrackReport').then((module) => ({ default: module.TrackReport })));

const tabForRoute = (route: AppRoute): string => {
  if (route.name === 'home') return 'home';
  if (route.name === 'prices' || route.name === 'product') return 'prices';
  if (route.name === 'scan') return 'scan';
  if (route.name === 'track-report') return 'track';
  return 'reports';
};

const routeForTab = (tab: string): AppRoute => {
  if (tab === 'prices') return { name: 'prices' };
  if (tab === 'scan') return { name: 'scan' };
  if (tab === 'track') return { name: 'track-report' };
  if (tab === 'reports') return { name: 'reports' };
  return { name: 'home' };
};

type BulletinStatus = 'loading' | 'available' | 'empty' | 'error';

interface BulletinState {
  status: BulletinStatus;
  effectiveDate?: string;
  totalCommodities?: number;
}

const pageLoaderDestination = (activeTab: string): PageLoaderDestination => {
  if (activeTab === 'prices') return 'prices';
  if (activeTab === 'scan') return 'scan';
  if (activeTab === 'reports') return 'reports';
  if (activeTab === 'track') return 'track';
  return 'home';
};

const formatBulletinDate = (value: string): string | undefined => {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
};

const toBulletinState = (commodities: Array<Pick<Commodity, 'effective_date'>>): BulletinState => {
  if (commodities.length === 0) return { status: 'empty' };

  const latestEffectiveDate = commodities
    .map((commodity) => commodity?.effective_date)
    .filter((date): date is string => typeof date === 'string' && date.length > 0)
    .sort()
    .at(-1);

  return {
    status: 'available',
    effectiveDate: latestEffectiveDate ? formatBulletinDate(latestEffectiveDate) : undefined,
    totalCommodities: commodities.length,
  };
};



export const App: React.FC = () => {
  const route = useAppRoute();
  const activeTab = tabForRoute(route);
  const isOnline = useConnectivity();
  const [initialPublicCache] = useState(() => {
    const config = readVerifiedCache<SystemConfig>(PUBLIC_CONFIG_CACHE_KEY, PUBLIC_CONFIG_MAX_AGE_MS);
    const commodities = readVerifiedCache<Commodity[]>(PUBLIC_COMMODITIES_CACHE_KEY, PUBLIC_DIRECTORY_MAX_AGE_MS);
    return { config, commodities };
  });
  const isOffline = !isOnline;
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    const latestCacheTime = Math.max(
      initialPublicCache.config?.fetchedAt ?? 0,
      initialPublicCache.commodities?.fetchedAt ?? 0,
    );
    return latestCacheTime > 0 ? new Date(latestCacheTime).toLocaleTimeString() : '';
  });
  const [config, setConfig] = useState<SystemConfig | null>(initialPublicCache.config?.data ?? null);
  const [bulletin, setBulletin] = useState<BulletinState>(() => initialPublicCache.commodities
    ? toBulletinState(initialPublicCache.commodities.data)
    : { status: 'loading' });
  const [publicDataSource, setPublicDataSource] = useState<PublicDataSource>(
    initialPublicCache.config || initialPublicCache.commodities ? 'cached' : 'checking',
  );
  const [publicRefreshPending, setPublicRefreshPending] = useState(false);
  const [routeChunkPending, setRouteChunkPending] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [trackingParams, setTrackingParams] = useState<{ reference: string; token: string } | null>(null);
  const [recentReports, setRecentReports] = useState<StoredRecentReport[]>(getRecentReports);
  const setActiveTab = (tab: string) => {
    window.scrollTo(0, 0);
    navigate(routeForTab(tab));
  };

  useEffect(() => {
    const refreshPublicData = async () => {
      if (!isOnline) {
        setPublicRefreshPending(false);
        if (!initialPublicCache.config) setConfig(null);
        if (!initialPublicCache.commodities) setBulletin({ status: 'error' });
        setPublicDataSource(initialPublicCache.config || initialPublicCache.commodities ? 'cached' : 'unavailable');
        return;
      }

      setPublicRefreshPending(true);
      try {
        await ensureApiReady();
        const [configResponse, commoditiesResponse] = await Promise.all([
          apiClient.get('/public/config'),
          apiClient.get('/public/commodities'),
        ]);
        const nextConfig = configResponse.data?.data;
        const nextCommodities = commoditiesResponse.data?.data;

        if (!configResponse.data?.success || !nextConfig) {
          throw new Error('Invalid public configuration response');
        }
        if (!commoditiesResponse.data?.success || !Array.isArray(nextCommodities)) {
          throw new Error('Invalid commodities response');
        }

        const syncedAt = Date.now();
        setConfig(nextConfig);
        setBulletin(toBulletinState(nextCommodities));
        setLastSyncTime(new Date(syncedAt).toLocaleTimeString());
        setPublicDataSource('live');
        writeVerifiedCache(PUBLIC_CONFIG_CACHE_KEY, nextConfig, syncedAt);
        writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, nextCommodities, syncedAt);
      } catch (error) {
        console.warn('Unable to refresh live PRICE-Watch public data:', error);
        if (!initialPublicCache.config) setConfig(null);
        if (!initialPublicCache.commodities) setBulletin({ status: 'error' });
        setPublicDataSource(
          initialPublicCache.config || initialPublicCache.commodities ? 'cached' : 'unavailable',
        );
      } finally {
        setPublicRefreshPending(false);
      }
    };

    void refreshPublicData();
  }, [initialPublicCache, isOnline, refreshAttempt]);

  const isScanTab = activeTab === 'scan';
  const isHomeTab = activeTab === 'home';

  const recordSubmittedReport = (report: FormalReportResponse, storeName: string) => {
    setRecentReports(saveRecentReport({
      reportReference: report.report_reference,
      storeName,
      status: report.status,
      submittedAt: report.submitted_at,
    }));
  };

  const recordTrackedReport = (report: TrackReportResponse) => {
    setRecentReports(saveRecentReport({
      reportReference: report.report_reference,
      storeName: report.store_name,
      status: report.current_status,
      submittedAt: report.submitted_at,
    }));
  };

  return (
    <BackNavigationProvider>
    <div>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stateOfCalamity={config?.state_of_calamity}
      />

      <InstallPrompt visible={activeTab === 'home'} />
      <PwaUpdatePrompt />

      <main className={isScanTab ? 'app-scan-container' : isHomeTab ? 'app-container home-app-container' : 'app-container'}>
        <OfflineBanner isOffline={isOffline} lastSyncTime={lastSyncTime} />
        <ServiceStartStatus
          active={shouldShowServiceStartStatus(publicRefreshPending, publicDataSource, routeChunkPending)}
          onRetry={() => setRefreshAttempt((attempt) => attempt + 1)}
        />

        <Suspense fallback={(
          <PageLoader
            destination={pageLoaderDestination(activeTab)}
            onPendingChange={setRouteChunkPending}
          />
        )}>
        {activeTab === 'home' && (
          <Home
            setActiveTab={setActiveTab}
            stateOfCalamity={config?.state_of_calamity}
            bulletinDate={bulletin.effectiveDate}
            totalCommodities={bulletin.totalCommodities}
            bulletinStatus={bulletin.status}
            lastSyncTime={lastSyncTime}
            dataSource={publicDataSource}
            recentReports={recentReports.map(toRecentReportTicket)}
          />
        )}

        {activeTab === 'prices' && (
          <SrpSearch
            setActiveTab={setActiveTab}
            stateOfCalamity={config?.state_of_calamity}
          />
        )}

        {activeTab === 'scan' && (
          <ShelfScanner setActiveTab={setActiveTab} />
        )}

        {activeTab === 'reports' && (
          <FormalReport
            setActiveTab={setActiveTab}
            onTrackReport={(ref, tok) => {
              setTrackingParams({ reference: ref, token: tok });
              setActiveTab('track');
            }}
            onReportSubmitted={recordSubmittedReport}
          />
        )}

        {activeTab === 'track' && (
          <TrackReport
            initialReference={trackingParams?.reference}
            initialToken={trackingParams?.token}
            setActiveTab={setActiveTab}
            onReportTracked={recordTrackedReport}
          />
        )}
        </Suspense>
      </main>
    </div>
    </BackNavigationProvider>
  );
};

export default App;
