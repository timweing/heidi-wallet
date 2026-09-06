import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

// Wallet (index.html) + Ladestations-Simulator (station.html). Installierbar als PWA.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { host: true, port: 5174 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        station: fileURLToPath(new URL('./station.html', import.meta.url)),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      workbox: {
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        // Grafiken bitte vorher optimieren (~<400 KB). Der Puffer verhindert nur,
        // dass ein versehentlich grosses Asset den Build/Deploy hart abbricht –
        // es wird dann trotzdem präcacht.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Heidi Wallet',
        short_name: 'Heidi',
        description: 'Alpenguthaben – Wallet mit Gutschein, Parken, Laden & Velo',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5ECD8',
        theme_color: '#C1121F',
        categories: ['finance'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
