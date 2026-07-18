---
title: API 연결 작업지시서 — 프론트↔백엔드 전송 계층 담당자용
status: active-directive — 골모드 allowlist 8번·§6b 실행 정본
date: 2026-07-12
audience: 프론트↔백엔드 API 연결 담당 개발자
queue: api-needs.md
owner_paths: references/ui-layer-lab/src/product/api/** + 두 조율 문서의 제한된 상태 변경
verified_against: transport 커밋 af03639ee / routes.py 실제 router·request·response 교차 검증 / API 큐 15행·30함수
---

# API 연결 작업지시서

## 0. 이 문서로 만들어야 하는 결과

API 작업자는 백엔드 wire 계약을 프론트가 호출할 수 있는 **타입 안전 endpoint 함수**로 만든다.
화면, feature state, provider 분기, 화면용 필드 변환은 만들지 않는다. 완료 함수는
`api-needs.md`의 원자적 claim과 `codex-progress-20260711.md`의 정확한 완료 앵커를 통해서만
제품 소비가 허용된다.

현재 기준선은 다음과 같다.

| 항목 | 현재값 | 의미 |
|---|---:|---|
| 큐 행 | 15 | `requested` 15행 + `in_progress` 0행 + `blocked` 0행 |
| 큐가 요구하는 export 함수 | 30 | 완료 앵커가 확인된 함수를 제거한 남은 수 |
| 현재 존재하는 HTTP·composition 함수 | 23 | exact 완료 앵커 19함수 + 미승인 4함수 |
| 현재 존재하는 realtime 함수 | 3 | HTTP 큐 밖이며 별도 승인 전 소비 금지 |
| 실 contract fixture | 0 | mock test만 일부 존재 |
| 정확한 `API 완성:` 앵커 | 19 | progress의 exact anchor 함수만 소비 가능 |

**작업 범위는 `api-needs.md`의 claim한 한 행뿐이다.** routes.py 접두 전체, 인접 endpoint,
provider별 endpoint를 임의로 추가하지 않는다. 큐에 없는 함수가 필요하면 구현하지 말고 큐
coordinator에게 새 행을 요청한다.

## 1. 경로를 틀리지 않는 최초 준비

문서의 모든 경로는 저장소 루트 기준이다. 먼저 두 절대 경로를 만든다.

```bash
export REPO_ROOT="$(git rev-parse --show-toplevel)"
export UI_ROOT="$REPO_ROOT/references/ui-layer-lab"
cd "$REPO_ROOT"
git status --short --branch
git fetch origin woonyong/ui-layer-lab
```

`src/domains/**`, `src/packages/contracts/**`는 `$REPO_ROOT` 아래에 있고, 제품 API 코드는
`$UI_ROOT/src/product/api/**`에 있다. `$UI_ROOT`로 이동한 뒤 `src/domains`를 찾으면 실패한다.

기준 게이트와 개발 서버는 다음처럼 실행한다.

```bash
cd "$UI_ROOT"
npm ci
npm run check
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

최신 canonical branch에서 최초 `npm run check`가 실패하면 queue를 claim하지 않는다. 같은 machine의
병렬 test process를 종료한 뒤 한 번 재실행하고, 계속 실패하면 명령·실패 파일·현재 HEAD를 queue
coordinator인 현재 primary Codex 작업(`/root`)에 전달한다.

`strictPort`가 실패하면 다른 포트로 조용히 이동하지 않는다. 기존 프로세스의 소유자를 확인하고
중지한 뒤 다시 실행한다. 브라우저 경로는 FastAPI router 경로 앞에 `/api`를 붙인다. `/api`는
router prefix가 아니라 gateway middleware가 제거하는 browser alias다.

세션 검증 예시는 다음과 같다. 실제 자격증명·쿠키·토큰·응답의 개인정보는 문서나 커밋에 넣지
않는다.

```bash
curl -c /tmp/kh.cookie -H 'content-type: application/json' \
  -X POST http://127.0.0.1:5173/api/auth/login \
  -d '{"email":"<팀에서 받은 이메일>","password":"<팀에서 받은 비밀번호>"}' -i
curl -b /tmp/kh.cookie http://127.0.0.1:5173/api/auth/session
```

작업 종료 때 `/tmp/kh.cookie`를 삭제한다. 401을 피하려고 bearer token, localStorage token,
synthetic session을 발명하지 않는다.

## 2. 소유권과 수정 가능 파일

| 경로 | API 작업자 권한 | 규칙 |
|---|---|---|
| `references/ui-layer-lab/src/product/api/<claim 파일>` | 수정 가능 | claim한 행의 endpoint·schema·test만 |
| `references/ui-layer-lab/src/product/api/barrels/<domain>.ts` | 제한적 수정 | claim 함수·wire type export 추가만; 자기 도메인 barrel만 |
| `references/ui-layer-lab/src/product/api/index.ts` | 통합자 전용 | 도메인 barrel 재수출만; claim 작업자가 직접 수정하지 않음 |
| `docs/spec/frontend/api-needs.md` | 조율 예외 | claim·heartbeat·blocked·완료 제거만 |
| `docs/spec/frontend/codex-progress-20260711.md` | 조율 예외 | 완료 시 EOF append만; 기존 줄 수정 금지 |
| `references/ui-layer-lab/src/product/api/client.ts` | **수정 금지** | `af03639ee`의 JSON/no-content transport 계약으로 재동결 |
| `references/ui-layer-lab/src/product/api/url.ts` | **수정 금지** | 경로·query helper |
| `references/ui-layer-lab/src/product/**` 중 `api` 밖 | 수정 금지 | adapter·composition·화면은 Codex 소유 |
| `src/**`, `deploy/**`, `migrations/**` | 읽기 전용 | backend 계약을 고치지 않는다 |

`client.ts`의 `BLOCK-204-001` 한정 변경은 transport owner 승인에 따라 `af03639ee`에서 완료됐다.
이 커밋 이후 동결 규칙이 다시 유효하다. `client.ts`·`url.ts` 변경이 다시 필요해 보이면 우회 fetch를
만들지 말고 `blocked`로 전환한다.
`apiRequest` 밖의 `fetch`, XHR, EventSource, WebSocket을 endpoint 파일에 추가하지 않는다.

## 3. `api-needs.md` 큐 사용법

### 3.1 canonical branch와 상태 기계

조율 정본은 `origin/woonyong/ui-layer-lab` 하나다. claim, 코드, 완료 앵커가 이 원격 branch에
도달하기 전에는 다른 작업자와 Codex가 보았다고 간주하지 않는다. 이 branch를 force-push하거나
완료 앵커가 가리키는 commit을 rebase·squash로 없애지 않는다.

```text
requested ──claim──> in_progress ──검증 실패──> blocked
    ▲                     │                       │
    └────lease 회수───────┘                       └──근거 해소 후 requested
                          └──코드 커밋+게이트+앵커──> 행 제거
```

- 전체 queue에서 `in_progress` 행은 동시에 정확히 하나만 허용한다는 기존 규칙은 2026-07-13
  병렬 모드 결정으로 레인 단위 소유권에 양보한다. 현재 `index.ts`는 도메인 barrel만 재수출하고,
  작업자는 자기 도메인 barrel과 claim 파일만 수정한다. 두 레인이 같은 파일을 수정해야 하면
  중단 후 coordinator에게 보고한다.
- 한 작업자는 동시에 한 행만 claim한다.
- 한 행은 분할 claim하지 않는다. 함수군을 나눠야 하면 먼저 queue 행을 둘로 나누는 조율 커밋을
  만든다.
- `in_progress` 행은 다른 작업자가 건드리지 않는다.
- `requested`가 24시간 미처리되었거나 `in_progress`의 마지막 heartbeat가 24시간 지났을 때만
  coordinator가 회수할 수 있다. 회수는 상태를 `requested`로 되돌리고 담당·브랜치·claim 시각을
  비운 커밋이 원격에 반영된 뒤 유효하다.
- 작업 중단·교대 때는 반드시 상태를 `blocked` 또는 `requested`로 바꾼다.

### 3.2 claim 절차

1. `git pull --rebase origin woonyong/ui-layer-lab` 후 queue와 progress를 다시 읽는다.
2. `in_progress` 행이 0개이고, 원하는 행이 `requested`이며 동일 함수의 exact 완료 앵커가 없음을
   확인한다.
3. queue 행을 `in_progress`로 바꾸고 `담당/브랜치`, `claim·heartbeat`를 채운다.
4. `docs: APIQ-XXX 작업 선점`으로 커밋·push한다.
5. push가 거절되면 재base 후 그 행을 다시 확인한다. 이미 선점되었으면 다른 행을 고른다.

heartbeat는 queue의 `claim·heartbeat` 시각을 갱신한 커밋이 canonical branch에 push되어야만
유효하다. 코드 commit 시각이나 채팅 메시지만으로 lease를 갱신하지 않는다. 행 분할·회수·unblock의
승인 주체는 queue coordinator인 현재 primary Codex 작업(`/root`)이다.

### 3.3 완료는 반드시 2커밋

코드 commit hash를 같은 commit 안에 기록할 수 없으므로 다음 순서를 고정한다.

1. **커밋 A — 코드:** endpoint, schema, contract test, 해당 도메인 barrel export를 포함한다.
   메시지는 `feat: <한국어 API 함수군 설명>` 또는 검증 전용이면
   `test: <한국어 API 계약 검증 설명>`이다. 커밋 A를 canonical branch에 먼저 push한다.
2. 원격에 올라간 커밋 A에서 `npm run check`와 필요한 실검증을 통과시킨다.
3. 커밋 B를 만들기 직전 `git pull --rebase origin woonyong/ui-layer-lab`을 실행하고
   `git merge-base --is-ancestor <A hash> origin/woonyong/ui-layer-lab` 및 queue claim이 여전히 자기
   것인지 확인한다. 이 시점에 rebase로 A hash가 바뀌었다면 새 hash로 gate를 다시 실행한다.
4. **커밋 B — 조율:** progress 파일 EOF에 export 함수별 exact 앵커를 append하고, 같은 함수군의
   모든 앵커가 있을 때 queue 행을 제거한다. 메시지는
   `docs: APIQ-XXX 완료 앵커 등록 / 요청 큐 정리`다.
5. 커밋 B push가 거절되면 pull·claim·ancestor 검사를 반복한다. 성공한 뒤에만 Codex가 함수를
   소비한다.

앵커는 열 첫 칸부터 다음 정규식과 정확히 일치해야 한다.

```text
^API 완성: [A-Za-z][A-Za-z0-9]* \([0-9a-f]{7,40}\)$
```

앵커의 hash는 **커밋 B가 아니라 커밋 A**다. bullet, backtick, 설명 접미사, 함수군 합친 한 줄은
유효하지 않다. 기존 함수 검증 행은 contract test를 추가한 커밋 A의 hash를 사용한다. 예외적으로
작업 branch를 사용했다면 그 branch의 hash로 앵커를 쓰지 않는다. coordinator가 canonical branch에
merge 또는 cherry-pick한 뒤 `git merge-base --is-ancestor <hash> origin/woonyong/ui-layer-lab`가
성공하는 최종 hash만 기록한다. squash로 hash가 바뀌면 squash 결과 hash가 커밋 A다.

### 3.4 blocked 절차

queue 상태를 `blocked`로 바꾸고 비고에 다음 네 가지를 남긴다.

1. blocker ID와 한 문장 원인
2. 재현 명령·HTTP status·관련 backend 파일 위치
3. 필요한 결정 또는 선행 함수
4. 재개 조건과 소유자

부분 구현을 도메인 barrel에 export하거나 완료 앵커를 쓰지 않는다. 다른 행으로 이동한다.

### 3.5 24시간 대행 절차

대행은 `requested` 행이 요청 시각부터 24시간 동안 미처리되었거나 `in_progress` heartbeat가
24시간을 초과했을 때만 coordinator가 발동한다. 다음 조건을 모두 지킨다.

1. `APIQ-001`, `APIQ-002`, `APIQ-003`, `APIQ-004`, `APIQ-007`, `APIQ-008`, `APIQ-023`, `APIQ-024`, `APIQ-025`, `APIQ-026`은
   완료 앵커가 있으므로 다음 대행은 queue의 P0, P1, P2 순서로 이동한다.
2. 대행 전에도 전체 queue의 `in_progress`가 0개인지 확인하고, 대상 행 하나만 claim한다. 대행이라는
   이유로 전역 단일 행 lock을 우회하거나 여러 행을 병렬 claim하지 않는다.
3. 일반 작업자와 동일하게 claim 커밋, 코드 커밋 A, 완료 앵커·행 제거 커밋 B의 절차를 지킨다.
4. `codex-progress-20260711.md` EOF에 대상 APIQ, 원 요청 시각, 대행 시작 시각, 실제 경과 시간,
   대행 사유를 기록한다.
5. API 작업자가 복귀하면 이미 claim한 대행 행만 완료하고 다음 행부터는 작업자에게 양보한다.
   대행의 목적은 정체 해소이며 API 작업자의 병렬 작업 역할을 제거하는 것이 아니다.
6. `index.ts` lock이 병목이면 먼저 progress EOF에 도메인별 barrel 분리 제안서와 영향 파일·이행
   순서·호환성 검증을 기록한다. 검토자 승인 전에는 `index-*.ts`를 만들거나 export를 이동하지 않는다.

## 4. 현재 API 코드와 소비 승인 상태

현재 `src/product/api`에는 41개 파일이 있다. wire HTTP·composition 함수 23개와 realtime 함수
3개 중 exact 완료 앵커가 있는 것은 19함수다. `apiRequestNoContent`는 endpoint 완료 함수가
아닌 transport helper이므로 `API 완성:` 앵커 수에 포함하지 않는다.

| 기존 모듈 | 함수 | test 상태 | queue |
|---|---|---|---|
| `auth.ts` | `getSession`, `login`, `logout` | contract 8 PASS, exact 앵커 3 | 완료 |
| `clusters.ts` | `listClusters` | contract 9 PASS, exact 앵커 `257581398` | 완료 |
| `cluster-detail.ts` | `getCluster` | contract PASS, exact 앵커 1 | 완료 |
| `cluster-connection.ts` | `getClusterConnectionStatus` | contract PASS, exact 앵커 1 | 완료 |
| `fleet.ts` | `getFleetSummary` | contract PASS, exact 앵커 1 | 완료 |
| `rca.ts` | `getRcaTimeline` | contract PASS, exact 앵커 1 | 완료 |
| `inventory-summary.ts` | `getInventorySummary` | contract PASS, exact 앵커 1 | 완료 |
| `inventory-events.ts` | `listInventoryEvents` | contract PASS, exact 앵커 1 | 완료 |
| `inventory-query.ts` | `listInventoryResourcesByType` | contract PASS, exact 앵커 1 | 완료 |
| `cluster-summary.ts` | `getClusterSummary`, `getClusterNodesSummary`, `getNodePodsSummary` | contract PASS, exact 앵커 3 | 완료 |
| `inventory.ts` | resource/service/workload/detail 4함수 | contract PASS, exact 앵커 4 | 완료 |
| `metrics.ts` | usage/submit/status/poll/run 5함수 | usage exact 앵커 1; Prometheus/status/poll/run은 queue | `APIQ-027` |
| `live.ts` | build/create/connect realtime 3함수 | message 일부만; connection 계약 미검증 | HTTP 큐 밖 |

기존 코드나 test 커밋이 있다는 것은 승인됐다는 뜻이 아니다. 선행 claim, test·실응답·오류·
AbortSignal 검증과 exact 완료 앵커가 모두 필요하다.

## 5. backend 계약을 찾는 순서

추측하지 말고 저장소 루트에서 항상 다음 순서로 찾는다.

```bash
cd "$REPO_ROOT"
rg -n "<ROUTE_CONSTANT>" src/packages/contracts/gateway/routes.py src/domains
rg -n "class <RequestOrResponseModel>" \
  src/packages/contracts/gateway/requests.py \
  src/packages/contracts/gateway/responses.py
```

1. `routes.py`의 정확한 상수와 path를 확인한다.
2. 그 상수를 쓰는 router decorator에서 HTTP method, `response_model`, 명시적 `status_code`를
   확인한다. 명시가 없으면 현재 FastAPI 기본은 200이다.
3. router 함수 signature에서 path/query/body의 required, default, bounds를 확인한다.
4. request/response Pydantic model에서 필드와 nested model을 끝까지 확인한다.
5. `response_model_exclude_none`, `exclude_unset`, custom serialization 여부를 확인한다.
6. GET은 실제 세션 응답으로 모델과 JSON을 대조한다.

`AcceptedResponse`라는 이름만 보고 HTTP 202라고 가정하지 않는다. 현재 queue의 approval,
command, deployment, recovery POST는 모두 명시적 202가 아니라 200이다.

## 6. 파일 구성과 함수 형식

신규 함수군은 queue의 `대상 파일`을 따른다.

```text
src/product/api/
  <domain>.ts             endpoint 함수·wire request type
  <domain>-schemas.ts     response/request Zod schema·wire output type
  <domain>.test.ts        URL·body·schema·오류·AbortSignal contract test
  barrels/<lane>.ts       공개 export 추가만
  index.ts                도메인 barrel 재수출만
```

queue의 대상 파일 열에서 `test`는 첫 endpoint 파일과 같은 stem의 `<domain>.test.ts`를 뜻한다.
예: `cluster-detail.ts`의 test는 `cluster-detail.test.ts`, `metric-presets.ts`의 test는
`metric-presets.test.ts`다.

함수 signature 규칙은 다음과 같다.

```ts
// 단건 GET
getThing(id: string, signal?: AbortSignal): Promise<ThingResponse>

// 목록 GET
listThings(scope: string, options: ListThingsOptions = {}, signal?: AbortSignal)

// mutation — wire request는 backend snake_case를 유지
mutateThing(identity: ThingIdentity, request: ThingRequest, signal?: AbortSignal)
```

- `AbortSignal`은 마지막 인자이며 `apiRequest(..., { signal })` 또는 204/205 endpoint의
  `apiRequestNoContent(..., { signal })`까지 전달한다.
- path segment는 `encodePathSegment`, query는 `withQuery`를 사용한다.
- `undefined`는 query에서 생략하고 `null`은 backend가 명시적으로 구분할 때만 body에 보낸다.
- request body는 request schema로 먼저 검증한 뒤 한 번만 `JSON.stringify`한다.
- endpoint 계층에서 camelCase view model, status 번역, fallback 값, `?? 0`, provider 분기를 만들지
  않는다.
- POST는 자동 재시도하지 않는다. network error 뒤 요청이 서버에 도착했는지 알 수 없으면
  possibly-sent로 취급한다.

## 7. Zod wire schema 규칙

Pydantic의 required와 nullable은 별개다.

| backend 의미 | Zod |
|---|---|
| 필수·null 불가 | `field: schema` |
| 필수·null 허용 | `field: schema.nullable()` |
| 생략 가능·null 불가 | `field: schema.optional()` |
| 생략 가능·null 허용 | `field: schema.nullable().optional()` |

추가 규칙:

1. 고정 객체는 `z.strictObject({...})`를 사용한다.
2. backend `JsonMap`·`dict[str, Any]` 필드만
   `z.record(z.string(), z.unknown())`으로 열어 둔다. 상위 객체까지 느슨하게 만들지 않는다.
3. wire field는 snake_case 그대로 둔다. view 변환은 Codex adapter 소유다.
4. 상태 문자열은 backend의 전체 리터럴을 증명할 수 있을 때만 enum이다. 자유형 map 속 status는
   `z.string()`으로 보존한다.
5. 숫자는 coercion하지 않는다. `0`, `null`, field 누락을 서로 바꾸지 않는다.
6. timestamp는 wire에서 `z.string()`으로 보존한다. endpoint 함수에서 `Date`로 바꾸지 않는다.
7. browser 금지 `raw` payload는 공개 schema에 추가하지 않는다.
8. request model도 `StrictModel(extra=forbid)`와 맞게 strict schema로 검증한다.

## 8. contract test 필수 매트릭스

각 함수군 test는 최소 다음을 검증한다. production 코드에 fixture를 넣지 않고 test 파일 또는
API test 전용 fixture만 사용한다. `features/**`를 API test가 import하지 않는다.

| ID | 검증 |
|---|---|
| D1 | 정확한 method, `/api` path, percent encoding, query default·생략·bounds |
| D2 | 대표 정상 응답, nested required field, nullable/optional 네 조합 |
| D3 | 고정 객체의 unknown field와 required field 누락이 `invalid-payload`로 실패 |
| D4 | 401/403/404/409/422/429가 `ApiError` status·kind·code·retryAfter를 보존 |
| D5 | AbortSignal 취소가 AbortError로 전파되고 재요청하지 않음 |
| D6 | mutation body가 exact snake_case이며 한 사용자 동작당 POST 한 번 |
| D7 | receipt를 최종 결과로 바꾸지 않고 status literal·nullable field를 축소하지 않음 |
| D8 | 목록 limit·cursor·offset이 backend default와 bounds를 그대로 반영 |

GET 함수는 game-server 또는 세션에 보이는 실제 ID로 curl 실검증이 필수다. 응답 전문 대신 key 목록,
개수, redacted ID, HTTP status만 progress에 기록한다.

mutation은 실제 상태를 바꿀 수 있으므로 다음 규칙을 따른다.

- mock contract test는 필수다.
- sandbox 대상과 coordinator의 명시적 승인 없이는 live POST/DELETE를 호출하지 않는다.
- 승인 없이 live mutation을 생략한 것은 실패가 아니다. progress에
  `LIVE_MUTATION_NOT_RUN: 승인·sandbox 부재`를 기록한다.
- production cluster의 scale, restart, approval, recovery selection, conversation delete를 검증
  목적으로 호출하지 않는다.

## 9. mutation·receipt·polling 계약

- 현재 `AcceptedResponse`는 `accepted`, `event_id`, `correlation_id`만 있고 `command_id`가 없다.
  `submitCommand`, `scaleDeployment`, `restartDeployment`, approval, recovery selection을
  `getCommandStatus`와 임의 연결하지 않는다.
- `AgentDebugQueryResponse`처럼 실제 `command_id`가 있는 응답만 command polling에 사용한다.
- HTTP 200이어도 receipt는 terminal success가 아니다. UI 상태 변경은 Codex adapter·query
  invalidation이 담당한다.
- network failure 뒤 mutation POST를 자동 재전송하지 않는다.
- `pollCommand`는 최초 POST를 다시 호출하지 않고 GET만 반복하며 AbortSignal, terminal status,
  timeout을 보존한다.
- `submitCommand`는 `Cross-Gap-001`을 유지한다. endpoint 함수는 raw receipt까지만 구현할 수 있고
  완료 추적 함수를 발명하지 않는다.

### 9.1 204/205 no-content

현재 `client.ts`는 JSON response용 `apiRequest`와 204/205 empty body용
`apiRequestNoContent`를 분리한다. `deleteAiConversation`처럼 본문 없는 성공 응답은
`apiRequestNoContent`를 사용하고, 직접 fetch나 가짜 JSON body로 우회하지 않는다. 200 JSON
endpoint에는 계속 `apiRequest`와 runtime schema를 사용한다.

## 10. queue 함수별 실제 backend 계약

아래 router path 앞에 browser 호출용 `/api`를 붙인다.

| Queue | 함수 | Method·router path | 입력·default | response·status | 주의 |
|---|---|---|---|---|---|
| APIQ-021 | `getSession` | GET `/auth/session` | 없음 | `AuthSessionResponse`, 200 | 미인증은 401 |
| APIQ-021 | `login` | POST `/auth/login` | `LoginRequest(email,password)` | `AuthSessionResponse`, 200 | cookie 설정 |
| APIQ-021 | `logout` | POST `/auth/logout` | 없음 | `LogoutResponse`, 200 | 204 아님 |
| APIQ-022 | `listClusters` | GET `/clusters` | `limit=100` | `ClusterListResponse`, 200 | bounds 명시 없음 |
| APIQ-001 | `getCluster` | GET `/clusters/{cluster_id}` | path | `ClusterResponse`, 200 | cluster·agents 보존 |
| APIQ-002 | `getClusterConnectionStatus` | GET `/clusters/{cluster_id}/connection-status` | path | `ClusterConnectionStatusResponse`, 200 | capability 축소 금지 |
| APIQ-023 | `getFleetSummary` | GET `/fleet/summary` | 없음 | `FleetSummaryResponse`, 200 | read-only |
| APIQ-004 / APIQ-028 | `getClusterSummary` | GET `/clusters/{cluster_id}/summary` | path | `ClusterSummaryDetailResponse`, 200 | `usage.pods_total` 누락은 `undefined`로 보존; 다른 section strict |
| APIQ-004 | `getClusterNodesSummary` | GET `/clusters/{cluster_id}/nodes/summary` | path | `ClusterNodesSummaryResponse`, 200 |  |
| APIQ-004 | `getNodePodsSummary` | GET `/clusters/{cluster_id}/nodes/{node_name}/pods/summary` | 2 path | `NodePodsSummaryResponse`, 200 |  |
| APIQ-025 / APIQ-008 | inventory resources | GET `/clusters/{cluster_id}/inventory/resources` | `resource_type?`, `namespace?`, `include_deleted=false`, `limit=200`(1..1000) | `InventoryResourceListResponse`, 200 | 두 함수가 같은 route |
| APIQ-025 | `getInventoryResourceDetail` | GET `.../inventory/resource-detail` | 필수 `resource_type,kind,name`; `namespace?`; `related_limit=100`; `event_limit=50` | `InventoryResourceDetailResponse`, 200 | query identity |
| APIQ-025 / APIQ-007 | services/workloads/events | GET 각 inventory collection | `namespace?`, `limit=200` 또는 events `limit=200`(1..1000) | `InventoryResourceListResponse`, 200 | events는 같은 sanitized read model의 `InventoryEventList` alias |
| APIQ-003 | `getInventorySummary` | GET `.../inventory/summary` | cluster path | `InventorySummaryResponse`, 200 | latest snapshot 구분 |
| APIQ-026 / APIQ-009 | usage | GET `/clusters/{cluster_id}/usage` | `limit=288`(1..2000) | `ClusterUsageResponse`, 200 | `samples[].usage`는 JsonMap |
| APIQ-010 | `listMetricQueryPresets` | GET `.../metric-query-presets` | cluster path | `MetricQueryPresetListResponse`, 200 | query 없음 |
| APIQ-010 | `runMetricQueryPreset` | POST `.../metric-query-presets/{preset_id}/run` | body 없음 | `AgentDebugQueryResponse`, 200 | 202 아님 |
| APIQ-011 / APIQ-027 | telemetry submit | POST `/agent/debug/query` | `AgentDebugQueryRequest`; `query` 필수 | `AgentDebugQueryResponse`, 200 | 이 queue 행만 AGENT_* browser 예외 |
| APIQ-027 | `getCommandStatus` | GET `/commands/{command_id}` | path | `CommandStatusResponse`, 200 | poll/run은 client composition |
| APIQ-012 | `submitCommand` | POST `/commands` | `CommandRequest`; route상 `diff` 필요 | `AcceptedResponse`, 200 | command_id 없음 |
| APIQ-014 | `scaleDeployment` | POST `.../deployments/{deployment}/scale` | `DeploymentScaleRequest`; replicas 0..100 | `AcceptedResponse`, 200 | live mutation 제한 |
| APIQ-014 | `restartDeployment` | POST `.../deployments/{deployment}/restart` | body 객체 필수; 내부 필드 optional | `AcceptedResponse`, 200 | command_id 없음 |
| APIQ-013 | approval grant/reject | POST `/approvals/{approval_id}/{grant|reject}` | body absent/null/`{}` 허용; reason nullable | `AcceptedResponse`, 200 | 404/409 가능 |
| APIQ-006 | applications list | GET `/applications` | VP-010 canonical filter + `limit=100`(1..200) | `ApplicationProductListResponse`, 200 | strict card; 권한 밖 scope 404, label evidence 미지원 503 |
| APIQ-006 | application detail | GET `/applications/{application_id}` | path | `ApplicationProductDetailResponse`, 200 | strict overview/resource counts/endpoints/recent items |
| APIQ-006 | deployments | GET `/applications/{application_id}/deployments` | `limit=100`(1..500) | `ApplicationDeploymentHistoryResponse`, 200 | workflow run 기반 strict 배포 이력; binding 목록 아님 |
| APIQ-006 | drift | GET `/applications/{application_id}/drift` | path | `ApplicationDriftResponse`, 200 | semantic diff; 민감·복합 값 redacted |
| APIQ-006 | runs | GET `/applications/{application_id}/runs` | `limit=100`(1..500) | `WorkflowRunListResponse`, 200 | 운영·디버깅용 raw 호환 계약 |
| APIQ-015 | catalog list/detail | GET `/catalog/items[/{item_id}]` | item path만 | list/detail response, 200 | item JsonMap·pagination 없음 |
| APIQ-024 / APIQ-005 | RCA timeline | GET `/dashboard/rca/timeline` | `cluster_id?`, `limit=50`(1..100) | `RcaTimelineResponse`, 200 | teaser만 limit=6 |
| APIQ-016 | `getRcaIncident` | GET `/dashboard/rca/incidents/{incident_id}` | path, `cluster_id?` | `RcaIncidentResponse`, 200 | stable id 필요 |
| APIQ-017 | recovery lookup | GET `/rca/recovery-plans/by-correlation/{correlation_id}` | path | `RecoveryPlanStatusResponse`, 200 |  |
| APIQ-017 | recovery select | POST `/rca/recovery-plans/{plan_id}/actions/{action_id}/select` | body 필수, `{}` 허용, reason nullable | `AcceptedResponse`, 200 | 404/409 가능 |
| APIQ-018 | evidence | GET `/evidence` | correlation/kind/since/until/limit=50/offset=0/cursor | `EvidenceQueryResponse`, 200 | 실제 cursor 제공 |
| APIQ-018 | RCA reports | GET `/rca-reports` | evidence와 동일하나 kind 없음 | `RcaReportListResponse`, 200 | ISO/cursor 오류 422 |
| APIQ-019 | AI list/detail | GET `/ai/conversations[/{id}]` | path만 | list/detail response, 200 | pagination 없음·내부 JsonMap |
| APIQ-019 | AI create | POST `/ai/conversations` | message 필수; title/agent/context 선택 | `AiConversationAcceptedResponse`, 200 | 202 아님 |
| APIQ-019 | AI append | POST `/ai/conversations/{id}/messages` | message 필수; agent/context 선택 | accepted response, 200 | 자동 재전송 금지 |
| APIQ-020 | AI delete | DELETE `/ai/conversations/{id}` | path | empty, 204 | `apiRequestNoContent` |

### 10.1 Home usage 부분 실패 경계 (`APIQ-028`)

`getClusterSummary`의 workload·warning·incident를 살릴 수 있는데 usage 필드 하나가 없다는 이유로
응답 전체를 거부하면 안 된다. API 작업자는 다음 경계를 그대로 구현한다.

1. `clusterSummaryDetailSchema`와 workload·warning·incident schema는 계속 strict다.
2. `usage.pods_total`만 누락을 허용하고 결과를 `undefined`로 보존한다. `0`, `null`, 누락을 서로
   바꾸거나 `pods_running`으로 합계를 만들어 넣지 않는다.
3. 숫자가 존재하지만 음수·소수·문자열이면 기존처럼 `invalid-payload`다.
4. API test는 실제 `getClusterSummary`를 호출하는 fetch fixture에서 `pods_running=5`이고
   `pods_total`만 없는 200 응답을 사용한다. resolve 결과에 workload·warning·incident가 그대로
   남고 `usage.pods_total === undefined`임을 검증한다.
5. feature adapter의 별도 contract test가 이 결과를 받아 `usage=null`,
   `dataQualityWarnings=[{code:"usage-unavailable",section:"usage",...}]`로 강등하는 책임을 가진다.
6. 기존 완료 앵커 `94063b29d`는 이 부분 실패 계약의 근거가 아니다. 수정 코드와 API test가 포함된
   새 canonical branch ancestor hash를 `API 완성: getClusterSummary (<hash>)`로 기록한다.

## 11. 큐 밖 항목

- route가 없는 `BE-Gap-*`은 endpoint 함수로 만들지 않는다.
- repo/provider/target/org/alert/dead-letter는 현재 queue에 없으므로 workorder만 보고 선행 구현하지
  않는다.
- agent poll/result, webhook, install manifest는 browser endpoint가 아니다.
- `/api/live/browser` realtime은 HTTP 큐와 분리한다. `API 완성: connectRealtime (...)` exact
  앵커 전에는 소비하지 않는다.

## 12. 검증과 완료 체크리스트

함수군 완료 전 아래를 전부 확인한다.

- [ ] queue 행을 원격에서 claim했고 lease가 유효하다.
- [ ] exact route constant, router method, request/response model 근거를 test 주석에 남겼다.
- [ ] endpoint, schema, test, 해당 도메인 barrel export가 있다.
- [ ] D1–D8 중 해당 항목을 검증했다.
- [ ] AbortSignal과 path/query encoding을 검증했다.
- [ ] mutation은 한 번만 전송되며 receipt를 terminal success로 바꾸지 않는다.
- [ ] GET은 실제 세션으로 redacted 실응답 검증을 했다.
- [ ] mutation live 검증은 sandbox·승인 있을 때만 수행했다.
- [ ] `src/product/api/**`가 `features/**`, 화면, synthetic fixture를 import하지 않는다.
- [ ] `client.ts`, `url.ts`, backend 파일을 수정하지 않았다.
- [ ] targeted test·typecheck·lint 후 clean merged HEAD에서 `npm run check`가 통과했다.
- [ ] 커밋 A를 push하고 그 hash를 함수별 exact 완료 앵커로 EOF에 append했다.
- [ ] 모든 함수 앵커가 생긴 뒤 queue 행을 제거한 커밋 B를 push했다.

병렬 작업 때문에 전체 test가 timeout이면 즉시 timeout 값을 늘리지 않는다. 다른 test process가
끝난 뒤 한 번 재실행하고, 계속 실패하면 자신의 targeted 결과와 전체 실패 파일을 `blocked` 근거로
남긴다. 완료 앵커는 full gate가 통과하기 전 작성하지 않는다.
