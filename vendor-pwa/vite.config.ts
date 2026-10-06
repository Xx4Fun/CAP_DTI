import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/dti-favicon-48x48.png', 'icons/dti-apple-touch-icon.png'],
      manifest: {
        name: 'PRICE-Watch Vendor Portal',
        short_name: 'PW Vendor',
        description: 'DTI price references and notices for invited establishments.',
        theme_color: '#1B365D',
        background_color: '#F8FAFC',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/dti-pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/dti-pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/dti-pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{html,js,css,ico,jpg,jpeg,png,svg,webp,webmanifest,woff2}'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/[^/]+\/storage\/v1\/object\/public\/commodity-images\//,
          handler: 'CacheFirst',
          options: { cacheName: 'vendor-public-images', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 } },
        }]
      }
    })
  ],
  server: { port: 5176 }
})
