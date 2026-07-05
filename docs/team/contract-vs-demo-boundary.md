# 계약과 데모 구현 경계

이 문서는 팀원이 코드를 읽을 때 무엇을 반드시 따라야 하는지, 무엇은 데모 또는 임시 구현인지 구분하기 위한 기준이다.

핵심은 단순하다.

- 계약은 팀원이 맞춰야 하는 공개 약속이다.
- 실제 어댑터는 계약을 실제 인프라에 연결하는 구현이다.
- 데모 구현은 흐름을 보여주기 위한 임시 구현이다.
- 테스트 fixture는 테스트 입력일 뿐 제품 계약이 아니다.

## 1. 판단 기준

| 구분 | 의미 | 바꿔도 되는가 | 대표 위치 |
| --- | --- | --- | --- |
| 계약 | 다른 모듈이 반드시 맞춰야 하는 이름, 필드, 이벤트, API schema | 신중히 변경. docs/tests 함께 변경 | `src/packages/contracts/**` |
| 공통 런타임 | 모든 서비스가 공유하는 실행 방식, retry, DLQ, app handler 규칙 | 신중히 변경. 회귀 테스트 필수 | `src/packages/runtime/**` |
| 실제 어댑터 | PostgreSQL, NATS, HTTP client처럼 실제 외부 시스템에 붙는 구현 | 같은 port를 지키면 교체 가능 | `src/packages/events/**`, `src/packages/storage/**` |
| 서비스 로직 | 각 worker가 자기 업무를 처리하는 흐름 | 담당 서비스 범위 안에서 변경 가능 | `src/services/**/app.py` |
| 데모 구현 | 아직 실제 외부 시스템이 없어서 흐름만 검증하는 테스트 더블/샘플 구현 | 언제든 교체 가능해야 함 | test double, hardcoded sample |
| 테스트 fixture | 테스트를 위해 만든 입력/기대값 | 제품 동작 기준으로 삼지 않음 | `tests/**` |

## 2. 진짜 계약

아래 파일은 팀원이 구현할 때 기준으로 삼아도 된다.

| 파일 | 계약 내용 | 팀원이 따라야 하는 이유 |
| --- | --- | --- |
| `src/packages/contracts/event_bus/subjects.py` | 이벤트 subject 이름 | 어떤 이벤트를 발행/구독할지 정하는 전체 지도다. |
| `src/packages/contracts/event_bus/interfaces.py` | `EventEnvelope`, `EventClient`, bus port | 이벤트 봉투와 발행/소비 port의 공통 약속이다. |
| `src/packages/contracts/event_bus/bodies/*.py` | 이벤트 payload body dataclass | 이벤트 안에 어떤 데이터가 들어가는지 정한다. |
| `src/packages/contracts/event_bus/registry.py` | body와 subject 연결 | `@app.on(BodyType)`가 어떤 subject를 구독하는지 결정한다. |
| `src/packages/contracts/event_bus/processing.py` | 처리 상태값 | retry, processed, dead-lettered 상태의 공통 언어다. |
| `src/packages/contracts/gateway/requests.py` | Gateway HTTP request schema | 외부 API 요청 body가 어떤 형태인지 정한다. |
| `src/packages/contracts/gateway/routes.py` | Gateway route path | UI, CLI, agent가 호출할 HTTP 경로의 기준이다. |
| `src/packages/contracts/stores.py` | worker별 DB 능력 port | handler가 어떤 저장 기능만 사용할 수 있는지 제한한다. |
| `src/packages/contracts/interfaces.py` | session, OAuth, DLQ, outbox port | Gateway/runtime이 구현체가 아니라 port에 의존하게 한다. |

Dashboard projection/read model 계약은 현재 있다. 기준 파일은 `src/domains/dashboard/*`,
`src/services/projection/dashboard-worker/app.py`, `src/packages/contracts/gateway/responses.py`,
`src/packages/contracts/gateway/routes.py`다.

계약 파일을 바꿀 때는 아래를 같이 바꿔야 한다.

- 해당 body/subject를 쓰는 worker
- 관련 테스트
- `docs/events.md`
- 담당자 문서 또는 WIKI

## 3. 실제로 유지할 공통 런타임

아래 파일들은 데모가 아니다. 지금 구조의 뼈대다.

| 파일 | 역할 |
| --- | --- |
| `src/packages/runtime/app.py` | 서비스 작성자가 쓰는 `App`, `@app.on`, `@app.on_event` 규칙 |
| `src/packages/runtime/worker.py` | JetStream 메시지 처리, retry, DLQ, ack/nak |
| `src/packages/runtime/ledger.py` | 이벤트 처리 멱등성 ledger port 호출 |
| `src/packages/runtime/dispatch.py` | body handler 실행과 다음 이벤트 dispatch |
| `src/packages/runtime/relay.py` | outbox relay |
| `src/packages/runtime/outbound.py` | 외부 HTTP 호출 경계 |
| `src/packages/events/bus.py` | NATS JetStream adapter |
| `src/packages/storage/schema.py` | PostgreSQL 테이블 모델 |
| `src/packages/storage/database.py` | 현재 PostgreSQL repository 구현 |

