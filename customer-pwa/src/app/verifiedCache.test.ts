import { beforeEach, describe, expect, it } from 'vitest';
import { readVerifiedCache, writeVerifiedCache } from './verifiedCache';

describe('verified public-data cache', () => {
  beforeEach(() => localStorage.clear());

  it('returns cached data only while it is inside the allowed age', () => {
    writeVerifiedCache('prices', [{ id: 7 }], 1_000);

    expect(readVerifiedCache<{ id: number }[]>('prices', 5_000, 5_999)).toEqual({
      data: [{ id: 7 }],
      fetchedAt: 1_000,
    });
    expect(readVerifiedCache('prices', 5_000, 6_001)).toBeNull();
  });

  it('rejects malformed and incompatible cache records', () => {
    localStorage.setItem('broken', '{nope');
    localStorage.setItem('old-schema', JSON.stringify({ schemaVersion: 0, fetchedAt: 1_000, data: [] }));

    expect(readVerifiedCache('broken', 5_000, 2_000)).toBeNull();
    expect(readVerifiedCache('old-schema', 5_000, 2_000)).toBeNull();
  });
});
