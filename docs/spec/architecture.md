---
source_commit: 1616d295
status: synced
---

# 시스템 아키텍처 — 전체 토폴로지·이벤트 흐름

> 소스: `src/` 전체 · 경계 강제: `.importlinter` (CI `lint-imports`)
> 개별 컴포넌트 상세는 [README.md](README.md) 인덱스에서 각 스펙 페이지로.

## 계층 구조

```
┌─────────────────────────────────────────────────────┐
│ services/  프로세스 계층 (배포 단위, 하이픈 폴더명)     │
│  gateway · realtime · ai(16) · gitops(8) · target(4) │
│  projection(3) · alert · command(2) · mail           │
├─────────────────────────────────────────────────────┤
│ domains/   도메인 계층 (모델·이벤트·리포지토리·라우터)  │
│  16개 도메인 + registry.py(자동 발견)                 │
├─────────────────────────────────────────────────────┤
│ packages/  공유 커널 (계약·이벤트버스·스토리지·런타임)  │
└─────────────────────────────────────────────────────┘
```

- 의존 방향은 위→아래 단방향. 역방향 금지 (예외 2곳: [storage 합성 루트](packages/storage.md)의 `domains.registry` 동적 로딩, [contracts bodies](packages/contracts.md)의 lazy shim — `.importlinter`에 명시).
- 서비스 폴더명은 하이픈이라 Python 패키지로 import 불가 → **서비스 간 직접 import는 구조적으로 불가능**. 서비스 간 통신은 이벤트 버스로만.

## 인프라 구성요소

| 구성요소 | 역할 | 스펙 |
|---|---|---|
| NATS JetStream | 이벤트 버스 (subject = `EventSubject`, durable pull consumer, dedup 헤더) | [packages/events](packages/events.md) |
| PostgreSQL | 단일 DB, 도메인별 테이블 + outbox | [packages/storage](packages/storage.md) |
| Redis | 브라우저 세션·레이트리밋·이메일 검증 토큰 | [packages/storage](packages/storage.md#redissessionstore), [api-gateway](services/gateway-api-gateway.md) |
| Outbox Relay | DB 트랜잭션 커밋 후 이벤트 발행 (정확히-한-번 지향) | [packages/runtime](packages/runtime.md) |
| LLM Gateway | provider별 어댑터(모델·재시도 정책) | [packages/ai](packages/ai.md) |

## 프로세스 토폴로지

- **진입점**: [api-gateway](services/gateway-api-gateway.md)가 12개 도메인 라우터를 단일 프로세스로 조립(리버스 프록시 아님). 인증은 opaque 토큰 + Redis 세션(JWT 없음).
- **실시간**: [realtime-gateway](services/realtime-realtime-gateway.md) — WebSocket 전용(`realtime.v1`), `/live/agent`(에이전트 토큰) · `/live/browser`(Redis 세션).
- **타깃 클러스터**: [cluster-agent](services/target-cluster-agent.md)가 k8s 클러스터 안에서 실행되어 게이트웨이/realtime과 통신. SQLite outbox, k8s/Loki/Prometheus/Tempo 조회.
- **프로젝션**: [audit-worker](services/projection-audit-worker.md)(`>` 전체 구독 → `audit_log`), [dashboard-worker](services/projection-dashboard-worker.md)(27개 subject → `rca_timeline`), [dead-letter-monitor](services/projection-dead-letter-monitor.md)(DLQ → alert).

## 핵심 이벤트 플로우

### 1. GitOps 배포 플로우

```
github-poll-worker ─(GitHub API 폴링)→ POST /github/webhook
  → git.webhook.received → [git-pull-worker] → git.changed
  → [manifest-render-worker] → manifest.rendered | manifest.invalid
  → [diff-worker(gitops)] → desired.diff.detected
  → [diff-analyze-worker] → diff.analyzed (+ safe_pr.requested)
  → [workflow-controller] 상태 머신: started→rendering→diffing→policy_checking
     →waiting_for_approval→applying→rollout_waiting→succeeded|failed
```

상세: [workflow-controller](services/gitops-workflow-controller.md), [gitops 도메인](domains/gitops.md)

### 2. RCA(원인 분석)·자동 복구 플로우

```
cluster.drift.detected / 장애 신호
  → [evidence-worker] → [incident-worker] → [plan-worker] → [analyze-worker]
  → [rca-worker](룰 엔진+LLM) → [recovery-worker] → [select-worker]
  → [dispatch-worker] → command.requested
  → [command-worker](정책·승인 검증) → 실행 lease → cluster-agent 실행
```

공유 파이프라인 로직: [services/ai/agent](services/ai-agent.md) (EvidenceBuilder → IncidentDetector → CausePlanner → RootCauseAnalyzer → RecoveryPlanner)
상세: [rca 도메인](domains/rca.md), [command 도메인](domains/command.md)

### 3. Safe PR 플로우

```
diff-analyze-worker → safe_pr.requested
  → [safe-pr-worker(gitops)] → safe_pr.patch_prepared
  → ... → safe_pr.ready_for_creation → [scm-worker] → GitHub PR → safe_pr.created
```

상세: [scm 도메인](domains/scm.md)

### 4. 알림·메일

```
* → alert.requested → [alert-worker](정책 게이트) → alert.dispatched | alert.rejected
identity 이벤트 → mail.send.requested → [mail-worker](smtp|log) → 발송
```

## 프론트엔드

[frontend/app](frontend/app.md)의 React SPA. [shared](frontend/shared.md)의 `api.ts`가 api-gateway REST 호출, `live.ts`가 `/api/live/browser` WebSocket 구독. 피처 10개는 [README 인덱스](README.md) 참조.

## 신뢰성 계약 (불변식)

- 이벤트 처리는 `EventProcessor`의 정확히-한-번 지향 파이프라인을 따른다: `PROCESSING_STALE_SECONDS(90) > ack_wait(60) > WORKER_HANDLER_TIMEOUT(30)`, `NATS_MAX_DELIVER(4) = WORKER_MAX_ATTEMPTS(3)+1` — 개별 env 오버라이드 시 이 부등식이 깨지면 안 된다. 상세: [packages/runtime](packages/runtime.md), [packages/config](packages/config.md)
- DB 변경과 이벤트 발행은 반드시 outbox를 경유한다(직접 publish 금지).
- 처리 실패 초과분은 DLQ로 → [dead-letter-monitor](services/projection-dead-letter-monitor.md)가 alert로 승격.
