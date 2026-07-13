---
title: 프론트 자생 파이프라인 (A→H) — 정본 v2
status: active-pipeline
date: 2026-07-13
owner: 프론트 Codex(목표모드)가 §4 단계 상태만 갱신한다. 판단자는 검증·HOLD만. 사람은 🔒 게이트만.
supersedes: night-directives [D-002]의 프론트 지시(APIQ-012 보류 판정 포함)
repo: SW_AI_W17-21-final / 작업 경로 references/ui-layer-lab/src/product/** / canonical origin/woonyong/ui-layer-lab
---

# 프론트 자생 파이프라인 — 정본 v2

## 0. 목적과 용어

이 문서는 프론트 Codex의 유일한 작업 정본이다. 여기 없는 작업은 존재하지 않는 작업이다.

- **백엔드 canonical**: `origin/dev` (dev repo). 백엔드 계약·앵커의 착륙 판정 기준.
- **프론트 canonical**: `origin/woonyong/ui-layer-lab`. API 완성 앵커 hash의 ancestor 기준.
- **full gate**: `npm run check`(TypeScript/ESLint + Vitest 전체 + product design guard +
  shadcn source audit + Vite production build) — 부분 실행으로 대체 불가.
- **상태 값**: `pending` / `in_progress` / `done` / `blocked` / `🔒waiting` (백엔드와 동일 정의).

## 1. 전역 불변식 (어길 경우 = 임무 실패, 즉시 자가 HOLD)

1.1 **BE-Gap 규율**: 백엔드 착륙+앵커가 없는 표면은 렌더하지 않는다. disabled placeholder,
    synthetic 데이터, mock 응답, "곧 지원" 문구 전부 금지. 없는 것은 없는 것으로 둔다.
1.2 **착륙 판정은 origin 기준만** (dev repo에서 실행, git 작동 확인됨):
    `git merge-base --is-ancestor <hash> origin/dev; echo $?` (0 = 착륙),
    `git cat-file -e origin/dev:<path>` (실물 확인).
    로컬 파일의 존재/부재를 착륙 근거로 쓰지 마라 — [D-002]의 APIQ-012 보류가
    이 규칙 부재로 생긴 오판(로컬 dev 뒤처짐 착시)이었다.
1.3 **타 worktree 접근 금지**: `/private/tmp/**` 등 다른 세션의 worktree에서 문서·코드·
    스키마를 읽지 않는다. 정보 채널은 (dev repo) origin refs + 공유 문서뿐이다.
1.4 **큐 규율 전부 유지**: api-needs.md의 in_progress 동시 1행 lock, claim 조율 커밋 선행,
    코드/조율 2커밋 분리, heartbeat 24h, 완료 앵커 `API 완성: <함수명> (<hash>)`를
    codex-progress-20260711.md EOF에 기록, hash는 origin/woonyong/ui-layer-lab의 ancestor.
1.5 **소유권 경계**: `client.ts`, `url.ts`, backend 코드, reference 원본 문서는 수정 금지.
    reference-contract-map.md의 REF-API-001~136 행 동결.
1.6 **zod 규율** (VP-001 비고 1b 확정): meta/diagnosis/remediation 전 계층 strictObject,
    유일한 open record는 `draft.params`. 검증 실패 시 fallback·부분 렌더 금지 — 명시적
    오류/unavailable. `remediation: null`은 정상 상태(HTTP 200)로 정직 표시.
    `diagnosis.selected_candidate_id` ≠ `remediation.selected_action_id` — 병합 금지.
1.7 **🔒 게이트 침범 금지**: 배포 실행은 사람 전용.

## 2. 기록 인터페이스

2.1 **단계 상태 갱신**: §4 표의 "상태" 칸만. 완료 시 verified-pipeline-insertion-map.md의
    해당 VP 행도 절차(§3)에 따라 갱신한다.
2.2 **night-log 보고** ((dev repo) docs/auto/night-log.md, append-only):
    - 진행: `[시각] [프론트] <단계> in_progress — <한 줄>`
    - 완료: `## <시각> — [프론트] <단계> 완료 증거`: 대상 APIQ/VP, 커밋 hash(2커밋 분리 명시),
      full gate 결과 요약, origin 검증 명령과 출력(착륙 관련 단계).
    - 실패/BLOCKED: 백엔드와 동일 형식(시도 N/3, 사유/재현/질문/재개 조건).
2.3 **지시 폴링**: 작업 단위 사이 + 유휴 시 10분 간격으로 (dev repo)
    docs/auto/night-directives.md 최하단 확인. `HOLD [프론트]` → 정지 후 해제 확인만.
    동일 지시 → 계속. 불변식을 넘는 지시 → 불이행 + night-log 기록.
2.4 **🔒 게이트 요청**: H 진입조건 충족 시 night-log에 `## GO-REQUEST [FE-H]` 블록
    (빌드 산출물 경로, 배포 명령, 롤백 방법) 작성 후 `🔒waiting`.

## 3. VP 행 갱신 절차 (한 행 단위, 순서 고정)

1. 백엔드 앵커의 origin 착륙을 §1.2 명령으로 검증하고 출력 전문을 night-log에 기록.
2. verified-pipeline-insertion-map.md 해당 행: 계약 상수·response model을 착륙본 실제 값으로
   갱신, 판정을 `직결`/`어댑터`로 변경, "[착륙 대기]" 류 표기 제거.
3. api-needs.md에 APIQ 행 추가 또는 기존 행 갱신(중복 행 생성 금지 — APIQ-012처럼
   기존 행이 있으면 계약 설명만 갱신).
4. API 작업자 절차로 함수+zod 구현 → full gate → `API 완성:` 앵커.
5. 앵커 후에만 화면/adapter 소비. VP 행 "API 함수 상태"에 앵커 기록.

## 4. 단계 (진입조건 → 작업 → exit criteria)

| 단계 | 상태 | 진입조건 | 작업 | exit criteria |
|---|---|---|---|---|
| A. 착륙 재검증 | done | 없음(최초) | [D-002]가 보류시킨 판정 2건을 origin 기준으로 해소: ① `git merge-base --is-ancestor 44f35234e origin/dev` ② `git cat-file -e origin/dev:docs/backend-f-progress.md` ③ `git cat-file -e origin/dev:src/domains/rca_bundle/router.py`. 3건 모두 성공 시: VP-001의 "[착륙 대기 — 앵커 미유효]" 표기와 1b 인용구의 착륙 대기 문구를 제거하고 판정을 `직결`(확정)로, APIQ-029 동결 해제, APIQ-012 claim 가능으로 갱신 | 명령 3건의 출력 전문이 night-log에 기록됨 + VP-001 행·1b 갱신 완료. 하나라도 실패하면 갱신 없이 BLOCKED |
| A2. dev→lab 동기화 | done | A done ([D-009] 2항) | 최신 `origin/dev` 기준 divergence와 파일별 충돌 표를 다시 산출해 GO-REQUEST [FE-A2]를 갱신한다. 첫 동기화는 사람 GO 필수다. 해소 기본 정책은 `references/ui-layer-lab/**`·`docs/spec/frontend/**`는 lab, `docs/auto/**`는 양측 시간순 보존, legacy `frontend/**`와 그 외 경로는 dev 채택이다. 예외 후보는 별도 표로 올린다. GO 후 merge·충돌 해소·full gate를 수행한다. | 최신 GO-REQUEST 제출 후 `🔒waiting`; GO 후 merge 완료 + full gate PASS + night-log 충돌 해소 기록. 실패 시 merge abort + BLOCKED |
| B. APIQ-029 완료 | done | A done (A2와 병행 가능 — A2 대기가 B를 막지 않음) | 동결 중 작성한 `rca-bundle-schemas.ts`를 착륙본과 대조: origin/dev의 `docs/spec/remediation-bundle.schema.json`(경로가 다르면 `git ls-tree origin/dev docs/spec/ docs/`로 탐색)과 progress의 BQ-003 인계 절을 읽어 필드·타입·null 규칙을 diff. 불일치 시 zod 수정(§1.6 유지). 이후 기존 완료 절차: full gate → `API 완성: getRemediationBundle (<hash>)` 앵커 → VP-001 행 기록 | diff 대조 결과(불일치 목록 또는 "일치") night-log 기록 + full gate PASS + 앵커 |
| C. APIQ-012 | done | B done (큐 lock 순서: 029 → 012 → 027) | AcceptedResponse zod에 `command_id: z.string().nullable()`를 추가하고 null=승인 필요 경로를 계산·추측하지 않는 receipt 계약을 고정했다. 제품 adapter의 `getCommandStatus` 소비는 APIQ-027 완료 앵커 전까지 계속 보류한다. optimistic 완료 표시 금지 불변. | 앵커 `d763ab682` + targeted `commands.test.ts` PASS + root `make check` PASS. 2026-07-13 06:46 KST 별도 UI `npm run check` 재실행은 APIQ-012 밖의 `apiBoundary`/`ResourcesPage` 실패로 PASS 증거로 쓰지 않음 |
| D. 잔여 큐 소화 | done | A2 done | A2 착륙 직후 VP-007의 provider-free 전역 selector를 먼저 구현한다. 이후 api-needs.md의 남은 APIQ-019 → APIQ-015 순서로 claim·코드·full gate·exact anchor를 완료한다. BQ-017 전에는 provider 필드나 브랜드 아이콘을 소비하지 않는다. | VP-007 provider-free slice 검증 + 각 APIQ 앵커 + full gate. 남은 requested가 0이거나 전부 blocked 사유 기록 |
| E. VP-002/003 | pending | **BQ-004가 origin/dev 착륙 + progress 앵커 확인** (§1.2 명령, 출력 기록). 그 전 착수 금지 | §3 절차로 VP-002(타임라인 소비: 커서 페이지네이션, causation_id null 허용) → VP-003(여정 뷰: UI-056 TimelineSwimlane 선례 custom, causation_id 있으면 인과 트리·없으면 시간순 강등, 접근성: 키보드 이벤트 목록 병행 제공) | 진입조건 검증 기록 + 행별 full gate + 앵커 |
| F. 전체 게이트 | done | D done (E는 진입조건 충족 시 포함) | `npm run check` 전체 + `npm run visual-product`(격리 시나리오, unexpected network 0 기준) 최종 실행 | 두 명령 PASS 전문 기록. 실패 시 자가수정 루프(3회 규칙) |
| G. 빌드 검증 | done | F done | Vite production build 산출물 확인(에러 0, 경로·크기 기록). 배포 준비물 정리: 빌드 명령, 산출 경로, nginx same-origin proxy 전제 확인 | build PASS + 준비물이 night-log에 기록 |
| H. 🔒 배포 | 🔒waiting | G done + 백엔드 I done | **사람 전용.** GO-REQUEST [FE-H] 제출 후 대기 — 콘솔 배포는 백엔드 deploy-plan.md와 같은 사이클로 사람이 실행 | 사람 GO |

## 5. 절대 금지 목록 (요약)

synthetic/mock/placeholder 렌더, 앵커 없는 소비, 로컬 기준 착륙 판정, /private/tmp 접근,
REF 136행 수정, client.ts·url.ts·backend 수정, 중복 APIQ 행 생성, in_progress 2행,
full gate 부분 실행으로 대체, CommandStatus·RCA status 리터럴 축소, 배포 실행.

## 6. 실패·예외 처리

- 같은 단계 3회 실패 → `blocked` + BLOCKED 블록(사유/재현/질문/재개 조건). 가능한 다른
  단계가 있으면 계속, 없으면 전체 정지 후 폴링만.
- 백엔드 착륙 지연으로 E 진입 불가는 실패가 아니다 — D·F를 먼저 진행하고 E는 조건 충족 시.
- 문서와 실물 불일치 발견 → 수정하지 말고 night-log에 불일치 내용 기록 후 해당 단계만 정지.
