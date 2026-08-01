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
      stores: [
        { id: 8, store_name: 'Verified Market', address: 'San Jose' },
        { id: 12, store_name: 'Antique Supermart', address: 'Poblacion' },
      ],
      commodities: [
        { commodity_key: 'rice-1kg', commodity_name: 'Rice 1kg' },
        { commodity_key: 'sugar-1kg', commodity_name: 'Refined Sugar 1kg' },
      ],
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

  it('filters establishment and commodity dropdown options using search inputs', async () => {
    const user = userEvent.setup()
    render(<TemporalVolatility />)

    await screen.findByRole('combobox', { name: /Select establishment/i })

    const storeSearchInput = screen.getByLabelText(/Search establishment filter/i)
    await user.type(storeSearchInput, 'Antique')

    expect(screen.getByRole('option', { name: /Antique Supermart/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Verified Market/i })).not.toBeInTheDocument()

    const commoditySearchInput = screen.getByLabelText(/Search commodity filter/i)
    await user.type(commoditySearchInput, 'Sugar')

    expect(screen.getByRole('option', { name: /Refined Sugar 1kg/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Rice 1kg/i })).not.toBeInTheDocument()
  })

  it('renders quick date-range filter pills and visual legend callouts', async () => {
    const user = userEvent.setup()
    render(<TemporalVolatility />)

    const store = await screen.findByRole('combobox', { name: /Select establishment/i })
    const commodity = screen.getByRole('combobox', { name: /Select commodity/i })
    await user.selectOptions(store, '8')
    await user.selectOptions(commodity, 'rice-1kg')

    // Date range pills
    expect(screen.getByRole('button', { name: /Last 7 Days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Last 14 Days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Last 30 Days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All Records/i })).toBeInTheDocument()

    // Visual Legend Callouts
    expect(screen.getByTestId('visual-legend-callouts')).toBeInTheDocument()
    expect(screen.getByText(/Official Prevailing SRP Baseline/i)).toBeInTheDocument()
    expect(screen.getByText(/10% Regulatory Allowance Band/i)).toBeInTheDocument()
    expect(screen.getByText(/Recorded Field Shelf Price/i)).toBeInTheDocument()
  })

  it('calculates and renders direct peso and percentage variance callout for anomalies', async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce({
      labels: ['2026-07-15'],
      price_series: [54],
      srp_series: [48],
      table_rows: [{ date: '2026-07-15', price: 54, srp: 48, source: 'Field Inspection' }],
      recidivism_count: 1,
    })

    const user = userEvent.setup()
    render(<TemporalVolatility />)

    const store = await screen.findByRole('combobox', { name: /Select establishment/i })
    const commodity = screen.getByRole('combobox', { name: /Select commodity/i })
    await user.selectOptions(store, '8')
    await user.selectOptions(commodity, 'rice-1kg')

    const callout = await screen.findByTestId('variance-callout-card')
    expect(callout).toBeInTheDocument()
    // 54 - 48 = 6.00, (6/48)*100 = 12.5%
    expect(screen.getByText(/\+₱6\.00 \(\+12\.5%\) above prevailing SRP ceiling — Flagged for LOI dispatch/i)).toBeInTheDocument()
  })
})
