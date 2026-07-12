---
title: 백엔드 자생 파이프라인 (A→K) — 정본 v2
status: active-pipeline
date: 2026-07-13
owner: 백엔드 Codex(목표모드)가 §4 단계 상태만 갱신한다. 판단자는 검증·HOLD만. 사람은 🔒 게이트만.
supersedes: night-directives [D-001]~[D-003]의 백엔드 지시 전부
verified_facts_as_of: 2026-07-13 04:30 KST (night-log 증거 기준)
---

# 백엔드 자생 파이프라인 — 정본 v2

## 0. 목적과 용어

이 문서는 백엔드 Codex의 유일한 작업 정본이다. 여기 없는 작업은 존재하지 않는 작업이다.

- **canonical**: `origin/dev`. 착륙(landed) = 해당 커밋이 origin/dev의 ancestor.
- **lane**: BQ 하나가 진행되는 feature 브랜치 + 전용 worktree. lane 밖 작업 금지.
- **전체-그린**: `bash scripts/test.sh` 전체 통과. [D-012] 이후 모든 단계의 유일한 테스트 기준.
- **상태 값**: `pending`(진입조건 미충족 또는 미착수) / `in_progress`(수행 중) /
  `done`(exit criteria 증거와 함께 완료) / `blocked`(3회 실패 자가 HOLD) / `🔒waiting`(사람 대기).

## 1. 전역 불변식 (어길 경우 = 임무 실패, 즉시 자가 HOLD)

1.1 **additive-only**: 기존 event envelope/body/response schema/DB 컬럼의
    rename·삭제·타입 변경 금지. 허용되는 것: 새 route, optional 신규 필드,
    새 테이블/컬럼(nullable), 새 구독자 워커, 신규 파일.
1.2 **frozen paths** — 아래 경로의 기존 파일 변경 0건 (신규 파일 추가는 BQ 정의가
    명시적으로 요구할 때만):
    `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py`
1.3 **gateway 계약 lock**: `src/packages/contracts/gateway/**`를 수정하는 단계(C·D·E)는
    동시에 정확히 1개만 in_progress. F는 계약 무접촉이므로 병행 허용.
1.4 **baseline 공집합 / 전체 통과 기준** ([D-012], 2026-07-13 07:07 KST):
    - 실패 baseline: **공집합** (pytest·Ruff format·import-linter 전부 해소).
    - manifest: PASS 상태(management 68, target 20)가 기준
    - **축소 프로토콜([D-011])**: R-트랙의 night-log 완료 증거 + 백엔드 lane 재확인
      두 기록이 모두 있을 때만 이 목록에서 항목을 제거한다(이 편집은 허용 예외).
      baseline 공집합 도달 시 델타-그린 자동 만료 → 전체 통과 규칙 복귀.
    - 재확인 증거: origin/dev `257f91846`, R HEAD `82028604d` ancestor exit 0,
      `bash scripts/test.sh` → Ruff/format PASS, import-linter 2 kept/0 broken,
      pytest 1646 passed/3 skipped. 이후 모든 단계는 전체-그린만 인정한다.
1.5 **착륙 판정은 origin 기준만**: `git ls-remote origin refs/heads/dev`,
    `git merge-base --is-ancestor <hash> origin/dev`(exit 0 = 착륙),
    `git cat-file -e origin/dev:<path>`(실물 확인). 로컬 브랜치 HEAD·로컬 파일 존재를
    착륙 근거로 쓰지 마라 — 이 규칙 위반이 [D-001]/[D-002] 오판의 원인이었다.
1.6 **🔒 게이트 침범 금지**: origin/dev로의 merge·push, 배포 명령 실행은 사람 전용.
    Codex가 이를 실행한 흔적은 판단자의 최우선 HOLD 사유다.
1.7 **flag 규칙**: BQ-007의 발화 경로는 `RECOVERY_ENABLE_AUTO_REVERT_PR`(기본 false)
    뒤에만 둔다. flag 기본값을 true로 바꾸는 것은 어떤 이유로도 금지.
