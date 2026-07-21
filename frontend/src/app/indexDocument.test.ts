import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("product document bootstrap", () => {
  it("owns product metadata, locale, theme, and favicon before React mounts", async () => {
    const documentSource = await readFile(resolve(frontendRoot, "index.html"), "utf8");

    expect(documentSource).toContain('<html lang="en">');
    expect(documentSource).toContain('<title>Kyro</title>');
    expect(documentSource).toContain(
      'content="Kyro — provider-neutral Kubernetes operations and GitOps control plane."',
    );
    expect(documentSource).toContain('name="application-name" content="Kyro"');
    expect(documentSource).toContain('name="theme-color"');
    expect(documentSource).toContain('href="/favicon.svg"');
    expect(documentSource).toContain('href="/site.webmanifest"');
    expect(documentSource).toContain('getItem("opsia-theme")');
    expect(documentSource).toContain('getItem("opsia.locale")');
    expect(documentSource).toContain("document.documentElement.lang = locale");
    expect(documentSource).toContain("document.documentElement.style.colorScheme");
    expect(documentSource).toContain(
      'const selectedTheme = storedTheme === "dark" || storedTheme === "light"',
    );
    expect(documentSource).toContain('storedTheme === "system"');
    expect(documentSource).toContain("prefers-color-scheme: dark");
    expect(documentSource).toContain('selectedTheme === "system" && systemDark');
  });

  it("publishes Kyro install metadata without renaming legacy browser storage", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(frontendRoot, "public/site.webmanifest"), "utf8"),
    ) as { name: string; short_name: string; start_url: string; icons: unknown[] };

    expect(manifest).toMatchObject({ name: "Kyro", short_name: "Kyro", start_url: "/" });
    expect(manifest.icons).toHaveLength(1);
  });
});
