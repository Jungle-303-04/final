# Opsia

Opsia는 Kubernetes 운영 변경을 증거·정책·승인·사후 검증으로 연결하는 이벤트 드리븐
remediation 플랫폼입니다.

이 repository의 실행 기준은 `app/` 단일 FastAPI 앱이 아니라 `src/services/<service-name>`입니다. 처음부터 완전 분리 마이크로서비스로 만들며, Kubernetes Deployment/DaemonSet은 각 서비스 폴더의 entrypoint를 직접 실행해 서로 다른 서비스 인스턴스로 분리합니다.

단일 FastAPI 앱, role dispatcher, 서비스 간 직접 함수 호출로 회귀하지 않습니다. 한 서비스 pod가 죽어도 Kubernetes가 다시 생성하고, 다른 서비스는 event, DLQ, read model, queue/storage 계약을 기준으로 가능한 범위에서 계속 동작해야 합니다.

## 구조

루트별 책임과 생성 파일 보존 기준은
[저장소 구조 원칙](docs/architecture/repository-layout.md)을 정본으로 사용한다.

```text
src/entrypoints
  app.py                 OSS 단일 프로세스 조립 진입점
  bootstrap*.py          스키마 이후 계정·로컬 실행 초기화
  demo_*.py              명시적으로 실행하는 개발 보조 진입점
src/services
  gateway/api-gateway
  gateway/outbox-relay
  realtime/realtime-gateway
  gitops/git-pull-worker
  gitops/github-poll-worker
  gitops/workflow-controller
  gitops/manifest-render-worker
  gitops/diff-worker
  gitops/diff-analyze-worker
  gitops/safe-pr-worker
  gitops/scm-worker
  ai/evidence-worker
  ai/incident-worker
  ai/ai-fallback-worker
  ai/plan-worker
  ai/analyze-worker
  ai/rca-worker
  ai/rca-feedback-worker
  ai/recovery-worker
  ai/select-worker
  ai/dispatch-worker
  ai/approval-worker
  ai/rollout-worker
  ai/backlog-worker
  ai/diff-worker
  ai/chat-worker
  ai/agent                 (라이브러리: 대화 엔진/플레이북, entrypoint 없음)
  command/command-worker
  command/command-janitor
  projection/audit-worker
  projection/dashboard-worker
  projection/dead-letter-monitor
  projection/rca-timeline-janitor
  alert/alert-worker
  mail/mail-worker
  target/cluster-agent
  target/drift-worker
  target/node-collector
  target/reconcile-worker
src/domains
  identity, gitops, command, rca, scm, audit, alert, target,
  ai, applications, catalog, dashboard, inventory, mail, providers
src/packages
  config                 env, runtime 기본값, 시간 helper
  contracts              gateway/event_bus/auth/store 계약과 Protocol port
    gateway              API Gateway 요청 schema
    event_bus            stream, subject, subscription, envelope, body 계약
  events                 event envelope, NATS JetStream, DLQ event sink
  storage                PostgreSQL 저장소와 schema 초기화
  runtime                FastAPI/worker/async service 실행 객체
  ai                     LLM provider 클라이언트 (OpenAI/Anthropic/Gemini)
  security               시크릿 vault (SOPS/age, AWS)
src/samples  smoke 테스트용 샘플 manifest (Bruno webhook·smoke script 가 참조)
alembic      PostgreSQL 스키마 migration 정본
charts       Helm chart
deploy       management/target Kubernetes manifest
desktop      Tauri 네이티브 셸
docs/api     Bruno API 수동 테스트 collection
frontend     운영 콘솔 React/Vite 앱과 nginx same-origin proxy 설정
infra        Terraform 인프라 정본
references   격리된 원본 snapshot과 provenance
scripts      검증, AWS 배포, 상태 확인, smoke, scale, pod 복구 script
secrets      SOPS/age 시크릿 템플릿
config/env   로컬 env 템플릿
tests        단위 테스트
```

## 처음 실행

```bash
make setup
bash scripts/test.sh
make manifest-check
make smoke
```

로컬에서는 코드/manifest 검증까지만 하고, 실제 서비스 smoke는 AWS EKS에서 확인한다.
자세한 기준은 [docs/aws-testing-runbook.md](docs/aws-testing-runbook.md)를 본다.
API를 사람이 직접 눌러 확인할 때는 [docs/api/README.md](docs/api/README.md)를 열고 Bruno collection을 사용한다.

실제 target 없이 격리된 workspace에 UI 확인용 데이터를 넣으려면
[descriptor 기반 demo workspace](docs/demo-workspace.md)를 사용한다.

## 로컬 캐시 정리

```bash
make clean
```

`make clean`은 Python/Playwright 캐시와 프론트 빌드 산출물만 삭제한다. 평상시에는
증분 검사 속도를 위해 `.import_linter_cache/`, `.pytest_cache/`, `.ruff_cache/`,
`frontend/tsconfig.tsbuildinfo`를 유지한다. `.env*`, `outputs/`, `node_modules/`,
`.venv/`, Terraform state는 항상 보존한다.

