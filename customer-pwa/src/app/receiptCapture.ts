export type ReceiptCaptureMode = 'continuous_video_v1' | 'guided_photos_v1' | 'unsupported';

const RECEIPT_VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
] as const;

export function preferredReceiptVideoMime(isSupported: (mime: string) => boolean): string | null {
  return RECEIPT_VIDEO_MIME_CANDIDATES.find(isSupported) ?? null;
}

export function receiptCaptureSupport(capabilities: { camera: boolean; mediaRecorder: boolean; supportedVideoMime: string | null }): ReceiptCaptureMode {
  if (!capabilities.camera) return 'unsupported';
  return capabilities.mediaRecorder && capabilities.supportedVideoMime ? 'continuous_video_v1' : 'guided_photos_v1';
}

export function buildContinuousReportPayload(input: {
  submissionUuid: string;
  captureToken: string;
  trackingToken: string;
  resumeToken: string;
}) {
  if (!input.submissionUuid.trim()) throw new Error('A valid submission identifier is required.');
  if (!input.captureToken.trim()) throw new Error('A valid capture token is required.');
  if (!input.trackingToken.trim() || !input.resumeToken.trim()) throw new Error('Recoverable report credentials are required.');

  return {
    submission_uuid: input.submissionUuid,
    capture_token: input.captureToken,
    privacy_notice_version: '1.0',
    tracking_token: input.trackingToken,
    resume_token: input.resumeToken,
  };
}

const pendingCredentialKey = (submissionUuid: string) => `price-watch-receipt-pending:${submissionUuid}`;

const createSecret = (prefix: 'trk_' | 'rsm_'): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}${encoded}`;
};

export function getOrCreateReceiptSubmissionCredentials(submissionUuid: string): { trackingToken: string; resumeToken: string } {
  const key = pendingCredentialKey(submissionUuid);
  try {
    const existing = JSON.parse(sessionStorage.getItem(key) || 'null') as Record<string, unknown> | null;
    if (typeof existing?.trackingToken === 'string' && typeof existing?.resumeToken === 'string') {
      return { trackingToken: existing.trackingToken, resumeToken: existing.resumeToken };
    }
  } catch {
    // Generate a fresh pair when pending storage is unavailable or malformed.
  }

  const credentials = { trackingToken: createSecret('trk_'), resumeToken: createSecret('rsm_') };
  try { sessionStorage.setItem(key, JSON.stringify(credentials)); } catch { /* The in-memory pair still supports this attempt. */ }
  return credentials;
}

export function clearPendingReceiptSubmissionCredentials(submissionUuid: string): void {
  try { sessionStorage.removeItem(pendingCredentialKey(submissionUuid)); } catch { /* No action needed. */ }
}

export function selectBestReceiptFrames<T extends { index: number; score: number }>(frames: T[], maximum: number): T[] {
  return [...frames]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, maximum))
    .sort((left, right) => left.index - right.index);
}
