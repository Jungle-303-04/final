---
title: Codex 24시간 실행 진행 기록
status: active
date: 2026-07-11
directive: codex-directive-goalmode-20260711.md
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

## 2026-07-11 카드·진행률 primitive 계약 보강

- 구현 커밋: `3aca551c8`
- 제품 소유 `Card` primitive는 title·description을 중립 `div` wrapper로 유지한다. 실제 heading
  hierarchy와 paragraph semantics는 호출 화면이 소유하며, slot marker와 size marker는 component가
  고정한다.
- 제품 소유 `Progress` primitive는 접근 가능한 이름을 필수로 요구하고, 0–100 범위를 벗어나거나
  finite가 아닌 determinate value를 거부한다. `null` value는 numeric `aria-valuenow` 없이
  불확정 상태 문구로 표현한다.
- `aria-hidden`, custom min/max, raw HTML replacement, accessible name 중복은 타입 계약에서
  거부한다. `aria-hidden`은 JSX ARIA 경로로 다시 열리지 않도록 explicit `never`로 닫았다.
- visual harness와 gate는 complete progress, indeterminate progress, progress track, indicator를
  required selector와 forced-colors 검사에 포함한다. 첫 점검에서 track border 때문에 complete
  indicator가 track보다 2px 짧아지는 조건을 잡았고, track border를 제거해 complete ratio 1.0,
  indeterminate ratio 약 1/3, dashed border, reduced-motion animation none 조건으로 수렴했다.
- 이 변경은 product UI primitive와 visual gate 계약 보강이며 새 endpoint 완료가 아니다. §6b 조율
  상태는 `api-needs.md`의 `requested` 26행, 유효한 완료 앵커 0개다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 17 files, 87 tests PASS
  - product design guard: 65 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 45.77 kB (gzip 9.07 kB)
  - ProductApp JS: 68.82 kB (gzip 23.84 kB)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent
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

## 2026-07-11 제품 오류 경계 최종 계약 정정

- 최초 구현 커밋: `3d3c2cb94`
- composition 우회 제거 커밋: `f9586d0b6`
- 위의 선행 기록 중 “mounted runtime당 initializer 한 번”은 React `StrictMode` 계약이 아니다.
  이 정정 기록이 해당 문장보다 우선한다.
- `ProductApp`은 `ProductErrorBoundary` 바깥에 공개 composition 주입점을 두지 않는다. private
  `ProductRuntime`이 경계 내부에서 `useState(createApiComposition)`으로 초기화하므로 동기
  composition 오류도 raw message·stack 없이 `ProductStateScreen kind="error"`로 수렴한다.
- 실패 주입은 별도 테스트 파일의 module mock에만 존재한다. production export·route·composition에는
  테스트 factory나 미승인 surface 우회점이 없다.
- retry는 사용자 클릭 때만 keyed child runtime을 remount한다. fallback 진입과 복구 후 모두
  `#product-main`으로 focus를 복원하며 persistent crash는 같은 안전 fallback으로 다시 수렴한다.
- 실제 entry와 같은 React `StrictMode`에서 initializer의 정확한 호출 횟수를 가정하지 않는다.
  initialization은 side effect와 network가 없는 composition 계산만 수행하고, 테스트는 retry 전후의
  terminal UI와 새로운 시도만 검증한다.
- focus, online, offline, visibilitychange와 5분 timer 진행에도 자동 retry나 fetch,
  XMLHttpRequest, sendBeacon, EventSource, 제품 WebSocket 호출은 0건이다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, 유효한 완료 앵커 0개다. 이번 변경은
  `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았으며 production surface는 0개다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 15 files, 72 tests PASS
  - product design guard: 61 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 42.69 kB (42,694 bytes)
  - ProductApp JS: 68.82 kB (68,819 bytes)
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

## 2026-07-11 카드·진행률 primitive 최종 계약 정정

- 최초 구현 커밋: `3aca551c8`
- 런타임·강제색 보강 커밋: `d8de5f3c4`
- 위의 선행 기록 중 “track border를 제거해 complete ratio 1.0으로 수렴”은 폐기한다. forced-colors에서
  track 경계를 잃지 않도록 border를 복원했고, border box 2px를 제외한 complete ratio 0.98 이상을
  완료 기준으로 사용한다. 이 정정 기록이 해당 문장보다 우선한다.
- `CardTitle`·`CardDescription`은 중립 `div`로 유지해 실제 heading level과 paragraph를 화면이
  소유한다. 모든 canonical slot·size marker는 타입과 runtime prop 순서 양쪽에서 덮어쓰기를 막는다.
- `Progress`는 finite 0–100 또는 `null`만 받는다. 범위 밖 관측값을 clamp해 변조하지 않고
  `RangeError`로 계약 오류를 드러낸다. `null`은 numeric `aria-valuenow` 없이 불확정 문구로 읽힌다.
- 타입 보호와 별도로 runtime sanitizer가 `aria-hidden`, raw HTML, children, role, min/max,
  aria value, style, Base UI render·format 계열 override를 제거한다. unsafe-cast 회귀 테스트는 실제
  DOM에서 named progressbar와 내부 track이 보존되는지 검증한다.
- 불확정 indicator는 reduced-motion과 forced-colors에서도 전체 완료와 같아지지 않는다. 1/3 폭,
  dashed border, `background-clip: padding-box`, animation none을 유지한다. track border와 indicator
  border는 각각 실제 배경 대비 3:1 이상이어야 하며 visual gate가 geometry·clip·contrast를 함께
  검사한다.
- `THIRD_PARTY_NOTICES.md`에 Card·Progress의 upstream source, product target, material change를
  기록했다. product runtime의 lab/generated/vendor import는 0건이다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, 유효한 완료 앵커 0개다. product surface와
  API composition 등록은 계속 0개다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 17 files, 88 tests PASS
  - product design guard: 65 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 45.77 kB (45,769 bytes)
  - ProductApp JS: 68.82 kB (68,819 bytes)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent
검증: forced-colors track border/contrast, complete ratio ≥0.98,
      indeterminate ratio 0.25–0.45, dashed border, padding-box clip, animation none
스크린샷:
  - references/ui-layer-lab/output/playwright/product-state-forced-colors.png
```

## 2026-07-11 Item·ScrollArea primitive 계약 보강

- 구현 커밋: `36f23f06e`
- overflow·visual gate 보강 커밋: `6c5ba125a`
- `Item`은 `div`, `a`, `button` root만 허용한다. `div`는 중립 구조 role만 받을 수 있고
  `onClick`, `tabIndex`, `role="button"`은 타입 계약과 runtime guard 양쪽에서 거부한다.
- anchor item은 비어 있지 않은 `href`를 필수로 받고, button item은 `type="button"`을 component가
  소유한다. native link/button role override도 거부하고, disabled button item은 forced-colors에서도
  opacity를 낮추지 않고 `GrayText` text·border를 유지한다.
- Item group, media, content, title, actions, header, footer, description, separator는 canonical
  slot marker를 component가 소유한다. `ItemGroup`은 role, click, tab stop을 소유하지 않으며 title은
  heading을 만들지 않아 화면 heading hierarchy를 호출자가 소유한다.
- `ScrollArea`는 `aria-label` 또는 `aria-labelledby` 중 하나를 필수로 요구하고, 둘을 동시에
  받거나 빈 accessible name을 받으면 거부한다. viewport는 `role="region"`을 갖되, `tabIndex=0`은
  요청한 axis에 실제 overflow가 있을 때 Base UI가 부여한다. overflow가 없으면 불필요한 tab stop을
  만들지 않는다.
- orientation은 `vertical`, `horizontal`, `both` 중 하나로 고정한다. root의 role, style, render,
  raw HTML, slot, orientation, accessible-name override는 runtime sanitizer가 제거하고 children은
  canonical viewport/content 안에 둔다.
