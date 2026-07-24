import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api/client';
import App from './App';

describe('App routing and status shell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses stable paths and active primary-navigation semantics', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Prices' }));
    expect(location.pathname).toBe('/prices');
    expect(screen.getByRole('button', { name: 'Prices' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: 'DTI reference prices' })).toBeInTheDocument();
  });

  it('never presents an unavailable configuration as normal monitoring', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Regulatory status unavailable/i)).toBeInTheDocument());
    expect(screen.queryByText(/^Normal monitoring$/i)).not.toBeInTheDocument();
  });

  it('opens tracking directly from the Home task card', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Track an existing report/i }));
    expect(location.pathname).toBe('/reports/track');
    expect(screen.getByRole('heading', { name: 'Track report status' })).toBeInTheDocument();
  });

  it('has no automated accessibility violations on the Home shell', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unavailable'));
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByText(/Regulatory status unavailable/i)).toBeInTheDocument());
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
