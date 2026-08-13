export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SourceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GuideCropInput {
  videoWidth: number;
  videoHeight: number;
  videoRect: CropRect;
  guideRect: CropRect;
}

export function computeGuideSourceCrop({
  videoWidth,
  videoHeight,
  videoRect,
  guideRect,
}: GuideCropInput): SourceCrop {
  if (videoWidth <= 0 || videoHeight <= 0 || videoRect.width <= 0 || videoRect.height <= 0) {
    throw new Error('Camera frame is not ready.');
  }

  const coverScale = Math.max(videoRect.width / videoWidth, videoRect.height / videoHeight);
  const renderedWidth = videoWidth * coverScale;
  const renderedHeight = videoHeight * coverScale;
  const hiddenX = (renderedWidth - videoRect.width) / 2;
  const hiddenY = (renderedHeight - videoRect.height) / 2;

  const rawX = (guideRect.left - videoRect.left + hiddenX) / coverScale;
  const rawY = (guideRect.top - videoRect.top + hiddenY) / coverScale;
  const x = Math.max(0, Math.min(videoWidth, rawX));
  const y = Math.max(0, Math.min(videoHeight, rawY));
  const width = Math.max(1, Math.min(videoWidth - x, guideRect.width / coverScale));
  const height = Math.max(1, Math.min(videoHeight - y, guideRect.height / coverScale));

  return { x, y, width, height };
}

export function computeNormalizedCropSize(
  sourceWidth: number,
  sourceHeight: number,
  minLongEdge = 1200,
  maxLongEdge = 1600,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Crop dimensions must be positive.');
  }

  const longEdge = Math.max(sourceWidth, sourceHeight);
  const targetLongEdge = Math.min(maxLongEdge, Math.max(minLongEdge, longEdge));
  const scale = targetLongEdge / longEdge;

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