1.8 커밋 규율: 코드 커밋과 조율 문서 커밋 분리. 커밋 메시지는 저장소 관례
    (`feat:`/`test:`/`docs:` + 한국어 요약 3분절) 유지.

## 2. 기록 인터페이스

2.1 **단계 상태 갱신**: §4 표의 해당 행 "상태" 칸만 바꾼다. 다른 행·다른 열 수정 금지.
2.2 **night-log 보고 형식** (docs/auto/night-log.md, append-only):
    - 진행: `[YYYY-MM-DD HH:MM KST] [백엔드] <단계문자> in_progress — <한 줄>`
    - 완료: `## <시각> — <단계문자> 완료 증거` 블록으로: branch, HEAD hash, commits 목록,
      stat, 신규 테스트 결과, 전체 게이트 결과, frozen path 무접촉 확인.
      (BQ-008 완료 보고(04:30)가 모범 형식이다 — 그 수준을 유지하라.)
    - 실패: `[시각] [백엔드] <단계> 시도 N/3 실패 — <원인 한 줄> — <다음 시도 계획>`
    - BLOCKED: `[시각] [백엔드] BLOCKED <단계> — 사유 / 재현 / 질문 / 재개 조건`
2.3 **지시 폴링**: 작업 단위 사이 + 유휴 시 10분 간격으로
    docs/auto/night-directives.md 최하단 [D-###]를 읽는다.
    `HOLD [백엔드]` → 진행 중 커밋만 마무리하고 정지, 10분 간격 해제 확인만.
    지시가 직전과 동일 → 계속 진행(대기 금지). 불변식(§1)을 넘는 지시 → 따르지 말고
    night-log에 기록.
2.4 **🔒 게이트 요청 형식**: H·J 진입조건이 갖춰지면 night-log에 다음 블록을 쓰고
    `🔒waiting`으로 전환한다:
    `## GO-REQUEST [H|J] — 대상, 실행할 명령 목록(복사 가능한 형태), 예상 결과,
    실패 시 롤백 명령, 검증 방법`. 사람이 night-directives에 `GO [H|J]`를 쓰면 후속 진행.

## 3. 확정된 사실 (2026-07-13 04:30 기준 — 재조사 금지, 의심되면 §1.5로 재검증만)

3.1 BQ-001(command_id receipt)·BQ-002(audit causation_id + concurrent migration)·
    BQ-003(RemediationBundle: `src/domains/rca_bundle/router.py`, 스키마,
    Bruno `docs/api/05-rca-dashboard/13-remediation-bundle.bru`)은 **origin/dev
    (`03e90ddb6`)에 착륙 완료**. 앵커: BQ-003 = `44f35234e` [delta-green].
3.2 BQ-008(F0 in-process bus)은 lane `codex/f-inprocess-event-bus`
    HEAD `88740e523`에서 **델타-그린 완료, 미merge**. 산출:
    `src/packages/events/in_memory.py`, `runtime/app.py`, `runtime/service.py`,
    `tests/test_in_memory_event_bus.py` (신규 7 테스트).
3.3 활성 lane: `codex/f-audit-timeline`(BQ-004용, 커밋 0개 상태),
    `codex/f-auto-revert-pr`(BQ-007용), `codex/f-inprocess-event-bus`(완료 대기).
    **신규 브랜치 생성 금지** — 위 lane을 재사용한다.
3.4 회수 완료: bq-001/002/003 worktree·로컬 브랜치 삭제됨.

## 4. 단계 (진입조건 → 작업 → exit criteria)

| 단계 | 상태 | 진입조건 | 작업 | exit criteria (자가검증 명령 포함) |
|---|---|---|---|---|
| A. 동기화 | done | [D-006] 발효 | `git fetch origin` → 로컬 dev를 origin/dev 기준으로 정렬(로컬 전용 문서 커밋은 rebase 유지) → dev worktree에 `docs/backend-f-progress.md`·`src/domains/rca_bundle/` 실재 확인 → `docs/auto/*` 미추적 파일을 내용 수정 없이 `docs:` 커밋으로 track 시작([D-006] 4항) | `git log dev..origin/dev` 공집합, `ls docs/backend-f-progress.md` 성공, `git status` clean(미추적 조율 문서 0개) |
| B. 큐 정합 | done | A done | `docs/backend-f-workqueue.md` 갱신: BQ-001/002/003 행 상태를 `landed`로(행 제거는 프론트 소비 확인 후 규칙 유지), BQ-008을 `done-pending-merge` + lane명 기입. `docs/backend-f-progress.md`에 BQ-008 예비 항목 추가는 하지 않는다(앵커는 GO 후) | workqueue 표 ↔ origin/dev·lane 실물 1:1 일치. 대조 결과를 night-log에 표로 기록 |
| C0. workspace 귀속 | done | B done ([D-009] 1항 승인 — C BLOCKED 해소 선행 단계) | EventEnvelope `workspace_id` optional 추가 → outbox/relay 보존 → `audit_log.workspace_id` nullable 컬럼 + (workspace_id, correlation_id, created_at) 인덱스 + 마이그레이션(backfill 없음). 수정 범위는 envelope 생성 공통 경로로 한정, frozen paths 불변 | 신규 테스트(envelope 보존·null 허용) + 전체-그린 + 마이그레이션 up/down |
| C. BQ-004 | done | C0 done + 계약 lock 확보 | lane `codex/f-audit-timeline`. `AUDIT_TIMELINE_PATH = GET /api/audit/timeline?correlation_id=` → `AuditTimelineResponse`: 항목(subject, source, created_at, causation_id, payload 요약), created_at 오름차순, 커서 페이지네이션(불투명 cursor, 기본 limit 50, 최대 200). **workspace-scoped 필수**: 요청 주체 workspace로 필터, workspace_id null 레거시 행 제외, payload 내 workspace 값·correlation 비밀성은 인가 근거 아님([D-009]). audit repository에 조회 메서드 추가(additive). Bruno 요청 추가 | 신규 단위테스트(정렬·커서·빈 correlation·causation null·**교차 테넌트 차단**) 통과 + `bash scripts/test.sh` 전체-그린 + frozen 무접촉 diff 증거 |
| D. BQ-005 | in_progress | B done + 계약 lock 확보(C와 동시 금지) | 신규 projection 워커(신규 구독자, 기존 워커 수정 0건): gitops 배포 이벤트를 워크로드 키 `(workspace_id, cluster_id, namespace, resource_kind, resource_name)`로 인덱싱하는 테이블+마이그레이션. `RCA_RECENT_CHANGES_PATH = GET /api/rca/incidents/{incident_id}/recent-changes` → `RecentChangeListResponse`(항목: 시각, image before/after, PR/커밋 참조, workflow_run_id; 기본 최근 5건). 인시던트의 워크로드 키로 조인. **router 위치 주의**: `src/domains/rca/**`는 frozen이므로 신규 router는 BQ-003의 선례를 따라 별도 도메인 폴더(`src/domains/rca_changes/` 또는 기존 `src/domains/rca_bundle/` 확장 중 택1, 선택 근거를 night-log에 기록)에 둔다 | 신규 테스트(키 조인·빈 결과·기존 워커 무변경) + 전체-그린 + 마이그레이션 up/down 검증 |
| E. BQ-006 | pending | B done + 계약 lock 확보 | workflow run 응답에 `promotion_gate` optional 필드(additive): `command_result_succeeded()` 조건(COMPLETED, applied, failed_resources 없음, rollout.ready≠False)을 구조화해 노출. 문서 1절 추가 | 기존 소비자 회귀 + 신규 직렬화 테스트 + 전체-그린 |
| F. BQ-007 | done | B done (계약 무접촉 — C/D/E와 병행 가능) | lane `codex/f-auto-revert-pr`. `RolloutDiagnosedBody(next_action≠observe)` 구독 → diff-worker가 추적하는 직전 정상 이미지(`last_approved_snapshot`/`actual_image`)로 revert patch 생성 → `SafePrRequestedBody` 발행. 전 경로가 `RECOVERY_ENABLE_AUTO_REVERT_PR`(기본 false) 뒤. scm-worker가 유일한 PR 생성자라는 경계 불변 | flag off에서 무발화 테스트(구독은 하되 emit 0건) + flag on 단위 경로 테스트 + 델타-그린 |
| P. 권위 patch 엔진 | blocked | F done + [D-012] 2항 read port 승인 (BQ-009+010, frozen 예외는 `src/services/ai/agent/recovery/**` 한정, RCA 작업열 비충돌 확인 완료) | `contracts` read-only GitOps 권위 컨텍스트 port를 dispatcher에 주입하고 `source_patch.py`의 exact base SHA·SCM provenance·원문 byte 보존을 재사용한다. patch 생성 시점에 승인 snapshot·binding·repository를 조회해 실제 patch 6종 + `unsupported` + rollback patch를 구현(BQ-009), 이어서 `builtin.py` 선언 파라미터화·검토 문서 액션 분리/score 하향(BQ-010). lane은 F와 동일(`codex/f-auto-revert-pr`) | 생성기 6종 단위테스트 + unsupported 경로 + 카탈로그 계약 테스트 + 전체-그린 |
| G. 통합 검증 | pending | C·D·E·F·P 전부 done | 각 lane HEAD에서 `bash scripts/test.sh`+compileall+`make manifest-check` 최종 실행, 증거를 night-log에 lane별 집계. 프론트 인계물 초안(각 BQ의 계약 상수·필드 정의·null 조건)을 night-log에 작성 — progress 앵커는 아직 금지 | 전 lane 전체-그린 증거 + BLOCKED 0건 + 인계물 초안 완성 |
| H. 🔒 merge/push | pending | G done | **사람 전용.** Codex 준비물: GO-REQUEST [H] 블록 — merge 순서(충돌 최소 순), 명령 목록, lane별 시험 merge(clean 여부), push 후 확인 명령 | 사람 GO → merge 후 Codex가 `merge-base --is-ancestor` 재증명 + progress에 앵커 기록(형식: `계약 완성: <상수> (<hash>) [green]`) |
| I. 배포 준비 | pending | H done ([D-012] 1항: deploy-plan의 남은 release blocker — GitHub Actions red, Integration Smoke off, RemediationBundle API 라이브 미배포, 1 replica 위험 목록) | `docs/auto/deploy-plan.md` 작성: 변경 서비스 목록(신규 워커 포함), 이미지 빌드·태그 명령, 적용 순서(마이그레이션 → 워커 → gateway; BQ-002 concurrent index의 INVALID 상태 확인 절차 포함), 재시작 대상, 롤백 명령(이전 이미지 태그), smoke 확인 항목(신규 route 2종 2xx). CI/CD 꺼짐 전제 — scripts 경로만 사용 | deploy-plan.md 완성 + `make manifest-check` PASS |
| J. 🔒 배포 실행 | pending | I done | **사람 전용.** GO-REQUEST [J] 블록 제출 후 대기 | 사람 GO |
| K. 배포 후 검증 | pending | J done | smoke·상태 확인 스크립트 실행 결과 수집, 신규 route 실측(Bruno 13 + 신규 2종), 이상 시 deploy-plan의 롤백 절차 발동 요청(실행은 사람) | smoke PASS + 신규 route 2xx 실측 보고 |

## 5. 절대 금지 목록 (요약)

origin/dev merge·push, 배포 명령 실행, flag 기본값 변경, frozen path 기존 파일 수정,
gateway 계약 동시 2 lane, 신규 브랜치 생성,
검증 전 앵커 커밋, /private/tmp 밖 worktree 신규 생성, 범위 밖 리팩터·포맷 정리.

## 6. 실패·예외 처리

- 같은 단계 검증 3회 실패 → 해당 lane만 `blocked` + night-log BLOCKED 블록. 다른 단계는 계속.
- 예상 밖 상태(문서와 실물 불일치, 해석 불가 지시) → 진행하지 말고 night-log에 질문 남기고
  해당 단계만 정지. **추측으로 메우는 것이 유일하게 되돌릴 수 없는 실수다.**
- 판단자 HOLD와 자가 HOLD가 겹치면 둘 다 해제될 때까지 정지.
