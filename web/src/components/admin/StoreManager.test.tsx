import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreManager } from './StoreManager'
import api from '../../services/api'
import type { GisMonitoringPayload, GisStoreRecord } from '../../types/admin'

// The real adminApi runs on a mocked HTTP client, so the assertions see the wire parameters.
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))

// Leaflet is covered in StoreMap.test.tsx; here the map only reports what it was asked to draw.
vi.mock('./StoreMap', () => ({
  StoreMap: ({ stores, pinOf, visitLinks }: { stores: GisStoreRecord[]; pinOf: (store: GisStoreRecord) => { label: string; text?: string; badge?: string }; visitLinks: boolean }) => (
    <ul data-testid="map" data-visit-links={String(visitLinks)}>
      {stores.map((store) => {
        const pin = pinOf(store)
        return <li key={store.id}>{store.store_name} | {pin.label}{pin.text ? ` | ${pin.text}` : ''}{pin.badge ? ` | ${pin.badge}` : ''}</li>
      })}
    </ul>
  ),
}))

const WEEKS = ['2026-09-14', '2026-09-21', '2026-09-28']

const store = (id: number, name: string, overrides: Partial<GisStoreRecord> = {}): GisStoreRecord => ({
  id, store_name: name, address: 'San Jose', latitude: 10.74, longitude: 121.94, is_active: true, is_verified: true, is_public: true,
  recidivism_index: 0, has_prior_routine_visit: false, verification_required: false, visits: [], prices: [], ...overrides,
})
const visit = (id: number, overrides = {}) => ({ id, finalized_at: '2026-09-29T02:00:00+00:00', officer_name: 'Officer', is_routine: true, protocol_mode: 'standard', ...overrides })
const price = (recorded: number, overrides = {}) => ({
  commodity: 'sardines|155g', commodity_name: 'Sardines', unit: '155g', monitoring_record_id: 1, recorded_price: recorded, reference_value: 50,
  reference_type: 'standard_srp', reference_status: 'available', variance_percent: 0, is_anomaly: false, ...overrides,
})

