import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.ts?raw';
import indexHtml from '../../index.html?raw';

describe('PWA cache configuration', () => {
  it('prompts for updates instead of forcing an automatic task interruption', () => {
    expect(viteConfig).toContain("registerType: 'prompt'");
    expect(viteConfig).not.toContain("registerType: 'autoUpdate'");
  });

  it('does not service-worker-cache live public API or external font responses', () => {
    expect(viteConfig).not.toContain('api-public-data-cache');
    expect(viteConfig).not.toContain('google-fonts-cache');
    expect(viteConfig).not.toContain('/api/public/');
  });

  it('keeps bulk commodity images out of the app-shell installation cache', () => {
    expect(viteConfig).toContain("globIgnores: ['storage/commodity_images/**/*']");
  });

  it('uses versioned DTI launcher icons and aligned install colors', () => {
    expect(viteConfig).toContain("src: '/icons/dti-pwa-192x192.png'");
    expect(viteConfig).toContain("src: '/icons/dti-pwa-512x512.png'");
    expect(viteConfig).toContain("src: '/icons/dti-pwa-maskable-512x512.png'");
    expect(viteConfig).toContain("purpose: 'any'");
    expect(viteConfig).toContain("purpose: 'maskable'");
    expect(viteConfig).toContain("theme_color: '#0649DA'");
    expect(viteConfig).toContain("background_color: '#F7FAFF'");
  });

  it('uses the DTI favicon, Apple touch icon, and matching browser theme', () => {
    expect(indexHtml).toContain('<meta name="theme-color" content="#0649DA"');
    expect(indexHtml).toContain('href="/icons/dti-favicon-48x48.png"');
    expect(indexHtml).toContain('href="/icons/dti-apple-touch-icon.png"');
  });
});
