---
source_commit: 30465d0c4
status: synced
---

# catalog — 서비스 카탈로그 (아이템/버전, 부트스트랩 카탈로그 포함)

> 소스: `src/domains/catalog/` · 테스트: `tests/test_catalog_domain.py`

## 책임 (Responsibility)

- 서비스 카탈로그 아이템(`catalog_items`)·버전(`catalog_item_versions`) 테이블과 리포지토리를 소유한다.
- 코드에 내장된 부트스트랩 카탈로그(`BOOTSTRAP_CATALOG_ITEMS` 4종)를 DB 미적재 시 폴백으로 노출한다.
- 카탈로그 목록/상세 조회 API를 제공한다.
- 서버 소유 PostgreSQL/Redis Helm recipe만 online target Agent의 실제 command queue로 전달한다.
- 설치 요청의 이름/values/idempotency를 검증하고 실제 `command_id`를 202로 반환한다. 실행 결과는 기존 `/commands/{command_id}`에서 조회한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection`, `iso_or_none` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `JsonObject`, `DEFAULT_WORKSPACE_ID`, gateway routes/요청·응답 모델, `Permission` |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `get_db` |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session`, `require_cluster_access` |
| import | `domains.command` | [./command.md](./command.md) | command lease/retry 상수와 기존 `agent_commands` queue |
| import | `domains.target` | [./target.md](./target.md) | online Agent 판정과 management readonly guard |

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
| `catalog-postgresql` | `postgresql` | PostgreSQL | database | helm | `oci://registry-1.docker.io/bitnamicharts/postgresql` | chart `18.7.13`, chart/image digest 고정 | `auth.database`, `primary.persistence.storageClass`(required string), `primary.persistence.size`(string, default `"8Gi"`) |
| `catalog-redis` | `redis` | Redis | database | helm | `oci://registry-1.docker.io/bitnamicharts/redis` | chart `23.1.1`, chart/image digest 고정, standalone 강제 | `master.persistence.storageClass`(required string), `master.persistence.size`(string, default `"8Gi"`) |
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

### 설치 계약 — `src/domains/catalog/install.py`

- `server_helm_recipe(item_id, version)`은 코드에 동봉된 bootstrap Helm recipe만 반환한다. DB 저장 recipe나 요청 URL을 실행 대상으로 승격하지 않는다.
- `CatalogHelmInstallPayload`에는 item/version, namespace, application/release 이름, 선언된 values만 있다. chart ref/digest는 Agent가 같은 서버 recipe에서 다시 해석한다.
- application/namespace는 DNS label(최대 63), Helm release는 최대 53자로 검증한다.
- `validate_catalog_values`는 schema `properties` 밖 필드, `required` 누락, 타입/enum/StorageClass DNS 이름 불일치를 거부한다.
- server recipe의 `fixed_values`는 사용자 values 병합 뒤에 적용된다. PostgreSQL/Redis 컨테이너 이미지는 서버 소유 digest로 고정되며 사용자가 `latest`나 다른 repository로 덮어쓸 수 없다.
- StorageClass는 클러스터마다 다르므로 코드에 특정 provider 값을 하드코딩하지 않는다. API 호출자가 카탈로그 schema에 선언된 필드로 명시해야 하며 누락 시 실행 전에 422로 거부한다.

### 라우터 — `src/domains/catalog/router.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` | `src/domains/catalog/router.py :: router` |
| `HTTP_NOT_FOUND` | `404` | `src/domains/catalog/router.py :: HTTP_NOT_FOUND` |
| `CATALOG_ITEM_NOT_FOUND` | `"catalog item not found"` | `src/domains/catalog/router.py :: CATALOG_ITEM_NOT_FOUND` |
| `catalog_item_or_404` | `def catalog_item_or_404(db: Any, item_id: str) -> dict[str, Any]` | `src/domains/catalog/router.py :: catalog_item_or_404` |
| `catalog_version_or_default` | `def catalog_version_or_default(item: dict[str, Any], version: str \| None) -> dict[str, Any]` — `version or item["default_version"]`과 일치하는 버전 dict, 없으면 404 `"catalog item version not found"` | `src/domains/catalog/router.py :: catalog_version_or_default` |
| `CLUSTER_NOT_CONNECTED` | HTTP 400 `code="cluster_not_connected"` | `src/domains/catalog/router.py :: CLUSTER_NOT_CONNECTED` |
| `CATALOG_INSTALL_COMMAND_PRIORITY` | `100` (기존 high-priority Agent queue와 동일) | `src/domains/catalog/router.py :: CATALOG_INSTALL_COMMAND_PRIORITY` |

