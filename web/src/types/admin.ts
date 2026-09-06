export type AdminRole = 'super_admin' | 'dti_evaluator' | 'field_officer'

export interface AdminUser {
  id: number
  name: string
  email: string
  role: AdminRole
}

export interface AdminOverviewRecord {
  stores: number
  pending_reports: number
  active_emergencies: number | null
  availability?: {
    regulatory_emergencies: boolean
  }
}

export interface StoreRecord {
  id: number
  dti_sec_number?: string | null
  store_name: string
  owner_name?: string | null
  address: string
  latitude: number
  longitude: number
  is_active: boolean
  is_verified: boolean
  is_public: boolean
  recidivism_index?: number
}

export type ManagedUserRole = 'field_officer' | 'vendor'

export interface ManagedUserRecord {
  id: number
  name: string
  email: string
  role: ManagedUserRole
  is_active: boolean
  created_at: string
  stores: Array<{ id: number; store_name: string }>
}

export interface ManagedUserPage {
  records: ManagedUserRecord[]
  pagination: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
  }
  counts: {
    total: number
    field_officer: number
    vendor: number
    inactive: number
  }
}

export interface MonitoringRecordItem {
  id: number
  srp_id: number
  recorded_price: number | string
  baseline_price: number | string
  previous_price?: number | string | null
  variance_percent: number | null
  is_anomaly: boolean
  reference_status?: string | null
  reference_type?: string | null
  reference_label?: string | null
  reference_value?: number | string | null
  reference_source?: string | null
  reference_effective_date?: string | null
  bulletin?: { id: number; commodity_name: string; unit: string | null; baseline_price: number | string }
}

export interface MonitoringRecordRecord {
  id: number
  client_uuid: string
  status: string
  finalized_at: string
  received_at: string
  started_at?: string
  protocol_mode?: 'standard' | 'emergency' | null
  protocol_reference?: string | null
  client_version?: string | null
  field_verification_request_id?: number | null
  representative_name: string
  representative_title?: string | null
  sync_source: 'online' | 'offline_queue'
  latitude?: number | string | null
  longitude?: number | string | null
  location_accuracy_meters?: number | string | null
  location_captured_at?: string | null
  items_count: number
  anomaly_count: number
  officer: { id: number; name: string; email: string }
  store: { id: number; store_name: string; address: string; dti_sec_number?: string | null }
  items: MonitoringRecordItem[]
  verification_request?: {
    id: number
    status: string
    report?: { id: number; report_reference: string; status: string } | null
  } | null
}

export interface MonitoringRecordPage {
  data: MonitoringRecordRecord[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface MonitoringEstablishmentSummary {
  id: number
  dti_sec_number?: string | null
  store_name: string
  owner_name?: string | null
  address: string
  is_active: boolean
  is_verified: boolean
  completed_records_count: number
  records_with_observations_count: number
  open_verification_requests_count: number
  latest_monitoring_at: string | null
  latest_record_id: number | null
  latest_protocol_mode: 'standard' | 'emergency' | null
  latest_result: 'with_observations' | 'no_observations' | 'never_monitored'
}

export interface MonitoringWorkspace {
  summary: {
    monitored_establishments: number
    recent_activity: number
    records_with_observations: number
    open_verification_requests: number
    latest_completed_at: string | null
  }
  establishments: {
    data: MonitoringEstablishmentSummary[]
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
  }
}

export interface MonitoringEstablishmentProfile {
  store: StoreRecord
  completed_records_count: number
  records_with_observations_count: number
  open_verification_requests_count: number
  latest_record: MonitoringRecordRecord | null
}

export interface MonitoringPriceHistoryRow {
  id: number
  monitoring_record_id: number
  monitoring_date: string
  protocol_mode?: 'standard' | 'emergency' | null
  protocol_reference?: string | null
  commodity_name?: string | null
  unit?: string | null
  reference_status?: string | null
  reference_type?: string | null
  reference_label?: string | null
  reference_value?: number | string | null
  reference_source?: string | null
  reference_effective_date?: string | null
  recorded_price: number | string
  difference: number | string | null
  variance_percent: number | null
  is_anomaly: boolean
}

export interface MonitoringPriceHistoryPage {
  data: MonitoringPriceHistoryRow[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface FieldVerificationRequestRecord {
  id: number
  status: 'open' | 'claimed' | 'completed' | 'cancelled'
  reason: string
  requested_at: string
  claimed_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  store: { id: number; store_name: string; address: string; dti_sec_number?: string | null }
  report: { id: number; report_reference: string; status: string }
  claimant?: { id: number; name: string; email: string } | null
  monitoring_record?: { id: number } | null
}

export interface FieldVerificationRequestPage {
  data: FieldVerificationRequestRecord[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface FieldVerificationRequestActionRecord {
  id: number
  status: 'open' | 'claimed' | 'completed' | 'cancelled'
  reason: string
  store_id: number
  claimed_by: number | null
  requested_at: string
  claimed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

export interface ConsumerReportRecord {
  id: number
  report_reference: string
  status: string
  store_name?: string
  submitted_at: string
  raw_ocr_json: Record<string, unknown> | null
  evaluator_confirmed_json: Record<string, unknown> | null
  evidence_available: boolean
  evidence_summary?: {
    capture_mode: string
    processing_status: string
    asset_count: number
    continuity?: string | null
    merchant?: string | null
  } | null
  items?: ConsumerReportItemRecord[]
  verification_request?: {
    id: number
    status: 'open' | 'claimed' | 'completed' | 'cancelled'
    reason: string
    store_id: number
    claimed_by: number | null
    requested_at: string
    claimed_at: string | null
    completed_at: string | null
    cancelled_at: string | null
  } | null
}

export interface ConsumerReportItemRecord {
  id: number
  sequence: number
  raw_text?: string | null
  item_name?: string | null
  quantity?: string | null
  unit?: string | null
  observed_price?: string | number | null
  ocr_confidence?: number | null
  srp_id?: number | null
  commodity_key?: string | null
  commodity_name?: string | null
  evaluator_decision_json?: Record<string, unknown> | null
}

export interface ReceiptEvidenceAssetRecord {
  id: number
  kind: string
  sequence: number
  mime_type: string
  size_bytes: number
  sha256: string
  metadata: Record<string, unknown> | null
  attempt_number?: number
  is_current?: boolean
}

export interface ReceiptEvidenceManifest {
  capture_mode: string
  processing_status: string
  continuity: Record<string, unknown> | null
  merchant: Record<string, unknown> | null
  processing_result?: Record<string, unknown> | null
  assets: ReceiptEvidenceAssetRecord[]
}

export interface AuditRecord {
  id: number
  action: string
  subject_type: string
  subject_id?: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface RegulatoryEmergencyRecord {
  id: number
  location: string
  declaration_reference: string
  starts_on: string
  ends_on: string | null
  status: 'active' | 'ended' | 'cancelled'
}

export interface SrpRecord {
  id: number
  commodity_name: string
  image_path?: string | null
  unit: string | null
  baseline_price: number
  effective_date: string
  source_reference: string | null
}
