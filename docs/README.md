# Opsia 프로젝트 문서 루트

여기가 문서 시작점이다.
문서는 팀원이 실제 코드 구현, API 확인, AWS 테스트까지 바로 이어갈 수 있는 것만 남긴다.

새 문서를 추가할 때는 세 가지를 지킨다.

1. repo root 기준 `docs/<문서>`, `docs/<분류>/<문서>`, `docs/<분류>/<하위분류>/<문서>`까지만 둔다.
2. 새 문서는 이 파일의 `전체 문서 색인`에 링크한다.
3. 문서에 route, event, provider, test를 쓰면 실제 코드와 테스트가 있어야 한다.

## 먼저 읽는 순서

1. [repo README](../README.md)를 먼저 본다.
   실행 기준, 서비스 목록, 검증 명령을 확인한다.

2. [팀 온보딩 지도](onboarding/README.md)를 본다.
   민정, 가인, 찬빈 역할 경계를 먼저 잡는다.

3. [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md)을 본다.
   command, evidence, RCA, PR, dashboard 흐름을 한 번에 본다.

4. [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)를 본다.
   외부 기준 기능 범위를 최소선으로 두고 우리 설계 기준으로 빠진 production scope가 없는지 본다.

5. [찾아보고 구현하는 방법](rca-production-onboarding/07-how-to-find-and-implement.md)을 본다.
   route, event, worker, provider, test를 찾는 순서를 익힌다.

6. [Bruno API 테스트](api/README.md)를 연다.
   Gateway API를 사람이 직접 눌러 확인한다.

7. [로컬 테스트 실행 기준](local-testing.md)을 본다.
   로컬 계정 bootstrap, smoke, Bruno 값을 확인한다.

8. [AWS 테스트 기준](aws-testing-runbook.md)을 본다.
   실제 서비스 smoke 기준을 확인한다.

9. [라이브 데모 런북](demo-runbook.md)을 본다.
   클러스터 연결부터 자동 복구까지 발표 리허설 순서와 플랜B를 확인한다.

10. [2026-07-07 연속 실행 계획](continuation-execution-plan-2026-07-07.md)을 본다.
   현재 밤샘 안정화 작업을 대화 맥락 없이 이어받을 때 필요한 SHA, run ID, 게이트, 다음 명령을 확인한다.

## 민정이 먼저 볼 문서

민정은 Command + Target + Evidence를 맡는다.

1. [민정 온보딩](onboarding/minjeong-command-target-evidence.md)
2. [민정 프로덕션 구현 흐름](rca-production-onboarding/01-minjeong-command-target-evidence.md)
3. [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)
4. [Target / Telemetry 선형 작업](team/target-telemetry-tasks/README.md)
5. [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md)
6. [이벤트 흐름](events.md)
7. [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)
8. [Bruno API 테스트](api/README.md)

민정은 먼저 `/agent/commands/*`, `/agent/evidence/jobs/*`, `@telemetry.source(...)`를 익힌다.
그다음 Kubernetes, metrics, logs, traces provider를 같은 수준으로 다룬다.

## 가인이 먼저 볼 문서

가인은 Evidence + RCA + Safe PR을 맡는다.

1. [가인 온보딩](onboarding/gain-evidence-rca.md)
2. [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)
3. [RCA / Safe PR 멤버 가이드](team/member-guides/rca-safe-pr.md)
4. [RCA / Safe PR 선형 작업](team/rca-safe-pr-tasks/README.md)
5. [RCA 데이터 스키마](rca-production-onboarding/04-rca-data-schema.md)
6. [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)
7. [Bruno API 테스트](api/README.md)
8. [Raw Evidence cluster 권한 연결 인수인계](team/gain-evidence-query-access-handoff-20260712.md)

가인은 먼저 `cluster.evidence.received`가 RCA worker chain을 어떻게 통과하는지 본다.
그다음 `safe_pr.requested`와 `safe_pr.created`의 경계를 분리해서 익힌다.

## 찬빈이 먼저 볼 문서

찬빈은 Frontend + 권한 + Dashboard를 맡는다.

1. [찬빈 온보딩](onboarding/chanbin-frontend.md)
2. [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md)
3. [찬빈 권한 시스템과 대시보드 적용](rca-production-onboarding/06-chanbin-permission-dashboard.md)
4. [Frontend Framework Design Plan](frontend-framework-design.md)
5. [RCA 데이터 스키마](rca-production-onboarding/04-rca-data-schema.md)
6. [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md)
7. [이벤트 흐름](events.md)
8. [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)
9. [Bruno API 테스트](api/README.md)

찬빈은 먼저 `/dashboard/rca/*` response DTO와 권한 필터를 익힌다.
그다음 realtime은 보조 갱신 경로로 붙인다.

## 공통으로 보는 문서

서비스 경계와 전체 구조가 필요하면 [아키텍처](architecture.md)를 본다.
그림으로 한 번에 보고 싶으면 [아키텍처 다이어그램](architecture-diagram.md)을 본다.
서비스 통합 후보를 볼 때는 [서비스 통합 계획](architecture/service-consolidation-plan.md)을 본다.

