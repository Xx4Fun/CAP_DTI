import type { VisitDraft, VisitItem } from '../types'

export function createDraft(offlineLeaseId: string): VisitDraft {
  return {
    client_uuid: crypto.randomUUID(), store_id: null, offline_lease_id: offlineLeaseId,
    started_at: new Date().toISOString(), items: [], representative: { name: '', title: '' },
    signatures: { officer_png_base64: '', representative_png_base64: '' }, location: null,
    sync_source: navigator.onLine ? 'online' : 'offline_queue', client_version: '1.0.0'
  }
}

export function analyzeLine(line: VisitItem, baseline: number) {
  const variance = baseline > 0 ? ((line.recorded_price - baseline) / baseline) * 100 : 0
  return { variance_percent: Number(variance.toFixed(2)), is_anomaly: baseline > 0 && line.recorded_price > baseline * 1.1 }
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
