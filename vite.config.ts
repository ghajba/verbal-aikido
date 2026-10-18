import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
const appVersion = process.env.VITE_APP_VERSION || pkg.version;
const base = process.env.VITE_BASE || '/';
const syncEndpoint = process.env.VITE_SYNC_ENDPOINT;

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // manually registered in main.tsx
      manifest: {
        name: 'Verbal Aikido: The Empathy Firewall',
        short_name: 'Verbal Aikido',
        description: 'De-escalation communication training game (HU / EN / DE)',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0F172A',
        theme_color: '#0F172A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/scenarios/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'scenarios',
              expiration: { maxEntries: 100 },
            },
          },
        ],
      },
    }),
    {
      name: 'html-transform-csp',
      transformIndexHtml(html) {
        if (!syncEndpoint) {
          return html;
        }
        try {
          const endpointOrigin = new URL(syncEndpoint).origin;
          return html.replace(/connect-src 'self'/, `connect-src 'self' ${endpointOrigin}`);
        } catch {
          return html;
        }
      },
    },
  ],
  preview: {
    port: 4173,
  },
});
