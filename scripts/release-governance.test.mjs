import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('PR 진단 gate와 strict release-governance를 분리하고 dev deploy는 image build 전에 strict gate를 실행한다', async () => {
  const [makefile, workflow] = await Promise.all([
    readFile(path.join(repositoryRoot, 'Makefile'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github', 'workflows', 'dev-deploy.yml'), 'utf8'),
  ])

  assert.match(makefile, /^gate: product-brand-boundary-check reference-ledger-check reference-feature-ledger-check ## PR 진단용/m)
  assert.match(
    makefile,
    /^release-governance: reference-ledger-check reference-ui-delta-rebaseline-check reference-feature-parity-check ## 출하 차단용/m,
  )

  const upstreamPreparation = workflow.indexOf('Prepare approved upstream delta evidence')
  const strictGovernance = workflow.indexOf('Run strict release governance')
  const serviceImageBuild = workflow.indexOf('Build and push immutable service image')
  const consoleImageBuild = workflow.indexOf('Build and push immutable console image')
  assert.ok(upstreamPreparation >= 0)
  assert.ok(strictGovernance > upstreamPreparation)
  assert.ok(strictGovernance < serviceImageBuild)
  assert.ok(strictGovernance < consoleImageBuild)
  assert.match(workflow.slice(strictGovernance, serviceImageBuild), /run: make release-governance/)
  assert.match(workflow.slice(upstreamPreparation, strictGovernance), /run: make reference-upstream-prepare/)
})
