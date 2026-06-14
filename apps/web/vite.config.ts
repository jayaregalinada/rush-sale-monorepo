import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEV_API_TARGET = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mirror the production nginx proxy: forward same-origin /api/* to the local API,
    // stripping the prefix. 127.0.0.1 (not localhost) dodges the IPv6 resolution quirk
    // where a published Docker port answers on IPv4 only.
    proxy: {
      '/api': {
        target: DEV_API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
