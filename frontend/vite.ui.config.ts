import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

import { createFrontendViteConfig } from "./vite.config";

const entry = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig(({ mode }) => createFrontendViteConfig(mode, {
  outDir: "dist-ui",
  input: {
    ai: entry("devpreview-ai"),
    connect: entry("devpreview-connect"),
    index: entry("devpreview-index"),
    opsia: entry("devpreview-opsia"),
    topology: entry("devpreview-topology"),
    unified: entry("devpreview-unified"),
  },
}));