- `THIRD_PARTY_NOTICES.md`에 Item·ScrollArea의 upstream-derived source, product target, material
  change를 추가했다. product runtime의 lab/generated/vendor import는 0건이다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, 유효한 완료 앵커 0개다. 이번 변경은
  `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았고 새 endpoint 요구를 만들지 않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 19 files, 115 tests PASS
  - product design guard: 69 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 49.27 kB (49,270 bytes)
  - ProductApp JS: 68.82 kB (68,819 bytes)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent
검증: disabled Item forced-colors text·border contrast, ScrollArea real overflow,
      viewport `data-has-overflow-y`/keyboard focus, visible scrollbar/thumb geometry,
      reduced-motion transition duration
```

## 2026-07-11 §6b API 작업지시서·요청 큐 최신화

- 작업지시서·원자 queue 커밋: `32ef74ed5`
- canonical branch·file lock·완료 앵커 보강 커밋: `64c509805`
- 정본은 `api-integration-workorder-20260711.md`, 실행 큐는 `api-needs.md`다. 작업자는 queue에서
  전역 단일 `in_progress` 행을 claim하고, endpoint·schema·contract test·barrel export 코드 커밋 A를
  canonical branch에 push한 뒤, progress EOF 앵커와 queue 제거를 커밋 B로 분리한다.
- queue는 `APIQ-001`~`APIQ-027` 27행, 개별 export 함수 49개, `requested` 26행,
  `blocked` 1행이다. 기존 구현 검증 15함수와 신규 구현 34함수가 중복 없이 일치한다.
- backend route constant 41개와 실제 router method·path·request/response model·default·status를
  교차 검증했다. `AcceptedResponse` mutation은 현재 HTTP 200이며 submit/scale/restart receipt에
  `command_id`가 없으므로 임의 polling을 만들지 않는다.
- `deleteAiConversation`의 backend 204 empty body는 frozen `client.ts`가 처리할 수 없어
  `APIQ-020`·`BLOCK-204-001`로 분리했다. transport 또는 backend 계약이 승인되어 바뀌기 전에는
  direct fetch나 가짜 body로 우회하지 않는다.
- 현 시점 exact `API 완성:` 앵커는 0개다. `src/product/api/**`, `client.ts`, `url.ts`는 이번 문서
  작업에서 수정하지 않았고 제품 release surface는 계속 network-silent gate를 표시한다.

```text
명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 tests

명령: make manifest-check
결과: PASS — management 56, target 18

명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 19 files, 115 tests PASS
  - product design guard: 69 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 49.27 kB
  - ProductApp JS: 68.82 kB

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — 7 scenarios, network-silent
실행 화면: http://127.0.0.1:5180/product
브라우저 검증: title KubeHeal, console warning/error 0, release gate 표시
```

## 2026-07-11 ButtonGroup·Tabs primitive 계약 보강

- 구현 커밋: `83aa4d83a`
- `ButtonGroup`은 `aria-label` 또는 `aria-labelledby` 중 하나를 필수로 요구하고, 둘이 동시에
  있거나 빈 accessible name이면 거부한다. root는 `role="group"`과 orientation marker를 component가
  소유하며 event handler, role, tab stop, raw render, raw HTML, inline style, hidden override를
  받지 않는다.
- `ButtonGroupText`는 중립 non-clickable div이고, `ButtonGroupSeparator`는 separator semantics와
  orientation marker를 component가 소유한다. disabled child button의 activation은 native button에
  맡기며 forced-colors disabled/focus treatment를 group에서 보강한다.
- `Tabs`는 controlled 또는 uncontrolled selection 중 정확히 하나만 허용한다. controlled mode는
  `onValueChange`가 필수이고, `TabsList`는 accessible name이 필수다.
- `TabsTrigger`는 native button semantics와 active/disabled/orientation marker를 Base UI가 소유한다.
  disabled tab은 roving focus에서 focus될 수 있지만 `aria-disabled=true` 상태에서는 선택되지 않고,
  다음 enabled tab으로 이동한 뒤 automatic activation이 일어난다.
- `TabsContent`는 tabpanel semantics와 focus marker를 component가 소유하며, heading hierarchy는 각
  화면이 외부 heading으로 소유한다.
- `THIRD_PARTY_NOTICES.md`에 ButtonGroup·Tabs의 upstream-derived source, product target, material
  change를 추가했다. 이 변경은 product primitive/test 보강이며 새 endpoint 완료가 아니다.
- §6b 조율 상태는 `api-needs.md`의 `requested` 26행, `blocked` 1행, 유효한 완료 앵커 0개다. 이번
  변경은 `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 21 files, 144 tests PASS
  - product design guard: 73 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 55.54 kB (55,540 bytes)
  - ProductApp JS: 68.82 kB (68,819 bytes)
주의: 500kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — release-desktop-light, release-mobile-dark, release-reflow-320-light,
      release-text-resize-200-light, state-reflow-320-light,
      state-text-resize-200-light, state-forced-colors; network-silent
```

## 2026-07-11 ButtonGroup·Tabs P1 종결 검증

- 정본 보강 커밋: `1e788cde4` (`fix: Tabs·ButtonGroup 상태·시각 계약 보강`)
- `ButtonGroupSeparator` 방향을 가장 가까운 부모 `ButtonGroup`의 방향에서 직교 방향으로
  파생한다. 부모 밖 separator와 소비자가 직접 지정하는 모순된 방향은 허용하지 않는다.
- 결합 경계 selector는 DOM의 첫째·마지막 자식이 아니라 `[data-slot]` 형제 관계를 기준으로
  계산한다. 따라서 장식 또는 비-slot 자식이 사이에 있어도 radius와 중복 border가 깨지지 않는다.
- `Tabs`의 canonical 선택값은 `string | null`이다. 선택 탭 제거와 모든 탭 비활성 시 Base UI의
  `missing`·`disabled` reason 및 원본 change details를 보존하여 `null`로 수렴한다.
- `TabsList`는 `default | line` variant를 component-owned `data-variant`와 함께 제공한다.
  가로 default trigger 높이는 list content box 안에 포함되도록 조정했고, line indicator는 가로·세로
  orientation, reduced-motion, forced-colors 규칙을 공유한다.
- unit class 문자열 확인만으로 통과시키지 않는다. 시각 게이트가 실제 DOM role/name/state,
  ButtonGroup 결합 rect와 border collapse, Tabs list/trigger containment, line pseudo indicator,
  reduced-motion 1ms 이하, forced-colors active/focus/disabled 대비를 계산한다.
- `api-needs.md` 상태는 `requested` 26행, `blocked` 1행, 유효한 `API 완성:` 앵커 0개다.
  이번 보강은 `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 22 files, 150 tests PASS
  - product design guard: 74 files PASS
  - UI catalog source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
  - ProductApp CSS: 59.08 kB (gzip 10.80 kB)
  - ProductApp JS: 68.82 kB (gzip 23.84 kB)
주의: 500 kB 초과 chunk warning은 reference catalog 기존 성능 과제로 유지

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS — 7 scenarios, network-silent
검증: 320px reflow, 200% text resize, reduced-motion, forced-colors 포함
```

## 2026-07-11 APIQ-021 인증 API 계약 완료

- 코드 커밋: `a245f02a` (`test: verify auth API contracts`)
- `getSession`: GET `/api/auth/session`, cookie credentials, 401, strict wire schema, AbortSignal 검증
- `login`: POST `/api/auth/login`, exact JSON body, CSRF, cookie credentials, possibly-sent POST 비재전송 검증
- `logout`: POST `/api/auth/logout`, JSON 200 응답, CSRF, AbortSignal, POST 비재전송 검증
- targeted Vitest: 1 file, 8 tests PASS
- full gate: 25 files, 177 tests, TypeScript, ESLint, design guard, shadcn audit, production build PASS

API 완성: getSession (a245f02a)
API 완성: login (a245f02a)
API 완성: logout (a245f02a)

## 2026-07-12 API 감사 후속·BLOCK-204-001 해소

