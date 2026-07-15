import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import * as sourceDeltaLedger from './reference-source-delta-ledger.mjs'
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

function classifiedInteraction({
  sourceKey = 'upstream-ui:timeline:retained-history:scrubber-lens:v1',
  symbol = 'TimelineStrip',
  interaction = 'lens drag and keyboard zoom preserve the selected time window',
  legacyContractIds = [],
  transport = 'none',
  realtime = null,
  motion = null,
  opsiaPort = {
    destinations: ['frontend/src/pages/timeline/TimelineSurface.tsx'],
    requiredBackendContracts: ['packages.contracts.timeline.models'],
    plannedTestIds: ['timeline.fixture.classified-interaction'],
    state: 'in_progress',
    blockedReason: null,
    rationale: 'fixture mapping for source-ledger validation',
  },
} = {}) {
  return {
    sourceKey,
    symbol,
    interaction,
    legacyContractIds,
    transport,
    realtime,
    motion,
    opsiaPort,
  }
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
      interactions: row.interactions,
    })),
    [
      {
        status: 'D',
        previousPath: null,
        path: 'packages/k8s-ui/src/components/OldControl.tsx',
        target: null,
        classification: 'pending',
        interactions: [],
      },
      {
        status: 'M',
        previousPath: null,
        path: 'web/src/App.tsx',
        target: sourceFile(BLOB_B, SHA_B),
        classification: 'pending',
        interactions: [],
      },
      {
        status: 'A',
        previousPath: null,
        path: 'web/src/components/NewSurface.tsx',
        target: sourceFile(BLOB_B, SHA_B),
        classification: 'pending',
        interactions: [],
      },
      {
        status: 'R',
        previousPath: 'web/src/OldPanel.tsx',
        path: 'web/src/NewPanel.tsx',
        target: sourceFile(BLOB_B, SHA_B),
        classification: 'pending',
        interactions: [],
      },
    ],
  )
  assert.equal(ledger.fileCount, 4)
  assert.equal(ledger.pendingCount, 4)
  assert.deepEqual(validateDeltaLedger(ledger), [])
  assert.throws(() => assertDeltaLedgerClassified(ledger), /4개 pending/)
})

test('createDeltaLedger의 부분 옵션은 승인된 base·target·scope 기본값을 보존한다', () => {
  const options = sourceDeltaLedger.resolveDeltaLedgerOptions({ repository: '/tmp/source-delta-fixture' })

  assert.deepEqual(
    {
      repository: options.repository,
      baseRevision: options.baseRevision,
      targetRevision: options.targetRevision,
      scope: options.scope,
    },
    {
      repository: '/tmp/source-delta-fixture',
      baseRevision: BASE,
      targetRevision: TARGET,
      scope: ['web', 'packages/k8s-ui'],
    },
  )
})

test('분류 완료 파일은 복수의 immutable source interaction과 transport별 realtime·motion reduced-motion 증거를 요구한다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [{ status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' }],
    baseFiles: new Map(),
    targetFiles: new Map([['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)]]),
  })
  const [row] = ledger.files
  row.classification = 'classified'
  row.interactions = [
    classifiedInteraction({
      sourceKey: 'upstream-ui:timeline:retained-history:scrubber-lens:v1',
      transport: 'ndjson',
      realtime: {
        resume: 'not-supported',
        backpressure: 'bounded recent-window fetch',
        merge: 'last event wins by event id',
      },
      motion: {
        reducedMotion: 'no animation; the selected range state remains visible',
        evidence: ['web/src/index.css @media (prefers-reduced-motion: reduce)'],
      },
    }),
    classifiedInteraction({
      sourceKey: 'upstream-ui:timeline:live-events:stream-merge:v1',
      interaction: 'live event invalidation keeps the selected time range stable',
      transport: 'sse',
      realtime: {
        resume: 'last-event-id',
        backpressure: 'coalesce to the latest event per resource',
        merge: 'append in event-time order by event id',
      },
    }),
  ]
  ledger.pendingCount = 0

  assert.deepEqual(validateDeltaLedger(ledger), [])

  row.interactions[0].realtime = null
  row.interactions[0].motion = { reducedMotion: '', evidence: [] }
  assert.deepEqual(validateDeltaLedger(ledger), [
    'web/src/components/timeline/TimelineStrip.tsx: interactions[0]: ndjson transport requires realtime policy',
    'web/src/components/timeline/TimelineStrip.tsx: interactions[0]: motion.reducedMotion is required',
    'web/src/components/timeline/TimelineStrip.tsx: interactions[0]: motion.evidence requires at least one item',
  ])
})

