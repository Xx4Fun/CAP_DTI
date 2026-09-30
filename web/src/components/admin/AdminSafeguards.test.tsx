import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { AuditPanel, EmergencyPanel, LegalDraftPanel, OverviewPanel, ReportReviewPanel, SrpManagementPanel } from './AdminPanels'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getReports: vi.fn(),
    getMonitoringRecord: vi.fn(),
    decideReport: vi.fn(),
    getReportEvidence: vi.fn(),
    getLegalNotices: vi.fn(),
    createLegalNotice: vi.fn(),
    updateLegalNotice: vi.fn(),
    previewLegalNotice: vi.fn(),
    issueLegalNotice: vi.fn(),
    getEmergencies: vi.fn(),
    createEmergency: vi.fn(),
    prepareEmergency: vi.fn(),
    activateEmergency: vi.fn(),
    updateEmergency: vi.fn(),
    getSrp: vi.fn(),
    previewSrp: vi.fn(),
    importSrp: vi.fn(),
    getOverview: vi.fn(),
    getAuditEvents: vi.fn(),
  },
}))

describe('DTI Admin safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('renders the original receipt OCR separately from evaluator corrections', async () => {
    vi.mocked(adminApi.getReports).mockResolvedValue([{
      id: 42,
      report_reference: 'RPT-00042',
      status: 'Under Review',
      store_name: 'Verified Market',
      submitted_at: '2026-07-25T10:00:00Z',
      raw_ocr_json: { product: 'Orig Rice', price: '50.00' },
      evaluator_confirmed_json: { product: 'Rice', price: '49.50' },
      evidence_available: true,
    }])
    vi.mocked(adminApi.decideReport).mockResolvedValue({
      id: 42,
      report_reference: 'RPT-00042',
      status: 'Under regulatory review',
      store_name: 'Verified Market',
      submitted_at: '2026-07-25T10:00:00Z',
      raw_ocr_json: { product: 'Orig Rice', price: '50.00' },
      evaluator_confirmed_json: { commodity_name: 'Rice', receipt_price: 48.75 },
      evidence_available: true,
    })
    const user = userEvent.setup()

    render(<ReportReviewPanel />)
    await user.click(await screen.findByRole('button', { name: /RPT-00042/i }))

    expect(screen.getByRole('heading', { name: 'Raw OCR payload' })).toBeInTheDocument()
    expect(screen.getAllByText(/Orig Rice/)).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'DTI evaluator findings' })).toBeInTheDocument()
    expect(screen.getAllByText(/49.50/)).toHaveLength(2)
    expect(screen.getByText(/Formal receipt \| Consumer report/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download private receipt evidence' })).toBeInTheDocument()

    const corrected = screen.getByRole('textbox', { name: 'Evaluator-confirmed JSON' })
    fireEvent.change(corrected, { target: { value: '{"commodity_key":"rice-1kg","commodity_name":"Rice","receipt_price":48.75,"observed_at":"2026-07-25"}' } })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Regulatory finding' }), 'confirmed_violation')
    await user.type(screen.getByRole('textbox', { name: 'Decision reason' }), 'Checked against receipt.')
    await user.click(screen.getByRole('button', { name: 'Correct' }))

    expect(adminApi.decideReport).toHaveBeenCalledWith(42, expect.objectContaining({
      action: 'correct', corrected: expect.objectContaining({ receipt_price: 48.75, regulatory_finding: 'confirmed_violation' }),
    }))
  })

  it('does not turn an overview request failure into misleading zero counts', async () => {
    vi.mocked(adminApi.getOverview).mockRejectedValue(new Error('offline'))
    render(<OverviewPanel />)

    expect(screen.getByRole('status')).toHaveTextContent(/loading regulatory overview/i)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
    expect(screen.queryByText('Pending Consumer Tips')).not.toBeInTheDocument()
  })

  it('keeps available overview counts and marks missing emergency records unavailable', async () => {
    vi.mocked(adminApi.getOverview).mockResolvedValue({
      stores: 12,
      pending_reports: 3,
      active_emergencies: null,
      availability: { regulatory_emergencies: false },
    })

    render(<OverviewPanel />)

    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText(/SCO-2026-0801/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/LOI-2026-0728/i)).not.toBeInTheDocument()
    expect(screen.getByText(/No authoritative trend summary is available/i)).toBeInTheDocument()
    expect(screen.getByText(/No legal action records are available/i)).toBeInTheDocument()
  })

  it('shows a safe schema-unavailable state instead of an empty audit trail', async () => {
    vi.mocked(adminApi.getAuditEvents).mockRejectedValue({
      response: { data: { status: 'AUDIT_TRAIL_UNAVAILABLE' } },
    })

    render(<AuditPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('AUDIT_TRAIL_UNAVAILABLE')
    expect(screen.getByRole('alert')).toHaveTextContent(/approved Admin migration/i)
  })

  it('labels legal output as unavailable and previews only a watermarked draft', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', received_at: '2026-08-24T08:02:00Z', sync_source: 'online', representative_name: 'Maria', items_count: 1, anomaly_count: 1,
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 9, srp_id: 3, recorded_price: 62, baseline_price: 50, reference_status: 'available', reference_value: 50, is_anomaly: true, variance_percent: 24, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    })
    vi.mocked(adminApi.createLegalNotice).mockResolvedValue({ id: 4, monitoring_record_id: 14, notice_type: 'LOI', status: 'draft', delivery_state: 'not_recorded', source_snapshot: { items: [{ id: 9 }] }, draft_payload: { recipient_name: 'Maria', address: 'San Jose', legal_bases: [] }, updated_at: '2026-09-07T00:00:00Z', readiness: {}, policy: { status: 'LEGAL_POLICY_UNAVAILABLE', policy_version: null } })
    vi.mocked(adminApi.previewLegalNotice).mockResolvedValue('<h1>DRAFT - NOT AN OFFICIAL NOTICE</h1>')
    const user = userEvent.setup()

    render(<LegalDraftPanel />)
    await screen.findByText('Rice')
    await user.click(screen.getAllByRole('button', { name: 'Start LOI draft' })[0])
    expect(await screen.findByText(/Issuing is turned off until an approved legal policy/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Official Preview' }))
    expect(await screen.findByTitle('Watermarked legal draft preview')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('DRAFT - NOT AN OFFICIAL NOTICE'),
    )

    expect(screen.getByRole('button', { name: 'Issue Notice' })).toBeDisabled()
    expect(adminApi.issueLegalNotice).not.toHaveBeenCalled()
    expect(adminApi.previewLegalNotice).toHaveBeenCalledWith(4)
  })

  it('shows confirmed APC records without manual authoritative-price controls', async () => {
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([{
      id: 7,
      location: 'San Jose, Antique',
      declaration_reference: 'PDRRMC-2026-07',
      starts_on: '2026-07-26',
      ends_on: null,
      status: 'active',
      effective_state: 'in_effect',
      preparation_hash: 'a'.repeat(64),
      source_week: { timezone: 'Asia/Manila', starts_at: '2026-07-12T16:00:00Z', ends_at: '2026-07-19T16:00:00Z' },
      candidates: [],
      official_prices: [{ id: 21, regulatory_emergency_id: 7, commodity_key: 'rice-1kg', price_type: 'APC', authoritative_price: 45.5, effective_from: '2026-07-26', effective_until: null, source_reference: 'PDRRMC-2026-07' }],
    }])

    render(<EmergencyPanel />)
    expect(await screen.findByText('rice-1kg')).toBeInTheDocument()
    expect(screen.getByText(/45\.50/)).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('shows historical SRP versions and opens the manual item creation modal', async () => {
    vi.mocked(adminApi.getSrp).mockResolvedValue([
      { id: 2, commodity_name: 'Rice', unit: '1kg', baseline_price: 48, effective_date: '2026-08-01', source_reference: 'DTI-08' },
      { id: 1, commodity_name: 'Rice', unit: '1kg', baseline_price: 46, effective_date: '2026-05-01', source_reference: 'DTI-05' },
    ])
    const user = userEvent.setup()
    render(<SrpManagementPanel />)

    expect(await screen.findByText('2026-08-01')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add SRP Item' }))

    expect(screen.getByRole('dialog', { name: 'Add SRP bulletin item' })).toBeInTheDocument()
    expect(screen.getByLabelText('Commodity Name')).toBeInTheDocument()
  })
})
