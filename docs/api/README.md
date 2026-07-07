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

4. 왼쪽에 `00 상태와 인증`부터 `13 알림 채널`까지 한글 폴더명이 보이면 정상이다.
5. 오른쪽 위 Environment에서 `aws-test`를 고른다.
6. 로컬 Gateway를 직접 띄워 보는 경우에만 `local`을 고른다.

깨졌다면 거의 항상 다른 폴더를 연 것이다. `docs/api` 바로 아래에 `bruno.json`과 `environments` 폴더가 있어야 한다.
파일 경로는 `00-health-auth`처럼 영어 slug를 유지하고, Bruno 화면 표시명은 한글로 맞춘다.

## 전체 Runner 실행

보호 API는 로그인 쿠키가 필요하다.
운영 URL을 가리키는 collection 기본값과 `aws-test` Environment는 실제 계정을 커밋하지 않기 위해 `auto_login: false`와 placeholder 인증값을 쓴다.
실제 AWS 확인은 로컬 전용 `*.local.bru` 환경에 운영자 계정을 넣거나 Bruno UI에서 `auth_email`/`auth_password`를 채운 뒤 `auto_login`을 켠다.
전체 확인은 기존처럼 `06 로그인`을 포함한 Runner 순서로 돌려도 되고, `10 로그아웃`은 맨 마지막에 실행한다.

로컬에 실제 AWS 값이 들어간 `docs/api/environments/aws-live.local.bru`가 있으면 아래 명령으로 전체 과정을 한 번에 실행한다.
이 파일은 `*.local.bru`로 ignore되어 Git에 올라가지 않는다.

```bash
bash scripts/run-bruno-aws.sh
```

같은 순서를 Bruno 앱에서 실행할 때도 `00-health-auth/01`부터 `00-health-auth/07`까지 실행하고,
그 다음 `01`부터 `13` 폴더를 실행한 뒤 `00-health-auth/10 로그아웃`을 마지막에 실행한다.
`00-health-auth/10 로그아웃`을 중간에 실행해도 `auto_login`이 켜져 있으면 다음 보호 API에서 다시 로그인한다.
로그아웃 이후 401 상태를 확인하려면 `auto_login`을 먼저 꺼 둔다.

## 2단계. 변수 채우기

대부분의 변수는 요청 응답에서 자동으로 채워지므로 직접 넣을 값은 몇 개 없다.

직접 채워야 하는 값은 처음 한 번만 본다.

1. `base_url`은 Gateway API 주소다. `local`은 `http://localhost:18080/`, `aws-test`는 `https://k8s.woonyong.org/api/`로 이미 채워져 있다. Bruno 요청 파일은 `{{base_url}}providers/validate`처럼 붙기 때문에 값이 반드시 `/`로 끝나야 한다.
2. `auto_login`은 보호 API 호출 전에 Bruno가 자동 로그인할지 정한다. 운영 기본값은 `false`다. 로컬 환경만 bootstrap smoke 편의를 위해 `true`다.
3. `auth_email`/`auth_password`는 자동 로그인과 `06-login` 요청에 쓸 계정이다. collection과 `aws-test`에는 placeholder만 커밋한다. 실제 AWS 계정은 `docs/api/environments/aws-live.local.bru` 같은 gitignore된 local env 또는 Bruno UI override에만 둔다.
4. `github_webhook_secret`은 배포에 설정된 `GITHUB_WEBHOOK_SECRET` 값이다. 이 값을 채우면 webhook signature를 Bruno가 요청 직전에 자동 계산한다.
5. `metrics_token`은 `METRICS_TOKEN`이 켜진 배포에서만 넣는다.
6. `alertmanager_token`은 외부 Alertmanager webhook 입구가 켜진 배포에서만 넣는다. 배포의 `ALERTMANAGER_WEBHOOK_TOKEN`과 같아야 한다.
7. `service_image`는 target manifest 발급 시 쓸 agent 이미지다. 라이브 기본값은 `183548421506.dkr.ecr.ap-northeast-2.amazonaws.com/kubernetes-ops-service:latest`(dry-run은 pull 불필요, 실제 apply 시 태그 확인).
8. `cluster_id`/`cluster_id_2`는 실제 AWS EKS 클러스터 `cluster-1`/`cluster-2`로 매핑돼 있다. `repo_ref`는 데모 레포 `Jungle-303-04/gitops-demo`, `manifest_path`는 `deploy.yaml`이다.

요청 순서대로 실행하면 아래 값은 자동으로 채워진다.

1. `workspace_id`, `user_id`는 `06-login` 성공 후 저장된다.
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

`base_url`은 Gateway API 주소다. `aws-test` Environment와 collection 기본 변수는 `https://k8s.woonyong.org/api/`를 쓴다.
현재 AWS/CDN 라우팅은 프론트 콘솔을 `https://k8s.woonyong.org/`에 두고, Gateway API를 같은 origin의 `/api/*` 프록시로 연결한다. 그래서 Bruno에서는 `{{base_url}}healthz`, `{{base_url}}providers/validate`, `{{base_url}}agent/debug/query`처럼 Gateway route를 붙여 호출한다.

