import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendRoot, "");
  // 기본값은 공유 라이브 백엔드 — 클론 후 env 없이 `npm run dev`만 해도 바로 붙는다.
  // 로컬 백엔드로 개발하려면 VITE_BACKEND_ORIGIN=http://127.0.0.1:8000 으로 덮어쓴다.
  const backendOrigin = process.env.VITE_BACKEND_ORIGIN
    ?? env.VITE_BACKEND_ORIGIN
    ?? "https://k8s.woonyong.org";
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
    cacheDir: process.env.VITE_DEV_CACHE_DIR ?? "node_modules/.vite",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": sourceRoot }, dedupe: ["react", "react-dom"] },
    optimizeDeps: {
      // 단일 React 인스턴스로 사전번들해 dev에서 @dnd-kit가 별도 React 사본을
      // 물어 "Invalid hook call"이 나는 것을 막는다.
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@dnd-kit/core",
        "@dnd-kit/sortable",
        "@dnd-kit/modifiers",
        "@dnd-kit/utilities",
      ],
    },
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
