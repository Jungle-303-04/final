import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokenSource = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tokenSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`missing CSS token block: ${selector}`);
  return match[1];
}

function declarations(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)]
      .map((match) => [match[1], match[2].trim()] as const),
  );
}

describe("product theme token contract", () => {
  it("defines every semantic color token in both light and dark modes", () => {
    const semanticColorTokens = new Set(
      [...block("@theme inline").matchAll(/--color-[\w-]+\s*:\s*var\((--[\w-]+)\)/g)]
        .map((match) => match[1]),
    );
    const lightTokens = declarations(block(":root"));
    const darkTokens = declarations(block(".dark"));

    expect(semanticColorTokens.size).toBeGreaterThan(0);
    expect([...semanticColorTokens].filter((token) => !lightTokens.has(token))).toEqual([]);
    expect([...semanticColorTokens].filter((token) => !darkTokens.has(token))).toEqual([]);
  });

  it.each(["--background", "--foreground", "--card", "--primary", "--sidebar"])(
    "gives %s a distinct light and dark value",
    (token) => {
      const lightTokens = declarations(block(":root"));
      const darkTokens = declarations(block(".dark"));

      expect(lightTokens.get(token)).toBeTruthy();
      expect(darkTokens.get(token)).toBeTruthy();
      expect(lightTokens.get(token)).not.toBe(darkTokens.get(token));
    },
  );

  it("maps warning, chart, and code colors through semantic theme aliases", () => {
    const themeTokens = declarations(block("@theme inline"));
    const lightTokens = declarations(block(":root"));
    const darkTokens = declarations(block(".dark"));

    expect(themeTokens.get("--color-warning-foreground")).toBe("var(--warning-foreground)");
    expect(lightTokens.get("--warning-foreground")).toMatch(/^oklch\(/);
    expect(darkTokens.get("--warning-foreground")).toMatch(/^oklch\(/);
    expect(lightTokens.get("--warning-foreground")).not.toBe(darkTokens.get("--warning-foreground"));

    for (const token of ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]) {
      expect(themeTokens.get(`--color-${token.slice(2)}`)).toBe(`var(${token})`);
      expect(lightTokens.get(token)).toMatch(/^oklch\(/);
      expect(darkTokens.get(token)).toMatch(/^oklch\(/);
      expect(lightTokens.get(token)).not.toBe(darkTokens.get(token));
    }

    expect(themeTokens.get("--color-code")).toBe("var(--code-background)");
    expect(themeTokens.get("--color-code-foreground")).toBe("var(--code-foreground)");
    expect(lightTokens.get("--code-background")).toMatch(/^oklch\(/);
    expect(lightTokens.get("--code-foreground")).toMatch(/^oklch\(/);
  });

  it("registers the P1 semantic colors with light and dark values", () => {
    const themeTokens = declarations(block("@theme inline"));
    const lightTokens = declarations(block(":root"));
    const darkTokens = declarations(block(".dark"));

    for (const token of [
      "--border-subtle",
      "--caption-foreground",
      "--status-critical",
    ]) {
      expect(themeTokens.get(`--color-${token.slice(2)}`)).toBe(`var(${token})`);
      expect(lightTokens.get(token)).toBeTruthy();
      expect(darkTokens.get(token)).toBeTruthy();
      expect(lightTokens.get(token)).not.toBe(darkTokens.get(token));
    }
  });

  it("registers the shared type, radius, and elevation scales in both themes", () => {
    const themeTokens = declarations(block("@theme inline"));
    const lightTokens = declarations(block(":root"));
    const darkTokens = declarations(block(".dark"));

    for (const token of [
      "--type-caption",
      "--type-label",
      "--type-body",
      "--type-body-strong",
      "--type-title-3",
      "--type-title-2",
      "--type-title-1",
      "--product-radius-tile",
      "--product-radius-card",
      "--product-radius-panel",
      "--product-radius-sheet",
      "--elevation-hover",
      "--elevation-pop",
      "--elevation-overlay",
    ]) {
      expect(lightTokens.get(token)).toBeTruthy();
      expect(darkTokens.get(token)).toBeTruthy();
    }

    expect(themeTokens.get("--text-caption")).toBe("var(--type-caption)");
    expect(themeTokens.get("--text-title-1")).toBe("var(--type-title-1)");
    expect(themeTokens.get("--radius-card")).toBe("var(--product-radius-card)");
    expect(themeTokens.get("--shadow-product-overlay")).toBe("var(--elevation-overlay)");
  });

  it("derives product frame clearance from the shared floating-action geometry", () => {
    const lightTokens = declarations(block(":root"));

    expect(lightTokens.get("--product-floating-action-size")).toBe("3.5rem");
    expect(lightTokens.get("--product-floating-action-inline-inset")).toBe("1.5rem");
    expect(lightTokens.get("--product-floating-action-block-end"))
      .toContain("env(safe-area-inset-bottom, 0px)");
    expect(lightTokens.get("--product-floating-action-inline-clearance"))
      .toContain("var(--product-floating-action-size)");
    expect(lightTokens.get("--product-floating-action-clearance"))
      .toContain("var(--product-floating-action-size)");
    expect(lightTokens.get("--product-floating-action-clearance"))
      .toContain("var(--product-floating-action-block-end)");
  });
});
