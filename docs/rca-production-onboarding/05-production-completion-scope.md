# 벤치마크 최소선 기준 프로덕션 완성 설계

이 문서는 외부 기준 저장소의 기능 범위를 최소선으로 두고, 우리 프로젝트 구조에 맞게 다시 설계한 프로덕션 완성 기준이다.

외부 구조를 그대로 복사하지 않는다.
우리 프로젝트의 `Gateway -> event -> worker -> target agent -> evidence -> RCA -> Safe PR -> dashboard` 구조로 바꿔서 구현한다.

이 문서의 목적은 팀원이 고민하지 않고 작업을 작게 쪼개 바로 구현하게 만드는 것이다.
각 기능은 “왜 필요한가”, “누가 맡는가”, “어디부터 여는가”, “무슨 값을 넘기는가”, “어떤 테스트로 끝내는가”까지 한 번에 적는다.

## 확인 기준

요청받은 외부 기준 저장소를 기능 범위 기준으로 확인했다.

확인 commit은 `f2a74344072a98f123e0830551a235ace3e4c45b`다.

확인 파일 수는 전체 1,712개다.

서버 코드는 Elixir 915개다.

API schema는 GraphQL 32개다.

frontend는 TS/JS 446개다.

확인한 주요 경로는 아래다.

```text
schema/schema.graphql
apps/core/lib/core/schema
apps/core/lib/core/services
apps/graphql/lib/graphql/schema
apps/graphql/lib/graphql/resolvers
www/src/graph
www/src/components
```

확인한 핵심 기능은 fleet-scale GitOps, fleet visibility, Kubernetes CRD-native IaC, automated PR generation, AI insight, DNS, OIDC provider, self-hosted secure-by-default 운영이다.

우리는 GraphQL 구조를 복사하지 않는다.
REST Gateway, typed event, target agent, read model 구조로 옮긴다.

## 현재 코드에서 이미 살아 있는 실행 축

새 기능은 아래 실행 축을 깨지 않고 확장한다.

1. typed event 등록은 `src/domains/*/events.py`와 `src/packages/contracts/event_bus/subjects.py`를 기준으로 한다.
   확인 테스트는 `tests/test_event_body_contracts.py`와 `tests/test_event_golden_path.py`다.

2. worker event 소비는 `src/services/**/app.py`의 `@app.on(...)`과 `@app.on_any`를 기준으로 한다.
   확인 테스트는 `tests/test_event_runtime.py`와 각 worker test다.

3. command 요청, agent poll, result는 `src/domains/command/router.py`, `src/domains/command/repository.py`, `src/services/target/cluster-agent/agent.py`를 기준으로 한다.
   확인 테스트는 `tests/test_command_router.py`, `tests/test_command_worker.py`, `tests/test_target_agent_commands.py`다.

4. Agent debug query API는 `POST /agent/debug/query`와 `debug_query_plan()`을 기준으로 한다.
   확인 테스트는 `tests/test_command_router.py::test_agent_debug_query_requires_cluster_read_access_and_queues_agent_command`다.

5. evidence job schedule, poll, result는 `src/domains/target/router.py`, `src/domains/target/repository.py`, `src/services/target/cluster-agent/evidence/jobs.py`를 기준으로 한다.
   확인 테스트는 `tests/test_target_evidence_jobs.py`와 `tests/test_target_registration.py`다.

6. provider decorator는 `src/services/target/cluster-agent/telemetry_registry.py`와 `src/services/target/cluster-agent/providers/*`를 기준으로 한다.
   확인 테스트는 `tests/test_telemetry_registry.py`다.

7. Prometheus range query는 `PrometheusRangeQuery`와 `PrometheusMetricsProvider.query_range()`를 기준으로 한다.
   확인 테스트는 `tests/test_target_metric_evidence.py`와 `tests/test_telemetry_registry.py`다.

8. Kubernetes snapshot provider는 `KubernetesSnapshotProvider`와 `KubernetesSnapshotQuery`를 기준으로 한다.
   확인 테스트는 `tests/test_target_kubernetes_evidence.py`다.

9. metrics, logs, traces, evidence 결합은 `EvidenceCollector.collect()`를 기준으로 한다.
   확인 테스트는 `tests/test_target_metric_evidence.py`, `tests/test_target_telemetry_evidence.py`, `tests/test_target_telemetry_evidence.py`다.

10. RCA chain은 `src/services/ai/agent/pipeline/*`와 `src/services/**/rca*`를 기준으로 한다.
    확인 테스트는 `tests/test_rca_evidence.py`와 `tests/test_event_golden_path.py`다.

11. Safe PR은 `src/services/gitops/scm-worker/github_provider.py`와 `src/packages/contracts/scm/provider.py`를 기준으로 한다.
    확인 테스트는 `tests/test_repo_gateway_worker.py`다.

12. dashboard 권한 필터는 `src/domains/dashboard/router.py`와 `src/domains/identity/repository.py`를 기준으로 한다.
    확인 테스트는 `tests/test_dashboard_router.py`와 `tests/test_auth_security.py`다.

13. realtime gateway는 `src/services/realtime/realtime-gateway/*`를 기준으로 한다.
    확인 테스트는 `tests/test_realtime_gateway.py`와 `tests/test_realtime_contracts.py`다.

## 구현할 때 공통 순서

모든 기능은 같은 순서로 만든다.

