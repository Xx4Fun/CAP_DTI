import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreDetailOverlay } from './StoreDetailOverlay'
import { reviewThreshold } from './storeMapUtils'
import { adminApi } from '../../services/adminApi'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getAnalytics: vi.fn(),
    getReportPage: vi.fn(),
    getLegalNotices: vi.fn(),
  },
}))

// chart.js cannot draw in jsdom; expose the datasets the overlay hands it instead.
vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data: unknown }) => <pre data-testid="chart">{JSON.stringify(data)}</pre>,
}))

const store = {
  id: 9,
  store_name: 'Verified Market',
  address: 'San Jose, Antique',
  latitude: 10.74,
  longitude: 121.94,
  is_active: true,
  is_verified: true,
  is_public: true,
  recidivism_index: 1,
  image_path: 'https://assets.example.test/store_images/robinsons.webp',
}

const reportPage = (rows: object[], page = 1, lastPage = 1, total = rows.length) => ({
  data: rows,
  meta: { current_page: page, last_page: lastPage, per_page: 20, total, from: null, to: null },
})
const noticePage = (rows: object[], page = 1, lastPage = 1, total = rows.length) => ({
  data: rows, current_page: page, last_page: lastPage, per_page: 20, total, from: null, to: null,
})
const report = (id: number) => ({ id, report_reference: `CR-${id}`, status: 'Submitted', submitted_at: '2026-09-20T02:00:00Z', observed_at: '2026-09-19', above_reference_count: 0 })

const renderOverlay = () => render(<StoreDetailOverlay store={store} onClose={vi.fn()} onCenterMap={vi.fn()} />)

