import axios from 'axios'
import type { BootstrapData, FieldSession, MonitoringRecord, Page, VisitDraft } from '../types'

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api', timeout: 25_000 })
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

export const fieldApi = {
  async login(email: string, password: string): Promise<FieldSession & { must_change_password: boolean }> {
    return (await client.post('/field/login', { email, password })).data
  },
  async changePassword(token: string, password: string) {
    return (await client.post('/field/password', { password, password_confirmation: password }, auth(token))).data
  },
  async bootstrap(token: string, since?: string): Promise<BootstrapData> {
    return (await client.get('/field/bootstrap', { ...auth(token), params: since ? { since } : undefined })).data.data
  },
  async sync(token: string, records: VisitDraft[]) {
    return (await client.post('/field/monitoring-records/sync', { records }, auth(token))).data.data.results
  },
  async history(token: string, page = 1): Promise<Page<MonitoringRecord>> {
    return (await client.get('/field/monitoring-records', { ...auth(token), params: { page, per_page: 10 } })).data.data
  },
  async logout(token: string) { await client.post('/field/logout', {}, auth(token)) }
}

export function apiError(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
  return (response?.data?.errors && Object.values(response.data.errors).flat()[0]) || response?.data?.message || fallback
}
