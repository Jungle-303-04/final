# 2026-07-11 권한·Evidence·AI·명령·메트릭 개선 계획

## 목적

이 문서는 2026-07-11 `dev` 감사에서 확인한 결함의 해결 방향과 완료 조건을 고정한다.
이 문서는 구현 전 계획에서 시작했으며, 완료된 항목은 현재 구조로 갱신한다.

원칙:

1. 목업, 페이크, 합성 운영 데이터, 고정 사용자·클러스터 값으로 문제를 숨기지 않는다.
2. 외부 입력보다 세션, 등록 레지스트리, 서버가 만든 release context를 권위로 사용한다.
3. 장애나 수집 실패를 정상값 `0`으로 바꾸지 않는다.
4. DB 상태 변경과 후속 이벤트는 transactional outbox로 원자성을 보장한다.
5. 롤링 배포 중 구·신 이벤트가 섞여도 fail-closed 또는 하위 호환으로 처리한다.

## 실행 우선순위

| 순서 | 범위 | 이유 |
| --- | --- | --- |
| P0 | 공개 인증 우회 격리 | 익명 사용자가 라이브 관리자 권한을 얻는 현재 위험 차단 |
| P1 | AI 도구 권한 경계 | 사용자·workspace·cluster 간 정보 노출 차단 |
| P1 | Evidence 문맥·namespace·bundle 정합성 | RCA 오진과 다른 run 증거 혼입 차단 |
| P1 | Command janitor 원자성 | terminal 명령 이벤트 영구 유실 차단 |
| P1 | Node collector 권한·실패 표현 | 메트릭 누락과 정상 `0` 오인 차단 |
| P2 | Metadata 크기·소유권·EndpointSlice 의미 | 대형 cluster 실패 및 오래된 리소스 혼입 차단 |
| P2 | Safe PR 조회·문서 정합성 | 위험 설명 누락과 운영자 오해 차단 |

## 1. mTLS 개발 콘솔 격리

환경값에 따라 세션·리소스 인가·Agent token을 우회하던 코드는 삭제했다. 공개 콘솔은 기존
로그인 세션을 사용하고, 로그인 없는 개발 콘솔은 Cloudflare mTLS와 내부 프록시 비밀값을
모두 검증한다.

```text
Internet
  -> public gateway / public console
     세션 인증·Agent token 필수

Chrome + client certificate
  -> Cloudflare mTLS/WAF
  -> cloudflared Tunnel
  -> console-dev ClusterIP
  -> 내부 신뢰 헤더
  -> api/realtime gateway ClusterIP
```

일반 nginx는 내부 헤더를 항상 삭제한다. API/realtime Service는 기본 `ClusterIP`이고 local kind
스크립트만 명시적으로 NodePort를 연다. Agent API에는 mTLS 프록시 신원을 적용하지 않으며
`x-agent-token`이 항상 필요하다. RCA 장애 주입과 fixture purge는 각각
`RCA_TEST_RUNS_ENABLED`, `TEST_FIXTURE_PURGE_ENABLED` capability로 분리했다.

## 2. Metadata evidence 문맥과 namespace 정합성

### 서버 소유 문맥을 provider 결과와 분리

현재 `metadata.rca_test`와 metadata provider의 결과가 같은 최상위 key를 공유한다. 이를 다음처럼
분리한다.

```json
{
  "evidence_context": {
    "rca_test": {
      "run_id": "...",
      "scenario_id": "...",
      "pod_names": ["..."]
    },
    "release": {"namespace": "sandbox", "resource_name": "..."}
  },
  "metadata": {
    "change_context": {},
    "current_workload_snapshot": {}
  }
}
```

`evidence_context`는 management가 만든 값만 기록하며 Agent/provider가 덮어쓸 수 없다. 구 이벤트의
`metadata.rca_test`는 upcaster에서 새 위치로 옮기고, 충분한 문맥이 없으면 일반 incident로
조용히 완화하지 말고 test run을 `evidence_scope_invalid`로 실패시킨다.

### query 생성

RCA test와 release failure에서 metadata query는 문자열 기본값 `change_context`를 그대로 사용하지
않는다. 서버 소유 `namespace`, `resource_kind`, `resource_name`으로 typed query를 생성한다.
Deployment 대상이면 `deployment/{namespace}/{name}`, namespace 집계가 필요하면 명시적으로
`namespace/{namespace}`를 사용한다.

strict 검증은 결과가 비어 있지 않은지만 보지 않고 다음을 확인한다.

- 결과 namespace가 release context namespace와 일치한다.
- 지정한 workload identity가 결과에 존재한다.
- test run이면 Pod 이름 또는 run label이 해당 run과 일치한다.
- 불일치 결과는 evidence에 저장하지 않고 구조화된 실패 코드로 종료한다.

### Service와 EndpointSlice를 RCA에 연결

