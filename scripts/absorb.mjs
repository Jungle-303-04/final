#!/usr/bin/env node

import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_SOURCE = path.join(REPO_ROOT, 'references/upstream/packages/k8s-ui/src')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'references/absorbed')
const DEFAULT_REPORT = path.join(REPO_ROOT, 'docs/auto/absorb-report.json')
const SOURCE_REVISION = '10461f40bcfaf6dd578b24262c8f8fb84ae20766'

const TEXT_EXTENSIONS = new Set(['.css', '.json', '.md', '.svg', '.ts', '.tsx'])
const UTILITY_PREFIXES =
  '(?:bg|text|border|ring|ring-offset|divide|from|via|to|outline|fill|stroke|shadow|placeholder|accent)'
const FORBIDDEN_CONTENT = /radar|skyhook|theme-(?:base|surface|elevated|hover|active|border|text)/i

const THEME_TOKENS = new Map([
  ['base', ['background', null]],
  ['sidebar', ['sidebar', null]],
  ['surface', ['card', null]],
  ['surface-secondary', ['muted', null]],
  ['elevated', ['popover', null]],
  ['hover', ['accent', null]],
  ['active', ['accent', null]],
  ['bg', ['background', null]],
  ['text-primary', ['foreground', null]],
  ['text-secondary', ['muted-foreground', null]],
  ['text-tertiary', ['muted-foreground', '75']],
  ['text-quaternary', ['muted-foreground', '55']],
  ['text-disabled', ['muted-foreground', '45']],
  ['border', ['border', null]],
  ['border-light', ['border', '60']],
  ['border-subtle', ['border', '35']],
])

const SHADOW_TOKENS = new Map([
  ['sm', 'sm'],
  ['md', 'md'],
  ['lg', 'lg'],
])

function increment(stats, key, amount = 1) {
  stats[key] = (stats[key] ?? 0) + amount
}

function replaceWithCount(input, pattern, replacement, stats, key) {
  let count = 0
  const value = input.replace(pattern, (...args) => {
    count += 1
    return typeof replacement === 'function' ? replacement(...args) : replacement
  })
  if (count > 0) increment(stats, key, count)
  return value
}

export function normalizeRelativePath(relativePath) {
  return relativePath
    .split(path.sep)
    .map((segment) => {
      if (segment === 'theme') return 'styles'
      if (segment === 'radar' || segment === 'skyhook') return 'product'
      return segment
        .replace(/tailwind-theme/gi, 'tailwind-semantic')
        .replace(/radar-icon-loading/gi, 'loading-icon')
        .replace(/skyhook/gi, 'product')
        .replace(/radar/gi, 'product')
    })
    .join(path.sep)
}

function replaceThemeUtilities(input, stats) {
  const pattern = new RegExp(`\\b(${UTILITY_PREFIXES})-theme-([a-z0-9-]+)(?:/([0-9]+))?`, 'gi')
  return replaceWithCount(
    input,
    pattern,
    (match, prefix, token, explicitOpacity) => {
      if (prefix.toLowerCase() === 'shadow' && SHADOW_TOKENS.has(token.toLowerCase())) {
        return `shadow-${SHADOW_TOKENS.get(token.toLowerCase())}`
      }

      const mapped = THEME_TOKENS.get(token.toLowerCase())
      if (!mapped) return match

      const [semantic, defaultOpacity] = mapped
      const opacity = explicitOpacity ?? defaultOpacity
      return `${prefix}-${semantic}${opacity ? `/${opacity}` : ''}`
    },
    stats,
    'themeUtilitiesVisited',
  )
}

function replaceThemeCssVariables(input, stats) {
  let output = replaceWithCount(
    input,
    /^[ \t]*--color-theme-[a-z0-9-]+:[^;]+;[ \t]*\n?/gim,
    '',
    stats,
    'removedThemeCssVariableDefinitions',
  )
  output = replaceWithCount(
    output,
    /--color-theme-([a-z0-9-]+)/gi,
    (match, token) => {
      const mapped = THEME_TOKENS.get(token.toLowerCase())
      return mapped ? `--${mapped[0]}` : match
    },
    stats,
    'themeCssVariableReferences',
  )
  return output
}

