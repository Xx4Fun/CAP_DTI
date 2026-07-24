import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { FormalReport } from './FormalReport';

describe('FormalReport integrity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not fabricate a capture session when the request fails', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [{ id: 101, dti_sec_number: 'TEST-1', store_name: 'Super Metro San Jose', owner_name: 'Test', latitude: 0, longitude: 0, address: 'Test address', recidivism_index: 0 }] } });
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<FormalReport mode="new" onNavigate={vi.fn()} onTrackReport={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: /live camera and privacy notice/i }));
    await user.click(screen.getByRole('button', { name: 'Choose store' }));
    await user.click(await screen.findByRole('button', { name: /Super Metro San Jose/i }));
    await user.click(screen.getByRole('button', { name: /Start secure capture/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't start secure receipt capture/i);
    expect(screen.queryByRole('button', { name: /Open live camera/i })).not.toBeInTheDocument();
  });

  it('uses tamper-evident terminology', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<FormalReport mode="new" onNavigate={vi.fn()} onTrackReport={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /full privacy notice/i }));
    expect(screen.getByText(/tamper-evident evidence trail/i)).toBeInTheDocument();
    expect(screen.queryByText(/tamper-proof/i)).not.toBeInTheDocument();
  });
});
