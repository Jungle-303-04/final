---
title: 프론트 API 요청 큐
status: active-coordination-queue
date: 2026-07-13
owners: Codex 요청 / API 연결 작업자 claim·처리 / F 트랙 행(APIQ-029)·계약 갱신(APIQ-012)은 검토자 기록
workorder: api-integration-workorder-20260711.md
snapshot: 1행·2함수 / requested 1 / in_progress 0 / blocked 0 / valid completion anchors 49
---

# 프론트 API 요청 큐

이 파일은 goalmode §6b의 단일 작업 큐다. API 작업자는 이 표에서 원자적으로 claim한 함수군만
`references/ui-layer-lab/src/product/api/**`에 구현·검증한다. Codex는 progress 파일에 정확한
`API 완성: <함수명> (<코드 커밋 hash>)` 앵커가 생긴 함수만 소비한다.

상세한 경로, 소유권, schema, test, mutation 안전, 2커밋 완료 절차는
`api-integration-workorder-20260711.md`가 정본이다.

> **다음 claim 고정 순서 (2026-07-13 파이프라인 A단계 갱신):**
> `APIQ-019` → `APIQ-015`.
> BQ-001·BQ-003의 `origin/dev` 착륙은 파이프라인 A단계 명령으로 재검증했다.
> 각 행의 완료 앵커와 조율 커밋이 원격에 반영된 뒤에만 다음 행을 claim한다.

## 1. 상태와 claim 규칙

1. 상태는 `requested`, `in_progress`, `blocked`만 쓴다.
2. claim 전 최신 원격의 queue와 progress를 확인한다.
3. `requested` 행 하나를 `in_progress`로 바꾸고 `담당/브랜치`, `claim·heartbeat`를 채운 조율
   커밋을 먼저 push한다.
4. 전체 queue에서 `in_progress`는 동시에 한 행만 허용한다. 이것이 모든 행이 공유하는 `index.ts`와
   일부 공용 schema·test 파일의 file lock이다. 한 행의 일부 함수만 claim하지 않는다.
5. `in_progress`의 마지막 heartbeat가 24시간 지나기 전에는 다른 작업자나 Codex가 인수하지
   않는다. 회수 커밋이 원격에 반영된 뒤에만 재claim할 수 있다.
6. blocker가 생기면 상태를 `blocked`로 바꾸고 원인·재현·선행 작업·재개 조건을 비고에 적는다.
7. 코드 커밋 A가 `origin/woonyong/ui-layer-lab`에 push되고 full gate가 통과한 뒤 progress EOF에
   함수별 exact 앵커를 추가한다. 앵커 hash는 canonical branch의 ancestor여야 한다.
8. 함수군의 모든 앵커가 확인된 뒤에만 행을 제거한다. 완료 전 일부 함수 export를 제품이 소비하지
   않는다.
9. `client.ts`, `url.ts`, 화면, adapter, backend는 이 큐의 수정 권한 밖이다.
10. canonical branch force-push 금지. feature branch를 썼다면 merge/cherry-pick 후의 최종 hash만
    앵커로 기록하고, squash/rebase로 이미 기록한 hash를 제거하지 않는다.
11. 24시간 대행도 `in_progress` 1행 lock과 코드·조율 2커밋 절차를 그대로 지킨다. `APIQ-001`,
    `APIQ-002`, `APIQ-003`, `APIQ-004`, `APIQ-007`, `APIQ-008`, `APIQ-022`, `APIQ-023`, `APIQ-024`, `APIQ-025`, `APIQ-026`은 완료 앵커가 있으므로
    다음 대행은 queue의 P0·P1·P2 순서를 따른다. 원 요청 시각·대행
    시작 시각·경과 시간·사유를 progress EOF에 남긴다.
12. API 작업자가 복귀하면 대행자가 이미 claim한 행만 완료하고 다음 행부터 양보한다.
13. `index.ts` 병목은 임의 barrel 분리의 근거가 아니다. progress에 도메인별 barrel 제안서를 먼저
    올리고 검토자 승인을 받은 뒤에만 구조를 변경한다.
