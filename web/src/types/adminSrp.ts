import type { SrpRecord } from './admin'

export interface ManagedSrpRecord extends SrpRecord {
  category?: string | null
  regulatory_classification?: string | null
  commodity_key?: string | null
  is_active?: boolean
}

export type SrpView = 'current' | 'scheduled' | 'history'

export interface SrpListFilters {
  query?: string
  view?: SrpView
  category?: string
  page?: number
  per_page?: number
}

export interface SrpPagination {
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface SrpCapabilities {
  can_publish: boolean
  status: 'AVAILABLE' | 'SRP_VERSIONING_UNAVAILABLE' | string
}

export interface SrpPage {
  records: ManagedSrpRecord[]
  pagination: SrpPagination
  capabilities: SrpCapabilities
}

export interface SrpRevisionPayload {
  commodity_name: string
  image_path?: string | null
  category?: string | null
  unit?: string | null
  regulatory_classification?: string | null
  baseline_price: number
  effective_date: string
  source_reference: string
  change_reason: string
}

export interface SrpRevisionPreview {
  original: ManagedSrpRecord
  proposed: ManagedSrpRecord
  changed_fields: string[]
  becomes_public_on: string
  historical_resolution_preserved: boolean
}

export interface CreateSrpPayload {
  commodity_name: string
  unit?: string | null
  category?: string | null
  regulatory_classification?: string | null
  baseline_price: number
  effective_date: string
  source_reference: string
  image_path?: string | null
}

export interface UpdateSrpMetadataPayload {
  commodity_name: string
  unit?: string | null
  category?: string | null
  regulatory_classification?: string | null
  image_path?: string | null
}

export interface BatchSrpUpdatePayload {
  effective_date: string
  source_reference: string
  change_reason: string
  updates: Array<{
    id: number
    baseline_price: number
  }>
}
