# KubeHeal 서비스 통합 계획 (Service Consolidation Plan)

> 목표: 관리 평면(management-plane) 마이크로서비스 **~31개 → 18개**로 통합
> 작성일: 2026-07-07 · 기준 커밋: `dev` 브랜치 스냅샷
> 분석 범위: `src/services/**`, `deploy/management/**`, `src/packages/runtime|events|contracts`

---

## 0. 요약 (TL;DR)

- 이 시스템은 **NATS JetStream 단일 스트림(`SERVICE_EVENTS`) + 이벤트 소싱** 기반이며, 각 서비스는 `App("<name>")` 런타임 위에서 `@app.on(<Body>)` 로 **subject를 구독 → 다른 Body를 `yield`(publish)** 하는 파이프라인 노드다.
- **DB는 물리적으로 단일 Postgres**(pgbouncer 경유)다. 도메인 repo가 `domains/registry.py`에서 하나의 `Database` 객체로 자동 합성되고, 서비스는 `EventContext[XxxStore]` **타입 힌트로만** 자기 능력 슬라이스를 본다. → **서비스를 합쳐도 DB 스키마 충돌은 원천적으로 없다.**
- 통합 난이도의 핵심은 DB가 아니라 **NATS durable consumer 이름**이다. durable 이름 = 서비스 이름(멀티 subject면 `{서비스}-{subject-slug}`)이고, `consumer_config()`에 **deliver policy 미지정 → NATS 기본 `DeliverAll`**. 즉 **서비스 이름을 바꾸면 새 durable이 생겨 7일치 스트림을 재생(replay)** 한다. → 통합 시 최대 리스크. `event_processing` 멱등 테이블이 완충한다.
- RCA 분석 체인과 GitOps 체인은 **선형 이벤트 파이프라인**이라 병합이 자연스럽다. 반대로 LLM 호출 워커(`ai-chat`, `ai-fallback`)와 무거운 subprocess 워커(`manifest-render`, `diff`)는 **격리 유지**를 권장한다.

---

## 1. 서비스 인벤토리

`src/services/` 아래 배포 단위(각 디렉터리의 `app.py` = 1 배포)는 다음과 같다. `src/services/ai/agent`은 **배포 대상이 아니라 RCA/복구 파이프라인 공용 패키지**다(워커들이 import).

### 1.1 도메인별 배포 단위 (관리 평면 34, 대상 클러스터 2)

