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

vi.mock('../services/apiReadiness', () => ({
  ensureApiReady: vi.fn().mockResolvedValue(undefined),
}))

describe('DTI Admin chrome and login feedback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the original dark-blue sidebar palette without changing the shell layout', () => {
    expect(adminCss).toContain(
      '--sidebar-gradient: linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%);',
    )
    expect(adminCss).toContain('--sidebar-text: rgba(255, 255, 255, 0.85);')
    expect(adminCss).toContain('--sidebar-muted: rgba(255, 255, 255, 0.48);')
    expect(adminCss).toContain('--sidebar-active-bg: rgba(255, 255, 255, 0.18);')
    expect(adminCss).toContain('--sidebar-active-border: #7dd3fc;')
    expect(adminCss).toContain('--sidebar-hover-bg: rgba(255, 255, 255, 0.10);')
    expect(adminCss).toMatch(
      /\.admin-sidebar\s*\{[^}]*background:\s*var\(--sidebar-gradient\)\s*!important;/s,
    )
    expect(adminCss).toMatch(
      /\.admin-brand-header::after\s*\{[^}]*height:\s*1px;[^}]*background:\s*linear-gradient\(90deg,\s*transparent,\s*rgba\(255,\s*255,\s*255,\s*0\.22\)\s*15%,\s*rgba\(255,\s*255,\s*255,\s*0\.22\)\s*85%,\s*transparent\);/s,
    )
    expect(adminCss).toMatch(
      /\.sidebar-profile-card\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.32\)\s*!important;[^}]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.22\)\s*!important;/s,
    )
    expect(adminCss).toMatch(
      /\.admin-top-header\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\)\s*!important;/s,
    )
  })

  it('aligns the sidebar divider and workspace header on one 68px shell row', () => {
    expect(adminCss).toContain('--admin-shell-header-height: 68px;')
    expect(adminCss).toMatch(
      /\.admin-brand-header\s*\{[^}]*height:\s*var\(--admin-shell-header-height\);/s,
    )
    expect(adminCss).toMatch(
      /\.admin-top-header\s*\{[^}]*height:\s*var\(--admin-shell-header-height\);/s,
    )
  })

  it('keeps selected child navigation active while hovered', () => {
    expect(adminCss).toMatch(
      /\.admin-sidebar \.admin-nav-child:hover\s*\{[^}]*background:\s*var\(--sidebar-hover-bg\);[^}]*color:\s*#ffffff;/s,
    )
    expect(adminCss).toMatch(
      /\.admin-sidebar \.admin-nav-child\.active,\s*\.admin-sidebar \.admin-nav-child\.active:hover\s*\{[^}]*background:\s*var\(--sidebar-active-bg\);[^}]*color:\s*#ffffff;/s,
    )
  })

  it('uses the checkpoint account card geometry without persistent copy masking', () => {
    expect(adminCss).not.toContain('.sidebar-copy')
    expect(adminCss).toMatch(
      /\.sidebar-profile-card\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0\.75rem\s*!important;[^}]*gap:\s*0\.75rem\s*!important;[^}]*margin-top:\s*1rem\s*!important;/s,
    )
    expect(adminCss).toMatch(
      /\.admin-sidebar\.collapsed \.sidebar-profile-card\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*justify-content:\s*center;/s,
    )
    expect(adminCss).toMatch(
      /\.profile-icon-container\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/s,
    )
  })

  it('restores the checkpoint child navigation typography', () => {
    expect(adminCss).toMatch(
      /\.admin-nav-child\s*\{[^}]*font-size:\s*0\.92rem\s*!important;/s,
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
