import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type TrackReportResponse } from '../api/client';
import { TrackReport } from './TrackReport';

const { getTrackingTokenMock, saveTrackingTokenMock } = vi.hoisted(() => ({
  getTrackingTokenMock: vi.fn(),
  saveTrackingTokenMock: vi.fn(),
}));

vi.mock('../app/reportTrackingStore', () => ({
  getReportTrackingToken: getTrackingTokenMock,
  saveReportTrackingToken: saveTrackingTokenMock,
}));

const recentReports = [
  {
    reportReference: 'REP-NEWEST',
    storeName: 'Newest Store',
    status: 'Under initial evaluation',
    submittedAt: '2026-08-22T02:00:00Z',
  },
  {
    reportReference: 'REP-OLDER',
    storeName: 'Older Store',
    status: 'Submitted',
    submittedAt: '2026-08-21T02:00:00Z',
  },
];

const trackedReport: TrackReportResponse = {
  report_reference: 'REP-NEWEST',
  store_name: 'Newest Store',
  current_status: 'Under initial evaluation',
  submitted_at: '2026-08-22T02:00:00Z',
  status_history: [
    { status: 'Submitted', public_message: 'Received.', timestamp: '2026-08-22T02:00:00Z' },
    { status: 'Under initial evaluation', public_message: 'Reviewing.', timestamp: '2026-08-22T03:00:00Z' },
  ],
};

describe('TrackReport integrity', () => {
  beforeEach(() => {
    getTrackingTokenMock.mockReset();
    saveTrackingTokenMock.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows device reports immediately and opens the newest accessible timeline', async () => {
    getTrackingTokenMock.mockImplementation(async (reference: string) => (
      reference === 'REP-NEWEST' ? 'trk_newest' : 'trk_older'
    ));
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: trackedReport } });

    render(<TrackReport recentReports={recentReports} />);

    expect(screen.getByRole('heading', { name: 'My Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open report REP-NEWEST/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open report REP-OLDER/i })).toBeInTheDocument();
    expect(await screen.findByText('Reviewing.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/public/reports/track', {
      params: { reference: 'REP-NEWEST', token: 'trk_newest' },
    });
  });

  it('marks a legacy device report as needing access without querying the API', async () => {
    getTrackingTokenMock.mockResolvedValue(null);
    const getReport = vi.spyOn(apiClient, 'get');

    render(<TrackReport recentReports={[recentReports[0]]} />);

    expect(await screen.findByRole('status')).toHaveTextContent(/access needed/i);
    expect(getReport).not.toHaveBeenCalled();
    expect(screen.getByText(/open a report from another device/i)).toBeInTheDocument();
  });

  it('saves a valid recovered credential so later access is automatic', async () => {
    getTrackingTokenMock.mockResolvedValue(null);
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: trackedReport } });
    const user = userEvent.setup();
    render(<TrackReport recentReports={[]} />);

    await user.click(screen.getByText(/open a report from another device/i));
    await user.type(screen.getByLabelText(/public report reference code/i), 'REP-NEWEST');
    await user.type(screen.getByLabelText(/secret tracking token/i), 'trk_recovered');
    await user.click(screen.getByRole('button', { name: /access report/i }));

    expect(await screen.findByText('Reviewing.')).toBeInTheDocument();
    expect(saveTrackingTokenMock).toHaveBeenCalledWith('REP-NEWEST', 'trk_recovered');
  });

  it('shows the backend failure and never fabricates a report timeline', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({
      response: { data: { message: 'No matching report' } },
    });
    const user = userEvent.setup();
    render(<TrackReport recentReports={[]} />);

    await user.click(screen.getByText(/open a report from another device/i));
    await user.type(screen.getByLabelText(/public report reference code/i), 'PW-2026-00184');
    await user.type(screen.getByLabelText(/secret tracking token/i), 'trk_secret');
    await user.click(screen.getByRole('button', { name: /access report/i }));

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
      <TrackReport recentReports={[]} onReportTracked={onReportTracked} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText(/open a report from another device/i));
    await user.type(screen.getByLabelText(/public report reference code/i), 'REP-REAL');
    await user.type(screen.getByLabelText(/secret tracking token/i), 'trk_real');
    await user.click(screen.getByRole('button', { name: /access report/i }));

    expect(await screen.findByText('Resolved', { selector: '[aria-current="step"]' })).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledWith('/public/reports/track', {
      params: { reference: 'REP-REAL', token: 'trk_real' },
    });
    expect(onReportTracked).toHaveBeenCalledWith(report);
    expect(screen.getByText('Under Evaluation').closest('.stepper-item')).toHaveClass('completed');
  });
});
