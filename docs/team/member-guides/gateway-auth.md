# 멤버 가이드: Gateway / Auth

## 미션

외부 HTTP 경계를 담당하고, 모든 외부 요청이 인증과 정책 검사를 거쳐 event-driven 흐름으로 들어가게 만든다.

## 담당 영역

- `services/api-gateway`
- `packages/contracts/gateway`
- `packages/contracts/event_bus`
- `packages/contracts/identity`
- `packages/contracts/integrations`
- `packages/contracts/security`
- OAuth/session/token vault 흐름
- command/dashboard/dead-letter HTTP route

## 현재 책임

- GitHub OAuth-only 로그인 구조로 고정하지 않는다.
- 기본 로그인은 email/password 기반 내부 로그인으로 둔다.
- session은 Redis에 저장하고 provider token reference는 Token Vault/Secret Vault record로 관리한다.
- UI command 요청이 유효한 session과 project 권한을 요구하도록 유지한다.
- 외부 입력은 Pydantic schema로 검증한다.
- 외부 도구 credential은 integration target과 credential binding으로 관리한다.

## 코드 규칙

- Gateway는 유일한 외부 HTTP 경계다.
- UI가 DB, JetStream, worker를 직접 호출하지 않게 한다.
- provider access token을 event payload에 넣지 않는다.
- route handler는 input validation, auth/policy, event publish 순서로 작성한다.
- request payload field를 추가하기 전에 schema를 먼저 추가한다.
- Gateway가 event를 발행할 때도 `EventClient`/`publish_and_record` 경계를 사용하고 payload contract를 깨지 않는다.
- 사용자 로그인 계정과 외부 도구 계정을 섞지 않는다.
- organization role과 project role을 분리한다.

## PR 체크리스트

- 새 endpoint의 auth 동작이 문서화됨
- 새 request schema가 알 수 없거나 위험한 field를 거부함
- Gateway가 발행하는 event subject/payload 변경이 `subjects.py`, `payloads.py`, `docs/events.md`에 반영됨
- session/cookie/header 인증 테스트가 있음
- project/organization 권한 변경에는 권한 테스트가 있음
- credential 관련 변경에는 secret 미노출 테스트가 있음
- `make check` 통과
- Gateway smoke path 유지
- UI에 보이는 route가 바뀌면 WIKI/API docs 수정

## Codex 지시문

이 영역을 작업할 때는 `services/api-gateway/gateway.py`, `services/api-gateway/auth.py`, `packages/contracts/gateway`, `packages/contracts/event_bus`, `docs/team/conventions.md`, 이 문서를 먼저 읽어라.

## Gateway/Auth 최종 설계와 구현 작업서

이 문서는 Gateway/Auth 담당자가 질문 없이 구현을 시작할 수 있도록 작성한 작업 지시서다.

목표는 GitHub OAuth 하나에 묶인 인증 구조가 아니라, 우리 서비스 계정과 외부 도구 연결을 분리하는 것이다.

```text
Identity          우리 서비스 사용자/조직/팀/역할
Authorization     project, target, action 단위 권한 검사
Integration       GitHub, Prometheus, Loki, Grafana, PostgreSQL, OTel 등 연결
Credential Vault  실제 secret 저장 위치
Token Broker      worker가 secret을 직접 보지 않게 하는 발급 창구
Event System      secret 없이 user_id/project_id/target_id/action만 전달
```

## 1. 최종 판단: 사용자 웹 로그인은 서버 세션 기반으로 시작한다

브라우저 사용자 로그인은 JWT access token 중심이 아니라, Redis에 저장하는 opaque session token을 기본으로 한다.

이 결정은 JWT 구현이 어려워서가 아니다. 이 제품은 command 실행, DLQ replay, Safe PR, 외부 credential 사용처럼 권한 회수가 중요한 작업이 많다. 따라서 브라우저 사용자는 서버가 매 요청마다 현재 권한을 확인하고 즉시 세션을 끊을 수 있는 server-side session이 더 안전하다.

결정:

- 기본 로그인: email/password 기반 내부 로그인.
- 세션 저장: Redis server-side session.
- 클라이언트 전달: 브라우저는 `HttpOnly Secure SameSite=Lax` cookie, CLI/test는 `Authorization: Bearer <session_token>` 또는 `x-session-token`.
- 외부 API/CLI 장기 인증: 같은 session token을 남용하지 않고, 별도 scoped API token 또는 short-lived token 전략을 나중에 추가한다.
- OAuth: 로그인 필수 수단이 아니라 외부 provider 연결 방식 중 하나.
- 외부 도구 secret: event payload, browser, log, DB plain column에 넣지 않는다.

