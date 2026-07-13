---
title: F0~F6 적용 조율 계획 (마스터)
status: active-coordination
date: 2026-07-13
scope: 백엔드 세션 + 프론트 세션 공통 규칙
source_of_truth: docs/oss-remediation-roadmap.md (F 정의), src/packages/contracts/gateway/routes.py (계약 정본)
backend_queue: docs/backend-f-workqueue.md
frontend_map: (final repo) docs/spec/frontend/verified-pipeline-insertion-map.md
---

# F0~F6 적용 조율 계획

이 문서는 사람(우녕)이 두 작업 세션(백엔드/프론트)에 전달하는 공통 계약이다.
각 세션은 자기 큐 문서만 수정하고, 이 문서는 읽기 전용으로 취급한다.

## 1. 전 세션 공통 불변식 (위반 = 즉시 중단 후 보고)

1. **additive-only**: 기존 event envelope/body/response/DB 컬럼의 rename·삭제·타입 변경 금지.
   새 route, 새 필드(optional), 새 테이블/컬럼, 새 워커(구독자)만 허용한다.
2. **F5만 행동 변경**: RolloutDiagnosed→revert PR 배선은 env flag
   (`RECOVERY_ENABLE_AUTO_REVERT_PR`, 기본 false) 뒤에서만 발화한다. flag off 상태로 merge한다.
3. **BE-Gap 규율 유지**: 프론트는 backend 완성 앵커가 없는 기능을 렌더하지 않는다.
   disabled UI·synthetic 데이터로 위장하지 않는다.
4. **소유권 경계 유지**: routes/requests/responses/router = 백엔드 세션.
   endpoint 함수·Zod = API 작업자(api-needs.md 경유). 화면·adapter = 프론트 세션.
   서로의 파일을 수정하지 않는다.
5. **동시 작업 lock**: `src/packages/contracts/gateway/**`를 건드리는 백엔드 작업은
   동시에 1건만(backend-f-workqueue.md의 `in_progress` 1행 규칙).
6. 기존 reference-contract-map.md의 REF-API-001~136 행은 **동결**. 수정 금지.

## 2. 순서와 게이트

```
[백엔드]  BQ 큐 순서대로 계약+구현+테스트 → progress에 "계약 완성:" 앵커
   ↓ (앵커가 유일한 신호. 앵커 없으면 프론트는 움직이지 않는다)
[프론트]  verified-pipeline-insertion-map.md 해당 행을 "backend 선행" → "어댑터/직결"로 갱신
   ↓
[프론트]  api-needs.md에 APIQ 행 추가 (기존 형식 그대로)
   ↓
[API 작업자] claim → 구현 → "API 완성:" 앵커
   ↓
[프론트]  화면/adapter 구현 (기존 primitive 재사용 우선)
```

게이트 정의:
- **G1 (계약)**: 백엔드 앵커 + `bash scripts/test.sh` 통과 + Bruno collection 추가.
- **G2 (API)**: `API 완성:` 앵커 (기존 api-needs 규칙 그대로).
- **G3 (화면)**: BE-Gap 규율 준수 확인 + `npm run check` 통과.

프론트는 백엔드가 늦어도 기존 34개 어댑터 작업을 계속한다. 데드락 없음.

## 3. 세션별 시작 지시문 (사람이 복사해서 각 세션에 전달)

**백엔드 세션에게:**
> `docs/f-coordination-plan.md`(공통 불변식)과 `docs/backend-f-workqueue.md`(작업 큐)를 읽어라.
> 큐의 권장 순서대로 한 행씩 claim하고, 행의 완료 기준을 전부 충족한 뒤 앵커를 기록해라.
> 기존 계약의 변경이 필요해 보이면 작업하지 말고 blocked로 표시하고 사유를 적어라.

**프론트 세션에게:**
> (final repo) `docs/spec/frontend/verified-pipeline-insertion-map.md`를 읽어라.
> 이 문서는 reference-contract-map §5와 같은 규율의 부록이다. REF 136행은 동결이며,
> 새 삽입점 행은 백엔드 `계약 완성:` 앵커가 확인된 것만 판정을 갱신하고
> api-needs.md에 APIQ 행을 추가해라. 앵커 없는 행은 "backend 선행" 그대로 두고 렌더하지 않는다.

## 4. 충돌·오류 시 규칙

- 두 세션이 같은 파일을 수정해야 하는 상황이 발견되면 = 설계 오류. 중단하고 사람에게 보고.
- 백엔드 테스트 실패 상태에서 앵커 기록 금지 (프론트 오염 방지의 유일한 방어선).
  단, **다른 작업열 소유의 기존 실패(pre-existing failures)가 있는 동안은 델타-그린 규칙을
  적용한다**: (1) 착수 전 실패 테스트를 **개별 node id로** baseline에 기록(건수 아님),
  (2) 완료 시 실패 집합이 baseline과 동일하거나 축소 + 해당 BQ의 신규 테스트 전부 통과 =
  앵커 허용, (3) baseline에 없는 신규 실패 1건이라도 있으면 앵커 금지, (4) baseline은
  줄어들 수만 있고 늘어날 수 없다. baseline과 소유 작업열은 progress 파일에 명시하고,
  델타-그린으로 기록된 앵커에는 `[delta-green]` 표기를 붙인다. 기존 실패가 전부 해소되면
  이 규칙은 자동 만료되고 전체 통과 규칙으로 복귀한다.
- 앵커 hash는 canonical branch의 ancestor여야 한다 (api-needs와 동일 규칙).
- 이 문서와 하위 큐 문서가 충돌하면 이 문서가 이긴다. 로드맵과 이 문서가 충돌하면 로드맵이 이긴다.

### 4b. 착륙(landing) 규칙

1. 앵커 hash의 canonical은 통합 브랜치인 `origin/dev`다. feature 브랜치 자기 자신을
   대상으로 한 `git merge-base --is-ancestor` 증명은 순환이므로 무효다.
2. feature 브랜치의 앵커는 해당 hash가 `origin/dev`의 ancestor로 편입된 시점부터 유효하다.
   착륙은 `git ls-remote`로 원격 dev HEAD를 확인하거나 `origin/dev`에서 해당 실물 파일·커밋의
   존재를 확인해 증명한다. 뒤처질 수 있는 로컬 `dev` HEAD를 canonical로 오인하지 않는다.
3. Codex는 감독 세션의 검증과 명시적 GO 전에 앵커를 커밋하지 않는다.

## 5. 완료 정의

BQ-001~BQ-007 앵커 완료 + insertion-map 전 행 직결/어댑터 판정 + G3 통과.
F0(in-process bus)는 프론트와 무관한 독립 트랙으로, 완료 정의에 포함하지 않는다.
