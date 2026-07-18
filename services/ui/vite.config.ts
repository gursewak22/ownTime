import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev mirror of the UI service's nginx routing (ADR 0006): the browser only
// ever talks to this origin; path prefixes fan out to the backend services.
const AUTH_TARGET = process.env.AUTH_TARGET ?? 'http://localhost:3001';
const TOOLS_TARGET = process.env.TOOLS_TARGET ?? 'http://localhost:3002';
const ASSISTANT_TARGET = process.env.ASSISTANT_TARGET ?? 'http://localhost:3003';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': AUTH_TARGET,
      '/preferences': AUTH_TARGET,
      '/todos': TOOLS_TARGET,
      '/scribe': TOOLS_TARGET,
      '/assistant': ASSISTANT_TARGET,
    },
  },
});
