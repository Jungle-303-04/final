---
source_commit: 664925a6
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
| `causes/` | 증상→원인 후보 지식 베이스(플레이북 프로파일) + 룰 엔진 |
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
  - `severity=incident.severity`, `affected=affected_resources(incident)`,
    `evidence`, `incident` 를 body에 채워 반환.
- `has_signal(evidence) -> bool` = `bool(evidence.logs or evidence.kubernetes.get("pods") or evidence.metrics)`
- `classify(evidence, incident_id) -> IncidentRecord`
  - `resource_kind/name/namespace` 는 `extract_resource(evidence.kubernetes)` 로 추출:
    `kubernetes["resource"]` dict의 `kind`(기본 `"Unknown"`), `name`(기본 `"unknown"`), `namespace`(기본 None).
  - `symptom = str(kubernetes.get("symptom", "unknown"))`,
    `severity = str(kubernetes.get("severity", "medium"))`,
    `first_seen_at = kubernetes.get("first_seen_at")`,
    `summary = f"{resource_kind} {resource_name} has {symptom}"`.
- `extract_resource(kubernetes: JsonObject) -> tuple[str, str, str | None]`
- `affected_resources(incident) -> list[JsonObject]` — 단일 원소 리스트,
  키: `cluster_id, workspace_id, namespace, resource_kind, resource_name, symptom, severity`.

`src/services/ai/agent/pipeline/incident.py :: EvidenceBundler`

- `messages: RcaMessages`
- `build_body(evt: IncidentDetectedBody) -> EventBody` 분기:
  1. `evt.evidence is None or evt.incident is None` →
     `RcaActionRequiredBody(reason=messages.missing_incident_context, evidence_ref=evidence.object_ref if evidence else "unknown", workspace_id=evt.workspace_id)`
  2. `not evt.detected` →
     `RcaActionRequiredBody(reason=messages.no_incident_action_required, evidence_ref=evidence.object_ref, workspace_id=evidence.workspace_id)`
  3. 그 외 → `EvidenceBundleBuiltBody(evidence, incident, evidence_bundle=build_incident_evidence_bundle(evidence, incident))`

#### pipeline/evidence_bundle.py — 근거 번들 빌더 (모듈 함수)

| 함수 | 앵커 | 동작 |
|---|---|---|
| `extract_resource(kubernetes: dict)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: extract_resource` | `(kind, name, namespace)` 추출(기본값 `"Unknown"/"unknown"/None`) |
| `extract_symptom(kubernetes: dict)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: extract_symptom` | `str(kubernetes.get("symptom", "unknown"))` |
| `build_incident_evidence_bundle(evt, incident)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: build_incident_evidence_bundle` | 아래 참조 |
| `evidence_ref_for(evt, source, name)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: evidence_ref_for` | `Evidence` 면 `object_ref`, 아니면 `evidence_key or f"cluster:{workspace_id}:{cluster_id}"` 를 base로 `f"{base}#{source}:{name}"` |
| `source_check_id(source, name)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: source_check_id` | `f"evidence:{source}:{name}"` |
| `source_query(source, name)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: source_query` | `f"{source}.{name}"` |
| `evidence_item(evt, *, source, name, value, summary)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: evidence_item` | 위 세 헬퍼로 `EvidenceItem` 구성 |
| `missing_source_checks(missing_evidence)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: missing_source_checks` | source마다 `MissingEvidenceCheck(check_id=f"evidence:{source}:required", status="missing", reason=f"{source} evidence query/check must complete before RCA can be finalized.")` |
| `collect_evidence_items(evt)` | `src/services/ai/agent/pipeline/evidence_bundle.py :: collect_evidence_items` | 아래 참조 |

- 타입 별칭: `EvidenceSource = ClusterEvidenceReceivedBody | Evidence`
  (`src/services/ai/agent/pipeline/evidence_bundle.py :: EvidenceSource`)
- `collect_evidence_items` 는 공통 요약문
  `f"{namespace or 'unknown'} namespace의 {resource_kind} {resource_name}에서 {symptom} 증상이 보고되었습니다."`
  을 만들고, 존재하는 소스만 `EvidenceItem` 으로 수집한다:

