import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Commodity } from '../api/client';
import { PriceProductCard } from './PriceProductCard';

const commodity: Commodity = {
  id: 1, commodity_name: 'Absolute (350mL)', baseline_price: 12, effective_date: '2026-05-11', is_active: true, price_freeze_applicable: true,
  reference: { status: 'available', type: 'emergency_ceiling', value: 14, label: 'Official APC / Price Freeze reference', source: 'DECL-1', effective_date: '2026-10-07', source_id: 1 },
};

describe('PriceProductCard', () => {
  it.each(['live', 'cached'] as const)('shows one official price on a red %s card', (dataSource) => {
    render(<PriceProductCard commodity={commodity} stateOfCalamity dataSource={dataSource} onSelect={() => {}} />);
    const card = screen.getByRole('button');
    expect(card.querySelector('.price-product-price')).toHaveClass('is-emergency');
    expect(within(card).getByText('APC ceiling')).toBeInTheDocument();
    expect(within(card).getByText('₱14.00')).toBeInTheDocument();
    expect(within(card).queryByText(/12.00|SRP context/)).not.toBeInTheDocument();
  });

  it('changes back to a blue SRP panel when its reference changes to standard', () => {
    const { rerender } = render(<PriceProductCard commodity={commodity} stateOfCalamity dataSource="live" onSelect={() => {}} />);
    rerender(<PriceProductCard commodity={{ ...commodity, reference: { ...commodity.reference!, type: 'standard_srp', label: 'SRP baseline (provisional)', value: 12 } }} stateOfCalamity={false} dataSource="live" onSelect={() => {}} />);
    expect(screen.getByText('₱12.00')).toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('.price-product-price')).not.toHaveClass('is-emergency');
  });
});
