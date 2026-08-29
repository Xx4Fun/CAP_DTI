// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Login } from './Login'
import { fieldApi } from '../services/fieldApi'

vi.mock('../services/fieldApi', () => ({
  fieldApi: {
    login: vi.fn(),
  },
  apiError: vi.fn((err: any, fallback: string) => err?.message || fallback),
}))

describe('Field Officer PWA Responsive 1:1 Login Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the complete DTI artwork (.webp) and 1:1 branding matching the Admin login design', () => {
    const onAuthenticated = vi.fn()
    const { container } = render(<Login onAuthenticated={onAuthenticated} />)

    // Main container has responsive class
    expect(container.querySelector('.login-container')).toBeInTheDocument()
    expect(container.querySelector('.auth-shell')).toBeInTheDocument()

    // Left column artwork (.webp)
    const artwork = screen.getByAltText('DTI fair trade and consumer protection illustration')
    expect(artwork).toBeInTheDocument()
    expect(artwork.getAttribute('src')).toBe('/branding/login-artwork.webp')
    expect(artwork.parentElement).toHaveClass('login-left-column')

    // Right column official DTI logo
    const logo = screen.getByAltText('DTI Official Logo')
    expect(logo).toBeInTheDocument()
    expect(logo.getAttribute('src')).toBe('/branding/dti-logo.svg')
    expect(logo).toHaveClass('login-dti-logo')

    // Header & Subtitle
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/PRICE-Watch/)
    expect(screen.getByText('— DTI Field Monitoring —')).toBeInTheDocument()

    // Card and Form inputs with touch-friendly classes
    expect(container.querySelector('.login-card')).toBeInTheDocument()
    expect(screen.getByLabelText(/Email address/i)).toHaveClass('login-input')
    expect(screen.getByLabelText(/^Password/i)).toHaveClass('login-input')
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('login-btn')

    // Footer items
    expect(screen.getByText('Secure. Official. Committed to Fair Trade.')).toBeInTheDocument()
    expect(screen.getByText('Protecting Consumers. Supporting Businesses.')).toBeInTheDocument()
  })

  it('toggles password visibility with the show/hide password button and accessible touch target', async () => {
    const user = userEvent.setup()
    render(<Login onAuthenticated={vi.fn()} />)

    const passwordInput = screen.getByLabelText(/^Password/i) as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    const toggleButton = screen.getByRole('button', { name: 'Show password' })
    expect(toggleButton).toHaveClass('login-password-toggle')

    await user.click(toggleButton)
    expect(passwordInput.type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordInput.type).toBe('password')
  })

  it('submits final credentials and proceeds directly with the authenticated session', async () => {
    const user = userEvent.setup()
    const mockSession = {
      token: 'officer-jwt-token',
      user: { id: 1, name: 'Officer Juan', email: 'officer@dti.gov.ph', role: 'field_officer' },
      offline_lease: { id: 'lease-1', expires_at: '2026-08-30T00:00:00Z' },
      must_change_password: false,
    }
    vi.mocked(fieldApi.login).mockResolvedValue(mockSession as any)

    const onAuthenticated = vi.fn()
    render(<Login onAuthenticated={onAuthenticated} />)

    await user.type(screen.getByLabelText(/Email address/i), 'officer@dti.gov.ph')
    await user.type(screen.getByLabelText(/^Password/i), 'SecurePass123!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(fieldApi.login).toHaveBeenCalledWith('officer@dti.gov.ph', 'SecurePass123!')
    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(mockSession)
    })
  })

  it('displays an error alert message when login fails', async () => {
    const user = userEvent.setup()
    vi.mocked(fieldApi.login).mockRejectedValue(new Error('The email or password is incorrect.'))

    render(<Login onAuthenticated={vi.fn()} />)

    await user.type(screen.getByLabelText(/Email address/i), 'officer@dti.gov.ph')
    await user.type(screen.getByLabelText(/^Password/i), 'WrongPassword')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/The email or password is incorrect\./)
      expect(screen.getByRole('alert')).toHaveClass('login-error-badge')
    })
  })
})
