import assert from 'node:assert/strict'
import test from 'node:test'

import { referenceProvenance } from './reference-provenance.mjs'
import { inspectProductBoundaryFile } from './verify-product-brand-boundary.mjs'

const [legacyProduct] = referenceProvenance.legacyProductTerms

test('제품 표면의 legacy 제품명과 파일명은 차단한다', () => {
  const contentViolations = inspectProductBoundaryFile('src/example.ts', `export const value = '${legacyProduct}'\n`)
  const pathViolations = inspectProductBoundaryFile(`docs/${legacyProduct}-guide.md`, 'clean content\n')

  assert.equal(contentViolations.length, 1)
  assert.equal(contentViolations[0].line, 1)
  assert.equal(pathViolations.length, 0)
})

test('NOTICE·법적 license·격리 원본과 provenance는 좁은 예외로 허용한다', () => {
  for (const filePath of [
    'NOTICE',
    'LICENSE-APACHE-2.0.txt',
    `references/upstream/${legacyProduct}.md`,
    `references/provenance/${legacyProduct}.json`,
  ]) {
    assert.deepEqual(inspectProductBoundaryFile(filePath, legacyProduct), [])
  }
})

test('canonical ledger는 immutable source path만 예외로 두고 다른 legacy 문자열은 차단한다', () => {
  const ledger = JSON.stringify({
    sourceProvenance: 'references/provenance/source.json',
    files: [{ path: `web/${legacyProduct}.tsx`, previousPath: null }],
  })
  const clean = inspectProductBoundaryFile('docs/migration/reference-source-ledger.json', ledger)
  const contaminated = inspectProductBoundaryFile(
    'docs/migration/reference-source-ledger.json',
    JSON.stringify({ ...JSON.parse(ledger), note: legacyProduct }),
  )

  assert.deepEqual(clean, [])
  assert.equal(contaminated.length, 1)
})
