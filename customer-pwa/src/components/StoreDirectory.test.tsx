import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { StoreDirectory } from './StoreDirectory';

describe('StoreDirectory integrity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not present synthetic establishments after an API failure', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<StoreDirectory />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/verified store directory is currently unavailable/i);
    expect(screen.queryByText('Super Metro San Jose')).not.toBeInTheDocument();
    expect(screen.getByText('0 participating stores found')).toBeInTheDocument();
  });
});