const payload = (key: string, stores: GisStoreRecord[], locations = false): GisMonitoringPayload => {
  const end = new Date(new Date(`${key}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
  return {
    week: { key, ends_on: end, starts_at: `${key}T00:00:00+00:00`, ends_at: `${end}T00:00:00+00:00`, timezone: 'Asia/Manila', is_current: key === '2026-09-28' },
    locations, weeks: WEEKS, stores,
  }
}

const currentWeek = () => payload('2026-09-28', [
  store(1, 'Alpha Mart', { visits: [visit(1)], prices: [price(50)] }),
  store(2, 'Bravo Store', { has_prior_routine_visit: true, verification_required: true, prices: [price(60, { is_anomaly: true })] }),
  store(3, 'Charlie Shop'),
  store(4, 'Delta Closed', { is_active: false }),
])

type Deferred = { resolve: (value: GisMonitoringPayload) => void; reject: (reason: unknown) => void }
const pending: Record<string, Deferred> = {}
const requestKey = (params: { week?: string; locations?: number }) => `${params.week ?? 'current'}${params.locations ? '+locations' : ''}`

/** Every request waits until the test settles it by "<week or current>[+locations]". */
function holdRequests() {
  vi.mocked(api.get).mockImplementation((_url, config) =>
    new Promise((resolve, reject) => {
      pending[requestKey(config?.params ?? {})] = { resolve: (value) => resolve({ data: { data: value } }), reject }
    }))
}
const sent = (key: string) => waitFor(() => expect(pending[key]).toBeDefined())
const chips = () => within(screen.getByRole('textbox').parentElement!.parentElement!).getAllByRole('button').map((button) => button.textContent)

describe('StoreManager GIS layers', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    for (const key of Object.keys(pending)) delete pending[key]
  })

  it('drives chips, legend and pins from the active layer', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: currentWeek() } })
    const user = userEvent.setup()
    render(<StoreManager />)

    expect(await screen.findByText('All (4)')).toBeInTheDocument()
    expect(chips()).toEqual(['All (4)', 'No findings (3)', 'Pending (0)', 'Findings (0)'])
    expect(api.get).toHaveBeenCalledWith('/admin/gis/monitoring', { params: { week: undefined, locations: undefined } })
    // Compliance does not depend on a week.
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Coverage' }))
    expect(chips()).toEqual(['All (4)', 'Monitored (1)', 'Not monitored (1)', 'Never monitored (1)', 'Inactive (1)'])
    const legend = screen.getByRole('list', { name: 'Map legend' })
    expect(legend).toHaveTextContent('1 Monitored')
    expect(legend).toHaveTextContent('1 Never monitored')
    expect(legend).toHaveTextContent('1 Verification required')
    expect(screen.getByTestId('map')).toHaveTextContent('Bravo Store | Not monitored | Verification required')
    expect(screen.getByText('Week of Sep 28 – Oct 4, 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Never monitored/ }))
    expect(screen.getByTestId('map').querySelectorAll('li')).toHaveLength(1)
    expect(screen.getByTestId('map')).toHaveTextContent('Charlie Shop | Never monitored')

    await user.click(screen.getByRole('button', { name: 'Prices' }))
    expect(chips()).toEqual(['All (4)', 'At or below reference (1)', 'Above reference (0)', 'Flagged (1)', 'Reference unavailable (0)', 'No price this week (2)'])
    expect(screen.getByRole('combobox', { name: 'Commodity' })).toHaveValue('sardines|155g')
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | At or below reference | ₱50.00')
    expect(screen.getByTestId('map')).toHaveTextContent('Bravo Store | Flagged | ₱60.00')
    expect(screen.getByTestId('gis-price-summary')).toHaveTextContent('Lowest ₱50.00 at Alpha Mart · Highest ₱60.00 at Bravo Store · Spread ₱10.00')
    // Only Visit check ever asks for coordinates.
    expect(vi.mocked(api.get).mock.calls.every(([, config]) => (config as { params: { locations?: number } }).params.locations === undefined)).toBe(true)
  })

  it('labels the map by the loaded week while another week loads, and drops a superseded response', async () => {
    holdRequests()
    const user = userEvent.setup()
    render(<StoreManager />)
    await sent('current')
    pending.current.resolve(currentWeek())
    await screen.findByText('All (4)')
    await user.click(screen.getByRole('button', { name: 'Coverage' }))

    const slider = screen.getByRole('slider')
    expect(slider).toHaveValue('2')
    fireEvent.change(slider, { target: { value: '0' } })

    // Week B is selected but not loaded: the label and pins are still week A's.
    expect(screen.getByText('Week of Sep 28 – Oct 4, 2026')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading week of Sep 14 – Sep 20, 2026')
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | Monitored')
    await sent('2026-09-14')
    expect(api.get).toHaveBeenLastCalledWith('/admin/gis/monitoring', { params: { week: '2026-09-14', locations: undefined } })

    // The user moves on to week C before B answers; C answers first, then B arrives late.
    fireEvent.change(slider, { target: { value: '1' } })
    await sent('2026-09-21')
    pending['2026-09-21'].resolve(payload('2026-09-21', [store(1, 'Alpha Mart', { has_prior_routine_visit: true })]))
    expect(await screen.findByText('Week of Sep 21 – Sep 27, 2026')).toBeInTheDocument()
    pending['2026-09-14'].resolve(payload('2026-09-14', [store(9, 'Stale Store')]))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.getByText('Week of Sep 21 – Sep 27, 2026')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | Not monitored')
    expect(screen.getByTestId('map')).not.toHaveTextContent('Stale Store')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // A historical week never carries the verification badge.
    expect(screen.getByRole('list', { name: 'Map legend' })).not.toHaveTextContent('Verification required')
  })

  it('keeps the chosen commodity when a week has no price for it', async () => {
    const rice = { commodity: 'rice|1kg', commodity_name: 'Rice', unit: '1kg' }
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({
      data: {
        data: config?.params?.week === '2026-09-14'
          // The earlier week recorded rice only.
          ? payload('2026-09-14', [store(1, 'Alpha Mart', { prices: [price(40, rice)] })])
          : payload('2026-09-28', [store(1, 'Alpha Mart', { prices: [price(41, rice), price(50)] })]),
      },
    }))
    const user = userEvent.setup()
    render(<StoreManager />)
    await screen.findByText('All (1)')
    await user.click(screen.getByRole('button', { name: 'Prices' }))

    const commodity = screen.getByRole('combobox', { name: 'Commodity' })
    expect(commodity).toHaveValue('rice|1kg')
    await user.selectOptions(commodity, 'sardines|155g')
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | At or below reference | ₱50.00')

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    expect(await screen.findByText('Week of Sep 14 – Sep 20, 2026')).toBeInTheDocument()

    // Sardines stays selected and reads as missing; the map does not quietly switch to rice.
    expect(screen.getByRole('combobox', { name: 'Commodity' })).toHaveValue('sardines|155g')
    expect(screen.getByRole('option', { name: 'Sardines · 155g' })).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | No price this week')
    expect(screen.getByTestId('map')).not.toHaveTextContent('₱40.00')
    expect(screen.queryByTestId('gis-price-summary')).not.toBeInTheDocument()
    expect(screen.getByText('No price was recorded for this commodity in this week.')).toBeInTheDocument()
  })

  it('holds the default commodity across weeks when the user never picked one', async () => {
    const rice = { commodity: 'rice|1kg', commodity_name: 'Rice', unit: '1kg' }
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({
      data: {
        data: config?.params?.week === '2026-09-14'
          ? payload('2026-09-14', [store(1, 'Alpha Mart', { prices: [price(50)] })])
          : payload('2026-09-28', [store(1, 'Alpha Mart', { prices: [price(41, rice), price(50)] })]),
      },
    }))
    const user = userEvent.setup()
    render(<StoreManager />)
    await screen.findByText('All (1)')
    await user.click(screen.getByRole('button', { name: 'Prices' }))
    expect(screen.getByRole('combobox', { name: 'Commodity' })).toHaveValue('rice|1kg')

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    expect(await screen.findByText('Week of Sep 14 – Sep 20, 2026')).toBeInTheDocument()

    expect(screen.getByRole('combobox', { name: 'Commodity' })).toHaveValue('rice|1kg')
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | No price this week')
  })

  it('requests coordinates only in Visit check and never classifies before they arrive', async () => {
    holdRequests()
    const user = userEvent.setup()
    render(<StoreManager />)
    await sent('current')
    pending.current.resolve(currentWeek())
    await screen.findByText('All (4)')

    await user.click(screen.getByRole('button', { name: 'Visit check' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading visit locations')
    // The legend and chips name the unloaded state instead of showing empty visit categories.
    expect(chips()).toEqual(['All (4)', 'Visit locations not loaded (4)'])
    expect(screen.getByRole('list', { name: 'Map legend' })).toHaveTextContent('4 Visit locations not loaded')
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | Visit locations not loaded')
    expect(screen.getByTestId('map')).not.toHaveTextContent('At registered pin')
    expect(screen.getByTestId('map')).toHaveAttribute('data-visit-links', 'false')

    await sent('current+locations')
    // The flag travels as 1; a boolean would reach the API as the string "true".
    expect(api.get).toHaveBeenLastCalledWith('/admin/gis/monitoring', { params: { week: undefined, locations: 1 } })
    const located = currentWeek()
    located.locations = true
    located.stores[0].visits = [visit(1, { latitude: 10.7401, longitude: 121.94, accuracy_meters: 5 }), visit(2, { latitude: 10.75, longitude: 121.94, accuracy_meters: 5 })]
    located.stores[1].visits = [visit(3, { latitude: 10.7401, longitude: 121.94, accuracy_meters: 5 })]
    pending['current+locations'].resolve(located)

    await waitFor(() => expect(screen.getByTestId('map')).toHaveAttribute('data-visit-links', 'true'))
    expect(chips()).toEqual(['All (4)', 'At registered pin (1)', 'Location to review (1)', 'No visit (2)'])
    expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | Location to review')
    expect(screen.getByTestId('map')).toHaveTextContent('Bravo Store | At registered pin')
    expect(screen.getByTestId('map')).toHaveTextContent('Charlie Shop | No visit')
    expect(screen.queryByText(/Loading visit locations/)).not.toBeInTheDocument()

    // Leaving the layer stops asking for coordinates and stops drawing them.
    delete pending.current
    await user.click(screen.getByRole('button', { name: 'Compliance' }))
    expect(screen.getByTestId('map')).toHaveAttribute('data-visit-links', 'false')
    await sent('current')
    expect(api.get).toHaveBeenLastCalledWith('/admin/gis/monitoring', { params: { week: undefined, locations: undefined } })
  })

  it('does not keep classifying from an earlier coordinate load when a fresh one fails', async () => {
    holdRequests()
    const user = userEvent.setup()
    render(<StoreManager />)
    await sent('current')
    pending.current.resolve(currentWeek())
    await screen.findByText('All (4)')

    await user.click(screen.getByRole('button', { name: 'Visit check' }))
    await sent('current+locations')
    const located = currentWeek()
    located.locations = true
    located.stores[0].visits = [visit(1, { latitude: 10.7401, longitude: 121.94, accuracy_meters: 5 })]
    pending['current+locations'].resolve(located)
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('Alpha Mart | At registered pin'))

    // Away and straight back, before the coordinate-free reload goes out: the located payload is still in memory.
    delete pending['current+locations']
    await user.click(screen.getByRole('button', { name: 'Compliance' }))
    await user.click(screen.getByRole('button', { name: 'Visit check' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading visit locations')
    expect(screen.getByTestId('map')).not.toHaveTextContent('At registered pin')
    await sent('current+locations')
    pending['current+locations'].reject(new Error('503'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Visit locations unavailable.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByTestId('map')).not.toHaveTextContent('At registered pin')
    expect(screen.getByTestId('map')).toHaveAttribute('data-visit-links', 'false')
    expect(chips()).toEqual(['All (4)', 'Visit locations not loaded (4)'])
  })

  it('reports unavailable visit locations and retries, without ever claiming a visit was at the pin', async () => {
    holdRequests()
    const user = userEvent.setup()
    render(<StoreManager />)
    await sent('current')
    pending.current.resolve(currentWeek())
    await screen.findByText('All (4)')

    await user.click(screen.getByRole('button', { name: 'Visit check' }))
    await sent('current+locations')
    // For example the audit trail is down, so the API refuses to release coordinates.
    pending['current+locations'].reject(new Error('503'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Visit locations unavailable.')
    expect(screen.getByTestId('map')).not.toHaveTextContent('At registered pin')
    expect(screen.getByTestId('map')).toHaveAttribute('data-visit-links', 'false')

    delete pending['current+locations']
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading visit locations')
    await sent('current+locations')
  })
})
