# 하드닝 로드맵

이 문서는 현재 코드가 이미 가진 강점 위에, 실운영 자동 변경과 연구/논문 수준 주장에 필요한 보강 계획을 정리한다. 기준은 2026-07-04 코드 상태다.

범위:

- GitOps source-of-truth: 실제 repo checkout, 승인 스냅샷, 정책 연결, 배포 패치 PR.
- AI tool agent: JSON-only tool loop를 더 강한 schema, 권한, 비용 경계로 보강.
- Control-plane observability: event runtime 자체의 지연, DLQ율, lag, trace correlation.
- Target automation safety: token rotation, approval evidence, action allowlist, partial failure report.
- RCA/AIOps: rule/playbook baseline을 연구 수준 claim과 분리하고 eval 경로를 만든다.

## 원칙

1. Demo fallback은 남길 수 있지만 production route에서는 fail-closed가 기본이다.
2. 외부 write는 `credential_ref`, feature flag, policy decision, approval evidence가 모두 있어야 한다.
3. GitOps 변경은 Git commit/ref, rendered artifact digest, diff basis, approval snapshot을 따라갈 수 있어야 한다.
4. AI가 실행 가능한 도구는 schema, 권한, 비용 한도, audit trace를 가진 도구만 허용한다.
5. 운영 신뢰성은 증거 payload 수집만으로 주장하지 않는다. control-plane 자체의 lag, DLQ, retry, outbox, trace를 계측한다.

## P0. 실운영 자동 변경 차단 해제 기준

P0는 production 자동 변경을 말하기 전에 끝나야 하는 작업이다. 하나라도 빠지면 자동 apply 또는 실제 외부 write는 demo/sandbox 범위로만 설명한다.

| 축 | 작업 | 완료 기준 |
| --- | --- | --- |
| Git source | `GitSourcePort`를 만들고 local-file fallback을 dev/test 전용으로 제한한다. GitHub contents, repo checkout/cache, commit provenance를 같은 manifest source 계약 뒤에 둔다. | `git.changed`가 repo, branch, commit_sha, manifest_path, source_kind, artifact_digest를 남긴다. 같은 commit 재처리는 no-op이다. |
| Render | raw YAML, Kustomize, Helm renderer를 adapter로 분리한다. render error는 structured reason으로 `manifest.invalid`에 남긴다. | render 결과가 resource별 artifact로 저장되고, source commit/ref 없이 생성된 manifest는 production route에서 거부된다. |
| Approval snapshot | last-approved managed-field snapshot을 DB에 저장한다. snapshot은 approval_id, policy_id, commit_sha, rendered artifact digest와 연결한다. | `diff-worker`의 demo previous-approved fallback 없이 approved snapshot 기준으로 intended/drift/conflict를 구분하는 테스트가 있다. |
| Policy route | diff risk string 대신 operation, namespace, resource class, environment, approval state, action metadata로 route를 결정한다. | route 결과가 `safe_pr`, `approval_required`, `forbidden`, `command_requested` 중 하나로 구조화되고 audit에 남는다. |
| Manifest patch PR | Safe PR은 검토 문서만 커밋하지 않고 실제 manifest patch 또는 rollback patch를 포함한다. | PR diff에 Kubernetes manifest 변경이 있으며, body에는 diff basis, rollback, reviewer checklist, approval evidence가 포함된다. |
| Command safety | command-worker와 cluster-agent가 같은 action catalog를 기준으로 검증한다. | production/sandbox/observability action이 policy로 분리되고, 허용되지 않은 namespace/action은 Gateway와 agent 양쪽에서 거부된다. |
| Approval evidence | command payload와 agent 실행 metadata에 approval_ref/policy_decision_ref를 싣는다. | agent는 approval_ref가 없거나 만료된 write command를 fail-closed한다. |
| Partial failure | agent result schema에 per-resource status, sanitized stdout/stderr, retryable flag, applied flag를 둔다. | 부분 성공/부분 실패가 `command.completed`와 audit timeline에서 구분된다. |
| Token boundary | `TokenVaultPort`/`SecretVault`를 만들고 provider token은 event, log, DB payload에 직접 저장하지 않는다. | token rotation, revoked credential, missing scope, secret non-leak 테스트가 있다. |

## P1. AI 도구와 RCA 신뢰성

P1은 사용자에게 AI 운영 보조 기능을 안정적으로 노출하기 위한 기준이다. 이 단계 전에는 "AI가 자동으로 원인을 확정한다"가 아니라 "rule/playbook과 evidence 기반 후보를 제안한다"로 설명한다.

