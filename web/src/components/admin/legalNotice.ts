import type { LegalNoticeRecord } from '../../types/admin'

export type DeliveryMethod = 'portal' | 'email_and_hand_copy' | 'hand_copy'
export type DeliveryState = 'received' | 'refused' | 'failed'
export type OfflineResponse = { channel: 'email' | 'paper'; received_at: string; response_text: string; evidence: File }
export type IssueOutcome = { id: number; notification: LegalNoticeRecord['notification']; portal: boolean }
export type CitedProduct = { key: string | number; name: string; observed: number; reference: number; label?: string | null; type?: string | null }

// New notices go through the vendor portal only; the other labels describe notices issued before that rule.
export const DELIVERY_METHODS: Record<DeliveryMethod, { label: string; help: string }> = {
  portal: { label: 'Vendor portal', help: 'The vendor sees and answers it in their portal. The response period starts when they first open the official document.' },
  email_and_hand_copy: { label: 'Portal + email + printed copy (older notices)', help: 'Issued before notices became portal-only.' },
  hand_copy: { label: 'Printed copy only (older notices)', help: 'Issued before notices became portal-only.' },
}

/** What a flag of each basis shows; a comparison, not a legal finding. */
export const COMPARISONS: Record<string, string> = {
  standard_srp: 'Above SRP', emergency_ceiling: 'Above price ceiling',
  previous_price_spike: 'Up over the previous record',
}
/** The rule a flag rests on. Items frozen before finding_basis existed fall back to the reference kind. */
export const basisOf = (item: { finding_basis?: string | null; reference_type?: string | null }) =>
  item.finding_basis ?? item.reference_type ?? null
/** How far an observed price is over its reference, e.g. "+₱12.00 (24.0%)". */
export const overReference = (observed: number, reference: number) => {
  const over = observed - reference
  return `${over >= 0 ? '+' : '−'}₱${Math.abs(over).toFixed(2)}${reference > 0 ? ` (${(over / reference * 100).toFixed(1)}%)` : ''}`
}
export const humanize = (value: string) => { const text = value.replaceAll('_', ' '); return text.charAt(0).toUpperCase() + text.slice(1) }
export const snapshotProducts = (notice: LegalNoticeRecord): CitedProduct[] => notice.source_snapshot.items.map((item, index) => ({
  key: String(item.id ?? index), name: String(item.commodity_name || `Item #${item.id || index + 1}`), observed: Number(item.observed_price), reference: Number(item.reference_value),
  label: item.reference_label ? String(item.reference_label) : null, type: item.reference_type ? String(item.reference_type) : null,
}))
