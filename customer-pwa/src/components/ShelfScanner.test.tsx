import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ShelfScanner } from './ShelfScanner';

describe('ShelfScanner camera safety', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stops the active media track when the camera closes and hides unsupported torch controls', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    const stop = vi.fn();
    const track = { stop, getCapabilities: () => ({}), applyConstraints: vi.fn() };
    const mediaStream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(mediaStream) } });
    const user = userEvent.setup();
    render(<ShelfScanner onNavigate={vi.fn()} isOnline />);
    await user.click(screen.getByRole('button', { name: /Super Metro San Jose/i }));
    await user.click(screen.getByRole('button', { name: /Open camera/i }));
    expect(await screen.findByRole('region', { name: 'Scan shelf tag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flashlight/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close camera' }));
    expect(stop).toHaveBeenCalled();
  });

  it('offers recovery without fabricating an image when camera permission is denied', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } });
    const user = userEvent.setup();
    render(<ShelfScanner onNavigate={vi.fn()} isOnline />);
    await user.click(screen.getByRole('button', { name: /Super Metro San Jose/i }));
    await user.click(screen.getByRole('button', { name: /Open camera/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/camera access is blocked/i);
    expect(screen.queryByAltText(/captured shelf tag/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enter details manually/i })).toBeInTheDocument();
  });
});
