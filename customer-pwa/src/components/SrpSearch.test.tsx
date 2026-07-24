import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type Commodity } from '../api/client';
import { SrpSearch } from './SrpSearch';

const products: Commodity[] = [
  { id: 1, commodity_name: 'Basic Sardines 155g', category: 'Sardines', unit: '155g', regulatory_classification: 'BASIC_NECESSITY', baseline_price: 21, effective_date: '2026-05-11', is_active: true },
  { id: 2, commodity_name: 'Prime Detergent 500g', category: 'Detergent', unit: '500g', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 48, effective_date: '2026-05-11', is_active: true },
];

describe('SrpSearch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('applies real classification filters and navigates from a semantic product button', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: products } });
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(<SrpSearch onNavigate={navigate} isOnline />);
    await screen.findByRole('button', { name: /Basic Sardines/i });
    await user.selectOptions(screen.getByLabelText(/Classification/i), 'PRIME_COMMODITY');
    expect(screen.queryByRole('button', { name: /Basic Sardines/i })).not.toBeInTheDocument();
    const detergent = screen.getByRole('button', { name: /Prime Detergent/i });
    await user.click(detergent);
    expect(navigate).toHaveBeenCalledWith({ name: 'product', commodityId: 2 });
  });

  it('labels bundled fallback data when live loading fails', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    render(<SrpSearch onNavigate={vi.fn()} isOnline={false} />);
    await waitFor(() => expect(screen.getByText('Bundled DTI reference list')).toBeInTheDocument());
    expect(screen.getByText(/showing bundled reference prices/i)).toBeInTheDocument();
  });
});
