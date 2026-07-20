import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("product document bootstrap", () => {
  it("owns product metadata, locale, theme, and favicon before React mounts", async () => {
    const documentSource = await readFile(resolve(frontendRoot, "index.html"), "utf8");

    expect(documentSource).toContain('<html lang="ko">');
    expect(documentSource).toContain('let locale = "ko"');
    expect(documentSource).toContain('let sidebarState = "expanded"');
    expect(documentSource).toContain('<title>Kyro</title>');
    expect(documentSource).toContain('<meta name="application-name" content="Kyro" />');
    expect(documentSource).toContain('<meta name="apple-mobile-web-app-title" content="Kyro" />');
    expect(documentSource).toContain(
      'content="Provider-neutral Kubernetes operations and GitOps control plane."',
    );
    expect(documentSource).toContain('href="/favicon.svg"');
    expect(documentSource).toContain('getItem("opsia-theme")');
    expect(documentSource).toContain('getItem("opsia.locale")');
    expect(documentSource).toContain('getItem("kyro.sidebar.state")');
    expect(documentSource).toContain("document.documentElement.lang = locale");
    expect(documentSource).toContain(
      "document.documentElement.dataset.productSidebarState = sidebarState",
    );
    expect(documentSource).toContain('(max-width: 1100px)');
    expect(documentSource).toContain("document.documentElement.style.colorScheme");
    expect(documentSource).toContain(
      'const selectedTheme = storedTheme === "dark" || storedTheme === "light"',
    );
    expect(documentSource).toContain('storedTheme === "system"');
    expect(documentSource).toContain("prefers-color-scheme: dark");
    expect(documentSource).toContain('selectedTheme === "system" && systemDark');
  });
});
