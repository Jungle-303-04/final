---
source_commit: 664925a6
status: synced
---

# inventory — 멀티 클러스터 Kubernetes 리소스 현황 read model

> 소스: `src/domains/inventory/` · 테스트: `tests/test_inventory_domain.py`

## 책임 (Responsibility)

- **한다**:
  - cluster-agent가 보고하는 클러스터 리소스 스냅샷의 수신(HTTP)·영속(스냅샷 이력 + 리소스 upsert read model + usage 시계열).
  - 스냅샷 payload의 정규화: 리소스 식별 키(sha256) 생성, `health`/`usage` 섹션을 합성(synthetic) 리소스로 변환.
  - `replace` 모드에서 스냅샷에 없는 기존 리소스의 soft delete(`deleted_at` 마킹).
  - target-agent kubernetes evidence를 인벤토리 스냅샷 payload로 변환하는 순수 함수(`kubernetes_snapshot.py`) — usage 롤업(pod/restart/node 실측 집계) 포함.
  - 대시보드용 조회 API: 리소스 목록(타입/네임스페이스 필터), 워크로드/서비스/이벤트 뷰, 최신 스냅샷 + health별 카운트 요약, 실측 usage 시계열(`GET /clusters/{cluster_id}/usage`).
  - diff-worker actual-state 조회용: 최신 인벤토리 리소스에서 컨테이너 이미지 추출(`get_actual_resource_image`).
  - 스냅샷 영속 완료 이벤트(`cluster.inventory.snapshot.recorded`) 발행.
- **하지 않는다**:
  - 클러스터에서의 실제 리소스 수집 — cluster-agent 담당.
  - agent 인증·클러스터 권한 판정의 구현 — [identity](./identity.md)의 가드(`require_cluster_agent`, `require_cluster_access`)에 위임.
  - 리소스 상태 기반 알림·분석 — 다른 도메인(alert, rca 등) 담당.

### Workspace filter projection과 물리 토폴로지

`src/domains/inventory_filter/`는 temporal inventory revision을 기준으로 workspace 공통 필터와
그래프 read model을 제공한다. BQ-074 `GET /topology?view=physical&clusters=<single>`은 기존
`/resources/graph`의 세션 workspace·구체 cluster/application 권한·snapshot cut을 그대로
사용한다. node/pod placement는 같은 revision에서 읽고, 각 pod의 `matches_filter`와 서버별
`matched_pod_count/total_pod_count`를 SQL에서 계산한다. 동축 필터는 OR, 이축은 AND, label은
각 selector별 AND다.

서버마다 문제 상태·restart 우선으로 pod를 정렬해 12개만 반환하고 초과 수는 `truncated`로
제공한다. 미배치 pod의 `server_id`는 `null`이며, 관측된 node가 revision에 없을 때도 임의
서버를 만들지 않고 projection을 partial로 내린다. node/pod usage는 최신 실측 usage sample만
결합한다. requests 근거가 없으면 `usage_pct=null`, metric이 없으면 CPU/MEM도 `null`이다.
응답 DTO는 allowlist만 직렬화하여 inventory `summary/raw/annotations`와 secret을 노출하지 않는다.

BQ-075 `GET /topology?view=relations&clusters=<single>`은 같은 workspace·구체 cluster/application
권한·canonical filter·global/pinned snapshot cut을 재사용한다. 기존 evidence-backed graph의
owner UID reference, node assignment, structured selector match, Endpoint의 service-name label만
`{nodes:[{id,kind,name,status}],edges:[{from,to,type}]}`로 좁힌다. 이름이 비슷하다는 이유로 edge를
합성하지 않으며 raw/summary/annotation은 반환하지 않는다. 요청한 snapshot cut이 없거나 아직
snapshot이 하나도 없으면 관계와 빈 상태를 혼동하지 않도록 fail-closed한다.

GAP-012/BQ-030 `GET /metrics/history?ids=...`는 `/resources`가 반환한 pod
`inventory_key`를 최대 100개까지 서버에서 한 번에 처리한다. 같은 common filter와 session의
cluster/application 권한, 같은 `snapshot_revision`의 교집합에서 모든 ID를 다시 확인하며 하나라도
벗어나면 존재 여부를 구분하지 않는 404로 닫는다. `cluster_usage_samples`는
`inventory_filter_revisions.snapshot_id`와 조인하므로 과거 cut에 최신 metric을 섞지 않는다.
각 point의 `cpu_mcores`/`mem_mib`는 수집된 값만 반환하고 결측은 `null`, 이력이 전혀 없으면
`points=[]`/`has_sparkline_points=false`/`completeness=unavailable`이다. 단건 API를 브라우저에서
fan-out하거나 0을 합성하지 않는다. BQ-055의 filtered/unfiltered count는 기존 `GET /resources`의
`counts`가 snapshot/completeness와 함께 제공하므로 중복 count route를 만들지 않는다.