1. 담당 문서에서 내 기능 도메인을 찾는다.
2. route가 필요한지 판단한다.
3. route가 필요하면 `src/packages/contracts/gateway/routes.py`에 상수를 먼저 둔다.
4. request body가 필요하면 `src/packages/contracts/gateway/requests.py`에 DTO를 둔다.
5. response body가 필요하면 `src/packages/contracts/gateway/responses.py`에 DTO를 둔다.
6. 오래 걸리거나 worker가 처리해야 하면 `src/packages/contracts/event_bus/subjects.py`에 subject를 둔다.
7. event body는 담당 domain의 `events.py`에 만들고 `@event(EventSubject.X)`를 붙인다.
8. worker는 `src/services/**/app.py`에 만들고 `@app.on(...)` 또는 `@app.on_any`를 붙인다.
9. target cluster에서 실행할 일은 agent command action과 handler를 만든다.
10. 화면에서 볼 값은 read model table, repository, router response DTO를 만든다.
11. Bruno request를 `docs/api`에 추가한다.
12. 단위 테스트, worker flow test, router test, Bruno collection test를 모두 통과시킨다.

## 데코레이터 사용 기준

`@event(EventSubject.X)`는 `src/domains/*/events.py`에서 쓴다.
event subject와 body dataclass를 연결한다.
이게 빠지면 producer와 consumer가 서로 다른 body를 보게 된다.

`@app.on(BodyType)`은 `src/services/**/app.py`에서 쓴다.
worker가 어떤 event body를 소비하는지 등록한다.
이게 빠지면 event가 발행돼도 worker가 처리하지 않는다.

`@app.on_any`는 projection worker나 audit worker에서 쓴다.
모든 event envelope를 read model이나 audit row로 바꿀 때 쓴다.

`@telemetry.source(...)`는 target agent provider class에서 쓴다.
source, evidence_key, query type을 provider registry에 등록한다.
이게 빠지면 evidence policy가 provider를 찾지 못한다.

`@command.handler(...)`는 target agent command handler에서 쓴다.
action과 payload model을 command dispatcher에 등록한다.

`@command.k8s(...)`는 Kubernetes read/write command에서 쓴다.
action, verb, resource, scope, payload model을 함께 묶어 policy guard가 볼 수 있게 한다.

RCA cause catalog는 `src/services/ai/agent/causes/catalog/*.yaml`에서 쓴다.
symptom, 필요한 evidence source, confidence rule을 root cause candidate로 등록한다.

`@rca.recovery(...)`는 recovery action catalog에서 쓴다.
root cause별 command 또는 Safe PR 조치 후보를 등록한다.

## Account/User/Auth

왜 필요한가:
모든 API와 dashboard 권한의 시작점이다.
로그인 사용자, service account, session, token audit이 없으면 누가 어떤 cluster를 봐도 되는지 판단할 수 없다.

담당:
찬빈이 주 담당이다.
가인은 AI/RCA API가 이 권한을 통과하는지 같이 본다.
민정은 agent token과 browser session이 섞이지 않도록 확인한다.

처음 열 파일:

```text
src/domains/identity/router.py
src/services/gateway/api-gateway/auth.py
src/packages/contracts/auth.py
src/packages/contracts/identity.py
```

구현 순서:

1. signup, login, logout, session route를 확인한다.
2. email verification과 approval 상태가 UserStatus로 분리되어 있는지 본다.
3. browser session은 httpOnly cookie로만 유지한다.
4. service account나 agent token은 browser session과 섞지 않는다.
5. response DTO에 token 원문을 넣지 않는다.
6. Bruno `00-health-auth` 폴더로 사람이 로그인 흐름을 확인한다.

넘겨야 하는 값:

```text
workspace_id
user_id
roles
session_token
authenticated
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_password_auth.py \
  tests/test_identity_auth_routes.py \
  tests/test_auth_security.py \
  -q
```

## Group/Role/RBAC

왜 필요한가:
팀원, service account, cluster별 접근을 분리한다.
frontend에서 버튼을 숨기는 것만으로는 보안이 되지 않는다.
backend router와 repository query에서 필터링해야 한다.

담당:
찬빈이 주 담당이다.
민정은 cluster/action 권한을 같이 본다.
가인은 RCA/AI/Safe PR API가 권한 밖 evidence를 읽지 않는지 확인한다.

처음 열 파일:

```text
src/domains/identity/repository.py
src/domains/identity/dependencies.py
src/packages/contracts/identity.py
src/domains/dashboard/router.py
```

구현 순서:

1. `accessible_resource_ids`가 어떤 resource id를 돌려주는지 확인한다.
2. `require_cluster_access`가 cluster read 권한을 확인하는지 본다.
3. dashboard list query가 허용 cluster만 가져오는지 확인한다.
4. write command에는 deploy/run 계열 permission이 필요한지 확인한다.
5. 권한 없는 사용자의 Bruno/dashboard 요청이 403으로 끝나는지 확인한다.

넘겨야 하는 값:

```text
resource_type
resource_id
action
allowed_cluster_ids
permission
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_identity_repository.py \
  tests/test_dashboard_router.py \
  tests/test_auth_security.py \
  -q
```

## OIDC/OAuth/Auth Proxy

왜 필요한가:
팀 SSO와 내부 session을 연결해야 한다.
운영 환경에서는 이메일/비밀번호만으로 사용자 관리를 끝낼 수 없다.

담당:
찬빈이 주 담당이다.
가인은 AI tool과 RCA API가 OIDC session 권한을 그대로 쓰는지 본다.

처음 열 파일:

```text
src/domains/identity
src/services/gateway/api-gateway/auth.py
src/packages/contracts/gateway/routes.py
```

구현 순서:

1. OIDC provider 등록 route를 만든다.
2. issuer, client_id, redirect_uri를 저장할 모델을 만든다.
3. external subject와 내부 user_id를 연결한다.
4. auth proxy header를 신뢰할 조건을 명시한다.
5. session 생성은 기존 auth session store를 재사용한다.
6. Bruno auth 폴더에 OIDC 설정 확인 요청을 추가한다.

넘겨야 하는 값:

```text
issuer
client_id
redirect_uri
subject
workspace_id
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_identity_auth_routes.py \
  tests/test_auth_security.py \
  -q
```

OIDC 전용 테스트 파일을 추가하면 그 파일도 같이 돌린다.

## Audit/Login Metrics

왜 필요한가:
누가 무엇을 봤고 바꿨는지 추적해야 한다.
운영 장애나 권한 사고가 났을 때 audit trail이 없으면 복구와 책임 분리가 어렵다.

담당:
찬빈과 가인이 같이 맡는다.
찬빈은 API access와 화면 표시를 맡고, 가인은 RCA/PR/incident event가 audit에 남는지 본다.

처음 열 파일:

```text
src/domains/audit
src/services/projection/audit-worker/app.py
src/services/projection/dashboard-worker/app.py
```

구현 순서:

1. 모든 write route에 actor_id와 request_id를 남긴다.
2. worker event는 event envelope의 correlation_id와 causation_id를 유지한다.
3. audit worker가 중요한 event를 audit row로 저장한다.
4. 로그인 성공/실패 metric을 분리한다.
5. dashboard나 ops API에서 audit 조회 권한을 검사한다.

넘겨야 하는 값:

```text
actor_id
event_subject
resource_ref
request_id
correlation_id
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_projection.py \
  tests/test_event_golden_path.py \
  -q
```

## Fleet Cluster

왜 필요한가:
여러 target cluster를 등록, 조회, 삭제, 상태 확인해야 production 운영이 된다.
cluster가 하나라고 가정하면 권한, evidence, rollout, billing이 모두 나중에 깨진다.

담당:
민정이 주 담당이다.
찬빈은 cluster list와 권한 필터를 같이 본다.

처음 열 파일:

```text
src/domains/target/router.py
src/domains/target/repository.py
src/domains/target/models.py
```

구현 순서:

1. `POST /targets`가 cluster 등록 manifest와 agent token을 반환하는지 확인한다.
2. cluster_id, workspace_id, environment를 저장한다.
3. agent token hash만 저장하고 원문은 다시 보여주지 않는다.
4. cluster policy update route와 evidence policy를 연결한다.
5. dashboard list에서는 사용자가 접근 가능한 cluster만 보여준다.

넘겨야 하는 값:

```text
workspace_id
cluster_id
agent_id
environment
policy
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_registration.py -q
```

## Console Instance / Cloud Cluster

왜 필요한가:
관리 plane 자체의 AWS 운영 상태를 추적해야 한다.
수동 AWS 배포와 smoke가 성공했는지, target cluster bootstrap이 어떤 상태인지 알아야 한다.

담당:
민정이 주 담당이다.
찬빈은 운영 화면을 붙인다.

처음 열 파일:

```text
docs/aws-testing-runbook.md
scripts/aws-up.sh
scripts/status.sh
scripts/smoke.sh
```

구현 순서:

1. management cluster context가 환경변수 `MGMT_CLUSTER` 값과 일치하는지 확인한다.
2. target cluster context가 `TARGET_CLUSTER_1` 또는 `TARGET_CLUSTER_2` 값과 일치하는지 확인한다.
3. smoke가 Docker 없이 운영자 환경에서 직접 실행되는지 확인한다.
4. health, ready, target agent, evidence, command를 smoke 기준에 넣는다.
5. 실패 로그는 운영 로그나 audit event로 남긴다.

넘겨야 하는 값:

```text
provider
region
cluster_endpoint_ref
status
```

완료 확인:

```bash
make smoke
```

## GitOps Repository

왜 필요한가:
배포 source와 manifest 기준을 저장해야 한다.
어떤 commit과 path에서 나온 변경인지 모르면 Safe PR과 rollback 근거가 약해진다.

담당:
민정이 주 담당이다.
가인은 Safe PR evidence basis를 같이 본다.

처음 열 파일:

```text
src/domains/gitops/router.py
src/services/gitops/manifest-render-worker/app.py
src/services/gitops/diff-analyze-worker/app.py
```

구현 순서:

1. repository_id, branch, commit_sha, path를 저장한다.
2. manifest render 결과와 artifact digest를 남긴다.
3. diff summary를 event로 만든다.
4. approval이 필요한 변경은 approval route로 보낸다.
5. Safe PR 요청에는 repository-relative path만 넣는다.

넘겨야 하는 값:

```text
repository_id
branch
commit_sha
path
artifact_digest
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_gitops_router.py \
  tests/test_manifest_render_worker.py \
  tests/test_gitops_diffing.py \
  -q
```

## Helm/Kustomize/YAML Deploy

왜 필요한가:
fleet-scale 배포의 실제 실행 단위다.
render, diff, approval, command, rollout status가 하나의 chain으로 이어져야 한다.

담당:
민정이 주 담당이다.
찬빈은 진행 상태 화면을 본다.

처음 열 파일:

```text
src/services/gitops/manifest-render-worker/app.py
scripts/manifest-check.sh
deploy/management
deploy/target
```

구현 순서:

1. manifest render가 deterministic하게 나오는지 확인한다.
2. diff worker가 desired와 actual을 비교한다.
3. 위험한 변경은 approval로 보낸다.
4. 승인된 변경만 command로 간다.
5. rollout 결과는 dashboard projection으로 이어진다.

넘겨야 하는 값:

```text
rendered_manifest
diff_summary
approval_id
command_id
rollout_status
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_manifest_render_worker.py -q
make manifest-check
```

## Terraform/IaC

왜 필요한가:
Kubernetes 밖의 infra 자원도 같은 감사 흐름에 넣어야 한다.
DB, DNS, IAM, network 같은 외부 자원이 장애 원인이 될 수 있다.

담당:
민정이 주 담당이다.
찬빈은 IaC plan/apply 상태 화면을 본다.

처음 열 파일:

```text
src/domains
src/packages/contracts/event_bus/subjects.py
src/services
```

구현 순서:

1. `src/domains/iac` domain을 만든다.
2. module_ref, variables, plan_summary, state_ref 모델을 만든다.
3. plan 요청 route를 만든다.
4. apply는 approval과 policy_decision_ref가 있을 때만 command로 보낸다.
5. plan/apply 결과를 audit과 dashboard에 남긴다.
6. Bruno에 IaC plan/apply 요청을 추가한다.

넘겨야 하는 값:

```text
module_ref
variables
plan_summary
state_ref
approval_ref
policy_decision_ref
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_event_body_contracts.py -q
```

IaC domain 테스트를 추가하면 그 테스트도 같이 돌린다.

## Recipe/Stack/Scaffold

왜 필요한가:
반복 설치를 사람이 쉽게 시작하게 한다.
운영자가 매번 raw manifest를 직접 만들면 실수 가능성이 커진다.

담당:
민정과 찬빈이 같이 맡는다.
민정은 install bundle과 render를 맡고, 찬빈은 catalog 화면과 입력 폼을 맡는다.

처음 열 파일:

```text
src/domains
src/packages/contracts/gateway/routes.py
src/packages/contracts/gateway/requests.py
src/packages/contracts/gateway/responses.py
```

구현 순서:

1. `src/domains/catalog`를 만든다.
2. template_id와 input_values schema를 만든다.
3. rendered_steps를 생성하는 worker를 만든다.
4. install bundle은 GitOps render 흐름으로 넘긴다.
5. 화면은 template 목록, 입력값, rendered result를 보여준다.

넘겨야 하는 값:

```text
template_id
input_values
rendered_steps
owner
install_target
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
```

catalog domain 테스트를 추가하면 그 테스트도 같이 돌린다.

## Upgrade Queue / Deferred Update

왜 필요한가:
여러 cluster에 안전하게 순차 배포해야 한다.
한 번에 모든 cluster를 바꾸면 장애 반경이 커진다.

담당:
민정이 주 담당이다.
찬빈은 queue와 wave 상태 화면을 본다.

처음 열 파일:

```text
src/packages/contracts/event_bus/subjects.py
src/domains/dashboard/repository.py
src/services/projection/dashboard-worker/app.py
```

구현 순서:

1. `src/domains/rollout` 또는 upgrade domain을 만든다.
2. upgrade_id, version, wave, blocked_reason 모델을 만든다.
3. deferred update event를 만든다.
4. worker가 wave 순서와 dependency gate를 확인한다.
5. 각 target cluster command로 이어진다.
6. dashboard에 queue, blocked, running, completed를 보여준다.

넘겨야 하는 값:

```text
upgrade_id
version
wave
blocked_reason
cluster_id
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py -q
```

upgrade worker 테스트를 추가하면 그 테스트도 같이 돌린다.

## Rollout

왜 필요한가:
배포 진행과 실패를 dashboard와 RCA가 같이 봐야 한다.
rollout 실패는 다음 RCA의 evidence가 된다.

담당:
민정과 찬빈이 같이 맡는다.
민정은 rollout 상태 수집을 맡고, 찬빈은 read model과 화면을 맡는다.

처음 열 파일:

```text
src/domains/dashboard/repository.py
src/services/projection/dashboard-worker/app.py
src/services/target/cluster-agent/agent.py
```

구현 순서:

1. rollout_id, status, started_at, finished_at, failure_reason을 정의한다.
2. agent command result에서 rollout 상태를 만들 수 있게 한다.
3. rollout.updated event를 projection에 반영한다.
4. dashboard timeline에서 rollout 상태를 RCA/command 상태와 함께 보여준다.
5. 실패 reason은 RCA supporting evidence로 넘긴다.

넘겨야 하는 값:

```text
rollout_id
status
started_at
finished_at
failure_reason
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py tests/test_target_agent_commands.py -q
```

## Test / Test Logs

왜 필요한가:
배포 후 자동 검증과 로그가 있어야 한다.
“배포 명령이 성공했다”와 “서비스가 실제로 정상이다”는 다르다.

담당:
민정과 찬빈이 같이 맡는다.
민정은 smoke/test 실행과 로그 수집을 맡고, 찬빈은 test log 화면과 realtime을 맡는다.

처음 열 파일:

```text
scripts/smoke.sh
scripts/aws-up.sh
src/services/realtime/realtime-gateway
```

구현 순서:

1. test_id와 step_id를 만든다.
2. 각 step의 status, duration_ms, stdout_ref를 남긴다.
3. test log는 원문 전체를 event에 넣지 않고 reference나 bounded sample로 남긴다.
4. realtime은 test step delta만 보낸다.
5. dashboard에서 실패 step을 RCA evidence로 연결한다.

넘겨야 하는 값:

```text
test_id
step_id
stdout_ref
status
duration_ms
```

완료 확인:

```bash
make smoke
PYTHONPATH=src .venv/bin/python -m pytest tests/test_realtime_gateway.py -q
```

## Dependency / Scan / Vulnerability

왜 필요한가:
PR과 배포가 안전한지 판단해야 한다.
image, package, dependency vulnerability는 RCA supporting evidence와 Safe PR risk 판단에 들어간다.

담당:
가인이 주 담당이다.
민정은 artifact_digest를 넘기고, 찬빈은 scan 결과 화면을 본다.

처음 열 파일:

```text
src/services/ai/agent/pipeline
src/domains/rca/events.py
src/domains/scm/events.py
```

구현 순서:

1. `src/domains/security_scan` domain을 만든다.
2. artifact_digest, package, severity, cve, fix_version을 모델로 둔다.
3. scan.completed와 vulnerability.detected event를 만든다.
4. RCA evidence bundle이 scan 결과를 supporting evidence로 읽게 한다.
5. Safe PR body에 vulnerability basis를 넣는다.
6. dashboard에서 severity별 scan 상태를 보여준다.

넘겨야 하는 값:

```text
artifact_digest
package
severity
cve
fix_version
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py tests/test_repo_gateway_worker.py -q
```

scan domain 테스트를 추가하면 그 테스트도 같이 돌린다.

## Incident / Message / Postmortem

왜 필요한가:
장애 대응은 혼자 끝나는 계산 결과가 아니다.
history, message, reaction, follower, postmortem이 있어야 팀이 같은 맥락으로 움직인다.

담당:
가인과 찬빈이 같이 맡는다.
가인은 incident event와 RCA 연결을 맡고, 찬빈은 화면과 권한 필터를 맡는다.

처음 열 파일:

```text
src/domains/rca/events.py
src/domains/dashboard/models.py
src/domains/dashboard/repository.py
```

구현 순서:

1. incident_id와 status를 RCA 흐름의 기준 ID로 둔다.
2. incident message와 history event를 만든다.
3. reaction과 follower는 actor_id를 반드시 가진다.
4. postmortem은 RCA result와 command/PR 결과를 reference로 가진다.
5. dashboard incident detail response에 history, message, postmortem을 넣는다.

넘겨야 하는 값:

```text
incident_id
message_id
author_id
summary
status
postmortem_ref
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_dashboard_projection.py tests/test_dashboard_router.py tests/test_rca_evidence.py -q
```

## AI Insight / Chat / Help

왜 필요한가:
장애 설명과 복구 제안을 사람이 이해하게 한다.
AI는 권한 밖 data를 보면 안 되고, schema가 깨진 output을 그대로 실행하면 안 된다.

담당:
가인이 주 담당이다.
찬빈은 chat UI와 권한 상태를 본다.

처음 열 파일:

```text
src/domains/ai
src/packages/ai
src/services/ai/chat-worker
```

구현 순서:

1. conversation_id와 message_id를 만든다.
2. tool_name과 tool schema를 명확히 둔다.
3. evidence_refs는 권한 필터를 통과한 것만 넘긴다.
4. budget과 timeout을 설정한다.
5. malformed output은 실행하지 않고 action_required나 error response로 남긴다.
6. Bruno `07-ai` 폴더로 create/get/append를 확인한다.

넘겨야 하는 값:

```text
conversation_id
tool_name
evidence_refs
budget
message_id
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_ai_conversation.py \
  tests/test_ai_platform_tools.py \
  -q
```

## Automated PR Generation

왜 필요한가:
수정 제안을 감사 가능한 코드 변경으로 만들어야 한다.
채팅이나 로그에 제안만 남으면 실제 운영 변경으로 이어지지 않는다.

담당:
가인이 주 담당이다.
민정은 manifest patch source를 넘기고, 찬빈은 PR 상태를 표시한다.

처음 열 파일:

```text
src/services/gitops/scm-worker/github_provider.py
src/services/gitops/scm-worker/app.py
src/packages/contracts/scm/provider.py
```

구현 순서:

1. RCA나 diff worker가 `safe_pr.requested`를 만든다.
2. request에는 evidence_basis와 patch list를 넣는다.
3. scm-worker만 GitHub provider를 호출한다.
4. GithubScmProvider는 repository-relative path만 허용한다.
5. 성공하면 branch, commit_sha, pr_url을 `safe_pr.created`로 남긴다.
6. 실패하면 token 원문 없이 `safe_pr.failed`를 남긴다.
7. rollback_patch를 PR body에 포함한다.

넘겨야 하는 값:

```text
branch
commit_sha
pr_url
rollback_patch
evidence_basis
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_repo_gateway_worker.py -q
```

## Notification / Email / Digest

왜 필요한가:
incident, approval, PR, rollout 실패를 놓치지 않게 한다.
사용자가 계속 dashboard를 보고 있지 않아도 중요한 상태를 받아야 한다.

담당:
가인과 찬빈이 같이 맡는다.
가인은 trigger 기준을 맡고, 찬빈은 notification UI와 read state를 맡는다.

처음 열 파일:

```text
src/services/alert
src/domains/identity/router.py
src/services/realtime/realtime-gateway
```