프론트 콘솔을 직접 여는 주소는 `https://k8s.woonyong.org/`지만, Bruno collection의 AWS `base_url`에는 `/api/`까지 포함한다.

Bruno 화면에서 Environment를 아직 고르지 않았더라도 `docs/api/collection.bru`의 기본 변수 때문에 `{{base_url}}`이 `https://k8s.woonyong.org/api/`로 풀린다.
그래도 실제 AWS 테스트를 할 때는 오른쪽 위 Environment에서 `aws-test` 또는 gitignore된 `aws-live.local`을 선택한다.

`auth_email`과 `auth_password`는 로그인할 운영자 계정이다.
collection과 `aws-test` 기본값은 placeholder다.

```text
auth_email: replace-with-auth-email
auth_password: replace-with-auth-password
```

로컬 bootstrap smoke 값은 `local` Environment에만 둔다.
AWS 라이브 계정은 문서/collection 파일에 쓰지 않는다.

`auto_login`은 Bruno에서 보호 API를 바로 눌렀을 때 collection pre-request script가 자동으로 `/auth/login`을 호출할지 정한다.
운영 기본값은 `false`다. 로컬 smoke 또는 개인 local env에서만 `true`로 켠다.
자동 로그인은 `service_session` cookie가 없을 때만 동작하며, `x-agent-token` API, install 링크, GitHub/Alertmanager webhook, `/metrics`, health/openapi/auth 흐름에는 붙지 않는다.
인증 실패 응답을 직접 보고 싶으면 Environment에서 `auto_login`을 `false`로 바꾼다.

`cluster_id`/`cluster_id_2`는 실제 AWS EKS 클러스터 id다. 기본값은 `cluster-1`/`cluster-2`다.
단, 두 클러스터에 cluster-agent가 아직 배포되지 않았다면 `clusters` 목록/인벤토리는 비어 있을 수 있다 —
먼저 `02-target-admin/01`로 매니페스트를 받아 각 대상 클러스터에 apply해야 데이터가 흐른다.

팀 통합 테스트는 `aws-test` Environment가 기준이다.
로컬에서는 [로컬 검증 실행 기준](../local-testing.md)을 따라 코드 정합성과 Bruno 문법만 확인하고, 실제 API 흐름은 AWS에서 확인한다.
`local` Environment는 개인이 Gateway를 별도로 띄워 빠르게 확인할 때만 쓰는 보조 profile이다.
로컬 bootstrap 값은 `docs/api/environments/local.bru`에만 둔다.

`agent_token`은 `02-target-admin/01-register-target-dry-run.bru` 응답에서 받거나, 이미 등록된 target agent token reference를 운영자가 넣는다.
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
로그인 세션 API는 `auto_login`이 켜져 있으면 Bruno가 먼저 세션을 만들고, 이후 `service_session` cookie를 자동으로 들고 간다.
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

`06-login`은 운영자 또는 팀원 계정으로 로그인하고 `service_session` cookie를 받는 API다.
`auto_login`이 켜져 있으면 세션 API를 먼저 눌러도 같은 로그인을 pre-request에서 자동 수행한다.
Bruno는 응답 cookie를 보관하므로, 같은 Environment에서 다음 요청을 그대로 보내면 된다.

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

이 폴더의 요청은 provider catalog와 cluster 등록 후보를 다루므로 admin 세션이 필요하다.
`auto_login` 기본값이면 바로 보낼 수 있다. 수동 흐름으로 확인하려면 먼저 `00-health-auth/06-login`으로 `service_admin` 계정에 로그인한다.

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

Target 등록 요청의 `prometheus_base_url`, `loki_base_url`, `tempo_base_url`은 target cluster 안에서 agent가 실제로 호출할 관측 스택 주소다.
이 세 값은 설치 manifest의 `PROMETHEUS_BASE_URL`, `LOKI_BASE_URL`, `TEMPO_BASE_URL`로 그대로 들어가고, metrics/logs/traces provider의 기본 접속 주소가 된다.
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

`07-fleet-summary`는 콘솔 루트 화면용 fleet 롤업 API다.
세션 사용자가 읽을 수 있는 cluster마다 `health`(healthy/warning/critical/stale/unknown), pod/node 수, 최근 재시작 델타, 열린 incident 수를 내려주고,
`totals`에 cluster 수, health별 수(healthy/warning/critical/stale/unknown), 대기 approval, 진행 중 workflow, dead letter 개수를 합산한다.

`08-cluster-summary`는 fleet 타일 클릭 드릴다운 API다.
해당 cluster에 `CLUSTER_READ` 권한이 있어야 하고, workload를 health별로 묶은 목록,
최근 Warning 이벤트(최대 10건), 열린 incident 요약, 최신 usage 스냅샷을 내려준다.

### 06-gitops-approval

`01-github-webhook`은 외부 Git webhook을 받아 workflow event로 바꾸는 API다.
HMAC signature가 맞아야만 통과한다.
body를 수정하면 `github_webhook_signature`도 반드시 다시 계산해야 한다.

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

