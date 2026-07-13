# 팀 간 구현 연결과 테스트 가이드

이 문서는 민정, 가인, 찬빈이 서로의 작업을 어떻게 이어받는지, 어떤 코드 계약을 깨면 안 되는지, 각 작업자가 자기 PR에서 무엇을 테스트해야 하는지 설명한다.

역할별 세부 구현은 각 member guide를 따른다. 이 문서는 그 사이의 연결선만 다룬다.

## 먼저 이해할 것

이 프로젝트는 세 종류의 연결로 움직인다.

| 연결 | 쓰는 곳 | 담당자가 알아야 할 것 |
| --- | --- | --- |
| HTTP API | 외부 사용자, Target Agent, Gateway | request/response schema는 `src/packages/contracts/gateway`가 기준이다. |
| Event body | worker 간 연결 | subject는 `EventSubject`, body는 도메인 `events.py` dataclass가 기준이다. |
| Projection/DB | command queue, audit, read model | DB 쓰기와 event 발행은 outbox/UoW 경계를 맞춘다. |

중요한 원칙:

- Target Agent는 NATS/DB를 직접 알지 않는다. Gateway HTTP API만 호출한다.
- Worker는 HTTP request를 직접 받지 않는다. event body를 받아 다음 event body를 `yield`한다.
- `correlation_id`는 대부분 body 필드가 아니라 `EventEnvelope` 메타데이터다.
- body에 새 필드를 넣는 일은 계약 변경이다. `docs/events.md`, 테스트, producer/consumer를 같이 바꾼다.
- provider adapter는 실제 구현 기준으로 설명한다. 테스트에서는 주입 가능한 transport나 in-memory store를 쓴다.
- production write, 실제 provider write, AI tool 실행은 [production-readiness](../production-readiness.md)의 release gate를 통과해야 한다.

## 하드닝 연결 게이트

아래 변경은 한 역할의 PR만으로 끝내지 않는다. 관련 역할 문서와 테스트를 같이 갱신한다.

| 변경 | 같이 확인할 역할 | 필수 테스트/근거 |
| --- | --- | --- |
| 실제 manifest patch PR | 가인, 민정 | PR diff에 manifest patch/rollback patch가 있고 feature flag off가 fail-closed |
| approval_ref 기반 write command | 찬빈, 민정 | approval 만료/누락/권한 불일치 거부 |
| SecretVault 도입 | 찬빈, 가인 | provider token이 event/log/DLQ에 없는 non-leak test |
| action allowlist 확장 | 민정 | namespace/action/resource/environment별 허용/거부 |
| AI tool schema/authorization | 가인, 찬빈 | malformed reply, invalid output, unauthorized tool call, budget exceeded |
| control-plane metrics/trace | 민정, 찬빈 | worker latency, NATS lag, outbox age, DLQ율, command queue age, correlation trace |

## 실제 코드 기준 계약 지도

### Gateway Route

파일:

- `src/packages/contracts/gateway/routes.py`
- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`

Target Agent가 쓰는 주요 route:

```python
AGENT_CONNECT_PATH = "/agent/connect"
AGENT_EVIDENCE_PATH = "/agent/evidence"
AGENT_COMMAND_POLL_PATH = "/agent/commands/poll"
AGENT_COMMAND_START_PATH = "/agent/commands/{command_id}/start"
AGENT_COMMAND_HEARTBEAT_PATH = "/agent/commands/{command_id}/heartbeat"
AGENT_COMMAND_RESULT_PATH = "/agent/commands/{command_id}/result"
AGENT_EVIDENCE_JOB_SCHEDULE_PATH = "/agent/evidence/jobs"
AGENT_EVIDENCE_JOB_POLL_PATH = "/agent/evidence/jobs/poll"
AGENT_EVIDENCE_JOB_RESULT_PATH = "/agent/evidence/jobs/{job_id}/result"
```

Agent evidence request의 현재 shape:

```python
class AgentEvidenceRequest(StrictModel):
    cluster_id: str
    workspace_id: str
    correlation_id: str | None = None
    agent_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    evidence_key: str | None = None
    kubernetes: dict[str, Any]
    metrics: dict[str, Any]
    logs: list[dict[str, Any]]
    traces: dict[str, Any]
