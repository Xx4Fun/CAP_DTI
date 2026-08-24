export interface FieldUser { id: number; name: string; email: string; role: 'field_officer'; must_change_password?: boolean }
export interface OfflineLease { id: string; expires_at: string }
export interface FieldSession { token: string; user: FieldUser; offline_lease: OfflineLease }
export interface StoreRecord { id: number; store_name: string; address: string; latitude: number; longitude: number; is_active: boolean }
export interface Bulletin { id: number; commodity_name: string; unit: string | null; baseline_price: number | string }
export interface RecentPrice { store_id: number; srp_id: number; recorded_price: number | string; inspection_timestamp: string }
export interface BootstrapData { version: string; is_delta: boolean; stores: StoreRecord[]; srp_bulletins: Bulletin[]; recent_prices: RecentPrice[] }
export interface VisitItem { srp_id: number; recorded_price: number }
export interface VisitLocation { latitude: number; longitude: number; accuracy_meters: number; captured_at: string }
export interface VisitDraft {
  client_uuid: string
  store_id: number | null
  offline_lease_id: string
  started_at: string
  finalized_at?: string
  items: VisitItem[]
  representative: { name: string; title: string }
  signatures: { officer_png_base64: string; representative_png_base64: string }
  location: VisitLocation | null
  sync_source: 'online' | 'offline_queue'
  client_version: string
}
export interface MonitoringRecord {
  id: number; client_uuid: string; status: string; finalized_at: string; received_at: string
  representative_name: string; sync_source: string; items_count: number; anomaly_count: number
  store: Pick<StoreRecord, 'id' | 'store_name' | 'address'>
  items: Array<VisitItem & { id: number; is_anomaly: boolean; variance_percent: number | null; bulletin?: Bulletin }>
}
export interface Page<T> { data: T[]; current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null }
