import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api/client';
import {
  PUBLIC_COMMODITIES_CACHE_KEY,
  PUBLIC_CONFIG_CACHE_KEY,
  writeVerifiedCache,
} from './app/verifiedCache';
import App from './App';
import { shouldShowServiceStartStatus } from './app/pageLoading';

const { ensureApiReadyMock } = vi.hoisted(() => ({
  ensureApiReadyMock: vi.fn<() => Promise<void>>(),
}));

vi.mock('./api/readiness', () => ({
  ensureApiReady: ensureApiReadyMock,
}));

vi.mock('./app/pwaRegistration', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

describe('legacy App shell routing and status', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    ensureApiReadyMock.mockReset();
    ensureApiReadyMock.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the service-start status only when no route loader is active', () => {
    expect(shouldShowServiceStartStatus(true, 'checking', false)).toBe(true);
    expect(shouldShowServiceStartStatus(true, 'checking', true)).toBe(false);
    expect(shouldShowServiceStartStatus(true, 'cached', false)).toBe(false);
    expect(shouldShowServiceStartStatus(false, 'checking', false)).toBe(false);
  });

  it('uses stable paths while keeping the legacy navigation', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Prices' }));
    expect(location.pathname).toBe('/prices');
    expect(screen.getByRole('button', { name: 'Prices' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the global offline notice on the scanner route', async () => {
    history.replaceState(null, '', '/scan');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));

    render(<App />);

    expect(await screen.findByText('You are offline.')).toBeInTheDocument();
  });

  it('does not present an unresolved regulatory status in the app shell', () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    render(<App />);

    expect(screen.queryByText(/Regulatory status unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Normal monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('Calamity active')).not.toBeInTheDocument();
  });

  it('loads the current bulletin date and count from the existing commodities API', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (url === '/public/config') {
        return {
          data: {
            success: true,
            data: {
              app_name: 'PRICE-Watch',
              state_of_calamity: false,
              privacy_notice_version: '1.0',
              max_upload_size_mb: 10,
              allowed_mime_types: ['image/jpeg'],
              last_updated_at: '2026-08-09T08:15:00Z',
            },
          },
        };
      }

      if (url === '/public/commodities') {
        return {
          data: {
            success: true,
            data: [
              { id: 1, effective_date: '2026-05-11' },
              { id: 2, effective_date: '2026-05-11' },
            ],
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    render(<App />);

    expect(await screen.findByText('11 May 2026', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('2 available')).toBeInTheDocument();
  });

  it('waits for API readiness before requesting live public data', async () => {
    let releaseReadiness: (() => void) | undefined;
    ensureApiReadyMock.mockReturnValue(new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    }));
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, data: [] },
    });

    render(<App />);

    expect(getSpy).not.toHaveBeenCalled();
    releaseReadiness?.();
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  });

  it('shows fresh verified cache immediately while readiness is still pending', () => {
    ensureApiReadyMock.mockReturnValue(new Promise<void>(() => undefined));
    writeVerifiedCache(PUBLIC_CONFIG_CACHE_KEY, {
      app_name: 'PRICE-Watch',
      state_of_calamity: true,
      privacy_notice_version: '1.0',
      max_upload_size_mb: 10,
      allowed_mime_types: ['image/jpeg'],
      last_updated_at: '2026-08-09T08:15:00Z',
    });
    writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, [
      { id: 1, effective_date: '2026-05-11' },
    ]);
    const getSpy = vi.spyOn(apiClient, 'get');

    render(<App />);

    expect(screen.getAllByText(/Calamity active/i).length).toBeGreaterThan(0);
    expect(screen.getByText('11 May 2026')).toBeInTheDocument();
    expect(screen.getByText('1 available')).toBeInTheDocument();
    expect(screen.getByText('Cached copy')).toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('uses Unavailable only after the commodities API confirms there is no bulletin data', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url === '/public/commodities'
          ? []
          : {
              app_name: 'PRICE-Watch',
              state_of_calamity: false,
              privacy_notice_version: '1.0',
              max_upload_size_mb: 10,
              allowed_mime_types: ['image/jpeg'],
              last_updated_at: '2026-08-09T08:15:00Z',
            },
      },
    }));

    render(<App />);

    expect(await screen.findAllByText('Unavailable')).toHaveLength(2);
  });

  it('renders a direct tracking route and responds to browser navigation', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    history.replaceState(null, '', '/reports/track');
    render(<App />);
    expect(await screen.findByRole('button', { name: /Track Report Status/i })).toBeInTheDocument();
    history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('heading', { name: /Check prices with confidence/i })).toBeInTheDocument();
  });

  it('uses a real product route and restores the exact Prices view on device Back', async () => {
    const commodity = {
      id: 501,
      commodity_name: 'Bottled Water - Distilled Water - Absolute (1L)',
      category: 'Bottled Water - Distilled Water',
      unit: '1L',
      regulatory_classification: 'BASIC_NECESSITY',
      baseline_price: 25,
      effective_date: '2026-08-01',
      is_active: true,
    };
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url === '/public/commodities'
          ? [commodity]
          : {
              app_name: 'PRICE-Watch',
              state_of_calamity: false,
              privacy_notice_version: '1.0',
              max_upload_size_mb: 10,
              allowed_mime_types: ['image/jpeg'],
              last_updated_at: '2026-08-09T08:15:00Z',
            },
      },
    }));
    history.replaceState(null, '', '/prices');
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Basic Necessities' }, { timeout: 4000 }));
    const search = screen.getByRole('textbox', { name: 'Search products or brands' });
    await user.type(search, 'Absolute');
    await user.click(await screen.findByRole('button', { name: 'View Absolute (1L) price details' }));

    expect(location.pathname).toBe('/prices/501');
    expect(screen.getByRole('button', { name: /Back to Prices/i })).toBeInTheDocument();

    act(() => history.back());
    await waitFor(() => expect(location.pathname).toBe('/prices'));
    expect(screen.getByRole('textbox', { name: 'Search products or brands' })).toHaveValue('Absolute');
    expect(screen.getByRole('button', { name: 'Basic Necessities' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 420));
  });

  it('supports direct product links and returns invalid product IDs to Prices', async () => {
    const commodity = {
      id: 501,
      commodity_name: 'Bottled Water - Distilled Water - Absolute (1L)',
      category: 'Bottled Water - Distilled Water',
      baseline_price: 25,
      effective_date: '2026-08-01',
      is_active: true,
    };
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url === '/public/commodities'
          ? [commodity]
          : {
              app_name: 'PRICE-Watch',
              state_of_calamity: false,
              privacy_notice_version: '1.0',
              max_upload_size_mb: 10,
              allowed_mime_types: ['image/jpeg'],
              last_updated_at: '2026-08-09T08:15:00Z',
            },
      },
    }));
    const user = userEvent.setup();

    history.replaceState(null, '', '/prices/501');
    const directView = render(<App />);
    await user.click(await screen.findByRole('button', { name: /Back to Prices/i }));
    expect(location.pathname).toBe('/prices');
    directView.unmount();

    history.replaceState(null, '', '/prices/999');
    render(<App />);
    await waitFor(() => expect(location.pathname).toBe('/prices'));
    expect(await screen.findByRole('button', { name: 'View Absolute (1L) price details' })).toBeInTheDocument();
  });

  it('dismisses the active navigation menu, sort menu, and filter sheet before leaving Prices', async () => {
    const commodity = {
      id: 501,
      commodity_name: 'Bottled Water - Distilled Water - Absolute (1L)',
      category: 'Bottled Water - Distilled Water',
      baseline_price: 25,
      effective_date: '2026-08-01',
      is_active: true,
    };
    vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url === '/public/commodities'
          ? [commodity]
          : {
              app_name: 'PRICE-Watch',
              state_of_calamity: false,
              privacy_notice_version: '1.0',
              max_upload_size_mb: 10,
              allowed_mime_types: ['image/jpeg'],
              last_updated_at: '2026-08-09T08:15:00Z',
            },
      },
    }));
    history.replaceState(null, '', '/prices');
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: 'View Absolute (1L) price details' });

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Sort prices: Default order' }));
    expect(screen.getByRole('listbox', { name: 'Sort prices' })).toBeInTheDocument();
    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Sort prices' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Categories' }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument());
    expect(location.pathname).toBe('/prices');
  });

  it('loads locally submitted report summaries into Home without storing a tracking token', async () => {
    localStorage.setItem('price-watch-recent-reports', JSON.stringify([{
      reportReference: 'REP-20260809-REAL',
      storeName: 'Verified API Store',
      status: 'Submitted',
      submittedAt: '2026-08-09T05:00:00Z',
    }]));
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));

    render(<App />);

    expect(await screen.findByRole('article', { name: 'Report REP-20260809-REAL' })).toBeInTheDocument();
    expect(screen.getByText('Verified API Store')).toBeInTheDocument();
    expect(localStorage.getItem('price-watch-recent-reports')).not.toContain('trk_');
  });
});
