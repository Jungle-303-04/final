# 역할별 구현 TODO 원장

이 문서는 WIKI `projects/final` 문서와 source `docs/team/*`를 맞춰 본 뒤,
각 담당자가 실제 구현해야 할 항목만 모아 둔 원장이다.
제품 코드를 대신 구현하지 않고, 담당자가 자기 브랜치에서 작은 PR 단위로
옮길 수 있도록 경로, 연결 계약, 완료 기준을 함께 적는다.

확인 기준:

- WIKI repo: `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final`
- 핵심 WIKI 문서: `README.md`, `wbs.md`, `team-work-allocation.md`,
  `team-conventions.md`, `event-queue-system-guide.md`, `mvp-plan.md`,
  `architecture.md`, `member-guides/*.md`
- source 문서: `docs/team/work-allocation.md`, `docs/team/conventions.md`,
  `docs/team/member-guides/*.md`, `docs/events.md`
- GitHub wiki 기능은 2026-06-30 확인 시 비활성화되어 있으며,
  형제 경로 WIKI repo가 실제 문서 원본이다.

## 공통 규칙

- TODO는 GitHub Project WBS 또는 담당 issue의 체크리스트로 옮긴 뒤 구현한다.
- PR 하나는 하나의 담당 영역 또는 하나의 vertical slice만 바꾼다.
- 새 API, event, DB table, Kubernetes 권한은 코드, 테스트, source docs, WIKI를 함께 갱신한다.
- fake adapter는 데모 fallback으로 남길 수 있지만 UI/API/문서에서 실제 구현처럼 표현하지 않는다.
- production namespace write는 금지하고 `sandbox` namespace write만 정책/승인 경계 안에서 허용한다.
- 역할 간 입력/출력, 테스트 선택, 모순 점검은 `docs/team/cross-role-implementation-test-guide.md`를 기준으로 한다.
- 실운영 자동 변경, 실제 provider write, AI tool 실행 하드닝은 `docs/hardening-roadmap.md`의 P0/P1 gate를 따른다.

## 공통 P0 하드닝 게이트

아래 항목은 역할별 구현보다 먼저 issue/WBS에 올려야 한다. production 자동 변경 또는 실제 외부 write를 말하려면 이 게이트가 닫혀 있어야 한다.

| 축 | 담당 조율 | 완료 기준 |
| --- | --- | --- |
| GitOps source-of-truth | GitOps / Command, Platform | repo checkout/cache, commit provenance, rendered artifact digest, last-approved snapshot이 연결된다. rendered artifact digest는 구현됐고 checkout/cache와 approved snapshot은 남았다. |
| 실제 manifest patch PR | GitOps / Command, RCA / Safe PR | Safe PR이 검토 문서만이 아니라 실제 manifest patch 또는 rollback patch를 커밋한다. rendered manifest patch 커밋 경로는 구현됐고, rollback/diff basis/approval evidence는 남은 P0다. |
| Policy route | GitOps / Command, Gateway / Auth, Target / Agent | operation, namespace, resource class, environment, approval state로 route를 결정하고 audit에 남긴다. |
| Token boundary | Gateway / Auth, Platform | TokenVault/SecretVault port, credential_ref, rotation, non-leak 테스트가 있다. GitHub provider env token_ref 경로는 구현됐고, 외부 vault/rotation/scope 검증은 남았다. |
| Approval evidence | Gateway / Auth, GitOps / Command, Target / Agent | write command에 approval_ref/policy_decision_ref가 있고 agent가 이를 검증한다. 누락 거부와 payload 전달은 구현됐고, ref 만료/권한 검증은 남은 P0다. |
| Agent partial failure | Target / Agent, Platform | sanitized stdout/stderr, per-resource status, retryable flag, applied flag가 command result에 남는다. 기본 result schema는 구현됐고, 단계별 partial apply와 retryable 분류 고도화는 남았다. |
| AI tool guardrail | RCA / Safe PR, Platform, Gateway / Auth | tool schema, tool authorization, cost/timeout guardrail, malformed reply 테스트가 있다. |
| Control-plane observability | Platform, Target / Telemetry | worker latency, NATS lag, outbox age, DLQ율, command queue age, trace correlation metric이 있다. |

## Platform / Integration

담당 경로:

- `src/packages/config`
- `src/packages/contracts`
- `src/packages/events`
- `src/packages/runtime`
- `src/packages/storage`
- `.github`
- `deploy`
- `scripts`

TODO:

- TODO(platform): `make check`, `make smoke`, `make status`가 같은 runtime dependency 집합을 보도록 CI와 로컬 명령을 맞춘다.
- TODO(platform): 새 event subject/body가 `src/packages/contracts/event_bus`, `docs/events.md`, 테스트에 동시에 반영되는 contract gate를 보강한다.
- TODO(platform): outbox relay가 provider side effect 전 crash injection 시나리오를 통과하도록 운영 검증을 유지한다.
- TODO(platform): dashboard read model 확장 시 `dashboard.updated`, query API, SSE stream이 같은 correlation 기준을 쓰는지 검증한다.
- TODO(platform): 데모 전 E2E runbook을 command 입력, evidence, RCA, Safe PR fake, dashboard, DLQ/replay까지 한 줄로 실행 가능하게 유지한다.
- TODO(platform): worker 처리 시간, attempts, retry, DLQ율, outbox pending age, NATS consumer lag, command queue age metric을 노출한다.
- TODO(platform): Gateway/event emit/worker/DB/outbox/outbound call 사이에 `correlation_id`와 `causation_id` trace attribute를 연결한다.
- TODO(platform): event schema version과 DB migration 도입 전까지 계약 변경 PR에 golden event compatibility test를 요구한다.

