import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: false
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
