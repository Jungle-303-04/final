#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..')
export const DEFAULT_BASE_REVISION = '3ff2b1095151c690bf536e8e6ca685c2703fcd70'
export const DEFAULT_TARGET_REVISION = 'cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc'
const DEFAULT_REPOSITORY = '/tmp/opsia-upstream-verify'
const DEFAULT_INVENTORY = path.join(REPOSITORY_ROOT, 'docs', 'spec', 'frontend', 'reference-feature-inventory.md')
const DEFAULT_OUTPUT = path.join(REPOSITORY_ROOT, 'docs', 'migration', 'reference-ui-delta-ledger.json')
const DEFAULT_SOURCE_REPOSITORY = 'https://github.com/skyhook-io/radar.git'
const DEFAULT_SCOPE = ['web', 'packages/k8s-ui']

const CHANGE_STATUSES = new Set(['A', 'M', 'D', 'R'])
const TRANSPORTS = new Set(['sse', 'ws', 'ndjson', 'fetch_sse', 'poll', 'none'])
const CLASSIFICATIONS = new Set(['pending', 'classified'])
const SOURCE_KEY = /^upstream-ui:[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+:v[1-9][0-9]*$/
const REVISION = /^[0-9a-f]{40}$/
const BLOB = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

function normalizedPath(value) {
  return String(value).split(path.sep).join('/')
}

function sortRows(left, right) {
  return left.path.localeCompare(right.path) || left.status.localeCompare(right.status)
}

function sourceFile(value, label) {
  if (!value || !BLOB.test(value.blobId ?? '') || !SHA256.test(value.sha256 ?? '')) {
    throw new Error(`${label} source evidence is missing blobId or sha256`)
  }
  return { blobId: value.blobId, sha256: value.sha256 }
}

function sourceFileFromMap(files, filePath, label) {
  const value = files instanceof Map ? files.get(filePath) : files?.[filePath]
  return sourceFile(value, `${label} ${filePath}`)
}

function blankDeltaRow(change, baseFiles, targetFiles) {
  const status = change.status
  const filePath = normalizedPath(change.path)
  const previousPath = change.previousPath ? normalizedPath(change.previousPath) : null
  if (!CHANGE_STATUSES.has(status)) throw new Error(`unsupported source change status: ${status}`)
  if (!filePath || filePath.startsWith('/') || filePath.includes('..')) throw new Error(`invalid source path: ${filePath}`)
  if (status === 'R' && !previousPath) throw new Error(`rename ${filePath} requires previousPath`)
  if (status !== 'R' && previousPath !== null) throw new Error(`${status} ${filePath} must not define previousPath`)

  const needsBase = status === 'M' || status === 'D' || status === 'R'
  const needsTarget = status === 'A' || status === 'M' || status === 'R'
  return {
    status,
    previousPath,
    path: filePath,
    base: needsBase ? sourceFileFromMap(baseFiles, previousPath ?? filePath, 'base') : null,
    target: needsTarget ? sourceFileFromMap(targetFiles, filePath, 'target') : null,
    classification: 'pending',
    sourceKey: null,
    legacyContractIds: [],
    symbol: null,
    interaction: null,
    transport: 'none',
    realtime: null,
    motion: null,
  }
}

export function buildDeltaLedger({
  baseRevision,
  targetRevision,
  sourceRepository = DEFAULT_SOURCE_REPOSITORY,
  scope = DEFAULT_SCOPE,
  changes,
  baseFiles,
  targetFiles,
}) {
  if (!REVISION.test(baseRevision ?? '')) throw new Error('baseRevision must be a 40-character lowercase hexadecimal revision')
  if (!REVISION.test(targetRevision ?? '')) throw new Error('targetRevision must be a 40-character lowercase hexadecimal revision')
  if (!Array.isArray(changes)) throw new Error('changes must be an array')
  const files = changes.map((change) => blankDeltaRow(change, baseFiles, targetFiles)).sort(sortRows)
  const statusCounts = Object.fromEntries([...CHANGE_STATUSES].map((status) => [status, files.filter((row) => row.status === status).length]))
  const ledger = {
    schemaVersion: 1,
    sourceRepository,
    baseRevision,
    targetRevision,
    scope: [...scope].map(normalizedPath),
    fileCount: files.length,
    pendingCount: files.length,
    statusCounts,
    files,
  }
  const errors = validateDeltaLedger(ledger)
  if (errors.length > 0) throw new Error(`source delta ledger validation failed:\n${errors.join('\n')}`)
  return ledger
}

function validateEvidence(value, label, errors) {
  if (!value || typeof value !== 'object') {
    errors.push(`${label}: source evidence is required`)
    return
  }
  if (!BLOB.test(value.blobId ?? '')) errors.push(`${label}: blobId must be a 40-character lowercase hexadecimal value`)
  if (!SHA256.test(value.sha256 ?? '')) errors.push(`${label}: sha256 must be a 64-character lowercase hexadecimal value`)
}

function validatePath(value, label, errors) {
  if (!value || value.startsWith('/') || value.includes('..') || value !== normalizedPath(value)) {
    errors.push(`${label}: path must be a normalized relative path`)
  }
}

function validateClassifiedRow(row, label, errors) {
  if (!SOURCE_KEY.test(row.sourceKey ?? '')) errors.push(`${label}: classified row requires immutable sourceKey`)
  if (typeof row.symbol !== 'string' || !row.symbol.trim()) errors.push(`${label}: classified row requires source symbol`)
  if (typeof row.interaction !== 'string' || !row.interaction.trim()) errors.push(`${label}: classified row requires interaction`)
  if (!Array.isArray(row.legacyContractIds) || row.legacyContractIds.some((id) => !/^reference\.feature\.\d{3}$/.test(id))) {
    errors.push(`${label}: legacyContractIds must contain only reference feature aliases`)
  }
}

function validateRealtime(row, label, errors) {
  if (!TRANSPORTS.has(row.transport)) {
    errors.push(`${label}: transport is not supported`)
    return
  }
  if (row.transport === 'none') {
    if (row.realtime !== null) errors.push(`${label}: none transport requires realtime null`)
    return
  }
  if (!row.realtime || typeof row.realtime !== 'object') {
    errors.push(`${label}: ${row.transport} transport requires realtime policy`)
    return
  }
  for (const key of ['resume', 'backpressure', 'merge']) {
    if (typeof row.realtime[key] !== 'string' || !row.realtime[key].trim()) {
      errors.push(`${label}: realtime.${key} is required`)
    }
  }
}

function validateMotion(row, label, errors) {
  if (row.motion === null) return
  if (!row.motion || typeof row.motion !== 'object') {
    errors.push(`${label}: motion must be null or an object`)
    return
  }
  if (typeof row.motion.reducedMotion !== 'string' || !row.motion.reducedMotion.trim()) {
    errors.push(`${label}: motion.reducedMotion is required`)
  }
  if (!Array.isArray(row.motion.evidence) || row.motion.evidence.length === 0) {
    errors.push(`${label}: motion.evidence requires at least one item`)
  }
}

export function validateDeltaLedger(ledger) {
  const errors = []
  if (!ledger || typeof ledger !== 'object') return ['ledger must be an object']
  if (ledger.schemaVersion !== 1) errors.push('schemaVersion must equal 1')
  if (!REVISION.test(ledger.baseRevision ?? '')) errors.push('baseRevision must be a 40-character lowercase hexadecimal revision')
  if (!REVISION.test(ledger.targetRevision ?? '')) errors.push('targetRevision must be a 40-character lowercase hexadecimal revision')
  if (typeof ledger.sourceRepository !== 'string' || !ledger.sourceRepository.startsWith('https://')) errors.push('sourceRepository must be an HTTPS URL')
  if (!Array.isArray(ledger.scope) || ledger.scope.length === 0) errors.push('scope must be a non-empty array')
  if (!Array.isArray(ledger.files)) return [...errors, 'files must be an array']
  if (ledger.fileCount !== ledger.files.length) errors.push('fileCount must equal files.length')
  const pendingCount = ledger.files.filter((row) => row.classification === 'pending').length
  if (ledger.pendingCount !== pendingCount) errors.push('pendingCount must equal pending files')
  if (!ledger.statusCounts || typeof ledger.statusCounts !== 'object' || Array.isArray(ledger.statusCounts)) {
    errors.push('statusCounts must be an object')
  } else {
    for (const status of CHANGE_STATUSES) {
      const actual = ledger.files.filter((row) => row.status === status).length
      if (ledger.statusCounts[status] !== actual) {
        errors.push(`statusCounts.${status} must equal ${actual}`)
      }
    }
    for (const status of Object.keys(ledger.statusCounts)) {
      if (!CHANGE_STATUSES.has(status)) errors.push(`statusCounts.${status} is not supported`)
    }
  }

  const seenPaths = new Set()
  for (const row of ledger.files) {
    const label = String(row?.path ?? '<unknown>')
    validatePath(row?.path, label, errors)
    const identity = `${row?.status}:${row?.previousPath ?? ''}:${row?.path ?? ''}`
    if (seenPaths.has(identity)) errors.push(`${label}: change row is duplicated`)
    seenPaths.add(identity)
    if (!CHANGE_STATUSES.has(row?.status)) {
      errors.push(`${label}: status is not supported`)
      continue
    }
    const needsBase = row.status === 'M' || row.status === 'D' || row.status === 'R'
    const needsTarget = row.status === 'A' || row.status === 'M' || row.status === 'R'
    if (needsBase) validateEvidence(row.base, `${label}: base`, errors)
    else if (row.base !== null) errors.push(`${label}: ${row.status} row requires base null`)
    if (needsTarget) validateEvidence(row.target, `${label}: target`, errors)
    else if (row.target !== null) errors.push(`${label}: ${row.status} row requires target null`)
    if (row.status === 'R') validatePath(row.previousPath, `${label}: previous`, errors)
    else if (row.previousPath !== null) errors.push(`${label}: ${row.status} row requires previousPath null`)
    if (!CLASSIFICATIONS.has(row.classification)) {
      errors.push(`${label}: classification is not supported`)
      continue
    }
    if (row.classification === 'pending') {
      if (row.sourceKey !== null || row.symbol !== null || row.interaction !== null || row.transport !== 'none' || row.realtime !== null || row.motion !== null || (row.legacyContractIds?.length ?? 0) !== 0) {
        errors.push(`${label}: pending row must not claim source classification evidence`)
      }
      continue
    }
    validateClassifiedRow(row, label, errors)
    validateRealtime(row, label, errors)
    validateMotion(row, label, errors)
  }
  return errors
}

export function assertDeltaLedgerClassified(ledger) {
  const errors = validateDeltaLedger(ledger)
  if (errors.length > 0) throw new Error(`source delta ledger validation failed:\n${errors.join('\n')}`)
  const pending = ledger.files.filter((row) => row.classification === 'pending')
  if (pending.length > 0) {
    throw new Error(`source delta release gate blocked: ${pending.length}개 pending source delta 항목이 남아 있습니다`)
  }
}

export function declaredInventoryRevision(markdown) {
  const match = String(markdown).match(/\bcommit\s+`([0-9a-f]{40})`/)
  if (!match) throw new Error('inventory declared source revision is missing')
  return match[1]
}

export function assertInventoryRevisionMatchesTarget(markdown, targetRevision) {
  const declared = declaredInventoryRevision(markdown)
  if (declared !== targetRevision) {
    throw new Error(`inventory source revision ${declared} does not match target ${targetRevision}; latest-source parity is not rebased`)
  }
  return declared
}

function runGit(repository, args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', repository, ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout))
        return
      }
      reject(new Error(`git ${args.join(' ')} failed (${code}): ${Buffer.concat(stderr).toString('utf8').trim()}`))
    })
    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

