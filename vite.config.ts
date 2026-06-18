import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // apple-touch-icon + favicon are referenced from index.html; precache them too.
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Folio',
        short_name: 'Folio',
        description: 'Personal investment tracker — net worth, holdings, allocation, XIRR.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Light is the app default; status bar / browser UI follows prefers-color-scheme
        // via the <meta name="theme-color"> media queries in index.html.
        theme_color: '#ffffff',
        background_color: '#ffffff',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + static assets. Data lives in IndexedDB; prices are fetched
        // live and intentionally left uncached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/nse-csv': {
        target: 'https://archives.nseindia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nse-csv/, '')
      },
      '/amfi-nav': {
        target: 'https://portal.amfiindia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/amfi-nav/, '')
      },
      '/yahoo-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, '')
      },
      '/yahoo-search': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-search/, '')
      }
    }
  }
})