subject, body, worker 연결이 필요하면 [이벤트 흐름](events.md)을 본다.

브랜치, 커밋, PR, 테스트 기준이 필요하면 [팀 컨벤션](team/conventions.md)을 본다.

내 파일과 조율 파일을 나눌 때는 [파일 소유권](team/file-ownership-convention.md)을 본다.

서로 넘기는 값과 검증을 확인할 때는 [팀 간 구현 연결과 테스트](team/cross-role-implementation-test-guide.md)를 본다.

처음 손으로 따라 하며 연습할 때는 [역할별 실습 가이드](team/role-practice-guide.md)를 본다.

AWS와 운영 명령을 확인할 때는 [운영/배포](operations-deployment.md)를 본다.

로컬 smoke 실행 기준은 [로컬 테스트 실행 기준](local-testing.md)을 본다.

실제 서비스 smoke 실행 기준은 [AWS 테스트 기준](aws-testing-runbook.md)을 본다.

실서비스 형태의 sandbox 장애 데이터는 [실서비스 데이터 시나리오](scenarios.md)를 본다.

production 전 위험과 점검 항목은 [운영 준비도](production-readiness.md)를 본다.
2026-07-11 감사 결함의 해결 순서와 완료 조건은 [권한·Evidence·AI·명령·메트릭 개선 계획](remediation-plan-2026-07-11.md)을 본다.

secret 이름과 주입 경계는 [Secrets](secrets.md)를 본다.

## 키워드로 찾기

