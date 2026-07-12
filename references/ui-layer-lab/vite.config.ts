import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const backendOrigin = process.env.VITE_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const srcRoot = fileURLToPath(new URL("./src", import.meta.url));
const vendorRoot = fileURLToPath(new URL("./vendor/shadcn/upstream", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/registry/new-york-v4",
        replacement: `${vendorRoot}/registry/new-york-v4`
      },
      {
        find: "@/registry/bases/base/ui",
        replacement: `${srcRoot}/components/ui`
      },
      {
        find: "@/registry/bases/base/hooks",
        replacement: `${srcRoot}/hooks`
      },
      {
        find: "@/registry/bases/base/lib",
        replacement: `${srcRoot}/lib`
      },
      {
        find: "@/registry/bases/base",
        replacement: `${vendorRoot}/registry/bases/base`
      },
      { find: "@/styles/base-nova", replacement: `${vendorRoot}/styles/base-nova` },
      { find: "@/styles/base-rhea", replacement: `${vendorRoot}/styles/base-rhea` },
      { find: "@/styles/radix-nova", replacement: `${vendorRoot}/styles/radix-nova` },
      { find: "@/styles/radix-rhea", replacement: `${vendorRoot}/styles/radix-rhea` },
      {
        find: "@/app/(create)/components/icon-placeholder",
        replacement: `${srcRoot}/shadcn-lab/shims/icon-placeholder.tsx`
      },
      { find: "@/lib/ai", replacement: `${vendorRoot}/support/ai.ts` },
      {
        find: "@/components/message-parts",
        replacement: `${vendorRoot}/support/message-parts.tsx`
      },
      {
        find: "@/components/language-selector",
        replacement: `${vendorRoot}/support/language-selector.tsx`
      },
      { find: "@/components/markdown", replacement: `${vendorRoot}/support/markdown.tsx` },
      {
        find: "@/components/message-animated",
        replacement: `${vendorRoot}/support/message-animated.tsx`
      },
      {
        find: "@/lib/message-animations",
        replacement: `${vendorRoot}/support/message-animations.ts`
      },
      {
        find: "@/registry/icons/__lucide__",
        replacement: `${vendorRoot}/support/__lucide__.ts`
      },
      {
        find: "@/hooks/use-media-query",
        replacement: `${vendorRoot}/support/use-media-query.tsx`
      },
      {
        find: "@/hooks/use-copy-to-clipboard",
        replacement: `${vendorRoot}/support/use-copy-to-clipboard.ts`
      },
      { find: "next/link", replacement: `${srcRoot}/shadcn-lab/shims/next-link.tsx` },
      { find: "next/image", replacement: `${srcRoot}/shadcn-lab/shims/next-image.tsx` },
      { find: "next/form", replacement: `${srcRoot}/shadcn-lab/shims/next-form.tsx` },
      {
        find: "next/font/google",
        replacement: `${srcRoot}/shadcn-lab/shims/next-font-google.ts`
      },
      { find: "@", replacement: srcRoot }
    ]
  },
  server: {
    port: 5180,
    strictPort: false,
    proxy: {
      "/api": {
        target: backendOrigin,
        changeOrigin: true,
        cookieDomainRewrite: "",
        ws: true
      }
    }
  },
  test: {
    hookTimeout: 15_000,
    testTimeout: 15_000,
    maxWorkers: 4
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@xyflow/react")) {
            return "flow";
          }
          if (id.includes("cmdk")) {
            return "overlays";
          }
          return undefined;
        }
      }
    }
  }
});
