import axios from 'axios'
import type { BootstrapData, FieldNotification, FieldSession, FieldVerificationRequest, MonitoringRecord, MonitoringRecordDetail, NotificationPage, OfflineLease, Page, VisitDraft } from '../types'

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api', timeout: 25_000 })
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

export const fieldApi = {
  async login(email: string, password: string): Promise<FieldSession & { must_change_password: boolean }> {
    return (await client.post('/field/login', { email, password })).data
  },
  async changePassword(token: string, password: string) {
    return (await client.post('/field/password', { password, password_confirmation: password }, auth(token))).data
  },
  async renewLease(token: string): Promise<OfflineLease> {
    return (await client.post('/field/lease/renew', {}, auth(token))).data.offline_lease
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
  async historyDetail(token: string, id: number): Promise<MonitoringRecordDetail> {
    return (await client.get(`/field/monitoring-records/${id}`, auth(token))).data.data
  },
  async verificationRequests(token: string): Promise<FieldVerificationRequest[]> {
    return (await client.get('/field/verification-requests', auth(token))).data.data
  },
  async releaseVerification(token: string, id: number): Promise<FieldVerificationRequest> {
    return (await client.post(`/field/verification-requests/${id}/release`, {}, auth(token))).data.data
  },
  async notifications(token: string): Promise<NotificationPage> {
    return (await client.get('/field/notifications', { ...auth(token), params: { per_page: 50 } })).data
  },
  async readNotification(token: string, id: string): Promise<FieldNotification> {
    return (await client.post(`/field/notifications/${id}/read`, {}, auth(token))).data.data
  },
  async readAllNotifications(token: string): Promise<void> {
    await client.post('/field/notifications/read-all', {}, auth(token))
  },
  async logout(token: string) { await client.post('/field/logout', {}, auth(token)) }
}

export function apiError(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
  return (response?.data?.errors && Object.values(response.data.errors).flat()[0]) || response?.data?.message || fallback
}