test('분류 완료 자산은 noninteractive semantic interaction을 명시하고 sourceKey는 모든 파일에서 중복될 수 없다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [
      { status: 'A', path: 'web/src/assets/argocd.svg' },
      { status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' },
    ],
    baseFiles: new Map(),
    targetFiles: new Map([
      ['web/src/assets/argocd.svg', sourceFile(BLOB_B, SHA_B)],
      ['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)],
    ]),
  })
  const [asset, component] = ledger.files
  asset.classification = 'classified'
  asset.interactions = [
    classifiedInteraction({
      sourceKey: 'upstream-ui:gitops:argocd-logo:static-asset:v1',
      symbol: 'argocd.svg',
      interaction: 'noninteractive asset: GitOps provider logo',
    }),
  ]
  component.classification = 'classified'
  component.interactions = [
    classifiedInteraction({
      sourceKey: 'upstream-ui:timeline:retained-history:scrubber-lens:v1',
    }),
  ]
  ledger.pendingCount = 0

  assert.deepEqual(validateDeltaLedger(ledger), [])

  component.interactions[0].sourceKey = asset.interactions[0].sourceKey
  assert.deepEqual(validateDeltaLedger(ledger), [
    'web/src/components/timeline/TimelineStrip.tsx: interactions[0]: sourceKey is duplicated',
  ])
})

test('분류 interaction은 알려진 legacy alias만 한 번씩 쓰고 motion locator는 비어 있을 수 없지만 alias 없는 최신 interaction은 허용한다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [{ status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' }],
    baseFiles: new Map(),
    targetFiles: new Map([['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)]]),
  })
  const [row] = ledger.files
  row.classification = 'classified'
  row.interactions = [
    classifiedInteraction({ legacyContractIds: ['reference.feature.001'] }),
    classifiedInteraction({
      sourceKey: 'upstream-ui:timeline:keyboard-focus:range-jump:v1',
      interaction: 'keyboard range jump preserves focus and selected time window',
      legacyContractIds: [],
      motion: {
        reducedMotion: 'selection changes without animated movement',
        evidence: ['web/src/index.css .timeline-range'],
      },
    }),
  ]
  ledger.pendingCount = 0
  const validationContext = { knownLegacyContractIds: new Set(['reference.feature.001']) }

  assert.deepEqual(validateDeltaLedger(ledger, validationContext), [])

  row.interactions[1].legacyContractIds = ['reference.feature.001', 'reference.feature.999']
  row.interactions[1].motion.evidence = ['']
  assert.deepEqual(validateDeltaLedger(ledger, validationContext), [
    'web/src/components/timeline/TimelineStrip.tsx: interactions[1]: legacyContractId is duplicated: reference.feature.001',
    'web/src/components/timeline/TimelineStrip.tsx: interactions[1]: legacyContractId is unknown: reference.feature.999',
    'web/src/components/timeline/TimelineStrip.tsx: interactions[1]: motion.evidence[0] must be a non-empty locator',
  ])
})

test('pending 파일은 interaction 증거를 전혀 주장할 수 없고 file-level legacy 필드는 허용하지 않는다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [{ status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' }],
    baseFiles: new Map(),
    targetFiles: new Map([['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)]]),
  })
  const [row] = ledger.files
  row.interactions = [classifiedInteraction()]
  row.sourceKey = 'upstream-ui:timeline:retained-history:scrubber-lens:v1'

  assert.deepEqual(validateDeltaLedger(ledger), [
    'web/src/components/timeline/TimelineStrip.tsx: file-level interaction evidence must use interactions[]',
    'web/src/components/timeline/TimelineStrip.tsx: pending row must not claim interaction evidence',
  ])
})

