import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { StoreDirectory } from './StoreDirectory';

describe('StoreDirectory integrity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('falls back gracefully to reference establishments when API is offline', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<StoreDirectory />);
    expect(await screen.findByText('Super Metro San Jose')).toBeInTheDocument();
    expect(screen.getByText('3 participating stores found')).toBeInTheDocument();
  });
});