왜 서버 세션이 좋은가:

- 즉시 로그아웃/강제 만료가 쉽다. Redis key를 지우면 끝난다.
- role/project 권한 변경이 즉시 반영된다. JWT처럼 만료 전까지 옛 권한이 남지 않는다.
- token payload에 권한 정보를 넣지 않아도 된다. 세션에는 최소 user_id만 넣고 권한은 DB에서 다시 확인한다.
- 브라우저 보안에 유리하다. HttpOnly cookie를 쓰면 JS가 token을 읽지 못한다.
- Gateway 중심 구조와 잘 맞는다. 외부 HTTP 경계가 Gateway 하나이므로 인증 상태를 중앙에서 통제할 수 있다.

JWT 또는 별도 API token을 쓰는 경우:

- 외부 공개 API를 다른 서버가 직접 호출해야 한다.
- 여러 region에서 Redis latency가 문제가 된다.
- 짧은 수명 access token + refresh token rotation을 구현할 준비가 됐다.
- CLI/automation client가 user browser session과 분리된 scoped credential을 가져야 한다.

현재 단계에서는 브라우저 로그인 JWT를 만들지 않는다. 최종 제품에서는 아래처럼 분리한다.

```text
Browser UI
  Redis server-side session + HttpOnly cookie

CLI/test
  Authorization: Bearer <session_token> 허용

장기 automation/API client
  별도 Personal Access Token 또는 short-lived JWT

외부 도구 credential
  Token Broker / Vault
```

## 2. 단계별 구현 로드맵

아래 순서로 구현한다. 앞 단계가 끝나기 전에는 다음 추상화를 만들지 않는다.

```text
Phase 1. 일반 로그인
  email/password로 우리 서비스에 로그인한다.
  Redis session으로 인증 상태를 확인한다.
  외부 도구 연결은 아직 하지 않는다.

Phase 2. 내부 권한 확인
  user, project, project_member를 만든다.
  session user가 project에서 어떤 role인지 확인한다.
  dashboard/command 같은 보호 API에 project 권한 검사를 붙인다.

Phase 3. 도구 하나만 연결
  GitHub repo 하나만 IntegrationTarget으로 등록한다.
  credential 하나를 secret_ref로 저장한다.
  credential 값은 event/response/log에 절대 나오지 않게 한다.

Phase 4. 도구 사용 권한
  GitHub target에서 read_repo/create_pr 같은 action을 검사한다.
  role과 credential binding이 모두 허용해야 통과한다.

Phase 5. Token Broker 도입
  worker가 credential을 직접 읽지 못하게 한다.
  TokenBroker.issue(actor, project, target, action)만 사용하게 한다.

Phase 6. 두 번째 도구 추가
  Prometheus datasource를 같은 구조로 붙인다.
  이때 GitHub 전용 코드가 공통 모델에 새지 않았는지 확인한다.

Phase 7. 추상화 확정
  GitHub, Prometheus가 같은 Provider/Target/Action/Broker 구조로 동작하면
  Loki, Grafana, PostgreSQL, OTel을 adapter로 확장한다.
```

이 순서가 중요한 이유:

- 로그인과 외부 도구 권한을 한 번에 만들면 모델이 커져서 초보자가 구현하기 어렵다.
- 도구 하나를 먼저 붙여야 실제 필요한 필드와 권한 검사가 보인다.
- 도구 둘째를 붙이는 순간 추상화가 맞는지 검증된다.
- Token Broker는 credential 사용 지점이 생긴 뒤 도입해야 역할이 명확하다.

각 phase의 완료 기준:

| Phase | 완료 기준 |
| --- | --- |
| 1 | 로그인 성공, 세션 조회 성공, 로그아웃 후 401 |
| 2 | project member만 보호 API 접근 가능 |
| 3 | GitHub repo target/credential/binding 등록 가능, secret 노출 없음 |
| 4 | viewer는 create_pr 거부, maintainer는 허용 |
| 5 | worker/서비스 코드가 vault를 직접 읽지 않고 TokenBroker만 사용 |
| 6 | Prometheus read_metrics가 GitHub와 같은 권한 모델로 동작 |
| 7 | 새 provider 추가 시 enum/action/adapter만 추가하면 됨 |

## 3. 용어

