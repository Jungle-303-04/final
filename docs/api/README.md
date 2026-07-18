# Bruno API 테스트 가이드

이 폴더는 Gateway API를 사람이 직접 눌러보는 Bruno collection이다.
Bruno에서 import할 때는 repository root나 `docs`가 아니라 반드시 `docs/api` 폴더를 Open Collection으로 연다.
`docs/api/bruno.json`이 보이는 폴더가 collection root다.

## 1단계. 컬렉션 열기

1. Bruno를 연다.
2. `Open Collection`을 누른다.
3. 이 경로를 선택한다.

```text
docs/api
```

4. 왼쪽에 `00 상태와 인증`부터 `16 RCA 실제 E2E 워크플로우`까지 폴더가 보이면 정상이다.
5. 오른쪽 위 Environment에서 `aws-test`를 고른다.
6. Environment 목록에는 `aws-test` 하나만 보여야 한다.

## mTLS 인증서 최초 등록

`aws-test`는 로그인 계정 대신 팀원별 mTLS 인증서로 보호되는
`https://dev-k8s.woonyong.org/api/`를 사용한다. Bruno는 운영체제나 Chrome에 설치한
인증서를 자동으로 선택하지 않으므로 컬렉션마다 한 번 등록해야 한다.

1. Bruno에서 `docs/api` 컬렉션의 Settings를 연다.
2. 전달받은 `팀원N-dev-console.pem`과 `팀원N-dev-console.key`를 `docs/api/.certs/`에
   각각 `dev-console.pem`, `dev-console.key`라는 이름으로 둔다.
3. 컬렉션을 다시 열면 `bruno.json`의 Client Certificates 설정이 두 파일을 사용한다.
4. 설정 화면에서 Domain `dev-k8s.woonyong.org`, Type `Certificate`가 활성화됐는지 확인한다.
5. `00-health-auth/07-session`을 보내 `workspace_id=default`, `roles=[service_admin]`을 확인한다.

`docs/api/.certs/`는 gitignore 대상이며 인증서와 개인 키를 절대 커밋하지 않는다.
`.p12`와 설치 암호는 Chrome 설치용이고, `.pem`과 `.key`는 Bruno용이다.
현재 5개 인증서는 팀 공용 개발 주체 하나로 매핑되므로 감사 로그의 actor는
`TRUSTED_PROXY_AUTH_USER_ID`로 동일하게 기록된다. Agent API의 `x-agent-token`, RCA 테스트의
`x-rca-test-token`, webhook 서명처럼 별도 보안 경계를 가진 값은 mTLS로 대체되지 않는다.

깨졌다면 거의 항상 다른 폴더를 연 것이다. `docs/api` 바로 아래에 `bruno.json`과 `environments` 폴더가 있어야 한다.
파일 경로는 `00-health-auth`처럼 영어 slug를 유지하고, Bruno 화면 표시명은 한글로 맞춘다.

## RCA 실제 E2E 워크플로우를 별도로 실행하기

`16 RCA 실제 E2E 워크플로우`는 일반 API 회귀 runner와 분리되어 있다. 이 폴더는
실제 target cluster의 `sandbox`에 장애 Deployment를 만들기 때문에 Bruno UI에서만
명시적으로 실행한다.

1. `01`에서 catalog가 제공하는 시나리오와 현재 실행 가능 상태를 조회한다. 항목 수는 YAML에서 동적으로 결정된다.
2. `02`에서 `cluster_id + scenario_id`만 보내 실제 장애와 agent 관측을 시작한다.
3. `03`에서 같은 run의 장애 생성, 관측, evidence, RCA, plan, 선택, cleanup 상태를 반복 확인한다.
4. `04`~`06`에서 실제 evidence, RCA 결과, recovery 후보를 차례로 확인한다.
5. PR/실행까지 확인할 때만 `rca_select_confirmation`을
   `SELECT:<rca_correlation_id>`로 설정하고 `07`을 보낸다.
6. `08`에서 선택 상태를 확인하고 `09` cleanup을 보낸 뒤, `10`에서 실제 완료를 확인한다.

최초 실행 전 오른쪽 위 Environment에서 `aws-test` 편집을 열고 `rca_test_token`의
Secret 칸에 로컬 값을 한 번 저장한다. Secret 값은 Bruno 로컬 보안 저장소에만 두며
tracked `.bru` 파일에는 입력하지 않는다.

파이프라인은 비동기다. `03`~`06`이 아직 처리 중이면 새 run을 만들지 말고 같은
요청을 잠시 뒤 다시 보낸다. 상세 사용법과 안전 경계는
`16-rca-debug/README.md`가 단일 가이드다.

`ready`는 실제 target에서 evidence → expected root cause → recovery plan → cleanup 잔여 0까지
완주한 시나리오만 뜻한다. 현재 live 완주가 확인된 항목은 `image.wrong-tag`다. 새 시나리오는
`scripts/rca_scenario.py scaffold`로 `verification_pending` 상태에서 시작하고, `validate`와 fixture
test를 통과한 뒤 전용 token + service admin + `x-rca-test-verification: true` 경계에서 live
검증한다. evidence, expected root cause, recovery plan, cleanup 잔여 0을 모두 확인한 뒤에만
승격한다. raw manifest/shell/synthetic evidence 입력과 management
cluster 실행은 허용하지 않는다.

## 전체 Runner 실행

팀 공용 개발 API는 mTLS 프록시 주체와 cluster별 `x-agent-token`을 각각 검증한다.
`aws-test` Environment는 `auto_login: false`이며, 보호 API는 인증서가 검증된 개발 주체로
실행된다. Agent 요청은 등록 응답에서 1회 받은 실제 `agent_token`을 추가로 사용한다.

컬렉션 전체 Runner의 기본값은 안전 모드다. `auth_flow_verification: false`이면 placeholder 계정을
사용하는 가입·재전송·로그인·승인·검증·로그아웃 요청을 건너뛴다.
`rca_test_verification: false`이면 실제 target에 장애를 만드는 `16 RCA 실제 E2E 워크플로우`를
전부 건너뛴다. 해당 흐름을 명시적으로 검증할 때만 필요한 Secret을 로컬에 넣고 플래그를
`true`로 바꾼다. 기본 Runner에서 `Skipped`는 안전 경계가 동작한 정상 결과다.
열린 dead letter가 없으면 재처리 요청도 `Skipped`로 남으며, metrics token이 배포에 없으면
metrics 요청의 `503`은 명시적인 미설정 상태로 통과한다.

기본 Runner는 실제 `game-server` 대신 실행마다 `bruno-<시각>-<pid>` 형식의 격리
cluster를 등록해 성공 경로를 검증하고 종료 trap에서 해제한다. CLI Runner는 Bruno의
client certificate config가 필요하며 기본 경로는 `~/.kubeheal/bruno-client-cert-config.json`이다.
Bruno 앱 전체 실행은 `cluster_purge: false`로 빠른 soft unregister를 사용하고, CLI Runner만
고유한 test fixture에 `cluster_purge=true`를 주입해 물리 삭제한다.
다른 경로는 `BRUNO_CLIENT_CERT_CONFIG`로 지정한다. 기존 DLQ replay, 임의 목록 항목 삭제, 실제 cluster
scale/restart, 외부 webhook 전송은 기본 Runner에서 제외하고 해당 요청을 명시적으로
선택했을 때만 실행한다.

```bash
bash scripts/run-bruno-aws.sh
```

