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
  bulletin?: { id: number; commodity_name: string; unit: string | null; baseline_price: number | string }
}

export interface MonitoringRecordRecord {
  id: number
  client_uuid: string
  status: string
  finalized_at: string
  received_at: string
  representative_name: string
  representative_title?: string | null
  sync_source: 'online' | 'offline_queue'
  latitude?: number | string
  longitude?: number | string
  location_accuracy_meters?: number | string
  items_count: number
  anomaly_count: number
  officer: { id: number; name: string; email: string }
  store: { id: number; store_name: string; address: string }
  items: MonitoringRecordItem[]
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
