# 시스템 아키텍처 다이어그램 (최신화)

기준: `src/services`, `src/packages`, `deploy` 실제 코드 (2026-07-06 분석)

## 전체 아키텍처

```mermaid
flowchart TB
    GH["GitHub (SCM)"]
    UI["Console Frontend<br/>React 18 + Vite + TS, nginx 서빙<br/>Applications / Workflows / Approvals / RCA Timeline"]

    subgraph MGMT["관리 클러스터 (Management Cluster)"]
        GW["API Gateway (FastAPI)<br/>/auth·signup·login·verify-email, /github/webhook,<br/>/targets, /clusters/* (inventory·policy·connection),<br/>/applications, /approvals, /commands, /agent/*,<br/>/ai/conversations, /catalog, /providers,<br/>/orgs·/groups·/users·/access (identity admin),<br/>/dashboard/rca/*, /dead-letters(+replay),<br/>/metrics, /healthz, /readyz"]
        RTG["Realtime Gateway (FastAPI WS)<br/>/live/agent (agent inbound WS)<br/>/live/browser (browser fan-out)<br/>per-cluster agent token 인증 재사용"]

        BUS["NATS JetStream<br/>단일 스트림 SERVICE_EVENTS<br/>subjects: git·manifest·desired·diff·agent·cluster·command·<br/>evidence·incident·rca·recovery·safe_pr·rollout·approval·<br/>alert·mail·ai·workflow·dead_letter·pipeline·audit<br/>보존 7일/512MiB, dedupe 24h"]
        RT["Worker Event Runtime<br/>typed EventBody, outbox relay,<br/>event_processing ledger, retry→DLQ, replay"]

        subgraph GITOPS["GitOps"]
            GPW["git-pull-worker<br/>git.webhook.received → git.changed"]
            GHPW["github-poll-worker<br/>(AsyncService) GitHub 폴링"]
            MRW["manifest-render-worker<br/>git.changed → manifest.rendered/invalid"]
            DFW["diff-worker<br/>manifest.rendered → desired.diff.detected"]
            DAW["diff-analyze-worker<br/>desired.diff.detected → diff.analyzed"]
            SPW["safe-pr-worker<br/>safe_pr.requested → safe_pr.patch_prepared"]
            SCMW["scm-worker<br/>safe_pr.ready_for_creation → safe_pr.created/failed"]
        end

        subgraph WF["Workflow"]
            WFC["workflow-controller<br/>13개 subject 구독 →<br/>workflow.run.*, approval.requested, command.requested"]
        end

        subgraph CMDG["Command"]
            CW["command-worker<br/>command.requested → 정책 검사 →<br/>dispatched/queued_for_agent/rejected"]
            CJ["command-janitor<br/>(AsyncService) 만료 command 정리 → command.completed"]
        end

        subgraph TCTL["Target 제어"]
            TRW["target-reconcile-worker<br/>cluster.desired_state.changed →<br/>reconcile.requested/started/completed/failed"]
            TDW["target-drift-worker<br/>cluster.drift.detected 처리"]
        end

        subgraph AIRCA["AI / RCA 파이프라인"]
            EVW["evidence-worker<br/>cluster.evidence.received → evidence.built"]
            INW["incident-worker<br/>→ incident.detected / evidence.bundle.built"]
            PLW["plan-worker<br/>→ rca.candidates.planned"]
            ANW["analyze-worker<br/>→ rca.candidates.evaluated"]
            RCAW["rca-worker<br/>→ rca.completed / rca.action_required /<br/>rca.analysis_blocked / rca.rule_missing"]
            RCVW["recovery-worker<br/>→ recovery.planned"]
            SELW["select-worker<br/>→ recovery.action_selected / selection_requested"]
            APRW["approval-worker<br/>selection_requested·rollout.diagnosed →<br/>approval.recommended"]
            DSPW["dispatch-worker<br/>action_selected → command.requested / safe_pr.requested"]
            ADFW["ai-diff-worker<br/>safe_pr.patch_prepared → diff.explained"]
            ROLW["rollout-worker<br/>command.completed → rollout.diagnosed"]
            BKW["backlog-worker<br/>rca.backlog.created 적재"]
            RFW["rca-feedback-worker<br/>analysis_blocked·action_required·<br/>pipeline.contract_failed·ai_fallback.requested"]
            CHW["ai-chat-worker<br/>ai.message.received → responded/failed"]
        end

        subgraph PROJ["Projection"]
            AUW["audit-worker<br/>on_any(>) → 불변 audit log"]
            DBW["dashboard-worker<br/>on_any(>) → rca_timeline read model"]
            DLM["dead-letter-monitor<br/>dead_letter.created → alert.requested"]
        end

        subgraph NOTI["Alert / Mail"]
            ALW["alert-worker<br/>alert.requested → dispatched/rejected<br/>provider: log(기본)/webhook"]
            MLW["mail-worker<br/>mail.email_verification.requested → sent/failed"]
        end
    end

    subgraph STORE["스토리지 (Kubernetes workload)"]
        PGB["PgBouncer v1.25"]
        PG["PostgreSQL 17 (단일 인스턴스)<br/>events, event_processing, event_dead_letters, outbox,<br/>workflow/command/identity/inventory/rca_timeline/audit"]
        RD["Redis 7<br/>httpOnly session, rate limit,<br/>email verification token"]
        MIO["MinIO<br/>management object store<br/>evidence / manifest artifact bucket"]
    end

    subgraph TARGET["대상 클러스터 (Target Cluster)"]
        CA["cluster-agent (outbound-only)<br/>command poll/start/result/heartbeat,<br/>evidence job scheduler/collector,<br/>inventory snapshot, policy guard, debug query"]
        NC["node-collector (DaemonSet, 선택형)<br/>node/runtime metrics → /metrics (Prometheus scrape)"]
        K8S["Kubernetes API + RBAC<br/>read: pods/events/nodes/services<br/>write: sandbox namespace 한정"]
        TEL["Telemetry<br/>Prometheus / Loki / OTel Collector / Tempo<br/>target MinIO object store + provider adapter"]
    end

    GH -->|webhook HMAC| GW
    GHPW -->|poll| GH
    SCMW -->|PR 생성| GH

    UI -->|HTTPS, session cookie| GW
    RTG -->|"WS /live/browser"| UI

    GW <--> BUS
    BUS <--> RT
    RT <--> GITOPS
    RT <--> WF
    RT <--> CMDG
    RT <--> TCTL
    RT <--> AIRCA
    RT <--> PROJ
    RT <--> NOTI

    GW --> RD
    GW --> PGB
    RT --> PGB
    PGB --> PG

    CA -->|"outbound HTTPS /agent/*"| GW
    CA -->|"outbound WS /live/agent"| RTG
    CA --> K8S
    CA -->|node-collector 배포/관리| NC
    TEL --> CA
    NC --> TEL
```

