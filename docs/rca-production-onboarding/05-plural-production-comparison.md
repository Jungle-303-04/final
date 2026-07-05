# Plural 비교와 프로덕션 보강 항목

이 문서는 `pluralsh/plural`을 참고해서 우리 프로젝트가 프로덕션급으로 가기 위해 무엇을 더 단단히 해야 하는지 정리한 것이다.

비교 기준:

- Plural repository: `https://github.com/pluralsh/plural`
- 확인 commit: `f2a74344072a98f123e0830551a235ace3e4c45b`
- source inventory: 1,712개 source 파일, 206,211 lines
- 비교 방식: 전체 파일 목록과 line count를 먼저 잡고, 우리 RCA/command/target/dashboard/permission과 직접 연결되는 Plural 도메인 파일을 열어 코드 구조를 비교했다.

## Plural에서 배울 기준

Plural은 “이벤트가 한 번 지나갔다”에서 끝나지 않고, 사용자가 다시 열어볼 수 있는 운영 객체를 만든다.

우리 프로젝트도 event chain은 이미 있다. 프로덕션으로 가려면 아래 운영 객체가 필요하다.

| 운영 객체 | 왜 필요한가 | 우리 현재 기준 |
| --- | --- | --- |
| Incident | RCA 결과를 사람이 다시 열어볼 수 있어야 한다. | `IncidentRecord`, `RcaCompletedBody`는 있지만 dashboard read model은 추가해야 한다. |
| Timeline / History | 장애 발생부터 PR/command 결과까지 한 화면에서 추적해야 한다. | `audit-worker`는 모든 event를 저장한다. dashboard용 projection table은 추가해야 한다. |
| Permission Filter | UI 숨김이 아니라 backend query에서 걸러야 한다. | `require_cluster_access`, `accessible_resource_ids`를 사용한다. |
| Cluster Summary | cluster 상태, agent 상태, evidence provider 상태를 한 번에 봐야 한다. | target registration, policy, evidence job은 있다. dashboard summary projection을 추가한다. |
| Rollout / Run Step | 긴 작업은 step, lock, heartbeat, retry 상태를 보여야 한다. | command queue는 lease가 있다. RCA run step read model은 추가한다. |
| SCM Boundary | 외부 write는 한 서비스가 책임지고 결과 event를 남겨야 한다. | `scm-worker`와 `GithubScmProvider`가 실제 PR 경계다. |
| AI Assist | AI는 근거를 보조해야지 원장을 대체하면 안 된다. | rule-first RCA와 fallback event가 분리되어 있다. |

## 비교에 사용한 Plural 파일

| 영역 | Plural 파일 | 우리 프로젝트에서 대응되는 파일 |
| --- | --- | --- |
| Incident | `apps/core/lib/core/schema/incident.ex` | `src/domains/rca/events.py` |
| Incident message | `apps/core/lib/core/schema/incident_message.ex` | dashboard detail comment/message 추가 대상 |
| Incident history | `apps/core/lib/core/schema/incident_history.ex` | dashboard timeline projection 추가 대상 |
| Incident service | `apps/core/lib/core/services/incidents.ex` | RCA worker chain + dashboard query router 추가 대상 |
| Incident GraphQL | `apps/graphql/lib/graphql/schema/incidents.ex`, `resolvers/incidents.ex` | gateway response DTO + dashboard route 추가 대상 |
| Audit | `apps/core/lib/core/schema/audit.ex`, `services/audits.ex` | `src/domains/audit/*`, `src/services/projection/audit-worker/app.py` |
| Audit pubsub | `apps/core/lib/core/pubsub/consumers/audits.ex`, `protocols/auditable.ex` | `@app.on_any` projector |
| Cluster | `apps/core/lib/core/schema/cluster.ex`, `services/clusters.ex` | `src/domains/target/*`, `cluster-agent` |
| Cluster info/history | `cluster_information.ex`, `cluster_usage_history.ex` | dashboard cluster summary projection 추가 대상 |
| Rollout | `schema/rollout.ex`, `services/rollouts.ex`, `worker/rollouts/*` | command lease, RCA run step projection 추가 대상 |
| SCM | `services/shell/scm.ex`, `services/shell/scm/github.ex` | `src/services/gitops/scm-worker/app.py`, `GithubScmProvider` |
| RBAC | `schema/role.ex`, `schema/role_binding.ex`, `services/rbac.ex` | `ResourceAccessGrant`, `WorkspaceAccessRepository` |
| AI | `services/ai.ex`, `clients/openai.ex`, GraphQL AI schema/resolver | `rca.ai_fallback.requested`, `chat-worker` |

## Incident / RCA

Plural 패턴:

- incident를 DB schema로 둔다.
- message/history를 incident와 분리한다.
- GraphQL query/subscription으로 incident list/detail을 제공한다.

우리 현재 코드:

