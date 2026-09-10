import api from './api'
import type { AdminOverviewRecord, AuditRecord, ConsumerReportRecord, FieldVerificationRequestActionRecord, FieldVerificationRequestPage, LegalNoticePage, LegalNoticeRecord, ManagedUserPage, ManagedUserRecord, ManagedUserRole, MonitoringEstablishmentProfile, MonitoringFindingsPage, MonitoringPeriodFilter, MonitoringPeriodPreset, MonitoringPriceHistoryPage, MonitoringRecordPage, MonitoringRecordRecord, MonitoringWorkspace, ReceiptEvidenceManifest, RegulatoryEmergencyRecord, SrpRecord, StoreRecord } from '../types/admin'
import type { BatchSrpUpdatePayload, CreateSrpPayload, ManagedSrpRecord, SrpListFilters, SrpPage, SrpRevisionPayload, SrpRevisionPreview, UpdateSrpMetadataPayload } from '../types/adminSrp'

const data = <T>(response: { data: { data: T } }): T => response.data.data

export const adminApi = {
  async getMonitoringRecords(filters: { search?: string; anomaly?: 'all' | 'yes' | 'no'; store_id?: number; period?: MonitoringPeriodPreset; date_from?: string; date_to?: string; page?: number; per_page?: 10 | 25 | 50 } = {}): Promise<MonitoringRecordPage> {
    return data(await api.get('/admin/monitoring-records', { params: filters }))
  },
  async getMonitoringRecord(id: number): Promise<MonitoringRecordRecord> {
    return data(await api.get(`/admin/monitoring-records/${id}`))
  },
  async getMonitoringSignature(id: number, kind: 'officer' | 'representative'): Promise<Blob> {
    return (await api.get(`/admin/monitoring-records/${id}/signatures/${kind}`, { responseType: 'blob' })).data
  },
  async getMonitoringEstablishments(filters: { search?: string; routine_status?: 'all' | 'due' | 'completed'; weekly_status?: 'all' | 'not_yet_monitored' | 'monitored_this_week'; additional_task?: 'all' | 'verification_required'; observation?: 'all' | 'with_observations' | 'reference_unavailable' | 'no_observations'; page?: number; per_page?: 10 | 25 | 50 } = {}): Promise<MonitoringWorkspace> {
    return data(await api.get('/admin/monitoring-establishments', { params: filters }))
  },
  async getMonitoringEstablishment(storeId: number, filters?: MonitoringPeriodFilter): Promise<MonitoringEstablishmentProfile> {
    const url = `/admin/monitoring-establishments/${storeId}`
    const response = filters && Object.keys(filters).length > 0 ? await api.get(url, { params: filters }) : await api.get(url)
    return data(response)
  },
  async getMonitoringPriceHistory(storeId: number, filters: { commodity?: `key:${string}` | `srp:${number}`; period?: MonitoringPeriodPreset; date_from?: string; date_to?: string; page?: number; per_page?: 10 | 25 | 50 } = {}): Promise<MonitoringPriceHistoryPage> {
    return data(await api.get(`/admin/monitoring-establishments/${storeId}/price-history`, { params: filters }))
  },
  async getMonitoringFindings(storeId: number, filters: { period?: MonitoringPeriodPreset; date_from?: string; date_to?: string; page?: number; per_page?: 10 | 25 | 50 } = {}): Promise<MonitoringFindingsPage> {
    try {
      return data(await api.get(`/admin/monitoring-establishments/${storeId}/findings`, { params: filters }))
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { data: [], current_page: 1, last_page: 1, per_page: filters.per_page ?? 10, total: 0, from: null, to: null }
      }
      throw err
    }
  },
  async getFieldVerificationRequests(filters: { search?: string; status?: 'all' | 'open' | 'claimed' | 'completed' | 'cancelled'; store_id?: number; page?: number; per_page?: 10 | 25 | 50 } = {}): Promise<FieldVerificationRequestPage> {
    return data(await api.get('/admin/verification-requests', { params: filters }))
  },
  async requestFieldVerification(reportId: number, payload: { reason: string; field_officer_id: number }): Promise<FieldVerificationRequestActionRecord> {
    return data(await api.post(`/admin/reports/${reportId}/verification-request`, payload))
  },
  async createAdditionalVisit(storeId: number, payload: { reason: string; field_officer_id: number }): Promise<FieldVerificationRequestActionRecord> {
    return data(await api.post(`/admin/monitoring-establishments/${storeId}/additional-visits`, payload))
  },
  async assignFieldVerification(requestId: number, fieldOfficerId: number): Promise<FieldVerificationRequestActionRecord> {
    return data(await api.post(`/admin/verification-requests/${requestId}/assign`, { field_officer_id: fieldOfficerId }))
  },
  async cancelFieldVerification(requestId: number): Promise<FieldVerificationRequestActionRecord> {
    return data(await api.post(`/admin/verification-requests/${requestId}/cancel`))
  },
  async reopenFieldVerification(requestId: number): Promise<FieldVerificationRequestActionRecord> {
    return data(await api.post(`/admin/verification-requests/${requestId}/reopen`))
  },
  async getManagedUsers(filters: { search?: string; role?: 'all' | ManagedUserRole; status?: 'all' | 'active' | 'inactive'; page?: number; per_page?: 10 | 25 | 50 } = {}): Promise<ManagedUserPage> {
    const response = await api.get('/admin/users', { params: filters })
    const paginator = response.data.data
    return {
      records: paginator.data ?? [],
      pagination: {
        current_page: paginator.current_page,
        last_page: paginator.last_page,
        per_page: paginator.per_page,
        total: paginator.total,
        from: paginator.from,
        to: paginator.to,
      },
      counts: response.data.counts,
    }
  },
  async createFieldOfficer(payload: { name: string; email: string; password: string; password_confirmation: string; is_active: boolean }): Promise<ManagedUserRecord> {
    return data(await api.post('/admin/users/field-officers', payload))
  },
  async updateManagedUser(id: number, payload: { name?: string; email?: string; is_active?: boolean }): Promise<ManagedUserRecord> {
    return data(await api.patch(`/admin/users/${id}`, payload))
  },
  async resetManagedUserPassword(id: number, payload: { password: string; password_confirmation: string }): Promise<{ message: string }> {
    return data(await api.put(`/admin/users/${id}/password`, payload))
  },
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
  async createSrpItem(payload: CreateSrpPayload): Promise<ManagedSrpRecord> {
    return data(await api.post('/admin/srp', payload))
  },
  async updateSrpMetadata(id: number, payload: UpdateSrpMetadataPayload): Promise<ManagedSrpRecord> {
    return data(await api.put(`/admin/srp/${id}`, payload))
  },
  async batchUpdateSrpPrices(payload: BatchSrpUpdatePayload): Promise<{ updated_count: number; effective_date: string }> {
    return data(await api.post('/admin/srp/batch-revisions', payload))
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
  async uploadCommodityImage(file: File): Promise<{ image_path: string; url: string }> {
    const formData = new FormData()
    formData.append('image', file)
    const response = await api.post('/admin/srp/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data.data
  },
  async getReports(): Promise<ConsumerReportRecord[]> {
    return data(await api.get('/admin/reports'))
  },
  async getReportPage(params: { page: number; per_page: number }): Promise<{
    data: ConsumerReportRecord[]
    meta: { current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null }
  }> {
    const response = await api.get('/admin/reports', { params })
    return response.data
  },
  async decideReport(id: number, payload: unknown): Promise<ConsumerReportRecord> {
    return data(await api.post(`/admin/reports/${id}/decision`, payload))
  },
  async getReportEvidence(id: number): Promise<Blob> {
    const response = await api.get(`/admin/reports/${id}/evidence`, { responseType: 'blob' })
    return response.data
  },
  async getReportEvidenceManifest(id: number): Promise<ReceiptEvidenceManifest> {
    return data(await api.get(`/admin/reports/${id}/evidence-manifest`))
  },
  async getReportEvidenceAsset(reportId: number, assetId: number): Promise<Blob> {
    const response = await api.get(`/admin/reports/${reportId}/evidence-assets/${assetId}`, { responseType: 'blob' })
    return response.data
  },
  async getEmergencies(): Promise<RegulatoryEmergencyRecord[]> {
    return data(await api.get('/admin/emergencies'))
  },
  async createEmergency(payload: unknown): Promise<RegulatoryEmergencyRecord> {
    return data(await api.post('/admin/emergencies', payload))
  },
  async getEmergency(id: number): Promise<RegulatoryEmergencyRecord> {
    return data(await api.get(`/admin/emergencies/${id}`))
  },
  async prepareEmergency(id: number): Promise<RegulatoryEmergencyRecord> {
    return data(await api.post(`/admin/emergencies/${id}/prepare`))
  },
  async activateEmergency(id: number, payload: { confirmed: true; preparation_hash: string }): Promise<RegulatoryEmergencyRecord> {
    return data(await api.post(`/admin/emergencies/${id}/activate`, payload))
  },
  async updateEmergency(id: number, payload: unknown): Promise<RegulatoryEmergencyRecord> {
    return data(await api.patch(`/admin/emergencies/${id}`, payload))
  },
  async getLegalNotices(params: { search?: string; status?: string } = {}): Promise<LegalNoticePage> {
    return data(await api.get('/admin/legal-notices', { params }))
  },
  async createLegalNotice(payload: { monitoring_record_id: number; notice_type: 'LOI' | 'SCO'; item_ids: number[] }): Promise<LegalNoticeRecord> {
    return data(await api.post('/admin/legal-notices', payload))
  },
  async updateLegalNotice(id: number, payload: Record<string, unknown>): Promise<LegalNoticeRecord> {
    return data(await api.patch(`/admin/legal-notices/${id}`, payload))
  },
  async previewLegalNotice(id: number): Promise<string> {
    const response = await api.post(`/admin/legal-notices/${id}/preview`, {}, { responseType: 'text' })
    return response.data
  },
  async issueLegalNotice(id: number): Promise<LegalNoticeRecord> {
    return data(await api.post(`/admin/legal-notices/${id}/issue`, { confirmed: true }))
  },
  async recordLegalDelivery(id: number, payload: { state: 'received' | 'refused' | 'failed'; recorded_at: string; details?: Record<string, unknown> }): Promise<LegalNoticeRecord> {
    return data(await api.post(`/admin/legal-notices/${id}/delivery`, payload))
  },
  async getLegalDocument(id: number): Promise<Blob> {
    return (await api.get(`/admin/legal-notices/${id}/document`, { responseType: 'blob' })).data
  },
  async closeLegalNotice(id: number): Promise<LegalNoticeRecord> {
    return data(await api.post(`/admin/legal-notices/${id}/close`))
  },
  async cancelLegalNotice(id: number): Promise<LegalNoticeRecord> {
    return data(await api.post(`/admin/legal-notices/${id}/cancel`))
  },
  async addLegalAttachment(id: number, file: File): Promise<NonNullable<LegalNoticeRecord['attachments']>[number]> {
    const body = new FormData(); body.append('file', file)
    return data(await api.post(`/admin/legal-notices/${id}/attachments`, body, { headers: { 'Content-Type': 'multipart/form-data' } }))
  },
  async deleteLegalAttachment(id: number, attachmentId: number): Promise<void> {
    await api.delete(`/admin/legal-notices/${id}/attachments/${attachmentId}`)
  },
  async getAuditEvents(): Promise<AuditRecord[]> {
    return data(await api.get('/admin/audit-events'))
  },
  async getAnalytics(storeId: number, commodityKey?: string) {
    return data(await api.get(`/admin/analytics/stores/${storeId}`, { params: { commodity_key: commodityKey } }))
  },
  async getSettings() {
    const response = await api.get('/admin/settings')
    return response.data
  },
  async updateProfile(payload: { name: string; email: string; current_password?: string; new_password?: string }) {
    const response = await api.put('/admin/settings/profile', payload)
    return response.data
  },
  async updatePreferences(payload: Record<string, any>) {
    const response = await api.put('/admin/settings/preferences', payload)
    return response.data
  },
  async updateSystemSettings(payload: Record<string, any>) {
    const response = await api.put('/admin/settings/system', payload)
    return response.data
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