## GitOps / 명령 이벤트 흐름

```mermaid
flowchart LR
    A["git.webhook.received"] --> B["git.changed"] --> C["manifest.rendered"] --> D["desired.diff.detected"] --> E["diff.analyzed"]
    E --> F["approval.requested → granted/rejected"]
    F --> G["command.requested"] --> H["command.queued_for_agent"]
    H --> I["agent polling 실행"] --> J["command.completed"]
    J --> K["workflow.run.completed / failed"]
    J --> L["rollout.diagnosed (rollout-worker)"]
```

## RCA / 자율 복구 이벤트 흐름

```mermaid
flowchart LR
    A["cluster.evidence.received"] --> B["evidence.built"] --> C["evidence.bundle.built<br/>(+ incident.detected)"]
    C --> D["rca.candidates.planned"] --> E["rca.candidates.evaluated"] --> F["rca.completed"]
    F --> G["recovery.planned"] --> H["recovery.action_selected<br/>또는 selection_requested"]
    H --> I["command.requested<br/>또는 safe_pr.requested"]
    I --> J["safe_pr.patch_prepared"] --> K["diff.explained"] --> L["safe_pr.ready_for_creation"] --> M["safe_pr.created / failed"]
```

## 첨부 다이어그램 대비 변경/누락 사항

