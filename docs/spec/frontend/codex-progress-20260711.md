---
title: Codex 24시간 실행 진행 기록
status: active
date: 2026-07-11
directive: codex-directive-reference-pivot-20260711.md
---

# Codex 24시간 실행 진행 기록

이 문서는 블록별 검증 사실을 시간 순서대로 추가한다. 통과하지 않은 게이트는 완료로
표시하지 않으며, synthetic 데이터나 인증 우회로 완료 판정을 만들지 않는다.

## 2026-07-11 Block A — 구현 완료, 인증 게이트 대기

### 적용

- 구현 커밋: `c4e23919d858ad688e3230f07674bf1af6a00b91`
- 원격 브랜치: `origin/woonyong/ui-layer-lab`
- `/api` Vite proxy에 `cookieDomainRewrite: ""`, `changeOrigin`, `ws` 적용
- `react-router-dom` 기반 `ProductRouter`·`ProductShell`과 frontend release registry 적용
- 세션 게이트와 Fleet/metrics 페이지별 데이터 로딩 분리
- `GET /api/clusters/{id}/usage?limit=` 30초 갱신 경로 적용
- `WS /api/live/browser` strict `realtime.v1` 검증, hello+snapshot handshake, bounded reconnect 적용
- `POST /api/agent/debug/query` receipt 이후 `GET /api/commands/{id}` 3초 폴링·60초 timeout 적용
- 노드 CPU/메모리/파일시스템, 팟 재시작률, 네임스페이스 팟 수, sandbox replica 프리셋 6종 적용
- 동일 프리셋 재실행은 실행별 정식 query name으로 구분하고 POST 자동 재시도 금지
- command가 `completed`여도 normalized point가 0이면 성공 표시 금지

### 검증

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 4 files, 21 tests PASS
  - product design guard: 41 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: reference catalogue의 500kB 초과 chunk 경고는 Block F 최적화 대상으로 유지
```

```text
명령: VITE_BACKEND_ORIGIN=https://k8s.woonyong.org npm run dev -- --host 127.0.0.1 --port 5180
명령: curl http://127.0.0.1:5180/api/healthz
결과: HTTP 200, {"status":"ok","service":"api-gateway"}

명령: curl http://127.0.0.1:5180/api/auth/session
결과: HTTP 401, {"detail":"authentication required"}

명령: curl http://127.0.0.1:5180/api/clusters
결과: HTTP 401, {"detail":"authentication required"}
```

```text
브라우저 QA: /metrics, 1440x900 및 390x844
결과: 문서 title=KubeHeal, 가로 overflow 0, main landmark 1, 첫 Tab=email input
네트워크: 실패 요청 0, 인증 전 /api/auth/session의 예상된 HTTP 401만 존재
```

### 게이트 판정

| 게이트 | 결과 | 근거 |
|---|---|---|
| `npm run check` | 통과 | 위 검증 결과 |
| proxy 경유 `/api/auth/session` 200 | **대기** | 실제 gateway 도달, 인증 쿠키가 없어 401 |
| proxy 경유 `/api/clusters` 실 데이터 | **대기** | 실제 gateway 도달, 인증 쿠키가 없어 401 |

Block A는 코드 구현과 비인증 경로 검증까지 완료됐지만, 지시서의 두 인증 게이트가 남아
있으므로 완료로 판정하지 않는다. 인증 우회, fixture, synthetic fallback은 추가하지 않는다.
인증된 브라우저 세션에서 두 응답을 재검증한 뒤 Block A 완료와 Block B 착수를 기록한다.

### 확인된 백엔드 계약 위험과 프론트 처리

- command id가 query hash 기반이고 중복 insert가 무시되므로 동일 query 객체는 과거 결과를
  반환할 수 있다. 프론트는 실행별 query name을 만들며, receipt를 받지 못한 POST를 자동
  재전송하지 않는다.
- Prometheus provider 오류가 `completed + empty results`로 수렴할 수 있다. 프론트는 실제
  series point가 하나 이상일 때만 성공으로 판정한다.
- realtime seq는 hub 전역 번호라 subscription에서 gap이 정상 발생한다. 프론트는 역행·중복만
  폐기하고 snapshot을 재동기화 기준으로 사용한다.

### 2026-07-11 Block A 사후 강화

- 보강 커밋: `9babc493a7557e3b17a2802603897788d7b3b775`
- 클러스터 선택 변경 직후 이전 cluster의 usage/live 값이 남지 않도록 상태 scope를 격리했다.
- snapshot open map과 command raw result를 제품 상태에서 제거하고, 검증된 시계열 point와
  command summary만 유지했다.
- `npm run check` 재실행 결과: 4 files, 22 tests, design guard 41 files, UI catalog audit,
  production build 모두 통과했다.
- 인증 게이트 판정은 변함없이 401 대기이며 Block B는 시작하지 않았다.

## 2026-07-11 P0 — 철회 문서 제거와 포팅 계약 이관 완료

### 적용

- 정리 커밋: `f79b39036a7a9608f437df4aaa0b39c026434982`
- 원격 브랜치: `origin/woonyong/ui-layer-lab`
- 철회된 중앙 뷰 전용 계약, 과거 계획 보고서·지시서, 자체 디자인 계약을 삭제했다.
- D1~D5, entity identity, strict Zod, request generation, partial/last-valid, cluster URL,
  실제 API 전용 경계를 `reference-porting-contract.md`로 이관했다.
- 자체 시각 token 문서는 외부 기준 저장소와 벤치마크 최소선, 접근성 계약만 연결하는
  최소 bridge로 축소했다.
- `product-data-contract.md`의 presentation 전용 문구를 provider-neutral 데이터 계약으로 바꿨다.
- `topology-engine.md`는 명시된 freeze에 따라 수정하지 않았다.

### 검증

```text
명령: git diff --cached --check
결과: PASS