| # | 그룹 | 서비스 | 한 줄 역할 | 구독(subject) | 발행(subject) | Store |
|---|------|--------|-----------|--------------|--------------|-------|
| 1 | AI/RCA | `evidence-worker` | 클러스터 증거 정규화 | `cluster.evidence.received` | `evidence.built` | `RcaStore` |
| 2 | AI/RCA | `incident-worker` | 장애 판정 + 증거 번들 구성 | `evidence.built` | `incident.detected`, `evidence.bundle.built` / `rca.action_required` | – |
| 3 | AI/RCA | `plan-worker` | 원인 후보 생성 | `evidence.bundle.built` | `rca.candidates.planned` (+`rca.rule_missing`,`rca.backlog.created`,`rca.ai_fallback.requested`) | – |
| 4 | AI/RCA | `analyze-worker` | 후보 평가 | `rca.candidates.planned` | `rca.candidates.evaluated` / `pipeline.contract_failed` | – |
| 5 | AI/RCA | `rca-worker` | 근본 원인 확정 | `rca.candidates.evaluated` | `rca.completed` | `RcaStore` |
| 6 | AI/RCA | `recovery-worker` | 복구 조치 계획 | `rca.completed` | `recovery.planned` / `rca.action_required` | – |
| 7 | AI/RCA | `select-worker` | 복구안 자동선택/승인요청 | `recovery.planned` | `recovery.action_selected` / `recovery.selection_requested` / `rca.action_required` | `RecoveryPlanStore` |
| 8 | AI/RCA | `dispatch-worker` | 선택된 조치 라우팅 | `recovery.action_selected` | `command.requested` / `safe_pr.requested` / `rca.action_required` | – |
| 9 | AI/RCA | `approval-worker` | 승인 보조 판단 | `recovery.selection_requested`, `rollout.diagnosed` | `approval.recommended` | `RecoveryPlanStore`(조건부) |
| 10 | AI/RCA | `ai-fallback-worker` | 룰 미매칭 시 **LLM** 후보 생성 | `rca.ai_fallback.requested` | `rca.candidates.planned` | – |
| 11 | AI/RCA | `rca-feedback-worker` | RCA 차단/후속조치 정규화 | `rca.analysis_blocked`, `rca.action_required`, `rca.ai_fallback.requested`, `pipeline.contract_failed` | `rca.followup.required` | – |
| 12 | AI/RCA | `backlog-worker` | RCA 룰 개선 백로그 적재 | `rca.backlog.created` | – (터미널) | `RcaBacklogStore` |
| 13 | AI/RCA | `rollout-worker` | 명령 실행 결과 진단 | `command.completed` | `rollout.diagnosed` | – |
| 14 | AI/RCA | `ai-diff-worker` | Safe PR 패치 검증·정책 게이트 | `safe_pr.patch_prepared` | `diff.explained`, `safe_pr.ready_for_creation` / `safe_pr.failed` | – |
| 15 | AI/RCA | `ai-chat-worker` | **LLM** 대화형 에이전트(멀티턴 tool use) | `ai.message.received` | `ai.message.responded` / `ai.message.failed` | `AiConversationStore` |
| 16 | GitOps | `github-poll-worker` | GitHub 폴링 → 게이트웨이 webhook POST | – (타이머 producer) | HTTP → `/api/github/webhook` | – |
| 17 | GitOps | `git-pull-worker` | git 변경 확정·식별자 정규화 | `git.webhook.received` | `git.changed` | – |
| 18 | GitOps | `manifest-render-worker` | k8s manifest 렌더(raw/kustomize/helm) | `git.changed` | `manifest.rendered` / `manifest.invalid` | `RepoChangeStore` |
| 19 | GitOps | `diff-worker` | 원하는 manifest vs 실제 상태 diff | `manifest.rendered` | `desired.diff.detected` | – (조건부 조회) |
| 20 | GitOps | `diff-analyze-worker` | diff 위험도 분석·정책 결정 | `desired.diff.detected` | `diff.analyzed`, `safe_pr.requested`, `alert.requested` | – (조건부) |
| 21 | GitOps | `safe-pr-worker` | Safe PR 요청 검증·패치 초안 | `safe_pr.requested` | `safe_pr.patch_prepared` / `safe_pr.failed` | – |
| 22 | GitOps | `scm-worker` | GitHub PR 생성 | `safe_pr.ready_for_creation` | `safe_pr.created` / `safe_pr.failed` | `PullRequestStore` |
| 23 | GitOps | `workflow-controller` | 이벤트 흐름 → 실행 객체(App/Run/Approval) 투영 | **12+개** gitops/command 이벤트 | `workflow.*`, `approval.requested`, `git.webhook.received`(승격) | `WorkflowStore` |
| 24 | Target | `target-reconcile-worker` | 목표 vs 실제 상태 조정 | `cluster.desired_state.changed`, `cluster.reconcile.requested` | `cluster.reconcile.started/completed/failed`, `cluster.drift.detected` | `TargetReconcileStore` |
| 25 | Target | `drift-worker` | 드리프트 → 동기화 명령·알림 | `cluster.drift.detected` | `command.requested`, `alert.requested` | – |
| 26 | Command | `command-worker` | 명령 실행 요청 처리(정책→디스패치) | `command.requested` | 명령 결과 이벤트 | `AgentCommandStore` |
| 27 | Command | `command-janitor` | 만료 명령 주기 스윕 | – (타이머 15s) | `command.completed` | 직접 `Database` |
| 28 | Projection | `audit-worker` | 전 이벤트 append-only 감사 로그 | **`>` (on_any)** | – (터미널) | `AuditStore` |
| 29 | Projection | `dashboard-worker` | 전 이벤트 → RCA 타임라인 투영 | **`>` (on_any)** | – (터미널) | `DashboardStore` |
| 30 | Projection | `dead-letter-monitor` | 데드레터 → 알림 승격 | `deadletter.created` | `alert.requested` | – |
| 31 | Edge | `api-gateway` | HTTP/WS 게이트웨이 + NATS 브리지(outbox relay) | (라우터로 전 이벤트) | `git.webhook.received`, `approval.granted/rejected`, `command.requested` 등 | 직접 `Database` + Redis |
| 32 | Edge | `realtime-gateway` | cluster-agent 라이브 스트림 → 브라우저 팬아웃(WebSocket) | – | 브라우저로 `LiveSummary`/`ResourceDelta` | `RedisSessionStore` |
| 33 | Edge | `mail-worker` | 이메일 인증 발송(**SMTP**) | `mail.email_verification.requested` | `...sent` / `...failed` | – |
| 34 | Edge | `alert-worker` | 알림 디스패치(**webhook HTTP**) | `alert.requested` | `alert.dispatched` / `alert.rejected` (+next_command) | – (조건부 채널 조회) |
| T1 | Target-cluster | `cluster-agent` | 대상 클러스터 명령 실행·증거 수집·라이브 델타 | – (관리평면 클라이언트) | WS → realtime-gateway | 로컬 SQLite |
| T2 | Target-cluster | `node-collector` | 노드 메트릭 수집(DaemonSet) | – (HTTP) | `/metrics`, `/snapshot` | – |

