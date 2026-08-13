import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { PUBLIC_ESTABLISHMENTS_CACHE_KEY, writeVerifiedCache } from '../app/verifiedCache';
import { StoreDirectory } from './StoreDirectory';

const { ensureApiReadyMock } = vi.hoisted(() => ({
  ensureApiReadyMock: vi.fn<() => Promise<void>>(),
}));

vi.mock('../api/readiness', () => ({ ensureApiReady: ensureApiReadyMock }));

describe('StoreDirectory integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    ensureApiReadyMock.mockReset();
    ensureApiReadyMock.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('falls back gracefully to reference establishments when API is offline', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<StoreDirectory />);
    expect(await screen.findByText('Super Metro San Jose')).toBeInTheDocument();
    expect(screen.getByText('3 participating stores found')).toBeInTheDocument();
  });

  it('shows a fresh verified directory cache without waiting for API readiness', () => {
    ensureApiReadyMock.mockReturnValue(new Promise<void>(() => undefined));
    writeVerifiedCache(PUBLIC_ESTABLISHMENTS_CACHE_KEY, [{
      id: 44,
      dti_sec_number: 'DTI-VERIFIED-44',
      store_name: 'Verified Cached Market',
      owner_name: 'Verified Owner',
      latitude: 10.74,
      longitude: 121.94,
      address: 'San Jose de Buenavista',
      recidivism_index: 0,
    }]);
    const getSpy = vi.spyOn(apiClient, 'get');

    render(<StoreDirectory />);

    expect(screen.getByText('Verified Cached Market')).toBeInTheDocument();
    expect(screen.getByText(/Showing verified cached directory/i)).toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });
});
