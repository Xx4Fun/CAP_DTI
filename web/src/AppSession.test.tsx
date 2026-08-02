import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './services/api'
import App from './App'

vi.mock('./services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('./services/adminApi', () => ({
  adminApi: {
    getOverview: vi.fn().mockResolvedValue({ stores: 0, pending_reports: 0, active_emergencies: 0 }),
    getStores: vi.fn().mockResolvedValue([]),
    getReports: vi.fn().mockResolvedValue([]),
    getEmergencies: vi.fn().mockResolvedValue([]),
    getAuditEvents: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({}),
  },
}))

describe('DTI Admin application session', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('does not trust a DTI user copied from local storage', async () => {
    localStorage.setItem('token', 'stale-token')
    localStorage.setItem('user', JSON.stringify({
      id: 1,
      name: 'Evaluator',
      email: 'evaluator@dti.test',
      role: 'dti_evaluator',
    }))

    render(<App />)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /regulatory overview/i })).not.toBeInTheDocument()
  })

  it('opens Admin only after the server validates the session token', async () => {
    sessionStorage.setItem('price-watch.admin.token', 'valid-token')
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: {
          user: {
            id: 1,
            name: 'Evaluator',
            email: 'evaluator@dti.test',
            role: 'dti_evaluator',
          },
          session: {
            expires_at: '2026-07-30T16:00:00+00:00',
            idle_timeout_seconds: 900,
            absolute_timeout_seconds: 28800,
          },
        },
      },
    })

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(/checking secure session/i)
    expect(await screen.findByRole('heading', { level: 1, name: /regulatory overview/i })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/admin/session')
  })

  it('revokes the server token before clearing the browser session on logout', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('price-watch.admin.token', 'valid-token')
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: {
          user: {
            id: 1,
            name: 'Evaluator',
            email: 'evaluator@dti.test',
            role: 'dti_evaluator',
          },
          session: {
            expires_at: '2026-07-30T16:00:00+00:00',
            idle_timeout_seconds: 900,
            absolute_timeout_seconds: 28800,
          },
        },
      },
    })
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Logged out successfully' } })

    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /regulatory overview/i })
    await user.click(screen.getByRole('button', { name: /Evaluator account/i }))
    await user.click(screen.getByRole('button', { name: /logout/i }))
    await user.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/logout'))
    expect(sessionStorage.getItem('price-watch.admin.token')).toBeNull()
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('requires password reauthentication after a sensitive action is challenged', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('price-watch.admin.token', 'valid-token')
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: {
        user: { id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' },
        session: { expires_at: '2026-07-30T16:00:00+00:00', idle_timeout_seconds: 900, absolute_timeout_seconds: 28800 },
      } },
    })
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: { reauthenticated_until: '2026-07-30T10:05:00+00:00' } } })

    render(<App />)
    await screen.findByText('REGISTERED STORES')
    window.dispatchEvent(new Event('admin-reauthentication-required'))

    expect(await screen.findByRole('dialog', { name: /confirm sensitive action/i })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: /confirm identity/i }))

    expect(api.post).toHaveBeenCalledWith('/admin/reauthenticate', { password: 'correct horse' })
    expect(screen.queryByRole('dialog', { name: /confirm sensitive action/i })).not.toBeInTheDocument()
  })

  it('explains when the officer was logged out due to inactivity', async () => {
    sessionStorage.setItem('price-watch.admin.token', 'valid-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/admin/session') {
        return Promise.resolve({
          data: { data: {
            user: { id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' },
            session: { expires_at: '2026-07-30T16:00:00+00:00', idle_timeout_seconds: 900, absolute_timeout_seconds: 28800 },
          } },
        })
      }
      if (url === '/admin/overview') {
        return Promise.resolve({
          data: { data: { stores: 5, pending_reports: 2, active_emergencies: 0 } },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    })
    vi.mocked(api.post).mockResolvedValue({ data: { message: 'Logged out successfully' } })

    render(<App />)
    await screen.findByRole('heading', { level: 1, name: /overview/i })
    await act(async () => {
      window.dispatchEvent(new CustomEvent('admin-auth-expired', { detail: { reason: 'inactivity' } }))
    })

    expect(await screen.findByText('You were logged out due to inactivity. Sign in again to continue.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