| 조건 | source | name | value | summary 접미사 |
|---|---|---|---|---|
| `evt.kubernetes` truthy | `kubernetes` | `cluster_resource_state` | `evt.kubernetes` | `" Kubernetes 상태 근거입니다."` |
| `evt.metrics` truthy | `metrics` | `telemetry_metrics` | `evt.metrics` | `" Metric snapshot 근거입니다."` |
| `evt.logs` truthy | `logs` | `related_logs` | `{"entries": evt.logs}` | `" Log tail 근거입니다."` |
| `evt.traces` truthy | `traces` | `related_traces` | `evt.traces` | `" Trace 근거입니다."` |

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

- `RcaAiFallbackRequestedBody(reason=NO_MATCHING_RULE_MESSAGE, evidence_ref=rule_missing.evidence_ref, incident=evt.incident, evidence_bundle=evt.evidence_bundle, missing_evidence=rule_missing.missing_evidence, workspace_id=rule_missing.workspace_id)`

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

`src/services/ai/agent/causes/catalog.py` 는 부수효과 모듈이다:
`load_rule_modules(package_name="services.ai.agent.causes", excluded=("catalog", "engine"))`
로 프로파일 모듈들을 임포트해 `@rca.cause` 등록을 유발하고,
`cause_rules`/`evidence_rules` 를 재노출한다(`__all__ = ["cause_rules", "evidence_rules"]`).

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
| `merge_candidates(candidates)` | `src/services/ai/agent/causes/engine.py :: merge_candidates` | `candidate_id` 로 병합: 첫 후보의 title/description 유지, `expected_evidence`·`checks` 는 합집합(순서 보존) |
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
2. 아니면 후보마다:
   - `expected = set(candidate.expected_evidence)`,
     `actual_sources = {item.source for item in evidence_bundle.items}`
   - `supporting = sorted(expected & actual)`, `missing = sorted(expected − actual)`
   - `score = len(supporting) / len(expected)` (expected 비면 0.0)
   - `reason = f"필요한 근거 {len(expected)}개 중 {len(supporting)}개가 수집되었습니다."`
   - `supporting_evidence_refs`, `missing_evidence_checks` 부속 채움.

`analyze_root_cause` 알고리즘 (RcaReportDetail 반환):

1. 평가가 비면 `root_cause="분석 가능한 원인 후보 없음"`, `selected_candidate_id="none"`,
   `reason="평가된 원인 후보가 없어 최종 원인을 선택할 수 없습니다."`, confidence 0.0.
2. `evaluations[0].candidate_id == "unknown"` → `unknown_root_cause(evaluations[0])`.
3. `supporting_evidence` 가 있는 평가가 하나도 없으면 → `insufficient_evidence_root_cause(evaluations)`.
4. 있으면 `min(supported, key=(-score, len(missing_evidence)))` 로 선택
   (= 점수 최대, 동률 시 누락 근거 최소) 후
   `root_cause=selected.candidate_id`, `confidence=selected.score`,
   `reason=build_root_cause_reason(selected)` 등으로 구성.

#### causes/* — 등록된 프로파일 (지식 베이스)

각 모듈은 `@rca.cause(...)` 를 붙인 마커 클래스(본문 `pass`)로 프로파일을 등록한다.
아래 표의 내용이 등록 데이터 전부다(후보의 title/description/checks 는 소스 원문 유지).

**crashloop.py** — `src/services/ai/agent/causes/crashloop.py :: CrashLoopBackOffProfile`
- symptoms: `("CrashLoopBackOff", "pod_restart_loop")`
- required_sources: `("kubernetes", "metrics", "logs")`
- 후보: `oom_killed` (expected: kubernetes, metrics, logs) ·
  `bad_image_rollout` (kubernetes, logs, metadata) ·
  `config_env_error` (kubernetes, logs, metadata) ·
  `app_startup_failure` (kubernetes, logs) ·
  `dependency_connection_failure` (kubernetes, logs, traces)

