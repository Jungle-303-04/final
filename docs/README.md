# 프로젝트 문서 루트

이 파일이 문서의 시작점이다. 팀원은 여기서 자기 역할 문서로 들어가고, 모든 문서는 여기에서 링크로 찾을 수 있게 유지한다.

문서 위치 규칙은 단순하게 둔다.

- repo root 기준 `docs/<문서>`까지 허용한다.
- repo root 기준 `docs/<분류>/<문서>`까지 허용한다.
- repo root 기준 `docs/<분류>/<하위분류>/<문서>`까지 허용한다.
- 그보다 깊은 `docs/a/b/c/d.md` 형태는 만들지 않는다.
- 새 문서를 만들면 이 파일의 `전체 문서 색인`에 반드시 링크를 추가한다.

## 처음 읽는 순서

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 1 | [README](../README.md) | repo 실행 기준과 서비스 목록을 먼저 본다. |
| 2 | [AWS 테스트 실행 기준](aws-testing-runbook.md) | 이제 서비스 테스트를 어디서 어떻게 돌리는지 본다. |
| 3 | [Bruno API 테스트 가이드](../api/README.md) | Gateway API를 사람이 직접 눌러보는 순서를 본다. |
| 4 | [팀 온보딩 문서 지도](onboarding/README.md) | 민정/가인/찬빈 역할별 시작점을 잡는다. |
| 5 | [RCA 프로덕션 온보딩 지도](rca-production-onboarding/README.md) | 실제 코드 기준 RCA/권한/대시보드 구현 순서를 잡는다. |
| 6 | [찾아보고 구현하는 방법](rca-production-onboarding/07-how-to-find-and-implement.md) | route, event, worker, provider, test를 찾는 순서를 익힌다. |
| 7 | [아키텍처](architecture.md) | 전체 구조와 서비스 경계를 본다. |
| 8 | [이벤트 흐름](events.md) | event subject와 end-to-end flow를 본다. |
| 9 | [팀 컨벤션](team/conventions.md) | 브랜치, PR, 리뷰, 테스트 규칙을 본다. |

## 역할별 입구

| 팀원 | 역할 | 먼저 볼 문서 | 선형 작업 문서 |
| --- | --- | --- | --- |
| 민정 | Command + Target + Evidence | [민정 온보딩](onboarding/minjeong-command-target-evidence.md) | [Target / Telemetry 작업](team/target-telemetry-tasks/README.md) |
| 가인 | Evidence + RCA + Safe PR | [가인 온보딩](onboarding/gain-evidence-rca.md) | [RCA / Safe PR 작업](team/rca-safe-pr-tasks/README.md) |
| 찬빈 | Frontend + 권한 + Dashboard | [찬빈 온보딩](onboarding/chanbin-frontend.md) | [권한 시스템과 대시보드](rca-production-onboarding/06-chanbin-permission-dashboard.md) |
| 공통 | 연결 계약과 테스트 | [역할별 실습 가이드](team/role-practice-guide.md) | [팀 간 구현 연결과 테스트](team/cross-role-implementation-test-guide.md) |

## 현재 테스트 기준

| 목적 | 실행 |
| --- | --- |
| Python lint/import/test | `bash scripts/test.sh` |
| Kubernetes manifest parse | `make manifest-check` |
| 커밋 전 기본 확인 | `make check` |
| 실제 서비스 통합 smoke | `make aws-smoke` |
| 사람이 직접 API 확인 | [Bruno collection](../api/README.md) |

로컬 클러스터 smoke는 현재 팀 테스트 기준으로 쓰지 않는다. AWS EKS 기준은 [AWS 테스트 실행 기준](aws-testing-runbook.md)에 맞춘다.

## 전체 문서 색인

### 루트 문서

- [architecture-boundaries](architecture-boundaries.md)
- [architecture](architecture.md)
- [aws-cicd](aws-cicd.md)
- [aws-testing-runbook](aws-testing-runbook.md)
- [coach-one-page-plan](coach-one-page-plan.md)
- [decoupling-proposal](decoupling-proposal.md)
- [domain-architecture-plan](domain-architecture-plan.md)
- [events](events.md)
- [gitops-fleet-control-plane](gitops-fleet-control-plane.md)
- [hardening-roadmap](hardening-roadmap.md)
- [install-control-plane](install-control-plane.md)
- [operations-deployment](operations-deployment.md)
- [outbox-design](outbox-design.md)
- [production-readiness](production-readiness.md)
- [secrets](secrets.md)
- [service-split-plan](service-split-plan.md)