같은 순서를 Bruno 앱에서 실행할 때는 `00-health-auth/01`, `02`, `03`, `07`로 연결과 개발
주체를 확인한 뒤 `01`부터 `13` 폴더를 실행한다. mTLS 개발 주체는 cookie 세션이 아니므로
`00-health-auth/10 로그아웃`을 호출해도 인증서가 등록된 요청의 개발 권한은 유지된다.

## 2단계. 변수 채우기

대부분의 변수는 요청 응답에서 자동으로 채워지므로 직접 넣을 값은 몇 개 없다.

직접 채워야 하는 값은 처음 한 번만 본다.

1. `base_url`은 Gateway API 주소다. 팀 공용 `aws-test`는 `https://dev-k8s.woonyong.org/api/`로 고정한다. Bruno 요청 파일은 `{{base_url}}providers/validate`처럼 붙기 때문에 값이 반드시 `/`로 끝나야 한다.
2. `auto_login`은 `false`로 유지한다. 일반 사용자 로그인 회귀는 공개 운영 주소에서 별도로 수행한다.
3. `auth_email`/`auth_password` placeholder는 인증 API 자체를 명시적으로 검증할 때만 사용한다.
4. `github_webhook_secret`은 배포에 설정된 `GITHUB_WEBHOOK_SECRET` 값이다. 이 값을 채우면 webhook signature를 Bruno가 요청 직전에 자동 계산한다.
5. `metrics_token`과 `alertmanager_token`은 해당 외부 입구 인증을 별도로 검증할 때만 넣는다.
6. `service_image`는 target manifest 발급 시 쓸 agent 이미지다.
7. `cluster_id`/`cluster_id_2`의 저장 기본값은 `api-verification-target`이고 CLI Runner는 고유 ID로 덮어쓴다. 실제 `game-server`/`demo-server` 드릴다운이 필요하면 같은 `aws-test`에서 실행 변수만 명시적으로 덮어쓴다.
8. `rca_test_token`은 오른쪽 위 `aws-test` 환경 편집 화면의 Secret 칸에만 저장한다. collection과 환경 파일에는 실제 값이나 placeholder를 기록하지 않는다.

요청 순서대로 실행하면 아래 값은 자동으로 채워진다.

1. `workspace_id`, `user_id`는 `07-session` 응답의 mTLS 개발 주체 값으로 확인한다.
2. `agent_token`은 `02-target-admin/01-register-target-dry-run` 성공 후 저장된다.
3. `command_id`는 `04-command/02-debug-query` 또는 `03-agent-command-poll` 성공 후 저장된다.
4. `evidence_key`, `evidence_job_id`는 `03-agent-runtime/05-schedule`, `06-poll` 성공 후 저장된다.
5. `conversation_id`는 `07-ai/01-create-conversation` 성공 후 저장된다.
6. `incident_id`는 `05-rca-dashboard/01-dashboard-timeline`에 incident row가 있을 때 저장된다.
7. `dead_letter_id`는 `08-ops-dlq/01-dead-letters`에 항목이 있을 때 저장된다.
8. `org_id`, `group_id`, `access_id`는 `09-management-console` 목록/생성/부여 요청에서 저장된다.
9. `alert_channel_id`는 `13-alert-channels/01-list-alert-channels`나 `02-upsert-alert-channel` 성공 후 저장된다.
10. `github_webhook_signature`는 `github_webhook_secret`이 채워져 있으면 요청 직전에 자동 계산된다.

아래는 각 값의 의미 설명이다.

`base_url`은 Gateway API 주소다. `aws-test` Environment와 collection 기본 변수는
`https://dev-k8s.woonyong.org/api/`를 쓴다. 이 호스트는 Cloudflare mTLS 검증을 통과한 뒤
개발 전용 프록시로만 연결된다.

운영 콘솔은 `https://k8s.woonyong.org/`, 개발 콘솔과 Bruno API는
`https://dev-k8s.woonyong.org/`를 사용한다. Bruno `base_url`에는 `/api/`까지 포함한다.

Bruno 화면에서 Environment를 아직 고르지 않았더라도 `docs/api/collection.bru`의 기본 변수 때문에 `{{base_url}}`이 `https://dev-k8s.woonyong.org/api/`로 풀린다.
실제 API 테스트는 오른쪽 위 Environment에서 유일한 공용 환경인 `aws-test`를 선택한다.

`auth_email`과 `auth_password`는 실제 로그인 API 자체를 별도로 검증할 때만 쓰며,
일반 `aws-test` 요청 인증에는 사용하지 않는다. collection과 환경 기본값은 placeholder다.

```text
auth_email: replace-with-auth-email
auth_password: replace-with-auth-password
```

AWS 라이브 계정은 문서/collection 파일에 쓰지 않는다. Bruno 인증 회귀가 필요하면 팀 Secret으로 받은 로컬 값을 실행 시점에만 주입한다.

`auto_login`은 기본적으로 `false`다. mTLS 인증서는 Bruno 전송 계층에서 제시되고,
개발 프록시가 검증된 요청에만 고정 개발 주체를 부여하므로 `/auth/login` 선행 호출이 필요 없다.

`aws-test`의 `cluster_id`/`cluster_id_2`는 격리된 `api-verification-target`이며,
CLI Runner에서는 충돌을 피하려고 실행별 고유 ID를 사용한다.
단, 두 클러스터에 cluster-agent가 아직 배포되지 않았다면 `clusters` 목록/인벤토리는 비어 있을 수 있다 —
먼저 `02-target-admin/01`로 매니페스트를 받아 각 대상 클러스터에 apply해야 데이터가 흐른다.
`node_name`은 `05-rca-dashboard/09-node-summary.bru` 응답의 `nodes[].name` 중 하나로 바꿔 넣는다.
노드명이 비어 있거나 존재하지 않으면 `10-node-pods-summary`는 404가 정상이다.

팀 통합 테스트는 `aws-test` Environment가 기준이다.
로컬에서는 [로컬 검증 실행 기준](../local-testing.md)을 따라 코드 정합성과 Bruno 문법만 확인하고, 실제 API 흐름은 AWS에서 확인한다.
Bruno 환경은 `docs/api/environments/aws-test.bru` 하나만 관리한다. 로컬 스택은 별도 smoke 스크립트로 검증하고 Bruno 계약은 팀 공용 AWS 배포를 기준으로 한다.

`agent_token`은 `02-target-admin/01-register-target-dry-run.bru` 응답값을 사용한다.
Agent endpoint는 환경과 무관하게 이 토큰을 검증한다.
이 값이 있으면 `02-target-admin/03-install-manifest-by-token.bru`로 원라인 설치 링크가 실제 YAML을 반환하는지도 확인할 수 있다.

`alert_webhook_url`은 알림 채널이 실제로 POST할 대상이다.
collection 기본 생성 요청은 `enabled: false`로 보내므로 기본값 `https://example.invalid/service-alerts`가 있어도 실제 알림 발송에는 쓰이지 않는다.
실제 운영 채널을 켤 때만 팀이 쓰는 webhook URL로 바꾸고 `enabled`를 `true`로 수정한다.

`github_webhook_signature`는 webhook body와 secret으로 다시 계산해야 한다. body를 바꾸면 signature도 반드시 다시 바꾼다.

