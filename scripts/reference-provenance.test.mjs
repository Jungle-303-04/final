import assert from 'node:assert/strict'
import test from 'node:test'

import { referenceProvenance, validateReferenceProvenance } from './reference-provenance.mjs'

test('격리 provenance는 원본 위치와 immutable revision 및 브랜드 경계 용어를 한 번만 제공한다', () => {
  assert.match(referenceProvenance.repository, /^https:\/\//)
  assert.match(referenceProvenance.revision, /^[0-9a-f]{40}$/)
  assert.match(referenceProvenance.uiBaseRevision, /^[0-9a-f]{40}$/)
  assert.deepEqual(validateReferenceProvenance(referenceProvenance), [])
})

test('provenance는 불완전한 출처나 중복된 경계 용어를 거부한다', () => {
  const errors = validateReferenceProvenance({
    schemaVersion: 1,
    repository: 'http://invalid',
    revision: 'missing',
    uiBaseRevision: 'missing',
    legacyProductTerms: ['legacy', 'legacy'],
  })

  assert.deepEqual(errors, [
    'provenance repository must be an HTTPS URL',
    'provenance revision must be a 40-character lowercase hexadecimal revision',
    'provenance uiBaseRevision must be a 40-character lowercase hexadecimal revision',
    'provenance legacyProductTerms[1] is duplicated',
  ])
})