- 감사 확인: APIQ-021은 claim `c0acb7cae` → 구현·검증 `a245f02ad` → 완료 조율
  `beb7fb577` 순서를 지켰고 금지 파일 접촉은 0건이다. exact 완료 앵커 3개와 canonical ancestor를
  다시 확인했다.
- transport 단독 커밋: `af03639ee` (`fix: API 무본문 전송 계약 추가`). 변경 파일은
  `client.ts`, `client.test.ts` 두 개뿐이며 기존 `apiRequest` 시그니처·JSON 동작은 유지했다.
- `apiRequestNoContent`는 credentials·CSRF·Accept·기존 `httpError` 경로를 공유한다. raw body 길이가
  정확히 0인 HTTP 204/205만 성공하며, 200 empty, whitespace body, 204/205 body 포함 응답은
  `invalid-payload`로 거부한다. fetch와 `response.text()` 단계 AbortError를 그대로 전파하며 재시도는
  0회다.
- `BLOCK-204-001`은 `af03639ee`로 해소했다. APIQ-020을 `requested`로 되돌리고 비고에 해시를
  고정했다. `client.ts` 동결은 이 커밋 직후 다시 유효하다. `index.ts`는 이 transport 커밋에서
  수정하지 않았다.
- 다음 claim 권장 순서는 APIQ-001 → APIQ-002 → 이후 P1·P2다. 유효한 기존 `in_progress` lease는
  건드리지 않는다.
- 24시간 대행은 P0부터 수행하고 일반 작업과 동일한 전역 `in_progress` 1행 lock·2커밋 절차를
  지킨다. 대행 시 원 요청 시각·시작 시각·경과 시간·사유를 이 파일 EOF에 기록하고, API 작업자가
  복귀하면 이미 claim한 행 완료 후 다음 행부터 양보한다.
- `index.ts` 병목이 생기면 도메인별 barrel 제안서를 progress에 먼저 기록한다. 검토자 승인 전에는
  임의 분리를 수행하지 않는다.
- `APIQ-022`의 test 커밋 `8be4467a9`는 canonical branch에 있으나 선행 claim·exact 완료 앵커가
  확인되지 않아 queue를 그대로 유지하고 제품 소비를 승인하지 않았다.
- LIVE_MUTATION_NOT_RUN: 승인·sandbox 부재. no-content transport 검증에서 실제 DELETE를 호출하지
  않았다.

```text
TDD 선행 실패: client.test.ts 8 tests 중 7 FAIL / 1 PASS (함수 추가 전)
최종 API 회귀: client/auth/metrics/live 4 files, 35 tests PASS
독립 적대 검토: P0 0, P1 0
npm run check: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 27 files, 199 tests PASS
  - product design guard: 82 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - production build: PASS
  - ProductApp CSS: 61.43 kB (gzip 11.17 kB)
  - ProductApp JS: 79.03 kB (gzip 26.56 kB)
```

API transport: apiRequestNoContent (af03639ee)

## 2026-07-12 Sidebar 제품 셸 탐색 계약 종결

- Sidebar 셸 기준 커밋: `346d5a886`; semantic 경계 보강 커밋: `6a40a5d01`; disabled reflow
  시각 게이트 보강 커밋: `643dc87d9`.
- `SidebarMenuLink`는 내부 React Router `Link`만 생성하고 검증된 내부 절대 경로만 받는다. 임의
  React element, 사용자 컴포넌트, Fragment, `render` 주입은 타입과 runtime 양쪽에서 거부한다.
- `SidebarMenuButton`은 native `button[type=button]`만 생성한다. page-current 의미는 link만 소유하며
  action button의 `isActive`, `aria-current`, `data-active` 경로를 제거했다.
- desktop Sidebar는 11rem 확장·3.5rem 축소 토큰과 같은 DOM link를 유지한다. 축소 전환에도 focus와
  link identity가 보존되고 tooltip은 축소 desktop에서만 제공된다.
- mobile Sidebar는 17rem modal Dialog drawer다. 390px·320px·200% text에서 overlay, Escape,
  focus trap, focus return, navigation 후 닫힘을 검증했다. desktop과 mobile open state는 독립적이다.
- ProductShell은 released surface 집합에서만 메뉴를 만들고 단일 main landmark, skip link, sticky
  header, keyboard help, theme action을 유지한다. API·synthetic data·provider 분기를 추가하지 않았다.
- 시각 게이트는 interaction-disabled와 layout-suppressed를 분리한다. 화면에 보이는 disabled
  Button·Tabs·Item도 own overflow와 viewport bounds 검사를 받으며 state 시나리오마다 실제 검사된
  disabled 요소가 1개 이상인지 assert한다.
- 독립 적대 재검토 결과: 구현 P0 0·P1 0, 시각 게이트 P0 0·P1 0.
- `http://127.0.0.1:5180/metrics`를 반복 갱신하던 1시간 이상 된 Vite HMR 프로세스는 종료했다.
  `/metrics`는 제품 route가 아니며 올바른 제품 진입점은 `/product`다.
- 당시 API queue는 requested 26행, in_progress 0행, blocked 0행, valid completion anchors 3이었다.
  Sidebar 커밋은 `src/product/api/**`, API queue, backend 파일을 수정하지 않았다.

```text
대상 회귀: Sidebar/ProductShell 5 files, 44 tests PASS
npm run check: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Vitest: 28 files, 212 tests PASS
  - product design guard: 83 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - production build: PASS
  - ProductApp CSS: 61.43 kB (gzip 11.17 kB)
  - ProductApp JS: 78.44 kB (gzip 26.41 kB)
npm run visual-product: PASS — 12 scenarios, network-silent
  - release: desktop/light, mobile/dark, 320px, 200% text
  - shared state: 320px, 200% text, forced-colors
  - ProductShell: desktop expanded, desktop collapsed/forced-colors,
    mobile drawer 390px·320px, mobile 200% text
스크린샷:
  - references/ui-layer-lab/output/playwright/product-shell-desktop-expanded-light.png
  - references/ui-layer-lab/output/playwright/product-shell-mobile-drawer-dark-390.png
```

## 2026-07-12 골모드 P1·P2·allowlist 재감사

- P1 browser API mapping unit은 136행이고 절 분포는 24/11/19/21/14/5/23/11/7/1이다.
- P2는 REF-API-001~136이 연속·유일하다. 판정은 직결 0, 어댑터 34, BE-Gap 102, 미정 0이며
  BE-Gap-001~102도 누락·중복이 없다.
- UI mapping은 UI-001~073 연속 73개, RCA 데이터 삽입점 5개, RCA UI mapping RCA-001~010
  10개다.
- allowlist 밖 frontend 문서 6개는 모두 정확히 archived이며 제품 소스의 파일명·import·URL 참조는
  0건이다. progress frontmatter의 과거 directive 포인터 1건을 현재 최상위 골모드 지시서로 교정했다.
- `reference-contract-map.md`의 `getSession` 상태를 exact 완료 앵커 `a245f02a`와 동기화했다.
- P1·P2 완료 뒤에도 남아 있던 중앙 뷰의 과거 시점 문구를 제거했다. 현재 중앙 content의 기준은
  P1/P2 Home route이며, 승인 API로 만들 수 있는 section만 release한다. 사용자 정의 중앙 시각화를
  되살리지 않는다.
- final question 4건은 2026-07-12 16:29 KST 기한 전이므로 기본 권고를 조기 확정하지 않는다.
- 자체결정: 질문과 무관하고 exact 완료 앵커가 있는 `getSession`, `login`, `logout`만 사용하는 실제
  Auth session barrier를 다음 구현 단위로 선택한다. Home·cluster selector는 `listClusters`
  완료 앵커 전까지 release 결합하지 않는다.

```text
P1 API 136 = P2 API 136
P2 unresolved 0
allowlist 밖 product-source 참조 0
```

## 2026-07-12 APIQ 완료 앵커와 Auth barrier 기반 구현

