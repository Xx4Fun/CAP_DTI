import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi } from '../../services/adminApi'
import type { RegulatoryEmergencyRecord } from '../../types/admin'
import { EmergencyToggle } from './EmergencyToggle'

vi.mock('../../services/adminApi', () => ({ adminApi: {
  getEmergencySummaries: vi.fn(), getEmergency: vi.fn(), getSrp: vi.fn(), createEmergency: vi.fn(),
  prepareEmergency: vi.fn(), activateEmergency: vi.fn(), updateEmergency: vi.fn(), releaseExpiredEmergencyLock: vi.fn(),
} }))

const draft: RegulatoryEmergencyRecord = {
  id: 5, location: 'San Jose de Buenavista, Antique', declaration_reference: 'NEW-5',
  starts_on: '2026-10-09', ends_on: null, status: 'draft', effective_state: 'draft', preparation_hash: 'a'.repeat(64),
  source_week: { timezone: 'Asia/Manila', starts_at: '2026-09-27T16:00:00Z', ends_at: '2026-10-04T16:00:00Z' },
  candidates: [], srp_fallbacks: [{ commodity_key: 'rice', commodity_name: 'Rice', unit: 'kg', srp_id: 1, srp_price: 50 }], official_prices: [],
}
const expired = { ...draft, id: 2, declaration_reference: 'OLD-2', starts_on: '2020-10-07', ends_on: '2020-10-08',
  status: 'active', effective_state: 'expired', activation_lock_held: true, can_release_expired_lock: true } as RegulatoryEmergencyRecord
const confirmed = { ...draft, status: 'active', effective_state: 'in_effect', activation_lock_held: true,
  official_prices: [{ id: 10, commodity_key: 'rice', price_type: 'SRP', authoritative_price: 50, effective_from: '2026-10-09', source_reference: 'NEW-5' }] } as RegulatoryEmergencyRecord
