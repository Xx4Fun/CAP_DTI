import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import { LegalNoticeManager } from './LegalNoticeManager'
import type { LegalNoticeRecord } from '../../types/admin'

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    getLegalNotices: vi.fn(),
    getLegalNotice: vi.fn(),
    updateLegalNotice: vi.fn(),
    closeLegalNotice: vi.fn(),
    escalateLegalNotice: vi.fn(),
    getMonitoringRecord: vi.fn(),
    getMonitoringRecords: vi.fn(),
  },
}))

const policy = {
  status: 'LEGAL_POLICY_AVAILABLE', policy_version: 'v', reasons: ['Prices above SRP', 'Prices above price ceiling'], required_fields: ['recipient_name', 'address', 'reason'],
  legal_bases: ['RA 7581 (Price Act)', 'RA 7394 (Consumer Act)', 'DAO No. 6, s. 2007', 'DO No. 18-122'],
  derived: { reason: 'Prices above SRP', legal_bases: ['RA 7581 (Price Act)'] },
  basis_groups: { 'RA 7581 (Price Act)': 'applicable_law', 'DAO No. 6, s. 2007': 'penalty_procedure', 'DO No. 18-122': 'penalty_procedure', 'RA 7394 (Consumer Act)': 'other_law' },
}
const items = [{ id: 9, commodity_name: 'Rice', observed_price: 62, reference_value: 50, reference_type: 'standard_srp', reference_label: 'Captured SRP' }]

/** A draft as the list returns it (no policy), and as the detail endpoint returns it. */
const serveDraft = (payload: LegalNoticeRecord['draft_payload']) => {
  const row = { id: 3, monitoring_record_id: 14, notice_type: 'LOI', status: 'draft', delivery_state: 'not_recorded', updated_at: '2026-10-07T00:00:00Z', source_snapshot: { items }, draft_payload: payload } as unknown as LegalNoticeRecord
  const detail = { ...row, readiness: {}, attachments: [], policy } as unknown as LegalNoticeRecord
  vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [row], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
  vi.mocked(adminApi.getLegalNotice).mockResolvedValue(detail)
  vi.mocked(adminApi.updateLegalNotice).mockImplementation(async (_id, changes) => ({ ...detail, draft_payload: { ...payload, ...changes } }) as LegalNoticeRecord)
}

const issued = (id: number) => ({
  id, monitoring_record_id: id, notice_type: 'LOI', status: 'response_received', control_number: `PM-2026-LOI-00000${id}`, delivery_state: 'received',
  updated_at: '2026-09-14T02:51:50Z', issued_at: '2026-09-14T01:47:02Z', source_snapshot: { items }, draft_payload: { reason: 'Prices above SRP', legal_bases: ['RA 7581 (Price Act)'] },
  store: { id: 1, store_name: 'Robinsons Supermarket Corp.', address: 'San Angel' }, response_received_at: '2026-09-14T02:51:50Z',
}) as unknown as LegalNoticeRecord
const issuedDetail = (id: number) => ({ ...issued(id), response_text: `Full response for notice ${id}.`, readiness: {}, attachments: [], policy }) as unknown as LegalNoticeRecord

/** Two pages of issued notices: notice 1 on page 1, notice 2 on page 2. */
const serveTwoPages = () => vi.mocked(adminApi.getLegalNotices).mockImplementation(async ({ page = 1 } = {}) => (
  { data: [issued(page)], current_page: page, last_page: 2, per_page: 20, total: 21, from: 1, to: 1 }))
const onList = () => screen.findByRole('button', { name: 'Open' })
const backButton = () => screen.findByRole('button', { name: 'Back to Issued & Responses' })

