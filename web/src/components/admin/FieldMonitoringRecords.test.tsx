import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { FieldMonitoringPanel } from './AdminPanels'
import { FieldMonitoringRecords } from './FieldMonitoringRecords'

vi.mock('../../services/adminApi', () => ({ adminApi: { getMonitoringRecords: vi.fn(), getMonitoringRecord: vi.fn(), getMonitoringSignature: vi.fn() } }))

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
    window.history.replaceState({}, '', '/?module=field_monitoring')
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [record], current_page: 1, last_page: 2, per_page: 10, total: 11, from: 1, to: 10 })
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({ ...record, items: [{ id: 1, srp_id: 3, recorded_price: 62, baseline_price: 50, variance_percent: 24, is_anomaly: true, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }] })
  })

  it('opens a dedicated read-only visit page without the assurance banner', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('table', { name: 'Accepted field monitoring visits' })).toBeInTheDocument()
    expect(screen.getByText('Antique Central Market')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–10 of 11')).toBeInTheDocument()
    expect(screen.queryByText('Automatic acceptance')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View visit 14' }))
    expect(await screen.findByRole('heading', { name: 'Visit #14' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Field Monitoring' })).toBeInTheDocument()
    expect(screen.getByText('Rice').closest('td')).toHaveAttribute('data-label', 'Commodity')
    expect(new URLSearchParams(window.location.search).get('record')).toBe('14')
  })

  it('keeps monitoring analytics out of the records workspace', async () => {
    render(<FieldMonitoringPanel />)
    expect(await screen.findByRole('table', { name: 'Accepted field monitoring visits' })).toBeInTheDocument()
    expect(screen.queryByText('Price volatility analytics')).not.toBeInTheDocument()
  })

  it('stores list controls in the URL', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await screen.findByRole('table', { name: 'Accepted field monitoring visits' })
    await user.type(screen.getByRole('searchbox', { name: 'Search monitoring visits' }), 'Central')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Observation' }), 'yes')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '25')

    await waitFor(() => expect(window.location.search).toContain('search=Central'))
    expect(window.location.search).toContain('anomaly=yes')
    expect(window.location.search).toContain('per_page=25')
  })

  it('restores a paginated filtered list from the URL without resetting its page', async () => {
    window.history.replaceState({}, '', '/?module=field_monitoring&search=Central&anomaly=yes&page=2&per_page=25')
    render(<FieldMonitoringRecords />)

    expect(screen.getByRole('searchbox', { name: 'Search monitoring visits' })).toHaveValue('Central')
    expect(screen.getByRole('combobox', { name: 'Observation' })).toHaveValue('yes')
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('25')
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2')
  })

  it('ignores a visit response after browser navigation returns to the list', async () => {
    let resolveVisit!: (value: typeof record) => void
    vi.mocked(adminApi.getMonitoringRecord).mockReturnValue(new Promise((resolve) => { resolveVisit = resolve }))
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'View visit 14' }))

    window.history.replaceState({}, '', '/?module=field_monitoring')
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    await act(async () => resolveVisit(record))

    expect(screen.queryByRole('heading', { name: 'Visit #14' })).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Accepted field monitoring visits' })).toBeInTheDocument()
  })

  it('opens the signature tab during the user click before awaiting the private blob', async () => {
    const user = userEvent.setup()
    const popup = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    vi.mocked(adminApi.getMonitoringSignature).mockResolvedValue(new Blob(['signature'], { type: 'image/png' }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:signature')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<FieldMonitoringRecords />)

    await user.click(await screen.findByRole('button', { name: 'View visit 14' }))
    await user.click(await screen.findByRole('button', { name: 'Officer signature' }))

    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(popup.location.href).toBe('blob:signature')
  })
})
