// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const fixtures = vi.hoisted(() => ({
  session: {
    token: 'token', must_change_password: true,
    user: { id: 1, name: 'Ana Officer', email: 'ana@dti.test', role: 'field_officer' as const },
    offline_lease: { id: 'lease-old', expires_at: '2099-08-29T00:00:00Z' },
  },
  vault: {
    clearVault: vi.fn(), createVault: vi.fn(), deleteSecret: vi.fn(), enableBiometricUnlock: vi.fn(),
    hasBiometricUnlock: vi.fn().mockResolvedValue(false), hasVault: vi.fn().mockResolvedValue(false),
    isBiometricUnlockAvailable: vi.fn().mockResolvedValue(false), lockVault: vi.fn(),
    readSecret: vi.fn(), unlockVault: vi.fn(), unlockVaultWithBiometrics: vi.fn(), writeSecret: vi.fn(),
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

vi.mock('./components/Login', () => ({
  Login: ({ onAuthenticated }: { onAuthenticated: (session: typeof fixtures.session, mustChange: boolean) => void }) =>
    <button onClick={() => onAuthenticated(fixtures.session, true)}>Authenticate</button>,
}))
vi.mock('./components/InstallPrompt', () => ({ InstallPrompt: () => null }))
vi.mock('./app/vault', () => fixtures.vault)
vi.mock('./services/fieldApi', () => ({ fieldApi: fixtures.api, apiError: (_error: unknown, fallback: string) => fallback }))

describe('field workspace security flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixtures.vault.hasVault.mockResolvedValue(false)
    fixtures.vault.hasBiometricUnlock.mockResolvedValue(false)
    fixtures.vault.isBiometricUnlockAvailable.mockResolvedValue(false)
    fixtures.vault.readSecret.mockResolvedValue(undefined)
    fixtures.api.renewLease.mockResolvedValue({ id: 'lease-new', expires_at: '2099-08-30T00:00:00Z' })
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
  })

  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('goes from final credentials directly to device PIN setup', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    expect(await screen.findByRole('heading', { name: 'Protect offline access' })).toBeInTheDocument()
    expect(screen.queryByText(/Replace temporary password/i)).not.toBeInTheDocument()
  })

  it('locks after sixty background seconds but not before', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('New device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '4321' } })
    fireEvent.click(screen.getByRole('button', { name: /Secure this device/i }))
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

  it('silently renews the lease on an online unlock and moves only the draft', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session, bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      queue: [{ ...fixtures.draft, finalized_at: '2026-08-28T01:00:00Z' }], 'active-draft': fixtures.draft,
    })[key])
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Device PIN'), { target: { value: '4321' } })
    fireEvent.click(screen.getByRole('button', { name: /Unlock with PIN/i }))

    await waitFor(() => expect(fixtures.api.renewLease).toHaveBeenCalledWith('token'))
    expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('active-draft', expect.objectContaining({ offline_lease_id: 'lease-new' }))
    await waitFor(() => expect(fixtures.api.sync).toHaveBeenCalledWith('token', [expect.objectContaining({ offline_lease_id: 'lease-old' })]))
  })

  it('blocks logout while completed visits remain queued', async () => {
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'queue' ? [fixtures.draft] : undefined)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('New device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '4321' } })
    fireEvent.click(screen.getByRole('button', { name: /Secure this device/i }))
    await screen.findByText(/Good day, Ana/i)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Synchronize all completed visits')
    expect(fixtures.api.logout).not.toHaveBeenCalled()
    expect(fixtures.vault.clearVault).not.toHaveBeenCalled()
  })

  it('requires explicit draft discard before a clean online logout clears local data', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'active-draft' ? fixtures.draft : undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('New device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '4321' } })
    fireEvent.click(screen.getByRole('button', { name: /Secure this device/i }))
    await screen.findByText(/Good day, Ana/i)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(fixtures.api.logout).toHaveBeenCalledWith('token'))
    expect(confirm).toHaveBeenCalled()
    expect(fixtures.vault.deleteSecret).toHaveBeenCalledWith('active-draft')
    expect(fixtures.vault.clearVault).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Authenticate' })).toBeInTheDocument()
  })
})
