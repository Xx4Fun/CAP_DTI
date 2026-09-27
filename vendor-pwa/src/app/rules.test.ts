import { describe, expect, it } from 'vitest';
import { analyzeReference } from './rules';
import type { SrpReference } from './types';

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
