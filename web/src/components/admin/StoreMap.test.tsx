import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { StoreMap } from './StoreMap'
import { buildStorePopupContent, buildVisitPopupContent, getStoreStatusInfo } from './storeMapUtils'
import { StoreManager } from './StoreManager'
import { StoreOnboarding } from '../StoreOnboarding'
import type { StoreRecord } from '../../types/admin'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { data: { id: 10 } } }),
  },
}))

// What the GIS endpoint adds to a store when it has no visits in the week.
const noVisits = { has_prior_routine_visit: false, verification_required: false, visits: [], prices: [] }

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getGisMonitoring: vi.fn().mockImplementation(async () => ({
      week: { key: '2026-09-28', ends_on: '2026-10-04', starts_at: '2026-09-27T16:00:00+00:00', ends_at: '2026-10-04T16:00:00+00:00', timezone: 'Asia/Manila', is_current: true },
      locations: false,
      weeks: ['2026-09-28'],
      stores: [
      {
        id: 1,
        store_name: 'San Jose Supermarket',
        dti_sec_number: 'SEC-12345',
        address: 'Real St, San Jose',
        latitude: 10.7424,
        longitude: 121.9406,
        is_active: true,
        is_verified: true,
        is_public: true,
        recidivism_index: 0,
        image_path: 'https://assets.example.test/store_images/robinsons.webp',
      },
      {
        id: 2,
        store_name: 'Antique Mart',
        dti_sec_number: 'SEC-67890',
        address: 'Market St, San Jose',
        latitude: 10.745,
        longitude: 121.942,
        is_active: true,
        is_verified: false,
        is_public: false,
        recidivism_index: 0,
      },
      {
        id: 3,
        store_name: 'Flagged Trader',
        dti_sec_number: 'SEC-99999',
        address: 'Port Area, San Jose',
        latitude: 10.741,
        longitude: 121.939,
        is_active: false,
        is_verified: true,
        is_public: false,
        recidivism_index: 2,
      },
      {
        id: 4,
        store_name: 'Dormant Store',
        address: 'San Jose',
        latitude: 10.746,
        longitude: 121.943,
        is_active: false,
        is_verified: true,
        is_public: false,
        recidivism_index: 0,
      },
      ].map((store) => ({ ...store, ...noVisits })),
    })),
    updateStore: vi.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
    inviteVendor: vi.fn().mockResolvedValue({ invitation_url: 'http://test/invite' }),
  },
}))

