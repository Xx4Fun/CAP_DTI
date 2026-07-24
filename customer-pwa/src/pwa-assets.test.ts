import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(process.cwd(), 'public');
const requiredAssets = ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'brand-mark.webp'];

describe('install assets', () => {
  for (const file of requiredAssets) {
    it(`ships ${file}`, async () => {
      await expect(access(resolve(publicDir, file))).resolves.toBeUndefined();
    });
  }

  it('keeps the rendered brand mark below 100 KB', async () => {
    expect((await stat(resolve(publicDir, 'brand-mark.webp'))).size).toBeLessThan(100_000);
  });
});
