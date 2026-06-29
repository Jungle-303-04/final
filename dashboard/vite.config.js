import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localOperationsBridge } from "./vite.local-bridge";
export default defineConfig({
    plugins: [react(), localOperationsBridge()],
    server: {
        port: 5173,
        proxy: {
            "/gateway": {
                target: process.env.VITE_GATEWAY_TARGET ?? "http://localhost:18082",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/gateway/, ""),
            },
        },
    },
    preview: {
        port: 4173,
    },
});
