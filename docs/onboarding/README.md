# 팀 온보딩 문서 지도

이 폴더는 팀원이 자기 역할을 보고 바로 코드와 테스트로 들어가기 위한 입구다.
전체 코드를 한 번에 외우지 않는다.
우리는 역할을 나눴고, 서로의 내부 구현을 전부 몰라도 event, API, 값 객체, 테스트 기준으로 연결되게 만든다.

## 1단계. 내 역할 문서부터 연다

민정은 [민정 가이드](minjeong-command-target-evidence.md)를 먼저 연다.
민정의 끝점은 `command.completed`와 `cluster.evidence.received`다.
이 값이 가인에게 넘어간다.

가인은 [가인 가이드](gain-evidence-rca.md)를 먼저 연다.
가인의 끝점은 `rca.completed`, `rca.action_required`, `safe_pr.requested`다.
이 값이 찬빈 화면과 scm worker로 넘어간다.

찬빈은 [찬빈 가이드](chanbin-frontend.md)를 먼저 연다.
찬빈의 끝점은 화면 DTO, dashboard query 계약, realtime 표시 계약이다.
민정과 가인이 만든 event를 사람이 볼 수 있게 만든다.

## 2단계. 전체 흐름을 한 번만 본다

역할 문서를 열기 전에 흐름이 너무 안 잡히면 [현재 실제 흐름](../rca-production-onboarding/00-current-runtime-flow.md)을 먼저 본다.

이 문서에서 확인할 것은 하나다.

```text
Target Agent
  -> cluster.evidence.received
  -> RCA worker chain
  -> command.requested 또는 safe_pr.requested
  -> dashboard-worker
  -> /dashboard/rca/timeline
```

여기서 내 역할이 어느 칸인지 표시하고 시작한다.

## 3단계. 구현 파일을 하나씩 연다

민정은 target agent 파일부터 연다.

1. `src/services/target/cluster-agent/agent.py`
2. `src/services/target/cluster-agent/evidence/jobs.py`
3. `src/services/target/cluster-agent/evidence/collector.py`
4. `src/services/target/cluster-agent/providers/`
5. `src/domains/target/router.py`
6. `src/domains/command/router.py`

가인은 RCA worker chain 파일부터 연다.

1. `src/services/ai/evidence-worker/app.py`
2. `src/services/ai/incident-worker/app.py`
3. `src/services/ai/plan-worker/app.py`
4. `src/services/ai/analyze-worker/app.py`
5. `src/services/ai/rca-worker/app.py`
6. `src/services/ai/recovery-worker/app.py`
7. `src/services/ai/select-worker/app.py`
8. `src/services/ai/dispatch-worker/app.py`
9. `src/services/gitops/scm-worker/app.py`

찬빈은 dashboard 계약 파일부터 연다.

1. `src/packages/contracts/gateway/routes.py`
2. `src/packages/contracts/gateway/responses.py`
3. `src/domains/dashboard/models.py`
4. `src/domains/dashboard/repository.py`
5. `src/services/projection/dashboard-worker/app.py`
6. `src/domains/dashboard/router.py`
7. `src/domains/identity/dependencies.py`
8. `src/domains/identity/repository.py`

파일을 열 때는 “이 파일을 다 이해해야지”라고 보지 않는다.
내가 넘기는 값과 받는 값이 어디서 만들어지고 검증되는지만 본다.

## 4단계. 데코레이터를 먼저 찾는다

event body를 만들 때는 `@event(EventSubject.X)`를 찾는다.

worker가 event를 받을 때는 `@app.on(BodyType)`을 찾는다.

모든 event를 read model로 만들 때는 `@app.on_any`를 찾는다.

telemetry provider를 붙일 때는 `@telemetry.source(...)`를 찾는다.

target command handler를 붙일 때는 `@command.handler(...)` 또는 `@command.k8s(...)`를 찾는다.

RCA cause와 recovery rule을 붙일 때는 `@rca.cause(...)`, `@rca.recovery(...)`를 찾는다.

데코레이터는 “자동으로 마법을 부리는 코드”가 아니라 “어떤 입력을 누가 처리하는지 등록하는 표식”이다.

## 5단계. 작은 테스트 하나만 먼저 돌린다

민정은 이 명령부터 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_target_evidence_jobs.py \
  tests/test_telemetry_registry.py \
  -q
```

가인은 이 명령부터 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  -q
```

찬빈은 이 명령부터 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  -q
```

작은 테스트가 통과하면 그다음 역할 문서의 다음 단계로 간다.
처음부터 `make check`를 돌리고 실패 목록을 전부 보려고 하지 않는다.

## 6단계. Bruno로 직접 눌러 본다

Bruno는 [Bruno API 테스트](../api/README.md)를 본다.

반드시 `docs/api` 폴더를 collection으로 연다.

민정은 `02-target-admin`, `03-agent-runtime`, `04-command`를 본다.

가인은 `03-agent-runtime`, `05-rca-dashboard`, `06-gitops-approval`, `07-ai`를 본다.

찬빈은 `00-health-auth`, `05-rca-dashboard`, `08-ops-dlq`를 본다.

## 7단계. 프로덕션 완료 범위를 확인한다

프로덕션 완료 기준은 [프로덕션 완료 기준](../production-readiness.md)과 [벤치마크 최소선 기준 프로덕션 완성 설계](../rca-production-onboarding/05-production-completion-scope.md)를 따른다.

이 기준은 “나중에 있으면 좋은 기능”이 아니다.
최소 production scope다.
다만 한 번에 전부 구현하지 않고, 역할별 작은 작업으로 나누어 처리한다.

## 8단계. 문서를 고칠 때 지키는 규칙

문서에 route를 쓰면 `src/packages/contracts/gateway/routes.py`에 있어야 한다.

문서에 request나 response를 쓰면 `src/packages/contracts/gateway/requests.py` 또는 `src/packages/contracts/gateway/responses.py`에 있어야 한다.

문서에 event subject를 쓰면 `src/packages/contracts/event_bus/subjects.py`에 있어야 한다.

문서에 worker를 쓰면 실제 `@app.on(...)` 또는 `@app.on_any`가 있어야 한다.

문서에 provider를 쓰면 실제 `@telemetry.source(...)`가 있어야 한다.

문서에 테스트를 쓰면 실제 `tests/` 아래에 있어야 한다.

구현이 없으면 있는 것처럼 쓰지 않는다.
필요한 기능이면 코드를 먼저 만들고 테스트를 통과시킨 뒤 문서를 고친다.
