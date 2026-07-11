#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, 'src')
const productRoot = resolve(sourceRoot, 'product')
const apiRoot = resolve(productRoot, 'api')
const tokenFile = resolve(productRoot, 'styles', 'tokens.css')

const checkedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.less',
  '.mjs',
  '.sass',
  '.scss',
  '.svg',
  '.ts',
  '.tsx',
])
const scriptExtensions = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
])
const typeScriptExtensions = new Set(['.ts', '.tsx'])

const rawColorPatterns = [
  { label: 'hex', pattern: /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/giu },
  { label: 'rgb/rgba', pattern: /\brgba?\s*\(/giu },
  { label: 'hsl/hsla', pattern: /\bhsla?\s*\(/giu },
  { label: 'oklch', pattern: /\boklch\s*\(/giu },
]

const violations = []

function isWithin(candidate, directory) {
  const pathFromDirectory = relative(directory, candidate)
  return (
    pathFromDirectory === '' ||
    (!pathFromDirectory.startsWith(`..${sep}`) &&
      pathFromDirectory !== '..' &&
      !isAbsolute(pathFromDirectory))
  )
}

function projectPath(filePath) {
  return relative(projectRoot, filePath).split(sep).join('/')
}

function addViolation(filePath, sourceFile, position, rule, message) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position)
  violations.push({
    column: character + 1,
    file: projectPath(filePath),
    line: line + 1,
    message,
    rule,
  })
}

function addTextViolation(filePath, source, position, rule, message) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.Unknown,
  )
  addViolation(filePath, sourceFile, position, rule, message)
}

async function collectProductFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectProductFiles(entryPath)))
    } else if (entry.isFile() && checkedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(entryPath)
    }
  }

  return files
}

function scriptKindFor(extension) {
  switch (extension) {
    case '.js':
    case '.cjs':
    case '.mjs':
      return ts.ScriptKind.JS
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.tsx':
      return ts.ScriptKind.TSX
    default:
      return ts.ScriptKind.TS
  }
}

function stripScriptExtension(filePath) {
  return filePath.replace(/\.(?:[cm]?[jt]sx?)$/iu, '')
}

