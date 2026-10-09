import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { FieldMonitoringRecords } from './FieldMonitoringRecords'
import { exportMonitoringMatrixExcel } from '../../utils/monitoringExcelExport'

vi.mock('../../services/adminApi', () => ({ adminApi: {
  getMonitoringEstablishments: vi.fn(), getMonitoringEstablishment: vi.fn(), getMonitoringPriceHistory: vi.fn(),
  getMonitoringRecords: vi.fn(), getMonitoringRecord: vi.fn(), getMonitoringSignature: vi.fn(),
  getFieldVerificationRequests: vi.fn(), cancelFieldVerification: vi.fn(), reopenFieldVerification: vi.fn(),
  getManagedUsers: vi.fn(), createAdditionalVisit: vi.fn(), assignFieldVerification: vi.fn(),
  getMonitoringFindings: vi.fn(), getMonitoringExportMatrix: vi.fn(),
} }))

vi.mock('../../utils/monitoringExcelExport', () => ({
  exportMonitoringMatrixExcel: vi.fn(),
}))

const record = {
  id: 14, client_uuid: 'visit-14', status: 'accepted', started_at: '2026-08-24T07:30:00Z', finalized_at: '2026-08-24T08:00:00Z',
  received_at: '2026-08-24T08:02:00Z', representative_name: 'Maria Santos', sync_source: 'offline_queue' as const,
  protocol_mode: 'standard' as const, protocol_reference: null, location_captured_at: '2026-08-24T07:59:00Z',
  latitude: 10.74, longitude: 121.94, location_accuracy_meters: 9, items_count: 1, anomaly_count: 1,
  officer: { id: 7, name: 'Ana Officer', email: 'ana@dti.gov.ph' },
  store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose de Buenavista' },
  verification_request: { id: 301, status: 'completed', report: { id: 101, report_reference: 'RPT-101', status: 'Under regulatory review' } },
  items: [{ id: 1, srp_id: 3, recorded_price: 62, baseline_price: 999, previous_price: 55, reference_value: 50, reference_label: 'SRP baseline', reference_source: 'SRP-2026-01', reference_effective_date: '2026-08-01', variance_percent: 24, is_anomaly: true, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 999 } }],
}

