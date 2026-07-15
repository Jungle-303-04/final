import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  assertDeltaLedgerClassified,
  assertInventoryRevisionMatchesTarget,
  buildDeltaLedger,
  createDeltaLedger,
  validateDeltaLedger,
  writeDeltaLedger,
} from './reference-source-delta-ledger.mjs'

const BASE = '3ff2b1095151c690bf536e8e6ca685c2703fcd70'
const TARGET = 'cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc'
const BLOB_A = 'a'.repeat(40)
const BLOB_B = 'b'.repeat(40)
const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const execFile = promisify(execFileCallback)

function sourceFile(blobId, sha256) {
  return { blobId, sha256 }
}

async function git(repository, ...args) {
  await execFile('git', ['-C', repository, ...args])
}

async function writeFixtureFile(repository, relativePath, content) {
  const destination = path.join(repository, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, content, 'utf8')
}

async function createDeltaGitFixture() {
  const repository = await mkdtemp(path.join(os.tmpdir(), 'reference-ui-delta-fixture-'))
  await execFile('git', ['init', '--quiet', repository])
  await git(repository, 'config', 'user.name', 'Reference fixture')
  await git(repository, 'config', 'user.email', 'reference-fixture@example.invalid')
  await writeFixtureFile(repository, 'web/src/App.tsx', 'export const app = "base"\n')
  await writeFixtureFile(repository, 'web/src/Delete.tsx', 'export const deleted = true\n')
  await writeFixtureFile(repository, 'web/src/OldPanel.tsx', 'export const panel = true\n')
  await git(repository, 'add', '.')
  await git(repository, 'commit', '--quiet', '-m', 'base')
  const { stdout: baseOutput } = await execFile('git', ['-C', repository, 'rev-parse', 'HEAD'])

  await writeFixtureFile(repository, 'web/src/App.tsx', 'export const app = "target"\n')
  await git(repository, 'rm', '--quiet', 'web/src/Delete.tsx')
  await git(repository, 'mv', 'web/src/OldPanel.tsx', 'web/src/NewPanel.tsx')
  await writeFixtureFile(repository, 'packages/k8s-ui/src/NewSurface.tsx', 'export const surface = true\n')
  await git(repository, 'add', '.')
  await git(repository, 'commit', '--quiet', '-m', 'target')
  const { stdout: targetOutput } = await execFile('git', ['-C', repository, 'rev-parse', 'HEAD'])

  return {
    repository,
    baseRevision: baseOutput.trim(),
    targetRevision: targetOutput.trim(),
  }
}

test('UI delta의 A/M/D/R 경로는 target 증거와 명시적 pending 상태로 결정적으로 생성된다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [
      { status: 'A', path: 'web/src/components/NewSurface.tsx' },
      { status: 'M', path: 'web/src/App.tsx' },
      { status: 'D', path: 'packages/k8s-ui/src/components/OldControl.tsx' },
      { status: 'R', previousPath: 'web/src/OldPanel.tsx', path: 'web/src/NewPanel.tsx' },
    ],
    baseFiles: new Map([
      ['web/src/App.tsx', sourceFile(BLOB_A, SHA_A)],
      ['packages/k8s-ui/src/components/OldControl.tsx', sourceFile(BLOB_A, SHA_A)],
      ['web/src/OldPanel.tsx', sourceFile(BLOB_A, SHA_A)],
    ]),
    targetFiles: new Map([
      ['web/src/components/NewSurface.tsx', sourceFile(BLOB_B, SHA_B)],
      ['web/src/App.tsx', sourceFile(BLOB_B, SHA_B)],
      ['web/src/NewPanel.tsx', sourceFile(BLOB_B, SHA_B)],
    ]),
  })

  assert.deepEqual(
    ledger.files.map((row) => ({
      status: row.status,
      previousPath: row.previousPath,
      path: row.path,
      target: row.target,
      classification: row.classification,
    })),
    [
      {
        status: 'D',
        previousPath: null,
        path: 'packages/k8s-ui/src/components/OldControl.tsx',
        target: null,
        classification: 'pending',
      },
      {
        status: 'M',
        previousPath: null,
        path: 'web/src/App.tsx',
        target: sourceFile(BLOB_B, SHA_B),
        classification: 'pending',
      },
      {
        status: 'A',
        previousPath: null,
        path: 'web/src/components/NewSurface.tsx',
        target: sourceFile(BLOB_B, SHA_B),
        classification: 'pending',
      },
      {
        status: 'R',
        previousPath: 'web/src/OldPanel.tsx',
        path: 'web/src/NewPanel.tsx',
        target: sourceFile(BLOB_B, SHA_B),
        classification: 'pending',
      },
    ],
  )
  assert.equal(ledger.fileCount, 4)
  assert.equal(ledger.pendingCount, 4)
  assert.deepEqual(validateDeltaLedger(ledger), [])
  assert.throws(() => assertDeltaLedgerClassified(ledger), /4개 pending/)
})

