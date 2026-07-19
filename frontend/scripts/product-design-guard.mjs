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
import {
  legacyMaxFileLineBaseline,
  legacyViolationCountBaseline,
} from './product-design-guard-baseline.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, 'src')
const productRoot = process.env.PRODUCT_DESIGN_GUARD_ROOT
  ? resolve(process.env.PRODUCT_DESIGN_GUARD_ROOT)
  : sourceRoot
const apiRoot = resolve(productRoot, 'api')
const tokenFile = resolve(productRoot, 'styles', 'tokens.css')
const protectedBrandAssets = new Set([
  resolve(productRoot, 'shared', 'brand', 'azure.svg'),
])
const protectedBrandRoots = [
  resolve(productRoot, 'shared', 'ui', 'brand'),
]
const motionRoot = resolve(productRoot, 'motion')
const motionTokenFile = resolve(motionRoot, 'tokens.css')

export const I18N_LITERAL_ENFORCEMENT_ENV = 'PRODUCT_I18N_LITERAL_ENFORCEMENT'

const enforceI18nUiLiterals = process.env[I18N_LITERAL_ENFORCEMENT_ENV] !== '0'

const checkedExtensions = new Set([
  '.cjs',
  '.cts',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.less',
  '.mjs',
  '.mts',
  '.sass',
  '.scss',
  '.svg',
  '.ts',
  '.tsx',
])
const scriptExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const typeScriptExtensions = new Set(['.cts', '.mts', '.ts', '.tsx'])

