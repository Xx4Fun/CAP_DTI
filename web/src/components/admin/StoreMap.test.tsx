import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StoreMap, getStoreStatusInfo } from './StoreMap'
import { StoreManager } from './StoreManager'
import type { StoreRecord } from '../../types/admin'

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
  it('correctly calculates status info for compliant, minor anomaly, and flagged stores', () => {
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
    expect(getStoreStatusInfo(anomalyStore).status).toBe('yellow')
    expect(getStoreStatusInfo(flaggedStore).status).toBe('red')
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
    expect(screen.getByText('Clean (1)')).toBeInTheDocument()
    expect(screen.getByText('Anomaly (1)')).toBeInTheDocument()
    expect(screen.getByText('Flagged (1)')).toBeInTheDocument()
  })
})