describe('CartoDB Light StoreMap and StoreManager', () => {
  it('describes only the status facts present in store records', () => {
    const compliantStore: StoreRecord = {
      id: 1,
      store_name: 'Clean Store',
      address: 'San Jose',
      latitude: 10.74,
      longitude: 121.94,
      is_active: true,
      is_verified: true,
      is_public: true,
      recidivism_index: 0,
    }
    const anomalyStore: StoreRecord = {
      id: 2,
      store_name: 'Unverified Store',
      address: 'San Jose',
      latitude: 10.74,
      longitude: 121.94,
      is_active: true,
      is_verified: false,
      is_public: false,
      recidivism_index: 0,
    }
    const flaggedStore: StoreRecord = {
      id: 3,
      store_name: 'Recidivist Store',
      address: 'San Jose',
      latitude: 10.74,
      longitude: 121.94,
      is_active: true,
      is_verified: true,
      is_public: true,
      recidivism_index: 2,
    }

    expect(getStoreStatusInfo(compliantStore).status).toBe('green')
    expect(getStoreStatusInfo(compliantStore).label).toBe('No Confirmed Findings')
    expect(getStoreStatusInfo(anomalyStore).status).toBe('yellow')
    expect(getStoreStatusInfo(anomalyStore).label).toBe('Verification Pending')
    expect(getStoreStatusInfo(flaggedStore).status).toBe('red')
    expect(getStoreStatusInfo(flaggedStore).label).toBe('2 Confirmed Findings')
  })

  it('renders API-provided popup values as text instead of executable markup', () => {
    const store = {
      id: 9,
      store_name: '<img src=x onerror="alert(1)">',
      dti_sec_number: '<script>bad()</script>',
      address: 'Antique',
      latitude: 10.74,
      longitude: 121.94,
      is_active: true,
      is_verified: true,
      is_public: true,
      recidivism_index: 0,
    } satisfies StoreRecord

    const popup = buildStorePopupContent(store, getStoreStatusInfo(store), 10.74, 121.94)

    expect(popup.textContent).toContain('<img src=x onerror="alert(1)">')
    expect(popup.querySelector('img')).toBeNull()
    expect(popup.querySelector('script')).toBeNull()
  })

  it('renders single location StoreMap component', () => {
    render(<StoreMap latitude={10.7424} longitude={121.9406} readOnly />)
    expect(screen.getByText('Geographical Pin Locator')).toBeInTheDocument()
  })

  it('keeps inactive stores under All and removes GIS invitation controls', async () => {
    render(<StoreManager />)

    expect(await screen.findByText('Store Monitoring')).toBeInTheDocument()
    expect(screen.getByText(/CartoDB GIS Monitor/i)).toBeInTheDocument()
    expect(await screen.findByText('All (4)')).toBeInTheDocument()
    expect(screen.getByText('No findings (1)')).toBeInTheDocument()
    expect(screen.getByText('Pending (1)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inactive \(/i })).not.toBeInTheDocument()
    expect(screen.getByText('Findings (1)')).toBeInTheDocument()
    expect(screen.getByText('Dormant Store')).toBeInTheDocument()
    expect(screen.getByText('Account Inactive')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Invite$/i })).not.toBeInTheDocument()
  })

  it('uses establishment photos and anchors GIS pins at their tips', () => {
    const stores: StoreRecord[] = [
      { id: 1, store_name: 'Photo Store', address: 'San Jose', latitude: 10.7424, longitude: 121.9406, is_active: true, is_verified: true, is_public: true, image_path: 'https://assets.example.test/store_images/robinsons.webp' },
      { id: 2, store_name: 'No Photo Store', address: 'San Jose', latitude: 10.745, longitude: 121.942, is_active: false, is_verified: true, is_public: false, image_path: 'https://assets.example.test/store_images/missing.webp' },
      { id: 3, store_name: 'Pending Store', address: 'San Jose', latitude: 10.747, longitude: 121.944, is_active: true, is_verified: false, is_public: false },
    ]
    const { container } = render(<StoreMap stores={stores} selectedStoreId={1} />)
    const pins = container.querySelectorAll('.store-photo-pin-container')
    expect(pins).toHaveLength(3)
    expect(pins[0]).toHaveClass('status-green', 'selected')
    expect(pins[1]).toHaveClass('status-red')
    expect(pins[2]).toHaveClass('status-yellow')
    expect((pins[0] as HTMLElement).style.marginTop).toBe('-52px')
    expect((pins[0] as HTMLElement).style.marginLeft).toBe('-21px')
    const photos = container.querySelectorAll<HTMLImageElement>('.store-photo-pin-image')
    expect(photos[0].getAttribute('src')).toBe('https://assets.example.test/store_images/robinsons.webp')
    fireEvent.error(photos[1])
    expect(photos[1].getAttribute('src')).toBe('/stores/store.webp')
    expect(photos[2].getAttribute('src')).toBe('/stores/store.webp')
  })

  it('redraws pins and popups when the layer changes and clears visit links on leaving Visit check', () => {
    const stores = [{
      id: 1, store_name: 'Layered Store', address: 'San Jose', latitude: 10.7424, longitude: 121.9406, is_active: true, is_verified: true, is_public: true,
      visits: [{ id: 5, finalized_at: '2026-09-29T02:00:00+00:00', officer_name: 'Officer <b>A</b>', is_routine: true, protocol_mode: 'standard', latitude: 10.7426, longitude: 121.9408, accuracy_meters: 8 }],
    }]
    const coverage = () => ({ status: 'green' as const, label: 'Monitored', badge: 'Verification required' })
    const prices = () => ({ status: 'blue' as const, label: 'Reference unavailable', text: '₱60.00' })
    const visits = () => ({ status: 'grey' as const, label: 'No visit' })
    const pin = () => container.querySelector('.store-photo-pin-container')!

    // The store array never changes: only the layer does.
    const { container, rerender } = render(<StoreMap stores={stores} selectedStoreId={1} pinOf={coverage} />)
    expect(pin()).toHaveClass('status-green')
    expect(container.querySelector('.store-pin-badge')).toHaveAccessibleName('Verification required')
    expect(container.querySelector('.store-pin-text')).toBeNull()
    expect(container.querySelector('.leaflet-store-status')).toHaveTextContent('Monitored')

    rerender(<StoreMap stores={stores} selectedStoreId={1} pinOf={prices} />)
    expect(pin()).toHaveClass('status-blue')
    expect(container.querySelector('.store-pin-text')).toHaveTextContent('₱60.00')
    expect(container.querySelector('.store-pin-badge')).toBeNull()
    expect(container.querySelector('.leaflet-store-status')).toHaveTextContent('Reference unavailable')
    expect(container.querySelector('.leaflet-store-status')).toHaveClass('status-blue')
    expect(container.querySelector('.gis-visit-link')).toBeNull()

    rerender(<StoreMap stores={stores} selectedStoreId={1} pinOf={visits} visitLinks />)
    expect(pin()).toHaveClass('status-grey')
    expect(container.querySelectorAll('.gis-visit-link')).toHaveLength(1)
    expect(container.querySelectorAll('.gis-visit-accuracy')).toHaveLength(1)
    expect(container.querySelectorAll('.gis-visit-point')).toHaveLength(1)

    rerender(<StoreMap stores={stores} selectedStoreId={1} pinOf={coverage} />)
    expect(container.querySelector('.gis-visit-link')).toBeNull()
    expect(container.querySelector('.gis-visit-accuracy')).toBeNull()
    expect(container.querySelector('.gis-visit-point')).toBeNull()
  })

  it('states each visit\'s own distance, accuracy and result as text', () => {
    const store = { id: 1, store_name: 'Layered Store', address: 'San Jose', latitude: 10.74, longitude: 121.94, is_active: true, is_verified: true, is_public: true }
    const visit = { id: 5, finalized_at: '2026-09-29T02:00:00+00:00', officer_name: '<img src=x onerror="alert(1)">', is_routine: false, protocol_mode: 'standard', latitude: 10.745, longitude: 121.94, accuracy_meters: 12 }

    const popup = buildVisitPopupContent(store, [visit])

    expect(popup.querySelector('h4')).toHaveTextContent('Visit at Layered Store')
    expect(popup.querySelector('.leaflet-store-status')).toHaveTextContent('Location to review')
    expect(popup.textContent).toMatch(/55\d m from registered pin · GPS accuracy ±12 m/)
    expect(popup.textContent).toContain('Verification visit')
    expect(popup.textContent).toContain('<img src=x onerror="alert(1)">')
    expect(popup.querySelector('img')).toBeNull()
  })

  it('keeps visits signed at the same point reachable through one point above the store pins', () => {
    const at = { latitude: 10.7424, longitude: 121.9406, accuracy_meters: 6 }
    const visit = (id: number, overrides = {}) => ({ id, finalized_at: `2026-09-2${id}T02:00:00+00:00`, officer_name: `Officer ${id}`, is_routine: true, protocol_mode: 'standard', ...at, ...overrides })
    const stores = [{
      id: 1, store_name: 'Shared Point Store', address: 'San Jose', latitude: 10.7424, longitude: 121.9406, is_active: true, is_verified: true, is_public: true,
      // A routine and a verification visit at the registered pin, and a third visit somewhere else.
      visits: [visit(8), visit(9, { is_routine: false, accuracy_meters: 20 }), visit(7, { latitude: 10.75 })],
    }]

    const { container } = render(<StoreMap stores={stores} visitLinks />)

    const points = container.querySelectorAll('.gis-visit-point')
    expect(points).toHaveLength(2)
    expect(container.querySelectorAll('.gis-visit-accuracy')).toHaveLength(2)
    // Above the store pins, so the point at the registered pin is not buried under the pin itself, and below popups.
    // The app's stylesheet gives every Leaflet pane the same z-index, so document order is what stacks them.
    const pane = container.querySelector<HTMLElement>('.leaflet-gis-visits-pane')!
    expect(pane.contains(points[0])).toBe(true)
    expect(pane.previousElementSibling).toHaveClass('leaflet-marker-pane')
    expect(pane.compareDocumentPosition(container.querySelector('.leaflet-popup-pane')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const shared = buildVisitPopupContent(stores[0], stores[0].visits.slice(0, 2))
    expect(shared.querySelector('h4')).toHaveTextContent('2 visits at Shared Point Store')
    expect(shared.textContent).toContain('Officer 8')
    expect(shared.textContent).toContain('Officer 9 · Verification visit')
    expect(shared.querySelectorAll('.leaflet-store-status')).toHaveLength(2)
  })

  it('renders redesigned StoreOnboarding with light map, synchronized coordinates, and creates establishment', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    const onBack = vi.fn()

    render(<StoreOnboarding onCreated={onCreated} onBack={onBack} />)

    expect(screen.getByRole('heading', { name: 'Register new establishment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to User Management' })).toBeInTheDocument()
    expect(screen.getByText('Synchronized GIS Coordinates')).toBeInTheDocument()
    expect(screen.getByText('CartoDB Voyager Light')).toBeInTheDocument()

    expect(screen.getByText(/active, verified, and visible/i)).toBeInTheDocument()

    // Unknown registration metadata can be left blank.
    await user.type(screen.getByLabelText(/Store \/ business name/i), 'Antique Central Market')
    await user.type(screen.getByLabelText(/Business address/i), 'Bantayan, San Jose de Buenavista')

    // Submit
    await user.click(screen.getByRole('button', { name: 'Register establishment' }))

    expect(api.post).toHaveBeenCalledWith('/admin/stores', expect.any(FormData), { headers: { 'Content-Type': 'multipart/form-data' } })
    const body = vi.mocked(api.post).mock.calls.at(-1)![1] as FormData
    expect(Object.fromEntries(body.entries())).toEqual({
      store_name: 'Antique Central Market',
      address: 'Bantayan, San Jose de Buenavista',
      latitude: '10.7424',
      longitude: '121.9406',
    })
    expect(onCreated).toHaveBeenCalled()

    // Test breadcrumb
    await user.click(screen.getByRole('button', { name: 'Back to User Management' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('uploads an optional establishment photo with the registration and rejects oversized files', async () => {
    const createObjectURL = vi.fn(() => 'blob:store-photo')
    const revokeObjectURL = vi.fn()
    const original = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    onTestFinished(() => { Object.assign(URL, original) })
    const user = userEvent.setup()
    render(<StoreOnboarding onCreated={vi.fn()} />)

    const input = screen.getByLabelText(/Establishment photo/) as HTMLInputElement
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    await user.upload(input, oversized)
    expect(screen.getByRole('alert')).toHaveTextContent('2 MB or smaller')
    expect(screen.queryByAltText('Selected establishment photo')).not.toBeInTheDocument()

    const photo = new File(['photo'], 'shop.png', { type: 'image/png' })
    await user.upload(input, photo)
    expect(screen.getByAltText('Selected establishment photo')).toHaveAttribute('src', 'blob:store-photo')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/Store \/ business name/i), 'Photo Mart')
    await user.type(screen.getByLabelText(/Business address/i), 'San Jose')
    await user.click(screen.getByRole('button', { name: 'Register establishment' }))

    const body = vi.mocked(api.post).mock.calls.at(-1)![1] as FormData
    expect(body.get('image')).toBe(photo)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByAltText('Selected establishment photo')).not.toBeInTheDocument()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:store-photo')

    // A rejected replacement drops the earlier photo instead of silently uploading it.
    await user.upload(input, photo)
    await user.upload(input, oversized)
    expect(screen.getByRole('alert')).toHaveTextContent('2 MB or smaller')
    expect(screen.queryByAltText('Selected establishment photo')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Register establishment' }))
    expect((vi.mocked(api.post).mock.calls.at(-1)![1] as FormData).has('image')).toBe(false)
  })
})