명령: 철회 키워드와 삭제 문서 참조 rg 검색
결과: 피벗 지시, 장기 헌법, 장기 검토 프로토콜을 제외하고 0건

명령: git diff -- docs/spec/frontend/topology-engine.md
결과: 출력 0건
```

### 장기 헌법 보존 판정

`topology-engine.md`에는 identity, canonical relation, capability, event ordering, API-only 경계,
stale/partial/RBAC, LOD, 보안, 검증처럼 뷰와 무관한 장기 규칙이 많아 이번 단계에서는 전체를
보존했다. 전용 presentation, layout, motion, test, DoD 절은 P1·P2 구현 근거로 사용하지 않는다.
후속 검토에서 뷰 중립 core를 먼저 추출한 뒤 전용 절을 분리하는 것이 안전하다는 판정이다.

## 2026-07-11 P1 — 외부 기준 저장소 기능 전수표 완료

### 적용

- P1 최종 보강 커밋: `69ae6e1ccd30ea9d60bd9fb9d42d4d0e1da8b912`
- 문서 위생·API 병렬 조율 커밋: `8bc45894f8516b144d12cf16999b4cd8263ed94c`
- 원격 브랜치: `origin/woonyong/ui-layer-lab`
- 실행 인스턴스 `http://127.0.0.1:9280`의 `mgmt`, `cluster-1` context를 browser에서
  관찰하고 동일 버전 source tag `v1.8.1`, commit
  `3ff2b1095151c690bf536e8e6ca685c2703fcd70`과 대조했다.
- primary/contextual route, 전역 shell, URL/deep-link, drawer/detail, keyboard, filter,
  polling, SSE/WebSocket, capability/RBAC 동작을 `reference-feature-inventory.md`에 기록했다.
- standalone browser 소비 API를 7.2~7.11의 **136 mapping unit**으로 고정했다. P2는 같은
  단위·순서로 `P1 136 = P2 136`을 증명해야 한다.
- server 등록 경로 중 standalone browser가 소비하지 않는 endpoint는 7.12로 분리했다.
- 원형 계약의 Traffic no-permission response shape 불일치, metrics 공통 freshness 부재,
  Timeline/SSE resume cursor 부재, Helm/log stream resume·idempotency 부재, GitOps operation
  receipt 부재를 숨기지 않고 기록했다.
- RCA는 Home/Issues/resource/workload/GitOps/Timeline의 논리 삽입 후보만 기록했으며 구현하지 않았다.
- `api-needs.md`를 병렬 API 작업자와의 단일 요청 큐로 만들었다. P1 단계에서는 우리 backend
  매핑을 하지 않았으므로 요청 행을 만들지 않았다.

### 검증

```text
명령: awk로 reference-feature-inventory.md §7.2~§7.11의 Markdown body row 재계수
결과: PASS — 136행

명령: git diff --check / git diff --cached --check
결과: PASS

명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 4 files, 22 tests PASS
  - product design guard: 41 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 기존 성능 과제로 유지
```