API 완성: getCluster (60d0d63d7)
API 완성: getClusterConnectionStatus (3d99514d6)
API 완성: getInventorySummary (310c24a0d)
API 완성: getClusterSummary (94063b29d)
API 완성: getClusterNodesSummary (94063b29d)
API 완성: getNodePodsSummary (94063b29d)
API 완성: getFleetSummary (0de498e01)
API 완성: getRcaTimeline (7ad3800e6)
API 완성: getClusterUsage (1fe5bc859)
API 완성: listInventoryResources (94ad64bf1)
API 완성: listInventoryServices (94ad64bf1)
API 완성: listInventoryWorkloads (94ad64bf1)
API 완성: getInventoryResourceDetail (94ad64bf1)
API 완성: listInventoryEvents (89a6a8edd)
API 완성: listInventoryResourcesByType (6aaf19fea)

- `api-needs.md`에서 `APIQ-001`, `APIQ-002`, `APIQ-003`, `APIQ-004`, `APIQ-023`,
  `APIQ-007`, `APIQ-008`, `APIQ-024`, `APIQ-025`, `APIQ-026` 행을 제거하고 snapshot을 16행·31함수, requested 16,
  valid completion anchors 18로 갱신했다.
- `reference-contract-map.md`의 connection, cluster-info, dashboard, namespace, metrics, RCA teaser
  adapter와 inventory resource/detail/event/type-query 상태도 queue가 아니라 위 완료 앵커를 가리킨다.
- Auth 기반 구현은 `features/auth/AuthBarrier.tsx`, `authContract.ts`, `createAuthAdapter.ts`와
  form primitive `Field`, `Input`, `Label`로 분리했다. 이 단계는 실제 session port와 form semantics
  테스트를 추가하지만, 제품 route에 아직 Home·cluster selector를 소비시키지 않는다.

## 2026-07-12 인증 세션 권위 재수렴 보강

- 로그인 403의 백엔드 코드는 허용 목록으로만 canonical 변환한다.
  `email_unverified`는 `email-unverified`, `approval_pending`은 `approval-pending`이며,
  알 수 없는 provider 세부 코드는 제품 상태로 유출하지 않고 `forbidden`으로 닫는다.
- 로그인·로그아웃 POST가 `network`, `server`, `invalid-response`로 끝나 응답 유실 가능성이 있으면
  mutation을 재전송하지 않는다. 동일 `AuthPort.loadSession` GET을 한 번 호출해 authoritative
  authenticated/unauthenticated 상태로 수렴한다. 확인 GET도 실패하면 기존 인증 surface를 즉시
  숨기고 session error로 fail-closed 처리한다.
- 인증된 feature가 받은 401은 `AuthSessionGate.reportUnauthorized()` 단일 semantic event로
  세션 barrier에 전달한다. 동시에 여러 feature가 보고해도 ref 기반 single-flight로 세션 GET은
  한 번만 실행하며, provider 밖의 소비는 개발 오류로 차단한다.
- `AuthBarrier.tsx`에서 요청 공유와 안전 문구를 `authSessionRequest.ts`, `authIssues.ts`로 분리해
  제품 파일 300줄 제한과 adapter/view 경계를 유지했다.
- 이 변경은 새 endpoint 완료가 아니다. 기존 exact anchor인 `getSession`, `login`, `logout`만
  사용하며 `src/product/api/**`, `client.ts`, `url.ts`를 수정하지 않았다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript / ESLint: PASS
  - Vitest: 43 files, 295 tests PASS
  - product design guard: 120 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS, ProductApp 101.96 kB (gzip 33.37 kB)

명령: npm run visual-product
결과: PASS — 16 scenarios
  - unauthenticated desktop/mobile/320px/200%/forced-colors
  - authenticated release, session error, session loading
  - shared state와 shell desktop/mobile/forced-colors
  - scenario별 GET /api/auth/session 정확히 1회, feature API·WebSocket 0회

브라우저 검증: http://127.0.0.1:5180/product
결과: 실제 session API 실패를 synthetic fallback 없이 session error 화면으로 표시
```

## 2026-07-12 APIQ-022 24시간 대행 착수

- 원 요청 시각: 2026-07-11 16:19 KST
- 대행 시작 시각: 2026-07-12 20:21 KST
- 경과 시간: 28시간 02분
- 사유: Home cluster selector의 유일한 권위인 `GET /api/clusters`의 `listClusters` 완료 앵커가
  없고 queue 전체의 `in_progress`가 0인 상태로 24시간을 초과했다.
- queue의 단일 `in_progress` lock을 `APIQ-022`에 획득했다. 이 행의 코드·contract test·완료
  앵커까지만 대행하고, API 작업자가 복귀하면 다음 행부터 다시 양보한다.

### 병렬 APIQ-027 테스트 회귀 격리

- 병렬 작업자의 `ca30b74a6`이 queue claim 없이 `metrics.test.ts`를 갱신한 직후 전체 gate와
  해당 파일 단독 실행에서 `PromiseRejectionHandledWarning`/unhandled `AbortError`가 반복 재현됐다.
- `pollCommand` 구현은 바꾸지 않고 rejection matcher를 `AbortController.abort()` 전에 연결해
  거절 관찰 공백만 제거했다. 이 hotfix는 APIQ-027 완료 앵커가 아니며 해당 queue 행은 계속
  `requested`다. APIQ-022 단일 `in_progress` lock도 유지한다.

## 2026-07-12 APIQ-022 클러스터 목록 계약 완료

API 완성: listClusters (257581398)

- `GET /api/clusters?limit=100` 기본 경로, 명시 limit, cookie credentials, Accept header,
  GET 무본문·CSRF 미부착, AbortSignal을 고정했다.
- strict 성공/빈 목록, 401, structured 403, 503, invalid JSON, known-field type mismatch,
  uncontracted top-level/row field를 9개 contract test로 검증했다.
- 실제 프록시 `http://127.0.0.1:5180/api/clusters?limit=100`는 비인증 세션에서 HTTP 401을
  반환해 synthetic session 없이 gateway 도달을 확인했다. 인증된 실 cluster payload 검증은
  사용자 세션 확보 뒤 Home 브라우저 gate에서 계속한다.
- 코드 커밋 `257581398`은 canonical 원격 조상이며 API barrel의 `listClusters` named export와
  같은 커밋의 contract test 식별자 근거를 충족한다. APIQ-022 queue 행을 제거했다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS — TypeScript, ESLint, 43 files/301 tests, design guard 120 files,
      shadcn audit 482 previews, production build
```

## 2026-07-12 Home 실 API 탐색 화면 1차 릴리스

- 제품 코드 커밋: `8dbec35aa`.
- Home은 완료 앵커가 있는 `listClusters`, `getClusterSummary`, `getClusterNodesSummary`,
  `getNodePodsSummary`만 composition root에서 import한다. API module import는
  `src/product/app/apiComposition.ts` 한 곳에만 존재하고 mount 전 feature 요청은 0개다.
- cluster selector와 URL `cluster` query는 같은 canonical ID를 사용한다. URL의 ID가 현재
  `limit=100` 목록에 없으면 다른 cluster로 자동 대체하지 않고 “현재 조회 목록에서 확인할 수 없음”으로
  표시한다. 목록 완전성이 unknown이므로 존재하지 않는다고 단정하지 않는다.
- Node 선택은 같은 Home surface에서 URL `node` query와 Pod panel로 전환한다. Node 목록은
  completeness unknown이므로 목록 불일치만으로 deep link를 거부하지 않고, Pod endpoint의 404를
  authoritative unknown-node로 사용한다. Kubernetes Node 이름은 DNS subdomain 형식과 253자 상한을
  먼저 검증한다.
- 선택 cluster의 overview, nodes, pods는 같은 `cluster.read` 권한 authority다. 어느 요청이든 403이면
  cluster frame 전체와 마지막 성공 cache를 원자적으로 폐기하고 global forbidden surface로 전환한다.
  401은 `AuthSessionGate.reportUnauthorized()` 단일 이벤트로 session authority에 수렴한다.
- 30초 visible polling, visibility 복귀 즉시 갱신, 수동 새로 고침을 지원한다. background 실패는
  403을 제외하고 마지막 성공 데이터를 유지하며 `refreshFailure`와 `retryAfterSeconds`를 별도로
  표시한다. 빠른 A→B→A 전환과 StrictMode 중복 mount에서도 구세대 응답과 중복 GET을 차단한다.
- collection 길이는 총수로 사용하지 않는다. Node, Pod, workload, warning, incident slice는
  “표시 N개 · 전체 수 미확인”으로 표기하고, catalog의 `incidentCount`와 표시 warning 수를 분리한다.
  CPU·memory 100% 초과 값은 실제 text로 보존하고 progress geometry만 100으로 clamp한다.
- 실제 API 브라우저 검증은 `http://127.0.0.1:5180/product`에서 수행했다. 인증된
  `kubernetes-ops` 응답으로 Pod 52, Node 2, cluster incident 2가 표시됐고, 실제 Node 선택과
  Pod summary request, URL drill-down, Node focus return을 확인했다. synthetic fallback은 없다.
