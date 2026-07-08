import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Proxy /api to Express in dev → no CORS code anywhere.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3004',
    },
  },
});