### 런타임 조사 안전 사고

- read-only 조사를 맡긴 browser 작업자가 Workload의 confirmation 존재 여부를 확인하려다
  `target/cluster-agent`의 Restart를 1회 실행했다. 실행판은 confirmation 없이 즉시
  `POST /api/workloads/deployments/target/cluster-agent/restart`를 전송했다.
- 사고 직후 모든 runtime mutation을 중단했고 추가 변경은 실행하지 않았다.
- GET-only 사후 확인에서 Deployment generation/observedGeneration은 `45/45`, revision은 `41`,
  replicas/updated/ready/available은 모두 `1`이었다. 새 Pod
  `cluster-agent-6549f6845b-swh4n`은 `Running`, `Ready=True`, restart count `0`으로 정상 수렴했다.
- 후속 reference runtime 조사는 GET, DOM, source 확인만 허용한다. mutation interaction은 source
  call-chain과 capability 상태로만 검증한다.

### 게이트 판정

| 게이트 | 결과 | 근거 |
|---|---|---|
| P1 route·screen·interaction 전수 | 통과 | inventory §2~§5 |
| refresh·realtime 전수 | 통과 | inventory §6, §7.5, §7.8, §7.11 |
| browser 소비 API 전수 | 통과 | inventory 136 mapping unit |
| runtime/source 이중 근거 구분 | 통과 | `runtime+source`, `source-confirmed`, `runtime-gated` 판정 |
| 제품 코드·RCA 구현 미착수 | 통과 | P1 commit은 docs-only |
| synthetic·fixture 유입 | 통과 | 제품 파일 변경 없음 |

P1을 완료로 판정한다. 다음 단계는 136개 mapping unit 전부를 우리 `routes.py` 근거와 대조하는
P2 `reference-contract-map.md`이며, 필요한 API 함수는 직접 만들지 않고 `api-needs.md`에 요청한다.

## 2026-07-11 P2 — 제품 계약·컴포넌트·RCA 매핑 완료

### 적용

- P2 정본·API 요청 큐 커밋: `6cf6073de`
- 원격 브랜치: `origin/woonyong/ui-layer-lab`
- `REF-API-001`~`REF-API-136`을 P1과 동일한 순서·단위로 매핑했다.
- 판정은 `직결 0 / 어댑터 34 / BE-Gap 102 / 미정 0`이다. provider-neutral backend
  projection과 endpoint 결합이 필요하므로 reference endpoint를 변환 없이 쓰는 직결은 없다.
- `BE-Gap-001`~`BE-Gap-102`를 연속 stable ID로 고정하고 domain별 노출 정책을 대장에 기록했다.
- generic command의 `AcceptedResponse`에 `command_id`가 없어 terminal status를 연결하지 못하는
  문제는 `Cross-Gap-001`로 별도 기록했다. receipt를 성공으로 해석하거나 optimistic 완료를
  표시하지 않는다.
- UI 요소 73개와 RCA 전용 삽입 UI 10개를 제품 소유 primitive·composite에 매핑했다. graph,
  editor/diff, logs/terminal, virtualization만 외부 dependency 최종 결정 대상으로 분리했다.
- RCA 데이터 삽입점 5개는 `직결 4 / 어댑터 1 / gap 0`으로 확정했다.
- `api-needs.md`에 신규 endpoint 함수·schema 18개 함수군과 기존 구현 검증·승인 7개 함수군,
  합계 25개 요청 행을 등록했다. route 자체가 없는 Backend gap은 queue에 넣지 않았다.
- `reference-porting-contract.md`와 `product-data-contract.md`에 남아 있던 archived 문서 정본 참조를
  goalmode와 active porting contract로 교정했다. 이 progress의 과거 절에 남은 문서명은 당시 작업
  사실을 보존하는 append-only 역사 기록이며 현재 구현 근거로 사용하지 않는다.
- 이 시점의 `API 완성:` 기록은 0개다. 따라서 API 작업자가 progress에 완료를 기록하기 전에는
  기존 함수를 포함한 어떤 endpoint 함수도 새 제품 화면에서 소비하지 않는다.
- Codex는 `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았다.

### 검증

```text
명령: REF-API ID를 추출해 seq 001..136과 comm 비교
결과: PASS — 누락 0, 초과 0, 중복 0

