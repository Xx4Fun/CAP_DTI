import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'
import { clearAdminSession, storeAdminToken } from './adminSession'

const session = api as any
const challenge = (config: InternalAxiosRequestConfig) => Promise.reject(Object.assign(new Error('challenge'), {
  config, response: { status: 403, data: { status: 'REAUTHENTICATION_REQUIRED' }, config, headers: {}, statusText: '' },
}))
const ok = (config: InternalAxiosRequestConfig) => Promise.resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config })

describe('api re-authentication queue', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    clearAdminSession()
    storeAdminToken('first-user')
  })

  it('never replays a queued sensitive action under the next user after logout', async () => {
    const sent: string[] = []
    const adapter: AxiosAdapter = (config) => {
      sent.push(String(config.headers.Authorization))
      return (config as any)._adminReauthenticationRetry ? ok(config) : challenge(config)
    }
    const queued = api.post('/admin/users/1/password', {}, { adapter })
    await vi.waitFor(() => expect(sent).toHaveLength(1))

    session.endAdminSession()
    clearAdminSession()
    session.finishAdminLogout()
    storeAdminToken('second-user')
    session.resumePendingAdminRequests()

    await expect(queued).rejects.toThrow()
    expect(sent).toEqual(['Bearer first-user'])
  })

  it('ignores a late challenge or 401 from the previous session', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let sent = 0
    const adapter: AxiosAdapter = async (config) => {
      sent += 1
      await gate
      if (config.url === '/admin/session') {
        return Promise.reject(Object.assign(new Error('expired'), { config, response: { status: 401, data: {}, config, headers: {}, statusText: '' } }))
      }
      return challenge(config)
    }
    const expired = vi.fn()
    const challenged = vi.fn()
    window.addEventListener('admin-auth-expired', expired)
    window.addEventListener('admin-reauthentication-required', challenged)

    const late = api.post('/admin/settings', {}, { adapter })
    const lateExpiry = api.get('/admin/session', { adapter })
    await vi.waitFor(() => expect(sent).toBe(2))
    session.endAdminSession()
    session.finishAdminLogout()
    storeAdminToken('second-user')
    release()

    await expect(late).rejects.toThrow('challenge')
    await expect(lateExpiry).rejects.toThrow('expired')
    expect(challenged).not.toHaveBeenCalled()
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener('admin-auth-expired', expired)
    window.removeEventListener('admin-reauthentication-required', challenged)
  })

  it('refuses new requests while logout is in progress, except the logout itself', async () => {
    const adapter: AxiosAdapter = (config) => ok(config)
    session.endAdminSession()
    await expect(api.post('/admin/settings', {}, { adapter })).rejects.toThrow('Signing out.')
    await expect(api.post('/logout', {}, { adapter })).resolves.toMatchObject({ status: 200 })
    session.finishAdminLogout()
  })

  it('still replays a confirmed action within the same session', async () => {
    const adapter: AxiosAdapter = (config) => (config as any)._adminReauthenticationRetry ? ok(config) : challenge(config)
    const challenged = new Promise((resolve) => window.addEventListener('admin-reauthentication-required', resolve, { once: true }))
    const queued = api.post('/admin/users/1/password', {}, { adapter })
    await challenged
    session.resumePendingAdminRequests()
    await expect(queued).resolves.toMatchObject({ data: { ok: true } })
  })
})
