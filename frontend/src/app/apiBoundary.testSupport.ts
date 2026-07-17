import { relative, sep } from "node:path";
import ts from "typescript";

export function identifierNames(source: string): Set<string> {
  const sourceFile = ts.createSourceFile("contract.test.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

export function namedExportNames(source: string): Set<string> {
  const sourceFile = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();

  sourceFile.forEachChild((node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) names.add(element.name.text);
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      }
    }
  });

  return names;
}

export function isWithin(candidate: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, candidate);
  return pathFromDirectory === "" || (
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`)
  );
}
