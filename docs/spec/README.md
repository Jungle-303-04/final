# 스펙 인덱스 — 구현 명세

> 이 폴더는 현재 구현과 맞춰 읽는 상세 명세다. 작성·수정 규칙은 [_conventions.md](_conventions.md)에서 확인한다.
> 전체 시스템 그림은 [아키텍처](../architecture.md)와 [아키텍처 다이어그램](../architecture-diagram.md)에서 시작한다.

## 읽는 순서

1. [_conventions](_conventions.md)로 작성 규칙을 먼저 확인한다.
2. packages 문서에서 공유 계약과 런타임을 본다.
3. domains 문서에서 DB, route, event body를 본다.
4. services 문서에서 worker decorator와 event 흐름을 본다.
5. frontend 문서에서 화면, 권한 필터, API 호출 위치를 본다.

## 시스템 개요

- [architecture](architecture.md) — 스펙 레벨 토폴로지·핵심 이벤트 플로우·신뢰성 불변식
- [oss-profile](oss-profile.md) — PR-only 안전 기본값, 3컴포넌트 설치, composition root, `make demo`

## packages

- [packages/ai](packages/ai.md)
- [packages/config](packages/config.md)
- [packages/contracts](packages/contracts.md)
- [packages/events](packages/events.md)
- [packages/runtime](packages/runtime.md)
- [packages/security](packages/security.md)
- [packages/storage](packages/storage.md)

## domains

- [domains/ai](domains/ai.md)
- [domains/alert](domains/alert.md)
- [domains/applications](domains/applications.md)
- [domains/audit](domains/audit.md)
- [domains/catalog](domains/catalog.md)
- [domains/command](domains/command.md)
- [domains/dashboard](domains/dashboard.md)
- [domains/gitops](domains/gitops.md)
- [domains/identity](domains/identity.md)
- [domains/inventory](domains/inventory.md)
- [domains/mail](domains/mail.md)
- [domains/providers](domains/providers.md)
- [domains/rca](domains/rca.md)
- [domains/registry](domains/registry.md)
- [domains/scm](domains/scm.md)
- [domains/target](domains/target.md)

## services

- [services/ai-agent](services/ai-agent.md)
- [services/ai-ai-fallback-worker](services/ai-ai-fallback-worker.md)
- [services/ai-analyze-worker](services/ai-analyze-worker.md)
- [services/ai-approval-worker](services/ai-approval-worker.md)
- [services/ai-backlog-worker](services/ai-backlog-worker.md)
- [services/ai-chat-worker](services/ai-chat-worker.md)
- [services/ai-diff-worker](services/ai-diff-worker.md)
- [services/ai-dispatch-worker](services/ai-dispatch-worker.md)
- [recovery-authority-patches](recovery-authority-patches.md)
- [services/ai-evidence-worker](services/ai-evidence-worker.md)
- [services/ai-incident-worker](services/ai-incident-worker.md)
- [services/ai-plan-worker](services/ai-plan-worker.md)
- [services/ai-rca-feedback-worker](services/ai-rca-feedback-worker.md)
- [services/ai-rca-worker](services/ai-rca-worker.md)
- [services/ai-recovery-worker](services/ai-recovery-worker.md)
- [services/ai-rollout-worker](services/ai-rollout-worker.md)
- [services/ai-select-worker](services/ai-select-worker.md)
- [services/alert-alert-worker](services/alert-alert-worker.md)
- [services/command-command-janitor](services/command-command-janitor.md)
- [services/command-command-worker](services/command-command-worker.md)
- [services/gateway-api-gateway](services/gateway-api-gateway.md)
- [services/gateway-outbox-relay](services/gateway-outbox-relay.md)
- [services/gitops-diff-analyze-worker](services/gitops-diff-analyze-worker.md)
- [services/gitops-diff-worker](services/gitops-diff-worker.md)
- [services/gitops-git-pull-worker](services/gitops-git-pull-worker.md)
- [services/gitops-github-poll-worker](services/gitops-github-poll-worker.md)
- [services/gitops-manifest-render-worker](services/gitops-manifest-render-worker.md)
- [services/gitops-safe-pr-worker](services/gitops-safe-pr-worker.md)
- [services/gitops-scm-worker](services/gitops-scm-worker.md)
- [services/gitops-workflow-controller](services/gitops-workflow-controller.md)
- [services/mail-mail-worker](services/mail-mail-worker.md)
- [services/projection-audit-worker](services/projection-audit-worker.md)
- [services/projection-dashboard-worker](services/projection-dashboard-worker.md)
- [services/projection-dead-letter-monitor](services/projection-dead-letter-monitor.md)
- [services/projection-rca-timeline-janitor](services/projection-rca-timeline-janitor.md)
- [services/realtime-realtime-gateway](services/realtime-realtime-gateway.md)
- [services/target-cluster-agent](services/target-cluster-agent.md)
- [services/target-drift-worker](services/target-drift-worker.md)
- [services/target-node-collector](services/target-node-collector.md)
- [services/target-reconcile-worker](services/target-reconcile-worker.md)

## frontend

- [frontend/api-integration-workorder-20260711](frontend/api-integration-workorder-20260711.md)
- [frontend/api-needs](frontend/api-needs.md)
- [frontend/codex-directive-goalmode-20260711](frontend/codex-directive-goalmode-20260711.md)
- [frontend/codex-directive-hotfix-20260714](frontend/codex-directive-hotfix-20260714.md)
- [frontend/codex-progress-20260711](frontend/codex-progress-20260711.md)
- [frontend/final-questions](frontend/final-questions.md)
- [frontend/product-data-contract](frontend/product-data-contract.md)
- [frontend/reference-feature-inventory](frontend/reference-feature-inventory.md)
- [frontend/reference-contract-map](frontend/reference-contract-map.md)
- [frontend/reference-porting-contract](frontend/reference-porting-contract.md)
- [frontend/vp-018-shell-corrections](frontend/vp-018-shell-corrections.md)
- [frontend/vp-019-radar-full-port](frontend/vp-019-radar-full-port.md)

위 목록만 현재 frontend 구현의 활성 문서다. 같은 디렉터리의 `status: archived` 문서는 현재 작업에
참조하지 않는다.

### frontend 보존 링크

- [frontend/CODEX-BRIEFING-20260711](frontend/CODEX-BRIEFING-20260711.md) — archived, 현재 구현 참조 금지
- [frontend/codex-directive-24h-20260711](frontend/codex-directive-24h-20260711.md) — archived, 현재 구현 참조 금지
- [frontend/codex-directive-reference-pivot-20260711](frontend/codex-directive-reference-pivot-20260711.md) — archived, 현재 구현 참조 금지
- [frontend/topology-engine](frontend/topology-engine.md) — archived, 현재 구현 참조 금지
- [frontend/topology-message-action-schema](frontend/topology-message-action-schema.md) — archived, 현재 구현 참조 금지
- [frontend/topology-visual-motion-tokens](frontend/topology-visual-motion-tokens.md) — archived, 현재 구현 참조 금지

## 유지 규칙

새 스펙 문서를 추가하면 이 파일과 [문서 루트](../README.md)에 같이 연결한다.
서비스 문서는 `docs/spec/services/<그룹>-<프로세스>.md` 형태로 둔다. 루트 기준 문서 깊이를 넘기지 않기 위해 하위 폴더를 더 만들지 않는다.
문서가 실제 코드보다 앞서는 경우에는 구현 단계로만 적고, 이미 동작하는 것처럼 쓰지 않는다.
