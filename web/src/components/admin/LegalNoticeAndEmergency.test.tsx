import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import type { RegulatoryEmergencyRecord } from '../../types/admin'
import { EmergencyToggle } from './EmergencyToggle'
import { LegalNoticeManager } from './LegalNoticeManager'
import { AdminToastHost } from './AdminToastHost'
import { adminToast } from '../../services/adminToast'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getLegalNotices: vi.fn(),
    getLegalNotice: vi.fn(),
    createLegalNotice: vi.fn(),
    updateLegalNotice: vi.fn(),
    previewLegalNotice: vi.fn(),
    issueLegalNotice: vi.fn(),
    getMonitoringRecord: vi.fn(),
    getMonitoringRecords: vi.fn(),
    dispatchLegal: vi.fn(),
    getEmergencySummaries: vi.fn(),
    getEmergency: vi.fn(),
    getSrp: vi.fn(),
    createEmergency: vi.fn(),
    prepareEmergency: vi.fn(),
    activateEmergency: vi.fn(),
    updateEmergency: vi.fn(),
  },
}))

function mockEmergencies(records: RegulatoryEmergencyRecord[]) {
  vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue(records.map(({ candidates: _candidates, source_week: _week, srp_fallbacks: _fallbacks, ...summary }) => summary))
  vi.mocked(adminApi.getEmergency).mockImplementation(async (id) => records.find((record) => record.id === id)!)
}

