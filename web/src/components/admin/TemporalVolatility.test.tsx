import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { TemporalVolatility } from './TemporalVolatility'

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="price-chart" />,
}))

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getAnalyticsOptions: vi.fn(),
    getAnalytics: vi.fn(),
  },
}))

describe('TemporalVolatility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getAnalyticsOptions).mockResolvedValue({
      stores: [{ id: 8, store_name: 'Verified Market', address: 'Antique' }],
      commodities: [{ commodity_key: 'rice-1kg', commodity_name: 'Rice 1kg' }],
    })
    vi.mocked(adminApi.getAnalytics).mockResolvedValue({
      labels: ['2026-07-01'],
      price_series: [49],
      srp_series: [48],
      table_rows: [{ date: '2026-07-01', price: 49, srp: 48, source: 'Validated receipt' }],
      recidivism_count: 1,
    })
  })

  it('requires an explicit store and commodity before loading validated analytics', async () => {
    const user = userEvent.setup()
    render(<TemporalVolatility />)

    const store = await screen.findByRole('combobox', { name: /Select establishment/i })
    const commodity = screen.getByRole('combobox', { name: /Select commodity/i })
    expect(adminApi.getAnalytics).not.toHaveBeenCalled()

    await user.selectOptions(store, '8')
    expect(adminApi.getAnalytics).not.toHaveBeenCalled()

    await user.selectOptions(commodity, 'rice-1kg')
    expect(adminApi.getAnalytics).toHaveBeenCalledWith(8, 'rice-1kg')
    expect(await screen.findByText('1 confirmed regulatory finding')).toBeInTheDocument()
    expect(screen.queryByText(/SCO Required|LOI Candidate/i)).not.toBeInTheDocument()
  })
})
