const ADMIN_TOKEN_KEY = 'price-watch.admin.token'
const ADMIN_ACTIVITY_KEY = 'price-watch.admin.last-activity'

let memoryToken: string | null = null

export type AdminSessionState = 'active' | 'warning' | 'expired'

export function storeAdminToken(token: string): void {
  memoryToken = token
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
  touchAdminActivity()
}

export function getAdminToken(): string | null {
  if (memoryToken) return memoryToken
  memoryToken = sessionStorage.getItem(ADMIN_TOKEN_KEY)
  return memoryToken
}

export function getAuthToken(): string | null {
  return getAdminToken() || localStorage.getItem('token')
}

export function clearAdminSession(): void {
  memoryToken = null
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  sessionStorage.removeItem(ADMIN_ACTIVITY_KEY)
}

export function touchAdminActivity(at = Date.now()): void {
  sessionStorage.setItem(ADMIN_ACTIVITY_KEY, String(at))
}

export function getAdminLastActivity(): number {
  const stored = Number(sessionStorage.getItem(ADMIN_ACTIVITY_KEY))
  return Number.isFinite(stored) && stored > 0 ? stored : Date.now()
}

export function getAdminSessionState(
  lastActivity: number,
  now: number,
  idleTimeoutSeconds: number,
): AdminSessionState {
  const elapsed = now - lastActivity
  const timeout = idleTimeoutSeconds * 1000
  if (elapsed >= timeout) return 'expired'
  if (elapsed >= timeout - 2 * 60_000) return 'warning'
  return 'active'
}
