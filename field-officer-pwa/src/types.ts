export interface FieldUser { id: number; name: string; email: string; role: 'field_officer'; must_change_password?: boolean }
export interface OfflineLease { id: string; expires_at: string }
export interface FieldSession { token: string; user: FieldUser; offline_lease: OfflineLease }
export interface StoreRecord {
  id: number; store_name: string; address: string; latitude: number; longitude: number; is_active: boolean; image_path?: string | null
  weekly_routine_status?: 'not_yet_monitored' | 'monitored_this_week'
  routine_status?: 'due' | 'completed'
  has_prior_routine_monitoring?: boolean
  latest_routine_monitoring_at?: string | null
}
export interface Bulletin {
  id: number
  commodity_name: string
  unit: string | null
  baseline_price: number | string
  category?: string | null
  regulatory_classification?: string | null
  commodity_key?: string | null
  price_freeze_applicable?: boolean
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
export interface MonitoringReference {
  srp_id: number
  commodity_key: string | null
  covered_by_price_freeze: boolean
  status: 'available' | 'unavailable'
  type: 'standard_srp' | 'emergency_ceiling'
  source_id: number | null
  value: number | null
  label: string
  source: string | null
  effective_date: string | null
  reference_version: string
}
export interface ReferenceSnapshot {
  status: 'available' | 'unavailable'
  type: 'standard_srp' | 'emergency_ceiling'
  source_id: number | null
  value: number | null
  label: string
  source_reference: string | null
  effective_date: string | null
  reference_version: string
}
export interface BootstrapData {
  version: string; reference_version?: string; is_delta: boolean; stores: StoreRecord[]; srp_bulletins: Bulletin[]
  regulatory_prices?: RegulatoryPrice[]; monitoring_references?: MonitoringReference[]; recent_prices: RecentPrice[]; accepted_today?: number; protocol?: MonitoringProtocol
  monitoring_week?: { timezone: 'Asia/Manila'; starts_at: string; ends_at: string }
  monitoring_period?: MonitoringPeriodInfo
}
export interface MonitoringPeriodInfo { cadence: 'weekly' | 'daily'; timezone: 'Asia/Manila'; starts_at: string; ends_at: string; protocol_mode: 'standard' | 'emergency'; declaration_reference: string | null }
export interface VisitItem { srp_id: number; recorded_price: number; reference_snapshot?: ReferenceSnapshot }
export interface VisitLocation { latitude: number; longitude: number; accuracy_meters: number; captured_at: string }
export interface GeoPosition { latitude: number; longitude: number; accuracy_meters: number }
export interface VisitDraft {
  client_uuid: string
  verification_request_id?: number
  store_id: number | null
  store_name?: string
  store_address?: string
  offline_lease_id: string
  started_at: string
  finalized_at?: string
  items: VisitItem[]
  representative: { name: string; title: string }
  signatures: { officer_png_base64: string; representative_png_base64: string }
  location: VisitLocation | null
  current_step?: number
  sync_source: 'online' | 'offline_queue'
  client_version: string
}
export interface QueuedVisit extends VisitDraft {
  sync_error?: string
  sync_attempted_at?: string
  // transient: no response, timeout, 408, 429 or 5xx (retried with backoff). rejected: other 4xx (never retried automatically).
  sync_error_kind?: 'transient' | 'rejected'
  sync_attempts?: number
}
export interface ArchivedVisit extends QueuedVisit { archived_at: string }
export interface FieldVerificationRequest {
  id: number
  status: 'claimed'
  source_type: 'complaint' | 'supervisor_directive'
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
    id: number; commodity_name: string | null; unit: string | null; category?: string | null; regulatory_classification?: string | null
    recorded_price: number; previous_price: number | null
    variance_percent: number | null; is_anomaly: boolean; reference_status: 'available' | 'unavailable'
    reference_type: 'standard_srp' | 'emergency_ceiling'; reference_label: string | null; reference_value: number | null
    reference_source_id: number | null; reference_source: string | null; reference_effective_date: string | null; reference_version: string | null
  }>
}
// The routine visit that completed a store for the current period (any officer's), opened view-only from Choose Store.
export interface RoutineRecordView extends MonitoringRecordDetail {
  officer: { name: string | null }
  signature_images: { officer_png_base64: string | null; representative_png_base64: string | null }
}
export interface Page<T> { data: T[]; current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null }