| 구분 | 첨부 다이어그램 | 현재 코드 기준 |
| --- | --- | --- |
| 신규 | 없음 | **realtime-gateway**: agent live stream을 browser로 fan-out하는 WS 게이트웨이 (`/live/agent`, `/live/browser`) |
| 신규 | 없음 | **github-poll-worker**: webhook 불가 환경용 GitHub 폴링 (AsyncService) |
| 신규 | 없음 | **command-janitor**: 만료된 agent command 정리 → `command.completed` 발행 |
| 신규 | 없음 | **dead-letter-monitor**: `dead_letter.created` → `alert.requested` 운영 알림 연결 |
| 신규 | 없음 | **target-drift-worker**: `cluster.drift.detected` 전담 처리 |
| 신규 | 없음 | **ai-chat-worker**: AI conversation API (`/ai/conversations`) → `ai.message.*` |
| 신규 | 없음 | **backlog-worker**, **rca-feedback-worker**: RCA 개선 backlog·차단/폴백 피드백 루프 |
| 제거 | Git Cache Worker (repo mirror) | 별도 서비스 없음 — git-pull-worker 단일 파일로 통합 |
| 제거 | Rollout Observer / PR Status Watcher / Rollback PR Worker | 서비스 목록에 없음 — rollout-worker·scm-worker로 흡수 |
| 이름 변경 | Alert + Notification Worker (Slack/Email/Webhook) | **alert-worker** (provider: log/webhook) + **mail-worker** (이메일 인증)로 분리. Slack provider는 현재 코드에 없음 |
| 이름 변경 | Evidence Builder/Incident Detector/RCA Analyzer/Recovery Planner/Safe PR Agent/Diff Explanation/Rollout Diagnosis/Approval Assistant Worker | evidence / incident / plan / analyze / rca / recovery / select / approval / dispatch / ai-diff / rollout / safe-pr worker로 세분화·개명 |
| 변경 | PostgreSQL 3개 분리 (Event Runtime / GitOps State / Read·Audit) | **단일 PostgreSQL 17 + PgBouncer** 경유. 테이블 수준 분리 (events, outbox, event_processing, event_dead_letters, 도메인 테이블) |
| 변경 | Object / Secret Stores | **MinIO**는 management artifact bucket(`deploy/management/storage.yaml`)과 target Loki object store(`deploy/target/minio.yaml`, `deploy/target/loki.yaml`)로 배포된다. Secret은 **SecretVault** port (env / aws-secrets-manager / kubernetes-secret provider, `src/packages/security/vault.py`) + SOPS/age 암호화 (`secrets/*.enc.yaml`) |
| 변경 | Workflow Console Target "planned UI" | **console-frontend 구현 완료**: React 18 + Vite, nginx 컨테이너 (`deploy/management/console.yaml`) |
| 변경 | Telemetry "take Prometheus/Loki/OTel now; real adapters planned" | Prometheus·Loki·OTel Collector·**Tempo** 배포 존재 (`deploy/target/`), agent evidence provider adapter 구현됨 |
| 변경 | Gateway 경로 | `/clusters/*` inventory·policy API, `/applications`, `/approvals`, `/ai/conversations`, `/catalog`, `/providers`, identity admin(`/orgs`,`/groups`,`/users`,`/access`), `/readyz` 추가 |
| 변경 | Agent "command receiver" | command **poll/start/result/heartbeat** + evidence **job scheduler** + inventory snapshot + debug query + node-collector 배포 관리로 확장 |
| 유지 | NATS JetStream, DLQ/replay, outbox, event_processing | 동일 — 단일 스트림 `SERVICE_EVENTS`, 보존 7일/512MiB, dedupe window 24h 상세 추가 |