`01-list-applications`는 등록된 애플리케이션(레포+워치+배포 바인딩) 목록이다. 첫 항목의 `application_id`를 자동 저장한다.
`02-create-application`은 데모 레포(`repo_ref`, `default_branch`, `manifest_path`)를 애플리케이션으로 등록한다. 응답의 `application.application_id`를 자동 저장한다.
`03-connect-application`은 `repo_ref`, `branch`, `manifest_path`, `source_type`, `cluster_id`를 서버에서 다시 검증한 뒤 repository, application, watch target, deployment binding을 한 번에 등록한다.
`get-application`은 상세, `list-deployments`는 배포 바인딩 목록, `create-deployment`는 `cluster_id`/`namespace`에 배포를 묶는다.
`06-list-runs`는 그 애플리케이션의 워크플로우 run 목록이다(웹훅 push 후 run이 생긴다).
각 run에는 `workflow_run_id`, `application_id`, `commit_sha`, `status`, `current_step`, `created_at`, `metadata`, `approval_id`, `safe_pr`, `steps`가 들어온다.
`steps`는 `workflow_run_steps` 테이블을 같은 응답에 붙인 값이고, 각 항목은 `name`, `status`, `message`, `details`, `updated_at` 구조다.
프론트는 `details.resource`, `details.namespace`, `details.changes[]`를 사용해서 워크플로 단계별 리소스 이름과 필드 변경 미리보기를 그린다.
`details.changes[]`는 diff-worker가 만든 3-way 비교 결과이며 `field_path`, `classification`, `before`, `after`를 읽으면 된다.

### 14-repository-discovery

`01-probe-repository`는 `repo_ref`가 탐색 가능한 저장소인지 확인하고 기본 branch와 metadata를 반환한다.
`02-list-branches`는 repository branch 목록을 조회한다.
`03-list-manifests`는 선택한 branch에서 연결 가능한 manifest 후보를 찾는다.
`04-validate-manifest`는 `repo_ref`/`branch`/`manifest_path`/`source_type` 조합을 검증하고 발견된 Kubernetes resource 목록을 반환한다.

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

## 4단계. 자동 로그인 확인

세션 API를 바로 확인하려면 `00-health-auth/07-session.bru`를 보낸다.
cookie가 없으면 Bruno가 먼저 `/auth/login`을 호출하므로 정상 출력은 `authenticated: true`, `user_id`, `workspace_id`, `roles`다.

수동 로그인 API 자체를 확인하려면 `00-health-auth/06-login.bru`를 보낸다.

정상 출력은 `authenticated: true`, `user_id`, `workspace_id`, `roles`다.
Bruno는 `service_session` httpOnly cookie를 cookie jar에 보관하고 다음 요청에 자동으로 보낸다.

로그인이 실패하면 아래만 확인한다.

1. `auth_email`이 실제 등록된 계정인지 본다.
2. `auth_password`가 맞는지 본다.
3. 계정이 email verification 또는 approval 대기 상태인지 본다.
4. 계정 권한이 cluster read/write에 충분한지 본다.

## 5단계. Provider catalog 확인

`01-providers/01-provider-catalog.bru`를 보낸다.

정상 출력에는 `providers`가 있다.
401/403이면 먼저 admin 계정으로 로그인했는지 확인한다.

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
2. `11-clusters/03-connection-status` → `cluster-1` agent가 online인지 본다. online이면 `04-inventory-summary`와 `11-usage-series`로 팟/워크로드 실데이터와 usage 시계열이 오는지 확인한다.
3. `10-applications/02-create-application` → 데모 레포를 등록(`application_id` 자동 저장)한다.
4. `10-applications/05-create-deployment` → `cluster-1` sandbox에 배포를 묶는다.
5. GitHub 웹훅(`GITHUB_WEBHOOK_SECRET`)을 설정한 뒤 레포에 push하거나, `06-gitops-approval/01-github-webhook`으로 push 이벤트를 모사한다.
6. `10-applications/06-list-runs` → run이 생겼는지 본다. 승인 대기면 `06-gitops-approval/02-grant-approval`로 승인한다.
7. `11-clusters/09-scale-deployment` / `10-restart-deployment` → sandbox 워크로드에 직접 액션을 보내고, 다시 `04-inventory-*`로 반영을 확인한다.

정상 응답은 대부분 `200`이며, 권한/데이터 부재 시 `401/403/404`가 정상 보호 동작이다.

## Bruno CLI로 import 문법만 확인하기

CLI가 설치되어 있으면 collection root에서 실행한다.

```bash
cd docs/api
npx --yes @usebruno/cli run --env local --bail
```

서버가 떠 있지 않으면 첫 요청 실패가 날 수 있다.
그래도 `Skipping invalid file`이나 `parseBruRequest error`가 나오면 collection 문법이 깨진 것이다.
현재 collection은 Bruno v3.5.1 기준으로 `tests {}`와 `body:json {}` 문법을 쓴다.
