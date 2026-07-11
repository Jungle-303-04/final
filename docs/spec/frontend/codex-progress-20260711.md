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
