---
source_commit: 243e7fc0
status: synced
---

# services/ai/agent — RCA/복구 파이프라인 공유 패키지

> 소스: `src/services/ai/agent/` · 테스트: `tests/`

AI 워커 프로세스들이 공유하는 **순수 도메인 로직 패키지**다. 이벤트 body를 입력받아
다음 단계 이벤트 body를 계산해 돌려줄 뿐, NATS/DB/HTTP를 전혀 모른다
(이벤트 배선·저장은 각 워커 `app.py`의 책임).

하위 구조:

| 하위 패키지 | 역할 |
|---|---|
| `defaults.py` | 파이프라인 전역 기본값·메시지 상수(불변 dataclass) |
| `pipeline/` | 단계별 파사드(Pipeline)와 변환기(Builder/Detector/Planner/Evaluator/Analyzer) |
| `causes/` | 증상→원인 후보 지식 베이스(YAML 룰 카탈로그 + 코드 프로파일) + 룰 엔진 |
| `playbooks/` | 룰 등록 데코레이터 네임스페이스(`rca`)와 룰 타입 정의 |
| `recovery/` | 원인→복구 액션 지식 베이스 + 복구 계획/선택/디스패치 로직 |

## 책임 (Responsibility)

- 하는 일: 증거 정규화 → 장애 판정 → 근거 번들 → 원인 후보 계획/평가 → 근본 원인 확정 →
  복구 계획 → 복구 후보 선택 → 실행 경로(route)별 디스패치 body 생성.
- 하지 않는 일: 이벤트 발행/구독, DB 저장, LLM 호출(LLM은 [chat-worker](ai-chat-worker.md)만 사용).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | 파이프라인 전 단계 이벤트 body·값 객체 |
| import | `domains.command.actions`, `domains.command.events` | [../../domains/command.md](../domains/command.md) | 복구→명령 변환(`CommandRequestedBody`), 명령 카탈로그 조회 |
| import | `domains.scm.events` | [../../domains/scm.md](../domains/scm.md) | Safe PR 요청 body(`SafePrRequestedBody`, `SafePrFilePatch`) |
| import | `domains.gitops.events` | [../../domains/gitops.md](../domains/gitops.md) | 명령 요청에 실을 `Diff` 값 객체 |
| import | `packages.contracts.event_bus` | [../../packages/contracts.md](../packages/contracts.md) | `EventBody`, `JsonObject`, `PipelineContractFailedBody` |
| import | `packages.config.constants` | [../../packages/config.md](../packages/config.md) | `GitHub.PROVIDER`, `Sandbox`, `Target` 상수 |

## 공개 인터페이스 (Public API)

### defaults.py — 전역 기본값

모두 `@dataclass(frozen=True)`. 필드 기본값이 곧 스펙 값이다.

| 클래스 | 앵커 | 필드 = 기본값 |
|---|---|---|
| `EvidenceDefaults` | `src/services/ai/agent/defaults.py :: EvidenceDefaults` | `object_ref_prefix="object://evidence"`, `kind="rca_bundle"` |
| `IncidentMessages` | `src/services/ai/agent/defaults.py :: IncidentMessages` | `detected_reason="deterministic evidence sample indicates failure"`, `not_detected_reason="no deterministic incident signal found"` |
| `RcaMessages` | `src/services/ai/agent/defaults.py :: RcaMessages` | `no_incident_action_required="incident flag was not set"`, `missing_incident_context="incident context is missing"`, `missing_analysis_context="RCA analysis context is missing"` |
| `RcaDefaults` | `src/services/ai/agent/defaults.py :: RcaDefaults` | `recommended_action="plan_recovery"` |
| `ActionRoutes` | `src/services/ai/agent/defaults.py :: ActionRoutes` | `safe_pr="draft_pr"`, `approval_required="approval_required"`, `forbidden="forbidden"`, `auto="auto"` |
| `RecoveryDefaults` | `src/services/ai/agent/defaults.py :: RecoveryDefaults` | `action_type="rollout_restart"`, `risk_level="low"`, `dry_run=True`, `unknown_namespace="unknown"` |

### pipeline/ — 단계 파사드

`src/services/ai/agent/pipeline/__init__.py` 가 재노출하는 심볼(`__all__`):
`CauseEvaluationPipeline`, `CauseEvaluator`, `CausePlanner`, `CausePlanningPipeline`,
`EvidenceBuilder`, `EvidenceBundler`, `EvidencePipeline`, `IncidentDetector`,
`IncidentPipeline`, `IncidentPipelineBodies`, `RcaCompletionPipeline`,
`RecoveryPlanningPipeline`, `RootCauseAnalyzer`.

모든 파사드는 `@dataclass(frozen=True)` 이고 내부 변환기를 `field(default_factory=...)` 로 갖는다.

```python
# src/services/ai/agent/pipeline/pipeline.py :: EvidencePipeline
class EvidencePipeline:
    builder: EvidenceBuilder
    @property
    def kind(self) -> str                      # = builder.kind = "rca_bundle"
    def build_evidence(self, evt: ClusterEvidenceReceivedBody, correlation_id: str) -> Evidence

# src/services/ai/agent/pipeline/pipeline.py :: IncidentPipelineBodies
class IncidentPipelineBodies:
    detected_body: IncidentDetectedBody
    next_body: EventBody                       # EvidenceBundleBuiltBody 또는 RcaActionRequiredBody

# src/services/ai/agent/pipeline/pipeline.py :: IncidentPipeline
class IncidentPipeline:
    detector: IncidentDetector
    bundler: EvidenceBundler
    def build_bodies(self, evidence: Evidence, correlation_id: str) -> IncidentPipelineBodies

# src/services/ai/agent/pipeline/pipeline.py :: CausePlanningPipeline
class CausePlanningPipeline:
    planner: CausePlanner
    def plan_body(self, evt: EvidenceBundleBuiltBody) -> RcaCandidatesPlannedBody
    def plan_bodies(self, evt: EvidenceBundleBuiltBody) -> tuple[EventBody, ...]

# src/services/ai/agent/pipeline/pipeline.py :: CauseEvaluationPipeline
class CauseEvaluationPipeline:
    evaluator: CauseEvaluator
    def evaluate_body(self, evt: RcaCandidatesPlannedBody) -> EventBody

# src/services/ai/agent/pipeline/pipeline.py :: RcaCompletionPipeline
class RcaCompletionPipeline:
    analyzer: RootCauseAnalyzer
    def complete_body(self, evt: RcaCandidatesEvaluatedBody) -> EventBody

# src/services/ai/agent/pipeline/pipeline.py :: RecoveryPlanningPipeline
class RecoveryPlanningPipeline:
    planner: RecoveryPlanner                   # services.ai.agent.recovery.engine 소속
    def plan_body(self, evt: RcaCompletedBody) -> EventBody
```

#### pipeline/evidence.py — EvidenceBuilder

`src/services/ai/agent/pipeline/evidence.py :: EvidenceBuilder`

- `defaults: EvidenceDefaults`
- `kind` property → `defaults.kind`
- `build_evidence(evt, correlation_id) -> Evidence`:
  `object_ref = f"{defaults.object_ref_prefix}/{correlation_id}.json"` 로 만들고
  `evt` 의 `cluster_id/kubernetes/metrics/logs/traces/workspace_id` 를 그대로 복사한
  [`Evidence`](../domains/rca.md) 값 객체를 반환.

#### pipeline/incident.py — IncidentDetector / EvidenceBundler

`src/services/ai/agent/pipeline/incident.py :: IncidentDetector`

- `messages: IncidentMessages`
- `detect_body(evidence: Evidence, correlation_id: str) -> IncidentDetectedBody`
  - `incident = classify(evidence, correlation_id)` — correlation_id가 곧 `incident_id`.
  - `detected = has_signal(evidence)`
  - `reason` 은 detected 여부에 따라 `messages.detected_reason` / `messages.not_detected_reason`.
  - `detected=True`이면 `severity=incident.severity`, `affected=affected_resources(incident)`,
    `evidence=compact_evidence_reference(evidence)`, `incident` 를 body에 채워 반환한다.
  - `detected=False`이면 정상 샘플 사실만 남기고 `severity=None`, `affected=[]`, `incident=None` 으로 반환한다.
- `has_signal(evidence) -> bool`:
  `derive_symptom(evidence.kubernetes)` 가 명시/유도 symptom 또는 대표 signal을 만들면 true.
  Kubernetes 신호가 없을 때는 `metrics.alertmanager.alerts[].status == "firing"` 이 있으면 true.
  일반 metrics sample만으로는 incident로 보지 않는다.
