import { readdirSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";

const frontendSourceDirectory = new URL("../../..", import.meta.url);
const sourceExtensions = new Set([".ts", ".tsx", ".css"]);

describe("shared spinner usage", () => {
  it("forbids raw spin animation throughout the product source", () => {
    const violations = sourceFiles(frontendSourceDirectory).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /(?<!motion-safe:)animate-spin/.test(source) ? [path] : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps the shared spinner reduced-motion-safe", () => {
    const source = readFileSync(new URL("./spinner.tsx", import.meta.url), "utf8");

    expect(source).toContain("motion-safe:animate-spin");
    expect(source).toContain("motion-reduce:animate-none");
    expect(source).toContain('data-slot="spinner"');
  });
});

function sourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, directory));
    return sourceExtensions.has(extname(entry.name)) && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}
