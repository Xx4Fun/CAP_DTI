import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import type { RegulatoryEmergencyRecord } from '../../types/admin'
import { EmergencyToggle } from './EmergencyToggle'

vi.mock('../../services/adminApi', () => ({ adminApi: {
  getEmergencies: vi.fn(), getEmergencySummaries: vi.fn(), getEmergency: vi.fn(), getSrp: vi.fn(),
  createEmergency: vi.fn(), prepareEmergency: vi.fn(), activateEmergency: vi.fn(), updateEmergency: vi.fn(),
} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const draft: RegulatoryEmergencyRecord = {
  id: 7, declaration_reference: 'DECL-7', location: 'San Jose de Buenavista, Antique',
  starts_on: '2026-09-09', ends_on: null, status: 'draft', effective_state: 'draft', preparation_hash: 'a'.repeat(64),
  source_week: { timezone: 'Asia/Manila', starts_at: '2026-08-30T16:00:00Z', ends_at: '2026-09-06T16:00:00Z' },
  candidates: [{ id: 3, commodity_key: 'rice', minimum_price: 40, maximum_price: 50, computed_apc_price: 45,
    observed_average_price: 44, observation_count: 1, establishment_count: 1,
    source_observations: [{ item_id: 4, monitoring_record_id: 12, store_name: 'Market A', finalized_at: '2026-09-01T01:00:00Z', recorded_price: 45 }] }],
  srp_fallbacks: [{ commodity_key: 'milk', commodity_name: 'Milk', unit: 'can', srp_id: 1, srp_price: 38 }],
  official_prices: [],
}
const summary = ({ candidates: _candidates, source_week: _week, srp_fallbacks: _fallbacks, ...rest }: RegulatoryEmergencyRecord) => rest
const refresh = () => act(() => { window.dispatchEvent(new Event('regulatory-data-changed')) })
const declaration = (id = 7) => screen.getByRole('button', { name: new RegExp(`DECL-${id}`) })
const review = () => screen.getByRole('checkbox', { name: /reviewed the source week/ })

describe('Emergency Protocol independent loading and refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([draft])
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(draft)
    vi.mocked(adminApi.getSrp).mockResolvedValue({ records: [], pagination: { current_page: 1, last_page: 1, per_page: 1000, total: 0, from: null, to: null }, capabilities: { can_publish: true, status: 'AVAILABLE' } })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('shows summaries before delayed details and does not load other declarations', async () => {
    const detail = deferred<RegulatoryEmergencyRecord>()
    const summaries = deferred<ReturnType<typeof summary>[]>()
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValue(summaries.promise)
    vi.mocked(adminApi.getEmergency).mockReturnValue(detail.promise)
    render(<EmergencyToggle />)
    expect(screen.getByText('Loading emergency records…')).toBeInTheDocument()
    await act(async () => summaries.resolve([summary(draft), summary({ ...draft, id: 8, declaration_reference: 'DECL-8' })]))
    expect(declaration()).toBeVisible()
    expect(screen.queryByText('Loading emergency records…')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(adminApi.getEmergency).toHaveBeenCalledTimes(1)
    expect(adminApi.getEmergency).toHaveBeenCalledWith(7)
    await act(async () => detail.resolve(draft))
    expect(review()).toBeInTheDocument()
    expect(adminApi.getEmergencies).not.toHaveBeenCalled()
  })

  it('keeps loaded declarations, expanded sources and review visible during background refresh', async () => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    await userEvent.setup().click(review())
    expect(review()).toBeChecked()
    const source = screen.getByText('Source records for Rice').closest('details')!
    source.open = true
    const pending = deferred<ReturnType<typeof summary>[]>()
    const detail = deferred<RegulatoryEmergencyRecord>()
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValue(pending.promise)
    vi.mocked(adminApi.getEmergency).mockReturnValue(detail.promise)
    refresh()
    expect(declaration()).toBeVisible()
    expect(source).toHaveAttribute('open')
    expect(review()).toBeChecked()
    expect(screen.queryByText('Loading emergency records…')).not.toBeInTheDocument()
    expect(screen.getAllByText('Refreshing…').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeDisabled()
    await act(async () => { pending.resolve([summary(draft)]); detail.resolve(draft) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeEnabled())
    expect(source).toHaveAttribute('open')
  })

  it('retains empty successful results during refresh and retries an initial failure', async () => {
    vi.mocked(adminApi.getEmergencySummaries).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    render(<EmergencyToggle />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load emergency declarations/i)
    expect(screen.queryByText('No emergency declarations recorded.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('No emergency declarations recorded.')
    const pending = deferred<ReturnType<typeof summary>[]>()
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValue(pending.promise)
    refresh()
    expect(screen.getByText('No emergency declarations recorded.')).toBeInTheDocument()
    expect(screen.queryByText('Loading emergency records…')).not.toBeInTheDocument()
    await act(async () => pending.resolve([]))
    expect(adminApi.getEmergency).not.toHaveBeenCalled()
  })

  it.each(['summary', 'detail'])('retains data but blocks activation after a %s refresh failure', async (kind) => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    await userEvent.setup().click(review())
    expect(review()).toBeChecked()
    if (kind === 'summary') vi.mocked(adminApi.getEmergencySummaries).mockRejectedValueOnce(new Error('offline'))
    else vi.mocked(adminApi.getEmergency).mockRejectedValueOnce(new Error('offline'))
    refresh()
    expect(await screen.findByRole('alert')).toHaveTextContent(/previously loaded|stale|last loaded/i)
    expect(declaration()).toBeVisible()
    expect(review()).toBeChecked()
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeDisabled()
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeEnabled()
  })

  it('coalesces bursts of triggers into one pending refresh', async () => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const pending = deferred<ReturnType<typeof summary>[]>()
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValueOnce(pending.promise)
    refresh(); refresh(); refresh()
    expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(2)
    await act(async () => pending.resolve([summary(draft)]))
    await waitFor(() => expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(3))
  })

  it('refreshes on the 60-second timer, focus, foreground and reconnect', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<EmergencyToggle />) })
    expect(review()).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(2)
    for (const [target, name] of [[window, 'focus'], [window, 'online'], [document, 'visibilitychange']] as const) {
      await act(async () => { target.dispatchEvent(new Event(name)) })
    }
    expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(5)
  })

  it('drops details for a previous selection and resets review even with an identical hash', async () => {
    const other = { ...draft, id: 8, declaration_reference: 'DECL-8', candidates: [] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft), summary(other)])
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    await userEvent.setup().click(review())
    const old = deferred<RegulatoryEmergencyRecord>()
    vi.mocked(adminApi.getEmergency).mockReturnValueOnce(old.promise).mockResolvedValueOnce(other)
    refresh()
    await waitFor(() => expect(adminApi.getEmergency).toHaveBeenCalledTimes(2))
    fireEvent.click(declaration(8))
    await waitFor(() => expect(review()).not.toBeChecked())
    await act(async () => old.resolve(draft))
    expect(declaration(8)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Monitoring sources for APC (1 products)')).not.toBeInTheDocument()
  })

  it('refreshes fallback prices even when the saved preparation hash is unchanged', async () => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    vi.mocked(adminApi.getEmergency).mockResolvedValueOnce({ ...draft, srp_fallbacks: [{ ...draft.srp_fallbacks![0], srp_price: 42 }] })
    refresh()
    expect(await screen.findByText('₱42.00')).toBeInTheDocument()
    expect(adminApi.getEmergency).toHaveBeenCalledTimes(2)
  })

  it('invalidates background reads when ending succeeds and retains historical references', async () => {
    const active: RegulatoryEmergencyRecord = { ...draft, status: 'active', effective_state: 'in_effect', official_prices: [{ id: 11, commodity_key: 'rice', price_type: 'APC', authoritative_price: 45, effective_from: '2026-09-09', source_reference: 'DECL-7' }] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(active)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(active)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const write = deferred<RegulatoryEmergencyRecord>()
    vi.mocked(adminApi.updateEmergency).mockReturnValue(write.promise)
    render(<EmergencyToggle />)
    fireEvent.click(await screen.findByRole('button', { name: 'End Price Freeze' }))
    const oldSummary = deferred<ReturnType<typeof summary>[]>()
    const oldDetail = deferred<RegulatoryEmergencyRecord>()
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValueOnce(oldSummary.promise)
    vi.mocked(adminApi.getEmergency).mockReturnValueOnce(oldDetail.promise)
    refresh()
    await act(async () => write.resolve({ ...active, status: 'ended', effective_state: 'ended', ended_at: '2026-10-09T01:00:00Z' }))
    await act(async () => { oldSummary.resolve([summary(active)]); oldDetail.resolve(active) })
    expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
    expect(screen.getByText(/Manually ended at/)).toBeInTheDocument()
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.getByText('Official APC / Price Freeze References')).toBeInTheDocument()
  })

  it('does not verify an incomplete list from a create response and reloads all declarations', async () => {
    const initial = deferred<ReturnType<typeof summary>[]>()
    const fresh = deferred<ReturnType<typeof summary>[]>()
    const active: RegulatoryEmergencyRecord = { ...draft, id: 8, declaration_reference: 'DECL-8', status: 'active', effective_state: 'in_effect' }
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValueOnce(initial.promise).mockReturnValueOnce(fresh.promise)
    vi.mocked(adminApi.createEmergency).mockResolvedValue(draft)
    render(<EmergencyToggle />)
    fireEvent.change(screen.getByLabelText('Declaration reference'), { target: { value: 'DECL-7' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-09' } })
    fireEvent.submit(screen.getByLabelText('Declaration reference').closest('form')!)
    await screen.findByRole('heading', { name: 'APC Preparation' })
    expect(screen.getByText('Emergency status unavailable')).toBeInTheDocument()
    expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(2)
    await act(async () => fresh.resolve([summary(draft), summary(active)]))
    expect(declaration(8)).toBeVisible()
    expect(screen.getByText('State of Calamity')).toBeInTheDocument()
    await act(async () => initial.resolve([]))
    expect(declaration(8)).toBeVisible()
  })

  it('keeps full-list verification pending when a preparation write follows a failed summary', async () => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    vi.mocked(adminApi.getEmergencySummaries).mockRejectedValueOnce(new Error('offline'))
    refresh()
    await screen.findByRole('alert')
    const fresh = deferred<ReturnType<typeof summary>[]>()
    vi.mocked(adminApi.getEmergencySummaries).mockReturnValueOnce(fresh.promise)
    vi.mocked(adminApi.prepareEmergency).mockResolvedValue(draft)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh preparation' }))
    await waitFor(() => expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('alert')).toHaveTextContent(/previously loaded/i)
    expect(screen.getByText('Emergency status unavailable')).toBeInTheDocument()
    await act(async () => fresh.resolve([summary(draft)]))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('uses a newer ended detail response to reconcile status and official prices', async () => {
    const active: RegulatoryEmergencyRecord = { ...draft, status: 'active', effective_state: 'in_effect' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(active)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue({ ...active, status: 'ended', effective_state: 'ended', ended_at: '2026-10-09T01:00:00Z', official_prices: [{ id: 11, commodity_key: 'rice', price_type: 'APC', authoritative_price: 45, effective_from: '2026-09-09', source_reference: 'DECL-7' }] })
    render(<EmergencyToggle />)
    await screen.findByText(/Manually ended at/)
    expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.getByText('1 Reference')).toBeInTheDocument()
  })

  it.each(['resolve', 'reject'])('drops a detail %s superseded by a newer summary refresh', async (outcome) => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const old = deferred<RegulatoryEmergencyRecord>()
    vi.mocked(adminApi.getEmergency).mockReturnValueOnce(old.promise)
    refresh()
    await waitFor(() => expect(adminApi.getEmergency).toHaveBeenCalledTimes(2))
    const changed = { ...draft, preparation_hash: 'b'.repeat(64) }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(changed)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(changed)
    refresh()
    await waitFor(() => expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(3))
    await act(async () => { if (outcome === 'resolve') old.resolve(draft); else old.reject(new Error('obsolete failure')) })
    await waitFor(() => expect(adminApi.getEmergency).toHaveBeenCalledTimes(3))
    await userEvent.setup().click(review())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeEnabled())
  })

  it('resets confirmation when refreshed preparation changes', async () => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    await userEvent.setup().click(review())
    expect(review()).toBeChecked()
    const changed = { ...draft, preparation_hash: 'b'.repeat(64) }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(changed)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(changed)
    refresh()
    await waitFor(() => expect(review()).not.toBeChecked())
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeDisabled()
  })

  it('keeps references from all declarations and clamps both pages after results shrink', async () => {
    const prices = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, commodity_key: `product-${i}`, price_type: 'APC', authoritative_price: 45, effective_from: '2026-09-09', source_reference: 'DECL-7' }))
    const many = { ...draft, candidates: Array.from({ length: 9 }, (_, i) => ({ ...draft.candidates[0], id: i + 1, commodity_key: `product-${i}` })), official_prices: prices }
    const historical = { ...draft, id: 8, declaration_reference: 'DECL-8', status: 'ended' as const, effective_state: 'ended', official_prices: [{ ...prices[0], id: 100, commodity_key: 'historic-product' }] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(many), summary(historical)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(many)
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    expect(screen.getByText('12 References')).toBeInTheDocument()
    const candidates = screen.getByRole('navigation', { name: 'APC candidates pagination' })
    const references = screen.getByRole('navigation', { name: 'Official APC references pagination' })
    fireEvent.click(within(candidates).getByRole('button', { name: 'Next page' }))
    fireEvent.click(within(references).getByRole('button', { name: 'Next references page' }))
    expect(candidates).toHaveTextContent('Page 2 of 2')
    expect(references).toHaveTextContent('Page 2 of 2')
    expect(screen.getByText('historic-product')).toBeInTheDocument()
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft), summary(historical)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(draft)
    refresh()
    await waitFor(() => expect(candidates).toHaveTextContent('Page 1 of 1'))
    expect(references).toHaveTextContent('Page 1 of 1')
    expect(screen.getByText('1 Reference')).toBeInTheDocument()
  })

  it('selects the next draft when the selected declaration disappears, then handles an empty list', async () => {
    const other = { ...draft, id: 8, declaration_reference: 'DECL-8' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft), summary(other)])
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(other)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(other)
    refresh()
    await waitFor(() => expect(declaration(8)).toHaveAttribute('aria-pressed', 'true'))
    expect(adminApi.getEmergency).toHaveBeenLastCalledWith(8)
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([])
    refresh()
    await screen.findByText('No emergency declarations recorded.')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('blocks ending when summaries cannot verify the current protocol', async () => {
    const active: RegulatoryEmergencyRecord = { ...draft, status: 'active', effective_state: 'in_effect' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(active)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(active)
    render(<EmergencyToggle />)
    const end = await screen.findByRole('button', { name: 'End Price Freeze' })
    expect(end).toBeEnabled()
    vi.mocked(adminApi.getEmergencySummaries).mockRejectedValue(new Error('offline'))
    refresh()
    await screen.findByRole('alert')
    expect(end).toBeDisabled()
    expect(screen.getByText('Emergency status unavailable')).toBeInTheDocument()
  })
})
