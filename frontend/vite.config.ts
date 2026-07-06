import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const backend = process.env.VITE_BACKEND ?? 'http://127.0.0.1:8000';
const proxy = { '/api': { target: backend, changeOrigin: true, ws: true, rewrite: (p: string) => p.replace(/^\/api/, '') } };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy },
  preview: { proxy },
});