const closed = { ...expired, status: 'ended', activation_lock_held: false, can_release_expired_lock: false } as RegulatoryEmergencyRecord
const summary = ({ candidates: _candidates, source_week: _week, srp_fallbacks: _fallbacks, ...rest }: RegulatoryEmergencyRecord) => rest
const activate = async () => {
  await screen.findByRole('checkbox')
  const user = userEvent.setup()
  await user.click(screen.getByRole('checkbox'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Confirm and activate' }))
}

describe('Emergency activation safeguards and recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(draft)
    vi.mocked(adminApi.getSrp).mockResolvedValue({ records: [], pagination: { current_page: 1, last_page: 1, per_page: 1000, total: 0, from: null, to: null }, capabilities: { can_publish: true, status: 'AVAILABLE' } })
  })

  it('shows the expired lock warning with normal protocol and recovers without changing historical prices', async () => {
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(expired)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(expired)
    vi.mocked(adminApi.releaseExpiredEmergencyLock).mockImplementation(async () => {
      vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(closed)])
      vi.mocked(adminApi.getEmergency).mockResolvedValue(closed)
      return closed
    })
    render(<EmergencyToggle />)
    expect(await screen.findByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(await screen.findByText(/expired declaration.*still holds/i)).toBeInTheDocument()
    expect(screen.getByText(/Historical dates and confirmed prices will be preserved/i)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Release expired lock' }))
    await waitFor(() => expect(adminApi.releaseExpiredEmergencyLock).toHaveBeenCalledWith(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Release expired lock' })).not.toBeInTheDocument())
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(vi.mocked(adminApi.getEmergencySummaries).mock.calls.length).toBeGreaterThan(1)
  })

  it('blocks an expired draft while leaving its preparation available for review', async () => {
    const record = { ...draft, ends_on: '2020-10-08', starts_on: '2020-10-07' }
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(record)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(record)
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeDisabled()
    expect(screen.getByText(/cannot activate.*expired.*2020-10-08/i)).toBeInTheDocument()
    expect(adminApi.activateEmergency).not.toHaveBeenCalled()
  })

  it('refreshes all declaration summaries after successful activation and automatic recovery', async () => {
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(draft), summary(expired)])
    vi.mocked(adminApi.activateEmergency).mockImplementation(async () => {
      vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(confirmed), summary(closed)])
      vi.mocked(adminApi.getEmergency).mockResolvedValue(confirmed)
      return confirmed
    })
    render(<EmergencyToggle />)
    await activate()
    expect(await screen.findByText('State of Calamity')).toBeInTheDocument()
    await waitFor(() => expect(adminApi.getEmergencySummaries).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/expired declaration.*still holds/i)).not.toBeInTheDocument()
  })

  it('reconciles a lost activation response with the saved declaration without resending', async () => {
    vi.mocked(adminApi.activateEmergency).mockRejectedValue(new Error('Connection lost'))
    vi.mocked(adminApi.getEmergency).mockResolvedValueOnce(draft).mockResolvedValue(confirmed)
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValueOnce([summary(draft)]).mockResolvedValue([summary(confirmed)])
    render(<EmergencyToggle />)
    await activate()
    expect(await screen.findByText('State of Calamity')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and activate' })).not.toBeInTheDocument()
    expect(adminApi.activateEmergency).toHaveBeenCalledTimes(1)
  })

  it('requires status verification after a lost response and failed lookup, and Retry only reads', async () => {
    vi.mocked(adminApi.activateEmergency).mockRejectedValue(new Error('Connection lost'))
    vi.mocked(adminApi.getEmergency).mockResolvedValueOnce(draft).mockRejectedValue(new Error('Offline'))
    render(<EmergencyToggle />)
    await activate()
    expect(await screen.findByText(/Activation result unknown/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm and activate' })).toBeDisabled()
    vi.mocked(adminApi.getEmergency).mockResolvedValue(confirmed)
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(confirmed)])
    fireEvent.click(screen.getByRole('button', { name: 'Retry status checking' }))
    expect(await screen.findByText('State of Calamity')).toBeInTheDocument()
    expect(screen.queryByText(/Activation result unknown/)).not.toBeInTheDocument()
    expect(adminApi.activateEmergency).toHaveBeenCalledTimes(1)
  })

  it('does not pretend activation succeeded when verification finds the draft unchanged', async () => {
    vi.mocked(adminApi.activateEmergency).mockRejectedValue(new Error('Connection lost'))
    render(<EmergencyToggle />)
    await activate()
    expect(await screen.findByText(/not confirmed.*review.*try again/i)).toBeInTheDocument()
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(adminApi.activateEmergency).toHaveBeenCalledTimes(1)
  })

  it('explains a scheduled blocker without calling it a freeze in effect', async () => {
    vi.mocked(adminApi.activateEmergency).mockRejectedValue({ response: { status: 409, data: {
      status: 'EMERGENCY_ACTIVATION_BLOCKED', message: 'Scheduled declaration FUTURE-6 reserves activation. End or cancel it before confirming another declaration.',
      blocking_emergency: { id: 6, declaration_reference: 'FUTURE-6', effective_state: 'scheduled' },
    } } })
    render(<EmergencyToggle />)
    await activate()
    expect(await screen.findByText(/Scheduled declaration FUTURE-6/)).toBeInTheDocument()
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.queryByText(/Activation result unknown/)).not.toBeInTheDocument()
  })

  it('keeps a late draft refresh from replacing the verified activation result', async () => {
    let resolve!: (records: ReturnType<typeof summary>[]) => void
    const stale = new Promise<ReturnType<typeof summary>[]>((done) => { resolve = done })
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValueOnce([summary(draft)]).mockReturnValueOnce(stale).mockResolvedValue([summary(confirmed)])
    vi.mocked(adminApi.activateEmergency).mockRejectedValue(new Error('Lost response'))
    vi.mocked(adminApi.getEmergency).mockResolvedValueOnce(draft).mockResolvedValue(confirmed)
    render(<EmergencyToggle />)
    await screen.findByRole('checkbox')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and activate' }))
    await act(async () => { window.dispatchEvent(new Event('regulatory-data-changed')) })
    expect(await screen.findByText('State of Calamity')).toBeInTheDocument()
    await act(async () => resolve([summary(draft)]))
    expect(screen.getByText('State of Calamity')).toBeInTheDocument()
  })

  it('lets Admin cancel a scheduled blocker using the existing confirmed status write', async () => {
    const scheduled = { ...confirmed, starts_on: '2099-10-09', ends_on: '2099-10-10', effective_state: 'scheduled', can_release_expired_lock: false }
    const cancelled = { ...scheduled, status: 'cancelled', effective_state: 'cancelled', activation_lock_held: false } as RegulatoryEmergencyRecord
    vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(scheduled)])
    vi.mocked(adminApi.getEmergency).mockResolvedValue(scheduled)
    vi.mocked(adminApi.updateEmergency).mockImplementation(async () => {
      vi.mocked(adminApi.getEmergencySummaries).mockResolvedValue([summary(cancelled)])
      vi.mocked(adminApi.getEmergency).mockResolvedValue(cancelled)
      return cancelled
    })
    render(<EmergencyToggle />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel scheduled declaration' }))
    await waitFor(() => expect(adminApi.updateEmergency).toHaveBeenCalledWith(5, { status: 'cancelled', confirmed: true }))
    await screen.findByRole('heading', { name: 'Cancelled declaration' })
    expect(screen.getByText('Normal SRP Protocol')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Release expired lock' })).not.toBeInTheDocument()
  })
})
