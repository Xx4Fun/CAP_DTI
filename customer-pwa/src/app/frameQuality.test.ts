import { describe, expect, it } from 'vitest';
import { scoreMatrix } from './frameQuality';

// These expectations mirror the server predicate in
// backend/app/Services/Receipt/ReceiptFrameQualityEvaluator.php:65
//   acceptable = brightness >= 25 && brightness <= 240 && edgeDetail >= 6
// backend/tests/Unit/ReceiptFrameQualityEvaluatorTest.php covers the same boundaries in PHP.

const flat = (value: number, width = 8, height = 8) =>
  Array.from({ length: height }, () => Array.from({ length: width }, () => value));

const verticalStripes = (width = 8, height = 8) =>
  Array.from({ length: height }, () => Array.from({ length: width }, (_, x) => (x % 2 === 0 ? 0 : 255)));

describe('scoreMatrix', () => {
  it('rejects a frame that is too dark', () => {
    const result = scoreMatrix(flat(10));
    expect(result.brightness).toBe(10);
    expect(result.edgeDetail).toBe(0);
    expect(result.acceptable).toBe(false);
  });

  it('rejects a frame that is blown out', () => {
    const result = scoreMatrix(flat(255));
    expect(result.brightness).toBe(255);
    expect(result.edgeDetail).toBe(0);
    expect(result.acceptable).toBe(false);
  });

  it('rejects a well-exposed frame that carries no detail', () => {
    const result = scoreMatrix(flat(128));
    expect(result.brightness).toBe(128);
    expect(result.edgeDetail).toBe(0);
    expect(result.acceptable).toBe(false);
  });

  it('accepts a well-exposed frame with strong detail', () => {
    const result = scoreMatrix(verticalStripes());
    expect(result.brightness).toBeGreaterThanOrEqual(25);
    expect(result.brightness).toBeLessThanOrEqual(240);
    expect(result.edgeDetail).toBeGreaterThanOrEqual(6);
    expect(result.acceptable).toBe(true);
  });

  it('treats an empty matrix as unacceptable rather than throwing', () => {
    const result = scoreMatrix([]);
    expect(result.brightness).toBe(0);
    expect(result.edgeDetail).toBe(0);
    expect(result.acceptable).toBe(false);
  });

  it('penalises exposure in the score while leaving edge detail reported raw', () => {
    const stripes = scoreMatrix(verticalStripes());
    // score = max(0, edgeDetail - |128 - brightness| * 0.25)
    const expected = Math.max(0, stripes.edgeDetail - Math.abs(128 - stripes.brightness) * 0.25);
    expect(stripes.score).toBeCloseTo(expected, 2);
  });
});
