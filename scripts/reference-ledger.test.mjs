import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLedgerRows, validateLedger } from './reference-ledger.mjs'

const REVISION = 'cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc'
const HASH = 'a'.repeat(64)

test('원본의 모든 파일을 결정적인 이식 상태와 검증 대상으로 분류한다', () => {
  const rows = buildLedgerRows(
    [
      { path: 'internal/server/routes.go', size: 12, sha256: HASH },
      { path: 'internal/server/localterm_unix.go', size: 13, sha256: HASH },
      { path: 'internal/server/desktop_save_file.go', size: 14, sha256: HASH },
      { path: 'internal/updater/updater.go', size: 15, sha256: HASH },
      { path: 'web/src/App.tsx', size: 34, sha256: HASH },
      { path: 'cmd/desktop/main.go', size: 56, sha256: HASH },
      { path: 'README.md', size: 78, sha256: HASH },
      { path: 'examples/demo.yaml', size: 90, sha256: HASH },
    ],
    REVISION,
  )

  assert.deepEqual(
    rows.map(({ path, language, purpose, disposition, target, verification }) => ({
      path,
      language,
      purpose,
      disposition,
      target,
      verification,
    })),
    [
      {
        path: 'README.md',
        language: 'markdown',
        purpose: 'build/docs-only',
        disposition: 'build/docs-only',
        target: 'docs/migration',
        verification: 'scripts/reference-ledger.test.mjs',
      },
      {
        path: 'cmd/desktop/main.go',
        language: 'go',
        purpose: 'desktop-port',
        disposition: 'desktop-port',
        target: 'desktop',
        verification: 'desktop/src-tauri/tests/reference_parity.rs',
      },
      {
        path: 'examples/demo.yaml',
        language: 'yaml',
        purpose: 'frozen',
        disposition: 'frozen',
        target: null,
        verification: 'scripts/reference-ledger.test.mjs',
      },
      {
        path: 'internal/server/desktop_save_file.go',
        language: 'go',
        purpose: 'desktop-port',
        disposition: 'desktop-port',
        target: 'desktop',
        verification: 'desktop/src-tauri/tests/reference_parity.rs',
      },
      {
        path: 'internal/server/localterm_unix.go',
        language: 'go',
        purpose: 'desktop-port',
        disposition: 'desktop-port',
        target: 'desktop',
        verification: 'desktop/src-tauri/tests/reference_parity.rs',
      },
      {
        path: 'internal/server/routes.go',
        language: 'go',
        purpose: 'python-port',
        disposition: 'python-port',
        target: 'src',
        verification: 'tests/contracts/test_reference_parity.py',
      },
      {
        path: 'internal/updater/updater.go',
        language: 'go',
        purpose: 'desktop-port',
        disposition: 'desktop-port',
        target: 'desktop',
        verification: 'desktop/src-tauri/tests/reference_parity.rs',
      },
      {
        path: 'web/src/App.tsx',
        language: 'tsx',
        purpose: 'frontend-port',
        disposition: 'frontend-port',
        target: 'frontend/src',
        verification: 'frontend/src/reference/referenceParity.test.ts',
      },
    ],
  )
})

test('ledger는 provenance 포인터와 파일별 언어·용도를 누락 없이 요구한다', () => {
  const errors = validateLedger({
    schemaVersion: 2,
    sourceRevision: REVISION,
    sourceProvenance: '',
    files: [
      {
        path: 'web/src/App.tsx',
        size: 1,
        sha256: HASH,
        language: '',
        purpose: '',
        disposition: 'frontend-port',
        target: 'frontend/src',
        verification: 'frontend/src/reference/referenceParity.test.ts',
      },
    ],
  })

  assert.deepEqual(errors, [
    'sourceProvenance must equal references/provenance/source.json',
    'web/src/App.tsx: language is required',
    'web/src/App.tsx: purpose is required',
  ])
})

test('누락된 해시와 이식 검증 대상을 ledger 오류로 보고한다', () => {
  const errors = validateLedger({
    schemaVersion: 2,
    sourceRevision: REVISION,
    sourceProvenance: 'references/provenance/source.json',
    files: [
      {
        path: 'web/src/App.tsx',
        size: 1,
        sha256: 'missing',
        language: 'tsx',
        purpose: 'frontend-port',
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