14. (2026-07-13 검토자 결정) 착륙 대기로 **동결**된 `in_progress` 행은 코드 파일을 수정하지
    않는 상태이므로 규칙 4의 lock을 점유하지 않는다. 동결 행을 제외한 `in_progress`는
    여전히 동시 1행만 허용한다. 동결 해제는 검토자 지시로만 한다.
15. (2026-07-13 검토자 결정 — 완성 스프린트 병렬 모드) 규칙 4의 동시 1행 제한을 **레인 단위
    소유권**으로 대체한다. 규칙 13의 도메인별 barrel 분리를 승인한다: fan-out 전에 통합자가
    `index.ts`를 도메인 barrel로 분리하는 선행 커밋 1개를 만들고, 이후 각 레인은 자기 도메인
    barrel·자기 파일만 수정한다. 공유 파일(라우터·셸·네비·테마·`index.ts` 재수출)은 통합자
    단독 소유. 두 레인이 같은 파일을 수정해야 하면 설계 오류 — 중단 후 보고. 동결 행(029)과
    §4b 대기(012)는 병렬 모드에서도 그대로다.

queue coordinator와 행 분할·회수·unblock 승인 주체는 현재 primary Codex 작업(`/root`)이다.
`claim·heartbeat`는 queue 시각 갱신 커밋이 canonical branch에 push된 경우에만 유효하다. 대상 파일의
`test` 표기는 첫 endpoint 파일과 같은 stem의 `<domain>.test.ts`다.

시각 형식:

```text
담당/브랜치: <작업자 식별자>@<branch>
claim·heartbeat: YYYY-MM-DD HH:mm KST
```

## 2. 신규 endpoint 함수·schema

| ID | 우선 | 함수명 | routes.py 상수 | 대상 파일 | 필요한 화면 | 요청 시각 | 상태 | 담당/브랜치 | claim·heartbeat | 완료 조건·주의 |
|---|---:|---|---|---|---|---|---|---|---|---|
| `APIQ-015` | P3 | `listCatalogItems`, `getCatalogItem` | `CATALOG_ITEMS_PATH`, `CATALOG_ITEM_PATH` | `catalog.ts`, `catalog-schemas.ts`, test | provider-neutral Catalog | 2026-07-11 16:19 KST | requested | — | — | item JsonMap 보존; pagination/filter 발명 금지; install 제외 |

## 3. 기존 구현 검증·승인

아래 함수는 이미 존재하지만 exact 완료 앵커가 없다. claim한 작업자는 실응답·schema·URL·오류·
AbortSignal contract test를 추가하고, 필요한 경우 claim 범위 안에서만 구현을 보정한다. 코드 변경이
없어도 test commit hash가 완료 앵커의 코드 hash가 된다.

| ID | 우선 | 함수명 | routes.py 상수 | 대상 파일 | 필요한 화면 | 요청 시각 | 상태 | 담당/브랜치 | claim·heartbeat | 완료 조건·주의 |
|---|---:|---|---|---|---|---|---|---|---|---|
## 4. 큐 밖 Backend gap과 realtime

- route 자체가 없는 `BE-Gap-*`은 이 큐에 넣지 않는다. backend semantic contract가 먼저다.
- repo/provider/target/org/alert/dead-letter 함수는 현재 필요한 화면이 확정되지 않아 아직 요청하지
  않았다. routes가 있다는 이유만으로 만들지 않는다.
- WebSocket `/api/live/browser`는 HTTP queue와 분리한다. connection·handshake·resume·sequence gap
  contract test와 `API 완성: connectRealtime (<hash>)` 앵커 전에는 제품에서 소비하지 않는다.
- `client.ts`는 `af03639ee`의 no-content 계약 이후 다시 동결됐다. transport 변경이 다시 필요하면
  해당 행을 새 blocker ID로 `blocked` 처리하고 coordinator 승인을 기다린다.
