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

4. 왼쪽에 `00-health-auth`부터 `08-ops-dlq`까지 폴더가 보이면 정상이다.
5. 오른쪽 위 Environment에서 `aws-test`를 고른다.
6. 로컬 Gateway를 직접 띄워 보는 경우에만 `local`을 고른다.

깨졌다면 거의 항상 다른 폴더를 연 것이다. `docs/api` 바로 아래에 `bruno.json`과 `environments` 폴더가 있어야 한다.

## 2단계. 변수 채우기

먼저 Environment 값을 채운다.

`base_url`은 Gateway 주소다. AWS 테스트는 `https://k8s.woonyong.org`를 쓴다.

`auth_email`과 `auth_password`는 로그인할 운영자 계정이다.

`cluster_id`는 AWS target cluster 기준으로 `cluster-1`을 쓴다.

`agent_token`은 `02-target-admin/01-register-target-dry-run.bru` 응답에서 받거나, 이미 등록된 target agent token reference를 운영자가 넣는다.

`github_webhook_signature`는 webhook body와 secret으로 다시 계산해야 한다. body를 바꾸면 signature도 반드시 다시 바꾼다.

## 3단계. 서버 상태 확인

먼저 `00-health-auth/01-healthz.bru`를 보낸다.

정상 출력은 `status: ok`다.

그다음 `00-health-auth/02-readyz.bru`를 보낸다.

정상 출력은 `status: ready`다.

마지막으로 `00-health-auth/03-openapi-json.bru`를 보낸다.

정상 출력에는 `openapi`와 `paths`가 있어야 한다.

이 세 개가 실패하면 이후 요청은 보지 않는다. 먼저 Gateway 주소와 AWS CD 상태를 확인한다.

## 4단계. 로그인 확인

`00-health-auth/06-login.bru`를 보낸다.

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

poll 결과가 `command: null`이면 queue에 command가 없는 상태다.
먼저 manual command 또는 debug query를 다시 보낸다.

result 정상 출력에는 `accepted: true`와 `event_id`가 있다.

## 9단계. RCA dashboard 확인

`05-rca-dashboard/01-dashboard-timeline.bru`를 보낸다.

정상 출력에는 `items` 배열이 있다.

`items: []`면 두 가지를 확인한다.

1. evidence 또는 RCA event가 아직 들어오지 않았는지 본다.
2. 로그인한 사용자가 해당 `cluster_id`를 볼 권한이 있는지 본다.

`05-rca-dashboard/02-dashboard-incident.bru`는 `incident_id`가 있을 때만 보낸다.
정상 출력은 `item`이다. 없는 incident면 `404`가 정상이다.

## 10단계. GitHub webhook signature와 approval 확인

`06-gitops-approval/01-github-webhook.bru`는 signature가 맞아야 성공한다.

body는 `docs/api/06-gitops-approval/github-webhook-body.json`과 같은 값으로 둔다.

signature는 아래 명령으로 만든다.

```bash
python - <<'PY'
import hashlib
import hmac
from pathlib import Path

secret = "replace-with-GITHUB_WEBHOOK_SECRET"
body = Path("docs/api/06-gitops-approval/github-webhook-body.json").read_bytes()
print("sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest())
PY
```

출력값을 `github_webhook_signature`에 넣는다.

approval record가 있으면 `06-gitops-approval/02-grant-approval.bru` 또는 `03-reject-approval.bru`를 보낸다.
정상 출력에는 `accepted: true`, `event_id`, `correlation_id`가 있다.

## 11단계. AI conversation 확인

`07-ai/01-create-conversation.bru`를 보낸다.

정상 출력에는 `accepted: true`, `conversation_id`, `message_id`, `event_id`, `correlation_id`가 있다.

그다음 `07-ai/02-get-conversation.bru`를 보낸다.

정상 출력에는 `conversation`과 `messages`가 있다.

마지막으로 `07-ai/03-append-message.bru`를 보낸다.

정상 출력에는 `accepted: true`, `conversation_id`, `message_id`, `event_id`가 있다.

## 12단계. 운영 API 확인

`08-ops-dlq/01-dead-letters.bru`를 보낸다.

정상 출력에는 `dead_letters` 배열이 있다.

`08-ops-dlq/02-replay-dead-letter.bru`는 실제 `dead_letter_id`가 있을 때만 보낸다.
정상 출력에는 `accepted: true`, `dead_letter_id`, `replay_event`가 있다.

`08-ops-dlq/03-metrics.bru`는 metrics token이 켜져 있으면 `authorization: Bearer {{metrics_token}}`이 필요하다.
정상 출력은 Prometheus text이고, `event_dead_letters_open_total`, `outbox_pending_total`, `command_status_total`이 보여야 한다.

## Bruno CLI로 import 문법만 확인하기

CLI가 설치되어 있으면 collection root에서 실행한다.

```bash
cd docs/api
npx --yes @usebruno/cli run --env local --bail
```

서버가 떠 있지 않으면 첫 요청 실패가 날 수 있다.
그래도 `Skipping invalid file`이나 `parseBruRequest error`가 나오면 collection 문법이 깨진 것이다.
현재 collection은 Bruno v3.5.1 기준으로 `tests {}`와 `body:json {}` 문법을 쓴다.