`alertmanager_token`은 `05-rca-dashboard/04-alertmanager-webhook.bru`에서만 쓴다.
배포에 `ALERTMANAGER_WEBHOOK_TOKEN`이 설정되어 있지 않으면 이 요청은 `503`이 정상이고, 토큰이 틀리면 `401`이 정상이다.

## API 의미 사전

여기서는 Bruno 왼쪽 요청 파일 이름을 기준으로 API 의미를 정리한다.
처음 보는 사람은 이 부분을 먼저 읽고, 그다음 아래 실행 단계를 따라가면 된다.
각 요청의 실제 파일명은 영어 slug지만, Bruno 화면의 `name`은 한글로 표시된다.

권한 기준은 세 가지로 보면 된다.
인증 없이 보는 상태 확인 API, 로그인 세션이 필요한 운영자/사용자 API, `x-agent-token`이 필요한 target agent API다.
로그인 세션 API는 mTLS 개발 프록시가 제공하는 고정 개발 주체로 실행된다.
target agent API는 Environment의 `agent_token`이 맞아야 한다.

### 00-health-auth

`01-healthz`는 Gateway 프로세스가 살아 있는지 보는 API다.
DB나 내부 워커 상태까지 깊게 보지 않고, 배포 주소와 라우팅이 맞는지 가장 먼저 확인한다.
이게 실패하면 `base_url`, DNS, Ingress, 배포 상태부터 본다.

`02-readyz`는 Gateway가 요청을 받을 준비가 되었는지 보는 API다.
코드 기준으로 DB readiness를 가볍게 확인한다.
이게 실패하면 API 문법 문제가 아니라 서버가 아직 의존성 준비를 끝내지 못한 상태로 보면 된다.

`03-openapi-json`은 현재 배포된 Gateway가 들고 있는 실제 HTTP 계약을 확인하는 API다.
문서와 코드가 헷갈릴 때는 이 응답의 `paths`를 먼저 본다.
Bruno collection을 수정할 때도 이 API로 route가 실제 배포에 있는지 확인한다.

`04-signup`은 새 사용자를 등록하고 이메일 검증 이벤트를 만드는 API다.
바로 로그인 가능한 계정을 만드는 것이 아니라, 이메일 검증과 운영자 승인 흐름으로 들어가게 한다.
온보딩 중 새 테스트 계정을 만들 때 사용한다.

`05-resend-verification`은 이메일 검증 메일을 다시 보내는 API다.
가입은 되었지만 검증 토큰을 놓쳤거나 만료된 경우에만 사용한다.
이미 검증이 끝난 계정이면 다시 검증할 필요가 없다는 형태로 응답할 수 있다.

`06-login`은 운영자 또는 팀원 계정의 실제 비밀번호 인증 자체를 확인하는 API다.
기본 개발 흐름에는 필요하지 않으며, mTLS 프록시를 통과한 이후 보호 API의 주체는 고정 개발 주체가 우선한다.

`07-session`은 현재 cookie가 어떤 사용자, workspace, roles로 인식되는지 확인하는 API다.
권한 문제를 디버깅할 때 제일 먼저 본다.
로그인은 성공했는데 dashboard나 command가 막히면 이 응답의 `roles`와 `workspace_id`를 확인한다.

`08-approve-user`는 운영자가 새 사용자를 승인하는 API다.
일반 사용자가 자기 자신을 승인할 수 없고, admin session이 필요하다.
회원가입과 이메일 검증은 끝났는데 로그인이 막히는 팀원이 있으면 이 API로 상태를 풀어준다.

`09-verify-email`은 이메일 검증 토큰을 처리하는 API다.
브라우저 redirect 흐름을 쓰는 endpoint라 Bruno에서는 성공 응답이 JSON이 아닐 수 있다.
계정 검증 흐름 자체를 확인하거나 토큰이 맞는지 볼 때 사용한다.

`10-logout`은 현재 session을 종료하고 cookie를 지우는 API다.
권한이 다른 계정으로 다시 테스트할 때 먼저 로그아웃해서 이전 cookie가 남지 않게 한다.

### 01-providers

이 폴더의 요청은 provider catalog와 cluster 등록 후보를 다루므로 admin 권한이 필요하다.
유효한 mTLS 인증서를 등록하면 고정 개발 주체의 `service_admin` 권한으로 바로 보낼 수 있다.

`01-provider-catalog`는 현재 Gateway가 알고 있는 provider 선택지를 보여주는 API다.
target 등록 전에 어떤 source, deploy, cloud, secret provider 조합을 쓸 수 있는지 확인한다.
민정이 target/provider 쪽을 바꾸면 이 응답도 같이 확인해야 한다.

`02-validate-provider-selection`은 선택한 provider 조합이 실제로 허용되는지 검사하는 API다.
credential reference가 필요한 조합인데 값이 빠졌는지, 요청한 capability가 provider와 맞는지 확인한다.
target 등록 전에 이 요청이 통과해야 이후 manifest와 agent 설정이 덜 흔들린다.

### 02-target-admin

`01-register-target-dry-run`은 target cluster를 등록하고 agent 설치 manifest와 agent token을 받는 API다.
파일 이름에 dry-run이 있지만 코드 기준으로는 `apply: false`라서 manifest를 Kubernetes에 직접 적용하지 않을 뿐이다.
target registry 저장, 기본 agent policy 저장, desired state 저장, agent token 발급은 실제로 수행된다.
응답의 `agent_token`은 이후 `x-agent-token`이 필요한 agent 요청에 그대로 쓴다.

`02-update-cluster-policy`는 특정 cluster의 agent policy를 바꾸는 API다.
provider job 주기, evidence provider 사용 여부, 실패 정책 같은 target 내부 동작을 바꿀 때 사용한다.
이 값을 바꾸면 agent는 `get-agent-policy`로 새 generation을 받아가고, provider job scheduling 기준도 같이 바뀐다.

`03-install-manifest-by-token`은 `agent_token`으로 설치 manifest YAML을 다시 받아오는 API다.
`01-register-target-dry-run` 응답의 `install_command`가 내부적으로 호출하는 경로와 같다.
토큰이 맞으면 `apiVersion`과 `kind`가 들어 있는 Kubernetes YAML이 오고, 토큰이 틀리면 404가 온다.

`04-update-scheduling-profiles`는 cluster별 fast-lane scheduling profile을 바꾸는 API다.
profile은 특정 네임스페이스 전용 고정값 사용이 아니라 `namespaces`/`labels`/`workload_names` selector로 선택한다.
선택된 workload는 PriorityClass, warm node label 선호/필수, optional schedulerName, pre-pull 후보 이미지, 짧은 termination grace 값을 받을 수 있다.
`gitops-control-critical`은 cluster-agent와 제어 경로 pod용이고, `gitops-fast-lane`은 선택된 target workload용이라 우선순위 경계를 분리한다.
management 배포 manifest에는 제어 경로용 PriorityClass만 두고, target 설치 manifest에만 fast-lane PriorityClass를 포함한다.

`05-get-scheduling-profiles`는 현재 저장된 scheduling profile만 읽는다.
프론트는 이 응답으로 fast-lane 토글, 노드 배치 표시, pre-pull 후보 이미지 표시를 구성한다.

Target 등록 요청의 `loki_base_url`, `tempo_base_url`은 target cluster 안에서 agent가 실제로 호출할 관측 스택 주소다.
Prometheus는 등록 또는 설치 manifest에 주소를 넣지 않고, cluster 범위 `/integrations/prometheus` revision 계약을 agent가 검증한 후에만 동적 연결한다.
`otel_traces_endpoint`는 provider 조회 주소가 아니라 cluster-agent 자신의 span을 OpenTelemetry collector로 내보낼 endpoint다.