function isReferenceImport(specifier, importingFile) {
  const normalizedSpecifier = specifier.replaceAll('\\', '/')

  if (normalizedSpecifier.startsWith('.')) {
    const resolvedImport = resolve(dirname(importingFile), normalizedSpecifier)
    const appModule = resolve(sourceRoot, 'App')

    return (
      isWithin(resolvedImport, resolve(sourceRoot, 'examples')) ||
      isWithin(resolvedImport, resolve(sourceRoot, 'styles')) ||
      isWithin(resolvedImport, resolve(sourceRoot, 'components')) ||
      isWithin(resolvedImport, resolve(sourceRoot, 'shadcn-lab')) ||
      isWithin(resolvedImport, resolve(projectRoot, 'vendor', 'shadcn')) ||
      stripScriptExtension(resolvedImport) === resolve(sourceRoot, 'index.css') ||
      stripScriptExtension(resolvedImport) === appModule
    )
  }

  const aliasedSource = normalizedSpecifier
    .replace(/^\/?src\//u, '')
    .replace(/^[@~]\//u, '')

  return (
    /^(?:components|examples|registry|shadcn-lab|styles|vendor)(?:\/|$)/u.test(aliasedSource) ||
    /^index\.css$/u.test(aliasedSource) ||
    /^App(?:\.[cm]?[jt]sx?)?$/u.test(aliasedSource)
  )
}

function checkImportSpecifier(filePath, sourceFile, node, specifier) {
  if (!isReferenceImport(specifier, filePath)) {
    return
  }

  addViolation(
    filePath,
    sourceFile,
    node.getStart(sourceFile),
    'reference-import',
    `Product code cannot import the reference surface: ${specifier}`,
  )
}

function stringArgument(node) {
  const [argument] = node.arguments
  return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ? argument.text
    : null
}

function isFetchCall(node) {
  if (!ts.isCallExpression(node)) {
    return false
  }

  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === 'fetch'
  }

  return (
    (ts.isPropertyAccessExpression(node.expression) ||
      ts.isPropertyAccessChain(node.expression)) &&
    node.expression.name.text === 'fetch'
  )
}

function inspectScript(filePath, source, extension) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(extension),
  )

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkImportSpecifier(filePath, sourceFile, node.moduleSpecifier, node.moduleSpecifier.text)
    }

    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression
      if (expression && ts.isStringLiteralLike(expression)) {
        checkImportSpecifier(filePath, sourceFile, expression, expression.text)
      }
    }

    if (ts.isCallExpression(node)) {
      const specifier = stringArgument(node)
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'

      if (specifier && (isDynamicImport || isRequire)) {
        checkImportSpecifier(filePath, sourceFile, node, specifier)
      }
    }

    if (isFetchCall(node) && !isWithin(filePath, apiRoot)) {
      addViolation(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        'api-boundary',
        'Direct fetch calls are allowed only under src/product/api.',
      )
    }

    if (ts.isJsxAttribute(node) && node.name.text === 'style') {
      addViolation(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        'no-inline-style',
        'Inline style props are forbidden; use a product stylesheet and design tokens.',
      )
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function inspectCssImports(filePath, source) {
  const importPattern = /@import\s+(?:url\(\s*)?["']([^"']+)["']/giu

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    if (isReferenceImport(specifier, filePath)) {
      addTextViolation(
        filePath,
        source,
        match.index,
        'reference-import',
        `Product CSS cannot import the reference surface: ${specifier}`,
      )
    }
  }
}

function inspectRawColors(filePath, source) {
  if (filePath === tokenFile) {
    return
  }

  for (const { label, pattern } of rawColorPatterns) {
    for (const match of source.matchAll(pattern)) {
      addTextViolation(
        filePath,
        source,
        match.index,
        'design-token',
        `Raw ${label} colors are allowed only in src/product/styles/tokens.css.`,
      )
    }
  }
}

function inspectImportant(filePath, source) {
  for (const match of source.matchAll(/!important\b/giu)) {
    addTextViolation(
      filePath,
      source,
      match.index,
      'no-important',
      '!important is forbidden in product styles.',
    )
  }
}

function lineCount(source) {
  if (source.length === 0) {
    return 0
  }

  const lines = source.split(/\r\n|\n|\r/u)
  return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

function inspectFileLength(filePath, source, extension) {
  if (!typeScriptExtensions.has(extension)) {
    return
  }

  const totalLines = lineCount(source)
  if (totalLines > 300) {
    violations.push({
      column: 1,
      file: projectPath(filePath),
      line: 301,
      message: `TypeScript files must not exceed 300 lines (found ${totalLines}).`,
      rule: 'max-file-lines',
    })
  }
}

async function run() {
  let files

  try {
    files = await collectProductFiles(productRoot)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      console.error('Product design guard failed: src/product does not exist.')
      process.exitCode = 1
      return
    }
    throw error
  }

  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8')
    const extension = extname(filePath).toLowerCase()

    inspectFileLength(filePath, source, extension)
    inspectRawColors(filePath, source)
    inspectImportant(filePath, source)

    if (scriptExtensions.has(extension)) {
      inspectScript(filePath, source, extension)
    } else if (['.css', '.less', '.sass', '.scss'].includes(extension)) {
      inspectCssImports(filePath, source)
    }
  }

  violations.sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule),
  )

  if (violations.length > 0) {
    console.error(`Product design guard failed (${violations.length} violations):`)
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line}:${violation.column} ` +
          `[${violation.rule}] ${violation.message}`,
      )
    }
    process.exitCode = 1
    return
  }

  console.log(`Product design guard passed (${files.length} files checked).`)
}

await run()
