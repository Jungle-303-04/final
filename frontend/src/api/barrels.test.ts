import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const apiRoot = dirname(fileURLToPath(import.meta.url));
const domainBarrels = ["ai", "alerts", "catalog", "gitops", "metrics", "rca", "workloads"] as const;

describe("product API domain barrels", () => {
  it("keeps the public index as re-exports only", async () => {
    const sourceFile = await parseSource(resolve(apiRoot, "index.ts"));

    expect(nonExportStatements(sourceFile)).toEqual([]);
    expect(starExportSpecifiers(sourceFile)).toEqual(
      domainBarrels.map((domain) => `./barrels/${domain}`),
    );
  });

  it.each(domainBarrels)("keeps the %s barrel as re-exports only", async (domain) => {
    const sourceFile = await parseSource(resolve(apiRoot, "barrels", `${domain}.ts`));

    expect(nonExportStatements(sourceFile)).toEqual([]);
  });
});

async function parseSource(filePath: string): Promise<ts.SourceFile> {
  return ts.createSourceFile(
    filePath,
    await readFile(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function nonExportStatements(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements
    .filter((statement) => !ts.isExportDeclaration(statement))
    .map((statement) => ts.SyntaxKind[statement.kind]);
}

function starExportSpecifiers(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier)
    ) return [];
    return [statement.moduleSpecifier.text];
  });
}
