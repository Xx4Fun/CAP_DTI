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
})
