# 스펙 인덱스 — 구현 명세 (Source of Truth)

> 이 폴더는 현재 구현과 100% 동기화되는 명세다. 작성·수정 규칙은 [_conventions.md](_conventions.md) 참고.
> 시스템 전체 그림은 [architecture.md](architecture.md)에서 시작한다.

## 계층 규칙

`services → domains → packages` 단방향 의존 ([.importlinter](../../.importlinter)로 CI 강제).

## packages — 공유 커널 (`src/packages/`)

| 스펙 | 소스 | 요약 |
|---|---|---|
| [contracts](packages/contracts.md) | `src/packages/contracts/` | 서비스 간 계약(인터페이스·DTO·이벤트 버스 계약) |
| [events](packages/events.md) | `src/packages/events/` | 이벤트 버스·엔벨로프 |
| [storage](packages/storage.md) | `src/packages/storage/` | DB 엔진·세션·스키마·리포지토리 기반 |
| [runtime](packages/runtime.md) | `src/packages/runtime/` | 워커 런타임 공통 |
| [security](packages/security.md) | `src/packages/security/` | 보안 유틸 |
| [config](packages/config.md) | `src/packages/config/` | 설정 로딩 |
| [ai](packages/ai.md) | `src/packages/ai/` | AI 공통(LLM 클라이언트 등) |

## domains — 도메인 계층 (`src/domains/`)

| 스펙 | 소스 | 요약 |
|---|---|---|
| [ai](domains/ai.md) | `src/domains/ai/` | |
| [alert](domains/alert.md) | `src/domains/alert/` | |
| [applications](domains/applications.md) | `src/domains/applications/` | |
| [audit](domains/audit.md) | `src/domains/audit/` | |
| [catalog](domains/catalog.md) | `src/domains/catalog/` | |
| [command](domains/command.md) | `src/domains/command/` | |
| [dashboard](domains/dashboard.md) | `src/domains/dashboard/` | |
| [gitops](domains/gitops.md) | `src/domains/gitops/` | |
| [identity](domains/identity.md) | `src/domains/identity/` | |
| [inventory](domains/inventory.md) | `src/domains/inventory/` | |
| [mail](domains/mail.md) | `src/domains/mail/` | |
| [providers](domains/providers.md) | `src/domains/providers/` | |
| [rca](domains/rca.md) | `src/domains/rca/` | |
| [scm](domains/scm.md) | `src/domains/scm/` | |
| [target](domains/target.md) | `src/domains/target/` | |
| [registry](domains/registry.md) | `src/domains/registry.py` | 도메인 자동 발견(합성 루트) |

## services — 프로세스 계층 (`src/services/`)

### gateway / realtime

| 스펙 | 소스 |
|---|---|
| [api-gateway](services/gateway/api-gateway.md) | `src/services/gateway/api-gateway/` |
| [realtime-gateway](services/realtime/realtime-gateway.md) | `src/services/realtime/realtime-gateway/` |

### ai

| 스펙 | 소스 |
|---|---|
| [agent (공유 파이프라인)](services/ai/agent.md) | `src/services/ai/agent/` |
| [analyze-worker](services/ai/analyze-worker.md) | `src/services/ai/analyze-worker/` |
| [approval-worker](services/ai/approval-worker.md) | `src/services/ai/approval-worker/` |
| [backlog-worker](services/ai/backlog-worker.md) | `src/services/ai/backlog-worker/` |
| [chat-worker](services/ai/chat-worker.md) | `src/services/ai/chat-worker/` |
| [diff-worker](services/ai/diff-worker.md) | `src/services/ai/diff-worker/` |
| [dispatch-worker](services/ai/dispatch-worker.md) | `src/services/ai/dispatch-worker/` |
| [evidence-worker](services/ai/evidence-worker.md) | `src/services/ai/evidence-worker/` |
| [incident-worker](services/ai/incident-worker.md) | `src/services/ai/incident-worker/` |
| [plan-worker](services/ai/plan-worker.md) | `src/services/ai/plan-worker/` |
| [rca-feedback-worker](services/ai/rca-feedback-worker.md) | `src/services/ai/rca-feedback-worker/` |
| [rca-worker](services/ai/rca-worker.md) | `src/services/ai/rca-worker/` |
| [recovery-worker](services/ai/recovery-worker.md) | `src/services/ai/recovery-worker/` |
| [rollout-worker](services/ai/rollout-worker.md) | `src/services/ai/rollout-worker/` |
| [safe-pr-worker](services/ai/safe-pr-worker.md) | `src/services/ai/safe-pr-worker/` |
| [select-worker](services/ai/select-worker.md) | `src/services/ai/select-worker/` |

