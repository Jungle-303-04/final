---
source_commit: 664925a6
status: synced
---

# identity — 로그인·세션·인가 가드 및 조직/그룹/리소스 접근 제어

> 소스: `src/domains/identity/` · 테스트: `tests/test_identity_repository.py`, `tests/test_identity_dependencies.py`, `tests/test_identity_auth_routes.py`, `tests/test_admin_console_routes.py`, `tests/test_auth_security.py`

## 책임 (Responsibility)

- **한다**:
  - 자체 계정(이메일+비밀번호) 회원가입/로그인/로그아웃/이메일 인증/사용자 승인 HTTP 경계 제공 (`router.py`).
  - 세션 쿠키(httpOnly) 발급·삭제. 토큰을 JSON 응답으로 반환하지 않는다.
  - 관리 콘솔용 조직·그룹·멤버·리소스 권한 조회/편집 HTTP 경계 제공 (`admin_router.py`).
  - 사용자·워크스페이스·조직·그룹·리소스 배정·역할-권한 매핑의 저장소(`repository.py`)와 테이블 정의(`models.py`).
  - FastAPI `Depends` 로 선언 적용하는 인가 가드(세션 가드, admin 가드, 리소스 접근 필터 체인, per-cluster agent 토큰 가드) 제공 (`dependencies.py`).
- **하지 않는다**:
  - 비밀번호 해시·세션 토큰 발급 자체 로직 — `request.app.state.password_auth` / `request.app.state.auth` 로 주입된 서비스 객체에 위임한다 ([security 패키지](../packages/security.md) 참조).
  - 이메일 발송 — 이벤트(`mail.email_verification.requested`)만 발행하고 실제 발송은 [mail 도메인](./mail.md)이 담당.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.contracts.identity` | [contracts](../packages/contracts.md) | 역할/권한/상태 enum, 기본 ID 상수, `ResourceAccessRequest`, `RESOURCE_ROLE_PERMISSIONS`, `DEFAULT_ROLE_PERMISSION_ROWS` |
| import | `packages.contracts.gateway` (`routes`, `requests`, `responses`, `base.StrictModel`) | [contracts](../packages/contracts.md) | 라우트 경로 상수, 요청/응답 Pydantic 모델 |
| import | `packages.contracts.event_bus.interfaces.JsonObject` | [contracts](../packages/contracts.md) | 저장소 반환 타입 |
| import | `packages.storage.base` (`Base`, 컬럼 헬퍼), `packages.storage.engine` (`DatabaseConnection`, `iso_or_none`) | [storage](../packages/storage.md) | SQLAlchemy 테이블 정의·DB 커넥션·직렬화 |
| import | `packages.config.constants.Auth`, `packages.config.settings.env` | [config](../packages/config.md) | 세션 쿠키 이름/TTL/Secure 설정, 환경변수 조회 |
| import | `packages.runtime.dependencies` (`get_events`, `get_db`) | [runtime](../packages/runtime.md) | FastAPI 의존성 주입(이벤트 버스, DB) |
| import | `domains.mail.events.EmailVerificationRequestedBody` | [mail 도메인](./mail.md) | 이메일 인증 요청 이벤트 body |
| 발행 | `mail.email_verification.requested` | [mail 도메인](./mail.md) | 인증 메일 발송 요청 |
| 외부 | PostgreSQL | — | `pg_insert ... on_conflict_do_update` upsert 기반 저장소 |
| 런타임 주입 | `request.app.state.password_auth`, `request.app.state.auth`, `request.app.state.db` | [security](../packages/security.md), [runtime](../packages/runtime.md) | 비밀번호 인증 서비스, 세션 검증, DB |

## 공개 인터페이스 (Public API)

### `src/domains/identity/router.py` — 인증 라우터

모듈 공개 상수·심볼:

| 심볼 | 값/타입 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` | `src/domains/identity/router.py :: router` |
| `PUBLIC_BASE_URL_ENV` | `"PUBLIC_BASE_URL"` | `src/domains/identity/router.py :: PUBLIC_BASE_URL_ENV` |
| `EMAIL_VERIFICATION_SUCCESS_REDIRECT` | `"/login?verified=1"` | `src/domains/identity/router.py :: EMAIL_VERIFICATION_SUCCESS_REDIRECT` |
| `EMAIL_VERIFICATION_PENDING_APPROVAL_REDIRECT` | `"/login?verified=1&approval=pending"` | `src/domains/identity/router.py :: EMAIL_VERIFICATION_PENDING_APPROVAL_REDIRECT` |
| `TRUST_PROXY_ENV` | `"TRUST_PROXY"` | `src/domains/identity/router.py :: TRUST_PROXY_ENV` |
| `FALSE_COOKIE_SECURE_VALUES` | `{"0", "false", "no", "off"}` — COOKIE_SECURE 비보안(http) 신호로 인정하는 값 집합 | `src/domains/identity/router.py :: FALSE_COOKIE_SECURE_VALUES` |

엔드포인트 (경로 상수는 `packages/contracts/gateway/routes.py` 참조):