describe('StoreDetailOverlay regulatory integrity', () => {
  beforeEach(() => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValue({ table_rows: [] } as any)
    vi.mocked(adminApi.getReportPage).mockResolvedValue(reportPage([]) as any)
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue(noticePage([]) as any)
  })

  it('does not attach fabricated legal actions or consumer tips to a store', async () => {
    const user = userEvent.setup()
    renderOverlay()

    const hero = screen.getByRole('img', { name: /Verified Market establishment/i }) as HTMLImageElement
    expect(hero.getAttribute('src')).toBe('https://assets.example.test/store_images/robinsons.webp')
    fireEvent.error(hero)
    expect(hero.getAttribute('src')).toBe('/stores/store.webp')
    expect(screen.queryByRole('button', { name: /Invite Vendor/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Legal Audit/i }))
    expect(await screen.findByText(/No authoritative legal action records are available/i)).toBeInTheDocument()
    expect(screen.queryByText(/Letter of Inquiry/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Show Cause Order/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Tips Log/i }))
    expect(await screen.findByText(/No consumer report records are available/i)).toBeInTheDocument()
    expect(screen.queryByText(/Super Do/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Refined Sugar/i)).not.toBeInTheDocument()
  })

  it("lists the store's consumer reports and legal notices, with labelled notice dates", async () => {
    vi.mocked(adminApi.getReportPage).mockResolvedValue(reportPage([{ ...report(1), above_reference_count: 2 }]) as any)
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue(noticePage([
      { id: 5, notice_type: 'LOI', control_number: 'LOI-2026-005', status: 'cancelled', issued_at: '2026-09-10T00:00:00Z', cancelled_at: '2026-09-12T00:00:00Z', closed_at: null, updated_at: '2026-09-12T00:00:00Z' },
      { id: 6, notice_type: 'LOI', control_number: null, status: 'draft', issued_at: null, cancelled_at: null, closed_at: null, updated_at: '2026-09-14T00:00:00Z' },
    ]) as any)
    const user = userEvent.setup()
    renderOverlay()

    expect(adminApi.getReportPage).toHaveBeenCalledWith({ page: 1, per_page: 20, store_id: 9 })
    expect(adminApi.getLegalNotices).toHaveBeenCalledWith({ store_id: 9, page: 1 })

    await user.click(screen.getByRole('button', { name: /Tips Log/i }))
    expect(await screen.findByText('CR-1')).toBeInTheDocument()
    expect(screen.getByText(/Consumer reports in DTI review queue \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/2 above reference/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Legal Audit/i }))
    expect(screen.getByText('LOI · LOI-2026-005')).toBeInTheDocument()
    expect(screen.getByText(/Issued .*2026 · Cancelled .*2026/)).toBeInTheDocument()
    expect(screen.getByText('LOI · Draft')).toBeInTheDocument()
    expect(screen.getByText(/Updated .*2026/)).toBeInTheDocument()
  })

  it('loads the next page of reports on demand and appends it', async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) => report(i + 1))
    vi.mocked(adminApi.getReportPage)
      .mockResolvedValueOnce(reportPage(firstPage, 1, 2, 21) as any)
      .mockResolvedValueOnce(reportPage([report(21)], 2, 2, 21) as any)
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /Tips Log/i }))
    expect(await screen.findByText('CR-20')).toBeInTheDocument()
    expect(screen.queryByText('CR-21')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('CR-21')).toBeInTheDocument()
    expect(screen.getByText('CR-1')).toBeInTheDocument()
    expect(adminApi.getReportPage).toHaveBeenLastCalledWith({ page: 2, per_page: 20, store_id: 9 })
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('reports a failed load as an error, never as an empty history', async () => {
    vi.mocked(adminApi.getReportPage).mockRejectedValue(new Error('403'))
    vi.mocked(adminApi.getLegalNotices).mockRejectedValue(new Error('403'))
    vi.mocked(adminApi.getAnalytics).mockRejectedValue(new Error('403'))
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /Tips Log/i }))
    expect(await screen.findByText('Consumer reports could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText(/No consumer report records/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Legal Audit/i }))
    expect(screen.getByText('Legal notices could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByText(/No authoritative legal action records/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Price Trends/i }))
    expect(screen.getByText('Price history could not be loaded.')).toBeInTheDocument()
  })

  it('charts the chosen commodity against its own review threshold', async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValue({ table_rows: [
      { date: '2026-09-20', price: 52, srp: 48, source: 'Verified field inspection', reference_type: 'srp', commodity_key: 'rice', commodity_name: 'Rice 1kg' },
      { date: '2026-09-21', price: 105, srp: 100, source: 'Validated receipt', reference_type: 'emergency_ceiling', commodity_key: 'sardines', commodity_name: 'Sardines 155g' },
    ] } as any)
    const user = userEvent.setup()
    renderOverlay()
    expect(adminApi.getAnalytics).toHaveBeenCalledWith(9, undefined, 4)

    await user.click(screen.getByRole('button', { name: /Price Trends/i }))
    const select = await screen.findByRole('combobox', { name: /Commodity/i })
    let datasets = JSON.parse(screen.getByTestId('chart').textContent!).datasets
    expect(datasets.map((d: any) => d.label)).toEqual(['Observed price', 'Review threshold', 'Reference price'])
    expect(datasets[0].data).toEqual([52])
    expect(datasets[1].data[0]).toBeCloseTo(52.8)

    await user.selectOptions(select, 'sardines')
    datasets = JSON.parse(screen.getByTestId('chart').textContent!).datasets
    expect(datasets[0].data).toEqual([105])
    // Emergency ceiling: no 10% allowance, so 105 sits above the 100 threshold.
    expect(datasets[1].data).toEqual([100])
  })
})

