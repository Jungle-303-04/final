import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLedgerRows, validateLedger } from './reference-ledger.mjs'

const REVISION = 'cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc'
const HASH = 'a'.repeat(64)

test('원본의 모든 파일을 결정적인 이식 상태와 검증 대상으로 분류한다', () => {
  const rows = buildLedgerRows(
    [
      { path: 'internal/server/routes.go', size: 12, sha256: HASH },
      { path: 'web/src/App.tsx', size: 34, sha256: HASH },
      { path: 'cmd/desktop/main.go', size: 56, sha256: HASH },
      { path: 'README.md', size: 78, sha256: HASH },
      { path: 'examples/demo.yaml', size: 90, sha256: HASH },
    ],
    REVISION,
  )

  assert.deepEqual(
    rows.map(({ path, disposition, target, verification }) => ({ path, disposition, target, verification })),
    [
      {
        path: 'README.md',
        disposition: 'build/docs-only',
        target: 'docs/migration',
        verification: 'scripts/reference-ledger.test.mjs',
      },
      {
        path: 'cmd/desktop/main.go',
        disposition: 'desktop-port',
        target: 'desktop',
        verification: 'desktop/src-tauri/tests/reference_parity.rs',
      },
      {
        path: 'examples/demo.yaml',
        disposition: 'frozen',
        target: null,
        verification: 'scripts/reference-ledger.test.mjs',
      },
      {
        path: 'internal/server/routes.go',
        disposition: 'python-port',
        target: 'src',
        verification: 'tests/contracts/test_reference_parity.py',
      },
      {
        path: 'web/src/App.tsx',
        disposition: 'frontend-port',
        target: 'frontend/src',
        verification: 'frontend/src/reference/referenceParity.test.ts',
      },
    ],
  )
})

test('누락된 해시와 이식 검증 대상을 ledger 오류로 보고한다', () => {
  const errors = validateLedger({
    schemaVersion: 1,
    sourceRevision: REVISION,
    files: [
      {
        path: 'web/src/App.tsx',
        size: 1,
        sha256: 'missing',
        disposition: 'frontend-port',
        target: null,
        verification: null,
      },
    ],
  })

  assert.deepEqual(errors, [
    'web/src/App.tsx: sha256 must be a 64-character lowercase hexadecimal value',
    'web/src/App.tsx: frontend-port requires a target',
    'web/src/App.tsx: frontend-port requires a verification target',
  ])
})
