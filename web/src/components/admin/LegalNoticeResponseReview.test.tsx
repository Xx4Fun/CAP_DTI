import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { LegalNoticeManager } from './LegalNoticeManager'
import type { LegalNoticeRecord } from '../../types/admin'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getLegalNotices: vi.fn(),
    getLegalNotice: vi.fn(),
    downloadLegalAttachment: vi.fn(),
    getLegalDocument: vi.fn(),
    closeLegalNotice: vi.fn(),
    escalateLegalNotice: vi.fn(),
    updateLegalNotice: vi.fn(),
    previewLegalNotice: vi.fn(),
    issueLegalNotice: vi.fn(),
    recordOfflineResponse: vi.fn(),
    recordLegalDelivery: vi.fn(),
    getMonitoringRecord: vi.fn(),
  },
}))

// The list endpoint omits policy, readiness, and attachments; only the detail endpoint returns them.
const listRecord = {
  id: 1, monitoring_record_id: 1, notice_type: 'LOI', status: 'response_received', control_number: 'PM-2026-LOI-000001',
  delivery_state: 'received', due_date_timestamp: '2026-09-17T02:47:02Z', issued_at: '2026-09-14T01:47:02Z', updated_at: '2026-09-14T02:51:50Z',
  source_snapshot: { items: [] }, draft_payload: {}, store: { id: 1, store_name: 'Robinsons Supermarket Corp.', address: 'San Angel' },
  response_received_at: '2026-09-14T02:51:50Z',
} as unknown as LegalNoticeRecord

const detailRecord: LegalNoticeRecord = {
  ...listRecord,
  response_text: 'Inter-island freight from Iloilo increased our landed cost for rice this week.',
  response_reason_category: 'FREIGHT_SURCHARGE',
  response_certified_at: '2026-09-14T02:51:50Z',
  attachments: [{ id: 5, kind: 'vendor_response', category: 'FREIGHT_BILL', original_name: 'freight-bill.pdf', mime_type: 'application/pdf', size_bytes: 34, sha256: 'a'.repeat(64) }],
  readiness: {},
  policy: { status: 'LEGAL_POLICY_UNAVAILABLE', policy_version: null },
}

