# 팀 파일 소유권 컨벤션

이 문서는 각 팀원이 어떤 파일을 직접 관리하고, 어떤 파일을 반드시 이해해야 하며,
어떤 파일은 변경 전에 조율해야 하는지 정리한다.

## 기본 원칙

- 작업자 브랜치는 각 작업자가 직접 `dev`를 반영한다. 다른 사람이 대신 merge, rebase,
  force push하지 않는다.
- 담당 파일은 자유롭게 고칠 수 있지만, event subject, API schema, DB schema, RBAC,
  배포 스크립트처럼 여러 팀에 영향을 주는 파일은 PR 전에 문서와 테스트를 함께 갱신한다.
- 새 기능은 "내 서비스 파일", "공유 계약 파일", "테스트 파일", "문서 파일"을 한 세트로
  생각한다.
- 루트 `services/`, `packages/` 경로는 사용하지 않는다. 현재 기준은 `src/services`,
  `src/domains`, `src/packages`다.
- 팀원이 다른 영역 파일을 수정해야 하면 PR 설명에 이유, 영향, 검증, rollback 방법을
  적고 담당자 리뷰를 요청한다.

## 공통으로 알아야 하는 파일

모든 팀원은 아래 파일의 목적을 알고 있어야 한다.

| 파일 | 알아야 하는 이유 |
| --- | --- |
| `README.md` | 로컬 실행, smoke, 전체 서비스 목적 |
| `Makefile` | `make check`, `make up`, `make smoke` 진입점 |
| `pyproject.toml` | ruff, pytest, Python import 경로 기준 |
| `.github/workflows/ci.yml` | PR 필수 검증 기준 |
| `docs/architecture.md` | 전체 서비스 분리와 데이터 흐름 |
| `docs/events.md` | event subject, payload, flow의 기준 |
| `docs/operations-deployment.md` | 로컬/운영 배포 흐름 |
| `docs/production-readiness.md` | production 관점 남은 위험 |
| `docs/team/conventions.md` | 브랜치, PR, 테스트, 리뷰 규칙 |
| `docs/team/work-allocation.md` | 5인 역할 분배 |
| `docs/team/worker-branch-dev-alignment-guide.md` | 각자 브랜치에서 dev 구조로 이식하는 방법 |
| `docs/team/implementation-todo.md` | 실제 구현 TODO 원장 |
| `src/packages/contracts/event_bus/subjects.py` | 이벤트 이름의 단일 기준 |
| `src/packages/contracts/event_bus/bodies/` | 이벤트 payload 타입 계약 |
| `src/packages/contracts/gateway/routes.py` | Gateway HTTP route 이름 기준 |
| `src/packages/contracts/gateway/fields.py` | HTTP/event 공통 field 이름 기준 |
| `src/packages/runtime/app.py` | worker/gateway 앱 조립 방식 |
| `src/packages/runtime/worker.py` | ack/nak/DLQ, retry 처리 방식 |
| `src/packages/storage/schema.py` | DB table 구조 기준 |
| `scripts/up.sh` | management/target 클러스터 전체 배포 |
| `scripts/smoke.sh` | E2E smoke 검증 |
| `scripts/register-target.sh` | target cluster 등록과 agent 설치 |

## Platform / Integration

담당자: `woonyong-kr`

목표: 공통 runtime, event contract, storage, CI, 배포, smoke를 관리한다.

직접 관리 파일:

| 범위 | 파일 |
| --- | --- |
| 공통 설정 | `src/packages/config/*.py` |
| 공통 계약 | `src/packages/contracts/**/*.py` |
| event bus | `src/packages/events/*.py`, `src/packages/contracts/event_bus/**/*.py` |
| runtime | `src/packages/runtime/*.py` |
| storage | `src/packages/storage/**/*.py` |
| 배포 | `deploy/**`, `scripts/*.sh`, `scripts/events.py` |
| CI | `.github/workflows/ci.yml`, `.pre-commit-config.yaml` |
| 공통 테스트 | `tests/test_event_runtime.py`, `tests/test_dlq_reliability.py`, `tests/test_outbox.py`, `tests/test_database_unit.py`, `tests/test_runtime_dependencies.py`, `tests/test_service_entrypoints.py` |
| 문서 | `docs/events.md`, `docs/outbox-design.md`, `docs/operations-deployment.md`, `docs/production-readiness.md`, `docs/team/conventions.md` |

반드시 알아야 하는 파일:

- `src/services/*/app.py`: runtime 계약을 깨는 직접 NATS/DB 조립이 들어가지 않았는지 확인한다.
- `src/domains/*/repository.py`: storage 공통 변경이 도메인 repository와 충돌하지 않는지 확인한다.
- `deploy/management/*.yaml`: 서비스 추가/삭제 시 workload와 service 이름이 맞는지 확인한다.
- `deploy/target/*.yaml`: target agent와 telemetry 설치가 management 배포와 어긋나지 않는지 확인한다.

