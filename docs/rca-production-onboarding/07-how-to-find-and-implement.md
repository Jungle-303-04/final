# 찾아보고 구현하는 방법

이 문서는 팀원이 코드를 처음 잡았을 때 어디서부터 찾아야 하는지 정리한 가이드다.

우리는 역할을 나눴지만, 연결은 event, route, DTO, repository, provider 값 객체로 맞춘다. 그래서 남의 내부 구현을 전부 외우지 않아도 된다. 대신 내가 바꾸는 값이 어느 계약을 지나 다음 사람에게 가는지는 반드시 확인한다.

## 먼저 실행 상태를 확인한다

코드를 읽기 전에 두 가지를 나눠서 본다. 로컬에서는 코드와 manifest가 깨지지 않았는지 확인하고, 실제 서비스 연결은 AWS EKS smoke로 확인한다.

```bash
bash scripts/test.sh
make manifest-check
make smoke
```

현재 AWS smoke 기본값:

| 값 | 기준 |
| --- | --- |
| 배포 스크립트 | `scripts/aws-up.sh` |
| 검증 스크립트 | `scripts/smoke.sh` |
| management cluster | 환경변수 `MGMT_CLUSTER` |
| target cluster | 환경변수 `TARGET_CLUSTER_1`, `TARGET_CLUSTER_2` |
| region | 환경변수 `AWS_REGION` |
| smoke 확인 범위 | `git.webhook.received -> git.changed -> manifest.rendered -> desired.diff.detected -> diff.analyzed` |

`make smoke`는 현재 환경변수로 배포된 서비스와 내부 workflow를 직접 검증한다.
세부 값은 [AWS 테스트 실행 기준](../aws-testing-runbook.md)에 모아 둔다.

## 코드를 찾는 기본 순서

새 기능을 만들 때는 아래 순서로 찾는다.

```text
route/DTO
  -> event subject/body
  -> domain handler/repository
  -> worker @app.on handler
  -> provider/adapter
  -> test
  -> docs/events.md
```

자주 쓰는 검색 명령:

```bash
rg -n "EventSubject\\.RCA_COMPLETED|rca.completed" src tests docs
rg -n "DASHBOARD_RCA_TIMELINE_PATH|/dashboard/rca/timeline" src tests docs
rg -n "@app\\.on|@app\\.on_any|@event\\(" src/services src/domains
rg -n "@telemetry\\.source|PrometheusRangeQuery|KubernetesSnapshotQuery" src/services/target
rg -n "@command\\.handler|@command\\.k8s|TELEMETRY_QUERY_RUN_ACTION" src
```

## 구현 순서

| 순서 | 작업 | 왜 먼저 하는가 | 완료 기준 |
| --- | --- | --- | --- |
| 1 | 계약 확인 | route, DTO, event subject가 단일 출처여야 한다. | `routes.py`, `requests.py`, `responses.py`, `subjects.py`, `domains/*/events.py` 중 어디가 바뀌는지 확정 |
| 2 | 입력 owner 확인 | 누가 값을 처음 만드는지 알아야 중복 구현을 막는다. | Gateway router, target agent, RCA worker 중 producer 확인 |
| 3 | 처리 owner 구현 | 한 worker가 자기 책임만 처리해야 재시도/테스트가 쉽다. | `@app.on(...)` handler가 입력 body 하나를 받고 다음 body를 `yield` |
| 4 | 저장소/read model 구현 | 화면과 재처리는 event payload 직접 파싱보다 read model이 안전하다. | repository method와 idempotency test |
| 5 | adapter/provider 구현 | 외부 side effect는 worker 본문에 섞지 않는다. | provider class, value object, 실패 event 또는 bounded result |
| 6 | 테스트 추가 | 문서대로 동작한다는 증거다. | 단위 test + 필요한 흐름 test 통과 |
| 7 | 문서 갱신 | 팀원이 같은 계약을 보게 한다. | 이 폴더 문서, `docs/events.md`, 역할 문서 링크 갱신 |

## GitOps app/workflow ID를 고칠 때

GitOps 쪽에서 `application_id`나 `workflow_run_id`가 어긋나면 같은 앱 이벤트가 서로 다른 workflow처럼 보이고, 심하면 `applications` unique constraint에서 DLQ가 생긴다. 이 값은 아무 worker에서 임의로 만들면 안 되고 아래 순서로 맞춘다.

