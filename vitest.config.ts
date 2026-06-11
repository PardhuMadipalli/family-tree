import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Disable PostCSS at the Vite level so Vitest does not try to load the
  // project's Tailwind v4 PostCSS config (which only works inside Next.js).
  // Tests don't render real CSS, so an empty plugin list is sufficient.
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'jsdom',
    // Give jsdom a real http origin instead of `about:blank` so
    // `window.localStorage` is initialized — Storage requires a non-opaque
    // origin per the Storage spec, and on newer Node versions jsdom skips
    // creating `localStorage` when the origin is opaque.
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(here, './src'),
    },
  },
});
