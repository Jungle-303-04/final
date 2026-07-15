#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { access, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_SOURCE = path.join(REPOSITORY_ROOT, 'references', 'upstream')
const DEFAULT_OUTPUT = path.join(REPOSITORY_ROOT, 'docs', 'migration', 'reference-source-ledger.json')
const DEFAULT_REVISION = 'cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc'
const DEFAULT_SOURCE_REPOSITORY = 'https://github.com/skyhook-io/radar.git'

const DISPOSITIONS = new Set([
  'frozen',
  'frontend-port',
  'python-port',
  'desktop-port',
  'build/docs-only',
])

const PORT_TARGETS = {
  'frontend-port': {
    target: 'frontend/src',
    verification: 'frontend/src/reference/referenceParity.test.ts',
  },
  'python-port': {
    target: 'src',
    verification: 'tests/contracts/test_reference_parity.py',
  },
  'desktop-port': {
    target: 'desktop',
    verification: 'desktop/src-tauri/tests/reference_parity.rs',
  },
  'build/docs-only': {
    target: 'docs/migration',
    verification: 'scripts/reference-ledger.test.mjs',
  },
  frozen: {
    target: null,
    verification: 'scripts/reference-ledger.test.mjs',
  },
}

const LANGUAGE_BY_EXTENSION = new Map([
  ['.go', 'go'],
  ['.py', 'python'],
  ['.rs', 'rust'],
  ['.ts', 'typescript'],
  ['.tsx', 'tsx'],
  ['.js', 'javascript'],
  ['.jsx', 'jsx'],
  ['.json', 'json'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
  ['.toml', 'toml'],
  ['.css', 'css'],
  ['.scss', 'scss'],
  ['.html', 'html'],
  ['.md', 'markdown'],
  ['.mdx', 'mdx'],
  ['.sh', 'shell'],
  ['.sql', 'sql'],
  ['.proto', 'protobuf'],
])

function normalizedPath(value) {
  return value.split(path.sep).join('/')
}

export function classifyReferencePath(relativePath) {
  const value = normalizedPath(relativePath)
  if (value === 'examples' || value.startsWith('examples/')) return 'frozen'
  if (value === 'cmd/desktop' || value.startsWith('cmd/desktop/')) return 'desktop-port'
  if (value === 'web' || value.startsWith('web/') || value === 'packages/k8s-ui' || value.startsWith('packages/k8s-ui/')) {
    return 'frontend-port'
  }
  if (
    value === 'internal' ||
    value.startsWith('internal/') ||
    value === 'pkg' ||
    value.startsWith('pkg/') ||
    value === 'cmd' ||
    value.startsWith('cmd/')
  ) {
    return 'python-port'
  }
  if (
    value === '.github' ||
    value.startsWith('.github/') ||
    value === 'docs' ||
    value.startsWith('docs/') ||
    value === 'Makefile' ||
    value === 'go.mod' ||
    value === 'go.sum' ||
    value === 'package.json' ||
    value === 'package-lock.json' ||
    value === 'pnpm-lock.yaml' ||
    value.endsWith('.md') ||
    value.endsWith('.mdx') ||
    value.endsWith('.txt') ||
    value.endsWith('.yml') ||
    value.endsWith('.yaml')
  ) {
    return 'build/docs-only'
  }
  return 'frozen'
}

export function languageForReferencePath(relativePath) {
  const basename = path.posix.basename(normalizedPath(relativePath)).toLowerCase()
  if (basename === 'makefile') return 'make'
  if (basename === 'dockerfile') return 'dockerfile'
  if (basename === 'license' || basename === 'notice') return 'text'
  return LANGUAGE_BY_EXTENSION.get(path.posix.extname(basename)) ?? 'asset-or-unknown'
}

export function buildLedgerRows(files, sourceRevision) {
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error('sourceRevision must be a 40-character lowercase hexadecimal revision')
  }
  return [...files]
    .map((file) => {
      const filePath = normalizedPath(file.path)
      const disposition = classifyReferencePath(filePath)
      const port = PORT_TARGETS[disposition]
      return {
        path: filePath,
        size: file.size,
        sha256: file.sha256,
        language: languageForReferencePath(filePath),
        purpose: disposition,
        disposition,
        target: port.target,
        verification: port.verification,
      }
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
}

export function validateLedger(ledger) {
  const errors = []
  if (!ledger || typeof ledger !== 'object') return ['ledger must be an object']
  if (ledger.schemaVersion !== 2) errors.push('schemaVersion must equal 2')
  if (!/^[0-9a-f]{40}$/.test(ledger.sourceRevision ?? '')) {
    errors.push('sourceRevision must be a 40-character lowercase hexadecimal revision')
  }
  if (typeof ledger.sourceRepository !== 'string' || !/^https:\/\//.test(ledger.sourceRepository)) {
    errors.push('sourceRepository must be an HTTPS URL')
  }
  if (!Array.isArray(ledger.files)) return [...errors, 'files must be an array']

  const seenPaths = new Set()
  for (const row of ledger.files) {
    const rowPath = String(row?.path ?? '')
    if (!rowPath || rowPath.startsWith('/') || rowPath.includes('..')) {
      errors.push(`${rowPath || '<unknown>'}: path must be a normalized relative path`)
      continue
    }
    if (seenPaths.has(rowPath)) errors.push(`${rowPath}: path is duplicated`)
    seenPaths.add(rowPath)
    if (!Number.isInteger(row.size) || row.size < 0) errors.push(`${rowPath}: size must be a non-negative integer`)
    if (!/^[0-9a-f]{64}$/.test(row.sha256 ?? '')) {
      errors.push(`${rowPath}: sha256 must be a 64-character lowercase hexadecimal value`)
    }
    if (typeof row.language !== 'string' || !row.language.trim()) {
      errors.push(`${rowPath}: language is required`)
    }
    if (typeof row.purpose !== 'string' || !row.purpose.trim()) {
      errors.push(`${rowPath}: purpose is required`)
    }
    if (!DISPOSITIONS.has(row.disposition)) {
      errors.push(`${rowPath}: disposition is not supported`)
      continue
    }
    if (row.disposition !== 'frozen' && !row.target) {
      errors.push(`${rowPath}: ${row.disposition} requires a target`)
    }
    if (!row.verification) errors.push(`${rowPath}: ${row.disposition} requires a verification target`)
  }
  return errors
}

async function walkSourceFiles(root) {
  const files = []
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      const stat = await lstat(absolutePath)
      const content = await readFile(absolutePath)
      files.push({
        path: normalizedPath(path.relative(root, absolutePath)),
        size: stat.size,
        sha256: createHash('sha256').update(content).digest('hex'),
      })
    }
  }
  await walk(root)
  return files
}