명령: API 행 판정 집계
결과: PASS — 직결 0, 어댑터 34, BE-Gap 102, 합계 136

명령: API 행에서 BE-Gap ID를 추출해 seq 001..102와 comm 비교
결과: PASS — 누락 0, 초과 0, 중복 0

명령: Markdown API·queue 표 열 수 검사
결과: PASS — REF 136행과 queue 25행 모두 규정 열 수 일치

명령: git diff --check
결과: PASS
```

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 4 files, 22 tests PASS
  - product design guard: 41 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 기존 성능 과제로 유지
```

### 게이트 판정

| 게이트 | 결과 | 근거 |
|---|---|---|
| `P1 136 = P2 136` | 통과 | 연속성·유일성 기계 검증 |
| 판정 미정 0개 | 통과 | 34 adapter + 102 Backend gap |
| 컴포넌트 전수 매핑 | 통과 | UI 73개 + RCA UI 10개 |
| RCA 5개 삽입점 | 통과 | data route·response·polling·노출 규칙 |
| §6b API 소유 경계 | 통과 | API 코드 수정 0, queue 25행 |
| 전체 제품 check | 통과 | 위 `npm run check` 결과 |

P2를 완료로 판정한다. 다음 단계는 `final-questions.md`에 남은 결정 요청을 정확히 한 번에 모아
커밋하는 최종 질문 라운드다. 그 이후 새 모호함은 goalmode 기본 결정 규칙으로 자체 해소한다.

## 2026-07-11 최종 질문 라운드 발행

- 발행·활성 계약 정리 커밋: `8c88e9c31`
- 질문 정본: `final-questions.md`
- 발행 시각: `2026-07-11 16:29 KST`
- 기본 결정 적용 시각: `2026-07-12 16:29 KST`
- 결정 요청은 graph layout stack, virtualization, editor·terminal 설치 시점, 외부 reference 코드
  이식 범위 네 가지다. 이미 확정된 IA·API 경계·Backend gap은 다시 질문하지 않았다.
- API 작업자의 완료 기록은 export 함수 하나당 `API 완성:` 한 줄로 고정했다. 같은 queue 행에
  묶인 함수는 모든 export의 완료 기록과 contract test를 확인한 뒤에만 queue에서 제거한다.
- 발행 전 `npm run check` 결과는 TypeScript·ESLint·Vitest 4 files/22 tests·design guard 41 files·
  catalog audit 482 previews·production build 모두 PASS다.
- 검토자가 일부 항목만 답하면 나머지는 문서의 권고안으로 확정한다. 기본 결정 시각까지 답변이
  없으면 네 권고안을 모두 적용하고 이후 질문 라운드는 만들지 않는다.

## 2026-07-11 API 완료 게이트 제품 셸 구현

- 구현 커밋: `93e344f2c`
- `ProductApp`은 인증·fleet·metrics demo surface를 직접 마운트하지 않고 `createApiComposition()`만
  production composition root로 사용한다.
- `apiComposition.ts`는 progress의 `API 완성:` 기록이 없는 동안 surface 등록을 0개로 유지한다.
  이 상태에서는 제품 화면이 서버 endpoint를 import하거나 요청하지 않고 release gate 화면만
  렌더한다.
- `ProductShell`은 등록된 capability만 navigation에 노출한다. `traffic`, `helm`, `checks`,
  `cost`, `settings`처럼 route 없는 Backend gap surface는 primary route catalog에 넣지 않았다.
- 제품 소유 primitive는 `src/product/shared/ui/primitives/**`로 분리했고, catalog runtime import를
  제품 entry에서 제거했다. 원천·라이선스 고지는 `references/ui-layer-lab/THIRD_PARTY_NOTICES.md`에
  남겼다.
- API boundary test는 제품 코드의 endpoint import가 `app/apiComposition.ts`에만 존재하도록 검사하고,
  composition root가 import한 endpoint 함수가 `API 완성: <함수명> (<hash>)` 기록에 없으면 실패한다.