function parseNameStatus(buffer) {
  const values = buffer.toString('utf8').split('\0').filter(Boolean)
  const changes = []
  for (let index = 0; index < values.length;) {
    const rawStatus = values[index++]
    const status = rawStatus[0]
    if (status === 'R') {
      const previousPath = values[index++]
      const filePath = values[index++]
      changes.push({ status, previousPath, path: filePath })
      continue
    }
    if (!CHANGE_STATUSES.has(status)) throw new Error(`unsupported source change status from git: ${rawStatus}`)
    changes.push({ status, path: values[index++] })
  }
  return changes
}

function parseTree(buffer) {
  const files = new Map()
  for (const value of buffer.toString('utf8').split('\0').filter(Boolean)) {
    const separator = value.indexOf('\t')
    const metadata = value.slice(0, separator).split(' ')
    const filePath = value.slice(separator + 1)
    if (metadata[1] === 'blob') files.set(filePath, metadata[2])
  }
  return files
}

async function readBlobEvidence(repository, blobIds) {
  const unique = [...new Set(blobIds)].sort()
  if (unique.length === 0) return new Map()
  const output = await runGit(repository, ['cat-file', '--batch'], Buffer.from(`${unique.join('\n')}\n`))
  const evidence = new Map()
  let offset = 0
  while (offset < output.length) {
    const newline = output.indexOf(0x0a, offset)
    if (newline < 0) throw new Error('git cat-file batch response has an incomplete header')
    const header = output.subarray(offset, newline).toString('utf8').split(' ')
    const [blobId, type, rawSize] = header
    const size = Number(rawSize)
    offset = newline + 1
    if (type !== 'blob' || !Number.isInteger(size) || size < 0) throw new Error(`git cat-file batch response is not a blob: ${header.join(' ')}`)
    const content = output.subarray(offset, offset + size)
    if (content.length !== size) throw new Error(`git cat-file batch response truncated blob ${blobId}`)
    evidence.set(blobId, { blobId, sha256: createHash('sha256').update(content).digest('hex') })
    offset += size + 1
  }
  return evidence
}

