# 가인: Evidence + RCA + Safe PR

가인 파트는 민정이 만든 evidence를 근거 있는 RCA 결과와 조치 후보로 바꾸는 역할이다.

RCA worker가 GitHub에 직접 쓰지는 않는다. Safe PR이 필요하면 `safe_pr.requested`를 만들고, 실제 PR 생성은 `scm-worker`와 `GithubScmProvider`가 담당한다.

## 먼저 열 파일

| 순서 | 파일 | 이유 |
| --- | --- | --- |
| 1 | `src/domains/rca/events.py` | RCA event body 계약 |
| 2 | `src/services/ai/evidence-worker/app.py` | `cluster.evidence.received` 시작점 |
| 3 | `src/services/ai/incident-worker/app.py` | evidence -> incident |
| 4 | `src/services/ai/plan-worker/app.py` | RCA candidate 계획 |
| 5 | `src/services/ai/analyze-worker/app.py` | candidate 평가 |
| 6 | `src/services/ai/rca-worker/app.py` | RCA 결과 생성 |
| 7 | `src/services/ai/recovery-worker/app.py` | 복구 계획 |
| 8 | `src/services/ai/select-worker/app.py` | action route 선택 |
| 9 | `src/services/ai/dispatch-worker/app.py` | command 또는 Safe PR 요청 |
| 10 | `src/services/gitops/scm-worker/app.py` | `safe_pr.requested` 이후 실제 PR 경계 |

## 데코레이터 사용법

worker는 `@app.on(BodyType)`으로 자기 입력 event body를 고른다.

```python
app = App("incident-worker")


@app.on(EvidenceBuiltBody)
async def on_evidence(evt, ctx):
    yield IncidentDetectedBody(...)
```

새 event body는 `@event(EventSubject.X)`로 subject를 붙인다.

```python
@event(EventSubject.RCA_COMPLETED)
@dataclass(frozen=True)
class RcaCompletedBody(EventBody):
    ...
```

handler가 `yield`하면 runtime이 correlation/causation/outbox/retry를 처리한다. worker 안에서 직접 event bus publish를 하지 않는다.

## 입력: 민정에게 받는 값

`cluster.evidence.received`에서 가인이 봐야 하는 값:

| 값 | 의미 |
| --- | --- |
| `workspace_id` | tenant 경계 |
| `cluster_id` | target cluster |
| `agent_id` | 수집한 agent |
| `source_id` | evidence source |
| `window_start` | 수집 window |
| `evidence_key` | window dedupe key |
| `kubernetes` | pod/event/node/workload/service/endpoint snapshot |
| `metrics` | Prometheus query 결과 |
| `logs` | Loki query 결과 |
| `traces` | Tempo trace query 결과 |

RCA는 provider raw response 전체를 전제로 만들지 않는다. provider adapter가 줄여준 bounded summary와 supporting evidence를 기준으로 판단한다.

## RCA 흐름

```text
cluster.evidence.received
  -> evidence.built
  -> incident.detected
  -> evidence.bundle.built
  -> rca.candidates.planned
  -> rca.candidates.evaluated
  -> rca.completed 또는 rca.action_required
  -> recovery.planned
  -> recovery.action_selected
  -> command.requested 또는 safe_pr.requested
```

판단 기준:

- 근거가 부족하면 `rca.action_required`로 멈춘다.
- 확정 원인에는 supporting evidence가 있어야 한다.
- missing evidence는 화면과 audit에서 보여줄 수 있게 남긴다.
- 자동 command는 policy와 approval 조건을 통과해야 한다.
- PR이 필요한 조치는 `safe_pr.requested`까지만 만든다.

## Safe PR 경계

가인이 만드는 것은 PR 자체가 아니라 PR 요청이다.

```text
RCA / dispatch
  -> safe_pr.requested
  -> scm-worker
  -> GithubScmProvider
  -> safe_pr.created 또는 safe_pr.failed
```

`scm-worker` 기준:

