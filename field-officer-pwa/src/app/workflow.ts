import type { BootstrapData, Bulletin, MonitoringReference, RegulatoryPrice, StoreRecord, VisitDraft, VisitItem } from '../types'

// Prefill the signatory with the store's registered owner; never overwrite a name the officer already typed.
export function prefillRepresentative(draft: VisitDraft, store: StoreRecord): VisitDraft['representative'] {
  if (draft.representative.name.trim() || draft.representative.title.trim()) return draft.representative
  const current = store.current_representative
  if (current?.name.trim()) return { name: current.name.trim(), title: current.title }
  const owner = store.owner_name?.trim()
  return owner ? { name: owner, title: 'Owner' } : draft.representative
}

// A delta response means nothing reference-related changed since `cached.version`; keep the cached lists, take the fresh envelope.
export function mergeBootstrapDelta(cached: BootstrapData | undefined, fresh: BootstrapData): BootstrapData {
  if (!fresh.is_delta || !cached) return fresh
  return {
    ...fresh,
    stores: cached.stores, srp_bulletins: cached.srp_bulletins, monitoring_references: cached.monitoring_references,
    regulatory_prices: cached.regulatory_prices, recent_prices: cached.recent_prices,
  }
}

export function createDraft(offlineLeaseId: string, verificationRequestId?: number): VisitDraft {
  return {
    client_uuid: crypto.randomUUID(), store_id: null, offline_lease_id: offlineLeaseId,
    ...(verificationRequestId ? { verification_request_id: verificationRequestId } : {}),
    started_at: new Date().toISOString(), items: [], representative: { name: '', title: '' },
    signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
    sync_source: navigator.onLine ? 'online' : 'offline_queue', client_version: __APP_VERSION__
  }
}

export function isBlankDraft(draft: VisitDraft): boolean {
  return draft.items.length === 0
    && !draft.representative.name.trim()
    && !draft.representative.title.trim()
    && !draft.signatures.officer_png_base64
    && !draft.signatures.representative_png_base64
}

export function hasDraftActivity(draft: VisitDraft): boolean {
  return !isBlankDraft(draft)
}

export function isActionableDraft(draft: VisitDraft): boolean {
  return hasDraftActivity(draft) || draft.verification_request_id !== undefined
}

export function analyzeLine(line: VisitItem, baseline: number) {
  const variance = baseline > 0 ? ((line.recorded_price - baseline) / baseline) * 100 : 0
  return { variance_percent: Number(variance.toFixed(2)), is_anomaly: baseline > 0 && line.recorded_price > baseline * 1.1 }
}

export function analyzeWithReference(
  line: VisitItem,
  reference: { status: 'available' | 'unavailable'; type: 'standard_srp' | 'emergency_ceiling'; value: number | null },
) {
  if (reference.status !== 'available' || reference.value === null || reference.value <= 0) {
    return { variance_percent: null, is_anomaly: false, label: 'Regulatory reference unavailable' as const }
  }
  const variance = ((line.recorded_price - reference.value) / reference.value) * 100
  const isAnomaly = reference.type === 'emergency_ceiling'
    ? line.recorded_price > reference.value
    : line.recorded_price > reference.value * 1.1
  return { variance_percent: Number(variance.toFixed(2)), is_anomaly: isAnomaly, label: isAnomaly ? 'For review' as const : 'Within reference' as const }
}

export function resolveClientReference(bulletin: Bulletin, mode: 'standard' | 'emergency', regulatoryPrices: RegulatoryPrice[], monitoringReferences: MonitoringReference[] = []) {
  const issued = monitoringReferences.find((reference) => reference.srp_id === bulletin.id)
  if (issued) return issued
  if (mode === 'emergency') {
    const record = [...regulatoryPrices].reverse().find((item) => item.commodity_key === bulletin.commodity_key)
    const value = record ? Number(record.authoritative_price) : null
    return value !== null && value > 0 && Boolean(record?.source_reference && record.effective_from)
      ? { status: 'available' as const, type: 'emergency_ceiling' as const, value }
      : { status: 'unavailable' as const, type: 'emergency_ceiling' as const, value: null }
  }
  const value = Number(bulletin.baseline_price)
  return value > 0 && Boolean(bulletin.effective_date)
    ? { status: 'available' as const, type: 'standard_srp' as const, value }
    : { status: 'unavailable' as const, type: 'standard_srp' as const, value: null }
}

export function resolveVisitReference(line: VisitItem | undefined, bulletin: Bulletin, mode: 'standard' | 'emergency', regulatoryPrices: RegulatoryPrice[], monitoringReferences: MonitoringReference[] = []) {
  return line?.reference_snapshot
    ? { ...line.reference_snapshot, source: line.reference_snapshot.source_reference }
    : resolveClientReference(bulletin, mode, regulatoryPrices, monitoringReferences)
}

export function canFinalizeVisit(draft: VisitDraft): string[] {
  const issues: string[] = []
  if (!draft.store_id) issues.push('Choose a registered store.')
  if (!draft.items.length) issues.push('Add at least one commodity price.')
  // Drafts saved before references were captured can't sync; re-entering a price attaches the current issued reference.
  else if (draft.items.some((item) => !item.reference_snapshot)) issues.push('Re-enter each recorded price so it carries the current monitoring reference.')
  if (!draft.representative.name.trim()) issues.push('Enter the store representative name.')
  if (!draft.representative.title.trim()) issues.push('Enter the store representative role.')
  if (!draft.finalized_at && !draft.representative_confirmed) issues.push('Confirm the name and role of the person signing.')
  if (!draft.signatures.officer_png_base64) issues.push('Capture the DTI officer signature.')
  if (!draft.signatures.representative_png_base64) issues.push('Capture the store representative signature.')
  if (!draft.location) issues.push('Capture the visit location.')
  else if (draft.location.accuracy_meters > 100) issues.push('Location accuracy must be within 100 metres.')
  return issues
}
