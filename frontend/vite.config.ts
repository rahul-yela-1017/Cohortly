import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies API + WebSocket traffic to the Flask backend so the
// browser only ever talks to one origin (no CORS, no leaked internal hosts).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:5000', changeOrigin: true, ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
