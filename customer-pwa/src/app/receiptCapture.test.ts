import { describe, expect, it } from 'vitest';
import {
  buildReceiptReportPayload,
  receiptCaptureSupport,
} from './receiptCapture';

describe('receipt capture contracts', () => {
  it('builds a store-locked processing draft payload without client OCR or a replacement store', () => {
    expect(buildReceiptReportPayload({
      submissionUuid: 'sub-guided-1',
      captureToken: 'ct_sec_capture',
      trackingToken: 'trk_client_generated_12345678901234567890',
      resumeToken: 'rsm_client_generated_12345678901234567890',
    })).toEqual({
      submission_uuid: 'sub-guided-1',
      capture_token: 'ct_sec_capture',
      privacy_notice_version: '1.0',
      tracking_token: 'trk_client_generated_12345678901234567890',
      resume_token: 'rsm_client_generated_12345678901234567890',
    });
  });

  it('uses guided live photos whenever the camera works', () => {
    expect(receiptCaptureSupport({ camera: true })).toBe('guided_photos_v1');
    expect(receiptCaptureSupport({ camera: false })).toBe('unsupported');
  });
});
