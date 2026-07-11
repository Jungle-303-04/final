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
