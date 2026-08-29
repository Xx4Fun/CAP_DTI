// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActivityPage, HistoryPage, HomePage, ProfilePage } from './FieldPages'
import type { BootstrapData, FieldSession, VisitDraft } from '../types'

const fixtures = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('../services/fieldApi', () => ({
  fieldApi: { history: fixtures.history },
  apiError: (_error: unknown, fallback: string) => fallback,
}))

const session: FieldSession = {
  token: 'token',
  user: { id: 1, name: 'Ana Officer', email: 'ana@dti.test', role: 'field_officer' },
  offline_lease: { id: 'lease', expires_at: '2099-08-30T00:00:00Z' },
}

const bootstrap: BootstrapData = {
  version: 'v1',
  is_delta: false,
  stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 0, longitude: 0, is_active: true }],
  srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }],
  recent_prices: [],
}

const draft: VisitDraft = {
  client_uuid: 'draft-1', store_id: 7, offline_lease_id: 'lease', started_at: '2026-08-28T00:00:00Z',
  items: [{ srp_id: 3, recorded_price: 52 }], representative: { name: '', title: '' },
  signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
  sync_source: 'offline_queue', client_version: '1.0.0',
}

describe('Field top-level pages', () => {
  afterEach(cleanup)

  it('keeps Home focused on readiness and sends an existing draft to Activity', () => {
    const viewActivity = vi.fn()
    render(<HomePage name="Ana Officer" bootstrap={bootstrap} queueCount={2} activeDraft={draft} online authorizationValid onStart={vi.fn()} onViewActivity={viewActivity} />)

    expect(screen.getByRole('heading', { name: 'Good day, Ana' })).toBeInTheDocument()
    expect(screen.getByText('1 active store')).toBeInTheDocument()
    expect(screen.getByText('2 pending sync')).toBeInTheDocument()
    expect(screen.queryByText(/biometric/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View current activity' }))
    expect(viewActivity).toHaveBeenCalledTimes(1)
  })

  it('owns the active draft and encrypted sync queue on Activity', () => {
    const resume = vi.fn()
    const sync = vi.fn()
    render(<ActivityPage activeDraft={draft} queue={[{ ...draft, client_uuid: 'queued-1', finalized_at: '2026-08-28T01:00:00Z' }]} bootstrap={bootstrap} online syncing={false} authorizationValid onResume={resume} onStart={vi.fn()} onSync={sync} />)

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.getAllByText('Market One')).toHaveLength(2)
    expect(screen.getByText('Encrypted and waiting to sync')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume visit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Synchronize now' }))
    expect(resume).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('shows accepted server records in History without a local queue section', async () => {
    fixtures.history.mockResolvedValue({
      data: [{ id: 9, client_uuid: 'accepted-1', status: 'accepted', finalized_at: '2026-08-28T01:00:00Z', received_at: '2026-08-28T01:02:00Z', representative_name: 'Ben', sync_source: 'online', items_count: 3, anomaly_count: 0, store: { id: 7, store_name: 'Market One', address: 'San Jose' }, items: [] }],
      current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1,
    })
    render(<HistoryPage session={session} online />)

    expect(await screen.findByText('Market One')).toBeInTheDocument()
    expect(screen.queryByText(/waiting to synchronize/i)).not.toBeInTheDocument()
    expect(fixtures.history).toHaveBeenCalledWith('token', 1)
  })

  it('moves account and biometric security controls into Profile', async () => {
    const toggle = vi.fn().mockResolvedValue(undefined)
    const lock = vi.fn()
    const logout = vi.fn()
    render(<ProfilePage session={session} online biometricAvailability="available" biometricEnabled={false} onToggleBiometric={toggle} onLock={lock} onLogout={logout} />)

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByText('ana@dti.test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enable biometric unlock' }))
    await waitFor(() => expect(toggle).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Lock now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(lock).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
