import { describe, expect, it } from 'vitest';
import {
  buildContinuousReportPayload,
  preferredReceiptVideoMime,
  receiptCaptureSupport,
  selectBestReceiptFrames,
} from './receiptCapture';

describe('continuous receipt capture contracts', () => {
  it('selects the first supported no-audio recorder format', () => {
    const supported = new Set(['video/webm;codecs=vp8', 'video/mp4']);

    expect(preferredReceiptVideoMime((mime) => supported.has(mime))).toBe('video/webm;codecs=vp8');
    expect(preferredReceiptVideoMime(() => false)).toBeNull();
  });

  it('builds a store-locked processing draft payload without client OCR or a replacement store', () => {
    expect(buildContinuousReportPayload({
      submissionUuid: 'sub-continuous-1',
      captureToken: 'ct_sec_capture',
    })).toEqual({
      submission_uuid: 'sub-continuous-1',
      capture_token: 'ct_sec_capture',
      privacy_notice_version: '1.0',
    });
  });

  it('uses guided live photos when MediaRecorder is unavailable but the camera works', () => {
    expect(receiptCaptureSupport({ camera: true, mediaRecorder: false })).toBe('guided_photos_v1');
    expect(receiptCaptureSupport({ camera: true, mediaRecorder: true })).toBe('continuous_video_v1');
    expect(receiptCaptureSupport({ camera: false, mediaRecorder: true })).toBe('unsupported');
  });

  it('keeps the sharpest sampled frames while preserving receipt order', () => {
    expect(selectBestReceiptFrames([
      { index: 0, score: 4, blob: 'first' },
      { index: 1, score: 20, blob: 'second' },
      { index: 2, score: 12, blob: 'third' },
    ], 2).map((frame) => frame.blob)).toEqual(['second', 'third']);
  });
});
