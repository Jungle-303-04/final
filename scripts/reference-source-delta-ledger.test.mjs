import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertDeltaLedgerClassified,
  assertInventoryRevisionMatchesTarget,
  buildDeltaLedger,
  validateDeltaLedger,
} from './reference-source-delta-ledger.mjs'

const BASE = '3ff2b1095151c690bf536e8e6ca685c2703fcd70'
const TARGET = 'cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc'
const BLOB_A = 'a'.repeat(40)
const BLOB_B = 'b'.repeat(40)
const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)

function sourceFile(blobId, sha256) {
  return { blobId, sha256 }
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
        status: 'R',
        previousPath: 'web/src/OldPanel.tsx',
        path: 'web/src/NewPanel.tsx',
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
