import ts from "typescript";

interface ZodSchemaAuditOptions {
  apiRoot: string;
  filePath: string;
  isWithin(candidate: string, directory: string): boolean;
  resolveModuleReference(filePath: string, specifier: string): string | null;
  sourcesByPath: Map<string, string>;
  visited: Set<string>;
}

export function moduleProvidesZodSchema({
  apiRoot,
  filePath,
  isWithin,
  resolveModuleReference,
  sourcesByPath,
  visited,
}: ZodSchemaAuditOptions): boolean {
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
    if (!importedPath) return;
    hasTransitiveZodSchema = moduleProvidesZodSchema({
      apiRoot,
      filePath: importedPath,
      isWithin,
      resolveModuleReference,
      sourcesByPath,
      visited,
    });
  });
  return hasTransitiveZodSchema;
}
