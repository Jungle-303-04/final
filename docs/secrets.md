# 시크릿 관리

시크릿 도구는 강제하지 않는다. 현재 코드베이스에는 `SecretVaultPort`와
`TokenVaultPort`가 있고, 기본 provider는 `SECRET_VAULT_PROVIDER=auto`다. 서비스
설정은 `src/packages/config/settings.py`의 `env(name, default)`로 환경변수에서
읽고, provider token은 평문 값이 아니라 `token_ref`/`credential_ref` 같은 참조로만
이벤트와 저장소 경계를 지난다.

오픈소스 기본값은 로컬/CI가 쉬운 `env` fallback이다. 운영에서는 ref prefix로
provider를 선택한다. 현재 실제 adapter가 있는 prefix는 `env:`, `k8s-secret:`,
`aws-sm:`이다.

| ref 예시 | 의미 |
| --- | --- |
| `GITHUB_TOKEN` | 하위호환: 환경변수 `GITHUB_TOKEN` |
| `env:GITHUB_TOKEN` | 명시적 env provider |
| `k8s-secret:management/github-app#token` | Kubernetes Secret `management/github-app`의 `token` key |
| `k8s-secret:management/github-app?key=token` | 같은 의미의 query key 형식 |
| `aws-sm:/<app>/<env>/github-app` | AWS Secrets Manager secret string 전체 |
| `aws-sm:/<app>/<env>/github-app#token` | AWS Secrets Manager JSON field `token` |
| `aws-sm:/<app>/<env>/github-app?stage=AWSPREVIOUS#token` | rotation 검증용 version stage |

GitHub Safe PR provider는 `GITHUB_TOKEN_REF`가 있으면 그 ref를 읽고, 없으면 기존
호환을 위해 `GITHUB_TOKEN`을 secret ref로 사용한다.

외부 사용자는 SOPS/age, AWS Secrets Manager, Vault, 1Password, External Secrets 중
무엇을 쓰든 된다. 서비스 코드는 그 도구를 직접 알지 않고 `SecretVaultPort` 뒤에서
ref만 해석한다. 기본 실행은 환경변수/Kubernetes Secret으로 충분하고, AWS를 직접
읽어야 하면 `aws` optional dependency와 `aws-sm:` ref를 사용한다.

## 인터페이스 기준

시크릿은 서비스 간 계약과 이벤트에서 값이 아니라 참조로 다룬다.

```python
from packages.config.settings import required_env

database_url = required_env("DATABASE_URL")
```

규칙:

- 서비스 코드는 SOPS, AWS, Vault 같은 특정 도구를 직접 import하지 않는다.
- 서비스 코드는 실행 설정은 환경변수로 읽고, provider credential은 `token_ref` 또는 `credential_ref`만 전달한다.
- 기본값은 env/Kubernetes Secret 주입이다.
- 운영 provider는 `SecretVaultPort` adapter 뒤에 숨긴다.
- secret read audit log는 provider와 ref hash만 남기고 실제 값을 남기지 않는다.
- `/providers/catalog`는 현재 사용 가능한 secret provider와 지원 예정 provider를 구분한다.

## 로컬

- `.env`는 개인 PC 전용입니다.
- `config/env/app.env.example`만 커밋합니다.
- `.env`는 `.gitignore`에 포함되어야 합니다.

```bash
make env
```

## 배포 자동화

현재 AWS 배포는 운영자 환경의 AWS credential chain과 gitignore된 로컬 환경 파일을 쓴다.
제품 내부 workflow가 사용하는 token은 Kubernetes Secret 또는 외부 Secret Manager에서
주입하며, 저장소 파일과 event payload에는 원문을 넣지 않는다.

## 운영/클라우드

운영 배포에서는 사용자가 원하는 Secret Manager를 선택할 수 있게 한다.

- AWS: Secrets Manager 또는 SSM Parameter Store
- GCP: Secret Manager
- Azure: Key Vault
- Kubernetes: External Secrets로 외부 secret을 Kubernetes Secret으로 동기화

Kubernetes Secret을 직접 읽는 예:

```bash
SECRET_VAULT_PROVIDER=auto
TOKEN_VAULT_PROVIDER=auto
GITHUB_TOKEN_REF=k8s-secret:management/github-app#token
```

`k8s-secret:` adapter는 in-cluster service account token으로 Kubernetes API를 읽는다.
필요하면 `KUBEHEAL_K8S_API_BASE`, `KUBEHEAL_K8S_TOKEN_PATH`,
`KUBEHEAL_K8S_CA_CERT_PATH`로 API endpoint와 인증 파일 경로를 덮어쓴다.

AWS Secrets Manager를 직접 읽는 예:

```bash
SECRET_VAULT_PROVIDER=auto
TOKEN_VAULT_PROVIDER=auto
GITHUB_TOKEN_REF=aws-sm:/my-app/prod/github-app#token
SECRET_VAULT_AWS_REGION=us-east-1
```

AWS adapter는 Secrets Manager의 KMS 암호화, IAM 권한, version stage 기반 rotation
운영을 그대로 사용한다. `aws-sm:` ref를 실제로 읽을 때 `boto3`가 필요하다. 오픈소스
기본 배포는 특정 클라우드를 필수로 하지 않는다.

## LLM Gateway 키

AI worker는 `packages.ai.llm.LlmGateway`를 통해 provider adapter를 선택한다.
기본값은 `LLM_PROVIDER=unconfigured`라서 실제 호출은 fail-fast한다. 실제 provider를 쓰려면
아래 값 중 하나를 Kubernetes Secret 또는 실행 환경변수로 주입한다.

| provider | 선택 값 | 필요한 Secret |
| --- | --- | --- |
| OpenAI | `LLM_PROVIDER=openai` | `OPENAI_API_KEY` |
| OpenAI 호환 API(OpenRouter/Groq/vLLM 등) | `LLM_PROVIDER=openai-compatible` | `OPENAI_COMPATIBLE_API_KEY` 또는 `LLM_API_KEY` |
| Anthropic Claude | `LLM_PROVIDER=anthropic` | `ANTHROPIC_API_KEY` |
| Google Gemini | `LLM_PROVIDER=gemini` | `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` |

모델과 endpoint는 provider별 env로 덮어쓴다.

- 공통: `LLM_MODEL`, `LLM_BASE_URL`, `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES`, `LLM_MAX_TOKENS`
- OpenAI: `OPENAI_MODEL`, `OPENAI_BASE_URL`
- OpenAI 호환: `OPENAI_COMPATIBLE_MODEL`, `OPENAI_COMPATIBLE_BASE_URL`
- Anthropic: `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_VERSION`
- Gemini: `GEMINI_MODEL`, `GEMINI_BASE_URL`

## 세션 보안 정책

로그인 세션은 Redis 에 저장되고 `SESSION_TTL_SECONDS` 만료로 관리된다.
현재 경계와 전제:

- 세션 토큰은 httpOnly cookie(`service_session`)로만 전달. JS 접근 불가
- 토큰 탈취 시 TTL 만료 전까지 재사용 가능 — rotation/디바이스 고정은 없음
- 이 전제는 Gateway 가 프라이빗 클러스터/Ingress 뒤(TLS 종단)에 있다는 가정에 기반
- 공개 인터넷에 직접 노출하는 배포라면 세션 rotation, IP/UA 검증, 재사용 감지를
  추가하기 전까지 노출 금지
- 로그인 시도는 Redis 기반 rate limit(strike/lock)으로 제한됨
- metrics endpoint 는 `METRICS_TOKEN` 설정 시 Bearer 필수(timing-safe 비교),
  미설정 시 클러스터 내부 스크레이핑 전용 — NetworkPolicy 로 외부 차단 필수

## 팀 공유가 필요할 때

초반에는 `config/env/app.env.example`에 키 이름만 공유하고 실제 값은 메신저에 붙이지 않습니다. 값 공유가 잦아지면 1Password, Doppler 같은 팀용 시크릿 도구를 검토합니다.

## 금지

- 실제 비밀번호를 코드에 쓰지 않습니다.
- `.env`를 커밋하지 않습니다.
- 로그에 토큰, 비밀번호, 연결 문자열 전체를 출력하지 않습니다.
