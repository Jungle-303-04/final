#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..')
export const PROVENANCE_PATH = path.join(
  REPOSITORY_ROOT,
  'references',
  'provenance',
  'source.json',
)

const REVISION = /^[0-9a-f]{40}$/

export function validateReferenceProvenance(value) {
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['provenance must be an object']
  if (value.schemaVersion !== 1) errors.push('provenance schemaVersion must equal 1')
  if (typeof value.repository !== 'string' || !value.repository.startsWith('https://')) {
    errors.push('provenance repository must be an HTTPS URL')
  }
  if (!REVISION.test(value.revision ?? '')) errors.push('provenance revision must be a 40-character lowercase hexadecimal revision')
  if (!REVISION.test(value.uiBaseRevision ?? '')) errors.push('provenance uiBaseRevision must be a 40-character lowercase hexadecimal revision')
  if (!Array.isArray(value.legacyProductTerms) || value.legacyProductTerms.length === 0) {
    errors.push('provenance legacyProductTerms must be a non-empty array')
  } else {
    const seen = new Set()
    value.legacyProductTerms.forEach((term, index) => {
      if (typeof term !== 'string' || !/^[a-z0-9-]+$/.test(term)) {
        errors.push(`provenance legacyProductTerms[${index}] must be a lowercase identifier`)
      } else if (seen.has(term)) {
        errors.push(`provenance legacyProductTerms[${index}] is duplicated`)
      } else {
        seen.add(term)
      }
    })
  }
  return errors
}

export function loadReferenceProvenance(filePath = PROVENANCE_PATH) {
  const value = JSON.parse(readFileSync(filePath, 'utf8'))
  const errors = validateReferenceProvenance(value)
  if (errors.length > 0) throw new Error(`reference provenance is invalid:\n${errors.join('\n')}`)
  return Object.freeze({
    ...value,
    legacyProductTerms: Object.freeze([...value.legacyProductTerms]),
  })
}

export const referenceProvenance = loadReferenceProvenance()

function main(argv) {
  const field = argv[0]
  if (field === 'legacy-product-terms') {
    process.stdout.write(`${referenceProvenance.legacyProductTerms.join('\n')}\n`)
    return
  }
  const values = {
    repository: referenceProvenance.repository,
    revision: referenceProvenance.revision,
    'ui-base-revision': referenceProvenance.uiBaseRevision,
    path: path.relative(REPOSITORY_ROOT, PROVENANCE_PATH),
  }
  if (!field || !(field in values)) {
    throw new Error('usage: reference-provenance.mjs <repository|revision|ui-base-revision|path|legacy-product-terms>')
  }
  process.stdout.write(`${values[field]}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