- 실제 응답에서 cluster 총 Pod는 52인데 두 Node의 `podsRunning`은 각각 0으로 관측됐다. 프론트는
  값을 발명하거나 cluster 총수로 역산하지 않는다. 이 불일치는 backend 관측 데이터 품질 항목으로
  남기며 Home adapter 계약을 우회하지 않는다.
- API 작업자 커밋 `6d36ad582`는 API 소유 파일만 수정했고 전체 gate는 통과하지만, `APIQ-009`의
  선행 claim·heartbeat와 완료 조율 커밋, `API 완성:` 앵커가 없다. 따라서
  `getClusterResourceUsageSeries`는 계속 requested이며 제품 composition에서 소비하지 않는다.
- 최종 질문 기본 결정은 독립 구현을 유지한다. graph는 xyflow+ELK, 대규모 목록은 TanStack Virtual을
  기본 후보로 두고, editor·diff·terminal 의존성은 실제 화면 착수 전까지 추가하지 않는다.

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript / ESLint: PASS
  - Vitest: 54 files, 377 tests PASS
  - product design guard: 153 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS

명령: npm run visual-product
결과: PASS — 22 isolated scenarios
  - Home Node 기본 frame / Pod drill-down frame
  - desktop, mobile dark, 320px, 200% text, forced-colors
  - cluster 403 cache purge, exact GET count, unexpected network·WebSocket 0

스크린샷:
  - references/ui-layer-lab/output/playwright/product-home-authenticated-node-desktop-light.png
  - references/ui-layer-lab/output/playwright/product-home-authenticated-pod-desktop-light.png
  - references/ui-layer-lab/output/playwright/product-home-authenticated-node-mobile-dark.png
  - references/ui-layer-lab/output/playwright/product-home-authenticated-node-reflow-320-light.png
```

## 2026-07-13 Home 부분 실패 격리와 Resources 검증 흐름

- 제품 통합 커밋: `5fe3ddb47`.
- `usage` 불변식 위반은 Home 전체 실패가 아니라 `usage: null`과 structured warning으로
  강등한다. `pods_total` 누락과 `pods_running: 5` 조합에서도 클러스터·인시던트 영역은
  유지되고 사용량만 `—`로 표시된다.
- workload `ready: ""`는 해당 행만 degraded 값 `—`로 표시하고, `incident_id: ""`는 링크 없는
  인시던트 행으로 보존한다. 다른 정상 행과 섹션은 계속 렌더한다.
- `ProductErrorBoundary.componentDidCatch`는 원본 error/stack을 DOM이나 로그 payload로 복사하지
  않고 구조화된 제품 경계 이벤트만 기록한다.
- transport Zod가 `usage.pods_total`을 아직 필수로 거부하는 실제 API 경계는 `APIQ-028`로
  요청했다. 완료 앵커 전까지 feature canonical 격리만으로 end-to-end 완료라고 판정하지 않는다.
- Resources는 malformed optional row/fact를 행 단위로 격리하고 excluded count와 structured warning을
  제공한다. 403은 캐시를 폐기하고 자동 polling을 중지하며, invalid response와 429는 서로 다른
  복구 정책을 유지한다.

```text
검증: npm run check
결과: PASS — TypeScript, ESLint, 72 files/510 tests, design guard 210 files,
      shadcn audit 482 previews, production build
```

## 2026-07-13 Home·Resources 텍스트 밀도와 시각 회귀

- 코드 커밋: `c9856c9b9`.
- 전 화면 규칙은 `reference-porting-contract.md` §7.1 `텍스트 밀도 규칙`이 정본이다.
- visible route 이름은 데스크톱 sidebar에서만 한 번 표시한다. 상단바 route 설명과 Home/Resources
  본문 제목, 정상 상태 상주 설명, eyebrow, `LIVE API`·`실 API` 배지를 제거했다.
- 연결 상태와 마지막 관측 시각은 공용 `ClusterConnectionStatus` 하나로 통합했다. 마지막 관측은
  keyboard focus 가능한 tooltip과 accessible name으로 제공한다. 정상 snapshot은 badge를 만들지
  않고 stale·미제공처럼 판단이 달라지는 상태만 표시한다.
- CPU·memory는 진행바 행에서만 수치를 표시하고, Pod·Node는 `18 · 17 running` 형식으로 줄였다.
  Resources list 범위도 `표시 2 · 전체 수 미확인 · 최대 200`으로 같은 단위 규칙을 따른다.
- 모바일 wide table은 암묵적 잘림 대신 이름, `region`, `tabIndex=0`을 가진 명시적 가로 스크롤
  영역으로 제공한다. modal이 열린 동안 inert가 된 배경 표는 별도 desktop/mobile 시나리오에서
  접근성과 reflow를 검증한다.

시각 비교 경로:

- 변경 전: `references/ui-layer-lab/output/playwright/product-home-authenticated-node-desktop-light.png`
- 변경 후: `references/ui-layer-lab/output/playwright/product-home-authenticated-node-desktop-light-text-diet.png`
- Resources: `references/ui-layer-lab/output/playwright/product-resources-authenticated-desktop-light.png`

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
  - TypeScript / ESLint: PASS
  - Vitest: 73 files, 512 tests PASS
  - product design guard: 212 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS

명령: npm run visual-product
결과: PASS — 29 isolated scenarios
  - Home 전/후, Node/Pod, desktop/mobile/320px/200%/forced-colors
  - Resources list/detail, desktop/mobile/320px/200%/forced-colors
  - exact scenario API request, unexpected feature network·WebSocket 0
```

## 2026-07-13 Cluster summary 부분 usage API 보정 완료

API 완성: getClusterSummary (ef7d3a1e9)

- `usage.pods_total` 누락만 transport에서 `undefined`로 보존한다. workload, warning event,
  incident 계층은 계속 strict하게 검증하며 기본 합계나 synthetic 값을 만들지 않는다.
- 실제 endpoint 함수와 Home adapter를 결합한 회귀 테스트에서 `pods_running: 5`와
  `pods_total` 누락 응답이 resolve되고, 클러스터 상태·workload·warning·incident는 유지한 채
  usage만 `null`과 `usage-unavailable` structured warning으로 강등됨을 확인했다.
- 코드 커밋 `ef7d3a1e9`가 `origin/woonyong/ui-layer-lab`의 ancestor임을 확인했다.

```text
명령: npm run test -- src/product/api/cluster-summary.test.ts --reporter=verbose
결과: PASS — 1 file, 9 tests

명령: npm run check
결과: PASS
  - TypeScript / ESLint: PASS
  - Vitest: 91 files, 635 tests PASS
  - product design guard: 268 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS

명령: npm run visual-product
결과: PASS — 33 isolated scenarios, exact API request contract, unexpected network 0
```

