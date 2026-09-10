// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage, HomePage, MonitoringPage, ProfilePage } from './FieldPages'
import type { BootstrapData, FieldSession, VisitDraft } from '../types'

const fixtures = vi.hoisted(() => ({ history: vi.fn(), historyDetail: vi.fn(), readSecret: vi.fn(), writeSecret: vi.fn() }))
vi.mock('../services/fieldApi', () => ({
  fieldApi: { history: fixtures.history, historyDetail: fixtures.historyDetail },
  apiError: (_error: unknown, fallback: string) => fallback,
}))
vi.mock('../app/vault', () => ({ readSecret: fixtures.readSecret, writeSecret: fixtures.writeSecret }))

const session: FieldSession = {
  token: 'token',
  user: { id: 1, name: 'Ana Officer', email: 'ana@dti.test', role: 'field_officer' },
  offline_lease: { id: 'lease', expires_at: '2099-08-30T00:00:00Z' },
}

const bootstrap: BootstrapData = {
  version: 'v1',
  is_delta: false,
  stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 0, longitude: 0, is_active: true }],
  srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50, source_reference: 'SRP-2026', effective_date: '2026-08-01' }],
  recent_prices: [],
}

const draft: VisitDraft = {
  client_uuid: 'draft-1', store_id: 7, offline_lease_id: 'lease', started_at: '2026-08-28T00:00:00Z',
  items: [{ srp_id: 3, recorded_price: 52 }], representative: { name: '', title: '' },
  signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
  sync_source: 'offline_queue', client_version: '1.0.0',
}

