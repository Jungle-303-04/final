import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { containsIdentifier, hasNamedExport, isWithin } from "./apiBoundary.testSupport";

const appRoot = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(appRoot, "..");
const sourceRoot = productRoot;
const frontendRoot = resolve(sourceRoot, "..");
const apiRoot = resolve(productRoot, "api");
const compositionRoot = resolve(appRoot, "apiComposition.ts");
const scriptExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

interface ApiReference {
  kind: "dynamic" | "export" | "import";
  specifier: string;
}

interface ApiSource {
  filePath: string;
  source: string;
}

const API_BOUNDARY_TIMEOUT_MS = 30_000;

describe("product API consumption boundary", () => {
  it("allows product/api references only from the composition root", async () => {
    const violations: string[] = [];

    for (const filePath of await collectScripts(productRoot)) {
      if (isWithin(filePath, apiRoot) || filePath === compositionRoot) continue;
      const source = await readFile(filePath, "utf8");
      violations.push(...internalImportEscapes(filePath, source).map((specifier) => (
        `${relative(productRoot, filePath)} -> outside-product:${specifier}`
      )));
      for (const reference of apiModuleReferences(filePath, source)) {
        violations.push(`${relative(productRoot, filePath)} -> ${reference.kind}:${reference.specifier}`);
      }
    }

    expect(violations, "API references must be isolated behind app/apiComposition.ts").toEqual([]);
  }, API_BOUNDARY_TIMEOUT_MS);

  it("requires current contract tests, public exports, and Zod schemas for composed endpoints", async () => {
    const [compositionSource, apiSources] = await Promise.all([
      readFile(compositionRoot, "utf8").catch(() => ""),
      collectApiSources(),
    ]);
    const audit = compositionImports(compositionRoot, compositionSource);
    audit.issues.push(...internalImportEscapes(compositionRoot, compositionSource).map((specifier) => (
      `outside-product:${specifier}`
    )));

    expect(audit.issues, "apiComposition.ts must use named value imports from the API barrel").toEqual([]);
    expect(
      audit.names.flatMap((name) => endpointContractIssues(name, apiSources)),
      "composed endpoints must have a local contract test, public barrel export, and imported Zod schema",
    ).toEqual([]);
  }, API_BOUNDARY_TIMEOUT_MS);

  it("detects alias, re-export, and non-literal dynamic import bypasses", () => {
    const fixturePath = resolve(productRoot, "features/bypass.ts");
    const references = apiModuleReferences(fixturePath, [
      'import { getSession } from "@/api";',
      'export { login } from "../api/auth";',
      "void import(hiddenSpecifier);",
    ].join("\n"));

    expect(references).toEqual([
      { kind: "import", specifier: "@/api" },
      { kind: "export", specifier: "../api/auth" },
      { kind: "dynamic", specifier: "<nonliteral>" },
    ]);
    expect(internalImportEscapes(fixturePath, 'import "@/../bridge/api";')).toEqual([
      "@/../bridge/api",
    ]);
  });

  it("reports each missing piece of current-tree endpoint evidence", () => {
    const endpointPath = resolve(apiRoot, "fixture-endpoint.ts");
    expect(endpointContractIssues("fixtureEndpoint", [{
      filePath: endpointPath,
      source: "export function fixtureEndpoint() { return null; }",
    }])).toEqual([
      "fixtureEndpoint: contract test missing endpoint identifier",
      "fixtureEndpoint: named export missing from public barrel",
      "fixtureEndpoint: implementation does not import a Zod schema",
    ]);
  });
});