다만 `src/packages/storage/database.py`는 실제 어댑터이지만 아직 repository가 완전히 분리된 구조는 아니다. 즉 운영 구조의 일부지만 개선 여지가 있는 구현체다.

## 4. 데모와 운영 보강 인벤토리

아래는 계약이 아니라 흐름 확인용이거나 아직 계획만 있는 항목이다. 팀원이 이 값을
제품 계약처럼 설명하거나 그대로 확장하면 안 된다. 새 PR에서 이 표의 항목을 실제
구현으로 바꾸면, 같은 PR에서 상태와 완료 기준도 갱신한다.

| 항목 | 상태 | 현재 동작 | 실제 구현 완료 기준 |
| --- | --- | --- | --- |
| Prometheus telemetry | provider adapter | `PrometheusMetricsProvider`가 instant/range query 값 객체를 실행하고 `metrics` bucket을 채운다. | 운영 Prometheus/AMP/Mimir endpoint, label/window 제한, secret 마스킹, 실패 테스트 |
| Loki telemetry | provider adapter | `LokiLogsProvider`가 `LokiLogQuery`를 실행하고 `logs` bucket을 채운다. | 운영 Loki/OpenSearch/CloudWatch Logs adapter, selector 제한, payload 축약 테스트 |
| OTel/trace telemetry | provider adapter | `TempoTracesProvider`가 trace query를 실행하고 `traces` bucket을 채운다. | 운영 Tempo/OTel collector/query adapter, service/operation/window 기준 요약 테스트 |
| Kubernetes evidence collector | provider adapter | `KubernetesSnapshotProvider`가 pods/events/nodes/workloads/services/endpoints snapshot을 `kubernetes` bucket으로 채운다. | 최소 RBAC 검증, object metadata 마스킹, summary 계약 테스트 |
| Node collector install manifest | inline demo | cluster-agent가 inline DaemonSet YAML을 만든다. | Helm/Kustomize render 또는 typed manifest builder, upgrade/rollback 기준, RBAC 테스트 |
| Git manifest source | demo/dev fallback | `checkout-api` 기본값과 local-file/remote file 경로로 manifest를 만든다. | Git repo checkout/cache, commit provenance, Kustomize/Helm/raw YAML renderer, 구조화된 render error |
| Desired diff | partial demo | 이전 snapshot이 없으면 demo fallback을 사용하고 risk string 중심으로 판단한다. | cluster-aware desired/live/last-approved 비교, create/update/delete 구조화, policy reason 테스트 |
| Diff risk/approval policy | partial demo | namespace/risk string 기반으로 safe PR/alert/command를 분기한다. | workspace/repo/cluster/environment 정책, approval_required/forbidden route, rollout checklist |
| Command approval evidence | partial real guard | `command-worker`는 approval이 필요한 write action에 `approval_ref`/`policy_decision_ref`를 요구하고, target agent도 실행 직전 누락을 거부한다. | approval ref 만료/권한 검증, policy decision store, workspace/repo/cluster action allowlist |
| RCA analyzer | rule/playbook baseline | CrashLoopBackOff 중심 rule과 evidence source 매칭으로 후보를 평가한다. AI fallback worker는 아직 분석 pipeline에 연결되지 않았다. | `RcaAnalyzerPort` 뒤의 rule/LLM adapter, insufficient evidence 상태, evidence ref 기반 근거, fault-injection eval |
| LLM client | gateway + adapters | `LLM_PROVIDER`로 OpenAI/OpenAI 호환/Anthropic/Gemini adapter를 선택한다. 현재 tool loop는 JSON-only prompt protocol 기반이다. | provider별 live smoke, function-calling 수준 schema, 비용/쿼터 guardrail, tool authorization, 통합 회귀 테스트 |
| Safe PR creation | partial real adapter | `scm-worker`는 GitHub branch/commit/PR REST provider를 가진다. `safe_pr.requested.patches`가 있으면 검토 문서와 함께 실제 repository file patch를 커밋하고, unsafe path는 GitHub write 전에 실패시킨다. | feature flag, token/ref 검증, repo allowlist, rollback patch commit, diff basis/ref, approval evidence, failure event/audit |
| Alert delivery | provider boundary | `alert-worker`가 알림 요청과 dispatch 결과 event를 분리한다. | provider delivery id 저장, 조용한 시간/승인 정책, production 자동 배포 fail-closed |
| Credential/Token Broker | partial port | GitHub provider는 `TokenVaultPort`와 env 기반 `GITHUB_TOKEN_REF`를 지원한다. identity repository credential placeholder와 외부 vault adapter는 아직 남아 있다. | SecretVault/TokenBroker port, provider token 저장/회전/감사, event/log non-leak 테스트 |
| Dashboard projection worker | implemented | `src/services/projection/dashboard-worker`, `src/domains/dashboard/*`, `/dashboard/rca/*` route가 있다. | 운영 workflow console UI, dashboard stream route, E2E smoke에서 결과 검증 |
| Dashboard UI | planned | backend read model/API는 있고, 실제 frontend app은 아직 없다. | 운영 workflow console UI, session guard, read model query, E2E smoke에서 결과 검증 |
| Tests fixtures | fixture only | 테스트 입력/기대값으로 sample 값이 존재한다. | 계약 변경 시 fixture 갱신. fixture 값을 제품 계약으로 문서화하지 않음 |

