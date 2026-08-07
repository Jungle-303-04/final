import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('출하 governance는 전체·웹·증분 검증 범위를 분리한다', async () => {
  const makefile = await readFile(path.join(repositoryRoot, 'Makefile'), 'utf8')

  assert.match(makefile, /^gate: ## PR 진단용 백엔드·manifest·프론트 전체 gate$/m)
  assert.match(
    makefile,
    /^reference-feature-ledger-check:.*\n(?:\t.*\n)*?\tnode --test scripts\/reference-feature-ledger\.test\.mjs scripts\/reference-feature-source-identity\.test\.mjs scripts\/reference-resource-metrics-parity\.test\.mjs scripts\/release-governance\.test\.mjs$/m,
  )
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
})

test('Target Agent는 같은 빌드의 공개 GHCR digest만 배포한다', async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, '.github', 'workflows', 'dev-deploy.yml'),
    'utf8',
  )

  assert.match(workflow, /^permissions:\n(?: {2}.*\n)* {2}packages: write$/m)

  const serviceImageBuild = workflow.indexOf('Build and push immutable service image')
  const consoleImageBuild = workflow.indexOf('Build and push immutable console image')
  const ghcrLogin = workflow.indexOf('Log in to GitHub Container Registry')
  const anonymousProof = workflow.indexOf('Verify anonymous target agent image access')
  const targetImagePin = workflow.indexOf('Pin target agent image in runtime config')
  const serviceRollout = workflow.indexOf('Roll out immutable service digest')
  assert.ok(serviceImageBuild >= 0)
  assert.ok(ghcrLogin >= 0)
  assert.ok(ghcrLogin < serviceImageBuild)
  assert.ok(consoleImageBuild > serviceImageBuild)
  assert.ok(anonymousProof > serviceImageBuild)
  assert.ok(anonymousProof < targetImagePin)
  assert.ok(targetImagePin < serviceRollout)

  const buildStep = workflow.slice(serviceImageBuild, consoleImageBuild)
  assert.match(buildStep, /agent_repository="ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}-agent"/)
  assert.match(
    buildStep,
    /--label "org\.opencontainers\.image\.source=\$\{GITHUB_SERVER_URL\}\/\$\{GITHUB_REPOSITORY\}"/,
  )
  assert.match(buildStep, /--tag "\$\{tagged_image\}"/)
  assert.match(buildStep, /--tag "\$\{agent_tagged_image\}"/)
  assert.match(buildStep, /echo "image=\$\{registry\}\/\$\{ECR_REPOSITORY\}@\$\{digest\}"/)
  assert.match(
    buildStep,
    /echo "agent_image=\$\{agent_repository\}@\$\{digest\}"/,
  )

  const loginStep = workflow.slice(ghcrLogin, serviceImageBuild)
  assert.match(loginStep, /registry: ghcr\.io/)
  assert.match(loginStep, /password: \$\{\{ github\.token \}\}/)

  const proofStep = workflow.slice(anonymousProof, targetImagePin)
  assert.match(
    proofStep,
    /TARGET_AGENT_IMAGE: \$\{\{ steps\.image\.outputs\.agent_image \}\}/,
  )
  assert.match(proofStep, /DOCKER_CONFIG="\$\{anonymous_docker_config\}" docker manifest inspect/)
  assert.match(proofStep, /DOCKER_CONFIG="\$\{anonymous_docker_config\}" docker pull/)
  assert.match(proofStep, /org\.opencontainers\.image\.source/)
  assert.match(
    proofStep,
    /test "\$\{observed_source\}" = "\$\{GITHUB_SERVER_URL\}\/\$\{GITHUB_REPOSITORY\}"/,
  )

  const pinStep = workflow.slice(targetImagePin, serviceRollout)
  assert.match(
    pinStep,
    /TARGET_AGENT_IMAGE: \$\{\{ steps\.image\.outputs\.agent_image \}\}/,
  )
  const rolloutStep = workflow.slice(serviceRollout)
  assert.match(rolloutStep, /DEPLOY_IMAGE: \$\{\{ steps\.image\.outputs\.image \}\}/)
  assert.doesNotMatch(workflow, /TARGET_AGENT_IMAGE_PULL_SECRET:/)
})