```text
User
  우리 서비스에 로그인하는 사람.

Organization
  회사/팀 단위. 여러 user와 project를 소유한다.

Project
  운영 자동화 단위. 예: final-demo, production-cluster-a.

OrganizationRole
  조직 전체에 적용되는 역할. 예: org_owner, org_admin, org_member.

ProjectRole
  특정 project 안에서만 적용되는 역할. 예: project_owner, maintainer, developer, viewer.

Integration
  외부 도구 provider 연결 묶음. 예: GitHub, Prometheus, Loki, Grafana.

IntegrationTarget
  실제 접근 대상. 예: GitHub repo, Prometheus datasource, PostgreSQL database.

Credential
  target에 접근하기 위한 secret의 참조. 실제 secret이 아니라 vault ref.

CredentialBinding
  어떤 target이 어떤 credential을 어떤 action으로 사용할 수 있는지 묶는다.

Role
  permission 묶음. 조직 role과 project role을 섞어 쓰지 않는다.

Policy
  actor가 project/target/action을 사용할 수 있는지 검사하는 규칙.
```

핵심 규칙:

```text
로그인 계정 != 외부 도구 계정
```

사용자가 우리 서비스에 로그인했다고 해서 GitHub, Grafana, DB, Prometheus 권한이 자동으로 생기지 않는다.

## 4. RBAC와 ABAC를 작게 구현하는 방법

RBAC는 역할 기반 권한이다. 이 프로젝트는 role scope를 두 단계로 나눈다.

```text
Organization RBAC
  org_owner
  org_admin
  org_member

Project RBAC
  project_owner
  maintainer
  developer
  viewer
```

왜 나누는가:

- 조직 권한은 사용자 초대, project 생성, organization 설정 변경처럼 전체 범위에 적용된다.
- 프로젝트 권한은 command 실행, Safe PR 생성, dashboard 조회처럼 특정 project에만 적용된다.
- 한 사람이 조직에서는 `org_member`지만 특정 project에서는 `maintainer`일 수 있다.
- 반대로 조직 관리자여도 모든 project의 production write를 자동 허용하면 안 된다.

ABAC는 요청 속성 기반 조건이다.

```text
project_id가 내가 속한 project인가?
target이 그 project에 속해 있는가?
action이 role에 허용되어 있는가?
environment가 prod라서 추가 제한이 필요한가?
namespace가 sandbox인가?
```

처음 구현은 RBAC + 작은 ABAC 조건으로 간다.

검사 순서:

```text
1. session이 유효한가?
2. organization 범위 요청이면 organization member/role을 확인한다.
3. project 범위 요청이면 user가 project member인지 확인한다.
4. project role이 action을 허용하는지 확인한다.
5. target이 project에 속해 있는가?
6. target에 credential binding이 있는가?
7. credential binding이 action을 허용하는가?
```

권한 판단 원칙:

```text
organization 생성/멤버 초대/프로젝트 생성
  -> organization role 검사

dashboard 조회/command 실행/Safe PR/도구 credential 사용
  -> project role 검사

credential binding 생성
  -> project role 검사 + 필요하면 organization role 보조 검사
```

## 5. 공통 action 모델

외부 도구는 다르지만 내부 모델은 provider/target/action으로 통일한다.

```text
GitHub
  provider: github
  target_type: repo | org
  auth_method: github_app | oauth | pat | deploy_key
  actions: read_repo, create_pr, push_branch, read_checks

Prometheus
  provider: prometheus
  target_type: datasource
  auth_method: bearer | basic | mtls
  actions: read_metrics, query_range

Loki
  provider: loki
  target_type: datasource
  auth_method: bearer | basic | mtls
  actions: read_logs, query_logs

Grafana
  provider: grafana
  target_type: workspace | dashboard | datasource
  auth_method: service_account_token | api_key
  actions: read_dashboard, write_dashboard, manage_datasource

PostgreSQL
  provider: postgres
  target_type: database
  auth_method: username_password | iam_auth | connection_string_ref
  actions: query_db, write_db, migrate_db, admin_db

OpenTelemetry
  provider: opentelemetry
  target_type: collector | endpoint
  auth_method: bearer | mtls | api_key
  actions: send_trace, read_trace, configure_pipeline
```

provider별 차이는 adapter에서만 처리한다. Gateway/Auth의 권한 모델은 provider별로 분기하지 않는다.

## 6. 새 패키지 구조

아래 파일을 추가한다.

