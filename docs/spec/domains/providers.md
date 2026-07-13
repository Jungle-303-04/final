---
source_commit: 664925a6
status: synced
---

# providers — provider 카탈로그 도메인 (source/deploy/cloud/secret provider 의 단일 출처)

> 소스: `src/domains/providers/` · 테스트: `tests/test_provider_registry.py`

## 책임 (Responsibility)

- **한다**:
  - 사용 가능한 source/deploy/cloud/secret provider 정의(카탈로그)의 단일 출처 유지 (`catalog.py :: CATALOG`).
  - 카탈로그 조회 및 provider 선택 조합 검증 HTTP 경계 제공 (`router.py`).
  - 환경변수(`KUBEHEAL_DISABLED_PROVIDERS`)로 특정 provider 를 비활성화하는 런타임 필터.
  - credential_ref 요구사항(접두어·필요 capability) 기반 경고 생성.
- **하지 않는다**:
  - provider 어댑터의 실제 구현·연결 — 카탈로그는 메타데이터(`adapter` 문자열)만 기술한다.
  - DB 저장 — 카탈로그는 코드 내 불변 상수이며 테이블이 없다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config.settings.env` | [config](../packages/config.md) | `KUBEHEAL_DISABLED_PROVIDERS` 환경변수 조회 |
| import | `domains.identity.dependencies.require_admin_session` | [identity](./identity.md) | provider catalog/검증/cluster discovery 관리자 세션 가드 |
| import | `packages.contracts.gateway.requests.ProviderSelectionRequest` | [contracts](../packages/contracts.md) | 검증 요청 모델 |
| import | `packages.contracts.gateway.responses` (`ProviderCatalogResponse`, `ProviderValidationResponse`) | [contracts](../packages/contracts.md) | 응답 모델 |
| import | `packages.contracts.gateway.routes` (`PROVIDERS_CATALOG_PATH`, `PROVIDERS_CLUSTER_DISCOVERY_PATH`, `PROVIDERS_VALIDATE_PATH`) | [contracts](../packages/contracts.md) | 라우트 경로 상수 |

이벤트 발행/구독 없음. 외부 시스템 의존 없음.

## 공개 인터페이스 (Public API)

### `src/domains/providers/router.py`

- `router` — `APIRouter()` — `src/domains/providers/router.py :: router`

| 메서드 | 경로 | 핸들러 앵커 | 요청 모델 | 응답 모델 | 권한 |
|---|---|---|---|---|---|
| GET | `/providers/catalog` (`PROVIDERS_CATALOG_PATH`) | `src/domains/providers/router.py :: provider_catalog` | — | `ProviderCatalogResponse` | admin 세션 |
| GET | `/providers/cluster-discovery` (`PROVIDERS_CLUSTER_DISCOVERY_PATH`) | `src/domains/providers/router.py :: provider_cluster_discovery` | — | `ProviderClusterDiscoveryResponse` | admin 세션 |
| POST | `/providers/validate` (`PROVIDERS_VALIDATE_PATH`) | `src/domains/providers/router.py :: provider_selection_validate` | `ProviderSelectionRequest` | `ProviderValidationResponse` | admin 세션 |

- `GET /providers/catalog`: `ProviderCatalogResponse(providers=catalog_body())`.
- `GET /providers/cluster-discovery`: 환경변수 기반 import 후보와 deploy provider 조합을 `ProviderClusterDiscoveryResponse`로 반환한다. kube context/외부 console handle 후보가 포함될 수 있어 admin 세션이 필수다.
- `POST /providers/validate`: 요청의 `source_provider`/`deploy_provider`/`cloud_provider`/`secret_provider` 를 `{"source": ..., "deploy": ..., "cloud": ..., "secret": ...}` 로 매핑해 `validate_provider_selection(selection, credential_refs=payload.credential_refs, capabilities=tuple(payload.capabilities))` 호출, 결과 dict 를 `ProviderValidationResponse(**result)` 로 반환.

요청/응답 모델 스키마 (정의: `src/packages/contracts/gateway/requests.py`, `src/packages/contracts/gateway/responses.py`):

- `ProviderSelectionRequest`: `source_provider: str | None = None`, `deploy_provider: str | None = None`, `cloud_provider: str | None = None`, `secret_provider: str | None = None`, `capabilities: list[str] = []`, `credential_refs: dict[str, str] = {}`
- `ProviderCatalogResponse`: `providers: dict[str, list[JsonMap]]` — 카테고리 값(`source`/`deploy`/`cloud`/`secret`)을 키로 하는 provider body 목록
- `ProviderClusterDiscoveryResponse`: `default_cloud_provider`, `default_deploy_provider`, `flows`, `import_candidates` — cluster 등록 위저드용 실제 import 후보 응답
- `ProviderValidationResponse`: `valid: bool`, `errors: list[str]`, `warnings: list[str]`, `selected: dict[str, JsonMap]`

### `src/domains/providers/catalog.py`

Enum·상수:

- `class ProviderCategory(StrEnum)` — `src/domains/providers/catalog.py :: ProviderCategory`
  값: `SOURCE = "source"`, `DEPLOY = "deploy"`, `CLOUD = "cloud"`, `SECRET = "secret"`.
- `class ProviderStatus(StrEnum)` — `src/domains/providers/catalog.py :: ProviderStatus`
  값: `AVAILABLE = "available"`, `UNAVAILABLE = "unavailable"`.
- `PROVIDER_DISABLED_ENV = "KUBEHEAL_DISABLED_PROVIDERS"` — `src/domains/providers/catalog.py :: PROVIDER_DISABLED_ENV`
- `CATALOG: tuple[ProviderDefinition, ...]` — `src/domains/providers/catalog.py :: CATALOG` — source/deploy/cloud/secret provider 항목. 클러스터 등록 UX는 `existing-k8s`, `eks`, `gke`, `aks`, `kind`, `minikube`, 외부 콘솔 import provider를 노출한다.

데이터클래스:

- `@dataclass(frozen=True) class CredentialRequirement` — `src/domains/providers/catalog.py :: CredentialRequirement`
  - 필드: `key: str`, `ref_prefixes: tuple[str, ...]`, `required_for: tuple[str, ...] = ()`, `description: str = ""`
  - `to_body(self) -> dict[str, object]`: `{"key", "ref_prefixes"(list), "required_for"(list), "description"}`.
- `@dataclass(frozen=True) class ProviderConfigField` — `src/domains/providers/catalog.py :: ProviderConfigField`
  - 필드: `key`, `label`, `required`, `kind`, `options`, `description`
  - `to_body(self) -> dict[str, object]`: 프론트 동적 폼이 provider별 입력 필드와 필수 여부를 고정값 사용 없이 그리는 metadata.
- `@dataclass(frozen=True) class ProviderDefinition` — `src/domains/providers/catalog.py :: ProviderDefinition`
  - 필드: `category: ProviderCategory`, `key: str`, `label: str`, `status: ProviderStatus`, `adapter: str | None`, `capabilities: tuple[str, ...] = ()`, `credential_requirements: tuple[CredentialRequirement, ...] = ()`, `config_keys: tuple[str, ...] = ()`, `config_fields: tuple[ProviderConfigField, ...] = ()`, `unavailable_reason: str | None = None`
  - `to_body(self) -> dict[str, object]`: `{"category"(값 문자열), "key", "label", "status"(값 문자열), "adapter", "capabilities"(list), "credential_requirements"(list of body), "config_keys"(list), "config_fields"(list), "unavailable_reason"}`.

예외:

- `class ProviderUnavailable(ValueError)` — `src/domains/providers/catalog.py :: ProviderUnavailable`
- `class UnknownProvider(ValueError)` — `src/domains/providers/catalog.py :: UnknownProvider`

함수:

- `provider_catalog() -> tuple[ProviderDefinition, ...]` — `src/domains/providers/catalog.py :: provider_catalog`
  `disabled_provider_keys()` 가 비어 있으면 `CATALOG` 그대로. 아니면 비활성 키(`"{category}:{key}"`)에 해당하는 항목을 `status=UNAVAILABLE`, `unavailable_reason="disabled by KUBEHEAL_DISABLED_PROVIDERS"` 로 치환한 복사본 반환(그 외 필드는 원본 유지).
- `catalog_body() -> dict[str, list[dict[str, object]]]` — `src/domains/providers/catalog.py :: catalog_body`
  4개 카테고리 값 전부를 키로 초기화한 뒤 `provider_catalog()` 각 항목의 `to_body()` 를 카테고리별로 그룹핑.
- `cluster_registration_discovery() -> dict[str, object]` — `src/domains/providers/catalog.py :: cluster_registration_discovery`
  `existing-k8s`, `eks`, `gke`, `aks`, `kind`, `minikube`, 외부 콘솔 import provider의 등록 flow를 반환한다. 각 flow에는 `deploy_providers`, `default_deploy_provider`, `supports_import`, `import_candidates`와 provider `config_fields`가 포함된다.
- `get_provider(category: ProviderCategory | str, key: str) -> ProviderDefinition` — `src/domains/providers/catalog.py :: get_provider`
  category 를 `ProviderCategory(str(category))` 로, key 를 `normalize_key` 로 정규화해 탐색. 없으면 `UnknownProvider("unknown {category} provider: {key}; supported: {해당 카테고리 키 목록}")`.
- `require_available_provider(category: ProviderCategory | str, key: str) -> ProviderDefinition` — `src/domains/providers/catalog.py :: require_available_provider`
  `get_provider` 후 `status != AVAILABLE` 이면 `ProviderUnavailable("{category} provider '{key}' unavailable: {reason}")` (reason 기본 `"provider adapter is not available"`).
- `validate_provider_selection(selection: dict[str, str | None], *, credential_refs: dict[str, str] | None = None, capabilities: tuple[str, ...] = ()) -> dict[str, object]` — `src/domains/providers/catalog.py :: validate_provider_selection`
  카테고리별 선택 키를 순회: 키가 없으면 skip; `require_available_provider` 실패(`ProviderUnavailable`/`UnknownProvider`) 시 예외 메시지를 `errors` 에 누적; 성공 시 `selected[category] = definition.to_body()` + `credential_warnings` 를 `warnings` 에 누적. 반환: `{"valid": not errors, "errors": [...], "warnings": [...], "selected": {...}}`.
- `credential_warnings(definition: ProviderDefinition, refs: dict[str, str], capabilities: tuple[str, ...]) -> list[str]` — `src/domains/providers/catalog.py :: credential_warnings`
  각 `CredentialRequirement` 에 대해: `required_for` 가 비어있지 않고 요청 capabilities 와 교집합이 없으면 skip. `refs[key]` 가 없으면 `"{category} provider '{key}' needs credential_ref '{req.key}' for {required_for}"` 경고. ref 가 있는데 `ref_prefixes` 중 어느 것으로도 시작하지 않으면 `"credential_ref '{req.key}' for provider '{key}' must start with {prefixes}"` 경고.
- `provider_keys_for_category(category: ProviderCategory) -> tuple[str, ...]` — `src/domains/providers/catalog.py :: provider_keys_for_category`
  현재 카탈로그(비활성 반영)에서 해당 카테고리의 key 튜플.
- `disabled_provider_keys() -> set[str]` — `src/domains/providers/catalog.py :: disabled_provider_keys`
  `env("KUBEHEAL_DISABLED_PROVIDERS", "")` 를 콤마 분리 → strip → lower 한 집합.
- `provider_key(category: ProviderCategory, key: str) -> str` — `src/domains/providers/catalog.py :: provider_key`
  `"{category.value}:{normalize_key(key)}"`.
- `normalize_key(key: str) -> str` — `src/domains/providers/catalog.py :: normalize_key`
  `key.strip().lower().replace("_", "-")`.

## 데이터 모델 (Data Model)

DB 테이블 없음. 카탈로그는 코드 상수 `CATALOG` (frozen dataclass 튜플).

### 카탈로그 항목 구조 (`ProviderDefinition`)

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| category | ProviderCategory | 필수 | `source` / `deploy` / `cloud` / `secret` |
| key | str | 필수, 카테고리 내 유일, 케밥케이스 | provider 식별자 |
| label | str | 필수 | 표시 이름 |
| status | ProviderStatus | 필수 | `available` / `unavailable` |
| adapter | str \| None | 필수(None 허용) | 구현 어댑터 설명 문자열. unavailable 이면 None |
| capabilities | tuple[str, ...] | 기본 `()` | 제공 capability 키 |
| credential_requirements | tuple[CredentialRequirement, ...] | 기본 `()` | 자격증명 요구 목록 |
| config_keys | tuple[str, ...] | 기본 `()` | 관련 환경변수/설정 키 |
| config_fields | tuple[ProviderConfigField, ...] | 기본 `()` | 프론트 위저드 provider별 입력 필드 metadata |
| unavailable_reason | str \| None | 기본 None | unavailable 사유 |

### `CredentialRequirement`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| key | str | 필수 | credential_ref 딕셔너리의 키 |
| ref_prefixes | tuple[str, ...] | 필수 | 허용 ref 접두어 (예: `env:`, `k8s-secret:`, `aws-sm:`) |
| required_for | tuple[str, ...] | 기본 `()` | 이 capability 를 요청할 때만 필수 |
| description | str | 기본 `""` | 설명 |

### 전체 카탈로그 항목 (`CATALOG`, 선언 순서)

| # | category | key | label | status | adapter | capabilities | credential_requirements (key / ref_prefixes / required_for) | config_keys | unavailable_reason |
|---|---|---|---|---|---|---|---|---|---|
| 1 | source | `github` | 기준 저장소 | available | `GithubScmProvider + 기준 저장소 contents API` | `webhook`, `poll`, `manifest_read`, `safe_pr` | `github_token` / `env:`, `k8s-secret:`, `aws-sm:` / `private_repo`, `safe_pr` — "기준 저장소 API token or app installation token secret ref." | `GITHUB_TOKEN_REF`, `GITHUB_API_BASE`, `SCM_REPO`, `SCM_BASE_BRANCH` | — |
| 2 | source | `git-url` | Generic Git URL | unavailable | None | `manifest_read` | — | — | "checkout cache can mirror repos internally, but per-repository credential binding and allowlist are unavailable in this build" |
| 3 | source | `gitlab` | 외부 기준 저장소 A | unavailable | None | — | — | — | "external source webhook, contents, and merge request adapters are unavailable" |
| 4 | source | `bitbucket` | 외부 기준 저장소 B | unavailable | None | — | — | — | "external source webhook, contents, and pull request adapters are unavailable" |
| 5 | deploy | `manual-manifest` | Manual Manifest Export | available | `POST /targets apply=false` | `preview`, `download_manifest` | — | — | — |
| 6 | deploy | `kube-context` | Kubernetes Context Apply | available | `kubectl apply with KUBE_CONTEXT_ALLOWLIST` | `preview`, `server_apply` | — | `KUBE_CONTEXT_ALLOWLIST` | — |
| 7 | deploy | `gitops-controller` | External GitOps Controller | unavailable | None | — | — | — | "external GitOps controller adapter is unavailable; the built-in workflow-controller remains active" |
| 8 | deploy | `jenkins` | External Job Runner | unavailable | None | — | — | — | "external job trigger/status adapter is unavailable" |
| 9 | cloud | `existing-k8s` | Existing Kubernetes | available | `kubeconfig context or target agent bootstrap` | `install_target_agent`, `apply_manifest` | — | `KUBE_CONTEXT_ALLOWLIST` | — |
| 10 | cloud | `local` | Local Kubernetes | available | `scripts/up.sh` | `kind`, `minikube`, `developer_loop` | — | — | — |
| 11 | cloud | `aws` | AWS | available | `scripts/aws-up.sh + AWS credential chain` | `eks`, `ecr`, `manual_deploy` | `aws_credentials` / `aws-profile:`, `env:` / `deploy` — "AWS profile or environment credential chain for manual deployments." | `AWS_REGION`, `AWS_PROFILE`, `ECR_REPO` | — |
| 12 | cloud | `gcp` | Google Cloud | unavailable | None | — | — | — | "GKE, Artifact Registry, and workload identity adapters are unavailable" |
| 13 | cloud | `azure` | Azure | unavailable | None | — | — | — | "AKS, ACR, and workload identity adapters are unavailable" |
| 14 | secret | `env` | Environment Variable | available | `EnvSecretVault` | `local`, `ci` | — | `SECRET_VAULT_PROVIDER`, `TOKEN_VAULT_PROVIDER` | — |
| 15 | secret | `k8s-secret` | Kubernetes Secret | available | `KubernetesSecretVault` | `in_cluster`, `namespaced_secret` | — | `KUBERNETES_SERVICE_HOST`, `KUBEHEAL_K8S_API_BASE` | — |
| 16 | secret | `aws-sm` | AWS Secrets Manager | available | `AwsSecretsManagerSecretVault` | `managed_secret`, `rotation_stage` | — | `SECRET_VAULT_AWS_REGION` | — |
| 17 | secret | `vault` | HashiCorp Vault | unavailable | None | — | — | — | "HashiCorp Vault adapter is unavailable" |
| 18 | secret | `gcp-sm` | Google Secret Manager | unavailable | None | — | — | — | "Google Secret Manager adapter is unavailable" |

## 이벤트 (Events)

없음 (발행/구독 모두 없음).

## 동작 (Behavior)

### 카탈로그 조회 (`GET /providers/catalog`)

1. `disabled_provider_keys()` 로 `KUBEHEAL_DISABLED_PROVIDERS` 파싱 (`"{category}:{key}"` 소문자 집합).
2. `provider_catalog()`: 비활성 키에 해당하는 항목을 `unavailable` + 사유 `"disabled by KUBEHEAL_DISABLED_PROVIDERS"` 로 치환.
3. `catalog_body()`: 카테고리 값(`source`/`deploy`/`cloud`/`secret`) 4개 키를 모두 갖는 dict 로 그룹핑(항목이 없어도 빈 리스트 유지).

### 선택 검증 (`POST /providers/validate`)

1. 카테고리별 선택값 순회. 미지정(None/빈 값) 카테고리는 건너뜀 — 부분 선택 허용.
2. `require_available_provider`: 알 수 없는 키는 `UnknownProvider`, unavailable 은 `ProviderUnavailable` — 예외 메시지가 그대로 `errors` 항목이 된다(HTTP 오류 아님, 200 응답의 `valid=false`).
3. 유효 provider 는 `selected[category]` 에 body 로 수록하고 `credential_warnings` 평가:
   - 요구사항의 `required_for` 와 요청 `capabilities` 의 교집합이 없으면 검사 생략 (`required_for` 가 빈 튜플이면 항상 검사).
   - `credential_refs[key]` 부재 → "needs credential_ref" 경고. 접두어 불일치 → "must start with" 경고. 경고는 `valid` 에 영향 없음.
4. `valid = (errors 가 빈 리스트)`.

### 키 정규화

모든 조회는 `normalize_key`(strip → lower → `_`→`-`) 를 거친다. 예: `"GitHub"`, `"git_hub"` 대신 `"github"`, `"git-url"` 형태로 매칭.

## 불변식·오류 (Invariants & Errors)

- `CATALOG` 와 각 정의는 frozen dataclass — 런타임 변경 불가. 비활성화는 치환 복사본으로만 반영된다.
- `catalog_body()` 는 항상 4개 카테고리 키를 모두 포함한다.
- `unavailable` provider 는 `require_available_provider` 를 통과할 수 없으므로 선택 검증에서 항상 error 가 된다.
- `provider_keys_for_category` 는 비활성 여부와 무관하게 키를 나열한다(비활성은 상태만 바뀌고 목록에는 남음).
- 예외 계층: `ProviderUnavailable(ValueError)`, `UnknownProvider(ValueError)`. 라우터에서는 이 예외가 HTTP 로 전파되지 않고 `validate_provider_selection` 내부에서 `errors` 로 흡수된다. 단, `get_provider`/`require_available_provider` 를 직접 호출하는 다른 코드에서는 `ValueError` 로 잡을 수 있다.
- provider HTTP 엔드포인트는 모두 admin 세션이 필요하다. 특히 cluster discovery는 환경의 kube context/console handle 후보를 노출하므로 공개하면 안 된다.

## 설정 (Settings)

| 환경변수/설정 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `KUBEHEAL_DISABLED_PROVIDERS` (`PROVIDER_DISABLED_ENV`) | str (콤마 구분 `category:key` 목록) | `""` | 나열된 provider 를 `unavailable` 로 강제. 예: `source:github,cloud:aws` |

(카탈로그 항목의 `config_keys` 에 나열된 키들 — `GITHUB_TOKEN_REF`, `KUBE_CONTEXT_ALLOWLIST`, `AWS_REGION` 등 — 은 이 도메인이 읽지 않으며 각 어댑터 도메인/서비스의 설정이다.)
