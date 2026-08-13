import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(process.cwd(), 'public');
const requiredAssets = [
  'icons/dti-favicon-48x48.png',
  'icons/dti-apple-touch-icon.png',
  'icons/dti-pwa-192x192.png',
  'icons/dti-pwa-512x512.png',
  'icons/dti-pwa-maskable-512x512.png',
  'branding/dti-logo.png',
];

const expectedIconDimensions = new Map([
  ['icons/dti-favicon-48x48.png', [48, 48]],
  ['icons/dti-apple-touch-icon.png', [180, 180]],
  ['icons/dti-pwa-192x192.png', [192, 192]],
  ['icons/dti-pwa-512x512.png', [512, 512]],
  ['icons/dti-pwa-maskable-512x512.png', [512, 512]],
]);

describe('DTI PRICE-Watch install assets', () => {
  for (const file of requiredAssets) {
    it(`ships ${file}`, async () => {
      await expect(access(resolve(publicDir, file))).resolves.toBeUndefined();
    });
  }

  for (const [file, [expectedWidth, expectedHeight]] of expectedIconDimensions) {
    it(`exports ${file} at ${expectedWidth}x${expectedHeight}`, async () => {
      const png = await readFile(resolve(publicDir, file));

      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(expectedWidth);
      expect(png.readUInt32BE(20)).toBe(expectedHeight);
    });
  }
});
