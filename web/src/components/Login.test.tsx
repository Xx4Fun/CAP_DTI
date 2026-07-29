import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import { Login } from './Login'

vi.mock('../services/api', () => ({
  default: { post: vi.fn() },
}))

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the complete DTI artwork across the full left column', () => {
    render(<Login onLoginSuccess={vi.fn()} />)

    const artwork = screen.getByRole('img', {
      name: 'DTI fair trade and consumer protection illustration',
    })

    expect(artwork).toHaveAttribute('src', '/login-left1.png')
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
})