export async function collectGitDelta({
  repository = DEFAULT_REPOSITORY,
  baseRevision = DEFAULT_BASE_REVISION,
  targetRevision = DEFAULT_TARGET_REVISION,
  scope = DEFAULT_SCOPE,
} = {}) {
  const [statusOutput, baseTreeOutput, targetTreeOutput] = await Promise.all([
    runGit(repository, ['diff', '--name-status', '-z', '-M', baseRevision, targetRevision, '--', ...scope]),
    runGit(repository, ['ls-tree', '-r', '-z', baseRevision, '--', ...scope]),
    runGit(repository, ['ls-tree', '-r', '-z', targetRevision, '--', ...scope]),
  ])
  const changes = parseNameStatus(statusOutput)
  const baseBlobs = parseTree(baseTreeOutput)
  const targetBlobs = parseTree(targetTreeOutput)
  const blobEvidence = await readBlobEvidence(repository, [...baseBlobs.values(), ...targetBlobs.values()])
  const baseFiles = new Map([...baseBlobs].map(([filePath, blobId]) => [filePath, blobEvidence.get(blobId)]))
  const targetFiles = new Map([...targetBlobs].map(([filePath, blobId]) => [filePath, blobEvidence.get(blobId)]))
  return { changes, baseFiles, targetFiles }
}