```text
packages/contracts/identity/
  __init__.py
  fields.py
  models.py
  roles.py
  ports.py

packages/contracts/integrations/
  __init__.py
  fields.py
  models.py
  actions.py
  ports.py

packages/contracts/security/
  __init__.py
  models.py
  ports.py
  policy.py
```

각 파일의 책임:

```text
identity/models.py
  User, Organization, Project, ProjectMember 같은 내부 계정 모델.

identity/roles.py
  Role, Permission, ROLE_PERMISSIONS.

identity/ports.py
  UserStore, ProjectStore, MembershipStore Protocol.

integrations/actions.py
  Provider, TargetType, AuthMethod, IntegrationAction enum.

integrations/models.py
  Integration, IntegrationTarget, CredentialRef, CredentialBinding.

integrations/ports.py
  IntegrationStore, CredentialBindingStore Protocol.

security/models.py
  AccessRequest, AccessDecision, IssuedCredential.

security/policy.py
  AccessPolicy. 권한 검사 순서를 구현한다.

security/ports.py
  TokenBroker, SecretVault Protocol.
```

## 7. 코드 스켈레톤

`packages/contracts/integrations/actions.py`

```python
from __future__ import annotations

from enum import StrEnum


class Provider(StrEnum):
    GITHUB = "github"
    PROMETHEUS = "prometheus"
    LOKI = "loki"
    GRAFANA = "grafana"
    POSTGRES = "postgres"
    OPENTELEMETRY = "opentelemetry"


class TargetType(StrEnum):
    REPO = "repo"
    ORG = "org"
    DATASOURCE = "datasource"
    DASHBOARD = "dashboard"
    DATABASE = "database"
    CLUSTER = "cluster"
    COLLECTOR = "collector"
    ENDPOINT = "endpoint"


class AuthMethod(StrEnum):
    GITHUB_APP = "github_app"
    OAUTH = "oauth"
    PAT = "pat"
    DEPLOY_KEY = "deploy_key"
    BEARER = "bearer"
    BASIC = "basic"
    MTLS = "mtls"
    API_KEY = "api_key"
    SERVICE_ACCOUNT_TOKEN = "service_account_token"
    USERNAME_PASSWORD = "username_password"
    IAM_AUTH = "iam_auth"
    CONNECTION_STRING_REF = "connection_string_ref"


class IntegrationAction(StrEnum):
    READ_REPO = "read_repo"
    CREATE_PR = "create_pr"
    PUSH_BRANCH = "push_branch"
    READ_CHECKS = "read_checks"
    READ_METRICS = "read_metrics"
    QUERY_RANGE = "query_range"
    READ_LOGS = "read_logs"
    QUERY_LOGS = "query_logs"
    READ_DASHBOARD = "read_dashboard"
    WRITE_DASHBOARD = "write_dashboard"
    MANAGE_DATASOURCE = "manage_datasource"
    QUERY_DB = "query_db"
    WRITE_DB = "write_db"
    MIGRATE_DB = "migrate_db"
    ADMIN_DB = "admin_db"
    SEND_TRACE = "send_trace"
    READ_TRACE = "read_trace"
    CONFIGURE_PIPELINE = "configure_pipeline"
```

`packages/contracts/security/models.py`

```python
from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.integrations.actions import (
    IntegrationAction,
    Provider,
)


@dataclass(frozen=True)
class AccessRequest:
    actor_id: str
    project_id: str
    target_id: str
    action: IntegrationAction


@dataclass(frozen=True)
class AccessDecision:
    allowed: bool
    reason: str | None = None

    @classmethod
    def allow(cls) -> AccessDecision:
        return cls(True)

    @classmethod
    def reject(cls, reason: str) -> AccessDecision:
        return cls(False, reason)


@dataclass(frozen=True)
class IssuedCredential:
    provider: Provider
    target_id: str
    secret: str
    expires_at: str | None = None
```

`packages/contracts/security/ports.py`

```python
from __future__ import annotations

from typing import Protocol

from packages.contracts.security.models import (
    AccessRequest,
    IssuedCredential,
)


class TokenBroker(Protocol):
    def issue(self, request: AccessRequest) -> IssuedCredential: ...


class SecretVault(Protocol):
    def read_secret(self, secret_ref: str) -> str: ...
```

## 8. DB 모델 추가 계획

처음부터 모든 필드를 완벽히 만들지 말고, 아래 최소 테이블부터 만든다.

```text
users
organizations
organization_members
projects
project_members
integrations
integration_targets
credentials
credential_bindings
```

