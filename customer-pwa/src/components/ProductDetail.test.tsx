import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Commodity, type SrpHistoryEntry } from '../api/client';
import css from '../index.css?raw';
import { ProductDetail } from './ProductDetail';

const commodity: Commodity = {
  id: 501,
  commodity_name: 'Bottled Water - Distilled Water - Absolute (1L)',
  category: 'Bottled Water - Distilled Water',
  unit: '1L',
  regulatory_classification: 'BASIC_NECESSITY',
  baseline_price: 25,
  effective_date: '2026-08-01',
  source_reference: 'DTI-SRP-2026-08',
  is_active: true,
  image_path: 'https://images.example.test/absolute.webp',
};

const currentVersion: SrpHistoryEntry = {
  id: 501,
  baseline_price: 25,
  effective_date: '2026-08-01',
  source_reference: 'DTI-SRP-2026-08',
};

function mockHistory(history: SrpHistoryEntry[]) {
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: { success: true, data: { commodity_id: commodity.id, history } },
  });
}

describe('ProductDetail', () => {
  beforeEach(() => mockHistory([currentVersion]));
  afterEach(() => vi.restoreAllMocks());

  it('shows the current SRP and compares it with the immediately previous official version', async () => {
    vi.restoreAllMocks();
    mockHistory([
      currentVersion,
      { id: 420, baseline_price: 23, effective_date: '2026-06-01', source_reference: 'DTI-SRP-2026-06' },
    ]);
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Absolute \(1L\)/i })).toBeInTheDocument();
    expect(screen.getByText('Current SRP')).toBeInTheDocument();
    expect(screen.getByText('\u20B125.00')).toBeInTheDocument();
    expect(await screen.findByText('+\u20B12.00')).toBeInTheDocument();
    expect(screen.getByText('vs past SRP')).toBeInTheDocument();
    expect(screen.getByText('Aug 1, 2026')).toBeInTheDocument();
  });

  it('distinguishes no prior SRP from unavailable history', async () => {
    const { unmount } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    expect(await screen.findByText('No past SRP')).toBeInTheDocument();
    unmount();

    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<ProductDetail commodity={commodity} dataSource="cached" dataFetchedAt={null} onBack={vi.fn()} />);
    expect(await screen.findByText('History unavailable')).toBeInTheDocument();
  });

  it('provides accessible Details, History, and Source tabs with keyboard navigation', async () => {
    vi.restoreAllMocks();
    mockHistory([
      currentVersion,
      { id: 420, baseline_price: 23, effective_date: '2026-06-01', source_reference: 'Older bulletin' },
    ]);
    const user = userEvent.setup();
    render(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={Date.UTC(2026, 7, 12, 1, 30)}
        onBack={vi.fn()}
        stateOfCalamity={false}
      />,
    );

    const detailsTab = screen.getByRole('tab', { name: 'Details' });
    const historyTab = screen.getByRole('tab', { name: 'History' });
    expect(detailsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Official unit')).toBeInTheDocument();
    expect(screen.getByText('Normal monitoring')).toBeInTheDocument();

    await user.click(historyTab);
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Current')).toBeInTheDocument();
    expect(screen.getByText('\u20B123.00')).toBeInTheDocument();

    fireEvent.keyDown(historyTab, { key: 'ArrowRight' });
    const sourceTab = screen.getByRole('tab', { name: 'Source' });
    expect(sourceTab).toHaveFocus();
    expect(sourceTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('DTI-SRP-2026-08')).toBeInTheDocument();
    expect(screen.getByText('Live data')).toBeInTheDocument();
    expect(screen.queryByText('Nationwide')).not.toBeInTheDocument();
    expect(screen.queryByText('Barcode')).not.toBeInTheDocument();
  });

  it('offers a retry when history cannot be loaded', async () => {
    vi.restoreAllMocks();
    const get = vi.spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { success: true, data: { commodity_id: commodity.id, history: [currentVersion] } } });
    const user = userEvent.setup();
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'History' }));
    await user.click(await screen.findByRole('button', { name: 'Retry price history' }));
    expect(get).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('No past SRP is available for comparison.')).toBeInTheDocument();
  });

  it('opens the full-image viewer only after the product image loads', async () => {
    const user = userEvent.setup();
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);
    const image = screen.getByRole('img', { name: commodity.commodity_name });
    expect(image).toHaveStyle({ objectFit: 'contain' });
    expect(screen.queryByRole('button', { name: `View full image of ${commodity.commodity_name}` })).not.toBeInTheDocument();
    fireEvent.load(image);
    await user.click(screen.getByRole('button', { name: `View full image of ${commodity.commodity_name}` }));

    const dialog = screen.getByRole('dialog', { name: `Full image of ${commodity.commodity_name}` });
    expect(within(dialog).getByRole('img', { name: commodity.commodity_name })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close full image' })).toHaveFocus();
  });

  it('replaces failed images with the neutral fallback', () => {
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);
    fireEvent.error(screen.getByRole('img', { name: commodity.commodity_name }));
    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View full image/i })).not.toBeInTheDocument();
  });

  it('does not render scan, report, or compare action buttons on product details', () => {
    render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Scan shelf price/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Report a concern/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Compare Prices/i })).not.toBeInTheDocument();
  });

  it('shows confirmed price-freeze treatment without inventing duration or penalties', async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        commodity={{ ...commodity, price_freeze_applicable: true, price_freeze_treatment: 'Use the active local price-freeze bulletin.' }}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
        stateOfCalamity
      />,
    );
    await user.click(screen.getByRole('button', { name: /Price-freeze information/i }));
    expect(screen.getByText('Use the active local price-freeze bulletin.')).toBeInTheDocument();
    expect(screen.queryByText(/60 days/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/penalt/i)).not.toBeInTheDocument();
  });

  it('uses a studio image stage, summary metrics, segmented tabs, and bottom-nav clearance', () => {
    const detailRule = css.match(/\.product-detail\s*\{([^}]*)\}/)?.[1] || '';
    const imageRule = css.match(/\.product-detail-image-stage\s*\{([^}]*)\}/)?.[1] || '';
    expect(detailRule).toMatch(/max-width:\s*720px/);
    expect(detailRule).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(imageRule).toMatch(/min-height:\s*380px/);
    expect(css).toMatch(/\.product-detail-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.product-detail-summary-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('reloads history and resets the visible panel when the selected commodity changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    await user.click(screen.getByRole('tab', { name: 'Source' }));
    rerender(
      <ProductDetail commodity={{ ...commodity, id: 502, commodity_name: 'Sample Sardines (155g)' }} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );

    await waitFor(() => expect(apiClient.get).toHaveBeenLastCalledWith('/public/commodities/502/history'));
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });
});
