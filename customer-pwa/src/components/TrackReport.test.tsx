import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type TrackReportResponse } from '../api/client';
import { TrackReport } from './TrackReport';

describe('TrackReport integrity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the backend failure and never fabricates a report timeline', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({
      response: { data: { message: 'No matching report' } },
    });
    const user = userEvent.setup();
    render(<TrackReport />);

    await user.type(screen.getByLabelText(/public report reference code/i), 'PW-2026-00184');
    await user.type(screen.getByLabelText(/secret tracking token/i), 'trk_secret');
    await user.click(screen.getByRole('button', { name: /track report status/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No matching report');
    expect(screen.queryByText(/Super Metro San Jose/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluation Progress & Public Timeline/i)).not.toBeInTheDocument();
  });

  it('marks the backend-reported current status instead of a fixed timeline position', async () => {
    const report: TrackReportResponse = {
      report_reference: 'REP-REAL',
      store_name: 'Verified Store',
      current_status: 'Resolved',
      submitted_at: '2026-07-25T00:00:00Z',
      status_history: [
        { status: 'Submitted', public_message: 'Received.', timestamp: '2026-07-25T00:00:00Z' },
        { status: 'Under Evaluation', public_message: 'Reviewed.', timestamp: '2026-07-25T01:00:00Z' },
        { status: 'Resolved', public_message: 'Completed.', timestamp: '2026-07-25T02:00:00Z' },
      ],
    };
    const getReport = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: report } });
    const onReportTracked = vi.fn();
    render(
      <TrackReport
        initialReference="REP-REAL"
        initialToken="trk_real"
        onReportTracked={onReportTracked}
      />,
    );

    expect(await screen.findByText('Resolved', { selector: '[aria-current="step"]' })).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledWith('/public/reports/track', {
      params: { reference: 'REP-REAL', token: 'trk_real' },
    });
    expect(onReportTracked).toHaveBeenCalledWith(report);
    expect(screen.getByText('Under Evaluation').closest('.stepper-item')).toHaveClass('completed');
  });
});
