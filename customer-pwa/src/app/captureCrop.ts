export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface CropInput {
  /** Intrinsic camera frame size (video.videoWidth / videoHeight). */
  frame: { width: number; height: number };
  /** On-screen box of the video element (getBoundingClientRect). */
  videoRect: { left: number; top: number; width: number; height: number };
  /** On-screen box of the capture guide, in the same coordinate space. */
  guideRect: { left: number; top: number; width: number; height: number };
  /** How the preview fills its box; `cover` (the default) hides part of the frame. */
  objectFit?: string;
  /** Fraction of the guide added on every side, so text touching the guide is not clipped. */
  margin?: number;
}

/**
 * Maps the on-screen capture guide onto the camera frame, so the saved photo contains what the customer framed
 * instead of the whole sensor image. The preview is `object-fit: cover`, so it already hides part of the frame: the
 * displayed content is scaled and centred, and this reverses that transform before cropping.
 *
 * Returns the full frame when the geometry is unusable (no layout yet, zero-sized boxes), because an uncropped photo
 * is always better than a wrong crop.
 */
export function guideCropRect(input: CropInput): CropRect {
  const { frame, videoRect, guideRect } = input;
  const fullFrame: CropRect = { sx: 0, sy: 0, sw: frame.width, sh: frame.height };
  if (frame.width <= 0 || frame.height <= 0) return fullFrame;
  if (videoRect.width <= 0 || videoRect.height <= 0 || guideRect.width <= 0 || guideRect.height <= 0) return fullFrame;

  const scale = input.objectFit === 'contain'
    ? Math.min(videoRect.width / frame.width, videoRect.height / frame.height)
    : Math.max(videoRect.width / frame.width, videoRect.height / frame.height);
  if (!Number.isFinite(scale) || scale <= 0) return fullFrame;

  // Where the frame's top-left corner sits on screen once it is scaled and centred in the element.
  const originX = videoRect.left + (videoRect.width - frame.width * scale) / 2;
  const originY = videoRect.top + (videoRect.height - frame.height * scale) / 2;

  const margin = Math.max(0, input.margin ?? 0.03);
  let sw = (guideRect.width / scale) * (1 + margin * 2);
  let sh = (guideRect.height / scale) * (1 + margin * 2);
  let sx = (guideRect.left - originX) / scale - (guideRect.width / scale) * margin;
  let sy = (guideRect.top - originY) / scale - (guideRect.height / scale) * margin;

  // Keep the crop inside the frame; a guide larger than the frame simply yields the whole frame.
  sw = Math.min(sw, frame.width);
  sh = Math.min(sh, frame.height);
  sx = Math.min(Math.max(0, sx), frame.width - sw);
  sy = Math.min(Math.max(0, sy), frame.height - sh);

  if (sw <= 0 || sh <= 0) return fullFrame;

  return { sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(sw), sh: Math.round(sh) };
}

/** Output size for a crop: keeps the crop's own pixels, never upscales, and caps the long edge. */
export function outputSize(crop: CropRect, longEdge: number): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(crop.sw, crop.sh));

  return { width: Math.max(1, Math.round(crop.sw * scale)), height: Math.max(1, Math.round(crop.sh * scale)) };
}
