import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/dti-favicon-48x48.png', 'icons/dti-apple-touch-icon.png'],
      manifest: {
        name: 'PRICE-Watch Field Monitoring',
        short_name: 'PW Field',
        description: 'DTI field price monitoring and secure offline visit capture.',
        theme_color: '#073B73',
        background_color: '#F4F7F8',
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
        // Store photos come from the public image bucket; keep ones already seen for offline field work.
        runtimeCaching: [{
          urlPattern: ({ request, url }) => request.destination === 'image' && /\/(store_images|commodity_images)\//.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'public-images',
            expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        }],
      }
    })
  ],
  server: { port: 5175 }
})
