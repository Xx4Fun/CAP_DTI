import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiClient, resolveImageUrl } from './client';

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

describe('resolveImageUrl', () => {
  it('resolves remote Supabase commodity image URLs to local bundled assets', () => {
    const supabaseUrl = 'https://rvatqhywtgyehigslyox.supabase.co/storage/v1/object/public/commodity-images/commodity_images/distilled_water_absolute_1lwebp.webp';
    expect(resolveImageUrl(supabaseUrl)).toBe('/storage/commodity_images/distilled_water_absolute_1lwebp.webp');
  });

  it('resolves remote Render commodity image URLs to local bundled assets', () => {
    const renderUrl = 'https://cap-dti.onrender.com/storage/commodity_images/distilled_water_absolute_350ml.webp';
    expect(resolveImageUrl(renderUrl)).toBe('/storage/commodity_images/distilled_water_absolute_350ml.webp');
  });

  it('resolves relative DB path to local bundled assets', () => {
    const dbPath = 'commodity_images/milk_bear_brand_135g.webp';
    expect(resolveImageUrl(dbPath)).toBe('/storage/commodity_images/milk_bear_brand_135g.webp');
  });

  it('passes store and branding static assets through correctly', () => {
    expect(resolveImageUrl('/stores/robinsons.jpg')).toBe('/stores/robinsons.jpg');
    expect(resolveImageUrl('/branding/dti_logo.svg')).toBe('/branding/dti_logo.svg');
  });

  it('returns null for empty or null image paths', () => {
    expect(resolveImageUrl(null)).toBeNull();
    expect(resolveImageUrl(undefined)).toBeNull();
    expect(resolveImageUrl('')).toBeNull();
  });
});