- `ClusterEvidenceReceivedBody`
- `Evidence`
- `IncidentRecord`
- `EvidenceBundle`
- `CauseCandidate`
- `CauseEvaluation`
- `RcaCompletedBody`
- `RcaActionRequiredBody`
- `RcaReport` table

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 | 시작 파일 |
| --- | --- | --- | --- |
| 가인 | `RcaRun`, `RcaRunStep` 값 객체와 저장소 | RCA가 여러 worker를 지나가므로 중간 상태를 다시 볼 수 있어야 한다. | `src/domains/rca/models.py` |
| 가인 | incident message/history event | action_required, AI fallback, 사람이 남긴 메모를 RCA와 연결한다. | `src/domains/rca/events.py` |
| 찬빈 | RCA timeline response DTO | frontend가 event payload를 직접 파싱하지 않게 한다. | `src/packages/contracts/gateway/responses.py` |
| 찬빈 | RCA timeline query API | dashboard가 DB/event bus를 직접 읽지 않게 한다. | `src/domains/rca/router.py` 또는 신규 dashboard router |

구현 순서:

1. `RcaTimelineItem`, `RcaTimelineResponse` DTO를 만든다.
2. `rca_timeline` projection table을 만든다.
3. `dashboard-worker`가 `@app.on_any`로 event를 받아 upsert한다.
4. query router에서 `workspace_id`와 cluster 권한으로 필터링한다.
5. frontend는 query response만 렌더링한다.

## Audit / Timeline

Plural 패턴:

- PubSub event를 `Auditable` protocol로 audit row로 바꾼다.
- audit schema는 actor, action, account/resource 정보를 남긴다.

우리 현재 코드:

- `src/services/projection/audit-worker/app.py`
- `src/domains/audit/models.py`
- 모든 event를 `@app.on_any`로 받아 audit log에 저장한다.

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 |
| --- | --- | --- |
| 찬빈 | dashboard 전용 timeline projection | audit log는 원장이고 화면은 사람이 읽는 상태 모델이 필요하다. |
| 찬빈 | event subject별 status mapping | `safe_pr.requested`와 `safe_pr.created`를 같은 상태처럼 보이면 안 된다. |
| 가인 | RCA event에 `incident_id`, `evidence_ref`, `reason` 누락 금지 | projection이 연결할 키가 없으면 timeline이 끊긴다. |

## Cluster / Target

Plural 패턴:

- cluster schema, cluster information, usage history를 분리한다.
- cluster service가 ping/usage/upgrade 같은 운영 정보를 관리한다.

우리 현재 코드:

- target 등록: `src/domains/target/router.py`
- agent identity: `require_cluster_agent`
- agent policy: `/agent/policy`, `/clusters/{cluster_id}/policy`
- evidence job: schedule/poll/result
- Kubernetes snapshot provider: `KubernetesSnapshotProvider`
- metrics/logs/traces provider: provider job으로 실행

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 |
| --- | --- | --- |
| 민정 | provider별 `provider_status`를 동일 shape로 유지 | dashboard가 Kubernetes/metrics/logs/traces를 같은 표로 보여야 한다. |
| 민정 | evidence job 실패 사유 표준화 | 수집 실패와 장애 발생을 구분해야 한다. |
| 찬빈 | cluster summary projection | cluster별 agent, provider, last evidence time을 한 화면에서 보여야 한다. |
| 찬빈 | provider status UI | RCA가 왜 결론을 못 냈는지 missing evidence와 연결한다. |

## Rollout / Long Running Work

Plural 패턴:

- rollout은 queue/lock/heartbeat/cursor를 가진다.
- 긴 작업은 step 상태를 남긴다.

우리 현재 코드:

- command queue는 lease/heartbeat/result가 있다.
- evidence job도 lease/poll/result가 있다.
- RCA chain은 event retry는 있지만, 화면용 run step table은 추가해야 한다.

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 |
| --- | --- | --- |
| 민정 | command/evidence job 상태를 dashboard projection에 공급 | target 쪽 작업이 어디서 멈췄는지 보여준다. |
| 가인 | RCA worker별 step status projection source | RCA가 evidence/plan/analyze/recovery 중 어디서 멈췄는지 보여준다. |
| 찬빈 | run step UI | “분석 중”과 “사람 조치 필요”를 구분한다. |

## SCM / Safe PR

Plural 패턴:

- SCM 작업은 별도 service/client 경계로 둔다.
- provider별 OAuth/token/header 처리를 한 곳에 모은다.

우리 현재 코드:

- `SafePrRequestedBody`
- `SafePrFilePatch`
- `SafePrCreatedBody`
- `SafePrFailedBody`
- `src/services/gitops/scm-worker/app.py`
- `GithubScmProvider`

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 |
| --- | --- | --- |
| 가인 | Safe PR body에 RCA evidence/ref/check/rollback을 넣는다. | reviewer가 PR만 보고도 왜 필요한 변경인지 알아야 한다. |
| 가인 | patch 생성 실패와 provider 실패를 분리한다. | 원인별로 재시도/수정 방법이 다르다. |
| 찬빈 | PR requested/created/failed 상태를 분리 표시한다. | URL이 없는 요청 상태와 실제 PR 생성 상태는 다르다. |

