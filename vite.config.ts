import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:8787',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      // Only VITE_* is exposed to the client. GEMINI_ was previously included here,
      // which inlined the API key into the browser bundle; all Gemini calls now go
      // through /api/ai/* on the server instead.
      envPrefix: ['VITE_'],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
