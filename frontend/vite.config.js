import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo-name>/, so the base path is configurable.
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      // The same parsing/analysis code runs in the browser and in AWS Lambda.
      '@core': fileURLToPath(new URL('../backend/src/core', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
});