`command`를 찾을 때는 [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [민정 프로덕션 구현 흐름](rca-production-onboarding/01-minjeong-command-target-evidence.md), [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)를 본다.

`target`을 찾을 때는 [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [Target / Telemetry 선형 작업](team/target-telemetry-tasks/README.md), [AWS 테스트 기준](aws-testing-runbook.md)을 본다.

`evidence`를 찾을 때는 [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md), [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [가인 온보딩](onboarding/gain-evidence-rca.md)을 본다.

`RCA`를 찾을 때는 [가인 온보딩](onboarding/gain-evidence-rca.md), [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md), [RCA 데이터 스키마](rca-production-onboarding/04-rca-data-schema.md)를 본다.

`Safe PR`을 찾을 때는 [RCA / Safe PR 멤버 가이드](team/member-guides/rca-safe-pr.md), [RCA / Safe PR 선형 작업](team/rca-safe-pr-tasks/README.md), [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)를 본다.

`dashboard`를 찾을 때는 [찬빈 온보딩](onboarding/chanbin-frontend.md), [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md), [찬빈 권한 시스템과 대시보드 적용](rca-production-onboarding/06-chanbin-permission-dashboard.md)을 본다.

`frontend`를 찾을 때는 [Frontend Framework Design Plan](frontend-framework-design.md), [찬빈 온보딩](onboarding/chanbin-frontend.md), [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md), [콘솔 메트릭·쿼리 카탈로그](frontend-metrics-queries.md)을 본다.

`permission`을 찾을 때는 [찬빈 권한 시스템과 대시보드 적용](rca-production-onboarding/06-chanbin-permission-dashboard.md), [찬빈 권한 모델 상세](team/member-guides/chanbin-permission-model.md), [Secrets](secrets.md)를 본다.

`Bruno`를 찾을 때는 [Bruno API 테스트](api/README.md), [로컬 테스트 실행 기준](local-testing.md)을 본다.

`AWS`를 찾을 때는 [AWS 테스트 기준](aws-testing-runbook.md), [운영/배포](operations-deployment.md)를 본다.

`continuation` 또는 `handover`를 찾을 때는 [2026-07-07 연속 실행 계획](continuation-execution-plan-2026-07-07.md)과 repo root의 `HANDOVER.md`를 본다.

`event`를 찾을 때는 [이벤트 흐름](events.md), [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md), [찾아보고 구현하는 방법](rca-production-onboarding/07-how-to-find-and-implement.md)을 본다.

`provider`를 찾을 때는 [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [Target / Telemetry 선형 작업](team/target-telemetry-tasks/README.md), [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)를 본다.

`worker`를 찾을 때는 [이벤트 흐름](events.md), [찾아보고 구현하는 방법](rca-production-onboarding/07-how-to-find-and-implement.md), [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md)을 본다.

`test`를 찾을 때는 [로컬 테스트 실행 기준](local-testing.md), [역할별 실습 가이드](team/role-practice-guide.md), [팀 간 구현 연결과 테스트](team/cross-role-implementation-test-guide.md), [Bruno API 테스트](api/README.md)를 본다.

`GitOps`를 찾을 때는 [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md), [RCA / Safe PR 선형 작업](team/rca-safe-pr-tasks/README.md), [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)를 본다.

`realtime`을 찾을 때는 [찬빈 온보딩](onboarding/chanbin-frontend.md), [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md), [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)를 본다.

`MCP`를 찾을 때는 [internal-control MCP 스펙](spec/services/mcp-internal-control.md), [api-gateway 스펙](spec/services/gateway-api-gateway.md), [보안 패키지 스펙](spec/packages/security.md)을 본다.

## 전체 문서 색인

루트 문서는 아래에 있다.

- [BLOCKERS](BLOCKERS.md)
- [CODEX-DIRECTIVE](CODEX-DIRECTIVE.md)
- [G1-BRANCH-AUDIT](G1-BRANCH-AUDIT.md)
- [GOAL-LOG](GOAL-LOG.md)
- [PRODUCTION-READINESS-PLAN](PRODUCTION-READINESS-PLAN.md)
- [STATUS-REPORT](STATUS-REPORT.md)
- [architecture](architecture.md)
- [architecture-diagram](architecture-diagram.md)
- [architecture/agent-port-forward-boundary](architecture/agent-port-forward-boundary.md)
- [architecture/service-consolidation-plan](architecture/service-consolidation-plan.md)
- [argocd-reference-learning-lab](argocd-reference-learning-lab.md)
- [api-requests/G3-BACKEND-CONTRACTS-RESOLVED](api-requests/G3-BACKEND-CONTRACTS-RESOLVED.md)
- [aws-testing-runbook](aws-testing-runbook.md)
- [backend-f-progress](backend-f-progress.md)
- [backend-f-workqueue](backend-f-workqueue.md)
- [cloudflare-waf-and-login](cloudflare-waf-and-login.md)
- [continuation-execution-plan-2026-07-07](continuation-execution-plan-2026-07-07.md)
- [codex-work-order-20260712](codex-work-order-20260712.md)
- [demo-01-digital-twin-agent-town](demo-01-digital-twin-agent-town.md)
- [demo-workspace](demo-workspace.md)
- [team/gain-evidence-query-access-handoff-20260712](team/gain-evidence-query-access-handoff-20260712.md)
- [current-service-state](current-service-state.md)
- [security-review-20260710](security-review-20260710.md)
- [unimplemented-review-20260711](unimplemented-review-20260711.md)
- [api-requests/G3-BACKEND-CONTRACTS-RESOLVED](api-requests/G3-BACKEND-CONTRACTS-RESOLVED.md)
- [events](events.md)
- [external-console-cluster-interactions](external-console-cluster-interactions.md)
- [external-console-instances](external-console-instances.md)
- [evidence/live-smoke-2026-07-19-1750](evidence/live-smoke-2026-07-19-1750.md)
- [evidence/live-smoke-2026-07-19-2158](evidence/live-smoke-2026-07-19-2158.md)
- [f-coordination-plan](f-coordination-plan.md)
- [frontend-framework-design](frontend-framework-design.md)
- [frontend-metrics-queries](frontend-metrics-queries.md)
- [github-poll-scoped-credential-cutover](github-poll-scoped-credential-cutover.md)
- [infra/cloudflare-dev-mtls](infra/cloudflare-dev-mtls.md)
- [local-testing](local-testing.md)
- [operations-deployment](operations-deployment.md)
- [oss-remediation-roadmap](oss-remediation-roadmap.md)
- [spec/oss-profile](spec/oss-profile.md)
- [spec/services/mcp-internal-control](spec/services/mcp-internal-control.md)
- [oss/CHANGELOG](oss/CHANGELOG.md)
- [oss/CODE_OF_CONDUCT](oss/CODE_OF_CONDUCT.md)
- [oss/CONTRIBUTING](oss/CONTRIBUTING.md)
- [oss/GOVERNANCE](oss/GOVERNANCE.md)
- [oss/LICENSE.draft](oss/LICENSE.draft)
- [oss/MAINTAINERS](oss/MAINTAINERS.md)
- [oss/README.en](oss/README.en.md)
- [oss/SECURITY](oss/SECURITY.md)
- [oss/publication-checklist](oss/publication-checklist.md)
- [platform-foundation-plan](platform-foundation-plan.md)
- [pod-terminal](pod-terminal.md)
- [production-readiness](production-readiness.md)
- [release-flow-production-readiness](release-flow-production-readiness.md)
- [remediation-plan-2026-07-11](remediation-plan-2026-07-11.md)
- [production-push-2026-07-07](production-push-2026-07-07.md)
- [release-flow-implementation](release-flow-implementation.md)
- [scenarios](scenarios.md)
- [secrets](secrets.md)
- [spec/remediation-bundle-v1alpha1](spec/remediation-bundle-v1alpha1.md)

자동 조율 문서는 아래에 있다.

- [auto/backend-pipeline](auto/backend-pipeline.md)
- [auto/cleanup-report](auto/cleanup-report.md)
- [auto/codex-goal-directive-20260714](auto/codex-goal-directive-20260714.md)
- [auto/codex-directive-20260714-final](auto/codex-directive-20260714-final.md)
- [auto/demo-readiness](auto/demo-readiness.md)
- [auto/deploy-plan](auto/deploy-plan.md)
- [auto/deploy-drift-audit](auto/deploy-drift-audit.md)
- [auto/deploy-setup](auto/deploy-setup.md)
- [auto/deploy-status](auto/deploy-status.md)
- [auto/frontend-pipeline](auto/frontend-pipeline.md)
- [auto/inflight](auto/inflight.md)
- [auto/night-directives](auto/night-directives.md)
- [auto/night-log](auto/night-log.md)
- [auto/night-log-backend](auto/night-log-backend.md)
- [auto/night-log-deploy](auto/night-log-deploy.md)
- [auto/night-log-frontend](auto/night-log-frontend.md)
- [auto/open-decisions-20260714](auto/open-decisions-20260714.md)

프론트 상세 설계 문서는 아래에 있다.

- [fd/README](fd/README.md)
- [fd/01-requirements](fd/01-requirements.md)
- [fd/02-reference-map](fd/02-reference-map.md)
- [fd/03-architecture](fd/03-architecture.md)
- [fd/04-design-system](fd/04-design-system.md)
- [fd/05-routes-ia](fd/05-routes-ia.md)
- [fd/06-api-map](fd/06-api-map.md)
- [fd/07-build-plan](fd/07-build-plan.md)
- [fd/08-frontend-execution-plan](fd/08-frontend-execution-plan.md)
- [fd/views/auth](fd/views/auth.md)
- [fd/views/org-admin](fd/views/org-admin.md)
- [fd/views/resources](fd/views/resources.md)
- [fd/views/fleet-heatmap](fd/views/fleet-heatmap.md)
- [fd/views/cluster-detail](fd/views/cluster-detail.md)
- [fd/views/repo](fd/views/repo.md)
- [fd/views/metrics](fd/views/metrics.md)
- [fd/views/workflow](fd/views/workflow.md)
- [fd/views/ai-chat](fd/views/ai-chat.md)
- [fd/views/notifications](fd/views/notifications.md)

온보딩 문서는 아래에 있다.

- [onboarding/README](onboarding/README.md)
- [onboarding/minjeong-command-target-evidence](onboarding/minjeong-command-target-evidence.md)
- [onboarding/gain-evidence-rca](onboarding/gain-evidence-rca.md)
- [onboarding/chanbin-frontend](onboarding/chanbin-frontend.md)

RCA 프로덕션 온보딩 문서는 아래에 있다.

- [rca-production-onboarding/README](rca-production-onboarding/README.md)
- [rca-production-onboarding/00-current-runtime-flow](rca-production-onboarding/00-current-runtime-flow.md)
- [rca-production-onboarding/01-minjeong-command-target-evidence](rca-production-onboarding/01-minjeong-command-target-evidence.md)
- [rca-production-onboarding/02-gain-evidence-rca-safe-pr](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)
- [rca-production-onboarding/03-chanbin-frontend-projection](rca-production-onboarding/03-chanbin-frontend-projection.md)
- [rca-production-onboarding/04-rca-data-schema](rca-production-onboarding/04-rca-data-schema.md)
- [rca-production-onboarding/05-production-completion-scope](rca-production-onboarding/05-production-completion-scope.md)
- [rca-production-onboarding/06-chanbin-permission-dashboard](rca-production-onboarding/06-chanbin-permission-dashboard.md)
- [rca-production-onboarding/07-how-to-find-and-implement](rca-production-onboarding/07-how-to-find-and-implement.md)
- [rca-production-onboarding/08-provider-evidence-field-guide](rca-production-onboarding/08-provider-evidence-field-guide.md)
- [rca-production-onboarding/09-rca-rule-catalog-guide](rca-production-onboarding/09-rca-rule-catalog-guide.md)
- [rca-production-onboarding/10-recovery-action-compatibility](rca-production-onboarding/10-recovery-action-compatibility.md)
- [rca-production-onboarding/provider-evidence-request](rca-production-onboarding/provider-evidence-request.md)

마이그레이션 기준 문서는 아래에 있다.

- [migration/README](migration/README.md)
- [migration/frontend-branch-merge-plan](migration/frontend-branch-merge-plan.md)
- [migration/latest-reference-rebaseline](migration/latest-reference-rebaseline.md)
- [migration/parity-supervision-plan](migration/parity-supervision-plan.md)
- [migration/timeline-p0-url-state-mapping](migration/timeline-p0-url-state-mapping.md)

팀 문서는 아래에 있다.

- [team/conventions](team/conventions.md)
- [team/file-ownership-convention](team/file-ownership-convention.md)
- [team/cross-role-implementation-test-guide](team/cross-role-implementation-test-guide.md)
- [team/role-practice-guide](team/role-practice-guide.md)

팀원별 상세 문서는 아래에 있다.

- [team/member-guides/target-agent-command-evidence-flow](team/member-guides/target-agent-command-evidence-flow.md)
- [team/member-guides/rca-safe-pr](team/member-guides/rca-safe-pr.md)
- [team/member-guides/chanbin-permission-model](team/member-guides/chanbin-permission-model.md)

RCA / Safe PR 선형 작업 문서는 아래에 있다.

- [team/rca-safe-pr-tasks/README](team/rca-safe-pr-tasks/README.md)
- [team/rca-safe-pr-tasks/00-current-code-map](team/rca-safe-pr-tasks/00-current-code-map.md)
- [team/rca-safe-pr-tasks/01-evidence-input-contract](team/rca-safe-pr-tasks/01-evidence-input-contract.md)
- [team/rca-safe-pr-tasks/02-evidence-builder](team/rca-safe-pr-tasks/02-evidence-builder.md)
- [team/rca-safe-pr-tasks/03-rca-result-deterministic-analyzer](team/rca-safe-pr-tasks/03-rca-result-deterministic-analyzer.md)
- [team/rca-safe-pr-tasks/04-rca-completed-event](team/rca-safe-pr-tasks/04-rca-completed-event.md)
- [team/rca-safe-pr-tasks/05-safe-pr-proposal](team/rca-safe-pr-tasks/05-safe-pr-proposal.md)
- [team/rca-safe-pr-tasks/06-guarded-github-pr-adapter](team/rca-safe-pr-tasks/06-guarded-github-pr-adapter.md)
- [team/rca-safe-pr-tasks/07-audit-timeline-projection](team/rca-safe-pr-tasks/07-audit-timeline-projection.md)
- [team/rca-safe-pr-tasks/08-rca-safe-pr-chain-test](team/rca-safe-pr-tasks/08-rca-safe-pr-chain-test.md)

Target / Telemetry 선형 작업 문서는 아래에 있다.

- [team/target-telemetry-tasks/README](team/target-telemetry-tasks/README.md)
- [team/target-telemetry-tasks/00-current-code-map](team/target-telemetry-tasks/00-current-code-map.md)
- [team/target-telemetry-tasks/01-telemetry-provider-boundary](team/target-telemetry-tasks/01-telemetry-provider-boundary.md)
- [team/target-telemetry-tasks/02-observability-stack-boundary](team/target-telemetry-tasks/02-observability-stack-boundary.md)
- [team/target-telemetry-tasks/03-prometheus-helm-values](team/target-telemetry-tasks/03-prometheus-helm-values.md)
- [team/target-telemetry-tasks/04-helm-template-dry-run](team/target-telemetry-tasks/04-helm-template-dry-run.md)
- [team/target-telemetry-tasks/05-node-collector-scrape-target](team/target-telemetry-tasks/05-node-collector-scrape-target.md)
- [team/target-telemetry-tasks/06-prometheus-query-verification](team/target-telemetry-tasks/06-prometheus-query-verification.md)
- [team/target-telemetry-tasks/07-prometheus-query-client](team/target-telemetry-tasks/07-prometheus-query-client.md)
- [team/target-telemetry-tasks/08-agent-debug-query-api](team/target-telemetry-tasks/08-agent-debug-query-api.md)
- [team/target-telemetry-tasks/09-metric-evidence-summary](team/target-telemetry-tasks/09-metric-evidence-summary.md)
- [team/target-telemetry-tasks/10-kubernetes-pod-event-reader](team/target-telemetry-tasks/10-kubernetes-pod-event-reader.md)
- [team/target-telemetry-tasks/11-combined-kubernetes-metric-evidence](team/target-telemetry-tasks/11-combined-kubernetes-metric-evidence.md)
- [team/target-telemetry-tasks/12-gateway-contract-connection](team/target-telemetry-tasks/12-gateway-contract-connection.md)
- [team/target-telemetry-tasks/13-loki-otel-ingest-path](team/target-telemetry-tasks/13-loki-otel-ingest-path.md)

## 자동 전체 문서 색인

아래 목록은 루트에서 모든 문서를 찾을 수 있게 유지하는 실제 파일 목록이다.
새 문서를 만들면 이 목록에도 연결한다.

- [api/README](api/README.md)
- [api/16-rca-debug/README](api/16-rca-debug/README.md)
- [architecture-diagram](architecture-diagram.md)
- [architecture](architecture.md)
- [architecture/service-consolidation-plan](architecture/service-consolidation-plan.md)
- [aws-testing-runbook](aws-testing-runbook.md)
- [cloudflare-waf-and-login](cloudflare-waf-and-login.md)
- [event-graph-audit](event-graph-audit.md)
- [events](events.md)
- [external-console-cluster-interactions](external-console-cluster-interactions.md)
- [external-console-instances](external-console-instances.md)
- [fd/01-requirements](fd/01-requirements.md)
- [fd/02-reference-map](fd/02-reference-map.md)
- [fd/03-architecture](fd/03-architecture.md)
- [fd/04-design-system](fd/04-design-system.md)
- [fd/05-routes-ia](fd/05-routes-ia.md)
- [fd/06-api-map](fd/06-api-map.md)
- [fd/07-build-plan](fd/07-build-plan.md)
- [fd/README](fd/README.md)
- [fd/views/ai-chat](fd/views/ai-chat.md)
- [fd/views/auth](fd/views/auth.md)
- [fd/views/cluster-detail](fd/views/cluster-detail.md)
- [fd/views/fleet-heatmap](fd/views/fleet-heatmap.md)
- [fd/views/metrics](fd/views/metrics.md)
- [fd/views/notifications](fd/views/notifications.md)
- [fd/views/org-admin](fd/views/org-admin.md)
- [fd/views/repo](fd/views/repo.md)
- [fd/views/resources](fd/views/resources.md)
- [fd/views/workflow](fd/views/workflow.md)
- [frontend-framework-design](frontend-framework-design.md)
- [frontend-metrics-queries](frontend-metrics-queries.md)
- [infra/cloudflare-dev-mtls](infra/cloudflare-dev-mtls.md)
- [local-testing](local-testing.md)
- [onboarding/README](onboarding/README.md)
- [onboarding/chanbin-frontend](onboarding/chanbin-frontend.md)
- [onboarding/gain-evidence-rca](onboarding/gain-evidence-rca.md)
- [onboarding/minjeong-command-target-evidence](onboarding/minjeong-command-target-evidence.md)
- [operations-deployment](operations-deployment.md)
- [platform-foundation-plan](platform-foundation-plan.md)
- [production-readiness](production-readiness.md)
- [rca-production-onboarding/00-current-runtime-flow](rca-production-onboarding/00-current-runtime-flow.md)
- [rca-production-onboarding/01-minjeong-command-target-evidence](rca-production-onboarding/01-minjeong-command-target-evidence.md)
- [rca-production-onboarding/02-gain-evidence-rca-safe-pr](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)
- [rca-production-onboarding/03-chanbin-frontend-projection](rca-production-onboarding/03-chanbin-frontend-projection.md)
- [rca-production-onboarding/04-rca-data-schema](rca-production-onboarding/04-rca-data-schema.md)
- [rca-production-onboarding/05-production-completion-scope](rca-production-onboarding/05-production-completion-scope.md)
- [rca-production-onboarding/06-chanbin-permission-dashboard](rca-production-onboarding/06-chanbin-permission-dashboard.md)
- [rca-production-onboarding/07-how-to-find-and-implement](rca-production-onboarding/07-how-to-find-and-implement.md)
- [rca-production-onboarding/README](rca-production-onboarding/README.md)
- [scenarios](scenarios.md)
- [secrets](secrets.md)
- [spec/README](spec/README.md)
- [spec/_conventions](spec/_conventions.md)
- [spec/architecture](spec/architecture.md)
- [spec/domains/ai](spec/domains/ai.md)
- [spec/domains/alert](spec/domains/alert.md)
- [spec/domains/applications](spec/domains/applications.md)
- [spec/domains/audit](spec/domains/audit.md)
- [spec/domains/catalog](spec/domains/catalog.md)
- [spec/domains/command](spec/domains/command.md)
- [spec/domains/dashboard](spec/domains/dashboard.md)
- [spec/domains/gitops](spec/domains/gitops.md)
- [spec/domains/identity](spec/domains/identity.md)
- [spec/domains/inventory](spec/domains/inventory.md)
- [spec/domains/mail](spec/domains/mail.md)
- [spec/domains/providers](spec/domains/providers.md)
- [spec/domains/rca](spec/domains/rca.md)
- [spec/domains/registry](spec/domains/registry.md)
- [spec/domains/scm](spec/domains/scm.md)
- [spec/domains/target](spec/domains/target.md)
- [spec/frontend/CODEX-BRIEFING-20260711](spec/frontend/CODEX-BRIEFING-20260711.md)
- [spec/frontend/api-integration-workorder-20260711](spec/frontend/api-integration-workorder-20260711.md)
- [spec/frontend/api-needs](spec/frontend/api-needs.md)
- [spec/frontend/codex-directive-24h-20260711](spec/frontend/codex-directive-24h-20260711.md)
- [spec/frontend/codex-directive-goalmode-20260711](spec/frontend/codex-directive-goalmode-20260711.md)
- [spec/frontend/codex-directive-reference-pivot-20260711](spec/frontend/codex-directive-reference-pivot-20260711.md)
- [spec/frontend/codex-progress-20260711](spec/frontend/codex-progress-20260711.md)
- [spec/frontend/final-questions](spec/frontend/final-questions.md)
- [spec/frontend/product-data-contract](spec/frontend/product-data-contract.md)
- [spec/frontend/reference-contract-map](spec/frontend/reference-contract-map.md)
- [spec/frontend/reference-feature-inventory](spec/frontend/reference-feature-inventory.md)
- [spec/frontend/reference-porting-contract](spec/frontend/reference-porting-contract.md)
- [spec/frontend/reference-parity-map](spec/frontend/reference-parity-map.md)
- [spec/frontend/theme-first-paint-evidence-20260713](spec/frontend/theme-first-paint-evidence-20260713.md)
- [spec/frontend/topology-engine](spec/frontend/topology-engine.md)
- [spec/frontend/topology-message-action-schema](spec/frontend/topology-message-action-schema.md)
- [spec/frontend/topology-visual-motion-tokens](spec/frontend/topology-visual-motion-tokens.md)
- [spec/frontend/verified-pipeline-insertion-map](spec/frontend/verified-pipeline-insertion-map.md)
- [spec/frontend/vp-010-unified-filter-ia](spec/frontend/vp-010-unified-filter-ia.md)
- [spec/frontend/vp-011-home-widget-dashboard](spec/frontend/vp-011-home-widget-dashboard.md)
- [spec/frontend/vp-012-timeline-graph-table](spec/frontend/vp-012-timeline-graph-table.md)
- [spec/frontend/vp-013-shadcn-migration](spec/frontend/vp-013-shadcn-migration.md)
- [spec/frontend/vp-014-remaining-surfaces](spec/frontend/vp-014-remaining-surfaces.md)
- [spec/frontend/vp-015-global-shell](spec/frontend/vp-015-global-shell.md)
- [spec/frontend/vp-016-delivery-plan](spec/frontend/vp-016-delivery-plan.md)
- [spec/frontend/vp-017-motion-spec](spec/frontend/vp-017-motion-spec.md)
- [spec/frontend/vp-018-shell-corrections](spec/frontend/vp-018-shell-corrections.md)
- [spec/frontend/vp-019-reference-full-port](spec/frontend/vp-019-reference-full-port.md)
- [spec/frontend/vp-020-alerts](spec/frontend/vp-020-alerts.md)
- [spec/packages/ai](spec/packages/ai.md)
- [spec/packages/config](spec/packages/config.md)
- [spec/packages/contracts](spec/packages/contracts.md)
- [spec/packages/events](spec/packages/events.md)
- [spec/packages/runtime](spec/packages/runtime.md)
- [spec/packages/security](spec/packages/security.md)
- [spec/packages/storage](spec/packages/storage.md)
- [spec/oss-profile](spec/oss-profile.md)
- [spec/services/ai-agent](spec/services/ai-agent.md)
- [spec/services/ai-ai-fallback-worker](spec/services/ai-ai-fallback-worker.md)
- [spec/services/ai-analyze-worker](spec/services/ai-analyze-worker.md)
- [spec/services/ai-approval-worker](spec/services/ai-approval-worker.md)
- [spec/services/ai-backlog-worker](spec/services/ai-backlog-worker.md)
- [spec/services/ai-chat-worker](spec/services/ai-chat-worker.md)
- [spec/services/ai-diff-worker](spec/services/ai-diff-worker.md)
- [spec/services/ai-dispatch-worker](spec/services/ai-dispatch-worker.md)
- [spec/recovery-authority-patches](spec/recovery-authority-patches.md)
- [spec/remediation-source-contract](spec/remediation-source-contract.md)
- [spec/services/ai-evidence-worker](spec/services/ai-evidence-worker.md)
- [spec/services/ai-incident-worker](spec/services/ai-incident-worker.md)
- [spec/services/ai-plan-worker](spec/services/ai-plan-worker.md)
- [spec/services/ai-rca-feedback-worker](spec/services/ai-rca-feedback-worker.md)
- [spec/services/ai-rca-worker](spec/services/ai-rca-worker.md)
- [spec/services/ai-recovery-worker](spec/services/ai-recovery-worker.md)
- [spec/services/ai-rollout-worker](spec/services/ai-rollout-worker.md)
- [spec/services/ai-select-worker](spec/services/ai-select-worker.md)
- [spec/services/alert-alert-worker](spec/services/alert-alert-worker.md)
- [spec/services/command-command-janitor](spec/services/command-command-janitor.md)
- [spec/services/command-command-worker](spec/services/command-command-worker.md)
- [spec/services/gateway-api-gateway](spec/services/gateway-api-gateway.md)
- [spec/services/gateway-outbox-relay](spec/services/gateway-outbox-relay.md)
- [spec/services/gitops-diff-analyze-worker](spec/services/gitops-diff-analyze-worker.md)
- [spec/services/gitops-diff-worker](spec/services/gitops-diff-worker.md)
- [spec/services/gitops-git-pull-worker](spec/services/gitops-git-pull-worker.md)
- [spec/services/gitops-github-poll-worker](spec/services/gitops-github-poll-worker.md)
- [spec/services/gitops-manifest-render-worker](spec/services/gitops-manifest-render-worker.md)
- [spec/services/gitops-safe-pr-worker](spec/services/gitops-safe-pr-worker.md)
- [spec/services/gitops-scm-worker](spec/services/gitops-scm-worker.md)
- [spec/services/gitops-workflow-controller](spec/services/gitops-workflow-controller.md)
- [spec/services/mail-mail-worker](spec/services/mail-mail-worker.md)
- [spec/services/mcp-internal-control](spec/services/mcp-internal-control.md)
- [spec/services/projection-audit-worker](spec/services/projection-audit-worker.md)
- [spec/services/projection-dashboard-worker](spec/services/projection-dashboard-worker.md)
- [spec/services/projection-dead-letter-monitor](spec/services/projection-dead-letter-monitor.md)
- [spec/services/projection-rca-timeline-janitor](spec/services/projection-rca-timeline-janitor.md)
- [spec/services/realtime-realtime-gateway](spec/services/realtime-realtime-gateway.md)
- [spec/services/target-cluster-agent](spec/services/target-cluster-agent.md)
- [spec/services/target-drift-worker](spec/services/target-drift-worker.md)
- [spec/services/target-node-collector](spec/services/target-node-collector.md)
- [spec/services/target-reconcile-worker](spec/services/target-reconcile-worker.md)
- [team/conventions](team/conventions.md)
- [team/cross-role-implementation-test-guide](team/cross-role-implementation-test-guide.md)
- [team/file-ownership-convention](team/file-ownership-convention.md)
- [team/member-guides/chanbin-permission-model](team/member-guides/chanbin-permission-model.md)
- [team/member-guides/rca-safe-pr](team/member-guides/rca-safe-pr.md)
- [team/member-guides/target-agent-command-evidence-flow](team/member-guides/target-agent-command-evidence-flow.md)
- [team/rca-safe-pr-tasks/00-current-code-map](team/rca-safe-pr-tasks/00-current-code-map.md)
- [team/rca-safe-pr-tasks/01-evidence-input-contract](team/rca-safe-pr-tasks/01-evidence-input-contract.md)
- [team/rca-safe-pr-tasks/02-evidence-builder](team/rca-safe-pr-tasks/02-evidence-builder.md)
- [team/rca-safe-pr-tasks/03-rca-result-deterministic-analyzer](team/rca-safe-pr-tasks/03-rca-result-deterministic-analyzer.md)
- [team/rca-safe-pr-tasks/04-rca-completed-event](team/rca-safe-pr-tasks/04-rca-completed-event.md)
- [team/rca-safe-pr-tasks/05-safe-pr-proposal](team/rca-safe-pr-tasks/05-safe-pr-proposal.md)
- [team/rca-safe-pr-tasks/06-guarded-github-pr-adapter](team/rca-safe-pr-tasks/06-guarded-github-pr-adapter.md)
- [team/rca-safe-pr-tasks/07-audit-timeline-projection](team/rca-safe-pr-tasks/07-audit-timeline-projection.md)
- [team/rca-safe-pr-tasks/08-rca-safe-pr-chain-test](team/rca-safe-pr-tasks/08-rca-safe-pr-chain-test.md)
- [team/rca-safe-pr-tasks/README](team/rca-safe-pr-tasks/README.md)
- [team/role-practice-guide](team/role-practice-guide.md)
- [team/target-telemetry-tasks/00-current-code-map](team/target-telemetry-tasks/00-current-code-map.md)
- [team/target-telemetry-tasks/01-telemetry-provider-boundary](team/target-telemetry-tasks/01-telemetry-provider-boundary.md)
- [team/target-telemetry-tasks/02-observability-stack-boundary](team/target-telemetry-tasks/02-observability-stack-boundary.md)
- [team/target-telemetry-tasks/03-prometheus-helm-values](team/target-telemetry-tasks/03-prometheus-helm-values.md)
- [team/target-telemetry-tasks/04-helm-template-dry-run](team/target-telemetry-tasks/04-helm-template-dry-run.md)
- [team/target-telemetry-tasks/05-node-collector-scrape-target](team/target-telemetry-tasks/05-node-collector-scrape-target.md)
- [team/target-telemetry-tasks/06-prometheus-query-verification](team/target-telemetry-tasks/06-prometheus-query-verification.md)
- [team/target-telemetry-tasks/07-prometheus-query-client](team/target-telemetry-tasks/07-prometheus-query-client.md)
- [team/target-telemetry-tasks/08-agent-debug-query-api](team/target-telemetry-tasks/08-agent-debug-query-api.md)
- [team/target-telemetry-tasks/09-metric-evidence-summary](team/target-telemetry-tasks/09-metric-evidence-summary.md)
- [team/target-telemetry-tasks/10-kubernetes-pod-event-reader](team/target-telemetry-tasks/10-kubernetes-pod-event-reader.md)
- [team/target-telemetry-tasks/11-combined-kubernetes-metric-evidence](team/target-telemetry-tasks/11-combined-kubernetes-metric-evidence.md)
- [team/target-telemetry-tasks/12-gateway-contract-connection](team/target-telemetry-tasks/12-gateway-contract-connection.md)
- [team/target-telemetry-tasks/13-loki-otel-ingest-path](team/target-telemetry-tasks/13-loki-otel-ingest-path.md)
- [team/target-telemetry-tasks/README](team/target-telemetry-tasks/README.md)
- [G4 홈 시각 대조](evidence/g4/home-visual-comparison.md)
- [G4 홈 숫자 교차 검증](evidence/g4/home-numeric-cross-check.md)
- [G4 홈 클릭 경로](evidence/g4/home-click-path.md)