**dependencies.py** — `src/services/ai/agent/causes/dependencies.py :: DbConnectionFailedProfile`
- symptoms: `("DB connection failed",)`
- required_sources: `("kubernetes", "metrics", "logs", "traces", "metadata")`
- 후보: `database_connectivity_failure` (kubernetes, metrics, logs, traces, metadata) ·
  `database_credential_or_config_error` (kubernetes, logs, metadata)

**deployment_gitops.py** —
`src/services/ai/agent/causes/deployment_gitops.py :: DeploymentRolloutProfile`
- symptoms: `("ProgressDeadlineExceeded", "Rollout failed")`
- required_sources: `("kubernetes", "metrics", "logs", "metadata")`
- 후보: `deployment_progress_deadline_exceeded` (kubernetes, metrics, logs, metadata) ·
  `replica_unavailable_after_rollout` (kubernetes, metrics, logs)

`src/services/ai/agent/causes/deployment_gitops.py :: ArgoCdSyncFailedProfile`
- symptoms: `("ArgoCD Sync Failed", "Sync Failed")`
- required_sources: `("kubernetes", "metrics", "logs", "metadata")`
- 후보: `gitops_sync_failed` (kubernetes, metrics, logs, metadata) ·
  `manifest_validation_failed` (kubernetes, logs, metadata)

**image_pull.py** — `src/services/ai/agent/causes/image_pull.py :: ImagePullProfile`
- symptoms: `("ImagePullBackOff", "ErrImagePull")`
- required_sources: `("kubernetes", "metrics", "logs", "metadata")`
- 후보: `wrong_image_tag` (kubernetes, logs, metadata) ·
  `missing_image_pull_secret` (kubernetes, logs, metadata) ·
  `registry_unavailable` (kubernetes, metrics, logs)

**network.py** — `src/services/ai/agent/causes/network.py :: DnsLookupFailedProfile`
- symptoms: `("DNS lookup failed",)` / required: `("kubernetes", "metrics", "logs", "metadata")`
- 후보: `service_dns_resolution_failure` (kubernetes, metrics, logs, metadata)

`src/services/ai/agent/causes/network.py :: ConnectionTimeoutProfile`
- symptoms: `("Connection timeout",)` / required: `("kubernetes", "metrics", "logs", "traces", "metadata")`
- 후보: `network_path_timeout` (kubernetes, metrics, logs, traces, metadata)

`src/services/ai/agent/causes/network.py :: IngressFailureProfile`
- symptoms: `("Ingress 502/503", "Ingress 502", "Ingress 503")` / required: `("kubernetes", "metrics", "logs", "metadata")`
- 후보: `upstream_unavailable` (kubernetes, metrics, logs, metadata) ·
  `backend_readiness_failure` (kubernetes, metrics, logs)

**scheduling.py** — `src/services/ai/agent/causes/scheduling.py :: SchedulingProfile`
- symptoms: `("FailedScheduling", "Pending")` / required: `("kubernetes", "metrics", "metadata")`
- 후보: `insufficient_cpu` (kubernetes, metrics) · `insufficient_memory` (kubernetes, metrics) ·
  `node_affinity_or_taint_mismatch` (kubernetes, metadata) · `pvc_pending` (kubernetes, metadata)

**security_policy.py** — `src/services/ai/agent/causes/security_policy.py :: SecretNotFoundProfile`
- symptoms: `("Secret not found",)` / required: `("kubernetes", "logs", "metadata")`
- 후보: `missing_secret_reference` (kubernetes, logs, metadata) ·
  `secret_key_missing` (kubernetes, logs, metadata)

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

규칙: **등록은 `@rca.<단어>`, 조회는 `registered_*()`**. 새 장애 시나리오 추가 =
`causes/` 또는 `recovery/` 아래 파일 1개(엔진 수정 없음).

