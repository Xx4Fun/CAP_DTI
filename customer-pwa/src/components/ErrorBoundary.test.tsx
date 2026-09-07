import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const Bomb = () => {
  throw new Error('render failed');
};

describe('ErrorBoundary recovery', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('offers an ordinary reload without clearing caches or unregistering the service worker', async () => {
    const getRegistrations = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistrations } });
    const cacheKeys = vi.fn().mockResolvedValue([]);
    Object.defineProperty(window, 'caches', { configurable: true, value: { keys: cacheKeys, delete: vi.fn() } });
    const user = userEvent.setup();

    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload PRICE-Watch' }));

    expect(getRegistrations).not.toHaveBeenCalled();
    expect(cacheKeys).not.toHaveBeenCalled();
  });

  it('clears only app-owned recovery data after explicit confirmation', async () => {
    sessionStorage.setItem('price-watch-asset-recovery-v1', '1');
    localStorage.setItem('price-watch-public-config-v1', '{}');
    localStorage.setItem('unrelated-site-key', 'keep');
    const cacheDelete = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn().mockResolvedValue(['price-watch-assets', 'third-party-cache']), delete: cacheDelete },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    await user.click(screen.getByRole('button', { name: 'Reset app data' }));

    expect(cacheDelete).toHaveBeenCalledWith('price-watch-assets');
    expect(cacheDelete).not.toHaveBeenCalledWith('third-party-cache');
    expect(localStorage.getItem('price-watch-public-config-v1')).toBeNull();
    expect(localStorage.getItem('unrelated-site-key')).toBe('keep');
  });

  it('keeps the surrounding app shell and offers Home when a route fails offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const onGoHome = vi.fn();
    const user = userEvent.setup();

    render(
      <>
        <header>PRICE-Watch navigation</header>
        <ErrorBoundary variant="route" onGoHome={onGoHome}>
          <Bomb />
        </ErrorBoundary>
      </>,
    );

    expect(screen.getByRole('banner')).toHaveTextContent('PRICE-Watch navigation');
    expect(screen.getByRole('heading', { name: 'This screen is unavailable offline' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to Home' }));
    expect(onGoHome).toHaveBeenCalledOnce();
  });

  it('recovers from a failed route when navigation changes the route key', () => {
    const view = render(
      <ErrorBoundary variant="route" resetKey="prices">
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'This screen could not open' })).toBeInTheDocument();
    view.rerender(
      <ErrorBoundary variant="route" resetKey="home">
        <p>Home recovered</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Home recovered')).toBeInTheDocument();
  });
});
