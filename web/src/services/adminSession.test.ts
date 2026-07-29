import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAdminSession,
  getAdminSessionState,
  getAdminToken,
  storeAdminToken,
} from './adminSession'

describe('adminSession', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearAdminSession()
  })

  it('keeps a DTI token in session storage rather than persistent local storage', () => {
    storeAdminToken('dti-token')

    expect(getAdminToken()).toBe('dti-token')
    expect(sessionStorage.getItem('price-watch.admin.token')).toBe('dti-token')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('classifies the approved warning and expiry boundaries', () => {
    const lastActivity = new Date('2026-07-30T08:00:00Z').getTime()

    expect(getAdminSessionState(lastActivity, lastActivity + 12 * 60_000, 900)).toBe('active')
    expect(getAdminSessionState(lastActivity, lastActivity + 13 * 60_000, 900)).toBe('warning')
    expect(getAdminSessionState(lastActivity, lastActivity + 15 * 60_000, 900)).toBe('expired')
  })
})