| 값 | 만드는 곳 | 기준 |
| --- | --- | --- |
| `repository_id` | `derive_repository_id()` | `workspace_id + repo_ref` |
| `watch_target_id` | `derive_watch_target_id()` | `workspace_id + repository_id + branch + manifest_path` |
| `binding_id` | `derive_deployment_binding_id()` | `workspace_id + repository_id + cluster_id + namespace + app_name` |
| `application_id` | `derive_application_id()` | `workspace_id + repository_id + manifest_path + app name` |
| `workflow_run_id` | `derive_workflow_run_id()` | `workspace_id + application_id + binding_id + environment + commit_sha` |

`application_id`에서 app name은 `name`, `app_name`, `resource`, `repo_ref` 순서로 잡는다. `git-pull-worker`와 `workflow-controller`가 같은 repo/app 이름을 같은 ID로 보도록 하기 위해서다.

`applications` 테이블은 `(workspace_id, repository_id, name)`도 unique다. 그래서 `RepoChangeRepository.upsert_application()`은 같은 repo/app 이름이 이미 있으면 그 row의 `application_id`를 canonical 값으로 돌려준다. workflow-controller는 이 반환값으로 `workflow_run_id`를 다시 계산한다.

이 부분을 바꾸면 바로 아래 테스트를 먼저 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_database_unit.py \
  tests/test_git_pull_worker.py \
  tests/test_workflow_controller.py \
  -q
```

## 민정이 찾는 법

민정은 command, target agent, evidence provider를 맡는다.

시작 파일:

| 목적 | 파일 |
| --- | --- |
| agent main loop | `src/services/target/cluster-agent/agent.py` |
| command handler decorator | `src/services/target/cluster-agent/commands/registry.py` |
| command API | `src/domains/command/router.py` |
| command policy/plan | `src/domains/command/handler.py` |
| evidence job scheduler | `src/services/target/cluster-agent/evidence/jobs.py` |
| provider collector | `src/services/target/cluster-agent/evidence/collector.py` |
| provider decorator | `src/services/target/cluster-agent/telemetry_registry.py` |
| provider 구현 | `src/services/target/cluster-agent/providers/` |
| query value object | `src/services/target/cluster-agent/queries/registry.py` |
| evidence job route | `src/domains/target/router.py` |

민정이 구현할 때 지킬 흐름:

```text
새 provider/query/action
  -> 값 객체 또는 payload model 추가
  -> decorator 등록
  -> agent 실행 함수 구현
  -> route/queue/result 흐름 테스트
  -> 가인이 받을 evidence bucket shape 확인
```

민정이 가인에게 넘기는 값:

| 값 | 왜 필요한가 |
| --- | --- |
| `cluster.evidence.received` | RCA 시작 입력이다. Kubernetes/metrics/logs/traces bucket이 들어간다. |
| `command.completed` | agent가 실제로 command를 실행한 결과다. RCA와 dashboard가 결과를 읽는다. |

바로 돌릴 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  tests/test_target_agent_commands.py \
  tests/test_target_agent_client.py \
  tests/test_target_evidence_jobs.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_telemetry_registry.py \
  -q
```

## 가인이 찾는 법

가인은 evidence를 RCA 결과와 Safe PR 요청으로 바꾼다.

시작 파일:

| 목적 | 파일 |
| --- | --- |
| RCA event 계약 | `src/domains/rca/events.py` |
| evidence worker | `src/services/ai/evidence-worker/app.py` |
| incident worker | `src/services/ai/incident-worker/app.py` |
| cause catalog | `src/services/ai/agent/causes/catalog/*.yaml` |
| cause loader/decorator | `src/services/ai/agent/causes/loader.py`, `src/services/ai/agent/playbooks/cause.py` |
| cause engine | `src/services/ai/agent/causes/engine.py` |
| recovery decorator | `src/services/ai/agent/recovery/` |
| dispatch worker | `src/services/ai/dispatch-worker/app.py` |
| SCM worker | `src/services/gitops/scm-worker/app.py` |
| GitHub provider | `src/services/gitops/scm-worker/github_provider.py` |

가인이 구현할 때 지킬 흐름:

```text
새 symptom 또는 recovery
  -> rca event/body 필드 확인
  -> cause catalog YAML 또는 @rca.recovery 등록
  -> evidence source와 missing evidence 기준 작성
  -> command 또는 safe_pr route 선택
  -> scm-worker/GithubScmProvider 경계 확인
  -> RCA + Safe PR 테스트
```

가인이 찬빈에게 넘기는 값:

| 값 | 왜 필요한가 |
| --- | --- |
| `rca.completed` | root cause, confidence, supporting evidence를 화면에 보여준다. |
| `rca.action_required` | 자동 결론을 내리지 못한 이유를 화면에 보여준다. |
| `recovery.action_selected` | command/PR/manual 중 어느 route로 갔는지 알려준다. |
| `safe_pr.requested` | PR 생성 요청이 생긴 상태다. 이 단계에는 PR URL이 없다. |
| `safe_pr.created` 또는 `safe_pr.failed` | 실제 PR 결과를 화면에 보여준다. |

바로 돌릴 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  tests/test_repo_gateway_worker.py \
  tests/test_projection.py \
  tests/test_dashboard_projection.py \
  -q
```

## 찬빈이 찾는 법

찬빈은 backend DTO와 read model을 기준으로 화면을 붙인다.

시작 파일:

| 목적 | 파일 |
| --- | --- |
| route 상수 | `src/packages/contracts/gateway/routes.py` |
| response DTO | `src/packages/contracts/gateway/responses.py` |
| dashboard table | `src/domains/dashboard/models.py` |
| dashboard repository | `src/domains/dashboard/repository.py` |
| dashboard worker | `src/services/projection/dashboard-worker/app.py` |
| dashboard API | `src/domains/dashboard/router.py` |
| 권한 helper | `src/domains/identity/dependencies.py` |
| 권한 repository | `src/domains/identity/repository.py` |
| realtime contract | `src/packages/contracts/realtime` |
| realtime gateway | `src/services/realtime/realtime-gateway` |

찬빈이 구현할 때 지킬 흐름:

```text
새 화면 상태 또는 필드
  -> response DTO 확인
  -> dashboard repository mapping 확인
  -> projection worker가 해당 event를 받는지 확인
  -> router 권한 필터 확인
  -> frontend는 DTO만 렌더링
  -> dashboard/router/realtime 테스트
```

찬빈이 backend에서 반드시 믿어야 하는 기준:

| 기준 | 이유 |
| --- | --- |
| `/auth/session` | 현재 사용자, role, workspace를 확인한다. |
| `accessible_resource_ids` | 목록 API에서 볼 수 있는 cluster row만 내려준다. |
| `require_cluster_access` | 단건 cluster query/action을 막는다. |
| `RcaTimelineResponse` | 화면이 raw event payload에 직접 묶이지 않게 한다. |
| realtime session workspace check | browser가 다른 workspace stream을 받지 못하게 한다. |

바로 돌릴 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  tests/test_identity_repository.py \
  tests/test_command_router.py \
  tests/test_realtime_gateway.py \
  tests/test_realtime_contracts.py \
  -q
```

## 서로 물어보기 전에 확인할 것

| 상황 | 먼저 확인할 파일 |
| --- | --- |
| event 이름이 헷갈림 | `src/packages/contracts/event_bus/subjects.py`, `docs/events.md` |
| event body 필드가 헷갈림 | `src/domains/*/events.py` |
| API path가 헷갈림 | `src/packages/contracts/gateway/routes.py` |
| request/response shape가 헷갈림 | `src/packages/contracts/gateway/requests.py`, `responses.py` |
| command가 agent까지 안 감 | `src/domains/command/router.py`, `handler.py`, `src/services/target/cluster-agent/agent.py` |
| evidence가 RCA로 안 감 | `src/domains/target/router.py`, `evidence/jobs.py`, `evidence-worker/app.py` |
| PR이 안 만들어짐 | `src/services/gitops/scm-worker/app.py`, `github_provider.py`, Secret `GITHUB_TOKEN` |
| 화면 row가 안 나옴 | `dashboard-worker/app.py`, `dashboard/repository.py`, `dashboard/router.py` |
| 권한 때문에 403 | `identity/dependencies.py`, `identity/repository.py`, `tests/test_dashboard_router.py` |

## 완료 기준

문서대로 구현했다고 말하려면 아래가 모두 맞아야 한다.

- 코드에 route/DTO/event/handler/provider가 실제로 있다.
- worker가 `@app.on(...)` 또는 `@app.on_any`로 실제 구독한다.
- 외부 write는 provider/adapter 경계에서 처리한다.
- event payload에 token, kubeconfig, secret 원문을 넣지 않는다.
- role별 테스트가 통과한다.
- `make check`와 `make smoke`가 통과한다.
- 문서에 쓴 테스트 이름이 실제로 존재한다.