describe('Field top-level pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixtures.readSecret.mockResolvedValue(undefined)
    fixtures.writeSecret.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('routes each Home summary to the matching Monitoring tab', () => {
    const viewActivity = vi.fn()
    const storesWithCoords: BootstrapData = {
      ...bootstrap,
      stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
    }
    render(
      <HomePage
        name="Ana Officer"
        bootstrap={storesWithCoords}
        queue={[draft, { ...draft, client_uuid: 'draft-2' }]}
        completedToday={1}
        officerPosition={{ latitude: 10.741, longitude: 121.981, accuracy_meters: 10 }}
        activeDraft={draft}
        online
        authorizationValid
        onStart={vi.fn()}
        onViewActivity={viewActivity}
      />
    )

    expect(screen.getByRole('heading', { name: 'Good day, Ana' })).toBeInTheDocument()
    expect(screen.getByText('1 active store')).toBeInTheDocument()
    expect(screen.getByText('2 pending sync')).toBeInTheDocument()
    expect(screen.getByText('3 visited')).toBeInTheDocument()
    expect(screen.getByText('Nearest establishments')).toBeInTheDocument()
    expect(screen.getByText('Recent activity')).toBeInTheDocument()
    expect(screen.queryByText(/R\.A\. 7581/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/biometric/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View current monitoring' }))
    expect(viewActivity).toHaveBeenCalledWith('work')
    expect(screen.queryByText(/Standard price monitoring/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View all' }))
    expect(viewActivity).toHaveBeenCalledWith('sync')
  })

  it('renders location not enabled fallback when officer position is null', () => {
    const startVisit = vi.fn()
    render(
      <HomePage
        name="Ana Officer"
        bootstrap={bootstrap}
        queue={[]}
        completedToday={0}
        officerPosition={null}
        activeDraft={null}
        online
        authorizationValid
        onStart={startVisit}
        onViewActivity={vi.fn()}
      />
    )

    expect(screen.getByText('Location access not enabled')).toBeInTheDocument()
    expect(screen.getByText('0 visited')).toBeInTheDocument()
    expect(screen.getByText('All visits synchronized')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start new visit' }))
    expect(startVisit).toHaveBeenCalledTimes(1)
  })

  it('lists unfinished visits newest-first with independent resume and discard actions', () => {
    const resume = vi.fn()
    const discard = vi.fn()
    const start = vi.fn()
    const sync = vi.fn()
    render(
      <MonitoringPage
        drafts={[draft, { ...draft, client_uuid: 'draft-2', store_id: null, started_at: '2026-08-29T00:00:00Z' }]}
        queue={[{ ...draft, client_uuid: 'queued-1', finalized_at: '2026-08-28T01:00:00Z' }]}
        bootstrap={bootstrap}
        online
        syncing={false}
        authorizationValid
        requests={[{ id: 8, source_type: 'complaint', status: 'claimed', reason: 'Consumer price report requires a store visit.', requested_at: '2026-08-30T00:00:00Z', claimed_at: '2026-08-30T00:05:00Z', claimed_by: 1, store: bootstrap.stores[0] }]}
        requestsState="ready"
        onStartAssigned={vi.fn()}
        onRelease={vi.fn()}
        onRetry={vi.fn()}
        onResume={resume}
        onStart={start}
        onDiscard={discard}
        onSync={sync}
      />
    )

    expect(screen.getByRole('heading', { name: 'Monitoring' })).toHaveClass('sr-only')
    expect(screen.queryByText('Handle verification work, resume encrypted drafts, and synchronize completed visits.')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Assigned Visits 1/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Current Work 2' })).toBeInTheDocument()
    expect(screen.getAllByText('Market One').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Inspection Draft')).toHaveLength(2)
    expect(screen.getAllByText('1 line')).toHaveLength(2)
    expect(screen.queryByText('Establishment Directory')).not.toBeInTheDocument()

    // Test resume
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume inspection' })[0])
    expect(resume).toHaveBeenCalledWith('draft-2')

    // Test discard confirmation flow
    fireEvent.click(screen.getAllByRole('button', { name: 'Discard draft' })[0])
    expect(screen.getByText('Discard this draft?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(discard).toHaveBeenCalledWith('draft-2')

    fireEvent.click(screen.getByRole('tab', { name: 'Sync Queue 1' }))
    expect(screen.getByText('Pending upload')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sync all now' }))
    expect(sync).toHaveBeenCalledTimes(1)

    // Test expanding queue details
    fireEvent.click(screen.getByRole('button', { name: 'View recorded items' }))
    expect(screen.getByText('Active Reference')).toBeInTheDocument()
    expect(screen.getByText('₱50.00')).toBeInTheDocument()
  })

  it('keeps saved verification requests visible when they cannot be refreshed', () => {
    render(
      <MonitoringPage
        initialTab="verification"
        drafts={[]}
        queue={[]}
        bootstrap={bootstrap}
        online={false}
        syncing={false}
        authorizationValid
        requests={[{ id: 8, source_type: 'supervisor_directive', status: 'claimed', reason: 'Check the reported shelf price.', requested_at: '2026-08-30T00:00:00Z', claimed_at: '2026-08-30T00:05:00Z', claimed_by: 1, store: bootstrap.stores[0] }]}
        requestsState="unavailable"
        onStartAssigned={vi.fn()}
        onRelease={vi.fn()}
        onRetry={vi.fn()}
        onResume={vi.fn()}
        onStart={vi.fn()}
        onDiscard={vi.fn()}
        onSync={vi.fn()}
      />
    )

    expect(screen.getByText('Showing saved assigned visits')).toBeInTheDocument()
    expect(screen.getByText('Market One')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start assigned visit' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Return to Admin' })).toBeDisabled()
  })

  it('shows accepted server records in History without a local queue section', async () => {
    fixtures.history.mockResolvedValue({
      data: [{ id: 9, client_uuid: 'accepted-1', status: 'accepted', finalized_at: '2026-08-28T01:00:00Z', received_at: '2026-08-28T01:02:00Z', representative_name: 'Ben', sync_source: 'online', items_count: 3, anomaly_count: 0, store: { id: 7, store_name: 'Market One', address: 'San Jose' }, items: [] }],
      current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1,
    })
    fixtures.historyDetail.mockResolvedValue({
      id: 9, client_uuid: 'accepted-1', status: 'accepted', started_at: '2026-08-28T00:00:00Z', finalized_at: '2026-08-28T01:00:00Z', received_at: '2026-08-28T01:02:00Z', sync_source: 'online', field_verification_request_id: 8,
      store: { ...bootstrap.stores[0] }, location: { latitude: 10.7, longitude: 121.9, accuracy_meters: 20, captured_at: '2026-08-28T01:00:00Z' }, representative: { name: 'Ben', title: 'Manager' }, signatures: { officer_present: true, representative_present: true },
      items: [{ id: 1, srp_id: 3, commodity_name: 'Rice', unit: 'kg', recorded_price: 52, previous_price: null, variance_percent: 4, is_anomaly: false, reference_status: 'available', reference_type: 'standard_srp', reference_label: 'SRP', reference_value: 50, reference_source: 'Bulletin', reference_effective_date: '2026-08-01' }],
    })
    render(<HistoryPage session={session} online />)

    expect(await screen.findByText('Market One')).toBeInTheDocument()
    expect(screen.queryByText(/waiting to synchronize/i)).not.toBeInTheDocument()
    expect(fixtures.history).toHaveBeenCalledWith('token', 1)
    await waitFor(() => expect(fixtures.writeSecret).toHaveBeenCalledWith('history:1', expect.objectContaining({ pages: expect.objectContaining({ 1: expect.objectContaining({ total: 1 }) }) })))
    fireEvent.click(screen.getByRole('button', { name: 'View Market One visit details' }))
    expect(await screen.findByRole('heading', { name: 'Market One' })).toBeInTheDocument()
    expect(screen.getByText('Both signatures captured')).toBeInTheDocument()
    expect(screen.getByText('Verification request #8')).toBeInTheDocument()
    await waitFor(() => expect(fixtures.writeSecret).toHaveBeenCalledWith('history:1', expect.objectContaining({ details: expect.objectContaining({ 9: expect.objectContaining({ client_uuid: 'accepted-1' }) }) })))
  })

  it('shows encrypted cached History and cached details offline without calling the API', async () => {
    fixtures.readSecret.mockResolvedValue({
      updated_at: '2026-09-06T01:00:00Z',
      pages: {
        1: {
          data: [{ id: 9, client_uuid: 'accepted-1', status: 'accepted', finalized_at: '2026-08-28T01:00:00Z', received_at: '2026-08-28T01:02:00Z', representative_name: 'Ben', sync_source: 'online', items_count: 3, anomaly_count: 0, store: { id: 7, store_name: 'Market One', address: 'San Jose' }, items: [] }],
          current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1,
        },
      },
      details: {
        9: {
          id: 9, client_uuid: 'accepted-1', status: 'accepted', started_at: '2026-08-28T00:00:00Z', finalized_at: '2026-08-28T01:00:00Z', received_at: '2026-08-28T01:02:00Z', sync_source: 'online', field_verification_request_id: 8,
          store: { ...bootstrap.stores[0] }, location: { latitude: 10.7, longitude: 121.9, accuracy_meters: 20, captured_at: '2026-08-28T01:00:00Z' }, representative: { name: 'Ben', title: 'Manager' }, signatures: { officer_present: true, representative_present: true }, items: [],
        },
      },
    })

    render(<HistoryPage session={session} online={false} />)

    expect(await screen.findByText('Market One')).toBeInTheDocument()
    expect(screen.getByText(/Showing history saved on this device/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Market One visit details' }))
    expect(await screen.findByText('Both signatures captured')).toBeInTheDocument()
    expect(fixtures.history).not.toHaveBeenCalled()
    expect(fixtures.historyDetail).not.toHaveBeenCalled()
  })

  it('settles to a reconnect message when an offline History detail was not downloaded', async () => {
    fixtures.readSecret.mockResolvedValue({
      updated_at: '2026-09-06T01:00:00Z',
      pages: {
        1: {
          data: [{ id: 9, client_uuid: 'accepted-1', status: 'accepted', finalized_at: '2026-08-28T01:00:00Z', received_at: '2026-08-28T01:02:00Z', representative_name: 'Ben', sync_source: 'online', items_count: 3, anomaly_count: 0, store: { id: 7, store_name: 'Market One', address: 'San Jose' }, items: [] }],
          current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1,
        },
      },
      details: {},
    })

    render(<HistoryPage session={session} online={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'View Market One visit details' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Connect to download this visit')
    expect(screen.queryByRole('status', { name: /Loading/i })).not.toBeInTheDocument()
    expect(fixtures.historyDetail).not.toHaveBeenCalled()
  })

  it('renders profile details and sign out action', async () => {
    const toggle = vi.fn().mockResolvedValue(undefined)
    const logout = vi.fn()
    render(<ProfilePage session={session} online biometricAvailability="available" biometricEnabled={false} onToggleBiometric={toggle} onLogout={logout} />)

    expect(screen.getByRole('heading', { name: 'Ana Officer' })).toBeInTheDocument()
    expect(screen.getByText('ana@dti.test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enable biometric unlock' }))
    await waitFor(() => expect(toggle).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
