import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icons/dti-favicon-48x48.png',
        'icons/dti-apple-touch-icon.png',
        'branding/dti-logo.png',
      ],
      manifest: {
        name: 'PRICE-Watch Consumer PWA',
        short_name: 'PRICE-Watch',
        description: 'Check DTI reference prices, compare shelf prices, and submit receipt concerns for evaluation.',
        theme_color: '#0649DA',
        background_color: '#F7FAFF',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/dti-pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/dti-pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/dti-pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['/receipt-push-sw.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,ico,png,svg,webp,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    port: 5174,
  },
});