- `classify(evidence, incident_id) -> IncidentRecord`
  - `derive_symptom(evidence.kubernetes)` 로 대표 symptom을 만든다. `kubernetes["symptom"]` 이 명시되어 있으면 그대로 쓰고, 없으면 pod waiting/terminated reason, warning event, service/endpoints 신호를 우선순위 표대로 `ImagePullBackOff`, `CrashLoopBackOff`, `FailedScheduling`, `Ingress 502/503` 중 하나로 승격한다. 신호가 없으면 `"unknown"`이다.
  - `resource_kind/name/namespace` 는 `resolve_resource(evidence.kubernetes, derived.signal)` 로 추출한다. 명시 `kubernetes["resource"]` dict가 있으면 그 값을 우선하고, 없으면 대표 신호의 리소스 힌트(소유 workload 또는 service)를 쓴다. 둘 다 없으면 `"Unknown"/"unknown"/None`.
  - `secondary_symptoms = derived.secondary_symptoms`,
    `severity = str(kubernetes.get("severity", "medium"))`,
    `first_seen_at = kubernetes.get("first_seen_at")`,
    `summary = f"{resource_kind} {resource_name} has {symptom}"`.
- `derive_symptom(kubernetes: JsonObject) -> DerivedSymptom` — 아래 pipeline/symptom.py 참조.
- `resolve_resource(kubernetes: JsonObject, signal: SymptomSignal | None) -> tuple[str, str, str | None]`
- `affected_resources(incident) -> list[JsonObject]` — 단일 원소 리스트,
  키: `cluster_id, workspace_id, namespace, resource_kind, resource_name, symptom, severity`.

#### pipeline/symptom.py — snapshot 신호 → symptom 승격

