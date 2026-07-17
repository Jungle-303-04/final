---
source_commit: 243e7fc0
status: synced
---

# dashboard — 프론트가 읽는 RCA timeline projection/read model

> 소스: `src/domains/dashboard/` · 테스트: `tests/test_dashboard_projection.py`, `tests/test_dashboard_router.py`, `tests/test_database_unit.py`, `tests/test_rca_timeline_janitor.py`

## 책임 (Responsibility)

- 이미 흐른 RCA/command/safe_pr 이벤트를 화면에서 바로 읽기 좋은 `rca_timeline` row로 투영하는 read model 테이블·리포지토리·투영 함수를 소유한다.
- 권한이 적용된 RCA timeline 조회 HTTP API 2종을 제공한다.
- 콘솔 루트 화면용 fleet 롤업 API 2종(`/fleet/summary`, `/clusters/{cluster_id}/summary`)을 제공한다 — `src/domains/dashboard/fleet_router.py`.
- 이 도메인은 **이벤트를 새로 발행하지 않는다**. 투영 트리거(이벤트 소비 루프)는 projection 워커가 담당한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `EventEnvelope`, `JsonObject`, `EventSubject`, gateway routes/응답 모델, `AccessResourceType`, `Permission`, `DEFAULT_WORKSPACE_ID` |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `get_db` |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session`, `require_cluster_access`, `RESOURCE_ACCESS_DENIED_MESSAGE` |
| 구독(간접) | RCA/command/safe_pr 계열 이벤트 | [./rca.md](./rca.md), [./command.md](./command.md), [./scm.md](./scm.md) | `timeline_update_from_event`의 입력 |

## 공개 인터페이스 (Public API)

### 리포지토리 — `src/domains/dashboard/repository.py`

| 심볼 | 정의 | 앵커 |
|---|---|---|
| `Path` | `tuple[str, ...]` 타입 별칭 | `src/domains/dashboard/repository.py :: Path` |
| `RCA_TIMELINE_STATUS_BY_SUBJECT` | `dict[str, str]` — subject → status 매핑(아래 표) | `src/domains/dashboard/repository.py :: RCA_TIMELINE_STATUS_BY_SUBJECT` |
| `DashboardRepository` | `class DashboardRepository(DatabaseConnection)` — RCA timeline + metric query/widget 저장소 | `src/domains/dashboard/repository.py :: DashboardRepository` |
| `list_metric_query_presets` / `upsert_metric_query_preset` / `delete_metric_query_preset` | cluster 단위 저장형 PromQL 정의 CRUD. 결과 payload는 저장하지 않는다 | `src/domains/dashboard/repository.py :: DashboardRepository` |
| `list_metric_widgets` / `upsert_metric_widget` / `delete_metric_widget` | 저장형 metric query를 참조하는 widget 정의 CRUD. 위치·표시 설정만 저장한다 | `src/domains/dashboard/repository.py :: DashboardRepository` |
| `timeline_update_from_event` | `def timeline_update_from_event(evt: EventEnvelope) -> JsonObject \| None` | `src/domains/dashboard/repository.py :: timeline_update_from_event` |
| `serialize_timeline_row` | `def serialize_timeline_row(row: Any) -> JsonObject` — created_at/updated_at ISO화(`isoformat` 없으면 None), supporting/missing_evidence `or []` | `src/domains/dashboard/repository.py :: serialize_timeline_row` |

#### subject → status 매핑 (`RCA_TIMELINE_STATUS_BY_SUBJECT`)

| EventSubject | status |
|---|---|
| `CLUSTER_EVIDENCE_RECEIVED` | `evidence_received` |
| `EVIDENCE_BUILT` | `evidence_built` |
| `INCIDENT_DETECTED` | `incident_detected` |
| `EVIDENCE_BUNDLE_BUILT` | `evidence_bundled` |
| `RCA_RULE_MISSING` | `rule_missing` |
| `RCA_BACKLOG_ITEM_CREATED` | `backlog_created` |
| `RCA_AI_FALLBACK_REQUESTED` | `ai_fallback_requested` |
| `RCA_CANDIDATES_PLANNED` | `rca_planned` |
| `RCA_CANDIDATES_EVALUATED` | `rca_evaluated` |
| `RCA_COMPLETED` | `rca_completed` |
| `RCA_FOLLOWUP_REQUIRED` | `followup_required` |
| `RCA_ACTION_REQUIRED` | `action_required` |
| `RECOVERY_PLANNED` | `recovery_planned` |
| `RECOVERY_SELECTION_REQUESTED` | `selection_required` |
| `RECOVERY_ACTION_SELECTED` | `recovery_selected` |
| `APPROVAL_RECOMMENDED` | `approval_recommended` |
| `COMMAND_REQUESTED` | `command_requested` |
| `COMMAND_DISPATCHED` | `command_dispatched` |
| `COMMAND_QUEUED_FOR_AGENT` | `command_queued` |
| `COMMAND_COMPLETED` | `command_completed` |
| `COMMAND_REJECTED` | `command_rejected` |
| `SAFE_PR_REQUESTED` | `pr_requested` |
| `SAFE_PR_PATCH_PREPARED` | `pr_patch_prepared` |
| `DIFF_EXPLAINED` | `pr_diff_explained` |
| `SAFE_PR_READY_FOR_CREATION` | `pr_ready_for_creation` |
| `SAFE_PR_CREATED` | `pr_created` |
| `SAFE_PR_FAILED` | `pr_failed` |

#### DashboardRepository 메서드

| 메서드 | 시그니처 | 쿼리 의미 |
|---|---|---|
| `upsert_rca_timeline` | `(self, row: JsonObject) -> None` | `INSERT ... ON CONFLICT (workspace_id, correlation_id) DO UPDATE`. 갱신 규칙: ① cluster/incident 차원과 evidence/RCA/action 필드는 `coalesce(EXCLUDED.<col>, 기존값)`으로 보존한다. 차원을 싣지 않는 approval/dispatch 후속 이벤트의 `incident_logical_key`는 NULL이므로 앞서 투영한 정규화 key를 correlation ID로 덮어쓰지 않는다. ② `newer_or_equal_event = EXCLUDED.last_event_at >= 기존 last_event_at`일 때만 current_subject/status/error_reason/last_event_id/last_event_at/payload 교체(CASE), 아니면 기존값 유지. ③ `updated_at=now()` 항상 갱신 |
| `list_rca_timeline` | `(self, workspace_id: str, allowed_cluster_ids: set[str] \| None, limit: int = 50) -> list[JsonObject]` | `allowed_cluster_ids == set()`이면 빈 리스트 즉시 반환(권한 0). `WHERE workspace_id=? [AND cluster_id IN allowed] ORDER BY updated_at DESC LIMIT ?` 후 `serialize_timeline_row`. `None`은 필터 없음(전체 허용) |
| `get_rca_timeline_item` | `(self, workspace_id: str, incident_id: str, allowed_cluster_ids: set[str] \| None) -> JsonObject \| None` | `WHERE workspace_id=? AND incident_id=? [AND cluster_id IN allowed] ORDER BY updated_at DESC LIMIT 1` |
| `count_open_rca_incidents` | `(self, workspace_id: str, allowed_cluster_ids: set[str] \| None = None) -> dict[str, int]` | fleet 롤업용 클러스터별 열린 logical incident 수. `status IN OPEN_INCIDENT_STATUSES` 양수 allowlist로 실제 탐지 이후 상태만 집계해 `evidence_received/evidence_built`가 인시던트로 승격되지 않게 한다. 정규화 projection(namespace/kind/name/symptom)이 있으면 구버전 correlation 기반 key보다 우선해 SQL `COUNT(DISTINCT ...) GROUP BY cluster_id`로 집계한다. 큰 `payload` JSON을 읽거나 Python으로 전체 row를 풀스캔하지 않는다 |
| `list_open_rca_incidents` | `(self, workspace_id: str, cluster_id: str, *, limit: int = 20) -> list[JsonObject]` | 드릴다운용 — 같은 open 판정으로 `updated_at DESC LIMIT`(1..100 clamp) 후 `open_incident_summary` 적용 |
| `expire_stale_open_rca_incidents` | `(self, max_age_days: int = 3, limit: int = 500) -> list[JsonObject]` | 오래 열린 incident row를 CTE `stale_open_incidents`로 `FOR UPDATE SKIP LOCKED` 선점 후 `status="incident_expired"`로 원자 UPDATE. `error_reason`이 비어 있으면 retention window 초과 메시지를 채운다. [rca-timeline-janitor](../services/projection-rca-timeline-janitor.md)가 호출한다 |
| `resolve_recovered_ephemeral_incidents` | `(self, grace_minutes: int = 5, limit: int = 500) -> list[JsonObject]` | grace가 지난 open Pod/ReplicaSet incident 중 최신 inventory에 비정상 리소스가 없는 row를 CTE `recovered_ephemeral_incidents`로 선점해 `incident_resolved`로 원자 UPDATE. 사라졌거나 healthy인 ephemeral 리소스만 대상으로 한다 |
| `delete_stale_pre_incident_timeline` | `(self, retention_hours: int = 24, limit: int = 1000) -> int` | 원본 evidence/event는 보존하고 `evidence_received/evidence_built` timeline projection만 보존시간 이후 CTE + `FOR UPDATE SKIP LOCKED` 배치로 삭제한다 |

열린 인시던트는 `OPEN_INCIDENT_STATUSES` 양수 allowlist로만 판정한다. `PRE_INCIDENT_STATUSES=("evidence_received", "evidence_built")`는 절대 open count에 들어가지 않으며 24시간 뒤 projection janitor가 삭제한다. `CLOSED_INCIDENT_STATUSES`는 `incident_resolved`를 포함해 종결 이력을 구분한다. `timeline_update_from_event`는 `incident_namespace`, `incident_resource_kind`, `incident_resource_name`, `incident_symptom`, `incident_logical_key`를 함께 투영하며, 집계는 정규화 필드가 존재하면 구버전 correlation key를 무시하고 동일 리소스·증상을 하나로 묶는다. 원본 payload/evidence/audit는 projection 삭제와 무관하게 보존된다.

#### `timeline_update_from_event(evt)` 투영 규칙

1. `RCA_TIMELINE_STATUS_BY_SUBJECT.get(str(evt.subject))` — 매핑 없는 subject는 `None` 반환(투영 안 함).
2. row 구성: `workspace_id`(payload 다중 경로 탐색, 실패 시 `DEFAULT_WORKSPACE_ID`), `correlation_id = evt.correlation_id or evt.event_id`, `cluster_id`/`incident_id`/`incident_namespace`/`incident_resource_kind`/`incident_resource_name`/`incident_symptom`/`incident_logical_key`/`evidence_ref`/`root_cause`/`confidence`(float 변환 실패 시 None)/`supporting_evidence`/`missing_evidence`/`action_route`/`command_id`/`pr_url`/`error_reason`는 payload의 정해진 경로 목록을 순서대로 탐색(내부 헬퍼 `_incident_projection`/`_first_string`/`_first_value`/`_first_list`/`_evaluation_list`/`_evidence_reference_list`/`_evaluation_reference_list`/`_format_evidence_reference`/`_value_at`/`_dedupe` — 소스 참조), `current_subject = str(evt.subject)`, `status` = 매핑값, `last_event_id = evt.event_id`, `last_event_at = str(evt.created_at)`, `payload` = evt.payload(dict 아니면 `{}`).
3. `action_route`: payload `plan.execution_route` → `selected.route` 우선; 없으면 subject가 `command.`로 시작 → `"command"`, `safe_pr.`로 시작하거나 `DIFF_EXPLAINED` → `"safe_pr"`, 그 외 None.
4. evidence 참조 형식화: dict에 `evidence_ref` 있으면 그 값, 아니면 `f"{source}:{name}"`, 아니면 `check_id`, 없으면 제외. 목록은 중복 제거(순서 보존).

### 라우터 — `src/domains/dashboard/router.py`

상수: `DEFAULT_TIMELINE_LIMIT = 50`, `MAX_TIMELINE_LIMIT = 100`, `NOT_FOUND_CODE = 404`, `TIMELINE_ITEM_FIELDS = set(RcaTimelineItem.model_fields)` (앵커: `src/domains/dashboard/router.py :: DEFAULT_TIMELINE_LIMIT` 등). `router = APIRouter()` — `src/domains/dashboard/router.py :: router`.

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `GET /dashboard/rca/timeline` (`gateway_routes.DASHBOARD_RCA_TIMELINE_PATH`) | `src/domains/dashboard/router.py :: rca_timeline` | query `cluster_id: str \| None = None`, `limit: int = 50 (ge=1, le=100)` | `RcaTimelineResponse(items=[RcaTimelineItem...])` | `require_session` + cluster `Permission.RCA_READ` |
| `GET /dashboard/rca/incidents/{incident_id}` (`DASHBOARD_RCA_INCIDENT_PATH`) | `src/domains/dashboard/router.py :: rca_incident` | query `cluster_id: str \| None = None` | `RcaIncidentResponse(item=RcaTimelineItem)`; 없으면 404 `"RCA incident not found"` | 동일 |
| `POST /metrics/validate` (`gateway_routes.METRICS_VALIDATE_PATH`) | `src/domains/dashboard/router.py :: validate_metrics_query` | `AgentDebugQueryRequest`(`cluster_id`, `source="prometheus"`, query/range) | `AgentDebugQueryResponse` | `require_session` + cluster `Permission.EVIDENCE_READ`; `telemetry.query.run` 명령을 capability 보유 cluster-agent에 큐잉하고 OperationEvent 발행 |
| `GET /clusters/{cluster_id}/metric-query-presets` | `list_metric_query_presets` | cluster path | `MetricQueryPresetListResponse` | cluster `Permission.DASHBOARD_READ` |
| `POST /clusters/{cluster_id}/metric-query-presets` | `upsert_metric_query_preset` | `MetricQueryPresetUpsertRequest` | `MetricQueryPresetResponse` | cluster `Permission.DASHBOARD_MANAGE` |
| `DELETE /clusters/{cluster_id}/metric-query-presets/{preset_id}` | `delete_metric_query_preset` | path | 204 / 404 | cluster `Permission.DASHBOARD_MANAGE` |
| `POST /clusters/{cluster_id}/metric-query-presets/{preset_id}/run` | `run_metric_query_preset` | path | `AgentDebugQueryResponse` | cluster `Permission.EVIDENCE_READ`; 내부는 `debug_query_plan` + `queue_agent_command` |
| `GET /clusters/{cluster_id}/metric-widgets` | `list_metric_widgets` | cluster path | `MetricWidgetListResponse` | cluster `Permission.DASHBOARD_READ` |
| `POST /clusters/{cluster_id}/metric-widgets` | `upsert_metric_widget` | `MetricWidgetUpsertRequest` | `MetricWidgetResponse` | cluster `Permission.DASHBOARD_MANAGE` |
| `DELETE /clusters/{cluster_id}/metric-widgets/{widget_id}` | `delete_metric_widget` | path | 204 / 404 | cluster `Permission.DASHBOARD_MANAGE` |

공개 헬퍼: `timeline_item(row: JsonObject) -> RcaTimelineItem` (`src/domains/dashboard/router.py :: timeline_item`) — `TIMELINE_ITEM_FIELDS`만 추출, supporting/missing_evidence는 `or []`.

### fleet 라우터 — `src/domains/dashboard/fleet_router.py`

콘솔 루트(fleet) 화면용 워크스페이스 전체 롤업. `router = APIRouter()`(앵커: `src/domains/dashboard/fleet_router.py :: router`), 테스트: `tests/test_fleet_router.py`.

| 메서드+경로 | 핸들러(앵커) | 응답 | 권한 |
|---|---|---|---|
| `GET /fleet/summary` (`gateway_routes.FLEET_SUMMARY_PATH`) | `src/domains/dashboard/fleet_router.py :: fleet_summary` | `FleetSummaryResponse(clusters=[FleetClusterSummaryItem...], totals=FleetTotals)` | `require_session` + `accessible_resource_ids(cluster, Permission.CLUSTER_READ)`로 클러스터 필터 |
| `GET /clusters/{cluster_id}/summary` (`CLUSTER_SUMMARY_PATH`) | `src/domains/dashboard/fleet_router.py :: cluster_summary_detail` | `ClusterSummaryDetailResponse`; 미등록 클러스터면 404 `"cluster not found"` | `require_session` + cluster `Permission.CLUSTER_READ`(기존 클러스터 라우트와 동일 가드) |
| `GET /clusters/{cluster_id}/nodes/summary` (`CLUSTER_NODES_SUMMARY_PATH`) | `src/domains/dashboard/fleet_router.py :: cluster_nodes_summary` | `ClusterNodesSummaryResponse(nodes=[NodeSummaryItem...])`; 미등록 클러스터면 404 | `require_session` + cluster `Permission.CLUSTER_READ` |
| `GET /clusters/{cluster_id}/nodes/{node_name}/pods/summary` (`CLUSTER_NODE_PODS_SUMMARY_PATH`) | `src/domains/dashboard/fleet_router.py :: node_pods_summary` | `NodePodsSummaryResponse(pods=[PodSummaryItem...])`; 미등록 클러스터면 404, 노드 없음이면 404 `"node not found"` | `require_session` + cluster `Permission.CLUSTER_READ` |

health 롤업 규칙 — `rollup_health`(앵커: `src/domains/dashboard/fleet_router.py :: rollup_health`, 결정적·단위 테스트 고정):

1. `unknown`: pod/node/workload inventory rollup 과 최신 usage 샘플 모두에 관측값이 없음(`has_observations(...) == False`).
2. `critical`: degraded workload 수 > `FLEET_DEGRADED_WORKLOAD_THRESHOLD`(0, 앵커: `src/domains/dashboard/fleet_router.py :: FLEET_DEGRADED_WORKLOAD_THRESHOLD`) **또는** `nodes_total > 0`이면서 `nodes_ready < nodes_total`.
3. `warning`: `restarts_recent > 0` **또는** `open_incidents > 0`.
4. `stale`: 관측값은 있으나 `cluster_connection_status(agent) != "online"`.
5. 그 외 `healthy`. (node 관측이 없으면(nodes_total=0) node 조건은 판정에서 제외되지만, 관측값 존재 여부는 `has_observations`가 별도로 판단)

집계 원천(공개 헬퍼):

- `build_fleet_summary`(앵커: `src/domains/dashboard/fleet_router.py :: build_fleet_summary`) — `list_cluster_registrations`(허용 집합) → 테스트 클러스터 숨김(target 라우터의 `BLOCKED_TEST_CLUSTER_IDS`/`BLOCKED_TEST_CLUSTER_NAME_PARTS` 재사용) → `fleet_inventory_rollup` + `latest_cluster_usage_rollups` + `count_open_rca_incidents` + `latest_cluster_agent_statuses`(클러스터가 있을 때만 호출) → totals 에 `count_open_workflow_approvals`/`count_running_workflow_runs`(gitops)·`open_dead_letter_count`(플랫폼 전역, 개수만) 합산.
- `restarts_recent_from_samples`(앵커: `src/domains/dashboard/fleet_router.py :: restarts_recent_from_samples`) — 최신 usage 샘플 2개의 `restart_total` 델타(샘플<2 또는 음수면 0).
- `has_observations`(앵커: `src/domains/dashboard/fleet_router.py :: has_observations`) — inventory rollup 의 `pods_total`/`nodes_total`/`workloads_total` 또는 최신 usage 의 `pod_total`/`node_total` 중 하나라도 0보다 크면 true. false 면 health 는 `unknown`.
- `usage_pct`(앵커: `src/domains/dashboard/fleet_router.py :: usage_pct`) — usage 롤업의 실측 pct/ratio(×100) 키만 추출, 없으면 None(합성 금지) → `cpu_pct`/`mem_pct`.
- `build_cluster_summary_detail`(앵커: `src/domains/dashboard/fleet_router.py :: build_cluster_summary_detail`) — workload 를 health 값으로 그룹(`list_inventory_resources(resource_type="workload")`), 최근 Warning 이벤트(`list_recent_warning_events`, 최대 10건), 열린 인시던트(`list_open_rca_incidents`), 최신 usage 스냅샷(`usage_snapshot`).
- `build_nodes_summary`(앵커: `src/domains/dashboard/fleet_router.py :: build_nodes_summary`) — `cluster_inventory_resources`의 node/pod 행을 읽어 node tile을 만든다. `pods_running`은 해당 nodeName에 배치된 Running pod 수, `pods_capacity`는 node summary의 `allocatable.pods` 또는 `capacity.pods`, `conditions`는 Ready를 제외한 `status=True` condition만. node별 `cpu_pct`/`mem_pct`는 usage 샘플에 node별 실측 map/list가 있을 때만 채우고 없으면 `null`.
- `build_node_pods_summary`(앵커: `src/domains/dashboard/fleet_router.py :: build_node_pods_summary`) — node 존재를 `get_inventory_resource(resource_type="node", kind="Node")`로 확인한 뒤 pod summary의 `node_name`으로 필터. pod별 ready는 container ready 비율(`"1/1"`), owner는 summary의 `owner_kind`/`owner_name`, pod별 `cpu_mcores`/`mem_mib`는 inventory/usage에 있을 때만 채운다. 열린 incident 연결은 `latest_open_incidents_by_resource(resource_kind="Pod")`가 rca_timeline projection(`incident_namespace`, `incident_resource_kind`, `incident_resource_name`)에서 최신 correlation 1건을 찾는다.
- pod/node 수는 inventory 롤업 우선, inventory 에 해당 행이 없으면 최신 usage 샘플로 대체. `last_seen_at`은 agent 상태 → inventory 최근 관측 → usage 샘플 순.

응답 모델(`FleetSummaryResponse`, `FleetClusterSummaryItem`, `FleetTotals`, `ClusterSummaryDetailResponse`, `ClusterWorkloadHealthItem`, `ClusterWarningEventItem`, `ClusterOpenIncidentItem`, `ClusterUsageSnapshot`, `ClusterNodesSummaryResponse`, `NodeSummaryItem`, `NodePodsSummaryResponse`, `PodSummaryItem`) 정의는 [contracts](../packages/contracts.md) 소유(`src/packages/contracts/gateway/responses.py`).

## 데이터 모델 (Data Model)

### `rca_timeline` — `src/domains/dashboard/models.py :: RcaTimeline`

`__table_args__ = (UniqueConstraint("workspace_id", "correlation_id"), Index("ix_rca_timeline_scope_updated", "workspace_id", "updated_at"), Index("ix_rca_timeline_open_cluster", "workspace_id", "cluster_id", "status", "incident_id"))`

추가 운영 인덱스: Alembic revision `20260708_0405`가 `ix_rca_timeline_fleet_open_logical` partial expression index를 `CONCURRENTLY`로 만들고, revision `20260708_0435`가 projection 컬럼과 `ix_rca_timeline_fleet_open_projection` partial index를 추가했다. 현재 쿼리는 더 강한 `OPEN_INCIDENT_STATUSES` 조건으로 후보를 먼저 줄이고, 정규화 projection 필드로 구버전 logical key도 조회 시점에 호환 보정한다.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 시퀀스 |
| workspace_id | Text | NOT NULL, UNIQUE(workspace_id, correlation_id) | 워크스페이스 |
| correlation_id | Text | NOT NULL, UNIQUE(workspace_id, correlation_id) | 흐름 식별자(업서트 키) |
| cluster_id | Text | nullable | 대상 클러스터 (보존 컬럼) |
| incident_id | Text | nullable | 인시던트 ID (보존 컬럼) |
| evidence_ref | Text | nullable | 증거 오브젝트 참조 (보존 컬럼) |
| current_subject | Text | NOT NULL | 마지막 반영 이벤트 subject |
| status | Text | NOT NULL | 매핑 테이블의 상태 문자열 |
| root_cause | Text | nullable | RCA 결과 (보존 컬럼) |
| confidence | Float | nullable | RCA 신뢰도 (보존 컬럼) |
| supporting_evidence | JSONB (list[str]) | nullable | 근거 목록 (보존 컬럼) |
| missing_evidence | JSONB (list[str]) | nullable | 부족 증거 목록 (보존 컬럼) |
| action_route | Text | nullable | `command` / `safe_pr` 등 (보존 컬럼) |
| command_id | Text | nullable | 연결 명령 (보존 컬럼) |
| pr_url | Text | nullable | 생성 PR URL (보존 컬럼) |
| error_reason | Text | nullable | 거부/실패 사유 (최신 이벤트 기준 교체) |
| last_event_id | Text | NOT NULL | 마지막 이벤트 ID |
| last_event_at | Text | NOT NULL | 마지막 이벤트 시각 문자열(순서 비교 키) |
| payload | JSONB | NOT NULL | 마지막 이벤트 payload 전문 |
| created_at / updated_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 시각 |

### `metric_query_presets` — `src/domains/dashboard/models.py :: MetricQueryPreset`

cluster별 저장형 PromQL 정의. `UNIQUE(workspace_id, cluster_id, name)`. 결과값은 저장하지 않고, 실행은 `metric-query-presets/{preset_id}/run`이 기존 agent command 경로에 위임한다.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| preset_id | Text | PK | preset 식별자 |
| workspace_id / cluster_id | Text | workspace FK / NOT NULL | 범위 |
| name / description / source / query / unit | Text | NOT NULL | 표시명·출처·PromQL 정의 |
| range_seconds / step_seconds | BigInteger | nullable | 실행 범위와 step 상한 |
| metadata | JSONB | NOT NULL | UI/스코프 메타데이터 |
| created_by / created_at / updated_at | Text/TIMESTAMP | NOT NULL | 감사용 |

### `metric_widgets` — `src/domains/dashboard/models.py :: MetricWidget`

저장형 query preset을 참조하는 화면 widget 정의. `UNIQUE(workspace_id, cluster_id, title)`.

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| widget_id | Text | PK | widget 식별자 |
| workspace_id / cluster_id | Text | workspace FK / NOT NULL | 범위 |
| query_preset_id | Text | FK(metric_query_presets.preset_id) | 실행 query 참조 |
| title / kind | Text | NOT NULL | 표시명, line/stat/table/heatmap 등 |
| position / settings | JSONB | NOT NULL | 레이아웃·표시 설정 |
| created_by / created_at / updated_at | Text/TIMESTAMP | NOT NULL | 감사용 |

## 이벤트 (Events)

- 발행: 없음.
- 구독: 직접 구독하지 않음. projection 워커가 수신한 envelope를 `timeline_update_from_event`에 통과시켜 매핑 표의 27개 subject만 투영한다.

## 동작 (Behavior)

### 투영 흐름

1. 워커가 이벤트 envelope 수신 → `timeline_update_from_event(evt)`.
2. `None`이면 skip; row면 `DashboardRepository.upsert_rca_timeline(row)`.
3. 업서트는 `(workspace_id, correlation_id)` 단위 — 한 흐름당 1행이 최신 상태로 수렴.

### 순서 역전 방어

이벤트가 순서 없이 도착해도: 식별자성 컬럼은 coalesce로 축적(한 번 채워지면 NULL로 되돌아가지 않음), 상태성 컬럼은 `last_event_at` 비교로 더 최신 이벤트만 반영.

### 조회 권한 흐름 (`_allowed_cluster_ids`)

- `cluster_id` 쿼리 지정 시: `require_cluster_access(..., Permission.RCA_READ)` 통과 후 `{cluster_id}`.
- 미지정 시: `db.accessible_resource_ids(user_id, workspace_id, AccessResourceType.CLUSTER, Permission.RCA_READ)` (스레드로 오프로드). 반환이 빈 set이면 결과 0건, `None`이면 무제한.
- DB 조회는 `asyncio.to_thread`로 실행(동기 리포지토리 논블로킹화).

## 불변식·오류 (Invariants & Errors)

- `(workspace_id, correlation_id)` 유일 — 같은 흐름은 항상 1행.
- 보존 컬럼은 절대 NULL로 퇴행하지 않음(coalesce).
- `last_event_at`이 더 오래된 이벤트는 상태를 되돌리지 못함.
- `allowed_cluster_ids == set()`은 DB 접근 없이 빈 결과(정보 노출 0).
- 미존재 인시던트 → 404 `"RCA incident not found"`.

## 설정 (Settings)

- 관리 서버에는 Prometheus 주소·HTTP timeout 설정이 없다. 주소와 credential은 클러스터별 integration revision으로 암호화되어 cluster-agent에만 전달된다.