```

주의:

- HTTP request에는 `correlation_id`가 있을 수 있다.
- event body인 `ClusterEvidenceReceivedBody`에는 현재 `correlation_id` 필드가 없다.
- Gateway/event gateway가 envelope의 `correlation_id`를 만든다.

### Event Subject

파일:

- `src/packages/contracts/event_bus/subjects.py`

대표 subject:

```python
CLUSTER_EVIDENCE_RECEIVED = "cluster.evidence.received"
EVIDENCE_BUILT = "evidence.built"
EVIDENCE_BUNDLE_BUILT = "evidence.bundle.built"
RCA_CANDIDATES_PLANNED = "rca.candidates.planned"
RCA_CANDIDATES_EVALUATED = "rca.candidates.evaluated"
RCA_COMPLETED = "rca.completed"
RCA_ACTION_REQUIRED = "rca.action_required"
SAFE_PR_REQUESTED = "safe_pr.requested"
SAFE_PR_CREATED = "safe_pr.created"
SAFE_PR_FAILED = "safe_pr.failed"
COMMAND_REQUESTED = "command.requested"
COMMAND_QUEUED_FOR_AGENT = "command.queued_for_agent"
COMMAND_COMPLETED = "command.completed"
```

### RCA Event Body

파일:

- `src/domains/rca/events.py`

현재 `ClusterEvidenceReceivedBody`:

```python
@event(EventSubject.CLUSTER_EVIDENCE_RECEIVED)
@dataclass(frozen=True)
class ClusterEvidenceReceivedBody(EventBody):
    cluster_id: str
    kubernetes: JsonObject
    metrics: JsonObject
    logs: list[JsonObject]
    traces: JsonObject
    workspace_id: str = DEFAULT_WORKSPACE_ID
    agent_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    evidence_key: str | None = None
```

현재 `RcaCompletedBody`:

```python
@event(EventSubject.RCA_COMPLETED)
@dataclass(frozen=True)
class RcaCompletedBody(EventBody):
    root_cause: str
    action: str
    evidence_ref: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    evidence: Evidence | None = None
    incident: IncidentRecord | None = None
    evidence_bundle: EvidenceBundle | None = None
    candidates: list[CauseCandidate] | None = None
    evaluations: list[CauseEvaluation] | None = None
    rca_detail: RcaReportDetail | None = None
    rule_missing: RcaRuleMissing | None = None
```

주의:

- `status`, `summary`, `recommended_fix`, `evidence_refs`를 body 최상위에 넣고 싶으면 계약 변경이다.
- 현재 confidence는 `RcaReportDetail.confidence`에 있다.
- insufficient evidence는 `RcaActionRequiredBody`, `RcaRuleMissingBody`, `RcaAiFallbackRequestedBody` 같은 별도 흐름으로 표현하는 것이 현재 구조와 맞다.

### Safe PR Event Body

파일:

- `src/domains/scm/events.py`

현재 `SafePrRequestedBody`:

```python
@event(EventSubject.SAFE_PR_REQUESTED)
@dataclass(frozen=True)
class SafePrRequestedBody(EventBody):
    title: str
    body: str
    provider: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    next_alert: AlertRequestedBody | None = None
```

주의:

- 현재 PR request body는 `file_changes`, `branch_name`, `patch`를 직접 갖지 않는다.
- Safe PR 패치 초안은 `SafePrPatchPreparedBody`가 따로 있다.
- 실제 PR 생성 완료는 `safe_pr.created`, 실패는 `safe_pr.failed`다.

## End-to-End 흐름

### 흐름 A. GitOps 변경에서 Target Agent command까지

```text
Gateway /github/webhook
  -> git.webhook.received
  -> git.changed
  -> manifest.rendered
  -> desired.diff.detected
  -> diff.analyzed
  -> safe_pr.requested
  -> safe_pr.created
  -> alert.requested
  -> alert.dispatched
  -> command.requested
  -> command.dispatched
  -> command.queued_for_agent
  -> Agent GET /agent/commands/poll
  -> Agent POST /agent/commands/{id}/start
  -> Agent POST /agent/commands/{id}/heartbeat
  -> Agent POST /agent/commands/{id}/result
  -> command.completed
