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

export function receiptCaptureSupport(capabilities: { camera: boolean; mediaRecorder: boolean }): ReceiptCaptureMode {
  if (!capabilities.camera) return 'unsupported';
  return capabilities.mediaRecorder ? 'continuous_video_v1' : 'guided_photos_v1';
}

export function buildContinuousReportPayload(input: {
  submissionUuid: string;
  captureToken: string;
}) {
  if (!input.submissionUuid.trim()) throw new Error('A valid submission identifier is required.');
  if (!input.captureToken.trim()) throw new Error('A valid capture token is required.');

  return {
    submission_uuid: input.submissionUuid,
    capture_token: input.captureToken,
    privacy_notice_version: '1.0',
  };
}

export function selectBestReceiptFrames<T extends { index: number; score: number }>(frames: T[], maximum: number): T[] {
  return [...frames]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, maximum))
    .sort((left, right) => left.index - right.index);
}