> **인프라(통합 대상 아님):** `console`(프론트 SPA), `pgbouncer`, `redis`, `nats`.
> **"31개" 카운트 정합:** 관리 평면 애플리케이션 배포는 34개다. 흔히 인용되는 "31"은 HTTP/WS 프론트도어 3종(`api-gateway`, `realtime-gateway`, `github-poll-worker`)을 워커 집계에서 빼거나, 타이머/폴링 producer를 별도 취급할 때의 수치다. 본 문서는 **34개 기준**으로 표기하되 목표를 18개로 잡는다(감축 16, 프론트도어 3종 제외 시 감축 13 = "31→18"과 동일).

### 1.2 관측된 이벤트 파이프라인 (핵심 3개 체인)

```
[RCA 분석 체인]
cluster.evidence.received
  → evidence-worker → evidence.built
  → incident-worker → evidence.bundle.built
  → plan-worker     → rca.candidates.planned ──┐
  → analyze-worker  → rca.candidates.evaluated │  (ai-fallback-worker 가
  → rca-worker      → rca.completed            │   rca.ai_fallback.requested
                                               └──→ rca.candidates.planned 로 병합 진입)
[복구 체인]
rca.completed
  → recovery-worker → recovery.planned
  → select-worker   → recovery.action_selected | recovery.selection_requested
  → (approval-worker: selection_requested/rollout.diagnosed → approval.recommended)
  → dispatch-worker → command.requested | safe_pr.requested | rca.action_required
  → (command.completed → rollout-worker → rollout.diagnosed)

[GitOps 체인]
git.webhook.received
  → git-pull-worker       → git.changed
  → manifest-render-worker→ manifest.rendered
  → diff-worker           → desired.diff.detected
  → diff-analyze-worker   → diff.analyzed (+ safe_pr.requested)
  → safe-pr-worker        → safe_pr.patch_prepared
  → ai-diff-worker        → safe_pr.ready_for_creation
  → scm-worker            → safe_pr.created
  (workflow-controller 가 위 전 구간을 on-subject 로 관찰하며 실행 객체로 투영)
```

이 세 체인이 **선형**이라는 점이 통합의 핵심 근거다. 한 체인의 인접 노드들은 같은 도메인 데이터와 같은 `agent` 파이프라인 패키지를 공유하므로, 하나의 `App`에 여러 `@app.on` 핸들러로 합쳐도 로직 변경 없이 동작한다.

---

## 2. 아키텍처 의존성 분석 (통합 관점)

### 2.1 런타임/이벤트 배선
- 서비스 = `App("<name>")` + `@app.on(<Body>)`. subject는 Body의 `__subject__`(= `@event` 등록)에서 파생.
- **한 App은 서로 다른 Store 타입을 쓰는 여러 핸들러를 가질 수 있다.** `EventContext[XxxStore]`는 타입 힌트일 뿐, 런타임의 `ctx.db`는 전체 `Database`다(`domains/registry.py`가 코어 + 자동발견 도메인 repo를 `type()`으로 합성). → **병합 시 Store 재배선 불필요.**
- `App.on_any`(`>` 구독)는 서비스당 1개만 허용. `audit-worker`, `dashboard-worker`가 이를 사용.

