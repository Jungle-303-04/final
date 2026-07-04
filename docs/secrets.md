# 시크릿 관리

시크릿 도구는 강제하지 않는다. 현재 코드베이스에는 기본 `EnvSecretVault`와
`EnvTokenVault`가 있다. 서비스 설정은 `src/packages/config/settings.py`의
`env(name, default)`로 환경변수에서 읽고, provider token은 평문 값이 아니라
`token_ref`/`credential_ref` 같은 참조로만 이벤트와 저장소 경계를 지난다.
GitHub Safe PR provider는 `GITHUB_TOKEN_REF`가 있으면 그 값을 환경변수 이름으로
해석하고, 없으면 기존 호환을 위해 `GITHUB_TOKEN`을 secret ref로 사용한다.

외부 사용자는 SOPS/age, AWS Secrets Manager, Vault, 1Password, External
Secrets 중 무엇을 쓰든 최종적으로 Kubernetes Secret 또는 실행 환경변수로
주입하면 된다. 서비스 코드가 특정 secret manager SDK를 직접 import하지 않는
경계를 유지한다.

## 인터페이스 기준

시크릿은 서비스 간 계약과 이벤트에서 값이 아니라 참조로 다룬다.

```python
from packages.config.settings import required_env

database_url = required_env("DATABASE_URL")
```

규칙:

- 서비스 코드는 SOPS, AWS, Vault 같은 특정 도구를 직접 import하지 않는다.
- 서비스 코드는 실행 설정은 환경변수로 읽고, provider credential은 `token_ref` 또는 `credential_ref`만 전달한다.
- 우리 내부 기본값은 env/Kubernetes Secret 주입이다.
- 특정 운영 환경용 provider는 adapter로 추가한다.

## 로컬

- `.env`는 개인 PC 전용입니다.
- `config/env/app.env.example`만 커밋합니다.
- `.env`는 `.gitignore`에 포함되어야 합니다.

```bash
make env
```

## GitHub Actions

CI/CD에서 필요한 값은 GitHub Actions Secrets를 씁니다.

- Repository secrets: 프로젝트 공통 자동화 값
- Environment secrets: `dev`, `staging`, `prod`처럼 환경별로 다른 값

처음에는 Repository secrets로 충분합니다. 배포 환경이 생기면 Environment secrets로 나눕니다.

## 운영/클라우드

운영 배포에서는 사용자가 원하는 Secret Manager를 선택할 수 있게 한다.

- AWS: Secrets Manager 또는 SSM Parameter Store
- GCP: Secret Manager
- Azure: Key Vault
- Kubernetes: External Secrets로 외부 secret을 Kubernetes Secret으로 동기화

AWS를 쓰는 사용자는 AWS provider를 붙이면 되고, Vault를 쓰는 사용자는 Vault
provider를 붙이면 된다. 오픈소스 기본 배포는 특정 클라우드를 필수로 하지
않는다.

## LLM Gateway 키

AI worker는 `packages.ai.llm.LlmGateway`를 통해 provider adapter를 선택한다.
기본값은 `LLM_PROVIDER=fake`라서 키 없이 로컬/CI가 돈다. 실제 provider를 쓰려면
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

## 팀 공유가 필요할 때

초반에는 `config/env/app.env.example`에 키 이름만 공유하고 실제 값은 메신저에 붙이지 않습니다. 값 공유가 잦아지면 1Password, Doppler 같은 팀용 시크릿 도구를 검토합니다.

## 금지

- 실제 비밀번호를 코드에 쓰지 않습니다.
- `.env`를 커밋하지 않습니다.
- 로그에 토큰, 비밀번호, 연결 문자열 전체를 출력하지 않습니다.
