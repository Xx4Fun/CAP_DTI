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
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}']
      }
    })
  ],
  server: { port: 5175 }
})