| 메서드 | 경로 | 핸들러 앵커 | 요청 모델 | 응답 모델 | 권한(의존성) |
|---|---|---|---|---|---|
| GET | `/auth/session` (`AUTH_SESSION_PATH`) | `src/domains/identity/router.py :: session` | — | `AuthSessionResponse` | `require_session` |
| POST | `/auth/check-email` (`AUTH_CHECK_EMAIL_PATH`) | `src/domains/identity/router.py :: check_email` | `EmailCheckRequest` | `EmailCheckResponse` | 없음(공개) + 이메일/client rate limit |
| POST | `/auth/signup` (`AUTH_SIGNUP_PATH`) | `src/domains/identity/router.py :: signup` | `SignupRequest` | `EmailVerificationResponse` | 없음(공개) + `get_password_auth`, `get_events` |
| POST | `/auth/resend-verification` (`AUTH_RESEND_VERIFICATION_PATH`) | `src/domains/identity/router.py :: resend_verification` | `ResendEmailVerificationRequest` | `EmailVerificationResponse` | 없음(공개) + `get_password_auth`, `get_events` |
| POST | `/auth/login` (`AUTH_LOGIN_PATH`) | `src/domains/identity/router.py :: login` | `LoginRequest` | `AuthSessionResponse` (+ 세션 쿠키 set) | 없음(공개) + `get_password_auth` |
| GET | `/auth/verify-email` (`AUTH_VERIFY_EMAIL_PATH`) | `src/domains/identity/router.py :: verify_email` | 쿼리 `token: str = Query(min_length=1)`, `redirect: str \| None = None` | `RedirectResponse` (303) | 없음(공개) + `get_password_auth` |
| POST | `/auth/users/{user_id}/approve` (`AUTH_APPROVE_USER_PATH`) | `src/domains/identity/router.py :: approve_user` | 경로 `user_id: str` | `UserApprovalResponse` | `require_admin_session` |
| POST | `/auth/logout` (`AUTH_LOGOUT_PATH`) | `src/domains/identity/router.py :: logout` | — | `LogoutResponse` (+ 세션 쿠키 삭제) | `require_session` + `get_password_auth` |

요청/응답 모델 스키마 (정의: `src/packages/contracts/gateway/requests.py`, `src/packages/contracts/gateway/responses.py`):

- `SignupRequest`: `email: str` (패턴 `^[^@\s]+@[^@\s]+\.[^@\s]+$`), `password: str` (min_length=8), `password_confirm: str` (min_length=8)
- `EmailCheckRequest`: `email: str` (동일 패턴). 가입 폼 저장 전 중복 확인 전용.
- `LoginRequest`: `email: str` (동일 패턴), `password: str` (min_length=8)
- `ResendEmailVerificationRequest`: `email: str` (동일 패턴), `password: str` (min_length=8)
- `AuthSessionResponse`: 인증된 세션의 `auth_mode`, 저장소 권위 `groups`·`roles`, 사용자/workspace 신원, raw URL 없는 typed `logout` 의미를 함께 반환한다.
- `EmailCheckResponse`: `available: bool`, `reason_code: str = ""`, `detail: str = ""`, `retry_after: int | None = None`. 중복이면 `available=false`, `reason_code="already_registered"`이고, rate limit은 429 detail에 `code/detail/retry_after`를 담는다.
- `EmailVerificationResponse`: `accepted: bool`, `verification_required: bool`, `email: str | None = None`
- `UserApprovalResponse`: `accepted: bool`, `user_id: str`, `status: str`, `role: str`, `workspace_id: str`
- `LogoutResponse`: `authenticated: bool`

### `src/domains/identity/admin_router.py` — 관리 콘솔 라우터

프론트 웹 콘솔 전용 경계. 쓰기는 admin 세션 필요, workspace 는 세션 신원에서 유도(클라이언트 입력 금지).

모듈 공개 상수·심볼:

| 심볼 | 값/타입 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` | `src/domains/identity/admin_router.py :: router` |
| `HTTP_CONFLICT` | `409` | `src/domains/identity/admin_router.py :: HTTP_CONFLICT` |

요청/응답 모델 (모두 `StrictModel` 상속, 이 모듈에서 정의):

| 모델 | 필드 | 앵커 |
|---|---|---|
| `OrgCreateRequest` | `name: str = Field(min_length=3, max_length=40)`, `description: str = Field(default="", max_length=200)` | `src/domains/identity/admin_router.py :: OrgCreateRequest` |
| `GroupCreateRequest` | `org_id: str = Field(min_length=1)`, `name: str = Field(min_length=1, max_length=60)`, `description: str = Field(default="", max_length=200)` | `src/domains/identity/admin_router.py :: GroupCreateRequest` |
| `AccessGrantRequest` | `subject_type: str = Field(pattern=r"^(user\|group)$")`, `subject_id: str = Field(min_length=1)`, `subject_label: str \| None = None`, `resource_type: str = Field(min_length=1)`, `resource_id: str = Field(min_length=1)`, `role: str = Field(min_length=1)` | `src/domains/identity/admin_router.py :: AccessGrantRequest` |
| `OrgListResponse` | `orgs: list[dict[str, Any]]` | `src/domains/identity/admin_router.py :: OrgListResponse` |
| `OrgResponse` | `org_id: str`, `name: str`, `description: str`, `member_count: int`, `group_count: int`, `created_at: str \| None = None` | `src/domains/identity/admin_router.py :: OrgResponse` |
| `GroupListResponse` | `groups: list[dict[str, Any]]` | `src/domains/identity/admin_router.py :: GroupListResponse` |
| `GroupResponse` | `group_id: str`, `org_id: str`, `name: str`, `member_count: int` | `src/domains/identity/admin_router.py :: GroupResponse` |
| `GroupMembersResponse` | `members: list[dict[str, Any]]` | `src/domains/identity/admin_router.py :: GroupMembersResponse` |
| `UserListResponse` | `users: list[dict[str, Any]]` | `src/domains/identity/admin_router.py :: UserListResponse` |
| `AccessListResponse` | `grants: list[dict[str, Any]]` | `src/domains/identity/admin_router.py :: AccessListResponse` |
| `AccessGrantResponse` | `access_id: str`, `subject_id: str \| None = None`, `subject_type: str`, `subject_label: str`, `resource_type: str`, `resource_id: str`, `role: str`, `granted_at: str \| None = None` | `src/domains/identity/admin_router.py :: AccessGrantResponse` |
| `AcceptedResponse` | `accepted: bool = True` | `src/domains/identity/admin_router.py :: AcceptedResponse` |

엔드포인트:

| 메서드 | 경로 | 핸들러 앵커 | 요청 | 응답 | 권한(의존성) |
|---|---|---|---|---|---|
| GET | `/orgs` (`ORGS_PATH`) | `src/domains/identity/admin_router.py :: list_orgs` | — | `OrgListResponse` | `require_admin_session` + `get_db` |
| POST | `/orgs` (`ORGS_PATH`) | `src/domains/identity/admin_router.py :: create_org` | `OrgCreateRequest` | `OrgResponse` | `require_admin_session` + `get_db` |
| DELETE | `/orgs/{org_id}` (`ORG_PATH`) | `src/domains/identity/admin_router.py :: delete_org` | 경로 `org_id: str` | 204 (본문 없음) / 409 `groups_exist` | `require_admin_session` + `get_db` |
| GET | `/groups` (`GROUPS_PATH`) | `src/domains/identity/admin_router.py :: list_groups` | 쿼리 `org_id: str \| None = None` | `GroupListResponse` | `require_admin_session` + `get_db` |
| POST | `/groups` (`GROUPS_PATH`) | `src/domains/identity/admin_router.py :: create_group` | `GroupCreateRequest` | `GroupResponse` | `require_admin_session` + `get_db` |
| GET | `/groups/{group_id}/members` (`GROUP_MEMBERS_PATH`) | `src/domains/identity/admin_router.py :: list_group_members` | 경로 `group_id: str` | `GroupMembersResponse` | `require_admin_session` + `get_db` |
| PUT | `/groups/{group_id}/members/{user_id}` (`GROUP_MEMBER_PATH`) | `src/domains/identity/admin_router.py :: add_group_member` | 경로 `group_id`, `user_id` | `AcceptedResponse` | `require_admin_session` + `get_db` |
| DELETE | `/groups/{group_id}/members/{user_id}` (`GROUP_MEMBER_PATH`) | `src/domains/identity/admin_router.py :: remove_group_member` | 경로 `group_id`, `user_id` | 204 | `require_admin_session` + `get_db` |
| GET | `/users` (`USERS_PATH`) | `src/domains/identity/admin_router.py :: list_users` | 쿼리 `status: str \| None = None` | `UserListResponse` | `require_admin_session` + `get_db` |
| GET | `/access` (`ACCESS_PATH`) | `src/domains/identity/admin_router.py :: list_access` | 쿼리 `resource_id: str \| None = None` | `AccessListResponse` | **`require_session`** (admin 아님) + `get_db` |
| POST | `/access` (`ACCESS_PATH`) | `src/domains/identity/admin_router.py :: grant_access` | `AccessGrantRequest` | `AccessGrantResponse` | `require_admin_session` + `get_db` |
| DELETE | `/access/{access_id}` (`ACCESS_ITEM_PATH`) | `src/domains/identity/admin_router.py :: revoke_access` | 경로 `access_id: str` | 204 | `require_admin_session` + `get_db` |

### `src/domains/identity/dependencies.py` — 인가 가드

모듈 공개 상수:

| 심볼 | 값 | 앵커 |
|---|---|---|
| `AGENT_TOKEN_HEADER` | `"x-agent-token"` | `src/domains/identity/dependencies.py :: AGENT_TOKEN_HEADER` |
| `AGENT_AUTH_REQUIRED_MESSAGE` | `"agent authentication required"` | `src/domains/identity/dependencies.py :: AGENT_AUTH_REQUIRED_MESSAGE` |
| `ADMIN_AUTH_REQUIRED_MESSAGE` | `"service admin role required"` | `src/domains/identity/dependencies.py :: ADMIN_AUTH_REQUIRED_MESSAGE` |
| `RESOURCE_ACCESS_DENIED_MESSAGE` | `"resource access denied"` | `src/domains/identity/dependencies.py :: RESOURCE_ACCESS_DENIED_MESSAGE` |
| `DEFAULT_RESOURCE_ACCESS_FILTER_CHAIN` | `ResourceAccessFilterChain(filters=(StructuredResourceAccessFilter(),))` | `src/domains/identity/dependencies.py :: DEFAULT_RESOURCE_ACCESS_FILTER_CHAIN` |

클래스·함수:

- `hash_agent_token(token: str) -> str` — `src/domains/identity/dependencies.py :: hash_agent_token`
  agent 토큰을 SHA-256 hex 로 변환. 원문은 저장하지 않고 해시만 저장/비교.
- `@dataclass(frozen=True) class ClusterAgentIdentity` — `src/domains/identity/dependencies.py :: ClusterAgentIdentity`
  필드: `workspace_id: str`, `cluster_id: str`. 토큰으로 인증된 agent 의 권위 신원(요청 body 아닌 등록 레지스트리 기준).
- `@dataclass(frozen=True) class ResourceAccessContext` — `src/domains/identity/dependencies.py :: ResourceAccessContext`
  필드: `db: Any`, `current: Any`, `request: ResourceAccessRequest`.
- `class ResourceAccessFilter(Protocol)` — `src/domains/identity/dependencies.py :: ResourceAccessFilter`
  메서드: `authorize(self, context: ResourceAccessContext) -> bool`.
- `class StructuredResourceAccessFilter` — `src/domains/identity/dependencies.py :: StructuredResourceAccessFilter`
  `authorize(self, context: ResourceAccessContext) -> bool`: `context.db.can_access` 가 callable 이면 그것으로 평가, 없으면 `user_has_resource_access` 로 폴백, 둘 다 없으면 `False`.
- `@dataclass(frozen=True) class ResourceAccessFilterChain` — `src/domains/identity/dependencies.py :: ResourceAccessFilterChain`
  필드: `filters: tuple[ResourceAccessFilter, ...]`. `authorize(self, context: ResourceAccessContext) -> bool`: 필터가 비어있으면 `False`(fail-closed), 아니면 전원 통과(all) 시 `True`.
- `get_password_auth(request: Request) -> Any` — `src/domains/identity/dependencies.py :: get_password_auth`
  `request.app.state.password_auth` 반환.
- `async require_session(request: Request) -> Any` — `src/domains/identity/dependencies.py :: require_session`
  `request.app.state.auth.require_session(request)` 위임. 유효 세션 없으면 401.
- `async require_admin_session(request: Request) -> Any` — `src/domains/identity/dependencies.py :: require_admin_session`
  `require_session` 후 `current.roles` 에 `ServiceRole.SERVICE_ADMIN.value`("service_admin") 없으면 `HTTPException(403, ADMIN_AUTH_REQUIRED_MESSAGE)`.
- `require_resource_access(db: Any, current: Any, workspace_id: str, resource_type: str, resource_id: str, action: str, *, detail: str = RESOURCE_ACCESS_DENIED_MESSAGE, filter_chain: ResourceAccessFilterChain = DEFAULT_RESOURCE_ACCESS_FILTER_CHAIN) -> None` — `src/domains/identity/dependencies.py :: require_resource_access`
  `ResourceAccessRequest(user_id=current.user_id, organization_id=workspace_id, resource_type, resource_id, permission=action)` 를 만들어 필터 체인 평가, 실패 시 `HTTPException(403, detail)`.
- `require_cluster_access(db: Any, current: Any, workspace_id: str, cluster_id: str, action: str, *, detail: str = RESOURCE_ACCESS_DENIED_MESSAGE) -> None` — `src/domains/identity/dependencies.py :: require_cluster_access`
  `resource_type=AccessResourceType.CLUSTER.value`("cluster") 로 `require_resource_access` 호출하는 shortcut.
- `require_cluster_agent(request: Request) -> ClusterAgentIdentity` — `src/domains/identity/dependencies.py :: require_cluster_agent`
  `x-agent-token` 헤더를 해시해 `request.app.state.db.authenticate_cluster_agent(...)` 조회. 토큰 없음/미등록/해시 불일치 모두 `HTTPException(401, AGENT_AUTH_REQUIRED_MESSAGE)` (fail-closed).

### `src/domains/identity/repository.py` — 저장소

- `class IdentityAccessRepository(DatabaseConnection)` — `src/domains/identity/repository.py :: IdentityAccessRepository`
- `WorkspaceAccessRepository = IdentityAccessRepository` (하위호환 별칭) — `src/domains/identity/repository.py :: WorkspaceAccessRepository`

클래스 공개 속성: `user_table`, `workspace_table`, `organization_table`, `organization_member_table`, `group_table`, `group_member_table`, `resource_assignment_table`, `member_resource_role_table`, `role_permission_table`, `cluster_table` (각 모델의 `__table__`).

공개 메서드 (시그니처 코드 그대로, `JsonObject = packages.contracts.event_bus.interfaces.JsonObject`):

| 시그니처 | 쿼리 의미 |
|---|---|
| `@staticmethod required_tables() -> set[str]` | 이 도메인이 요구하는 10개 테이블명 집합 반환 |
| `ensure_default_workspace(self) -> JsonObject` | 기본 워크스페이스(`default`) upsert 후 `{workspace_id, name, slug, status}` 반환 |
| `ensure_default_organization(self) -> JsonObject` | 기본 조직(`default`) upsert + 기본 그룹(`default-operations`) upsert, 조직 행 반환 |
| `ensure_default_role_permissions(self) -> list[JsonObject]` | `DEFAULT_ROLE_PERMISSION_ROWS` 기준 글로벌(`__global__` 스코프) role→permission 행 upsert. 관리 대상 resource_type 에서 현행 역할 집합(`RESOURCE_ROLE_PERMISSIONS` 키) 밖의 active 행은 `disabled` 로 전환 |
| `register_target_cluster(self, payload: JsonObject) -> JsonObject` | 클러스터 등록 트랜잭션: user/workspace/organization upsert → 등록자를 org OWNER + 기본그룹 MANAGER 로 → cluster 리소스 배정 + 등록자에게 `cluster_steward` 역할 → `cluster_registrations` upsert. payload 그대로 반환. 필수 키: `user_id`, `cluster_id`; 선택: `workspace_id`(기본 `default`), `organization_id`(기본 workspace_id), `name`, `environment`(기본 `"default"`), `agent_token_hash`, `settings` |
| `get_user_by_email(self, email: str) -> JsonObject \| None` | email 로 단건 조회 (`user_id, email, password_hash, display_name, status, role`) |
| `create_user(self, user_id: str, email: str, password_hash: str, display_name: str, status: str, role: str) -> JsonObject \| None` | email 충돌 시 no-op(`on_conflict_do_nothing`, `None` 반환). role 은 `service_admin` 이 아닌 값은 전부 `user` 로 강제 |
| `upsert_admin_account(self, user_id: str, email: str, password_hash: str, display_name: str) -> JsonObject \| None` | email 기준 upsert 로 `service_admin`/`active` 계정 생성·갱신 + 기본 workspace/org/그룹에 OWNER/MANAGER 로 편입 |
| `complete_email_verification(self, user_id: str) -> JsonObject \| None` | `pending_email_verification` 사용자를: 활성 service_admin 이 이미 존재하면 `pending_approval`/`user` 로, 없으면(최초 사용자) `active`/`service_admin` 으로 전환. 후자는 기본 workspace/org/그룹 OWNER/MANAGER 편입. 반환 dict 에 `workspace_id="default"` 추가. 사용자 없으면 `None`, 이미 인증됨이면 현재 행 그대로 반환 |
| `approve_user(self, user_id: str, workspace_id: str) -> JsonObject \| None` | `pending_approval` 사용자만 `active`/`user` 로 전환하고 `workspace_id`(빈 값이면 `default`) 를 organization_id 로 사용해 org MEMBER + 기본그룹 MEMBER 편입. 대상 아니면 `None`. 반환 dict 에 `workspace_id` 추가 |
| `get_default_workspace_id_for_user(self, user_id: str) -> str \| None` | active service_admin 이면 `"default"`, 아니면 가장 오래된 active 조직 멤버십의 organization_id |
| `grant_resource_access(self, payload: JsonObject) -> JsonObject` | 리소스 접근 부여 트랜잭션: user/workspace/org upsert → org MEMBER + 그룹 MEMBER 편입 → 리소스 배정 upsert → member_resource_role upsert. 키: `subject_id`(또는 `user_id`), `organization_id`(폴백 `workspace_id` → `default`), `resource_type`, `resource_id`, `role`(기본 `observer`, `ResourceRole` 검증), `group_id`(기본: 조직 기본 그룹). 반환: payload + 정규화된 `organization_id`/`workspace_id`/`subject_id`/`role` |
| `is_service_admin(self, user_id: str) -> bool` | `role="service_admin"` and `status="active"` 존재 여부 |
| `get_organization_member(self, organization_id: str, user_id: str) -> JsonObject \| None` | active 조직 멤버십 단건 |
| `get_group_member(self, group_id: str, user_id: str) -> JsonObject \| None` | active 그룹 멤버십 단건 |
| `get_resource_assignment_for_org(self, organization_id: str, resource_type: str, resource_id: str) -> JsonObject \| None` | active 리소스 배정 단건 |
| `get_member_resource_role(self, resource_assignment_id: str, user_id: str) -> JsonObject \| None` | active 멤버 리소스 역할 단건 |
| `get_role_permissions(self, resource_type: str, role: str, organization_id: str \| None = None) -> set[str]` | 역할의 permission 집합. 조직 스코프 행(상태 무관)이 존재하면 그 스코프의 active 행, 없으면 글로벌(`__global__`) 스코프의 active 행 |
| `role_has_permission(self, resource_type: str, role: str, permission: str, organization_id: str \| None = None) -> bool` | `Permission(permission)` 검증 후 `get_role_permissions` 포함 여부 |
| `can_access(self, user_id: str, organization_id: str, resource_type: str, resource_id: str, permission: str) -> bool` | 인가 체인: service_admin 이면 무조건 True → org 멤버 → 리소스 배정 존재 → 배정 그룹의 멤버 → 멤버 리소스 역할 존재 → 역할이 permission 보유. 하나라도 실패하면 False |
| `user_has_resource_access(self, user_id: str, workspace_id: str, resource_type: str, resource_id: str, action: str) -> bool` | `can_access` 별칭(위임) |
| `accessible_resource_ids(self, user_id: str, workspace_id: str, resource_type: str, action: str) -> set[str] \| None` | service_admin 이면 `None`(전체 허용 의미). 아니면 그룹멤버십∧멤버역할 조인으로 후보 (resource_id, role) 수집 후 역할별 permission 보유 여부로 필터한 resource_id 집합 |
| `authenticate_cluster_agent(self, token_hash: str) -> JsonObject \| None` | 빈 해시는 `None`. `agent_token_hash` 일치 + `status="registered"` 인 클러스터의 `{workspace_id, cluster_id}` |
| `list_cluster_registrations(self, workspace_id: str, *, cluster_ids: set[str] \| None = None, limit: int = 100) -> list[JsonObject]` | 워크스페이스의 클러스터 등록 목록. `cluster_ids` 가 빈 집합이면 즉시 `[]`, `None` 이 아니면 IN 필터. 정렬 `environment, name, cluster_id`, limit 은 1~500 clamp. `created_at`/`updated_at` 은 ISO 문자열로 직렬화 |
| `get_cluster_registration(self, workspace_id: str, cluster_id: str) -> JsonObject \| None` | 클러스터 등록 단건(직렬화 동일) |
| `list_organizations(self) -> list[JsonObject]` | active 조직 목록 + 멤버/그룹 수(scalar subquery). 반환 키: `org_id, name, description(=slug), member_count, group_count, created_at(ISO)` |
| `create_organization(self, name: str, description: str) -> JsonObject` | `org-{uuid4 hex 12자리}` ID 로 upsert. `description` 은 DB 에 저장되지 않고 응답에만 echo. 반환 `created_at=None` |
| `delete_organization(self, organization_id: str) -> bool` | active 그룹이 하나라도 있으면 `False`(삭제 거부). 없으면 조직 status 를 `disabled` 로 (soft delete) 하고 `True` |
| `list_groups(self, organization_id: str \| None = None) -> list[JsonObject]` | active 그룹 목록(+active 멤버 수), 이름순. `organization_id` 지정 시 필터. 반환 키: `group_id, org_id, name, member_count` |
| `create_group(self, organization_id: str, name: str) -> JsonObject` | `grp-{uuid4 hex 12자리}` ID 로 upsert. 반환 `{group_id, org_id, name, member_count: 0}` |
| `list_group_members(self, group_id: str) -> list[JsonObject]` | active 그룹 멤버를 user_accounts 와 조인, email 순. 반환 `{user_id, email(없으면 user_id)}` |
| `add_group_member(self, group_id: str, user_id: str) -> None` | 그룹 멤버 upsert(role=`member`) |
| `remove_group_member(self, group_id: str, user_id: str) -> None` | 그룹 멤버 status 를 `disabled` 로 (soft delete) |
| `list_users(self, status: str \| None = None) -> list[JsonObject]` | 사용자 목록(생성순) + 사용자별 active 그룹 ID 목록. `status` 필터 선택. 반환 `{user_id, email(없으면 user_id), role, status, groups, created_at(ISO)}` |
| `list_access_grants(self, resource_id: str \| None = None) -> list[JsonObject]` | active 멤버 리소스 역할을 배정·사용자와 조인(사용자는 outer join), 생성순. 반환 `{access_id(=role 행 id 문자열), subject_id(=user_id), subject_type: "user", subject_label(email 또는 user_id), resource_type, resource_id, role, granted_at(ISO)}` |
| `revoke_access(self, access_id: str) -> None` | `access_id` 를 int 변환(실패 시 조용히 무시) 후 해당 member_resource_roles 행 status 를 `disabled` 로 |

Upsert 정책(비공개 헬퍼들의 계약, 재구성에 필요):

- 조직 멤버 upsert: 기존 role 이 `owner` 면 유지(강등 안 됨), 아니면 excluded role 로 갱신. status 는 항상 `active` 복원.
- 그룹 멤버 upsert: 기존 role 이 `manager` 면 유지. 동일 패턴.
- 멤버 리소스 역할 upsert: 기존 role 이 `cluster_steward` 면 유지. 동일 패턴. role 은 `ResourceRole(...)` 로 검증.
- 리소스 배정 upsert: 충돌 시 `group_id` 갱신 + status `active` 복원.
- 클러스터 upsert: `(workspace_id, cluster_id)` 충돌 시 name/environment/agent_token_hash/settings 갱신, status 는 항상 `registered`.
- 기본 그룹 ID 유도: 기본 조직이면 `default-operations`, 아니면 `group-{sha256(organization_id) hex 24자리}`.
- 리소스 배정 ID 유도: `resource-assignment-{sha256("org|type|id") hex 32자리}`.

### `src/domains/identity/models.py` — 모델

공개 심볼: `UserAccount`, `Organization`, `OrganizationMember`, `Group`, `GroupMember`, `ResourceAssignment`, `MemberResourceRole`, `RolePermission`, `Workspace`, `ClusterRegistration` (아래 데이터 모델 참조).

## 데이터 모델 (Data Model)

공통: `text_column()` = `Text NOT NULL`, `created_at_column()`/`updated_at_column()` = `TIMESTAMP(timezone=True) NOT NULL server_default=now()`, `jsonb_column()` = `JSONB NOT NULL` ([storage](../packages/storage.md)). 상태/역할 값은 [contracts](../packages/contracts.md) 의 `packages/contracts/identity.py` enum 문자열.

### `UserAccount` — `src/domains/identity/models.py :: UserAccount`

`__tablename__ = "user_accounts"`, `__table_args__ = (UniqueConstraint("email"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| user_id | Text | PK | 사용자 ID |
| email | Text | nullable, UNIQUE | 이메일 (내부 생성 계정은 NULL 가능) |
| password_hash | Text | nullable | 비밀번호 해시 |
| display_name | Text | NOT NULL | 표시 이름 |
| status | Text | NOT NULL | `UserStatus`: `active` / `pending_email_verification` / `pending_approval` |
| role | Text | NOT NULL | `ServiceRole`: `service_admin` / `user` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `Organization` — `src/domains/identity/models.py :: Organization`

`__tablename__ = "organizations"`, `__table_args__ = (UniqueConstraint("slug"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| organization_id | Text | PK | 조직 ID |
| name | Text | NOT NULL | 조직 이름 |
| slug | Text | NOT NULL, UNIQUE | 슬러그 (upsert 시 organization_id 와 동일 값) |
| status | Text | NOT NULL | `AccessStatus`: `active` / `disabled` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `OrganizationMember` — `src/domains/identity/models.py :: OrganizationMember`

`__tablename__ = "organization_members"`, `__table_args__ = (UniqueConstraint("organization_id", "user_id"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 행 ID |
| organization_id | Text | FK → organizations.organization_id, UNIQUE(organization_id, user_id) | 조직 |
| user_id | Text | FK → user_accounts.user_id | 사용자 |
| role | Text | NOT NULL | `OrganizationRole`: `owner` / `admin` / `member` |
| status | Text | NOT NULL | `AccessStatus` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `Group` — `src/domains/identity/models.py :: Group`

`__tablename__ = "groups"`, `__table_args__ = (UniqueConstraint("organization_id", "slug"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| group_id | Text | PK | 그룹 ID |
| organization_id | Text | FK → organizations.organization_id, UNIQUE(organization_id, slug) | 소속 조직 |
| name | Text | NOT NULL | 그룹 이름 |
| slug | Text | NOT NULL | 슬러그 (upsert 시 group_id 와 동일 값) |
| status | Text | NOT NULL | `AccessStatus` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `GroupMember` — `src/domains/identity/models.py :: GroupMember`

`__tablename__ = "group_members"`, `__table_args__ = (UniqueConstraint("group_id", "user_id"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 행 ID |
| group_id | Text | FK → groups.group_id, UNIQUE(group_id, user_id) | 그룹 |
| user_id | Text | FK → user_accounts.user_id | 사용자 |
| role | Text | NOT NULL | `GroupRole`: `manager` / `member` |
| status | Text | NOT NULL | `AccessStatus` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `ResourceAssignment` — `src/domains/identity/models.py :: ResourceAssignment`

`__tablename__ = "resource_assignments"`, `__table_args__ = (UniqueConstraint("group_id", "resource_type", "resource_id"), UniqueConstraint("organization_id", "resource_type", "resource_id"))`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| resource_assignment_id | Text | PK | 배정 ID (`resource-assignment-{sha256 hex 32}` 유도) |
| organization_id | Text | FK → organizations.organization_id, UNIQUE(organization_id, resource_type, resource_id) | 조직 |
| group_id | Text | FK → groups.group_id, UNIQUE(group_id, resource_type, resource_id) | 담당 그룹 |
| resource_type | Text | NOT NULL | `AccessResourceType` 값 (예: `cluster`, `repository`, …) |
| resource_id | Text | NOT NULL | 리소스 식별자 |
| status | Text | NOT NULL | `AccessStatus` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `MemberResourceRole` — `src/domains/identity/models.py :: MemberResourceRole`

`__tablename__ = "member_resource_roles"`, `__table_args__ = (UniqueConstraint("resource_assignment_id", "user_id"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 행 ID (admin 콘솔의 `access_id` 로 노출) |
| resource_assignment_id | Text | FK → resource_assignments.resource_assignment_id, UNIQUE(resource_assignment_id, user_id) | 리소스 배정 |
| user_id | Text | FK → user_accounts.user_id | 사용자 |
| role | Text | NOT NULL | `ResourceRole`: `observer` / `release_operator` / `incident_operator` / `cluster_steward` |
| status | Text | NOT NULL | `AccessStatus` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `RolePermission` — `src/domains/identity/models.py :: RolePermission`

`__tablename__ = "role_permissions"`, `__table_args__ = (UniqueConstraint("organization_id", "resource_type", "role", "permission"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 행 ID |
| organization_id | Text | NOT NULL, default `GLOBAL_ROLE_POLICY_ORGANIZATION_ID`(`"__global__"`), UNIQUE 복합 | 정책 스코프 (FK 아님 — `__global__` 허용) |
| resource_type | Text | NOT NULL | 리소스 타입 |
| role | Text | NOT NULL | `ResourceRole` 값 |
| permission | Text | NOT NULL | `Permission` 값 (예: `cluster.read`, `deploy.run`) |
| status | Text | NOT NULL | `AccessStatus` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `Workspace` — `src/domains/identity/models.py :: Workspace`

`__tablename__ = "workspaces"`, `__table_args__ = (UniqueConstraint("slug"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| workspace_id | Text | PK | 워크스페이스 ID (기본 `default`) |
| name | Text | NOT NULL | 이름 |
| slug | Text | NOT NULL, UNIQUE | 슬러그 (upsert 시 workspace_id 와 동일 값) |
| status | Text | NOT NULL | `WorkspaceStatus`: `active` |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

### `ClusterRegistration` — `src/domains/identity/models.py :: ClusterRegistration`

`__tablename__ = "cluster_registrations"`, `__table_args__ = (UniqueConstraint("workspace_id", "cluster_id"),)`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 행 ID |
| workspace_id | Text | FK → workspaces.workspace_id, UNIQUE(workspace_id, cluster_id) | 워크스페이스 |
| cluster_id | Text | NOT NULL | 클러스터 ID |
| name | Text | NOT NULL | 표시 이름 (기본: cluster_id) |
| environment | Text | NOT NULL | 환경 (기본 `"default"`) |
| status | Text | NOT NULL | `ClusterRegistrationStatus`: `registered` |
| agent_token_hash | Text | nullable, index | agent 토큰 SHA-256 hex (원문 미저장) |
| settings | JSONB | NOT NULL | 클러스터 설정 (기본 `{}`) |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | 생성 시각 |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | 갱신 시각 |

## 이벤트 (Events)

### 발행 (Publishes)

| 이벤트 | 라우팅 키(subject) | body 스키마 | 발행 지점 |
|---|---|---|---|
| `EmailVerificationRequestedBody` (정의: [mail 도메인](./mail.md), `src/domains/mail/events.py`) | `mail.email_verification.requested` | `email: str`, `verification_url: str`, `expires_in_seconds: int` | `signup`, `resend_verification` 핸들러에서 `events.accept_body(...)` |

`verification_url` 은 `PUBLIC_BASE_URL` 이 설정되어 있으면 `{PUBLIC_BASE_URL}/auth/verify-email?token=...`, 아니면 `request.url_for('verify_email')` 기반으로 생성한다.

### 구독 (Consumes)

없음.

## 동작 (Behavior)

### 회원가입 → 이메일 인증 → 승인 (사용자 상태 머신)

상태: `pending_email_verification` → `pending_approval` → `active` (최초 사용자는 인증 즉시 `active`).

1. `POST /auth/signup`: `password_auth.signup(email, password, password_confirm, client_key)` 호출 → 인증 챌린지(challenge: `email`, `token`, `expires_in_seconds`) 획득 → `mail.email_verification.requested` 발행 → `EmailVerificationResponse(accepted=True, verification_required=True, email=...)`.
2. `GET /auth/verify-email?token=...`: `password_auth.verify_email(token)`.
   - `result.session is None`(승인 대기): 303 → `/login?verified=1&approval=pending`.
   - 세션 생성됨(최초 사용자): 303 → `_safe_redirect_path(redirect)` (기본 `/login?verified=1`) + 세션 쿠키 set.
   - 저장소 계층(`complete_email_verification`): 활성 service_admin 존재 시 `pending_approval`/`user`, 최초 사용자면 `active`/`service_admin` + 기본 workspace/org/그룹 OWNER·MANAGER 편입.
3. `POST /auth/users/{user_id}/approve` (admin): `password_auth.approve_user(user_id, workspace_id)` — workspace_id 는 admin 세션의 `workspace_id`(없으면 `DEFAULT_WORKSPACE_ID="default"`). 저장소 `approve_user` 는 `pending_approval` 사용자만 `active`/`user` 로 전환하고 조직 MEMBER + 기본그룹 MEMBER 로 편입.
4. `POST /auth/resend-verification`: `password_auth.resend_email_verification(email, password, client_key)` 가 `None` 이면(재발송 불필요/불가) `verification_required=False` 로 응답 — 계정 존재 여부를 노출하지 않음.
5. `POST /auth/check-email`: 이메일 존재 여부 탐색 공격을 줄이기 위해 rate limit을 먼저 적용한다. 정상 응답은 `{available, reason_code}`이고, 초과 시 `code="rate_limited"` 및 `retry_after`를 포함한다.

### 세션 쿠키

- 로그인/인증 성공 시 `Auth.SESSION_COOKIE_NAME`(`service_session`) 쿠키에 세션 토큰을 심는다: `httponly=True`, `samesite="lax"`, `max_age=SESSION_TTL_SECONDS`(기본 86400). 토큰은 JSON 으로 반환하지 않는다(XSS 탈취 차단).
- `secure` 판정: `COOKIE_SECURE` 값을 strip·lower 한 결과가 `FALSE_COOKIE_SECURE_VALUES`(`"0"`, `"false"`, `"no"`, `"off"`)에 속하지 않으면 Secure — http 배포에서 Secure 쿠키를 브라우저가 버려 세션이 유실되는 설정 실수를 줄인다. 기본은 Secure.
- 로그아웃 시 `password_auth.logout(current.token)` 후 동일 속성으로 쿠키 삭제.

### 레이트리밋 클라이언트 키

`signup`/`resend_verification` 은 클라이언트 키를 password_auth 에 전달한다. `TRUST_PROXY=1` 일 때만 `X-Forwarded-For` 첫 항목을 신뢰(헤더 스푸핑에 의한 레이트리밋 우회 방지), 아니면 소켓 peer IP, 그것도 없으면 `"unknown"`.

### 오픈 리다이렉트 방지

`verify_email` 의 `redirect` 파라미터는 `/` 로 시작하고 `//` 시작이 아니며 `://` 를 포함하지 않을 때만 사용, 그 외는 `/login?verified=1` 로 대체.

### 리소스 인가 체인 (`can_access`)

`service_admin(active)` → 항상 허용. 그 외: ① active 조직 멤버 ② 해당 (org, resource_type, resource_id) 의 active 리소스 배정 존재 ③ 배정된 그룹의 active 멤버 ④ 배정에 대한 active 멤버 리소스 역할 존재 ⑤ 그 역할이 요청 permission 보유(`get_role_permissions`: 조직 스코프 행이 있으면 조직 정책, 없으면 `__global__` 정책). 전 단계 통과 시에만 허용.

### per-cluster agent 인증

agent 는 `x-agent-token` 헤더로 인증한다. 게이트웨이는 토큰의 SHA-256 해시로 `cluster_registrations` 를 조회해 권위 `(workspace_id, cluster_id)` 를 얻고, 요청 body 의 workspace/cluster 값은 신뢰하지 않는다(크로스 테넌트 차단). 실패는 전부 401.

### 관리 콘솔 access 부여 (`grant_access`)

admin 세션의 `workspace_id` 를 `organization_id` 로 사용해 `grant_resource_access` 실행 후, `list_access_grants(resource_id)` 를 재조회해 `resource_id`+`role`+`subject_id` 가 모두 일치하는 grant 중 **마지막 항목**(created_at 오름차순 조회이므로 방금 부여한 것)을 응답으로 반환(access_id 확정) — subject_id 까지 비교해야 같은 resource+role 의 다른 사용자 grant 와 재매칭되지 않는다. 일치 항목이 없으면 `access_id="pending"` 으로 요청 echo 응답.

## 불변식·오류 (Invariants & Errors)

- **fail-closed 인가**: `ResourceAccessFilterChain.authorize` 는 필터가 비어 있으면 `False`. `require_cluster_agent` 는 토큰 없음/미등록 모두 401.
- **권한 필드는 클라이언트 입력 금지**: 로그인/가입 요청에 role 필드가 없고, `create_user` 는 `service_admin` 외 role 을 `user` 로 강제. admin 콘솔의 workspace 는 세션에서 유도.
- **역할 강등 방지 upsert**: org `owner`, group `manager`, resource `cluster_steward` 는 upsert 로 덮어써 강등되지 않는다(기존 값 유지).
- **soft delete**: 조직/그룹멤버/접근권한 삭제는 status=`disabled` 전환이다. `delete_organization` 은 active 그룹이 남아있으면 거부(`False` → 라우터에서 `HTTPException(409, "groups_exist")`).
- **최초 사용자 부트스트랩**: 활성 `service_admin` 이 없을 때 이메일 인증을 완료한 첫 사용자가 `service_admin`/`active` 가 된다.
- **agent 토큰 원문 미저장**: `hash_agent_token` 의 SHA-256 hex 만 저장·비교.
- **글로벌 role 정책 시드**: `ensure_default_role_permissions` 는 `DEFAULT_ROLE_PERMISSION_ROWS`([contracts](../packages/contracts.md)) 를 upsert 하고, 현행 역할 집합에 없는 구(舊) 역할의 active 행을 `disabled` 처리한다.
- 발생 예외: `HTTPException(401)`(세션 없음·agent 인증 실패), `HTTPException(403, "service admin role required")`, `HTTPException(403, "resource access denied")`, `HTTPException(409, "groups_exist")`. `ResourceRole(...)`/`Permission(...)` 검증 실패 시 `ValueError` 가 저장소에서 발생할 수 있다.
- `revoke_access` 는 정수가 아닌 `access_id` 를 조용히 무시한다(no-op).

## 설정 (Settings)

| 환경변수/설정 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `PUBLIC_BASE_URL` | str | `""` | 인증 메일 링크의 공개 베이스 URL. 비어 있으면 `request.url_for` 사용 |
| `TRUST_PROXY` | str | `""` | `"1"` 일 때만 `X-Forwarded-For` 를 클라이언트 키로 신뢰 |
| `COOKIE_SECURE` (`Auth.COOKIE_SECURE_ENV`) | str | `"1"` | `0`/`false`/`no`/`off`(대소문자 무관)면 세션 쿠키 Secure 해제(http 배포·로컬 개발용), 그 외는 Secure |
| `SESSION_TTL_SECONDS` (`Auth.SESSION_TTL_ENV`) | str(int) | `"86400"` (`Auth.DEFAULT_SESSION_TTL_SECONDS`) | 세션 쿠키 max_age |
| (상수) `Auth.SESSION_COOKIE_NAME` | str | `"service_session"` | 세션 쿠키 이름 |
| (상수) `Auth.COOKIE_SAMESITE` | str | `"lax"` | 세션 쿠키 SameSite |
