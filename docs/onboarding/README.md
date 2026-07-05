# 팀 온보딩 문서 지도

이 폴더는 팀원이 자기 역할을 보고 바로 코드와 테스트로 들어갈 수 있게 만든 입구다.

전체 코드를 한 번에 외우는 방식으로 가지 않는다. 우리는 역할을 나눴고, 서로의 내부 구현을 전부 몰라도 연결될 수 있게 event, API, 값 객체, 테스트 기준을 맞춰 간다.

## 역할 한눈에 보기

| 팀원 | 담당 | 먼저 볼 문서 | 끝에서 넘기는 것 |
| --- | --- | --- | --- |
| 민정 | command + target + evidence | [민정 가이드](minjeong-command-target-evidence.md) | `command.completed`, `cluster.evidence.received` |
| 가인 | evidence + RCA + Safe PR 요청 | [가인 가이드](gain-evidence-rca.md) | `rca.completed`, `rca.action_required`, `safe_pr.requested` |
| 찬빈 | frontend + dashboard 계약 | [찬빈 가이드](chanbin-frontend.md) | 화면 DTO, dashboard query/stream 계약 |

공통으로 헷갈리면 [역할별 실습 가이드](../team/role-practice-guide.md)를 먼저 본다.

RCA/권한/대시보드 구현을 실제 코드 기준으로 더 자세히 따라가려면 [RCA 프로덕션 온보딩 지도](../rca-production-onboarding/README.md)를 본다.

## 현재 구현 기준

지금 source repo 기준으로 실제 구현되어 있는 target/evidence 핵심은 아래다.

| 항목 | 구현 기준 |
| --- | --- |
| Command 발행 | `POST /commands` -> `command.requested` |
| Agent command queue | `command-worker` -> `agent_commands` |
| Agent command poll | `GET /agent/commands/poll` |
| Agent command result | `POST /agent/commands/{command_id}/result` -> `command.completed` |
| Debug query API | `POST /agent/debug/query` -> `telemetry.query.run` |
| Evidence job schedule | `POST /agent/evidence/jobs` |
| Evidence job poll/result | `GET /agent/evidence/jobs/poll`, `POST /agent/evidence/jobs/{job_id}/result` |
| Kubernetes evidence | `KubernetesSnapshotProvider` -> `kubernetes` bucket |
| Prometheus evidence | `PrometheusInstantQuery`, `PrometheusRangeQuery` -> `metrics` bucket |
| Loki evidence | `LokiLogsProvider` -> `logs` bucket |
| Tempo evidence | `TempoTracesProvider` -> `traces` bucket |
| RCA chain | `cluster.evidence.received` -> RCA workers |
| Safe PR write | `scm-worker` / `GithubScmProvider` |

## 같이 봐야 하는 상세 문서

- [Target Agent Command / Evidence 구현 가이드](../team/member-guides/target-agent-command-evidence-flow.md)
- [Target / Telemetry 데이터 흐름](../team/member-guides/target-telemetry-data-flows.md)
- [RCA / Safe PR 멤버 가이드](../team/member-guides/rca-safe-pr.md)
- [RCA 프로덕션 온보딩 지도](../rca-production-onboarding/README.md)
- [찬빈 권한 시스템과 대시보드 적용](../rca-production-onboarding/06-chanbin-permission-dashboard.md)
- [팀 간 구현 연결과 테스트 가이드](../team/cross-role-implementation-test-guide.md)
- [아키텍처](../architecture.md)
- [서비스 분리 계획](../service-split-plan.md)
- [이벤트 흐름](../events.md)

## 바로 돌릴 검증

처음 세팅 뒤에는 아래를 먼저 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  tests/test_target_agent_commands.py \
  tests/test_target_evidence_jobs.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
  tests/test_telemetry_registry.py \
  tests/test_rca_evidence.py \
  tests/test_projection.py \
  tests/test_realtime_contracts.py \
  -q
```

통과하면 command, target evidence, RCA 입력, projection/realtime 계약의 기본 연결은 살아 있다고 보면 된다.

## 문서 고치는 기준

문서를 고칠 때는 실제 코드와 테스트가 먼저다.

- route는 `src/packages/contracts/gateway/routes.py`에 있어야 한다.
- request/response는 `src/packages/contracts/gateway/requests.py`, `responses.py`에 있어야 한다.
- event subject는 `src/packages/contracts/event_bus/subjects.py`에 있어야 한다.
- worker는 `@app.on(...)` 또는 `@app.on_any`로 실제 구독해야 한다.
- provider는 `@telemetry.source(...)`로 등록되어야 한다.
- 문서에 적은 테스트는 실제로 존재해야 한다.

구현이 없으면 문서에서 있는 것처럼 쓰지 않는다. 필요한 기능이면 코드를 먼저 만들고 테스트로 확인한 뒤 문서를 업데이트한다.
