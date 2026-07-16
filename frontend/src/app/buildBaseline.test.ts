import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface PackageManifest {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile(resolve(frontendRoot, "package.json"), "utf8"));
}

describe("product build and document boundary", () => {
  it("keeps the shared UI dependency baseline in the standalone product package", async () => {
    const manifest = await readManifest();

    expect(manifest.dependencies).toMatchObject({
      "@xyflow/react": "^12.11.2",
      "lucide-react": "^1.24.0",
      "react-router-dom": "^7.18.1",
      "react-virtuoso": "^4.18.10",
    });
    expect(manifest.devDependencies).toMatchObject({
      eslint: "10.6.0",
      vitest: "^4.1.10",
    });
  });

  it("uses one product-owned TypeScript build and test entrypoint instead of a library compiler shim", async () => {
    const manifest = await readManifest();

    expect(manifest.scripts.typecheck).toBe("tsc -b");
    expect(manifest.scripts.test).toBe("vitest run");
    expect(manifest).not.toHaveProperty("main");
    expect(manifest).not.toHaveProperty("exports");
  });

  it("mounts the standalone application at the one document root without a host-library selector", async () => {
    const documentSource = await readFile(resolve(frontendRoot, "index.html"), "utf8");

    expect([...documentSource.matchAll(/<div id="([^"]+)"><\/div>/g)].map((match) => match[1]))
      .toEqual(["root"]);
    expect(documentSource).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(documentSource).toContain("html,\n      body,\n      #root");
  });
});
