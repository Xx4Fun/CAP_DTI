import type { Bulletin, RegulatoryPrice, VisitDraft, VisitItem } from '../types'

export function createDraft(offlineLeaseId: string, verificationRequestId?: number): VisitDraft {
  return {
    client_uuid: crypto.randomUUID(), store_id: null, offline_lease_id: offlineLeaseId,
    ...(verificationRequestId ? { verification_request_id: verificationRequestId } : {}),
    started_at: new Date().toISOString(), items: [], representative: { name: '', title: '' },
    signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
    sync_source: navigator.onLine ? 'online' : 'offline_queue', client_version: '1.0.0'
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

export function resolveClientReference(bulletin: Bulletin, mode: 'standard' | 'emergency', regulatoryPrices: RegulatoryPrice[]) {
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

export function canFinalizeVisit(draft: VisitDraft): string[] {
  const issues: string[] = []
  if (!draft.store_id) issues.push('Choose a registered store.')
  if (!draft.items.length) issues.push('Add at least one commodity price.')
  if (!draft.representative.name.trim()) issues.push('Enter the store representative name.')
  if (!draft.signatures.officer_png_base64) issues.push('Capture the DTI officer signature.')
  if (!draft.signatures.representative_png_base64) issues.push('Capture the store representative signature.')
  if (!draft.location) issues.push('Capture the visit location.')
  else if (draft.location.accuracy_meters > 100) issues.push('Location accuracy must be within 100 metres.')
  return issues
}