`service_selector_matches`와 `endpoint_slice_ready_endpoints`를 각각 독립 `EvidenceItem`으로 만든다.
허용 key만 늘리는 것으로 끝내지 않고 rule 입력 계약에 다음 의미를 명시한다.

- selector exact/live-pod match만 대상 Service 관계로 사용한다.
- selector key만 같은 `selector_key_overlap`은 진단 힌트로 분리하고 EndpointSlice 필터에는 쓰지 않는다.
- ready endpoint 0, not-ready 증가, terminating endpoint를 별도 check_id로 제공한다.
- 원본 namespace/name과 evidence_ref를 보존한다.

### Kubernetes 의미 보존

- EndpointSlice의 `ready`와 `serving` 생략은 Kubernetes 계약에 따라 true로 해석한다.
- `terminating` 생략은 false로 해석한다.
- owner UID가 양쪽에 있으면 UID가 일치해야 한다. 이름 fallback은 양쪽 중 UID가 없는 legacy 객체에만
  허용하고 결과에 `ownership_confidence=name_fallback`을 표시한다.
- 복수 metadata query는 list/map으로 병합한다. singular snapshot key를 마지막 결과로 덮어쓰지 않는다.

### payload 크기

1MiB 제한을 올리는 방식은 채택하지 않는다. Agent가 보내기 전에 provider별 byte budget을 적용한다.

- 기본 전송 budget은 전체 상한보다 여유 있는 768KiB 이하로 둔다.
- namespace 집계는 workload 수, Pod 상태 수, condition/message 길이를 결정적으로 제한한다.
- `total_count`, `returned_count`, `truncated`, `next_cursor`를 함께 보내 누락을 숨기지 않는다.
- 장애 대상 workload와 직접 연결된 Service/Pod/Event를 우선 보존한다.
- 전문이 반드시 필요하면 한 payload를 키우지 말고 provider job을 cursor 단위로 분할하거나 별도
  claim-check 저장 경계를 설계한다.
- Agent는 전송 전 직렬화 크기를 검사한다. 상한 초과 시 거대한 completed 요청을 반복하지 않고
  작은 `failed` 결과와 `payload_too_large` 코드를 전송한다.

## 3. AI 도구 권한과 Safe PR 조회

### 공통 권한 포트

각 AI tool에서 임의로 DB를 조회하지 않는다. `ToolContext`에 다음과 같은 fail-closed 권한 포트를
주입한다.

```python
class ToolAuthorizationPort(Protocol):
    async def require_conversation_owner(self, conversation_id: str) -> None: ...
    async def require_cluster_read(self, cluster_id: str) -> None: ...
    async def require_workflow_read(self, workflow_run_id: str) -> None: ...
    async def require_incident_read(self, correlation_id: str) -> None: ...
```

모든 도구는 조회 전에 이 포트를 통과한다. HTTP 라우터와 AI tool이 같은 repository/정책 함수를
재사용하고, LLM이 전달한 ID는 권한 근거가 될 수 없다.

Repository 쿼리도 방어층을 갖는다.

- 대화: `workspace_id + conversation_id + user_id`
- inventory: `workspace_id + cluster_id`, 그 전에 `cluster.read`
- workflow/diff: `workspace_id + workflow_run_id`, 필요하면 application/cluster grant까지 확인
- RCA/recovery: correlation에서 cluster를 먼저 해석하고 `cluster.read` 확인

리소스별 RCA 목록은 workspace 최신 N개를 가져온 뒤 Python에서 필터하지 않는다. DB에서
cluster/resource/correlation 조건을 먼저 적용하고 그 뒤 limit/cursor를 적용한다.

### Safe PR 이벤트 조회

단기 수정은 subject별 실제 JSON 경로를 하나의 repository helper에서 처리한다.

- `safe_pr.patch_prepared`: 최상위 식별자
- `safe_pr.ready_for_creation`: `payload.request.*` 식별자
- `diff.explained`: causation/correlation 또는 연결된 patch event에서 workflow identity 해석

신규 이벤트 계약에는 top-level `workspace_id`, `workflow_run_id`, `application_id`를 추가하되 구형
이벤트 조회 fallback을 유지한다. 장기적으로는 raw JSON scan 대신 release-flow projection table에
정규화하여 조회한다. 테스트는 Stub만 사용하지 않고 PostgreSQL JSONB에 실제 세 subject fixture를
저장해 위험도·설명·준비 상태가 모두 조회되는지 검증한다.

### 가인 staged 문서 처리

오래된 workspace의 staged 변경은 cherry-pick하거나 그대로 commit하지 않는다.

1. 최신 `dev`에서 새 브랜치를 만든다.
2. 실제 `src/services`, deploy manifest, event graph를 기준으로 필요한 문장만 다시 작성한다.
3. `dashboard-worker`, `safe-pr-worker`, `scm-worker`의 실제 책임을 유지한다.
4. `scripts/events.py`, 서비스 명부, docs index 테스트로 문서를 검증한다.
5. 삭제 파일은 최신 `dev`에서 이미 처리됐는지 확인한 뒤 중복 삭제하지 않는다.

