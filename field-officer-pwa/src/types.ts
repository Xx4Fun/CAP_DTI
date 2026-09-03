export interface FieldUser { id: number; name: string; email: string; role: 'field_officer'; must_change_password?: boolean }
export interface OfflineLease { id: string; expires_at: string }
export interface FieldSession { token: string; user: FieldUser; offline_lease: OfflineLease }
export interface StoreRecord { id: number; store_name: string; address: string; latitude: number; longitude: number; is_active: boolean; image_path?: string | null }
export interface Bulletin {
  id: number
  commodity_name: string
  unit: string | null
  baseline_price: number | string
  category?: string | null
  regulatory_classification?: string | null
  commodity_key?: string | null
  effective_date?: string | null
  source_reference?: string | null
}
export interface RecentPrice { store_id: number; srp_id: number; recorded_price: number | string; inspection_timestamp: string }
export interface MonitoringProtocol {
  labels_are_provisional: boolean
  standard_review_threshold_percent: number
  emergency_review_rule: string
  mode: 'standard' | 'emergency'
  declaration_reference: string | null
  starts_on: string | null
  ends_on: string | null
}
export interface RegulatoryPrice {
  id: number
  commodity_key: string
  price_type: string
  authoritative_price: number | string
  effective_from: string
  effective_until: string | null
  source_reference: string | null
}
export interface BootstrapData {
  version: string; reference_version?: string; is_delta: boolean; stores: StoreRecord[]; srp_bulletins: Bulletin[]
  regulatory_prices?: RegulatoryPrice[]; recent_prices: RecentPrice[]; accepted_today?: number; protocol?: MonitoringProtocol
}
export interface VisitItem { srp_id: number; recorded_price: number }
export interface VisitLocation { latitude: number; longitude: number; accuracy_meters: number; captured_at: string }
export interface GeoPosition { latitude: number; longitude: number; accuracy_meters: number }
export interface VisitDraft {
  client_uuid: string
  verification_request_id?: number
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
export interface QueuedVisit extends VisitDraft { sync_error?: string; sync_attempted_at?: string }
export interface FieldVerificationRequest {
  id: number
  status: 'open' | 'claimed'
  reason: string
  requested_at: string
  claimed_at: string | null
  claimed_by: number | null
  store: Pick<StoreRecord, 'id' | 'store_name' | 'address' | 'latitude' | 'longitude'>
}
export interface FieldNotification {
  id: string
  event: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}
export interface NotificationPage { data: FieldNotification[]; unread_count: number; meta: { current_page: number; last_page: number; per_page: number; total: number } }
export interface MonitoringRecord {
  id: number; client_uuid: string; status: string; finalized_at: string; received_at: string
  representative_name: string; sync_source: string; items_count: number; anomaly_count: number
  store: Pick<StoreRecord, 'id' | 'store_name' | 'address'>
  items: Array<VisitItem & { id: number; is_anomaly: boolean; variance_percent: number | null; bulletin?: Bulletin }>
}
export interface MonitoringRecordDetail {
  id: number; client_uuid: string; status: string; started_at: string; finalized_at: string; received_at: string
  sync_source: string; field_verification_request_id: number | null
  store: StoreRecord
  location: VisitLocation
  representative: { name: string; title: string | null }
  signatures: { officer_present: boolean; representative_present: boolean }
  items: Array<VisitItem & {
    id: number; commodity_name: string | null; unit: string | null; recorded_price: number; previous_price: number | null
    variance_percent: number | null; is_anomaly: boolean; reference_status: 'available' | 'unavailable'
    reference_type: 'standard_srp' | 'emergency_ceiling'; reference_label: string | null; reference_value: number | null
    reference_source: string | null; reference_effective_date: string | null
  }>
}
export interface Page<T> { data: T[]; current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null }