## 2026-07-13 RemediationBundle API 착륙 대기 동결

- BQ-003 앵커는 f-coordination-plan §4b가 정한 단일 확인 수단인 공유 dev worktree의
  `docs/backend-f-progress.md`에서 확인되지 않아 유효한 완료 근거로 사용하지 않는다.
- 작성한 `rca-bundle.ts`, `rca-bundle-schemas.ts`, `rca-bundle.test.ts`는 폐기하지 않고
  동결한다. API barrel export는 제거했으며 제품 화면·adapter 소비는 시작하지 않았다.
- `API 완성: getRemediationBundle (...)` 앵커는 기록하지 않는다. 재개 조건은 BQ-003 merge
  착륙, 공유 dev worktree progress의 백엔드 ancestor 재증명, 착륙본 schema와 작성한 Zod의
  diff 대조 무결성 확인이다.
- BQ-001도 같은 착륙 확인 절차를 통과하기 전까지 `submitCommand`와 command status 행을
  claim하지 않는다. 그동안 완료 앵커가 유효한 기존 adapter 트랙만 계속한다.

## 2026-07-13 AI 대화 삭제 API 완료

API 완성: deleteAiConversation (abe804f4e)

- `DELETE /api/ai/conversations/{conversation_id}`는 path segment를 인코딩하고
  `apiRequestNoContent`만 사용한다. request body를 만들거나 직접 `fetch`로 우회하지 않는다.
- endpoint contract test에서 credentials, CSRF, Accept, AbortSignal, 호출 1회, 204 무본문 성공을
  검증했다. 401·403·409·422·429의 structured 오류와 retry metadata도 그대로 보존한다.
- 코드 커밋 `abe804f4e`가 `origin/woonyong/ui-layer-lab`의 ancestor임을 확인했다.

```text
명령: npm run test -- --run src/product/api/ai-conversations.test.ts src/product/api/client.test.ts
결과: PASS — 2 files, 26 tests

명령: npm run check
결과: PASS
  - TypeScript / ESLint: PASS
  - Vitest: 92 files, 657 tests PASS
  - product design guard: 271 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
```

## 2026-07-13 RemediationBundle API 완료

API 완성: getRemediationBundle (97c862da1)

- BQ-003 앵커 `44f35234e`의 `origin/dev` 착륙과 progress·router 실물을 재검증했다.
- 착륙본 JSON Schema·Bruno·serializer와 동결 Zod를 대조한 결과 필드·required·nullable·
  strict/open 경계가 일치한다. `remediation`은 required nullable이고, 유일한 open record는
  `draft.params`다. diagnosis/remediation selected ID는 분리한다.
- public barrel에 endpoint·response schema·canonical type을 export하고 직접 모듈과 동일한
  identity임을 회귀 테스트로 고정했다.
- 코드 커밋 `97c862da1`은 `origin/woonyong/ui-layer-lab`의 ancestor다.

```text
명령: npm run check
결과: PASS
  - TypeScript / ESLint: PASS
  - Vitest: 94 files, 662 tests PASS
  - product design guard: 275 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
```

## 2026-07-13 Generic command receipt API 완료

API 완성: submitCommand (d763ab682)

- `AcceptedResponse.command_id`를 required `string | null`로 검증한다.
- non-null 값은 서버 receipt 그대로 유지하고, recorded approval 때문에 제출 시점 파생이
  불가능한 경로의 null은 계산·추측·fallback 없이 그대로 유지한다.
- command_id 키 누락, 잘못된 correlation type, backend structured error는 공용 API 오류 경계로
  거부·보존한다. 상태 추적 adapter는 APIQ-027 앵커 전 소비하지 않는다.
- 코드 커밋 `d763ab682`는 `origin/woonyong/ui-layer-lab`의 ancestor다.

```text
명령: npx vitest run src/product/api/commands.test.ts --reporter verbose
결과: PASS — 1 file, 5 tests

명령: make check
결과: PASS — root checks 838 passed, 3 skipped + manifest-check

명령: npm run check
결과: FAIL(2026-07-13 06:37 KST 재실행)
  - Vitest 단계에서 `src/product/app/apiBoundary.test.ts` timeout
  - `src/product/pages/resources/ResourcesPage.test.tsx` 표 조회 assertion 실패
  - `submitCommand` targeted test는 PASS였으므로 이 실패를 APIQ-012 완료 PASS 증거로 쓰지 않음
```

### 2026-07-13 full gate 재검증과 command polling claim

- 06:37 KST의 간헐 실패 후 동일 full gate를 재실행해 전체 통과를 확인했다. 별도 재현에서는
  `apiBoundary`의 반복 Git 증거 조회와 Resources의 다단계 로딩을 1초로 가정한 테스트 경합을
  확인했으며, 제품 응답을 가짜로 대체하지 않고 테스트 수명주기만 안정화한다.
- queue의 다음 고정 순서인 APIQ-027을 `Codex-API@woonyong/ui-layer-lab`이 claim했다.
  completion anchor 전까지 제품 adapter는 command status API를 소비하지 않는다.

```text
명령: npm run check
결과: PASS (2026-07-13 06:50~06:57 KST)
  - TypeScript / ESLint: PASS
  - Vitest: 94 files, 663 tests PASS
  - product design guard: 275 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
```

## 2026-07-13 Prometheus command polling API 완료

API 완성: submitPrometheusQuery (b92d081eb)
API 완성: getCommandStatus (b92d081eb)
API 완성: pollCommand (b92d081eb)
API 완성: runPrometheusQuery (b92d081eb)

- APIQ-027 claim 범위의 네 함수는 `AGENT_DEBUG_QUERY_PATH` 1회 POST receipt와
  `COMMAND_STATUS_PATH` GET polling만 사용한다. possibly-sent POST는 transport/network failure
  뒤에도 재전송하지 않는다.
- command status는 401/403/404/invalid payload를 공용 API 오류 경계로 보존하고, polling은
  queued/leased/running 동안 GET만 반복한다. failed terminal은 추가 GET 없이 반환하거나
  `runPrometheusQuery`에서 명시적 `MetricQueryExecutionError("failed")`로 승격한다.
- completed telemetry result는 query name, action, point_count, empty-result를 검증하고 raw
  command result를 제품 소비 값에 누출하지 않는다.
- 코드 커밋 `b92d081eb`는 `origin/woonyong/ui-layer-lab`의 ancestor다.

```text
명령: npx vitest run src/product/api/metrics-command.test.ts src/product/api/metrics-command-run.test.ts src/product/api/metrics.test.ts src/product/app/apiBoundary.test.ts --reporter verbose
결과: PASS — 4 files, 27 tests

명령: npm run check
결과: PASS (2026-07-13 07:23~07:30 KST)
  - TypeScript / ESLint: PASS
  - Vitest: 95 files, 674 tests PASS
  - product design guard: 278 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS
```

## 2026-07-13 API queue batch anchors

API 완성: listApplications (56c689e61)
API 완성: getApplication (56c689e61)
API 완성: listApplicationDeployments (56c689e61)
API 완성: listApplicationRuns (56c689e61)
API 완성: grantApproval (56c689e61)
API 완성: rejectApproval (56c689e61)
API 완성: restartDeployment (56c689e61)
API 완성: scaleDeployment (56c689e61)
API 완성: listRcaTimeline (c875efb1f)
API 완성: getRcaIncident (c875efb1f)
API 완성: listEvidence (c875efb1f)
API 완성: listRcaReports (c875efb1f)
API 완성: getRecoveryPlanByCorrelation (c875efb1f)
API 완성: selectRecoveryAction (c875efb1f)
API 완성: getClusterResourceUsageSeries (004f23d52)
API 완성: listMetricQueryPresets (004f23d52)
API 완성: runMetricQueryPreset (004f23d52)
API 완성: runTelemetryQuery (004f23d52)