const rawColorPatterns = [
  { label: 'hex', pattern: /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/giu },
  { label: 'rgb/rgba', pattern: /\brgba?\s*\(/giu },
  { label: 'hsl/hsla', pattern: /\bhsla?\s*\(/giu },
  { label: 'oklch', pattern: /\boklch\s*\(/giu },
]

const motionClassLiteralPattern =
  /\bduration-(?:\[[^\]\r\n]*(?:\d+(?:\.\d+)?m?s|\d*\.\d+s)[^\]\r\n]*\]|\d+)\b|(?<![-(])\bease-(?:linear|in|out|in-out)\b/giu
const motionDeclarationPattern =
  /\b(?:transition|animation)(?:-duration|-timing-function)?\s*:\s*([^;{}]+);/giu
const motionValueLiteralPattern =
  /(?:\d+(?:\.\d+)?m?s|\d*\.\d+s|cubic-bezier\([^)]*\)|(?<![-(])\b(?:linear|ease|ease-in|ease-out|ease-in-out)\b)/giu

// This is the exact pre-D17 debt on the branch at the start of P1. The guard
// permits only these file/literal counts, so moving or adding a literal fails
// while the owning surface track can reduce the baseline incrementally.
const legacyMotionLiteralBaseline = Object.freeze({
  'pages/home/HomeClusterHealth.tsx': { 'duration-500': 1 },
})

const restrictedNetworkApis = new Set([
  'EventSource',
  'WebSocket',
  'XMLHttpRequest',
  'fetch',
  'sendBeacon',
])
const networkCapableGlobals = new Set([
  'globalThis',
  'navigator',
  'self',
  'window',
])

const allowedStandaloneUiTerms = new Set([
  'API',
  'CPU',
  'ConfigMap',
  'Container',
  'CronJob',
  'DaemonSet',
  'Deployment',
  'Endpoint',
  'EndpointSlice',
  'Event',
  'Failed',
  'GitOps',
  'GPU',
  'HPA',
  'HTTP',
  'HTTPS',
  'Ingress',
  'Job',
  'JSON',
  'Opsia',
  'Kubernetes',
  'KiB',
  'MiB',
  'GiB',
  'Namespace',
  'Node',
  'Pending',
  'PersistentVolume',
  'PersistentVolumeClaim',
  'Pod',
  'PVC',
  'RCA',
  'Ready',
  'ReplicaSet',
  'Running',
  'Secret',
  'Service',
  'SSE',
  'StatefulSet',
  'Succeeded',
  'UID',
  'URL',
  'WebSocket',
  'Workload',
  'WS',
  'YAML',
  'm',
  'ms',
  's',
])

const structuralJsxAttributes = new Set([
  'action',
  'align',
  'aria-activedescendant',
  'aria-atomic',
  'aria-busy',
  'aria-controls',
  'aria-current',
  'aria-describedby',
  'aria-details',
  'aria-expanded',
  'aria-haspopup',
  'aria-hidden',
  'aria-invalid',
  'aria-labelledby',
  'aria-live',
  'aria-owns',
  'aria-pressed',
  'aria-sort',
  'as',
  'className',
  'data-slot',
  'defaultValue',
  'dir',
  'form',
  'href',
  'htmlFor',
  'icon',
  'id',
  'key',
  'kind',
  'method',
  'mode',
  'name',
  'orientation',
  'path',
  'placement',
  'rel',
  'role',
  'route',
  'side',
  'size',
  'slot',
  'status',
  'tabIndex',
  'target',
  'textAnchor',
  'to',
  'tone',
  'type',
  'value',
  'variant',
])

const violations = []
const consumedLegacyViolations = new Map()

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
  const file = projectPath(filePath)
  const allowance = legacyViolationCountBaseline[file]?.[rule] ?? 0
  const baselineKey = `${file}\0${rule}`
  const consumed = consumedLegacyViolations.get(baselineKey) ?? 0
  if (consumed < allowance) {
    consumedLegacyViolations.set(baselineKey, consumed + 1)
    return
  }
  violations.push({
    column: character + 1,
    file,
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
    /^(?:examples|registry|shadcn-lab|vendor)(?:\/|$)/u.test(aliasedSource) ||
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

function isMotionImport(specifier) {
  return specifier === 'motion' || specifier.startsWith('motion/')
}

function checkMotionImportOwnership(filePath, sourceFile, node, specifier) {
  if (!isMotionImport(specifier) || isWithin(filePath, motionRoot)) {
    return
  }

  addViolation(
    filePath,
    sourceFile,
    node.getStart(sourceFile),
    'motion-import-ownership',
    'Motion package imports are allowed only under src/motion.',
  )
}

function checkModuleSpecifier(filePath, sourceFile, node, specifier) {
  checkImportSpecifier(filePath, sourceFile, node, specifier)
  checkMotionImportOwnership(filePath, sourceFile, node, specifier)
}

function stringArgument(node) {
  const [argument] = node.arguments
  return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ? argument.text
    : null
}

function staticStringValue(node) {
  if (ts.isStringLiteralLike(node)) {
    return node.text
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  if (ts.isTemplateExpression(node)) {
    const value = [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ].join('')
    return normalizedUiLiteral(value) === '' ? null : value
  }

  if (ts.isParenthesizedExpression(node)) {
    return staticStringValue(node.expression)
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticStringValue(node.left)
    const right = staticStringValue(node.right)
    return left === null || right === null ? null : left + right
  }

  return null
}

function isI18nLiteralScanExcluded(filePath) {
  const normalized = filePath.split(sep).join('/')
  return (
    /(?:^|\/)(?:__tests__)(?:\/|$)/u.test(normalized) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalized) ||
    /(?:^|\/)shared\/i18n(?:\/|$)/u.test(normalized)
  )
}

function normalizedUiLiteral(value) {
  return value.replace(/\s+/gu, ' ').trim()
}

function isAllowedStandaloneUiTerm(value) {
  const term = value.replace(/[:：]$/u, '')
  return allowedStandaloneUiTerms.has(term)
}

function isUserFacingLiteral(value) {
  const normalized = normalizedUiLiteral(value)
  if (normalized === '' || isAllowedStandaloneUiTerm(normalized)) {
    return false
  }

  return /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/u.test(normalized) ||
    /[a-z]/iu.test(normalized)
}

function jsxAttributeName(node) {
  return ts.isIdentifier(node.name)
    ? node.name.text
    : node.name.getText()
}

function jsxAttributeElement(node) {
  const element = node.parent?.parent
  return element && (
    ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)
  ) ? element : null
}

function intrinsicJsxTagName(node) {
  const element = jsxAttributeElement(node)
  return element && ts.isIdentifier(element.tagName)
    ? element.tagName.text
    : null
}

function jsxAttributeByName(element, name) {
  return element.attributes.properties.find((property) =>
    ts.isJsxAttribute(property) && jsxAttributeName(property) === name,
  )
}

function staticJsxAttributeValue(node) {
  const initializer = node.initializer
  if (!initializer) return null
  if (ts.isStringLiteralLike(initializer)) return initializer.text
  return ts.isJsxExpression(initializer) && initializer.expression
    ? staticStringValue(initializer.expression)
    : null
}

function isVisibleNativeFormValueAttribute(node, name) {
  if (name !== 'value') return false
  const tagName = intrinsicJsxTagName(node)
  if (tagName === 'textarea') return true
  if (tagName !== 'input') return false

  const element = jsxAttributeElement(node)
  const typeAttribute = element && jsxAttributeByName(element, 'type')
  if (!typeAttribute || !ts.isJsxAttribute(typeAttribute)) return true
  const staticType = staticJsxAttributeValue(typeAttribute)
  return normalizedUiLiteral(staticType ?? '').toLowerCase() !== 'hidden'
}

function isUserFacingJsxAttribute(node) {
  const name = jsxAttributeName(node)
  if (name === 'children' || isVisibleNativeFormValueAttribute(node, name)) {
    return true
  }
  if (
    name.startsWith('data-') ||
    structuralJsxAttributes.has(name) ||
    /(?:Id|Ids|Key|Keys|Kind|Mode|Placement|Side|State|Strategy|Tone|Type|Variant)$/u.test(name)
  ) {
    return false
  }
  if (name === 'alt' || name === 'aria-label' || name === 'aria-description') {
    return true
  }
  return /(?:caption|close|collapse|description|empty|expand|helper|label|message|placeholder|text|title|tooltip)/iu
    .test(name)
}

function staticJsxLiteralFragments(node) {
  const expression = unwrapExpression(node)
  if (ts.isStringLiteralLike(expression)) {
    return [{ node: expression, text: expression.text }]
  }
  if (ts.isTemplateExpression(expression)) {
    return [
      { node: expression.head, text: expression.head.text },
      ...expression.templateSpans.map((span) => ({
        node: span.literal,
        text: span.literal.text,
      })),
    ]
  }
  if (
    ts.isBinaryExpression(expression) &&
    staticBranchOperators.has(expression.operatorToken.kind)
  ) {
    return [
      ...staticJsxLiteralFragments(expression.left),
      ...staticJsxLiteralFragments(expression.right),
    ]
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...staticJsxLiteralFragments(expression.whenTrue),
      ...staticJsxLiteralFragments(expression.whenFalse),
    ]
  }
  if (ts.isCommaListExpression(expression)) {
    return expression.elements.flatMap(staticJsxLiteralFragments)
  }
  return []
}

const staticBranchOperators = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.CommaToken,
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.QuestionQuestionToken,
])