### 2.2 DB 의존성 — **이미 공유 상태**
- 물리 DB는 하나(Postgres, pgbouncer). 테이블 소유는 도메인 repo 단위의 **논리적 분리**일 뿐, 스키마/커넥션은 전 서비스 공통(`management-runtime-config/secret`).
- 이벤트 소싱 코어 테이블: `events`, `event_processing`(멱등), `event_dead_letters`, `outbox`. 도메인 테이블은 `domains/*/models.py`가 같은 `Base.metadata`에 등록.
- **함의:** 서비스를 합쳐도 새로운 DB, 새로운 스키마, 커넥션 풀 분리 이슈가 발생하지 않는다. 오히려 **DB 커넥션/풀 총량이 줄어드는(pgbouncer 부하 감소)** 이득이 있다.

### 2.3 NATS durable consumer — **통합의 진짜 제약**
- durable 이름 규칙(`runtime/worker.py`, `subscriptions.py`):
  - 단일 subject 서비스 → durable = **서비스 이름** (예: `evidence-worker`)
  - 멀티 subject 서비스 → subject별 durable = **`{서비스}-{subject-slug}`** (예: `rca-analysis-worker-evidence-built`)
- `consumer_config()`는 `ack_wait`/`max_deliver`/`max_ack_pending`만 설정하고 **deliver policy 미지정 → NATS 기본 `DeliverAll`**.
- 스트림 보존: **7일 / 512MiB**, 중복 억제창 24h.
- **함의:** 서비스 이름이 바뀌면(=대부분의 병합) **새 durable이 스트림 처음부터 재생**한다. `event_processing` 멱등 테이블이 재처리를 흡수하지만, 컷오버 순간 **대량 replay 부하**가 발생한다. → 마이그레이션 절차 필수(§4.1).

### 2.4 서비스 성격 분류 (병합 적합성)
| 성격 | 서비스 | 병합 적합성 |
|------|--------|-------------|
| 순수 계산(외부 I/O 없음) | incident/plan/analyze/rca/recovery/select/dispatch/safe-pr/diff-analyze/rca-feedback/rollout/backlog | ★ 매우 높음 |
| 도메인 DB 쓰기 | evidence/rca/select/approval/workflow-controller/command/manifest-render/scm | ★ 높음(같은 DB) |
| **LLM 호출** | ai-chat, ai-fallback | ✗ 격리 유지(지연·비용·타임아웃 특성 상이) |
| **무거운 subprocess/FS** | manifest-render(git·helm·kubectl), diff(kubectl dry-run) | △ 신중(리소스·크래시 격리) |
| **외부 네트워크** | mail(SMTP), alert(webhook), scm(GitHub API), github-poll | △ 실패 격리 고려 |
| **on_any 광역 구독** | audit, dashboard | △ durable 재생 주의 |
| HTTP/WS 프론트도어 | api-gateway, realtime-gateway | ✗ 유지(독립 스케일) |
| 대상 클러스터 상주 | cluster-agent, node-collector | ✗ 유지(배포 위치 다름) |

---

## 3. 통합안: 34 → 18

병합 원칙: **① 같은 도메인 ② 같은 이벤트 체인의 인접 노드 ③ 같은 Store/agent 패키지 ④ 유사한 실패·스케일 특성.** LLM·무거운 subprocess·프론트도어는 격리.

### 3.1 목표 서비스 18개

