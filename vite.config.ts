import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Static, offline-first build. `base: './'` lets the same build run from any
// host or sub-path (Cloudflare Pages, Netlify, GitHub Pages /logosnovus/, a USB stick).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered manually in src/main.tsx
      manifest: {
        name: 'Logos Novus',
        short_name: 'Logos Novus',
        description: 'Read and decipher foreign symbolic texts with LLM help.',
        theme_color: '#141210',
        background_color: '#141210',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,ttf}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