describe('Legal Actions: reason and legal basis from the evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=legal_actions&view=queue')
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [], current_page: 1, last_page: 1, per_page: 10, total: 0 } as never)
  })

  it('shows the reason as determined from the evidence and groups the legal bases, with the suggested one ticked', async () => {
    serveDraft({ reason: 'Prices above SRP', legal_bases: ['RA 7581 (Price Act)'] })
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await screen.findByRole('button', { name: 'Continue draft' }))

    const reason = await screen.findByRole('group', { name: 'Reason for issuance' })
    expect(reason).toHaveTextContent('Prices above SRP')
    expect(reason).toHaveTextContent('Determined from evidence')
    expect(screen.queryByRole('combobox', { name: 'Reason for issuance' })).not.toBeInTheDocument()

    const applicable = within(screen.getByRole('group', { name: 'Applicable law' })).getByRole('checkbox', { name: /RA 7581 \(Price Act\)/ })
    expect(applicable).toBeChecked()
    const procedure = within(screen.getByRole('group', { name: 'Penalty and procedure' })).getAllByRole('checkbox')
    expect(procedure).toHaveLength(2)
    procedure.forEach((box) => expect(box).not.toBeChecked())
    expect(within(screen.getByRole('group', { name: 'Other law' })).getByRole('checkbox', { name: 'RA 7394 (Consumer Act)' })).not.toBeChecked()

    // The evaluator may change the suggestion, and can always get it back.
    expect(screen.queryByRole('button', { name: 'Reset to suggested' })).not.toBeInTheDocument()
    await user.click(applicable)
    await user.click(procedure[0])
    await user.click(screen.getByRole('button', { name: 'Reset to suggested' }))
    expect(applicable).toBeChecked()
    expect(procedure[0]).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Reset to suggested' })).not.toBeInTheDocument()

    // A draft whose saved reason already matches is not left unsaved: leaving asks nothing.
    await user.click(screen.getByRole('button', { name: /Needs Review/ }))
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument()
  })

  it.each([['another reason', 'Prices above price ceiling'], ['no reason', null]])('corrects a draft saved with %s through an ordinary save', async (_label, saved) => {
    serveDraft({ reason: saved, legal_bases: [] })
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await screen.findByRole('button', { name: 'Continue draft' }))

    const reason = await screen.findByRole('group', { name: 'Reason for issuance' })
    expect(reason).toHaveTextContent('Prices above SRP')
    expect(reason).toHaveTextContent('Corrected from the saved reason; save to record it.')
    // Saved legal bases are not changed on load.
    expect(within(screen.getByRole('group', { name: 'Applicable law' })).getByRole('checkbox')).not.toBeChecked()

    // The correction is unsaved until the evaluator saves it.
    await user.click(screen.getByRole('button', { name: /Needs Review/ }))
    await user.click(within(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: /Save Draft/ }))
    expect(adminApi.updateLegalNotice).toHaveBeenCalledWith(3, expect.objectContaining({ reason: 'Prices above SRP', legal_bases: [] }))
    await vi.waitFor(() => expect(reason).not.toHaveTextContent('Corrected from the saved reason'))
  })
})

describe('Legal Actions: an issued notice opens as its own page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=legal_actions&view=issued&status=response_received')
    serveTwoPages()
    vi.mocked(adminApi.getLegalNotice).mockImplementation(async (id: number) => issuedDetail(id))
  })

  it('replaces the list, and returns to the same page and filter by the back button and by browser Back', async () => {
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await onList()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await vi.waitFor(() => expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'response_received', page: 2 })))
    await screen.findByText('PM-2026-LOI-000002')

    for (const back of [async () => user.click(await backButton()), async () => act(() => window.history.back())]) {
      vi.mocked(adminApi.getLegalNotices).mockClear()
      await user.click(await onList())
      const page = await screen.findByRole('article')
      expect(within(page).getByRole('heading', { name: 'PM-2026-LOI-000002' })).toBeInTheDocument()
      expect(await within(page).findByText('Full response for notice 2.')).toBeInTheDocument()
      // The cited products are part of the page; the list and its controls are gone.
      expect(within(page).getByRole('table')).toHaveTextContent('Above SRP')
      expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Search notices')).not.toBeInTheDocument()
      expect(window.location.search).toContain('source_notice=2')
      // Nothing is fetched for the list while the page is open, least of all the draft queue.
      expect(adminApi.getLegalNotices).not.toHaveBeenCalled()

      await back()
      await onList()
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
      expect(window.location.search).not.toContain('source_notice')
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()
      expect(screen.getByLabelText('Status')).toHaveValue('response_received')
      expect(adminApi.getLegalNotices).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'response_received', page: 2 }))
      expect(vi.mocked(adminApi.getLegalNotices).mock.calls.every(([params]) => params?.status !== 'draft')).toBe(true)
    }
  })

  it('opens the notice named in the URL directly, loading it once', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_notice=2')
    render(<LegalNoticeManager />)

    expect(await screen.findByRole('heading', { name: 'PM-2026-LOI-000002' })).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveTextContent('Full response for notice 2.')
    expect(adminApi.getLegalNotice).toHaveBeenCalledTimes(1)
  })

  it('applies a slow detail response to the page that asked for it, and loads it once', async () => {
    let resolve: (value: LegalNoticeRecord) => void = () => {}
    vi.mocked(adminApi.getLegalNotice).mockImplementation(() => new Promise<LegalNoticeRecord>((done) => { resolve = done }))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await onList())

    // The list row shows at once; putting the notice in the URL does not start a second load.
    expect(await screen.findByRole('heading', { name: 'PM-2026-LOI-000001' })).toBeInTheDocument()
    expect(screen.queryByText('Full response for notice 1.')).not.toBeInTheDocument()
    await act(async () => { resolve(issuedDetail(1)) })
    expect(await screen.findByText('Full response for notice 1.')).toBeInTheDocument()
    expect(adminApi.getLegalNotice).toHaveBeenCalledTimes(1)
  })

  it('does not reopen a notice whose detail arrives after the evaluator went back', async () => {
    let resolve: (value: LegalNoticeRecord) => void = () => {}
    vi.mocked(adminApi.getLegalNotice).mockImplementation(() => new Promise<LegalNoticeRecord>((done) => { resolve = done }))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await onList())
    await user.click(await backButton())
    await onList()

    await act(async () => { resolve(issuedDetail(1)) })
    await new Promise((done) => setTimeout(done, 30))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })
})