describe('Legal Actions vendor response review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=legal_actions')
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [listRecord], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(detailRecord)
  })

  it('opens an issued notice from the list without crashing and shows the vendor response with its attachment', async () => {
    vi.mocked(adminApi.downloadLegalAttachment).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    URL.createObjectURL = vi.fn(() => 'blob:attachment')
    URL.revokeObjectURL = vi.fn()
    const popup = { location: { href: '' }, opener: {}, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: /Issued & Responses/ }))
    await user.click(await screen.findByRole('button', { name: 'Review' }))

    const response = await screen.findByRole('region', { name: 'Vendor response' })
    expect(adminApi.getLegalNotice).toHaveBeenCalledWith(1)
    expect(within(response).getByText('Logistics or inter-island freight surcharge')).toBeInTheDocument()
    expect(within(response).getByText(/Inter-island freight from Iloilo/)).toBeInTheDocument()

    await user.click(within(response).getByRole('button', { name: /freight-bill\.pdf/ }))
    // The window opens synchronously in the click, before the download resolves.
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(adminApi.downloadLegalAttachment).toHaveBeenCalledWith(1, 5)
    await vi.waitFor(() => expect(popup.location.href).toBe('blob:attachment'))
    expect(popup.opener).toBeNull()
  })

  it('tells the evaluator when the browser blocks the attachment window', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: /Issued & Responses/ }))
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    const response = await screen.findByRole('region', { name: 'Vendor response' })
    await user.click(within(response).getByRole('button', { name: /freight-bill\.pdf/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Allow pop-ups for this site to open vendor attachments.')
    expect(adminApi.downloadLegalAttachment).not.toHaveBeenCalled()
  })

  it('ignores a slower detail response for a notice that is no longer selected', async () => {
    const second = { ...listRecord, id: 2, control_number: 'PM-2026-LOI-000002' } as LegalNoticeRecord
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [listRecord, second], current_page: 1, last_page: 1, per_page: 20, total: 2, from: 1, to: 2 })
    let resolveFirst: (value: LegalNoticeRecord) => void = () => {}
    vi.mocked(adminApi.getLegalNotice).mockImplementation((id: number) => id === 1
      ? new Promise<LegalNoticeRecord>((resolve) => { resolveFirst = resolve })
      : Promise.resolve({ ...detailRecord, id: 2, control_number: 'PM-2026-LOI-000002' }))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: /Issued & Responses/ }))
    const [reviewFirst, reviewSecond] = await screen.findAllByRole('button', { name: 'Review' })
    await user.click(reviewFirst)
    await user.click(reviewSecond)
    expect(await screen.findByRole('heading', { name: 'PM-2026-LOI-000002' })).toBeInTheDocument()

    resolveFirst({ ...detailRecord })
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(screen.getByRole('heading', { name: 'PM-2026-LOI-000002' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'PM-2026-LOI-000001' })).not.toBeInTheDocument()
  })

  it('escalates an answered LOI into an SCO draft and shows it for preparation', async () => {
    vi.mocked(adminApi.getLegalNotice).mockResolvedValueOnce({ ...detailRecord, can_escalate: true }).mockResolvedValue({ ...detailRecord, status: 'closed', can_escalate: false })
    const sco = { ...detailRecord, id: 2, notice_type: 'SCO', status: 'draft', control_number: null, preceding_notice_id: 1, attachments: [],
      policy: { status: 'LEGAL_POLICY_AVAILABLE', policy_version: 'v', reasons: ['Prices above SRP'], legal_bases: ['RA 7581 (Price Act)', 'DAO No. 6, s. 2007'] },
      draft_payload: { legal_bases: [] } } as unknown as LegalNoticeRecord
    vi.mocked(adminApi.escalateLegalNotice).mockResolvedValue(sco)
    vi.mocked(adminApi.updateLegalNotice).mockResolvedValue(sco)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: /Issued & Responses/ }))
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Escalate to SCO' }))

    expect(adminApi.escalateLegalNotice).toHaveBeenCalledWith(1)
    expect(await screen.findByRole('heading', { name: 'Prepare Notice' })).toBeInTheDocument()
    // Legal bases are exact permitted values, including ones that contain commas.
    await user.click(screen.getByRole('checkbox', { name: 'DAO No. 6, s. 2007' }))
    await user.selectOptions(screen.getByLabelText('Reason for issuance'), 'Prices above SRP')
    await user.click(screen.getByRole('button', { name: /Save Draft/ }))
    expect(adminApi.updateLegalNotice).toHaveBeenCalledWith(2, expect.objectContaining({ legal_bases: ['DAO No. 6, s. 2007'], reason: 'Prices above SRP' }))
  })

  it('reports a failed close instead of failing silently', async () => {
    vi.mocked(adminApi.closeLegalNotice).mockRejectedValue({ response: { data: { message: 'Close is not allowed now.' } } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: /Issued & Responses/ }))
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Close notice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Close is not allowed now.')
  })

  it('blocks preview and issue while the draft has unsaved edits', async () => {
    const draft = { ...detailRecord, status: 'draft', control_number: null, readiness: { a: true }, attachments: [],
      policy: { status: 'LEGAL_POLICY_AVAILABLE', policy_version: 'v', reasons: ['Prices above SRP'], legal_bases: ['RA 7581 (Price Act)'] },
      draft_payload: { reason: 'Prices above SRP', legal_bases: ['RA 7581 (Price Act)'] } } as unknown as LegalNoticeRecord
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [draft], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.updateLegalNotice).mockImplementation(async (_id, payload) => ({ ...draft, draft_payload: { ...draft.draft_payload, ...(payload as object) } }))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    const issue = screen.getByRole('button', { name: /Issue Notice/ })
    expect(issue).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: 'RA 7581 (Price Act)' }))
    expect(issue).toBeDisabled()
    expect(screen.getByRole('button', { name: /Open Official Preview/ })).toBeDisabled()
    expect(screen.getByText(/Save the draft first/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Save Draft/ }))
    await vi.waitFor(() => expect(issue).toBeEnabled())
  })

  it('records an emailed response with its actual receipt time', async () => {
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue({ ...detailRecord, status: 'issued', delivery_state: 'received', response_received_at: null, response_text: null })
    vi.mocked(adminApi.recordOfflineResponse).mockResolvedValue({ ...detailRecord, status: 'response_received' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: /Issued & Responses/ }))
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    const section = await screen.findByRole('region', { name: 'Record an emailed or paper response' })
    const record = within(section).getByRole('button', { name: 'Record response' })
    expect(record).toBeDisabled()
    await user.type(within(section).getByLabelText('Received at'), '2026-09-15T09:30')
    await user.type(within(section).getByLabelText('Response summary'), 'Emailed reply citing a supplier price increase.')
    expect(record).toBeDisabled()
    const evidence = new File(['%PDF'], 'reply.pdf', { type: 'application/pdf' })
    await user.upload(within(section).getByLabelText(/Received email or scan/), evidence)
    await user.click(record)
    expect(adminApi.recordOfflineResponse).toHaveBeenCalledWith(1, expect.objectContaining({ channel: 'email', response_text: 'Emailed reply citing a supplier price increase.', received_at: new Date('2026-09-15T09:30').toISOString(), evidence }))
  })

  it('stamps the e-signature only when the evaluator ticks it at issue', async () => {
    const draft = { ...detailRecord, status: 'draft', control_number: null, readiness: { a: true }, attachments: [],
      policy: { status: 'LEGAL_POLICY_AVAILABLE', policy_version: 'v', reasons: ['Prices above SRP'], legal_bases: [] },
      signatory: { name: 'Atty. Ana Reyes', office: 'Provincial Director, DTI Antique', has_signature: true },
      draft_payload: { reason: 'Prices above SRP', legal_bases: [] } } as unknown as LegalNoticeRecord
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [draft], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.issueLegalNotice).mockResolvedValue({ ...draft, status: 'issued' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Atty. Ana Reyes')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Apply this official.s e-signature/ }))
    await user.click(screen.getByRole('button', { name: /Issue Notice/ }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('e-signature of Atty. Ana Reyes'))
    expect(adminApi.issueLegalNotice).toHaveBeenCalledWith(1, true)
  })
})
