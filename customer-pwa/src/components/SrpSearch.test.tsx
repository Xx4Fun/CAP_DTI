import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { SrpSearch } from './SrpSearch';

describe('SrpSearch data source', () => {
  afterEach(() => vi.restoreAllMocks());

  it('labels bundled reference data instead of claiming it is cached', async () => {
    localStorage.clear();
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<SrpSearch />);
    expect(await screen.findByText(/Bundled DTI reference list/i)).toBeInTheDocument();
    expect(screen.queryByText(/Displaying cached SRP bulletin/i)).not.toBeInTheDocument();
  });
});