## Opsia 사용자 인터페이스

운영 경로는 Python 서비스, React 웹, Tauri 데스크톱 셸로만 구성한다. 고정 원본은
`references/upstream/`에서만 추적하며, 출처·라이선스 고지는 루트 `NOTICE`를 따른다.

```bash
# 웹 개발 서버 + 실제 dev 백엔드 (http://localhost:5173)
make frontend-live

# frontend 디렉터리에서 실행해도 같은 서버가 열린다.
cd frontend && npm run dev

# 데스크톱 개발 셸
cd desktop && cargo tauri dev

# 로컬 management/target 테스트 환경
make local-test-env && make local-up
```

직접 실행은 사용자·클러스터·리소스별 Capability와 Kubernetes RBAC을 먼저 검증하고,
대상·영향·차이를 한 번 확인한 뒤 감사 ID 및 실시간 결과를 남긴다. 브라우저와
서버는 데스크톱 기기의 로컬 셸·파일 경로·자격 증명을 보유하지 않는다.

## 서비스 역할

각 서비스는 독립 실행 프로세스와 Kubernetes workload를 가진다. 개발 편의를 위해 base layer를 공유할 수는 있지만, 실행 경계는 항상 `python src/services/<service-name>/app.py`처럼 서비스별 entrypoint로 분리한다.

실행 조립 패턴은 두 가지로 고정합니다(그 외 방식 금지).

1. **worker 서비스** — `src/packages/runtime/app.py`의 `App` 사용. `@app.on(BodyType)`으로 한 body 타입을 구독하고, 다음 이벤트는 `yield`로 흘려보냅니다(체이닝). audit 같은 cross-cutting projector는 `@app.on_any`로 모든 이벤트(`>`)를 구독하고 전체 `EventEnvelope`를 받습니다. `App.run()`이 내부적으로 `WorkerService`/`WorkerRuntime`, NATS client, PostgreSQL connection을 조립하므로 worker 서비스 폴더에서 직접 조립하지 않습니다.
2. **HTTP 서비스** (api-gateway, realtime-gateway) — FastAPI lifespan에서 Database/NatsEventBus/OutboxRelay 를 조립합니다. 요청-응답 경계와 이벤트 소비 루프가 달라 `App`을 쓰지 않는 것이 의도된 설계입니다.
서비스 설정(상수)은 기본적으로 `app.py` 안에 둡니다. 설정 항목이 많아 파일 분리가 필요한 서비스(api-gateway, github-poll-worker)만 예외적으로 같은 폴더의 `settings.py`를 사용합니다. 여러 서비스가 공유하는 이벤트 subject, envelope, body, stream 계약은 `src/packages/contracts/event_bus`에 둡니다.

```text
[gateway]
api-gateway                  관리 API Gateway (인증, REST, agent 연결)
outbox-relay                 outbox event relay와 DLQ 연결
realtime-gateway             cluster-agent live stream -> browser WS fan-out

[gitops]
git-pull-worker              Git webhook/polling -> git.changed
github-poll-worker           GitHub API polling -> api-gateway 전달
workflow-controller          GitOps/approval/command 이벤트 -> workflow_runs/approvals
manifest-render-worker       git.changed -> manifest.rendered
diff-worker                  manifest.rendered -> desired.diff.detected
diff-analyze-worker          desired.diff.detected -> diff.analyzed (안전 시 safe_pr.requested)
safe-pr-worker               safe_pr.requested -> safe_pr.patch_prepared/safe_pr.failed
scm-worker                   safe_pr.ready -> safe_pr.created/safe_pr.failed (유일한 PR 생성자)

[ai — evidence/RCA/recovery 파이프라인]
evidence-worker              cluster.evidence.received -> evidence.built
incident-worker              evidence.built -> incident.detected -> evidence.bundle.built
ai-fallback-worker           rca.ai_fallback.requested -> LLM 원인 후보 생성
plan-worker                  evidence.bundle.built -> rca.candidates.planned
analyze-worker               rca.candidates.planned -> rca.candidates.evaluated
rca-worker                   rca.candidates.evaluated -> rca.completed
rca-feedback-worker          RCA blocked/action/fallback -> 후속 조치 이벤트 정규화
recovery-worker              rca.completed -> recovery.planned
select-worker                recovery.planned -> recovery.action_selected
dispatch-worker              recovery.action_selected -> command 또는 PR 요청
approval-worker              selection/rollout 이벤트 -> 승인 추천
rollout-worker               command.completed -> rollout.diagnosed
backlog-worker               rca.backlog.created -> RCA backlog read model
ai-diff-worker               safe_pr.patch_prepared -> diff.explained -> safe_pr.ready
chat-worker                  ai.message.received -> 대화 엔진(도구 호출 루프) 응답
agent                        대화 엔진/원인 분석/플레이북 라이브러리 (entrypoint 없음)

[command]
command-worker               command policy/dispatch/agent queue
command-janitor              만료 command 정리

[projection]
audit-worker                 audit log projector (@on_any)
dashboard-worker             이벤트 흐름 -> 프론트 RCA timeline read model
dead-letter-monitor          dead_letter.created -> 운영 alert 연결
rca-timeline-janitor         RCA timeline read model 만료/정리

[alert / mail]
alert-worker                 alarm/notification event boundary
mail-worker                  mail.email_verification.requested -> 인증 메일 전송

[target]
cluster-agent                대상 클러스터 outbound agent, command receiver, evidence job scheduler
drift-worker                 target desired/actual drift evidence 생성
node-collector               선택형 DaemonSet collector
reconcile-worker             target 상태 reconcile
```