### 검증

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 6 files, 30 tests PASS
  - product design guard: 40 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 기존 성능 과제로 유지
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```

## 2026-07-11 제품 오류 경계와 안전 복구 보강

- 구현 커밋: `3d3c2cb94`
- 후속 정리 커밋: `f9586d0b6`
- `ProductApp`은 `ProductErrorBoundary`로 runtime을 감싸고, composition initialization failure를
  raw stack 없이 `ProductStateScreen kind="error"`로 표시한다. 실패 검증은 public prop을 열지 않고
  private composition module mock으로 분리했다.
- retry는 사용자 클릭으로만 child runtime을 remount한다. persistent crash는 focus, online,
  offline, visibilitychange, timer 진행에도 자동 retry loop나 fetch, XMLHttpRequest, sendBeacon,
  EventSource, 제품 WebSocket 호출을 만들지 않는다.
- composition은 `useState(createApiComposition)` lazy initializer로 mounted runtime 안에 고정된다.
  명시 retry 후에만 새 runtime을 생성한다.
- 이 변경은 새 endpoint 완료가 아니며 `API 완성:` 0행과 network-silent release gate 계약을 유지한다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 15 files, 72 tests PASS
  - product design guard: 61 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 42.69 kB (gzip 8.49 kB)
  - ProductApp JS: 68.82 kB (gzip 23.84 kB)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```

### 게이트 판정

| 게이트 | 결과 | 근거 |
|---|---|---|
| `API 완성:` 0개일 때 API 소비 0개 | 통과 | `createApiComposition([])` + `apiBoundary.test.ts` |
| Backend gap surface 미노출 | 통과 | route catalog test |
| 제품 primitive 소유 경계 | 통과 | 제품 entry의 catalog runtime import 제거 |
| 전체 제품 check | 통과 | 위 `npm run check` 결과 |

이 구현은 새 endpoint 완료를 의미하지 않는다. API 작업자가 progress에 export 함수별
`API 완성:` 기록과 contract test 근거를 남길 때까지 새 제품 surface는 등록하지 않는다.

### 2026-07-11 API 완료 게이트 사후 강화

- 보강 커밋: `5cfa5bbd9`
- `ProductShell`은 현재 URL이 catalog에는 있어도 등록되지 않은 capability이면 그 route label을
  header에 노출하지 않고, 등록된 첫 navigation capability를 현재 route로 표시한다.
- 등록 surface가 없는 상태는 `ProductRouter`의 release gate가 처리한다. `ProductShell` 자체는
  최소 1개 released capability를 요구하도록 fail-fast를 유지한다.
- API boundary test는 static import/export뿐 아니라 dynamic `import()`와 `require()`가
  `src/product/api/**`를 가리키는 경우도 검출한다. composition root도 정적 named import만 허용한다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 6 files, 31 tests PASS
  - product design guard: 40 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 기존 성능 과제로 유지
```

## 2026-07-11 surface release와 transport guard 강화

- 보강 커밋: `d5cf111c0`
- route 등록 단어를 target runtime capability와 분리해 `ProductSurfaceId`, `releasedSurfaceIds`로
  고정했다. API 완료 여부는 screen release 여부를 결정하고, cluster별 permission/capability는
  release된 screen 내부 control 노출만 결정한다.
- `ProductShell`은 390px에서도 collapsed sidebar를 다시 펼칠 수 있고, toggle label을 현재 상태에서
  실행할 동작에 맞춰 제공한다.
- `apiBoundary.test.ts`는 alias·re-export·dynamic import·product 외부 bridge를 차단한다. 또한
  `API 완성:` hash가 실제 조상 커밋인지, 해당 API barrel의 named export인지, 같은 커밋에서 변경된
  contract test가 endpoint identifier를 검증하는지 확인한다.
- `product-design-guard.mjs`는 제품 API 폴더 밖의 direct `fetch`, `WebSocket`, `EventSource`,
  `XMLHttpRequest`, `navigator.sendBeacon`, global alias, computed member, `Reflect.get` 우회를
  차단한다. `.mts`·`.cts`도 같은 검사를 받으며 일반 객체의 동명 method는 허용한다.
- approval action 큐에 `grantApproval`, `rejectApproval`을 추가했고, Issues 목록은 별도
  `listRcaIncidents` 대신 범용 `listRcaTimeline`을 재사용하도록 모순을 제거했다. 요청 큐는
  `requested` 26행, `API 완성:` 기록은 여전히 0행이다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 7 files, 35 tests PASS
  - product design guard: 40 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 31.43 kB (gzip 6.54 kB)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

브라우저: production preview /product, /product/topology
결과: 1440 light·390 dark 모두 HTTP 200, API request 0, product WebSocket 0,
      console error 0, page error 0, horizontal overflow 0, main landmark 1
설정: prefers-reduced-motion=reduce
스크린샷:
  - /Users/woonyong/capture/kubeheal-release-gate-1440-light.png
  - /Users/woonyong/capture/kubeheal-release-gate-1440-dark.png
  - /Users/woonyong/capture/kubeheal-release-gate-768-light.png
  - /Users/woonyong/capture/kubeheal-release-gate-390-dark.png
```

