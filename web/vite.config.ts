import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Never reload the page under the reader: the app shows an update toast.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'theme-init.js'],
      manifest: {
        name: 'FlowReader',
        short_name: 'FlowReader',
        description: 'Lecteur RSS minimaliste et rapide',
        lang: 'fr',
        theme_color: '#15643A',
        background_color: '#F7F4EC',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // App shell + Latin font subsets only (other subsets load on demand).
        globPatterns: ['**/*.{js,css,html,svg}', '**/*-latin-wght-*.woff2', '**/*-latin-[47]00-*.woff2'],
        navigateFallbackDenylist: [/^\/api\//, /^\/health/],
        cleanupOutdatedCaches: true,
        // Activate new versions immediately. A waiting worker would keep
        // serving a stale app shell to clients that never send SKIP_WAITING
        // (e.g. tabs still running a previous build), so the old UI would talk
        // to the new API. The app shows a reload toast instead of reloading.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Opened articles stay readable offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/v1\/articles\/[0-9a-f-]{36}$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-articles',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /^\/api\/v1\/(articles|feeds)(\/|$|\?)/.test(url.pathname) &&
              !url.pathname.startsWith('/api/v1/feeds/export'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-lists',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunk: app deploys don't invalidate React/Query.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-dom/client', 'scheduler', 'react-router-dom', '@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