describe('Legal Notice Engine & Emergency Protocol Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [], current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null })
    window.history.replaceState({}, '', '/?module=legal_actions&view=queue')
  })

  it('opens the queue by default and deep links to read-only captured evidence', async () => {
    const first = render(<LegalNoticeManager />)
    expect(await screen.findByRole('heading', { name: 'Action Queue' })).toBeInTheDocument()
    // Prepare Notice is not a way in: the tab only marks an open editor.
    expect(screen.queryByRole('button', { name: 'Prepare Notice' })).not.toBeInTheDocument()
    first.unmount()
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', items_count: 1, anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' },
      store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose', dti_sec_number: 'SEC-2' },
      protocol_mode: 'standard', protocol_reference: null,
      items: [{ id: 1, srp_id: 3, recorded_price: 62, baseline_price: 999, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 999 } }],
    })

    render(<LegalNoticeManager />)

    expect(await screen.findByRole('heading', { name: 'Prepare Notice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare Notice' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Antique Central Market')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target Establishment')).not.toBeInTheDocument()
    expect(screen.getByText(/Evaluator review required; this is not an automatic legal finding/i)).toBeInTheDocument()
  })

  it('creates one draft for selected eligible products and saves only on command', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', representative_title: 'Manager', anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, reference_label: 'SRP', reference_source: 'DTI', reference_effective_date: '2026-01-01', bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    const notice = { id: 4, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [{ id: 9, commodity_name: 'Rice', observed_price: 62, reference_value: 50 }] }, draft_payload: { recipient_name: 'Maria', recipient_title: 'Manager', recipient_email: null, address: 'San Jose', reason: null, legal_bases: [] }, internal_justification: null, intended_delivery_method: null, updated_at: '2026-09-07T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.createLegalNotice).mockResolvedValue(notice)
    vi.mocked(adminApi.updateLegalNotice).mockResolvedValue({ ...notice, internal_justification: 'Evaluator notes' })
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await screen.findByText('Rice')
    // Before the draft exists the later sections explain what comes next instead of showing dead fields.
    expect(screen.queryByLabelText('Internal justification')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Available after you start the draft/).length).toBe(2)
    await user.click(screen.getAllByRole('button', { name: 'Start LOI draft' })[0])
    expect(adminApi.createLegalNotice).toHaveBeenCalledWith({ monitoring_record_id: 14, notice_type: 'LOI', item_ids: [9] })
    await user.type(screen.getByLabelText('Internal justification'), 'Evaluator notes')
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Draft' }))
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('lists visits that need review and starts a notice from one', async () => {
    const visit = {
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online' as const, representative_name: 'Maria', items_count: 1, anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available' as const, reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    }
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [visit], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue(visit)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: 'New notice' }))
    expect(await screen.findByRole('heading', { name: 'Needs review' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Start notice' }))
    expect(adminApi.getMonitoringRecords).toHaveBeenCalledWith(expect.objectContaining({ review: 'pending' }))
    expect(adminApi.getMonitoringRecord).toHaveBeenCalledWith(14)
    expect(await screen.findByRole('checkbox', { name: /Rice/ })).toBeChecked()
    expect(screen.getAllByRole('button', { name: 'Start LOI draft' })[0]).toBeEnabled()
  })

  it('offers the existing open draft instead of starting a duplicate for the same visit', async () => {
    const draft = { id: 3, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [{ id: 9, commodity_name: 'Rice', observed_price: 62, reference_value: 50 }] }, draft_payload: { legal_bases: [] }, updated_at: '2026-09-07T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [draft], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(draft)
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [{
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' }, items: [],
      undecided_item_ids: [9], open_notice: { id: 3, notice_type: 'LOI', status: 'draft', control_number: null },
    }], current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 })
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: 'New notice' }))
    expect(screen.queryByRole('button', { name: 'Start notice' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Waiting on LOI draft' }))
    expect(adminApi.createLegalNotice).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Discard draft' })).toBeInTheDocument()
  })

  it('opens the existing notice when the server reports the visit already has one', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    const existing = { id: 3, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [{ id: 9 }] }, draft_payload: { recipient_name: 'Maria', legal_bases: [] }, updated_at: '2026-09-07T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.createLegalNotice).mockRejectedValue({ response: { status: 409, data: { message: 'An open notice already exists for this monitoring visit.' } } })
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [existing], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(existing)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await screen.findByText('Rice')
    await user.click(screen.getAllByRole('button', { name: 'Start LOI draft' })[0])

    expect(await screen.findByLabelText('Addressee (registered owner)')).toHaveValue('Maria')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens the notice the server names when the visit already has one', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    const existing = { id: 31, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [{ id: 9 }] }, draft_payload: { recipient_name: 'Registered Owner', legal_bases: [] }, updated_at: '2026-09-07T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.createLegalNotice).mockRejectedValue({ response: { status: 409, data: { message: 'An open notice already exists for this monitoring visit.', existing_notice_id: 31 } } })
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(existing)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await screen.findByText('Rice')
    await user.click(screen.getAllByRole('button', { name: 'Start LOI draft' })[0])
    expect(await screen.findByLabelText('Addressee (registered owner)')).toHaveValue('Registered Owner')
    expect(adminApi.getLegalNotice).toHaveBeenCalledWith(31)
    expect(adminApi.getLegalNotices).not.toHaveBeenCalledWith(expect.objectContaining({ store_id: 2 }))
  })

  it('finds the existing open notice on a later page of that store when the server reports one', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    const other = { id: 8, monitoring_record_id: 99, notice_type: 'LOI' as const, status: 'issued' as const, delivery_state: 'received' as const, source_snapshot: { items: [] }, draft_payload: { legal_bases: [] }, updated_at: '2026-09-09T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    const existing = { id: 3, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [{ id: 9 }] }, draft_payload: { recipient_name: 'Maria', legal_bases: [] }, updated_at: '2026-09-01T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.createLegalNotice).mockRejectedValue({ response: { status: 409, data: { message: 'An open notice already exists for this monitoring visit.' } } })
    vi.mocked(adminApi.getLegalNotices).mockImplementation(async ({ page = 1 } = {}) => ({ data: [page === 1 ? other : existing], current_page: page, last_page: 2, per_page: 20, total: 2, from: page, to: page }))
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(existing)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await screen.findByText('Rice')
    await user.click(screen.getAllByRole('button', { name: 'Start LOI draft' })[0])

    expect(await screen.findByLabelText('Addressee (registered owner)')).toHaveValue('Maria')
    expect(adminApi.getLegalNotices).toHaveBeenCalledWith({ store_id: 2, page: 1 })
    expect(adminApi.getLegalNotices).toHaveBeenCalledWith({ store_id: 2, page: 2 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pages the queue on the server and filters issued notices by status', async () => {
    const draft = { id: 3, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [] }, draft_payload: { legal_bases: [] }, updated_at: '2026-09-01T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.getLegalNotices).mockImplementation(async ({ page = 1 } = {}) => ({ data: [draft], current_page: page, last_page: 3, per_page: 20, total: 41, from: 1, to: 1 }))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    expect(await screen.findByText('Page 1 of 3 · 41 notices')).toBeInTheDocument()
    expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith({ status: 'draft', page: 1, search: undefined, store_id: undefined })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 3 · 41 notices')).toBeInTheDocument()
    expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith({ status: 'draft', page: 2, search: undefined, store_id: undefined })

    await user.click(screen.getByRole('button', { name: /Issued & Responses/ }))
    // "All issued notices" pages over non-draft notices on the server, so no page is filled with hidden drafts.
    await vi.waitFor(() => expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith({ status: undefined, page: 1, search: undefined, store_id: undefined, exclude_drafts: 1 }))
    await user.selectOptions(screen.getByLabelText('Status'), 'response_received')
    await vi.waitFor(() => expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith({ status: 'response_received', page: 1, search: undefined, store_id: undefined }))
    // Drafts never appear among issued notices, even on an unfiltered page.
    expect(screen.queryByRole('cell', { name: /Draft #3/ })).not.toBeInTheDocument()
  })

  it('limits the lists to the store it was opened for until cleared', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&view=queue&source_store=2')
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await vi.waitFor(() => expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith({ status: 'draft', page: 1, search: undefined, store_id: 2 }))
    await user.click(await screen.findByRole('button', { name: 'Show all' }))
    await vi.waitFor(() => expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith({ status: 'draft', page: 1, search: undefined, store_id: undefined }))
  })

  it('links the case reference back to the monitoring visit', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<LegalNoticeManager onNavigate={onNavigate} />)

    await user.click(await screen.findByRole('button', { name: 'Open visit #14 in Field Monitoring' }))
    expect(onNavigate).toHaveBeenCalledWith('field_monitoring', { record: 14 })
  })

  it('keeps official dispatch unavailable and sandboxes draft HTML', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', items_count: 1, anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    const notice = { id: 4, monitoring_record_id: 14, notice_type: 'LOI' as const, status: 'draft' as const, delivery_state: 'not_recorded' as const, source_snapshot: { items: [{ id: 9 }] }, draft_payload: { recipient_name: 'Maria', recipient_title: null, recipient_email: null, address: 'San Jose', reason: null, legal_bases: [] }, internal_justification: null, intended_delivery_method: null, updated_at: '2026-09-07T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE' as const, policy_version: null } }
    vi.mocked(adminApi.createLegalNotice).mockResolvedValue(notice)
    vi.mocked(adminApi.previewLegalNotice).mockResolvedValue('<h1>DRAFT - NOT AN OFFICIAL NOTICE</h1>')
    const user = userEvent.setup()

    render(<><LegalNoticeManager /><AdminToastHost /></>)

    await screen.findByText('Rice')
    await user.click(screen.getAllByRole('button', { name: 'Start LOI draft' })[0])
    expect(screen.getByRole('button', { name: 'Issue Notice' })).toBeDisabled()
    expect(screen.getByText(/Issuing needs a LOI signatory/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Official Preview' }))
    expect(await screen.findByTitle('Watermarked legal draft preview')).toHaveAttribute('sandbox', '')
    expect(adminApi.issueLegalNotice).not.toHaveBeenCalled()
    expect(adminApi.previewLegalNotice).toHaveBeenCalledWith(4)
  })

  it('renders only API-backed emergency records and exposes no simulated SCO action', async () => {
    vi.mocked(adminApi.getSrp).mockResolvedValue({
      records: [{ id: 1, commodity_key: 'rice', commodity_name: 'Regular Milled Rice', unit: 'kg', baseline_price: 50, effective_date: '2026-01-01', source_reference: 'DTI' }],
      pagination: { current_page: 1, last_page: 1, per_page: 1000, total: 1, from: 1, to: 1 },
      capabilities: { can_publish: true, status: 'AVAILABLE' },
    })
    mockEmergencies([{
      id: 7,
      location: 'San Jose, Antique',
      declaration_reference: 'PDRRMC-2026-07',
      starts_on: '2026-07-26',
      ends_on: null,
      status: 'active',
      effective_state: 'in_effect',
      preparation_hash: 'a'.repeat(64),
      source_week: { timezone: 'Asia/Manila', starts_at: '2026-07-13T16:00:00Z', ends_at: '2026-07-20T16:00:00Z' },
      candidates: [],
      official_prices: [{ id: 11, regulatory_emergency_id: 7, commodity_key: 'rice', price_type: 'APC', authoritative_price: 45, effective_from: '2026-07-26', effective_until: null, source_reference: 'PDRRMC-2026-07 | Monitoring week' }],
    }])

    render(<><EmergencyToggle /><AdminToastHost /></>)

    expect(await screen.findByText('State of Calamity Regulatory Command Bar')).toBeInTheDocument()
    expect(screen.getAllByText('PDRRMC-2026-07').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Price Freeze Prices' })).toBeInTheDocument()
    expect(screen.getByText('rice')).toBeInTheDocument()
    expect(await screen.findByText('Regular Milled Rice')).toBeInTheDocument()
    expect(screen.getAllByText('₱45.00').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Days Remaining/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SCO.*Sweep/i })).not.toBeInTheDocument()
  })

  it('counts the declared inclusive period and sets a 60-calendar-day end date', async () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]))
    const today = `${parts.year}-${parts.month}-${parts.day}`
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    mockEmergencies([{
      id: 8, location: 'San Jose de Buenavista, Antique', declaration_reference: 'DECL-8',
      starts_on: today, ends_on: tomorrow, status: 'active', effective_state: 'in_effect',
      source_week: { timezone: 'Asia/Manila', starts_at: '2026-09-28T00:00:00Z', ends_at: '2026-10-05T00:00:00Z' },
      candidates: [], official_prices: [],
    }])
    render(<EmergencyToggle />)

    expect(await screen.findByText('Day 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('1 Day Remaining')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-08' } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Set 60-day end date' }))
    expect(screen.getByLabelText('End date')).toHaveValue('2026-12-06')
  })

  it.each(['scheduled', 'expired'])('does not label a confirmed %s declaration as currently in effect', async (effectiveState) => {
    mockEmergencies([{
      id: 7, location: 'San Jose', declaration_reference: 'DECL-7', starts_on: '2026-10-07', ends_on: '2026-10-07',
      status: 'active', effective_state: effectiveState,
      source_week: { timezone: 'Asia/Manila', starts_at: '2026-09-28T00:00:00Z', ends_at: '2026-10-05T00:00:00Z' },
      candidates: [], official_prices: [],
    }])
    render(<EmergencyToggle />)
    await screen.findByText('Normal SRP Protocol')
    expect(screen.getByText('Normal weekly SRP monitoring')).toBeInTheDocument()
    expect(screen.queryByText('Active Price Freeze In Effect')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
  })

  it('ends immediately, confirms success and keeps historical emergency detail', async () => {
    const active = {
      id: 7, location: 'San Jose de Buenavista, Antique', declaration_reference: 'DECL-7',
      starts_on: '2026-09-09', ends_on: null, status: 'active' as const, effective_state: 'in_effect' as const,
      preparation_hash: 'a'.repeat(64),
      source_week: { timezone: 'Asia/Manila' as const, starts_at: '2026-08-30T16:00:00Z', ends_at: '2026-09-06T16:00:00Z' },
      candidates: [],
      official_prices: [{ id: 11, regulatory_emergency_id: 7, commodity_key: 'rice', price_type: 'APC' as const, authoritative_price: 45, effective_from: '2026-09-09', effective_until: null, source_reference: 'DECL-7' }],
    }
    mockEmergencies([active])
    const ended: RegulatoryEmergencyRecord = { ...active, status: 'ended', effective_state: 'ended', ended_at: '2026-09-09T02:00:00.123456Z', ends_on: '2026-09-09', official_prices: [{ ...active.official_prices[0], effective_until: '2026-09-09' }] }
    vi.mocked(adminApi.updateEmergency).mockImplementation(async () => { mockEmergencies([ended]); return ended })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<><EmergencyToggle /><AdminToastHost /></>)
    await user.click(await screen.findByRole('button', { name: 'End Price Freeze' }))

    expect(adminApi.updateEmergency).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'ended', confirmed: true }))
    expect(window.confirm).toHaveBeenCalledWith('End the Price Freeze now?')
    expect(await screen.findByText('Price Freeze ended immediately.')).toBeInTheDocument()
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
    expect(screen.getByText(/Manually ended at.*10:00:00.*Asia\/Manila/)).toBeInTheDocument()
    expect(screen.getByText('rice')).toBeInTheDocument()
  })

  it('allows an effective legacy ended declaration to end now and keeps errors visible on failure', async () => {
    const success = vi.spyOn(adminToast, 'success')
    mockEmergencies([{
      id: 7, location: 'San Jose', declaration_reference: 'LEGACY', starts_on: '2026-10-07', ends_on: '2026-10-08',
      status: 'ended', effective_state: 'in_effect', ended_at: null,
      source_week: { timezone: 'Asia/Manila', starts_at: '', ends_at: '' }, candidates: [], official_prices: [],
    }])
    vi.mocked(adminApi.updateEmergency).mockRejectedValue({ response: { data: { message: 'Audit storage unavailable.' } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<EmergencyToggle />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'End Price Freeze' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Audit storage unavailable.')
    expect(screen.getByRole('button', { name: 'End Price Freeze' })).toBeEnabled()
    expect(screen.getByText('Confirmed APC references are in effect.')).toBeInTheDocument()
    expect(success).not.toHaveBeenCalled()
  })

  it('shows an unavailable state when emergency declarations cannot be loaded', async () => {
    vi.mocked(adminApi.getEmergencySummaries).mockRejectedValue(new Error('offline'))

    render(<EmergencyToggle />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load emergency declarations/i)
    expect(screen.queryByText(/NORMAL MARKET PROTOCOL/i)).not.toBeInTheDocument()
  })

  it('keeps a failed declaration visible as an error and does not claim success', async () => {
    mockEmergencies([])
    vi.mocked(adminApi.createEmergency).mockRejectedValue({ response: { data: { message: 'Audit storage unavailable.' } } })
    const user = userEvent.setup()

    render(<><EmergencyToggle /><AdminToastHost /></>)
    await screen.findByText('No emergency declarations recorded.')
    await user.type(screen.getByLabelText('Declaration reference'), 'DECL-7')
    await user.type(screen.getByLabelText('Start date'), '2026-08-29')
    await user.click(screen.getByRole('button', { name: 'Prepare APC' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Audit storage unavailable.')
    expect(screen.queryByText('Emergency declaration recorded.')).not.toBeInTheDocument()
    expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(1)
  })

  it('shows computed APC values as read only and activates only the reviewed preparation hash', async () => {
    const draft = {
      id: 7, location: 'San Jose de Buenavista, Antique', declaration_reference: 'DECL-7',
      starts_on: '2026-09-09', ends_on: null, status: 'draft' as const, effective_state: 'draft' as const,
      preparation_hash: 'b'.repeat(64),
      source_week: { timezone: 'Asia/Manila' as const, starts_at: '2026-08-30T16:00:00Z', ends_at: '2026-09-06T16:00:00Z' },
      candidates: [{ id: 3, commodity_key: 'rice', minimum_price: 40, maximum_price: 50, observed_average_price: 44, computed_apc_price: 45, observation_count: 3, establishment_count: 2, source_item_ids: [1, 2, 3], dataset_hash: 'c'.repeat(64), source_observations: [{ item_id: 1, monitoring_record_id: 9, store_name: 'Market A', finalized_at: '2026-09-01T01:00:00Z', recorded_price: 40 }] }],
      official_prices: [],
    }
    mockEmergencies([draft])
    vi.mocked(adminApi.prepareEmergency).mockResolvedValue(draft)
    vi.mocked(adminApi.activateEmergency).mockResolvedValue({ ...draft, status: 'active', effective_state: 'in_effect' })
    const user = userEvent.setup()

    render(<EmergencyToggle />)

    expect(await screen.findByRole('heading', { name: 'Proposed price ceilings' })).toBeInTheDocument()
    expect(screen.getByText('₱40.00')).toBeInTheDocument()
    expect(screen.getByText('₱50.00')).toBeInTheDocument()
    expect(screen.getByText('₱44.00')).toBeInTheDocument()
    expect(screen.getAllByText('₱45.00').length).toBeGreaterThan(0)
    await user.click(screen.getByText(/Source records for .*rice/i))
    expect(screen.getByText('Market A')).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Refresh preparation' }))
    expect(adminApi.prepareEmergency).toHaveBeenCalledWith(7)
    await user.click(screen.getByRole('checkbox', { name: /reviewed the source week/i }))
    await user.click(screen.getByRole('button', { name: 'Confirm and activate' }))
    expect(adminApi.activateEmergency).toHaveBeenCalledWith(7, { confirmed: true, preparation_hash: 'b'.repeat(64) })
  })

  it('shows each candidate source week and SRP fallbacks, and lets a reviewed preparation with fallbacks activate', async () => {
    const draft = {
      id: 7, location: 'San Jose de Buenavista, Antique', declaration_reference: 'DECL-7',
      starts_on: '2026-09-09', ends_on: null, status: 'draft' as const, effective_state: 'draft' as const,
      preparation_hash: 'b'.repeat(64),
      source_week: { timezone: 'Asia/Manila' as const, starts_at: '2026-08-30T16:00:00Z', ends_at: '2026-09-06T16:00:00Z', starts_on: '2026-08-31', ends_on: '2026-09-06' },
      candidates: [
        { id: 3, commodity_key: 'rice', minimum_price: 40, maximum_price: 50, observed_average_price: 44, computed_apc_price: 45, observation_count: 3, establishment_count: 2, source_week: { starts_on: '2026-08-31', ends_on: '2026-09-06' }, source_observations: [{ item_id: 1, monitoring_record_id: 9, store_name: 'Market A', finalized_at: '2026-09-01T01:00:00Z', recorded_price: 40 }] },
        { id: 4, commodity_key: 'sugar', minimum_price: 60, maximum_price: 60, observed_average_price: 60, computed_apc_price: 60, observation_count: 1, establishment_count: 1, source_week: { starts_on: '2026-08-17', ends_on: '2026-08-23' }, source_observations: [{ item_id: 2, monitoring_record_id: 10, store_name: 'Market B', finalized_at: '2026-08-18T01:00:00Z', recorded_price: 60 }] },
      ],
      srp_fallbacks: [{ commodity_key: 'milk', commodity_name: 'Milk', unit: 'can', srp_id: 12, srp_price: 38 }],
      // Still sent for tabs on the previous build; this build must not let it block activation.
      missing_commodity_keys: ['milk', 'sugar'],
      official_prices: [],
    }
    mockEmergencies([draft])
    vi.mocked(adminApi.activateEmergency).mockResolvedValue({ ...draft, status: 'active', effective_state: 'in_effect' })
    const user = userEvent.setup()

    render(<EmergencyToggle />)

    expect(await screen.findByText('Aug 17, 2026 – Aug 23, 2026')).toBeInTheDocument()
    expect(screen.getByText('Aug 31, 2026 – Sep 6, 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Earlier source week')).toHaveLength(1)
    expect(screen.getByText('SRP held as ceiling')).toBeInTheDocument()
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.getByText(/₱38\.00/)).toBeInTheDocument()
    expect(screen.queryByText(/Activation is blocked/i)).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /reviewed the source week/i }))
    await user.click(screen.getByRole('button', { name: 'Confirm and activate' }))
    expect(adminApi.activateEmergency).toHaveBeenCalledWith(7, { confirmed: true, preparation_hash: 'b'.repeat(64) })
  })
})
