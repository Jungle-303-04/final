import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const backendOrigin = process.env.VITE_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const proxy = {
  "/api": {
    target: backendOrigin,
    changeOrigin: true,
    cookieDomainRewrite: "",
    ws: true,
    rewrite: (path: string) => backendOrigin.includes("k8s.woonyong.org")
      ? path
      : path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": sourceRoot } },
  server: { proxy },
  preview: { proxy },
  test: {
    hookTimeout: 15_000,
    testTimeout: 15_000,
    maxWorkers: 4,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@xyflow/react")) return "flow";
          if (id.includes("cmdk")) return "overlays";
          return undefined;
        },
      },
    },
  },
});
