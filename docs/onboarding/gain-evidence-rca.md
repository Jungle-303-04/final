# 가인: Evidence + RCA + Safe PR

가인 파트는 민정이 만든 evidence를 근거 있는 RCA 결과와 조치 후보로 바꾸는 역할이다.
RCA worker가 GitHub에 직접 쓰지 않는다.
PR이 필요하면 `safe_pr.requested`를 만들고, 준비 게이트는 `safe-pr-worker`와 `ai-diff-worker`가 지나며 실제 PR 생성은 `scm-worker`와 `GithubScmProvider`가 담당한다.

이 문서는 한 번에 하나씩 따라간다.
각 단계는 파일 하나 또는 흐름 하나만 본다.

## 1단계. RCA event body를 먼저 본다

이 파일을 연다.

```text
src/domains/rca/events.py
```

여기서 `@event(EventSubject.X)`가 붙은 body를 찾는다.

event body는 worker 사이에서 넘기는 계약이다.
필드 이름을 바꾸면 다음 worker, dashboard projection, Bruno 기대값이 같이 깨진다.

이 단계에서는 필드를 고치지 않는다.
어떤 body가 어느 subject로 나가는지만 확인한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_event_golden_path.py -q
```

## 2단계. 민정에게 받는 입력을 확인한다

가인이 받는 시작 event는 `cluster.evidence.received`다.

민정에게서 받아야 하는 값은 아래다.

```text
workspace_id
cluster_id
agent_id
source_id
window_start
evidence_key
kubernetes
metrics
logs
traces
```

이 값은 provider raw response 전체가 아니다.
RCA가 읽을 수 있도록 줄어든 bounded evidence다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 3단계. Evidence worker를 찾는다

이 파일을 연다.

```text
src/services/ai/evidence-worker/app.py
```

여기서 `@app.on(...)` handler를 찾는다.

handler가 하는 일은 target evidence를 RCA 입력 값 객체로 정리하는 것이다.
근거가 부족한 상태를 숨기면 안 된다.
부족한 값은 나중에 `missing_evidence`로 이어져야 한다.

이 단계의 완료 기준은 evidence가 어떤 body로 다음 worker에 넘어가는지 설명할 수 있는 것이다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 4단계. Incident worker를 확인한다

이 파일을 연다.

```text
src/services/ai/incident-worker/app.py
```

incident는 “문제가 있어 보이는 대상”을 정하는 단계다.
root cause를 확정하는 단계가 아니다.

여기서 만들어야 하는 값은 `incident_id`, symptom, affected resource, severity 같은 판단 출발점이다.

근거가 부족하면 억지로 incident를 확정하지 않는다.
다음 단계에서 부족한 근거를 볼 수 있게 남긴다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 5단계. RCA 후보 계획을 확인한다

이 파일을 연다.

```text
src/services/ai/plan-worker/app.py
```

여기서는 가능한 원인 후보를 만든다.

예를 들어 pod restart가 많으면 후보는 image crash, config mismatch, resource pressure, dependency timeout처럼 여러 개가 될 수 있다.

이 단계에서 하나를 확정하지 않는다.
후보와 필요한 evidence를 다음 단계로 넘긴다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 6단계. 후보 평가를 확인한다

이 파일을 연다.

```text
src/services/ai/analyze-worker/app.py
```

여기서는 후보별 근거를 비교한다.

평가 결과에는 supporting evidence가 있어야 한다.
단순히 “그럴 것 같다”는 결과를 만들면 안 된다.

근거가 부족하면 확정 RCA로 가지 않고 action required로 갈 수 있어야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 7단계. RCA 결과 생성을 확인한다

이 파일을 연다.

```text
src/services/ai/rca-worker/app.py
```

RCA 결과는 두 갈래다.

근거가 충분하면 `rca.completed`가 나간다.

근거가 부족하면 `rca.action_required`가 나간다.

`rca.completed`에는 `root_cause`, `confidence`, `supporting_evidence`가 있어야 한다.

`rca.action_required`에는 무엇이 부족해서 자동 결론을 못 냈는지가 있어야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 8단계. Recovery 계획을 확인한다

이 파일을 연다.

```text
src/services/ai/recovery-worker/app.py
```

recovery는 “무엇을 할 수 있는지”를 만든다.
여기서 실제 command를 실행하거나 PR을 만들지 않는다.

복구 후보는 route를 가져야 한다.

`command`로 갈지, `safe_pr`로 갈지, 사람이 직접 봐야 하는지 구분한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 9단계. Action 선택을 확인한다

이 파일을 연다.

```text
src/services/ai/select-worker/app.py
```

여기서는 recovery 후보 중 하나를 선택한다.

자동 command는 policy와 approval 조건을 통과해야 한다.
조건을 통과하지 못하면 무리하게 실행하지 않는다.

PR이 필요한 조치는 `safe_pr.requested`로 보낼 준비만 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 10단계. Dispatch worker를 확인한다

이 파일을 연다.

```text
src/services/ai/dispatch-worker/app.py
```

여기서 실제 분기가 만들어진다.

command route면 `command.requested`가 나간다.

PR route면 `safe_pr.requested`가 나간다.

manual route면 사람이 볼 수 있는 상태를 남긴다.

dispatch worker가 GitHub API를 직접 호출하면 안 된다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 11단계. Safe PR 경계를 확인한다

이 파일을 연다.

```text
src/services/gitops/safe-pr-worker/app.py
src/services/ai/diff-worker/app.py
src/services/gitops/scm-worker/app.py
```

그리고 provider 구현을 찾는다.

```text
GithubScmProvider
```

가인이 만드는 것은 PR 자체가 아니라 PR 요청이다.

흐름은 이렇게 끝난다.

```text
safe_pr.requested
  -> safe-pr-worker
  -> safe_pr.patch_prepared
  -> ai-diff-worker
  -> safe_pr.ready_for_creation
  -> scm-worker
  -> GithubScmProvider
  -> safe_pr.created 또는 safe_pr.failed
