import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './services/api'
import App from './App'
import { AdminToastHost } from './components/admin/AdminToastHost'

vi.mock('./services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('./services/apiReadiness', () => ({
  ensureApiReady: vi.fn().mockResolvedValue(undefined),
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

    render(<><App /><AdminToastHost /></>)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^dashboard$/i })).not.toBeInTheDocument()
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

    render(<><App /><AdminToastHost /></>)

    expect(screen.getByRole('status')).toHaveTextContent(/checking secure session/i)
    expect(await screen.findByRole('heading', { level: 1, name: /^dashboard$/i })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/admin/session')
  })

  it('directs a field officer to the dedicated PWA instead of opening Admin', async () => {
    sessionStorage.setItem('price-watch.admin.token', 'field-token')
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: {
        user: { id: 8, name: 'Field Officer', email: 'field@dti.test', role: 'field_officer' },
        session: { expires_at: '2026-07-30T16:00:00+00:00', idle_timeout_seconds: 900, absolute_timeout_seconds: 28800 },
      } },
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: /Use the Field Monitoring PWA/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: /^dashboard$/i })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('price-watch.admin.token')).toBeNull()
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

    render(<><App /><AdminToastHost /></>)
    await screen.findByRole('heading', { level: 1, name: /^dashboard$/i })
    const accountTrigger = await screen.findByRole('button', { name: /Officer account profile and options/i })
    await user.click(accountTrigger)
    await user.click(screen.getByRole('menuitem', { name: /^logout$/i }))
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

    render(<><App /><AdminToastHost /></>)
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

    render(<><App /><AdminToastHost /></>)
    // The heading is in the DOM before App's effect subscribes to this event. Dashboard data
    // only renders after that effect pass, so wait for it or the event can be dispatched unheard.
    await screen.findByText('REGISTERED STORES')
    await act(async () => {
      window.dispatchEvent(new CustomEvent('admin-auth-expired', { detail: { reason: 'inactivity' } }))
    })

    const notice = await screen.findByText('You were logged out due to inactivity. Sign in again to continue.', {}, { timeout: 10000 })
    expect(notice.closest('[data-sonner-toast]')).toBeInTheDocument()
    expect(screen.queryByText('You were logged out due to inactivity. Sign in again to continue.', { selector: '.login-notice-badge' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  }, 15000)

  it('deduplicates repeated session-expiry notifications', async () => {
    sessionStorage.setItem('price-watch.admin.token', 'valid-token')
    vi.mocked(api.get).mockResolvedValue({
      data: { data: {
        user: { id: 1, name: 'Evaluator', email: 'evaluator@dti.test', role: 'dti_evaluator' },
        session: { expires_at: '2026-07-30T16:00:00+00:00', idle_timeout_seconds: 900, absolute_timeout_seconds: 28800 },
      } },
    })
    vi.mocked(api.post).mockResolvedValue({ data: { message: 'Logged out successfully' } })

    render(<><App /><AdminToastHost /></>)
    // The heading is in the DOM before App's effect subscribes to this event. Dashboard data
    // only renders after that effect pass, so wait for it or the event can be dispatched unheard.
    await screen.findByText('REGISTERED STORES')
    await act(async () => {
      window.dispatchEvent(new Event('admin-auth-expired'))
      window.dispatchEvent(new Event('admin-auth-expired'))
    })

    expect(await screen.findAllByText('Your secure session expired. Sign in again to continue.')).toHaveLength(1)
  })
})