## 핵심 기능

- **클러스터 연결(원라인 설치)**: 콘솔 위저드에서 등록 → `curl -fsSL <게이트웨이>/api/install/<토큰> | kubectl apply -f -` 한 줄로 agent 설치. agent가 아웃바운드 롱폴로 접속하는 pull 모델이라 kubeconfig·인바운드 개방이 필요 없고, 연결되면 콘솔 배지가 자동으로 connected 로 바뀐다.
- **GitOps 배포 파이프라인**: git 변경 → 렌더(kustomize/native/helm) → 리소스 필드 단위 3-way 디프(plan 미리보기 `+/~/-`) → 정책 검사 → 승인 → 적용 → 롤아웃 헬스. 승인 화면에서 "정확히 뭐가 바뀌는지"를 terraform plan 스타일로 확인하고 누른다.
- **승격 파이프라인·글로벌 서비스**: 바인딩 `deploy_policy` 에 `promotes_to_binding_id` 를 선언하면 staging 성공 시 같은 commit 으로 prod 파이프라인이 자동 재진입(승인 게이트 유지). `cluster_id: "*"` 로 배포를 만들면 전 클러스터로 확장되고 신규 클러스터도 자동 합류한다.
- **인시던트 → RCA → 복구**: agent 증거 수집(k8s/Prometheus/Loki/Tempo) 또는 외부 Alertmanager 웹훅(`POST /webhooks/alertmanager`)이 인시던트를 열고, RCA 플레이북이 원인 후보·복구 액션을 제안한다. 복구 실행은 제어 허용 네임스페이스 정책(`CONTROL_ALLOWED_NAMESPACES`, 기본 sandbox)이 3계층(게이트웨이·워커·agent)에서 막는다.
- **알림 라우팅**: 워크스페이스별 채널(`/alert-channels`)에 min_severity(info<warning<critical) 룰로 발송. 채널이 없으면 전역 provider 폴백.
- **메트릭**: 실시간 LIVE 스트림 차트, 스냅샷 기반 실측 usage 시계열(`/clusters/{id}/usage`), 온디맨드 PromQL(agent 경유, 실측 결과 폴링). 시스템 자체 지표는 게이트웨이 `/metrics`(Prometheus 포맷)로 노출.
- **성능**: 명령 전달은 Postgres LISTEN/NOTIFY 웨이크업(ms 단위, 미설정 시 폴링 폴백), 인벤토리 스냅샷은 다중 VALUES 배치 업서트, DB 는 pgbouncer transaction pooling.

## 검증

```bash
make test
make manifest-check
make smoke
```

scale/recovery 확인:

```bash
make scale DEPLOYMENT=rca-worker REPLICAS=2
make kill-pod DEPLOYMENT=rca-worker
```

이 명령은 마이크로서비스 복구 기준 확인용이다. pod 삭제 뒤 Deployment가 다시 생성되어야 하며, retry/DLQ/read model이 남은 흐름을 복구할 수 있어야 한다.

## 문서

- [docs/onboarding/README.md](docs/onboarding/README.md)
- [docs/onboarding/minjeong-command-target-evidence.md](docs/onboarding/minjeong-command-target-evidence.md)
- [docs/onboarding/gain-evidence-rca.md](docs/onboarding/gain-evidence-rca.md)
- [docs/onboarding/chanbin-frontend.md](docs/onboarding/chanbin-frontend.md)
- [docs/README.md](docs/README.md)
- [docs/team/role-practice-guide.md](docs/team/role-practice-guide.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/events.md](docs/events.md)
- [docs/team/member-guides/target-agent-command-evidence-flow.md](docs/team/member-guides/target-agent-command-evidence-flow.md)
- [docs/operations-deployment.md](docs/operations-deployment.md)
- [docs/aws-testing-runbook.md](docs/aws-testing-runbook.md)
- [docs/api/README.md](docs/api/README.md)
- [docs/secrets.md](docs/secrets.md)
- [docs/team/conventions.md](docs/team/conventions.md)
