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

  it("derives product frame clearance from the shared floating-action geometry", () => {
    const lightTokens = declarations(block(":root"));

    expect(lightTokens.get("--product-floating-action-size")).toBe("3.5rem");
    expect(lightTokens.get("--product-floating-action-inline-inset")).toBe("1.5rem");
    expect(lightTokens.get("--product-floating-action-block-end"))
      .toContain("env(safe-area-inset-bottom, 0px)");
    expect(lightTokens.get("--product-floating-action-clearance"))
      .toContain("var(--product-floating-action-size)");
    expect(lightTokens.get("--product-floating-action-clearance"))
      .toContain("var(--product-floating-action-block-end)");
  });
});