#### playbooks/cause.py

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `EvidenceRequirementRule` (Protocol) | `src/services/ai/agent/playbooks/cause.py :: EvidenceRequirementRule` | `matches(incident) -> bool`, `required_sources(incident) -> list[str]` |
| `CauseRule` (Protocol) | `src/services/ai/agent/playbooks/cause.py :: CauseRule` | `matches(incident, evidence_bundle) -> bool`, `candidates(incident, evidence_bundle) -> list[CauseCandidate]` |
| `CauseCandidateSpec` | `src/services/ai/agent/playbooks/cause.py :: CauseCandidateSpec` | `candidate_id, title, description, expected_evidence: tuple[str, ...], checks: tuple[str, ...]` + `to_candidate() -> CauseCandidate` (tuple→list 변환) |
| `SymptomEvidenceRequirementRule` | `src/services/ai/agent/playbooks/cause.py :: SymptomEvidenceRequirementRule` | `symptoms/sources` 튜플. `matches` = `incident.symptom in symptoms` |
| `SymptomCauseRule` | `src/services/ai/agent/playbooks/cause.py :: SymptomCauseRule` | `matches` = 증상 포함 여부, `candidates` = spec 전체를 `to_candidate()` |
| `CauseProfile` | `src/services/ai/agent/playbooks/cause.py :: CauseProfile` | `symptoms, required_sources, candidate_specs` + `evidence_rule()`, `cause_rule()` 파생 |
| `CAUSE_PROFILES` | `src/services/ai/agent/playbooks/cause.py :: CAUSE_PROFILES` | 등록 저장소 `list[CauseProfile]` (모듈 전역) |
| `causes_for(*, symptoms, required_sources, candidates)` | `src/services/ai/agent/playbooks/cause.py :: causes_for` | 클래스 데코레이터 — `CAUSE_PROFILES.append` 후 마커 클래스 그대로 반환 |
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

- `patches = safe_pr_patches(selected)` 가 비면
  `RcaActionRequiredBody(reason=f"{MISSING_SAFE_PR_PATCH_REASON}: {title}", reason_code="safe_pr_patch_missing", missing_evidence=["manifest_patch"], next_actions=[{"action_type": "collect_manifest_context", "reason": "Recovery Safe PR requires concrete file patches before PR creation.", "target": draft.params}], diagnostics={"plan_id", "action_id", "route"})`.
- 패치가 있으면 PR 본문(요약, 선택 조치, 대상 `namespace/kind/name`, 위험도, 영향 범위,
  이유, 검증 체크리스트, 롤백 계획을 개행으로 조합)을 만들고
  `SafePrRequestedBody(title=f"{selected.title}: {draft.resource_name}", body, provider=GitHub.PROVIDER("github"), patches, workspace_id)` 반환.

`src/services/ai/agent/recovery/dispatch.py :: build_command_request_body`

- `action = command_action_for(selected)`; None이면 None 반환(→ 호출부가 action_required 처리).
- `workspace_id = str(plan.target["workspace_id"] or draft.params["workspace_id"])`,
  `namespace = draft.namespace or Sandbox.NAMESPACE("sandbox")`,
  `cluster_id = str(plan.target["cluster_id"] or Target.DEFAULT_CLUSTER_ID)`.
- `CommandRequestedBody(cluster_id, action, namespace, reason=selected.description, diff=Diff(resource=f"{kind}/{name}", namespace, desired_image="", actual_image="", risk=Sandbox.RISK_TAG(RiskLevel.SANDBOX_ONLY), workspace_id, status="recovery_action", has_changes=True, basis={"source": "rca_recovery", "plan_id", "action_id", "root_cause"}), workspace_id, application_id/workflow_run_id/binding_id=draft.params에서(없으면 ""), environment=draft.params.get("environment") or "sandbox", requested_by=selected_by, approval_ref/policy_decision_ref=as_optional_str(draft.params...), actor={"plan_id", "action_id", "auto_selected"})`.

| 함수 | 앵커 | 동작 |
|---|---|---|
| `command_action_for(selected)` | `src/services/ai/agent/recovery/dispatch.py :: command_action_for` | `params["command"] or action_type` → `command_action_for_recovery` |
| `safe_pr_patches(selected)` | `src/services/ai/agent/recovery/dispatch.py :: safe_pr_patches` | `draft.params["patches"]` 가 list일 때만, `path`·`content` 가 str인 dict만 `SafePrFilePatch(path, content, description=item["description"] or selected.title)` 로 변환 |
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
