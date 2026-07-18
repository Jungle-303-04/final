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

async function runGuard(files) {
  const root = await mkdtemp(resolve(tmpdir(), "opsia-design-guard-"));
  temporaryRoots.push(root);

  await Promise.all(Object.entries(files).map(async ([relativePath, source]) => {
    const filePath = resolve(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source);
  }));

  try {
    const { stderr, stdout } = await execFileAsync("node", [scriptPath], {
      env: { ...process.env, PRODUCT_DESIGN_GUARD_ROOT: root },
    });
    return { exitCode: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}
