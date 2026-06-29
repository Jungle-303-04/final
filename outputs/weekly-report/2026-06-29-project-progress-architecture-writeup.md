# 2026-06-29 프로젝트 수행 경과 작성안

## 확인 범위

이 문서는 2026-06-29 기준으로 아래 자료를 대조해 작성했다.

- final source repo 현재 작업 경로: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final`
- WIKI repo: `/Users/woonyong/workspace/Krafton-Jungle/WIKI`
- final repo 원격 브랜치: `origin/main`, `origin/dev`, `origin/feat/*`
- 첨부 아키텍처 이미지: `/Users/woonyong/capture/2026-06-29_10-50-57.png`
- 첨부 작성 템플릿 이미지: `/Users/woonyong/capture/2026-06-29_10-50-20.png`
- 환경 세팅 로그 이미지 폴더: `/Users/woonyong/Downloads/check(2026-06-29)/`
- RCA 데이터 카탈로그: `/Users/woonyong/Downloads/0628_rca_data_catalog.xlsx`

주의: 이 문서는 현재 레포 분석과 기존 검증 기록을 기준으로 한 작성안이다. 이번 분석 과정에서 `make check`, `make smoke`, `scripts/crash_test.sh`를 새로 재실행하지는 않았다. WIKI의 MVP 문서에는 2026-06-29 기준 CI, `make check`, `make status`, `make smoke`, crash test, DLQ replay가 통과한 것으로 기록되어 있다.

## 한 줄 요약

Kubernetes 장애 상황에서 Git 변경, 클러스터 증거, RCA, Safe PR, command, dashboard/audit을 하나의 이벤트 기반 흐름으로 연결하는 운영 보조 시스템을 만들고 있다. 현재 main/dev 기준으로는 Management API Gateway, NATS JetStream 이벤트 런타임, PostgreSQL/Redis 저장소, GitOps split workers, Command Worker, RCA Worker, Dashboard Projection, Audit Timeline, Target Agent, Node Collector, fake telemetry 기반 E2E 흐름이 구현되어 있다. 실제 Prometheus/Loki/OTel 연동은 코드 main에 완전히 통합된 상태는 아니지만, Target/Telemetry 브랜치와 환경 로그에서 설치, scrape, query, 로그 수집, evidence 저장 검증 흔적이 확인된다.

## 이미지 #1 슬라이드 표 작성안

아래 표는 `04 프로젝트 수행 경과 (도출과정)` 장표에 바로 넣을 수 있는 버전이다. 장표 폭이 좁으면 각 칸의 문장을 줄이고, 발표자 노트에는 다음 섹션의 상세 버전을 사용하면 된다.

| 구분 | 기술 및 구현방법 | 핵심 기능 | 기술적 챌린지 | 구현 결과 |
| --- | --- | --- | --- | --- |
| 1. 문제 정의와 MVP 범위 설정 | WIKI 제품 정의, WBS, 멘토링 기록을 기준으로 Kubernetes 운영자가 장애 시 Git 변경, Pod/Event, metric/log/trace, RCA, 복구 제안을 한 화면에서 추적하는 흐름으로 문제를 재정의했다. 5주 일정상 모든 SaaS 기능을 만들기보다 1주차에는 fake adapter를 포함한 E2E vertical slice를 우선 연결하도록 범위를 축소했다. | 장애 징후 수집, 증거 묶음, RCA baseline, Safe PR dry-run, command queue/result, dashboard/audit 확인 흐름을 MVP 핵심으로 확정했다. | 프로젝트 범위가 Gateway, Auth, GitOps, Agent, Telemetry, RCA, Dashboard까지 넓어서 과도한 완성형 기능으로 번지기 쉬웠다. 멘토링 피드백에 따라 "AI가 어떤 운영 인사이트를 주는지"와 "한 사이클이 끝까지 도는지"를 우선순위로 잡았다. | WBS는 2026-07-01 1차 데모 목표를 `webhook/command 입력 -> event bus -> worker -> target agent -> evidence -> RCA -> Safe PR fake -> dashboard -> DLQ/replay`로 확정했다. |
| 2. Management/Target 분리 아키텍처 설계 | Management cluster와 Target cluster를 분리하고, 외부 진입점은 Management API Gateway 하나로 제한했다. 내부 비동기 처리는 NATS JetStream으로 연결하고, Target Agent는 inbound 없이 Gateway로 outbound HTTP만 호출하도록 설계했다. | 보안 경계 분리, target cluster 직접 노출 방지, sandbox namespace write 제한, Gateway 중심 인증/정책/감사 경로 구성. | Target cluster가 management NATS/DB를 직접 알면 결합도와 보안 위험이 커진다. 반대로 모든 기능을 Gateway에 몰면 과도하게 커지므로 API Gateway, worker, projection, agent의 책임을 나눠야 했다. | `services/api-gateway`, `services/gitops/*`, `services/command-worker`, `services/rca-worker`, `services/projection/*`, `services/target/*`로 서비스 실행 경계가 나뉘었고, Kubernetes Deployment/DaemonSet도 서비스별 entrypoint를 직접 실행한다. |
| 3. 이벤트/큐 런타임과 신뢰성 기반 구현 | `packages/contracts/event_bus`, `packages/events`, `packages/runtime`, `packages/storage`를 통해 typed event body, EventEnvelope, NATS JetStream, event_processing ledger, DLQ, replay, transactional outbox/UoW 구조를 만들었다. 서비스는 `App`, `@app.sub(BodyType)`, `yield Body(...)` 패턴으로 이벤트를 처리한다. | 서비스 간 직접 함수 호출 없이 이벤트로 연결, at-least-once delivery 대응, 중복 처리 방지, 실패 이벤트 DLQ 저장, 운영자 replay API 제공. | 이벤트 발행과 DB write가 분리되면 중복 PR 생성, 유실, worker crash 후 재처리 문제가 생길 수 있다. 서비스 담당자가 NATS 세부 구현을 몰라도 안전하게 worker를 작성할 수 있는 추상화가 필요했다. | `event_processing`, `event_dead_letters`, `outbox` 테이블과 runtime이 구현되어 있고, 테스트는 worker 성공/재시도/DLQ, outbox relay, event golden path, service entrypoint를 검증한다. WIKI에는 crash injection 후 correlation당 PR 1건 검증 기록이 있다. |
| 4. GitOps 변경 분석과 Safe PR 흐름 구현 | GitHub webhook 입력을 `git.webhook.received` 이벤트로 받고, `git-pull-worker -> manifest-render-worker -> diff-worker -> diff-analyze-worker -> repo-gateway-worker`로 worker를 분리했다. 실제 GitHub PR API 대신 fake PR URL과 DB 기록으로 Safe PR dry-run을 먼저 구현했다. | Git 변경 감지, manifest 렌더링, desired/live diff 형태 생성, 위험도 판단, 안전한 경우 Safe PR 요청 및 생성 이벤트 발행. | Git 변경을 바로 cluster command로 실행하면 GitOps 원칙과 안전 경계가 깨질 수 있다. 또한 실제 GitHub contents API, Helm/Kustomize, live cluster diff를 모두 구현하면 1주차 범위를 초과한다. | 현재 main/dev 기준 GitOps E2E 체인은 구현되어 있으며, 실제 GitHub repo 파일 읽기, 실제 Helm/Kustomize render, 실제 PR 생성 API는 후속 구현 대상이다. |
| 5. Command와 Target Agent 제어 경로 구현 | UI/API command는 Gateway에서 session 검증 후 `command.requested` 이벤트로 들어가고, `command-worker`가 sandbox policy를 검사한 뒤 `agent_commands` queue에 적재한다. Target Agent는 `/agent/commands/poll`로 command를 가져가고 `/agent/commands/{id}/result`로 결과를 보고한다. | command lifecycle 기록, sandbox-only 정책, agent queue, polling 기반 target 명령 전달, command completed event 발행. | target cluster를 management가 직접 호출하면 네트워크/보안 경계가 복잡해진다. command 중복 전달과 정책 우회도 막아야 한다. | `command-worker`, Gateway agent route, target agent polling/result 흐름이 구현되어 있고, 현재 실제 적용 결과는 sandbox demo/fake action 중심이다. |
| 6. Target/Telemetry 수집 경로 구축 | main에는 fake Prometheus/Loki/OTel과 Node Collector가 포함되어 있고, Target/Telemetry 브랜치에는 Prometheus/Loki query adapter, evidence collector, telemetry install script, Helm manifest 초안이 존재한다. 첨부 로그에서는 Prometheus, Loki, Alloy, OTel Collector 설치와 query, DB evidence 저장 확인이 보인다. | Pod/Event/metric/log/trace evidence를 RCA 입력으로 만들기 위한 수집 경로 확보, Node Collector `/metrics`, structured log, Prometheus scrape target, Loki 로그 조회, OTel collector 연결. | fake telemetry와 real telemetry를 혼동하지 않아야 하며, raw log/metric 전체를 Gateway로 보내면 비용, 민감정보, provider format 의존성이 커진다. 그래서 raw data를 EvidenceDraft/summary로 축약하는 모델이 필요했다. | main은 아직 fake telemetry fallback 중심이다. 다만 `origin/feat/minmings111/target-cluster-agent`와 환경 로그에서 real Prometheus/Loki/OTel 연동 준비와 일부 query 검증이 확인된다. |
| 7. RCA 데이터 카탈로그와 Evidence 모델 정리 | RCA 엑셀과 WIKI 사용자 문서에서 Kubernetes, Prometheus, Loki, OpenTelemetry, Docker가 제공하는 상태/수치/환경/metadata evidence를 분류했다. 40개 RCA 시나리오별 필수 evidence, 원인 후보, Safe PR 후보를 정리했다. | CrashLoopBackOff, ImagePullBackOff, Pending, OOMKilled, Probe failure, Ingress 502/503, Prometheus scrape target down, Loki ingestion failure, OTel exporter failure 등 주요 사건의 판단 근거 정의. | RCA는 단일 metric 하나로 원인을 단정하면 위험하다. 상태 evidence, 수치 evidence, 환경 evidence, change/risk metadata를 같은 사건으로 묶는 correlation metadata가 필요하다. | 현재는 rule/scoring과 AI 분석 로직이 완성된 것이 아니라 조사/설계 카탈로그 단계다. 구현된 `rca-worker`는 deterministic RCA baseline과 Safe PR request 이벤트를 만들며, 향후 evidence builder와 AI analyzer로 확장할 기반을 제공한다. |
| 8. Dashboard Read Model과 Audit 경로 구현 | `dashboard-projection-service`가 모든 이벤트를 dashboard card/read model로 투영하고, `audit-timeline-service`가 event timeline을 audit log로 저장한다. Gateway는 `/dashboard/query`, `/dashboard/stream`, `/dead-letters`, `/dead-letters/{id}/replay`를 제공한다. | 이벤트 상태 가시화, RCA/Safe PR/command 결과 확인, audit trail, DLQ 조회와 replay 운영 경로. | UI가 DB나 NATS에 직접 붙으면 권한과 구조가 깨진다. 또한 이벤트 흐름이 여러 worker로 나뉘므로 사용자에게는 현재 상태를 읽기 쉬운 read model로 보여줘야 한다. | backend read model/API/stream은 구현되어 있다. 별도 Dashboard UI는 MVP 제외 범위 또는 후속 구현 대상이며, 현재는 API/curl 기반 데모가 가능하다. |
| 9. 인증, 권한, Secret 경계 설계와 부분 구현 | 현재 main에는 fake OAuth callback, Redis session, token_vault table이 있고, `origin/feat/jcbbbbbb/api-gateway`에는 email/password 로그인과 Redis session 구현 브랜치가 있다. WIKI에는 organization/project/cluster/integration target/credential binding/Token Broker 권한 모델이 정리되어 있다. | session 기반 API 보호, command/dashboard/DLQ 보호, provider token event 미노출, future Token Broker 설계. | GitHub OAuth 로그인과 우리 서비스 사용자 권한, 외부 provider credential 권한을 섞으면 command/Safe PR/metrics 접근 제어가 불명확해진다. secret이 event/log/response에 노출되지 않도록 ref 기반 모델이 필요하다. | main 기준 인증은 MVP fake OAuth/session 단계이고, email/password 로그인은 feature branch에 존재한다. 조직/클러스터 세부 권한과 Token Broker는 설계 문서와 일부 DB/계약 기반이 있으며 완전 구현은 후속이다. |

## 이미지 #1 상세 발표자 노트

### 1. 문제 정의와 MVP 범위 설정

초기에는 "Kubernetes 장애를 AI로 분석하고 자동 복구한다"는 큰 주제였지만, 실제 5주 일정과 팀 규모를 고려하면 모든 기능을 production 수준으로 완성하기 어렵다. 그래서 멘토링 기록과 WBS를 기준으로 목표를 "한 사이클이 끊기지 않고 도는 운영 보조 도구"로 좁혔다. 이때 한 사이클은 GitHub webhook 또는 command 입력, NATS event 발행, worker 처리, target agent 연결, evidence 수집, RCA baseline 생성, Safe PR dry-run, dashboard/audit 확인까지다.

이 범위 설정의 핵심은 fake adapter를 부끄러운 임시 구현으로 숨기는 것이 아니라, 실제 provider 연동 전에 계약과 흐름을 검증하는 장치로 보는 것이다. WIKI의 MVP 계획도 실제 OAuth, 실제 GitHub PR, 실제 Prometheus/Loki/OTel remote integration, dashboard frontend는 제외 또는 후순위로 두고, 1주차에는 E2E 검증 가능성을 우선한다고 정리한다.

### 2. Management/Target 분리 아키텍처

첨부 아키텍처는 크게 Management, Dashboard, Storage, GitHub Repo, Target Cluster로 나뉜다. 이 구분은 실제 문서와 코드에도 반영되어 있다. Management 쪽에는 Gateway와 worker들이 있고, Target 쪽에는 Target Cluster Agent, Kubernetes API, Prometheus, Loki, OTel Collector, Node Collector가 있다. Target Agent는 management NATS에 직접 붙지 않고 Gateway HTTP API만 호출한다.

이 결정은 보안과 운영 경계를 단순하게 만든다. target cluster가 외부에서 들어오는 연결을 열지 않아도 되고, command 실행도 Gateway와 command-worker 정책을 거친 뒤 agent queue를 통해 전달된다. 현재 실제 배포는 kind 기반 management/target cluster로 구성되어 있고, target namespace와 sandbox namespace를 분리한다.

### 3. 이벤트/큐 런타임

NATS JetStream은 아키텍처에서 내부 이벤트 backbone 역할을 한다. 실제 코드에서는 `packages/contracts/event_bus/bodies`의 typed body와 `subjects.py`가 event contract를 정의하고, `packages/runtime/app.py`의 `App`이 서비스 handler를 등록한다. worker handler는 직접 NATS publish를 호출하기보다 body를 `yield`하고, runtime이 envelope, ledger, outbox, ack/nak, DLQ를 처리한다.

기술적 챌린지는 at-least-once delivery에서 중복 처리를 막는 것이다. worker가 DB에 쓰고 이벤트 발행 전에 죽거나, 이벤트 발행 후 ack 전에 죽으면 중복 이벤트가 생길 수 있다. 이를 줄이기 위해 event_processing ledger, outbox, source-filtered relay, idempotent write가 도입되었다. WIKI에는 crash injection으로 worker를 강제 종료해도 correlation당 PR이 하나만 생성되는 검증 기록이 남아 있다.

### 4. GitOps와 Safe PR

GitOps 흐름은 큰 worker 하나가 아니라 작은 worker 체인으로 나뉘어 있다. webhook을 받은 Gateway가 이벤트를 발행하면 git-pull-worker가 Git 변경 이벤트로 변환하고, manifest-render-worker가 Deployment manifest 형태로 렌더링한다. diff-worker는 desired/actual diff를 만들고, diff-analyze-worker는 risk를 판단해 안전하면 safe_pr.requested를 발행한다. repo-gateway-worker는 fake PR URL을 만들고 safe_pr.created를 발행한다.

현재 구현은 실제 GitHub repo 파일을 읽거나 Helm/Kustomize를 실행하지 않는다. `checkout-api` sample manifest와 `PREVIOUS_IMAGE` 기반 diff를 사용한다. 하지만 이것은 계약과 흐름을 먼저 검증하기 위한 MVP 구현이며, 실제 repo adapter와 live state reader가 들어와도 event body와 worker 분리 구조는 유지될 수 있다.

### 5. Command와 Target Agent

Command 흐름은 GitOps와 분리되어 있다. Git 변경이 곧바로 cluster command가 되는 것이 아니라, UI/API 승인 또는 별도 요청이 `command.requested`를 만들면 command-worker가 정책을 검사한다. 현재 핵심 정책은 sandbox namespace만 허용하는 것이다. 통과한 command는 `agent_commands` queue에 들어가고, Target Agent가 polling으로 가져간다.

이 방식은 target cluster inbound를 열지 않아도 되는 장점이 있다. 또한 command 실행 전후가 `command.dispatch.ready`, `command.dispatched`, `command.queued_for_agent`, `command.completed` 같은 이벤트로 남아 dashboard와 audit에서 추적할 수 있다.

### 6. Telemetry 수집

현재 main의 `fake_prometheus.py`, `fake_loki.py`, `fake_otel.py`는 실제 Prometheus/Loki/OTel이 아니다. 고정 JSON을 반환하는 테스트용 FastAPI 서버다. 하지만 Node Collector는 실제 `/metrics` endpoint를 제공하고, target manifest에는 Prometheus scrape annotation이 있다.

Target/Telemetry 브랜치에는 real Prometheus/Loki 연동 준비가 더 진행되어 있다. `services/target-cluster-agent/evidence.py`는 Prometheus HTTP API와 Loki query API를 호출해 raw result를 정규화하고 fallback evidence로 내려가는 구조를 가진다. `telemetry_queries.py`에는 `up`, `kube_pod_info`, `kube_deployment_status_replicas`, `node_collector_cpu_usage_ratio` 같은 Prometheus query와 Loki query 후보가 정리되어 있다. 첨부 로그에서도 Prometheus service, target-cluster-agent의 Prometheus API query 성공, Loki/Alloy 로그 수집, OTel Collector service와 OTLP 수신 준비, management DB evidence 저장을 확인할 수 있다.

따라서 발표에서는 "real telemetry adapter가 main에 완전 통합됐다"고 말하면 안 된다. 정확한 표현은 "main은 fake telemetry 기반으로 E2E를 보장하고, 별도 브랜치와 환경 로그에서 real Prometheus/Loki/OTel 설치와 query/evidence 저장 검증을 진행했다"이다.

### 7. RCA와 Evidence

RCA 구현을 위해 `/Users/woonyong/Downloads/0628_rca_data_catalog.xlsx`와 WIKI 사용자 문서에서 evidence catalog를 만들었다. 이 자료는 Kubernetes status/event, Prometheus metric, Loki log, OpenTelemetry trace/resource attribute, Docker runtime data, metadata/change/risk evidence를 사건별로 묶는다.

중요한 점은 현재 이 catalog가 최종 scoring model이나 완성된 AI 모델이 아니라는 것이다. 문서 자체도 "공식 기준으로 어떤 데이터를 제공받을 수 있는지 조사한 catalog"이며, 아직 실제 운영환경 exporter/collector 확인, 내부 metric 이름/label 정책, scenario rule/scoring, Safe PR risk policy는 후속이라고 명시한다. 현재 `rca-worker`는 cluster evidence를 DB에 저장하고 deterministic RCA 결과와 safe_pr.requested를 만드는 baseline이다.

### 8. Dashboard/Audit/DLQ

Dashboard Projection Service는 모든 이벤트를 읽어 read model을 만든다. Audit Timeline Service도 모든 이벤트를 audit log로 저장한다. Gateway는 dashboard query와 stream endpoint를 제공하고, dead letter 조회와 replay endpoint도 제공한다. 즉 아직 시각 UI는 없더라도, 운영자가 현재 이벤트 흐름과 실패 이벤트를 API로 확인할 수 있는 backend 경로는 만들어져 있다.

## 이미지 #2 아키텍처 확인과 실제 구현 비교

### 전체 판정

첨부 이미지 #2의 아키텍처 방향은 현재 WIKI와 source repo의 방향과 대체로 일치한다. 특히 Management API Gateway, NATS JetStream, GitOps split workers, Command Worker, RCA/Safe PR, Dashboard Projection, Audit Timeline, Target Cluster Agent, ServiceAccount/RBAC, Node Collector, Prometheus/Loki/OTel 확장 방향은 모두 문서와 코드에서 확인된다.

다만 구현 단위는 그림보다 더 MVP스럽다. 그림에는 독립 박스로 있는 Command Orchestrator/Dispatcher, Agent Connection Gateway, Evidence Builder, AI RCA Service, Safe PR Service, Dashboard Realtime Gateway, Dashboard Query API 등이 실제 코드에서는 일부 합쳐져 있다. 또한 real Prometheus/Loki/OTel은 current main에 완전 통합된 것이 아니라 feature branch, 문서, 환경 로그로 진행 중인 상태다.

| 아키텍처 박스 | 설계상 의미 | 실제 구현 상태 | 세팅/조사/브랜치 근거 | 차이와 보완 |
| --- | --- | --- | --- | --- |
| Management API Gateway | 외부 HTTP 진입점, auth/policy, webhook, agent, command, dashboard, DLQ route | `services/api-gateway`에 구현. `/github/webhook`, `/agent/connect`, `/agent/evidence`, `/commands`, `/agent/commands/poll`, `/agent/commands/{id}/result`, `/dashboard/query`, `/dashboard/stream`, `/dead-letters` 존재 | `origin/feat/jcbbbbbb/api-gateway`에 email/password login, Redis session 추가 브랜치 존재 | 그림의 `/agent/events`는 실제 route상 `/agent/connect`, `/agent/evidence`로 분리됨. organization/project 권한은 문서와 일부 기반만 있고 완성은 후속 |
| 의존성 최소 auth 영역 | OAuth state, token exchange, user/team/role mapping, session/JWT, provider token broker | main은 fake OAuth callback, Redis session, token_vault table 중심 | WIKI `gateway-auth`, `project-permission-layers`; feature branch의 password login | 실제 provider token exchange, full org/project role, Token Broker는 아직 완성 아님 |
| NATS JetStream | 내부 비동기 event bus | `packages/events`, `packages/runtime`, `deploy/management/nats.yaml`로 구현 | event runtime, DLQ, outbox, tests | 이미지의 subject 그룹과 현재 `subjects.py`는 큰 방향 일치. 실제 구현은 typed Body registry 중심 |
| Git Event Processor | webhook/poll input을 git.changed로 변환 | `services/gitops/git-pull-worker` 구현 | GitOps command 문서와 tests | 이름은 git-pull-worker지만 현재 main은 webhook input 중심. polling은 후속 설계 |
| Manifest Renderer | Helm/YAML render | `services/gitops/manifest-render-worker` 구현 | test_manifest_render_worker | 실제 Helm/YAML render가 아니라 sample Deployment 렌더링 |
| Desired State Sync / Diff Engine | desired와 live state diff | `services/gitops/diff-worker`, `diff-analyze-worker` 구현 | test_diff_worker, test_diff_analyze_worker | 실제 Kubernetes live state 조회는 아직 없음. `PREVIOUS_IMAGE` 기반 demo diff |
| Command Orchestrator | command.requested 정책, plan, lifecycle event | `services/command-worker` 안에 구현 | `command_config.py`, `command_policy.py`, tests/test_ports.py | 그림의 Orchestrator와 Dispatcher가 실제로는 한 worker에 합쳐짐 |
| Command Dispatcher | target agent로 command 전달 | command-worker가 DB queue에 적재, Gateway poll route가 lease | `agent_commands` table, target agent polling | 별도 dispatcher 서비스는 아직 없음 |
| Agent Connection Gateway | target agent 연결 채널 | Gateway의 agent routes와 target agent HTTP client로 구현 | `services/target/target-cluster-agent/agent.py` | 별도 서비스가 아니라 Gateway 기능 일부 |
| Evidence Builder | k8s/log/metric pack을 RCA evidence로 변환 | main에서는 `rca-worker`가 evidence 저장과 baseline RCA를 함께 처리 | WIKI evidence model, RCA 엑셀, target telemetry branch | 독립 Evidence Builder service는 없음. Target branch에는 evidence collector 초안 존재 |
| AI RCA Service | evidence -> RCA | `services/rca-worker` 구현, deterministic baseline | RCA scenario docs, rca-worker tests | 실제 LLM/AI analyzer, rule/scoring은 아직 미구현 |
| Safe PR Service | RCA/diff -> GitHub PR | `repo-gateway-worker`가 fake PR 생성 | safe_pr.requested/created body, tests | 그림의 Safe PR Service가 실제로는 GitOps repo-gateway-worker. 실제 GitHub PR API는 후속 |
| Dashboard Projection Service | event -> read model | `services/projection/dashboard-projection-service` 구현 | tests/test_projection.py | 일치 |
| Audit Timeline Service | event audit log | `services/projection/audit-timeline-service` 구현 | tests/test_projection.py | 일치 |
| Dashboard DB | dashboard read model | PostgreSQL `dashboard_cards` 등 storage schema | `packages/storage/schema.py`, DB methods | 일치 |
| Dashboard Realtime Gateway | SSE/WebSocket to UI | Gateway `/dashboard/stream` 구현 | smoke script | 별도 service가 아니라 Gateway route. WebSocket보다는 SSE 중심 |
| Dashboard Query API | read-only query | Gateway `/dashboard/query` 구현 | smoke script | 별도 service가 아니라 Gateway route |
| UI Dashboard | 사용자 화면 | final main에는 별도 완성 UI 없음 | `gitops-demo` 등 별도 prototype 흔적은 workspace에 있으나 final main 아님 | 현재는 backend API/curl 데모 중심 |
| GitHub Repo | manifests/Helm/PR | webhook input과 fake PR record 구현 | repo-gateway-worker | 실제 repo checkout/contents API/PR creation은 후속 |
| Target Cluster Agent | collector, command receiver, policy guard, adapters | main에 outbound register/evidence/poll/result 구현. fake evidence 사용 | target telemetry branch에 Prom/Loki query collector | K8s adapter/Prom/Loki/OTel adapter는 main에 완전 통합 전 |
| Kubernetes API | pod/event/deploy/node 조회 및 sandbox write | RBAC manifest는 read cluster object, sandbox write 권한 정의 | `deploy/target/target.yaml` | main agent는 아직 실제 K8s API reader를 적극 사용하지 않음 |
| Prometheus | metrics store/query | main은 fake-prometheus. Node Collector `/metrics` 존재 | 첨부 로그: Prometheus 설치, service, scrape target, query 성공. branch: query adapter | real Prometheus adapter는 main 통합 전 |
| Loki | logs | main은 fake-loki | 첨부 로그: Loki components, gateway, Alloy log collection, query 확인. branch: Loki query evidence | real Loki adapter는 main 통합 전 |
| OTel Collector | trace/OTLP optional | main은 fake-otel | 첨부 로그: OTel Collector pod/service/OTLP 수신 준비 | 실제 trace backend/query는 아직 확장 후보 |
| Optional Node Collector | node/log/runtime metrics | `services/target/node-collector`, DaemonSet, `/metrics`, structured stdout log 구현 | test_node_collector, target manifest | 일치. 실제 값은 sample metric 중심 |
| PostgreSQL | state/repo/evidence/rca/PR/command/dashboard/audit/ledger/DLQ | 구현 | `packages/storage/schema.py`, database methods | 일치 |
| Metrics Store Prom/Mimir | long-term metric store | main storage로는 없음 | Prometheus setup logs, branch docs | Prom/Mimir는 설계/세팅 단계 |
| Token Vault/Secret | OAuth access/refresh token ref | `token_vault` table과 fake token payload | WIKI secret/auth docs | real SecretVault/TokenBroker는 후속 |

## 아키텍처 기준으로 다시 쓴 상세 문서

### 1. 프로젝트 수행 절차

본 프로젝트는 Kubernetes 운영 장애를 다루는 AI 기반 운영 보조 도구를 목표로 한다. 사용자가 겪는 핵심 문제는 장애가 발생했을 때 원인 후보가 Git 변경, Kubernetes Event, Pod 상태, 로그, metric, trace, 배포 이력에 흩어져 있다는 점이다. 팀은 이 문제를 하나의 화면과 하나의 event timeline으로 연결하기 위해 Management Plane과 Target Cluster를 분리하고, 내부 처리는 NATS JetStream 기반 event-driven architecture로 설계했다.

수행 절차는 다음 순서로 진행되었다.

1. 제품 문제 정의와 사용자 흐름을 정리했다. WIKI 제품 정의에서 대상 사용자를 Kubernetes 운영자, 개발자, 팀 리더로 정의하고, MVP 흐름을 장애 징후 수집, evidence bundle 생성, RCA, Safe PR 또는 command 제안, dashboard/audit 확인으로 잡았다.
2. Management/Target 분리 아키텍처를 확정했다. target cluster는 직접 외부에서 호출받지 않고, target agent가 management gateway로 outbound 연결한다.
3. 서비스 실행 경계를 먼저 나누었다. 단일 FastAPI 앱이나 role dispatcher를 금지하고, 각 서비스가 `services/<service>/app.py` entrypoint를 갖도록 했다.
4. 이벤트 계약과 런타임을 만들었다. 이벤트 subject/body, EventEnvelope, NATS adapter, worker runtime, DLQ/replay, outbox/UoW를 공통 기반으로 만들었다.
5. GitOps, Command, RCA, Dashboard, Audit, Target Agent를 각각 event 흐름에 붙였다.
6. fake adapter로 E2E를 먼저 연결하고, 이후 Prometheus/Loki/OTel real adapter와 GitHub real PR API를 교체하는 순서로 계획했다.
7. RCA 구현을 위해 운영 evidence catalog와 40개 incident scenario를 조사했다.
8. 실제 환경에서는 Prometheus/Loki/Alloy/OTel 설치와 query, evidence DB 저장까지 일부 검증했다.

### 2. Management Plane

Management Plane의 중심은 API Gateway다. Gateway는 UI, GitHub webhook, target agent, command client, dashboard client가 들어오는 유일한 HTTP 입구다. 실제 구현에서는 `/github/webhook`이 Git 변경 이벤트를 만들고, `/agent/connect`와 `/agent/evidence`가 target agent 연결과 evidence 전송을 받는다. `/commands`는 보호 API로 session이 필요하고, `/dashboard/query`, `/dashboard/stream`, `/dead-letters`, `/dead-letters/{id}/replay`도 session 기반으로 보호된다.

Gateway 뒤에는 NATS JetStream이 있다. 이벤트 subject는 `git.*`, `manifest.*`, `desired.*`, `diff.*`, `cluster.*`, `evidence.*`, `command.*`, `rca.*`, `safe_pr.*`, `dashboard.*`, `audit.*`, `dead_letter.*`로 나뉜다. 서비스는 서로 직접 호출하지 않고 이벤트를 통해 연결된다.

실제 코드에서 Management Plane은 다음 서비스로 구성된다.

- `api-gateway`: 외부 HTTP API, fake OAuth/session, webhook, command, dashboard, DLQ, agent route
- `git-pull-worker`: webhook body를 Git 변경 이벤트로 변환
- `manifest-render-worker`: Git 변경을 sample Kubernetes Deployment manifest로 렌더링
- `diff-worker`: desired manifest와 demo actual state의 차이를 diff event로 변환
- `diff-analyze-worker`: diff risk를 판단하고 safe_pr.requested 발행
- `repo-gateway-worker`: fake PR URL 생성과 pull request record 저장
- `command-worker`: command policy, plan, dispatch event, agent command queue 적재
- `rca-worker`: cluster evidence 저장, RCA baseline, safe_pr.requested 발행
- `dashboard-projection-service`: 모든 event를 dashboard read model로 투영
- `audit-timeline-service`: 모든 event를 audit log로 저장

### 3. Target Cluster

Target Cluster는 실제 Kubernetes workload와 observability component가 있는 영역이다. 현재 main 기준 target deploy에는 `target` namespace와 `sandbox` namespace가 있고, Target Agent service account는 cluster object read 권한과 sandbox namespace write 권한을 가진다.

Target Agent는 Management Gateway를 향해 다음 HTTP 흐름을 수행한다.

- `POST /agent/connect`: agent 등록
- `POST /agent/evidence`: evidence 전송
- `GET /agent/commands/poll`: 실행할 command polling
- `POST /agent/commands/{command_id}/result`: command 결과 보고

현재 main의 Target Agent는 fake evidence를 주기적으로 전송한다. fake evidence에는 CrashLoopBackOff pod, readiness failed/backoff event, fake Prometheus CPU/memory/5xx metric, fake Loki log line, fake OTel slow span이 들어간다. 즉 E2E 데모에는 충분하지만 실제 cluster state reader는 아직 확장 전이다.

Node Collector는 DaemonSet으로 배포되며 `/metrics`와 `/snapshot`을 제공한다. `/metrics`에는 `node_collector_cpu_usage_ratio`, `node_collector_memory_working_set_bytes`, `node_collector_filesystem_usage_ratio`가 Prometheus text format으로 노출된다. 환경 로그에서는 real Prometheus가 이 node collector metric을 scrape하고 query하는 과정도 확인된다.

### 4. Telemetry와 Evidence

아키텍처상 Telemetry는 두 방향으로 나뉜다.

첫째, Prometheus/Loki/OTel 같은 관측 플랫폼에서 데이터를 꺼내 evidence로 축약하는 방향이다. Target Agent 또는 adapter가 Prometheus HTTP API, Loki query API, OTel backend를 조회하고, raw response를 RCA가 이해하기 쉬운 evidence summary로 바꾼다.

둘째, 우리가 만든 Node Collector나 Kubernetes reader가 관측 플랫폼에 데이터를 넣는 방향이다. Node Collector는 `/metrics`를 노출하고 Prometheus가 scrape한다. 로그는 Alloy/Loki 경로로 수집할 수 있고, trace는 OTel Collector로 들어갈 수 있다.

현재 main은 fake telemetry 기반이다. 하지만 Target/Telemetry feature branch에는 다음 구현 흔적이 있다.

- Prometheus query evidence collection scaffold
- Prometheus query definition 확대
- Loki query evidence collection
- OpenTelemetry query/resource limit stub
- `EvidenceCollector`를 통한 Prometheus/Loki raw result normalization
- telemetry install script와 Prometheus/Loki/OTel/Alloy manifest

첨부 환경 로그는 다음을 보여준다.

- Helm 기반 monitoring/data pipeline tool 조회
- management/target cluster pod 상태 확인
- Prometheus service와 component 상태 확인
- node collector metric scrape target 노출 확인
- target-cluster-agent pod에서 Prometheus API query 성공
- Loki gateway와 components 상태 확인
- Grafana Alloy pod 로그 스트림 수집
- target cluster 로그가 Loki에서 조회되는지 확인
- OTel Collector pod/service/OTLP 수신 준비 확인
- agent가 수집 payload를 management API로 전송
- management DB에 evidence와 RCA evidence bundle 저장 확인

따라서 문서에는 "실제 telemetry 전체 구현 완료"가 아니라 "fake fallback 위에 real telemetry 폐쇄 루프를 세팅하고 query/evidence 저장을 검증했다"고 쓰는 것이 정확하다.

### 5. RCA와 Safe PR

RCA는 현재 두 층으로 나누어 설명해야 한다.

첫 번째는 조사/설계 층이다. RCA 엑셀과 WIKI 사용자 문서에는 Kubernetes, OpenTelemetry, Loki, Docker, Prometheus에서 얻을 수 있는 운영 데이터를 status evidence, numeric evidence, environment/product evidence, metadata/change/risk evidence로 분류했다. 또한 CrashLoopBackOff, ImagePullBackOff, Pending, OOMKilled, Probe Failure, Ingress 502/503, Prometheus scrape target down, Loki ingestion failure, OTel collector exporter failure 등 40개 scenario에 대해 필수 evidence, 원인 후보, Safe PR 후보를 정리했다.

두 번째는 현재 구현 층이다. `rca-worker`는 `cluster.evidence.received` 이벤트를 받아 evidence를 DB에 저장하고, deterministic RCA baseline을 만든 뒤 `evidence.built`, `rca.completed`, `safe_pr.requested`를 발행한다. 현재 root cause와 action은 sample 문자열 중심이다. AI 모델 호출, rule/scoring, confidence 계산, evidence_refs 기반 분석, Safe PR risk policy는 후속 구현 대상이다.

Safe PR도 마찬가지로 현재는 fake PR record 중심이다. diff-analyze-worker나 rca-worker가 safe_pr.requested를 발행하면 repo-gateway-worker가 fake PR URL을 만들고 DB에 저장한 뒤 safe_pr.created를 발행한다. 실제 GitHub branch/commit/PR API 연동은 문서와 WBS에는 계획되어 있으나 main 구현은 아직 아니다.

### 6. Dashboard와 Audit

Dashboard는 별도 UI 구현보다 backend read model이 먼저 구현되어 있다. `dashboard-projection-service`는 모든 이벤트를 구독하고 dashboard card를 만든다. safe_pr.created, command.completed 같은 terminal success는 done 상태로, rejected/failed/dead_letter 계열은 attention 상태로, 그 외 이벤트는 running 상태로 투영한다.

Audit Timeline Service도 모든 event를 audit log로 저장한다. 이 구조는 "무슨 일이 일어났는지"뿐 아니라 "어느 correlation_id로 어떤 단계까지 갔는지"를 추적하게 해준다.

현재 Gateway는 dashboard query와 SSE stream을 제공한다. 완성형 UI dashboard는 final main 범위에 없으므로, 발표에서는 API/curl 또는 간단한 client로 read model을 보여주는 것이 맞다.

### 7. Auth, Permission, Secret

현재 main의 auth는 MVP fake OAuth/session 중심이다. Redis session과 token_vault table이 있고, command/dashboard/dead-letter API는 session을 요구한다. `origin/feat/jcbbbbbb/api-gateway`에는 email/password login, password hashing, Redis session, tests가 추가되어 있으나 main에는 아직 통합되지 않았다.

WIKI의 권한 설계는 훨씬 넓다. organization/workspace, cluster, resource, credential, policy 경계를 나누고, GitHub처럼 team/principal을 두되 Kubernetes 운영 특성상 실행 권한과 관리 권한을 더 강하게 분리한다. Safe PR 생성, command dispatch, Token Broker credential issue는 side effect 직전에 권한을 재검사해야 한다고 정리되어 있다.

현재 구현과 설계를 구분하면 다음과 같다.

- 구현됨: fake OAuth callback, Redis session, protected command/dashboard/DLQ route, token_vault table, secret을 event payload에 넣지 않는 원칙
- 브랜치 구현: email/password login, password auth test
- 문서/설계: organization/project role, integration target, credential binding, Token Broker, cluster-level permission model
- 미구현: 실제 provider token exchange, full RBAC/ABAC policy, Token Broker real adapter

### 8. 구현 결과와 현 상태

현재 가장 강한 구현 결과는 "서비스 경계와 이벤트 기반 E2E 흐름"이다. final repo에는 각 서비스별 entrypoint가 존재하고, Kubernetes deployment가 해당 entrypoint를 직접 실행한다. typed event body, runtime, ledger, outbox, DLQ/replay, dashboard projection, audit timeline, target agent outbound, command polling까지 이어지는 구조가 있다.

현재 가장 약한 부분은 "실제 외부 provider 연동"이다. 실제 GitHub PR API, real OAuth provider exchange, real Prometheus/Loki/OTel adapter main 통합, AI analyzer, 완성형 UI는 후속 단계다. 하지만 fake implementation과 contract를 명확히 분리한 문서가 있고, 실제 telemetry 환경 세팅 로그와 feature branch 구현이 있어 다음 단계로 넘어갈 준비가 되어 있다.

## 구현/세팅/조사/미구현 구분

| 영역 | 구현됨 | 세팅 또는 브랜치 진행 | 조사/문서화 | 아직 미구현 또는 후속 |
| --- | --- | --- | --- | --- |
| Microservice runtime | 서비스별 app.py, Deployment/DaemonSet, App runtime, NATS, DLQ, outbox | worker liveness, PgBouncer/DB pool 안정화 | WIKI architecture, platform guide | 운영 규모의 KEDA/backpressure 고도화 |
| Gateway | health/ready, OAuth fake callback, session, webhook, agent, command, dashboard, DLQ route | password login branch | Gateway/Auth 최종 설계 | real OAuth provider, org/project full permission |
| GitOps | split workers, sample manifest, demo diff, safe_pr.requested | polling/API 설계 문서 | GitOps command 설명 | real repo checkout, Helm/Kustomize, live state diff |
| Command | sandbox policy, plan, queue, agent polling/result | agent management 확장 예정 | permission layers | production command approval, lease 고도화 |
| RCA | evidence save, deterministic RCA baseline, rca.completed, safe_pr.requested | evidence collector branch 일부 | RCA 엑셀, 40개 scenario, indicator guide | AI analyzer, scoring, confidence, evidence_refs, risk policy |
| Safe PR | fake PR URL, pull_requests 저장, safe_pr.created/failed | real GitHub branch/commit/PR 계획 | Safe PR risk 후보 정리 | 실제 GitHub PR 생성 |
| Target Agent | outbound connect/evidence/poll/result, fake evidence | Prom/Loki query adapter branch | Target/Telemetry guide | real K8s adapter main 통합 |
| Node Collector | DaemonSet, `/metrics`, structured stdout, tests | Prometheus scrape 검증 로그 | evidence model | 실제 node/runtime detail 확장 |
| Prometheus | fake server, node collector metric endpoint | Helm/Prometheus 설치, service, scrape, query 로그, branch adapter | Prometheus runbook | main deploy real Prometheus adapter |
| Loki/Alloy | fake server | Loki/Alloy 설치, log stream, query 로그, branch adapter | Loki evidence scenarios | main deploy real Loki adapter |
| OTel | fake server | OTel Collector pod/service/OTLP 수신 준비 로그 | OTel evidence scenarios | real trace backend/query integration |
| Dashboard | projection service, query API, stream API | smoke dashboard query | dashboard read model docs | full UI dashboard |
| Audit | audit timeline service | - | audit policy docs | advanced actor/risk audit |
| Storage | PostgreSQL schema, Redis session, token_vault, evidence, rca, PR, command, dashboard, DLQ | MinIO workload exists in MVP plan/deploy context | storage role separation | object storage/raw evidence lifecycle |

## 브랜치 분석 요약

| 브랜치 | 현재 의미 | 확인된 고유 구현 |
| --- | --- | --- |
| `origin/main` | 2026-06-29 기준 dev 계약 경계 정리 merge 반영 | 현재 통합 기준. 이벤트 런타임, 서비스 분리, GitOps split workers, command, RCA baseline, dashboard/audit, target fake telemetry 포함 |
| `origin/dev` | main과 같은 최신 통합 흐름 | main에 merge된 계약 경계와 diff body 네이밍 정리 |
| `origin/feat/woonyong-kr/event-system` | 현재 작업 브랜치 | 계약 경계/데모 구현/팀 기준 문서화, diff body naming 정리. main/dev에 통합됨 |
| `origin/feat/jcbbbbbb/api-gateway` | Gateway/Auth feature | email/password login, password hashing, Redis session, auth flow diagram, `tests/test_password_auth.py`. main에는 미통합 |
| `origin/feat/minmings111/target-cluster-agent` | Target/Telemetry feature | Prometheus/Loki/OTel/Alloy manifests, install script, Prometheus/Loki query definitions, EvidenceCollector, telemetry evidence collection. path가 현재 main의 `services/target/...` 구조와 달라 통합 정리가 필요 |
| `origin/feat/minmings111/node-collector` | Node Collector 초기 브랜치 | 원격 기준 main 대비 고유 커밋 없음. 현재 main에 Node Collector 구현 존재 |
| `origin/feat/jeonwoohyun-hydromel/command-worker` | Command worker 초기 브랜치 | 원격 기준 main 대비 고유 커밋 없음. 현재 main에 command-worker 구현 존재 |
| `origin/feat/jeonwoohyun-hydromel/gitops-sync-worker` | GitOps sync 초기 브랜치 | 원격 기준 main 대비 고유 커밋 없음. 현재 main에는 split worker 구조로 통합 |
| `origin/feat/ummfieg/rca-worker` | RCA worker 초기 브랜치 | 원격 기준 main 대비 고유 커밋 없음. 현재 main에 rca-worker baseline 존재 |
| `origin/feat/ummfieg/dashboard-projection-service` | Dashboard projection 초기 브랜치 | 원격 기준 main 대비 고유 커밋 없음. 현재 main에 projection service 존재 |
| `origin/feat/ummfieg/audit-timeline-service` | Audit timeline 초기 브랜치 | 원격 기준 main 대비 고유 커밋 없음. 현재 main에 audit service 존재 |

## RCA 데이터 카탈로그 반영 내용

RCA 카탈로그는 다음 방식으로 프로젝트 문서에 반영하는 것이 적절하다.

1. RCA는 단일 지표 분석이 아니라 evidence bundle 분석이다.
2. evidence는 네 축으로 나눈다.
   - 상태 evidence: Kubernetes status/condition/event, Docker state, Prometheus scrape state, OTel span status, Loki log pattern
   - 수치 evidence: CPU, memory, disk, network, throttling, restart count, 5xx rate, latency, queue lag
   - 환경/제품 evidence: CoreDNS, Ingress, CNI, CSI, DB/cache/queue, Argo CD, admission/security scanner
   - metadata/change/risk evidence: namespace, workload, ownerRef, image tag/digest, git sha, Helm revision, trace_id, recent change, risk level
3. Safe PR 후보는 manifest/spec/config로 수정 가능한 문제에 한정한다.
4. Node NotReady, cloud/provider 장애, security policy bypass처럼 PR로 안전하게 해결할 수 없는 문제는 자동 PR 후보가 아니라 수동 조치 또는 승인 대상이다.
5. Prometheus label cardinality를 피하기 위해 raw event message, trace_id, pod_uid, request_id 같은 값은 label이 아니라 metadata/object storage/link로 보관한다.
6. `Problem criteria`는 플랫폼이 그대로 주는 데이터가 아니라 RCA 판단 규칙이다. 따라서 구현에서는 raw observed signal과 판단 규칙을 구분해야 한다.

## 발표에서 쓰기 좋은 문장

- "저희는 처음부터 단일 FastAPI 앱이 아니라 서비스별 실행 경계를 나누고, NATS JetStream으로 느슨하게 연결했습니다."
- "Target Cluster Agent는 management로 outbound 연결만 유지하기 때문에 target cluster를 외부에서 직접 열지 않아도 됩니다."
- "Git 변경은 바로 cluster에 적용하지 않고, manifest render와 diff 분석을 거쳐 Safe PR 제안으로 먼저 보냅니다."
- "현재 main은 fake telemetry로 E2E 안정성을 확보했고, 별도 브랜치와 환경 로그에서 Prometheus/Loki/OTel real 연동 폐쇄 루프를 검증하고 있습니다."
- "RCA는 단일 metric이 아니라 Kubernetes status, log, metric, trace, change metadata를 같은 incident로 묶는 evidence bundle 관점으로 설계했습니다."
- "현재 AI/RCA는 deterministic baseline 단계이며, 조사한 40개 incident scenario와 evidence catalog를 다음 단계의 rule/scoring/LLM analyzer 입력으로 사용할 예정입니다."
- "Dashboard UI는 아직 후순위지만, projection read model과 query/stream API는 구현되어 있어 event lifecycle을 확인할 수 있습니다."
- "실제 GitHub PR, real OAuth, Token Broker, full permission model은 문서와 branch 기반으로 설계가 진행되어 있고, main 통합은 다음 단계입니다."

## 발표에서 피해야 할 표현

- "실제 Prometheus/Loki/OTel 연동이 main에서 완료됐다."  
  정확한 표현: "main은 fake fallback이고, real telemetry는 브랜치와 환경 로그에서 설치/query/evidence 저장을 검증했다."

- "AI가 실제로 RCA를 완성했다."  
  정확한 표현: "현재는 deterministic RCA baseline이며, RCA 데이터 카탈로그와 scenario 문서를 기반으로 AI analyzer를 붙일 준비를 했다."

- "GitHub PR이 실제로 생성된다."  
  정확한 표현: "현재는 fake PR URL과 DB record로 Safe PR dry-run을 구현했고, 실제 GitHub PR API는 후속이다."

- "권한 모델이 완성됐다."  
  정확한 표현: "session 보호와 sandbox policy는 구현했고, organization/project/cluster/credential/Token Broker 권한 모델은 설계 및 일부 브랜치 구현 단계다."

## 근거 파일 목록

주요 source repo 근거:

- `docs/architecture.md`
- `docs/events.md`
- `docs/service-split-plan.md`
- `docs/team/contract-vs-demo-boundary.md`
- `docs/team/member-guides/target-telemetry.md`
- `docs/team/member-guides/target-telemetry-implementation-plan.md`
- `docs/team/member-guides/target-telemetry-evidence-model.md`
- `docs/team/member-guides/gateway-auth.md`
- `docs/team/member-guides/gitops-command.md`
- `docs/team/member-guides/platform-integration.md`
- `docs/coach-one-page-plan.md`
- `services/api-gateway/gateway.py`
- `services/api-gateway/auth.py`
- `services/gitops/*/app.py`
- `services/command-worker/app.py`
- `services/rca-worker/app.py`
- `services/projection/dashboard-projection-service/app.py`
- `services/projection/audit-timeline-service/app.py`
- `services/target/target-cluster-agent/agent.py`
- `services/target/node-collector/node_collector.py`
- `packages/runtime/*`
- `packages/events/bus.py`
- `packages/storage/schema.py`
- `packages/storage/database.py`
- `deploy/management/services.yaml`
- `deploy/target/target.yaml`
- `scripts/smoke.sh`
- `scripts/crash_test.sh`
- `tests/test_*`

주요 WIKI 근거:

- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/README.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/product-definition.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/architecture.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/mvp-plan.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/wbs.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/team-work-allocation.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/meetings/2026-06-26-mentoring.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/member-guides/*`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/users/ummfieg/archive/INDICATOR_GUIDE.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/users/ummfieg/archive/RCA_SCENARIOS.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/users/ummfieg/rca-scenarios/*.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/users/jcbbbbbb/archive/project-permission-layers.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/users/jcbbbbbb/archive/rca-scenarios/*.md`
- `/Users/woonyong/workspace/Krafton-Jungle/WIKI/users/jeonwoohyun-hydromel/gitops-command-code-explanation.md`

외부 첨부 근거:

- `/Users/woonyong/Downloads/0628_rca_data_catalog.xlsx`
- `/Users/woonyong/Downloads/check(2026-06-29)/management DB/*`
- `/Users/woonyong/Downloads/check(2026-06-29)/agent/*`
- `/Users/woonyong/Downloads/check(2026-06-29)/prometheus/*`
- `/Users/woonyong/Downloads/check(2026-06-29)/loki, alloy/*`
- `/Users/woonyong/Downloads/check(2026-06-29)/Otel(설치연결만 해두고 잘 모름..)/*`
- `/Users/woonyong/Downloads/check(2026-06-29)/basic_state/*`
