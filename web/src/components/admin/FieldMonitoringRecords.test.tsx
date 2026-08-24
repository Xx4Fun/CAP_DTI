import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { FieldMonitoringRecords } from './FieldMonitoringRecords'

vi.mock('../../services/adminApi', () => ({ adminApi: { getMonitoringRecords: vi.fn(), getMonitoringRecord: vi.fn() } }))

const record = {
  id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z',
  received_at: '2026-08-24T08:02:00Z', representative_name: 'Maria Santos', sync_source: 'offline_queue' as const,
  items_count: 3, anomaly_count: 1,
  officer: { id: 7, name: 'Ana Officer', email: 'ana@dti.gov.ph' },
  store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose de Buenavista' },
  items: [],
}

describe('FieldMonitoringRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [record], current_page: 1, last_page: 2, per_page: 10, total: 11, from: 1, to: 10 })
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({ ...record, items: [{ id: 1, srp_id: 3, recorded_price: 62, baseline_price: 50, variance_percent: 24, is_anomaly: true, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }] })
  })

  it('shows paginated accepted visits and opens a read-only evidence summary', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('table', { name: 'Accepted field monitoring visits' })).toBeInTheDocument()
    expect(screen.getByText('Antique Central Market')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–10 of 11')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review visit 14' }))
    expect(await screen.findByRole('heading', { name: 'Accepted visit #14' })).toBeInTheDocument()
    expect(screen.getByText('Rice')).toBeInTheDocument()
    expect(screen.getAllByText('Automatic acceptance')).toHaveLength(2)
  })
})
