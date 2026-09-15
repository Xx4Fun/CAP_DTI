export type ComplianceStatus = 'IN_GOOD_STANDING' | 'UNDER_INQUIRY' | 'SHOW_CAUSE_ISSUED';

export interface VendorUser {
  id: number;
  name: string;
  email: string;
}

export interface VendorSession {
  token: string;
  expires_at: string;
  user: VendorUser;
}

export interface VendorStore {
  id: number;
  store_name: string;
  address: string;
  dti_sec_number: string | null;
  recidivism_index: number | null;
  last_inspected_at: string | null;
  compliance_status: ComplianceStatus;
  open_notice_count: number;
}

export interface EmergencyInfo {
  declaration_reference: string | null;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

export interface VendorOverview {
  user: VendorUser;
  stores: VendorStore[];
  emergency: EmergencyInfo | null;
}

export type NoticeStatus = 'issued' | 'response_received' | 'closed';
export type DeliveryState = 'not_recorded' | 'received' | 'refused' | 'failed';

export interface FlaggedItem {
  commodity_name: string | null;
  unit: string | null;
  observed_price: number | string | null;
  reference_value: number | string | null;
  reference_label: string | null;
  variance_percent: number | string | null;
}

export type ReasonCategory = 'WHOLESALE_HIKE' | 'FREIGHT_SURCHARGE' | 'ENCODING_ERROR' | 'PACKAGING_DISCREPANCY' | 'FORCE_MAJEURE';
export type AttachmentCategory = 'DELIVERY_RECEIPT' | 'WHOLESALER_INVOICE' | 'FREIGHT_BILL' | 'SHELF_TAG' | 'OTHER';

export interface NoticeAttachment {
  id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  category: AttachmentCategory | null;
  created_at: string;
}

export interface LegalNotice {
  id: number;
  store_id: number;
  control_number: string | null;
  notice_type: 'LOI' | 'SCO';
  status: NoticeStatus;
  issued_at: string | null;
  delivery_state: DeliveryState;
  delivered_at: string | null;
  due_date_timestamp: string | null;
  response_text: string | null;
  response_reason_category: ReasonCategory | null;
  response_certified_at: string | null;
  response_received_at: string | null;
  closed_at: string | null;
  store: { id: number; store_name: string; address: string } | null;
  monitoring_date: string | null;
  flagged_items: FlaggedItem[];
  attachments: NoticeAttachment[];
}

export interface ResponseDraft {
  reason_category: ReasonCategory;
  response_text: string;
  certified_under_oath: boolean;
  attachments: Array<{ file: File; category: AttachmentCategory }>;
}

export type ReferenceType = 'standard_srp' | 'emergency_ceiling';

export interface SrpReference {
  status: 'available' | 'unavailable';
  type: ReferenceType;
  value: number | null;
  label: string;
  source: string | null;
  effective_date: string | null;
}

export interface SrpItem {
  id: number;
  /** Stable across SRP revisions; each revision has a new id. */
  commodity_key: string | null;
  commodity_name: string;
  category: string | null;
  unit: string | null;
  regulatory_classification: string | null;
  covered_by_price_freeze: boolean;
  reference: SrpReference;
}

export interface SrpCatalog {
  protocol: { mode: 'standard' | 'emergency'; reference: string | null };
  items: SrpItem[];
}

export interface Advisory {
  id: string;
  category: 'PRICE_FREEZE' | 'SRP_UPDATE';
  title: string;
  reference: string | null;
  published_date: string | null;
  ends_on: string | null;
  state: 'scheduled' | 'in_effect' | 'ended';
  is_active: boolean;
  affected_areas: string[];
  items: Array<{ commodity_name: string; unit: string | null; baseline_price: number }>;
}

export interface NotificationSettings {
  sms_enabled: boolean;
  sms_mobile_number: string;
  email_enabled: boolean;
  email_address: string;
  alert_on_loi: boolean;
  alert_on_sco: boolean;
  alert_deadline_24h: boolean;
  alert_price_freeze: boolean;
  alert_srp_bulletin: boolean;
}

export type ActiveTab = 'overview' | 'notices' | 'rebuttals' | 'srp' | 'advisories';