function jsxAttributeLiteralFragments(node) {
  const initializer = node.initializer
  if (!initializer) return []
  if (ts.isStringLiteralLike(initializer)) {
    return [{ node: initializer, text: initializer.text }]
  }
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return staticJsxLiteralFragments(initializer.expression)
  }
  return []
}

/**
 * Finds static, user-visible JSX copy that must move to the shared i18n
 * catalog. This scanner is pure so migration tooling can run it before the
 * product-wide enforcement switch is enabled.
 */
export function scanJsxUserFacingLiterals(filePath, source) {
  if (extname(filePath).toLowerCase() !== '.tsx' || isI18nLiteralScanExcluded(filePath)) {
    return []
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const matches = []

  function record(node, value) {
    const normalized = normalizedUiLiteral(value)
    if (!isUserFacingLiteral(normalized)) return
    matches.push({
      position: node.getStart(sourceFile),
      text: normalized,
    })
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      record(node, node.text)
    } else if (ts.isJsxAttribute(node)) {
      if (isUserFacingJsxAttribute(node)) {
        for (const fragment of jsxAttributeLiteralFragments(node)) {
          record(fragment.node, fragment.text)
        }
      }
    } else if (
      ts.isJsxExpression(node) &&
      !ts.isJsxAttribute(node.parent) &&
      node.expression
    ) {
      for (const fragment of staticJsxLiteralFragments(node.expression)) {
        record(fragment.node, fragment.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return matches
}

/**
 * Finds Korean product copy hidden in non-JSX TypeScript values. Product
 * catalogs and tests are the only places where literal Korean is allowed.
 */
export function scanKoreanStringLiterals(filePath, source) {
  const extension = extname(filePath).toLowerCase()
  if (!typeScriptExtensions.has(extension) || isI18nLiteralScanExcluded(filePath)) {
    return []
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(extension),
  )
  const matches = []

  function isInsideJsx(node) {
    for (let current = node.parent; current; current = current.parent) {
      if (
        ts.isJsxAttribute(current) ||
        ts.isJsxElement(current) ||
        ts.isJsxExpression(current) ||
        ts.isJsxFragment(current) ||
        ts.isJsxSelfClosingElement(current)
      ) {
        return true
      }
      if (ts.isStatement(current) || ts.isSourceFile(current)) return false
    }
    return false
  }

  function visit(node) {
    if (ts.isStringLiteralLike(node) && !isInsideJsx(node)) {
      const normalized = normalizedUiLiteral(node.text)
      if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/u.test(normalized)) {
        matches.push({
          position: node.getStart(sourceFile),
          text: normalized,
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return matches
}

function inspectI18nUiLiterals(filePath, source, sourceFile) {
  for (const match of scanJsxUserFacingLiterals(filePath, source)) {
    const preview = match.text.length > 80
      ? `${match.text.slice(0, 77)}...`
      : match.text
    addViolation(
      filePath,
      sourceFile,
      match.position,
      'i18n-ui-literal',
      `User-facing JSX literal must come from shared/i18n: ${preview}`,
    )
  }

  for (const match of scanKoreanStringLiterals(filePath, source)) {
    const preview = match.text.length > 80
      ? `${match.text.slice(0, 77)}...`
      : match.text
    addViolation(
      filePath,
      sourceFile,
      match.position,
      'i18n-korean-literal',
      `Korean TypeScript literal must come from shared/i18n: ${preview}`,
    )
  }
}

function unwrapExpression(node) {
  let current = node

  while (
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }

  return current
}

function isNetworkCapableGlobal(node, aliases = networkCapableGlobals) {
  const expression = unwrapExpression(node)
  return ts.isIdentifier(expression) && aliases.has(expression.text)
}

function isTypeOnlyIdentifier(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) {
      return true
    }

    if (ts.isExpression(current) || ts.isStatement(current) || ts.isSourceFile(current)) {
      return false
    }
  }

  return false
}

function isDeclarationOrPropertyName(node) {
  const { parent } = node

  if (
    (ts.isPropertyAccessExpression(parent) || ts.isPropertyAccessChain(parent)) &&
    parent.name === node
  ) {
    return true
  }

  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node
  ) {
    return true
  }

  return ts.isDeclaration(parent) && 'name' in parent && parent.name === node
}

function bindingInitializer(node) {
  const pattern = node.parent
  const declaration = pattern?.parent
  return ts.isObjectBindingPattern(pattern) && ts.isVariableDeclaration(declaration)
    ? declaration.initializer
    : null
}

function restrictedNetworkReference(node, globalAliases, localNames) {
  if (ts.isPropertyAccessExpression(node) || ts.isPropertyAccessChain(node)) {
    if (!restrictedNetworkApis.has(node.name.text)) {
      return null
    }
    return isNetworkCapableGlobal(node.expression, globalAliases) ? node.name.text : null
  }

  if (ts.isElementAccessExpression(node) || ts.isElementAccessChain(node)) {
    const memberName = node.argumentExpression
      ? staticStringValue(node.argumentExpression)
      : null

    if (
      memberName &&
      restrictedNetworkApis.has(memberName) &&
      isNetworkCapableGlobal(node.expression, globalAliases)
    ) {
      return memberName
    }

    return null
  }

  if (ts.isBindingElement(node)) {
    const bindingName = node.propertyName ?? node.name
    const memberName = ts.isIdentifier(bindingName)
      ? bindingName.text
      : ts.isComputedPropertyName(bindingName)
        ? staticStringValue(bindingName.expression)
        : null

    const initializer = bindingInitializer(node)
    return (
      memberName &&
      restrictedNetworkApis.has(memberName) &&
      initializer &&
      isNetworkCapableGlobal(initializer, globalAliases)
    ) ? memberName : null
  }

  if (
    ts.isIdentifier(node) &&
    restrictedNetworkApis.has(node.text) &&
    node.text !== 'sendBeacon' &&
    !localNames.has(node.text) &&
    !isTypeOnlyIdentifier(node) &&
    !isDeclarationOrPropertyName(node)
  ) {
    return node.text
  }

  return null
}

function isDynamicGlobalAccess(node, globalAliases) {
  return (
    (ts.isElementAccessExpression(node) || ts.isElementAccessChain(node)) &&
    isNetworkCapableGlobal(node.expression, globalAliases) &&
    (!node.argumentExpression || staticStringValue(node.argumentExpression) === null)
  )
}

function isDynamicReflectGet(node, globalAliases) {
  const expression = ts.isCallExpression(node) ? node.expression : null
  const reflectMember = expression && (
    ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
  ) ? expression : null
  const reflectTarget = reflectMember?.expression
  const reflectMemberName = reflectMember && (
    ts.isPropertyAccessExpression(reflectMember)
      ? reflectMember.name.text
      : reflectMember.argumentExpression
        ? staticStringValue(reflectMember.argumentExpression)
        : null
  )
  if (
    !ts.isCallExpression(node) ||
    !reflectMember ||
    !reflectTarget ||
    !ts.isIdentifier(reflectTarget) ||
    reflectTarget.text !== 'Reflect' ||
    reflectMemberName !== 'get'
  ) {
    return false
  }

  const [target, property] = node.arguments
  if (!target || !property || !isNetworkCapableGlobal(target, globalAliases)) {
    return false
  }

  const propertyName = staticStringValue(property)
  return propertyName === null || restrictedNetworkApis.has(propertyName)
}

function inspectScript(filePath, source, extension) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(extension),
  )
  const enforceApiBoundary = !isWithin(filePath, apiRoot)
  const globalAliases = new Set(networkCapableGlobals)
  const localNames = new Set()

  function collectBindingNames(name) {
    if (ts.isIdentifier(name)) {
      localNames.add(name.text)
      return
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) collectBindingNames(element.name)
    }
  }

  function collectBindings(node) {
    if (ts.isVariableDeclaration(node)) {
      collectBindingNames(node.name)
      if (
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isNetworkCapableGlobal(node.initializer, globalAliases)
      ) {
        globalAliases.add(node.name.text)
      }
    }
    if (ts.isParameter(node)) collectBindingNames(node.name)
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      localNames.add(node.name.text)
    }
    if (ts.isImportClause(node) && node.name) localNames.add(node.name.text)
    if (ts.isImportSpecifier(node)) localNames.add(node.name.text)
    if (ts.isNamespaceImport(node)) localNames.add(node.name.text)
    ts.forEachChild(node, collectBindings)
  }

  collectBindings(sourceFile)

  if (enforceI18nUiLiterals) {
    inspectI18nUiLiterals(filePath, source, sourceFile)
  }

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkModuleSpecifier(filePath, sourceFile, node.moduleSpecifier, node.moduleSpecifier.text)
    }

    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression
      if (expression && ts.isStringLiteralLike(expression)) {
        checkModuleSpecifier(filePath, sourceFile, expression, expression.text)
      }
    }

    if (ts.isCallExpression(node)) {
      const specifier = stringArgument(node)
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'

      if (specifier && (isDynamicImport || isRequire)) {
        checkModuleSpecifier(filePath, sourceFile, node, specifier)
      }

      const expression = unwrapExpression(node.expression)
      const callsAnimate = (
        ts.isIdentifier(expression) && expression.text === 'animate'
      ) || (
        (ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain(expression)) &&
        expression.name.text === 'animate'
      )
      if (callsAnimate && !isWithin(filePath, motionRoot)) {
        addViolation(
          filePath,
          sourceFile,
          node.getStart(sourceFile),
          'motion-ownership',
          'Animation calls are allowed only under src/motion.',
        )
      }
    }

    const networkApi = enforceApiBoundary
      ? restrictedNetworkReference(node, globalAliases, localNames)
      : null

    if (networkApi) {
      addViolation(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        'api-boundary',
        `Direct ${networkApi} access is allowed only under src/api.`,
      )
    }

    if (enforceApiBoundary && isDynamicGlobalAccess(node, globalAliases)) {
      addViolation(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        'api-boundary',
        'Dynamic access to a network-capable global is allowed only under src/api.',
      )
    }

    if (enforceApiBoundary && isDynamicReflectGet(node, globalAliases)) {
      addViolation(
        filePath,
        sourceFile,
        node.getStart(sourceFile),
        'api-boundary',
        'Reflective access to a network transport is allowed only under src/api.',
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
  if (
    filePath === tokenFile ||
    protectedBrandAssets.has(filePath) ||
    protectedBrandRoots.some((directory) => isWithin(filePath, directory))
  ) {
    return
  }

  for (const { label, pattern } of rawColorPatterns) {
    for (const match of source.matchAll(pattern)) {
      addTextViolation(
        filePath,
        source,
        match.index,
        'design-token',
        `Raw ${label} colors are allowed only in src/styles/tokens.css.`,
      )
    }
  }
}

export function scanMotionLiterals(filePath, source) {
  if (isWithin(filePath, motionRoot)) {
    return []
  }

  const matches = []

  for (const match of source.matchAll(motionClassLiteralPattern)) {
    matches.push({
      kind: 'utility',
      literal: match[0],
      position: match.index,
    })
  }

  for (const declaration of source.matchAll(motionDeclarationPattern)) {
    const value = declaration[1]
    const valueOffset = declaration.index + declaration[0].indexOf(value)
    for (const match of value.matchAll(motionValueLiteralPattern)) {
      matches.push({
        kind: 'declaration',
        literal: match[0],
        position: valueOffset + match.index,
      })
    }
  }

  return matches.sort((left, right) => left.position - right.position)
}

function inspectMotionLiterals(filePath, source) {
  const normalizedPath = relative(sourceRoot, filePath).split(sep).join('/')
  const allowedCounts = legacyMotionLiteralBaseline[normalizedPath] ?? {}
  const seenCounts = new Map()

  for (const match of scanMotionLiterals(filePath, source)) {
    const seen = (seenCounts.get(match.literal) ?? 0) + 1
    seenCounts.set(match.literal, seen)
    if (seen <= (allowedCounts[match.literal] ?? 0)) {
      continue
    }

    addTextViolation(
      filePath,
      source,
      match.position,
      'motion-literal',
      `Use a src/motion token instead of the ${match.kind} literal ${match.literal}.`,
    )
  }
}

function inspectImportant(filePath, source) {
  if (filePath === motionTokenFile) {
    return
  }

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

function inspectMotionCss(filePath, source) {
  if (isWithin(filePath, motionRoot)) {
    return
  }

  const patterns = [
    { pattern: /@keyframes\b/giu, message: '@keyframes must live under src/motion.' },
    { pattern: /\banimation(?:-name)?\s*:/giu, message: 'Animation declarations must live under src/motion.' },
  ]
  for (const { pattern, message } of patterns) {
    for (const match of source.matchAll(pattern)) {
      addTextViolation(filePath, source, match.index, 'motion-ownership', message)
    }
  }
}

function lineCount(source) {
  if (source.length === 0) {
    return 0
  }

  const lines = source.split(/\r\n|\n|\r/u)
  return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

function isPureTypeScriptBarrel(filePath, source, extension) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    false,
    scriptKindFor(extension),
  )

  return sourceFile.statements.length > 0 && sourceFile.statements.every((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(statement.moduleSpecifier),
  )
}

function inspectFileLength(filePath, source, extension) {
  if (!typeScriptExtensions.has(extension)) {
    return
  }

  const totalLines = lineCount(source)
  const file = projectPath(filePath)
  const baseline = legacyMaxFileLineBaseline[file] ?? 300
  if (
    totalLines > Math.max(300, baseline) &&
    !isPureTypeScriptBarrel(filePath, source, extension)
  ) {
    violations.push({
      column: 1,
      file,
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
      console.error('Product design guard failed: src does not exist.')
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
    inspectMotionLiterals(filePath, source)

    if (scriptExtensions.has(extension)) {
      inspectScript(filePath, source, extension)
    } else if (['.css', '.less', '.sass', '.scss'].includes(extension)) {
      inspectCssImports(filePath, source)
      inspectMotionCss(filePath, source)
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

const invokedAsScript = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedAsScript) {
  await run()
}
