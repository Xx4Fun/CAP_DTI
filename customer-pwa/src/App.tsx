import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
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
  persistRecentReports,
  toRecentReportTicket,
  type StoredRecentReport,
} from './app/recentReports';
import { getReceiptResumeToken } from './app/receiptResumeStore';
import { refreshReceiptReportStatuses } from './app/receiptStatusRefresh';
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
const ReceiptDraftView = lazy(() => import('./components/ReceiptDraftView').then((module) => ({ default: module.ReceiptDraftView })));
const MoreView = lazy(() => import('./components/MoreView').then((module) => ({ default: module.MoreView })));

const tabForRoute = (route: AppRoute): string => {
  if (route.name === 'home') return 'home';
  if (route.name === 'prices' || route.name === 'product') return 'prices';
  if (route.name === 'scan') return 'scan';
  if (route.name === 'track-report') return 'track';
  if (route.name === 'more') return 'more';
  return 'reports';
};

const routeForTab = (tab: string): AppRoute => {
  if (tab === 'prices') return { name: 'prices' };
  if (tab === 'scan') return { name: 'scan' };
  if (tab === 'track') return { name: 'track-report' };
  if (tab === 'reports') return { name: 'reports' };
  if (tab === 'more') return { name: 'more' };
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
  if (activeTab === 'more') return 'more';
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
      submittedAt: report.submitted_at ?? report.created_at ?? new Date().toISOString(),
    }));
  };

  const refreshRecentReports = useCallback(async () => {
    const latest = await refreshReceiptReportStatuses(
      getRecentReports(),
      getReceiptResumeToken,
      async (reference, token) => {
        const response = await apiClient.get(`/public/reports/${encodeURIComponent(reference)}/processing`, {
          headers: { 'X-Report-Resume-Token': token },
        });
        return response.data.data;
      },
    );
    setRecentReports(persistRecentReports(latest));
  }, []);

  useEffect(() => {
    if (isOnline) void refreshRecentReports();
    const handleFocus = () => { if (navigator.onLine) void refreshRecentReports(); };
    const handleOnline = () => void refreshRecentReports();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [isOnline, refreshRecentReports]);

  const updateRecentReportStatus = (reference: string, status: string, submittedAt?: string) => {
    const stored = getRecentReports().find((report) => report.reportReference === reference);
    if (!stored) return;
    setRecentReports(saveRecentReport({
      ...stored,
      status,
      submittedAt: submittedAt ?? stored.submittedAt,
    }));
  };

  const recentReportTickets = recentReports.map((report) => {
    const ticket = toRecentReportTicket(report);
    const normalized = report.status.toLowerCase();
    if (normalized.includes('ready for confirmation')) {
      return { ...ticket, onOpen: () => navigate({ name: 'receipt-review', reference: report.reportReference }) };
    }
    if (normalized.includes('processing') || normalized.includes('recapture')) {
      return { ...ticket, onOpen: () => navigate({ name: 'receipt-processing', reference: report.reportReference }) };
    }
    return ticket;
  });

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
            recentReports={recentReportTickets}
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

        {activeTab === 'reports' && route.name !== 'receipt-processing' && route.name !== 'receipt-review' && (
          <FormalReport
            setActiveTab={setActiveTab}
            onTrackReport={(ref, tok) => {
              setTrackingParams({ reference: ref, token: tok });
              setActiveTab('track');
            }}
            onReportSubmitted={recordSubmittedReport}
            continuousCaptureEnabled={config?.receipt_continuous_capture_enabled === true}
            vapidPublicKey={config?.receipt_web_push_enabled ? config.vapid_public_key || '' : ''}
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

        {activeTab === 'more' && (
          <MoreView
            setActiveTab={setActiveTab}
            lastSyncTime={lastSyncTime}
            stateOfCalamity={config?.state_of_calamity}
            bulletinDate={bulletin.effectiveDate}
            totalCommodities={bulletin.totalCommodities}
            onRefreshData={async () => {
              setRefreshAttempt((attempt) => attempt + 1);
            }}
          />
        )}

        {(route.name === 'receipt-processing' || route.name === 'receipt-review') && (
          <ReceiptDraftView
            reference={route.reference}
            mode={route.name === 'receipt-review' ? 'review' : 'processing'}
            onStatus={(status) => updateRecentReportStatus(route.reference, status)}
            onSubmitted={(result) => updateRecentReportStatus(result.report_reference, result.status, result.submitted_at)}
          />
        )}
        </Suspense>
      </main>
    </div>
    </BackNavigationProvider>
  );
};

export default App;