```

대표 검증:

```bash
uv run pytest tests/test_event_golden_path.py
uv run pytest tests/test_command_worker.py tests/test_target_agent_client.py
```

팀 연결:

- GitOps/Command는 `command.queued_for_agent`까지만 책임진다.
- Target/Telemetry는 Gateway command poll/result API만 사용한다.
- Platform은 event correlation과 outbox 경계를 검증한다.

### 흐름 B. Target Evidence에서 RCA까지

```text
Target Agent POST /agent/evidence
  -> cluster.evidence.received
  -> evidence.built
  -> incident.detected
  -> evidence.bundle.built
  -> rca.candidates.planned
  -> rca.candidates.evaluated
  -> rca.completed
```

대표 검증:

```bash
uv run pytest tests/test_agent_evidence_ingest.py
uv run pytest tests/test_rca_evidence.py
```

팀 연결:

- Target/Telemetry는 `kubernetes`, `metrics`, `logs`, `traces`를 bounded summary로 보낸다.
- Gateway/Auth는 request schema, auth, dedupe/outbox를 책임진다.
- RCA/Safe PR은 `ClusterEvidenceReceivedBody` 이후 worker chain을 책임진다.

### 흐름 C. RCA에서 Safe PR 또는 사람 조치까지

```text
rca.completed
  -> recovery.planned
  -> recovery.selection_requested 또는 recovery.action_selected
  -> safe_pr.requested 또는 command.requested 또는 rca.action_required
  -> safe_pr.created 또는 safe_pr.failed
```

대표 검증:

```bash
uv run pytest tests/test_rca_evidence.py tests/test_repo_gateway_worker.py
```

팀 연결:

- RCA/Safe PR은 직접 GitHub write를 하지 않고 request/proposal event를 만든다.
- GitOps/SCM worker는 `safe_pr.requested`를 받아 `GithubScmProvider` provider write를 처리한다.
- Gateway/Auth는 실제 provider token을 Token Broker/credential ref 뒤에 둔다.

### 흐름 D. Audit Timeline

```text
any event
  -> audit-worker
  -> audit_log row(event_id, subject, source, correlation_id, payload)