| # | 통합 서비스 | 흡수 대상 | 근거 | 리스크 |
|---|-------------|-----------|------|--------|
| 1 | **rca-analysis-worker** | evidence + incident + plan + analyze + rca (5) | RCA 선형 체인. 동일 `RcaStore` + `agent.pipeline`. 외부 I/O 없음 | 낮음 |
| 2 | **recovery-orchestrator** | recovery + select + dispatch + approval (4) | 복구 계획→선택→승인→라우팅. `RecoveryPlanStore` + `agent.recovery` 공유 | 낮음 |
| 3 | **rca-followup-worker** | backlog + rca-feedback + rollout (3) | RCA 사이드/터미널 소비자. 순수 계산·터미널 쓰기 | 낮음 |
| 4 | **ai-fallback-worker** | (유지) | LLM 호출. 지연/비용 격리 | – |
| 5 | **ai-chat-worker** | (유지) | LLM 대화형. 별도 Store·스케일 | – |
| 6 | **gitops-render-worker** | git-pull + manifest-render + diff (3) | webhook→manifest→diff 체인. `RepoChangeStore`·repo 캐시 공유 | 중간(subprocess/FS) |
| 7 | **gitops-safepr-worker** | diff-analyze + safe-pr + ai-diff + scm (4) | Safe PR 파이프라인(diff.analyzed→…→safe_pr.created) | 중간(GitHub API) |
| 8 | **workflow-controller** | (유지) | 12+ subject 광역 투영. 중앙 상태기계, 묻지 말고 독립 유지 | – |
| 9 | **github-poll-worker** | (유지) | 타이머 폴링 producer. webhook 대체 가능한 독립 실패면 | – |
| 10 | **target-sync-worker** | reconcile + drift (2) | reconcile→drift.detected→command/alert 인접 체인. `TargetReconcileStore` | 낮음 |
| 11 | **command-worker** | + command-janitor 스윕 흡수 (2) | command-worker가 이미 기회적 스윕 수행. janitor는 타이머일 뿐 | 낮음 |
| 12 | **projection-worker** | audit + dashboard (2) | 둘 다 `on_any` 광역 구독. 한 프로세스에서 두 투영 수행 → durable 1개로 스트림 소비 감소 | 중간(on_any) |
| 13 | **dead-letter-monitor** | (유지) | 별도 subject·알림 관심사 | – |
| 14 | **api-gateway** | (유지) | HTTP 인그레스·DB 집약·독립 스케일 | – |
| 15 | **realtime-gateway** | (유지) | WebSocket 팬아웃 | – |
| 16 | **notification-worker** | mail + alert (2) | 외부 발신 터미널 소비자. 알림 도메인 통합 | 낮음~중간(SMTP+webhook) |
| 17 | **cluster-agent** | (유지, 대상 클러스터) | 배포 위치 상이 | – |
| 18 | **node-collector** | (유지, 대상 클러스터) | DaemonSet, 배포 위치 상이 | – |

**감축: 34 → 18 (–16).** (프론트도어 3종을 워커 집계에서 제외하면 "31 → 18".)

### 3.2 통합 매핑 다이어그램

```
AI/RCA (15) ──────────────────────────────────────► 5
  evidence·incident·plan·analyze·rca     → rca-analysis-worker
  recovery·select·dispatch·approval      → recovery-orchestrator
  backlog·rca-feedback·rollout           → rca-followup-worker
  ai-fallback                            → (유지)
  ai-chat                                → (유지)

GitOps (8) ───────────────────────────────────────► 4
  git-pull·manifest-render·diff          → gitops-render-worker
  diff-analyze·safe-pr·ai-diff·scm       → gitops-safepr-worker
  workflow-controller                    → (유지)
  github-poll                            → (유지)

Target (2) → target-sync-worker (1)
Command (2) → command-worker (1)
Projection (3) → projection-worker + dead-letter-monitor (2)
Edge (4) → api-gateway + realtime-gateway + notification-worker (3)
Target-cluster (2) → cluster-agent + node-collector (2, 불변)
```

> **주의:** `ai-diff-worker`는 이름상 AI 그룹이지만 실제로는 Safe PR 파이프라인 노드이므로 **GitOps 쪽(gitops-safepr-worker)** 으로 이동한다.

### 3.3 추가 감축 여지(선택)
목표(18) 초과 달성이 필요하면: `ai-fallback`를 `rca-analysis`에 흡수(단 LLM 격리 이점 상실), `github-poll`를 `gitops-render`에 흡수, `dead-letter-monitor`를 `notification-worker`에 흡수 → 최대 15까지 가능. 권장하지 않음(격리 이점 대비 실익 작음).

