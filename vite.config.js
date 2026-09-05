import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Einseiten-App (nur User-Wallet, kein Admin). Installierbar als PWA.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  server: { host: true, port: 5174 },
  build: { target: 'es2022', outDir: 'dist' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      workbox: {
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
      },
      manifest: {
        name: 'Heidi Wallet',
        short_name: 'Heidi',
        description: 'Alpenguthaben – Stablecoin-Wallet mit Gutschein & Parken',
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
