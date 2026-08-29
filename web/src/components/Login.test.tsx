import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import { Login } from './Login'

vi.mock('../services/api', () => ({
  default: { post: vi.fn() },
}))

const { ensureApiReadyMock } = vi.hoisted(() => ({
  ensureApiReadyMock: vi.fn<() => Promise<void>>(),
}))

vi.mock('../services/apiReadiness', () => ({
  ensureApiReady: ensureApiReadyMock,
}))

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureApiReadyMock.mockResolvedValue(undefined)
  })

  it('renders the complete DTI artwork across the full left column', () => {
    render(<Login onLoginSuccess={vi.fn()} />)

    const artwork = screen.getByRole('img', {
      name: 'DTI fair trade and consumer protection illustration',
    })

    expect(artwork).toHaveAttribute('src', '/branding/login-artwork.webp')
    expect(artwork).toHaveStyle({
      width: '100%',
      height: '100vh',
      objectFit: 'cover',
    })
    expect(artwork.parentElement).toHaveClass('login-left-column')
  })

  it('never displays backend exception or database details', async () => {
    const user = userEvent.setup()
    vi.mocked(api.post).mockRejectedValue({
      response: {
        status: 500,
        data: { message: 'SQLSTATE[42P01] relation audit_events does not exist (Connection: pgsql)' },
      },
    })
    render(<Login onLoginSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText(/email address/i), 'officer@dti.test')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is temporarily unavailable. Please try again later.')
    expect(screen.queryByText(/SQLSTATE|audit_events|pgsql/i)).not.toBeInTheDocument()
  })

  it('waits for readiness without inserting startup status into the form layout', async () => {
    let releaseReadiness: (() => void) | undefined
    ensureApiReadyMock.mockReturnValue(new Promise<void>((resolve) => {
      releaseReadiness = resolve
    }))
    vi.mocked(api.post).mockResolvedValue({
      data: {
        token: 'token',
        user: { id: 1, name: 'Officer', email: 'officer@dti.test', role: 'super_admin' },
      },
    })
    const user = userEvent.setup()
    render(<Login onLoginSuccess={vi.fn()} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/email address/i), 'officer@dti.test')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(api.post).not.toHaveBeenCalled()

    releaseReadiness?.()
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  })
})
