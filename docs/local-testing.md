# 로컬 검증 실행 기준

이 문서는 개발자 PC에서 어디까지 확인하고, 어디부터 AWS에서 확인해야 하는지 정리한다.
현재 팀 기준은 단순하다.

로컬에서는 코드 정합성만 확인한다.
Gateway, worker, target agent, DNS, Bruno API 흐름은 AWS `aws-test` 환경에서 확인한다.

## 1단계. 빠른 코드 검증

작업 중 가장 자주 쓰는 명령은 아래다.

```bash
bash scripts/test.sh
```

이 명령은 Python import, compile, unit test를 빠르게 확인한다.
서비스를 로컬 클러스터에 올리지 않는다.
API가 실제로 붙는지는 이 단계에서 판단하지 않는다.

## 2단계. 문서와 Bruno 검증

문서나 Bruno collection을 수정했으면 아래를 먼저 돌린다.

```bash
uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
```

이 테스트가 보는 것:

1. `docs/README.md`의 canonical 진입점과 내부 링크가 유효한지 확인한다.
2. 문서가 3레벨 이하 구조를 지키는지 확인한다.
3. Bruno `docs/api` collection이 import 가능한 문법을 쓰는지 확인한다.
4. 모든 Gateway route가 Bruno request로 연결되어 있는지 확인한다.
5. Bruno 표시명이 한글로 보이는지 확인한다.

이 테스트가 실패하면 AWS로 올리기 전에 문서나 Bruno 파일을 먼저 고친다.

## 3단계. Manifest 검증

Kubernetes manifest를 수정했으면 아래를 실행한다.

```bash
make manifest-check
```

이 명령은 management/target manifest가 렌더링되고 Kubernetes client dry-run으로 파싱되는지 확인한다.
실제 EKS에 적용하지는 않는다.

## 4단계. PR 전 기본 검증

PR 또는 main 반영 전에는 아래를 기준으로 본다.

```bash
make check
```

`make check`는 코드 테스트와 manifest 검증을 함께 실행한다.
여기까지는 개발자 PC에서 확인하는 최소 기준이다.

## 5단계. 로컬 보조 profile

로컬 클러스터로 빠르게 부팅 상태를 볼 때만 아래 보조 profile을 쓴다.

```bash
make local-up
make local-smoke
```

이 경로는 팀 통합 테스트 기준이 아니다. 실제 배포 반영과 Gateway/worker/target agent 연결 검증은 AWS smoke를 기준으로 한다.

## 6단계. 실제 서비스 검증은 AWS에서 한다

서비스가 진짜로 붙는지는 현재 운영 환경값을 명시한 뒤 smoke 스크립트로 직접 확인한다.

```bash
export BASE_URL="https://k8s.woonyong.org"
export AUTH_EMAIL="<admin email>"
export AUTH_PASSWORD="<admin password>"
export SMOKE_CLUSTER_ID="<connected target cluster id>"
make smoke
```

이미지와 manifest까지 다시 배포해야 하면 먼저 `scripts/aws-up.sh`를 실행한다. 기존 EKS를
사용할 때는 `CREATE_CLUSTERS=0`, `ENSURE_EBS_CSI=0`을 명시해 인프라 생성과 앱 배포를
분리한다. 자세한 환경변수와 통과 기준은 [AWS 테스트 실행 기준](aws-testing-runbook.md)을
따른다.

## 7단계. Bruno는 AWS profile을 기본으로 쓴다

Bruno에서 `docs/api`를 Open Collection으로 열고 Environment를 `aws-test`로 고른다.

`aws-test` 기본값:

```text
base_url: https://k8s.woonyong.org/api/
auto_login: false
auth_email: replace-with-auth-email
auth_password: replace-with-auth-password
cluster_id: cluster-1
```

Bruno는 자격증명을 저장하지 않는 공용 `aws-test` 환경만 사용한다. 인증 자체를 검증할 때 필요한 계정은 팀 Secret 동기화 절차로 로컬 `.env.local-test`에만 받고 Bruno 파일에는 기록하지 않는다.
문서나 collection 파일에는 실제 이메일/비밀번호를 쓰지 않는다.

먼저 보낼 요청:

1. `00-health-auth/01-healthz`
2. `00-health-auth/02-readyz`
3. `00-health-auth/06-login`
4. `00-health-auth/07-session`
5. `05-rca-dashboard/01-dashboard-timeline`

`user_id`, `agent_token`, `command_id`, `incident_id`처럼 실행 중 생기는 값은 이전 응답에서 받은 값을 사용한다.
직접 외워서 넣는 값이 아니다.

## 8단계. URL이 안 열릴 때

먼저 console origin 뒤의 API health를 확인한다.

```bash
curl -i https://k8s.woonyong.org/api/healthz
```

정상 기준:

```json
{"status":"ok","service":"api-gateway"}
```

`HTTP/2 530`과 `error code: 1016`이 나오면 Bruno 문제가 아니라 Cloudflare DNS origin 연결 문제다.
이때는 [AWS 테스트 실행 기준](aws-testing-runbook.md)의 Cloudflare 1016 절차를 따른다.

## 로컬 profile은 언제 쓰는가

Bruno `local` profile은 개인이 Gateway를 별도로 띄워서 빠르게 확인할 때만 남겨 둔 보조 profile이다.
팀 통합 테스트 기준은 아니다.

팀원에게 재현을 요청할 때는 `aws-test` profile과 AWS CD run id를 기준으로 말한다.

## 팀 환경과 비밀값

GitHub Actions Secret은 workflow 안에서만 복호화되며 팀원 PC로 다시 내려받을 수 없다.
따라서 로컬 개발 환경의 정본으로 사용하면 안 된다. 팀 공유 test 비밀값의 정본은
AWS Secrets Manager의 `kubeheal/test/team`이고, GitHub에는 CI가 필요한 일부 값만
별도로 동기화한다.

AWS 자격증명을 준비한 뒤 다음 명령으로 `.env.local-test`를 만든다. 출력 파일은
권한 `0600`이며 값은 터미널에 표시하지 않는다.

```bash
bash scripts/bootstrap-team-env.sh
```

GitHub 저장소 관리 권한이 있는 운영자는 같은 AWS secret에서 Actions Secret을
동기화할 수 있다. secret 값은 표준 입력으로 전달되며 command 인자나 Git 이력에
남지 않는다.

```bash
bash scripts/sync-github-actions-secrets.sh
```

장기 AWS access key는 팀 secret과 GitHub Secret에 넣지 않는다. 각 팀원은 AWS
로그인 검증은 로컬 `.env.local-test` 값을 요청 시점에만 주입한다. `.env*`와 개인 Bruno 파일은 Git뿐 아니라 Docker
build context에서도 제외한다.