`users`

```text
id text primary key
email text unique not null
password_hash text not null
display_name text not null
status text not null
created_at timestamptz not null
updated_at timestamptz not null
```

`projects`

```text
id text primary key
organization_id text not null
name text not null
slug text not null
environment text not null
created_at timestamptz not null
updated_at timestamptz not null
```

`project_members`

```text
project_id text not null
user_id text not null
role text not null  -- project_owner | maintainer | developer | viewer
primary key(project_id, user_id)
```

`organization_members`

```text
organization_id text not null
user_id text not null
role text not null  -- org_owner | org_admin | org_member
primary key(organization_id, user_id)
```

`integration_targets`

```text
id text primary key
project_id text not null
provider text not null
target_type text not null
target_ref text not null
environment text not null
status text not null
created_at timestamptz not null
updated_at timestamptz not null
```

`credentials`

```text
id text primary key
provider text not null
secret_ref text not null
status text not null
created_at timestamptz not null
updated_at timestamptz not null
```

`credential_bindings`

```text
id text primary key
project_id text not null
target_id text not null
credential_id text not null
allowed_actions text[] not null
created_at timestamptz not null
updated_at timestamptz not null
```

주의:

- 실제 secret은 `credentials.secret_ref`가 가리키는 vault에만 둔다.
- `credentials` 테이블에 raw token, password, kubeconfig, connection string을 넣지 않는다.
- 현재 `token_vault`는 fake vault로 유지할 수 있지만, 새 설계에서는 `SecretVault` adapter 뒤로 숨긴다.

## 9. API 설계

처음 구현할 Gateway endpoint:

```text
POST /auth/login
POST /auth/logout
GET  /auth/session

POST /projects
GET  /projects
GET  /projects/{project_id}

POST /integrations/targets
GET  /projects/{project_id}/integration-targets

POST /credentials
POST /credential-bindings
```

`POST /auth/login`

Request:

```json
{
  "email": "woonyong@example.com",
  "password": "local-dev-password"
}
```

Response:

```json
{
  "authenticated": true,
  "user_id": "user_...",
  "session": {
    "session_token": "opaque-random-token"
  }
}
```

Cookie:

```text
Set-Cookie: service_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/
```

로컬 HTTP 개발에서는 Secure cookie가 동작하지 않을 수 있다. 이 경우 설정으로 `AUTH_COOKIE_SECURE=false`를 허용한다. 운영 기본값은 true다.

`POST /integrations/targets`

Request:

```json
{
  "project_id": "project_final",
  "provider": "github",
  "target_type": "repo",
  "target_ref": "Jungle-303-04/final",
  "environment": "dev"
}
```

`POST /credentials`

Request:

```json
{
  "provider": "github",
  "auth_method": "github_app",
  "secret_payload": {
    "installation_id": "123",
    "private_key_ref": "local-dev-only"
  }
}
```

구현 규칙:

- request로 받은 `secret_payload`는 event로 발행하지 않는다.
- response에도 secret 값을 돌려주지 않는다.
- 저장 후 response는 `credential_id`, `secret_ref`, `provider`만 반환한다.

`POST /credential-bindings`

Request:

```json
{
  "project_id": "project_final",
  "target_id": "target_github_final",
  "credential_id": "credential_github_app",
  "allowed_actions": ["read_repo", "create_pr"]
}
```

## 10. 기존 OAuth endpoint 처리

기존 endpoint:

```text
GET  /auth/oauth/{provider}/start
POST /auth/oauth/{provider}/callback
```

이 endpoint는 삭제하지 않는다. 역할만 바꾼다.

현재:

```text
OAuth callback -> session 생성
```

최종:

```text
OAuth callback -> provider account 연결 또는 credential 등록
```

내부 로그인은 `/auth/login`이 담당하고, OAuth는 “외부 provider 연결”이 된다.

## 11. Token Broker 설계

Token Broker는 worker가 vault를 직접 읽지 못하게 하는 중앙 창구다.

나쁜 흐름:

```text
RCA worker -> DB에서 token_ref 조회 -> vault 직접 접근 -> GitHub 호출
```

좋은 흐름:

```text
RCA worker
-> TokenBroker.issue(AccessRequest)
-> AccessPolicy 검사
-> SecretVault.read_secret(secret_ref)
-> IssuedCredential 반환
-> GitHub adapter 호출
```

처음 구현은 Gateway/Auth 담당이 fake TokenBroker까지 만든다.

