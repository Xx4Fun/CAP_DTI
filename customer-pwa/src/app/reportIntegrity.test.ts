import { describe, expect, it } from 'vitest';
import { createFormalReportPayload } from './reportIntegrity';

const evidence = {
  submissionUuid: 'sub-real',
  captureSessionId: 42,
  captureToken: 'capture-real',
  storeId: 7,
  imageHash: 'a'.repeat(64),
  image: new Blob(['receipt'], { type: 'image/jpeg' }),
  extractedText: { items: [], metadata: {} },
};

describe('formal report integrity', () => {
  it.each([
    ['captureSessionId', undefined],
    ['captureToken', ''],
    ['storeId', undefined],
    ['imageHash', ''],
    ['image', null],
  ] as const)('rejects missing real %s instead of inventing a fallback', (field, value) => {
    expect(() => createFormalReportPayload({ ...evidence, [field]: value })).toThrow();
  });

  it('uses the real capture credentials and receipt evidence', () => {
    const payload = createFormalReportPayload(evidence);
    expect(payload.get('capture_session_id')).toBe('42');
    expect(payload.get('capture_token')).toBe('capture-real');
    expect(payload.get('store_id')).toBe('7');
    expect(payload.get('image_hash')).toBe('a'.repeat(64));
    const image = payload.get('image');
    expect(image).toBeInstanceOf(Blob);
    expect((image as Blob).size).toBe(evidence.image.size);
    expect((image as Blob).type).toBe(evidence.image.type);
  });
});