test('분류 완료 행은 immutable sourceKey, transport별 realtime, motion reduced-motion 증거를 모두 요구한다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [{ status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' }],
    baseFiles: new Map(),
    targetFiles: new Map([['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)]]),
  })
  const [row] = ledger.files
  row.classification = 'classified'
  row.sourceKey = 'upstream-ui:timeline:retained-history:scrubber-lens:v1'
  row.symbol = 'TimelineStrip'
  row.interaction = 'lens drag and keyboard zoom preserve the selected time window'
  row.transport = 'ndjson'
  row.realtime = {
    resume: 'not-supported',
    backpressure: 'bounded recent-window fetch',
    merge: 'last event wins by event id',
  }
  row.motion = {
    reducedMotion: 'no animation; the selected range state remains visible',
    evidence: ['web/src/index.css @media (prefers-reduced-motion: reduce)'],
  }
  ledger.pendingCount = 0

  assert.deepEqual(validateDeltaLedger(ledger), [])

  row.realtime = null
  row.motion = { reducedMotion: '', evidence: [] }
  assert.deepEqual(validateDeltaLedger(ledger), [
    'web/src/components/timeline/TimelineStrip.tsx: ndjson transport requires realtime policy',
    'web/src/components/timeline/TimelineStrip.tsx: motion.reducedMotion is required',
    'web/src/components/timeline/TimelineStrip.tsx: motion.evidence requires at least one item',
  ])
})

test('inventory 선언 revision과 target revision 불일치는 rebaseline gate에서 숨기지 않는다', () => {
  const oldInventory = '| source | tag `v1.8.1`, commit `3ff2b1095151c690bf536e8e6ca685c2703fcd70` | evidence |'
  assert.throws(
    () => assertInventoryRevisionMatchesTarget(oldInventory, TARGET),
    /inventory source revision 3ff2b1095151c690bf536e8e6ca685c2703fcd70 does not match target/, 
  )
  assert.doesNotThrow(() => assertInventoryRevisionMatchesTarget(oldInventory, BASE))
})

test('로컬 Git fixture도 A/M/D/R blob 증거와 check·출하 차단 조건을 네트워크 없이 검증한다', async () => {
  const fixture = await createDeltaGitFixture()
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reference-ui-delta-output-'))
  const output = path.join(directory, 'reference-ui-delta-ledger.json')
  const inventory = path.join(directory, 'inventory.md')
  try {
    const ledger = await createDeltaLedger(fixture)
    assert.deepEqual(
      ledger.files.map(({ status, previousPath, path: filePath, base, target }) => ({
        status,
        previousPath,
        path: filePath,
        base: base === null ? null : base.sha256.length,
        target: target === null ? null : target.sha256.length,
      })),
      [
        { status: 'A', previousPath: null, path: 'packages/k8s-ui/src/NewSurface.tsx', base: null, target: 64 },
        { status: 'M', previousPath: null, path: 'web/src/App.tsx', base: 64, target: 64 },
        { status: 'D', previousPath: null, path: 'web/src/Delete.tsx', base: 64, target: null },
        { status: 'R', previousPath: 'web/src/OldPanel.tsx', path: 'web/src/NewPanel.tsx', base: 64, target: 64 },
      ],
    )
    assert.deepEqual(ledger.statusCounts, { A: 1, M: 1, D: 1, R: 1 })

    await writeDeltaLedger({ ...fixture, output, inventory })
    await assert.doesNotReject(() => writeDeltaLedger({ ...fixture, output, inventory, check: true }))
    await assert.rejects(
      () => writeDeltaLedger({ ...fixture, output, inventory, check: true, requireClassified: true }),
      /4개 pending source delta 항목/,
    )

    await writeFile(inventory, `| source | commit \`${fixture.baseRevision}\` | evidence |\n`, 'utf8')
    await assert.rejects(
      () => writeDeltaLedger({ ...fixture, output, inventory, check: true, requireRebased: true }),
      /does not match target/,
    )
  } finally {
    await rm(fixture.repository, { recursive: true, force: true })
    await rm(directory, { recursive: true, force: true })
  }
})

test('동결된 최신 UI delta ledger는 276개 경로를 보존하고 pending을 출하 완료로 위장하지 않는다', async () => {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const ledgerPath = path.join(scriptDirectory, '..', 'docs', 'migration', 'reference-ui-delta-ledger.json')
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))

  assert.equal(ledger.baseRevision, BASE)
  assert.equal(ledger.targetRevision, TARGET)
  assert.equal(ledger.fileCount, 276)
  assert.equal(ledger.pendingCount, 276)
  assert.deepEqual(validateDeltaLedger(ledger), [])
  assert.throws(() => assertDeltaLedgerClassified(ledger), /276개 pending/)
})
