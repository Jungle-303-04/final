import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv, type UserConfig } from "vite";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

interface FrontendViteOptions {
  input?: Record<string, string>;
  outDir?: string;
}

export function createFrontendViteConfig(
  mode: string,
  options: FrontendViteOptions = {},
): UserConfig {
  const env = loadEnv(mode, process.cwd(), "");
  const backendOrigin = env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8000";
  const backendUrl = new URL(backendOrigin);
  const localBackend = backendUrl.hostname === "127.0.0.1" || backendUrl.hostname === "localhost";
  const backendApiPrefix = normalizeApiPrefix(
    env.VITE_BACKEND_API_PREFIX ?? (localBackend ? "" : "/api"),
  );
  const proxy = {
    "/api": {
      target: backendUrl.origin,
      changeOrigin: true,
      cookieDomainRewrite: "",
      ws: true,
      rewrite: (path: string) => `${backendApiPrefix}${path.replace(/^\/api/u, "")}` || "/",
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    optimizeDeps: { include: ["tailwind-merge", "@tabler/icons-react", "lucide-react", "motion/react"] },
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
      outDir: options.outDir,
      rollupOptions: {
        input: options.input,
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
}

function normalizeApiPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/gu, "")}`;
}

export default defineConfig(({ mode }) => createFrontendViteConfig(mode));