구현 순서:

1. notification_id와 subject_ref를 만든다.
2. channel은 email, dashboard, realtime을 분리한다.
3. recipient는 권한과 구독 상태를 기준으로 고른다.
4. read_at을 저장한다.
5. digest는 기간과 severity 기준으로 묶는다.
6. email worker 실패는 DLQ로 보내고 replay 가능하게 한다.

넘겨야 하는 값:

```text
notification_id
channel
recipient
read_at
subject_ref
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_realtime_gateway.py tests/test_projection.py -q
```

notification/email 테스트를 추가하면 그 테스트도 같이 돌린다.

## DNS

왜 필요한가:
cluster와 service endpoint를 운영하려면 DNS domain, record, access policy, binding이 필요하다.
DNS 변경도 권한과 audit 흐름을 통과해야 한다.

담당:
민정과 찬빈이 같이 맡는다.
민정은 DNS command와 provider 경계를 맡고, 찬빈은 domain/record 화면과 권한을 맡는다.

처음 열 파일:

```text
src/packages/contracts/gateway/routes.py
src/packages/contracts/event_bus/subjects.py
src/services/target/cluster-agent/commands
```

구현 순서:

1. `src/domains/dns` domain을 만든다.
2. domain, record_name, record_type, target, policy_id를 모델로 둔다.
3. DNS 변경 요청 route를 만든다.
4. write 변경은 approval_ref와 policy_decision_ref를 요구한다.
5. target agent command로 provider 변경을 실행한다.
6. audit과 dashboard에 변경 결과를 남긴다.

넘겨야 하는 값:

```text
domain
record_name
record_type
target
policy_id
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_command_worker.py tests/test_target_agent_commands.py -q
```

DNS domain 테스트를 추가하면 그 테스트도 같이 돌린다.

## Shell / Demo Project

왜 필요한가:
운영자가 cluster/context에서 제한된 작업을 해야 하는 순간이 있다.
하지만 shell은 가장 위험한 기능이라 bounded session, 만료, audit가 반드시 있어야 한다.

담당:
민정과 찬빈이 같이 맡는다.
민정은 bounded command 실행 경계를 맡고, 찬빈은 session UI와 권한 표시를 맡는다.

처음 열 파일:

```text
src/domains/command
src/services/target/cluster-agent/commands
src/domains/identity/dependencies.py
```

구현 순서:

1. shell session route를 만든다.
2. session_id, namespace, expires_at, audit_ref를 저장한다.
3. 허용 command 목록을 action catalog로 제한한다.
4. raw shell output은 bounded sample이나 object reference로 남긴다.
5. browser에는 agent token이나 kubeconfig를 절대 내려주지 않는다.
6. sample project lifecycle도 같은 audit 흐름을 탄다.

넘겨야 하는 값:

```text
session_id
command
namespace
expires_at
audit_ref
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_auth_security.py tests/test_command_router.py -q
```

## Billing/License/Plan

왜 필요한가:
서비스 운영과 라이선스 제한을 관리해야 한다.
plan이나 quota가 없으면 기능 제한, 사용량, invoice, license audit가 모두 흩어진다.

담당:
찬빈이 주 담당이다.
민정은 cluster usage metric을 넘기고, 가인은 AI/scan usage를 넘긴다.

처음 열 파일:

```text
src/domains/identity
src/packages/contracts/gateway/routes.py
src/packages/contracts/gateway/responses.py
```

구현 순서:

1. `src/domains/billing` domain을 만든다.
2. plan, subscription, invoice, license key reference를 모델로 둔다.
3. quota gate를 backend에서 적용한다.
4. billing 화면은 service admin 또는 billing 권한 사용자만 본다.
5. usage는 cluster, AI, scan, notification에서 모은다.
6. license_key 원문은 response에 넣지 않는다.

넘겨야 하는 값:

```text
plan_id
license_key_ref
quota
usage
invoice_id
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_auth_security.py tests/test_identity_repository.py -q
```

billing 테스트를 추가하면 그 테스트도 같이 돌린다.

## Marketplace/Publisher

왜 필요한가:
앱과 패키지 catalog, publisher, repository, artifact, chart, terraform, docker repository를 탐색하고 설치할 수 있어야 한다.
운영자가 매번 설치 방법을 직접 찾아야 하면 production UX가 아니다.

담당:
찬빈과 민정이 같이 맡는다.
찬빈은 catalog 화면을 맡고, 민정은 install target과 GitOps/IaC 연결을 맡는다.

처음 열 파일:

```text
src/packages/contracts/gateway/routes.py
src/domains/gitops
src/domains/target
```

구현 순서:

1. `src/domains/catalog` domain을 만든다.
2. publisher_id, package_id, version, install_target을 모델로 둔다.
3. chart, terraform, docker artifact metadata를 분리한다.
4. install 요청은 GitOps render나 IaC plan으로 넘긴다.
5. 화면은 catalog list, detail, version, install status를 보여준다.
6. Bruno catalog 요청을 추가한다.

넘겨야 하는 값:

```text
publisher_id
package_id
version
install_target
artifact_digest
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_bruno_collection.py tests/test_docs_index.py -q
```

catalog 테스트를 추가하면 그 테스트도 같이 돌린다.

## Realtime Subscription

왜 필요한가:
UI가 incident, notification, rollout, test log를 즉시 봐야 한다.
polling만으로는 운영자가 상태 변화를 늦게 본다.