BQ-061 `GET /capabilities?resource=<inventory_key>`는 세션 workspace 안에서 서버 발급 key를
다시 조회한 뒤 `inventory.read`를 먼저 검증한다. Deployment action은 실제 gateway route와
동일하게 `deploy.run`, target agent의 명시적 `command_receiver`, command catalog와 control
namespace allowlist, management read-only 보호를 모두 통과할 때만 반환한다. 거부·미지원·대상에
무의미한 action은 disabled decision으로 합성하지 않고 `capabilities`에서 제외한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.identity.dependencies` | [identity](./identity.md) | `ClusterAgentIdentity`, `require_cluster_agent`, `require_cluster_access`, `require_session` 가드 |
| import | `packages.contracts.event_bus` (bodies.base / registry / subjects / interfaces) | [contracts](../packages/contracts.md) | `EventBody`, `@event`, `EventSubject`, `JsonObject` |
| import | `packages.contracts.gateway` (routes / requests / responses) | [contracts](../packages/contracts.md) | 경로 상수, `InventorySnapshotRequest`, `Inventory*Response` |
| import | `packages.contracts.identity` | [contracts](../packages/contracts.md) | `DEFAULT_WORKSPACE_ID`, `Permission.INVENTORY_READ` |
| import | `packages.runtime.dependencies` | [runtime](../packages/runtime.md) | `get_db`, `get_events` FastAPI 의존성 |
| import | `packages.storage` (base / engine) | [storage](../packages/storage.md) | `Base`, 컬럼 헬퍼, `DatabaseConnection`, `iso_or_none`, `unit_of_work_or_null` |
| 발행 | `cluster.inventory.snapshot.recorded` | [이벤트](#이벤트-events) | 스냅샷 영속 완료 통지 |
| 외부 | cluster-agent (HTTP POST) | — | 스냅샷 payload 공급자 |

## 공개 인터페이스 (Public API)

### 모듈

- `src/domains/inventory/__init__.py` — 도메인 선언("클러스터 리소스 현황"). 심볼 없음.

### kubernetes evidence 변환 — `src/domains/inventory/kubernetes_snapshot.py`

- `src/domains/inventory/kubernetes_snapshot.py :: kubernetes_evidence_to_inventory_snapshot`
  ```python
  def kubernetes_evidence_to_inventory_snapshot(kubernetes: JsonObject, *, cluster_id: str, agent_id: str) -> JsonObject
  ```
  target-agent kubernetes evidence(`workloads`/`pods`/`nodes`/`services`/`events`/`endpoints` 목록)를 `save_inventory_snapshot`이 받는 payload로 변환하는 순수 함수. `source="cluster-agent:kubernetes"`, `replace=True`, `collected_at=cluster.collected_at`. `health.status`는 리소스가 있으면 `"healthy"` 아니면 `"empty"`. `usage`는 실측 롤업(내부 `_usage_rollup`): pod/node가 하나도 없으면 빈 dict(usage 행 미생성), 있으면 `{pod_total, pod_running, pod_pending, pod_failed(phase 카운트), restart_total, node_total, node_ready}` — agent가 실제 관측한 값만 집계(합성 값 금지). 호출부는 target 도메인의 evidence job 결과 처리([target](./target.md)).

### 이벤트 body — `src/domains/inventory/events.py`

- `src/domains/inventory/events.py :: InventorySnapshotRecordedBody` — `@event(EventSubject.CLUSTER_INVENTORY_SNAPSHOT_RECORDED)` (스키마는 [이벤트](#이벤트-events) 참조)

### 리포지토리 — `src/domains/inventory/repository.py`

모듈 상수:

| 앵커 | 값 | 의미 |
|---|---|---|
| `src/domains/inventory/repository.py :: INVENTORY_UPSERT_CHUNK` | `500` | 스냅샷 리소스 배치 업서트 청크 크기 — 다중 VALUES 1문으로 실행되는 행 수 상한(파라미터 수 제한과 트랜잭션 락 시간의 절충, env 아님) |
| `src/domains/inventory/repository.py :: SYNTHETIC_NAMESPACE` | `None` | 합성 리소스(health/usage)의 namespace |
| `src/domains/inventory/repository.py :: HEALTH_RESOURCE_TYPE` | `"health"` | 합성 클러스터 health 리소스 타입 |
| `src/domains/inventory/repository.py :: USAGE_RESOURCE_TYPE` | `"usage"` | 합성 클러스터 usage 리소스 타입 |
| `src/domains/inventory/repository.py :: UNKNOWN_STATUS` | `"unknown"` | status/health 미지정 시 기본값 |
| `src/domains/inventory/repository.py :: FLEET_ROLLUP_RESOURCE_TYPES` | `("pod", "node", "workload")` | fleet 롤업 집계 대상 리소스 타입 |
| `src/domains/inventory/repository.py :: POD_RUNNING_STATUS` | `"Running"` | pods_running 판정 기준 status |
| `src/domains/inventory/repository.py :: NODE_READY_STATUS` | `"Ready"` | nodes_ready 판정 기준 status |
| `src/domains/inventory/repository.py :: DEGRADED_HEALTH` | `"degraded"` | degraded workload/Warning 이벤트 판정 기준 health |

모듈 함수:

- `src/domains/inventory/repository.py :: parse_observed_at`
  ```python
  def parse_observed_at(value: str | None) -> datetime
  ```
  ISO 문자열 파싱. 빈 값·파싱 실패 시 `datetime.now(UTC)`. naive면 UTC tz 부여.
- `src/domains/inventory/repository.py :: inventory_resource_key`
  ```python
  def inventory_resource_key(workspace_id: str, cluster_id: str, resource_type: str, namespace: str | None, kind: str, name: str) -> str
  ```
  `[workspace_id, cluster_id, resource_type, namespace or "", kind, name]`를 `json.dumps(ensure_ascii=True, separators=(",", ":"))` 직렬화 후 sha256 hex digest 반환 — 리소스 identity 키(스냅샷 간 안정).
- `src/domains/inventory/repository.py :: resource_type_of`
  ```python
  def resource_type_of(resource: JsonObject) -> str
  ```
  `resource["resource_type"]`(없으면 `"custom"`)를 `.strip().lower()`.
- `src/domains/inventory/repository.py :: normalize_inventory_resource`
  ```python
  def normalize_inventory_resource(resource: JsonObject, *, workspace_id: str, cluster_id: str, snapshot_id: str, observed_at: datetime) -> JsonObject
  ```
  payload 리소스 1개를 `cluster_inventory_resources` 행 dict로 정규화. 규칙:
  - `kind`: `resource["kind"]` 없으면 resource_type.
  - `name`: `name` → `uid` → `f"{resource_type}-resource"` 순 fallback.
  - `status`/`health`: 없으면 `UNKNOWN_STATUS`.
  - `labels`/`annotations`/`summary`/`raw`: `dict(... or {})`.
  - `observed_at` = `first_seen_at` = `last_seen_at` = 인자 `observed_at`, `deleted_at=None`.
- `src/domains/inventory/repository.py :: snapshot_resources`
  ```python
  def snapshot_resources(payload: JsonObject) -> list[JsonObject]
  ```
  `payload["resources"]` 복사본 목록에, `payload["health"]`가 비어 있지 않으면 합성 리소스 `{resource_type: "health", api_version: "platform/v1", kind: "ClusterHealth", namespace: None, name: "cluster", status: health.status|unknown, health: health.health|health.status|unknown, summary=raw=health}`를, `payload["usage"]`가 비어 있지 않으면 `{resource_type: "usage", api_version: "platform/v1", kind: "ClusterUsage", namespace: None, name: "cluster", status: usage.status|"sampled", health: "unknown", summary=raw=usage}`를 추가.
- `src/domains/inventory/repository.py :: snapshot_summary`
  ```python
  def snapshot_summary(payload: JsonObject) -> JsonObject
  ```
  `{"summary": dict(payload["summary"] or {}), "health": ..., "usage": ...}` 반환.
- `src/domains/inventory/repository.py :: first_container_image`
  ```python
  def first_container_image(raw: JsonObject, summary: JsonObject) -> str | None
  ```
  K8s 리소스 raw에서 첫 컨테이너 이미지 탐색 — `spec.template.spec.containers`(workload) → `spec.containers`(pod) → `summary["image"]` 순 fallback, 없으면 None.

클래스:

- `src/domains/inventory/repository.py :: InventoryRepository` — `packages.storage.engine.DatabaseConnection` 상속 mixin.
  - `src/domains/inventory/repository.py :: InventoryRepository.save_inventory_snapshot`
    ```python
    def save_inventory_snapshot(self, *, workspace_id: str, cluster_id: str, agent_id: str, payload: JsonObject) -> JsonObject
    ```
    동작은 [동작](#동작-behavior) 참조. 반환: `{"accepted": True, "snapshot_id", "cluster_id", "resource_count", "marked_deleted", "resource_types"(정렬된 list)}`.
  - `src/domains/inventory/repository.py :: InventoryRepository.list_inventory_resources`
    ```python
    def list_inventory_resources(self, *, workspace_id: str, cluster_id: str, resource_type: str | None = None, namespace: str | None = None, include_deleted: bool = False, limit: int = 200) -> list[JsonObject]
    ```
    `cluster_inventory_resources`에서 workspace/cluster 필수 필터 + `resource_type`·`namespace` 선택 필터(truthy일 때만), `include_deleted=False`면 `deleted_at IS NULL`. 정렬 `resource_type, namespace NULLS FIRST, name`, limit은 `max(1, min(limit, 1000))`로 clamp. 각 행은 `serialize_inventory_resource` 적용.
  - `src/domains/inventory/repository.py :: InventoryRepository.get_inventory_resource`
    ```python
    def get_inventory_resource(self, *, workspace_id: str, cluster_id: str, resource_type: str, kind: str, name: str, namespace: str | None = None) -> JsonObject | None
    ```
    삭제되지 않은 단일 Kubernetes resource identity를 최신 `last_seen_at` 기준으로 조회한다. 드릴다운은 list 결과 추론 대신 이 row를 기준으로 이벤트/관계를 계산한다.
  - `src/domains/inventory/repository.py :: InventoryRepository.get_inventory_resource_by_key`
    ```python
    def get_inventory_resource_by_key(self, *, workspace_id: str, inventory_key: str) -> JsonObject | None
    ```
    BQ-061 capability subject를 서버 발급 key로 다시 조회한다. `workspace_id`와
    `deleted_at IS NULL`을 항상 함께 적용해 다른 workspace 또는 삭제된 row는 반환하지 않는다.
  - `src/domains/inventory/repository.py :: InventoryRepository.list_related_inventory_resources`
    ```python
    def list_related_inventory_resources(self, *, workspace_id: str, cluster_id: str, resource: JsonObject, limit: int = 100) -> dict[str, list[JsonObject]]
    ```
    실제 inventory summary만으로 1-hop 관계를 계산한다. 현재 규칙: node → `summary.node_name` 일치 pod, service → selector와 pod labels 매칭 pod, workload → selector 또는 pod owner 일치 pod. 합성 관계를 만들지 않는다.
  - `src/domains/inventory/repository.py :: InventoryRepository.list_resource_events`
    ```python
    def list_resource_events(self, *, workspace_id: str, cluster_id: str, resource: JsonObject, limit: int = 50) -> list[JsonObject]
    ```
    Kubernetes Event summary의 `involved_kind`/`involved_name`/`involved_uid`가 단일 resource identity와 일치하는 이벤트만 최신순으로 반환한다.
  - `src/domains/inventory/repository.py :: InventoryRepository.get_actual_resource_image`
    ```python
    def get_actual_resource_image(self, workspace_id: str, cluster_id: str, namespace: str | None, resource: str) -> str | None
    ```
    diff-worker actual-state 조회. `resource`는 gitops resource_ref 형식(`"kind/name"`, kind 소문자) — `kind`/`name`으로 분해해 살아 있는(`deleted_at IS NULL`) 최신(`last_seen_at DESC LIMIT 1`) 행을 찾고(`lower(kind)` 비교, namespace는 truthy일 때만 필터) `first_container_image(raw, summary)` 반환. 스냅샷/이미지가 없으면 None — 호출부(diff-worker)가 "unknown" 처리.
  - `src/domains/inventory/repository.py :: InventoryRepository.list_cluster_usage_samples`
    ```python
    def list_cluster_usage_samples(self, workspace_id: str, cluster_id: str, *, limit: int = 288) -> list[JsonObject]
    ```
    `cluster_usage_samples`에서 최신 `limit`개(1..2000 clamp)를 뽑아 시간 오름차순으로 반환(차트용). 원소: `{"sampled_at": ISO 문자열, "usage": dict}`.
  - `src/domains/inventory/repository.py :: InventoryRepository.fleet_inventory_rollup`
    ```python
    def fleet_inventory_rollup(self, workspace_id: str, cluster_ids: set[str] | None = None) -> dict[str, JsonObject]
    ```
    fleet 화면용 클러스터별 pod/node/workload 상태 롤업(GROUP BY 1 쿼리). `cluster_ids`가 빈 집합이면 즉시 `{}`(권한 0), `None`이면 워크스페이스 전체. 반환 값: `{cluster_id: {pods_running, pods_total, nodes_ready, nodes_total, workloads_degraded, workloads_total, last_seen_at(ISO|None)}}` — pods_running은 `status == "Running"`, nodes_ready는 `status == "Ready"`, workloads_degraded는 `health == "degraded"` 기준.
  - `src/domains/inventory/repository.py :: InventoryRepository.latest_cluster_usage_rollups`
    ```python
    def latest_cluster_usage_rollups(self, workspace_id: str, cluster_ids: set[str] | None = None, *, samples_per_cluster: int = 2) -> dict[str, list[JsonObject]]
    ```
    클러스터별 최신 usage 샘플 N개(1..10 clamp)를 window function(row_number)으로 뽑아 시간 오름차순으로 반환 — fleet `restarts_recent` 델타 계산·usage 스냅샷용. 빈 허용 집합이면 즉시 `{}`. 원소는 `list_cluster_usage_samples`와 동일한 `{"sampled_at", "usage"}`.
  - `src/domains/inventory/repository.py :: InventoryRepository.list_recent_warning_events`
    ```python
    def list_recent_warning_events(self, workspace_id: str, cluster_id: str, *, limit: int = 10) -> list[JsonObject]
    ```
    드릴다운용 최근 경고 이벤트 — `resource_type="event"` + `health="degraded"`(Warning) + `deleted_at IS NULL`을 `observed_at DESC`로 최대 `limit`(1..100 clamp)개, `serialize_inventory_resource` 적용.
  - `src/domains/inventory/repository.py :: InventoryRepository.latest_inventory_snapshot`
    ```python
    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> JsonObject | None
    ```
    `cluster_inventory_snapshots`에서 `created_at DESC LIMIT 1`. 없으면 None, 있으면 `serialize_inventory_snapshot` 적용.
  - `src/domains/inventory/repository.py :: InventoryRepository.inventory_resource_counts`
    ```python
    def inventory_resource_counts(self, workspace_id: str, cluster_id: str) -> list[JsonObject]
    ```
    삭제되지 않은(`deleted_at IS NULL`) 리소스를 `(resource_type, health)`로 GROUP BY, 동일 키 정렬. 반환 원소: `{"resource_type": str, "health": str, "count": int}`.
  - `src/domains/inventory/repository.py :: InventoryRepository.serialize_inventory_snapshot`
    ```python
    def serialize_inventory_snapshot(self, row: JsonObject) -> JsonObject
    ```
    `collected_at`/`created_at`을 `iso_or_none`으로 ISO 문자열화한 사본 반환.
  - `src/domains/inventory/repository.py :: InventoryRepository.serialize_inventory_resource`
    ```python
    def serialize_inventory_resource(self, row: JsonObject) -> JsonObject
    ```
    `observed_at`/`first_seen_at`/`last_seen_at`/`deleted_at`/`created_at`/`updated_at`을 `iso_or_none` 처리한 사본 반환.

### 라우터 — `src/domains/inventory/router.py`

- `src/domains/inventory/router.py :: router` — `fastapi.APIRouter()` 인스턴스. 엔드포인트는 아래 표.
- `src/domains/inventory/router.py :: require_inventory_access`
  ```python
  def require_inventory_access(db: Any, current: Any, workspace_id: str, cluster_id: str) -> None
  ```
  `require_cluster_access(db, current, workspace_id, cluster_id, Permission.INVENTORY_READ.value)` 호출 shortcut (거부 시 HTTPException).
- `src/domains/inventory/router.py :: inventory_list_response`
  ```python
  def inventory_list_response(db: Any, *, workspace_id: str, cluster_id: str, resource_type: str | None, namespace: str | None, include_deleted: bool, limit: int) -> InventoryResourceListResponse
  ```
  `db.list_inventory_resources(...)` 결과를 `InventoryResourceListResponse(cluster_id, resource_type, resources=[InventoryResourceResponse(**r) ...])`로 포장.

엔드포인트 (경로 상수는 `packages.contracts.gateway.routes`):

| 메서드+경로 | 핸들러 앵커 | 요청 | 응답 모델 | 권한/의존성 |
|---|---|---|---|---|
| POST `/agent/inventory/snapshots` (`AGENT_INVENTORY_SNAPSHOTS_PATH`) | `src/domains/inventory/router.py :: record_inventory_snapshot` | body: `InventorySnapshotRequest` | `InventorySnapshotResponse` | `require_cluster_agent` (x-agent-token, 401 fail-closed) + `get_db` + `get_events` |
| GET `/clusters/{cluster_id}/inventory/resources` (`CLUSTER_INVENTORY_RESOURCES_PATH`) | `src/domains/inventory/router.py :: list_inventory_resources` | query: `resource_type: str \| None`, `namespace: str \| None`, `include_deleted: bool = False`, `limit: int = Query(200, ge=1, le=1000)` | `InventoryResourceListResponse` | `require_session` + `Permission.INVENTORY_READ` |
| GET `/clusters/{cluster_id}/inventory/resource-detail` (`CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH`) | `src/domains/inventory/router.py :: get_inventory_resource_detail` | query: `resource_type`, `kind`, `name`, `namespace?`, `related_limit: 1..1000`, `event_limit: 1..200` | `InventoryResourceDetailResponse(resource, related, events)`; 없으면 404 | `require_session` + `Permission.INVENTORY_READ` |
| GET `/capabilities` (`RESOURCE_CAPABILITIES_PATH`) | `src/domains/inventory/router.py :: get_resource_capabilities` | query: `resource` = 서버 발급 `inventory_key` | exact subject, opaque revision, 실행 가능한 `deployment.restart`/`deployment.scale`만 담은 `ResourceCapabilitiesResponse`; 없으면 404 | `require_session` + `Permission.INVENTORY_READ`; action별 `Permission.DEPLOY_RUN`·agent support·safety policy fail-closed |
| GET `/clusters/{cluster_id}/inventory/workloads` (`CLUSTER_INVENTORY_WORKLOADS_PATH`) | `src/domains/inventory/router.py :: list_inventory_workloads` | query: `namespace`, `limit` (동일 제약) | `InventoryResourceListResponse` | `require_session` + `Permission.INVENTORY_READ` |
| GET `/clusters/{cluster_id}/inventory/services` (`CLUSTER_INVENTORY_SERVICES_PATH`) | `src/domains/inventory/router.py :: list_inventory_services` | query: `namespace`, `limit` (동일 제약) | `InventoryResourceListResponse` | `require_session` + `Permission.INVENTORY_READ` |
| GET `/clusters/{cluster_id}/inventory/events` (`CLUSTER_INVENTORY_EVENTS_PATH`) | `src/domains/inventory/router.py :: list_inventory_events` | query: `namespace`, `limit` (동일 제약) | `InventoryResourceListResponse` | `require_session` + `Permission.INVENTORY_READ` |
| GET `/clusters/{cluster_id}/usage` (`CLUSTER_USAGE_PATH`) | `src/domains/inventory/router.py :: get_cluster_usage` | query: `limit: int = Query(288, ge=1, le=2000)` | `ClusterUsageResponse(cluster_id, samples=[ClusterUsageSample ...])` | `require_session` + `Permission.INVENTORY_READ` |
| GET `/clusters/{cluster_id}/inventory/summary` (`CLUSTER_INVENTORY_SUMMARY_PATH`) | `src/domains/inventory/router.py :: get_inventory_summary` | — | `InventorySummaryResponse` | `require_session` + `Permission.INVENTORY_READ` |

- workloads/services/events 뷰는 각각 `resource_type="workload"` / `"service"` / `"event"` 고정 + `include_deleted=False`인 `list_inventory_resources`의 특수화다.
- GET 계열의 `workspace_id`는 `getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)`로 세션에서 얻는다(요청 파라미터 아님).
- 요청/응답 pydantic 모델(`InventorySnapshotRequest`, `InventoryResource`, `InventorySnapshotResponse`, `InventoryResourceResponse`, `InventoryResourceListResponse`, `InventoryResourceDetailResponse`, `InventorySummaryResponse`)의 필드 정의는 [contracts](../packages/contracts.md) 소유 (`src/packages/contracts/gateway/requests.py`, `src/packages/contracts/gateway/responses.py`).

## 데이터 모델 (Data Model)

### `cluster_inventory_snapshots` — `src/domains/inventory/models.py :: ClusterInventorySnapshotRecord`

`__tablename__ = "cluster_inventory_snapshots"` · 인덱스: `ix_inventory_snapshots_scope (workspace_id, cluster_id, created_at)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| snapshot_id | Text | PK | UUID4 문자열 (repository에서 생성) |
| workspace_id | Text | NOT NULL | 워크스페이스 (agent 토큰 기준 권위값) |
| cluster_id | Text | NOT NULL | 클러스터 (agent 토큰 기준 권위값) |
| agent_id | Text | NOT NULL | 보고한 agent id |
| source | Text | NOT NULL | 수집원 (payload.source, 기본 `"cluster-agent"`) |
| status | Text | NOT NULL | 스냅샷 상태 (payload.status, 기본 `"accepted"`) |
| collected_at | TIMESTAMP(timezone=True) | NOT NULL | agent 수집 시각 (`parse_observed_at` 결과) |
| resource_count | Integer | NOT NULL | 정규화된 리소스 수(합성 리소스 포함) |
| summary | JSONB | NOT NULL | `snapshot_summary` 결과 `{summary, health, usage}` |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default=now() | 저장 시각 |

