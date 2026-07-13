---
source_commit: 664925a6
status: synced
---

# applications — 애플리케이션·deployment binding·워크플로 런 조회 HTTP API

> 소스: `src/domains/applications/` · 테스트: `tests/test_applications_router.py`, `tests/test_promotion_and_global.py`

## 책임 (Responsibility)

- 애플리케이션 목록/조회/업서트, repository manifest 검증 기반 app 연결, 애플리케이션별 deployment binding 목록/업서트, 애플리케이션별 workflow run 목록 HTTP API를 제공한다.
- 이 도메인은 라우터만 소유한다 — 테이블·리포지토리·이벤트 없음. 저장은 다른 도메인 리포지토리 메서드(`db.get_application`, `db.upsert_application`, `db.register_repository`, `db.register_watch_target`, `db.register_deployment_binding`, `db.list_application_deployment_bindings`, `db.list_application_workflow_runs`, `db.list_cluster_registrations`)를 합성 `Database`([registry](./registry.md)) 경유로 호출한다.
- 파일 구성: `__init__.py`(docstring `"애플리케이션 관리 도메인"`), `router.py` 뿐.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session`, `require_resource_access`, `require_cluster_access` |
| import | `domains.gitops.repository_discovery` | [./gitops.md](./gitops.md) | `/applications/connect`에서 manifest 재검증(`RepositoryDiscoveryService.validate_manifest`) |
| import | `domains.target.router` | [./target.md](./target.md) | deployment 정의 생성 전 cluster-agent 최신 연결 상태 판정(`cluster_connection_status`) |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | gateway routes/요청·응답 모델, `AccessResourceType`, `Permission`, `DEFAULT_WORKSPACE_ID` |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `get_db` |
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `unit_of_work_or_null` |

## 공개 인터페이스 (Public API)

### 모듈 상수·헬퍼 — `src/domains/applications/router.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` | `src/domains/applications/router.py :: router` |
| `GLOBAL_CLUSTER_SELECTOR` | `"*"` — 글로벌 서비스 선언용 cluster_id 특수값(등록된 전 클러스터로 확장) | `src/domains/applications/router.py :: GLOBAL_CLUSTER_SELECTOR` |
| `GLOBAL_BINDING_KEY` | `"global"` — 확장 생성된 바인딩의 `deploy_policy` 마커 키 | `src/domains/applications/router.py :: GLOBAL_BINDING_KEY` |
| `NO_CLUSTERS_FOR_GLOBAL_BINDING` | `"no registered clusters to expand global binding"` | `src/domains/applications/router.py :: NO_CLUSTERS_FOR_GLOBAL_BINDING` |
| `HTTP_NOT_FOUND` | `404` | `src/domains/applications/router.py :: HTTP_NOT_FOUND` |
| `APPLICATION_NOT_FOUND` | `"application not found"` | `src/domains/applications/router.py :: APPLICATION_NOT_FOUND` |
| `MANIFEST_VALIDATION_FAILED` | `"manifest validation failed"` | `src/domains/applications/router.py :: MANIFEST_VALIDATION_FAILED` |
| `CLUSTER_NOT_CONNECTED_CODE` | `"cluster_not_connected"` | `src/domains/applications/router.py :: CLUSTER_NOT_CONNECTED_CODE` |
| `CLUSTER_NOT_CONNECTED_DETAIL` | `"에이전트가 연결되지 않은 클러스터입니다"` | `src/domains/applications/router.py :: CLUSTER_NOT_CONNECTED_DETAIL` |
| `GITHUB_CREDENTIAL_SCOPE` | `"github"` | `src/domains/applications/router.py :: GITHUB_CREDENTIAL_SCOPE` |
| `repository_discovery_service` | `def repository_discovery_service() -> RepositoryDiscoveryService` — 기본 discovery service DI factory | `src/domains/applications/router.py :: repository_discovery_service` |
| `require_application_access` | `def require_application_access(db: Any, current: Any, workspace_id: str, application_id: str, permission: str) -> None` — `require_resource_access(db, current, workspace_id, AccessResourceType.APPLICATION.value, application_id, permission)` 위임 | `src/domains/applications/router.py :: require_application_access` |
| `get_application_or_404` | `def get_application_or_404(db: Any, workspace_id: str, application_id: str) -> dict[str, Any]` — `db.get_application` None이면 404 | `src/domains/applications/router.py :: get_application_or_404` |
| `require_connected_clusters` | `(db, workspace_id, cluster_ids) -> None` — 최신 agent 상태가 `online`이 아닌 대상이 있으면 400 `{"code":"cluster_not_connected","detail":"에이전트가 연결되지 않은 클러스터입니다","clusters":[...]}` | `src/domains/applications/router.py :: require_connected_clusters` |
| `store_repo_token_if_present` | `def store_repo_token_if_present(db: Any, workspace_id: str, token: str \| None) -> str \| None` — token이 있으면 `credential_ref("github", "github")` ref를 만들고 `db.upsert_workspace_credential`이 있을 때 encrypted value를 저장한 뒤 ref만 반환 | `src/domains/applications/router.py :: store_repo_token_if_present` |

### 엔드포인트

모든 핸들러는 `workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)`를 사용한다.

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `GET /applications` (`gateway_routes.APPLICATIONS_PATH`) | `src/domains/applications/router.py :: list_applications` | query `limit: int = 100 (ge=1, le=500)` | `ApplicationListResponse` | `require_session` + `db.accessible_resource_ids(user_id, workspace_id, APPLICATION, Permission.APPLICATION_READ)`로 접근 가능한 ID만 조회 |
| `POST /applications` (`APPLICATIONS_PATH`) | `src/domains/applications/router.py :: upsert_application` | `ApplicationUpsertRequest` | `ApplicationResponse` | `require_session` |
| `POST /applications/connect` (`APPLICATION_CONNECT_PATH`) | `src/domains/applications/router.py :: connect_application` | `ApplicationConnectRequest` | `ApplicationResponse` | `require_session` + target cluster `Permission.DEPLOY_RUN` |
| `GET /applications/{application_id}` (`APPLICATION_PATH`) | `src/domains/applications/router.py :: get_application` | — | `ApplicationResponse` | `require_session` + `Permission.APPLICATION_READ` (resource access) |
| `GET /applications/{application_id}/deployments` (`APPLICATION_DEPLOYMENTS_PATH`) | `src/domains/applications/router.py :: list_application_deployments` | query `limit: int = 100 (ge=1, le=500)` | `DeploymentBindingListResponse` | `require_session` + `Permission.DEPLOYMENT_READ` |
| `POST /applications/{application_id}/deployments` (`APPLICATION_DEPLOYMENTS_PATH`) | `src/domains/applications/router.py :: upsert_application_deployment` | `DeploymentBindingUpsertRequest` | `DeploymentBindingResponse` | `require_session` + application `Permission.APPLICATION_MANAGE` + cluster `Permission.DEPLOY_RUN` (cluster_id `"*"`면 등록된 **모든** 클러스터에 대해 검사) |
| `GET /applications/{application_id}/runs` (`APPLICATION_RUNS_PATH`) | `src/domains/applications/router.py :: list_application_runs` | query `limit: int = 100 (ge=1, le=500)` | `WorkflowRunListResponse`; command result가 저장된 run은 `promotion_gate`에 completed/applied/failed resources/rollout ready 판정을 구조화해 포함 | `require_session` + `Permission.DEPLOYMENT_READ` |

요청·응답 모델은 [contracts](../packages/contracts.md)의 `packages/contracts/gateway/requests.py` / `responses.py` 정의를 사용한다.

`promotion_gate.eligible`은 workflow-controller의 실제 자동 승격 판정과 같은
`packages.contracts.gitops.promotion_gate_from_command_result`에서 계산한다. command result가
아직 없는 run은 `promotion_gate=null`이며, 이 필드는 승격 실행 결과나 관측 윈도우 판정이 아니다.

## 데이터 모델 (Data Model)

없음 (이 도메인은 테이블을 소유하지 않는다). 애플리케이션/binding/run read model은 소유 도메인 스펙 참조.

## 이벤트 (Events)

없음 (발행·구독 모두 없음).

## 동작 (Behavior)

### 애플리케이션 업서트 (`POST /applications`)

1. body = `payload.model_dump()` + `workspace_id` + `user_id=current.user_id`.
2. `unit_of_work_or_null(db)` 트랜잭션 안에서: `payload.repo_ref`가 truthy면 `db.register_repository(body)` 선행 → `stored = db.upsert_application(body)`.
3. `db.get_application(workspace_id, stored["application_id"]) or stored`를 `ApplicationResponse(application=...)`로 반환 (저장 직후 최신 뷰 재조회).

### repository 연결 (`POST /applications/connect`)

1. session workspace를 기준으로 대상 `payload.cluster_id`에 `Permission.DEPLOY_RUN` 권한을 먼저 검사한다.
2. `require_connected_clusters(db, workspace_id, [payload.cluster_id])`로 cluster-agent 최신 상태가 `online`인지 확인한다. 아니면 400 `cluster_not_connected`로 쓰기 전에 중단한다.
3. `RepositoryDiscoveryService.validate_manifest(RepositoryManifestValidationRequest(...))`로 `repo_ref`, `branch`, `manifest_path`, `source_type`을 서버에서 재검증한다. discovery 오류는 그 status/detail 그대로 HTTPException으로 반환한다.
4. validation 결과가 `valid=False`이면 첫 `errors[0]`, 없으면 `"manifest validation failed"`로 422를 반환한다.
5. `source_type = normalize_source_type(payload.source_type) or source_type_from_path(validation.manifest_path)`로 manifest source를 결정한다.
6. `metadata`에는 validation의 `branch`, `source_type`, `validation_mode`, `validated_resource_count`, `validation_warnings`를 병합한다. `deploy_policy`에는 `manifest_source`, `validation_mode`를 병합한다. `settings.source_type`에도 같은 값을 넣어 watch target → github poller → webhook → git-pull → manifest-render 경로에서 선택한 렌더러가 유지되게 한다.
7. `payload.token`이 있으면 `store_repo_token_if_present`가 workspace credential vault에 encrypted value를 upsert하고 body에는 `credential_ref`만 넣는다. DB 파사드에 `upsert_workspace_credential`이 없으면 저장은 건너뛰지만 ref는 동일하게 반환한다.
8. `unit_of_work_or_null(db)` 안에서 `db.register_repository(body)` → `db.upsert_application(body)` → 최신 application 조회 → `db.register_watch_target(binding_body)` → `db.register_deployment_binding(binding_body)` 순서로 app/watch/binding을 함께 등록한다.
9. 반환은 `ApplicationResponse(application=application)`이다.

### deployment binding 업서트 (`POST /applications/{application_id}/deployments`)

1. application `APPLICATION_MANAGE` 권한 검사. `payload.cluster_id != GLOBAL_CLUSTER_SELECTOR`면 대상 cluster `DEPLOY_RUN` 권한 검사 (`require_cluster_access(db, current, workspace_id, payload.cluster_id, Permission.DEPLOY_RUN.value)`).
2. `get_application_or_404`로 애플리케이션 로드.
3. body = `payload.model_dump()` + `workspace_id` + `user_id` + 애플리케이션에서 상속한 `repository_id=application["repository_id"]`, `app_name=application["name"]`, `manifest_path=payload.manifest_path or application["manifest_path"]`.
4. **글로벌 서비스** — `payload.cluster_id == GLOBAL_CLUSTER_SELECTOR`(`"*"`)면:
   - `db.list_cluster_registrations(workspace_id)`로 등록 클러스터 목록 조회. 비어 있으면 422 `NO_CLUSTERS_FOR_GLOBAL_BINDING`.
   - 전 대상 클러스터에 `DEPLOY_RUN` 권한을 **먼저** 검증 — 하나라도 없으면 아무것도 만들지 않음.
   - 전 대상 클러스터의 agent connection_status를 검사한다. 연결 안 된 대상이 하나라도 있으면 400 `cluster_not_connected`와 `clusters` 실패 목록을 반환하고 아무 바인딩도 만들지 않는다.
   - 클러스터별로 `db.register_deployment_binding({**body, "cluster_id": <cluster>, "deploy_policy": {**payload.deploy_policy, GLOBAL_BINDING_KEY: True}})` 확장 생성. 각 바인딩에 `deploy_policy.global`이 남아 (a) webhook fan-out 대상이 되고 (b) 신규 클러스터 등록 시 workflow-controller가 자동 합류시킨다.
   - 첫 번째 stored 바인딩으로 `DeploymentBindingResponse` 반환.
5. 일반 경로: `require_connected_clusters(db, workspace_id, [payload.cluster_id])` 통과 후 `stored = db.register_deployment_binding(body)` → `DeploymentBindingResponse(deployment=stored)`.

### 목록 조회 (`GET /applications`)

`accessible_ids = db.accessible_resource_ids(...)` → `db.list_applications(workspace_id, application_ids=accessible_ids, limit=limit)` — 권한 필터를 리포지토리 쿼리에 위임.

## 불변식·오류 (Invariants & Errors)

- 존재하지 않는 애플리케이션 → HTTP 404 `"application not found"`.
- `/applications/connect` manifest validation 실패 → HTTP 422 `"manifest validation failed"` 또는 discovery validation의 첫 번째 error.
- `/applications/connect` 또는 deployment binding 생성 대상 cluster-agent가 online이 아니면 HTTP 400 `{"code":"cluster_not_connected","detail":"에이전트가 연결되지 않은 클러스터입니다","clusters":["cluster-id"]}`. 글로벌/다중 대상이면 실패 클러스터 목록 전체를 포함한다.
- 권한 부족 → identity 의존성이 던지는 HTTPException ([identity](./identity.md)).
- repo 등록과 애플리케이션 업서트는 같은 트랜잭션(`unit_of_work_or_null`) — 부분 실패 시 둘 다 롤백.
- `/applications/connect`는 repo/app/watch/deployment binding 등록을 같은 트랜잭션에서 처리한다.
- `/applications/connect`의 `token` 원문은 application/repository body나 응답에 싣지 않고, 있으면 encrypted workspace credential로 저장한 뒤 `credential_ref`만 전달한다.
- `/applications/connect`에서 검증한 `source_type`은 application metadata, binding deploy_policy(`manifest_source`), watch target settings 모두에 남아야 한다. validate 단계와 실제 render-worker 단계가 다른 렌더러를 쓰면 안 된다.
- binding의 `repository_id`/`app_name`은 항상 소속 애플리케이션에서 파생(클라이언트 입력을 신뢰하지 않음).
- 글로벌 바인딩(`cluster_id="*"`)은 권한 전수 검증 후에만 확장 생성 — 부분 권한으로는 아무 바인딩도 생기지 않는다. 등록 클러스터가 없으면 422 `"no registered clusters to expand global binding"`.

## 설정 (Settings)

없음.
