import { PRIVACY_NOTICE_VERSION } from './privacyNotice';

export interface FormalReportEvidence {
  submissionUuid: string;
  captureSessionId?: number;
  captureToken: string;
  storeId?: number;
  imageHash: string;
  image: Blob | null;
  extractedText: unknown;
}

const requireValue = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

export const createFormalReportPayload = (evidence: FormalReportEvidence): FormData => {
  requireValue(evidence.submissionUuid.trim(), 'A valid submission identifier is required.');
  requireValue(evidence.captureSessionId, 'A valid server capture session is required.');
  requireValue(evidence.captureToken.trim(), 'A valid server capture token is required.');
  requireValue(evidence.storeId, 'A verified store is required.');
  requireValue(/^[a-f0-9]{64}$/i.test(evidence.imageHash), 'A valid receipt image hash is required.');
  requireValue(evidence.image, 'A live receipt image is required.');

  const payload = new FormData();
  payload.append('submission_uuid', evidence.submissionUuid);
  payload.append('capture_session_id', String(evidence.captureSessionId));
  payload.append('capture_token', evidence.captureToken);
  payload.append('store_id', String(evidence.storeId));
  payload.append('privacy_notice_version', PRIVACY_NOTICE_VERSION);
  payload.append('image_hash', evidence.imageHash);
  payload.append('image', evidence.image as Blob, 'receipt.jpg');
  payload.append('extracted_text_json', JSON.stringify(evidence.extractedText));
  return payload;
};