`src/services/ai/agent/pipeline/symptom.py :: derive_symptom` —
에이전트 kubernetes snapshot 요약(pods/events/services/endpoints)의 장애 신호를
카탈로그(causes/catalog/*.yaml) symptom 어휘로 결정적으로 승격한다.
계약: **명시 > 유도 > `"unknown"`** — `kubernetes["symptom"]` 이 명시돼 있으면
(alertmanager/webhook, 테스트 레거시 데이터) 절대 덮지 않는다.

신호 → symptom 유도 표(우선순위 순 — 근거 rationale 은 모듈 상수 주석):

| 우선순위 | 신호(근거) | 유도 symptom |
|---|---|---|
| 1 | pod `waiting_reasons` ∈ {ImagePullBackOff, ErrImagePull, InvalidImageName, ErrImageNeverPull} · event `Failed`+"pull image" · event `BackOff`+"pulling image" | `ImagePullBackOff` |
| 2 | pod `waiting_reasons` CrashLoopBackOff · event `BackOff`+"restarting failed container" | `CrashLoopBackOff` |
| 3 | pod `terminated_reasons` OOMKilled · event `OOMKilling` | `CrashLoopBackOff` (crashloop 룰의 `oom_killed` 후보로 수렴) |
| 4 | event `FailedScheduling` · pod Pending + node 미배정 | `FailedScheduling` |
| 5 | event `Unhealthy`+"probe" · pod Running + Ready=False(상위 신호 없는 파드만) | `Ingress 502/503` (`backend_readiness_failure` 계열) |
| 6 | Service selector 有 + 해당 EndpointSlice endpoint 합 0 + selector 매칭 파드 없음 | `Ingress 502/503` (`upstream_unavailable` 계열) |

- 다중 신호 대표 선정: 우선순위 → 출처 순위(파드 상태 > 이벤트 > service) → 가중치
  (재시작 수/이벤트 count) → 리소스 이름/신호 라벨(사전순) — 같은 입력이면 항상 같은 결과.
  나머지 신호 라벨은 `IncidentRecord.secondary_symptoms` 로 보존한다(정보 손실 없음).
- Event 객체는 해결 뒤에도 남을 수 있으므로 `event_is_current_warning` 이 `Warning`
  또는 type 미기재 event만 본다. `cluster.collected_at` 이 있으면
  `last_timestamp`/`first_timestamp` 가 10분(`EVENT_SIGNAL_MAX_AGE`)보다 오래된 warning event는
  symptom 신호에서 제외한다. Pod 대상 Event는 같은 namespace/name의 현재 Pod가 있어야 하며,
  probe 실패는 그 Pod가 아직 Ready가 아닐 때만 유효하다. 롤아웃으로 삭제됐거나 이미 Ready로
  회복된 Pod의 최근 Event는 새 incident를 만들지 않는다.
- `src/services/ai/agent/pipeline/symptom.py :: resolve_resource` — incident 대상 결정.
  명시 `kubernetes["resource"]` > 대표 신호의 리소스 힌트(파드 소유 워크로드 또는 Pod/Service)
  > `"Unknown"/"unknown"/None`.
- 테스트: `tests/test_incident_symptom_derivation.py` —
  `src/samples/scenarios/faults/` 6개 장애 클래스(crashloop, oom, imagepull,
  probe-fail, sched-fail, svc-selector) 레거시 데이터 로 (a) symptom 유도, (b) 후보 계획,
  (c) crashloop → `rca.completed` golden path 를 검증.

`src/services/ai/agent/pipeline/incident.py :: EvidenceBundler`

- `messages: RcaMessages`
- `build_body(evt: IncidentDetectedBody) -> EventBody` 분기:
  1. `evt.evidence is None or evt.incident is None` →
     `RcaActionRequiredBody(reason=messages.missing_incident_context, evidence_ref=evidence.object_ref if evidence else "unknown", workspace_id=evt.workspace_id)`
  2. `not evt.detected` →
     `RcaActionRequiredBody(reason=messages.no_incident_action_required, evidence_ref=evidence.object_ref, workspace_id=evidence.workspace_id)`
  3. 그 외 → `EvidenceBundleBuiltBody(evidence=compact_evidence_reference(evidence), incident, evidence_bundle=build_incident_evidence_bundle(evidence, incident))`

#### pipeline/evidence_bundle.py — 근거 번들 빌더 (모듈 함수)

| 함수 | 앵커 | 동작 |
|---|---|---|
| `extract_resource(kubernetes: dict)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: extract_resource` | incident 분류와 같은 규칙. 명시 resource가 있으면 우선하고, 없으면 `derive_symptom(...).signal`의 리소스 힌트를 쓴다. |
| `extract_symptom(kubernetes: dict)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: extract_symptom` | incident 분류와 같은 규칙. 명시 symptom이 있으면 보존하고, 없으면 snapshot 신호를 카탈로그 symptom으로 유도한다. |
| `build_incident_evidence_bundle(evt, incident)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: build_incident_evidence_bundle` | 아래 참조 |
| `compact_evidence_reference(evidence)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: compact_evidence_reference` | downstream 이벤트에는 원본 provider payload 중복 대신 `object_ref`, lineage, cluster 식별자 중심의 얇은 참조만 싣는다. `logs`는 빈 list로 줄이고 kubernetes/metrics/traces는 `compact_reference_payload` 결과만 보존한다. |
| `compact_reference_payload(payload)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: compact_reference_payload` | `_lineage`와 `cluster.cluster_id/namespace/collected_at`만 보존한다. |
| `evidence_ref_for(evt, source, name)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: evidence_ref_for` | `Evidence` 면 `object_ref`, 아니면 `evidence_key or f"cluster:{workspace_id}:{cluster_id}"` 를 base로 `f"{base}#{source}:{name}"` |
| `source_check_id(source, name)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: source_check_id` | `f"evidence:{source}:{name}"` |
| `source_query(source, name)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: source_query` | `f"{source}.{name}"` |
| `evidence_item(evt, *, source, name, value, summary)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: evidence_item` | 위 세 헬퍼로 `EvidenceItem` 구성 |
| `missing_source_checks(missing_evidence)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: missing_source_checks` | source마다 `MissingEvidenceCheck(check_id=f"evidence:{source}:required", status="missing", reason=f"{source} evidence query/check must complete before RCA can be finalized.")` |
| `select_incident_log_entries(logs, namespace)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: select_incident_log_entries` | incident 네임스페이스의 로그만 근거로 채택. Loki entry 는 네임스페이스 라벨(`k8s_namespace_name`/`namespace`)이 일치하는 stream 만 남기고 전부 걸러지면 entry 제외; 라벨 없는 stream/단순 line entry 는 귀속 불가라 유지; namespace 미상이면 무필터. 원본 `Evidence.logs` 는 그대로(수집 시점 분리는 후속 과제) |
| `collect_evidence_items(evt)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: collect_evidence_items` | 아래 참조 |
| `compact_kubernetes_value(...)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: compact_kubernetes_value` | incident resource와 관련된 pods/events/workloads/services/endpoints, not-ready nodes, cluster/resource/symptom/severity/lineage만 bounded payload로 남긴다. |
| `compact_metrics_value(metrics)` / `compact_traces_value(traces)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: compact_metrics_value`, `compact_traces_value` | 결과 dict를 최대 result/series 수로 줄이고 긴 문자열은 `MAX_TEXT_LENGTH`로 자른다. |
| `compact_log_entries(entries)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: compact_log_entries` | 로그 entry, stream, values 개수를 제한하고 line 문자열을 자른다. |

- 타입 별칭: `EvidenceSource = ClusterEvidenceReceivedBody | Evidence`
  (`src/services/ai/agent/pipeline/evidence_bundle.py :: EvidenceSource`)
- `collect_evidence_items` 는 공통 요약문
  `f"{namespace or 'unknown'} namespace의 {resource_kind} {resource_name}에서 {symptom} 증상이 보고되었습니다."`
  을 만들고, 존재하는 소스만 `EvidenceItem` 으로 수집한다:

| 조건 | source | name | value | summary 접미사 |
|---|---|---|---|---|
| `evt.kubernetes` truthy | `kubernetes` | `cluster_resource_state` | `compact_kubernetes_value(...)` | `" Kubernetes 상태 근거입니다."` |
| `evt.metrics` truthy | `metrics` | `telemetry_metrics` | `compact_metrics_value(evt.metrics)` | `" Metric snapshot 근거입니다."` |
| `select_incident_log_entries(evt.logs, namespace)` 비어있지 않음 | `logs` | `related_logs` | `{"entries": compact_log_entries(<필터된 로그>)}` | `" Log tail 근거입니다."` |
| `evt.traces` truthy | `traces` | `related_traces` | `compact_traces_value(evt.traces)` | `" Trace 근거입니다."` |

- `build_incident_evidence_bundle`:
  `required_sources = required_evidence_sources(incident)` (causes 엔진),
  `items = collect_evidence_items(evt)`,
  `missing_evidence = required_sources − {item.source}` (순서 유지),
  `complete = not missing_evidence`,
  `missing_evidence_checks = missing_source_checks(missing_evidence)` 로
  `EvidenceBundle(incident_id=incident.incident_id, ...)` 반환.

#### pipeline/causes.py — CausePlanner / CauseEvaluator / RootCauseAnalyzer

상수: `BACKLOG_STATUS_OPEN = "open"`
(`src/services/ai/agent/pipeline/causes.py :: BACKLOG_STATUS_OPEN`)

`src/services/ai/agent/pipeline/causes.py :: CausePlanner`

- 필드: `ai_fallback_enabled: bool = True`
- `plan_body(evt: EvidenceBundleBuiltBody) -> RcaCandidatesPlannedBody`
  - `plan = plan_causes(evt.incident, evt.evidence_bundle, evt.evidence.object_ref)`
  - `candidate_count=plan.candidate_count`, `evidence_ref=evt.evidence.object_ref`,
    `candidates=plan.candidates`, `workspace_id=evt.evidence.workspace_id`,
    `evidence/incident/evidence_bundle` 전달, `rule_missing=plan.rule_missing`.
- `plan_bodies(evt) -> tuple[EventBody, ...]`
  - `rule_missing is None` → `(planned,)` 만.
  - rule missing 이면 순서대로:
    1. `RcaRuleMissingBody(rule_missing=..., incident=evt.incident)`
    2. `build_backlog_item_created_body(rule_missing, evt)`
    3. `ai_fallback_enabled` 일 때 `build_ai_fallback_requested_body(rule_missing, evt)`
    4. `planned` (항상 마지막)

`src/services/ai/agent/pipeline/causes.py :: build_backlog_item_created_body`

- `backlog_id = f"missing-cause-rule:{rule_missing.workspace_id}:{rule_missing.symptom}"`
- `title = f"RCA rule 추가 필요: {rule_missing.symptom}"`, `reason = NO_MATCHING_RULE_MESSAGE`,
  `status = BACKLOG_STATUS_OPEN`,
  `payload = {"incident": evt.incident.to_body(), "evidence_bundle": evt.evidence_bundle.to_body(), "rule_missing": rule_missing.to_body()}`.

`src/services/ai/agent/pipeline/causes.py :: build_ai_fallback_requested_body`

- `RcaAiFallbackRequestedBody(reason=NO_MATCHING_RULE_MESSAGE, evidence_ref=rule_missing.evidence_ref, incident=evt.incident, evidence_bundle=evt.evidence_bundle, missing_evidence=rule_missing.missing_evidence, workspace_id=rule_missing.workspace_id, evidence=evt.evidence)`
  - `evidence` 동봉으로 ai-fallback-worker 가 되돌리는 `rca.candidates.planned` 가 rca-worker 의 evidence 필수 계약을 통과한다.

`src/services/ai/agent/pipeline/ai_fallback.py :: AiFallbackPlanner` — [ai-ai-fallback-worker](ai-ai-fallback-worker.md) 전용

- 필드: `max_candidates: int = MAX_FALLBACK_CANDIDATES`(5)
- `async plan_body(evt: RcaAiFallbackRequestedBody, llm: LlmClient) -> RcaCandidatesPlannedBody | None`
  - `build_fallback_prompt(evt)` (`src/services/ai/agent/pipeline/ai_fallback.py :: build_fallback_prompt`) — incident 증상 + evidence bundle **summary 문자열만** 실으며, 선택 가능한 실제 catalog cause ID 목록을 함께 제공(근거 원문 value 미포함, 최대 `MAX_PROMPT_EVIDENCE_ITEMS`=20건).
  - `llm.complete_json(prompt, FALLBACK_CANDIDATES_SCHEMA)` (`src/services/ai/agent/pipeline/ai_fallback.py :: FALLBACK_CANDIDATES_SCHEMA`) 호출.
  - `parse_fallback_candidates(raw, max_candidates)` (`src/services/ai/agent/pipeline/ai_fallback.py :: parse_fallback_candidates`) — catalog 밖 ID와 내용 signal 없는 후보를 버리고, LLM 작성 텍스트 대신 catalog의 title/evidence/check/signal 계약을 복원해 confidence 내림차순 상위 N개만 `CauseCandidate(source="ai_fallback")` 로 변환. 유효 후보 0건이면 `None`.
  - 반환 body 는 `rule_missing=None` — analyze-worker 가 rule 경로와 동일한 근거 매칭 평가를 수행한다.
  - LLM 미설정(ValueError)·호출 실패·JSON 파싱 실패는 예외로 전파(워커가 로그 후 무발행 종료).

`src/services/ai/agent/pipeline/causes.py :: CauseEvaluator`

- 필드: `messages: RcaMessages`
- `evaluate_body(evt: RcaCandidatesPlannedBody) -> EventBody`
  - `evt.evidence_bundle is None` → `PipelineContractFailedBody(contract="RcaCandidatesPlannedBody.evidence_bundle", reason=messages.missing_analysis_context, consumer="analyze-worker", payload=evt.to_body(), workspace_id, evidence_ref, severity="warning", diagnostics={"reason_code": "context_missing"})`
  - 정상 경로: `evaluations = evaluate_causes(evt.candidates, evt.evidence_bundle, evt.rule_missing)` 후
    입력 필드를 그대로 실은 `RcaCandidatesEvaluatedBody` 반환.

`src/services/ai/agent/pipeline/causes.py :: block_reason_code`

```python
def block_reason_code(evt: RcaCandidatesEvaluatedBody, detail) -> str | None
```
- `evt.rule_missing is not None or detail.root_cause == "unknown"` → `"rule_missing"`
- `detail.root_cause == "insufficient_evidence"` → `"insufficient_evidence"`
- `detail.selected_candidate_id == "none"` → `"no_evaluation"`
- `detail.missing_evidence` truthy → `"insufficient_evidence"`
- 그 외 → `None` (블록 없음)

`src/services/ai/agent/pipeline/causes.py :: RootCauseAnalyzer`

- 필드: `defaults: RcaDefaults`, `messages: RcaMessages`
- `complete_body(evt: RcaCandidatesEvaluatedBody) -> EventBody`
  1. `evidence/incident/evidence_bundle` 중 하나라도 None →
     `RcaActionRequiredBody(reason=messages.missing_analysis_context, evidence_ref, workspace_id)`
  2. `rca_detail = analyze_root_cause(evt.evaluations)`
  3. `reason_code = block_reason_code(evt, rca_detail)` 가 있으면
     `RcaAnalysisBlockedBody(reason_code, reason=rca_detail.reason, evidence_ref, workspace_id, evidence, incident, evidence_bundle, candidates, evaluations, rca_detail, rule_missing, missing_evidence=rca_detail.missing_evidence, diagnostics={"root_cause": rca_detail.root_cause})`
  4. 아니면 `RcaCompletedBody(root_cause=rca_detail.root_cause, action=defaults.recommended_action, ...컨텍스트 전체 동봉)`

### causes/ — 원인 지식 베이스 + 룰 엔진

`src/services/ai/agent/causes/catalog/__init__.py` 는 부수효과 패키지 루트다.
먼저 `load_rule_modules(package_name="services.ai.agent.causes", excluded=("catalog", "engine", "loader"))`로 코드 정의 rule을 발견하고, 이어서 `register_catalog_profiles()`가 `src/services/ai/agent/causes/catalog/*.yaml`을 읽어 `CAUSE_PROFILES`에 병합한다.
YAML schema와 저장 전 검증은 [packages/ai](../packages/ai.md#rule_catalogpy--rca-룰-yaml-검증-schema)의 `packages.ai.rule_catalog`가 담당한다. `src/services/ai/agent/causes/loader.py`는 파일 경로 로딩, 파일명 포함 오류 메시지, `CatalogRuleSpec` → `CauseProfile` 변환, 기존 code rule id와의 충돌 검사를 담당한다.
`catalog/__init__.py`는 `cause_rules`/`evidence_rules`를 재노출한다(`__all__ = ["cause_rules", "evidence_rules"]`).

#### causes/loader.py — YAML 카탈로그 로더

| 심볼 | 앵커 | 동작 |
|---|---|---|
| `CATALOG_DIR` | `src/services/ai/agent/causes/loader.py :: CATALOG_DIR` | 기본 카탈로그 디렉터리 = `causes/catalog/` (패키지 동봉, 컨테이너 이미지에 포함) |
| `CATALOG_PATTERNS` | `src/services/ai/agent/causes/loader.py :: CATALOG_PATTERNS` | `("*.yaml", "*.yml")` |
| `CauseCatalogError` | `src/services/ai/agent/causes/loader.py :: CauseCatalogError` | 카탈로그 로딩 실패 오류(RuntimeError) — 기동 시점 즉시 중단 |
| `cause_candidate_from_catalog(spec)` | `src/services/ai/agent/causes/loader.py :: cause_candidate_from_catalog` | `packages.ai.rule_catalog.CatalogCandidateSpec`을 service `CauseCandidateSpec`으로 변환한다. |
| `cause_profile_from_catalog(rule)` | `src/services/ai/agent/causes/loader.py :: cause_profile_from_catalog` | `CatalogRuleSpec`을 `CauseProfile(rule_id=rule.rule_id)`로 변환한다. |
| `parse_catalog_file(path)` | `src/services/ai/agent/causes/loader.py :: parse_catalog_file` | `packages.ai.rule_catalog.validate_catalog_yaml(path_text)` 호출. YAML 파싱 실패 → `"RCA 룰 카탈로그 YAML 파싱 실패: {파일명} — ..."`, 스키마/중복 위반 → `"RCA 룰 카탈로그 스키마 위반: {파일명} — ..."` |
| `load_catalog_profiles(catalog_dir=None)` | `src/services/ai/agent/causes/loader.py :: load_catalog_profiles` | `*.yaml`/`*.yml` 을 파일명 정렬 순서로 로딩(순수 함수); 카탈로그 내 rule id 중복 → `"RCA 룰 id 중복: ..."` |
| `register_catalog_profiles(catalog_dir=None)` | `src/services/ai/agent/causes/loader.py :: register_catalog_profiles` | 로딩 결과를 `CAUSE_PROFILES` 에 병합; 기존 등록 룰과 id 충돌 시 `CauseCatalogError`(병합 전 검사라 실패 시 레지스트리 오염 없음) |

카탈로그 파일 형식 전체 예시(`signals` 만 선택, 나머지 필드 필수, 알 수 없는 키는 거부):

```yaml
# src/services/ai/agent/causes/catalog/<시나리오>.yaml
rules:
  - id: "node_not_ready"                     # 룰 식별자 — 전체 카탈로그+코드 룰에서 고유
    symptoms: ["NodeNotReady"]               # incident.symptom 이 목록에 있으면 매칭
    required_sources: ["kubernetes", "metrics"]  # 근거 번들 필수 소스(evidence rule)
    candidates:                              # 매칭 시 생성되는 원인 후보(순서 유지)
      - candidate_id: "kubelet_down"
        title: "kubelet 중단"
        description: "노드 kubelet 프로세스가 중단되어 NodeNotReady 가 됐을 가능성이 있습니다."
        expected_evidence: ["kubernetes", "metrics"]  # 평가 시 점수 분모(소스 존재)
        checks:                              # 사람용 점검 프로즈 — 평가에는 미사용
          - "Node.status.conditions Ready=False reason 확인"
          - "kubelet process/heartbeat metric 확인"
        signals:                             # 판별 신호(선택) — 근거 "내용" 매칭 DSL
          - id: "kubelet_not_ready_evidence" # 미충족 시 missing_evidence 토큰 "signal:<id>"
            any_of:                          # 그룹 안은 OR — 하나라도 매칭되면 충족
              - fact: "event_reason=NodeNotReady"   # snapshot 정규화 fact 토큰 일치
              - log_pattern: "kubelet stopped"      # 로그 라인 대소문자 무시 부분일치
              - event_pattern: "node not ready"     # 이벤트 reason+message 부분일치
```

`signals` DSL 의미론(평가: `causes/signals.py`, 스키마: `causes/loader.py`):

- 그룹 목록은 AND — **선언된 그룹이 모두 충족돼야** 후보가 완결 점수(1.0)에 도달한다.
  미충족 그룹은 `missing_evidence` 에 `signal:<id>` 토큰으로 남아, 그 후보가 선택되면
  `rca.completed` 대신 `rca.analysis_blocked(insufficient_evidence)` 로 흐른다.
- `fact` 토큰 어휘(kubernetes snapshot 에서 추출, `src/services/ai/agent/causes/signals.py :: extract_bundle_signals`):
  `waiting_reason=<r>`, `terminated_reason=<r>`, `event_reason=<r>`,
  `exit_code=<n>`(예: `exit_code=137` — 컨테이너 현재/직전(lastState) 종료 코드),
  파생 토큰 `exit_code=non_oom`(0/137 이 아닌 종료 코드 관측 — 일반 앱 크래시 판별).
- `log_pattern` 은 로그 근거의 라인(단순 `{"line": ...}` + Loki `streams[].values[].line`),
  `event_pattern` 은 warning 이벤트의 `"reason message"` 문자열을 casefold 부분일치로 검사한다.
- 도입 배경: 소스 존재만 보던 기존 점수는 exit 1 크래시(OOM 신호 없음)도 `oom_killed` 를
  1.0 으로 완결시켰다. `oom_killed` 는 이제 양성 OOM 근거(`terminated_reason=OOMKilled` /
  `exit_code=137` / `OOMKilling` 이벤트 / OOM 로그) 없이는 완결 점수에 도달할 수 없다.

#### causes/engine.py — 룰 엔진

상수:

| 이름 | 값 | 앵커 |
|---|---|---|
| `DEFAULT_REQUIRED_EVIDENCE` | `["kubernetes"]` | `src/services/ai/agent/causes/engine.py :: DEFAULT_REQUIRED_EVIDENCE` |
| `MATCHING_CAUSE_RULE_EVIDENCE` | `"matching_cause_rule"` | `src/services/ai/agent/causes/engine.py :: MATCHING_CAUSE_RULE_EVIDENCE` |
| `NO_MATCHING_RULE_MESSAGE` | `"정의된 RCA rule 없음"` | `src/services/ai/agent/causes/engine.py :: NO_MATCHING_RULE_MESSAGE` |
| `UNKNOWN_EVALUATION_ID` | `"unknown"` | `src/services/ai/agent/causes/engine.py :: UNKNOWN_EVALUATION_ID` |

| 심볼 | 앵커 | 동작 |
|---|---|---|
| `CausePlan` | `src/services/ai/agent/causes/engine.py :: CausePlan` | `candidates: list[CauseCandidate]`, `rule_missing: RcaRuleMissing | None = None`, `candidate_count` property = `len(candidates)` |
| `unique_ordered(values)` | `src/services/ai/agent/causes/engine.py :: unique_ordered` | 순서 보존 중복 제거 |
| `required_evidence_sources(incident, rules=None)` | `src/services/ai/agent/causes/engine.py :: required_evidence_sources` | `rules`(기본 `evidence_rules()`) 중 `matches(incident)` 인 룰의 `required_sources` 를 합쳐 `unique_ordered`; 매칭 없으면 `DEFAULT_REQUIRED_EVIDENCE` 복사본 |
| `merge_candidates(candidates)` | `src/services/ai/agent/causes/engine.py :: merge_candidates` | `candidate_id` 로 병합: 첫 후보의 title/description 유지, `expected_evidence`·`checks` 는 합집합(순서 보존), `signals` 는 그룹 id 기준 합집합(`merge_signal_groups`) |
| `build_rule_missing(incident, evidence_ref)` | `src/services/ai/agent/causes/engine.py :: build_rule_missing` | `RcaRuleMissing(missing_evidence=[MATCHING_CAUSE_RULE_EVIDENCE], message=NO_MATCHING_RULE_MESSAGE, ...)` |
| `plan_causes(incident, evidence_bundle, evidence_ref, rules=None)` | `src/services/ai/agent/causes/engine.py :: plan_causes` | 매칭 룰의 후보들을 모아 `merge_candidates`; 결과 비면 `CausePlan(candidates=[], rule_missing=build_rule_missing(...))` |
| `evaluate_causes(candidates, evidence_bundle, rule_missing=None)` | `src/services/ai/agent/causes/engine.py :: evaluate_causes` | 아래 참조 |
| `evidence_refs_for_sources(evidence_bundle, sources)` | `src/services/ai/agent/causes/engine.py :: evidence_refs_for_sources` | source가 일치하는 `EvidenceItem.reference()` 목록 |
| `missing_evidence_checks(missing_evidence, candidate_checks=None)` | `src/services/ai/agent/causes/engine.py :: missing_evidence_checks` | source별 `MissingEvidenceCheck(check_id=f"evidence:{source}:required", status="missing", reason=missing_evidence_reason(...))` |
| `missing_evidence_reason(source, candidate_checks)` | `src/services/ai/agent/causes/engine.py :: missing_evidence_reason` | checks 없으면 `"{source} evidence query/check must complete before RCA can be finalized."`, 있으면 `"{source} evidence is required to evaluate checks: {', '.join(checks)}"` |
| `build_root_cause_reason(selected)` | `src/services/ai/agent/causes/engine.py :: build_root_cause_reason` | unknown이면 `NO_MATCHING_RULE_MESSAGE`, 아니면 `"{id} 후보가 가장 높은 점수로 평가되었고, 누락 근거 N개, 충족 근거 M개를 기준으로 최종 원인으로 선택했습니다."` |
| `unknown_root_cause(evaluation)` | `src/services/ai/agent/causes/engine.py :: unknown_root_cause` | `RcaReportDetail(root_cause="unknown", confidence=0.0, selected_candidate_id="unknown", missing_evidence=unique_ordered([MATCHING_CAUSE_RULE_EVIDENCE, *evaluation.missing_evidence]), reason=NO_MATCHING_RULE_MESSAGE, ...)` |
| `insufficient_evidence_root_cause(evaluations)` | `src/services/ai/agent/causes/engine.py :: insufficient_evidence_root_cause` | `root_cause="insufficient_evidence"`, `confidence=0.0`, `selected_candidate_id=evaluations[0].candidate_id`(없으면 `"none"`), 모든 평가의 missing_evidence 합집합, reason=`"후보는 생성됐지만 매칭된 근거가 없어 최종 원인을 확정하지 않았습니다."` |
| `analyze_root_cause(evaluations)` | `src/services/ai/agent/causes/engine.py :: analyze_root_cause` | 아래 참조 |

`evaluate_causes` 알고리즘:

1. `rule_missing` 이 있으면 단일 평가
   `[CauseEvaluation(candidate_id="unknown", score=0.0, checks=[MATCHING_CAUSE_RULE_EVIDENCE], supporting_evidence=[], missing_evidence=rule_missing.missing_evidence, reason=NO_MATCHING_RULE_MESSAGE)]` 반환.
2. 아니면 `bundle_signals = extract_bundle_signals(evidence_bundle)` 를 한 번 추출하고 후보마다:
   - `expected = set(candidate.expected_evidence)`,
     `actual_sources = {item.source for item in evidence_bundle.items}`
   - `supporting = sorted(expected & actual)`, `missing_sources = sorted(expected − actual)`
   - `matched/unmatched = split_signal_groups(candidate.signals, bundle_signals)` —
     판별 신호(내용 매칭). 미충족 그룹은 `signal:<id>` 토큰으로 `missing_evidence` 에 추가.
   - `score = (len(supporting) + len(matched)) / (len(expected) + len(candidate.signals))`
     (분모 0 이면 0.0). AI fallback 후보도 실제 catalog signals를 복원하므로 source/name만
     존재하고 내용 signal이 없으면 1.0에 도달할 수 없다.
   - `reason = "필요한 근거 N개 중 M개가 수집되었습니다."` + signals 선언 시
     `" 판별 신호 K개 중 J개가 확인되었습니다."` (`build_evaluation_reason`)
   - `supporting_evidence_refs`, `missing_evidence_checks`(소스 누락 + 신호 누락
     `missing_signal_checks` — `check_id="signal:<id>"`, `source="signals"`) 부속 채움.
   - 결과: 소스가 모두 있어도 판별 신호가 없는 후보는 1.0 이 될 수 없고, 미충족 신호
     토큰 때문에 선택되더라도 완결이 아닌 blocked 로 흐른다(오판 대신 근거 부족 처리).

`analyze_root_cause` 알고리즘 (RcaReportDetail 반환):

1. 평가가 비면 `root_cause="분석 가능한 원인 후보 없음"`, `selected_candidate_id="none"`,
   `reason="평가된 원인 후보가 없어 최종 원인을 선택할 수 없습니다."`, confidence 0.0.
2. `evaluations[0].candidate_id == "unknown"` → `unknown_root_cause(evaluations[0])`.
3. `supporting_evidence` 가 있는 평가가 하나도 없으면 → `insufficient_evidence_root_cause(evaluations)`.
4. 있으면 `min(supported, key=(-score, len(missing_evidence)))` 로 선택
   (= 점수 최대, 동률 시 누락 근거 최소) 후
   `root_cause=selected.candidate_id`, `confidence=selected.score`,
   `reason=build_root_cause_reason(selected)` 등으로 구성.

#### causes/catalog/*.yaml — 등록된 프로파일 (지식 베이스)

각 YAML 파일은 `rules` 목록을 가진다. 각 rule은 `id`, `symptoms`, `required_sources`, `candidates`를 선언하고, 후보는 `candidate_id`, `title`, `description`, `expected_evidence`, `checks`(+선택 `signals`)를 선언한다. 아래 내용이 현재 등록 데이터 전부다.

판별 신호(`signals`)는 완결 가능한 후보(= `expected_evidence` 가 실제 수집 소스
`kubernetes/metrics/logs/traces` 안에 있는 후보) 전부와, 이벤트/로그로 구별 가능한
후보에 선언되어 있다. `metadata` 를 기대하는 후보는 현행 근거 번들이 그 소스를
수집하지 않아 완결 점수에 도달할 수 없으므로 일부는 신호 없이 유지된다.

**crashloop.yaml** — `src/services/ai/agent/causes/catalog/crashloop.yaml`
- `crashloop_backoff`: symptoms `CrashLoopBackOff`, `pod_restart_loop`; required `kubernetes`, `metrics`, `logs`; 후보 `oom_killed`(signal: 양성 OOM 근거 — OOMKilled/137/OOMKilling/OOM 로그), `bad_image_rollout`(signal: import/binary 시작 오류 로그), `config_env_error`(signal: env/config 오류 로그 — expected 는 `kubernetes`+`logs`), `app_startup_failure`(signal: `exit_code=non_oom` fact 또는 FATAL/panic 류 로그), `dependency_connection_failure`(signal: connection refused/timeout 류 로그). exit 1 + env 누락 FATAL 로그는 `config_env_error`, 일반 FATAL 크래시는 `app_startup_failure`, 양성 OOM 근거는 `oom_killed` 로 판별된다.

**dependencies.yaml** — `src/services/ai/agent/causes/catalog/dependencies.yaml`
- `db_connection_failed`: symptoms `DB connection failed`; required `kubernetes`, `metrics`, `logs`, `traces`, `metadata`; 후보 `database_connectivity_failure`, `database_credential_or_config_error`

**deployment_gitops.yaml** — `src/services/ai/agent/causes/catalog/deployment_gitops.yaml`
- `deployment_rollout_failed`: symptoms `ProgressDeadlineExceeded`, `Rollout failed`; required `kubernetes`, `metrics`, `logs`, `metadata`; 후보 `deployment_progress_deadline_exceeded`, `replica_unavailable_after_rollout`
- `gitops_controller_sync_failed`: symptoms `GitOps Sync Failed`, `Sync Failed`; required `kubernetes`, `metrics`, `logs`, `metadata`; 후보 `gitops_sync_failed`, `manifest_validation_failed`

**image_pull.yaml** — `src/services/ai/agent/causes/catalog/image_pull.yaml`
- `image_pull_backoff`: symptoms `ImagePullBackOff`, `ErrImagePull`; required `kubernetes`; 후보 `wrong_image_tag`, `missing_image_pull_secret`, `registry_unavailable` 모두 expected evidence `kubernetes`와 이벤트 기반 `signals`로 판별한다.

**network.yaml** — `src/services/ai/agent/causes/catalog/network.yaml`
- `dns_lookup_failed`: symptoms `DNS lookup failed`; required `kubernetes`, `metrics`, `logs`, `metadata`; 후보 `service_dns_resolution_failure`
- `connection_timeout`: symptoms `Connection timeout`; required `kubernetes`, `metrics`, `logs`, `traces`, `metadata`; 후보 `network_path_timeout`
- `ingress_5xx`: symptoms `Ingress 502/503`, `Ingress 502`, `Ingress 503`; required `kubernetes`, `metrics`, `logs`; 후보 `upstream_unavailable`, `backend_readiness_failure`, `application_5xx_spike`. `application_5xx_spike` 신호는 5xx status/upstream_status, dependency timeout, `/api/orders/error`, `intentional_error_endpoint`, `intentional error endpoint called` 로그 패턴을 본다. 로그 timestamp가 evidence `cluster.collected_at`보다 5분 넘게 멀면 새 incident 신호로 쓰지 않는다.

**scheduling.yaml** — `src/services/ai/agent/causes/catalog/scheduling.yaml`
- `failed_scheduling`: symptoms `FailedScheduling`, `Pending`; required `kubernetes`; 후보 `insufficient_cpu`, `insufficient_memory`, `node_affinity_or_taint_mismatch`, `pvc_pending`

**security_policy.yaml** — `src/services/ai/agent/causes/catalog/security_policy.yaml`
- `secret_not_found`: symptoms `Secret not found`; required `kubernetes`, `logs`, `metadata`; 후보 `missing_secret_reference`, `secret_key_missing`

### playbooks/ — 룰 등록 네임스페이스

`src/services/ai/agent/playbooks/__init__.py :: RcaPlaybooks` /
`src/services/ai/agent/playbooks/__init__.py :: rca`

```python
class RcaPlaybooks:
    cause = staticmethod(causes_for)        # @rca.cause(...)   증상 → 원인 후보 프로파일
    recovery = staticmethod(recovery_for)   # @rca.recovery(...) 원인 → 복구 액션 룰
    fallback = staticmethod(fallback_recovery)  # @rca.fallback(...) 안전망 룰

rca = RcaPlaybooks()
```

`__all__`: `CauseCandidateSpec`, `RcaPlaybooks`, `RecoveryActionSpec`,
`causes_for`, `fallback_recovery`, `recovery_for`, `rca`.

규칙: **등록은 `@rca.<단어>` 또는 카탈로그 YAML, 조회는 `registered_*()`**. 새 장애 시나리오 추가 =
원인 룰은 `causes/catalog/` 아래 YAML 파일 1개, 복구 룰은 `recovery/` 아래 파일 1개(엔진 수정 없음).

#### playbooks/cause.py

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `EvidenceRequirementRule` (Protocol) | `src/services/ai/agent/playbooks/cause.py :: EvidenceRequirementRule` | `matches(incident) -> bool`, `required_sources(incident) -> list[str]` |
| `CauseRule` (Protocol) | `src/services/ai/agent/playbooks/cause.py :: CauseRule` | `matches(incident, evidence_bundle) -> bool`, `candidates(incident, evidence_bundle) -> list[CauseCandidate]` |
| `CauseCandidateSpec` | `src/services/ai/agent/playbooks/cause.py :: CauseCandidateSpec` | `candidate_id, title, description, expected_evidence: tuple[str, ...], checks: tuple[str, ...], signals: tuple[JsonObject, ...] = ()` + `to_candidate() -> CauseCandidate` (tuple→list 변환) |
| `SymptomEvidenceRequirementRule` | `src/services/ai/agent/playbooks/cause.py :: SymptomEvidenceRequirementRule` | `symptoms/sources` 튜플. `matches` = `incident.symptom in symptoms` |
| `SymptomCauseRule` | `src/services/ai/agent/playbooks/cause.py :: SymptomCauseRule` | `matches` = 증상 포함 여부, `candidates` = spec 전체를 `to_candidate()` |
| `CauseProfile` | `src/services/ai/agent/playbooks/cause.py :: CauseProfile` | `symptoms, required_sources, candidate_specs, rule_id` + `evidence_rule()`, `cause_rule()` 파생 |
| `CAUSE_PROFILES` | `src/services/ai/agent/playbooks/cause.py :: CAUSE_PROFILES` | 등록 저장소 `list[CauseProfile]` (모듈 전역) |
| `causes_for(*, symptoms, required_sources, candidates, rule_id=None)` | `src/services/ai/agent/playbooks/cause.py :: causes_for` | 클래스 데코레이터 — `rule_id`가 있으면 중복 검사 후 `CAUSE_PROFILES.append`, 마커 클래스 그대로 반환 |
| `registered_cause_profiles()` | `src/services/ai/agent/playbooks/cause.py :: registered_cause_profiles` | `services.ai.agent.causes.catalog` 를 지연 임포트(등록 유발) 후 튜플 반환 |
| `evidence_rules(profiles=None)` | `src/services/ai/agent/playbooks/cause.py :: evidence_rules` | 프로파일별 `evidence_rule()` 튜플 |
| `cause_rules(profiles=None)` | `src/services/ai/agent/playbooks/cause.py :: cause_rules` | 프로파일별 `cause_rule()` 튜플 |

#### playbooks/recovery.py

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `RecoveryContext` | `src/services/ai/agent/playbooks/recovery.py :: RecoveryContext` | `report: RcaCompletedBody, incident, detail, evidence_ref` + `root_cause` property(=detail.root_cause), `target` property(JsonObject: cluster_id/workspace_id/namespace/resource_kind/resource_name/symptom/severity) |
| `RecoveryRule` (Protocol) | `src/services/ai/agent/playbooks/recovery.py :: RecoveryRule` | `supports(context) -> bool`, `candidates(context) -> list[RecoveryActionCandidate]` |
| `RecoveryActionSpec` | `src/services/ai/agent/playbooks/recovery.py :: RecoveryActionSpec` | `action_type, title, description, route, risk_level, score, blast_radius, approval_required, prerequisites, validation_checks, rollback_plan, params` + `to_candidate(context, rank, defaults=None)` |
| `RootCauseRecoveryRule` | `src/services/ai/agent/playbooks/recovery.py :: RootCauseRecoveryRule` | `supports` = `context.root_cause in root_causes`; `candidates` = spec들을 rank=index+1 로 변환 |
| `AlwaysAvailableRecoveryRule` | `src/services/ai/agent/playbooks/recovery.py :: AlwaysAvailableRecoveryRule` | `supports` 항상 True (폴백) |
| `RECOVERY_RULES` | `src/services/ai/agent/playbooks/recovery.py :: RECOVERY_RULES` | 등록 저장소 `list[RecoveryRule]` |
| `recovery_for(*, root_causes, actions)` | `src/services/ai/agent/playbooks/recovery.py :: recovery_for` | `RootCauseRecoveryRule` 등록 데코레이터 |
| `fallback_recovery(*, actions)` | `src/services/ai/agent/playbooks/recovery.py :: fallback_recovery` | `AlwaysAvailableRecoveryRule` 등록 데코레이터 |
| `registered_recovery_rules()` | `src/services/ai/agent/playbooks/recovery.py :: registered_recovery_rules` | `services.ai.agent.recovery.catalog` 지연 임포트 후 튜플 |
| `build_recovery_context(report)` | `src/services/ai/agent/playbooks/recovery.py :: build_recovery_context` | `report.incident is None or report.rca_detail is None` 이면 None, 아니면 RecoveryContext |

`RecoveryActionSpec.to_candidate` 세부:

- `action_id = f"{context.report.evidence_ref}:{self.action_type}"`
- `params = {"root_cause": detail.root_cause, "confidence": detail.confidence, "symptom": incident.symptom, **self.params}`
- `HealingActionDraft(action_type, namespace=incident.namespace or defaults.unknown_namespace, resource_kind, resource_name, reason=detail.reason, risk_level=self.risk_level, dry_run=defaults.dry_run(True), source_evidence=detail.supporting_evidence, params)`
- `RecoveryActionCandidate(..., rank=인자, score=self.score, evidence_refs=[context.evidence_ref, *detail.supporting_evidence])`

#### playbooks/discovery.py

`src/services/ai/agent/playbooks/discovery.py :: load_rule_modules`

```python
def load_rule_modules(package_name: str, excluded: Iterable[str]) -> None
```
패키지 하위 모듈을 `pkgutil.iter_modules` 로 순회하며 임포트한다(등록 부수효과 유발).
하위 패키지(`ispkg`), `_` 시작, `excluded` 이름은 건너뜀. `__path__` 없으면 no-op.

### recovery/ — 복구 지식 베이스와 라우팅

`src/services/ai/agent/recovery/catalog.py` 는
`load_rule_modules(package_name="services.ai.agent.recovery", excluded=("catalog", "engine", "select", "dispatch"))`
를 실행(현재 유일한 룰 모듈은 `builtin.py`)하고 `registered_recovery_rules` 를 재노출한다.

#### recovery/builtin.py — 등록된 복구 룰

`routes = ActionRoutes()` 인스턴스를 사용. 값: auto=`"auto"`, safe_pr=`"draft_pr"`,
approval_required=`"approval_required"`.

**`src/services/ai/agent/recovery/builtin.py :: OomKilledRecoveryActions`** —
`@rca.recovery(root_causes=("oom_killed",))`:

| action_type | title | route | risk | score | approval_required | params |
|---|---|---|---|---|---|---|
| `rollout_restart` | 대상 워크로드 재시작 | `auto` | low | 0.58 | False | `{"command": "rollout_restart"}` |
| `scale` | 임시 replica 증설 PR | `draft_pr` | medium | 0.52 | True | `{"scale": "increase_replicas"}` |

**`src/services/ai/agent/recovery/builtin.py :: RolloutRecoveryActions`** —
`@rca.recovery(root_causes=("bad_image_rollout", "app_startup_failure"))`:

| action_type | title | route | risk | score | approval_required | params |
|---|---|---|---|---|---|---|
| `rollback` | 이전 이미지 rollback PR | `draft_pr` | medium | 0.74 | True | `{"patch": "previous_image"}` |

**`src/services/ai/agent/recovery/builtin.py :: ConfigRecoveryActions`** —
`@rca.recovery(root_causes=("config_env_error",))`:

| action_type | title | route | risk | score | approval_required | params |
|---|---|---|---|---|---|---|
| `config_fix` | 설정 보정 PR | `draft_pr` | medium | 0.68 | True | `{"patch": "config"}` |

**`src/services/ai/agent/recovery/builtin.py :: Application5xxRecoveryActions`** —
`@rca.recovery(root_causes=("application_5xx_spike",))`:

| action_type | title | route | risk | score | approval_required | params |
|---|---|---|---|---|---|---|
| `gitops_recovery_review` | GitOps 복구 검토 PR | `draft_pr` | medium | 0.56 | True | `{"patch": "recovery_review"}` |
| `deployment_scale` | 임시 replica 증설 | `auto` | medium | 0.6 | True | `{"command": "deployment_scale", "replicas": 3}` |
| `rollout_restart` | 대상 워크로드 재시작 | `auto` | low | 0.5 | False | `{"command": "rollout_restart"}` |

**`src/services/ai/agent/recovery/builtin.py :: NetworkRecoveryActions`** —
`@rca.recovery(root_causes=("backend_readiness_failure", "upstream_unavailable"))`:

| action_type | title | route | risk | score | approval_required | params |
|---|---|---|---|---|---|---|
| `rollout_restart` | 대상 워크로드 재시작 | `auto` | low | 0.66 | False | `{"command": "rollout_restart"}` |
| `deployment_scale` | 임시 replica 증설 | `auto` | medium | 0.54 | True | `{"command": "deployment_scale", "replicas": 3}` |

**`src/services/ai/agent/recovery/builtin.py :: FallbackRecoveryActions`** — `@rca.fallback`:

| action_type | title | route | risk | score | approval_required | params |
|---|---|---|---|---|---|---|
| `manual_analysis` | 수동 RCA 분석 요청 | `approval_required` | unknown | 0.0 | True | `{"manual": True}` |

(각 액션의 prerequisites/validation_checks/rollback_plan 문자열은 소스 원문이 스펙이다.)

#### recovery/engine.py — RecoveryPlanner

상수: `NO_RECOVERY_CANDIDATES = "복구 후보를 생성할 수 없습니다."`
(`src/services/ai/agent/recovery/engine.py :: NO_RECOVERY_CANDIDATES`)

`src/services/ai/agent/recovery/engine.py :: RecoveryPlanner`

- 필드: `defaults: RecoveryDefaults`, `messages: RcaMessages`, `routes: ActionRoutes`
- `plan_body(report: RcaCompletedBody) -> EventBody`
  1. `context = build_recovery_context(report)`; None →
     `RcaActionRequiredBody(reason=messages.missing_analysis_context, ...)`.
  2. `candidates = ranked_candidates(context, registered_recovery_rules())`
  3. `draft = first_draft_or_default(report, candidates, defaults)`
  4. 후보 없으면 `RcaActionRequiredBody(reason=NO_RECOVERY_CANDIDATES, ...)`.
  5. `recommended = candidates[0]` 로
     `RecoveryPlannedBody(draft, plan=RecoveryPlan(plan_id=f"recovery:{report.evidence_ref}", incident_id, evidence_ref, summary=context.detail.reason, target=context.target, recommended_action_id=recommended.action_id, execution_route=recommended.route, selection_required=recommended.approval_required, candidates), workspace_id)`.

`src/services/ai/agent/recovery/engine.py :: ranked_candidates`
— `supports` 인 룰의 후보를 모아 `sorted(key=(rank, -score))`.

`src/services/ai/agent/recovery/engine.py :: first_draft_or_default`
— 후보 있으면 `candidates[0].draft`; 없으면
`HealingActionDraft(action_type=defaults.action_type("rollout_restart"), namespace=incident.namespace or defaults.unknown_namespace, resource_kind/name(없으면 "unknown"), reason=detail.reason(없으면 NO_RECOVERY_CANDIDATES), risk_level=defaults.risk_level("low"), dry_run=True, source_evidence=detail.supporting_evidence(없으면 []), params={})`.

#### recovery/select.py — RecoverySelector

상수:

| 이름 | 값 |
|---|---|
| `NO_PLAN_REASON` | `"복구 계획이 없습니다."` |
| `SELECTION_REQUIRED_REASON` | `"사용자 복구 조치 선택이 필요합니다."` |
| `AUTO_SELECTED_BY` | `"agent-select"` |
| `APPROVAL_REQUIRED_COMMAND_REASON` | `"선택 후보가 승인 필요한 command action입니다."` |

(앵커: `src/services/ai/agent/recovery/select.py :: NO_PLAN_REASON` 등)

`src/services/ai/agent/recovery/select.py :: RecoverySelector`

- `select_body(evt: RecoveryPlannedBody) -> EventBody`
  1. `evt.plan is None` → `RcaActionRequiredBody(reason=NO_PLAN_REASON, evidence_ref=evt.draft.source_evidence[0] or "unknown", workspace_id)`.
  2. 후보를 `(rank, -score)` 로 정렬, `selected = 첫 후보 or None`.
  3. `selected is None` → `RecoverySelectionRequestedBody(plan, reason=SELECTION_REQUIRED_REASON, workspace_id)`.
  4. `selected.route == "auto" and not selected.approval_required and not requires_approval(selected)`
     → `RecoveryActionSelectedBody(plan, selected, selected_by=AUTO_SELECTED_BY, auto_selected=True, reason="승인 없이 실행 가능한 후보를 자동 선택했습니다.", workspace_id)`.
  5. 그 외 → `RecoverySelectionRequestedBody(plan, reason=selection_reason(selected), workspace_id)`.

`src/services/ai/agent/recovery/select.py :: requires_approval`
— `draft.params["command"] or draft.action_type` 을
[`command_action_for_recovery`](../domains/command.md) 로 카탈로그 액션에 매핑,
`command_action_spec(action).requires_approval` 이 True면 True.
(내장 카탈로그에서 `rollout_restart` 는 비파괴 조치라 `requires_approval=False` —
oom_killed 의 rollout_restart 후보가 자동 선택되어 auto 실행된다.
`apply_manifest`/`deployment_scale` 은 `requires_approval=True` 로 승인 체인을 유지한다.)

`src/services/ai/agent/recovery/select.py :: selection_reason`
— `requires_approval` 이면 `APPROVAL_REQUIRED_COMMAND_REASON`, 아니면 `SELECTION_REQUIRED_REASON`.

#### recovery/dispatch.py — RecoveryDispatcher

상수:

| 이름 | 값 |
|---|---|
| `UNKNOWN_ROUTE_REASON` | `"선택된 복구 후보의 route를 처리할 수 없습니다."` |
| `UNSUPPORTED_AUTO_ACTION_REASON` | `"자동 실행 대상 command action으로 변환할 수 없습니다."` |
| `MISSING_SAFE_PR_PATCH_REASON` | `"Safe PR에 적용할 구체적인 파일 패치가 없습니다."` |

`src/services/ai/agent/recovery/dispatch.py :: RecoveryDispatcher`

- 필드: `routes: ActionRoutes`
- `dispatch_body(evt: RecoveryActionSelectedBody) -> EventBody` — route별 분기:

| `selected.route` | 결과 |
|---|---|
| `auto` | `build_command_request_body(...)`; None이면 `RcaActionRequiredBody(reason=f"{UNSUPPORTED_AUTO_ACTION_REASON}: {action_type}")` |
| `draft_pr` (safe_pr) | `build_safe_pr_request_body(evt.plan, selected, evt.workspace_id)` |
| `approval_required` | `RcaActionRequiredBody(reason=f"승인 필요: {selected.title}")` |
| `forbidden` | `RcaActionRequiredBody(reason=f"자동 조치 차단: {selected.title}")` |
| 그 외 | `RcaActionRequiredBody(reason=f"{UNKNOWN_ROUTE_REASON}: {selected.route}")` |

`src/services/ai/agent/recovery/dispatch.py :: build_safe_pr_request_body`

- `patches = safe_pr_patches(selected)` 는 `draft.params["patches"]` 가 없거나 유효한 패치가 없으면
  `.gitops/recovery/{hash}-{action}.md` 검토 패치를 만든다. 이 fallback 문서는 대상, 원인, 위험도,
  영향 범위, 조치, 검증, 롤백 텍스트만 담고 실제 manifest 변경을 가장하지 않는다.
- PR 본문(요약, 선택 조치, 대상 `namespace/kind/name`, 위험도, 영향 범위,
  이유, 검증 체크리스트, 롤백 계획을 개행으로 조합)을 만들고
  `SafePrRequestedBody(title=f"{selected.title}: {draft.resource_name}", body, provider=GitHub.PROVIDER("github"), patches, workspace_id)` 반환. repository/binding/application/workflow/environment/manifest_path 값은 `draft.params`를 먼저 보고, 없으면 `plan.target`, 그래도 없으면 기본값을 쓴다.

`src/services/ai/agent/recovery/dispatch.py :: build_command_request_body`

- `action = command_action_for(selected)`; None이면 None 반환(→ 호출부가 action_required 처리).
- `workspace_id = str(plan.target["workspace_id"] or draft.params["workspace_id"])`,
  `namespace = draft.namespace or Sandbox.NAMESPACE("sandbox")`,
  `cluster_id = str(plan.target["cluster_id"] or Target.DEFAULT_CLUSTER_ID)`.
- `rollout_restart` 와 `k8s.apps.v1.deployments.scale` 은 `draft.params` 의
  `deployment`/`deployment_name`/`workload_name`/`target_deployment` 을 우선 사용하고, 없으면
  Pod(`name-hash-suffix`) 또는 ReplicaSet(`name-hash`) 이름에서 Deployment 이름을 추정한다.
- `CommandRequestedBody(cluster_id, action, namespace, reason=selected.description, diff=Diff(resource="deployment/{target}" for restart/scale else f"{kind}/{name}", namespace, desired_image="", actual_image="", risk=Sandbox.RISK_TAG(RiskLevel.SANDBOX_ONLY), workspace_id, status="recovery_action", has_changes=True, basis={"source": "rca_recovery", "plan_id", "action_id", "root_cause"}), workspace_id, application_id/workflow_run_id/binding_id=draft.params에서(없으면 ""), environment=draft.params.get("environment") or "sandbox", requested_by=selected_by, approval_ref/policy_decision_ref=as_optional_str(draft.params...), actor={"plan_id", "action_id", "auto_selected"})`.

| 함수 | 앵커 | 동작 |
|---|---|---|
| `command_action_for(selected)` | `src/services/ai/agent/recovery/dispatch.py :: command_action_for` | `params["command"] or action_type` → `command_action_for_recovery` |
| `safe_pr_patches(selected)` | `src/services/ai/agent/recovery/dispatch.py :: safe_pr_patches` | `draft.params["patches"]` 가 list이면 유효한 `SafePrFilePatch`, 없거나 비면 `fallback_recovery_patch` 1건을 반환 |
| `fallback_recovery_patch(selected)` | `src/services/ai/agent/recovery/dispatch.py :: fallback_recovery_patch` | `.gitops/recovery/{sha16}-{action}.md` 경로의 검토용 Markdown 패치 생성 |
| `target_value(plan, params, key, default)` | `src/services/ai/agent/recovery/dispatch.py :: target_value` | Safe PR metadata 값을 `params` → `plan.target` → 기본값 순서로 선택 |
| `command_target_name(kind, name, params)` | `src/services/ai/agent/recovery/dispatch.py :: command_target_name` | 명시 deployment 파라미터 우선, 없으면 Deployment/ReplicaSet/Pod 이름에서 조치 대상 Deployment 이름 추정 |
| `as_optional_str(value)` | `src/services/ai/agent/recovery/dispatch.py :: as_optional_str` | `None`/`""` → None, 그 외 `str(value)` |

## 동작 (Behavior) — 전체 파이프라인 상태 흐름

```
cluster.evidence.received
  → [evidence-worker: EvidencePipeline] evidence.built
  → [incident-worker: IncidentPipeline] incident.detected + (evidence.bundle.built | rca.action_required)
  → [plan-worker: CausePlanningPipeline] rca.candidates.planned
      (+ rule missing 시: rca.rule_missing, rca.backlog.created, rca.ai_fallback.requested)
  → [analyze-worker: CauseEvaluationPipeline] rca.candidates.evaluated | pipeline.contract_failed
  → [rca-worker: RcaCompletionPipeline] rca.completed | rca.analysis_blocked | rca.action_required
  → [recovery-worker: RecoveryPlanningPipeline] recovery.planned | rca.action_required
  → [select-worker: RecoverySelector] recovery.action_selected | recovery.selection_requested | rca.action_required
  → [dispatch-worker: RecoveryDispatcher] command.requested | safe_pr.requested | rca.action_required
```

부속 흐름: `rca.analysis_blocked`/`rca.action_required`/`rca.ai_fallback.requested`/
`pipeline.contract_failed` → [rca-feedback-worker] `rca.followup.required`;
`recovery.selection_requested`/`rollout.diagnosed` → [approval-worker] `approval.recommended`;
`command.completed` → [rollout-worker] `rollout.diagnosed`;
`safe_pr.patch_prepared` → [diff-worker] `diff.explained` + (`safe_pr.ready_for_creation` | `safe_pr.failed`).

## 불변식·오류 (Invariants & Errors)

1. 이 패키지의 모든 공개 타입은 불변(`frozen=True`) — 파이프라인 단계 간 공유 상태 없음.
2. 컨텍스트(incident/evidence/evidence_bundle/rca_detail) 누락은 예외가 아니라
   **대체 이벤트 body**(`RcaActionRequiredBody` 또는 `PipelineContractFailedBody`)로 표현된다.
   패키지 내부에서 예외를 던지는 공개 경로는 없다.
3. 룰 등록은 import 부수효과(`catalog.py` → `load_rule_modules`)로만 일어난다.
   조회는 반드시 `registered_cause_profiles()` / `registered_recovery_rules()` 를 통한다.
4. `plan_bodies` 출력 순서 불변식: rule missing 시
   `RcaRuleMissingBody → RcaBacklogItemCreatedBody → (RcaAiFallbackRequestedBody) → RcaCandidatesPlannedBody`.
5. 복구 후보 정렬 키는 항상 `(rank asc, score desc)` — planner와 selector가 동일 기준 사용.
6. `services → domains → packages` 단방향 의존을 지킨다. 이 패키지는 domains/packages만 import한다.

## 설정 (Settings)

이 패키지 자체는 환경변수를 읽지 않는다. 모든 튜닝값은 `defaults.py` 의 dataclass 기본값이며,
워커가 파사드를 생성할 때 인자로 교체 가능하다(현행 워커는 전부 기본값 사용).
