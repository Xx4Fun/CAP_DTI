import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Commodity } from '../api/client';
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

describe('ProductDetail regulatory truthfulness', () => {
  it('shows the live price, real effective date, and public bulletin reference', () => {
    render(
      <ProductDetail
        commodity={commodity}
        dataSource="live"
        dataFetchedAt={Date.UTC(2026, 7, 12, 1, 30)}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Current SRP').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Effective Aug 1, 2026/i).length).toBeGreaterThan(0);
    expect(screen.getByText('DTI-SRP-2026-08')).toBeInTheDocument();
    expect(screen.queryByText('Nationwide')).not.toBeInTheDocument();
  });

  it('does not invent missing dates, scope, source, or a normal regulatory state', () => {
    render(
      <ProductDetail
        commodity={{ ...commodity, effective_date: null, source_reference: null, regulatory_state: undefined }}
        dataSource="cached"
        dataFetchedAt={null}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Saved reference price').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026-05-11/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nationwide')).not.toBeInTheDocument();
    expect(screen.queryByText('Normal monitoring')).not.toBeInTheDocument();
  });

  it('contains uploaded images and replaces failures with the neutral fallback', () => {
    render(<ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />);

    const image = screen.getByRole('img', { name: commodity.commodity_name });
    expect(image).toHaveStyle({ objectFit: 'contain' });
    fireEvent.error(image);
    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('shows only item-supported price-freeze treatment without fixed duration or penalty claims', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProductDetail commodity={commodity} dataSource="live" dataFetchedAt={null} onBack={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /Price-freeze information/i })).not.toBeInTheDocument();

    rerender(
      <ProductDetail
        commodity={{ ...commodity, price_freeze_applicable: true, price_freeze_treatment: 'Use the active local price-freeze bulletin.' }}
        dataSource="live"
        dataFetchedAt={null}
        onBack={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Price-freeze information/i }));
    expect(screen.getByText('Use the active local price-freeze bulletin.')).toBeInTheDocument();
    expect(screen.queryByText(/60 days/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/penalt/i)).not.toBeInTheDocument();
  });
});
