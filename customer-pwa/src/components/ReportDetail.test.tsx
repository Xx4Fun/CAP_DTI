import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type TrackReportResponse } from '../api/client';
import { ReportDetail } from './ReportDetail';

const { getTrackingTokenMock } = vi.hoisted(() => ({
  getTrackingTokenMock: vi.fn(),
}));

vi.mock('../app/reportTrackingStore', () => ({
  getReportTrackingToken: getTrackingTokenMock,
}));

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

describe('ReportDetail', () => {
  beforeEach(() => getTrackingTokenMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('uses secure device access to load the live report timeline', async () => {
    getTrackingTokenMock.mockResolvedValue('trk_newest');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: trackedReport } });
    const onReportTracked = vi.fn();

    render(<ReportDetail reference="REP-NEWEST" onReportTracked={onReportTracked} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading report updates');
    expect(await screen.findByRole('heading', { name: 'Report details' })).toBeInTheDocument();
    expect(screen.getByText('Reviewing.')).toBeInTheDocument();
    expect(screen.getByText('Under initial evaluation', { selector: '[aria-current="step"]' })).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/public/reports/track', {
      params: { reference: 'REP-NEWEST', token: 'trk_newest' },
    });
    expect(onReportTracked).toHaveBeenCalledWith(trackedReport);
  });

  it('keeps the app header visible and uses layout-shaped loading placeholders', () => {
    getTrackingTokenMock.mockResolvedValue(null);
    const { container } = render(<ReportDetail reference="REP-NEWEST" onBack={vi.fn()} />);

    const header = screen.getByRole('banner');
    expect(header).toContainElement(screen.getByRole('button', { name: 'Back to My Reports' }));
    expect(header).toContainElement(screen.getByRole('heading', { name: 'Report details' }));
    expect(container.querySelector('.track-report-skeleton-summary')).toBeInTheDocument();
    expect(container.querySelector('.track-report-skeleton-timeline')).toBeInTheDocument();
  });

  it('shows a truthful unavailable page when secure device access is missing', async () => {
    getTrackingTokenMock.mockResolvedValue(null);
    const getReport = vi.spyOn(apiClient, 'get');

    render(<ReportDetail reference="REP-LEGACY" />);

    expect(await screen.findByRole('heading', { name: 'Report unavailable on this device' })).toBeInTheDocument();
    expect(screen.getByText('REP-LEGACY')).toBeInTheDocument();
    expect(screen.queryByLabelText(/tracking token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open a report from another device/i)).not.toBeInTheDocument();
    expect(getReport).not.toHaveBeenCalled();
  });

  it('offers a retry without fabricating a timeline after an API error', async () => {
    getTrackingTokenMock.mockResolvedValue('trk_newest');
    vi.spyOn(apiClient, 'get')
      .mockRejectedValueOnce({ response: { data: { message: 'No matching report' } } })
      .mockResolvedValueOnce({ data: { success: true, data: trackedReport } });
    const user = userEvent.setup();

    render(<ReportDetail reference="REP-NEWEST" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No matching report');
    expect(screen.queryByText('Reviewing.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Reviewing.')).toBeInTheDocument();
  });

  it('uses an icon-only control to return to My Reports', async () => {
    getTrackingTokenMock.mockResolvedValue(null);
    const onBack = vi.fn();
    render(<ReportDetail reference="REP-LEGACY" onBack={onBack} />);

    const back = await screen.findByRole('button', { name: 'Back to My Reports' });
    expect(back).not.toHaveTextContent(/back/i);
    await userEvent.setup().click(back);

    expect(onBack).toHaveBeenCalledOnce();
  });
  it('opens the submitted receipt viewer and returns to report details', async () => {
    history.replaceState({ fromReportList: true }, '', '/reports/track/REP-NEWEST');
    getTrackingTokenMock.mockResolvedValue('trk_newest');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: trackedReport } });
    render(<ReportDetail reference="REP-NEWEST" />);
    await userEvent.click(await screen.findByRole('button', { name: 'View receipt and results' }));
    expect(location.pathname).toBe('/reports/REP-NEWEST/receipt');
    expect(history.state).toEqual({ fromReportDetail: true });
    history.back();
    await waitFor(() => expect(location.pathname).toBe('/reports/track/REP-NEWEST'));
    expect(history.state.fromReportList).toBe(true);
  });

  it('announces that the report reference was copied', async () => {
    getTrackingTokenMock.mockResolvedValue('trk_newest');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: trackedReport } });
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Clipboard);

    render(<ReportDetail reference="REP-NEWEST" />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Copy report reference' }));

    expect(screen.getByRole('button', { name: 'Report reference copied' })).toBeInTheDocument();
  });
});
