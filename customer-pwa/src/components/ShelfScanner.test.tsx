import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Establishment } from '../api/client';
import { ShelfScanner } from './ShelfScanner';

const store: Establishment = {
  id: 77,
  dti_sec_number: 'SEC-REAL-77',
  store_name: 'Verified API Store',
  owner_name: 'Verified Owner',
  latitude: 10.7,
  longitude: 121.9,
  address: 'Verified API Address',
  recidivism_index: 0,
};

describe('ShelfScanner safety', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falls back gracefully to reference store directory when API connection is offline', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<ShelfScanner />);
    expect(await screen.findByText('Super Metro San Jose')).toBeInTheDocument();
  });

  it('hides unsupported torch controls and stops the real media track on unmount', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    const stop = vi.fn();
    const track = { stop, getCapabilities: () => ({}), applyConstraints: vi.fn() };
    const mediaStream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(mediaStream) },
    });
    const user = userEvent.setup();
    const view = render(<ShelfScanner />);
    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /toggle flash/i })).not.toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalled();
  });
});
