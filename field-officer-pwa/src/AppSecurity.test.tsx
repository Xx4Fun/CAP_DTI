// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { fieldNoticeDuration } from './App'

const fixtures = vi.hoisted(() => ({
  session: {
    token: 'token', must_change_password: true,
    user: { id: 1, name: 'Ana Officer', email: 'ana@dti.test', role: 'field_officer' as const },
    offline_lease: { id: 'lease-old', expires_at: '2099-08-29T00:00:00Z' },
  },
  vault: {
    clearVault: vi.fn(), createVault: vi.fn(), deleteSecret: vi.fn(), enableBiometricUnlock: vi.fn(),
    getBiometricUnlockAvailability: vi.fn().mockResolvedValue('prf-unsupported'),
    getVaultPinLength: vi.fn().mockResolvedValue(null), hasBiometricUnlock: vi.fn().mockResolvedValue(false), hasVault: vi.fn().mockResolvedValue(false),
    isBiometricUnlockAvailable: vi.fn().mockResolvedValue(false), lockVault: vi.fn(),
    readSecret: vi.fn(), requestPersistentStorage: vi.fn().mockResolvedValue(true), restoreVaultSession: vi.fn().mockResolvedValue(false), rewrapVaultPin: vi.fn(),
    unlockVault: vi.fn().mockResolvedValue({ requiresPinMigration: false }),
    unlockVaultWithBiometrics: vi.fn(), writeSecret: vi.fn(),
  },
  api: {
    bootstrap: vi.fn().mockResolvedValue({ version: 'v1', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] }),
    history: vi.fn(), login: vi.fn(), logout: vi.fn(), renewLease: vi.fn(), sync: vi.fn(),
  },
  draft: {
    client_uuid: '0b4cf2cf-51c9-4da4-8420-b6f271c82b8e', store_id: null, offline_lease_id: 'lease-old',
    started_at: '2026-08-28T00:00:00Z', items: [], representative: { name: '', title: '' },
    signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
    sync_source: 'offline_queue' as const, client_version: '1.0.0',
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const completeDraft = () => ({
  ...fixtures.draft,
  store_id: 7,
  items: [{ srp_id: 3, recorded_price: 52 }],
  representative: { name: 'Ben Santos', title: 'Manager' },
  signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
  location: { latitude: 10.74, longitude: 121.98, accuracy_meters: 12, captured_at: '2026-08-30T00:00:00Z' },
})

function resumeOnlyDraft() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Monitoring' })[0])
  fireEvent.click(screen.getByRole('tab', { name: /Current Work/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Resume inspection' }))
}

vi.mock('./components/Login', () => ({
  LoginForm: ({ onAuthenticated }: { onAuthenticated: (session: typeof fixtures.session, mustChange: boolean) => void }) =>
    <button onClick={() => onAuthenticated(fixtures.session, true)}>Authenticate</button>,
}))
vi.mock('./components/InstallPrompt', () => ({ InstallPrompt: () => null }))
vi.mock('./components/PwaUpdatePrompt', () => ({ PwaUpdatePrompt: () => null }))
vi.mock('./app/pwaRegistration', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))
vi.mock('./app/vault', () => fixtures.vault)
vi.mock('./services/fieldApi', () => ({ fieldApi: fixtures.api, apiError: (_error: unknown, fallback: string) => fallback }))

describe('field workspace security flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    fixtures.vault.hasVault.mockResolvedValue(false)
    fixtures.vault.hasBiometricUnlock.mockResolvedValue(false)
    fixtures.vault.getBiometricUnlockAvailability.mockResolvedValue('prf-unsupported')
    fixtures.vault.getVaultPinLength.mockResolvedValue(null)
    fixtures.vault.isBiometricUnlockAvailable.mockResolvedValue(false)
    fixtures.vault.restoreVaultSession.mockResolvedValue(false)
    fixtures.vault.unlockVault.mockResolvedValue({ requiresPinMigration: false })
    fixtures.vault.readSecret.mockResolvedValue(undefined)
    fixtures.vault.writeSecret.mockResolvedValue(undefined)
    fixtures.api.bootstrap.mockResolvedValue({ version: 'v1', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] })
    fixtures.api.sync.mockResolvedValue([])
    fixtures.api.renewLease.mockResolvedValue({ id: 'lease-new', expires_at: '2099-08-30T00:00:00Z' })
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    Object.defineProperty(window.navigator, 'geolocation', { configurable: true, value: undefined })
  })

  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('uses severity-based toast timing and keeps actionable notices persistent', () => {
    expect(fieldNoticeDuration('success')).toBe(4_000)
    expect(fieldNoticeDuration('info')).toBe(6_000)
    expect(fieldNoticeDuration('warning')).toBe(0)
    expect(fieldNoticeDuration('error')).toBe(0)
  })

  it('avoids flashing the authentication card and delays quiet startup feedback', async () => {
    const vaultCheck = deferred<boolean>()
    fixtures.vault.hasVault.mockReturnValue(vaultCheck.promise)
    vi.useFakeTimers()

    const { container } = render(<App />)

    expect(container.querySelector('.auth-shell')).not.toBeInTheDocument()
    expect(screen.queryByText(/Checking this device/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByRole('status')).toHaveTextContent('Opening secure workspace')

    vaultCheck.resolve(false)
  })

  it('keeps the PIN screen focused on the unlock action', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    render(<App />)

    expect(await screen.findByLabelText('4-digit device PIN')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unlock field workspace' })).toBeInTheDocument()
    expect(screen.queryByText(/encrypted visits and downloaded field data/i)).not.toBeInTheDocument()
  })

  it('opens cached field data immediately after PIN unlock while online refresh continues', async () => {
    const leaseRefresh = deferred<typeof fixtures.session.offline_lease>()
    const bootstrapRefresh = deferred<{ version: string; is_delta: boolean; stores: never[]; srp_bulletins: never[]; recent_prices: never[] }>()
    fixtures.vault.hasVault.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      queue: [],
    })[key])
    fixtures.api.renewLease.mockReturnValue(leaseRefresh.promise)
    fixtures.api.bootstrap.mockReturnValue(bootstrapRefresh.promise)
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    leaseRefresh.resolve({ id: 'lease-new', expires_at: '2099-08-30T00:00:00Z' })
    bootstrapRefresh.resolve({ version: 'fresh', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] })
    await waitFor(() => expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('bootstrap', expect.objectContaining({ version: 'fresh' })))
  })

  it('opens cached data immediately when authorization expired while renewal continues', async () => {
    const leaseRefresh = deferred<typeof fixtures.session.offline_lease>()
    const expiredSession = { ...fixtures.session, offline_lease: { id: 'lease-old', expires_at: '2020-01-01T00:00:00Z' } }
    fixtures.vault.hasVault.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: expiredSession,
      bootstrap: {
        version: 'cached', is_delta: false,
        stores: [{ id: 1, store_name: 'Cached Store', address: 'Old', latitude: 0, longitude: 0, is_active: true }],
        srp_bulletins: [], recent_prices: [],
      },
    })[key])
    fixtures.api.bootstrap.mockResolvedValue({
      version: 'fresh', is_delta: false,
      stores: [
        { id: 2, store_name: 'Fresh Store One', address: 'New', latitude: 0, longitude: 0, is_active: true },
        { id: 3, store_name: 'Fresh Store Two', address: 'New', latitude: 0, longitude: 0, is_active: true },
      ],
      srp_bulletins: [], recent_prices: [],
    })
    fixtures.api.renewLease.mockReturnValue(leaseRefresh.promise)
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByText('1 active store')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Offline authorization expired')
    leaseRefresh.resolve({ id: 'lease-new', expires_at: '2099-08-30T00:00:00Z' })
    expect(await screen.findByText('2 active stores')).toBeInTheDocument()
    expect(screen.queryByText('1 active store')).not.toBeInTheDocument()
  })

  it('opens the encrypted cached bootstrap offline even when authorization expired', async () => {
    const expiredSession = { ...fixtures.session, offline_lease: { id: 'lease-old', expires_at: '2020-01-01T00:00:00Z' } }
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: expiredSession,
      bootstrap: {
        version: 'cached', is_delta: false,
        stores: [{ id: 7, store_name: 'Cached Store', address: 'Saved address', latitude: 0, longitude: 0, is_active: true }],
        srp_bulletins: [], recent_prices: [],
      },
    })[key])

    render(<App />)

    expect(await screen.findByText('1 active store')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Offline authorization expired')
    expect(fixtures.vault.requestPersistentStorage).toHaveBeenCalledOnce()
  })

  it('does not present hard-coded establishments when no bootstrap was cached', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'session' ? fixtures.session : undefined)

    render(<App />)

    expect(await screen.findByText('0 active stores')).toBeInTheDocument()
    expect(screen.queryByText('Super Metro San Jose')).not.toBeInTheDocument()
  })

  it('requests session repair when an auto-restored vault has no readable session', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Repair device session' })).toBeInTheDocument()
    expect(fixtures.vault.lockVault).toHaveBeenCalled()
    expect(fixtures.vault.clearVault).not.toHaveBeenCalled()
  })

  it('persists a finalized visit before attempting an online upload', async () => {
    const queueWrite = deferred<void>()
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'cached', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      drafts: [completeDraft()],
    })[key])
    render(<App />)
    await screen.findByRole('heading', { name: 'Good day, Ana' })
    resumeOnlyDraft()
    fixtures.vault.writeSecret.mockImplementation((key: string) => key === 'queue' ? queueWrite.promise : Promise.resolve())

    fireEvent.click(screen.getByRole('button', { name: 'Finalize and submit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }))

    await waitFor(() => expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('queue', [expect.objectContaining({ client_uuid: fixtures.draft.client_uuid, finalized_at: expect.any(String) })]))
    expect(fixtures.api.sync).not.toHaveBeenCalled()
    queueWrite.resolve()
    await waitFor(() => expect(fixtures.api.sync).toHaveBeenCalledTimes(1))
  })

  it('retains an accepted visit for retry when removing it from encrypted storage fails', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'cached', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      drafts: [completeDraft()],
    })[key])
    render(<App />)
    await screen.findByRole('heading', { name: 'Good day, Ana' })
    resumeOnlyDraft()
    let queueWrites = 0
    fixtures.vault.writeSecret.mockImplementation((key: string) => {
      if (key === 'queue' && ++queueWrites === 2) return Promise.reject(new Error('quota'))
      return Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Finalize and submit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }))

    await waitFor(() => expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('queue', [expect.objectContaining({
      client_uuid: fixtures.draft.client_uuid,
      sync_error: expect.any(String),
    })]))
    expect(await screen.findByRole('alert')).toHaveTextContent('Visit queued securely')
  })

  it('keeps the draft editable and reports an error when finalized evidence cannot be persisted', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'cached', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      drafts: [completeDraft()],
    })[key])
    render(<App />)
    await screen.findByRole('heading', { name: 'Good day, Ana' })
    resumeOnlyDraft()
    fixtures.vault.writeSecret.mockImplementation((key: string) => key === 'queue' ? Promise.reject(new Error('quota')) : Promise.resolve())

    fireEvent.click(screen.getByRole('button', { name: 'Finalize and save offline' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to finalize visit')
    expect(screen.getByRole('button', { name: 'Finalize and save offline' })).toBeInTheDocument()
    expect(fixtures.api.sync).not.toHaveBeenCalled()
  })

  it('goes from final credentials directly to device PIN setup', async () => {
    render(<App />)
    const stableLogo = await screen.findByAltText('DTI Official Logo')
    await userEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    expect(await screen.findByRole('heading', { name: 'Create device PIN' })).toBeInTheDocument()
    expect(screen.getByAltText('DTI Official Logo')).toBe(stableLogo)
    expect(stableLogo).toHaveAttribute('src', '/branding/dti-logo.svg')
    expect(screen.getByAltText('DTI fair trade and consumer protection illustration')).toHaveAttribute('src', '/branding/login-artwork.webp')
    expect(screen.queryByText(/Replace temporary password/i)).not.toBeInTheDocument()
  })

  it('restores the workspace without an unlock prompt during the same browser session', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'session' ? fixtures.session : undefined)
    render(<App />)

    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome to Field Monitoring' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Unlock field workspace' })).not.toBeInTheDocument()
  })

  it('lets an officer dismiss and replay the first-use guide', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'session' ? fixtures.session : undefined)
    render(<App />)

    const guideTitle = await screen.findByRole('heading', { name: 'Welcome to Field Monitoring' })
    await waitFor(() => expect(guideTitle).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }))
    expect(screen.queryByRole('heading', { name: 'Welcome to Field Monitoring' })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open profile' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Replay app guide' }))
    expect(screen.getByRole('heading', { name: 'Welcome to Field Monitoring' })).toBeInTheDocument()
  })

  it('migrates the legacy active draft only after writing the encrypted draft array', async () => {
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: { version: 'v1', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      'active-draft': fixtures.draft,
    })[key])
    render(<App />)

    await screen.findByText(/Good day, Ana/i)
    await waitFor(() => expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('drafts', [fixtures.draft]))
    expect(fixtures.vault.deleteSecret).toHaveBeenCalledWith('active-draft')
  })

  it('keeps sibling drafts and offers save, delete, or continue before choosing another store', async () => {
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    const newer = {
      ...fixtures.draft,
      client_uuid: 'newer',
      store_id: 8,
      started_at: '2026-08-29T00:00:00Z',
      items: [{ srp_id: 1, recorded_price: 42 }],
    }
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [
          { id: 7, store_name: 'Market One', address: 'San Jose', latitude: 0, longitude: 0, is_active: true },
          { id: 8, store_name: 'Market Two', address: 'Sibalom', latitude: 0, longitude: 0, is_active: true },
        ],
        srp_bulletins: [], recent_prices: [],
      },
      drafts: [{ ...fixtures.draft, store_id: 7 }, newer],
    })[key])
    render(<App />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Monitoring' }))[0])
    fireEvent.click(screen.getByRole('tab', { name: /Current Work/ }))
    expect(screen.getAllByText('Inspection Draft')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume inspection' })[0])
    expect(screen.getByText('Review & Sign')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Choose Store' })[0])
    expect(screen.getByRole('heading', { name: 'Choose another store?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue editing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete draft and choose store' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft and choose store' }))

    expect(screen.getByRole('heading', { name: 'Choose a store' })).toBeInTheDocument()
    expect(screen.getByText('New Visit')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Choose Store' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Monitoring' })[0])
    fireEvent.click(screen.getByRole('tab', { name: /Current Work/ }))
    expect(screen.getAllByText('Inspection Draft')).toHaveLength(2)
    expect(screen.getByText('Market Two')).toBeInTheDocument()
  })

  it('removes an untouched Choose Store draft when navigating through the shell', async () => {
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: { version: 'v1', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      drafts: [],
    })[key])
    render(<App />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Start a new monitoring visit' }))[0])
    await waitFor(() => expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('drafts', [expect.any(Object)]))
    fixtures.vault.writeSecret.mockClear()
    fireEvent.click(screen.getAllByRole('button', { name: 'Start a new monitoring visit' })[0])
    await act(async () => {})
    expect(fixtures.vault.writeSecret.mock.calls.filter(([key]) => key === 'drafts')).toHaveLength(0)
    expect(screen.getByTestId('field-sidebar')).toBeInTheDocument()
    expect(screen.getByText('New Visit')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Choose Store' })).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Home' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Monitoring' })[0])
    fireEvent.click(screen.getByRole('tab', { name: /Current Work/ }))

    expect(screen.getByText('No active monitoring visit')).toBeInTheDocument()
  })

  it('deletes the old draft and opens a separate blank draft without moving evidence', async () => {
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    const recorded = {
      ...fixtures.draft,
      store_id: 7,
      items: [{ srp_id: 3, recorded_price: 52 }],
      representative: { name: 'Ben Santos', title: 'Manager' },
      signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
      location: { latitude: 10.74, longitude: 121.98, accuracy_meters: 12, captured_at: '2026-08-30T00:00:00Z' },
    }
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      drafts: [recorded],
    })[key])
    render(<App />)

    await screen.findByRole('heading', { name: 'Good day, Ana' })
    resumeOnlyDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Choose Store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft and choose store' }))

    expect(screen.getByRole('heading', { name: 'Choose a store' })).toBeInTheDocument()
    await waitFor(() => {
      const persisted = fixtures.vault.writeSecret.mock.calls.filter(([key]) => key === 'drafts').at(-1)?.[1] as typeof fixtures.draft[]
      expect(persisted).toHaveLength(1)
      expect(persisted[0]).toMatchObject({ store_id: null, items: [], representative: { name: '', title: '' }, signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null })
      expect(persisted[0].client_uuid).not.toBe(recorded.client_uuid)
    })
  })

  it('resumes complete draft evidence in the streamlined signing order and confirms immutable finalization', async () => {
    const completeDraft = {
      ...fixtures.draft,
      store_id: 7,
      items: [{ srp_id: 3, recorded_price: 52 }],
      representative: { name: 'Ben Santos', title: 'Manager' },
      signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
      location: { latitude: 10.74, longitude: 121.98, accuracy_meters: 12, captured_at: '2026-08-30T00:00:00Z' },
    }
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      'active-draft': completeDraft,
    })[key])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Skip guide' }))
    resumeOnlyDraft()
    expect(screen.queryByRole('heading', { name: 'Review and sign' })).not.toBeInTheDocument()
    expect(screen.queryByText('Confirm the visit details, collect both signatures, and capture the on-site location before finalizing.')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/signature area/i).map((canvas) => canvas.getAttribute('aria-label'))).toEqual([
      'Store representative signature signature area',
      'DTI field monitoring officer signature area',
    ])
    expect(screen.getByText('1 commodity line recorded')).toBeInTheDocument()
    expect(screen.getByText('Dual signatures secured')).toBeInTheDocument()
    expect(screen.getByText(/GPS Location locked/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /(?:Capture|Retry) location/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finalize and save offline' }))
    expect(screen.getByRole('heading', { name: 'Finalize this visit?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }))
    expect(await screen.findByRole('heading', { name: 'Visit safely saved' })).toBeInTheDocument()
    expect(screen.getByText(/pending upload/i)).toBeInTheDocument()
  })

  it('offers GPS recovery only after final capture fails and hides it after a valid retry', async () => {
    const getCurrentPosition = vi.fn()
      .mockImplementationOnce((_success: PositionCallback, failure: PositionErrorCallback) => failure({
        code: 1, message: 'Location denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
      }))
      .mockImplementationOnce((success: PositionCallback) => success({
        coords: { latitude: 10.74, longitude: 121.98, accuracy: 120 },
      } as GeolocationPosition))
      .mockImplementationOnce((success: PositionCallback) => success({
        coords: { latitude: 10.74, longitude: 121.98, accuracy: 12 },
      } as GeolocationPosition))
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition,
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      } as unknown as Geolocation,
    })
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      'active-draft': {
        ...fixtures.draft,
        store_id: 7,
        items: [{ srp_id: 3, recorded_price: 52 }],
        representative: { name: 'Ben Santos', title: 'Manager' },
        signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
      },
    })[key])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Skip guide' }))
    resumeOnlyDraft()
    expect(screen.queryByRole('button', { name: 'Redo GPS scan' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Finalize and save offline' }))
    const retry = await screen.findByRole('button', { name: 'Redo GPS scan' })
    expect(screen.queryByRole('heading', { name: 'Finalize this visit?' })).not.toBeInTheDocument()

    fireEvent.click(retry)
    expect(await screen.findByRole('button', { name: 'Redo GPS scan' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Location accuracy must be within 100 metres')

    fireEvent.click(screen.getByRole('button', { name: 'Redo GPS scan' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Redo GPS scan' })).not.toBeInTheDocument())
    expect(screen.getByText(/GPS Location locked/)).toBeInTheDocument()
  })

  it('shows GPS recovery with an existing over-100-metre accuracy warning', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      'active-draft': {
        ...fixtures.draft,
        store_id: 7,
        items: [{ srp_id: 3, recorded_price: 52 }],
        representative: { name: 'Ben Santos', title: 'Manager' },
        signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
        location: { latitude: 10.74, longitude: 121.98, accuracy_meters: 120, captured_at: '2026-08-30T00:00:00Z' },
      },
    })[key])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Skip guide' }))
    resumeOnlyDraft()

    expect(screen.getByText('Location accuracy must be within 100 metres.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo GPS scan' })).toBeInTheDocument()
  })

  it('omits the online acceptance reminder while retaining online finalization', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [{ id: 7, store_name: 'Market One', address: 'San Jose', latitude: 10.74, longitude: 121.98, is_active: true }],
        srp_bulletins: [{ id: 3, commodity_name: 'Rice', unit: 'kg', baseline_price: 50 }], recent_prices: [],
      },
      'active-draft': {
        ...fixtures.draft,
        store_id: 7,
        items: [{ srp_id: 3, recorded_price: 52 }],
        representative: { name: 'Ben Santos', title: 'Manager' },
        signatures: { officer_png_base64: 'officer', representative_png_base64: 'representative' },
        location: { latitude: 10.74, longitude: 121.98, accuracy_meters: 12, captured_at: '2026-08-30T00:00:00Z' },
      },
    })[key])
    render(<App />)

    await screen.findAllByRole('button', { name: 'Monitoring' })
    resumeOnlyDraft()
    expect(screen.getByRole('button', { name: 'Finalize and submit' })).toBeInTheDocument()
    expect(screen.queryByText('Automatic server acceptance')).not.toBeInTheDocument()
    expect(screen.queryByText('Validated visit appears immediately in the DTI Admin Monitoring dashboard.')).not.toBeInTheDocument()
  })

  it('orders Step 1 stores by distance and opens price recording from the selected card', async () => {
    localStorage.setItem('field-guide:1:v1', 'complete')
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn((success: PositionCallback) => {
          success({ coords: { latitude: 10.741, longitude: 121.981, accuracy: 10 } } as GeolocationPosition)
          return 1
        }),
        clearWatch: vi.fn(),
      } as unknown as Geolocation,
    })
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [
          { id: 8, store_name: 'Far Market', address: 'Far Road', latitude: 10.8, longitude: 121.9, is_active: true, image_path: '/stores/store.webp' },
          { id: 7, store_name: 'Near Market', address: 'Near Road', latitude: 10.741, longitude: 121.981, is_active: true, image_path: '/stores/gaisano-grand.jpg' },
        ],
        srp_bulletins: [], recent_prices: [],
      },
      queue: [],
    })[key])
    render(<App />)

    await screen.findByRole('heading', { name: 'Good day, Ana' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Start a new monitoring visit' })[0])

    expect(screen.getByPlaceholderText('Search establishment name or address')).not.toHaveFocus()
    expect(screen.getByText('2 stores · Nearest first')).toBeInTheDocument()
    expect(screen.getByText('New Visit')).toBeInTheDocument()
    expect(screen.getByTestId('field-sidebar')).toBeInTheDocument()
    expect(screen.queryByText('Store not selected')).not.toBeInTheDocument()
    expect(screen.queryByText('Saved securely on device')).not.toBeInTheDocument()
    const storeCards = screen.getAllByRole('button', { name: /Choose .* to record prices/i })
    expect(storeCards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Choose Near Market to record prices',
      'Choose Far Market to record prices',
    ])
    expect(screen.getByText('0 m')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue to Record Prices' })).not.toBeInTheDocument()

    fireEvent.click(storeCards[0])
    expect(screen.getByText('DTI Verified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Choose .* to record prices/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('field-sidebar')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Choose Store' })[0])
    expect(screen.getByRole('heading', { name: 'Choose another store?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
    expect(screen.getByText('DTI Verified')).toBeInTheDocument()
  })

  it('shows and clears the Step 1 no-results state while preserving alphabetical fallback order', async () => {
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.restoreVaultSession.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session,
      bootstrap: {
        version: 'v1', is_delta: false,
        stores: [
          { id: 8, store_name: 'Beta Store', address: 'Beta Road', latitude: 10.8, longitude: 121.9, is_active: true },
          { id: 7, store_name: 'Alpha Store', address: 'Alpha Road', latitude: 10.741, longitude: 121.981, is_active: true },
        ],
        srp_bulletins: [], recent_prices: [],
      },
      queue: [],
    })[key])
    render(<App />)

    await screen.findByRole('heading', { name: 'Good day, Ana' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Start a new monitoring visit' })[0])

    expect(screen.getAllByRole('button', { name: /Choose .* to record prices/i }).map((card) => card.getAttribute('aria-label'))).toEqual([
      'Choose Alpha Store to record prices',
      'Choose Beta Store to record prices',
    ])
    expect(screen.getByText('2 stores · A–Z')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search establishment name or address'), { target: { value: 'Alpha' } })
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByPlaceholderText('Search establishment name or address')).toHaveValue('')

    fireEvent.change(screen.getByPlaceholderText('Search establishment name or address'), { target: { value: 'missing' } })
    expect(screen.getByText('0 stores · A–Z')).toBeInTheDocument()
    expect(screen.getByText('No stores found')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('2 stores · A–Z')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search establishment name or address')).toHaveValue('')
  })

  it('creates a four-digit PIN in two auto-advancing steps with numeric filtering and mismatch recovery', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    const input = await screen.findByLabelText('4-digit device PIN')
    fireEvent.change(input, { target: { value: '1a23-4' } })
    expect(await screen.findByRole('heading', { name: 'Confirm device PIN' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '9999' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('PINs do not match')
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '1234' } })
    await waitFor(() => expect(fixtures.vault.createVault).toHaveBeenCalledWith('1234'))
  })

  it('explains browser incompatibility instead of hiding biometric enrollment', async () => {
    fixtures.vault.getBiometricUnlockAvailability.mockResolvedValue('browser-unsupported')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByRole('heading', { name: 'Biometric unlock needs a newer browser' })).toBeInTheDocument()
    expect(screen.getByText(/Chrome or Edge 133 or newer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with PIN' })).toBeInTheDocument()
  })

  it('locks after sixty background seconds but not before', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with PIN' }))
    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-28T00:00:00Z'))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await vi.advanceTimersByTimeAsync(59_999)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.queryByRole('heading', { name: 'Unlock field workspace' })).not.toBeInTheDocument()

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await vi.advanceTimersByTimeAsync(60_000)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.runAllTimersAsync() })
    expect(screen.getByRole('heading', { name: 'Unlock field workspace' })).toBeInTheDocument()
    expect(fixtures.vault.lockVault).toHaveBeenCalled()
  })

  it('silently renews the lease on an online unlock and moves every unfinished draft', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session, bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      queue: [{ ...fixtures.draft, finalized_at: '2026-08-28T01:00:00Z' }], 'active-draft': { ...fixtures.draft, client_uuid: '6ff2bb4c-b2d0-430d-9327-d41ad6eef068' },
    })[key])
    render(<App />)
    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    await waitFor(() => expect(fixtures.api.renewLease).toHaveBeenCalledWith('token'))
    expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('drafts', [expect.objectContaining({ offline_lease_id: 'lease-new' })])
    await waitFor(() => expect(fixtures.api.sync).toHaveBeenCalledWith('token', [expect.objectContaining({ offline_lease_id: 'lease-old' })]))
  })

  it('renews authorization before synchronizing after reconnect', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session, bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      queue: [{ ...fixtures.draft, finalized_at: '2026-08-28T01:00:00Z' }],
    })[key])
    render(<App />)
    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    await screen.findByText(/Good day, Ana/i)
    fixtures.api.renewLease.mockClear()
    fixtures.api.sync.mockClear()
    const renewal = deferred<{ id: string; expires_at: string }>()
    fixtures.api.renewLease.mockReturnValue(renewal.promise)

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    await act(async () => { window.dispatchEvent(new Event('online')) })

    await waitFor(() => expect(fixtures.api.renewLease).toHaveBeenCalledWith('token'))
    expect(fixtures.api.sync).not.toHaveBeenCalled()
    renewal.resolve({ id: 'lease-reconnected', expires_at: '2099-09-01T00:00:00Z' })
    await waitFor(() => expect(fixtures.api.sync).toHaveBeenCalled())
  })

  it('does not immediately loop automatic synchronization after a record fails', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session, bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      queue: [{ ...fixtures.draft, finalized_at: '2026-08-28T01:00:00Z' }],
    })[key])
    fixtures.api.sync.mockRejectedValue(new Error('Server unavailable'))
    render(<App />)
    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    await waitFor(() => expect(fixtures.api.sync).toHaveBeenCalledTimes(1))
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 50)) })
    expect(fixtures.api.sync).toHaveBeenCalledTimes(1)
  })

  it('blocks logout while completed visits remain queued', async () => {
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'queue' ? [fixtures.draft] : undefined)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with PIN' }))
    await screen.findByText(/Good day, Ana/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open profile' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Synchronize all completed visits')
    expect(fixtures.api.logout).not.toHaveBeenCalled()
    expect(fixtures.vault.clearVault).not.toHaveBeenCalled()
  })

  it('blocks sign out while unfinished drafts remain and routes to Current Work', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'active-draft' ? fixtures.draft : undefined)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with PIN' }))
    await screen.findByText(/Good day, Ana/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open profile' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Save or discard every unfinished visit')
    expect(screen.getByRole('heading', { name: 'Monitoring' })).toBeInTheDocument()
    expect(fixtures.api.logout).not.toHaveBeenCalled()
    expect(fixtures.vault.clearVault).not.toHaveBeenCalled()
  })

  it('automatically attempts enrolled biometrics, then offers retry and PIN after cancellation', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.hasBiometricUnlock.mockResolvedValue(true)
    fixtures.vault.getVaultPinLength.mockResolvedValue(4)
    fixtures.vault.getBiometricUnlockAvailability.mockResolvedValue('available')
    fixtures.vault.isBiometricUnlockAvailable.mockResolvedValue(true)
    fixtures.vault.unlockVaultWithBiometrics.mockRejectedValue(new Error('Biometric verification was not completed.'))
    render(<App />)

    await waitFor(() => expect(fixtures.vault.unlockVaultWithBiometrics).toHaveBeenCalledTimes(1))
    const retry = await screen.findByRole('button', { name: /Try biometric again/i })
    const usePin = screen.getByRole('button', { name: /Use device PIN/i })
    expect(usePin).toBeInTheDocument()
    expect(screen.getByAltText('DTI Official Logo')).toBeInTheDocument()
    fireEvent.click(retry)
    await waitFor(() => expect(fixtures.vault.unlockVaultWithBiometrics).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /Use device PIN/i }))
    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /Back to unlock options/i }))

    expect(await screen.findByRole('button', { name: /Try biometric again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Use device PIN/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('4-digit device PIN')).not.toBeInTheDocument()
    expect(fixtures.vault.unlockVaultWithBiometrics).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: /Use device PIN/i }))
    expect(await screen.findByLabelText('4-digit device PIN')).toHaveValue('')
  })

  it('keeps one biometric request in flight when the app rerenders', async () => {
    let rejectBiometric!: (reason: Error) => void
    const pendingBiometric = new Promise<never>((_resolve, reject) => { rejectBiometric = reject })
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.hasBiometricUnlock.mockResolvedValue(true)
    fixtures.vault.getVaultPinLength.mockResolvedValue(4)
    fixtures.vault.getBiometricUnlockAvailability.mockResolvedValue('available')
    fixtures.vault.unlockVaultWithBiometrics.mockReturnValue(pendingBiometric)
    render(<App />)

    await waitFor(() => expect(fixtures.vault.unlockVaultWithBiometrics).toHaveBeenCalledTimes(1))
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    await act(async () => { window.dispatchEvent(new Event('online')) })

    expect(fixtures.vault.unlockVaultWithBiometrics).toHaveBeenCalledTimes(1)
    rejectBiometric(new Error('Biometric verification was not completed.'))
    expect(await screen.findByRole('button', { name: /Try biometric again/i })).toBeInTheDocument()
  })

  it('does not report a stalled online refresh as a biometric failure', async () => {
    const leaseRefresh = deferred<typeof fixtures.session.offline_lease>()
    const expiredSession = { ...fixtures.session, offline_lease: { id: 'lease-old', expires_at: '2020-01-01T00:00:00Z' } }
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.hasBiometricUnlock.mockResolvedValue(true)
    fixtures.vault.getVaultPinLength.mockResolvedValue(4)
    fixtures.vault.getBiometricUnlockAvailability.mockResolvedValue('available')
    fixtures.vault.unlockVaultWithBiometrics.mockResolvedValue({ requiresPinMigration: false })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: expiredSession,
      bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
    })[key])
    fixtures.api.renewLease.mockReturnValue(leaseRefresh.promise)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })

    render(<App />)

    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try biometric again/i })).not.toBeInTheDocument()
    leaseRefresh.resolve({ id: 'lease-new', expires_at: '2099-08-30T00:00:00Z' })
  })

  it.each(['bootstrap', 'verification-requests', 'notifications'])('opens protected field work when the %s cache is unreadable', async (failedKey) => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.readSecret.mockImplementation(async (key: string) => {
      if (key === 'session') return fixtures.session
      if (key === failedKey) throw new Error('IndexedDB record unreadable')
      return undefined
    })
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    expect(screen.getByText('Downloaded data needs refresh')).toBeInTheDocument()
    expect(fixtures.vault.lockVault).not.toHaveBeenCalled()
  })

  it.each([
    ['queue', 'PW-WORK-QUEUE'],
    ['drafts', 'PW-WORK-DRAFTS'],
  ])('preserves unreadable protected %s data and shows support code %s', async (failedKey, supportCode) => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => {
      if (key === 'session') return fixtures.session
      if (key === failedKey) throw new Error('IndexedDB record unreadable')
      return undefined
    })
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByRole('heading', { name: 'Encrypted field work needs recovery' })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(supportCode))).toBeInTheDocument()
    expect(fixtures.vault.clearVault).not.toHaveBeenCalled()
    expect(fixtures.vault.createVault).not.toHaveBeenCalled()
  })

  it('does not read the legacy active draft when canonical drafts exist', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    localStorage.setItem('field-guide:1:v1', 'complete')
    fixtures.vault.readSecret.mockImplementation(async (key: string) => {
      if (key === 'session') return fixtures.session
      if (key === 'drafts') return [fixtures.draft]
      if (key === 'active-draft') throw new Error('stale legacy record unreadable')
      return undefined
    })
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    expect(fixtures.vault.readSecret).not.toHaveBeenCalledWith('active-draft')
  })

  it('preserves an unreadable legacy draft when canonical drafts are absent', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => {
      if (key === 'session') return fixtures.session
      if (key === 'active-draft') throw new Error('legacy record unreadable')
      return undefined
    })
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByRole('heading', { name: 'Encrypted field work needs recovery' })).toBeInTheDocument()
    expect(screen.getByText(/PW-WORK-LEGACY/)).toBeInTheDocument()
    expect(fixtures.vault.deleteSecret).not.toHaveBeenCalledWith('active-draft')
  })

  it('repairs only an unreadable session after online login and another device unlock', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    localStorage.setItem('field-guide:1:v1', 'complete')
    let sessionReads = 0
    fixtures.vault.readSecret.mockImplementation(async (key: string) => {
      if (key === 'session' && sessionReads++ === 0) throw new Error('session record unreadable')
      return undefined
    })
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    expect(await screen.findByRole('heading', { name: 'Repair device session' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Authenticate' }))
    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByText(/Good day, Ana/i)).toBeInTheDocument()
    expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('session', fixtures.session)
    expect(fixtures.vault.clearVault).not.toHaveBeenCalled()
    expect(fixtures.vault.createVault).not.toHaveBeenCalled()
  })

  it('shows when the PIN is verified while local workspace data opens', async () => {
    const savedSession = deferred<typeof fixtures.session>()
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'session' ? savedSession.promise : undefined)
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    expect(await screen.findByRole('status')).toHaveTextContent('PIN verified. Opening secure workspace')
    savedSession.resolve(fixtures.session)
  })

  it('treats missing PIN-length metadata as four digits and auto-unlocks without a submit button', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.getVaultPinLength.mockResolvedValue(null)
    render(<App />)

    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    await waitFor(() => expect(fixtures.vault.unlockVault).toHaveBeenCalledTimes(1))
    expect(fixtures.vault.unlockVault).toHaveBeenCalledWith('4321')
    expect(screen.queryByRole('button', { name: /Unlock workspace/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /older 5–8 digit PIN/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back to unlock options/i })).not.toBeInTheDocument()
  })

  it('clears a rejected auto-submitted PIN for visible error recovery', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    fixtures.vault.getVaultPinLength.mockResolvedValue(4)
    fixtures.vault.unlockVault.mockRejectedValue(new Error('Incorrect device PIN.'))
    render(<App />)

    const pinInput = await screen.findByLabelText('4-digit device PIN')
    fireEvent.change(pinInput, { target: { value: '9999' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect device PIN.')
    expect(pinInput).toHaveValue('')
  })
})
