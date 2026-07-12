import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("product document bootstrap", () => {
  it("owns product metadata, locale, theme, and favicon before React mounts", async () => {
    const documentSource = await readFile(resolve(labRoot, "index.html"), "utf8");

    expect(documentSource).toContain('<html lang="en">');
    expect(documentSource).toContain('<title>KubeHeal</title>');
    expect(documentSource).toContain(
      'content="Provider-neutral Kubernetes operations and GitOps control plane."',
    );
    expect(documentSource).toContain('href="/favicon.svg"');
    expect(documentSource).toContain('getItem("kubeheal-theme")');
    expect(documentSource).toContain('getItem("kubeheal.locale")');
    expect(documentSource).toContain("document.documentElement.lang = locale");
    expect(documentSource).toContain("document.documentElement.style.colorScheme");
  });
});
