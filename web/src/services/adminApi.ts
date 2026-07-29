import api from './api'
import type { AdminOverviewRecord, AuditRecord, ConsumerReportRecord, RegulatoryEmergencyRecord, SrpRecord, StoreRecord } from '../types/admin'
import type { ManagedSrpRecord, SrpListFilters, SrpPage, SrpRevisionPayload, SrpRevisionPreview } from '../types/adminSrp'

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
  async getSrp(filters: SrpListFilters = {}): Promise<SrpPage | SrpRecord[]> {
    const params = { per_page: 20, ...filters }
    const response = await api.get('/admin/srp', { params })
    const paginator = response.data.data
    return {
      records: (paginator?.data ?? paginator ?? []) as ManagedSrpRecord[],
      pagination: {
        current_page: paginator?.current_page ?? 1,
        last_page: paginator?.last_page ?? 1,
        per_page: paginator?.per_page ?? 20,
        total: paginator?.total ?? (Array.isArray(paginator) ? paginator.length : 0),
        from: paginator?.from ?? 1,
        to: paginator?.to ?? (Array.isArray(paginator) ? paginator.length : 0),
      },
      capabilities: response.data.capabilities ?? {
        can_publish: true,
        status: 'AVAILABLE',
      },
    }
  },
  async importSrp(payload: unknown) {
    return data(await api.post('/admin/srp/import', payload))
  },
  async previewSrpRevision(id: number, payload: SrpRevisionPayload): Promise<SrpRevisionPreview> {
    return data(await api.post(`/admin/srp/${id}/revisions/preview`, payload))
  },
  async createSrpRevision(id: number, payload: SrpRevisionPayload): Promise<ManagedSrpRecord> {
    return data(await api.post(`/admin/srp/${id}/revisions`, payload))
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
