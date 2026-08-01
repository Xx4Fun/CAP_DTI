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

export const defaultConfig: SystemConfig = {
  app_name: 'PRICE-Watch',
  state_of_calamity: false,
  privacy_notice_version: '1.0',
  max_upload_size_mb: 5,
  allowed_mime_types: ['image/jpeg', 'image/png'],
  last_updated_at: new Date().toISOString()
};

export const defaultStoresList: Establishment[] = [
  {
    id: 1,
    dti_sec_number: 'SEC-CS202612345',
    store_name: 'Super Metro San Jose',
    owner_name: 'Metro Retail Stores Group Inc.',
    latitude: 10.7424,
    longitude: 121.9406,
    address: 'Tradetown, San Jose de Buenavista',
    recidivism_index: 0
  },
  {
    id: 2,
    dti_sec_number: 'SEC-CS202654321',
    store_name: 'Gaisano Grand Antique',
    owner_name: 'Gaisano Grand Malls Inc.',
    latitude: 10.7450,
    longitude: 121.9420,
    address: 'San Jose de Buenavista',
    recidivism_index: 0
  },
  {
    id: 3,
    dti_sec_number: 'SEC-CS202699999',
    store_name: 'Robinsons Superstore Antique',
    owner_name: 'Robinsons Retail Holdings Inc.',
    latitude: 10.7410,
    longitude: 121.9380,
    address: 'Atabay, San Jose de Buenavista',
    recidivism_index: 0
  }
];

export interface Commodity {
  id: number;
  commodity_name: string;
  image_path?: string | null;
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

export interface ScanTagResponse {
  scan_id: string;
  scan_uuid?: string;
  store: {
    id: number;
    store_name: string;
    address: string;
    dti_sec_number?: string;
  };
  detected_price?: number | null;
  detected_price_string?: string | null;
  detected_price_source?: string;
  product_source?: string;
  ocr_status: string;
  candidates: Commodity[];
  timestamp?: string;
}

export interface ComparisonResultResponse {
  scan_id?: string;
  store: {
    id: number;
    store_name: string;
    address: string;
    dti_sec_number?: string;
  };
  product?: {
    id: number;
    commodity_name: string;
    category?: string;
    unit?: string;
    regulatory_classification?: string;
    baseline_price: number;
    effective_date: string;
  };
  commodity_name?: string;
  package_size?: string;
  unit?: string;
  displayed_price: number | string;
  baseline_price?: number | string;
  reference_price?: number | string;
  comparison_label?: string;
  regulatory_label?: string;
  regulatory_mode?: string;
  comparison_status?: 'ABOVE_SRP' | 'MATCHES_SRP' | 'BELOW_SRP' | string;
  difference_pesos?: number | string;
  peso_difference?: number | string;
  percentage_srp?: number | string;
  percent_difference?: number | string;
  is_above_reference?: boolean;
  product_source?: 'OCR' | 'MANUAL_SEARCH' | string;
  price_source?: 'USER_CONFIRMED' | 'USER_CORRECTED' | 'USER_ENTERED' | string;
  previous_verified_price?: number | null;
  previous_recorded_date?: string | null;
  historical_pricing?: any;
  percentage_previous?: number | null;
  state_of_calamity?: boolean;
  informational_notice?: string;
  disclaimer?: string;
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