describe('StoreDetailOverlay price history range', () => {
  it('reloads the price history for 12 or 26 weeks', async () => {
    vi.mocked(adminApi.getReportPage).mockResolvedValue(reportPage([]) as any)
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue(noticePage([]) as any)
    vi.mocked(adminApi.getAnalytics).mockResolvedValue({ table_rows: [] } as any)
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /Price Trends/i }))
    expect(screen.getByRole('heading', { name: '4-Week Price History' })).toBeInTheDocument()
    // The range stays available when the default window is empty, so the reader can widen it.
    const range = screen.getByRole('combobox', { name: 'Range' })
    expect(within(range).getAllByRole('option').map((option) => option.textContent)).toEqual(['Last 4 weeks', 'Last 12 weeks', 'Last 26 weeks'])

    await user.selectOptions(range, '12')
    expect(adminApi.getAnalytics).toHaveBeenLastCalledWith(9, undefined, 12)
    expect(screen.getByRole('heading', { name: '12-Week Price History' })).toBeInTheDocument()
  })

  const row = (key: string, name: string, price: number) => ({ date: '2026-09-20', price, srp: 48, source: 'Verified field inspection', reference_type: 'standard_srp', commodity_key: key, commodity_name: name })

  it('never leaves the previous range\'s chart under a range that failed to load', async () => {
    vi.mocked(adminApi.getReportPage).mockResolvedValue(reportPage([]) as any)
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue(noticePage([]) as any)
    vi.mocked(adminApi.getAnalytics).mockImplementation(async (_storeId, _commodity, weeks) => {
      if (weeks === 12) throw new Error('500')
      return { table_rows: [row('rice', 'Rice 1kg', 52)] } as any
    })
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /Price Trends/i }))
    expect(await screen.findByTestId('chart')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Range' }), '12')
    expect(await screen.findByText('Price history could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '12-Week Price History' })).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
    expect(screen.queryByText(/No temporal price records/i)).not.toBeInTheDocument()
  })

  it('falls back to a commodity with data when the chosen one is outside a narrower range', async () => {
    vi.mocked(adminApi.getReportPage).mockResolvedValue(reportPage([]) as any)
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue(noticePage([]) as any)
    vi.mocked(adminApi.getAnalytics).mockImplementation(async (_storeId, _commodity, weeks) => ({
      // Sardines was last recorded ten weeks ago: only the wider range has it.
      table_rows: weeks === 12 ? [row('rice', 'Rice 1kg', 52), row('sardines', 'Sardines 155g', 30)] : [row('rice', 'Rice 1kg', 52)],
    }) as any)
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /Price Trends/i }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Range' }), '12')
    await user.selectOptions(await screen.findByRole('combobox', { name: /Commodity/i }), 'sardines')
    expect(JSON.parse(screen.getByTestId('chart').textContent!).datasets[0].data).toEqual([30])

    await user.selectOptions(screen.getByRole('combobox', { name: 'Range' }), '4')
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Commodity/i })).toHaveValue('rice'))
    expect(JSON.parse(screen.getByTestId('chart').textContent!).datasets[0].data).toEqual([52])
    expect(screen.queryByText(/No temporal price records/i)).not.toBeInTheDocument()
  })
})

describe('StoreDetailOverlay price history without a commodity', () => {
  it('keeps a finding whose bulletin was deleted visible as an unidentified commodity', async () => {
    vi.mocked(adminApi.getReportPage).mockResolvedValue(reportPage([]) as any)
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue(noticePage([]) as any)
    vi.mocked(adminApi.getAnalytics).mockResolvedValue({ table_rows: [
      { date: '2026-09-22', price: 30, srp: 25, source: 'Validated receipt', reference_type: 'standard_srp', commodity_key: null, commodity_name: null },
    ] } as any)
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /Price Trends/i }))
    expect(await screen.findByRole('option', { name: 'Unidentified commodity' })).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('chart').textContent!).datasets[0].data).toEqual([30])
  })
})

describe('reviewThreshold', () => {
  it('applies the 10% allowance only to standard references', () => {
    expect(reviewThreshold({ srp: 100, reference_type: 'emergency_ceiling' })).toBe(100)
    expect(reviewThreshold({ srp: 100, reference_type: 'srp' })).toBeCloseTo(110)
    expect(reviewThreshold({ srp: 100 })).toBeCloseTo(110)
    expect(reviewThreshold({ srp: null })).toBeNull()
    // A confirmed receipt finding was decided against the reference itself, not the field allowance.
    expect(reviewThreshold({ srp: 100, reference_type: 'standard_srp', source: 'Validated receipt' })).toBe(100)
  })
})
