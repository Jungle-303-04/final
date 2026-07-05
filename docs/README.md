# 프로젝트 문서 루트

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

subject, body, worker 연결이 필요하면 [이벤트 흐름](events.md)을 본다.

브랜치, 커밋, PR, 테스트 기준이 필요하면 [팀 컨벤션](team/conventions.md)을 본다.

내 파일과 조율 파일을 나눌 때는 [파일 소유권](team/file-ownership-convention.md)을 본다.

서로 넘기는 값과 검증을 확인할 때는 [팀 간 구현 연결과 테스트](team/cross-role-implementation-test-guide.md)를 본다.

처음 손으로 따라 하며 연습할 때는 [역할별 실습 가이드](team/role-practice-guide.md)를 본다.

AWS와 운영 명령을 확인할 때는 [운영/배포](operations-deployment.md)를 본다.

GitHub Actions와 AWS CD 흐름은 [AWS CI/CD](aws-cicd.md)를 본다.

로컬 smoke 실행 기준은 [로컬 테스트 실행 기준](local-testing.md)을 본다.

실제 서비스 smoke 실행 기준은 [AWS 테스트 기준](aws-testing-runbook.md)을 본다.

production 전 위험과 점검 항목은 [운영 준비도](production-readiness.md)를 본다.

secret 이름과 주입 경계는 [Secrets](secrets.md)를 본다.

## 키워드로 찾기

`command`를 찾을 때는 [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [민정 프로덕션 구현 흐름](rca-production-onboarding/01-minjeong-command-target-evidence.md), [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)를 본다.

`target`을 찾을 때는 [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [Target / Telemetry 선형 작업](team/target-telemetry-tasks/README.md), [AWS 테스트 기준](aws-testing-runbook.md)을 본다.

`evidence`를 찾을 때는 [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md), [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [가인 온보딩](onboarding/gain-evidence-rca.md)을 본다.

`RCA`를 찾을 때는 [가인 온보딩](onboarding/gain-evidence-rca.md), [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md), [RCA 데이터 스키마](rca-production-onboarding/04-rca-data-schema.md)를 본다.

`Safe PR`을 찾을 때는 [RCA / Safe PR 멤버 가이드](team/member-guides/rca-safe-pr.md), [RCA / Safe PR 선형 작업](team/rca-safe-pr-tasks/README.md), [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md)를 본다.

`dashboard`를 찾을 때는 [찬빈 온보딩](onboarding/chanbin-frontend.md), [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md), [찬빈 권한 시스템과 대시보드 적용](rca-production-onboarding/06-chanbin-permission-dashboard.md)을 본다.

`frontend`를 찾을 때는 [Frontend Framework Design Plan](frontend-framework-design.md), [찬빈 온보딩](onboarding/chanbin-frontend.md), [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md)을 본다.

`permission`을 찾을 때는 [찬빈 권한 시스템과 대시보드 적용](rca-production-onboarding/06-chanbin-permission-dashboard.md), [찬빈 권한 모델 상세](team/member-guides/chanbin-permission-model.md), [Secrets](secrets.md)를 본다.

`Bruno`를 찾을 때는 [Bruno API 테스트](api/README.md), [로컬 테스트 실행 기준](local-testing.md)을 본다.

`AWS`를 찾을 때는 [AWS CI/CD](aws-cicd.md), [AWS 테스트 기준](aws-testing-runbook.md), [운영/배포](operations-deployment.md)를 본다.

`event`를 찾을 때는 [이벤트 흐름](events.md), [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md), [찾아보고 구현하는 방법](rca-production-onboarding/07-how-to-find-and-implement.md)을 본다.

`provider`를 찾을 때는 [민정 온보딩](onboarding/minjeong-command-target-evidence.md), [Target / Telemetry 선형 작업](team/target-telemetry-tasks/README.md), [Target Agent Command / Evidence 구현 가이드](team/member-guides/target-agent-command-evidence-flow.md)를 본다.

`worker`를 찾을 때는 [이벤트 흐름](events.md), [찾아보고 구현하는 방법](rca-production-onboarding/07-how-to-find-and-implement.md), [현재 실제 흐름](rca-production-onboarding/00-current-runtime-flow.md)을 본다.

`test`를 찾을 때는 [로컬 테스트 실행 기준](local-testing.md), [역할별 실습 가이드](team/role-practice-guide.md), [팀 간 구현 연결과 테스트](team/cross-role-implementation-test-guide.md), [Bruno API 테스트](api/README.md)를 본다.

`GitOps`를 찾을 때는 [가인 프로덕션 구현 흐름](rca-production-onboarding/02-gain-evidence-rca-safe-pr.md), [RCA / Safe PR 선형 작업](team/rca-safe-pr-tasks/README.md), [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)를 본다.

`realtime`을 찾을 때는 [찬빈 온보딩](onboarding/chanbin-frontend.md), [찬빈 Frontend + Projection 구현 흐름](rca-production-onboarding/03-chanbin-frontend-projection.md), [벤치마크 최소선 기준 프로덕션 완성 설계](rca-production-onboarding/05-production-completion-scope.md)를 본다.

## 전체 문서 색인

루트 문서는 아래에 있다.

- [architecture](architecture.md)
- [aws-cicd](aws-cicd.md)
- [aws-testing-runbook](aws-testing-runbook.md)
- [events](events.md)
- [frontend-framework-design](frontend-framework-design.md)
- [local-testing](local-testing.md)
- [operations-deployment](operations-deployment.md)
- [production-readiness](production-readiness.md)
- [secrets](secrets.md)

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
