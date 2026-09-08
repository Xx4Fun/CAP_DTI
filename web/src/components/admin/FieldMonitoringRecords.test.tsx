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
  monitoring_week: { timezone: 'Asia/Manila' as const, starts_at: '2026-08-23T16:00:00Z', ends_at: '2026-08-30T16:00:00Z' },
  weekly_summary: { total_establishments: 1, not_yet_monitored: 0, monitored_this_week: 1, verification_required: 1 },
  establishments: { data: [{ id: 2, dti_sec_number: null, store_name: 'Gaisano Grand Mall', owner_name: 'Maria Santos', address: 'San Jose de Buenavista', is_active: true, is_verified: true, completed_records_count: 1, records_with_observations_count: 1, open_verification_requests_count: 1, weekly_routine_status: 'monitored_this_week' as const, has_prior_routine_monitoring: true, latest_routine_monitoring_at: record.finalized_at, verification_task_status: 'claimed' as const, verification_claimant: record.officer, latest_monitoring_at: record.finalized_at, latest_record_id: 14, latest_protocol_mode: 'standard' as const, latest_officer: record.officer, latest_result: 'with_observations' as const }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 },
}

describe('FieldMonitoringRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=field_monitoring')
    vi.mocked(adminApi.getMonitoringEstablishments).mockResolvedValue(workspace)
    vi.mocked(adminApi.getMonitoringEstablishment).mockResolvedValue({ store: { id: 2, dti_sec_number: null, store_name: 'Gaisano Grand Mall', owner_name: 'Maria Santos', address: 'San Jose de Buenavista', latitude: 10.74, longitude: 121.94, is_active: true, is_verified: true, is_public: true }, completed_records_count: 1, records_with_observations_count: 1, open_verification_requests_count: 1, monitoring_week: workspace.monitoring_week, weekly_routine_status: 'monitored_this_week', has_prior_routine_monitoring: true, latest_routine_monitoring_at: record.finalized_at, latest_routine_record: { ...record, verification_request: undefined }, verification_task_status: 'claimed', verification_claimant: record.officer, latest_record: record, monitored_commodities: [{ selector: 'key:rice', commodity_name: 'Rice', unit: 'kg' }] })
    vi.mocked(adminApi.getMonitoringPriceHistory).mockResolvedValue({ data: [{ id: 1, monitoring_record_id: 14, monitoring_date: record.finalized_at, protocol_mode: 'standard', protocol_reference: null, commodity_name: 'Rice', unit: 'kg', reference_status: 'available', reference_label: 'SRP baseline', reference_value: 50, reference_source: 'SRP-2026-01', reference_effective_date: '2026-08-01', recorded_price: 62, difference: 12, variance_percent: 24, is_anomaly: true }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [record], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue(record)
    vi.mocked(adminApi.getFieldVerificationRequests).mockResolvedValue({ data: [{ id: 301, status: 'completed', reason: 'Verify the shelf price.', requested_at: '2026-08-24T06:00:00Z', completed_at: record.finalized_at, store: record.store, report: { id: 101, report_reference: 'RPT-101', status: 'Under regulatory review' }, claimant: record.officer, monitoring_record: { id: 14 } }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
  })

  it('opens on the establishment overview with operational summary filters', async () => {
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('region', { name: 'Monitoring establishments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Establishments' })).toHaveAttribute('aria-selected', 'true')
    const summary = screen.getByRole('region', { name: 'Field Monitoring overview' })
    expect(summary).toHaveTextContent('Total Establishments1')
    expect(summary).toHaveTextContent('Monitored This Week1')
    expect(summary).toHaveTextContent('Verification Required1')
    expect(screen.getAllByText('Monitored This Week').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Verification Required').length).toBeGreaterThan(1)
    expect(screen.getByText('Ana Officer')).toBeInTheDocument()
    expect(document.querySelector('.establishment-row-img')).toHaveAttribute('src', '/stores/store.webp')
    expect(screen.queryByText(/12345678|inspection score|assigned officer|non-compliant|compliant/i)).not.toBeInTheDocument()
  })

  it('allows switching between grid and table views', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('region', { name: 'Monitoring establishments' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Table view' }))
    expect(await screen.findByRole('table', { name: 'Monitoring establishments' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(await screen.findByRole('region', { name: 'Monitoring establishments' })).toBeInTheDocument()
  })

  it('opens an establishment profile with captured price history and filtered records', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    expect(await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Price History' }))
    expect(screen.getByRole('table', { name: 'Temporal price history' })).toHaveTextContent('₱50.00')
    expect(screen.getByRole('table', { name: 'Temporal price history' })).not.toHaveTextContent('₱999.00')
    expect(adminApi.getMonitoringPriceHistory).toHaveBeenCalledWith(2, expect.objectContaining({ commodity: 'key:rice' }))
    expect(new URLSearchParams(window.location.search).get('store')).toBe('2')
  })

  it('keeps records view-only and sends only observed products to legal actions', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<FieldMonitoringRecords onNavigate={onNavigate} />)
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await user.click(await screen.findByRole('button', { name: 'View visit 14' }))
    expect(await screen.findByRole('heading', { name: 'Visit #14' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Recorded commodity prices' })).toHaveTextContent('₱50.00')
    expect(screen.getByRole('heading', { name: 'Products requiring regulatory review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|reject/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Legal Actions' }))
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
    await screen.findByRole('region', { name: 'Monitoring establishments' })
    await user.type(screen.getByRole('searchbox', { name: 'Search establishments' }), 'Central')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Weekly status' }), 'monitored_this_week')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Additional task' }), 'verification_required')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Latest observation' }), 'with_observations')
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await waitFor(() => expect(window.location.search).toContain('establishment_search=Central'))
    expect(window.location.search).toContain('monitor_tab=records')
    expect(window.location.search).toContain('weekly_status=monitored_this_week')
    expect(window.location.search).toContain('additional_task=verification_required')
    expect(window.location.search).toContain('observation=with_observations')
    expect(adminApi.getMonitoringEstablishments).toHaveBeenCalledWith(expect.objectContaining({ weekly_status: 'monitored_this_week', additional_task: 'verification_required', observation: 'with_observations' }))
    expect(screen.getByRole('searchbox', { name: 'Search monitoring visits' })).toHaveValue('')
  })

  it('restores an establishment profile from the URL', async () => {
    window.history.replaceState({}, '', '/?module=field_monitoring&store=2')
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()
    expect(adminApi.getMonitoringPriceHistory).toHaveBeenCalledWith(2, { commodity: 'key:rice', per_page: 10 })
  })

  it('opens the scoped verification queue from an establishment and can clear it', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    expect(screen.getByText('Latest accepted routine monitoring').closest('div')).toHaveTextContent('Aug 24, 2026')
    expect(screen.getByText('Verification claimed by Ana Officer')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'View Verification Requests' }))
    expect(await screen.findByText('Gaisano Grand Mall', { selector: '.field-monitor-scope strong' })).toBeInTheDocument()
    expect(adminApi.getFieldVerificationRequests).toHaveBeenCalledWith(expect.objectContaining({ store_id: 2 }))
    await user.click(screen.getByRole('button', { name: 'Clear establishment filter' }))
    expect(new URLSearchParams(window.location.search).get('verification_store')).toBeNull()
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