### 03-agent-runtime

`01-agent-connect`는 target agent가 Gateway에 자기 상태를 알리는 API다.
body의 cluster 값보다 token identity를 신뢰하므로, agent token이 어느 cluster용인지가 중요하다.
성공하면 agent connected event가 event bus로 들어간다.

`02-get-agent-policy`는 target agent가 자기 cluster policy를 가져가는 API다.
agent가 알고 있는 generation보다 서버 generation이 높을 때만 새 policy를 받을 수 있다.
응답의 `policy`가 `null`이면 지금 agent가 더 받아갈 변경이 없다는 뜻이다.

`03-policy-status`는 agent가 policy 적용 상태를 Gateway에 저장하는 API다.
정책을 받았는지, 몇 generation까지 적용했는지, 적용 실패가 있었는지 같은 값을 남긴다.
찬빈이 dashboard에서 agent 상태를 보여주려면 이 저장값을 기준으로 화면을 만든다.

`04-reconcile-status`는 agent가 desired state reconcile 상태를 Gateway에 저장하는 API다.
target 등록이나 정책 변경 후 실제 cluster에 맞춰진 상태를 기록한다.
운영자는 이 값으로 "설정은 했는데 agent가 실제로 적용했는지"를 확인한다.

`05-schedule-evidence-jobs`는 agent가 evidence window 하나를 기준으로 provider job을 큐에 넣는 API다.
요청의 `provider_keys`와 저장된 policy를 합쳐 kubernetes, metrics, logs, traces 중 실제 실행할 job을 만든다.
성공하면 `evidence_key`와 `job_ids`가 생기고, provider별 worker가 poll해서 가져갈 수 있다.

`06-poll-evidence-job`은 provider worker가 자기 provider의 다음 job을 lease하는 API다.
예를 들어 `provider_key=kubernetes`면 Kubernetes snapshot job만 가져간다.
`job: null`이면 오류가 아니라 지금 가져갈 일이 없다는 뜻이다.

`07-complete-evidence-job`은 provider worker가 job 결과를 저장하는 API다.
각 provider 결과가 모이면 Gateway가 하나의 evidence payload로 묶고 `ClusterEvidenceReceived` event를 발행한다.
아직 다른 provider 결과를 기다려야 하면 `accepted: true`만 오고 `event_id`가 없을 수 있다.

`08-direct-agent-evidence`는 job 큐를 거치지 않고 agent가 완성된 evidence를 직접 보내는 API다.
수동 테스트나 단순한 end-to-end 확인에 유용하다.
정식 provider 흐름은 `schedule -> poll -> complete` 순서로 확인하는 것이 기준이다.

### 04-command

`01-manual-command`는 사람이 특정 cluster에 실행할 command를 요청하는 API다.
요청은 바로 agent에게 전달되지 않고 `CommandRequested` event로 들어간다.
command worker가 정책과 승인 조건을 확인한 뒤 agent command queue에 넣는다.

`02-debug-query`는 사람이 Prometheus query 하나를 agent command queue에 직접 넣는 API다.
RCA 중 "이 metric을 지금 cluster agent가 직접 조회할 수 있는지" 확인할 때 쓴다.
성공하면 `command_id`가 나오고, 이 값을 다음 poll/start/heartbeat/result 요청에서 사용한다.

`03-agent-command-poll`은 agent가 자기 cluster에 대기 중인 command를 가져가는 API다.
command가 있으면 lease가 걸린 상태로 내려오고, 없으면 `command: null`이 올 수 있다.
agent는 외부에서 inbound로 호출되는 대신 이 API로 outbound polling을 한다.

`04-agent-command-start`는 agent가 lease한 command 실행을 시작했다고 표시하는 API다.
`lease_id`와 `agent_id`가 맞아야 하며, 이 값은 이후 heartbeat와 result에도 이어진다.
이 요청 뒤 command 상태는 running으로 바뀐다.

`05-agent-command-heartbeat`는 실행 중인 command lease를 연장하는 API다.
오래 걸리는 작업에서 이 요청을 주기적으로 보내지 않으면 lease가 만료되어 재시도 대상이 될 수 있다.
agent는 command 실행 중 끊기지 않았다는 신호로 이 API를 사용한다.

`06-agent-command-result`는 agent가 command 실행 결과를 Gateway에 제출하는 API다.
성공하면 command completed event가 stage되고, 이후 RCA rollout 진단이나 workflow-controller가 이 결과를 사용한다.
실패 결과도 이 API로 보내며, 실패는 숨기지 않고 결과 payload에 남긴다.

`07-command-status`는 운영자가 특정 command의 현재 상태와 agent가 제출한 실제 결과를 조회하는 API다.
`02-debug-query` 또는 `03-agent-command-poll`에서 저장된 `command_id`를 넣어 확인한다.
성공하면 `command_id`, `cluster_id`, `correlation_id`, `action`, `status`, `result`, `completed_at`이 온다.
권한이 없거나 command가 없으면 401/403/404로 명확하게 실패한다.

### 05-rca-dashboard

`01-dashboard-timeline`은 현재 사용자가 볼 수 있는 RCA timeline을 조회하는 API다.
`cluster_id`를 넣으면 해당 cluster에 대해 `RCA_READ` 권한을 검사한다.
`cluster_id`를 빼면 사용자가 접근 가능한 cluster만 필터링해서 보여준다.

`02-dashboard-incident`는 특정 incident 하나의 상세 내용을 조회하는 API다.
timeline에서 받은 `incident_id`로 이어서 호출한다.
권한이 없거나 해당 incident가 없으면 `404` 또는 접근 거부가 날 수 있다.

`04-alertmanager-webhook`은 외부 Alertmanager가 firing 알림을 보내는 입구다.
토큰이 맞고 cluster가 등록되어 있으면 `ClusterEvidenceReceived` 흐름으로 들어간다.
resolved 알림만 들어오면 이벤트를 새로 만들지 않고 `accepted: true`와 빈 `event_id`로 끝날 수 있다.

`05-evidence-query`는 세션 워크스페이스에 저장된 evidence row를 최신순으로 조회하는 범용 API다.
`correlation_id`, `kind`, `since`/`until`(ISO-8601), `limit`(기본 50, 최대 200), `offset`, `cursor`로 거른다.
응답의 `has_more`가 true이고 `next_cursor`가 있으면 같은 조건에 `cursor=next_cursor`를 넣어 다음 페이지를 받는다. `offset`은 기존 호출 호환용으로 남아 있다.

`06-rca-reports`는 저장된 RCA report 목록을 조회하는 API다. filter와 페이지네이션은 `05`와 같다(`kind` 제외).
payload 원문 대신 `root_cause`, `action`, incident 요약, `confidence` 같은 화이트리스트 필드만 내려간다.
secret 원문이 응답에 실리지 않게 하기 위한 계약이므로 프론트는 이 요약 필드만 렌더링한다.

`12-rca-rules`는 현재 API 프로세스가 로딩한 RCA rule catalog를 확인하는 디버그 API다.
배포 후 새 YAML rule이 서버 이미지에 포함됐는지 확인할 때 사용하며, rule id, symptoms, required sources, candidate id를 내려준다.