| 축 | 작업 | 완료 기준 |
| --- | --- | --- |
| Tool schema | `ToolSpec`에 input/output JSON Schema를 추가하고, JSON-only prompt 파싱 실패를 명시 이벤트나 failure metadata로 남긴다. | unknown argument, missing required, invalid output, malformed model reply가 모두 테스트된다. |
| Tool authorization | `ToolContext`에 user/session/role/action scope를 추가하고 도구 실행 전 policy port를 호출한다. | 같은 workspace라도 production write/read-sensitive tool은 별도 권한 없이는 실행되지 않는다. |
| Cost guardrail | provider, model, token estimate, max tool calls, timeout, retry count, cost bucket을 metadata와 metrics로 남긴다. | workspace별 budget 초과, provider quota error, timeout이 `ai.message.failed` 또는 degraded final로 수렴한다. |
| Prompt provenance | AI 답변과 RCA 설명에는 사용한 evidence_ref, tool_trace, model metadata를 남긴다. | audit/debug 조회에서 어떤 도구 결과가 답변에 쓰였는지 추적 가능하다. |
| RCA profile expansion | CrashLoopBackOff 외에 ImagePullBackOff, rollout unavailable, config error, dependency timeout profile을 추가한다. | 각 profile은 required evidence, candidates, insufficient evidence branch, recovery rule 테스트를 가진다. |
| AIOps eval | fault injection 시나리오와 expected root cause label을 만든다. MicroRCA/Sage식 graph/ranking 실험은 baseline과 비교한다. | 최소 5개 장애 시나리오에서 precision/recall 또는 top-k hit rate를 기록한다. |

## P1. Control-Plane Observability

Telemetry provider가 evidence를 수집하는 것과, 이 제품의 control plane이 잘 동작하는지는 다른 문제다. 아래 지표와 trace가 있어야 운영 신뢰성을 말할 수 있다.

| 신호 | 필수 측정값 |
| --- | --- |
| Worker processing | event 처리 시간, handler timeout, attempts, retry count, terminal status |
| NATS/stream lag | consumer pending, redelivery count, oldest event age, ack wait breach |
| Outbox | pending count, oldest pending age, relay success/failure, duplicate publish count |
| DLQ | dead letter count/rate, consumer별 DLQ, raw decode DLQ, replay success/failure |
| Command queue | queued/running/expired/failed count, lease age, heartbeat age, queue age target breach |
| GitOps | render latency, diff latency, policy route count, safe_pr.created/failed count |
| AI | LLM latency, timeout, retry, provider error, tool_call count, estimated token/cost |
| Target evidence | provider failure/fallback flag, evidence payload size, evidence source freshness |

Trace 기준:

- `correlation_id`, `causation_id`, `event_id`, `workflow_run_id`, `command_id`, `approval_id`는 span attribute로 연결한다.
- Gateway request, event emit, worker handler, DB write, outbox relay, outbound provider call, agent command result는 같은 trace에서 이어져야 한다.
- trace가 없어도 audit log로 최소한의 원인 추적이 가능해야 한다.

Alert 기준:

- DLQ rate가 0보다 크면 warning, 같은 consumer에서 반복되면 page 후보.
- oldest outbox age와 command queue age가 SLO를 넘으면 warning.
- `safe_pr.failed`, provider credential failure, approval timeout은 audit과 alert에 모두 남긴다.

## P2. Product/Research Maturity

| 축 | 작업 | 완료 기준 |
| --- | --- | --- |
| Dashboard projection | `dashboard-worker`와 read model schema를 추가한다. | workflow, approval, command, RCA, safe PR, DLQ가 같은 timeline에서 보인다. |
| Schema migration | Alembic 또는 동등한 migration 도구를 도입한다. | `db.init()` 직접 생성과 migration path가 분리되고 schema version이 기록된다. |
| Event versioning | `EventEnvelope`에 version/compat policy를 둔다. | 새 필드 추가/삭제가 golden event compatibility test를 통과한다. |
| Autoscaling | KEDA 또는 equivalent로 NATS lag 기반 worker scale을 정의한다. | backlog 증가 시 replica 증가, backlog 해소 시 축소가 staging에서 검증된다. |
| Research report | 논문별 비교 기준을 문서화한다. | Borg/Omega/Kubernetes, Sagas/Kafka, Dapper/Pivot, MicroRCA/Sage, ReAct/Toolformer 기준으로 구현/격차 표를 유지한다. |

## 역할별 시작점

| 역할 | 먼저 처리할 작업 |
| --- | --- |
| Platform / Integration | event schema version, metrics/export path, outbox/DLQ/replay metrics, KEDA 후보 |
| Gateway / Auth | TokenVault/SecretVault port, credential_ref, session/role/action policy |
| GitOps / Command | repo checkout/cache, approved snapshot, route policy, actual manifest patch PR |
| RCA / Safe PR | AI fallback 실제 연결, tool schema/eval, RCA profile expansion, PR body evidence |
| Target / Agent / Telemetry | approval_ref/action allowlist, partial result schema, provider freshness/fallback metrics |

## Release Gate

다음 조건을 만족하지 않으면 "production 자동 변경"으로 릴리스하지 않는다.

- `bash scripts/test.sh`가 통과한다.
- P0 표의 모든 항목에 테스트 또는 smoke evidence가 있다.
- production write는 feature flag off에서 fail-closed된다.
- provider token, kubeconfig, bearer token이 event/log/DLQ에 없다는 non-leak test가 있다.
- demo fallback이 사용되는 경우 UI/API/문서에 demo로 표시된다.
