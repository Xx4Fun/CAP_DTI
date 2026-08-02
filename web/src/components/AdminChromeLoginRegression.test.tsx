import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import adminCss from './admin/admin.css?raw'
import adminShellSource from './admin/AdminShell.tsx?raw'
import api from '../services/api'
import { Login } from './Login'

vi.mock('../services/api', () => ({
  default: { post: vi.fn() },
}))

describe('DTI Admin chrome and login feedback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the original sidebar gradient for the sidebar and solid top color for sticky header', () => {
    expect(adminCss).toContain(
      '--sidebar-gradient: linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%);',
    )
    expect(adminCss).not.toContain('--sidebar-gradient: var(--admin-chrome);')
    expect(adminCss).toMatch(
      /\.admin-sidebar\s*\{[^}]*background:\s*var\(--sidebar-gradient\)\s*!important;/s,
    )
    expect(adminCss).toMatch(
      /\.admin-top-header\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\)\s*!important;/s,
    )
  })

  it('removes only the decorative title shield from the sticky header', () => {
    expect(adminShellSource).not.toContain('title="DTI Portal Home"')
    expect(adminShellSource).not.toContain('<Shield size={20} />')
    expect(adminShellSource).toContain(
      '<Shield size={14} aria-hidden="true" /> Normal Market Protocol',
    )
  })

  it('shows an accessible animated progress indicator while login is pending', async () => {
    const user = userEvent.setup()
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}))
    render(<Login onLoginSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText(/email address/i), 'officer@dti.test')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const button = screen.getByRole('button', { name: /signing in/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.login-button-spinner')).toBeInTheDocument()
  })
})