완료 기준:

- `make check` 통과.
- 이벤트 카탈로그(`python scripts/events.py`)가 새 subject/body와 실제 producer/consumer를 설명한다.
- Runtime/DB/relay 변경에는 최소 하나의 failure-path 테스트가 있다.

## Gateway / Auth

담당 경로:

- `src/services/gateway/api-gateway`
- `src/packages/contracts/gateway`
- identity, integration, security 계약 패키지 후보

TODO:

- TODO(gateway): 일반 로그인, 세션, 로그아웃 route를 schema-first로 추가하고 secret/session token이 event payload에 들어가지 않게 한다.
- TODO(gateway): org/project role guard를 route별 복붙이 아니라 공통 policy/port로 연결한다.
- TODO(gateway): GitHub repo integration target, credential ref, credential binding 구조를 만든 뒤 Token Broker 경계로 provider token을 숨긴다.
- TODO(gateway): `POST /agent/evidence`는 request schema 검증 후 `cluster.evidence.received`만 발행하고 worker 로직을 직접 실행하지 않는다.
- TODO(gateway): agent registry/status, command poll/result API가 Target/Telemetry와 같은 DTO를 쓰도록 계약을 고정한다.
- TODO(gateway): Git watch target 등록/조회/manual poll API는 Gateway가 설정과 권한만 관리하고 polling 실행은 worker가 맡게 한다.
- TODO(gateway): `TokenVaultPort`/`SecretVault` port를 만들고 provider token은 event/log/DLQ에 직접 남지 않게 한다. 기본 port와 GitHub provider env token_ref 사용은 구현됐고 Gateway credential binding 연결은 남았다.
- TODO(gateway): approval_ref, policy_decision_ref, approver, expiry를 command/write API와 audit에 연결한다. command API 전달은 구현됐고 approver/expiry 검증은 남았다.
- TODO(gateway): AI tool 실행 전 user/session/workspace/action scope를 확인할 policy port를 제공한다.

완료 기준:

- Gateway route 테스트가 valid request, invalid schema, unauthorized/forbidden, secret non-leak을 모두 포함한다.
- Gateway가 외부 HTTP write의 유일한 입구라는 제약을 깨지 않는다.
- 새 route는 `src/packages/contracts/gateway/routes.py`와 request/response 계약을 동반한다.

## GitOps / Command

담당 경로:

- `src/services/gitops/*`
- `src/services/command/command-worker`
- command/diff/event 계약

TODO:

- TODO(gitops): git polling 입력에서 `git.changed`까지 idempotent하게 감지하고 같은 commit을 중복 발행하지 않는다.
- TODO(gitops): manifest render는 실제 Git/Kustomize 실패를 구조화된 에러로 다루고 raw exception을 event payload에 넣지 않는다.
- TODO(gitops): desired diff는 create/update/delete와 risk reason을 구조화해서 Safe PR/command 판단의 근거가 되게 한다.
- TODO(gitops): production route에서는 local-file fallback 없이 repo checkout/cache 또는 GitHub contents source만 허용한다.
- TODO(gitops): rendered artifact digest와 last-approved managed-field snapshot을 저장하고 diff basis에 연결한다.
- TODO(gitops): diff route는 risk string이 아니라 operation, namespace, resource class, environment, approval state로 `safe_pr`/`approval_required`/`forbidden`/`command_requested`를 반환한다.
- TODO(gitops): Safe PR 요청 body에 rollback patch ref, reviewer checklist, diff basis를 포함한다. rendered manifest patch는 `SafePrFilePatch`로 전달한다.
- TODO(command): `command.requested`는 namespace/action 정책을 범용 rule로 검사하고 production write를 fail-closed한다.
- TODO(command): write command는 approval_ref/policy_decision_ref가 없으면 fail-closed하고, agent queue payload에도 같은 근거를 싣는다. 누락 거부와 queue 전달은 구현됐고 ref 검증 store 연결은 남았다.
- TODO(command): dispatch/queue 단계는 Target Agent를 직접 호출하지 않고 agent command queue 계약만 사용한다.
- TODO(command): queue 저장 실패와 event 발행 불일치가 생기지 않도록 outbox/UoW 경계를 Platform과 맞춘다.

완료 기준:

- `git.changed -> manifest.rendered -> desired.diff.detected -> diff.analyzed` handler chain 테스트가 있다.
- `command.requested -> command.dispatch.ready -> command.queued_for_agent -> command.completed` 흐름 테스트가 있다.
- 정책 거부 케이스는 `command.rejected`와 audit/dashboard 영향까지 검증한다.