이 보강도 새 endpoint 완료를 의미하지 않는다. API 작업자가 함수별 완료 증거를 남길 때까지
`app/apiComposition.ts`는 surface 0개를 유지하고 제품은 network-silent release gate만 렌더한다.

## 2026-07-11 shortcut help와 product primitive 보강

- 구현 커밋: `3032218cd`
- `ProductShell`에 released surface 기준 shortcut registry를 연결했다. route chord는 release된
  screen만 대상으로 생성하고, `?`는 shortcut help, `t`는 theme 전환으로 고정했다.
- shortcut matcher는 editable control focus, modifier key, IME composing, repeat, blur,
  visibility hidden, invalid chord suffix를 명시적으로 처리한다. dialog가 열려 있을 때는 `?`
  외 shortcut을 실행하지 않는다.
- `ShortcutHelpDialog`는 현재 활성 shortcut만 table로 표시한다. product-owned `Dialog`, `Kbd`,
  `Table`, `Toggle` primitive와 `useProductTheme` controller를 추가했고 원천 고지는
  `references/ui-layer-lab/THIRD_PARTY_NOTICES.md`에 남겼다.
- `ThemeToggle`은 product theme controller를 받아 aria pressed 상태와 `aria-keyshortcuts="t"`를
  제공한다.
- 이 변경은 새 endpoint 완료를 의미하지 않는다. `API 완성:` 기록은 여전히 0행이며
  `app/apiComposition.ts`는 surface 0개를 유지한다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 10 files, 52 tests PASS
  - product design guard: 51 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```

### shortcut 접근성·시각 게이트 후속 보강

- 보강 커밋: `636b6819b`
- 벤치마크가 multi-key timeout의 존재만 규정하고 수치를 제공하지 않아 1,000ms를 자체결정으로
  확정했다. `g` prefix 뒤 1,000ms가 지나거나 Escape·blur·hidden·IME·modifier·editable event가
  끼면 pending sequence를 폐기한다. 잘못된 suffix는 단독 shortcut으로 재해석하지 않는다.
- `ShortcutHelpDialog`는 시각적 `Kbd`와 별도로 `g 다음 i` 형식의 screen-reader text를 제공한다.
  Dialog를 route shortcut으로 연 뒤 닫아도 기존 `#product-main` focus를 Base UI 계약으로 복원한다.
- 사용자 확정값에 따라 theme은 light/dark 두 모드만 유지한다. 저장값이 없으면 light이며 system을
  제3의 선택지 또는 초기 mode로 등록하지 않는다.
- 기존 visual gate의 mock API·가짜 user/cluster 응답을 제거했다. 현재 승인된 endpoint가 0개인
  production composition은 network-silent release gate만 렌더하고, 제품 `/api/**` HTTP 요청과
  WebSocket을 모두 0건으로 검증한다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, progress의 `API 완성:` 0행이다. 이 보강은
  `src/product/api/**`를 수정하지 않았고 새 API 요구도 만들지 않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 10 files, 52 tests PASS
  - product design guard: 51 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 39.21 kB (gzip 7.71 kB)
  - ProductApp JS: 61.96 kB (gzip 21.88 kB)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — desktop light + mobile dark, API request 0, product WebSocket 0,
      console/page error 0, horizontal overflow 0, main landmark 1
설정: prefers-reduced-motion=reduce
스크린샷:
  - references/ui-layer-lab/output/playwright/product-release-desktop-light.png
  - references/ui-layer-lab/output/playwright/product-release-mobile-dark.png
