import api from './api'
import type { AdminOverviewRecord, AuditRecord, ConsumerReportRecord, RegulatoryEmergencyRecord, SrpRecord, StoreRecord } from '../types/admin'

const data = <T>(response: { data: { data: T } }): T => response.data.data

export const adminApi = {
  async getStores(): Promise<StoreRecord[]> {
    return data(await api.get('/admin/stores'))
  },
  async updateStore(id: number, changes: Partial<StoreRecord>): Promise<StoreRecord> {
    return data(await api.patch(`/admin/stores/${id}`, changes))
  },
  async inviteVendor(storeId: number, email: string): Promise<{ invitation_url: string }> {
    const response = await api.post(`/admin/stores/${storeId}/invitations`, { email })
    return response.data
  },
  async previewSrp(payload: unknown): Promise<Record<string, unknown>> {
    return data(await api.post('/admin/srp/import/preview', payload))
  },
  async getSrp(): Promise<SrpRecord[]> {
    const response = await api.get('/admin/srp')
    return response.data.data.data
  },
  async importSrp(payload: unknown) {
    return data(await api.post('/admin/srp/import', payload))
  },
  async getReports(): Promise<ConsumerReportRecord[]> {
    return data(await api.get('/admin/reports'))
  },
  async decideReport(id: number, payload: unknown): Promise<ConsumerReportRecord> {
    return data(await api.post(`/admin/reports/${id}/decision`, payload))
  },
  async getReportEvidence(id: number): Promise<Blob> {
    const response = await api.get(`/admin/reports/${id}/evidence`, { responseType: 'blob' })
    return response.data
  },
  async getEmergencies(): Promise<RegulatoryEmergencyRecord[]> {
    return data(await api.get('/admin/emergencies'))
  },
  async createEmergency(payload: unknown) {
    return data(await api.post('/admin/emergencies', payload))
  },
  async updateEmergency(id: number, payload: unknown) {
    return data(await api.patch(`/admin/emergencies/${id}`, payload))
  },
  async createEmergencyPrice(payload: unknown) {
    return data(await api.post('/admin/emergency-prices', payload))
  },
  async legalDraft(): Promise<string> {
    const response = await api.post('/admin/legal/draft-preview', {}, { responseType: 'text' })
    return response.data
  },
  async dispatchLegal() {
    return api.post('/admin/legal/dispatch', {})
  },
  async getAuditEvents(): Promise<AuditRecord[]> {
    return data(await api.get('/admin/audit-events'))
  },
  async getAnalytics(storeId: number, commodityKey?: string) {
    return data(await api.get(`/admin/analytics/stores/${storeId}`, { params: { commodity_key: commodityKey } }))
  },
  async getAnalyticsOptions(): Promise<{
    stores: Array<{ id: number; store_name: string; address: string }>
    commodities: Array<{ commodity_key: string; commodity_name: string }>
  }> {
    return data(await api.get('/admin/analytics/options'))
  },
  async getOverview(): Promise<AdminOverviewRecord> {
    return data<AdminOverviewRecord>(await api.get('/admin/overview'))
  },
}
