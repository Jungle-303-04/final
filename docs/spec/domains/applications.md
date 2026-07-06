---
source_commit: 664925a6
status: synced
---

# applications — 애플리케이션·deployment binding·워크플로 런 조회 HTTP API

> 소스: `src/domains/applications/` · 테스트: `tests/test_applications_router.py`, `tests/test_promotion_and_global.py`

## 책임 (Responsibility)

- 애플리케이션 목록/조회/업서트, 애플리케이션별 deployment binding 목록/업서트, 애플리케이션별 workflow run 목록 HTTP API를 제공한다.
- 이 도메인은 라우터만 소유한다 — 테이블·리포지토리·이벤트 없음. 저장은 다른 도메인 리포지토리 메서드(`db.get_application`, `db.upsert_application`, `db.register_repository`, `db.register_deployment_binding`, `db.list_application_deployment_bindings`, `db.list_application_workflow_runs`, `db.list_cluster_registrations`)를 합성 `Database`([registry](./registry.md)) 경유로 호출한다.
- 파일 구성: `__init__.py`(docstring `"애플리케이션 관리 도메인"`), `router.py` 뿐.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session`, `require_resource_access`, `require_cluster_access` |
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
| `require_application_access` | `def require_application_access(db: Any, current: Any, workspace_id: str, application_id: str, permission: str) -> None` — `require_resource_access(db, current, workspace_id, AccessResourceType.APPLICATION.value, application_id, permission)` 위임 | `src/domains/applications/router.py :: require_application_access` |
| `get_application_or_404` | `def get_application_or_404(db: Any, workspace_id: str, application_id: str) -> dict[str, Any]` — `db.get_application` None이면 404 | `src/domains/applications/router.py :: get_application_or_404` |

### 엔드포인트

모든 핸들러는 `workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)`를 사용한다.

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `GET /applications` (`gateway_routes.APPLICATIONS_PATH`) | `src/domains/applications/router.py :: list_applications` | query `limit: int = 100 (ge=1, le=500)` | `ApplicationListResponse` | `require_session` + `db.accessible_resource_ids(user_id, workspace_id, APPLICATION, Permission.APPLICATION_READ)`로 접근 가능한 ID만 조회 |
| `POST /applications` (`APPLICATIONS_PATH`) | `src/domains/applications/router.py :: upsert_application` | `ApplicationUpsertRequest` | `ApplicationResponse` | `require_session` |
| `GET /applications/{application_id}` (`APPLICATION_PATH`) | `src/domains/applications/router.py :: get_application` | — | `ApplicationResponse` | `require_session` + `Permission.APPLICATION_READ` (resource access) |
| `GET /applications/{application_id}/deployments` (`APPLICATION_DEPLOYMENTS_PATH`) | `src/domains/applications/router.py :: list_application_deployments` | query `limit: int = 100 (ge=1, le=500)` | `DeploymentBindingListResponse` | `require_session` + `Permission.DEPLOYMENT_READ` |
| `POST /applications/{application_id}/deployments` (`APPLICATION_DEPLOYMENTS_PATH`) | `src/domains/applications/router.py :: upsert_application_deployment` | `DeploymentBindingUpsertRequest` | `DeploymentBindingResponse` | `require_session` + application `Permission.APPLICATION_MANAGE` + cluster `Permission.DEPLOY_RUN` (cluster_id `"*"`면 등록된 **모든** 클러스터에 대해 검사) |
| `GET /applications/{application_id}/runs` (`APPLICATION_RUNS_PATH`) | `src/domains/applications/router.py :: list_application_runs` | query `limit: int = 100 (ge=1, le=500)` | `WorkflowRunListResponse` | `require_session` + `Permission.DEPLOYMENT_READ` |

요청·응답 모델은 [contracts](../packages/contracts.md)의 `packages/contracts/gateway/requests.py` / `responses.py` 정의를 사용한다.

## 데이터 모델 (Data Model)

없음 (이 도메인은 테이블을 소유하지 않는다). 애플리케이션/binding/run read model은 소유 도메인 스펙 참조.

## 이벤트 (Events)

없음 (발행·구독 모두 없음).

## 동작 (Behavior)

### 애플리케이션 업서트 (`POST /applications`)

1. body = `payload.model_dump()` + `workspace_id` + `user_id=current.user_id`.
2. `unit_of_work_or_null(db)` 트랜잭션 안에서: `payload.repo_ref`가 truthy면 `db.register_repository(body)` 선행 → `stored = db.upsert_application(body)`.
3. `db.get_application(workspace_id, stored["application_id"]) or stored`를 `ApplicationResponse(application=...)`로 반환 (저장 직후 최신 뷰 재조회).

### deployment binding 업서트 (`POST /applications/{application_id}/deployments`)

1. application `APPLICATION_MANAGE` 권한 검사. `payload.cluster_id != GLOBAL_CLUSTER_SELECTOR`면 대상 cluster `DEPLOY_RUN` 권한 검사 (`require_cluster_access(db, current, workspace_id, payload.cluster_id, Permission.DEPLOY_RUN.value)`).
2. `get_application_or_404`로 애플리케이션 로드.
3. body = `payload.model_dump()` + `workspace_id` + `user_id` + 애플리케이션에서 상속한 `repository_id=application["repository_id"]`, `app_name=application["name"]`, `manifest_path=payload.manifest_path or application["manifest_path"]`.
4. **글로벌 서비스** — `payload.cluster_id == GLOBAL_CLUSTER_SELECTOR`(`"*"`)면:
   - `db.list_cluster_registrations(workspace_id)`로 등록 클러스터 목록 조회. 비어 있으면 422 `NO_CLUSTERS_FOR_GLOBAL_BINDING`.
   - 전 대상 클러스터에 `DEPLOY_RUN` 권한을 **먼저** 검증 — 하나라도 없으면 아무것도 만들지 않음.
   - 클러스터별로 `db.register_deployment_binding({**body, "cluster_id": <cluster>, "deploy_policy": {**payload.deploy_policy, GLOBAL_BINDING_KEY: True}})` 확장 생성. 각 바인딩에 `deploy_policy.global`이 남아 (a) webhook fan-out 대상이 되고 (b) 신규 클러스터 등록 시 workflow-controller가 자동 합류시킨다.
   - 첫 번째 stored 바인딩으로 `DeploymentBindingResponse` 반환.
5. 일반 경로: `stored = db.register_deployment_binding(body)` → `DeploymentBindingResponse(deployment=stored)`.

### 목록 조회 (`GET /applications`)

`accessible_ids = db.accessible_resource_ids(...)` → `db.list_applications(workspace_id, application_ids=accessible_ids, limit=limit)` — 권한 필터를 리포지토리 쿼리에 위임.

## 불변식·오류 (Invariants & Errors)

- 존재하지 않는 애플리케이션 → HTTP 404 `"application not found"`.
- 권한 부족 → identity 의존성이 던지는 HTTPException ([identity](./identity.md)).
- repo 등록과 애플리케이션 업서트는 같은 트랜잭션(`unit_of_work_or_null`) — 부분 실패 시 둘 다 롤백.
- binding의 `repository_id`/`app_name`은 항상 소속 애플리케이션에서 파생(클라이언트 입력을 신뢰하지 않음).
- 글로벌 바인딩(`cluster_id="*"`)은 권한 전수 검증 후에만 확장 생성 — 부분 권한으로는 아무 바인딩도 생기지 않는다. 등록 클러스터가 없으면 422 `"no registered clusters to expand global binding"`.

## 설정 (Settings)

없음.