`07-fleet-summary`는 콘솔 루트 화면용 fleet 롤업 API다.
세션 사용자가 읽을 수 있는 cluster마다 `health`(healthy/warning/critical/stale/unknown), pod/node 수, 최근 재시작 델타, 열린 incident 수를 내려주고,
`totals`에 cluster 수, health별 수(healthy/warning/critical/stale/unknown), 대기 approval, 진행 중 workflow, dead letter 개수를 합산한다.

`08-cluster-summary`는 fleet 타일 클릭 드릴다운 API다.
해당 cluster에 `CLUSTER_READ` 권한이 있어야 하고, workload를 health별로 묶은 목록,
최근 Warning 이벤트(최대 10건), 열린 incident 요약, 최신 usage 스냅샷을 내려준다.

`09-node-summary`는 클러스터 내부 노드 히트맵 타일용 API다.
기존 inventory와 usage sample만 집계하며, node별 `ready`, `health`, 실행 중 pod 수, pod capacity, 재시작 수, pressure condition, 실측 CPU/MEM이 있으면 해당 값을 내려준다.
CPU/MEM 실측이 없는 노드는 값을 합성하지 않고 `null`로 둔다.

`10-node-pods-summary`는 노드 타일 클릭 후 팟 히트맵을 그리는 API다.
`node_name`에 배치된 pod만 내려주며 namespace, phase, ready 문자열, owner, 재시작 수, 열린 incident correlation, 실측 CPU/MEM이 있으면 해당 값을 포함한다.
존재하는 노드에 pod가 없으면 `pods: []`, 존재하지 않는 노드는 `404`가 정상이다.

`13-remediation-bundle`은 correlation 하나의 RCA 결과를 `meta`, `diagnosis`, `remediation`의
세 계층으로 조회한다. 복구 계획이 아직 생성되지 않은 정상 상태에서는 `remediation`이
`null`일 수 있다. `diagnosis.selected_candidate_id`는 진단 후보 선택이고
`remediation.selected_action_id`는 복구 실행 후보 선택이므로 서로 병합하거나 대체하지 않는다.

`14-audit-timeline`은 같은 `rca_correlation_id`에 속한 허용된 감사 이벤트를 시간순으로
조회한다. 응답은 화이트리스트 기반 `payload_summary`만 제공하고 원문 `payload`는 노출하지
않는다. `next_cursor`가 있으면 같은 `correlation_id`와 `limit`에 cursor를 이어서 보낸다.

`15-recent-changes`는 `incident_id` 직전에 관찰된 GitOps 변경을 최신순으로 조회한다.
각 항목에는 commit, workflow run, image 전후, PR 참조가 포함될 수 있으며 값이 확인되지
않은 필드는 합성하지 않고 `null`로 둔다.

CLI Runner는 `01-dashboard-timeline`과 `05-evidence-query`가 저장한 최신 식별자를 사용해
`13-remediation-bundle` → `14-audit-timeline` → `15-recent-changes`를 순서대로 실행한다.
저장된 실데이터가 없을 때 401/404를 계약상 허용하는 것은 응답 경계 회귀를 위한 것이다.
운영 배포 승인에서는 이 실행의 종료 코드만으로 성공을 판정하지 않고, 실재 correlation과
incident를 넣어 세 요청 모두 **실제 200**인지 별도로 확인한다. 구체적인 중단 조건과
검증 명령은 [운영 배포 기준](../operations-deployment.md)과
[프로덕션 완료 기준](../production-readiness.md)을 따른다.

### 06-gitops-approval

`01-github-webhook`은 외부 Git webhook을 받아 workflow event로 바꾸는 API다.
HMAC signature가 맞아야만 통과한다.
body를 수정하면 `github_webhook_signature`도 반드시 다시 계산해야 한다.
현재 Bruno 요청은 내부 표준 `GitHubWebhookRequest` body를 보낸다. 실제 GitHub raw `push` 또는 merge된 `pull_request` payload도 같은 endpoint로 들어올 수 있고, active poll target과 repo/branch가 매칭될 때만 `git.webhook.received`로 변환된다. 매칭할 배포 변경이 없으면 202 ignored 응답이 정상이다.

`02-grant-approval`은 열린 approval을 승인하고, 승인된 diff를 실제 command 요청으로 이어주는 API다.
deploy 권한이 있는 사용자만 호출할 수 있다.
성공하면 approval granted event와 command requested event가 같은 흐름에서 만들어진다.

`03-reject-approval`은 열린 approval을 거절하는 API다.
거절하면 실제 deploy command로 이어지지 않고 approval rejected event만 남는다.
잘못된 diff거나 아직 운영자가 승인하면 안 되는 변경일 때 사용한다.

### 07-ai

`01-create-conversation`은 운영 대화방을 만들고 첫 사용자 메시지를 event로 넣는 API다.
대화 record, 첫 message, `AiMessageReceived` event가 한 트랜잭션으로 생성된다.
성공하면 `conversation_id`를 Environment에 저장해서 다음 요청에 쓴다.

`02-get-conversation`은 대화와 메시지 목록을 조회하는 API다.
AI worker가 아직 응답하지 않았더라도 사용자가 보낸 메시지는 여기서 확인할 수 있다.
대화가 없거나 다른 workspace의 대화면 찾을 수 없다.

`03-append-message`는 기존 대화에 새 사용자 메시지를 추가하는 API다.
대화 상태를 waiting으로 바꾸고, 새 `AiMessageReceived` event를 발행한다.
운영자가 같은 RCA 맥락에서 질문을 이어갈 때 사용한다.

`04-list-conversations`는 로그인한 사용자의 AI 대화 목록을 조회하는 API다.
좌측 대화 목록과 최근 대화 복구에 쓰인다.
목록에서 첫 대화가 있으면 `conversation_id`를 자동 저장해서 상세 조회로 바로 이어갈 수 있다.

`05-delete-conversation`은 현재 workspace의 AI 대화를 삭제한다.
성공하면 204이고, 대화가 없거나 다른 workspace의 대화면 404다.
메시지는 `ai_conversation_messages.conversation_id` FK의 cascade 삭제를 따른다.

### 08-ops-dlq

`01-dead-letters`는 처리 실패로 dead letter에 남은 event를 조회하는 API다.
전 tenant 실패 이벤트가 보일 수 있으므로 admin session만 허용한다.
worker 오류를 확인할 때 먼저 이 목록을 본다.

`02-replay-dead-letter`는 특정 dead letter event를 다시 event bus로 넣는 API다.
이미 replay된 항목은 다시 replay하지 못하게 막는다.
원인을 고친 뒤 같은 event를 재처리해도 되는지 판단하고 사용한다.

`03-metrics`는 Gateway 운영 metric을 Prometheus text 형식으로 보는 API다.
`METRICS_TOKEN`이 설정되어 있으면 `authorization: Bearer {{metrics_token}}`이 필요하다.
dead letter, outbox pending, command status 같은 운영 지표를 확인한다.

### 09-management-console

`01-list-orgs`는 조직 목록을 조회한다.
관리 콘솔 조직 화면의 첫 API이고, 응답에 조직이 있으면 첫 `org_id`를 자동 저장한다.

`02-create-org`는 새 조직을 만든다.
성공하면 응답의 `org_id`를 저장하므로 바로 그룹 생성 요청에서 사용할 수 있다.

`03-delete-org`는 `org_id` 조직을 비활성화한다.
소속 그룹이 남아 있으면 `groups_exist` 충돌이 날 수 있고, 이것도 정상적인 보호 동작이다.