`InMemorySecretVault`

```python
class InMemorySecretVault:
    def __init__(self) -> None:
        self.secrets: dict[str, str] = {}

    def write_secret(self, secret_ref: str, secret: str) -> None:
        self.secrets[secret_ref] = secret

    def read_secret(self, secret_ref: str) -> str:
        return self.secrets[secret_ref]
```

`DefaultTokenBroker`

```python
class DefaultTokenBroker:
    def __init__(self, policy, bindings, vault) -> None:
        self.policy = policy
        self.bindings = bindings
        self.vault = vault

    def issue(self, request: AccessRequest) -> IssuedCredential:
        decision = self.policy.evaluate(request)
        if not decision.allowed:
            raise PermissionError(decision.reason)

        binding = self.bindings.find_binding(
            request.project_id,
            request.target_id,
            request.action,
        )
        secret = self.vault.read_secret(binding.secret_ref)
        return IssuedCredential(
            provider=binding.provider,
            target_id=request.target_id,
            secret=secret,
        )
```

## 12. 이벤트 payload 변경 방향

앞으로 외부 도구를 쓰는 event payload에는 아래 필드를 넣는다.

```json
{
  "project_id": "project_final",
  "target_id": "target_github_final",
  "requested_by": "user_woonyong",
  "action": "create_pr"
}
```

넣으면 안 되는 값:

```text
access_token
refresh_token
github_pat
kubeconfig
db_password
connection_string
private_key
```

## 13. Gateway/Auth 담당 작업 순서

아래 순서대로 PR을 나눈다.

### PR 1: 내부 로그인 schema와 route 뼈대

목표:

```text
OAuth와 별개로 우리 서비스 자체 로그인을 받을 준비를 한다.
아직 DB 사용자 검증은 하지 않고 schema/route/test 뼈대만 만든다.
```

작업:

1. `packages/contracts/gateway/routes.py`에 `AUTH_LOGIN_PATH = "/auth/login"` 추가.
2. `packages/contracts/gateway/routes.py`에 `AUTH_LOGOUT_PATH = "/auth/logout"` 추가.
3. `packages/contracts/gateway/requests.py`에 `LoginRequest` 추가.
4. `packages/contracts/gateway/fields.py`에 필요한 response field가 없으면 추가.
5. `services/api-gateway/gateway.py`에 route skeleton 추가.
6. route skeleton은 아직 `501 not implemented` 또는 fake success가 아니라, 다음 PR에서 구현한다고 명확히 테스트한다.

LoginRequest:

```python
class LoginRequest(StrictModel):
    email: str
    password: str
```

완료 조건:

- unknown field가 Pydantic에서 거부된다.
- password가 response/event/log에 나오지 않는 테스트를 추가한다.
- 기존 OAuth endpoint는 깨지지 않는다.

### PR 2: 내부 사용자 저장소와 password 검증

목표:

```text
email/password로 우리 서비스 user를 검증할 수 있게 한다.
```

작업:

1. `packages/storage/schema.py`에 `User` 모델 추가.
2. `packages/storage/database.py`에 `IdentityRepository` 추가.
3. `packages/contracts/identity` 패키지 생성.
4. `packages/contracts/identity/ports.py`에 `UserStore` Protocol 추가.
5. `services/api-gateway/auth.py`에 password hashing helper 추가.
6. dev bootstrap user를 만든다.

초기 dev user:

```text
email: local@example.com
password: local-password
role: owner
```

password 저장 규칙:

- password 평문 저장 금지.
- DB에는 `password_hash`만 저장.
- Python 표준만 사용하면 PBKDF2-HMAC-SHA256으로 구현한다.
- 운영 전에는 Argon2id 라이브러리 도입을 별도 작업으로 둔다.

완료 조건:

- 올바른 password는 user를 반환한다.
- 틀린 password는 로그인 실패.
- DB row에 평문 password가 없다.

### PR 3: Redis 세션 로그인/로그아웃 완성

목표:

```text
로그인 성공 시 Redis server-side session을 만들고,
이후 보호 API가 session으로 사용자를 확인한다.
```

작업:

1. `RedisSessionStore.delete_session(token)` 추가.
2. `PasswordAuthService.login(email, password)` 추가.
3. `PasswordAuthService.logout(token)` 추가.
4. `/auth/login` route 구현.
5. `/auth/logout` route 구현.
6. 로그인 성공 시 JSON body에 `session_token` 반환.
7. 브라우저용 cookie도 함께 설정한다.
8. `/auth/session`은 기존 `require_session` 흐름을 그대로 사용한다.

