import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { identifierNames, isWithin, namedExportNames } from "./apiBoundary.testSupport";
import { collectApiSources, collectScripts, type ApiSource } from "./apiBoundaryFileSupport";
import { moduleProvidesZodSchema } from "./apiBoundarySchemaSupport";

const appRoot = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(appRoot, "..");
const sourceRoot = productRoot;
const frontendRoot = resolve(sourceRoot, "..");
const apiRoot = resolve(productRoot, "api");
const compositionRoot = resolve(appRoot, "apiComposition.ts");
const authBootstrapRoot = resolve(appRoot, "authBootstrap.ts");
const compositionDirectory = resolve(appRoot, "composition");
const scriptExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

interface ApiReference {
  kind: "dynamic" | "export" | "import";
  specifier: string;
}

interface EndpointContractIndex {
  contractIdentifiers: Set<string>;
  implementationSchemaModules: Map<string, string[]>;
  implementationsByName: Map<string, ApiSource[]>;
  publicExports: Set<string>;
  sourcesByPath: Map<string, string>;
}

const API_BOUNDARY_TIMEOUT_MS = 30_000;

describe("product API consumption boundary", () => {
  it("allows product/api references only from authenticated composition boundaries", async () => {
    const violations: string[] = [];

    for (const filePath of await collectScripts(productRoot, scriptExtensions)) {
      if (isWithin(filePath, apiRoot) || isCompositionBoundary(filePath)) continue;
      const source = await readFile(filePath, "utf8");
      violations.push(...internalImportEscapes(filePath, source).map((specifier) => (
        `${relative(productRoot, filePath)} -> outside-product:${specifier}`
      )));
      for (const reference of apiModuleReferences(filePath, source)) {
        violations.push(`${relative(productRoot, filePath)} -> ${reference.kind}:${reference.specifier}`);
      }
    }

    expect(violations, "API references must be isolated behind authenticated composition boundaries").toEqual([]);
  }, API_BOUNDARY_TIMEOUT_MS);

  it("requires current contract tests, public exports, and Zod schemas for composed endpoints", async () => {
    const [compositionSources, apiSources] = await Promise.all([
      collectCompositionSources(),
      collectApiSources(await collectScripts(apiRoot, scriptExtensions)),
    ]);
    const audits = compositionSources.map(({ filePath, source }) => ({
      filePath,
      audit: compositionImports(filePath, source),
    }));
    const issues = audits.flatMap(({ filePath, audit }) => [
      ...audit.issues.map((issue) => `${relative(appRoot, filePath)}:${issue}`),
      ...internalImportEscapes(filePath, compositionSources.find((source) => source.filePath === filePath)?.source ?? "")
        .map((specifier) => `${relative(appRoot, filePath)}:outside-product:${specifier}`),
    ]);
    const endpointOwners = new Map<string, string>();
    const names: string[] = [];
    for (const { filePath, audit } of audits) {
      for (const name of audit.names) {
        const owner = endpointOwners.get(name);
        if (owner) issues.push(`duplicate-owner:${name}:${relative(appRoot, owner)}:${relative(appRoot, filePath)}`);
        else endpointOwners.set(name, filePath);
        names.push(name);
      }
    }

    expect(issues, "composition boundaries must use named API barrel imports with one owner per endpoint").toEqual([]);
    const contractIndex = buildEndpointContractIndex(apiSources);
    expect(
      [...new Set(names)].sort().flatMap((name) => endpointContractIssues(name, contractIndex)),
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
    const fixtureIndex = buildEndpointContractIndex([{
      filePath: endpointPath,
      source: "export function fixtureEndpoint() { return null; }",
    }]);
    expect(endpointContractIssues("fixtureEndpoint", fixtureIndex)).toEqual([
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

function isCompositionBoundary(filePath: string): boolean {
  return filePath === compositionRoot || filePath === authBootstrapRoot || isWithin(filePath, compositionDirectory);
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

function buildEndpointContractIndex(sources: ApiSource[]): EndpointContractIndex {
  const contractIdentifiers = new Set<string>();
  const implementationsByName = new Map<string, ApiSource[]>();
  const publicExports = new Set<string>();
  const sourcesByPath = new Map(sources.map((item) => [item.filePath, item.source]));

  for (const source of sources) {
    if (/\.test\.[cm]?[jt]sx?$/u.test(source.filePath)) {
      for (const name of identifierNames(source.source)) contractIdentifiers.add(name);
      continue;
    }
    const exports = namedExportNames(source.source);
    if (isPublicBarrel(source.filePath)) {
      for (const name of exports) publicExports.add(name);
      continue;
    }
    for (const name of exports) {
      const implementations = implementationsByName.get(name) ?? [];
      implementations.push(source);
      implementationsByName.set(name, implementations);
    }
  }

  return {
    contractIdentifiers,
    implementationSchemaModules: new Map(),
    implementationsByName,
    publicExports,
    sourcesByPath,
  };
}

function endpointContractIssues(name: string, index: EndpointContractIndex): string[] {
  const issues: string[] = [];
  const implementations = index.implementationsByName.get(name) ?? [];

  if (!index.contractIdentifiers.has(name)) {
    issues.push("contract test missing endpoint identifier");
  }
  if (!index.publicExports.has(name)) {
    issues.push("named export missing from public barrel");
  }
  if (implementations.length !== 1) {
    issues.push(`expected one implementation module, found ${implementations.length}`);
  } else {
    const implementation = implementations[0];
    let schemaModules = index.implementationSchemaModules.get(implementation.filePath);
    if (!schemaModules) {
      schemaModules = importedZodSchemaModules(implementation, index.sourcesByPath);
      index.implementationSchemaModules.set(implementation.filePath, schemaModules);
    }
    if (schemaModules.length === 0) issues.push("implementation does not import a Zod schema");
  }
  return issues.map((issue) => `${name}: ${issue}`);
}

function isPublicBarrel(filePath: string): boolean {
  const apiPath = relative(apiRoot, filePath);
  return apiPath === "index.ts" || apiPath.startsWith(`barrels${sep}`);
}

function importedZodSchemaModules(
  implementation: ApiSource,
  sourcesByPath: Map<string, string>,
): string[] {
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
    if (moduleProvidesZodSchema({
      apiRoot,
      filePath: schemaPath,
      isWithin,
      resolveModuleReference,
      sourcesByPath,
      visited: new Set(),
    })) {
      schemaModules.push(relative(apiRoot, schemaPath));
    }
  });
  return [...new Set(schemaModules)].sort();
}
function resolveModuleReference(filePath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(filePath), specifier);
  if (specifier.startsWith("@/")) return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith("/src/")) return resolve(frontendRoot, specifier.slice(1));
  if (specifier.startsWith("src/")) return resolve(frontendRoot, specifier);
  if (specifier.startsWith("/")) return resolve(specifier);
  return null;
}
async function collectCompositionSources(): Promise<ApiSource[]> {
  const filePaths = [
    compositionRoot,
    authBootstrapRoot,
    ...await collectScripts(compositionDirectory, scriptExtensions),
  ].sort();
  return collectApiSources(filePaths);
}
