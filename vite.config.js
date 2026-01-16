import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // For local dev, we'll need to handle API routes differently
        // This proxy won't work for serverless functions, but helps with CORS
      },
    },
  },
});
