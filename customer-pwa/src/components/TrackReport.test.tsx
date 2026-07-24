import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type TrackReportResponse } from '../api/client';
import { TrackReport } from './TrackReport';

describe('TrackReport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows an error and no fabricated timeline when tracking fails', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({ response: { data: { message: 'No matching report' } } });
    const user = userEvent.setup();
    render(<TrackReport onNavigate={vi.fn()} />);
    await user.type(screen.getByLabelText('Report reference number'), 'REP-20260725-A8F2');
    await user.type(screen.getByLabelText('Secret tracking token'), 'trk_secret');
    await user.click(screen.getByRole('button', { name: /^Track report$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No matching report');
    expect(screen.queryByRole('heading', { name: 'Evaluation timeline' })).not.toBeInTheDocument();
  });

  it('marks only the backend current status as current', async () => {
    const response: TrackReportResponse = {
      report_reference: 'REP-1', store_name: 'Test Store', current_status: 'Under Evaluation', submitted_at: '2026-07-25T00:00:00Z',
      status_history: [
        { status: 'Submitted', public_message: 'Received.', timestamp: '2026-07-25T00:00:00Z' },
        { status: 'Under Evaluation', public_message: 'Reviewing.', timestamp: '2026-07-25T01:00:00Z' },
        { status: 'Resolved', public_message: 'Pending.', timestamp: 'Pending' },
      ],
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: response } });
    render(<TrackReport initialReference="REP-1" initialToken="trk_secret" onNavigate={vi.fn()} />);
    expect(await screen.findByText('Under Evaluation', { selector: 'strong' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Submitted', { selector: 'strong' }).closest('li')).toHaveClass('is-completed');
    expect(screen.getAllByText('Current status')).toHaveLength(1);
  });
});
