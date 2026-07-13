---
title: AWS dev 배포 상태
status: observed-live-snapshot
observed_at: 2026-07-13T21:52:00+09:00
update_mode: manual-snapshot
---

# AWS dev 배포 상태

팀원이 현재 접속 가능한 환경과 실제 배포 artifact를 확인하는 단일 진입점이다. 배포 파이프라인이
이 파일을 갱신하는 단계는 아직 연결되지 않았으므로 관측 시각을 먼저 확인한다.

## 접속

- URL: <https://k8s.woonyong.org>
- 실측: `GET /api/healthz`가 HTTP 200과
  `{"status":"ok","service":"api-gateway"}`를 반환했다.
- 계정 파일 생성:

```bash
TEAM_SECRET_ID=kubeheal/test/team \
TEAM_AWS_REGION=ap-northeast-2 \
bash scripts/bootstrap-team-env.sh
```

명령은 AWS Secrets Manager `kubeheal/test/team`의 `AUTH_EMAIL`, `AUTH_PASSWORD`,
`BASE_URL`을 읽어 gitignore된 `.env.local-test`를 권한 `0600`으로 만든다. secret 값은 이 문서나
shell 출력에 복사하지 않는다. 해당 secret을 읽을 IAM 권한이 필요하다.

## 배포 artifact

| 항목 | 관측값 |
|---|---|
| ECR tag | `kubernetes-ops-service:c704729c1b` |
| Pod image digest | `sha256:132cbc945004812ae3367c21a3408da8f3c9ab1a01b5870ffdea1157c83f5d0a` |
| tag-derived source SHA | `c704729c1b16a6fd397e1c7285249f80517a01a8` |
| 관측 당시 canonical | `9728d8e6f1eb996a4e522d8f9451a3ff351a3864` |

Deployment와 ECR에 OCI source revision attestation이 없으므로 digest가 실제 실행 artifact의
권위값이다. source SHA는 tag 이름으로부터 파생한 값이며 attestation 증명이 아니다.

## 확인이 더 필요한 항목

- Secrets Manager의 `BASE_URL`은 실측 public URL과 일치하지 않았다. 계정 파일 생성 뒤 URL을
  public URL로 확인해야 한다.
- 실제 로그인 smoke는 수행되지 않았다. 현재 GitHub 배포 변수 `AWS_BOOTSTRAP_ADMIN=0`이므로
  관리자 bootstrap 실행 여부를 DB와 로그인으로 확인해야 한다.
- live DB에는 `alembic_version`이 없고 create-all 기반 부분 스키마가 있어 임의 stamp를 할 수 없다.
- live Deployment의 `DEV_AUTH_BYPASS=0` 명시값은 확인되지 않았다. 새 배포 전 렌더와 live 값을
  모두 차단 게이트로 검증해야 한다.
