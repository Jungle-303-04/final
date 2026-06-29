# 시크릿 관리

시크릿 도구는 강제하지 않는다. 현재 코드베이스에는 별도 `SecretProvider`
추상화가 없다. 서비스 설정은 `src/packages/config/settings.py`의 `env(name,
default)`로 환경변수에서 읽고, provider token은 평문 값이 아니라
`token_ref`/`credential_ref` 같은 참조로만 이벤트와 저장소 경계를 지난다.

외부 사용자는 SOPS/age, AWS Secrets Manager, Vault, 1Password, External
Secrets 중 무엇을 쓰든 최종적으로 Kubernetes Secret 또는 실행 환경변수로
주입하면 된다. 서비스 코드가 특정 secret manager SDK를 직접 import하지 않는
경계를 유지한다.

## 인터페이스 기준

시크릿은 서비스 간 계약과 이벤트에서 값이 아니라 참조로 다룬다.

```python
from packages.config.settings import env

database_url = env("DATABASE_URL", "postgresql://service:service@postgresql:5432/service")
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

## 팀 공유가 필요할 때

초반에는 `config/env/app.env.example`에 키 이름만 공유하고 실제 값은 메신저에 붙이지 않습니다. 값 공유가 잦아지면 1Password, Doppler 같은 팀용 시크릿 도구를 검토합니다.

## 금지

- 실제 비밀번호를 코드에 쓰지 않습니다.
- `.env`를 커밋하지 않습니다.
- 로그에 토큰, 비밀번호, 연결 문자열 전체를 출력하지 않습니다.
