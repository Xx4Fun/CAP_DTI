import { describe, expect, it } from 'vitest';
import { guideCropRect, outputSize } from './captureCrop';

describe('guideCropRect', () => {
  // A 1920x1080 landscape sensor shown in a 390x780 portrait viewport: `cover` hides most of the frame's width.
  const portrait = {
    frame: { width: 1080, height: 1920 },
    videoRect: { left: 0, top: 0, width: 390, height: 780 },
    guideRect: { left: 31.2, top: 140.4, width: 327.6, height: 468 },
  };

  it('maps the guide onto the camera frame instead of keeping the whole image', () => {
    const crop = guideCropRect({ ...portrait, objectFit: 'cover', margin: 0 });

    // Scale 780/1920 = 0.40625, so the 1080-wide frame renders 438.75 wide in a 390 box: 24.375 is hidden each side.
    expect(crop).toEqual({ sx: 137, sy: 346, sw: 806, sh: 1152 });
    expect(crop.sw * crop.sh).toBeLessThan(portrait.frame.width * portrait.frame.height * 0.5);
  });

  it('adds a margin so text touching the guide is not clipped', () => {
    const tight = guideCropRect({ ...portrait, margin: 0 });
    const relaxed = guideCropRect({ ...portrait, margin: 0.05 });

    expect(relaxed.sw).toBeGreaterThan(tight.sw);
    expect(relaxed.sx).toBeLessThan(tight.sx);
  });

  it('reverses the cover crop when the sensor is wider than the viewport', () => {
    const crop = guideCropRect({
      frame: { width: 1920, height: 1080 },
      videoRect: { left: 0, top: 0, width: 390, height: 780 },
      // A guide filling the middle of the screen maps to a narrow slice of the very wide frame.
      guideRect: { left: 95, top: 200, width: 200, height: 400 },
      margin: 0,
    });

    expect(crop.sx).toBeGreaterThan(0);
    expect(crop.sx + crop.sw).toBeLessThanOrEqual(1920);
    expect(crop.sy + crop.sh).toBeLessThanOrEqual(1080);
  });

  it('never returns a crop outside the frame', () => {
    const crop = guideCropRect({
      frame: { width: 640, height: 480 },
      videoRect: { left: 0, top: 0, width: 320, height: 240 },
      guideRect: { left: -50, top: -80, width: 500, height: 400 },
      margin: 0.2,
    });

    expect(crop.sx).toBeGreaterThanOrEqual(0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
    expect(crop.sx + crop.sw).toBeLessThanOrEqual(640);
    expect(crop.sy + crop.sh).toBeLessThanOrEqual(480);
  });

  it('falls back to the whole frame when the layout is not measurable yet', () => {
    const frame = { width: 1080, height: 1920 };
    const full = { sx: 0, sy: 0, sw: 1080, sh: 1920 };

    expect(guideCropRect({ frame, videoRect: { left: 0, top: 0, width: 0, height: 0 }, guideRect: portrait.guideRect })).toEqual(full);
    expect(guideCropRect({ frame, videoRect: portrait.videoRect, guideRect: { left: 0, top: 0, width: 0, height: 0 } })).toEqual(full);
    expect(guideCropRect({ ...portrait, frame: { width: 0, height: 0 } })).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });

  it('handles a letterboxed preview', () => {
    const crop = guideCropRect({
      frame: { width: 1000, height: 1000 },
      videoRect: { left: 0, top: 0, width: 400, height: 800 },
      guideRect: { left: 100, top: 300, width: 200, height: 200 },
      objectFit: 'contain',
      margin: 0,
    });

    // `contain` scales by 0.4 and centres vertically: the guide sits inside the visible square.
    expect(crop).toEqual({ sx: 250, sy: 250, sw: 500, sh: 500 });
  });
});

describe('outputSize', () => {
  it('caps the long edge without upscaling a small crop', () => {
    expect(outputSize({ sx: 0, sy: 0, sw: 3000, sh: 1500 }, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(outputSize({ sx: 0, sy: 0, sw: 800, sh: 1200 }, 2000)).toEqual({ width: 800, height: 1200 });
  });
});