const pause = () => new Promise((done) => setTimeout(done, 30))

describe('Legal Actions: the open notice, its URL and its visit stay in step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/?module=legal_actions&view=issued')
    serveTwoPages()
    vi.mocked(adminApi.getLegalNotice).mockImplementation(async (id: number) => issuedDetail(id))
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [], current_page: 1, last_page: 1, per_page: 10, total: 0 } as never)
  })

  it('does not reopen a notice that browser Forward was loading once Back is pressed first', async () => {
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await onList())
    await screen.findByText('Full response for notice 1.')
    await user.click(await backButton())
    await onList()

    let resolve: (value: LegalNoticeRecord) => void = () => {}
    vi.mocked(adminApi.getLegalNotice).mockImplementation(() => new Promise<LegalNoticeRecord>((done) => { resolve = done }))
    await act(async () => { window.history.forward(); await pause() })
    expect(window.location.search).toContain('source_notice=1')
    await act(async () => { window.history.back(); await pause() })
    await act(async () => { resolve(issuedDetail(1)); await pause() })

    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('keeps the list when a close finishes after the evaluator went back, and leaves no dialog behind', async () => {
    let resolve: (value: LegalNoticeRecord) => void = () => {}
    vi.mocked(adminApi.closeLegalNotice).mockImplementation(() => new Promise<LegalNoticeRecord>((done) => { resolve = done }))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await onList())
    await screen.findByText('Full response for notice 1.')
    await user.click(screen.getByRole('button', { name: 'Close notice' }))
    const dialog = screen.getByRole('dialog', { name: 'Close this notice' })
    await user.selectOptions(within(dialog).getByLabelText('Outcome'), 'no_violation')
    await user.type(within(dialog).getByLabelText('Reason shown to the vendor'), 'Reviewed the response.')
    await user.click(within(dialog).getByRole('button', { name: 'Close notice' }))
    expect(adminApi.closeLegalNotice).toHaveBeenCalledTimes(1)

    await act(async () => { window.history.back(); await pause() })
    await onList()
    await act(async () => { resolve({ ...issuedDetail(1), status: 'closed' } as LegalNoticeRecord); await pause() })
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The next notice opens clean: the close dialog does not come back with it.
    await user.click(await onList())
    await screen.findByRole('article')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names in the URL a notice opened from a waiting visit, and a draft only while it is open', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions')
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [{
      id: 14, finalized_at: '2026-09-01T00:00:00Z', store: { id: 1, store_name: 'Robinsons Supermarket Corp.', address: 'San Angel' }, officer: { id: 7, name: 'Ana' },
      undecided_item_ids: [3], open_notice: { id: 2, notice_type: 'LOI', status: 'issued', control_number: 'PM-2026-LOI-000002' },
    }], current_page: 1, last_page: 1, per_page: 10, total: 1 } as never)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await screen.findByRole('button', { name: 'Waiting on PM-2026-LOI-000002' }))
    expect(await screen.findByRole('heading', { name: 'PM-2026-LOI-000002' })).toBeInTheDocument()
    await vi.waitFor(() => expect(window.location.search).toContain('source_notice=2'))

    serveDraft({ reason: 'Prices above SRP', legal_bases: [] })
    await user.click(screen.getByRole('button', { name: /Action Queue/ }))
    expect(window.location.search).not.toContain('source_notice')
    await user.click(await screen.findByRole('button', { name: 'Continue draft' }))
    await vi.waitFor(() => expect(window.location.search).toContain('source_notice=3'))
    await user.click(screen.getByRole('button', { name: 'Back to drafts' }))
    expect(window.location.search).not.toContain('source_notice')
  })

  it('shows the visit and products of the draft that is open, not of the visit chosen before it', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue({
      id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', representative_name: 'Maria', protocol_mode: 'standard',
      officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
      items: [{ id: 1, srp_id: 3, recorded_price: 62, reference_status: 'available', reference_type: 'standard_srp', reference_value: 50, is_anomaly: true, bulletin: { id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 } }],
    } as never)
    const other = { id: 5, monitoring_record_id: 99, notice_type: 'LOI', status: 'draft', delivery_state: 'not_recorded', updated_at: '2026-10-07T00:00:00Z',
      source_snapshot: { store: { store_name: 'Belison Public Market', address: 'Belison' }, items: [{ id: 20, commodity_name: 'Sardines', observed_price: 30, reference_value: 20, reference_type: 'standard_srp' }] },
      draft_payload: { reason: 'Prices above SRP', legal_bases: [] }, readiness: {}, attachments: [], policy } as unknown as LegalNoticeRecord
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [other], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(other)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    expect(await screen.findByText('Antique Central Market')).toBeInTheDocument()
    expect(screen.getByText('Rice')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Action Queue/ }))
    await user.click(await screen.findByRole('button', { name: 'Continue draft' }))
    expect(await screen.findByText('Sardines')).toBeInTheDocument()
    expect(screen.getByText('Belison Public Market')).toBeInTheDocument()
    expect(screen.queryByText('Antique Central Market')).not.toBeInTheDocument()
    expect(screen.queryByText('Rice')).not.toBeInTheDocument()
  })

  it('opens a notice that cites no products and says so', async () => {
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue({ ...issuedDetail(1), source_snapshot: { items: [] }, draft_payload: {} } as unknown as LegalNoticeRecord)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await onList())

    expect(await screen.findByText('This notice records no cited products.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close notice' })).toBeInTheDocument()
  })
})