### 온보딩

- [onboarding/README](onboarding/README.md)
- [onboarding/chanbin-frontend](onboarding/chanbin-frontend.md)
- [onboarding/gain-evidence-rca](onboarding/gain-evidence-rca.md)
- [onboarding/minjeong-command-target-evidence](onboarding/minjeong-command-target-evidence.md)

### RCA 프로덕션 온보딩

- [rca-production-onboarding/README](rca-production-onboarding/README.md)
- [rca-production-onboarding/00-current-runtime-flow](rca-production-onboarding/00-current-runtime-flow.md)
- [rca-production-onboarding/01-minjeong-command-target-evidence](rca-production-onboarding/01-minjeong-command-target-evidence.md)
- [rca-production-onboarding/02-gain-evidence-rca-safe-pr](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)
- [rca-production-onboarding/03-chanbin-frontend-projection](rca-production-onboarding/03-chanbin-frontend-projection.md)
- [rca-production-onboarding/04-rca-data-schema](rca-production-onboarding/04-rca-data-schema.md)
- [rca-production-onboarding/05-plural-production-comparison](rca-production-onboarding/05-plural-production-comparison.md)
- [rca-production-onboarding/06-chanbin-permission-dashboard](rca-production-onboarding/06-chanbin-permission-dashboard.md)
- [rca-production-onboarding/07-how-to-find-and-implement](rca-production-onboarding/07-how-to-find-and-implement.md)

### 팀 운영

- [team/codex-automation](team/codex-automation.md)
- [team/contract-vs-demo-boundary](team/contract-vs-demo-boundary.md)
- [team/conventions](team/conventions.md)
- [team/cross-role-implementation-test-guide](team/cross-role-implementation-test-guide.md)
- [team/file-ownership-convention](team/file-ownership-convention.md)
- [team/implementation-todo](team/implementation-todo.md)
- [team/plural-console-technical-challenge](team/plural-console-technical-challenge.md)
- [team/role-practice-guide](team/role-practice-guide.md)
- [team/work-allocation](team/work-allocation.md)
- [team/worker-branch-dev-alignment-guide](team/worker-branch-dev-alignment-guide.md)

### 팀원별 상세 가이드

- [team/member-guides/gateway-auth](team/member-guides/gateway-auth.md)
- [team/member-guides/gitops-command](team/member-guides/gitops-command.md)
- [team/member-guides/platform-integration](team/member-guides/platform-integration.md)
- [team/member-guides/rca-safe-pr](team/member-guides/rca-safe-pr.md)
- [team/member-guides/target-agent-command-evidence-flow](team/member-guides/target-agent-command-evidence-flow.md)
- [team/member-guides/target-agent-local-queue](team/member-guides/target-agent-local-queue.md)
- [team/member-guides/target-telemetry-concepts](team/member-guides/target-telemetry-concepts.md)
- [team/member-guides/target-telemetry-data-flows](team/member-guides/target-telemetry-data-flows.md)
- [team/member-guides/target-telemetry-evidence-learning-guide](team/member-guides/target-telemetry-evidence-learning-guide.md)
- [team/member-guides/target-telemetry-evidence-model](team/member-guides/target-telemetry-evidence-model.md)
- [team/member-guides/target-telemetry-implementation-plan](team/member-guides/target-telemetry-implementation-plan.md)
- [team/member-guides/target-telemetry-prometheus-runbook](team/member-guides/target-telemetry-prometheus-runbook.md)
- [team/member-guides/target-telemetry-verification](team/member-guides/target-telemetry-verification.md)
- [team/member-guides/target-telemetry](team/member-guides/target-telemetry.md)

### RCA / Safe PR 선형 작업

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

### Target / Telemetry 선형 작업

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

## WIKI와 source repo 기준

- source repo 문서는 코드와 함께 바뀌는 실행 기준이다.
- WIKI 문서는 프로젝트/운영/회의/팀 가이드의 mirror와 색인이다.
- 두 문서가 다르면 source repo의 실제 코드와 최신 PR 상태를 먼저 확인하고, 양쪽 문서를 함께 갱신한다.
