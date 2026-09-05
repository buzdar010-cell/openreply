import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Reminder payloads are a couple hundred bytes -- nowhere near workbox's default 2MiB
        // cutoff -- but the default free plan's asset bundle (fonts/icons) is comfortably under
        // this too, so this is just headroom, not a real constraint being hit.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Nutrition Tracker',
        short_name: 'Nutrition',
        description: 'Log Pakistani food by text or photo and track your nutrition.',
        theme_color: '#2f6f4f',
        background_color: '#faf7f0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
