import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localOperationsBridge } from "./vite.local-bridge";

export default defineConfig({
  plugins: [react(), localOperationsBridge()],
  server: {
    port: 5173,
    proxy: {
      "/gateway": {
        target: process.env.VITE_GATEWAY_TARGET ?? "http://localhost:18081",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/gateway/, ""),
      },
    },
  },
});