### gitops

| 스펙 | 소스 |
|---|---|
| [diff-analyze-worker](services/gitops/diff-analyze-worker.md) | `src/services/gitops/diff-analyze-worker/` |
| [diff-worker](services/gitops/diff-worker.md) | `src/services/gitops/diff-worker/` |
| [git-pull-worker](services/gitops/git-pull-worker.md) | `src/services/gitops/git-pull-worker/` |
| [github-poll-worker](services/gitops/github-poll-worker.md) | `src/services/gitops/github-poll-worker/` |
| [manifest-render-worker](services/gitops/manifest-render-worker.md) | `src/services/gitops/manifest-render-worker/` |
| [safe-pr-worker](services/gitops/safe-pr-worker.md) | `src/services/gitops/safe-pr-worker/` |
| [scm-worker](services/gitops/scm-worker.md) | `src/services/gitops/scm-worker/` |
| [workflow-controller](services/gitops/workflow-controller.md) | `src/services/gitops/workflow-controller/` |

### target

| 스펙 | 소스 |
|---|---|
| [cluster-agent](services/target/cluster-agent.md) | `src/services/target/cluster-agent/` |
| [drift-worker](services/target/drift-worker.md) | `src/services/target/drift-worker/` |
| [node-collector](services/target/node-collector.md) | `src/services/target/node-collector/` |
| [reconcile-worker](services/target/reconcile-worker.md) | `src/services/target/reconcile-worker/` |

### projection / alert / command / mail

| 스펙 | 소스 |
|---|---|
| [audit-worker](services/projection/audit-worker.md) | `src/services/projection/audit-worker/` |
| [dashboard-worker](services/projection/dashboard-worker.md) | `src/services/projection/dashboard-worker/` |
| [dead-letter-monitor](services/projection/dead-letter-monitor.md) | `src/services/projection/dead-letter-monitor/` |
| [alert-worker](services/alert/alert-worker.md) | `src/services/alert/alert-worker/` |
| [command-worker](services/command/command-worker.md) | `src/services/command/command-worker/` |
| [command-janitor](services/command/command-janitor.md) | `src/services/command/command-janitor/` |
| [mail-worker](services/mail/mail-worker.md) | `src/services/mail/mail-worker/` |

## frontend (`frontend/src/`)

| 스펙 | 소스 | 요약 |
|---|---|---|
| [app](frontend/app.md) | `frontend/src/app/` | 셸·라우터·가드·프로바이더 |
| [shared](frontend/shared.md) | `frontend/src/shared/` | 공용 UI·lib·flow·motion·토큰 |
| [features/auth](frontend/features/auth.md) | `frontend/src/features/auth/` | |
| [features/chat](frontend/features/chat.md) | `frontend/src/features/chat/` | |
| [features/cluster](frontend/features/cluster.md) | `frontend/src/features/cluster/` | |
| [features/fleet](frontend/features/fleet.md) | `frontend/src/features/fleet/` | |
| [features/metrics](frontend/features/metrics.md) | `frontend/src/features/metrics/` | |
| [features/notifications](frontend/features/notifications.md) | `frontend/src/features/notifications/` | |
| [features/org](frontend/features/org.md) | `frontend/src/features/org/` | |
| [features/repo](frontend/features/repo.md) | `frontend/src/features/repo/` | |
| [features/resources](frontend/features/resources.md) | `frontend/src/features/resources/` | |
| [features/workflow](frontend/features/workflow.md) | `frontend/src/features/workflow/` | |
