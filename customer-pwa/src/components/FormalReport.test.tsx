import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { FormalReport } from './FormalReport';

describe('FormalReport legacy accessibility', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the privacy dialog from the keyboard and closes it with Escape', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [] } });
    const user = userEvent.setup();
    render(<FormalReport />);

    const start = screen.getByRole('button', { name: /Submit a new report/i });
    start.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: /Before you submit a receipt/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /Before you submit a receipt/i })).not.toBeInTheDocument();
  });
});