---

## 4. 통합 시 주의사항

### 4.1 [최우선] NATS durable 재생(replay) — 이름 변경 = 스트림 재처리
- 원인: durable = 서비스 이름 기반 + `DeliverAll` 기본. 병합 서비스는 **새 이름**이라 **새 durable**이 7일치를 처음부터 소비.
- 완화책(택1 조합):
  1. **멱등 신뢰 컷오버(권장)** — `event_processing` 테이블이 이미 처리한 이벤트를 스킵하므로, 신규 워커를 붙이면 replay는 대부분 no-op이 된다. 단 **컷오버 시점 처리량 스파이크**를 감안해 replicas·`max_ack_pending`을 일시 상향.
  2. **durable 이름 고정(무중단)** — 신규 App에 `WorkerService(durable_name=...)`를 명시해 **기존 durable 이름을 물려받는다**(subject별 durable이면 subject-slug까지 일치시켜야 함). 컨슈머 상태(ack 위치)를 그대로 이어받아 replay 회피. 사전에 `runtime/spec`/`App.run`에 durable override 경로 확인 필요.
  3. **스트림 신선도 축소** — 컷오버 전 유지보수 창에서 스트림을 드레인하거나 `DeliverNew`로 임시 전환(설정 변경 리스크 있어 비권장).
- 구dur/신dur **동시 구동 금지 구간 설계**: 같은 subject를 구dur(구서비스)과 신dur(신서비스)이 동시에 처리하면 **중복 부작용**(예: 중복 PR 생성, 중복 알림) 발생. 컷오버는 subject 단위로 원자적으로.

### 4.2 subject 충돌 — 실제로는 낮음, 단 두 가지 확인
- subject는 `EventSubject` StrEnum 전역 상수라 **동일 subject를 두 서비스가 publish하는 명명 충돌은 없다**(와이어 문자열이 enum에 고정).
- 확인 사항 A — **중복 구독 금지 위반**: `App.on`은 한 서비스가 같은 subject를 두 번 구독하면 부팅 시 `fail`. 병합 대상들이 **동일 subject를 구독하지 않는지** 확인. (예: `approval-worker`와 `rca-feedback-worker`는 둘 다 `rca.ai_fallback.requested`/`rollout.diagnosed`류를 볼 수 있으니 병합 조합에서 subject 셋 교집합 점검.)
- 확인 사항 B — **`on_any` + `on` 혼용 금지**: `projection-worker`(audit+dashboard)는 둘 다 `on_any`라 병합 가능하지만, `on_any` 서비스에는 다른 `@app.on` 핸들러를 섞을 수 없다(런타임이 `require`로 차단). 광역 구독 서비스에는 광역 소비자만 합칠 것.

### 4.3 DB — 스키마 충돌은 없음, 단 트랜잭션 경계 주의
- 공유 DB이므로 스키마/커넥션 분리 이슈 없음. 오히려 커넥션 수 감소 이득.
- 단, 병합으로 **한 핸들러가 여러 도메인 Store 메서드를 호출**하게 되면, 기존에 서비스 경계였던 지점이 이제 같은 프로세스 내 순차 호출이 된다. 각 도메인 쓰기의 **멱등성·부분 실패 시 재배달 안전성**(핸들러가 중간 실패 후 재실행돼도 안전한지)을 병합 단위로 재검증.
- `command-janitor`, `api-gateway`는 `App` 대신 **직접 `Database`**를 쓰므로(스윕 루프/HTTP), `command-worker`로 스윕을 흡수할 때는 타이머 루프를 워커 이벤트 루프에 얹는 방식(기회적 스윕 강화 or 백그라운드 태스크)으로 옮겨야 한다.

### 4.4 리소스·실패 격리 회귀
- `gitops-render-worker`는 git clone/helm/kubectl **subprocess + 로컬 FS 캐시(`/tmp/gitops-repo-cache`)**를 쓴다. 병합 후 한 파드에서 렌더 폭주 시 다른 핸들러까지 OOM/지연 전파. → **CPU/메모리 requests·limits 상향**, 필요 시 렌더만 별도 유지.
- `ai-chat`·`ai-fallback`는 LLM 지연(초 단위)·비용이 커서 다른 워커와 합치면 **ack_wait 초과/헤드오브라인 블로킹** 위험. → 격리 유지(위 표 반영).
- 외부 발신(`notification-worker`: SMTP+webhook)은 **fail-closed 정책**(alert-worker는 디스패치 실패 시 next_command 차단)이 mail 실패에까지 전파되지 않도록 핸들러별 예외 경계 유지.

