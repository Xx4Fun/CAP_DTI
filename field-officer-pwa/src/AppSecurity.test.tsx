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
    getBiometricUnlockAvailability: vi.fn().mockResolvedValue('prf-unsupported'),
    getVaultPinLength: vi.fn().mockResolvedValue(null), hasBiometricUnlock: vi.fn().mockResolvedValue(false), hasVault: vi.fn().mockResolvedValue(false),
    isBiometricUnlockAvailable: vi.fn().mockResolvedValue(false), lockVault: vi.fn(),
    readSecret: vi.fn(), restoreVaultSession: vi.fn().mockResolvedValue(false), rewrapVaultPin: vi.fn(),
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

vi.mock('./components/Login', () => ({
  LoginForm: ({ onAuthenticated }: { onAuthenticated: (session: typeof fixtures.session, mustChange: boolean) => void }) =>
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
    fixtures.vault.getBiometricUnlockAvailability.mockResolvedValue('prf-unsupported')
    fixtures.vault.getVaultPinLength.mockResolvedValue(null)
    fixtures.vault.isBiometricUnlockAvailable.mockResolvedValue(false)
    fixtures.vault.restoreVaultSession.mockResolvedValue(false)
    fixtures.vault.unlockVault.mockResolvedValue({ requiresPinMigration: false })
    fixtures.vault.readSecret.mockResolvedValue(undefined)
    fixtures.api.renewLease.mockResolvedValue({ id: 'lease-new', expires_at: '2099-08-30T00:00:00Z' })
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
  })

  afterEach(() => { cleanup(); vi.useRealTimers() })

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
    expect(screen.queryByRole('heading', { name: 'Unlock field workspace' })).not.toBeInTheDocument()
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

  it('silently renews the lease on an online unlock and moves only the draft', async () => {
    fixtures.vault.hasVault.mockResolvedValue(true)
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    fixtures.vault.readSecret.mockImplementation(async (key: string) => ({
      session: fixtures.session, bootstrap: { version: 'cached', is_delta: false, stores: [], srp_bulletins: [], recent_prices: [] },
      queue: [{ ...fixtures.draft, finalized_at: '2026-08-28T01:00:00Z' }], 'active-draft': fixtures.draft,
    })[key])
    render(<App />)
    fireEvent.change(await screen.findByLabelText('4-digit device PIN'), { target: { value: '4321' } })

    await waitFor(() => expect(fixtures.api.renewLease).toHaveBeenCalledWith('token'))
    expect(fixtures.vault.writeSecret).toHaveBeenCalledWith('active-draft', expect.objectContaining({ offline_lease_id: 'lease-new' }))
    await waitFor(() => expect(fixtures.api.sync).toHaveBeenCalledWith('token', [expect.objectContaining({ offline_lease_id: 'lease-old' })]))
  })

  it('blocks logout while completed visits remain queued', async () => {
    fixtures.vault.readSecret.mockImplementation(async (key: string) => key === 'queue' ? [fixtures.draft] : undefined)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Authenticate' }))
    fireEvent.change(screen.getByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with PIN' }))
    await screen.findByText(/Good day, Ana/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Profile' })[0])
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
    fireEvent.change(screen.getByLabelText('4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.change(screen.getByLabelText('Confirm 4-digit device PIN'), { target: { value: '4321' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with PIN' }))
    await screen.findByText(/Good day, Ana/i)
    fireEvent.click(screen.getAllByRole('button', { name: 'Profile' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(fixtures.api.logout).toHaveBeenCalledWith('token'))
    expect(confirm).toHaveBeenCalled()
    expect(fixtures.vault.deleteSecret).toHaveBeenCalledWith('active-draft')
    expect(fixtures.vault.clearVault).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Authenticate' })).toBeInTheDocument()
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