`04-list-users`는 사용자 목록을 조회한다.
승인, 그룹 멤버십, 권한 부여 흐름에서 쓸 `user_id`를 확인한다.

`05-list-groups`는 조직에 속한 그룹을 조회한다.
응답에 그룹이 있으면 첫 `group_id`를 자동 저장한다.

`06-create-group`은 `org_id` 아래 그룹을 만든다.
성공하면 `group_id`를 저장해서 멤버 추가/제거 요청으로 이어간다.

`07-list-group-members`는 특정 그룹의 멤버를 조회한다.
그룹 Drawer의 멤버 탭과 같은 데이터다.

`08-add-group-member`와 `09-remove-group-member`는 그룹 멤버십을 바꾼다.
둘 다 admin session이 필요하고, `group_id`, `user_id`가 맞아야 한다.

`10-list-access`는 특정 리소스의 권한 grant 목록을 조회한다.
기본 예시는 `resource_id={{cluster_id}}`로 클러스터 권한을 본다.

`11-grant-access`는 사용자나 그룹에 리소스 권한을 부여한다.
성공하면 `access_id`가 저장된다.

`12-revoke-access`는 `access_id` 권한을 회수한다.
실제 권한을 지우는 요청이므로 테스트용 grant를 만든 뒤 이어서 보내는 흐름을 권장한다.

### 10-applications

`01-list-applications`는 strict 제품 카드 목록이다. 첫 항목의 `id`를 `application_id` Bruno 변수로 자동 저장한다. health/resource counts/open incidents/drift는 저장된 evidence completeness를 보존하며, 확인 불가 값을 0 또는 healthy로 합성하지 않는다.
`02-create-application`은 데모 레포(`repo_ref`, `default_branch`, `manifest_path`)를 애플리케이션으로 등록한다. 응답의 `application.application_id`를 자동 저장한다.
`03-connect-application`은 `repo_ref`, `branch`, `manifest_path`, `source_type`, `cluster_id`를 서버에서 다시 검증한 뒤 repository, application, watch target, deployment binding을 한 번에 등록한다.
대상 클러스터 agent가 online이 아니면 400 `cluster_not_connected`가 정상 보호 응답이다. 먼저 target 등록 응답의 `bootstrap_command`를 실행하고 `11-clusters/03-connection-status`가 `online`이 된 뒤 다시 호출한다.
`get-application`은 endpoint와 최근 incident/activity를 포함한 strict 상세, `list-deployments`는 workflow run 기반 배포 이력이다. `create-deployment`만 `cluster_id`/`namespace`에 배포 binding을 만든다.
`07-get-drift`는 최신 저장 diff evidence에서 semantic drift만 scalar allowlist로 반환한다. secret/credential/data 경로나 복합 값은 `value_redacted=true`로 닫힌다.
`06-list-runs`는 운영·디버깅용 원시 워크플로우 run 목록이다(웹훅 push 후 run이 생긴다). 제품 화면은 strict 상세/배포/drift 요청을 사용한다.
각 run에는 `workflow_run_id`, `application_id`, `commit_sha`, `status`, `current_step`, `created_at`, `metadata`, `approval_id`, `safe_pr`, `steps`가 들어온다.
`steps`는 `workflow_run_steps` 테이블을 같은 응답에 붙인 값이고, 각 항목은 `name`, `status`, `message`, `details`, `updated_at` 구조다.
프론트는 `details.resource`, `details.namespace`, `details.changes[]`를 사용해서 워크플로 단계별 리소스 이름과 필드 변경 미리보기를 그린다.
`details.changes[]`는 diff-worker가 만든 3-way 비교 결과이며 `field_path`, `classification`, `before`, `after`를 읽으면 된다.

### 14-repository-discovery

`01-probe-repository`는 `repo_ref`가 탐색 가능한 저장소인지 확인하고 기본 branch와 metadata를 반환한다.
`02-list-branches`는 repository branch 목록을 조회한다.
`03-list-manifests`는 선택한 branch에서 연결 가능한 manifest 후보를 찾는다.
`04-validate-manifest`는 `repo_ref`/`branch`/`manifest_path`/`source_type` 조합을 검증하고 발견된 Kubernetes resource 목록을 반환한다.

### 15-wizard-validation

프론트 위저드가 저장 전 단계에서 실패를 먼저 감지하는 API 묶음이다.
`01-check-email`은 가입 이메일 사용 가능 여부와 rate limit 사유를 반환한다.
`02-cluster-registration-discovery`는 EKS/GKE/AKS/existing-k8s/kind/minikube 등록 폼 metadata와 import 후보를 반환한다.
`03-repo-validate`는 GitHub URL을 `owner/repo`로 정규화하고 접근 가능 여부와 기본 branch를 반환한다.
`04-repo-branches`는 선택 저장소의 branch 목록을 반환한다.
`05-repo-manifests`는 선택 branch에서 Kubernetes `kind`가 파싱되는 `.yaml/.yml` 파일만 반환한다.
`06-alert-channel-test`는 저장 전 webhook 테스트 알림 1건을 실제 전송하고 성공/실패 사유를 반환한다.
`07-rca-rule-validate`는 RCA 룰 YAML을 `packages.ai.rule_catalog` schema로 검증하고 첫 symptom과 후보 수를 반환한다.
`08-metrics-validate`는 explicit cluster 권한을 검사한 뒤 PromQL을 `telemetry.query.run` agent 명령으로 접수하고 command identity를 반환한다.

### 11-clusters

`01-list-clusters`는 등록된 클러스터 목록(대시보드 플릿). `02-get-cluster`는 상세, `03-connection-status`는 agent online 여부다.
`04~08 inventory-*`는 summary/resources/workloads/services/events — 팟·노드·워크로드 실데이터의 원천이다(agent 연결 후 채워짐).
`11-usage-series`는 inventory snapshot마다 적재된 CPU/메모리 같은 usage rollup 시계열이다.
`09-scale-deployment`/`10-restart-deployment`는 sandbox 네임스페이스의 디플로이먼트에 스케일/재시작 명령을 보낸다(deploy 권한 필요).

### 12-catalog

`01-list-items`는 설치형 카탈로그 항목 목록(첫 `item_id` 자동 저장), `02-get-item`은 상세, `03-install-item`은 `cluster_id`/`namespace`에 설치를 요청한다.

### 13-alert-channels

`01-list-alert-channels`는 현재 workspace에 등록된 알림 채널 목록을 조회한다.
alert-worker가 `alert.requested`를 받았을 때 이 목록을 기준으로 보낼 채널을 고른다.
응답에 채널이 있으면 첫 `channel_id`를 자동 저장한다.

`02-upsert-alert-channel`은 admin이 webhook 채널을 만들거나 수정하는 API다.
기본 Bruno body에는 `channel_id`를 넣지 않으므로 새 채널을 만든다.
실수로 운영 알림이 나가지 않도록 기본값은 `enabled: false`다.
실제 채널로 쓰려면 `url`을 팀 webhook으로 바꾸고 `enabled`를 `true`로 바꾼다.

`03-delete-alert-channel`은 `alert_channel_id` 채널을 삭제한다.
삭제는 admin session이 필요하고, 다른 workspace 채널이거나 없는 ID면 404가 정상 보호 응답이다.

## 3단계. 서버 상태 확인

먼저 `00-health-auth/01-healthz.bru`를 보낸다.

정상 출력은 `status: ok`다.