## RCA / Safe PR

담당 경로:

- `src/services/ai/rca-worker`
- `src/services/gitops/scm-worker`
- `src/services/projection/audit-worker`
- `src/domains/rca`
- `src/domains/scm`

TODO:

- TODO(rca): evidence가 부족한 경우 RCA를 억지로 생성하지 않고 insufficient evidence 상태를 event/body로 표현한다.
- TODO(rca): RCA baseline은 `cluster.evidence.received` 원본을 정규화한 evidence bundle만 근거로 삼고 추측 문자열을 상수로 고정하지 않는다.
- TODO(rca): AI 기본 질의 경계는 evidence, RCA result, command 승인, PR 설명/재생성 입력을 분리한 port/interface로 둔다.
- TODO(rca): AI fallback worker를 실제 pipeline에 연결하거나 demo 문서에서 fallback claim을 제거한다.
- TODO(rca): ToolSpec에 input/output schema, authorization requirement, cost class를 추가하고 malformed reply/invalid output 테스트를 둔다.
- TODO(rca): CrashLoopBackOff 외 장애 profile과 fault-injection expected label을 만들어 RCA top-k hit rate를 기록한다.
- TODO(rca): `rca.completed` 이후 Safe PR 후보와 approval-required 후보를 분기하는 정책 body를 정의한다.
- TODO(scm): 실제 GitHub branch/commit/PR 생성은 feature flag와 token/ref 검증을 통과한 경우에만 실행한다.
- TODO(scm): 실제 PR은 proposal markdown만 커밋하지 않고 manifest patch/rollback patch를 포함해야 한다. rendered manifest patch 커밋은 구현됐고 rollback patch, feature flag, token/ref 검증, repo allowlist가 남았다.
- TODO(audit): command, RCA, PR 상태가 같은 `correlation_id`로 timeline에 남도록 projection을 보강한다.

완료 기준:

- RCA output은 evidence reference와 root-cause/action 근거를 가진다.
- Safe PR 실제 write 테스트는 fake client와 feature-flag-off fail-closed 케이스를 포함한다.
- repo write 실패는 `safe_pr.failed`와 audit timeline에 남는다.

## Target / Agent / Telemetry

담당 경로:

- `src/services/target/cluster-agent`
- `src/services/target/node-collector`
- `deploy/target`

TODO:

- TODO(target): Target Agent는 inbound port 없이 Gateway HTTP API로만 outbound 연결한다.
- TODO(target): agent registry/status와 heartbeat payload를 Gateway/Auth 계약과 맞춘다.
- TODO(target): command polling/result 보고는 Gateway가 내려준 correlation을 유지하고 DB/NATS를 직접 알지 않게 한다.
- TODO(telemetry): Prometheus, Loki, OpenTelemetry adapter는 raw telemetry 전체가 아니라 EvidenceDraft/summary evidence로 축약한다.
- TODO(telemetry): Kubernetes pod/event/node reader는 최소 RBAC와 sandbox write 제한을 테스트로 증명한다.
- TODO(telemetry): fake Prometheus/Loki/OTel adapter는 fallback으로 남기되 실제 adapter와 같은 interface를 구현한다.
- TODO(target): Target Agent는 command/result를 telemetry/evidence보다 우선 처리하도록 bounded queue와 local durable outbound spool 설계를 적용한다. 세부 기준은 `docs/team/member-guides/target-agent-local-queue.md`를 따른다.
- TODO(target): agent action allowlist를 workspace/repo/cluster/environment 정책과 approval evidence까지 확장한다. approval evidence 누락 거부는 구현됐고 workspace/repo/cluster 정책 동기화가 남았다.
- TODO(target): command result에 sanitized stdout/stderr, resource별 status, retryable flag, applied flag를 포함한다. 기본 필드는 구현됐고, 다중 resource partial apply와 retryable 분류 고도화가 남았다.
- TODO(telemetry): evidence provider failure/fallback, source freshness, payload size를 control-plane metric/audit metadata로 남긴다.

완료 기준:

- Agent가 `/agent/evidence`, `/agent/commands/poll`, `/agent/commands/{id}/result` 계약을 통해서만 management plane과 통신한다.
- telemetry evidence에는 source/ref/timestamp가 포함되어 RCA가 근거를 추적할 수 있다.
- Kubernetes write adapter는 sandbox namespace 외 요청을 거부한다.

## Cross-Role 계약 TODO

- TODO(cross-role): evidence schema 변경은 Target/Telemetry, Gateway/Auth, RCA/Safe PR이 같은 PR 설명에 승인/영향을 남긴다.
- TODO(cross-role): command payload 변경은 Gateway/Auth, GitOps/Command, Target/Telemetry가 함께 테스트한다.
- TODO(cross-role): Safe PR 실제 연동 전 GitHub token scope, branch naming, rollback 방법을 WIKI/source docs에 반영한다.
- TODO(cross-role): dashboard button이 실제 API/event/read model chain 없이 성공처럼 보이면 release gate에서 차단한다.
