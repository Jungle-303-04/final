import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "product-design-guard.mjs");
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("product-design-guard Motion import ownership", () => {
  it("rejects Motion package imports outside the Motion boundary", async () => {
    const result = await runGuard({
      "features/Surface.tsx": "import { m } from 'motion/react-m'; export const Surface = () => null;",
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[motion-import-ownership]");
    expect(result.output).toContain("Motion package imports are allowed only under src/motion.");
  });

  it("allows Motion package imports in the Motion boundary", async () => {
    const result = await runGuard({
      "motion/RefreshGlyph.tsx": "import { LazyMotion } from 'motion/react'; export const RefreshGlyph = () => LazyMotion;",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("motion-import-ownership");
  });
});

describe("product-design-guard Motion literal ownership", () => {
  it("rejects literal Tailwind duration and easing utilities", async () => {
    const result = await runGuard({
      "features/Surface.tsx":
        "export const Surface = () => <div className=\"duration-200 ease-out\" />;",
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[motion-literal]");
    expect(result.output).toContain("duration-200");
    expect(result.output).toContain("ease-out");
  });

  it("rejects literal CSS transition timing", async () => {
    const result = await runGuard({
      "features/surface.css":
        ".surface { transition: opacity 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }",
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[motion-literal]");
    expect(result.output).toContain("180ms");
    expect(result.output).toContain("cubic-bezier");
  });

  it("accepts product Motion token references", async () => {
    const result = await runGuard({
      "features/Surface.tsx":
        "export const Surface = () => <div className=\"duration-(--motion-quick) ease-(--ease-out)\" />;",
      "features/surface.css":
        ".surface { transition: opacity var(--motion-quick) var(--ease-out); }",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("motion-literal");
  });
});

describe("product-design-guard debt ceilings", () => {
  it("rejects the retired public brand while preserving lowercase internal identifiers", async () => {
    const result = await runGuard({
      "features/BrandContract.ts": [
        "export const heading = 'Opsia AI';",
        "export const legacyWordmark = 'OPSIA';",
        "export const storageKey = 'opsia:notifications:v1';",
      ].join("\n"),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[retired-brand]");
    expect(result.output.match(/\[retired-brand\]/g)).toHaveLength(2);
    expect(result.output).not.toContain("opsia:notifications:v1");
  });

  it("accepts Kyro display copy with lowercase internal identifiers", async () => {
    const result = await runGuard({
      "features/BrandContract.ts": [
        "export const heading = 'Kyro AI';",
        "export const storageKey = 'opsia:notifications:v1';",
      ].join("\n"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("retired-brand");
  });

  it("still rejects a new TypeScript file above the line limit", async () => {
    const result = await runGuard({
      "features/Oversized.ts": Array.from(
        { length: 301 },
        (_, index) => `export const value${index} = ${index};`,
      ).join("\n"),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[max-file-lines]");
    expect(result.output).toContain("found 301");
  });

  it("allows official colors only inside the shared brand owner", async () => {
    const result = await runGuard({
      "shared/ui/brand/brand.css": ".brand { color: #181717; }",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("design-token");
  });
});

describe("product-design-guard v3 release rules", () => {
  it("rejects raw colors outside the token and identity owners", async () => {
    const result = await runGuard({
      "pages/Surface.tsx": "export const surfaceColor = 'rgba(0, 0, 0, 0.2)';",
      "shared/ui/brand/second-registry.css": ".brand { color: #ffffff; }",
    }, ["--release-gate"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[release-design-token]");
    expect(result.output).toContain("second-registry.css");
  });

  it("separates the single editable identity registry from immutable upstream mark payloads", async () => {
    const result = await runGuard({
      "shared/brand/azure.svg": "<svg><path fill=\"#0078d4\" /></svg>",
      "shared/brand/gitops/flux.svg": "<svg><path fill=\"#326ce5\" /></svg>",
      "shared/ui/brand/brand.css": ".brand { color: #181717; }",
      "styles/tokens.css": ":root { --surface: oklch(1 0 0); }",
    }, ["--release-gate"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("release-design-token");
  });

  it("rejects numeric Motion duration literals, including zero", async () => {
    const result = await runGuard({
      "motion/Surface.tsx": [
        "export const reduced = { duration: 0 };",
        "export const active = { duration: 0.18 };",
      ].join("\n"),
    }, ["--release-gate"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[motion-duration-token]");
    expect(result.output.match(/\[motion-duration-token\]/g)).toHaveLength(2);
  });

  it("accepts Motion duration token references", async () => {
    const result = await runGuard({
      "motion/Surface.tsx": [
        "const MOTION_DURATION_SECONDS = { quick: 0.18 };",
        "export const transition = { duration: MOTION_DURATION_SECONDS.quick };",
      ].join("\n"),
    }, ["--release-gate"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("motion-duration-token");
  });

  it("requires new visual primitives to live under shared/ui", async () => {
    const result = await runGuard({
      "pages/StatusCard.tsx": "export function StatusCard() { return null; }",
      "shared/ui/StatusChip.tsx": "export function StatusChip() { return null; }",
    }, ["--release-gate"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[shared-visual-ownership]");
    expect(result.output).toContain("StatusCard");
    expect(result.output).not.toContain("New StatusChip");
  });

  it("rejects new page-local inline styles", async () => {
    const result = await runGuard({
      "pages/Surface.tsx": "export function Surface() { return <div style={{ opacity: 1 }} />; }",
    }, ["--release-gate"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[release-no-inline-style]");
  });
});

async function runGuard(files, args = []) {
  const root = await mkdtemp(resolve(tmpdir(), "opsia-design-guard-"));
  temporaryRoots.push(root);

  await Promise.all(Object.entries(files).map(async ([relativePath, source]) => {
    const filePath = resolve(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source);
  }));

  try {
    const { stderr, stdout } = await execFileAsync("node", [scriptPath, ...args], {
      env: {
        ...process.env,
        PRODUCT_DESIGN_GUARD_BASE: "",
        PRODUCT_DESIGN_GUARD_ROOT: root,
      },
    });
    return { exitCode: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}
