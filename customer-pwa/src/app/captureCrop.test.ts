import { describe, expect, it } from 'vitest';
import { guideCropRect, outputSize } from './captureCrop';

describe('guideCropRect', () => {
  // MEASURED from the running app at a 390x844 viewport, not invented: .receipt-capture-frame's
  // 16px padding-inline and the one-row control tray put .receipt-scan-guide at left 16, top 88,
  // 358x646. Re-derive these numbers if the frame's insets or the tray height change — an invented
  // fixture here silently tests a shape the app does not render, which is what this one used to do.
  const portrait = {
    frame: { width: 1080, height: 1920 },
    videoRect: { left: 0, top: 0, width: 390, height: 844 },
    guideRect: { left: 16, top: 88, width: 358, height: 646 },
  };

  it('maps the guide onto the camera frame instead of keeping the whole image', () => {
    const crop = guideCropRect({ ...portrait, objectFit: 'cover', margin: 0 });

    // Scale = max(390/1080, 844/1920) = 0.439583, so the 1080-wide frame renders 474.75 wide in a
    // 390 box and 42.375 is hidden each side.
    expect(crop).toEqual({ sx: 133, sy: 200, sw: 814, sh: 1470 });
    // Still a real crop rather than the whole sensor. The bound is 85%, not the 50% this asserted
    // when the guide was half the screen: the frame is now ~77% of viewport height by design, so a
    // tighter bound would be asserting the old cramped layout rather than the current one.
    expect(crop.sw * crop.sh).toBeLessThan(portrait.frame.width * portrait.frame.height * 0.85);
  });

  // The test above pins the exact crop for a normally sized guide, which is also what proves the
  // minimum-crop floor never touches a good capture: if it did, those numbers would move.
  it('grows a degenerately small guide to a crop worth reading', () => {
    // A layout bug that collapses the guide to 40px would otherwise upload a ~98px-tall image.
    // Nothing downstream can recover it: outputSize never upscales, and the OCR preprocessor's
    // 200px floor rejects it as a terminal bad capture rather than a retry.
    const collapsed = guideCropRect({
      ...portrait,
      guideRect: { ...portrait.guideRect, height: 40 },
      objectFit: 'cover',
      margin: 0,
    });

    expect(collapsed.sw).toBeGreaterThanOrEqual(portrait.frame.width * 0.35);
    expect(collapsed.sh).toBeGreaterThanOrEqual(portrait.frame.height * 0.35);
    // Still a legal crop inside the sensor.
    expect(collapsed.sx).toBeGreaterThanOrEqual(0);
    expect(collapsed.sy).toBeGreaterThanOrEqual(0);
    expect(collapsed.sx + collapsed.sw).toBeLessThanOrEqual(portrait.frame.width);
    expect(collapsed.sy + collapsed.sh).toBeLessThanOrEqual(portrait.frame.height);
    // And comfortably clear of the 200px floor that would fail it in the worker.
    const out = outputSize(collapsed, 2000);
    expect(Math.min(out.width, out.height)).toBeGreaterThan(200);
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