cookie 설정:

```text
name: service_session
HttpOnly: true
Secure: 운영 true, 로컬 false 허용
SameSite: Lax
Path: /
TTL: Redis SESSION_TTL_SECONDS와 동일
```

완료 조건:

- 로그인 후 `/auth/session` 성공.
- 로그아웃 후 같은 token으로 `/auth/session` 401.
- header 방식과 cookie 방식 모두 테스트.
- OAuth callback은 아직 session을 만들 수 있지만, 새 기본 로그인은 `/auth/login`이다.

### PR 4: project와 role 권한 확인

목표:

```text
로그인한 사용자가 어떤 project에서 어떤 role인지 확인한다.
organization role과 project role을 분리한다.
외부 도구 연결은 아직 하지 않는다.
```

작업:

1. `packages/storage/schema.py`에 `Organization`, `OrganizationMember`, `Project`, `ProjectMember` 추가.
2. `packages/contracts/identity/models.py` 추가.
3. `packages/contracts/identity/roles.py` 추가.
4. `OrganizationMembershipStore` Protocol 추가.
5. `ProjectMembershipStore` Protocol 추가.
6. `require_organization_role(session, organization_id, action)` helper 추가.
7. `require_project_role(session, project_id, action)` helper 추가.
8. `/projects`, `/projects/{project_id}` 최소 route 추가.
9. 보호 API 중 하나에 project 권한 검사를 붙인다. 첫 대상은 `/dashboard/query` 또는 `/commands` 중 하나만 선택한다.

역할 초기값:

```text
organization role:
  org_owner   조직 설정, 멤버 관리, project 생성 가능
  org_admin   멤버 관리, project 생성 가능
  org_member  조직 소속만 의미. project 권한은 별도 필요

project role:
  project_owner  project 안의 모든 action 허용
  maintainer     command 실행, PR 생성, 관측 데이터 조회
  developer      관측 데이터 조회, RCA 실행
  viewer         dashboard 조회만
```

완료 조건:

- project member는 보호 API 접근 가능.
- project member가 아니면 403.
- org_member여도 project_member가 아니면 project 보호 API 접근 불가.
- org_admin은 project 생성 가능.
- org_admin이어도 project member가 아니면 command 실행 불가.
- viewer는 command 실행 거부.
- project_owner는 command 실행 허용.

### PR 5: GitHub repo 하나만 도구 연결

목표:

```text
여러 도구 추상화 전에 GitHub repo 하나를 연결한다.
이 단계에서는 GitHub만 구현한다.
```

작업:

1. `packages/contracts/integrations` 패키지 생성.
2. `Provider.GITHUB`, `TargetType.REPO`, `AuthMethod.GITHUB_APP/PAT`만 먼저 추가.
3. `IntegrationTargetRequest` 추가.
4. `CredentialCreateRequest` 추가.
5. `CredentialBindingRequest` 추가.
6. `integration_targets`, `credentials`, `credential_bindings` 테이블 추가.
7. `/integrations/targets` route 추가.
8. `/credentials` route 추가.
9. `/credential-bindings` route 추가.
10. credential 등록 시 secret은 fake vault 또는 `token_vault` 뒤에 저장하고 response에는 내보내지 않는다.

완료 조건:

- GitHub repo target 등록 가능.
- credential 등록 response에 raw secret 없음.
- binding에는 `read_repo`, `create_pr`만 허용.
- project member가 아니면 target/credential/binding 등록 불가.

### PR 6: GitHub action 권한 검사

목표:

```text
GitHub target에서 create_pr 같은 action을 할 수 있는지 검사한다.
아직 TokenBroker는 만들지 않는다.
```

작업:

1. `IntegrationAction.READ_REPO`, `IntegrationAction.CREATE_PR` 추가.
2. `AccessRequest`, `AccessDecision` 추가.
3. `AccessPolicy.evaluate(request)` 구현.
4. 검사 순서:
   - session user가 project member인가
   - role이 action을 허용하는가
   - target이 project 소속인가
   - binding이 action을 허용하는가
5. GitHub Safe PR 또는 command 흐름 중 하나에 `AccessPolicy`를 연결한다.

완료 조건:

- viewer는 `create_pr` 거부.
- maintainer는 `create_pr` 허용.
- target이 다른 project 소속이면 거부.
- binding에 없는 action이면 거부.

