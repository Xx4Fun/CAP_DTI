import { describe, expect, it } from 'vitest';
import { analyzeReference, noticeStatusLabel, responseBlockedReason } from './rules';
import type { LegalNotice, SrpReference } from './types';

const reference = (type: SrpReference['type'], value: number): SrpReference => ({
  status: 'available', type, value, label: 'Reference', source: null, effective_date: null,
});

describe('price self-check centavo boundaries', () => {
  it('reviews the first centavo strictly above SRP plus 10%', () => {
    const srp = reference('standard_srp', 10.05);
    expect(analyzeReference(11.05, srp).forReview).toBe(false);
    expect(analyzeReference(11.06, srp)).toMatchObject({ forReview: true, reviewFrom: 11.06 });
    expect(analyzeReference(11.01, reference('standard_srp', 10))).toMatchObject({ forReview: true, reviewFrom: 11.01 });
  });

  it('reviews the first centavo strictly above an emergency ceiling', () => {
    const ceiling = reference('emergency_ceiling', 10.05);
    expect(analyzeReference(10.05, ceiling).forReview).toBe(false);
    expect(analyzeReference(10.06, ceiling)).toMatchObject({ forReview: true, reviewFrom: 10.06 });
  });
});

const notice = (changes: Partial<LegalNotice>): LegalNotice => ({
  id: 1, store_id: 1, control_number: 'LOI-2026-000001', notice_type: 'LOI', status: 'issued', issued_at: '2026-09-28T01:00:00Z', intended_delivery_method: 'portal',
  delivery_state: 'received', delivered_at: '2026-09-28T01:00:00Z', due_date_timestamp: '2026-10-01T01:00:00Z', response_text: null, response_reason_category: null,
  response_certified_at: null, response_received_at: null, closed_at: null, store: null, monitoring_date: null, flagged_items: [], attachments: [], ...changes,
});

describe('notice status wording', () => {
  const now = Date.parse('2026-09-29T00:00:00Z');
  const later = Date.parse('2026-10-02T00:00:00Z');

  it('names the outcome DTI recorded instead of a bare "Closed"', () => {
    expect(noticeStatusLabel(notice({ status: 'closed', outcome: 'explanation_accepted' }), now)).toBe('Closed: Explanation accepted');
    expect(noticeStatusLabel(notice({ status: 'closed', outcome: 'escalated_to_sco' }), now)).toBe('Escalated to a Show Cause Order');
    expect(noticeStatusLabel(notice({ status: 'closed' }), now)).toBe('Closed');
    expect(noticeStatusLabel(notice({ status: 'cancelled', outcome: 'withdrawn' }), now)).toBe('Withdrawn by DTI');
  });

  it('says the period ended once an unanswered deadline passes, and an unopened portal notice is not yet opened', () => {
    expect(noticeStatusLabel(notice({}), now)).toBe('Response due');
    expect(noticeStatusLabel(notice({}), later)).toBe('Response period ended');
    expect(noticeStatusLabel(notice({ delivery_state: 'not_recorded', delivered_at: null, due_date_timestamp: null }), now)).toBe('Not yet opened');
  });

  it('explains why a withdrawn notice cannot be answered', () => {
    expect(responseBlockedReason(notice({ status: 'cancelled' }), now)).toBe('This notice was withdrawn by DTI.');
    // A portal notice starts on the vendor's own open; DTI never records its delivery.
    expect(responseBlockedReason(notice({ delivery_state: 'not_recorded', delivered_at: null, due_date_timestamp: null }), now))
      .toBe('Open the official document to receive this notice; your response period starts then.');
  });
});
