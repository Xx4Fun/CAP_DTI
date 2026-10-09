import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Establishment } from '../api/client';
import css from '../index.css?raw';
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

const publicStore = {
  id: 77,
  store_name: 'Verified API Store',
  latitude: 10.7,
  longitude: 121.9,
  address: 'Verified API Address',
  is_verified: true,
} as Establishment;

describe('FormalReport legacy accessibility', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/reports');
    localStorage.clear();
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

  it('balances the shared store search bar halfway across the hero boundary', () => {
    expect(css).toMatch(/\.store-search-floating-wrapper\s*\{[^}]*margin:\s*-42px 16px 0/);
  });

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
    expect(screen.getByRole('button', { name: 'Recent' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Favorite' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Nearby' })).not.toBeInTheDocument();
    expect(screen.queryByText('1 store')).not.toBeInTheDocument();
    expect(screen.queryByText('Nearest first')).not.toBeInTheDocument();
  });

  it('shows loading placeholders, not bundled stores, until the store directory responds', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();

    render(<FormalReport />);
    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);

    expect(await screen.findByRole('heading', { name: 'Choose a store' })).toBeInTheDocument();
    expect(screen.getAllByTestId('store-card-skeleton')).toHaveLength(3);
    expect(screen.queryByText('Gaisano Grand Antique')).not.toBeInTheDocument();
  });

  it('shows the empty state when a public store payload does not match the search', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [publicStore] } });
    const user = userEvent.setup();

    render(<FormalReport />);
    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    await user.click(screen.getByRole('checkbox', { name: /agree to the privacy notice/i }));
    await user.click(screen.getByRole('dialog', { name: /Before you submit a receipt/i }).querySelector('.btn-primary')!);
    await user.type(await screen.findByRole('searchbox', { name: 'Search verified stores' }), 'not-a-store');

    expect(screen.getByText('No matching stores found')).toBeInTheDocument();
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
          capture_mode: 'guided_photos_v1',
          max_file_size: 2 * 1024 * 1024,
          accepted_types: ['image/jpeg'],
          limits: { max_frame_bytes: 2 * 1024 * 1024, min_frames: 1, max_frames: 12 },
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
    expect(postSpy).toHaveBeenCalledWith('/public/capture-session', { store_id: store.id, capture_mode: 'guided_photos_v1' });
    const guidelines = await screen.findByRole('dialog', { name: 'Receipt capture guidelines' });
    expect(guidelines).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Capture your receipt' })).toBeInTheDocument();
    expect(screen.getByText('Follow this guidelines')).toBeInTheDocument();
    expect(screen.queryByText(/Gallery uploads are unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Store Selected')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open camera/i }));
    expect(await screen.findByLabelText('Guided receipt scanner')).toBeInTheDocument();
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

  it('renders privacy modal as collapsible accordions without redundant subtext', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [] } });
    const user = userEvent.setup();
    render(<FormalReport />);

    await user.click(screen.getByRole('button', { name: /Submit a new report/i }));
    const dialog = screen.getByRole('dialog', { name: /Before you submit a receipt/i });
    expect(dialog).toBeInTheDocument();

    // Verify subtext is removed
    expect(screen.queryByText(/Your receipt will be used to create a possible price-concern report/i)).not.toBeInTheDocument();

    // Verify 3 accordion triggers exist and start collapsed
    const cameraTrigger = screen.getByRole('button', { name: /Camera use/i });
    const privacyTrigger = screen.getByRole('button', { name: /Privacy protection/i });
    const evaluationTrigger = screen.getByRole('button', { name: /Human evaluation/i });

    expect(cameraTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(privacyTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(evaluationTrigger).toHaveAttribute('aria-expanded', 'false');

    // Bodies should be hidden by default
    expect(screen.queryByText('Your camera is used only during receipt capture.')).not.toBeInTheDocument();
    expect(screen.queryByText(/An automated service \(Google Gemini\) may read/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Reports do not automatically confirm a violation.')).not.toBeInTheDocument();

    // Expanding Camera use reveals its body
    await user.click(cameraTrigger);
    expect(cameraTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Your camera is used only during receipt capture.')).toBeInTheDocument();

    // Collapsing Camera use hides its body again
    await user.click(cameraTrigger);
    expect(cameraTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Your camera is used only during receipt capture.')).not.toBeInTheDocument();
  });

});