그다음 `00-health-auth/02-readyz.bru`를 보낸다.

정상 출력은 `status: ready`다.

마지막으로 `00-health-auth/03-openapi-json.bru`를 보낸다.

정상 출력에는 `openapi`와 `paths`가 있어야 한다.

이 세 개가 실패하면 이후 요청은 보지 않는다. 먼저 Gateway 주소와 AWS CD 상태를 확인한다.

## 4단계. mTLS 개발 주체 확인

세션 API를 바로 확인하려면 `00-health-auth/07-session.bru`를 보낸다.
cookie가 없어도 인증서가 검증되면 정상 출력은 `authenticated: true`, `user_id`,
`workspace_id: default`, `roles: [service_admin]`다.

수동 로그인 API 자체를 별도로 확인하려면 `00-health-auth/06-login.bru`를 보낸다.

정상 출력은 `authenticated: true`, `user_id`, `workspace_id`, `roles`다.
Bruno는 `service_session` httpOnly cookie를 cookie jar에 보관하고 다음 요청에 자동으로 보낸다.

개발 주체 확인이 실패하면 아래를 확인한다.

1. Client Certificates의 domain이 `dev-k8s.woonyong.org`인지 본다.
2. PFX 파일과 암호가 같은 팀원 폴더에서 전달된 한 쌍인지 본다.
3. Environment가 `aws-test`이고 `auto_login: false`인지 본다.
4. `base_url`이 `https://dev-k8s.woonyong.org/api/`인지 본다.

## 5단계. Provider catalog 확인

`01-providers/01-provider-catalog.bru`를 보낸다.

정상 출력에는 `providers`가 있다.
401/403이면 먼저 mTLS 인증서와 `07-session`의 개발 주체를 확인한다.

`01-providers/02-validate-provider-selection.bru`를 보낸다.

정상 출력에는 `valid`, `errors`, `warnings`, `selected`가 있다.
여기서 provider 선택이 깨지면 target 등록이나 evidence job으로 가지 않는다.

## 6단계. Target 등록 응답 확인

`02-target-admin/01-register-target-dry-run.bru`를 보낸다.

정상 출력에는 `registered: true`, `install_manifest`, `agent_token`, `applied: false`가 있다.

`agent_token`은 이후 agent 요청에 필요하다.
응답에서 token을 받으면 Bruno runtime 변수에 자동 저장된다.
자동 저장이 안 되면 Environment의 `agent_token`에 직접 넣는다.

`02-target-admin/02-update-cluster-policy.bru`는 provider job 정책을 바꿀 때 보낸다.
정상 출력에는 `accepted: true`와 `policy`가 있다.

`02-target-admin/03-install-manifest-by-token.bru`는 `agent_token`이 있을 때 보낸다.
정상 출력은 JSON이 아니라 Kubernetes YAML이고, `apiVersion:`과 `kind:`가 보여야 한다.

## 7단계. Agent runtime 확인

`03-agent-runtime/01-agent-connect.bru`를 보낸다.

정상 출력에는 `accepted: true`, `event_id`, `correlation_id`가 있다.

`03-agent-runtime/02-get-agent-policy.bru`를 보낸다.

정상 출력에는 `policy` key가 있다. policy가 아직 없을 수 있으므로 값이 비어 있어도 response shape가 맞으면 된다.

`03-agent-runtime/05-schedule-evidence-jobs.bru`를 보낸다.

정상 출력에는 `accepted: true`, `evidence_key`, `job_ids`가 있다.

`03-agent-runtime/06-poll-evidence-job.bru`를 보낸다.

정상 출력은 `job` key다. job이 없으면 `job: null`일 수 있다.
이 경우는 오류가 아니라 해당 provider queue에 가져갈 job이 없다는 뜻이다.

`03-agent-runtime/07-complete-evidence-job.bru`는 poll에서 `evidence_job_id`를 받은 뒤 보낸다.

정상 출력에는 `accepted: true`가 있다.

## 8단계. Command 흐름 확인

`04-command/01-manual-command.bru`를 보낸다.

정상 출력에는 `accepted: true`, `event_id`, `correlation_id`가 있다.

`04-command/02-debug-query.bru`를 보낸다.

정상 출력에는 `accepted: true`, `command_id`, `correlation_id`가 있다.
이 요청은 Prometheus query 하나를 agent command queue에 넣는 용도다.

그다음 agent 쪽에서 순서대로 확인한다.

1. `04-command/03-agent-command-poll.bru`
2. `04-command/04-agent-command-start.bru`
3. `04-command/05-agent-command-heartbeat.bru`
4. `04-command/06-agent-command-result.bru`
5. `04-command/07-command-status.bru`

poll 결과가 `command: null`이면 queue에 command가 없는 상태다.
먼저 manual command 또는 debug query를 다시 보낸다.

result 정상 출력에는 `accepted: true`와 `event_id`가 있다.
status 정상 출력에는 `command_id`, `cluster_id`, `status`, `result`가 있다.

## 9단계. RCA dashboard 확인

`05-rca-dashboard/01-dashboard-timeline.bru`를 보낸다.

정상 출력에는 `items` 배열이 있다.

`items: []`면 두 가지를 확인한다.

1. evidence 또는 RCA event가 아직 들어오지 않았는지 본다.
2. 로그인한 사용자가 해당 `cluster_id`를 볼 권한이 있는지 본다.

`05-rca-dashboard/02-dashboard-incident.bru`는 `incident_id`가 있을 때만 보낸다.
정상 출력은 `item`이다. 없는 incident면 `404`가 정상이다.

`05-rca-dashboard/04-alertmanager-webhook.bru`는 외부 모니터링 알림이 RCA evidence로 들어오는지 보는 요청이다.
정상 출력은 `accepted: true`, `event_id`, `correlation_id`다.
토큰이 설정되지 않은 배포에서는 `503`, 토큰이 틀리면 `401`이 정상 보호 응답이다.

`05-rca-dashboard/07-fleet-summary.bru`는 fleet 롤업이 내려오는지 보는 요청이다.
정상 출력은 `clusters` 배열과 `totals`다. cluster가 하나도 없으면 `clusters: []`에 totals가 0으로 내려온다.

`05-rca-dashboard/08-cluster-summary.bru`는 cluster 드릴다운 요약을 보는 요청이다.
권한이 없으면 `403`, 등록되지 않은 `cluster_id`면 `404`가 정상이다.

`05-rca-dashboard/09-node-summary.bru`는 노드 히트맵 요약을 보는 요청이다.
정상 출력은 `cluster_id`와 `nodes` 배열이며, 여기서 받은 `nodes[].name`을 Environment의 `node_name`에 넣는다.

`05-rca-dashboard/10-node-pods-summary.bru`는 선택한 노드의 팟 타일 목록을 보는 요청이다.
정상 출력은 `cluster_id`, `node_name`, `pods` 배열이다. node가 없으면 `404`, 권한이 없으면 `403`이 정상이다.

## 10단계. GitHub webhook signature와 approval 확인

`06-gitops-approval/01-github-webhook.bru`는 signature가 맞아야 성공한다.

Environment의 `github_webhook_secret`에 배포의 `GITHUB_WEBHOOK_SECRET` 값을 넣으면
pre-request script가 body 조립과 HMAC signature 계산을 자동으로 한다. 수동 계산이 필요 없다.
body 내용을 바꾸려면 `01-github-webhook.bru`의 `script:pre-request` 안 JSON을 수정한다
(script가 서명하는 body와 실제 전송 body가 항상 같으므로 signature가 깨지지 않는다).