```

대표 검증:

```bash
uv run pytest tests/test_projection.py
```

주의:

- 현재 audit table은 payload를 저장한다.
- token, password, kubeconfig, provider credential이 payload에 들어가면 audit에도 남을 수 있다.
- secret non-leak 테스트는 producer 쪽에서 먼저 막아야 한다.

## 역할별 이해 기준

### Platform / Integration

알아야 할 것:

- event envelope의 `event_id`, `correlation_id`, `causation_id`가 전체 추적의 기준이다.
- worker handler가 yield한 event body는 runtime/outbox 경계를 통해 다음 event가 된다.
- 새 subject/body가 추가되면 event registry와 catalog 테스트가 통과해야 한다.

주요 테스트:

```bash
uv run pytest tests/test_event_registry.py tests/test_event_catalog_script.py
uv run pytest tests/test_event_runtime.py tests/test_outbox.py tests/test_dlq_reliability.py
uv run pytest tests/test_event_golden_path.py
```

완료 기준:

- 새 event가 `scripts/events.py` 출력에 보인다.
- correlation/causation이 끊기지 않는다.
- DB write와 event publish가 불일치하지 않는다.

### Gateway / Auth

알아야 할 것:

- Gateway는 외부 HTTP 입력의 입구다.
- `POST /agent/evidence`는 worker 로직을 직접 실행하지 않고 `cluster.evidence.received`를 outbox/event로 넘긴다.
- agent identity가 request body보다 우선한다. agent가 body에 다른 workspace/cluster를 넣어도 trusted identity로 네임스페이스해야 한다.

주요 테스트:

```bash
uv run pytest tests/test_api_event_gateway.py tests/test_gateway_error_handler.py
uv run pytest tests/test_agent_evidence_ingest.py
uv run pytest tests/test_identity_auth_routes.py tests/test_auth_security.py tests/test_password_auth.py
```

완료 기준:

- invalid schema는 4xx로 막힌다.
- unauthorized/forbidden 케이스가 있다.
- secret/session token이 response/event/log에 없다.

### GitOps / Command

알아야 할 것:

- GitOps는 desired diff와 risk reason을 구조화해서 command 또는 Safe PR 판단의 근거를 만든다.
- Command worker는 Target Agent를 직접 호출하지 않는다. agent command queue에 적재한다.
- production write는 fail-closed이고 sandbox namespace 기준을 기본으로 한다.

주요 테스트:

```bash
uv run pytest tests/test_git_pull_worker.py tests/test_manifest_render_worker.py
uv run pytest tests/test_diff_worker.py tests/test_diff_analyze_worker.py tests/test_gitops_diffing.py
uv run pytest tests/test_command_worker.py tests/test_command_router.py tests/test_command_catalog.py
```

완료 기준:

- `command.requested -> command.dispatched -> command.queued_for_agent`가 테스트된다.
- 정책 거부는 `command.rejected`로 표현된다.
- Target Agent 직접 호출 코드가 없다.

### RCA / Safe PR

알아야 할 것:

- RCA는 raw evidence를 바로 추측하지 않고 `Evidence`, `IncidentRecord`, `EvidenceBundle` 흐름으로 좁힌다.
- `RcaCompletedBody`는 현재 `root_cause`, `action`, `evidence_ref`와 optional detail을 가진다.
- PR 생성 요청은 `SafePrRequestedBody`이고, 실제 PR 완료는 `SafePrCreatedBody`다.

주요 테스트:

```bash
uv run pytest tests/test_rca_evidence.py
uv run pytest tests/test_repo_gateway_worker.py
uv run pytest tests/test_projection.py
```

완료 기준:

- evidence 부족은 성공 RCA처럼 보이지 않는다.
- root cause는 evidence reference와 함께 남는다.
- 실제 GitHub write는 token/reference 검증과 주입 가능한 HTTP transport 테스트를 포함한다.

### Target / Telemetry

알아야 할 것:

- Target Agent는 Gateway HTTP API만 호출한다.
- Prometheus에서 query하는 일과 Prometheus가 scrape할 `/metrics`를 제공하는 일은 다르다.
- raw telemetry 전체가 아니라 summary evidence를 보낸다.

주요 테스트:

```bash
uv run pytest tests/test_node_collector.py
uv run pytest tests/test_target_agent_client.py tests/test_target_agent_commands.py
uv run pytest tests/test_target_metric_evidence.py tests/test_target_telemetry_evidence.py
uv run pytest tests/test_target_pod_evidence.py tests/test_agent_evidence_ingest.py
```

완료 기준:

- cluster-agent 안에 raw NATS/DB dependency가 없다.
- evidence payload가 bounded summary다.
- Kubernetes write는 sandbox namespace 밖을 거부한다.

## PR마다 해야 하는 테스트 선택법

### 1. 계약을 바꿨는가?

대상:

- event subject/body
- Gateway request/response
- command payload
- evidence schema

실행:

```bash
uv run pytest tests/test_event_registry.py tests/test_event_catalog_script.py tests/test_schemas.py
uv run ruff check src tests
```

추가 확인:

```bash
python scripts/events.py
```

### 2. Gateway route를 바꿨는가?

실행:

```bash
uv run pytest tests/test_api_event_gateway.py tests/test_gateway_error_handler.py
uv run pytest tests/test_auth_security.py tests/test_identity_auth_routes.py
```

확인할 것:

- valid request
- invalid schema
- unauthorized
- forbidden
- secret non-leak

### 3. Target Agent나 telemetry를 바꿨는가?

실행:

```bash
uv run pytest tests/test_target_agent_client.py tests/test_target_agent_commands.py
uv run pytest tests/test_node_collector.py
uv run pytest tests/test_target_metric_evidence.py tests/test_target_pod_evidence.py
```

확인할 것:

- Gateway HTTP path만 사용
- scrape/query 방향 구분
- payload size limit
- token/kubeconfig non-leak

### 4. RCA나 Safe PR을 바꿨는가?

실행:

```bash
uv run pytest tests/test_rca_evidence.py tests/test_repo_gateway_worker.py
uv run pytest tests/test_projection.py
```

확인할 것:

- insufficient evidence
- rule missing
- injected provider transport
- feature flag off
- audit timeline

### 5. 여러 역할이 이어지는 흐름을 바꿨는가?

실행:

```bash
uv run pytest tests/test_event_golden_path.py
uv run pytest tests/test_workflow_controller.py
make test
```

확인할 것:

- event subject 순서
- correlation id 단일성
- causation id chain
- outbox/DB write 일관성

## 논리적 모순 점검표

PR 설명이나 문서를 쓰기 전에 아래 질문에 모두 답한다.

| 질문 | 맞는 답 |
| --- | --- |
| 이 필드는 body에 있는가, envelope에 있는가? | body dataclass와 `EventEnvelope`를 직접 확인했다. |
| provider adapter를 실제 코드 기준으로 설명했는가? | `GithubScmProvider`, `PrometheusMetricsProvider`, `KubernetesSnapshotProvider` 등 실제 class 이름을 썼다. |
| Target Agent가 NATS나 DB를 직접 쓰는가? | 아니다. Gateway HTTP API만 쓴다. |
| Gateway가 worker 내부 로직을 직접 실행하는가? | 아니다. request 검증 후 event/outbox로 넘긴다. |
| raw telemetry 전체를 event로 보내는가? | 아니다. bounded summary evidence만 보낸다. |
| PR 생성과 PR 제안을 같은 event로 섞었는가? | 아니다. requested/created/failed를 구분한다. |
| 실제 provider token이 event/log/audit에 들어가는가? | 아니다. credential ref 또는 Token Broker 경계만 쓴다. |
| production namespace write가 가능한가? | 아니다. sandbox/validation namespace 정책으로 fail-closed한다. |
| 새 event를 docs만 바꾸고 테스트를 안 바꿨는가? | 아니다. registry/catalog/producer/consumer 테스트가 있다. |

## 쉬운 문서 작성 기준

작업 페이지는 아래 순서를 유지한다.

1. 목표: 이 페이지가 끝나면 무엇이 달라지는가
2. 먼저 읽을 파일: 3-6개만 둔다
3. 수정 후보: 작업자가 열 파일 목록
4. 선형 절차: 번호 순서대로 하면 끝나야 한다
5. 코드 예시: 실제 코드 이름과 맞는 짧은 예시
6. 검증: 바로 실행할 명령
7. 완료 기준: 다음 페이지로 넘어갈 수 있는 조건
8. 다음 작업: 다음 파일 링크

나쁜 문서:

```text
RCA를 고도화한다.
```

좋은 문서:

```text
RcaCandidatesEvaluatedBody를 입력으로 받아 RcaCompletedBody를 yield한다.
insufficient evidence는 RcaActionRequiredBody로 끝낸다.
검증은 uv run pytest tests/test_rca_evidence.py 로 한다.
```

## 팀 간 PR 설명 템플릿

```markdown
## 변경
- <내 역할에서 바꾼 코드/문서>

## 연결 계약
- 입력: <HTTP route 또는 event subject/body>
- 출력: <event subject/body 또는 DB projection>
- correlation: envelope correlation_id 유지 여부

## 다른 팀 영향
- Gateway/Auth:
- GitOps/Command:
- RCA/Safe PR:
- Target/Telemetry:
- Platform/Integration:

## 테스트
- `uv run pytest ...`
- `uv run ruff check src tests`

## 모순 점검
- body/envelope 필드 확인:
- provider/test-double 경계 확인:
- secret non-leak 확인:
- direct NATS/DB import 확인:
```

## 최종 release 전 한 줄 검증

데모 또는 통합 release 전에는 아래를 실행한다.

```bash
make test
make manifest-check
make smoke
python scripts/events.py
```

Kubernetes manifest를 확인할 때는 management kustomization과 target manifest를 분리한다.

```bash
kubectl apply --dry-run=client --validate=false -k deploy/management -o name
kubectl apply --dry-run=client --validate=false -f deploy/target/target.yaml -o name
```
