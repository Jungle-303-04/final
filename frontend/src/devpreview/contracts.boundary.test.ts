import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const devpreviewRoot = dirname(fileURLToPath(import.meta.url));

describe("active cluster contract dependency boundary", () => {
  it("uses only the canonical cluster endpoint without the old composition graph", async () => {
    const [contractSource, compositionSource] = await Promise.all([
      readFile(resolve(devpreviewRoot, "contracts.tsx"), "utf8"),
      readFile(resolve(devpreviewRoot, "../app/apiComposition.ts"), "utf8"),
    ]);

    expect(contractSource).toContain('from "../api/clusters"');
    expect(contractSource).toContain("listClusters({}, controller.signal)");
    expect(contractSource).not.toContain("app/apiComposition");
    expect(contractSource).not.toMatch(/from\s+["']\.\.\/api["']/u);
    expect(compositionSource).not.toContain("listDevpreviewClusters");
  });
});
