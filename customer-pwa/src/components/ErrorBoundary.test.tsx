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
});