- 세 코드 커밋은 모두 `origin/woonyong/ui-layer-lab`의 ancestor다.
- `56c689e61`은 Applications history, GitOps approval, workload deployment action 계약을
  보강했다.
- `c875efb1f`는 RCA list/detail, evidence/report, recovery action 계약을 보강했다.
- `004f23d52`는 usage series, metric query preset run, telemetry log query 계약을 보강했다.
- 현재 작업 트리에 untracked feature draft가 남아 있어 이번 heartbeat에서는 full UI gate를 깨끗한
  트리에서 재실행하지 않았다. 아래 targeted API contract test와 docs/manifest 검증만 완료 증거로
  남긴다.

```text
명령: npx vitest run src/product/api/rca-list.test.ts src/product/api/rca-detail.test.ts src/product/api/evidence.test.ts src/product/api/recovery.test.ts src/product/api/applications.test.ts src/product/api/approvals.test.ts src/product/api/deployments.test.ts src/product/api/metric-query-presets.test.ts src/product/api/telemetry.test.ts src/product/api/usage-series.test.ts --reporter verbose
결과: PASS — 10 files, 70 tests

명령: uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py -q
결과: PASS — 17 tests

명령: make manifest-check
결과: PASS — management 56, target 18
```

## 2026-07-13 API queue batch full gate 재검증

- 앵커 전 Metrics 화면 draft만 임시 격리하고, 위 batch anchor가 가리키는 세 API 코드 커밋이 모두
  포함된 `30bed7733` 스냅샷에서 전체 프론트 gate를 재실행했다.
- typecheck, lint, 전체 회귀 테스트, design guard, shadcn audit, production build가 모두 통과했다.
- 따라서 `56c689e61`, `c875efb1f`, `004f23d52`에 연결한 18개 exact completion anchor는 전체
  gate 근거까지 충족한다. 임시 격리한 Metrics draft는 앵커 발행 뒤 원상 복구해 레인 B에서
  분할·i18n·화면 검증을 계속한다.

```text
명령: npm run check
결과: PASS (2026-07-13 08:13~08:17 KST)
  - TypeScript / ESLint: PASS
  - Vitest: 97 files, 710 tests PASS
  - product design guard: 286 files PASS
  - shadcn source audit: 482 previews PASS, upstream 21e4ceb
  - Vite production build: PASS (14,506 modules transformed)
```

## 2026-07-13 테마 첫 페인트 검증

- 저장 테마와 시스템 테마를 반대로 설정한 뒤 light/dark 각각 5회 새로고침했다.
- 각 새로고침의 최초 5개 animation frame에서 `documentElement.className`,
  `style.colorScheme`, 계산된 배경색을 기록했다.
- light는 전 프레임 `class=""`, `colorScheme=light`, `oklch(1 0 0)`이었고 dark는 전 프레임
  `class=dark`, `colorScheme=dark`, `oklch(0.145 0 0)`이었다. 투명 또는 반대 테마 프레임은 0개다.
- 상세 결과와 10개 스크린샷은 `theme-first-paint-evidence-20260713.md` 및
  `theme-flash-{light,dark}-{1..5}.png`에 기록했다.

## 2026-07-13 APIQ-019 AI conversation 계약 완료

- 코드 커밋 `84dc48a68`은 `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- strict list/detail/accepted envelope와 open conversation/message JsonMap을 함께 검증했다.
  ID·AbortSignal·200 receipt를 고정했고 POST는 transport 실패 시 자동 재전송하지 않는다.
- targeted 2 files / 20 tests와 full `npm run check`가 통과했다. full gate는 104 files /
  750 tests, design guard 312 files, shadcn 482 previews, production build PASS다.

API 완성: listAiConversations (84dc48a68)
API 완성: getAiConversation (84dc48a68)
API 완성: createAiConversation (84dc48a68)
API 완성: appendAiMessage (84dc48a68)

## 2026-07-13 APIQ-015 Catalog 조회 계약 완료

- 코드 커밋 `1ad595b42`는 `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- `origin/dev`의 `CatalogItemListResponse(items: list[JsonMap])`와
  `CatalogItemResponse(item: JsonMap)`을 대조해 외피는 strict close, item은 open JsonMap으로
  유지했다. pagination·filter·install 계약은 추가하지 않았다.
- 목록·상세의 AbortSignal, ID 선검증, 경로 인코딩, 404, malformed payload, open item 확장
  필드 보존, list/detail 외피의 미정의 필드 거부를 5개 계약 테스트로 검증했다.
- full `npm run check` PASS: 105 files / 757 tests, design guard 314 files, shadcn 482 previews,
  Vite production build.

API 완성: listCatalogItems (1ad595b42)
API 완성: getCatalogItem (1ad595b42)

## 2026-07-13 APIQ-030 감사 타임라인 조회 계약 완료

- RED `6700875a6`은 당시 route가 없던 endpoint를 대상으로 strict envelope/item, nullable
  `causation_id`, open `payload_summary`, 불투명 cursor, 1~200 limit, AbortSignal과 422 오류
  계약을 먼저 고정했다.
- GREEN `9841a5d95`는 조회 함수와 strict Zod schema를 구현했다. 계약 증거 보강 커밋
  `4c2598c4a`는 `AUDIT_TIMELINE_PATH`를 공개 상수로 고정하고 동일 커밋에 public export 계약
  테스트를 포함했다. 세 커밋 모두 `origin/woonyong/ui-layer-lab` ancestor 검증 대상이다.
- targeted 1 file / 11 tests와 full `npm run check`가 통과했다. full gate는 106 files /
  768 tests, design guard 317 files, shadcn 482 previews, production build PASS다.

API 완성: getAuditTimeline (4c2598c4a)

## 2026-07-13 BQ-017 클러스터 스키마 호환 재검증

- `bfaf03901`에 `ClusterSummary.provider`와
  `ClusterConnectionStatus.connection_stage`의 optional enum이 명시적으로 열려 있다.
  두 응답 외피의 `strictObject`는 유지되며 enum 밖 값은 계속 거부한다.
- `bfaf03901`은 현재 HEAD와 `origin/woonyong/ui-layer-lab`의 ancestor(exit 0)다.
- `clusters.test.ts`, `cluster-connection.test.ts` targeted 검증은 2 files / 17 tests PASS다.

## 2026-07-13 VP-002 감사 타임라인 화면 완료

- 화면 RED `003a9563a`, API 계약 재앵커 `4c2598c4a`, UI GREEN `fdc921c3d`,
  상태·테스트 책임 분리 `9bedcdfa5` 순서로 완료했다.
- Issues 상세는 서버 순서를 그대로 보존하며 opaque cursor를 누적한다. scope 전환과 unmount에서
  진행 중 요청을 취소하고, 다음 페이지 실패 시 이미 표시한 감사 이벤트는 유지한다.
- `npm run check` PASS (2026-07-13 14:00 KST): TypeScript / ESLint, Vitest 108 files /
  773 tests, product design guard 326 files, shadcn source audit 482 previews,
  Vite production build 14,529 modules.
- `npm run visual-product` PASS: 35 isolated scenarios, exact scenario API requests,
  unexpected feature network / WebSocket 0건. 증거 화면은
  `references/ui-layer-lab/output/playwright/product-issues-authenticated-detail-desktop-light.png`다.

## 2026-07-13 APIQ-031 인시던트 최근 변경 계약 완료

- RED `c6bd3babe`는 strict response/item, nullable 3필드, 서버 순서, 빈 성공, limit·ID·AbortSignal,
  concealed 404와 malformed payload 계약을 먼저 고정했다.
