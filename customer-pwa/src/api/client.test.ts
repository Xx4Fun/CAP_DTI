import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiClient } from './client';

function captureRequest(
  onRequest: (config: InternalAxiosRequestConfig) => void,
): AxiosAdapter {
  return async (config) => {
    onRequest(config);

    return {
      data: null,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
}

describe('API client request serialization', () => {
  it('preserves a receipt asset as multipart FormData', async () => {
    const asset = new Blob(['receipt-video'], { type: 'video/webm' });
    const formData = new FormData();
    formData.append('kind', 'original_video');
    formData.append('sequence', '0');
    formData.append('asset', asset, 'receipt.webm');

    let dispatched: InternalAxiosRequestConfig | undefined;
    await apiClient.post('/public/capture-sessions/session-1/assets', formData, {
      adapter: captureRequest((config) => {
        dispatched = config;
      }),
      headers: { 'X-Capture-Token': 'capture-token' },
    });

    expect(dispatched).toBeDefined();
    const dispatchedData = dispatched?.data;
    expect(dispatchedData).toBe(formData);
    expect(dispatchedData).toBeInstanceOf(FormData);
    const uploadedAsset = (dispatchedData as FormData).get('asset');
    expect(uploadedAsset).toBeInstanceOf(Blob);
    expect(uploadedAsset).toMatchObject({
      name: 'receipt.webm',
      size: asset.size,
      type: 'video/webm',
    });
    expect(dispatched?.headers.get('Content-Type')).not.toContain('application/json');
  });

  it('continues to serialize ordinary request bodies as JSON', async () => {
    let dispatched: InternalAxiosRequestConfig | undefined;
    await apiClient.post('/public/example', { value: 'kept-as-json' }, {
      adapter: captureRequest((config) => {
        dispatched = config;
      }),
    });

    expect(dispatched?.data).toBe('{"value":"kept-as-json"}');
    expect(dispatched?.headers.get('Content-Type')).toContain('application/json');
  });
});