### `cluster_inventory_resources` — `src/domains/inventory/models.py :: ClusterInventoryResourceRecord`

`__tablename__ = "cluster_inventory_resources"` · 인덱스:
- `ix_inventory_resources_scope (workspace_id, cluster_id, resource_type, namespace, name)`
- `ix_inventory_resources_health (workspace_id, cluster_id, health)`
- `ix_inventory_resources_deleted (workspace_id, cluster_id, deleted_at)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| inventory_key | Text | PK | `inventory_resource_key` sha256 hex (identity 기반 upsert 키) |
| snapshot_id | Text | NOT NULL | 마지막으로 관측한 스냅샷 id |
| workspace_id | Text | NOT NULL | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 |
| resource_type | Text | NOT NULL | 소문자 리소스 타입 (`workload`/`service`/`event`/`health`/`usage`/`custom` 등) |
| api_version | Text | NOT NULL | K8s apiVersion (없으면 `""`) |
| kind | Text | NOT NULL | K8s kind (없으면 resource_type) |
| namespace | Text | nullable | 네임스페이스 (클러스터 스코프·합성 리소스는 NULL) |
| name | Text | NOT NULL | 리소스 이름 |
| uid | Text | nullable | K8s uid |
| resource_version | Text | nullable | K8s resourceVersion |
| status | Text | NOT NULL | 상태 문자열 (기본 `"unknown"`) |
| health | Text | NOT NULL | 건강 상태 문자열 (기본 `"unknown"`) |
| labels | JSONB | NOT NULL | 라벨 맵 |
| annotations | JSONB | NOT NULL | 어노테이션 맵 |
| summary | JSONB | NOT NULL | 요약 정보 |
| raw | JSONB | NOT NULL | 원본 리소스 payload |
| observed_at | TIMESTAMP(timezone=True) | NOT NULL | 최근 관측 시각 |
| first_seen_at | TIMESTAMP(timezone=True) | NOT NULL | 최초 관측 시각 (upsert 시 갱신하지 않음) |
| last_seen_at | TIMESTAMP(timezone=True) | NOT NULL | 마지막 관측 시각 |
| deleted_at | TIMESTAMP(timezone=True) | nullable | soft delete 마킹 시각 (재관측 시 NULL로 복귀) |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default=now() | 행 생성 시각 |
| updated_at | TIMESTAMP(timezone=True) | NOT NULL, server_default=now() | 행 갱신 시각 (repository가 `func.now()`로 명시 갱신) |

### `cluster_usage_samples` — `src/domains/inventory/models.py :: ClusterUsageSampleRecord`

`__tablename__ = "cluster_usage_samples"` · 인덱스: `ix_cluster_usage_samples_scope (workspace_id, cluster_id, sampled_at)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 대리 키 |
| snapshot_id | Text | NOT NULL | 출처 스냅샷 id |
| workspace_id | Text | NOT NULL | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 |
| sampled_at | TIMESTAMP(timezone=True) | NOT NULL | 샘플 시각 (= 스냅샷 collected_at) |
| usage | JSONB | NOT NULL | usage payload (append-only 시계열). kubernetes evidence 경유 스냅샷은 실측 롤업 `{pod_total, pod_running, pod_pending, pod_failed, restart_total, node_total, node_ready}` |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default=now() | 저장 시각 |

