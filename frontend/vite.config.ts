import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
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

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": sourceRoot } },
    server: { proxy },
    preview: { proxy },
    test: {
      hookTimeout: 15_000,
      testTimeout: 15_000,
      maxWorkers: 4,
      setupFiles: ["./src/test/setup.ts"],
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            if (id.includes("@xyflow/react") || id.includes("elkjs")) return "flow";
            if (id.includes("cmdk")) return "overlays";
            if (/node_modules\/(?:framer-motion|motion|motion-dom|motion-utils)\//u.test(id)) return "motion";
            return undefined;
          },
        },
      },
    },
  };
});
