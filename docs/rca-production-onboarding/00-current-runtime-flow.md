# 현재 실제 동작 흐름

여기서는 현재 코드가 실제로 어떻게 이어지는지만 본다. 작업자가 먼저 알아야 하는 것은 전체 내부 구현이 아니라, 어느 event가 어느 worker로 가고 어떤 값이 다음 사람에게 넘어가는지다.

## 1. Command 흐름

```text
POST /commands
  -> command.requested
  -> command-worker
  -> agent_commands table
  -> GET /agent/commands/poll
  -> POST /agent/commands/{command_id}/start
  -> target agent command handler
  -> POST /agent/commands/{command_id}/result
  -> command.completed
```

| 단계 | 현재 코드 | 왜 필요한가 | 어디에 쓰이는가 |
| --- | --- | --- | --- |
| 사용자 command 요청 | `src/domains/command/router.py::commands` | 사용자가 원하는 조치를 event로 바꾼다. | GitOps apply, RCA recovery에서 command 실행으로 이어진다. |
| command body | `src/domains/command/events.py::CommandRequestedBody` | worker와 테스트가 같은 입력 계약을 보게 한다. | `command-worker`가 정책 검사와 plan 생성을 한다. |
| 정책 검사 | `src/domains/command/handler.py::evaluate_command_policy` | namespace/action/approval 기준을 통과하지 못한 쓰기를 막는다. | `CommandRejectedBody` 또는 queue plan으로 갈라진다. |
| plan 생성 | `src/domains/command/handler.py::build_plan` | idempotency key, lease, retry, routing 조건을 고정한다. | `agent_commands.payload`에 저장된다. |
| agent queue 저장 | `queue_plan_for_agent` | target agent는 NATS를 직접 보지 않고 HTTP poll만 한다. | `GET /agent/commands/poll`이 lease한다. |
| agent 실행 | `src/services/target/cluster-agent/agent.py::execute_command` | target cluster 내부에서만 가능한 Kubernetes 작업을 실행한다. | command result를 management plane으로 돌려준다. |
| 결과 event | `complete_agent_command_and_stage_event` | 실행 결과를 `command.completed`로 되돌려 workflow/RCA/audit이 읽는다. | audit, workflow, frontend timeline에 쓰인다. |

## 2. Agent debug query 흐름

```text
POST /agent/debug/query
  -> cluster read 권한 확인
  -> action=telemetry.query.run command plan 저장
  -> target agent poll
  -> EvidenceCollector.run_query()
  -> command result
```

| 단계 | 현재 코드 | 왜 필요한가 | 어디에 쓰이는가 |
| --- | --- | --- | --- |
| debug query API | `src/domains/command/router.py::agent_debug_query` | 운영자가 provider query 하나를 직접 실행해 evidence 연결을 확인한다. | RCA rule 작성 전 Prometheus/Loki/Kubernetes query 검증에 쓴다. |
| request DTO | `AgentDebugQueryRequest` | query payload를 한 형태로 받는다. | `debug_query_plan()`이 command payload로 옮긴다. |
| command action | `Command.TELEMETRY_QUERY_RUN_ACTION` | target agent가 일반 command와 같은 poll/result 경로로 처리한다. | `@command.handler(QUERY_RUN_ACTION)`가 받는다. |
| query 실행 | `TargetClusterAgent.run_query_command` | provider registry를 통해 source별 query value object를 실행한다. | 결과가 command result payload에 들어간다. |

## 3. Evidence job 흐름

```text
EvidenceJobScheduler.schedule_once()
  -> POST /agent/evidence/jobs
  -> provider별 evidence_jobs row 생성

EvidenceJobScheduler.work_once(provider_key)
  -> GET /agent/evidence/jobs/poll
  -> provider query 실행
  -> POST /agent/evidence/jobs/{job_id}/result

Management plane
  -> 같은 evidence_key의 provider job이 terminal 상태인지 확인
  -> cluster.evidence.received 발행
```

| provider key | provider class | source | query value object | 최종 bucket |
| --- | --- | --- | --- | --- |
| `kubernetes` | `KubernetesSnapshotProvider` | `kubernetes` | `KubernetesSnapshotQuery` | `kubernetes` |
| `metrics` | `PrometheusMetricsProvider` | `prometheus` | `PrometheusInstantQuery`, `PrometheusRangeQuery` | `metrics` |
| `logs` | `LokiLogsProvider` | `loki` | `LokiLogQuery` | `logs` |
| `traces` | `TempoTracesProvider` | `tempo` | `OpenTelemetrySpanQuery` | `traces` |
| `metadata` | `MetadataProvider` | `metadata` | `MetadataSnapshotQuery` | `metadata` |

왜 provider별 job으로 나누는가:

- Kubernetes, metrics, logs, traces의 수집 속도와 실패 원인이 다르다.
- 한 provider가 실패해도 정책에 따라 다른 provider 결과를 먼저 모을 수 있다.
- provider worker 수를 `AgentPolicy`로 조절할 수 있다.
- 최종 `cluster.evidence.received`는 같은 `evidence_key`의 결과를 합쳐 한 window로 보낸다.

## 4. RCA 흐름

```text
cluster.evidence.received
  -> evidence-worker: evidence.built
  -> incident-worker: incident.detected, evidence.bundle.built
  -> plan-worker: rca.candidates.planned
  -> analyze-worker: rca.candidates.evaluated
  -> rca-worker: rca.completed 또는 rca.action_required
  -> recovery-worker: recovery.planned
  -> select-worker: recovery.action_selected 또는 recovery.selection_requested
  -> dispatch-worker: command.requested 또는 safe_pr.requested
```

| worker | 입력 | 출력 | 왜 필요한가 |
| --- | --- | --- | --- |
| `evidence-worker` | `ClusterEvidenceReceivedBody` | `EvidenceBuiltBody` | raw provider bucket을 RCA 공통 입력 `Evidence`로 고정한다. |
| `incident-worker` | `EvidenceBuiltBody` | `IncidentDetectedBody`, `EvidenceBundleBuiltBody` | 증상을 뽑고 incident별 판단 근거 묶음을 만든다. |
| `plan-worker` | `EvidenceBundleBuiltBody` | `RcaCandidatesPlannedBody`, 필요 시 rule/backlog/fallback 요청 | symptom에 맞는 원인 후보를 만들고, 매칭 룰이 생긴 symptom의 기존 missing-rule backlog를 `resolved`로 닫는다. |
| `analyze-worker` | `RcaCandidatesPlannedBody` | `RcaCandidatesEvaluatedBody` | 후보별 필요한 evidence와 실제 evidence를 비교해 점수를 낸다. |
| `rca-worker` | `RcaCandidatesEvaluatedBody` | `RcaCompletedBody` 또는 `RcaActionRequiredBody` | 충분한 근거가 있을 때만 root cause를 확정한다. |
| `recovery-worker` | `RcaCompletedBody` | `RecoveryPlannedBody` | root cause를 사람이 선택 가능한 조치 후보로 바꾼다. |
| `select-worker` | `RecoveryPlannedBody` | `RecoveryActionSelectedBody` 또는 `RecoverySelectionRequestedBody` | 자동 선택 가능 여부와 approval 필요 여부를 분리한다. |
| `dispatch-worker` | `RecoveryActionSelectedBody` | `CommandRequestedBody` 또는 `SafePrRequestedBody` | 실제 실행 route를 command와 PR 요청으로 나눈다. |

## 5. Safe PR 흐름

```text
safe_pr.requested
  -> safe-pr-worker: safe_pr.patch_prepared
  -> ai-diff-worker: diff.explained + safe_pr.ready_for_creation
  -> scm-worker: GithubScmProvider.create_pull_request()
  -> safe_pr.created 또는 safe_pr.failed
```

현재 실제 외부 PR 생성 책임은 `src/services/gitops/scm-worker/app.py`와 `src/services/gitops/scm-worker/github_provider.py`에 있다. 패치 초안은 `safe-pr-worker`, diff 설명과 생성 준비 이벤트는 `ai-diff-worker`, branch/commit/PR side effect는 `scm-worker`가 맡는다. RCA worker는 GitHub에 직접 쓰지 않는다. 이 경계를 지키는 이유는 credential, repo allowlist, branch/commit/PR side effect를 한 서비스에서 통제하기 위해서다.

## 6. Audit / Realtime 흐름

| 항목 | 현재 코드 | 왜 필요한가 | 어디에 쓰이는가 |
| --- | --- | --- | --- |
| audit projector | `src/services/projection/audit-worker/app.py` | 모든 event envelope를 `audit_log`에 남긴다. | 나중에 timeline, RCA 설명, 운영 감사에 쓴다. |
| dashboard projector | `src/services/projection/dashboard-worker/app.py` | RCA/command/Safe PR event를 `RcaTimeline` read model로 바꾼다. | `/dashboard/rca/timeline`, incident detail API가 쓴다. |
| dashboard query API | `src/domains/dashboard/router.py` | session과 cluster read 권한을 적용한다. | 찬빈 frontend가 읽는 API다. |
| realtime contract | `src/packages/contracts/realtime` | 화면에 보낼 payload 크기와 type을 제한한다. | frontend websocket/SSE 구현의 기준이 된다. |
| realtime gateway | `src/services/realtime/realtime-gateway` | live summary와 resource delta를 fan-out한다. | 찬빈 dashboard가 사용할 수 있는 backend 경계다. |

찬빈은 현재 동작하는 dashboard read model/API/realtime 계약을 기준으로 UI를 붙인다.