## 5. 현재 가장 헷갈리는 지점

### 5.1 `git-pull-worker`인데 webhook subject를 구독함

현재 `src/services/gitops/git-pull-worker/app.py`는 이름은 pull worker지만 `git.webhook.received` 계열 입력을 기반으로 동작한다.

팀 방향이 polling이면 아래 중 하나로 정리해야 한다.

- `git.webhook.received`를 제거하고 `git.poll.detected` 또는 `git.change.detected` 같은 subject로 변경
- webhook과 polling을 모두 지원하려면 둘 다 같은 내부 body로 변환하는 adapter를 둠

권장 방향은 polling을 먼저 제품 기준으로 삼고, webhook은 나중에 선택 adapter로 두는 것이다.

### 5.2 Gateway namespace 검증과 command policy가 중복됨

현재 Gateway request schema가 `sandbox`만 허용하고, command-worker policy도 다시 sandbox를 검사한다.

둘 중 하나를 기준으로 정해야 한다.

- Gateway가 입력 검증만 담당한다면 `namespace`는 일반 문자열로 받고 command-worker policy가 최종 판단한다.
- Gateway가 정책까지 담당한다면 command-worker의 sandbox policy는 중복이다.

권장 방향은 command-worker policy를 최종 권한/정책 경계로 두는 것이다. Gateway는 schema/type 검증만 하고, 실제 허용 여부는 policy가 판단한다.

### 5.3 `Gateway` 클래스에 field key와 status value가 섞여 있음

`src/packages/contracts/gateway/fields.py`의 `Gateway`는 `COMMAND_ID`, `STATUS` 같은 key와 `STATUS_OK`, `STATUS_READY` 같은 value를 같이 들고 있다.

권장 방향:

- `Gateway`: response/request key
- `GatewayStatus`: status value
- `CommandStatus`: command queue status

사용 예:

```python
{Gateway.STATUS: GatewayStatus.OK}
```

## 6. 팀원이 지켜야 하는 규칙

1. 새 이벤트는 반드시 `src/packages/contracts/event_bus/subjects.py`와 `bodies/`에 먼저 추가한다.
2. worker끼리는 서로의 `src/services/**` 파일을 import하지 않는다.
3. 다른 서비스가 써야 하는 값은 `src/services/**/app.py` 상수가 아니라 `src/packages/contracts/**` 또는 `src/packages/config/constants.py`로 올린다.
4. 테스트 더블은 제품 구현과 파일/클래스 이름으로 분리한다.
5. 테스트 더블이 실제 subject를 발행해도 body shape은 진짜 계약을 지켜야 한다.
6. secret, token, kubeconfig는 event body에 넣지 않는다. ref만 전달한다.
7. 실제 외부 도구가 붙을 가능성이 있으면 먼저 `Protocol` port를 만들고 test double과 real adapter를 분리한다.
8. hardcoded sample 값은 제품 계약으로 설명하지 않는다. 문서에 demo/sample이라고 적는다.

## 7. 정리 우선순위

| 우선순위 | 작업 | 이유 |
| --- | --- | --- |
| 1 | `EventBody`/`EventEnvelope` 검증 강화 | 계약 파일이 진짜 계약 역할을 하려면 누락 필드를 막아야 한다. |
| 2 | decode 실패도 DLQ로 보내기 | 깨진 이벤트가 무한 재시도되는 것을 막는다. |
| 3 | Git polling subject 정리 | webhook을 쓰지 않는 방향과 코드 이름을 맞춘다. |
| 4 | command namespace 정책 위치 결정 | Gateway와 command-worker의 중복 정책을 제거한다. |
| 5 | `Gateway` key/value 분리 | field와 status를 헷갈리지 않게 한다. |
| 6 | test double/real adapter 분리 | 실제 GitHub/Prometheus/RCA로 교체하기 쉽게 만든다. |
| 7 | `Database` repository 구체 구현 분리 | port는 나뉘었지만 concrete 구현도 나누기 위해 필요하다. |

## 8. 한 문장 기준

팀원이 헷갈리면 이렇게 판단한다.

> `src/packages/contracts/**`는 맞춰야 하는 약속이고, `src/services/**` 안의 demo/hardcoded 값은 교체 가능한 현재 구현이다.
