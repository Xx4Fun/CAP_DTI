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
const pricing = () => screen.getByRole('region', { name: 'Price Freeze Prices' })
const official = (commodity_key = 'rice', price_type = 'APC', authoritative_price = 45) => ({
  id: 11, commodity_key, price_type, authoritative_price, effective_from: '2026-09-09', source_reference: 'DECL-7',
})

describe('Emergency Protocol independent loading and refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(adminApi.getEmergencies).mockResolvedValue([draft])
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(draft)
    vi.mocked(adminApi.getSrp).mockResolvedValue({ records: [], pagination: { current_page: 1, last_page: 1, per_page: 1000, total: 0, from: null, to: null }, capabilities: { can_publish: true, status: 'AVAILABLE' } })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('shows APC and SRP-held draft prices together and keeps calculations in expandable evidence', async () => {
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const panel = within(pricing())
    expect(panel.getByRole('heading', { name: 'Proposed price ceilings' })).toBeInTheDocument()
    expect(panel.getByText('2 Products')).toBeInTheDocument()
    const table = panel.getByRole('table')
    const columns = ['Product', 'Proposed ceiling', 'Price basis', 'Monitoring coverage']
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(columns)
    expect(within(table).getAllByRole('row')[1].querySelectorAll('td')).toHaveLength(4)
    expect(Array.from(within(table).getAllByRole('row')[1].querySelectorAll('td')).map((cell) => cell.getAttribute('data-label'))).toEqual(columns)
    expect(within(table).getByText('Rice')).toBeInTheDocument()
    expect(within(table).getByText('Milk')).toBeInTheDocument()
    expect(within(table).getByText('Calculated APC')).toBeInTheDocument()
    expect(within(table).getByText('SRP held as ceiling')).toBeInTheDocument()
    expect(within(table).queryByText('₱44.00')).not.toBeInTheDocument()
    fireEvent.click(panel.getByText('Source records for Rice'))
    expect(panel.getByText('Observed average').closest('div')).toHaveTextContent('₱44.00')
    expect(panel.getByText('(min + max) ÷ 2')).toBeVisible()
    expect(panel.getByText('Market A')).toBeVisible()
    expect(screen.queryByText('Official APC / Price Freeze References')).not.toBeInTheDocument()
  })

  it.each(['apc', 'srp', 'missing'] as const)('filters the combined draft table correctly for %s rows', async (kind) => {
    const record = { ...draft, candidates: [...draft.candidates, { ...draft.candidates[0], id: 4, commodity_key: 'salt', observation_count: 0, source_observations: [] }] }
    vi.mocked(adminApi.getEmergency).mockResolvedValue(record)
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const panel = within(pricing())
    fireEvent.click(panel.getByRole('button', { name: { apc: 'Calculated APC (1)', srp: 'SRP held (1)', missing: 'Needs observations (1)' }[kind] }))
    const table = within(panel.getByRole('table'))
    expect(table.getAllByRole('row')).toHaveLength(2)
    expect(table.getByText({ apc: 'Rice', srp: 'Milk', missing: 'Salt' }[kind])).toBeInTheDocument()
    if (kind === 'missing') expect(table.getByText('Unavailable')).toBeInTheDocument()
    fireEvent.change(panel.getByRole('textbox', { name: 'Search prices' }), { target: { value: 'none' } })
    expect(panel.getByRole('button', { name: 'All (3)' })).toBeInTheDocument()
    expect(table.getByText('No products match your search or filter.')).toBeInTheDocument()
  })

  it.each(['apc', 'srp'] as const)('supports an %s-only draft and preserves activation eligibility', async (kind) => {
    const record = { ...draft, candidates: kind === 'apc' ? draft.candidates : [], srp_fallbacks: kind === 'srp' ? draft.srp_fallbacks : [] }
    vi.mocked(adminApi.getEmergency).mockResolvedValue(record)
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    expect(within(pricing()).getByText('1 Product')).toBeInTheDocument()
    await userEvent.setup().click(review())
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeEnabled()
  })

  it.each([
    ['scheduled', 'active', 'Confirmed price ceilings — scheduled'],
    ['in_effect', 'active', 'Confirmed price ceilings'],
    ['in_effect', 'ended', 'Confirmed price ceilings'],
    ['ended', 'ended', 'Historical price ceilings'],
    ['expired', 'active', 'Historical price ceilings'],
    ['cancelled', 'cancelled', 'Cancelled declaration'],
    ['unrecognized', 'active', 'Status unavailable'],
  ] as const)('labels %s/%s using applicability and displays saved ceilings', async (effective_state, status, heading) => {
    const record = { ...draft, effective_state, status, official_prices: [official('milk', 'SRP', 30), { ...official('salt', 'LEGACY_TYPE', 25), id: 12 }] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(record)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(record)
    render(<EmergencyToggle />)
    await screen.findByRole('region', { name: 'Price Freeze Prices' })
    const panel = within(pricing())
    expect(panel.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(panel.getByText('₱30.00')).toBeInTheDocument()
    expect(panel.queryByText('₱38.00')).not.toBeInTheDocument()
    expect(panel.getByText('SRP held as ceiling')).toBeInTheDocument()
    expect(panel.getByText('LEGACY_TYPE')).toBeInTheDocument()
    expect(panel.queryByRole('checkbox')).not.toBeInTheDocument()
    if (effective_state === 'in_effect') expect(await screen.findByRole('button', { name: 'End Price Freeze' })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
  })

  it('shows only the selected declaration saved prices while another detail is delayed', async () => {
    const active = { ...draft, status: 'active' as const, effective_state: 'in_effect', official_prices: [official()] }
    const historical = { ...draft, id: 8, declaration_reference: 'DECL-8', status: 'ended' as const, effective_state: 'ended', official_prices: [official('milk', 'SRP', 30)] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(active), summary(historical)])
    vi.mocked(adminApi.getEmergency).mockResolvedValueOnce(active).mockReturnValueOnce(deferred<RegulatoryEmergencyRecord>().promise)
    render(<EmergencyToggle />)
    await screen.findByRole('button', { name: 'End Price Freeze' })
    expect(within(pricing()).getByText('Rice')).toBeInTheDocument()
    expect(within(pricing()).queryByText('Milk')).not.toBeInTheDocument()
    fireEvent.click(declaration(8))
    expect(within(pricing()).getByText('Milk')).toBeInTheDocument()
    expect(within(pricing()).queryByText('Rice')).not.toBeInTheDocument()
    expect(within(pricing()).getByText('1 Product')).toBeInTheDocument()
    expect(screen.getByText('Loading declaration details…')).toBeInTheDocument()
  })

  it('shows an empty confirmed declaration without substituting its draft or SRP prices', async () => {
    const record = { ...draft, status: 'active' as const, effective_state: 'scheduled' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(record)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(record)
    render(<EmergencyToggle />)
    expect(await screen.findByText('No confirmed price ceilings recorded for this declaration')).toBeInTheDocument()
    expect(within(pricing()).queryByText('₱45.00')).not.toBeInTheDocument()
    expect(within(pricing()).queryByText('₱38.00')).not.toBeInTheDocument()
  })

  it('blocks draft actions when the effective state is unknown', async () => {
    const record = { ...draft, effective_state: 'unrecognized' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(record)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(record)
    render(<EmergencyToggle />)
    expect(await screen.findByRole('heading', { name: 'Status unavailable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and activate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh preparation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
  })

  it('replaces draft prices immediately after activation with the authoritative response', async () => {
    const confirmed: RegulatoryEmergencyRecord = { ...draft, status: 'active', effective_state: 'in_effect', official_prices: [official('rice', 'APC', 46)] }
    vi.mocked(adminApi.activateEmergency).mockImplementation(async () => {
      vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(confirmed)])
      vi.mocked(adminApi.getEmergency).mockResolvedValue(confirmed)
      return confirmed
    })
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const user = userEvent.setup()
    await user.click(review())
    await user.click(screen.getByRole('button', { name: 'Confirm and activate' }))
    expect(await screen.findByRole('heading', { name: 'Confirmed price ceilings' })).toBeInTheDocument()
    expect(within(pricing()).getByText('₱46.00')).toBeInTheDocument()
    expect(within(pricing()).queryByText('₱45.00')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(adminApi.activateEmergency).toHaveBeenCalledWith(7, { confirmed: true, preparation_hash: draft.preparation_hash })
  })

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
    const ended: RegulatoryEmergencyRecord = { ...active, status: 'ended', effective_state: 'ended', ended_at: '2026-10-09T01:00:00Z' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(ended)])
    // The old summary never completed, so its old detail was never started; keep the one-shot old detail for the next read.
    vi.mocked(adminApi.getEmergency).mockReset().mockResolvedValue(ended)
    await act(async () => write.resolve(ended))
    await act(async () => { oldSummary.resolve([summary(active)]); oldDetail.resolve(active) })
    expect(screen.queryByRole('button', { name: 'End Price Freeze' })).not.toBeInTheDocument()
    expect(screen.getByText(/Manually ended at/)).toBeInTheDocument()
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Price Freeze Prices' })).toBeInTheDocument()
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
    await screen.findByRole('heading', { name: 'Proposed price ceilings' })
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
    expect(within(pricing()).getByText('1 Product')).toBeInTheDocument()
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

  it('clamps mixed draft pagination after refreshed results shrink', async () => {
    const many = { ...draft, candidates: Array.from({ length: 9 }, (_, i) => ({ ...draft.candidates[0], id: i + 1, commodity_key: `product-${i}` })) }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(many)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(many)
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const nav = screen.getByRole('navigation', { name: 'Proposed price ceilings pagination' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Next page' }))
    expect(nav).toHaveTextContent('Page 2 of 2')
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(draft)
    refresh()
    await waitFor(() => expect(nav).toHaveTextContent('Page 1 of 1'))
    expect(within(pricing()).getByText('2 Products')).toBeInTheDocument()
  })

  it('clamps confirmed pagination after refreshed results shrink and resets it on selection', async () => {
    const many = { ...draft, status: 'active' as const, effective_state: 'in_effect', official_prices: Array.from({ length: 11 }, (_, i) => ({ ...official(`product-${i}`), id: i + 1 })) }
    const historical = { ...draft, id: 8, declaration_reference: 'DECL-8', status: 'ended' as const, effective_state: 'ended', official_prices: [official('historic-product')] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(many), summary(historical)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(many)
    render(<EmergencyToggle />)
    await screen.findByRole('button', { name: 'End Price Freeze' })
    const nav = screen.getByRole('navigation', { name: 'Confirmed price ceilings pagination' })
    expect(within(pricing()).getByText('11 Products')).toBeInTheDocument()
    fireEvent.click(within(nav).getByRole('button', { name: 'Next references page' }))
    expect(nav).toHaveTextContent('Page 2 of 2')
    expect(within(pricing()).queryByText('historic-product')).not.toBeInTheDocument()
    const small = { ...many, official_prices: [official()] }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(small), summary(historical)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(small)
    refresh()
    await waitFor(() => expect(nav).toHaveTextContent('Page 1 of 1'))
    vi.mocked(adminApi.getEmergency).mockResolvedValue(historical)
    fireEvent.click(declaration(8))
    expect(within(pricing()).getByText('historic-product')).toBeInTheDocument()
    expect(within(pricing()).queryByText('Rice')).not.toBeInTheDocument()
    expect(nav).toHaveTextContent('Page 1 of 1')
  })

  it('keeps draft filters during refresh and resets them when selecting another declaration', async () => {
    const other = { ...draft, id: 8, declaration_reference: 'DECL-8' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft), summary(other)])
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    const input = within(pricing()).getByRole('textbox', { name: 'Search prices' })
    fireEvent.change(input, { target: { value: 'milk' } })
    fireEvent.click(within(pricing()).getByRole('button', { name: 'SRP held (1)' }))
    refresh()
    await waitFor(() => expect(adminApi.getEmergency).toHaveBeenCalledTimes(2))
    expect(input).toHaveValue('milk')
    vi.mocked(adminApi.getEmergency).mockResolvedValue(other)
    fireEvent.click(declaration(8))
    await waitFor(() => expect(within(pricing()).getByRole('textbox', { name: 'Search prices' })).toHaveValue(''))
    expect(within(pricing()).getByRole('button', { name: 'All (2)' })).toHaveClass('is-active')
    expect(within(within(pricing()).getByRole('table')).getByText('Rice')).toBeInTheDocument()
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
