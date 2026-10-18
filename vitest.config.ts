import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/engine/**',
        'src/storage/**',
        'src/telemetry/**',
        'src/feedback/**',
        'src/i18n/**',
        'src/app/clock.ts',
        'src/app/gameController.ts',
        'src/ui/**',
      ],
      thresholds: {
        lines: 95,
        branches: 95,
      },
    },
  },
});
