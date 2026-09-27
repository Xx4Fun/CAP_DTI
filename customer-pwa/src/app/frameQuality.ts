// Client-side port of the server's receipt frame quality check, so a customer learns at capture
// time that a photo is too dark or too flat to read instead of waiting for the OCR queue.
//
// ponytail: the thresholds below are duplicated from
// backend/app/Services/Receipt/ReceiptFrameQualityEvaluator.php:39-69 and will drift if that
// evaluator changes. Upgrade path: return `quality` from
// POST /public/capture-sessions/{session}/assets (the evaluator already runs server-side and
// metadata_json is written as null at ReceiptEvidenceController.php:115) and delete this file.
//
// This measures image quality, NOT receipt content: a sharp, well-lit photo of something that is
// not a receipt scores as acceptable. Copy shown to the customer must not claim otherwise.

const SAMPLE_WIDTH = 64;
const SAMPLE_HEIGHT = 96;

export interface FrameQuality {
  score: number;
  acceptable: boolean;
  brightness: number;
  edgeDetail: number;
}

/** Which of the three predicate terms failed, so the customer is told what was actually measured. */
export type FrameIssue = 'dark' | 'bright' | 'flat';

export function qualityIssue(quality: FrameQuality): FrameIssue | null {
  if (quality.brightness < 25) return 'dark';
  if (quality.brightness > 240) return 'bright';
  if (quality.edgeDetail < 6) return 'flat';
  return null;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Mirrors ReceiptFrameQualityEvaluator::scoreMatrix(). `matrix` holds luma rows. */
export function scoreMatrix(matrix: number[][]): FrameQuality {
  let total = 0;
  let count = 0;
  let edgeTotal = 0;
  let edgeCount = 0;

  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      const value = row[x];
      total += value;
      count++;
      if (x > 0) {
        edgeTotal += Math.abs(value - row[x - 1]);
        edgeCount++;
      }
      const previousRow = matrix[y - 1];
      if (y > 0 && previousRow !== undefined && previousRow[x] !== undefined) {
        edgeTotal += Math.abs(value - previousRow[x]);
        edgeCount++;
      }
    }
  }

  const brightness = count === 0 ? 0 : total / count;
  const edgeDetail = edgeCount === 0 ? 0 : edgeTotal / edgeCount;
  const exposurePenalty = Math.abs(128 - brightness) * 0.25;

  return {
    score: round3(Math.max(0, edgeDetail - exposurePenalty)),
    acceptable: brightness >= 25 && brightness <= 240 && edgeDetail >= 6,
    brightness: round3(brightness),
    edgeDetail: round3(edgeDetail),
  };
}

/**
 * Downsample a capture canvas and score it. Returns null when the measurement cannot be taken
 * (no 2D context, tainted canvas, or an environment without getImageData); callers treat an
 * unmeasurable frame as readable rather than warning about something that was never checked.
 */
export function evaluateCanvas(canvas: HTMLCanvasElement): FrameQuality | null {
  if (!canvas.width || !canvas.height) return null;

  const sample = document.createElement('canvas');
  sample.width = Math.min(SAMPLE_WIDTH, canvas.width);
  sample.height = Math.min(SAMPLE_HEIGHT, canvas.height);

  const context = sample.getContext('2d');
  if (!context || typeof context.getImageData !== 'function') return null;

  let pixels: ImageData;
  try {
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    pixels = context.getImageData(0, 0, sample.width, sample.height);
  } catch {
    return null;
  }
  if (!pixels?.data?.length) return null;

  const matrix: number[][] = [];
  for (let y = 0; y < sample.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < sample.width; x++) {
      const offset = (y * sample.width + x) * 4;
      row.push(
        pixels.data[offset] * 0.299
        + pixels.data[offset + 1] * 0.587
        + pixels.data[offset + 2] * 0.114,
      );
    }
    matrix.push(row);
  }

  return scoreMatrix(matrix);
}
