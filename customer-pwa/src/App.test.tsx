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

  it('does not label an unavailable regulatory configuration as normal', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    render(<App />);
    await waitFor(() => expect(screen.getAllByText(/Regulatory status unavailable/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/^Normal monitoring$/i)).not.toBeInTheDocument();
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
