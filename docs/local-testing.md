# 로컬 테스트 실행 기준

이 문서는 하드코딩 계정 없이 로컬에서 Gateway, smoke, Bruno를 확인하는 기준이다.
운영 계정은 코드에 박지 않고 `.env.local-test`로 명시해서 주입한다.

## 1단계. 로컬 테스트 env 만들기

```bash
make local-test-env
```

생성되는 파일:

```text
.env.local-test
```

기본 로컬 테스트 값:

```text
AUTH_EMAIL=admin.local@example.com
AUTH_PASSWORD=local-test-password-1234
BASE_URL=http://localhost:18080
MGMT_CONTEXT=kind-management
SMOKE_CLUSTER_ID=target
```

이 값은 로컬 전용이다.
AWS, preview, production에는 쓰지 않는다.

## 2단계. 로컬 서비스 올리기

```bash
make local-up
```

내부적으로 `.env.local-test`를 source한 뒤 `scripts/up.sh`를 실행한다.
`scripts/up.sh`는 schema bootstrap 과정에서 `AUTH_EMAIL` 계정을 `service_admin`으로 생성하거나 업데이트한다.

직접 실행해야 하면 아래와 같다.

```bash
set -a
source .env.local-test
set +a
bash scripts/up.sh
```

## 3단계. 로컬 smoke 실행

```bash
make local-smoke
```

직접 실행해야 하면 아래와 같다.

```bash
BASE_URL="http://localhost:18080" \
AUTH_EMAIL="admin.local@example.com" \
AUTH_PASSWORD="local-test-password-1234" \
MGMT_CONTEXT="kind-management" \
SMOKE_CLUSTER_ID="target" \
bash scripts/smoke.sh
```

## 4단계. Bruno로 확인

Bruno에서 `docs/api`를 Open Collection으로 열고 Environment를 `local`로 고른다.
`docs/api/environments/local.bru`는 `.env.local-test`와 같은 기본값을 사용한다.

```text
base_url: http://localhost:18080/
auth_email: admin.local@example.com
auth_password: local-test-password-1234
cluster_id: target
```

먼저 보낼 요청:

1. `00-health-auth/01-healthz`
2. `00-health-auth/02-readyz`
3. `00-health-auth/06-login`
4. `00-health-auth/07-session`
5. `05-rca-dashboard/01-dashboard-timeline`

`user_id`가 필요한 요청은 signup 또는 session 응답에서 받은 값을 사용한다.
직접 외워서 넣는 값이 아니다.

## 비밀번호를 생성해서 쓰는 경우

고정 로컬 비밀번호를 쓰지 않으려면 `.env.local-test`에서 `AUTH_PASSWORD`를 비워두고 아래처럼 실행한다.

```bash
AUTH_EMAIL="admin.local@example.com" \
PRINT_GENERATED_ADMIN_PASSWORD=1 \
bash scripts/up.sh
```

출력된 임시 비밀번호를 이후 smoke와 Bruno의 `auth_password`에 넣는다.

## AWS 테스트와 차이

AWS에서는 로컬 profile을 쓰지 않는다.
GitHub Environment secret에 `AUTH_EMAIL`, `AUTH_PASSWORD`를 넣고, 처음 환경이면 `bootstrap_admin=true`로 배포한다.
서비스 수준 smoke는 `make aws-smoke`를 기준으로 확인한다.
