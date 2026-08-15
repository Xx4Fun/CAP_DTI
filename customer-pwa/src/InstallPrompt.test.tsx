import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { apiClient } from './api/client';

vi.mock('./app/pwaRegistration', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const createInstallEvent = (outcome: 'accepted' | 'dismissed') => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });

  return { event, prompt };
};

describe('PWA install promotion', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
  });

  afterEach(() => vi.restoreAllMocks());

  it('offers installation only when the browser makes the PWA installable', async () => {
    const { event, prompt } = createInstallEvent('accepted');
    const user = userEvent.setup();

    render(<App />);
    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();

    act(() => window.dispatchEvent(event));

    const installButton = await screen.findByRole('button', { name: 'Install app' });
    expect(event.defaultPrevented).toBe(true);

    await user.click(installButton);

    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
    });
  });

  it('lets the user dismiss the promotion without blocking the app', async () => {
    const { event } = createInstallEvent('dismissed');
    const user = userEvent.setup();

    render(<App />);
    act(() => window.dispatchEvent(event));

    await user.click(await screen.findByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Check prices with confidence/i }, { timeout: 4000 })).toBeInTheDocument();
  });
});
