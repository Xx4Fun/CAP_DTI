import type { AttachmentCategory, LegalNotice, NoticeOutcome, ReasonCategory, SrpReference } from './types';

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

// Chat attachments (StoreMessage::ATTACHMENT_MIMES); separate from the formal-response limits below.
export const CHAT_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const CHAT_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_MAX_BODY = 2000;

// Mirrors the backend response validation (LegalNoticeController::response).
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MIN_RESPONSE_LENGTH = 20;

export const reasonLabel = (id: string | null) => REASON_CATEGORIES.find((reason) => reason.id === id)?.label ?? id ?? 'Not recorded';
export const attachmentCategoryLabel = (id: string | null) => ATTACHMENT_CATEGORIES.find((category) => category.id === id)?.label ?? 'Document';

/** Closed or withdrawn: nothing further is expected from the vendor. */
export const isFinished = (notice: Pick<LegalNotice, 'status'>) => notice.status === 'closed' || notice.status === 'cancelled';

export const OUTCOME_LABELS: Record<NoticeOutcome, string> = {
  explanation_accepted: 'Explanation accepted',
  no_violation: 'No violation found',
  violation_confirmed: 'Violation confirmed',
  partially_confirmed: 'Partly confirmed',
  escalated_to_sco: 'Escalated to a Show Cause Order',
  withdrawn: 'Withdrawn by DTI',
};

export function noticeStatusLabel(notice: LegalNotice, now = Date.now()): string {
  if (notice.status === 'cancelled') return 'Withdrawn by DTI';
  if (notice.status === 'closed') {
    if (notice.outcome === 'escalated_to_sco') return 'Escalated to a Show Cause Order';
    return notice.outcome ? `Closed: ${OUTCOME_LABELS[notice.outcome]}` : 'Closed';
  }
  if (notice.status === 'response_received') return 'Under review';
  if (!['received', 'refused'].includes(notice.delivery_state)) {
    return notice.intended_delivery_method === 'portal' ? 'Not yet opened' : 'Awaiting delivery record';
  }
  if (notice.due_date_timestamp && new Date(notice.due_date_timestamp).getTime() <= now) return 'Response period ended';
  return 'Response due';
}

/** Same rule the backend enforces: issued, delivery recorded, deadline set and not yet passed. */
export function canRespond(notice: LegalNotice, now = Date.now()): boolean {
  return notice.status === 'issued'
    && ['received', 'refused'].includes(notice.delivery_state)
    && !!notice.due_date_timestamp
    && new Date(notice.due_date_timestamp).getTime() > now;
}

/**
 * Something the vendor still has to do: respond before the deadline, or open a portal notice to receive it.
 * A portal notice has no receipt and no deadline until its document is first opened, and no email is sent at issue.
 */
export function needsVendorAction(notice: LegalNotice, now = Date.now()): boolean {
  if (notice.status !== 'issued') return false;
  if (canRespond(notice, now)) return true;
  return notice.intended_delivery_method === 'portal' && !['received', 'refused'].includes(notice.delivery_state);
}

export function responseBlockedReason(notice: LegalNotice, now = Date.now()): string | null {
  if (canRespond(notice, now)) return null;
  if (notice.status === 'response_received') return 'A response has already been submitted for this notice.';
  if (notice.status === 'closed') return 'This notice is closed.';
  if (notice.status === 'cancelled') return 'This notice was withdrawn by DTI.';
  if (!['received', 'refused'].includes(notice.delivery_state) || !notice.due_date_timestamp) {
    return notice.intended_delivery_method === 'portal'
      ? 'Open the official document to receive this notice; your response period starts then.'
      : 'The response period starts after DTI records delivery of this notice.';
  }
  return 'The response period for this notice has expired.';
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

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
 * Provisional review threshold, copied from the field app's analyzeWithReference:
 * standard SRP is reviewed above +10%; an official emergency ceiling is reviewed above the ceiling itself.
 */
export function analyzeReference(price: number, reference: SrpReference) {
  if (reference.status !== 'available' || reference.value === null || reference.value <= 0) {
    return { variancePercent: null, forReview: false, reviewFrom: null, label: 'Regulatory reference unavailable' as const };
  }
  const referenceCents = Math.round(reference.value * 100);
  const priceCents = Math.round(price * 100);
  const reviewFromCents = reference.type === 'emergency_ceiling'
    ? referenceCents + 1
    : Math.floor(referenceCents * 11 / 10) + 1;
  const reviewFrom = reviewFromCents / 100;
  const forReview = priceCents >= reviewFromCents;
  return {
    variancePercent: Number((((price - reference.value) / reference.value) * 100).toFixed(2)),
    forReview,
    reviewFrom,
    label: forReview ? 'For review' as const : 'Within reference' as const,
  };
}