test('분류 interaction은 현재 Opsia 목적지, 선언된 테스트, backend 계약, 상태별 사유를 빠짐없이 요구한다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [{ status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' }],
    baseFiles: new Map(),
    targetFiles: new Map([['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)]]),
  })
  const [row] = ledger.files
  row.classification = 'classified'
  row.interactions = [
    classifiedInteraction({
      opsiaPort: {
        destinations: [],
        requiredBackendContracts: [],
        plannedTestIds: [],
        state: 'blocked',
        blockedReason: null,
        rationale: '',
      },
    }),
  ]
  row.pendingCount = 0
  ledger.pendingCount = 0

  const errors = validateDeltaLedger(ledger)
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: opsiaPort.destinations: must contain at least 1 item'))
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: opsiaPort.requiredBackendContracts: must contain at least 1 item'))
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: opsiaPort.plannedTestIds: must contain at least 1 item'))
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: blocked opsiaPort requires blockedReason'))
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: opsiaPort.rationale is required'))
})

test('분류 interaction은 등록되지 않은 Opsia 목적지와 테스트 ID를 check context에서 거부한다', () => {
  const ledger = buildDeltaLedger({
    baseRevision: BASE,
    targetRevision: TARGET,
    changes: [{ status: 'A', path: 'web/src/components/timeline/TimelineStrip.tsx' }],
    baseFiles: new Map(),
    targetFiles: new Map([['web/src/components/timeline/TimelineStrip.tsx', sourceFile(BLOB_B, SHA_B)]]),
  })
  const [row] = ledger.files
  row.classification = 'classified'
  row.interactions = [classifiedInteraction()]
  ledger.pendingCount = 0

  const errors = validateDeltaLedger(ledger, {
    knownOpsiaDestinations: new Set(),
    knownPlannedTestIds: new Set(),
  })
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: opsiaPort.destinations[0]: is not a known Opsia destination'))
  assert.ok(errors.includes('web/src/components/timeline/TimelineStrip.tsx: interactions[0]: opsiaPort.plannedTestIds[0]: is not declared by classification input'))
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

test('check는 분류 interaction을 보존하면서 feature ledger에 없는 legacy alias를 출하 전에 거부한다', async () => {
  const fixture = await createDeltaGitFixture()
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reference-ui-delta-alias-check-'))
  const output = path.join(directory, 'reference-ui-delta-ledger.json')
  const featureLedger = path.join(directory, 'reference-feature-ledger.json')
  try {
    await writeDeltaLedger({ ...fixture, output })
    const classified = JSON.parse(await readFile(output, 'utf8'))
    classified.files.forEach((row, index) => {
      row.classification = 'classified'
      row.interactions = [
        classifiedInteraction({
          sourceKey: `upstream-ui:fixture:row-${index}:classified:v1`,
          legacyContractIds: index === 0 ? ['reference.feature.999'] : [],
        }),
      ]
    })
    classified.pendingCount = 0
    await writeFile(output, `${JSON.stringify(classified, null, 2)}\n`, 'utf8')
    await writeFile(featureLedger, JSON.stringify({ features: [{ contractId: 'reference.feature.001' }] }), 'utf8')

    await assert.rejects(
      () => writeDeltaLedger({ ...fixture, output, featureLedger, check: true, requireClassified: true }),
      /legacyContractId is unknown: reference\.feature\.999/,
    )

    classified.files[0].interactions[0].legacyContractIds = []
    await writeFile(output, `${JSON.stringify(classified, null, 2)}\n`, 'utf8')
    await assert.doesNotReject(
      () => writeDeltaLedger({ ...fixture, output, featureLedger, check: true, requireClassified: true }),
    )
  } finally {
    await rm(fixture.repository, { recursive: true, force: true })
    await rm(directory, { recursive: true, force: true })
  }
})

test('동결된 최신 UI delta ledger는 Timeline 분류만 생성 입력에서 반영하고 나머지 pending을 출하 완료로 위장하지 않는다', async () => {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const ledgerPath = path.join(scriptDirectory, '..', 'docs', 'migration', 'reference-ui-delta-ledger.json')
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'))

  assert.equal(ledger.baseRevision, BASE)
  assert.equal(ledger.targetRevision, TARGET)
  assert.equal(ledger.schemaVersion, 3)
  assert.equal(ledger.fileCount, 276)
  assert.equal(ledger.pendingCount, 249)
  assert.deepEqual(validateDeltaLedger(ledger), [])
  assert.throws(() => assertDeltaLedgerClassified(ledger), /249개 pending/)
})
