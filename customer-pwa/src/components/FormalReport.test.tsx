import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Establishment, type FormalReportResponse } from '../api/client';
import { FormalReport } from './FormalReport';
import { BackNavigationProvider } from '../app/backNavigation';

const store: Establishment = {
  id: 77,
  dti_sec_number: 'SEC-REAL-77',
  store_name: 'Verified API Store',
  owner_name: 'Verified Owner',
  latitude: 10.7,
  longitude: 121.9,
  address: 'Verified API Address',
  recidivism_index: 0,
};

describe('FormalReport legacy accessibility', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/reports');
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(new Blob(['receipt'], { type: 'image/jpeg' }));
    };
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 860,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
          getVideoTracks: () => [],
        }),
      },
    });
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/receipt');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses an integrated receipt back control and accessible store filters', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    const user = userEvent.setup();

    render(<FormalReport />);
    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);

    expect(await screen.findByRole('heading', { name: 'Choose a store' })).toBeInTheDocument();
    expect(screen.getByText('Where did you make this purchase?')).toBeInTheDocument();
    expect(screen.queryByText(/verified retail store/i)).not.toBeInTheDocument();

    const backButton = screen.getByRole('button', { name: 'Back to reports' });
    expect(backButton).toHaveTextContent(/^$/);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Nearby' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Recent' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1 store')).toHaveAttribute('aria-live', 'polite');
  });

  it('uses one store-card activation to open receipt guidelines without selection controls or SEC badge', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: {
          capture_session_id: 42,
          session_uuid: 'capture-42',
          capture_token: 'capture-token',
          expires_at: '2026-08-09T06:00:00Z',
          store_id: store.id,
          max_file_size: 10_000_000,
          accepted_types: ['image/jpeg'],
        },
      },
    });
    const user = userEvent.setup();

    render(<FormalReport />);
    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);

    const storeCard = await screen.findByRole('button', { name: 'Continue with Verified API Store' });
    expect(screen.queryByText('SEC-REAL-77')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Select(?:ed)?/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    await user.click(storeCard);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('/public/capture-session', { store_id: store.id });
    expect(await screen.findByRole('dialog', { name: 'Receipt capture guidelines' })).toBeInTheDocument();
  });

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

  it('does not reopen receipt guidelines when capture-session resolves after device Back', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    let resolveCapture!: (value: unknown) => void;
    const capturePromise = new Promise((resolve) => { resolveCapture = resolve; });
    vi.spyOn(apiClient, 'post').mockReturnValue(capturePromise as ReturnType<typeof apiClient.post>);
    const user = userEvent.setup();

    render(
      <BackNavigationProvider>
        <FormalReport />
      </BackNavigationProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);
    await user.click(await screen.findByRole('button', { name: 'Continue with Verified API Store' }));

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(await screen.findByRole('button', { name: /Submit a new report/i })).toBeInTheDocument();

    await act(async () => resolveCapture({
      data: { success: true, data: { capture_session_id: 42 } },
    }));
    expect(screen.queryByRole('dialog', { name: 'Receipt capture guidelines' })).not.toBeInTheDocument();
  });

  it('ignores a receipt image callback that completes after device Back', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        success: true,
        data: { capture_session_id: 42, capture_token: 'capture-token' },
      },
    });
    let completeImage!: BlobCallback;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      completeImage = callback;
    };
    const user = userEvent.setup();

    render(
      <BackNavigationProvider>
        <FormalReport />
      </BackNavigationProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);
    await user.click(await screen.findByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(await screen.findByRole('button', { name: /Open camera/i }));
    await user.click(await screen.findByRole('button', { name: /Capture receipt photo/i }));

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(await screen.findByRole('button', { name: 'Continue with Verified API Store' })).toBeInTheDocument();

    await act(async () => completeImage(new Blob(['late receipt'], { type: 'image/jpeg' })));
    expect(screen.queryByRole('checkbox', { name: /receipt I intend to submit/i })).not.toBeInTheDocument();
  });

  it('notifies the application only after a receipt report is successfully submitted', async () => {
    const submittedReport: FormalReportResponse = {
      report_reference: 'REP-20260809-REAL',
      secret_tracking_token: 'trk_private',
      status: 'Submitted',
      submitted_at: '2026-08-09T05:00:00Z',
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockImplementation(async (url) => {
      if (url === '/public/capture-session') {
        return {
          data: {
            success: true,
            data: {
              capture_session_id: 42,
              session_uuid: 'capture-42',
              capture_token: 'capture-token',
              expires_at: '2026-08-09T06:00:00Z',
              store_id: store.id,
              max_file_size: 10_000_000,
              accepted_types: ['image/jpeg'],
            },
          },
        };
      }
      if (url === '/public/reports') {
        return { data: { success: true, data: submittedReport } };
      }
      throw new Error(`Unexpected POST: ${url}`);
    });
    const onReportSubmitted = vi.fn();
    const user = userEvent.setup();
    render(
      <BackNavigationProvider>
        <FormalReport onReportSubmitted={onReportSubmitted} />
      </BackNavigationProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);
    await user.click(await screen.findByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(await screen.findByRole('button', { name: /Open camera/i }));
    await user.click(await screen.findByRole('button', { name: /Capture receipt photo/i }));
    await user.click(await screen.findByRole('checkbox', { name: /receipt I intend to submit/i }));
    await user.click(screen.getByRole('button', { name: /Submit full receipt for DTI review/i }));

    expect(await screen.findByText('Your report has been received')).toBeInTheDocument();
    expect(onReportSubmitted).toHaveBeenCalledWith(submittedReport, 'Verified API Store');

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(await screen.findByRole('button', { name: /Submit a new report/i })).toBeInTheDocument();
    expect(screen.queryByText('Your report has been received')).not.toBeInTheDocument();
  });
});
