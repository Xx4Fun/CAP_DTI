import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreMap } from './StoreMap'
import { buildStorePopupContent, getStoreStatusInfo } from './storeMapUtils'
import { StoreManager } from './StoreManager'
import { StoreOnboarding } from '../StoreOnboarding'
import type { StoreRecord } from '../../types/admin'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { data: { id: 10 } } }),
  },
}))

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getStores: vi.fn().mockResolvedValue([
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
    ]),
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

  it('renders StoreManager with status filters and CartoDB GIS Store Monitoring Canvas', async () => {
    render(<StoreManager />)

    expect(await screen.findByText('Store Monitoring')).toBeInTheDocument()
    expect(screen.getByText(/CartoDB GIS Monitor/i)).toBeInTheDocument()
    expect(screen.getByText('All (3)')).toBeInTheDocument()
    expect(screen.getByText('No findings (1)')).toBeInTheDocument()
    expect(screen.getByText('Pending (1)')).toBeInTheDocument()
    expect(screen.getByText('Inactive (0)')).toBeInTheDocument()
    expect(screen.getByText('Findings (1)')).toBeInTheDocument()
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

    expect(api.post).toHaveBeenCalledWith('/admin/stores', expect.objectContaining({
      dti_sec_number: null,
      store_name: 'Antique Central Market',
      owner_name: null,
      address: 'Bantayan, San Jose de Buenavista',
      latitude: 10.7424,
      longitude: 121.9406,
    }))
    expect(onCreated).toHaveBeenCalled()

    // Test breadcrumb
    await user.click(screen.getByRole('button', { name: 'Back to User Management' }))
    expect(onBack).toHaveBeenCalled()
  })
})
