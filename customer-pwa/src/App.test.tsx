import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api/client';
import App from './App';

describe('legacy App shell routing and status', () => {
  beforeEach(() => history.replaceState(null, '', '/'));
  afterEach(() => vi.restoreAllMocks());

  it('uses stable paths while keeping the legacy navigation', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Prices' }));
    expect(location.pathname).toBe('/prices');
    expect(screen.getByRole('button', { name: 'Prices' })).toHaveAttribute('aria-current', 'page');
  });

  it('falls back gracefully to default regulatory configuration when API is offline', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    render(<App />);
    await waitFor(() => expect(screen.getAllByText(/Normal monitoring/i).length).toBeGreaterThan(0));
  });

  it('renders a direct tracking route and responds to browser navigation', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    history.replaceState(null, '', '/reports/track');
    render(<App />);
    expect(screen.getByRole('heading', { name: /Track Report Status/i })).toBeInTheDocument();
    history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('heading', { name: /Check current commodity prices/i })).toBeInTheDocument();
  });
});