const workspace = {
  monitoring_period: { cadence: 'weekly' as const, timezone: 'Asia/Manila' as const, starts_at: '2026-08-23T16:00:00Z', ends_at: '2026-08-30T16:00:00Z', protocol_mode: 'standard' as const, declaration_reference: null },
  routine_summary: { total_establishments: 1, due: 0, completed: 1, additional_visits: 1 },
  monitoring_week: { timezone: 'Asia/Manila' as const, starts_at: '2026-08-23T16:00:00Z', ends_at: '2026-08-30T16:00:00Z' },
  weekly_summary: { total_establishments: 1, not_yet_monitored: 0, monitored_this_week: 1, verification_required: 1 },
  establishments: { data: [{ id: 2, dti_sec_number: null, store_name: 'Gaisano Grand Mall', owner_name: 'Maria Santos', address: 'San Jose de Buenavista', is_active: true, is_verified: true, completed_records_count: 1, records_with_observations_count: 1, open_verification_requests_count: 1, routine_status: 'completed' as const, weekly_routine_status: 'monitored_this_week' as const, has_prior_routine_monitoring: true, latest_routine_monitoring_at: record.finalized_at, verification_task_status: 'claimed' as const, verification_claimant: record.officer, latest_monitoring_at: record.finalized_at, latest_record_id: 14, latest_protocol_mode: 'standard' as const, latest_officer: record.officer, latest_result: 'with_observations' as const }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 },
}

describe('FieldMonitoringRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=field_monitoring')
    vi.mocked(adminApi.getMonitoringEstablishments).mockResolvedValue(workspace)
    vi.mocked(adminApi.getMonitoringEstablishment).mockResolvedValue({ store: { id: 2, dti_sec_number: null, store_name: 'Gaisano Grand Mall', owner_name: 'Maria Santos', address: 'San Jose de Buenavista', latitude: 10.74, longitude: 121.94, is_active: true, is_verified: true, is_public: true }, completed_records_count: 1, records_with_observations_count: 1, open_verification_requests_count: 1, monitoring_period: workspace.monitoring_period, routine_status: 'completed', monitoring_week: workspace.monitoring_week, weekly_routine_status: 'monitored_this_week', has_prior_routine_monitoring: true, latest_routine_monitoring_at: record.finalized_at, latest_routine_record: { ...record, verification_request: undefined }, verification_task_status: 'claimed', verification_claimant: record.officer, latest_record: record, monitored_commodities: [{ selector: 'key:rice', commodity_name: 'Rice', unit: 'kg' }] })
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [record], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue(record)
    vi.mocked(adminApi.getFieldVerificationRequests).mockResolvedValue({ data: [{ id: 301, source_type: 'complaint', status: 'completed', reason: 'Verify the shelf price.', requested_at: '2026-08-24T06:00:00Z', completed_at: record.finalized_at, store: record.store, report: { id: 101, report_reference: 'RPT-101', status: 'Under regulatory review' }, claimant: record.officer, monitoring_record: { id: 14 } }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getManagedUsers).mockResolvedValue({ records: [{ id: 9, name: 'Ben Officer', email: 'ben@dti.test', role: 'field_officer', is_active: true, created_at: '2026-01-01', stores: [] }], pagination: { current_page: 1, last_page: 1, per_page: 50, total: 1, from: 1, to: 1 }, counts: { total: 1, field_officer: 1, vendor: 0, inactive: 0 } })
    vi.mocked(adminApi.createAdditionalVisit).mockResolvedValue({ id: 401, source_type: 'supervisor_directive', status: 'claimed', reason: 'Recheck display.', store_id: 2, claimed_by: 9, requested_at: '2026-08-24T09:00:00Z', claimed_at: '2026-08-24T09:00:00Z', completed_at: null, cancelled_at: null })
  })

  it('opens on the establishment overview with operational summary filters', async () => {
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('region', { name: 'Monitoring establishments' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Establishments' })).toHaveAttribute('aria-selected', 'true')
    const filter = screen.getByRole('combobox', { name: 'Filter establishments' })
    await waitFor(() => expect(within(filter).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All establishments (1)', 'Not yet monitored (0)', 'Monitored this week (1)', 'Needs additional visit (1)', 'With observations',
    ]))
    expect(filter).toHaveValue('all')
    expect(screen.queryByText(/Weekly monitoring/)).not.toBeInTheDocument()
    expect(screen.getByText('Verification Required')).toBeInTheDocument()
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

  it('opens an establishment profile showing only the summary cards and its monitoring records', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    expect(await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Accepted field monitoring visits' })).toHaveTextContent('Ana Officer')
    expect(adminApi.getMonitoringRecords).toHaveBeenCalledWith(expect.objectContaining({ store_id: 2, period: 'last_4_weeks' }))
    expect(screen.getByText('Completed Visits')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Establishment monitoring profile' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Registered owner|Current establishment representative/)).not.toBeInTheDocument()
    expect(adminApi.getMonitoringPriceHistory).not.toHaveBeenCalled()
    expect(adminApi.getMonitoringFindings).not.toHaveBeenCalled()
    expect(new URLSearchParams(window.location.search).get('store')).toBe('2')
  })

  it('searches the monitoring records of the open establishment', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    await user.type(await screen.findByRole('searchbox', { name: 'Search monitoring records' }), 'Ana')
    await waitFor(() => expect(adminApi.getMonitoringRecords).toHaveBeenCalledWith(expect.objectContaining({ store_id: 2, search: 'Ana', page: 1 })))
    expect(adminApi.getMonitoringEstablishment).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(window.location.search).toContain('profile_record_search=Ana'))
  })

  it('keeps records view-only and sends only observed products to legal actions', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<FieldMonitoringRecords onNavigate={onNavigate} />)
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await user.click(await screen.findByRole('button', { name: 'View visit 14' }))
    expect(await screen.findByRole('heading', { name: 'Visit #14' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Recorded commodity prices' })).toHaveTextContent('₱50.00')
    // The captured reference and the previous verified price are shown as recorded, never recomputed.
    expect(screen.getByRole('table', { name: 'Recorded commodity prices' })).toHaveTextContent('SRP baseline · SRP-2026-01 · 2026-08-01')
    expect(screen.getByRole('table', { name: 'Recorded commodity prices' })).toHaveTextContent('Previous ₱55.00')
    expect(screen.getByRole('heading', { name: 'Products requiring regulatory review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|reject/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Legal Actions' }))
    expect(onNavigate).toHaveBeenCalledWith('legal_actions', { source_record: 14, source_store: 2 })
  })

  it('links a completed verification request directly to its monitoring record', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(screen.getByRole('tab', { name: 'Additional Visits' }))
    expect(await screen.findByText('RPT-101')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Quick status filters' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Additional visit status' }), 'completed')
    await waitFor(() => expect(adminApi.getFieldVerificationRequests).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' })))
    await user.click(screen.getByRole('button', { name: 'Open monitoring record 14' }))
    expect(await screen.findByRole('heading', { name: 'Visit #14' })).toBeInTheDocument()
  })

  it('assigns a supervisor-directed visit from an establishment profile', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    await user.click(screen.getByRole('button', { name: 'Assign additional visit' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Field Officer' }), '9')
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'Recheck display.')
    await user.click(screen.getByRole('button', { name: 'Assign visit' }))
    await waitFor(() => expect(adminApi.createAdditionalVisit).toHaveBeenCalledWith(2, { reason: 'Recheck display.', field_officer_id: 9 }))
  })

  it('stores the active workspace and list controls in the URL', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await screen.findByRole('region', { name: 'Monitoring establishments' })
    await user.type(screen.getByRole('searchbox', { name: 'Search establishments' }), 'Central')
    const filter = screen.getByRole('combobox', { name: 'Filter establishments' })
    await user.selectOptions(filter, 'observations')
    await waitFor(() => expect(adminApi.getMonitoringEstablishments).toHaveBeenCalledWith(expect.objectContaining({ observation: 'with_observations', additional_task: 'all' })))
    expect(window.location.search).toContain('observation=with_observations')
    await user.selectOptions(filter, 'verification')
    await waitFor(() => expect(adminApi.getMonitoringEstablishments).toHaveBeenCalledWith(expect.objectContaining({ additional_task: 'verification_required', observation: 'all' })))
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await waitFor(() => expect(window.location.search).toContain('establishment_search=Central'))
    expect(window.location.search).toContain('monitor_tab=records')
    expect(window.location.search).toContain('additional_task=verification_required')
    expect(window.location.search).not.toContain('observation=')
    expect(screen.getByRole('searchbox', { name: 'Search monitoring visits' })).toHaveValue('')
  })

  it('restores an establishment profile from the URL', async () => {
    window.history.replaceState({}, '', '/?module=field_monitoring&store=2')
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()
    expect(adminApi.getMonitoringRecords).toHaveBeenCalledWith(expect.objectContaining({ store_id: 2 }))
  })

  it('opens the scoped verification queue from an establishment and can clear it', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    await user.click(screen.getByRole('button', { name: 'View Additional Visits' }))
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
    vi.mocked(adminApi.getFieldVerificationRequests).mockResolvedValue({ data: [{ id: 302, source_type: 'supervisor_directive', status: 'open', reason: 'Follow up.', requested_at: '2026-08-24T06:00:00Z', store: record.store, report: null, claimant: null, monitoring_record: null }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(screen.getByRole('tab', { name: 'Additional Visits' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(adminApi.cancelFieldVerification).toHaveBeenCalledWith(302)
  })

  it('filters establishment information by period preset', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    expect(await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()

    // Switch period to This Week
    await user.selectOptions(screen.getByRole('combobox', { name: 'Monitoring period' }), 'this_week')
    await waitFor(() => {
      expect(adminApi.getMonitoringEstablishment).toHaveBeenCalledWith(2, expect.objectContaining({ period: 'this_week' }))
    })
  })

  it('drops a profile that finishes loading after the admin went back', async () => {
    let finish!: (value: Awaited<ReturnType<typeof adminApi.getMonitoringEstablishment>>) => void
    const loaded = await adminApi.getMonitoringEstablishment(2, { period: 'last_4_weeks' })
    vi.mocked(adminApi.getMonitoringEstablishment).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await act(async () => { finish(loaded) })

    expect(screen.queryByRole('heading', { name: 'Gaisano Grand Mall' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All Records' })).toHaveAttribute('aria-selected', 'true')
    expect(new URLSearchParams(window.location.search).get('store')).toBeNull()
  })

  it('closes the profile on Back to the list but keeps it on Back within the same store', async () => {
    window.history.replaceState({}, '', '/?module=field_monitoring')
    window.history.pushState({}, '', '/?module=field_monitoring&store=2')
    render(<FieldMonitoringRecords />)
    expect(await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()

    act(() => {
      window.history.pushState({}, '', '/?module=field_monitoring&store=2&profile_tab=history')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('heading', { name: 'Gaisano Grand Mall' })).toBeInTheDocument()

    act(() => {
      window.history.pushState({}, '', '/?module=field_monitoring')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(await screen.findByRole('region', { name: 'Monitoring establishments' })).toBeInTheDocument()
  })

  it('reloads the same establishment when Back restores a different period', async () => {
    window.history.replaceState({}, '', '/?module=field_monitoring&store=2&period=this_week')
    render(<FieldMonitoringRecords />)
    await screen.findByRole('heading', { name: 'Gaisano Grand Mall' })
    vi.mocked(adminApi.getMonitoringEstablishment).mockClear()

    act(() => {
      window.history.pushState({}, '', '/?module=field_monitoring&store=2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(adminApi.getMonitoringEstablishment).toHaveBeenCalledWith(2, expect.objectContaining({ period: 'last_4_weeks' })))
  })

  it('ignores Back/Forward into another module instead of loading its record', async () => {
    render(<FieldMonitoringRecords />)
    await screen.findByRole('region', { name: 'Monitoring establishments' })
    act(() => {
      window.history.pushState({}, '', '/?module=overview&record=14&store=2')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(adminApi.getMonitoringRecord).not.toHaveBeenCalled()
    expect(adminApi.getMonitoringEstablishment).not.toHaveBeenCalled()
  })

  it('opens detail only from explicit buttons, not stray clicks on a table row', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await screen.findByRole('region', { name: 'Monitoring establishments' })
    await user.click(screen.getByRole('button', { name: 'Table view' }))
    await user.click(within(await screen.findByRole('table', { name: 'Monitoring establishments' })).getByText('San Jose de Buenavista'))
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await user.click(await screen.findByText('ana@dti.gov.ph'))
    expect(adminApi.getMonitoringEstablishment).not.toHaveBeenCalled()
    expect(adminApi.getMonitoringRecord).not.toHaveBeenCalled()
  })

  it('filters to establishments not yet monitored from the status dropdown', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await screen.findByRole('region', { name: 'Monitoring establishments' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter establishments' }), 'due')
    await waitFor(() => expect(adminApi.getMonitoringEstablishments).toHaveBeenCalledWith(expect.objectContaining({ routine_status: 'due' })))
    expect(screen.getByRole('combobox', { name: 'Filter establishments' })).toHaveValue('due')
    expect(window.location.search).toContain('routine_status=due')
  })

  it('assigns an open visit in a dialog that Escape closes', async () => {
    vi.mocked(adminApi.getFieldVerificationRequests).mockResolvedValue({ data: [{ id: 302, source_type: 'supervisor_directive', status: 'open', reason: 'Follow up.', requested_at: '2026-08-24T06:00:00Z', store: record.store, report: null, claimant: null, monitoring_record: null }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(screen.getByRole('tab', { name: 'Additional Visits' }))
    await user.click(await screen.findByRole('button', { name: 'Assign' }))
    expect(screen.getByRole('dialog', { name: 'Assign additional visit' })).toHaveTextContent('Antique Central Market')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Assign' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Field Officer' }), '9')
    await user.click(screen.getByRole('button', { name: 'Assign visit' }))
    await waitFor(() => expect(adminApi.assignFieldVerification).toHaveBeenCalledWith(302, 9))
  })

  it('renders cleaned up establishment profile header and truthful regulatory status', async () => {
    const user = userEvent.setup()
    render(<FieldMonitoringRecords />)
    await user.click(await screen.findByRole('button', { name: 'Open Gaisano Grand Mall monitoring profile' }))

    // Verify sleek back button is present
    expect(screen.getByRole('button', { name: 'Back to establishments directory' })).toBeInTheDocument()

    // Verify breadcrumb nav and badges are removed
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument()
    expect(screen.queryByText('Operating')).not.toBeInTheDocument()
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()

    // Verify truthful regulatory status displays observations when present
    expect(screen.getByText('Observations Noted')).toBeInTheDocument()
  })

  it('filters all records by period and exports regional matrix to excel', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.getMonitoringExportMatrix).mockResolvedValue({
      period: 'last_4_weeks',
      date_range: { from: '2026-08-01', to: '2026-08-28' },
      commodities: [{ id: 1, commodity_name: 'Toyo Bonus Green EOC (155g)', unit: '155g', category: 'Canned Sardines', regulatory_classification: 'Basic Necessities', srp: 20 }],
      weeks: [{ week_number: 1, week_key: 'w1', week_label: 'Week 1', starts_at: '2026-08-01', ends_at: '2026-08-07', establishments: [{ store_id: 2, store_name: 'Gaisano Grand Mall', monitoring_date: '2026-08-03', monitoring_date_formatted: 'Aug 03, 2026', prices: { 1: { recorded_price: 20, is_anomaly: false } } }] }],
      generated_at: '2026-08-24T00:00:00Z',
    })

    render(<FieldMonitoringRecords />)
    await user.click(screen.getByRole('tab', { name: 'All Records' }))

    const periodSelect = screen.getByRole('combobox', { name: 'Period' })
    expect(periodSelect).toHaveValue('all_time')

    await user.selectOptions(periodSelect, 'last_4_weeks')
    expect(adminApi.getMonitoringRecords).toHaveBeenCalledWith(expect.objectContaining({ period: 'last_4_weeks' }))

    const exportBtn = screen.getByRole('button', { name: 'Export to Excel' })
    expect(exportBtn).toBeInTheDocument()
    await user.click(exportBtn)
    await waitFor(() => expect(adminApi.getMonitoringExportMatrix).toHaveBeenCalledWith({ period: 'last_4_weeks', search: undefined }))
  })

  it('exports the current search before debounce and restores period-only export when cleared', async () => {
    const matrix = { period: 'this_week', date_range: { from: null, to: null }, commodities: [], weeks: [], generated_at: '2026-08-24T00:00:00Z' }
    vi.mocked(adminApi.getMonitoringExportMatrix).mockResolvedValue(matrix)
    window.history.replaceState({}, '', '/?module=field_monitoring&monitor_tab=records&record_search=Old&record_period=this_week')
    render(<FieldMonitoringRecords />)
    await screen.findByRole('table', { name: 'Accepted field monitoring visits' })

    const exportButton = screen.getByRole('button', { name: 'Export to Excel' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search monitoring visits' }), { target: { value: '  aNtIqUe  ' } })
    fireEvent.click(exportButton)
    expect(adminApi.getMonitoringExportMatrix).toHaveBeenLastCalledWith({ period: 'this_week', search: 'aNtIqUe' })
    await waitFor(() => expect(exportMonitoringMatrixExcel).toHaveBeenCalledWith(matrix, 'This Week'))
    await waitFor(() => expect(exportButton).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    fireEvent.click(exportButton)
    expect(adminApi.getMonitoringExportMatrix).toHaveBeenLastCalledWith({ period: 'this_week', search: undefined })
    await waitFor(() => expect(exportMonitoringMatrixExcel).toHaveBeenCalledTimes(2))
  })

  it.each(['request', 'workbook'])('shows %s export failures and allows retry', async (failure) => {
    const matrix = { period: 'all_time', date_range: { from: null, to: null }, commodities: [], weeks: [], generated_at: '2026-08-24T00:00:00Z' }
    vi.mocked(adminApi.getMonitoringExportMatrix).mockResolvedValue(matrix)
    if (failure === 'request') vi.mocked(adminApi.getMonitoringExportMatrix).mockRejectedValueOnce(new Error('Export unavailable'))
    else vi.mocked(exportMonitoringMatrixExcel).mockRejectedValueOnce(new Error('Export unavailable'))
    window.history.replaceState({}, '', '/?module=field_monitoring&monitor_tab=records')
    render(<FieldMonitoringRecords />)
    await screen.findByRole('table', { name: 'Accepted field monitoring visits' })

    const exportButton = screen.getByRole('button', { name: 'Export to Excel' })
    fireEvent.click(exportButton)
    expect(await screen.findByText('Export unavailable')).toBeInTheDocument()
    expect(exportButton).toBeEnabled()
    if (failure === 'request') expect(exportMonitoringMatrixExcel).not.toHaveBeenCalled()
    fireEvent.click(exportButton)
    await waitFor(() => expect(exportMonitoringMatrixExcel).toHaveBeenCalledWith(matrix, 'All Records'))
    await waitFor(() => expect(exportButton).toBeEnabled())
    expect(screen.queryByText('Export unavailable')).not.toBeInTheDocument()
  })

  it('links a visit to its notices and shows DTI decisions without acting on them', async () => {
    const decided = { ...record,
      items: [{ ...record.items[0], finding: { decision: 'no_action' as const, reason: 'Tag misprint', decided_at: '2026-08-25T00:00:00Z' } }],
      undecided_item_ids: [], open_notice: null,
      notices: [{ id: 41, notice_type: 'LOI' as const, status: 'closed' as const, control_number: 'LOI-2026-000041', outcome: 'violation_confirmed' as const }] }
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue(decided)
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(<FieldMonitoringRecords onNavigate={onNavigate} />)
    await user.click(screen.getByRole('tab', { name: 'All Records' }))
    await user.click(await screen.findByRole('button', { name: 'View visit 14' }))

    // The decision names when it was made, with its reason.
    expect((await screen.findAllByText(/No action · .+: Tag misprint/)).length).toBeGreaterThan(0)
    // Nothing is left undecided, so Field Monitoring offers no new notice; the existing one is a link only.
    expect(screen.queryByRole('button', { name: 'Open Legal Actions' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'LOI-2026-000041 · Violation confirmed' }))
    expect(onNavigate).toHaveBeenCalledWith('legal_actions', { source_notice: 41 })
  })
})