## 이벤트 (Events)

### 발행 (Publishes)

**`cluster.inventory.snapshot.recorded`** (`EventSubject.CLUSTER_INVENTORY_SNAPSHOT_RECORDED`) — `src/domains/inventory/events.py :: InventorySnapshotRecordedBody`
발행 지점: `record_inventory_snapshot` 핸들러가 영속 성공 후 `events.accept_body(...)`로 발행 (unit of work 내부).

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| cluster_id | str | (필수) | agent 신원 기준 클러스터 id |
| snapshot_id | str | (필수) | 저장된 스냅샷 UUID |
| agent_id | str | (필수) | 보고한 agent id |
| resource_count | int | (필수) | 정규화된 리소스 수 |
| resource_types | list[str] | `[]` | 스냅샷에 포함된 리소스 타입(정렬됨) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` (`"default"`) | 워크스페이스 |

### 구독 (Consumes)

없음 — 이 도메인은 이벤트를 구독하지 않는다(입력은 HTTP POST).

## 동작 (Behavior)

### 스냅샷 수신 흐름 — `record_inventory_snapshot`

1. `require_cluster_agent`가 `x-agent-token` 헤더를 해시해 등록 레지스트리에서 권위 `(workspace_id, cluster_id)`를 확인 (`ClusterAgentIdentity`). 토큰 없음/미등록/불일치 → 401.
2. `payload.cluster_id != identity.cluster_id`면 → 403 `"cluster_id does not match agent identity"` (요청 body의 workspace/cluster 값은 신뢰하지 않음 — 크로스 테넌트 차단).
3. `unit_of_work_or_null(db)` 트랜잭션 안에서:
   a. `db.save_inventory_snapshot(workspace_id=identity.workspace_id, cluster_id=identity.cluster_id, agent_id=payload.agent_id, payload=payload.model_dump())`.
   b. 결과로 `InventorySnapshotRecordedBody`를 `events.accept_body(...)`로 발행.
4. `InventorySnapshotResponse(**result)` 반환.

### 스냅샷 영속 알고리즘 — `InventoryRepository.save_inventory_snapshot`

1. `snapshot_id = str(uuid.uuid4())`, `observed_at = parse_observed_at(payload["collected_at"])`.
2. `snapshot_resources(payload)`로 리소스 목록 구성 (health/usage 섹션 → 합성 리소스 추가).
3. 각 리소스를 `normalize_inventory_resource(...)`로 행 dict 정규화. `seen_keys`(inventory_key 집합)·`seen_types`(resource_type 집합) 수집.
4. 단일 커넥션(`self.connection()`) 안에서:
   1. `cluster_inventory_snapshots`에 스냅샷 1행 INSERT (`source` 기본 `"cluster-agent"`, `status` 기본 `"accepted"`, `resource_count=len(normalized)`, `summary=snapshot_summary(payload)`).
   2. 리소스를 `INVENTORY_UPSERT_CHUNK`(500)개 청크로 나눠 **배치 업서트** — 청크당 다중 VALUES 1문 `pg_insert(...).on_conflict_do_update(index_elements=[inventory_key])`(리소스당 1문이던 것을 대체, `excluded.*`로 충돌 행 갱신):
      - 갱신 컬럼: `snapshot_id, api_version, kind, namespace, name, uid, resource_version, status, health, labels, annotations, summary, raw, observed_at, last_seen_at`, `deleted_at=None`(부활), `updated_at=func.now()`.
      - **비갱신**: `first_seen_at`, `created_at`, `workspace_id`, `cluster_id`, `resource_type` (identity의 일부).
   3. `summary["usage"]`가 비어 있지 않으면 `cluster_usage_samples`에 1행 INSERT (`sampled_at=observed_at`).
   4. `payload["replace"]`가 truthy이고 `seen_keys`·`seen_types`가 모두 비어 있지 않으면, 같은 workspace/cluster에서 `resource_type IN seen_types`이면서 `inventory_key NOT IN seen_keys`이고 아직 살아 있는(`deleted_at IS NULL`) 행에 `deleted_at=func.now(), updated_at=func.now()` UPDATE → 영향 행 수를 `marked_deleted`로 기록.
5. 반환: `{"accepted": True, "snapshot_id", "cluster_id", "resource_count", "marked_deleted", "resource_types": sorted(seen_types)}`.

### 조회 흐름 (GET 계열)

1. `require_session`으로 세션 확인(401), `workspace_id`는 세션 객체에서 획득.
2. `require_inventory_access` → `require_cluster_access(..., Permission.INVENTORY_READ.value)` (거부 시 403).
3. repository 조회 → 타임스탬프를 ISO 문자열로 직렬화해 응답 모델로 반환.
4. capability 조회는 workspace-scoped key lookup 뒤 동일 read guard를 적용하며, 실제 action
   endpoint의 인가·agent support·네임스페이스·management 조건의 교집합만 반환한다.

## 불변식·오류 (Invariants & Errors)

- **권위 신원**: 저장되는 `workspace_id`/`cluster_id`는 항상 agent 토큰에서 확인된 `ClusterAgentIdentity` 값이다. 요청 body 값은 일치 검증에만 사용된다.
- **identity 키 안정성**: `inventory_resource_key`는 `(workspace_id, cluster_id, resource_type, namespace, kind, name)`의 순수 함수 — 같은 리소스는 스냅샷이 바뀌어도 같은 행에 upsert된다.
- **soft delete만 사용**: 리소스 행은 물리 삭제되지 않는다. `replace` 스냅샷에서 사라진 리소스는 `deleted_at`만 마킹되고, 다시 관측되면 `deleted_at=None`으로 부활한다.
- **replace 범위 한정**: soft delete는 이번 스냅샷에 등장한 `resource_type` 집합 안에서만 수행된다 — 부분 스냅샷이 다른 타입의 리소스를 삭제 처리하지 못한다.
- **`first_seen_at` 불변**: upsert 갱신 컬럼에 포함되지 않아 최초 관측 시각이 보존된다.
- **usage는 append-only**: `cluster_usage_samples`는 갱신 없이 INSERT만 한다(시계열).
- **capability fail-closed**: 권한·에이전트 지원·정책 중 하나라도 확인되지 않으면 action을
  반환하지 않는다. provider/role 이름이나 UI 추측으로 action을 추가하지 않는다.
- **limit clamp**: repository는 `max(1, min(limit, 1000))`, 라우터는 `Query(ge=1, le=1000)`로 이중 방어.
- **원자성**: 스냅샷 INSERT + 리소스 upsert + usage INSERT + soft delete + 이벤트 발행이 `unit_of_work_or_null` 단위로 묶인다(영속 실패 시 이벤트 미발행).
- 오류:
  - 401 — agent 토큰 없음/미등록/해시 불일치 (`require_cluster_agent`), 또는 세션 없음 (`require_session`).
  - 403 — `payload.cluster_id != identity.cluster_id` (`"cluster_id does not match agent identity"`), 또는 `inventory.read` 권한 없음.
  - 422 — `InventorySnapshotRequest` 검증 실패 (StrictModel, `resources` 최대 `MAX_INVENTORY_RESOURCES`).
  - `collected_at` 파싱 실패는 오류가 아니라 현재 시각(UTC)으로 대체된다 (`parse_observed_at`).

## 설정 (Settings)

이 도메인은 환경변수·설정 키를 직접 읽지 않는다. (DB 연결·이벤트 버스 설정은 [runtime](../packages/runtime.md)/[storage](../packages/storage.md) 참조.)
