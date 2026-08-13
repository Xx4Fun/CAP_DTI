import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Establishment } from '../api/client';
import { ShelfScanner } from './ShelfScanner';
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

describe('ShelfScanner Option A Honest Recovery State Machine', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/scan');
    sessionStorage.clear();
    // Mock Canvas getContext, toBlob, and URL methods for jsdom environment
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(new Blob(['fake image content'], { type: 'image/jpeg' }));
    };

    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-blob-url');
    }
    if (!globalThis.URL.revokeObjectURL) {
      globalThis.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('opens the live camera with one store-card activation and no selection confirmation', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const user = userEvent.setup();

    render(<ShelfScanner />);

    const storeCard = await screen.findByRole('button', { name: 'Continue with Verified API Store' });
    expect(screen.queryByRole('button', { name: /^Select(?:ed)?/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue to Live Camera/i })).not.toBeInTheDocument();
    await user.click(storeCard);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  });

  it('stops a camera stream that resolves after device Back returned to store selection', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    let resolveCamera!: (stream: MediaStream) => void;
    const cameraPromise = new Promise<MediaStream>((resolve) => { resolveCamera = resolve; });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockReturnValue(cameraPromise) },
    });
    const stop = vi.fn();
    const user = userEvent.setup();

    render(
      <BackNavigationProvider>
        <ShelfScanner />
      </BackNavigationProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Continue with Verified API Store' }));
    expect(await screen.findByRole('button', { name: 'Back to store selection' })).toBeInTheDocument();

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(await screen.findByRole('button', { name: 'Continue with Verified API Store' })).toBeInTheDocument();

    await act(async () => resolveCamera({
      getTracks: () => [{ stop }],
      getVideoTracks: () => [],
    } as unknown as MediaStream));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('ignores a shelf-tag image callback that completes after device Back', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    const postSpy = vi.spyOn(apiClient, 'post');
    let completeImage!: BlobCallback;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      completeImage = callback;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
          getVideoTracks: () => [],
        }),
      },
    });
    const user = userEvent.setup();

    render(
      <BackNavigationProvider>
        <ShelfScanner />
      </BackNavigationProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(await screen.findByLabelText('Capture Shutter'));
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(await screen.findByRole('button', { name: 'Continue with Verified API Store' })).toBeInTheDocument();

    act(() => completeImage(new Blob(['late shelf tag'], { type: 'image/jpeg' })));
    expect(postSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Analyzing Shelf Tag')).not.toBeInTheDocument();
  });

  it('keeps the selected store as a single card after returning from the camera', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
          getVideoTracks: () => [],
        }),
      },
    });
    const user = userEvent.setup();

    render(<ShelfScanner />);

    await user.click(await screen.findByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(await screen.findByRole('button', { name: 'Back to store selection' }));

    expect(screen.getAllByRole('button', { name: 'Continue with Verified API Store' })).toHaveLength(1);
    expect(screen.queryByText('Recent store')).not.toBeInTheDocument();
  });

  it('omits the redundant verification status from store cards', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });

    render(<ShelfScanner />);

    const storeCard = await screen.findByRole('button', { name: 'Continue with Verified API Store' });
    expect(screen.queryByText(/^Verified store$/i)).not.toBeInTheDocument();
    expect(storeCard.querySelector('[data-icon="circle-check"]')).not.toBeInTheDocument();
  });

  it('renders an optional store image, Font Awesome location marker, and neutral fallback on image error', async () => {
    const imageStore: Establishment = {
      ...store,
      image_path: 'https://images.example.test/store.webp',
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [imageStore] } });

    render(<ShelfScanner />);

    const storeCard = await screen.findByRole('button', { name: 'Continue with Verified API Store' });
    const image = storeCard.querySelector('img[src="https://images.example.test/store.webp"]');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(storeCard.querySelector('[data-icon="location-dot"]')).toBeInTheDocument();

    fireEvent.error(image!);
    expect(storeCard).toHaveTextContent('VA');
    expect(storeCard.querySelector('img')).not.toBeInTheDocument();
  });

  it('displays store network error state when API connection is offline in production mode', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<ShelfScanner />);
    expect(await screen.findByText('No Verified Stores Available')).toBeInTheDocument();
  });

  it('hides unsupported torch controls and stops the real media track on unmount', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    const stop = vi.fn();
    const track = { stop, getCapabilities: () => ({}), applyConstraints: vi.fn() };
    const mediaStream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(mediaStream) },
    });
    const user = userEvent.setup();
    const view = render(<ShelfScanner />);
    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /toggle flash/i })).not.toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('renders honest network error screen without fake data when analyze API fails', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Analyze server failure'));

    const user = userEvent.setup();
    render(<ShelfScanner />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(await screen.findByText('Unable to analyze shelf tag')).toBeInTheDocument();
    expect(screen.getByText(/The shelf tag could not be processed. No comparison was generated and nothing was submitted./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retake Image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enter product and price manually/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Search Prices Manually/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Enter product and price manually/i }));
    expect(await screen.findByText('Search Commodity Directory')).toBeInTheDocument();

    // Verify fake default values (like 23.50 or Saba) are absent from error screen
    expect(screen.queryByText('23.50')).not.toBeInTheDocument();
    expect(screen.queryByText('Saba Sardines')).not.toBeInTheDocument();
  });

  it('renders successful comparison result with mandatory consumer disclaimer, price cards, and difference math', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
      if (url === '/public/establishments') {
        return Promise.resolve({ data: { success: true, data: [store] } });
      }
      return Promise.reject(new Error('not found'));
    });

    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_123',
              ocr_status: 'OCR_PRODUCT_AND_PRICE_DETECTED',
              store,
              candidates: [
                { id: 10, commodity_name: 'Saba Sardines 155g', unit: '155g', category: 'Canned Goods', match_score: 95, match_level: 'STRONG', match_basis: 'NAME_ABBREVIATION' },
                { id: 11, commodity_name: 'Saba Sardines Chili 155g', unit: '155g', category: 'Canned Goods', match_score: 84, match_level: 'STRONG', match_basis: 'NAME_ABBREVIATION' },
              ],
              detected_price_string: '23.50',
              detected_price_source: 'OCR',
              product_source: 'OCR',
              auto_resolved: false,
              recovery_reason: 'AMBIGUOUS_PRODUCT',
            },
          },
        });
      }
      if (url === '/public/scan-tag/compare') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_123',
              store,
              commodity_name: 'Saba Sardines 155g',
              package_size: '155g',
              unit: '155g',
              displayed_price: '23.50',
              baseline_price: '21.50',
              reference_price: '21.50',
              regulatory_label: 'Current SRP',
              peso_difference: '2.00',
              is_above_reference: true,
              product_source: 'OCR_CANDIDATE_SELECTED',
              price_source: 'OCR_DETECTED',
              disclaimer: 'This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.',
            },
          },
        });
      }
      return Promise.reject(new Error('unknown endpoint'));
    });

    const user = userEvent.setup();
    render(
      <BackNavigationProvider>
        <ShelfScanner />
      </BackNavigationProvider>,
    );

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(await screen.findByText('Select Product Match')).toBeInTheDocument();
    expect(screen.getByText(/OCR-Detected Tag Price: ₱23.50/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Saba Sardines 155g/i }));

    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/public/scan-tag/compare', expect.objectContaining({
      product_id: 10,
      product_source: 'OCR_CANDIDATE_SELECTED',
      price_source: 'OCR_DETECTED',
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));

    // Mandatory Consumer Disclaimer
    expect(screen.getByText(/This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation./i)).toBeInTheDocument();

    // Price Badges & Labels
    expect(screen.getByText('✔ OCR-Detected Tag Price')).toBeInTheDocument();
    expect(screen.getByText('OCR-Detected')).toBeInTheDocument();
    expect(screen.getByText('Current SRP')).toBeInTheDocument();

    // Difference Math
    expect(screen.getByText(/₱2.00 above Current SRP/i)).toBeInTheDocument();

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(await screen.findByRole('button', { name: 'Continue with Verified API Store' })).toBeInTheDocument();
    expect(screen.queryByText('Comparison Result')).not.toBeInTheDocument();
  });

  it('handles PRODUCT_DETECTED_PRICE_MISSING flow and prompts consumer to enter displayed price', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_456',
              ocr_status: 'PRODUCT_DETECTED_PRICE_MISSING',
              store,
              candidates: [
                { id: 10, commodity_name: 'Saba Sardines 155g', baseline_price: 21.5, unit: '155g' },
              ],
              detected_price_string: null,
              detected_price_source: 'OCR',
              product_source: 'OCR',
            },
          },
        });
      }
      if (url === '/public/scan-tag/compare') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_456',
              store,
              commodity_name: 'Saba Sardines 155g',
              package_size: '155g',
              displayed_price: '25.00',
              baseline_price: '21.50',
              reference_price: '21.50',
              regulatory_label: 'Current SRP',
              peso_difference: '3.50',
              is_above_reference: true,
              product_source: 'OCR',
              price_source: 'USER_ENTERED',
            },
          },
        });
      }
      return Promise.reject(new Error('unknown endpoint'));
    });

    const user = userEvent.setup();
    render(<ShelfScanner />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(await screen.findByText('Enter Displayed Shelf Price')).toBeInTheDocument();
    expect(screen.getByText(/The price could not be read clearly. Your entered price will be used only for this informational comparison.../i)).toBeInTheDocument();

    const priceInput = screen.getByPlaceholderText(/Enter price/i);
    await user.type(priceInput, '25.00');

    await user.click(screen.getByRole('button', { name: /Compute Regulatory Comparison/i }));

    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(screen.getByText('✏️ Consumer-Entered Price')).toBeInTheDocument();
  });

  it('preserves an OCR price and compares immediately after manual product selection', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((url: string) => {
      if (url === '/public/establishments') {
        return Promise.resolve({ data: { success: true, data: [store] } });
      }
      if (url.startsWith('/public/commodities')) {
        return Promise.resolve({
          data: {
            success: true,
            data: [{ id: 12, commodity_name: 'Coronado Sardines 155g', baseline_price: 20.0, unit: '155g', category: 'Canned Goods' }],
          },
        });
      }
      return Promise.reject(new Error('not found'));
    });

    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_789',
              ocr_status: 'NO_RELIABLE_PRODUCT_MATCH',
              store,
              candidates: [],
              detected_price_string: '22.00',
              detected_price_source: 'OCR',
              product_source: 'OCR',
            },
          },
        });
      }
      if (url === '/public/scan-tag/manual-select') {
        return Promise.resolve({
          data: {
            success: true,
            data: { scan_id: 'scan_789', product_id: 12, product_source: 'MANUAL_SEARCH' },
          },
        });
      }
      if (url === '/public/scan-tag/compare') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_789',
              store,
              commodity_name: 'Coronado Sardines 155g',
              package_size: '155g',
              displayed_price: '22.00',
              baseline_price: '20.00',
              reference_price: '20.00',
              regulatory_label: 'Current SRP',
              peso_difference: '2.00',
              is_above_reference: true,
              product_source: 'MANUAL_SEARCH',
              price_source: 'OCR_DETECTED',
            },
          },
        });
      }
      return Promise.reject(new Error('unknown endpoint'));
    });

    const user = userEvent.setup();
    render(<ShelfScanner />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(await screen.findByText('No matching product found on shelf tag')).toBeInTheDocument();

    const commoditySearchInput = screen.getByPlaceholderText(/Type commodity name/i);
    await user.type(commoditySearchInput, 'Coronado');

    const matchedCommodity = await screen.findByText('Coronado Sardines 155g');
    await user.click(matchedCommodity);

    expect(apiClient.post).toHaveBeenCalledWith('/public/scan-tag/manual-select', {
      scan_id: 'scan_789',
      product_id: 12,
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(screen.getByText('Manual Directory Selection')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/public/scan-tag/compare', expect.objectContaining({
      product_id: 12,
      displayed_price: 22,
      product_source: 'MANUAL_SEARCH',
      price_source: 'OCR_DETECTED',
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('hands off contextual store and product details to formal report excluding shelf tag image', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_handoff',
              ocr_status: 'OCR_PRODUCT_AND_PRICE_DETECTED',
              store,
              candidates: [{ id: 10, commodity_name: 'Saba Sardines 155g', baseline_price: 21.5, unit: '155g' }],
              detected_price_string: '23.50',
            },
          },
        });
      }
      if (url === '/public/scan-tag/compare') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_handoff',
              store,
              product: { id: 10, commodity_name: 'Saba Sardines 155g', baseline_price: 21.5 },
              displayed_price: '23.50',
              baseline_price: '21.50',
              regulatory_label: 'Current SRP',
              comparison_status: 'ABOVE_SRP',
              peso_difference: '2.00',
              product_source: 'OCR',
              price_source: 'USER_CONFIRMED',
            },
          },
        });
      }
      return Promise.reject(new Error('unknown'));
    });

    const setActiveTab = vi.fn();
    const user = userEvent.setup();
    render(<ShelfScanner setActiveTab={setActiveTab} />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));
    await screen.findByText('Select Product Match');
    await user.click(screen.getByRole('button', { name: /Compute Regulatory Comparison/i }));

    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Report using receipt/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Report using receipt/i }));

    expect(setActiveTab).toHaveBeenCalledWith('reports');

    const handoffRaw = sessionStorage.getItem('price-watch-flow-handoff');
    expect(handoffRaw).not.toBeNull();
    const handoff = JSON.parse(handoffRaw!);

    expect(handoff).toEqual({
      kind: 'scan-to-report',
      storeId: 77,
      commodityId: 10,
      displayedPrice: 23.5,
      baselinePrice: 21.5,
    });

    // Ensure image and blob are completely excluded
    expect(handoff.image).toBeUndefined();
    expect(handoff.previewUrl).toBeUndefined();
    expect(handoff.capturedBlob).toBeUndefined();
  });

  it('keeps a low-confidence OCR price editable instead of treating it as confirmed', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_uncertain_price',
              ocr_status: 'OCR_PRODUCT_AND_PRICE_DETECTED',
              store,
              candidates: [{
                id: 10,
                commodity_name: 'Saba Sardines 155g',
                match_score: 94,
                match_level: 'STRONG',
                match_basis: 'NAME_EXACT',
              }],
              detected_price_string: '23.50',
              price_confidence: 55,
              auto_resolved: false,
              recovery_reason: 'PRICE_UNCERTAIN',
            },
          },
        });
      }
      if (url === '/public/scan-tag/compare') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_uncertain_price',
              store,
              commodity_name: 'Saba Sardines 155g',
              displayed_price: '24.00',
              reference_price: '21.50',
              regulatory_label: 'Current SRP',
              peso_difference: '2.50',
              is_above_reference: true,
              product_source: 'OCR',
              price_source: 'USER_CORRECTED',
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
    });

    const user = userEvent.setup();
    render(<ShelfScanner />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(await screen.findByText('Check the shelf price')).toBeInTheDocument();
    const priceInput = screen.getByDisplayValue('23.50');
    await user.clear(priceInput);
    await user.type(priceInput, '24.00');
    await user.click(screen.getByRole('button', { name: /Compute Regulatory Comparison/i }));

    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/public/scan-tag/compare', expect.objectContaining({
      displayed_price: 24,
      price_source: 'USER_CORRECTED',
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('submits the guide crop immediately and shows an automatic comparison without a review step', async () => {
    const track = { stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
    const mediaStream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(mediaStream) },
    });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_auto',
              ocr_status: 'OCR_PRODUCT_AND_PRICE_DETECTED',
              store,
              candidates: [],
              detected_price_string: '23.50',
              price_confidence: 96,
              auto_resolved: true,
              recovery_reason: null,
              comparison: {
                scan_id: 'scan_auto',
                store,
                product: {
                  id: 10,
                  commodity_name: 'Saba Sardines 155g',
                  baseline_price: 21.5,
                  effective_date: '2026-08-01',
                },
                commodity_name: 'Saba Sardines 155g',
                displayed_price: '23.50',
                reference_price: '21.50',
                regulatory_label: 'Current SRP',
                peso_difference: '2.00',
                is_above_reference: true,
                product_source: 'OCR_AUTO',
                price_source: 'OCR_DETECTED',
              },
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
    });

    const user = userEvent.setup();
    render(<ShelfScanner />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(screen.queryByRole('button', { name: 'Use capture' })).not.toBeInTheDocument();
    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/public/scan-tag/analyze',
      expect.any(FormData),
      expect.objectContaining({ timeout: 12000 }),
    );
    expect(screen.getByText(/OCR-Detected Tag Price/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Correct product or price/i }));
    expect(await screen.findByText('Search Commodity Directory')).toBeInTheDocument();
    expect(screen.getByDisplayValue('23.50')).toBeInTheDocument();
  });

  it('keeps matching-SRP actions in page flow and shows the concise catalog product name', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: [store] } });
    vi.spyOn(apiClient, 'post').mockImplementation((url: string) => {
      if (url === '/public/scan-tag/analyze') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              scan_id: 'scan_matching_srp',
              ocr_status: 'OCR_PRODUCT_AND_PRICE_DETECTED',
              store,
              candidates: [],
              detected_price_string: '15.00',
              price_confidence: 96,
              auto_resolved: true,
              recovery_reason: null,
              comparison: {
                scan_id: 'scan_matching_srp',
                store,
                product: {
                  id: 20,
                  commodity_name: 'Instant Mami Noodles - Chicken & Beef Flavor - Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)',
                  category: 'Instant Mami Noodles',
                  unit: '55g',
                  baseline_price: 15,
                  effective_date: '2026-08-01',
                },
                commodity_name: 'Instant Mami Noodles - Chicken & Beef Flavor - Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)',
                displayed_price: '15.00',
                reference_price: '15.00',
                regulatory_label: 'Current SRP',
                comparison_status: 'MATCHES_SRP',
                peso_difference: '0.00',
                is_above_reference: false,
                product_source: 'OCR_AUTO',
                price_source: 'OCR_DETECTED',
              },
            },
          },
        });
      }
      return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
    });

    const user = userEvent.setup();
    render(<ShelfScanner />);

    await screen.findByText('Verified API Store');
    await user.click(screen.getByRole('button', { name: 'Continue with Verified API Store' }));
    await user.click(screen.getByLabelText('Capture Shutter'));

    expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
    expect(screen.getByText('Matches Current SRP baseline')).toBeInTheDocument();
    expect(screen.getByText('Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Report using receipt/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Correct product or price/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan another item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View price history/i })).toBeInTheDocument();
    expect(screen.getByTestId('scan-result-actions')).not.toHaveStyle({ position: 'fixed' });
    expect(screen.getByTestId('scan-result-actions')).not.toHaveStyle({ position: 'sticky' });
  });
});
