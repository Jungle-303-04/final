import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const backend = process.env.VITE_BACKEND ?? 'http://127.0.0.1:8000';
const proxy = { '/api': { target: backend, changeOrigin: true, ws: true, rewrite: (p: string) => p.replace(/^\/api/, '') } };

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    // vendor chunk는 gzip 기준 약 280KB다. 경고 기준은 minified 크기보다 실제 전송 크기를 우선한다.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          return 'vendor';
        },
      },
    },
  },
  server: { proxy },
  preview: { proxy },
});
