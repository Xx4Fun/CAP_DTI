import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { EmergencyToggle } from './EmergencyToggle'
import { LegalNoticeManager } from './LegalNoticeManager'
import { AdminToastHost } from './AdminToastHost'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getLegalNotices: vi.fn(),
    createLegalNotice: vi.fn(),
    updateLegalNotice: vi.fn(),
    previewLegalNotice: vi.fn(),
    issueLegalNotice: vi.fn(),
    getMonitoringRecord: vi.fn(),
    dispatchLegal: vi.fn(),
    getEmergencies: vi.fn(),
    createEmergency: vi.fn(),
    createEmergencyPrice: vi.fn(),
    updateEmergency: vi.fn(),
  },
}))

describe('Legal Notice Engine & Emergency Protocol Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [], current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null })
    window.history.replaceState({}, '', '/?module=legal_actions')
  })

  it('opens the queue by default and deep links to read-only captured evidence', async () => {
    const first = render(<LegalNoticeManager />)
    expect(await screen.findByRole('heading', { name: 'Action Queue' })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(adminApi.createLegalNotice).toHaveBeenCalledWith({ monitoring_record_id: 14, notice_type: 'LOI', item_ids: [9] })
    await user.type(screen.getByLabelText('Internal justification'), 'Evaluator notes')
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Draft' }))
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Create draft' }))
    expect(screen.getByRole('button', { name: 'Issue Notice' })).toBeDisabled()
    expect(screen.getByText('LEGAL_POLICY_UNAVAILABLE')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Official Preview' }))
    expect(await screen.findByTitle('Watermarked legal draft preview')).toHaveAttribute('sandbox', '')
    expect(adminApi.issueLegalNotice).not.toHaveBeenCalled()
    expect(adminApi.previewLegalNotice).toHaveBeenCalledWith(4)
  })

  it('renders only API-backed emergency records and exposes no simulated SCO action', async () => {
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([{
      id: 7,
      location: 'San Jose, Antique',
      declaration_reference: 'PDRRMC-2026-07',
      starts_on: '2026-07-26',
      ends_on: null,
      status: 'active',
    }])

    render(<><EmergencyToggle /><AdminToastHost /></>)

    expect(await screen.findByText('State of Calamity Regulatory Command Bar')).toBeInTheDocument()
    expect(screen.getAllByText('PDRRMC-2026-07').length).toBeGreaterThan(0)
    expect(screen.getByText('Authoritative APC Ceiling & Price Freeze Lookup Table')).toBeInTheDocument()
    expect(screen.queryByText('rice-well-milled-1kg')).not.toBeInTheDocument()
    expect(screen.getByText(/No authoritative emergency price records are available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SCO.*Sweep/i })).not.toBeInTheDocument()
  })

  it('shows an unavailable state when emergency declarations cannot be loaded', async () => {
    vi.mocked(adminApi.getEmergencies).mockRejectedValue(new Error('offline'))

    render(<EmergencyToggle />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load emergency declarations/i)
    expect(screen.queryByText(/NORMAL MARKET PROTOCOL/i)).not.toBeInTheDocument()
  })

  it('keeps a failed declaration visible as an error and does not claim success', async () => {
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([])
    vi.mocked(adminApi.createEmergency).mockRejectedValue({ response: { data: { message: 'Audit storage unavailable.' } } })
    const user = userEvent.setup()

    render(<><EmergencyToggle /><AdminToastHost /></>)
    await screen.findByText('No emergency declarations recorded.')
    await user.type(screen.getByLabelText('Location'), 'Antique')
    await user.type(screen.getByLabelText('Declaration reference'), 'DECL-7')
    await user.type(screen.getByLabelText('Start date'), '2026-08-29')
    await user.click(screen.getByRole('checkbox', { name: /I confirm this declaration/i }))
    await user.click(screen.getByRole('button', { name: 'Record declaration' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Audit storage unavailable.')
    expect(screen.queryByText('Emergency declaration recorded.')).not.toBeInTheDocument()
    expect(adminApi.getEmergencies).toHaveBeenCalledTimes(1)
  })
})
