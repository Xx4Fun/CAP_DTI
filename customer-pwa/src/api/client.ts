import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 15000,
});

export interface SystemConfig {
  app_name: string;
  state_of_calamity: boolean;
  privacy_notice_version: string;
  max_upload_size_mb: number;
  allowed_mime_types: string[];
  last_updated_at: string;
}

export interface Commodity {
  id: number;
  commodity_name: string;
  category?: string;
  brand?: string;
  variant?: string;
  package_size?: string;
  unit?: string;
  regulatory_classification?: string;
  baseline_price: number;
  effective_date: string;
  regulatory_state?: string;
  is_active: boolean;
  price_freeze_applicable?: boolean;
  price_freeze_treatment?: string;
}

export interface Establishment {
  id: number;
  dti_sec_number: string;
  store_name: string;
  owner_name: string;
  latitude: number;
  longitude: number;
  address: string;
  recidivism_index: number;
}

export interface CaptureSessionResponse {
  capture_session_id: number;
  session_uuid: string;
  capture_token: string;
  expires_at: string;
  store_id?: number;
  max_file_size: number;
  accepted_types: string[];
}

export interface FormalReportResponse {
  report_reference: string;
  secret_tracking_token: string;
  status: string;
  submitted_at: string;
}

export interface StatusHistoryItem {
  status: string;
  public_message: string;
  timestamp: string;
}

export interface TrackReportResponse {
  report_reference: string;
  store_name: string;
  current_status: string;
  submitted_at: string;
  status_history: StatusHistoryItem[];
}