#### 엔드포인트

| 메서드+경로 | 핸들러(앵커) | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| `GET /catalog/items` (`gateway_routes.CATALOG_ITEMS_PATH`) | `src/domains/catalog/router.py :: list_catalog_items` | — | `CatalogItemListResponse` | `require_session` (추가 권한 없음) |
| `GET /catalog/items/{item_id}` (`CATALOG_ITEM_PATH`) | `src/domains/catalog/router.py :: get_catalog_item` | — | `CatalogItemResponse` | `require_session` |
| `POST /catalog/items/{item_id}/installs` (`CATALOG_ITEM_INSTALLS_PATH`) | `src/domains/catalog/router.py :: install_catalog_item` | `CatalogInstallRequest` + 필수 `Idempotency-Key` header | HTTP 202 `CatalogInstallAcceptedResponse(command_id, correlation_id, status)` | `require_session` + 대상 cluster `Permission.DEPLOY_RUN` (`require_cluster_access`) |

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

### 실제 설치 요청 (`POST /catalog/items/{item_id}/installs`)

1. `catalog_item_or_404(db, item_id)` — item_id 또는 slug 매칭(저장 → 부트스트랩 순).
2. `catalog_version_or_default(item, payload.version)` — 지정 버전 또는 default_version.
3. `DEPLOY_RUN` 권한 확인 후 registration/policy 어느 쪽이든 management role이면 HTTP 400 `management_readonly`.
4. 최근 heartbeat가 online이고 `command_receiver` + `catalog_helm_install` capability를 광고하는 Agent가 없으면 HTTP 400 `cluster_not_connected` 또는 `catalog_install_runner_unavailable`.
5. 설치 범위는 sandbox와 코드 동봉 Helm recipe 2종뿐이다. 사용자 shell/manifest/chart URL 및 template recipe는 거부한다.
6. 이름과 values를 검증하고 `workspace_id + requested_by + Idempotency-Key`로 결정적 command/correlation ID를 만든다.
7. 기존 `queue_agent_command`의 PK conflict 멱등성을 사용한다. 같은 key+payload는 같은 command를 반환하고, 다른 payload 재사용은 HTTP 409 `idempotency_key_reused`.
8. HTTP 202는 queue 수락만 뜻한다. Agent의 Helm 성공/실패는 기존 `GET /commands/{command_id}`의 status/result로 조회한다.

### 부트스트랩 병합 규칙

- 목록: DB에 이미 있는 `item_id`는 부트스트랩에서 제외(DB 우선), 부트스트랩 아이템은 `versions` 없이 병합.
- 상세: DB 아이템이어도 저장된 active 버전이 0개면 부트스트랩 버전으로 폴백.

## 불변식·오류 (Invariants & Errors)

- 조회는 항상 `status = 'active'` 필터.
- `(item_id, version)` 유일, `slug` 유일.
- 부트스트랩 버전의 `version_id`는 결정적 해시(`catalog_item_version_id`) — 재계산해도 동일.
- 미존재 아이템 → 404 `"catalog item not found"`, 미존재 버전 → 404 `"catalog item version not found"`.
- HTTP 202를 설치 완료로 해석하지 않는다. `completed`는 Agent subprocess return code 0일 때만 기록한다.
- Agent는 digest-qualified chart, 명시 argv, `shell=False`, Helm 300초/프로세스 330초 timeout, private values 파일을 사용하며 stdout/stderr와 credential env를 결과에 싣지 않는다.
- generic queued TTL/janitor 계약은 이 구현에서 변경하지 않았다. 카탈로그는 기존 command repository/상태 수명주기를 그대로 사용한다.

## 설정 (Settings)

없음.
