import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));
const productRoot = resolve(appRoot, "..");
const sourceRoot = resolve(productRoot, "..");
const labRoot = resolve(sourceRoot, "..");
const repositoryRoot = resolve(labRoot, "../..");
const apiRoot = resolve(productRoot, "api");
const apiIndexFromRepository = "references/ui-layer-lab/src/product/api/index.ts";
const compositionRoot = resolve(appRoot, "apiComposition.ts");
const progressPath = resolve(repositoryRoot, "docs/spec/frontend/codex-progress-20260711.md");
const scriptExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

interface ApiReference {
  kind: "dynamic" | "export" | "import";
  specifier: string;
}

interface ApprovalRecord {
  name: string;
  hash: string;
}

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
  }, 15_000);

  it("allows only approved named endpoint imports in the composition root", async () => {
    const [progress, compositionSource] = await Promise.all([
      readFile(progressPath, "utf8"),
      readFile(compositionRoot, "utf8").catch(() => ""),
    ]);
    const approvals = latestApprovalRecords(progress);
    const audit = compositionImports(compositionRoot, compositionSource);
    audit.issues.push(...internalImportEscapes(compositionRoot, compositionSource).map((specifier) => (
      `outside-product:${specifier}`
    )));

    expect(audit.issues, "apiComposition.ts must use named value imports from the API barrel").toEqual([]);
    expect(
      audit.names.filter((name) => !approvals.has(name)),
      "apiComposition.ts imported an endpoint without an anchored API 완성 record",
    ).toEqual([]);
    expect(
      audit.names.flatMap((name) => approvalEvidenceIssues(approvals.get(name))),
      "API 완성 records must identify an ancestor commit with API contract tests and the export",
    ).toEqual([]);
  }, 15_000);

  it("detects alias, re-export, and non-literal dynamic import bypasses", () => {
    const fixturePath = resolve(productRoot, "features/bypass.ts");
    const references = apiModuleReferences(fixturePath, [
      'import { getSession } from "@/product/api";',
      'export { login } from "../api/auth";',
      "void import(hiddenSpecifier);",
    ].join("\n"));

    expect(references).toEqual([
      { kind: "import", specifier: "@/product/api" },
      { kind: "export", specifier: "../api/auth" },
      { kind: "dynamic", specifier: "<nonliteral>" },
    ]);
    expect(internalImportEscapes(fixturePath, 'import "@/bridge/api";')).toEqual([
      "@/bridge/api",
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

function latestApprovalRecords(progress: string): Map<string, ApprovalRecord> {
  const records = new Map<string, ApprovalRecord>();
  for (const match of progress.matchAll(/^API 완성: ([A-Za-z_$][\w$]*) \(([0-9a-f]{7,40})\)$/gmu)) {
    records.set(match[1], { name: match[1], hash: match[2] });
  }
  return records;
}

function approvalEvidenceIssues(record: ApprovalRecord | undefined): string[] {
  if (!record) return ["missing approval record"];
  const issues: string[] = [];
  try {
    git(["cat-file", "-e", `${record.hash}^{commit}`]);
    git(["merge-base", "--is-ancestor", record.hash, "HEAD"]);
    const changedFiles = git(["diff-tree", "--no-commit-id", "--name-only", "-r", record.hash])
      .split("\n").filter(Boolean);
    const apiPrefix = "references/ui-layer-lab/src/product/api/";
    const contractTests = changedFiles.filter((file) => (
      file.startsWith(apiPrefix) && /\.test\.[cm]?[jt]sx?$/u.test(file)
    ));
    if (!changedFiles.some((file) => file.startsWith(apiPrefix))) issues.push("no API change");
    if (contractTests.length === 0) {
      issues.push("no API contract test changed");
    } else if (!contractTests.some((file) => containsIdentifier(
      git(["show", `${record.hash}:${file}`]),
      record.name,
    ))) {
      issues.push("completion function absent from changed contract tests");
    }
    const indexAtCommit = git(["show", `${record.hash}:${apiIndexFromRepository}`]);
    if (!hasNamedExport(indexAtCommit, record.name)) {
      issues.push("named export absent at completion commit");
    }
  } catch {
    issues.push("invalid or non-ancestor completion commit");
  }
  return issues.map((issue) => `${record.name}@${record.hash}: ${issue}`);
}

function resolveModuleReference(filePath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(filePath), specifier);
  if (specifier.startsWith("@/")) return resolve(sourceRoot, specifier.slice(2));
  if (specifier.startsWith("/src/")) return resolve(labRoot, specifier.slice(1));
  if (specifier.startsWith("src/")) return resolve(labRoot, specifier);
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

function git(args: string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8" }).trim();
}

function containsIdentifier(source: string, identifier: string): boolean {
  const sourceFile = ts.createSourceFile("contract.test.ts", source, ts.ScriptTarget.Latest, true);
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && node.text === identifier) found = true;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasNamedExport(source: string, exportedName: string): boolean {
  const sourceFile = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  let found = false;

  sourceFile.forEachChild((node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      if (node.exportClause.elements.some((element) => element.name.text === exportedName)) found = true;
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === exportedName) found = true;
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => (
        ts.isIdentifier(declaration.name) && declaration.name.text === exportedName
      ))) found = true;
    }
  });

  return found;
}

function isWithin(candidate: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return pathFromDirectory === "" || (
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`)
  );
}
