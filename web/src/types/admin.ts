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
  dti_sec_number?: string
  store_name: string
  owner_name?: string
  address: string
  latitude: number
  longitude: number
  is_active: boolean
  is_verified: boolean
  is_public: boolean
  recidivism_index?: number
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
  consumer_correction_json?: Record<string, unknown> | null
  consumer_confirmed: boolean
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
}

export interface ReceiptEvidenceManifest {
  capture_mode: string
  processing_status: string
  continuity: Record<string, unknown> | null
  merchant: Record<string, unknown> | null
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
