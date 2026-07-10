---
source_commit: 1616d295
status: synced
---

# catalog — 서비스 카탈로그 (아이템/버전, 부트스트랩 카탈로그 포함)

> 소스: `src/domains/catalog/` · 테스트: `tests/test_catalog_domain.py`

## 책임 (Responsibility)

- 서비스 카탈로그 아이템(`catalog_items`)·버전(`catalog_item_versions`) 테이블과 리포지토리를 소유한다.
- 코드에 내장된 부트스트랩 카탈로그(`BOOTSTRAP_CATALOG_ITEMS` 4종)를 DB 미적재 시 폴백으로 노출한다.
- 카탈로그 목록/상세 조회 API를 제공한다.
- 실제 설치 runner가 없으므로 설치 API는 성공을 가장하지 않고 명시적인 `501 catalog_install_runner_unavailable`로 실패한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection`, `iso_or_none` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `JsonObject`, `DEFAULT_WORKSPACE_ID`, gateway routes/요청·응답 모델, `Permission` |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `get_db` |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session`, `require_cluster_access` |

## 공개 인터페이스 (Public API)

### 상수·헬퍼 — `src/domains/catalog/repository.py`

| 심볼 | 값/시그니처 | 앵커 |
|---|---|---|
| `CATALOG_STATUS_ACTIVE` | `"active"` | `src/domains/catalog/repository.py :: CATALOG_STATUS_ACTIVE` |
| `DEFAULT_CATALOG_VERSION` | `"1.0.0"` | `src/domains/catalog/repository.py :: DEFAULT_CATALOG_VERSION` |
| `BOOTSTRAP_CATALOG_ITEMS` | `tuple[JsonObject, ...]` — 아래 부트스트랩 표 | `src/domains/catalog/repository.py :: BOOTSTRAP_CATALOG_ITEMS` |
| `catalog_item_version_id` | `def catalog_item_version_id(item_id: str, version: str) -> str` — `f"catalog-version-{sha256(f'{item_id}\|{version}').hexdigest()[:32]}"` | `src/domains/catalog/repository.py :: catalog_item_version_id` |
| `item_without_versions` | `def item_without_versions(item: JsonObject) -> JsonObject` — `versions` 키 제거 사본 | `src/domains/catalog/repository.py :: item_without_versions` |
| `serialize_catalog_item` | `def serialize_catalog_item(row: Any) -> JsonObject` — metadata dict화, created_at/updated_at `iso_or_none` | `src/domains/catalog/repository.py :: serialize_catalog_item` |
| `serialize_catalog_version` | `def serialize_catalog_version(row: Any) -> JsonObject` — values_schema/template dict화 + 시각 ISO | `src/domains/catalog/repository.py :: serialize_catalog_version` |

#### 부트스트랩 카탈로그 (`BOOTSTRAP_CATALOG_ITEMS`, 4종 — 모두 status `active`, default_version `1.0.0`, 버전 1개씩)

| item_id | slug | name | category | package_type | package_ref | template | values_schema properties |
|---|---|---|---|---|---|---|---|
| `catalog-postgresql` | `postgresql` | PostgreSQL | database | helm | `oci://registry-1.docker.io/bitnamicharts/postgresql` | `{"runner": "helm", "release": "postgresql"}` | `auth.database`(string), `primary.persistence.size`(string, default `"8Gi"`) |
| `catalog-redis` | `redis` | Redis | database | helm | `oci://registry-1.docker.io/bitnamicharts/redis` | `{"runner": "helm", "release": "redis"}` | (없음) |
| `catalog-fastapi-template` | `fastapi-template` | FastAPI Service | application | template | `builtin://templates/fastapi` | `{"runner": "manifest-renderer", "kind": "Deployment"}` | `image`(string), `replicas`(integer) |
| `catalog-nextjs-template` | `nextjs-template` | Next.js Web App | application | template | `builtin://templates/nextjs` | `{"runner": "manifest-renderer", "kind": "Deployment"}` | `image`(string), `replicas`(integer) |

metadata.tags: postgresql `["database","sql","stateful"]`, redis `["cache","key-value"]`, fastapi `["python","api","template"]`, nextjs `["node","frontend","template"]`. description: `"Stateful PostgreSQL database recipe for Kubernetes."`, `"Redis cache recipe for Kubernetes."`, `"Python FastAPI application scaffold recipe."`, `"Next.js web application scaffold recipe."`.

### 리포지토리 — `class CatalogRepository(DatabaseConnection)` (`src/domains/catalog/repository.py :: CatalogRepository`)

| 메서드 | 시그니처 | 쿼리 의미 |
|---|---|---|
| `list_catalog_items` | `(self) -> list[JsonObject]` | `status='active'`인 저장 아이템 전체 SELECT(`ORDER BY category, name`) + DB에 없는 부트스트랩 아이템(`versions` 제외)을 합쳐 `(category, name)` 정렬로 반환 |
| `get_catalog_item` | `(self, item_id_or_slug: str) -> JsonObject \| None` | 저장 아이템(`item_id` 또는 `slug` 일치, active) 우선, 없으면 부트스트랩 폴백. `versions` = `list_catalog_item_versions(item_id)`가 비면 부트스트랩 버전(`version_id`는 `catalog_item_version_id`로 합성) 사용. `{**item, "versions": versions}` 반환 |
| `list_catalog_item_versions` | `(self, item_id: str) -> list[JsonObject]` | `catalog_item_versions WHERE item_id=? AND status='active' ORDER BY version` |