export async function createDeltaLedger(options = {}) {
  const source = await collectGitDelta(options)
  return buildDeltaLedger({ ...options, ...source })
}

function parseArguments(argv) {
  const values = {
    repository: DEFAULT_REPOSITORY,
    baseRevision: DEFAULT_BASE_REVISION,
    targetRevision: DEFAULT_TARGET_REVISION,
    inventory: DEFAULT_INVENTORY,
    output: DEFAULT_OUTPUT,
    check: false,
    requireClassified: false,
    requireRebased: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--check') {
      values.check = true
      continue
    }
    if (flag === '--require-classified') {
      values.requireClassified = true
      continue
    }
    if (flag === '--require-rebased') {
      values.requireRebased = true
      continue
    }
    if (!['--repository', '--base', '--target', '--inventory', '--output'].includes(flag) || !argv[index + 1]) {
      throw new Error(`unsupported argument: ${flag}`)
    }
    const value = argv[index + 1]
    if (flag === '--base') values.baseRevision = value
    else if (flag === '--target') values.targetRevision = value
    else values[flag.slice(2)] = path.resolve(value)
    index += 1
  }
  return values
}

export async function writeDeltaLedger({
  repository,
  baseRevision,
  targetRevision,
  inventory,
  output,
  check = false,
  requireClassified = false,
  requireRebased = false,
}) {
  const ledger = await createDeltaLedger({ repository, baseRevision, targetRevision })
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`
  if (check) {
    const current = await readFile(output, 'utf8').catch(() => null)
    if (current !== serialized) throw new Error(`source UI delta ledger does not match immutable git evidence: ${output}`)
  } else {
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, serialized, 'utf8')
  }
  if (requireRebased) {
    const markdown = await readFile(inventory, 'utf8')
    assertInventoryRevisionMatchesTarget(markdown, targetRevision)
  }
  if (requireClassified) assertDeltaLedgerClassified(ledger)
  return ledger
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const ledger = await writeDeltaLedger(options)
  process.stdout.write(`source UI delta ledger complete: ${ledger.fileCount} files, ${ledger.pendingCount} pending\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
