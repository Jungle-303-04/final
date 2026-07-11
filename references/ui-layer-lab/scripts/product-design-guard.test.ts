import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const guardPath = resolve(import.meta.dirname, "product-design-guard.mjs");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

describe("product design guard network boundary", () => {
  it("rejects direct and obscured browser transports outside product/api", async () => {
    const result = await runGuard({
      "escape.mts": "void globalThis.fetch('/escape');",
      "surface.ts": [
        "const transportName = 'fetch';",
        "const browserGlobal = window;",
        "void globalThis['Web' + 'Socket'];",
        "const { fetch: hiddenFetch } = globalThis;",
        "void hiddenFetch;",
        "new EventSource('/events');",
        "navigator.sendBeacon('/beacon');",
        "new XMLHttpRequest();",
        "void browserGlobal[transportName];",
        "void Reflect['get'](browserGlobal, transportName);",
      ].join("\n"),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("escape.mts");
    expect(result.output).toContain("Direct WebSocket access");
    expect(result.output).toContain("Direct fetch access");
    expect(result.output).toContain("Direct EventSource access");
    expect(result.output).toContain("Direct sendBeacon access");
    expect(result.output).toContain("Direct XMLHttpRequest access");
    expect(result.output).toContain("Dynamic access to a network-capable global");
    expect(result.output).toContain("Reflective access to a network transport");
  });

  it("allows transport implementations only inside product/api", async () => {
    const result = await runGuard({
      "api/transport.ts": [
        "export const openSocket = () => new WebSocket('/live');",
        "export const openEvents = () => new EventSource('/events');",
      ].join("\n"),
      "api/worker.cts": "void globalThis.fetch('/allowed');",
      "surface.ts": [
        "interface WebSocketState { ready: boolean }",
        "type FetchResult = { ok: boolean };",
        "class WebSocket { close() { return undefined; } }",
        "const client = { fetch() { return 'local'; }, sendBeacon() { return false; } };",
        "const { fetch } = client;",
        "void client.fetch();",
        "void fetch();",
        "void new WebSocket();",
      ].join("\n"),
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.output).toContain("Product design guard passed");
  });
});

async function runGuard(files: Record<string, string>) {
  const directory = await mkdtemp(resolve(tmpdir(), "product-design-guard-"));
  const productRoot = resolve(directory, "product");
  temporaryRoots.push(directory);

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = resolve(productRoot, relativePath);
    await mkdir(resolve(filePath, ".."), { recursive: true });
    await writeFile(filePath, source, "utf8");
  }

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [guardPath], {
      env: { ...process.env, PRODUCT_DESIGN_GUARD_ROOT: productRoot },
    });
    return { exitCode: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: failure.code ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}
