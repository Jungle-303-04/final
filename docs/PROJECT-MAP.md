# Project Map

이 문서는 현재 작업트리의 코드 표면을 기준으로 한다. 정리 의도는 [Cleanup Matrix](./CLEANUP-MATRIX.md)에 따로 두고, 여기서는 없는 구현을 제거된 것처럼 쓰지 않는다.

## Runtime

`uv run python scripts/services.py` 기준 현재 서비스 카탈로그는 37개다. 파일 시스템에는 catalog 밖 `src/services/mcp/internal_control/app.py`까지 포함해 `src/services/**/app.py`가 38개 있다.

| 구간 | 서비스 |
|---|---|
| AI/RCA | `ai-fallback-worker`, `analyze-worker`, `approval-worker`, `backlog-worker`, `chat-worker`, `ai-diff-worker`, `dispatch-worker`, `evidence-worker`, `incident-worker`, `plan-worker`, `rca-feedback-worker`, `rca-worker`, `recovery-worker`, `rollout-worker`, `select-worker` |
| Alert | `alert-worker` |
| Command | `command-worker`, `command-janitor` |
| Gateway | `api-gateway`, `outbox-relay` |
| GitOps | `auto-revert-worker`, `diff-analyze-worker`, `diff-worker`, `git-pull-worker`, `github-poll-worker`, `manifest-render-worker`, `safe-pr-worker`, `scm-worker`, `workflow-controller` |
| Mail | `mail-worker` |
| Projection | `audit-worker`, `change-correlation-worker`, `dashboard-worker`, `dead-letter-monitor`, `rca-timeline-janitor`, `release-flow-worker` |
| Realtime | `realtime-gateway` |

Golden Path에서 직접 필요한 핵심은 evidence → incident/RCA → Safe PR → verification 흐름이다. 다만 현재 저장소에는 command, dashboard, realtime, release-flow, auto-revert, chat, mail 같은 넓은 기능 표면이 아직 코드로 남아 있다. `src/domains/target`과 `src/services/target` service 표면은 현재 작업트리에서 삭제된 상태다.

## HTTP와 UI

`api-gateway`의 실제 router 합성은 `src/services/gateway/api-gateway/gateway.py`가 기준이다. 현재 포함되는 router는 identity/session, identity admin, GitHub App/repository discovery, GitOps webhook, RCA command/query, RCA bundle이다.

`src/packages/contracts/gateway/routes.py`에는 gateway에 직접 include되지 않는 command, dashboard, release-flow, realtime 보조 경로 상수도 남아 있다. route 상수가 있다는 사실만으로 `api-gateway`에 router가 포함됐다고 해석하지 않는다.

현재 repository에는 command API router, dashboard API router, timeline stream router, realtime gateway, terminal/port-forward broker 코드가 존재한다. Golden Path 문서는 PR-only 안전 경계를 설명하지만, 이 넓은 표면은 아직 정리 대상 코드로 남아 있다.

## Worker 구독

`src/services/**/app.py`의 decorator가 worker 설명의 source of truth다.

- `@app.on_any`: `projection/dashboard-worker`, `projection/audit-worker`
- command 계열: `command-worker`가 `CommandRequestedBody`를 구독하고 `command-janitor`가 만료 command를 정리한다.
- release-flow 계열: `release-flow-worker`와 `workflow-controller`가 command, approval, workflow, Safe PR 이벤트를 넓게 구독한다.
- Golden Path 계열: evidence, incident, plan, analyze, RCA, recovery, select, dispatch, diff, safe-pr, scm, feedback worker가 evidence/RCA/Safe PR/verification 이벤트를 구독한다.

## Target와 Provider

현재 작업트리에는 `src/domains/target`과 `src/services/target` 아래의 cluster-agent, node-collector, drift/reconcile worker가 없다. 따라서 활성 `TargetClusterAgent`, target-agent command adapter, target-agent provider module을 구현된 표면처럼 설명하지 않는다.

`src/services/target/cluster-agent/telemetry_registry.py`와 `providers/*_providers.py`도 현재 없다. target-agent `@telemetry.source(...)` decorator는 source of truth로 사용할 수 없다.

Kubernetes read-only 근거는 현재 chart RBAC와 manifest gate에 있다. [`agent-rbac.yaml`](../charts/opsia/templates/agent-rbac.yaml)은 `get/list/watch`만 부여하고, [`manifest-check.sh`](../scripts/manifest-check.sh)는 mutation verb, wildcard, exec/attach/port-forward/proxy RBAC를 거부한다.

## Event와 Domain

현재 `src/domains/*/events.py`는 12개다.

`ai`, `alert`, `checks`, `command`, `gitops`, `helm`, `integrations`, `inventory`, `mail`, `rca`, `scm`, `shell_state`

event subject와 body는 `src/packages/contracts/event_bus/subjects.py`, `src/packages/contracts/event_bus/bodies`, `src/domains/*/events.py`를 기준으로 확인한다.

## 디렉터리 책임

| 경로 | 현재 책임 |
|---|---|
| `src/entrypoints` | controller composition root |
| `src/packages/contracts` | route, request/response DTO, event body 공통 계약 |
| `src/packages/runtime` | App decorator, worker 실행, event/outbox/ledger runtime |
| `src/domains` | REST router, domain model/repository/event |
| `src/services` | worker/app entrypoint, gateway |
| `frontend` | React/Vite console |
| `charts/opsia` | Helm install surface와 RBAC |
| `tests` | docs, Bruno, Golden Path safety, recovery lifecycle 검증 |
