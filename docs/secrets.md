# Secrets

처음에는 GitHub가 기본 제공하는 도구만 씁니다.

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

운영 배포에서는 클라우드 Secret Manager를 씁니다.

- AWS: Secrets Manager 또는 SSM Parameter Store
- GCP: Secret Manager
- Azure: Key Vault

## 팀 공유가 필요할 때

초반에는 `config/env/app.env.example`에 키 이름만 공유하고 실제 값은 메신저에 붙이지 않습니다. 값 공유가 잦아지면 1Password, Doppler 같은 팀용 시크릿 도구를 검토합니다.

## 금지

- 실제 비밀번호를 코드에 쓰지 않습니다.
- `.env`를 커밋하지 않습니다.
- 로그에 토큰, 비밀번호, 연결 문자열 전체를 출력하지 않습니다.