```

## 2026-07-11 visual gate 소유권과 대비 검증 보강

- 구현 커밋: `e4c17efcd`
- visual gate는 고정 port 대신 실행 시점에 빈 port를 찾고, `VITE_VISUAL_GATE_NONCE`를 harness
  HTML meta에 주입한 뒤 해당 nonce가 보이는 서버만 owned server로 인정한다. dev server가 nonce
  확인 전에 종료되거나 다른 프로세스가 응답하면 실패한다.
- visual scenario 실행 중에도 dev server 생존 상태를 확인한다. gate가 끝날 때 이미 종료된
  서버에는 추가 SIGTERM을 보내지 않는다.
- reflow exemption은 빈 값으로 둘 수 없고, horizontal scroll owner이면서 keyboard reachable한
  요소에만 허용한다. 그렇지 않은 `data-reflow-exempt`는 visual gate 실패로 처리한다.
- forced-colors 검증은 단순 색상 불일치 대신 relative luminance contrast ratio를 계산한다.
  heading·selection은 4.5:1, border·focus outline·disabled text·status marker는 3:1 이상이어야
  한다. 반투명 색은 opaque underlay와 blend해 계산한다.
- 이 변경은 새 endpoint 완료를 의미하지 않는다. product visual gate는 API request와 product
  WebSocket 0건을 유지한다.

```text
명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent

명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 12 files, 66 tests PASS
  - product design guard: 57 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```

## 2026-07-11 display primitive 의미 계약 보강

- 구현 커밋: `ea936acb1`
- `Surface`는 기본 `section`·`aside` surface에 accessible name을 요구한다. layout-only surface는
  명시적으로 `as="div"`를 써야 하며 이 경우 region role을 만들지 않는다.
- `Metric`은 `null`을 unavailable 상태로 다루고 실제 숫자 `0`과 분리한다. 단위와 note는
  description list 안의 별도 `dd`로 유지해 값·단위·보조 설명의 의미를 섞지 않는다.
- `StatusMark`는 모든 tone에 기본 텍스트 fallback을 제공하고, live announcement는 `live` prop을
  명시한 경우에만 `role="status"`와 polite live region을 만든다. 상태 점은 decorative로 숨기고
  forced-colors에서 currentColor border로 남는다.
- 타입 계약 테스트는 이름 없는 semantic surface, `undefined` metric value, provider-specific
  free-form status tone을 거부한다.
- 이 변경은 새 endpoint 완료를 의미하지 않는다. `API 완성:` 기록은 0행이며 product API 소비
  경계와 network-silent release gate 계약은 유지한다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 12 files, 65 tests PASS
  - product design guard: 57 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```

## 2026-07-11 상태 화면 primitive 접근성 보강

- 구현 커밋: `1c821b640`
- `ProductStateScreen`은 `loading`, `empty`, `forbidden`, `offline`, `error`, `release` 상태를
  discriminated union으로 받는다. loading·empty는 retry와 issue를 받지 않고, hard error와
  offline·forbidden 상태만 safe presentation issue를 노출한다.
- root 배치는 `main#product-main`을 유지하고, content 배치는 중첩 main을 만들지 않도록 named
  `section`을 쓴다. content 배치의 제목은 `h2`, root 배치의 제목은 `h1`이다.
- `Alert`, `Empty`, `Skeleton`, `Spinner` primitive를 product-owned surface에 추가했다. alert는
  role override를 허용하고, empty description은 paragraph semantics를 유지하며, skeleton은 항상
  decorative hidden이고 reduced motion에서 animation을 끈다. spinner는 기본 status label을
  `로딩 중`으로 제공하고 decorative mode에서는 role을 제거한다.