변경 전 조율 파일:

- Gateway route/response 변경: Gateway/Auth와 조율한다.
- command payload 변경: GitOps/Command, Target/Telemetry와 조율한다.
- evidence payload 변경: RCA/Safe PR, Target/Telemetry와 조율한다.
- RBAC 변경: Target/Telemetry와 조율한다.

## Gateway / Auth

담당자: `JCBBBBBB`

목표: 외부 HTTP, 로그인, session, workspace/repo/cluster 권한, credential 경계를 관리한다.

직접 관리 파일:

| 범위 | 파일 |
| --- | --- |
| Gateway service | `src/services/api-gateway/app.py`, `src/services/api-gateway/auth.py`, `src/services/api-gateway/gateway.py`, `src/services/api-gateway/settings.py` |
| identity domain | `src/domains/identity/*.py` |
| target registration API | `src/domains/target/router.py` |
| Gateway contract | `src/packages/contracts/gateway/*.py`, `src/packages/contracts/auth.py` |
| auth/security tests | `tests/test_auth_security.py`, `tests/test_password_auth.py`, `tests/test_webhook_signature.py`, `tests/test_api_event_gateway.py`, `tests/test_gateway_error_handler.py`, `tests/test_target_registration.py` |
| 문서 | `docs/team/member-guides/gateway-auth.md`, `docs/secrets.md` |

반드시 알아야 하는 파일:

- `src/domains/command/router.py`: command 요청에 auth/policy가 어떻게 연결되는지 확인한다.
- `src/domains/gitops/router.py`: repo/webhook 요청이 어떤 이벤트로 바뀌는지 확인한다.
- `src/packages/storage/schema.py`: workspace, repo, cluster, credential 모델이 DB와 맞는지 확인한다.
- `scripts/smoke.sh`: OAuth/webhook/manual command smoke 입력을 이해한다.

변경 전 조율 파일:

- event subject/body 변경: Platform/Integration과 조율한다.
- command 정책 변경: GitOps/Command와 조율한다.
- target agent token/registration 변경: Target/Telemetry와 조율한다.
- Safe PR credential 사용 변경: RCA/Safe PR과 조율한다.

## GitOps / Command

담당자: `JEONWOOHYUN-hydromel`

목표: Git 변경 감지, manifest render, desired/actual diff, command 생성과 dispatch 준비를 관리한다.

직접 관리 파일:

| 범위 | 파일 |
| --- | --- |
| GitOps domain | `src/domains/gitops/*.py` |
| command domain | `src/domains/command/*.py` |
| GitOps workers | `src/services/gitops/github-poll-worker/*.py`, `src/services/gitops/git-pull-worker/app.py`, `src/services/gitops/manifest-render-worker/app.py`, `src/services/gitops/diff-worker/app.py`, `src/services/gitops/diff-analyze-worker/app.py` |
| command worker | `src/services/command-worker/app.py` |
| GitOps/command tests | `tests/test_github_poller.py`, `tests/test_git_pull_worker.py`, `tests/test_manifest_render_worker.py`, `tests/test_diff_worker.py`, `tests/test_diff_analyze_worker.py`, `tests/test_repo_gateway_worker.py`, `tests/test_event_golden_path.py` |
| 문서 | `docs/team/member-guides/gitops-command.md` |

반드시 알아야 하는 파일:

- `src/packages/contracts/event_bus/subjects.py`: GitOps/command event 이름을 추가할 때 기준이다.
- `src/packages/contracts/event_bus/bodies/`: GitOps/command body를 typed contract로 유지한다.
- `src/domains/scm/*.py`, `src/services/gitops/scm-worker/app.py`: Safe PR과 GitHub write 흐름을 이해한다.
- `src/services/target/cluster-agent/agent.py`: target command가 실제 cluster에서 어떻게 적용되는지 이해한다.

변경 전 조율 파일:

- command payload 변경: Target/Telemetry, RCA/Safe PR과 조율한다.
- production namespace write 정책 변경: Platform/Integration과 조율한다.
- GitHub credential/branch/PR write 변경: Gateway/Auth, RCA/Safe PR과 조율한다.

## RCA / Safe PR / Audit

담당자: `ummfieg`

목표: evidence 기반 incident/RCA 흐름, Safe PR 요청, audit timeline, dashboard projection 입력을 관리한다.

직접 관리 파일:

| 범위 | 파일 |
| --- | --- |
| RCA domain | `src/domains/rca/*.py` |
| SCM domain | `src/domains/scm/*.py` |
| projection domain | `src/domains/projection/*.py`, `src/domains/audit/*.py` |
| alert event | `src/domains/alert/events.py` |
| RCA worker | `src/services/rca-worker/app.py` |
| SCM worker | `src/services/gitops/scm-worker/app.py` |
| projection workers | `src/services/projection/audit-worker/app.py`, `src/services/projection/dashboard-worker/app.py` |
| alert worker | `src/services/alert-worker/app.py` |
| RCA/projection tests | `tests/test_rca_evidence.py`, `tests/test_projection.py`, `tests/test_alert_worker.py`, `tests/test_metrics.py`, `tests/test_multi_subscription.py` |
| 문서 | `docs/team/member-guides/rca-safe-pr.md` |

