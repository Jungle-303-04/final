import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(appRoot, "..");
const apiRoot = resolve(productRoot, "api");
const compositionRoot = resolve(appRoot, "apiComposition.ts");
const progressPath = resolve(
  productRoot,
  "../../../..",
  "docs/spec/frontend/codex-progress-20260711.md",
);

describe("product API consumption boundary", () => {
  it("allows product/api imports only from the composition root", async () => {
    const violations: string[] = [];

    for (const filePath of await collectScripts(productRoot)) {
      if (isWithin(filePath, apiRoot) || filePath === compositionRoot || filePath.endsWith(".test.ts")) {
        continue;
      }

      const source = await readFile(filePath, "utf8");
      const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

      sourceFile.forEachChild((node) => {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) return;
        const specifier = node.moduleSpecifier.text;
        if (!specifier.startsWith(".")) return;
        if (!isWithin(resolve(dirname(filePath), specifier), apiRoot)) return;
        violations.push(`${relative(productRoot, filePath)} -> ${specifier}`);
      });
    }

    expect(violations, "endpoint imports must be isolated behind app/apiComposition.ts").toEqual([]);
  });

  it("allows the composition root to import only functions recorded as API complete", async () => {
    const [progress, compositionSource] = await Promise.all([
      readFile(progressPath, "utf8"),
      readFile(compositionRoot, "utf8").catch(() => ""),
    ]);
    const approved = new Set(
      [...progress.matchAll(/^API 완성: ([A-Za-z_$][\w$]*) \([0-9a-f]{7,40}\)$/gmu)]
        .map((match) => match[1]),
    );
    const importedValues = valueImportsFromApi(compositionRoot, compositionSource);

    expect(
      importedValues.filter((name) => !approved.has(name)),
      "apiComposition.ts imported an endpoint without an anchored API 완성 record",
    ).toEqual([]);
  });
});

function valueImportsFromApi(filePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) return;
    if (!node.moduleSpecifier.text.startsWith(".")) return;
    if (!isWithin(resolve(dirname(filePath), node.moduleSpecifier.text), apiRoot)) return;
    if (!node.importClause || node.importClause.isTypeOnly) return;
    if (node.importClause.name) imports.push("default");
    const bindings = node.importClause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) {
      imports.push("*");
      return;
    }
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) imports.push(element.propertyName?.text ?? element.name.text);
    }
  });

  return imports.sort();
}

async function collectScripts(directory: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectScripts(entryPath));
    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) files.push(entryPath);
  }

  return files.sort();
}

function isWithin(candidate: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return pathFromDirectory === "" || (
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`)
  );
}