### 4.5 배포/관측 마이그레이션
- `deploy/management/ai-workers.yaml`, `services.yaml` 등의 **Deployment/Service 이름, ServiceMonitor, 대시보드 패널, 알림 룰**이 서비스 이름에 결합. 병합 시 일괄 갱신 및 **구 Deployment 삭제 순서**(신규 Ready 확인 후 구 제거) 준수.
- 서비스 카탈로그(`events.note_handler`)로 구독 맵을 자동 노출하므로, 병합 후 **`make events`류 카탈로그로 subject 커버리지 회귀 검증**(누락 구독 = 파이프라인 단절).

---

## 5. 우선순위 (리스크 낮은 것부터)

**Phase 1 — 무위험 순수계산 병합 (외부 I/O 없음, 같은 Store/패키지)**
1. `rca-analysis-worker` (evidence+incident+plan+analyze+rca) — RCA 선형 체인, RcaStore/agent.pipeline 공유
2. `recovery-orchestrator` (recovery+select+dispatch+approval)
3. `rca-followup-worker` (backlog+rca-feedback+rollout)
4. `target-sync-worker` (reconcile+drift)
> 근거: 순수 계산 위주 → replay가 no-op에 가깝고 부작용(외부 호출) 없음. 멱등 컷오버(§4.1-1)로 안전.

**Phase 2 — DB 쓰기/타이머 흡수 (같은 DB, 경계 재검증 필요)**
5. `command-worker` + janitor 스윕 흡수 (타이머 → 워커 백그라운드)
6. `projection-worker` (audit+dashboard) — on_any 병합, durable 재생 주의(§4.1)

**Phase 3 — 외부 네트워크 통합 (실패 격리 검증)**
7. `notification-worker` (mail+alert) — SMTP+webhook, 핸들러별 예외 경계
8. `gitops-safepr-worker` (diff-analyze+safe-pr+ai-diff+scm) — GitHub API, **중복 PR 생성 방지** 컷오버 원자성 필수

**Phase 4 — 무거운 subprocess 병합 (리소스 격리 재설계)**
9. `gitops-render-worker` (git-pull+manifest-render+diff) — subprocess/FS, requests/limits 상향 후 병합

**변경 없음(격리 유지):** ai-chat, ai-fallback, workflow-controller, github-poll, dead-letter-monitor, api-gateway, realtime-gateway, cluster-agent, node-collector.

### 진행 체크리스트(각 Phase 공통)
- [ ] 병합 대상들의 **구독 subject 교집합 = ∅** 확인(중복 구독 부팅 실패 방지, §4.2-A)
- [ ] `on_any`/`on` 혼용 없음 확인(§4.2-B)
- [ ] durable 전략 결정: 멱등 컷오버 or durable 이름 고정(§4.1)
- [ ] 신규 Ready 후 구 Deployment 제거(동시 구동 구간 최소화, 부작용 워커는 원자적 컷오버)
- [ ] 배포 매니페스트·ServiceMonitor·대시보드·알림 룰 이름 갱신
- [ ] 카탈로그로 subject 커버리지 회귀 검증

---

## 부록 A. 근거 파일
- 런타임/배선: `src/packages/runtime/app.py`, `runtime/worker.py`, `runtime/service.py`, `runtime/dispatch.py`
- 이벤트/subject: `src/packages/contracts/event_bus/subjects.py`, `.../subscriptions.py`, `src/packages/events/bus.py`
- DB 합성: `src/domains/registry.py`, `src/packages/storage/{engine,schema,database}.py`, `src/packages/contracts/stores.py`
- 서비스 구현: `src/services/**/app.py`
- 배포: `deploy/management/{ai-workers,services,github-poll-worker}.yaml`, `deploy/kind/target.yaml`