function internalImportEscapes(filePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const escapes: string[] = [];
  function inspect(specifier: string) {
    const resolved = resolveModuleReference(filePath, specifier);
    if (resolved && !isWithin(resolved, productRoot)) escapes.push(specifier);
  }
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) inspect(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const argument = node.arguments[0];
      if ((isDynamicImport || isRequire) && argument && ts.isStringLiteralLike(argument)) {
        inspect(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return escapes.sort();
}

function apiModuleReferences(filePath: string, source: string): ApiReference[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const references: ApiReference[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record("import", node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      record("export", node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        const argument = node.arguments[0];
        if (!argument || !ts.isStringLiteralLike(argument)) {
          references.push({ kind: "dynamic", specifier: "<nonliteral>" });
        } else {
          record("dynamic", argument.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  function record(kind: ApiReference["kind"], specifier: string) {
    const resolved = resolveModuleReference(filePath, specifier);
    if (resolved && isWithin(resolved, apiRoot)) references.push({ kind, specifier });
  }

  visit(sourceFile);
  return references;
}

function compositionImports(filePath: string, source: string): { names: string[]; issues: string[] } {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const issues: string[] = [];

  for (const reference of apiModuleReferences(filePath, source)) {
    if (reference.kind !== "import") issues.push(`${reference.kind}:${reference.specifier}`);
  }

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) return;
    const resolved = resolveModuleReference(filePath, node.moduleSpecifier.text);
    if (!resolved || !isWithin(resolved, apiRoot)) return;
    if (resolved !== apiRoot) issues.push(`non-barrel:${node.moduleSpecifier.text}`);
    const clause = node.importClause;
    if (!clause || clause.isTypeOnly || clause.name) {
      issues.push(`non-named-value:${node.moduleSpecifier.text}`);
      return;
    }
    const bindings = clause.namedBindings;
    if (!bindings || ts.isNamespaceImport(bindings)) {
      issues.push(`non-named-value:${node.moduleSpecifier.text}`);
      return;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) issues.push(`type-only:${element.name.text}`);
      else names.push(element.propertyName?.text ?? element.name.text);
    }
  });

  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  issues.push(...duplicates.map((name) => `duplicate:${name}`));
  return { names: [...new Set(names)].sort(), issues: issues.sort() };
}

function endpointContractIssues(name: string, sources: ApiSource[]): string[] {
  const issues: string[] = [];
  const contractTests = sources.filter(({ filePath }) => /\.test\.[cm]?[jt]sx?$/u.test(filePath));
  const publicBarrels = sources.filter(({ filePath }) => isPublicBarrel(filePath));
  const implementations = sources.filter(({ filePath, source }) => (
    !isPublicBarrel(filePath) &&
    !/\.test\.[cm]?[jt]sx?$/u.test(filePath) &&
    hasNamedExport(source, name)
  ));

  if (!contractTests.some(({ source }) => containsIdentifier(source, name))) {
    issues.push("contract test missing endpoint identifier");
  }
  if (!publicBarrels.some(({ source }) => hasNamedExport(source, name))) {
    issues.push("named export missing from public barrel");
  }
  if (implementations.length !== 1) {
    issues.push(`expected one implementation module, found ${implementations.length}`);
  } else if (importedZodSchemaModules(implementations[0], sources).length === 0) {
    issues.push("implementation does not import a Zod schema");
  }
  return issues.map((issue) => `${name}: ${issue}`);
}

function isPublicBarrel(filePath: string): boolean {
  const apiPath = relative(apiRoot, filePath);
  return apiPath === "index.ts" || apiPath.startsWith(`barrels${sep}`);
}

function importedZodSchemaModules(implementation: ApiSource, sources: ApiSource[]): string[] {
  const sourcesByPath = new Map(sources.map((item) => [item.filePath, item.source]));
  const sourceFile = ts.createSourceFile(
    implementation.filePath,
    implementation.source,
    ts.ScriptTarget.Latest,
    true,
  );
  const schemaModules: string[] = [];

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) return;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    const importsSchema = bindings.elements.some((element) => (
      !element.isTypeOnly && /Schema$/u.test(element.propertyName?.text ?? element.name.text)
    ));
    if (!importsSchema) return;
    const resolved = resolveModuleReference(implementation.filePath, node.moduleSpecifier.text);
    if (!resolved || !isWithin(resolved, apiRoot)) return;
    const schemaPath = [resolved, `${resolved}.ts`, `${resolved}.tsx`]
      .find((candidate) => sourcesByPath.has(candidate));
    if (!schemaPath) return;
    if (moduleProvidesZodSchema(schemaPath, sourcesByPath, new Set())) {
      schemaModules.push(relative(apiRoot, schemaPath));
    }
  });
  return [...new Set(schemaModules)].sort();
}

function moduleProvidesZodSchema(
  filePath: string,
  sourcesByPath: Map<string, string>,
  visited: Set<string>,
): boolean {
  if (visited.has(filePath)) return false;
  visited.add(filePath);
  const source = sourcesByPath.get(filePath) ?? "";
  if (/from\s+["']zod["']/u.test(source) && /\bz\./u.test(source)) return true;

  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  let hasTransitiveZodSchema = false;
  sourceFile.forEachChild((node) => {
    if (hasTransitiveZodSchema) return;
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) return;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return;
    if (!bindings.elements.some((element) => (
      !element.isTypeOnly && /Schema$/u.test(element.propertyName?.text ?? element.name.text)
    ))) return;
    const resolved = resolveModuleReference(filePath, node.moduleSpecifier.text);
    if (!resolved || !isWithin(resolved, apiRoot)) return;
    const importedPath = [resolved, `${resolved}.ts`, `${resolved}.tsx`]
      .find((candidate) => sourcesByPath.has(candidate));
    if (importedPath) {
      hasTransitiveZodSchema = moduleProvidesZodSchema(importedPath, sourcesByPath, visited);
    }
  });
  return hasTransitiveZodSchema;
}

function resolveModuleReference(filePath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(filePath), specifier);
  if (specifier.startsWith("@/")) return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith("/src/")) return resolve(frontendRoot, specifier.slice(1));
  if (specifier.startsWith("src/")) return resolve(frontendRoot, specifier);
  if (specifier.startsWith("/")) return resolve(specifier);
  return null;
}

async function collectScripts(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectScripts(entryPath));
    if (entry.isFile() && scriptExtensions.has(extname(entry.name))) files.push(entryPath);
  }
  return files.sort();
}

async function collectApiSources(): Promise<ApiSource[]> {
  return Promise.all((await collectScripts(apiRoot)).map(async (filePath) => ({
    filePath,
    source: await readFile(filePath, "utf8"),
  })));
}