```

`safe_pr.requested`에는 PR URL이 없다.
URL은 `safe_pr.created` 이후에만 생긴다.
찬빈 화면도 이 차이를 그대로 보여줘야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_repo_gateway_worker.py -q
```

## 12단계. 찬빈에게 넘길 값을 확인한다

찬빈 화면에 필요한 값은 아래다.

```text
correlation_id
incident_id
evidence_ref
root_cause
confidence
supporting_evidence
missing_evidence
action_route
command_id
safe_pr 관련 reference
최종 event subject
```

이 중 하나라도 의미가 불명확하면 dashboard row가 애매해진다.
값을 추가하거나 이름을 바꾸기 전에 찬빈 response DTO와 projection test를 같이 본다.

## 13단계. 전체 가인 흐름을 검증한다

작은 테스트가 통과한 뒤 아래를 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  tests/test_projection.py \
  tests/test_repo_gateway_worker.py \
  -q
```

## 14단계. Bruno에서 눈으로 확인한다

Bruno는 [Bruno API 테스트](../api/README.md)를 따라 `docs/api`를 collection으로 연다.

가인은 이 순서로 본다.

1. `00-health-auth/06-login.bru`
2. `03-agent-runtime/08-direct-agent-evidence.bru`
3. `05-rca-dashboard/01-dashboard-timeline.bru`
4. `05-rca-dashboard/02-dashboard-incident.bru`
5. `06-gitops-approval/02-grant-approval.bru`
6. `07-ai/01-create-conversation.bru`

## 프로덕션 완료 기준

가인 파트는 외부 기준 저장소에서 확인한 incident, AI insight, scan/vulnerability, notification, automated PR generation을 우리 RCA 흐름으로 옮겨야 끝난다.
전체 범위는 [벤치마크 최소선 기준 프로덕션 완성 설계](../rca-production-onboarding/05-production-completion-scope.md)를 따른다.

완료 기준은 하나씩 확인한다.

1. evidence가 incident, bundle, RCA candidate, RCA result로 끊기지 않고 흐른다.
2. 근거가 부족하면 확정 원인이 아니라 `rca.action_required`로 멈춘다.
3. incident history, message, reaction, follower, postmortem 개념이 dashboard에 표시 가능한 schema로 정리된다.
4. scan, vulnerability, dependency 결과가 RCA supporting evidence로 들어간다.
5. Safe PR은 `scm-worker`와 `GithubScmProvider`만 생성한다.
6. PR body에는 evidence basis, manifest patch, rollback patch, risk, approval 근거가 들어간다.
7. AI chat, help, tool은 schema, authorization, budget, malformed output guard를 가진다.
8. notification, email, digest가 incident, approval, PR, rollout 실패에 연결된다.
9. token 원문은 event, log, PR body, dashboard response에 없다.
10. Bruno에서 RCA dashboard, GitOps approval, AI 폴더를 `aws-test` profile로 확인할 수 있다.

## 가인이 바꾸면 같이 확인할 것

evidence model을 바꾸면 민정 evidence bucket shape와 projection test를 같이 본다.

RCA event body를 바꾸면 `EventSubject`, consumer worker, `docs/events.md`를 같이 본다.

action route를 바꾸면 command worker policy와 Safe PR request contract를 같이 본다.

Safe PR payload를 바꾸면 `scm-worker`, `GithubScmProvider`, 찬빈 화면 상태를 같이 본다.

confidence나 missing evidence를 바꾸면 frontend 표시 기준을 같이 본다.

RCA는 결론을 잘 내는 것도 중요하지만, 부족한 근거를 솔직하게 남기는 것이 더 중요하다.
