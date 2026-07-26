export type AdminRole = 'super_admin' | 'dti_evaluator' | 'field_officer'

export interface AdminUser {
  id: number
  name: string
  email: string
  role: AdminRole
}

export interface StoreRecord {
  id: number
  dti_sec_number?: string
  store_name: string
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
  unit: string | null
  baseline_price: number
  effective_date: string
  source_reference: string | null
}
