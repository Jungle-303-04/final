---
source_commit: 1616d295
status: synced
---

# packages/security — Secret Vault 어댑터와 workspace credential 암호화

> 소스: `src/packages/security/` · 테스트: `tests/test_secret_vault.py`

## 책임 (Responsibility)

- [contracts — SecretVaultPort/TokenVaultPort](contracts.md#모듈-securitypy) 의 **구현**: secret ref 문자열을 해석해 env / AWS Secrets Manager / Kubernetes Secret 에서 비밀값을 읽는다.
- ref 파싱·prefix 라우팅·빌더(`build_secret_vault`/`build_token_vault`)를 제공한다. 비밀 원문은 로그에 남기지 않는다(sha256 12자 해시만).
- repository wizard가 DB에 보관해야 하는 workspace credential 원문을 Fernet 암호문으로 변환하고, `db:<provider>:<scope>` 참조 문자열을 만든다(`credentials.py`).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [config](config.md) | `env`, `get_logger` |
| import | `packages.contracts.security` | [contracts](contracts.md#모듈-securitypy) | `SecretRef`, port Protocol |
| 외부 | `cryptography.fernet` | — | workspace credential 암호화/복호화 |
| 외부(선택) | `boto3` | — | AWS Secrets Manager(미설치 시 `SecretProviderUnavailable`) |
| 외부 | Kubernetes API(stdlib `urllib`, service account) | — | k8s Secret 조회 |

## 공개 인터페이스 (Public API)

`src/packages/security/__init__.py` 는 다음을 re-export(`__all__` 명시): `AwsSecretsManagerSecretVault`, `EnvSecretVault`, `EnvTokenVault`, `KubernetesSecretVault`, `RoutingSecretVault`, `SecretNotFound`, `SecretProviderUnavailable`, `build_secret_vault`, `build_token_vault`.
`src/packages/security/credentials.py` 는 re-export하지 않고 직접 import해서 쓰는 하위 모듈이다.

### 상수 (`src/packages/security/vault.py`)

| 상수 | 값 |
|---|---|
| `SECRET_VAULT_PROVIDER_ENV` | `"SECRET_VAULT_PROVIDER"` |
| `TOKEN_VAULT_PROVIDER_ENV` | `"TOKEN_VAULT_PROVIDER"` |
| `SECRET_VAULT_AWS_REGION_ENV` | `"SECRET_VAULT_AWS_REGION"` |
| `K8S_SECRET_API_BASE_ENV` | `"KUBEHEAL_K8S_API_BASE"` |
| `K8S_SECRET_TOKEN_PATH_ENV` | `"KUBEHEAL_K8S_TOKEN_PATH"` |
| `K8S_SECRET_CA_CERT_PATH_ENV` | `"KUBEHEAL_K8S_CA_CERT_PATH"` |
| `K8S_SECRET_HTTP_TIMEOUT_SECONDS_ENV` | `"KUBEHEAL_K8S_SECRET_TIMEOUT_SECONDS"` |
| `PROVIDER_AUTO` / `PROVIDER_ENV` | `"auto"` / `"env"` |
| `PROVIDER_AWS_SECRETS_MANAGER` | `"aws-secrets-manager"` |
| `PROVIDER_KUBERNETES_SECRET` | `"kubernetes-secret"` |
| `ENV_REF_PREFIX` | `"env:"` |
| `AWS_SECRETS_MANAGER_REF_PREFIX` | `"aws-sm:"` |
| `KUBERNETES_SECRET_REF_PREFIX` | `"k8s-secret:"` |
| `DEFAULT_K8S_SECRET_TOKEN_PATH` | `"/var/run/secrets/kubernetes.io/serviceaccount/token"` |
| `DEFAULT_K8S_SECRET_CA_CERT_PATH` | `"/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"` |
| `DEFAULT_K8S_SECRET_HTTP_TIMEOUT_SECONDS` | `"5"` |
| `AWS_PROVIDER_ALIASES` | `{aws-secrets-manager, aws, aws-sm, secretsmanager, secrets-manager}` |
| `KUBERNETES_SECRET_PROVIDER_ALIASES` | `{kubernetes-secret, k8s, k8s-secret, kubernetes}` |

### 예외·데이터

- `src/packages/security/vault.py :: SecretNotFound` — `RuntimeError` 하위. ref 해석 실패/값 부재/형식 오류 전반.
- `src/packages/security/vault.py :: SecretProviderUnavailable` — `RuntimeError` 하위. provider 자체 사용 불가(boto3 미설치, in-cluster env 부재, SA 토큰 미가독 등).
- `src/packages/security/vault.py :: ParsedSecretRef` — `@dataclass(frozen=True)`: `provider: str`, `name: str`, `field: str | None = None`, `version_stage: str | None = None`.

### Vault 구현

- `src/packages/security/vault.py :: EnvSecretVault` — 개발/배포 공통 fallback: ref 를 환경변수 이름으로 해석.
```python
def read_secret(self, ref: SecretRef) -> str
```
`parse_secret_ref(default_provider="env")` 후 provider 가 env 가 아니면 `SecretNotFound`. `env(name, "").strip()` 이 빈 값이면 `SecretNotFound("secret ref not found: ...")`. 성공 시 `log_secret_read`.

- `src/packages/security/vault.py :: AwsSecretsManagerSecretVault`
```python
def __init__(self, client: Any | None = None, region_name: str | None = None) -> None
    # region_name 기본 = env(SECRET_VAULT_AWS_REGION, "")
def read_secret(self, ref: SecretRef) -> str
def client(self) -> Any    # 주입 client 우선; boto3 지연 import(미설치 → SecretProviderUnavailable)
```
Ref 예시: `aws-sm:/my-app/prod/github-token`, `aws-sm:/my-app/prod/github#token`, `aws-sm:/my-app/prod/github?stage=AWSPREVIOUS#token`. `get_secret_value(SecretId, [VersionStage])` 실패는 `SecretNotFound`(ref 는 해시로 가림). 값은 `secret_value_from_aws_response` 로 추출 후 `#field` 가 있으면 `extract_json_field`.

- `src/packages/security/vault.py :: KubernetesSecretVault` — 클러스터 내 운영 배포용.
```python
def __init__(self, secret_reader: Any | None = None, api_base: str | None = None,
             token_path: str | None = None, ca_cert_path: str | None = None) -> None
def read_secret(self, ref: SecretRef) -> str
def read_kubernetes_secret(self, namespace: str, name: str) -> dict[str, Any]  # secret_reader 주입 우선
def fetch_kubernetes_secret(self, namespace: str, name: str) -> dict[str, Any]
def kubernetes_api_base(self) -> str
def ssl_context(self) -> ssl.SSLContext | None
def service_account_token(self) -> str
```
Ref 예시: `k8s-secret:management/github-app#token`. `#key` 필수(없으면 `SecretNotFound`). `fetch` 는 `GET {api_base}/api/v1/namespaces/{ns}/secrets/{name}`, `Authorization: Bearer <SA 토큰>`, 타임아웃 env(기본 5s), CA 파일 존재 시 검증 컨텍스트. `kubernetes_api_base`: 명시/`KUBEHEAL_K8S_API_BASE` → 없으면 `KUBERNETES_SERVICE_HOST`/`PORT`(기본 443) in-cluster 조합, 둘 다 없으면 `SecretProviderUnavailable`.

- `src/packages/security/vault.py :: RoutingSecretVault` — prefix 기반 라우터.
```python
def __init__(self, env_vault: SecretVaultPort | None = None, aws_vault: SecretVaultPort | None = None,
             kubernetes_vault: SecretVaultPort | None = None) -> None
def read_secret(self, ref: SecretRef) -> str
```
무접두사·`env:` → env vault(하위 호환), `aws-sm:` → AWS(지연 생성), `k8s-secret:` → Kubernetes(지연 생성).

- `src/packages/security/vault.py :: EnvTokenVault` — `TokenVaultPort` 구현: `read_token(ref)` = 내부 secret vault(기본 `EnvSecretVault`)의 `read_secret(ref)`.

### 빌더·헬퍼 함수

```python
def build_secret_vault(provider: str | None = None) -> SecretVaultPort
    # provider or env(SECRET_VAULT_PROVIDER, "auto") 정규화 후:
    # auto→RoutingSecretVault, env→EnvSecretVault, aws-secrets-manager→AwsSecretsManagerSecretVault,
    # kubernetes-secret→KubernetesSecretVault, 그 외 ValueError
def build_token_vault(provider: str | None = None) -> TokenVaultPort
    # provider or env(TOKEN_VAULT_PROVIDER, "") → build_secret_vault(...) 를 EnvTokenVault 로 래핑
def normalize_provider(value: str) -> str
    # strip/lower, 빈 값→auto, 별칭 집합→정식 이름. 미지 값은 그대로 반환(빌더에서 ValueError)
def parse_secret_ref(ref: SecretRef, *, default_provider: str) -> ParsedSecretRef
    # 빈 ref → SecretNotFound("secret ref is empty").
    # "env:"/"aws-sm:"/"k8s-secret:" prefix 별 파서, 무접두사는 normalize_provider(default_provider)+원문
def parse_aws_secret_ref(raw: str) -> ParsedSecretRef
    # "<name>[?stage=...|version_stage=...][#field]" — name 비면 SecretNotFound
def first_query_value(params: dict[str, list[str]], key: str) -> str | None
def parse_kubernetes_secret_ref(raw: str) -> ParsedSecretRef
    # "<ns/name>[?key=...][#key]" — #field 우선, 없으면 ?key
def parse_kubernetes_secret_name(name: str) -> tuple[str, str]
    # 정확히 "<namespace>/<secret-name>" 2조각 아니면 SecretNotFound
def secret_value_from_aws_response(response: dict[str, Any]) -> str
    # SecretString 우선, SecretBinary(base64 str 또는 bytes) → utf-8, 둘 다 없으면 SecretNotFound
def secret_value_from_kubernetes_response(response: dict[str, Any], key: str) -> str
    # data[key] 존재·str·유효 base64 검증 후 utf-8 디코드(각 실패 SecretNotFound)
def extract_json_field(secret: str, field: str) -> str
    # JSON 파싱 후 "."-구분 경로 탐색. 값이 str 아니면 json.dumps(ensure_ascii=False)
def log_secret_read(provider: str, name: str, field: str | None, version_stage: str | None) -> None
    # "secret_vault_read" INFO — ref 는 redacted_ref 해시, field 는 bool 로만
def redacted_ref(value: str) -> str    # sha256 hexdigest 앞 12자
```
앵커는 모두 `src/packages/security/vault.py :: <이름>`.

### Workspace credential 암호화 (`src/packages/security/credentials.py`)

| 심볼 | 계약 |
|---|---|
| `CREDENTIAL_ENCRYPTION_KEY_ENV` | `"CREDENTIAL_ENCRYPTION_KEY"` |
| `TOKEN_PREFIX` | `"fernet:v1:"` |
| `CredentialEncryptionError` | 빈 값 저장, 키 미설정, 형식 불일치, 복호화 실패를 나타내는 `RuntimeError` 하위 예외 |
| `credential_ref(provider: str, scope: str) -> str` | `f"db:{provider}:{scope}"` 반환. 예: GitHub workspace token은 `db:github:github` |
| `encrypt_credential(value: str) -> str` | 빈 문자열이면 `CredentialEncryptionError`. `fernet().encrypt(value.encode("utf-8"))` 결과 앞에 `TOKEN_PREFIX`를 붙여 ASCII 문자열로 반환 |
| `decrypt_credential(value: str) -> str` | `TOKEN_PREFIX`가 없으면 `CredentialEncryptionError`. Fernet decrypt 후 UTF-8 문자열 반환 |
| `fernet() -> Fernet` | `CREDENTIAL_ENCRYPTION_KEY` env가 비어 있으면 fail-closed. 설정값이 32바이트 urlsafe base64 key이면 그대로 쓰고, 아니면 SHA-256 digest를 urlsafe base64로 변환해 Fernet key로 사용 |

## 동작 (Behavior)

1. 서비스는 `build_secret_vault()`(기본 auto=Routing) 또는 `build_token_vault()` 로 vault 를 얻는다.
2. `read_secret(SecretRef("k8s-secret:ns/name#key"))` → prefix 파싱 → provider 별 어댑터 → 값 반환 + 감사 로그(원문 없음).
3. AWS/K8s 클라이언트는 최초 사용 시 지연 생성(부팅 시 자격 불필요).
4. `encrypt_credential("token")`은 DB 저장용 암호문만 만들며, caller가 별도 테이블에 `credential_ref(...)`와 함께 저장한다. 응답에는 원문 token을 담지 않는다.

## 불변식·오류 (Invariants & Errors)

1. 비밀 원문·ref 원문은 로그 금지 — `redacted_ref` 해시만 기록.
2. `SecretNotFound` = "이 ref 로 값을 못 구함"(형식 오류 포함), `SecretProviderUnavailable` = "provider 자체 사용 불가" — 호출측 처리 분기 기준.
3. `build_secret_vault` 의 미지 provider 는 `ValueError`(부팅 fail-fast).
4. k8s ref 는 `<namespace>/<secret-name>#<key>` 형식 강제(key 필수).
5. 각 vault 는 자기 provider 의 ref 만 처리(타 provider ref 는 `SecretNotFound`).
6. workspace credential 암호문은 `fernet:v1:` prefix가 있어야 복호화 대상이다. `CREDENTIAL_ENCRYPTION_KEY` 미설정이면 저장도 복호화도 실패한다.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `SECRET_VAULT_PROVIDER` | str | `auto` | secret vault provider 선택(별칭 허용) |
| `TOKEN_VAULT_PROVIDER` | str | `""`(→ secret vault 설정 따름) | token vault provider |
| `SECRET_VAULT_AWS_REGION` | str | `""` | AWS 리전 |
| `KUBEHEAL_K8S_API_BASE` | str | `""`(→ in-cluster env) | k8s API base URL |
| `KUBEHEAL_K8S_TOKEN_PATH` | str | `/var/run/secrets/kubernetes.io/serviceaccount/token` | SA 토큰 경로 |
| `KUBEHEAL_K8S_CA_CERT_PATH` | str | `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt` | CA 인증서 경로 |
| `KUBEHEAL_K8S_SECRET_TIMEOUT_SECONDS` | float | `5` | k8s Secret HTTP 타임아웃 |
| `KUBERNETES_SERVICE_HOST` / `KUBERNETES_SERVICE_PORT` | str | — / `443` | in-cluster API 주소(플랫폼 주입) |
| `CREDENTIAL_ENCRYPTION_KEY` | str | — | workspace credential Fernet key. 32바이트 urlsafe base64 key 또는 임의 secret 문자열(SHA-256으로 key 파생) |