반드시 알아야 하는 파일:

- `src/services/target/cluster-agent/agent.py`: evidence 원천 shape를 이해한다.
- `src/domains/command/events.py`: RCA 결과가 command/action으로 이어질 때의 경계를 이해한다.
- `src/packages/runtime/outbound.py`: 외부 provider side effect를 어떻게 분리하는지 이해한다.
- `docs/events.md`: `cluster.evidence.received -> rca.completed -> safe_pr.requested` 흐름을 기준으로 삼는다.

변경 전 조율 파일:

- evidence schema 변경: Target/Telemetry, Platform/Integration과 조율한다.
- Safe PR credential/branch/commit 생성 변경: Gateway/Auth, GitOps/Command와 조율한다.
- dashboard query/read model 변경: Gateway/Auth, Platform/Integration과 조율한다.

## Target / Agent / Telemetry

담당자: `minmings111`

목표: target cluster 등록 후 agent 설치, node collector 관리, Prometheus/Loki/OTel evidence 수집, target command 실행을 관리한다.

직접 관리 파일:

| 범위 | 파일 |
| --- | --- |
| target domain | `src/domains/target/router.py` |
| cluster agent | `src/services/target/cluster-agent/agent.py`, `src/services/target/cluster-agent/app.py`, `src/services/target/cluster-agent/settings.py`, `src/services/target/cluster-agent/node_collector_manager.py`, `src/services/target/cluster-agent/fake_telemetry.py` |
| node collector | `src/services/target/node-collector/app.py`, `src/services/target/node-collector/node_collector.py`, `src/services/target/node-collector/settings.py` |
| target deploy | `deploy/target/target.yaml`, `deploy/target/prometheus.yaml`, `deploy/target/loki.yaml`, `deploy/target/alloy.yaml`, `deploy/target/opentelemetry.yaml`, `deploy/kind/target.yaml` |
| target scripts | `scripts/register-target.sh`, `scripts/install-telemetry.sh`, `scripts/status.sh` |
| target tests | `tests/test_target_agent_client.py`, `tests/test_target_registration.py`, `tests/test_node_collector.py`, `tests/test_service_entrypoints.py` |
| 문서 | `docs/team/member-guides/target-telemetry.md`, `docs/team/member-guides/target-telemetry-*.md` |

반드시 알아야 하는 파일:

- `src/domains/command/models.py`, `src/domains/command/policy.py`: agent가 실행할 수 있는 action과 정책 경계를 이해한다.
- `src/packages/contracts/gateway/routes.py`: agent outbound API path를 이해한다.
- `src/packages/contracts/gateway/fields.py`: agent request/response field 이름을 맞춘다.
- `deploy/management/services.yaml`: management gateway endpoint와 target agent 연결을 이해한다.
- `scripts/up.sh`: management/target 전체 배포에서 target 등록 순서를 이해한다.

변경 전 조율 파일:

- command action/payload 변경: GitOps/Command와 조율한다.
- evidence payload 변경: RCA/Safe PR, Platform/Integration과 조율한다.
- target registration/auth 변경: Gateway/Auth와 조율한다.
- RBAC 권한 확대: Platform/Integration 리뷰를 받는다.

## 파일 변경 판단표

| 상황 | 기준 |
| --- | --- |
| 내 담당 서비스 `app.py`만 변경 | 담당자가 직접 진행 가능 |
| `src/packages/contracts/**` 변경 | 담당자 직접 진행 가능하지만 관련 팀 리뷰 필요 |
| `src/packages/runtime/**` 변경 | Platform/Integration 리뷰 필요 |
| `src/packages/storage/schema.py` 변경 | DB 영향 문서와 migration/검증 필요 |
| `deploy/**` 변경 | 실제 `kubectl`/`helm` 또는 manifest 검증 필요 |
| `scripts/up.sh`, `scripts/register-target.sh` 변경 | E2E smoke 필요 |
| `docs/events.md` 변경 | event body/test와 함께 변경 |
| 다른 팀원 브랜치 변경 | 금지. 가이드나 PR comment로 안내 |

## PR 체크리스트

- 내 담당 파일과 공유 파일을 구분했다.
- 공유 contract를 바꿨다면 관련 팀 문서를 함께 갱신했다.
- event/API/DB/RBAC/배포 변경은 테스트 또는 smoke 증거를 남겼다.
- 다른 팀원 브랜치에 직접 merge/rebase/push하지 않았다.
- `make check` 또는 변경 범위에 맞는 최소 테스트를 실행했다.
