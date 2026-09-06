import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { FieldMonitoringRecords } from './FieldMonitoringRecords'

vi.mock('../../services/adminApi', () => ({ adminApi: {
  getMonitoringEstablishments: vi.fn(), getMonitoringEstablishment: vi.fn(), getMonitoringPriceHistory: vi.fn(),
  getMonitoringRecords: vi.fn(), getMonitoringRecord: vi.fn(), getMonitoringSignature: vi.fn(),
  getFieldVerificationRequests: vi.fn(), cancelFieldVerification: vi.fn(), reopenFieldVerification: vi.fn(),
} }))

const record = {
  id: 14, client_uuid: 'visit-14', status: 'accepted', started_at: '2026-08-24T07:30:00Z', finalized_at: '2026-08-24T08:00:00Z',
  received_at: '2026-08-24T08:02:00Z', representative_name: 'Maria Santos', sync_source: 'offline_queue' as const,
  protocol_mode: 'standard' as const, protocol_reference: null, location_captured_at: '2026-08-24T07:59:00Z',
  latitude: 10.74, longitude: 121.94, location_accuracy_meters: 9, items_count: 1, anomaly_count: 1,
  officer: { id: 7, name: 'Ana Officer', email: 'ana@dti.gov.ph' },
  store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose de Buenavista' },
  verification_request: { id: 301, status: 'completed', report: { id: 101, report_reference: 'RPT-101', status: 'Under regulatory review' } },
  items: [{ id: 1, srp_id: 3, recorded_price: 62, baseline_price: 999, reference_value: 50, reference_label: 'SRP baseline', reference_source: 'SRP-2026-01', reference_effective_date: '2026-08-01', variance_percent: 24, is_anomaly: true, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 999 } }],
}

const workspace = {
  summary: { monitored_establishments: 1, recent_activity: 1, records_with_observations: 1, open_verification_requests: 0, latest_completed_at: record.finalized_at },
  establishments: { data: [{ id: 2, dti_sec_number: 'SEC-2', store_name: 'Antique Central Market', owner_name: 'Maria Santos', address: 'San Jose de Buenavista', is_active: true, is_verified: true, completed_records_count: 1, records_with_observations_count: 1, open_verification_requests_count: 0, latest_monitoring_at: record.finalized_at, latest_record_id: 14, latest_protocol_mode: 'standard' as const, latest_result: 'with_observations' as const }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 },
}

describe('FieldMonitoringRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=field_monitoring')
    vi.mocked(adminApi.getMonitoringEstablishments).mockResolvedValue(workspace)
    vi.mocked(adminApi.getMonitoringEstablishment).mockResolvedValue({ store: { id: 2, dti_sec_number: 'SEC-2', store_name: 'Antique Central Market', owner_name: 'Maria Santos', address: 'San Jose de Buenavista', latitude: 10.74, longitude: 121.94, is_active: true, is_verified: true, is_public: true }, completed_records_count: 1, records_with_observations_count: 1, open_verification_requests_count: 0, latest_record: record })
    vi.mocked(adminApi.getMonitoringPriceHistory).mockResolvedValue({ data: [{ id: 1, monitoring_record_id: 14, monitoring_date: record.finalized_at, protocol_mode: 'standard', protocol_reference: null, commodity_name: 'Rice', unit: 'kg', reference_status: 'available', reference_label: 'SRP baseline', reference_value: 50, reference_source: 'SRP-2026-01', reference_effective_date: '2026-08-01', recorded_price: 62, difference: 12, variance_percent: 24, is_anomaly: true }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [record], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue(record)
    vi.mocked(adminApi.getFieldVerificationRequests).mockResolvedValue({ data: [{ id: 301, status: 'completed', reason: 'Verify the shelf price.', requested_at: '2026-08-24T06:00:00Z', completed_at: record.finalized_at, store: record.store, report: { id: 101, report_reference: 'RPT-101', status: 'Under regulatory review' }, claimant: record.officer, monitoring_record: { id: 14 } }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
  })

  it('opens on the establishment overview with operational summary filters', async () => {
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('table', { name: 'Monitoring establishments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Establishments' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Monitored establishments').closest('button')).toHaveTextContent('1')
    expect(screen.getByText('Records with observations').closest('button')).toHaveTextContent('1')
  })

  it('opens an establishment profile with captured price history and filtered records', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Antique Central Market monitoring profile' }))
    expect(await screen.findByRole('heading', { name: 'Antique Central Market' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Temporal price history' })).toHaveTextContent('₱50.00')
    expect(screen.getByRole('table', { name: 'Temporal price history' })).not.toHaveTextContent('₱999.00')
    expect(adminApi.getMonitoringRecords).toHaveBeenCalledWith(expect.objectContaining({ store_id: 2 }))
    expect(new URLSearchParams(window.location.search).get('store')).toBe('2')
  })

  it('keeps records view-only and sends only observed products to legal actions', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<FieldMonitoringRecords onNavigate={onNavigate} />)
    await user.click(screen.getByRole('tab', { name: 'Monitoring Records' }))
    await user.click(await screen.findByRole('button', { name: 'View visit 14' }))
    expect(await screen.findByRole('heading', { name: 'Visit #14' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Recorded commodity prices' })).toHaveTextContent('₱50.00')
    expect(screen.getByRole('heading', { name: 'Products requiring regulatory review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|reject/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Proceed to Regulatory Action' }))
    expect(onNavigate).toHaveBeenCalledWith('legal_actions')
    expect(new URLSearchParams(window.location.search).get('source_record')).toBe('14')
  })

  it('links a completed verification request directly to its monitoring record', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(screen.getByRole('tab', { name: 'Verification Requests' }))
    expect(await screen.findByText('RPT-101')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open monitoring record 14' }))
    expect(await screen.findByRole('heading', { name: 'Visit #14' })).toBeInTheDocument()
  })

  it('stores the active workspace and list controls in the URL', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await screen.findByRole('table', { name: 'Monitoring establishments' })
    await user.type(screen.getByRole('searchbox', { name: 'Search establishments' }), 'Central')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Monitoring status' }), 'with_observations')
    await user.click(screen.getByRole('tab', { name: 'Monitoring Records' }))
    await waitFor(() => expect(window.location.search).toContain('monitor_search=Central'))
    expect(window.location.search).toContain('monitor_tab=records')
    expect(window.location.search).toContain('monitor_status=with_observations')
  })

  it('restores an establishment profile from the URL', async () => {
    window.history.replaceState({}, '', '/?module=field_monitoring&store=2')
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('heading', { name: 'Antique Central Market' })).toBeInTheDocument()
    expect(adminApi.getMonitoringPriceHistory).toHaveBeenCalledWith(2, { per_page: 10 })
  })

  it('loads the next establishment page', async () => {
    vi.mocked(adminApi.getMonitoringEstablishments).mockResolvedValue({ ...workspace, establishments: { ...workspace.establishments, last_page: 2, total: 11 } })
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(adminApi.getMonitoringEstablishments).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('cancels an open verification request from the operational queue', async () => {
    vi.mocked(adminApi.getFieldVerificationRequests).mockResolvedValue({ data: [{ id: 302, status: 'open', reason: 'Follow up.', requested_at: '2026-08-24T06:00:00Z', store: record.store, report: { id: 102, report_reference: 'RPT-102', status: 'Referred' }, claimant: null, monitoring_record: null }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(screen.getByRole('tab', { name: 'Verification Requests' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(adminApi.cancelFieldVerification).toHaveBeenCalledWith(302)
  })
})