담당:
찬빈이 주 담당이다.
민정과 가인은 realtime으로 보낼 event의 bounded payload를 같이 정한다.

처음 열 파일:

```text
src/services/realtime/realtime-gateway
src/packages/contracts/realtime
src/domains/identity/dependencies.py
```

구현 순서:

1. browser websocket auth를 session 기준으로 확인한다.
2. subject는 incident, notification, rollout, test log를 분리한다.
3. payload는 bounded 형태로 제한한다.
4. seq를 두어 client가 누락을 감지하게 한다.
5. 연결 복구 시 snapshot API로 현재 상태를 다시 받게 한다.
6. agent live와 browser live를 섞지 않는다.

넘겨야 하는 값:

```text
workspace_id
subject
seq
payload
snapshot
```

완료 확인:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_realtime_gateway.py \
  tests/test_realtime_contracts.py \
  -q
```

## 원시 기능 표면을 빠짐없이 옮기는 방법

외부 기준 저장소는 서버 schema, service, API resolver, frontend graph/component가 나뉘어 있다.
우리는 같은 이름으로 복사하지 않고 우리 도메인으로 묶는다.

서버 schema 묶음은 아래처럼 옮긴다.

`account`, `user`, `group`, `group_member`, `role`, `role_binding`, `invite`, `invite_group`, `login_token`, `passwordless_login`, `reset_token`, `email`은 identity/auth/RBAC로 옮긴다.
담당은 찬빈이다.

`access_token_audit`, `persisted_token`, `public_key`, `key_backup`, `eab_credential`, `impersonation_policy`, `impersonation_policy_binding`은 credential/audit/security로 옮긴다.
담당은 찬빈이다.

`oidc_provider`, `oidc_provider_binding`, `oidc_login`, `oidc_trust_relationship`, `oauth_integration`은 SSO/auth proxy로 옮긴다.
담당은 찬빈이다.

`cluster`, `cluster_information`, `cluster_usage_history`, `cluster_dependency`, `cloud_cluster`, `console_instance`는 target/fleet/cloud cluster로 옮긴다.
담당은 민정이다.

`repository`, `installation`, `artifact`, `chart`, `chart_installation`, `terraform`, `terraform_installation`, `docker_repository`, `docker_image`, `version`, `version_tag`, `tag`는 GitOps/catalog/package로 옮긴다.
담당은 민정과 찬빈이다.

`recipe`, `recipe_dependency`, `recipe_item`, `recipe_section`, `recipe_test`, `stack`, `stack_collection`, `stack_recipe`, `provider_scaffold`, `resource_definition`, `crd`는 self-service template/IaC scaffold로 옮긴다.
담당은 민정과 찬빈이다.

`upgrade`, `upgrade_queue`, `deferred_update`, `rollout`, `test`, `test_bindings`, `test_step`, `lock`, `apply_lock`, `validations`는 upgrade/rollout/test gate로 옮긴다.
담당은 민정이다.

`incident`, `incident_history`, `incident_message`, `message_entity`, `reaction`, `follower`, `postmortem`은 incident/RCA collaboration으로 옮긴다.
담당은 가인과 찬빈이다.

`notification`, `webhook`, `webhook_log`, `integration`, `integration_webhook`, `audit`, `user_event`는 notification/audit/integration으로 옮긴다.
담당은 가인과 찬빈이다.

`package_scan`, `scan_error`, `scan_violation`, `vulnerability`, `dependencies`, `image_dependency`는 dependency/security evidence로 옮긴다.
담당은 가인이다.

`dns_domain`, `dns_record`, `dns_access_policy`, `dns_access_policy_binding`, `domain_mapping`은 DNS/access policy로 옮긴다.
담당은 민정과 찬빈이다.

`plan`, `platform_plan`, `platform_subscription`, `subscription`, `license`, `license_token`, `address`는 billing/license/subscription으로 옮긴다.
담당은 찬빈이다.

`cloud_shell`, `shell`, `sample_project`, `database`, `file`, `dashboard`, `publisher`, `contributor`, `misc`는 shell/project/catalog/read model/shared metadata로 옮긴다.
담당은 도메인별로 나눈다.

서비스 묶음은 아래처럼 옮긴다.

`accounts`, `users`, `rbac`, `oauth`, `audits`는 identity router, auth dependency, audit projector로 옮긴다.

`clusters`, `cloud`, `repositories`, `charts`, `terraform`, `recipes`, `scaffolds`, `versions`는 gitops/target/catalog/IaC workers로 옮긴다.

`metrics`, `dependencies`, `scan`, `incidents`, `ai`는 evidence provider, RCA pipeline, AI tools로 옮긴다.

`rollouts`, `tests`, `upgrades`, `locks`는 rollout/test/upgrade gate workers로 옮긴다.

`dns`, `shell`, `storage`, `email`, `payments`, `base`는 DNS/shell/object storage/mail/billing/common infra로 옮긴다.

API operation은 아래 규칙으로 옮긴다.

1. 사람이 누르는 write는 Gateway REST route가 된다.
2. 오래 걸리는 작업은 event body가 된다.
3. target cluster에서 실행할 일은 agent command가 된다.
4. dashboard는 event 원문이 아니라 read model DTO만 읽는다.
5. 실시간 화면은 websocket subject와 bounded snapshot만 받는다.
6. 모든 API는 Bruno request와 expected response `tests {}` block을 가진다.

## 담당자별 첫 PR 순서

민정 첫 PR은 cluster lifecycle schema부터 시작한다.
`src/domains/target/models.py`, `src/domains/target/repository.py`, `src/domains/target/router.py`를 열고 cluster 등록, 상태, policy, agent token hash를 확인한다.
완료 테스트는 `tests/test_target_registration.py`다.

민정 두 번째 PR은 evidence provider policy다.
`src/domains/target/evidence_policy.py`, `src/services/target/cluster-agent/evidence/jobs.py`, provider 폴더를 열고 Kubernetes, metrics, logs, traces가 같은 수준으로 schedule/poll/result 되는지 확인한다.
완료 테스트는 `tests/test_target_evidence_jobs.py`와 provider별 evidence test다.

민정 세 번째 PR은 GitOps repository/artifact다.
`src/domains/gitops/*`, `src/services/gitops/manifest-render-worker/app.py`, `src/services/gitops/diff-analyze-worker/app.py`를 열고 repository source, render, diff, approval, artifact_digest를 연결한다.
완료 테스트는 `tests/test_manifest_render_worker.py`와 `tests/test_gitops_diffing.py`다.

가인 첫 PR은 evidence bundle normalization이다.
`src/services/ai/agent/pipeline/evidence_bundle.py`와 `tests/test_rca_evidence.py`를 열고 provider별 payload가 같은 `EvidenceBundle`로 정리되는지 확인한다.

가인 두 번째 PR은 incident model이다.
`src/domains/rca/events.py`, `src/domains/dashboard/repository.py`, RCA worker chain을 열고 incident_id, status, history, message 기준을 만든다.
완료 테스트는 `tests/test_rca_evidence.py`, `tests/test_dashboard_projection.py`다.

가인 세 번째 PR은 Safe PR evidence basis다.
`src/domains/scm/events.py`, `src/services/gitops/scm-worker/app.py`, `GithubScmProvider`를 열고 evidence_basis, patch, rollback_patch, pr_url, failure reason을 연결한다.
완료 테스트는 `tests/test_repo_gateway_worker.py`다.

찬빈 첫 PR은 session/auth UI와 dashboard 권한 필터다.
`src/domains/identity/dependencies.py`, `src/domains/identity/repository.py`, `src/domains/dashboard/router.py`를 열고 session과 allowed cluster filter를 확인한다.
완료 테스트는 `tests/test_dashboard_router.py`와 `tests/test_auth_security.py`다.

찬빈 두 번째 PR은 RCA timeline이다.
`src/packages/contracts/gateway/responses.py`, `src/domains/dashboard/models.py`, `src/domains/dashboard/repository.py`, `src/services/projection/dashboard-worker/app.py`를 열고 event subject가 화면 상태로 바뀌는지 확인한다.
완료 테스트는 `tests/test_dashboard_projection.py`다.

찬빈 세 번째 PR은 realtime UI 계약이다.
`src/packages/contracts/realtime`, `src/services/realtime/realtime-gateway`를 열고 browser auth, subject, seq, bounded payload, snapshot recovery를 확인한다.
완료 테스트는 `tests/test_realtime_gateway.py`, `tests/test_realtime_contracts.py`다.

## 서로 넘겨야 하는 값

민정이 가인에게 넘기는 핵심은 `cluster.evidence.received.evidence_key`다.
이 값이 없으면 RCA가 evidence bundle을 다시 찾을 수 없다.

민정이 가인에게 넘기는 범위 값은 `workspace_id`, `cluster_id`, `source_id`, `window_start`, `window_end`다.
이 값이 없으면 다른 cluster data가 섞일 수 있다.

민정이 찬빈에게 보여줄 값은 `command_id`, `status`, `action`, `agent_id`, `lease_id`다.
이 값이 없으면 사용자가 command 실행 상태를 모른다.

가인이 민정에게 넘기는 값은 `command.requested` 또는 `safe_pr.requested`다.
이 값이 없으면 RCA가 결과만 남고 조치로 이어지지 않는다.

가인이 찬빈에게 넘기는 값은 `incident_id`, `root_cause`, `confidence`, `recommended_action`, `supporting_evidence`, `missing_evidence`다.
이 값이 없으면 화면에서 RCA 신뢰도를 알 수 없다.

찬빈이 민정과 가인에게 넘기는 값은 `user action payload`, `approval_id`, `selected_action`이다.
이 값이 없으면 자동 조치와 수동 승인이 섞인다.

## 완료 판정

프로덕션 완료라고 말하려면 아래가 모두 맞아야 한다.

1. 모든 기능 도메인이 담당자, schema, route 또는 event, worker, test, Bruno 요청을 가진다.
2. 권한은 frontend에서 숨기는 것으로 끝내지 않고 backend query에서 필터링한다.
3. target agent token, provider token, kubeconfig, SCM token은 browser에 내려가지 않는다.
4. event body는 typed contract로 테스트한다.
5. read model은 event 원문을 그대로 노출하지 않고 화면용 DTO로 변환한다.
6. Safe PR은 `scm-worker`와 `GithubScmProvider`를 통해서만 만든다.
7. AWS smoke는 Docker 없이 운영자 환경에서 직접 실행한다.
8. `make check`, `make manifest-check`, `make smoke`가 통과한다.
9. Bruno collection에서 역할별 API를 사람이 직접 눌러 expected response를 확인할 수 있다.
10. 팀원이 이 문서의 담당자별 첫 PR 순서를 따라가면 route, event, worker, provider, dashboard, Bruno, test까지 끊기지 않고 구현할 수 있다.