function replaceSemanticPalettes(input, stats) {
  const paletteGroups = [
    ['destructive', 'red|rose'],
    ['warning', 'amber|yellow'],
    ['success', 'emerald|green'],
  ]

  let output = input
  for (const [semantic, palettes] of paletteGroups) {
    const pattern = new RegExp(
      `\\b(${UTILITY_PREFIXES})-(?:${palettes})-[0-9]+(?:/([0-9]+))?`,
      'gi',
    )
    output = replaceWithCount(
      output,
      pattern,
      (_match, prefix, opacity) => `${prefix}-${semantic}${opacity ? `/${opacity}` : ''}`,
      stats,
      `${semantic}PaletteUtilities`,
    )
  }
  return output
}

function replaceBrandTokens(input, stats) {
  let output = input

  output = replaceWithCount(
    output,
    new RegExp(`\\b(${UTILITY_PREFIXES})-skyhook(?:-[0-9]+)?(?:/([0-9]+))?`, 'gi'),
    (_match, prefix, opacity) => `${prefix}-primary${opacity ? `/${opacity}` : ''}`,
    stats,
    'brandPaletteUtilities',
  )
  output = replaceWithCount(
    output,
    /var\(--(?:color-radar-accent|color-brand(?:-[a-z0-9-]+)?|color-skyhook(?:-[a-z0-9-]+)?|brand-rgb)\)/gi,
    'var(--primary)',
    stats,
    'brandVariableReferences',
  )
  output = replaceWithCount(
    output,
    /^[ \t]*--(?:color-brand(?:-[a-z0-9-]+)?|color-skyhook(?:-[a-z0-9-]+)?|brand-rgb):[^;]+;[ \t]*\n?/gim,
    '',
    stats,
    'removedBrandVariableDefinitions',
  )
  output = replaceWithCount(
    output,
    /--(?:color-radar-accent|color-brand(?:-[a-z0-9-]+)?|color-skyhook(?:-[a-z0-9-]+)?|brand-rgb)\b/gi,
    '--primary',
    stats,
    'brandVariableNames',
  )
  return output
}

function replaceClassNameHelper(input, stats) {
  let output = input
  output = replaceWithCount(
    output,
    /import\s*\{\s*clsx\s*\}\s*from\s*(['"])clsx\1[ \t]*;?/g,
    "import { cn } from '@/shared/lib/cn'",
    stats,
    'classNameHelperImports',
  )
  output = replaceWithCount(output, /\bclsx\s*\(/g, 'cn(', stats, 'classNameHelperCalls')
  return output
}

function replaceReferenceNames(input, stats) {
  let output = input

  const pathReplacements = [
    [/assets\/radar\/radar-icon-loading\.svg/gi, 'assets/product/loading-icon.svg'],
    [/theme\/tailwind-theme\.css/gi, 'styles/tailwind-semantic.css'],
    [/\btheme\/(variables|components)\.css/gi, 'styles/$1.css'],
  ]
  for (const [pattern, replacement] of pathReplacements) {
    output = replaceWithCount(output, pattern, replacement, stats, 'referencePaths')
  }

  const names = [
    [/SKYHOOK/g, 'OPSIA'],
    [/Skyhook/g, 'Opsia'],
    [/skyhook/g, 'opsia'],
    [/RADAR/g, 'OPSIA'],
    [/Radar/g, 'Opsia'],
    [/radar/g, 'opsia'],
  ]
  for (const [pattern, replacement] of names) {
    output = replaceWithCount(output, pattern, replacement, stats, 'referenceNames')
  }
  return output
}

export function transformText(input) {
  const stats = {}
  let output = input
  output = replaceThemeUtilities(output, stats)
  output = replaceThemeCssVariables(output, stats)
  output = replaceSemanticPalettes(output, stats)
  output = replaceBrandTokens(output, stats)
  output = replaceClassNameHelper(output, stats)
  output = replaceReferenceNames(output, stats)
  return { output, stats }
}

export function findManualReviewItems(text, relativePath) {
  const items = []
  const patterns = [
    {
      reason: 'neutral-palette-needs-context',
      pattern: new RegExp(
        `\\b${UTILITY_PREFIXES}-(?:zinc|gray|slate|neutral|stone)-[0-9]+(?:/[0-9]+)?`,
        'gi',
      ),
    },
    {
      reason: 'sky-palette-needs-context',
      pattern: new RegExp(`\\b${UTILITY_PREFIXES}-sky-[0-9]+(?:/[0-9]+)?`, 'gi'),
    },
    {
      reason: 'unknown-theme-utility',
      pattern: new RegExp(`\\b${UTILITY_PREFIXES}-theme-[a-z0-9-]+(?:/[0-9]+)?`, 'gi'),
    },
  ]

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    for (const { reason, pattern } of patterns) {
      pattern.lastIndex = 0
      for (const match of lines[index].matchAll(pattern)) {
        items.push({
          path: relativePath,
          line: index + 1,
          token: match[0],
          reason,
        })
      }
    }
  }
  return items
}

async function walkFiles(root) {
  const files = []
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(absolutePath)
      else if (entry.isFile()) files.push(absolutePath)
    }
  }
  await walk(root)
  return files
}