## Permission / RBAC

Plural 패턴:

- `Role`, `RoleBinding`, `Rbac` service가 있고, resolver/service에서 action을 검사한다.
- 권한은 UI가 아니라 backend service가 최종 판단한다.

우리 현재 코드:

- `AccountRole`
- `WorkspaceRole`
- `AccessRole`
- `ResourceAccessGrant`
- `WorkspaceAccessRepository.user_has_resource_access()`
- `WorkspaceAccessRepository.accessible_resource_ids()`
- `require_resource_access()`
- `require_cluster_access()`
- `realtime-gateway` browser WebSocket session/workspace 검사

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 |
| --- | --- | --- |
| 찬빈 | dashboard query에서 `accessible_resource_ids` 사용 | 목록 조회에서 권한 없는 cluster가 보이면 안 된다. |
| 찬빈 | frontend action gating | 버튼 숨김/비활성화로 사용자가 실패 요청을 덜 보내게 한다. |
| 민정 | agent route는 계속 token identity만 신뢰 | body workspace/cluster를 믿으면 cross-tenant 문제가 생긴다. |
| 가인 | Safe PR/command로 이어지는 action은 backend deploy 권한 확인 | RCA가 만든 추천이라도 실행 권한은 따로 봐야 한다. |

## AI Assist

Plural 패턴:

- AI service는 제품 객체와 연결된 보조 기능이다.
- 대화/응답을 API schema로 분리한다.

우리 현재 코드:

- rule-first RCA chain
- `rca.rule_missing`
- `rca.backlog.created`
- `rca.ai_fallback.requested`
- `chat-worker`

프로덕션 보강:

| 담당 | 무엇을 구현하는가 | 왜 필요한가 |
| --- | --- | --- |
| 가인 | AI fallback 결과도 evidence_ref/supporting/missing evidence를 갖게 한다. | AI가 근거 없는 결론을 만들면 RCA 신뢰가 깨진다. |
| 가인 | rule catalog coverage report | 어떤 symptom이 rule로 처리되고 어떤 symptom이 fallback인지 알아야 한다. |
| 찬빈 | AI fallback/action_required UI | 자동 결론이 아닌 상태를 확정 원인처럼 보이면 안 된다. |

## 역할별 구현 순서

### 민정

1. `@telemetry.source` provider 계약을 확인한다.
2. `TelemetryQueryDefinition`이 provider query value object로 바뀌는지 테스트한다.
3. Kubernetes/Prometheus/Loki/Tempo provider 결과가 같은 evidence job 흐름으로 schedule/poll/result 되는지 확인한다.
4. `/agent/debug/query`로 실제 query command가 queue되고 target agent의 `@command.handler("telemetry.query.run")`에서 실행되는지 확인한다.
5. provider 결과에는 `provider_status`와 count/reason을 넣어 찬빈이 화면에 표시할 수 있게 한다.

### 가인

1. `EvidenceBundle`의 `items`와 `missing_evidence`를 rule catalog 기준으로 만든다.
2. `CauseCandidate`의 `expected_evidence`와 `checks`를 symptom catalog와 맞춘다.
3. `CauseEvaluation`이 supporting/missing evidence를 반드시 남기게 한다.
4. `RcaCompletedBody`에는 `evidence_ref`, `incident`, `rca_detail`을 채운다.
5. Safe PR이 필요한 action은 `SafePrRequestedBody`로만 넘기고, 실제 PR 생성은 `scm-worker`가 하게 둔다.

### 찬빈

1. `AuthSessionResponse`로 로그인 상태를 확인한다.
2. dashboard query API는 `require_session`을 사용한다.
3. cluster별 화면은 `require_cluster_access(..., READ_ACCESS)` 또는 `accessible_resource_ids(..., READ_ACCESS)`로 필터링한다.
4. command/approval/recovery action 버튼은 session role과 backend 권한 결과를 기준으로 비활성화한다.
5. realtime browser는 세션 workspace 밖으로 구독하지 못한다.
6. UI는 event body를 직접 파싱하지 않고 dashboard response DTO를 사용한다.

## 완료 기준

아래가 모두 되면 Plural에서 참고한 운영 구조에 가까워진다.

- incident/RCA timeline을 사용자가 다시 열어볼 수 있다.
- evidence 수집 실패와 장애 원인을 분리해서 볼 수 있다.
- command, evidence job, RCA, Safe PR이 같은 correlation timeline에 표시된다.
- backend query가 workspace와 resource 권한으로 필터링된다.
- browser realtime도 세션 workspace 밖으로 나가지 못한다.
- Safe PR URL은 `safe_pr.created` 이후에만 표시된다.
- AI fallback 결과도 evidence_ref와 missing evidence를 남긴다.
