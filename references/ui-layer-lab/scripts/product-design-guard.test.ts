import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

describe("product design guard i18n JSX boundary", () => {
  it("exports a pure scanner for migration tooling", async () => {
    const scannerModule = await import(pathToFileURL(guardPath).href) as {
      scanJsxUserFacingLiterals: (
        filePath: string,
        source: string,
      ) => Array<{ position: number; text: string }>;
    };

    expect(scannerModule.scanJsxUserFacingLiterals(
      "/tmp/product/Surface.tsx",
      "export const Surface = () => <p>카탈로그로 이동할 문장</p>;",
    )).toEqual([
      expect.objectContaining({ text: "카탈로그로 이동할 문장" }),
    ]);
  });

  it("rejects literal Korean and catalog-free English copy in user-facing JSX", async () => {
    const result = await runGuard({
      "Surface.tsx": [
        "const Copy = (props: { description: string }) => <p>{props.description}</p>;",
        "export function Surface() {",
        "  return <main>",
        "    <h2>인시던트 목록</h2>",
        "    <button aria-label=\"새로 고침\">Refresh incidents</button>",
        "    <Copy description=\"Always visible helper copy\" />",
        "  </main>;",
        "}",
      ].join("\n"),
    }, { enforceI18nLiterals: true });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[i18n-ui-literal]");
    expect(result.output).toContain("Surface.tsx");
    expect(result.output).toContain("인시던트 목록");
    expect(result.output).toContain("새로 고침");
    expect(result.output).toContain("Refresh incidents");
    expect(result.output).toContain("Always visible helper copy");
  });

  it("rejects static copy fragments while ignoring the dynamic binding", async () => {
    const result = await runGuard({
      "MixedCopy.tsx": [
        "export function MixedCopy({ subject }: { subject: string }) {",
        "  return <section>",
        "    <p>{`상태 접두어 ${subject}`}</p>",
        "    <button aria-label={`Open selected incident ${subject}`} />",
        "  </section>;",
        "}",
      ].join("\n"),
    }, { enforceI18nLiterals: true });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("상태 접두어");
    expect(result.output).toContain("Open selected incident");
    expect(result.output).not.toContain("subject}");
  });

  it("rejects copy hidden in expression branches, explicit children, and native form values", async () => {
    const result = await runGuard({
      "BranchedCopy.tsx": [
        "interface Props { copy: string | null; enabled: boolean; status: string }",
        "const Card = ({ children }: { children: unknown }) => <section>{children}</section>;",
        "export function BranchedCopy({ copy, enabled, status }: Props) {",
        "  return <main>",
        "    <p>{enabled && \"Conditional English sentence\"}</p>",
        "    <p>{copy ?? \"Fallback English sentence\"}</p>",
        "    <p>{(status, \"Comma English sentence\")}</p>",
        "    <p>{enabled ? \"Ternary English sentence\" : status}</p>",
        "    <Card children=\"Explicit children sentence\" />",
        "    <input readOnly value=\"Visible input sentence\" />",
        "    <input type={enabled ? \"hidden\" : \"text\"} value=\"Conditionally visible input sentence\" />",
        "    <textarea readOnly value={\"Visible textarea sentence\"} />",
        "  </main>;",
        "}",
      ].join("\n"),
    }, { enforceI18nLiterals: true });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Conditional English sentence");
    expect(result.output).toContain("Fallback English sentence");
    expect(result.output).toContain("Comma English sentence");
    expect(result.output).toContain("Ternary English sentence");
    expect(result.output).toContain("Explicit children sentence");
    expect(result.output).toContain("Visible input sentence");
    expect(result.output).toContain("Conditionally visible input sentence");
    expect(result.output).toContain("Visible textarea sentence");
  });

  it("allows catalog bindings, dynamic data, domain terms, and structural props", async () => {
    const result = await runGuard({
      "Surface.tsx": [
        "interface Props { title: string; status: string }",
        "export function Surface({ title, status }: Props) {",
        "  const route = '/product/issues';",
        "  return <main className=\"grid gap-2\" id=\"issues-main\" data-slot=\"surface\">",
        "    <h2>{title}</h2>",
        "    <span>{status}</span>",
        "    <span>Pod</span><span>Node</span><span>Ready</span><span>Running</span>",
        "    <span>KubeHeal</span><span>m</span><span>MiB</span>",
        "    <a aria-labelledby=\"issues-title\" href={route} labelMode=\"sr-only\">Service</a>",
        "    <section titleId=\"issues-panel-title\" statusMode=\"literal\" />",
        "    <SelectItem value=\"structural-resource-key\">{status}</SelectItem>",
        "    <input type=\"hidden\" value=\"hidden-structural-token\" />",
        "    <input readOnly value={status} />",
        "  </main>;",
        "}",
      ].join("\n"),
    }, { enforceI18nLiterals: true });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.output).toContain("Product design guard passed");
  });

  it("excludes test files and shared i18n catalog modules", async () => {
    const result = await runGuard({
      "Feature.test.ts": "export const label = '테스트 전용 문자열';",
      "Feature.test.tsx": "export const Example = () => <p>테스트 전용 문장</p>;",
      "shared/i18n/catalog.ts": "export const korean = '카탈로그 문자열';",
      "shared/i18n/catalog.tsx": "export const Korean = <span>카탈로그 문장</span>;",
    }, { enforceI18nLiterals: true });

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it("rejects Korean string literals outside tests and shared i18n", async () => {
    const result = await runGuard({
      "presets.ts": [
        "export const preset = {",
        "  label: '노드 CPU 사용률',",
        "  description: `노드별 5분 평균 CPU 사용 비율`,",
        "};",
      ].join("\n"),
    }, { enforceI18nLiterals: true });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[i18n-korean-literal]");
    expect(result.output).toContain("노드 CPU 사용률");
    expect(result.output).toContain("노드별 5분 평균 CPU 사용 비율");
  });

  it("allows an explicit opt-out only for migration tooling", async () => {
    const result = await runGuard({
      "LegacySurface.tsx": "export const Legacy = () => <p>아직 이관되지 않은 문장</p>;",
    }, { disableI18nLiterals: true });

    expect(result).toMatchObject({ exitCode: 0 });
  });
});

describe("product design guard file length boundary", () => {
  it("allows a declarative pure re-export barrel beyond 300 lines", async () => {
    const barrel = Array.from(
      { length: 301 },
      (_, index) => `export { value${index} } from './module-${index}';`,
    ).join("\n");

    const result = await runGuard({ "index.ts": barrel });

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it("still rejects executable TypeScript beyond 300 lines", async () => {
    const executable = Array.from(
      { length: 301 },
      (_, index) => `export const value${index} = ${index};`,
    ).join("\n");

    const result = await runGuard({ "surface.ts": executable });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[max-file-lines]");
  });
});

async function runGuard(
  files: Record<string, string>,
  options: { disableI18nLiterals?: boolean; enforceI18nLiterals?: boolean } = {},
) {
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
      env: {
        ...process.env,
        PRODUCT_DESIGN_GUARD_ROOT: productRoot,
        PRODUCT_I18N_LITERAL_ENFORCEMENT: options.disableI18nLiterals ? "0" : "1",
      },
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
