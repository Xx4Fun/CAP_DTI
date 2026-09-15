import type { AttachmentCategory, LegalNotice, ReasonCategory, SrpReference } from './types';

export const REASON_CATEGORIES: Array<{ id: ReasonCategory; label: string; hint: string }> = [
  { id: 'WHOLESALE_HIKE', label: 'Distributor / Manufacturer Wholesale Price Increase', hint: 'Attach wholesaler invoice or price adjustment memo' },
  { id: 'FREIGHT_SURCHARGE', label: 'Logistics & Inter-Island Freight Surcharge (Iloilo to Antique)', hint: 'Attach bill of lading or shipping delivery receipts' },
  { id: 'ENCODING_ERROR', label: 'Point-of-Sale (POS) or Shelf Tag Clerical Error', hint: 'Attach photo of corrected price marker and POS sales slip' },
  { id: 'PACKAGING_DISCREPANCY', label: 'Grammage / Packaging Variant Mismatch', hint: 'Explain difference in unit size vs official DTI listed grammage' },
  { id: 'FORCE_MAJEURE', label: 'Supply Chain Interruption / External Disruption', hint: 'Provide distributor certification of localized scarcity' },
];

export const ATTACHMENT_CATEGORIES: Array<{ id: AttachmentCategory; label: string }> = [
  { id: 'DELIVERY_RECEIPT', label: 'Delivery receipt' },
  { id: 'WHOLESALER_INVOICE', label: 'Wholesaler invoice' },
  { id: 'FREIGHT_BILL', label: 'Freight bill' },
  { id: 'SHELF_TAG', label: 'Shelf tag photo' },
  { id: 'OTHER', label: 'Other document' },
];

// Mirrors the backend response validation (LegalNoticeController::response).
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MIN_RESPONSE_LENGTH = 20;

export const reasonLabel = (id: string | null) => REASON_CATEGORIES.find((reason) => reason.id === id)?.label ?? id ?? 'Not recorded';
export const attachmentCategoryLabel = (id: string | null) => ATTACHMENT_CATEGORIES.find((category) => category.id === id)?.label ?? 'Document';

export function noticeStatusLabel(notice: LegalNotice): string {
  if (notice.status === 'closed') return 'Closed';
  if (notice.status === 'response_received') return 'Under review';
  if (!['received', 'refused'].includes(notice.delivery_state)) return 'Awaiting delivery record';
  return 'Response due';
}

/** Same rule the backend enforces: issued, delivery recorded, deadline set and not yet passed. */
export function canRespond(notice: LegalNotice, now = Date.now()): boolean {
  return notice.status === 'issued'
    && ['received', 'refused'].includes(notice.delivery_state)
    && !!notice.due_date_timestamp
    && new Date(notice.due_date_timestamp).getTime() > now;
}

export function responseBlockedReason(notice: LegalNotice, now = Date.now()): string | null {
  if (canRespond(notice, now)) return null;
  if (notice.status === 'response_received') return 'A response has already been submitted for this notice.';
  if (notice.status === 'closed') return 'This notice is closed.';
  if (!['received', 'refused'].includes(notice.delivery_state) || !notice.due_date_timestamp) {
    return 'The response period starts after DTI records delivery of this notice.';
  }
  return 'The response period for this notice has expired.';
}

export const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatPeso = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed === null ? '—' : `₱${parsed.toFixed(2)}`;
};

export const formatDate = (value: string | null | undefined, withTime = false) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-PH', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Provisional self-check, copied from the field app's analyzeWithReference:
 * standard SRP is reviewed above +10%; an official emergency ceiling is reviewed above the ceiling itself.
 */
export function analyzeReference(price: number, reference: SrpReference) {
  if (reference.status !== 'available' || reference.value === null || reference.value <= 0) {
    return { variancePercent: null, forReview: false, reviewAbove: null, label: 'Regulatory reference unavailable' as const };
  }
  const reviewAbove = reference.type === 'emergency_ceiling' ? reference.value : Number((reference.value * 1.1).toFixed(2));
  const forReview = reference.type === 'emergency_ceiling' ? price > reference.value : price > reference.value * 1.1;
  return {
    variancePercent: Number((((price - reference.value) / reference.value) * 100).toFixed(2)),
    forReview,
    reviewAbove,
    label: forReview ? 'For review' as const : 'Within reference' as const,
  };
}
