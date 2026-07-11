---
title: Codex 24시간 실행 진행 기록
status: active
date: 2026-07-11
directive: codex-directive-24h-20260711.md
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