- GREEN `4f602cc86660a7f8a12583cffc44a53e220d9dbf`는 endpoint·strict Zod·RCA barrel을 구현하고
  공개 경로 템플릿을 실제 요청 생성의 단일 출처로 사용한다. 이 커밋은
  `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- targeted 검증은 recent changes와 API boundary 2 files / 18 tests PASS다.
- full `npm run check` PASS: TypeScript·ESLint, Vitest 109 files / 788 tests,
  product design guard 329 files, shadcn source audit 482 previews,
  Vite production build 14,531 modules.
- 서버 응답에 incident 발생 시각·구조화 PR 번호가 없어 상대 시각과 PR 번호는 추측하지 않고,
  UI는 절대 시각과 일반 Pull request 링크만 소비한다.

API 완성: getIncidentRecentChanges (4f602cc86660a7f8a12583cffc44a53e220d9dbf)

## 2026-07-13 VP-004 인시던트 최근 변경 화면 완료

- UI RED `f9a982f4f`는 empty 성공에서 region·card·제목이 전부 없어야 하는 불변식,
  서버 순서·native list·절대 시각, nullable PR 링크, 실패 격리와 incident ID 없는 행의
  endpoint 미호출을 먼저 고정했다.
- UI GREEN `78668b32204e3b30d5c50b9338c3593bdebe852a`는 canonical·adapter·독립 panel·i18n·
  composition root·browser fixture를 연결했다. 이 커밋은
  `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- 빈 성공은 카드 자체를 렌더하지 않고 404·invalid-response·unavailable은 최근 변경 panel에만
  격리한다. 서버 순서와 원문 workload·image·commit·repository·workflow를 보존하며,
  안전한 HTTP(S) PR URL만 외부 링크로 렌더한다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 112 files / 802 tests,
  product design guard 336 files, shadcn source audit 482 previews,
  Vite production build 14,535 modules.
- `npm run visual-product` PASS: 기존 전 시나리오와 영어 Issues desktop·320px reflow를 통과했다.
  증거는 `output/playwright/product-issues-authenticated-detail-desktop-light.png`와
  `output/playwright/product-issues-authenticated-detail-reflow-320-light.png`다.

## 2026-07-13 APIQ-032 승격 게이트 조회 계약 완료

- RED `1e06706c9`는 nested unknown field, eligible 판정 불일치, 실패 리소스 개수 불일치,
  tri-state 보조 필드 불일치를 먼저 실패시켰다.
- GREEN `429fb1d9122c6bf264f5ee1beef948107bb5161e`는 outer strict / run loose /
  `promotion_gate` strict 경계와 공개 `APPLICATION_RUNS_PATH`를 구현했다. run의 additive 필드는
  parse 후에도 보존하며 gate 내부 unknown field는 거부한다.
- full `npm run check` PASS: TypeScript·ESLint, Vitest 112 files / 808 tests,
  product design guard 336 files, shadcn source audit 482 previews,
  Vite production build 14,535 modules.
- Applications API의 서버측 Cluster filter와 cursor가 없어 VP-005 화면 release는 주차했다.
  제한 응답의 클라이언트 필터로 completeness를 위장하지 않는다.

API 완성: listApplicationRuns (429fb1d9122c6bf264f5ee1beef948107bb5161e)

## 2026-07-13 APIQ-033 클러스터 등록 전송 계약 완료

- claim `3adb92bdd`, API RED `065f84ab1`, ClusterSummary stage RED `482009c1f`,
  GREEN `8678d63b0`을 순서대로 분리했다. GREEN은
  `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- provider catalog·registration discovery·target preflight·target register의 외피와 typed row를
  strict close했다. backend가 JsonMap으로 선언한 category record·deploy provider·labels·selected와
  요청 `provider_config`만 open으로 유지했다.
- 등록 요청은 `workspace_id`를 받거나 전송하지 않는다. one-time agent token·manifest·bootstrap
  command는 응답 계약에서만 검증하며 자동 재전송·로그·URL·storage·query cache 소비를 금지한다.
- `ClusterSummary.connection_stage`를 canonical 7단계 optional enum으로 열고 기존 connection 응답과
  install receipt도 단일 `connectionStageSchema`를 재사용한다. strict row와 enum 밖 값 거부는 유지된다.
- targeted 3 files / 30 tests PASS. full `npm run check` PASS: TypeScript·ESLint,
  Vitest 113 files / 821 tests, product design guard 340 files, shadcn source audit 482 previews,
  Vite production build 14,538 modules.
- VP-008 UI는 preflight/register validation 정합, 발급 전 command preview 또는 정본 순서 변경,
  명시적 receipt resume/reissue, structured stage error 계약이 착륙할 때까지 주차한다.

API 완성: getProviderCatalog (8678d63b0)
API 완성: getProviderClusterDiscovery (8678d63b0)
API 완성: preflightTargetRegistration (8678d63b0)
API 완성: registerTarget (8678d63b0)

## 2026-07-13 VP-006 BLOCKED — auto-revert 식별 계약 결손

- BQ-007 canonical merge `6d68325bf1cc47f55810e5dc2189e51a6fe916c0`은 `origin/dev`
  ancestor exit 0이다. flag off 무발화와 generic Safe PR 발행은 구현·테스트로 확인했다.
- 현재 RCA timeline은 generic Safe PR의 subject/status/PR URL/failure reason만 projection한다.
  auto-revert request의 유일한 흔적은 worker 내부 title prefix이며 공개 DTO가 아니다.
- 일반 Safe PR을 revert PR로 오표시하지 않도록 APIQ와 제품 표면을 만들지 않았다.
  재개 조건은 stable auto-revert discriminator와 incident/run exact scope를 포함한 canonical 계약·앵커다.

## 2026-07-13 VP-009 provider 표시 일관화 부분 완료

- unknown glyph RED `a0e124b92`, Home 단일 표시 RED `4a0937c54`, GREEN
  `3fe308f95` 순서로 분리해 push했다. GREEN은 `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- Home 상태 카드 헤더는 선택된 canonical provider를 `ClusterProviderIcon`으로 정확히 1회 표시하고,
  cluster 미선택에서는 아이콘을 렌더하지 않는다. unknown은 일반 Kubernetes glyph다.
- Issues는 모든 released route에 상주하는 전역 `ClusterScopePicker`가 이미 동일 컴포넌트로 provider를
  1회 표시하므로 목록·행·상세에 중복하지 않았다.
- Fleet는 제품 surface와 provider-bearing fleet contract가 모두 없어 BE-Gap으로 분리했다. 제한된
  클러스터 목록과의 client join, inferred provider, placeholder UI는 만들지 않았다.
- targeted 2 files / 10 tests PASS. full `npm run check` PASS: TypeScript·ESLint,
  Vitest 113 files / 824 tests, product design guard 340 files, shadcn source audit 482 previews,
  Vite production build 14,538 modules.
- `npm run visual-product` PASS: 36 isolated scenarios, light/dark·320px·200% text·forced colors·
  en/ko 포함, exact scenario API requests, unexpected feature network/WebSocket 0건.
- standalone `npm run build` PASS: 14,538 modules, `dist` 26 MiB / 2,675 files,
  `ProductApp-C79itfkb.js` 319 KiB, `ProductApp-Dh-KDTNp.css` 77 KiB.

## 2026-07-13 S1 Issues 확대·강제색 회귀 게이트 완료

- RED `f5413960a`에서 Issues 상세의 200% text resize와 forced-colors 시나리오를
  먼저 추가해 화면 전용 강제색 검증 결손을 재현했다.
- GREEN `2693c5c8bc8c698b8535aec9574d82904fa4b6a5`에서 Issues 상세·최근 변경·PR 링크,
  전역 Cluster selector, 선택 Issue의 keyboard focus를 system colors로 검증한다.
  공용 Card와 Button은 forced-colors 경계·focus·disabled 상태와 reduced-motion 전환을 보존한다.
- full `npm run check` PASS: Vitest 113 files / 824 tests, design guard 340 files,
  shadcn 482 previews, Vite build 14,538 modules. `npm run visual-product`는 38개 격리
  시나리오와 unexpected network/WebSocket 0건으로 PASS했다.
- 증거: `output/playwright/product-issues-authenticated-detail-text-resize-200-light.png`,
  `output/playwright/product-issues-authenticated-detail-forced-colors.png`.
