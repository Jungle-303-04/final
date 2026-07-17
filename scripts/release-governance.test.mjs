import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('웹 운영 배포와 최종 desktop package gate를 분리한다', async () => {
  const [makefile, workflow, desktopWorkflow] = await Promise.all([
    readFile(path.join(repositoryRoot, 'Makefile'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github', 'workflows', 'dev-deploy.yml'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github', 'workflows', 'desktop-package-gate.yml'), 'utf8'),
  ])

  assert.match(makefile, /^gate: product-brand-boundary-check reference-ledger-check reference-feature-ledger-check ## PR 진단용/m)
  assert.match(
    makefile,
    /^release-governance: reference-ledger-check reference-ui-delta-rebaseline-check reference-feature-parity-check ## 출하 차단용/m,
  )
  assert.match(
    makefile,
    /^release-governance-web: reference-ledger-check reference-ui-delta-rebaseline-check reference-feature-web-parity-check ## 웹 운영 배포용/m,
  )
  assert.match(
    makefile,
    /^release-governance-web-patch: reference-ledger-check reference-ui-delta-rebaseline-check reference-feature-ledger-check ## Dev 증분 패치용/m,
  )
  assert.match(
    makefile,
    /^reference-feature-web-parity-check:.*\n\t.*--surface web --phase baseline$/m,
  )
  assert.match(
    makefile,
    /^reference-feature-post-parity-check:.*\n\t.*--surface web --phase post_parity$/m,
  )
  assert.match(
    makefile,
    /^reference-feature-parity-check:.*\n\t(?!.*--phase).*--require-complete$/m,
  )

  const upstreamPreparation = workflow.indexOf('Prepare approved upstream delta evidence')
  const patchGovernance = workflow.indexOf('Run incremental web patch governance')
  const serviceImageBuild = workflow.indexOf('Build and push immutable service image')
  const consoleImageBuild = workflow.indexOf('Build and push immutable console image')
  assert.ok(upstreamPreparation >= 0)
  assert.ok(patchGovernance > upstreamPreparation)
  assert.ok(patchGovernance < serviceImageBuild)
  assert.ok(patchGovernance < consoleImageBuild)
  assert.match(workflow.slice(patchGovernance, serviceImageBuild), /run: make release-governance-web-patch/)
  assert.doesNotMatch(
    workflow.slice(patchGovernance, serviceImageBuild),
    /run: make release-governance-web\s*$/m,
  )
  assert.match(workflow.slice(upstreamPreparation, patchGovernance), /run: make reference-upstream-prepare/)
  assert.match(desktopWorkflow, /"on":\n  workflow_dispatch:/)
  assert.doesNotMatch(desktopWorkflow, /^\s{2}(?:pull_request|push):/m)
})