- retry button은 pending 상태에서 disabled와 `aria-busy`를 함께 제공한다.
- 이 변경은 새 endpoint 완료를 의미하지 않는다. `API 완성:` 기록은 0행이며 product API 소비
  경계와 network-silent release gate 계약은 유지한다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 11 files, 60 tests PASS
  - product design guard: 56 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```

### 상태 계약·무네트워크 경계 최종 보강

- 상태 계약 커밋: `54ce56480`
- 경계 후속 커밋: `15019d495`
- 401 `unauthorized`는 세션 게이트만 담당하고, `ProductStateScreen`의 권한 부족 상태는 403
  `forbidden`만 허용하도록 타입을 닫았다. 원시 `Error`와 401을 presentation state에 넣는 코드는
  TypeScript 계약 테스트에서 거부한다.
- retry label은 공백 문자열도 `다시 시도`로 정규화한다. pending 상태는 disabled와 `aria-busy`를
  함께 노출하고, 같은 pending cycle의 빠른 이중 호출은 한 번만 실행한다. 부모가 pending으로
  전환하지 않은 요청은 다음 task에서 invocation guard를 해제해 후속 재시도를 막지 않는다.
- 전역 부팅 skeleton을 기본값으로 유지하면서 feature가 실제 화면 기하를 보존하는
  `loadingPreview`를 loading 상태에만 전달할 수 있게 했다. preview wrapper가 `aria-hidden`과
  `inert`를 강제해 호출자가 interactive node를 넘겨도 보조 기술과 포커스 순서에 노출하지 않는다.
- 제품 셸 route 제목을 `h1`, content state 제목을 `h2`로 고정했다. 긴 safe detail은 임의 문자열을
  추정·변환하지 않고 줄바꿈하여 모바일 수평 overflow를 막는다.
- 승인 API가 0개인 release gate에서 transport spy를 설치한 뒤 제품 모듈을 다시 import한다.
  이후 keydown, focus, online, offline, visibilitychange를 발생시키고 5분을 진행해도 fetch,
  XMLHttpRequest, sendBeacon, EventSource, 제품 WebSocket 호출이 모두 0건임을 검증한다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, progress의 유효한 `API 완성:` 앵커 0개다.
  이 보강은 `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았고 새 endpoint 요구도
  만들지 않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 11 files, 62 tests PASS
  - product design guard: 56 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 42.13 kB (gzip 8.36 kB)
  - ProductApp JS: 67.77 kB (gzip 23.48 kB)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — desktop light + mobile dark, API request 0, product WebSocket 0,
      console/page error 0, horizontal overflow 0, main landmark 1
설정: prefers-reduced-motion=reduce
스크린샷:
  - references/ui-layer-lab/output/playwright/product-release-desktop-light.png
  - references/ui-layer-lab/output/playwright/product-release-mobile-dark.png
```

## 2026-07-11 시각 게이트 경계 최종 보강

- 최종 보강 커밋: `a5d32e78c`
- visual gate가 띄운 npm·Vite 프로세스는 임의 port와 실행별 nonce로 소유권을 증명한다. POSIX에서는
  detached process group 전체에 TERM을 보내고 제한 시간 뒤 KILL로 수렴한다. Windows에서는
  `taskkill /PID /T` 뒤 `/F` fallback을 사용한다. 두 경로 모두 npm child exit와 nonce 응답 중단을
  함께 확인하므로 stale server를 통과시키거나 Vite child를 남기지 않는다.
- reflow exemption은 이유가 있는 horizontal scroll owner에만 허용한다. accessible name, non-negative
  tab index, 실제 `focus()` 뒤 `activeElement`, disabled·aria-disabled·hidden·aria-hidden·inert 여부를
  모두 검사하므로 속성만 붙여 320px 검증을 우회할 수 없다.
- forced-colors 대비는 조상 순서로 반투명 background를 합성한 뒤 heading·selection 4.5:1,
  border·focus outline·disabled text·status marker 3:1을 검증한다. 대상 또는 조상에 group opacity가
  있으면 부정확한 근사 계산을 하지 않고 gate를 실패시킨다. disabled product button은 forced-colors에서
  `opacity: 1`, `GrayText` text·border로 보정한다.
- 7개 declarative scenario는 release desktop light, release mobile dark, release 320px,
  release text 200%, state 320px, state text 200%, state forced-colors다. 실제 product primitive를 쓰는
  test-only harness는 production route·composition·dependency graph 밖에 있다.
- 첫 320px state 검증은 retry action의 문서 폭 126px 초과를 실제로 탐지했고, action을 wrap 가능한
  높이와 `overflow-wrap:anywhere`로 수정한 뒤 통과했다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, progress의 유효한 완료 앵커 0개다. 이번
  보강도 `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았고 새 endpoint 요구를 만들지
  않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 12 files, 66 tests PASS
  - product design guard: 57 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 42.67 kB (42,670 bytes)
  - ProductApp JS: 67.86 kB (67,856 bytes)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent
검증: API request 0, product WebSocket 0, console/page error 0,
      required selector 존재, horizontal overflow 0, main landmark 1
스크린샷:
  - references/ui-layer-lab/output/playwright/product-release-desktop-light.png
  - references/ui-layer-lab/output/playwright/product-release-mobile-dark.png
  - references/ui-layer-lab/output/playwright/product-state-reflow-320-light.png
  - references/ui-layer-lab/output/playwright/product-state-text-resize-200-light.png
  - references/ui-layer-lab/output/playwright/product-state-forced-colors.png
```

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 passed

명령: make manifest-check
결과: PASS — management manifest objects 56, target manifest objects 18
```
