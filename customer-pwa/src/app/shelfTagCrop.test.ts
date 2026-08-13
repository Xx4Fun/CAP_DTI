import { describe, expect, it } from 'vitest';
import { computeGuideSourceCrop, computeNormalizedCropSize } from './shelfTagCrop';

describe('shelf-tag camera crop geometry', () => {
  it('maps a portrait object-cover guide to the corresponding source pixels', () => {
    const crop = computeGuideSourceCrop({
      videoWidth: 1920,
      videoHeight: 1080,
      videoRect: { left: 0, top: 0, width: 360, height: 800 },
      guideRect: { left: 30, top: 335, width: 300, height: 130 },
    });

    expect(crop.x).toBeCloseTo(757.5, 1);
    expect(crop.y).toBeCloseTo(452.25, 1);
    expect(crop.width).toBeCloseTo(405, 1);
    expect(crop.height).toBeCloseTo(175.5, 1);
  });

  it('normalizes the crop for OCR without changing its aspect ratio', () => {
    expect(computeNormalizedCropSize(405, 175.5)).toEqual({
      width: 1200,
      height: 520,
    });

    expect(computeNormalizedCropSize(2400, 600)).toEqual({
      width: 1600,
      height: 400,
    });
  });
});
