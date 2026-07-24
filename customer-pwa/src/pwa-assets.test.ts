import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(process.cwd(), 'public');
const requiredAssets = [
  'favicon.svg',
  'apple-touch-icon.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
];

describe('legacy brand install assets', () => {
  for (const file of requiredAssets) {
    it(`ships ${file}`, async () => {
      await expect(access(resolve(publicDir, file))).resolves.toBeUndefined();
    });
  }
});
