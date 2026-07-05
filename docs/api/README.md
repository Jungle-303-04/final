# Bruno API 테스트 가이드

이 폴더는 실제 Gateway API를 팀원이 직접 눌러보는 Bruno collection이다.
Bruno에서 `docs/api/` 폴더를 Open Collection으로 열고, 오른쪽 위 Environment에서
`local` 또는 `aws-test`를 선택한다.

## 먼저 알아야 하는 것

- 로그인 API는 `service_session` httpOnly cookie를 내려준다. Bruno는 cookie jar로 다음 요청에 자동 포함한다.
- agent API는 browser session이 아니라 `x-agent-token: {{agent_token}}`을 사용한다.
- GitHub webhook은 `x-hub-signature-256` HMAC 값이 필요하다. 요청 body를 바꾸면 signature도 다시 계산해야 한다.
- `{{command_id}}`, `{{evidence_job_id}}`, `{{conversation_id}}`, `{{incident_id}}`는 앞 요청 응답에서 자동 저장되거나 environment에 직접 넣는다.
- 실제 서비스 통합 테스트는 AWS에서 한다. 이 collection도 `aws-test` profile을 기준으로 맞춘다.

## 실행 순서

| 순서 | 폴더 | 목적 | 정상 출력 |
| --- | --- | --- | --- |
| 1 | `00-health-auth` | 서버 상태와 로그인 세션 확인 | `/healthz`, `/readyz`는 `status`가 보인다. login은 `authenticated: true`와 cookie를 만든다. |
| 2 | `01-providers` | 설치 provider catalog와 선택 검증 | catalog는 `providers`, validate는 `valid/errors/warnings/selected`를 준다. |
| 3 | `02-target-admin` | target 등록 manifest와 agent token 확인 | `/targets`는 `registered`, `install_manifest`, `agent_token`을 준다. |
| 4 | `03-agent-runtime` | agent token 기반 connect/policy/evidence job 확인 | agent 요청은 `x-agent-token`이 맞으면 `accepted` 또는 job/policy body를 준다. |
| 5 | `04-command` | 사용자 command와 agent command poll/result 확인 | `/commands`는 event id, debug query는 command id, agent result는 event id를 준다. |
| 6 | `05-rca-dashboard` | dashboard read model 확인 | dashboard는 `items` 또는 incident `item`을 준다. |
| 7 | `06-gitops-approval` | webhook과 approval grant/reject 확인 | webhook은 signed request만 accepted, approval은 open record가 있어야 accepted다. |
| 8 | `07-ai` | AI conversation 생성/조회/메시지 추가 | create는 `conversation_id`, get은 `conversation/messages`를 준다. |
| 9 | `08-ops-dlq` | DLQ/metrics 운영 API 확인 | DLQ list는 `dead_letters`, metrics는 Prometheus text를 준다. |

## 자주 막히는 지점

| 증상 | 의미 | 처리 |
| --- | --- | --- |
| `401` 또는 `403` | session, role, cluster 권한, agent token 문제 | 먼저 `00-health-auth/06-login.bru`를 보내고, agent 요청이면 `agent_token`을 확인한다. |
| `/targets`가 `agent_token`을 반환 | 정상 | 이 값을 `agent_token` environment에 넣고 agent 폴더 요청을 보낸다. |
| `/agent/commands/poll`이 `{"command": null}` | 현재 queue에 명령이 없음 | `04-command/01-manual-command.bru` 또는 `02-debug-query.bru`를 먼저 보낸다. |
| `/agent/evidence/jobs/poll`이 `{"job": null}` | 해당 provider queue에 job이 없음 | `03-agent-runtime/05-schedule-evidence-jobs.bru`를 먼저 보낸다. |
| dashboard `items: []` | read model에 event가 들어오지 않았거나 권한 필터로 제외됨 | evidence/RCA event가 들어갔는지, 로그인 사용자가 cluster read 권한이 있는지 본다. |
| GitHub webhook `401` | signature 불일치 | body와 `github_webhook_signature`를 같은 secret으로 다시 계산한다. |

## GitHub webhook signature 만들기

`docs/api/06-gitops-approval/github-webhook-body.json`과 `01-github-webhook.bru`의 body는 같은 값이다. body를 바꾸면 아래 명령을 다시 돌린다.

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

출력값을 Bruno environment의 `github_webhook_signature`에 넣는다.

## Bruno CLI

Bruno CLI가 설치되어 있으면 폴더 단위 실행도 가능하다.

```bash
bru run api --env local
bru run api --env aws-test
```

단, 일부 요청은 사전 데이터가 없으면 404/409가 정상일 수 있다. 이 collection은 자동 CI보다 사람이 흐름을 눈으로 확인하는 데 맞춰져 있다.
