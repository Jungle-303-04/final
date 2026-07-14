import { relative, sep } from "node:path";
import ts from "typescript";

export function containsIdentifier(source: string, identifier: string): boolean {
  const sourceFile = ts.createSourceFile("contract.test.ts", source, ts.ScriptTarget.Latest, true);
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && node.text === identifier) found = true;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export function hasNamedExport(source: string, exportedName: string): boolean {
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

export function isWithin(candidate: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return pathFromDirectory === "" || (
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`)
  );
}