describe('Legal Actions: drafts, browser history and the visit named in the URL', () => {
  const visit14 = {
    id: 14, client_uuid: 'visit-14', status: 'accepted', finalized_at: '2026-08-24T08:00:00Z', representative_name: 'Maria', protocol_mode: 'standard',
    officer: { id: 7, name: 'Ana', email: 'ana@dti.gov.ph' }, store: { id: 2, store_name: 'Antique Central Market', address: 'San Jose' },
    items: ['Rice', 'Milk'].map((name, index) => ({ id: index + 1, srp_id: index + 3, recorded_price: 62, reference_status: 'available', reference_type: 'standard_srp', reference_value: 50, is_anomaly: true, bulletin: { id: index + 3, commodity_name: name, unit: 'kg', baseline_price: 50 } })),
  }
  const draftOf = (visit: number, store: string, products: string[]) => ({
    id: 5, monitoring_record_id: visit, notice_type: 'LOI', status: 'draft', delivery_state: 'not_recorded', updated_at: '2026-10-07T00:00:00Z',
    source_snapshot: { store: { store_name: store, address: 'Antique' }, items: products.map((name, index) => ({ id: index + 1, commodity_name: name, observed_price: 62, reference_value: 50, reference_type: 'standard_srp' })) },
    draft_payload: { reason: 'Prices above SRP', legal_bases: [] }, readiness: {}, attachments: [], policy,
  }) as unknown as LegalNoticeRecord
  const serveOneDraft = (draft: LegalNoticeRecord) => {
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [draft], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    vi.mocked(adminApi.getLegalNotice).mockResolvedValue(draft)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getMonitoringRecords).mockResolvedValue({ data: [], current_page: 1, last_page: 1, per_page: 10, total: 0 } as never)
    vi.mocked(adminApi.getMonitoringRecord).mockResolvedValue(visit14 as never)
  })

  it('closes the SCO editor on browser Back after an escalation, reopens it on Forward, and asks before dropping edits', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&view=issued')
    serveTwoPages()
    const sco = { ...draftOf(1, 'Robinsons Supermarket Corp.', ['Rice']), id: 2, notice_type: 'SCO', preceding_notice_id: 1 } as LegalNoticeRecord
    vi.mocked(adminApi.getLegalNotice).mockImplementation(async (id: number) => id === 2 ? sco : { ...issuedDetail(1), can_escalate: true } as LegalNoticeRecord)
    vi.mocked(adminApi.escalateLegalNotice).mockResolvedValue(sco)
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    await user.click(await onList())
    await user.click(await screen.findByRole('button', { name: 'Escalate to SCO' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Escalate to a Show Cause Order?' })).getByRole('button', { name: 'Escalate' }))
    expect(await screen.findByRole('heading', { name: 'Prepare Notice' })).toBeInTheDocument()
    await vi.waitFor(() => expect(window.location.search).toContain('source_notice=2'))

    await act(async () => { window.history.back(); await pause() })
    await onList()
    expect(screen.queryByRole('heading', { name: 'Prepare Notice' })).not.toBeInTheDocument()

    await act(async () => { window.history.forward(); await pause() })
    expect(await screen.findByRole('heading', { name: 'Prepare Notice' })).toBeInTheDocument()

    // With an unsaved edit, Back does not drop it: the editor stays and the evaluator is asked.
    await user.click(within(await screen.findByRole('group', { name: 'Applicable law' })).getByRole('checkbox'))
    await act(async () => { window.history.back(); await pause() })
    const dialog = screen.getByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(screen.getByRole('heading', { name: 'Prepare Notice' })).toBeInTheDocument()
    expect(window.location.search).toContain('source_notice=2')
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('heading', { name: 'Prepare Notice' })).not.toBeInTheDocument()
    expect(window.location.search).not.toContain('source_notice')
  })

  it.each([['the notice arrives first', true], ['the visit arrives first', false]])('reloads with a visit and a draft of another visit in the URL and shows the draft (%s)', async (_label, noticeFirst) => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14&source_notice=5')
    const draft = draftOf(99, 'Belison Public Market', ['Sardines'])
    let sendVisit: () => void = () => {}
    let sendNotice: () => void = () => {}
    vi.mocked(adminApi.getMonitoringRecord).mockImplementation(() => new Promise((done) => { sendVisit = () => done(visit14 as never) }))
    vi.mocked(adminApi.getLegalNotice).mockImplementation(() => new Promise<LegalNoticeRecord>((done) => { sendNotice = () => done(draft) }))
    vi.mocked(adminApi.getLegalNotices).mockResolvedValue({ data: [draft], current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 })
    render(<LegalNoticeManager />)
    await vi.waitFor(() => { expect(adminApi.getMonitoringRecord).toHaveBeenCalled(); expect(adminApi.getLegalNotice).toHaveBeenCalled() })

    for (const send of noticeFirst ? [() => sendNotice(), () => sendVisit()] : [() => sendVisit(), () => sendNotice()]) await act(async () => { send(); await pause() })

    expect(await screen.findByText('Belison Public Market')).toBeInTheDocument()
    expect(screen.getByText('Sardines')).toBeInTheDocument()
    expect(screen.queryByText('Antique Central Market')).not.toBeInTheDocument()
    expect(screen.queryByText('Rice')).not.toBeInTheDocument()
    // The other visit is no longer named, so the next reload cannot bring it back.
    expect(window.location.search).not.toContain('source_record')
    expect(window.location.search).toContain('source_notice=5')
  })

  it('lists as evidence only what a draft cites, even when its visit has more flagged products selected', async () => {
    window.history.replaceState({}, '', '/?module=legal_actions&source_record=14')
    serveOneDraft(draftOf(14, 'Antique Central Market', ['Rice']))
    const user = userEvent.setup()
    render(<LegalNoticeManager />)
    // Before a draft exists, both flagged products of the visit are selectable and selected.
    expect(await screen.findByText('Milk')).toBeInTheDocument()
    expect(within(document.getElementById('legal-section-4')!).getAllByRole('checkbox')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Action Queue/ }))
    await user.click(await screen.findByRole('button', { name: 'Continue draft' }))
    const evidence = document.getElementById('legal-section-4')!
    expect(await within(evidence).findByText('Rice')).toBeInTheDocument()
    expect(within(evidence).queryByText('Milk')).not.toBeInTheDocument()
    expect(within(evidence).queryByRole('checkbox')).not.toBeInTheDocument()
    // The same visit stays in the case reference.
    expect(screen.getByText('Antique Central Market')).toBeInTheDocument()
  })
})