## 4. Command janitor 원자성

현재처럼 command를 terminal로 바꾼 뒤 직접 NATS emit을 호출하지 않는다. 한 DB transaction에서
다음을 함께 수행한다.

1. 만료 command를 `FAILED/expired`로 조건부 갱신한다.
2. 결정적 `event_id`를 가진 `command.completed` outbox row를 insert한다.
3. 처리 ledger 또는 janitor marker를 기록한다.
4. transaction commit 후 독립 outbox relay가 NATS로 전달한다.

`(command_id, terminal_status, event_subject)` unique key로 중복을 막는다. NATS 장애 시 outbox row는
남아 재시도되고, command terminal 상태와 이벤트가 서로 분리되지 않는다. 여러 명령을 한 번에
처리하더라도 한 명령의 실패가 다른 명령의 outbox 생성을 막지 않도록 작은 batch와 명시적 결과를
사용한다.

완료 조건:

- outbox insert 실패 시 command 상태도 rollback된다.
- NATS 중단 후 재가동하면 terminal event가 정확히 한 번의 논리 이벤트로 전달된다.
- janitor 재실행은 동일 command의 중복 terminal event를 만들지 않는다.
- release-flow와 rollout이 만료 명령에서 영구 waiting으로 남지 않는다.

## 5. Node collector 권한과 실패 데이터

### 최소 권한 ServiceAccount

`cluster-agent-node-collector` 전용 ServiceAccount와 읽기 전용
`cluster-agent-node-collector-read` ClusterRole을 만든다. DaemonSet에
`serviceAccountName: cluster-agent-node-collector`를 명시하고 쓰기 동사는 부여하지 않는다. Downward API로
현재 `spec.nodeName`을 환경변수에 넣고 Pod 조회는
`fieldSelector=spec.nodeName=<현재 노드>`로 제한한다. 노드마다 전체 cluster Pod 목록을 받으면
노드 수에 비례해 API 부하가 증폭되므로 허용하지 않는다.

### 실패는 실패로 표현

CPU, memory, filesystem 또는 Kubernetes API 수집 실패 시 `0`을 반환하지 않는다.

- 실패한 gauge sample은 생략하거나 nullable 내부 모델로 유지한다.
- `node_collector_up`, `node_collector_scrape_error`, `last_success_timestamp`를 별도로 발행한다.
- dashboard API는 sample 부재를 `null/unavailable`로 응답한다.
- 이전의 실제 `0` sample과 수집 실패를 구분할 수 있어야 한다.
- runtime/container 정보는 실제 `/proc`, CRI 또는 node status에서 읽고 고정 문자열을 사용하지 않는다.

완료 조건:

- `kubectl auth can-i`로 Pod/Node 읽기는 yes, create/update/patch/delete는 모두 no다.
- node-collector가 자신의 node Pod만 조회한다.
- 파일·Kubernetes API 접근 실패를 주입하면 사용량 `0`이 아니라 unavailable과 scrape error가 보인다.
- 정상 node에서 실제 CPU/memory/filesystem 값과 Pod count가 검증된다.

## 6. 구현 단위와 회귀 게이트

다음 커밋 단위를 권장한다.

1. `fix: 개발 인증 우회 네트워크 격리 / 공개 경로 fail-closed`
2. `fix: Evidence 서버 문맥 / metadata namespace / strict 검증`
3. `fix: Service·EndpointSlice RCA 연결 / Kubernetes 의미 보존`
4. `fix: Metadata byte budget / cursor / 초과 실패 계약`
5. `fix: AI tool 권한 포트 / workspace repository 경계`
6. `fix: Safe PR 이벤트 식별자 조회 / 실 DB 계약 테스트`
7. `fix: Command janitor transactional outbox`
8. `fix: Node collector RBAC / node field selector / unavailable 메트릭`
9. `docs: 이벤트·배포·멤버 가이드 최신화`

각 커밋은 관련 단위·통합 테스트, Ruff, import-linter를 통과해야 한다. 전체 완료 전에는 다음을
추가로 통과해야 한다.

- 전체 pytest
- management/target manifest 렌더
- 익명 공개 API 401 smoke
- 권한 없는 AI conversation/cluster/workflow 조회 거부 테스트
- sandbox RCA run의 namespace/Pod/log 격리 E2E
- 대형 namespace evidence의 결정적 truncation 테스트
- NATS 중단·복구 command janitor 통합 테스트
- node-collector 실제 권한과 unavailable 메트릭 테스트

## 이번 문서 범위 밖

이 문서는 구현 승인이나 production 전환을 의미하지 않는다. DB 초기화, live rollout, 인증 우회
해제, Agent token 회전은 각 구현과 검증이 끝난 뒤 별도 배포 승인 단계에서 수행한다.