function mergeStats(target, source) {
  for (const [key, value] of Object.entries(source)) increment(target, key, value)
}

function parseArguments(argv) {
  const values = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    report: DEFAULT_REPORT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!['--source', '--output', '--report'].includes(flag) || !argv[index + 1]) {
      throw new Error(`지원하지 않는 인자입니다: ${flag}`)
    }
    values[flag.slice(2)] = path.resolve(argv[index + 1])
    index += 1
  }
  return values
}

function assertSafeOutput(sourceRoot, outputRoot) {
  const forbidden = new Set([path.parse(outputRoot).root, REPO_ROOT, sourceRoot])
  if (forbidden.has(outputRoot) || sourceRoot.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`안전하지 않은 출력 경로입니다: ${outputRoot}`)
  }
}

async function absorb({ source, output, report }) {
  await access(source)
  assertSafeOutput(source, output)
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })

  const files = await walkFiles(source)
  const totals = {}
  const manualReview = []
  let changedFiles = 0
  let textFiles = 0
  let binaryFiles = 0

  for (const sourceFile of files) {
    const sourceRelativePath = path.relative(source, sourceFile)
    const outputRelativePath = normalizeRelativePath(sourceRelativePath)
    const outputFile = path.join(output, outputRelativePath)
    await mkdir(path.dirname(outputFile), { recursive: true })

    if (!TEXT_EXTENSIONS.has(path.extname(sourceFile).toLowerCase())) {
      await cp(sourceFile, outputFile)
      binaryFiles += 1
      if (sourceRelativePath !== outputRelativePath) changedFiles += 1
      continue
    }

    const input = await readFile(sourceFile, 'utf8')
    const transformed = transformText(input)
    const forbiddenContent = transformed.output.match(FORBIDDEN_CONTENT)?.[0]
    if (forbiddenContent) {
      throw new Error(`생성물에 금지 이름이 남았습니다: ${outputRelativePath} (${forbiddenContent})`)
    }
    if (/from\s*(['"])clsx\1/.test(transformed.output)) {
      throw new Error(`생성물에 clsx import가 남았습니다: ${outputRelativePath}`)
    }
    await writeFile(outputFile, transformed.output, 'utf8')
    textFiles += 1
    if (sourceRelativePath !== outputRelativePath || input !== transformed.output) changedFiles += 1
    mergeStats(totals, transformed.stats)
    manualReview.push(...findManualReviewItems(transformed.output, outputRelativePath))
  }

  const forbiddenPath = files
    .map((file) => normalizeRelativePath(path.relative(source, file)))
    .find((relativePath) => /radar|skyhook|(?:^|[/_-])theme(?:[/_.-]|$)/i.test(relativePath))
  if (forbiddenPath) throw new Error(`출력 경로에 금지 이름이 남았습니다: ${forbiddenPath}`)

  const reportValue = {
    generatedBy: 'scripts/absorb.mjs',
    sourceRevision: SOURCE_REVISION,
    sourceFiles: files.length,
    textFiles,
    binaryFiles,
    changedFiles,
    replacements: Object.fromEntries(Object.entries(totals).sort(([left], [right]) => left.localeCompare(right))),
    manualReviewCount: manualReview.length,
    manualReview,
  }
  await mkdir(path.dirname(report), { recursive: true })
  await writeFile(report, `${JSON.stringify(reportValue, null, 2)}\n`, 'utf8')
  return reportValue
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const report = await absorb(options)
  process.stdout.write(
    `흡수 완료: ${report.sourceFiles}개 파일, ${report.changedFiles}개 변경, 수동 검토 ${report.manualReviewCount}건\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