secret을 채울 수 없으면 `github_webhook_signature`에 수동 계산값을 직접 넣어도 된다.
수동 계산을 할 때는 예전처럼 `BRUNO_CLUSTER_ID`를 Bruno Environment의 `cluster_id`와 같은 값으로 두면 된다.

approval record가 있으면 `06-gitops-approval/02-grant-approval.bru` 또는 `03-reject-approval.bru`를 보낸다.
정상 출력에는 `accepted: true`, `event_id`, `correlation_id`가 있다.

## 11단계. AI conversation 확인

`07-ai/01-create-conversation.bru`를 보낸다.

정상 출력에는 `accepted: true`, `conversation_id`, `message_id`, `event_id`, `correlation_id`가 있다.

그다음 `07-ai/02-get-conversation.bru`를 보낸다.

정상 출력에는 `conversation`과 `messages`가 있다.

마지막으로 `07-ai/03-append-message.bru`를 보낸다.

정상 출력에는 `accepted: true`, `conversation_id`, `message_id`, `event_id`가 있다.

`07-ai/04-list-conversations.bru`를 보내면 대화 목록이 나온다.
정상 출력에는 `conversations` 배열이 있다.

삭제 흐름까지 확인하려면 마지막에 `07-ai/05-delete-conversation.bru`를 보낸다.
정상 삭제는 204이고, 이미 삭제됐거나 없는 대화는 404다.

## 12단계. 운영 API 확인

`08-ops-dlq/01-dead-letters.bru`를 보낸다.

정상 출력에는 `dead_letters` 배열이 있다.

`08-ops-dlq/02-replay-dead-letter.bru`는 실제 `dead_letter_id`가 있을 때만 보낸다.
정상 출력에는 `accepted: true`, `dead_letter_id`, `replay_event`가 있다.

`08-ops-dlq/03-metrics.bru`는 metrics token이 켜져 있으면 `authorization: Bearer {{metrics_token}}`이 필요하다.
정상 출력은 Prometheus text이고, `event_dead_letters_open_total`, `outbox_pending_total`, `command_status_total`이 보여야 한다.

## 13단계. 관리 콘솔 API 확인

이 단계는 admin 계정으로 로그인한 뒤 보낸다.
찬빈이 조직/그룹/멤버/권한 화면을 실제 API에 붙였는지 확인하는 흐름이다.

먼저 `09-management-console/01-list-orgs.bru`를 보낸다.
정상 출력에는 `orgs` 배열이 있다.

새 조직을 만들 때는 `09-management-console/02-create-org.bru`를 보낸다.
정상 출력에는 `org_id`, `name`, `member_count`, `group_count`가 있다.

조직 삭제를 연습할 때는 방금 만든 테스트 조직의 `org_id`인지 확인하고 `09-management-console/03-delete-org.bru`를 보낸다.
정상 삭제는 `204`이고, 그룹이 남아 있으면 `409`가 정상적인 보호 응답이다.

사용자와 그룹은 아래 순서로 본다.

1. `09-management-console/04-list-users.bru`는 `users` 배열을 반환한다.
2. `09-management-console/05-list-groups.bru`는 `groups` 배열을 반환한다.
3. `09-management-console/06-create-group.bru`는 `group_id`를 반환한다.
4. `09-management-console/07-list-group-members.bru`는 `members` 배열을 반환한다.
5. `09-management-console/08-add-group-member.bru`는 `accepted: true`를 반환한다.
6. `09-management-console/09-remove-group-member.bru`는 `204`를 반환한다.

권한은 아래 순서로 본다.

1. `09-management-console/10-list-access.bru`는 `grants` 배열을 반환한다.
2. `09-management-console/11-grant-access.bru`는 `access_id`, `resource_id`, `role`을 반환한다.
3. `09-management-console/12-revoke-access.bru`는 `204`를 반환한다.

## 14단계. 알림 채널 라우팅 확인

이 단계는 admin 계정으로 로그인한 뒤 보낸다.
민정/가인이 alert-worker 흐름을 확인할 때, 찬빈이 알림 설정 화면을 붙일 때 같은 API를 본다.

먼저 `13-alert-channels/01-list-alert-channels.bru`를 보낸다.
정상 출력에는 `channels` 배열이 있다.

테스트 채널을 만들 때는 `13-alert-channels/02-upsert-alert-channel.bru`를 보낸다.
정상 출력에는 `channel_id`, `workspace_id`, `name`, `kind`, `url`, `min_severity`, `enabled`가 있다.
Bruno 기본 body는 `enabled: false`라서 테스트 생성만 하고 실제 알림 발송에는 참여하지 않는다.

방금 만든 테스트 채널을 지울 때는 `13-alert-channels/03-delete-alert-channel.bru`를 보낸다.
정상 삭제는 `204`다.

실제 운영 채널을 켤 때는 이 순서를 따른다.

1. `alert_webhook_url`을 팀 webhook URL로 바꾼다.
2. `02-upsert-alert-channel.bru`의 `enabled`를 `true`로 바꾼다.
3. `min_severity`를 `info`, `warning`, `critical` 중 하나로 정한다.
4. 저장 후 `01-list-alert-channels`로 값이 남았는지 확인한다.
5. alert-worker는 `alert.requested.workspace_id`의 enabled 채널 중 severity가 맞는 채널만 호출한다.

## 15단계. 애플리케이션·클러스터·카탈로그 확인 (레포/배포 실플로우)

레포 등록부터 배포 반영까지의 실제 흐름은 아래 순서로 본다.

1. `11-clusters/01-list-clusters` → 등록된 클러스터를 확인한다. 비어 있으면 `02-target-admin/01`로 매니페스트를 받아 대상 클러스터에 apply부터 한다.
2. `11-clusters/03-connection-status` → `game-server` agent가 online인지 본다. online이면 `04-inventory-summary`와 `11-usage-series`로 팟/워크로드 실데이터와 usage 시계열이 오는지 확인한다.
3. `10-applications/02-create-application` → 데모 레포를 등록(`application_id` 자동 저장)한다.
4. `10-applications/05-create-deployment` → `game-server` sandbox에 배포를 묶는다.
5. GitHub 웹훅(`GITHUB_WEBHOOK_SECRET`)을 설정한 뒤 레포에 push하거나, `06-gitops-approval/01-github-webhook`으로 push 이벤트를 모사한다.
6. `10-applications/06-list-runs` → run이 생겼는지 본다. 승인 대기면 `06-gitops-approval/02-grant-approval`로 승인한다.
7. `11-clusters/09-scale-deployment` / `10-restart-deployment` → sandbox 워크로드에 직접 액션을 보내고, 다시 `04-inventory-*`로 반영을 확인한다.

정상 응답은 대부분 `200`이며, 권한/데이터 부재 시 `401/403/404`가 정상 보호 동작이다.

## Bruno CLI로 import 문법만 확인하기

CLI가 설치되어 있으면 collection root에서 실행한다.

```bash
cd docs/api
bash scripts/run-bruno-aws.sh
```

서버가 떠 있지 않으면 첫 요청 실패가 날 수 있다.
그래도 `Skipping invalid file`이나 `parseBruRequest error`가 나오면 collection 문법이 깨진 것이다.
현재 collection은 Bruno v3.5.1 기준으로 `tests {}`와 `body:json {}` 문법을 쓴다.
