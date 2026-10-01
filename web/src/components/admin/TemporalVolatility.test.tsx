import { render, screen, within } from '@testing-library/react'
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

    const storeInput = await screen.findByLabelText(/Select establishment/i)
    const commodityInput = screen.getByLabelText(/Select commodity/i)
    expect(adminApi.getAnalytics).not.toHaveBeenCalled()

    await user.type(storeInput, 'Verified')
    const storeOption = await screen.findByRole('option', { name: /Verified Market/i })
    await user.click(storeOption)
    expect(adminApi.getAnalytics).not.toHaveBeenCalled()

    await user.type(commodityInput, 'Rice')
    const commodityOption = await screen.findByRole('option', { name: /Rice 1kg/i })
    await user.click(commodityOption)

    expect(adminApi.getAnalytics).toHaveBeenCalledWith(8, 'rice-1kg')
    expect(await screen.findByText('1 confirmed regulatory finding')).toBeInTheDocument()
    expect(screen.queryByText(/SCO Required|LOI Candidate/i)).not.toBeInTheDocument()
  })

  it('filters establishment and commodity dropdown options using search inputs', async () => {
    const user = userEvent.setup()
    render(<TemporalVolatility />)

    const storeInput = await screen.findByLabelText(/Select establishment/i)
    await user.type(storeInput, 'Antique')

    expect(screen.getByRole('option', { name: /Antique Supermart/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Verified Market/i })).not.toBeInTheDocument()

    const commodityInput = screen.getByLabelText(/Select commodity/i)
    await user.type(commodityInput, 'Sugar')

    expect(screen.getByRole('option', { name: /Refined Sugar 1kg/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Rice 1kg/i })).not.toBeInTheDocument()
  })

  it('renders quick date-range filter pills and visual legend callouts', async () => {
    const user = userEvent.setup()
    render(<TemporalVolatility />)

    const storeInput = await screen.findByLabelText(/Select establishment/i)
    const commodityInput = screen.getByLabelText(/Select commodity/i)

    await user.type(storeInput, 'Verified')
    await user.click(await screen.findByRole('option', { name: /Verified Market/i }))

    await user.type(commodityInput, 'Rice')
    await user.click(await screen.findByRole('option', { name: /Rice 1kg/i }))

    // Date range pills
    expect(screen.getByRole('button', { name: /Last 7 Days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Last 14 Days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Last 30 Days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All Returned Records/i })).toBeInTheDocument()

    // Visual Legend Callouts
    expect(screen.getByTestId('visual-legend-callouts')).toBeInTheDocument()
    const legend = screen.getByTestId('visual-legend-callouts')
    expect(within(legend).getByText('Reference price')).toBeInTheDocument()
    expect(within(legend).getByText('Review threshold')).toBeInTheDocument()
    expect(screen.getByText(/Recorded Field Shelf Price/i)).toBeInTheDocument()
  })

  it('calculates and renders direct peso and percentage variance callout for anomalies', async () => {
    const recentDate = new Date().toISOString().slice(0, 10)
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce({
      labels: [recentDate],
      price_series: [54],
      srp_series: [48],
      table_rows: [{ date: recentDate, price: 54, srp: 48, source: 'Field Inspection' }],
      recidivism_count: 1,
    })

    const user = userEvent.setup()
    render(<TemporalVolatility />)

    const storeInput = await screen.findByLabelText(/Select establishment/i)
    const commodityInput = screen.getByLabelText(/Select commodity/i)

    await user.type(storeInput, 'Verified')
    await user.click(await screen.findByRole('option', { name: /Verified Market/i }))

    await user.type(commodityInput, 'Rice')
    await user.click(await screen.findByRole('option', { name: /Rice 1kg/i }))

    const callout = await screen.findByTestId('variance-callout-card')
    expect(callout).toBeInTheDocument()
    expect(screen.getByText(/\+₱6\.00 \(\+12\.5%\).*No legal action is inferred/i)).toBeInTheDocument()
  })

  // ₱52 against ₱48 is +8.3%: inside the 10% allowance for a standard SRP, but over an emergency
  // ceiling, which carries no allowance (FieldMonitoringController).
  it.each([
    { name: 'standard SRP', referenceType: 'srp', badge: 'Above reference price', callout: /below the review threshold/ },
    { name: 'emergency ceiling', referenceType: 'emergency_ceiling', badge: 'Above review threshold', callout: /above the review threshold/ },
  ])('applies the backend review threshold for a $name', async ({ referenceType, badge, callout }) => {
    const recentDate = new Date().toISOString().slice(0, 10)
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce({
      labels: [recentDate],
      price_series: [52],
      srp_series: [48],
      table_rows: [{ date: recentDate, price: 52, srp: 48, source: 'Verified field inspection', reference_type: referenceType }],
      recidivism_count: 0,
    })

    const user = userEvent.setup()
    render(<TemporalVolatility />)

    await user.type(await screen.findByLabelText(/Select establishment/i), 'Verified')
    await user.click(await screen.findByRole('option', { name: /Verified Market/i }))
    await user.type(screen.getByLabelText(/Select commodity/i), 'Rice')
    await user.click(await screen.findByRole('option', { name: /Rice 1kg/i }))

    expect(await screen.findByText(badge)).toBeInTheDocument()
    expect(within(screen.getByTestId('variance-callout-card')).getByText(callout)).toBeInTheDocument()
  })
})