### PR 7: Token Broker 도입

목표:

```text
worker나 service가 vault/secret 저장소를 직접 읽지 못하게 한다.
```

작업:

1. `packages/contracts/security/ports.py`에 `TokenBroker`, `SecretVault` 추가.
2. `packages/contracts/security/models.py`에 `IssuedCredential` 추가.
3. `DefaultTokenBroker` 구현.
4. `DefaultTokenBroker.issue(AccessRequest)`에서 `AccessPolicy`를 먼저 호출한다.
5. 통과하면 binding의 `secret_ref`로 vault에서 secret을 읽는다.
6. worker는 `credential_id`나 token을 직접 쓰지 않고 `target_id + action`으로 broker에 요청한다.

완료 조건:

- policy 실패 시 secret vault를 읽지 않는다.
- policy 성공 시 `IssuedCredential` 반환.
- worker 코드에 raw vault read가 없다.

### PR 8: Prometheus 하나 추가해서 추상화 검증

목표:

```text
GitHub 전용 모델이 아니었는지 Prometheus datasource로 검증한다.
```

작업:

1. `Provider.PROMETHEUS` 추가.
2. `TargetType.DATASOURCE` 추가.
3. `IntegrationAction.READ_METRICS`, `QUERY_RANGE` 추가.
4. Prometheus target 등록 테스트 추가.
5. `read_metrics` 권한 검사 테스트 추가.

완료 조건:

- GitHub와 Prometheus가 같은 `IntegrationTarget`, `CredentialBinding`, `AccessPolicy` 구조를 사용한다.
- provider별 분기는 adapter 쪽에만 있다.

## 14. 역할별 권한 초기값

초기 매핑:

```text
owner
  *

maintainer
  read_repo
  create_pr
  push_branch
  read_checks
  read_metrics
  query_range
  read_logs
  query_logs
  read_dashboard
  write_dashboard

developer
  read_repo
  read_checks
  read_metrics
  query_range
  read_logs
  query_logs
  read_dashboard

viewer
  read_dashboard
```

production 관련 write action은 별도 ABAC 조건을 추가하기 전까지 허용하지 않는다.

## 15. Gateway route 작성 규칙

모든 보호 route는 아래 순서를 지킨다.

```text
1. Pydantic request 검증
2. require_session
3. project membership 검사
4. action policy 검사
5. local DB write
6. 필요한 경우 event publish
7. secret 없는 response 반환
```

나쁜 예:

```python
payload = await request.json()
await publish_and_record(..., payload)
```

좋은 예:

```python
current = await self.auth.require_session(request)
command = payload.model_dump()
command["requested_by"] = current.user_id
command["project_id"] = payload.project_id
await publish_and_record(..., command)
```

## 16. 보안 체크리스트

PR마다 확인한다.

- password 평문 저장 없음.
- event payload에 secret 없음.
- response에 secret 없음.
- log에 secret 없음.
- `extra="forbid"` schema 유지.
- session은 Redis에 TTL과 함께 저장.
- logout은 Redis session 삭제.
- provider credential은 `secret_ref`로만 참조.
- worker가 vault를 직접 읽지 않음.
- Gateway 밖에 외부 HTTP write endpoint를 만들지 않음.

## 17. 테스트 목록

최소 테스트:

```text
tests/test_gateway_login.py
  - login success
  - login wrong password
  - logout invalidates session
  - session endpoint rejects missing token

tests/test_access_policy.py
  - owner allows all
  - viewer cannot create_pr
  - target project mismatch rejects
  - binding action mismatch rejects

tests/test_token_broker.py
  - issue returns credential only after policy allow
  - issue rejects forbidden action
  - returned credential is not written to event payload

tests/test_integration_contracts.py
  - provider/action enums serialize as strings
  - request schemas reject unknown fields
```

전체 검증:

```bash
uv run ruff check services packages tests
uv run ruff format --check services packages tests
uv run python -m pytest
```

## 18. 첫 구현자가 헷갈리면 보는 최소 요약

```text
1. 로그인은 우리 서비스 계정으로 한다.
2. GitHub/Grafana/Prometheus 계정은 로그인 계정이 아니라 integration이다.
3. event에는 secret을 넣지 않는다.
4. worker는 target_id와 action만 들고 TokenBroker에 credential을 요청한다.
5. TokenBroker는 policy와 binding을 보고 secret_ref를 읽어 짧게 credential을 준다.
6. provider별 차이는 adapter가 처리한다.
```
