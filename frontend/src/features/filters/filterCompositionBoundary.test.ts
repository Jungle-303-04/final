import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const PRODUCT_ROOT = join(process.cwd(), "src/");
const ALLOWED_PREFIXES = ["api/", "features/filters/"];
const FORBIDDEN_PATTERNS = [
  /\buseSearchParams\b/,
  /\bnew URLSearchParams\s*\(/,
  /\blocation\.search\b/,
  /clusterScopeUrl/,
];

describe("unified filter composition boundary", () => {
  it("keeps browser query parsing and writes inside the filter engine", () => {
    expect(findBrowserQueryOwners()).toEqual([]);
  });
});

function findBrowserQueryOwners(): string[] {
  return sourceFiles(PRODUCT_ROOT).flatMap((path) => {
    const projectPath = relative(PRODUCT_ROOT, path).split("\\").join("/");
    if (ALLOWED_PREFIXES.some((prefix) => projectPath.startsWith(prefix))) return [];
    const source = readFileSync(path, "utf8");
    const violations = FORBIDDEN_PATTERNS
      .filter((pattern) => pattern.test(source))
      .map((pattern) => `${projectPath}: ${pattern.source}`);
    return violations;
  }).sort();
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
    if (entry.name.includes(".test.") || entry.name.includes("testSupport")) return [];
    return [path];
  });
}
