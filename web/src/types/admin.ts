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
  items_count?: number
  anomaly_count: number
  unavailable_reference_count?: number
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
  routine_status?: 'due' | 'completed'
  weekly_routine_status: 'not_yet_monitored' | 'monitored_this_week'
  has_prior_routine_monitoring: boolean
  latest_routine_monitoring_at: string | null
  verification_task_status: 'none' | 'open' | 'claimed'
  verification_claimant: { id: number; name: string; email: string } | null
  latest_monitoring_at: string | null
  latest_record_id: number | null
  latest_protocol_mode: 'standard' | 'emergency' | null
  latest_officer?: { id: number; name: string; email: string } | null
  latest_result: 'with_observations' | 'reference_unavailable' | 'no_observations' | 'never_monitored'
  image_path?: string | null
}

export interface MonitoringWorkspace {
  monitoring_week: { timezone: 'Asia/Manila'; starts_at: string; ends_at: string }
  monitoring_period?: { cadence: 'weekly' | 'daily'; timezone: 'Asia/Manila'; starts_at: string; ends_at: string; protocol_mode: 'standard' | 'emergency'; declaration_reference: string | null }
  weekly_summary: {
    total_establishments: number
    not_yet_monitored: number
    monitored_this_week: number
    verification_required: number
  }
  routine_summary?: {
    total_establishments: number
    due: number
    completed: number
    additional_visits: number
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
  monitoring_week: MonitoringWorkspace['monitoring_week']
  monitoring_period?: { cadence: 'weekly' | 'daily'; timezone: 'Asia/Manila'; starts_at: string; ends_at: string; protocol_mode: 'standard' | 'emergency'; declaration_reference: string | null }
  weekly_routine_status: MonitoringEstablishmentSummary['weekly_routine_status']
  routine_status?: 'due' | 'completed'
  has_prior_routine_monitoring: boolean
  latest_routine_monitoring_at: string | null
  latest_routine_record: MonitoringRecordRecord | null
  verification_task_status: 'none' | 'open' | 'claimed'
  verification_claimant: { id: number; name: string; email: string } | null
  latest_record: MonitoringRecordRecord | null
  period_completed_records_count?: number
  period_records_with_observations_count?: number
  period_commodities_count?: number
  monitored_commodities: Array<{
    selector: `key:${string}` | `srp:${number}`
    commodity_name: string
    unit: string | null
  }>
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

export type MonitoringPeriodPreset = 'this_week' | 'last_4_weeks' | 'this_month' | 'last_month' | 'all_time' | 'custom'

export interface MonitoringPeriodFilter {
  period?: MonitoringPeriodPreset
  date_from?: string
  date_to?: string
}

export interface MonitoringFindingItem {
  id: number
  monitoring_record_id: number
  finalized_at: string
  officer_name: string
  commodity_name: string
  unit: string | null
  recorded_price: number | string
  reference_value: number | string | null
  difference: number | string | null
  variance_percent: number | null
  is_anomaly?: boolean
  protocol_mode?: 'standard' | 'emergency' | null
  reference_label?: string | null
  reference_source?: string | null
}

export interface MonitoringFindingsPage {
  data: MonitoringFindingItem[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface FieldVerificationRequestRecord {
  id: number
  source_type?: 'complaint' | 'supervisor_directive'
  status: 'open' | 'claimed' | 'completed' | 'cancelled'
  reason: string
  requested_at: string
  claimed_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  store: { id: number; store_name: string; address: string; dti_sec_number?: string | null }
  report?: { id: number; report_reference: string; status: string } | null
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
  source_type?: 'complaint' | 'supervisor_directive'
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
  unit_price?: string | number | null
  line_total?: string | number | null
  uncertain_fields?: string[] | null
  section?: number | null
  possible_duplicate_of?: number | null
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

export interface RegulatoryEmergencyCandidateObservation {
  item_id: number
  store_name: string
  finalized_at: string
  recorded_price: number
  monitoring_record_id: number
}

export interface RegulatoryEmergencyCandidate {
  id: number
  commodity_key: string
  minimum_price: number
  maximum_price: number
  observed_average_price: number
  computed_apc_price: number
  observation_count: number
  establishment_count: number
  source_observations?: RegulatoryEmergencyCandidateObservation[]
}

export interface OfficialPriceRecord {
  id: number
  regulatory_emergency_id?: number
  commodity_key: string
  price_type: string
  authoritative_price: number
  effective_from: string
  effective_until?: string | null
  source_reference: string
}

export interface RegulatoryEmergencyRecord {
  id: number
  location: string
  declaration_reference: string
  starts_on: string
  ends_on: string | null
  status: 'draft' | 'active' | 'ended' | 'cancelled'
  effective_state: 'draft' | 'in_effect' | 'ended' | 'cancelled' | string
  preparation_hash?: string | null
  source_week: {
    timezone: string
    starts_at: string
    ends_at: string
    starts_on?: string
    ends_on?: string
  }
  candidates: RegulatoryEmergencyCandidate[]
  missing_commodity_keys?: string[]
  official_prices?: OfficialPriceRecord[]
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

export type LegalNoticeState = 'draft' | 'issued' | 'response_received' | 'closed' | 'cancelled'
export interface LegalNoticeRecord {
  id: number
  monitoring_record_id: number
  notice_type: 'LOI' | 'SCO'
  status: LegalNoticeState
  control_number?: string | null
  delivery_state: 'not_recorded' | 'received' | 'refused' | 'failed'
  due_date_timestamp?: string | null
  issued_at?: string | null
  updated_at: string
  intended_delivery_method?: 'portal' | 'email_and_hand_copy' | 'hand_copy' | null
  internal_justification?: string | null
  source_snapshot: { monitoring_record_number?: string; monitoring_date?: string; store?: { store_name?: string; address?: string }; items: Array<Record<string, unknown>> }
  draft_payload: { recipient_name?: string | null; recipient_title?: string | null; recipient_email?: string | null; address?: string | null; reason?: string | null; legal_bases?: string[] }
  store?: { id: number; store_name: string; address: string }
  preparer?: { id: number; name: string } | null
  attachments?: Array<{ id: number; kind: string; original_name: string; mime_type: string; size_bytes: number; sha256: string }>
  readiness: Record<string, boolean>
  policy: { status: 'LEGAL_POLICY_AVAILABLE' | 'LEGAL_POLICY_UNAVAILABLE'; policy_version: string | null }
  overdue?: boolean
}

export interface LegalNoticePage {
  data: LegalNoticeRecord[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface MonitoringMatrixCommodity {
  id: number
  commodity_name: string
  unit: string | null
  category: string
  regulatory_classification: string
  srp: number
}

export interface MonitoringMatrixEstablishment {
  store_id: number
  store_name: string
  monitoring_date: string
  monitoring_date_formatted: string
  prices: Record<number, { recorded_price: number; is_anomaly: boolean }>
}

export interface MonitoringMatrixWeek {
  week_number: number
  week_key: string
  week_label: string
  starts_at: string
  ends_at: string
  establishments: MonitoringMatrixEstablishment[]
}

export interface MonitoringMatrixData {
  period: string
  date_range: { from: string | null; to: string | null }
  commodities: MonitoringMatrixCommodity[]
  weeks: MonitoringMatrixWeek[]
  generated_at: string
}

