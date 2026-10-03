import L from 'leaflet'
import type { GisMonitoringPayload, GisStoreRecord, GisVisit, StoreRecord } from '../../types/admin'

// The 10% allowance is the field-inspection rule (FieldMonitoringController). An emergency ceiling has none,
// and a confirmed receipt finding was decided against the reference itself (ReceiptPriceComparison).
export const reviewThreshold = (row: { srp?: unknown; reference_type?: string | null; source?: string }): number | null =>
  row.srp ? (row.reference_type === 'emergency_ceiling' || row.source === 'Validated receipt' ? Number(row.srp) : Number(row.srp) * 1.10) : null

export type PinStatus = 'green' | 'yellow' | 'red' | 'blue' | 'grey'

/** What a pin says about its store on the active layer. Colour is always paired with `label`. */
export type PinInfo = { status: PinStatus; label: string; text?: string; badge?: string }

export const STATUS_STYLE: Record<PinStatus, { bg: string; color: string; border: string; dot: string }> = {
  green: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0', dot: '#10b981' },
  yellow: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b' },
  red: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#ef4444' },
  blue: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6' },
  grey: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
}

export function getStoreStatusInfo(store: StoreRecord): {
  status: 'green' | 'yellow' | 'red'
  label: string
  bg: string
  color: string
  border: string
} {
  const recidivism = store.recidivism_index || 0
  if (recidivism > 0 || !store.is_active) {
    return {
      status: 'red',
      label: recidivism > 0 ? `${recidivism} Confirmed Finding${recidivism > 1 ? 's' : ''}` : 'Account Inactive',
      bg: '#fef2f2', color: '#dc2626', border: '#fecaca',
    }
  }
  if (!store.is_verified) {
    return { status: 'yellow', label: 'Verification Pending', bg: '#fffbeb', color: '#d97706', border: '#fde68a' }
  }
  return { status: 'green', label: 'No Confirmed Findings', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' }
}

// ponytail: one fixed threshold, because registered pins are placed by hand. Promote to a `gis` system
// setting if DTI needs to tune it.
export const VISIT_REVIEW_METERS = 150

export const visitDistanceMeters = (store: Pick<StoreRecord, 'latitude' | 'longitude'>, visit: GisVisit): number =>
  L.latLng(Number(store.latitude), Number(store.longitude)).distanceTo(L.latLng(Number(visit.latitude), Number(visit.longitude)))

/** A visit is worth a look when it was signed further from the registered pin than its own GPS error explains. */
export const visitNeedsReview = (store: Pick<StoreRecord, 'latitude' | 'longitude'>, visit: GisVisit): boolean =>
  visitDistanceMeters(store, visit) - Number(visit.accuracy_meters ?? 0) > VISIT_REVIEW_METERS

export type LayerId = 'compliance' | 'coverage' | 'prices' | 'visit_check'
export type LayerContext = { commodity: string; week: Pick<GisMonitoringPayload['week'], 'is_current'>; locations: boolean }
export type LayerCategory = { id: string; label: string; status: PinStatus; chip?: string }
export type MapLayer = {
  id: LayerId
  label: string
  /** Legend entries and filter chips. A pin may report a category outside this list; it then shows only under All. */
  categories: LayerCategory[]
  pinOf: (store: GisStoreRecord, ctx: LayerContext) => PinInfo & { category: string }
}

const peso = (value: number) => `₱${Number(value).toFixed(2)}`
const pin = (category: LayerCategory, extra: Partial<PinInfo> = {}) => ({ category: category.id, status: category.status, label: category.label, ...extra })

const COVERAGE: LayerCategory[] = [
  { id: 'monitored', label: 'Monitored', status: 'green' },
  { id: 'not_monitored', label: 'Not monitored', status: 'yellow' },
  { id: 'never', label: 'Never monitored', status: 'red' },
  { id: 'inactive', label: 'Inactive', status: 'grey' },
]
const PRICES: LayerCategory[] = [
  { id: 'within', label: 'At or below reference', status: 'green' },
  { id: 'above', label: 'Above reference', status: 'yellow' },
  { id: 'flagged', label: 'Flagged', status: 'red' },
  { id: 'unavailable', label: 'Reference unavailable', status: 'blue' },
  { id: 'none', label: 'No price this week', status: 'grey' },
]
/** Visit check before its coordinates arrive (or when they are refused): the only category shown. */
export const VISITS_UNLOADED: LayerCategory = { id: 'unloaded', label: 'Visit locations not loaded', status: 'grey' }
const VISITS: LayerCategory[] = [
  { id: 'at_pin', label: 'At registered pin', status: 'green' },
  { id: 'review', label: 'Location to review', status: 'yellow' },
  { id: 'no_visit', label: 'No visit', status: 'grey' },
]

export const MAP_LAYERS: Record<LayerId, MapLayer> = {
  compliance: {
    id: 'compliance',
    label: 'Compliance',
    categories: [
      { id: 'no-findings', label: 'No findings', status: 'green' },
      { id: 'pending', label: 'Pending verification', status: 'yellow', chip: 'Pending' },
      { id: 'findings', label: 'Confirmed findings', status: 'red', chip: 'Findings' },
    ],
    pinOf: (store) => {
      const { status, label } = getStoreStatusInfo(store)
      const category = (store.recidivism_index || 0) > 0 ? 'findings' : !store.is_active ? 'inactive' : !store.is_verified ? 'pending' : 'no-findings'
      return { category, status, label }
    },
  },
  coverage: {
    id: 'coverage',
    label: 'Coverage',
    categories: COVERAGE,
    pinOf: (store, ctx) => {
      // The flag describes today, so it is shown only on the current week. Deactivating a store does not close its request.
      const badge = ctx.week.is_current && store.verification_required ? { badge: 'Verification required' } : {}
      if (!store.is_active) return pin(COVERAGE[3], badge)
      // Verification visits are listed but are not routine coverage.
      return pin(store.visits.some((visit) => visit.is_routine) ? COVERAGE[0] : store.has_prior_routine_visit ? COVERAGE[1] : COVERAGE[2], badge)
    },
  },
  prices: {
    id: 'prices',
    label: 'Prices',
    categories: PRICES,
    pinOf: (store, ctx) => {
      const price = store.prices.find((row) => row.commodity === ctx.commodity)
      if (!price) return pin(PRICES[4])
      const text = peso(price.recorded_price)
      if (price.reference_status === 'unavailable' || price.reference_value === null) return pin(PRICES[3], { text })
      if (price.is_anomaly) return pin(PRICES[2], { text })
      return pin(Number(price.recorded_price) > Number(price.reference_value) ? PRICES[1] : PRICES[0], { text })
    },
  },
  visit_check: {
    id: 'visit_check',
    label: 'Visit check',
    categories: VISITS,
    pinOf: (store, ctx) => {
      // Never classify a visit without its coordinates.
      if (!ctx.locations) return pin(VISITS_UNLOADED)
      if (store.visits.length === 0) return pin(VISITS[2])
      // Any distant visit marks the store, so a later accurate visit cannot hide an earlier one.
      return pin(store.visits.some((visit) => visitNeedsReview(store, visit)) ? VISITS[1] : VISITS[0])
    },
  },
}

/** "Sep 28 - Oct 4, 2026" from Manila date strings, read as calendar dates so the browser timezone cannot shift them. */
export function weekLabel(key: string, endsOn?: string): string {
  const start = new Date(`${key}T00:00:00Z`)
  const end = endsOn ? new Date(`${endsOn}T00:00:00Z`) : new Date(start.getTime() + 6 * 86_400_000)
  const day = (date: Date, withYear = false) =>
    date.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
  return `${day(start)} – ${day(end, true)}`
}

export function buildStorePopupContent(
  store: StoreRecord,
  statusInfo: Pick<PinInfo, 'status' | 'label'>,
  latitude: number,
  longitude: number,
): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'leaflet-store-popup'
  const title = document.createElement('h4')
  title.textContent = store.store_name
  container.appendChild(title)
  const registration = document.createElement('p')
  const registrationLabel = document.createElement('strong')
  registrationLabel.textContent = 'SEC #: '
  registration.append(registrationLabel, document.createTextNode(store.dti_sec_number || 'N/A'))
  container.appendChild(registration)
  const status = document.createElement('span')
  status.className = `leaflet-store-status status-${statusInfo.status}`
  status.textContent = statusInfo.label
  container.appendChild(status)
  const coordinates = document.createElement('p')
  coordinates.className = 'leaflet-store-coordinates'
  coordinates.textContent = `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`
  container.appendChild(coordinates)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'leaflet-open-info-btn'
  button.dataset.storeId = String(store.id)
  button.textContent = 'Open Store Info'
  container.appendChild(button)
  return container
}

/** Each visit signed at one point, with its own result relative to the registered pin. Text nodes only, as above. */
export function buildVisitPopupContent(store: StoreRecord, visits: GisVisit[]): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'leaflet-store-popup'
  const title = document.createElement('h4')
  title.textContent = `${visits.length > 1 ? `${visits.length} visits` : 'Visit'} at ${store.store_name}`
  container.append(title)
  for (const visit of visits) {
    const review = visitNeedsReview(store, visit)
    const when = document.createElement('p')
    when.textContent = `${new Date(visit.finalized_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })} · ${visit.officer_name || 'Officer unavailable'}${visit.is_routine ? '' : ' · Verification visit'}`
    const status = document.createElement('span')
    status.className = `leaflet-store-status status-${review ? 'yellow' : 'green'}`
    status.textContent = review ? 'Location to review' : 'At registered pin'
    const distance = document.createElement('p')
    distance.textContent = `${Math.round(visitDistanceMeters(store, visit))} m from registered pin · GPS accuracy ±${Math.round(Number(visit.accuracy_meters ?? 0))} m`
    container.append(when, status, distance)
  }
  return container
}