export async function createLedger({
  source = DEFAULT_SOURCE,
  sourceRevision = DEFAULT_REVISION,
  sourceRepository = DEFAULT_SOURCE_REPOSITORY,
} = {}) {
  await access(source)
  const files = await walkSourceFiles(source)
  const ledger = {
    schemaVersion: 2,
    sourceRevision,
    sourceRepository,
    fileCount: files.length,
    files: buildLedgerRows(files, sourceRevision),
  }
  const errors = validateLedger(ledger)
  if (errors.length > 0) throw new Error(`ledger validation failed:\n${errors.join('\n')}`)
  return ledger
}

function parseArguments(argv) {
  const values = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    sourceRevision: DEFAULT_REVISION,
    sourceRepository: DEFAULT_SOURCE_REPOSITORY,
    check: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--check') {
      values.check = true
      continue
    }
    if (!['--source', '--output', '--revision', '--repository'].includes(flag) || !argv[index + 1]) {
      throw new Error(`지원하지 않는 인자입니다: ${flag}`)
    }
    const value = argv[index + 1]
    if (flag === '--revision') values.sourceRevision = value
    else if (flag === '--repository') values.sourceRepository = value
    else values[flag.slice(2)] = path.resolve(value)
    index += 1
  }
  return values
}

export async function writeLedger({ source, output, sourceRevision, sourceRepository, check = false }) {
  const ledger = await createLedger({ source, sourceRevision, sourceRepository })
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`
  if (check) {
    const current = await readFile(output, 'utf8').catch(() => null)
    if (current !== serialized) throw new Error(`원본 ledger가 최신 스냅샷과 일치하지 않습니다: ${output}`)
    return ledger
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, serialized, 'utf8')
  return ledger
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const ledger = await writeLedger(options)
  process.stdout.write(`원본 ledger 완료: ${ledger.fileCount}개 파일, ${ledger.sourceRevision}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