- GitHub branch/commit/PR 생성 책임을 가진다.
- token이나 credential 원문을 event에 넣지 않는다.
- repo 설정, credential, write flag가 부족하면 `safe_pr.failed`로 끝낸다.
- 성공하면 PR URL, branch, commit SHA 같은 reference만 event에 남긴다.

찬빈 화면은 `safe_pr.requested`만 보고 PR URL이 있다고 가정하면 안 된다. URL은 `safe_pr.created` 이후에만 있다.

## 찬빈에게 넘기는 값

RCA 결과와 action 상태를 화면에서 보여주려면 아래가 필요하다.

- `correlation_id`
- `incident_id`
- `evidence_ref`
- `root_cause`
- `confidence`
- `supporting_evidence`
- `missing_evidence`
- `action_route`
- `command_id` 또는 `safe_pr` 관련 reference
- 최종 event subject

## 연습 순서

1. `tests/test_rca_evidence.py`에서 evidence 입력과 RCA 결과를 본다.
2. `tests/test_event_golden_path.py`에서 이벤트가 끊기지 않는지 본다.
3. `tests/test_repo_gateway_worker.py`에서 `safe_pr.requested` 이후를 본다.
4. `docs/team/member-guides/rca-safe-pr.md`의 Phase 1부터 따라간다.

## 바로 돌릴 테스트

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  tests/test_projection.py \
  -q
```

scm worker를 건드렸으면 현재 repo 기준으로 `tests/test_repo_gateway_worker.py`를 같이 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_repo_gateway_worker.py \
  -q
```

## 프로덕션 완료 기준

가인 파트는 외부 기준 저장소에서 확인한 incident, AI insight, scan/vulnerability, notification, automated PR generation을 우리 RCA 흐름으로 옮겨야 끝난다. 전체 범위는 [벤치마크 최소선 기준 프로덕션 완성 설계](../rca-production-onboarding/05-production-completion-scope.md)를 따른다.

| 완료 항목 | 확인 방법 |
| --- | --- |
| evidence가 incident, bundle, RCA candidate, RCA result로 끊기지 않고 흐른다 | `tests/test_rca_evidence.py`, `tests/test_event_golden_path.py` |
| 근거가 부족하면 확정 원인이 아니라 `rca.action_required`로 멈춘다 | `tests/test_rca_evidence.py` |
| incident history/message/reaction/follower/postmortem 개념이 dashboard에 표시 가능한 schema로 정리된다 | 벤치마크 최소선 체크리스트와 신규 projection/router test |
| scan, vulnerability, dependency 결과가 RCA supporting evidence로 들어간다 | 신규 scan/RCA evidence test |
| Safe PR은 `scm-worker`와 `GithubScmProvider`만 생성한다 | `tests/test_repo_gateway_worker.py` |
| PR body에는 evidence basis, manifest patch, rollback patch, risk, approval 근거가 들어간다 | `tests/test_repo_gateway_worker.py`와 PR body snapshot |
| AI chat/help/tool은 schema, authorization, budget, malformed output guard를 가진다 | `tests/test_ai_*` |
| notification/email/digest가 incident, approval, PR, rollout 실패에 연결된다 | notification/email worker test |
| token 원문은 event/log/PR body/dashboard response에 없다 | `docs/secrets.md`, non-leak test |
| Bruno에서 RCA dashboard, GitOps approval, AI 폴더를 aws-test profile로 확인할 수 있다 | `docs/api/README.md` |

## 가인이 바꾸면 같이 봐야 하는 것

| 바꾸는 것 | 같이 확인할 것 |
| --- | --- |
| evidence model | 민정 evidence bucket shape, projection test |
| RCA event body | `EventSubject`, consumer worker, docs/events.md |
| action route | command worker policy, Safe PR request contract |
| Safe PR payload | `scm-worker`, `GithubScmProvider`, 찬빈 화면 상태 |
| confidence/missing evidence | frontend 표시 기준 |

RCA는 결론을 잘 내는 것도 중요하지만, 부족한 근거를 솔직하게 남기는 것이 더 중요하다.