내부 헬퍼(비공개): `_stored_catalog_item`, `_bootstrap_catalog_item`, `_bootstrap_catalog_versions`.

### 라우터 — `src/domains/catalog/router.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` | `src/domains/catalog/router.py :: router` |
| `HTTP_NOT_FOUND` | `404` | `src/domains/catalog/router.py :: HTTP_NOT_FOUND` |
| `CATALOG_ITEM_NOT_FOUND` | `"catalog item not found"` | `src/domains/catalog/router.py :: CATALOG_ITEM_NOT_FOUND` |
| `catalog_item_or_404` | `def catalog_item_or_404(db: Any, item_id: str) -> dict[str, Any]` | `src/domains/catalog/router.py :: catalog_item_or_404` |
| `catalog_version_or_default` | `def catalog_version_or_default(item: dict[str, Any], version: str \| None) -> dict[str, Any]` — `version or item["default_version"]`과 일치하는 버전 dict, 없으면 404 `"catalog item version not found"` | `src/domains/catalog/router.py :: catalog_version_or_default` |
| `CATALOG_INSTALL_RUNNER_UNAVAILABLE` | `{"code": "catalog_install_runner_unavailable", "detail": "설치 실행기가 연결되지 않아 카탈로그 설치를 시작할 수 없습니다."}` | `src/domains/catalog/router.py :: CATALOG_INSTALL_RUNNER_UNAVAILABLE` |

#### 엔드포인트

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `GET /catalog/items` (`gateway_routes.CATALOG_ITEMS_PATH`) | `src/domains/catalog/router.py :: list_catalog_items` | — | `CatalogItemListResponse` | `require_session` (추가 권한 없음) |
| `GET /catalog/items/{item_id}` (`CATALOG_ITEM_PATH`) | `src/domains/catalog/router.py :: get_catalog_item` | — | `CatalogItemResponse` | `require_session` |
| `POST /catalog/items/{item_id}/installs` (`CATALOG_ITEM_INSTALLS_PATH`) | `src/domains/catalog/router.py :: install_catalog_item` | `CatalogInstallRequest` | 현재 항상 501 | `require_session` + 대상 cluster `Permission.DEPLOY_RUN` (`require_cluster_access`) |

## 데이터 모델 (Data Model)

### `catalog_items` — `src/domains/catalog/models.py :: CatalogItemRecord`

`__table_args__ = (UniqueConstraint("slug"),)`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| item_id | Text | PK | 예: `catalog-postgresql` |
| slug | Text | NOT NULL, UNIQUE | URL 친화 식별자 |
| name | Text | NOT NULL | 표시 이름 |
| category | Text | NOT NULL | `database` / `application` 등 |
| description | Text | NOT NULL | 설명 |
| default_version | Text | NOT NULL | 기본 설치 버전 |
| status | Text | NOT NULL | `active`만 조회 대상 |
| metadata_ | JSONB | NOT NULL, DB 컬럼명 `metadata` | 태그 등 |
| created_at / updated_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 시각 |

### `catalog_item_versions` — `src/domains/catalog/models.py :: CatalogItemVersionRecord`

`__table_args__ = (UniqueConstraint("item_id", "version"),)`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| version_id | Text | PK | `catalog-version-<sha256(item_id\|version)[:32]>` |
| item_id | Text | NOT NULL, UNIQUE(item_id, version) | 소속 아이템 (FK 제약은 선언 안 함) |
| version | Text | NOT NULL | semver 문자열 |
| package_type | Text | NOT NULL | `helm` / `template` |
| package_ref | Text | NOT NULL | 차트/템플릿 참조 URI |
| values_schema | JSONB | NOT NULL | JSON Schema |
| template | JSONB | NOT NULL | 러너 지시 (`runner` 등) |
| status | Text | NOT NULL | `active`만 조회 대상 |
| created_at / updated_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 시각 |

## 이벤트 (Events)

없음.

## 동작 (Behavior)

### 설치 요청 차단 (`POST /catalog/items/{item_id}/installs`)

1. `catalog_item_or_404(db, item_id)` — item_id 또는 slug 매칭(저장 → 부트스트랩 순).
2. `catalog_version_or_default(item, payload.version)` — 지정 버전 또는 default_version.
3. `require_cluster_access(db, current, workspace_id, payload.cluster_id, Permission.DEPLOY_RUN.value)`.
4. 실제 설치 runner가 연결되지 않았으므로 501과 `catalog_install_runner_unavailable`을 반환한다.
5. DB 행이나 이벤트를 만들지 않는다. 성공 응답은 runner·승인·상태 projection이 실제 구현된 뒤에만 복원한다.

### 부트스트랩 병합 규칙

- 목록: DB에 이미 있는 `item_id`는 부트스트랩에서 제외(DB 우선), 부트스트랩 아이템은 `versions` 없이 병합.
- 상세: DB 아이템이어도 저장된 active 버전이 0개면 부트스트랩 버전으로 폴백.

## 불변식·오류 (Invariants & Errors)

- 조회는 항상 `status = 'active'` 필터.
- `(item_id, version)` 유일, `slug` 유일.
- 부트스트랩 버전의 `version_id`는 결정적 해시(`catalog_item_version_id`) — 재계산해도 동일.
- 미존재 아이템 → 404 `"catalog item not found"`, 미존재 버전 → 404 `"catalog item version not found"`.
- 설치 실행기가 없는 상태에서 `planned` 행만 기록하는 성공 응답은 금지한다.

## 설정 (Settings)

없음.
