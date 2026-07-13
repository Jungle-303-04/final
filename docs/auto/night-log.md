---
title: 야간 작업 로그
status: active-overnight
date: 2026-07-13
writer: 작업 세션들이 사이클마다 append. 자동 판단자가 판정 결과를 append.
format: "[시각] [트랙] 한 줄 상태 + 커밋 hash (있으면)"
---

# 야간 작업 로그

(밤새 append-only. 아침 요약은 자동 판단자가 최하단에 작성)

## 2026-07-13 04:26:03 KST — 백엔드 브랜치 지형 보고 ([D-001])

- canonical `origin/dev`: `03e90ddb6d6e50e1b7e39739c20210e28e1dc4a2`
- `origin/codex/bq-001-command-id-receipt`
  - HEAD·merge-base: `c704729c1b16a6fd397e1c7285249f80517a01a8`
  - `origin/dev...branch`: `7 0` — branch-only 커밋 0건, `origin/dev..branch` 빈 목록
  - `origin/dev` 시험 merge: clean
- `origin/codex/bq-002-audit-causation`
  - HEAD·merge-base: `e3c1de4a8eeb49a4630bab816d2bbd18444c80a5`
  - `origin/dev...branch`: `3 0` — branch-only 커밋 0건, `origin/dev..branch` 빈 목록
  - `origin/dev` 시험 merge: clean
- `origin/codex/bq-003-remediation-bundle`
  - HEAD·merge-base: `44f35234e7dcd9c8d221242d7688556e2d30e819`
  - `origin/dev...branch`: `1 0` — branch-only 커밋 0건, `origin/dev..branch` 빈 목록
  - `origin/dev` 시험 merge: clean
- stack 관계: 002는 001 위, 003은 002 위이며 세 HEAD 모두 `origin/dev`의 ancestor다.

[2026-07-13 04:26:03 KST] [백엔드] 브랜치 지형 보고 완료 — 세 브랜치 착륙·stack·clean merge 확인

[2026-07-13 04:25 KST] [판단자] 판정: 정상 — 착륙 위반 0건(dev에 backend-f-progress.md 미존재·VP 행 불변), AcceptedResponse 3필드+optional 유지, APIQ-029 동결 유지, 신규 작업 보고 0건(첫 사이클로 판단). 지시 [D-002] 발행.

[2026-07-13 04:30:27 KST] [백엔드] [D-003] 정정 수용 — `1a439b002` 지형 보고는 무효; `git ls-remote`의 dev=`03e90ddb6`와 BQ 실물 3종으로 착륙 완료 재확인, 재merge 대상 0건. 회수 대상 worktree·로컬 브랜치 각 3개 삭제 완료, `codex/f-audit-timeline` 유지.

## 2026-07-13 04:30:27 KST — in-process event bus 완료 증거

- branch: `codex/f-inprocess-event-bus`
- HEAD: `88740e523c2740b560269f4601fe62c6ac7f7480`
- commits:
  - `88740e523` test: 지연 재배달 / 타이밍 여유 / flake 제거
  - `0cd735880` test: App 기본 버스 / NATS 경로 / 명시 주입
  - `ee3d76596` test: 지연 재배달 / 버스 생명주기 / 경계 조건
  - `9f43665b6` feat: in-memory 이벤트 버스 / 런타임 주입 / NATS 기본값
  - `f2dd3a762` test: in-memory 이벤트 버스 / 주입 배선 / NATS 회귀
- stat: 4 files changed, 529 insertions(+), 5 deletions(-)
  - `src/packages/events/in_memory.py`
  - `src/packages/runtime/app.py`
  - `src/packages/runtime/service.py`
  - `tests/test_in_memory_event_bus.py`
- 신규 회귀: `7 passed in 2.90s` — ack/nak/지연 재배달, wildcard fan-out, App/WorkerService 주입, NATS 기본값.
- 전체 pytest: 기존 RCA baseline 6건만 실패, `1647 passed, 3 skipped`; 신규 실패 0건.
- Ruff lint PASS; Ruff format은 기존 2파일만 대상; import-linter는 기존 `domains.rca.router -> services` 1건만 유지.
- compileall PASS; manifest PASS(`management 68`, `target 20`).
- gateway 계약·RCA·AI·`runtime/worker.py` 변경 0건. merge·push·앵커 0건.

[2026-07-13 04:30:27 KST] [백엔드] in-process event bus delta-green 완료, WATCH 전환 `88740e523`

[2026-07-13 04:42 KST] [판단자] 판정: HOLD(확장 범위 한정) — 기존 범위는 정상(BQ-008 완료 증거 일관, AcceptedResponse 무결, backend-f-progress.md는 origin/dev 실물로 정상 착륙 확인, VP 행 불변, APIQ-029 동결 유지). 단 출처 미검증 [D-004]의 야간 범위 확장(파이프라인 체계)은 야간 불변 규칙 2·3과 충돌하여 사람 확인 전 발효 보류, 확장 범위에 한해 양 트랙 HOLD — 지시 [D-005].

[2026-07-13 04:45:16 KST] [백엔드] WATCH — [D-005] 확장 범위 HOLD 준수, BQ-008 delta-green 완료 대기 유지 `88740e523`

[2026-07-13 04:47 KST] [판단자] 판정: 전이 0건·🔒 침범 없음(origin/dev=`03e90ddb6` 불변, BQ-008 미착륙 확인)·AcceptedResponse 무결. 불변 규칙 v2 개정("[D-004] 체계 발효")으로 [D-005] HOLD 해제 조건 충족 인정 — 단 [D-006] 서명 항목 부재는 기록 공백으로 사람 보완 요청. 양 트랙 파이프라인 A 진입 허가 — 지시 [D-007].

[2026-07-13 04:50 KST] [판단자] 추기: 조율 세션의 [D-006](작성 주체 확인·HOLD 해제)이 [D-007]과 동시 기록됨 — 기록 공백 해소, 내용 상충 없음, 정합 지시 [D-008] 발행. 양 트랙 A단계 개시 유효.

[2026-07-13 04:54 KST] [백엔드] A in_progress — origin/dev 정렬·필수 실물 확인 완료, docs/auto 정본 tracking 시작

## 2026-07-13 04:55 KST — A 완료 증거

- branch: local `dev` (push 없음), origin 기준 `03e90ddb6d6e50e1b7e39739c20210e28e1dc4a2`
- 작업 HEAD: `7340133ad576ab193f3e6bbccf36bc7d90edbfc4`
- commit: `7340133ad docs: 파이프라인 정본 / 동기화 착수 / 이력 추적`
- stat: 4 files changed, 413 insertions(+); `docs/auto/*` 정본 tracking 시작
- exit criteria: `git log dev..origin/dev` 공집합, `docs/backend-f-progress.md`·`src/domains/rca_bundle/` 실재, `git status --short` 0줄
- 테스트: 문서 tracking 단계로 신규 코드·테스트 없음
- frozen path·gateway 계약·`src/**` 변경 0건; merge·push·배포·앵커 0건

[2026-07-13 04:57 KST] [백엔드] B in_progress — origin/dev 착륙 3건과 in-process bus 미착륙 lane 상태를 작업 큐에 정합

[2026-07-13 04:59 KST] [백엔드] B 시도 1/3 실패 — docs/auto 추적 뒤 문서 색인 4건 누락 — docs/README 색인 보완 후 재검증

## 2026-07-13 04:59 KST — B 완료 증거

- branch: local `dev` (push 없음)
- HEAD: `ad285989b724d5a31fb7e39b8e1f954cd8d7b258`
- commit: `ad285989b docs: 큐 착륙 상태 / 조율 문서 색인 / 단계 착수`
- stat: 4 files changed, 18 insertions(+), 6 deletions(-); 조율 문서와 누락된 `docs/auto/*` 색인만 변경
- origin 대조:

| 큐 | 기준 커밋·lane | origin/dev 판정 | workqueue 상태 |
|---|---|---|---|
| BQ-001 | `4e6216052` | ancestor exit 0, 계약 실물 존재 | `landed` |
| BQ-002 | `2886f0e49` | ancestor exit 0, migration 실물 존재 | `landed` |
| BQ-003 | `44f35234e` | ancestor exit 0, `src/domains/rca_bundle/router.py` 실물 존재 | `landed` |
| BQ-008 | `codex/f-inprocess-event-bus` `88740e523` | ancestor exit 1, origin/dev 대비 `0 5`, lane clean | `done-pending-merge` |

- `origin/dev`: `03e90ddb6d6e50e1b7e39739c20210e28e1dc4a2` (`git ls-remote origin refs/heads/dev`)
- 검증: `.venv/bin/python -m pytest -q tests/test_docs_index.py` → `9 passed`; 최초 색인 4건 누락은 같은 단계에서 보완
- `docs/backend-f-progress.md` BQ-008 예비 앵커 0건; 코드·gateway 계약·frozen path 변경 0건
- merge·push·배포·앵커 0건

[2026-07-13 05:01 KST] [백엔드] C in_progress — 감사 타임라인의 테넌트 인가 가능성과 신뢰 귀속 컬럼을 사전 검증

[2026-07-13 05:01 KST] [백엔드] BLOCKED C — 사유: `audit_log`·`EventEnvelope`·outbox에 신뢰 가능한 `workspace_id`가 없어 correlation 단독 조회 시 BOLA 발생 가능 / 재현: 서로 다른 tenant가 같은 correlation을 발행하면 audit SQL이 행을 분리할 조건이 없음 / 질문: 이벤트 봉투→outbox→audit_log의 workspace 귀속 선행 단계를 파이프라인에 복원할지 승인 필요 / 재개 조건: 인증 경계의 workspace를 payload가 아닌 envelope에 싣고 outbox에서 보존한 뒤 `audit_log.workspace_id`에 적재, null 행을 제외하는 workspace-scoped 조회가 가능해질 것

- 근거: `src/domains/audit/models.py`는 `correlation_id`·`causation_id`만 보유하고, `src/domains/audit/repository.py` 적재에도 tenant 키가 없다.
- `src/packages/contracts/event_bus/interfaces.py`, `src/packages/events/envelope.py`, `src/packages/storage/schema.py`의 events/outbox에도 workspace 귀속이 없다.
- 기존 `require_session`·`require_cluster_access`와 workspace-scoped RCA report lookup은 요청 주체를 확인하지만 audit 행 자체를 workspace로 필터링하지 못한다.
- payload의 workspace 값, correlation 비밀성, 전체 허용 해석은 인가 근거로 사용하지 않는다. C lane 코드·계약·RCA frozen path 변경 0건.

[2026-07-13 05:03 KST] [백엔드] F in_progress — 자동 revert PR lane의 flag·권위 이미지·단일 PR 생성자 경계와 델타-그린 재검증

[2026-07-13 05:09 KST] [백엔드] F 시도 1/3 실패 — 저장 diff의 `before=live`를 우선해 drift 시 미승인 이미지를 정상 이미지로 되돌릴 수 있음 — `old_desired` 승인 스냅샷 우선 회귀 테스트와 최소 수정 후 전 게이트 재검증

[2026-07-13 05:19 KST] [백엔드] F 시도 2/3 실패 — 렌더 산출물을 Helm·Kustomize·멀티문서 원본 경로에 덮어써 소스 훼손·비밀값 노출 가능 — 소스 유형·단일 파일·단일 문서 증거를 전파하고 안전한 raw manifest만 패치하도록 회귀 테스트 후 재검증

[2026-07-13 06:06:51 KST] [프론트] A in_progress — origin/dev 착륙 3건 재검증 및 VP-001·APIQ 동결 해제 착수

## 2026-07-13 06:11 KST — [프론트] A 완료 증거

- 대상: VP-001 착륙 확정, APIQ-029 동결 해제, APIQ-012 claim 가능 갱신.
- 조율·추적 커밋: `f2da1a266` (`docs/auto` 정본 추적 + A in_progress).
- 판정 갱신 커밋: `d50a53a75` (VP-001·API queue). 두 커밋을 분리해 canonical branch에 push 완료.
- full gate: 직전 코드 HEAD `5e3dd16f3`에서 `npm run check` PASS — 94 files / 661 tests,
  design guard 275 files, shadcn audit 482 previews, Vite production build PASS. 이후 변경은 문서뿐이다.
- origin 검증 출력 전문:

```text
$ git merge-base --is-ancestor 44f35234e origin/dev; echo $?
0
$ git cat-file -e origin/dev:docs/backend-f-progress.md; echo $?
0
$ git cat-file -e origin/dev:src/domains/rca_bundle/router.py; echo $?
0
```

- 결과: VP-001 판정 `직결`, APIQ-029 active in_progress, APIQ-012 requested/claim 가능.

[2026-07-13 06:13 KST] [프론트] A2 🔒waiting — 첫 dev→lab 동기화의 사람 GO 요청, merge 실행 없음

## GO-REQUEST [FE-A2]

- 목적: `origin/dev`를 `woonyong/ui-layer-lab`에 최초 단방향 merge.
- source: `origin/dev` `03e90ddb6d6e50e1b7e39739c20210e28e1dc4a2`.
- target: `0626d14ec41accbb124e213367371540fb93c275`; merge-base
  `9fe235e7b03032af7d7ac3b14d05ab0f17306b02`; divergence target-only 206 / source-only 465.
- `git merge-tree --write-tree HEAD origin/dev` 예측: 총 36 conflict.
  - 프론트 소유 경로 12건: `docs/spec/frontend/**` 3건, `references/ui-layer-lab/**` 9건 — 수동 해소 대상.
  - legacy `frontend/**` 15건(파일/디렉터리 충돌 포함) — dev 채택 시 부활 금지 정책과 충돌하므로
    사람의 명시 판정 필요.
  - 기타 경로 9건: root/docs/backend/tests — [D-009] 규칙상 dev 채택 대상.
- 실행 명령: `git merge --no-ff origin/dev`.
- 실패·취소 명령: `git merge --abort`.
- 후속 검증: `npm run check` 전체 PASS 및 충돌 해소 목록 기록 전에는 A2 완료 처리 금지.
- 현재 조치: merge·push·배포 실행 없음. B단계는 정본의 병행 허용 규칙에 따라 진행한다.

[2026-07-13 06:15:14 KST] [프론트] B in_progress — APIQ-029 착륙본 schema·progress·Bruno와 동결 Zod diff 대조 착수

[2026-07-13 06:25 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[crashloop]` 해소 — 판정: 규칙은 옳고 기대가 낡음(`app_port_bind_failed`, `permission_denied_startup`은 독립 signal/evidence/checks를 가진 정식 CrashLoop 후보이며 기존 순서 보존) / 커밋 `67ce9d700` / 전체 게이트: pytest `1641 passed, 3 skipped, 5 baseline failed`(해소 node 제외), Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 `domains.rca.router -> services` 1계약만 실패

## 2026-07-13 06:27 KST — [프론트] B 완료 증거

- 대상: APIQ-029 `getRemediationBundle`, VP-001 public API anchor.
- 조율 커밋: `3fd4225a8` (B in_progress, 기존 APIQ-029 lease 유지).
- 코드 커밋: `97c862da1` (public endpoint/schema/type barrel export + 회귀 테스트).
- 착륙본 diff: `origin/dev:docs/spec/remediation-bundle.schema.json`, BQ-003 progress 인계,
  Bruno, router/serializer와 필드·required·nullable·strict/open 경계가 **일치**했다.
  유일한 불일치는 동결 시 제거된 public barrel export였으며 코드 커밋에서 복원했다.
- full gate: `npm run check` PASS — TypeScript/ESLint PASS, 94 files / 662 tests,
  design guard 275 files, shadcn audit 482 previews, Vite production build PASS.
- canonical anchor 검증:

```text
$ git merge-base --is-ancestor 97c862da1 origin/woonyong/ui-layer-lab; echo $?
0
```

- 제품 화면·adapter 소비는 이 앵커 전까지 0건이었고, 완료 조율 커밋 이후에만 허용한다.

[2026-07-13 06:28 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[imagepull]` 해소 — 판정: 규칙은 옳고 기대가 낡음(`registry_rate_limited`, `image_platform_mismatch`는 서로 다른 registry 신호를 요구하는 정식 후보이며 기존 3후보 순서 보존) / 커밋 `841617f41` / 전체 게이트: pytest `1642 passed, 3 skipped, 4 baseline failed`(중간에 범위 밖 janitor timing flake 1회는 단독 3/3 PASS 후 전체 재실행 PASS), Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:30 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[oom]` 해소 — 판정: 규칙은 옳고 기대가 낡음(OOM snapshot은 `CrashLoopBackOff` 룰로 수렴하므로 동일한 7후보 전체를 계획하며 OOM 판별은 `oom_evidence` signal 평가 단계가 담당) / 커밋 `6cfa9c6aa` / 전체 게이트: pytest `1643 passed, 3 skipped, 3 baseline failed`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:31:17 KST] [프론트] C in_progress — APIQ-012 receipt claim; APIQ-027 앵커 전 getCommandStatus 소비는 보류

[2026-07-13 06:32 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[sched-fail]` 해소 — 판정: 규칙은 옳고 기대가 낡음(`node_selector_mismatch`, `untolerated_taint`는 포괄 affinity/taint 후보를 실제 이벤트·metadata 신호로 세분화한 정식 후보이며 `pvc_pending` 앞 카탈로그 순서 보존) / 커밋 `5dcb2f633` / 전체 게이트: pytest `1644 passed, 3 skipped, 2 baseline failed`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:33 KST] [RCA] `test_crashloop_flow_auto_selects_restart_and_queues_command` 해소 — 판정: 규칙은 옳고 기대가 낡음(계획 후보는 7개로 확장됐지만 기존 우선순위 `oom_killed`, `bad_image_rollout`와 OOM 자동 선택·restart 명령 계약은 그대로 통과) / 커밋 `da90c79a7` / 전체 게이트: pytest `1645 passed, 3 skipped, 1 baseline failed`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:40 KST] [RCA] `test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts` 해소 — 판정: 기대가 옳고 검증 규칙이 버그(scenario는 provider `kubernetes`를 선언하고 candidate는 그 하위 named evidence `kubernetes:cluster_resource_state`를 요구하므로 provider 계층으로 비교해야 함; 누락 provider 거부 테스트 유지) / 커밋 `58d9b1ba0` / 전체 게이트: pytest `1646 passed, 3 skipped`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:44 KST] [RCA] Ruff format `tests/test_bruno_collection.py`, `tests/test_rca_rule_catalog.py` 해소 — 판정: formatter canonical output과 불일치한 순수 표현 형식(문자열 quote·줄바꿈·comprehension 배치)이며 assertion 의미 불변 / 커밋 `5a9e46a21` / 전체 게이트: pytest `1646 passed, 3 skipped`, Ruff check PASS·format `470 files already formatted`, import-linter 기존 1계약만 실패

## 2026-07-13 06:44 KST — F 완료 증거

- branch: `codex/f-auto-revert-pr`
- HEAD: `68e94c1486cc289c698a5507629e781812c315d4`
- commits:
  - `68e94c148` fix: 되돌림 PR 승인 스냅샷 / 원문 패치 / SCM 권위 검증
  - `e6d4df1dc` feat: rollout 실패 revert PR / 기본 비활성 / 권위 컨텍스트
- stat: 14 files changed, 3,075 insertions(+), 46 deletions(-); 신규 파일 5개
  - `deploy/management/auto-revert-worker.yaml`
  - `src/services/gitops/auto-revert-worker/app.py`
  - `tests/test_auto_revert_worker.py`
  - `src/domains/gitops/source_patch.py`
  - `tests/test_gitops_source_patch.py`
- 기능 검증: flag off 무발화, flag on 승인 snapshot 기반 패치, 원문 byte 보존, exact base SHA·SCM provenance·기존 PR 재전달 fail-closed.
- F 전용 회귀: `203 passed in 4.35s`.
- 전체 pytest: 기존 RCA baseline 6건만 실패, `1708 passed, 3 skipped`; 신규 실패 0건.
- 전역 게이트: Ruff lint PASS, compileall PASS, manifest PASS(`management 69`, `target 20`). Ruff format은 기존 2파일만 대상, import-linter는 기존 `domains.rca.router -> services` 1건만 유지.
- 독립 감사: 보안·계약 감사 모두 P0 0건/P1 0건. GitHub Compare API 300파일 상한은 fail-closed.
- frozen path·gateway 계약·R-트랙 소유 테스트 변경 0건. merge·push·배포·앵커 0건.

[2026-07-13 06:44 KST] [백엔드] F done — 승인 스냅샷·원문 패치·SCM 권위 검증 완료 `68e94c148`

[2026-07-13 06:44 KST] [프론트] APIQ-012 receipt 완료 — `submitCommand` nullable ID 계약 `d763ab682`; C는 APIQ-027 선행 앵커 대기

[2026-07-13 06:46 KST] [문서] APIQ-012 완료 문서 재검증 — `commands.test.ts` targeted PASS, root `make check` PASS(838 passed, 3 skipped + manifest-check). 별도 UI `npm run check` 재실행은 `apiBoundary` timeout과 `ResourcesPage` 표 조회 실패로 FAIL이므로 full UI PASS로 기록하지 않는다.

[2026-07-13 06:47 KST] [백엔드] C0 in_progress — 신뢰 workspace 봉투·outbox 보존·audit 귀속·가역 마이그레이션 사전 검증

[2026-07-13 06:50 KST] [RCA] import-linter `domains.rca.router -> services` 해소 — 판정: 계약이 옳고 router의 services 직접 import가 역의존 버그; domain은 구조적 rule-profile read port만 선언하고 gateway composition이 service profile을 `app.state`로 주입하도록 교정(계약 완화·ignore 추가 0건) / 커밋 `8ce7449fe` / 전체 게이트: `make test` PASS — Ruff lint PASS, format `470 files already formatted`, import-linter `2 kept, 0 broken`, pytest `1646 passed, 3 skipped`

## GO-REQUEST [R] — RCA baseline 수렴 lane 통합 승인 요청

- 대상: `codex/rca-baseline-convergence` (code HEAD `8ce7449fe`; 이 블록은 별도 docs 증거 커밋)
- 완료 범위: [D-011] failure entity 8건 전부 — pytest 6 node, Ruff-format 2파일 gate, import-linter 1계약.
- 커밋: `67ce9d700`, `841617f41`, `6cfa9c6aa`, `5dcb2f633`, `da90c79a7`, `58d9b1ba0`, `5a9e46a21`, `8ce7449fe`.
- 최종 게이트: `make test` → Ruff lint PASS / format `470 files already formatted` / import-linter `2 kept, 0 broken` / pytest `1646 passed, 3 skipped`.
- 범위 증거: 금지 경로 `src/services/ai/agent/recovery/**`, `src/packages/contracts/gateway/**`, `release_flow/**` 변경 0건; `backend-pipeline.md` §1.4와 조율 문서 상태 칸 미편집. baseline 축소는 [D-011] 프로토콜대로 백엔드 Codex 재확인 후 수행 대기.
- 사람 검증 명령(복사 가능):

  ```bash
  git -C /private/tmp/sw-ai-rca-baseline-convergence status --short
  git -C /private/tmp/sw-ai-rca-baseline-convergence diff --name-only dev...codex/rca-baseline-convergence
  git -C /private/tmp/sw-ai-rca-baseline-convergence diff --name-only dev...codex/rca-baseline-convergence -- 'src/services/ai/agent/recovery/**' 'src/packages/contracts/gateway/**' ':(glob)**/release_flow/**' docs/auto/backend-pipeline.md docs/auto/night-directives.md
  make -C /private/tmp/sw-ai-rca-baseline-convergence test
  ```

- 예상 결과: 첫 명령 0줄, 변경 파일은 R-소유 규칙/시나리오/테스트·gateway 조립·night-log만, 금지 경로 명령 0줄, 전체 gate PASS.
- 사람 GO 후 통합 명령(현재 dev의 조율 문서 변경을 먼저 커밋해 clean 상태로 만든 뒤 실행):

  ```bash
  git -C /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final-dev merge --no-ff codex/rca-baseline-convergence
  git -C /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final-dev push origin dev
  ```

- 실패 시 롤백: push 전 충돌/검증 실패는 `git merge --abort`; merge commit 생성 후 push 전 gate 실패는 해당 merge commit을 push하지 말고 사람 판단. push 후에는 이력 보존형 `git revert -m 1 <merge_commit>` 후 전체 gate 재검증(강제 push·reset 금지).

[2026-07-13 06:54 KST] [백엔드] BLOCKED P — 사유: 현재 `RecoveryActionSelectedBody`와 순수 `RecoveryDispatcher`에는 desired manifest·승인 snapshot·source digest/base SHA·repository/binding/workflow 권위 컨텍스트가 없어 실제 patch 6종은 모두 `unsupported`가 됨 / 재현: `safe_pr_patches()` 입력은 선택된 action params뿐이고 dispatcher DB 의존성 0건 / 질문: recovery plan hydration 계약을 선행할지, dispatch 단계의 repository 조회 포트를 승인할지 / 재개 조건: 정적 builtin params나 payload 위조 없이 GitOps 권위 컨텍스트를 전달하는 단일 소스 계약 확정

- RCA 작업열 충돌 확인: R-track과 `src/services/ai/agent/recovery/{dispatch,builtin,catalog}.py` blob 동일, recovery 경로 변경 0건.
- 기각한 우회: 정적 카탈로그에 manifest/snapshot 삽입, markdown fallback 유지, 권위 입력 없는 합성 patch.

[2026-07-13 06:57 KST] [프론트] C 후속 full gate 재검증 PASS — TypeScript·ESLint, 94 files / 663 tests, design guard 275, shadcn 482, production build 전부 통과. 앞선 두 실패는 재현·격리 후 안정화 트랙으로 분리했다.

[2026-07-13 06:57 KST] [프론트] D in_progress — APIQ-027 command polling 계약 claim; API-owned fixture와 failure·terminal·abort·barrel 회귀를 앵커 전에 보강한다.

[2026-07-13 07:02 KST] [백엔드] BLOCKED R merge step 2 — merge 진행 중(`MERGE_HEAD=82028604d`), 충돌 잔여·night-log 마커 0건 확인 후 허용된 `night-log.md`·`night-directives.md` 외 예상 밖 unstaged `docs/auto/backend-pipeline.md` 발견(D-011 축소 프로토콜 3줄) / 지시대로 임의 add·commit·push 0건 / 질문: 이 기존 unstaged 변경을 merge commit에 포함할지 별도 처리할지 확인 필요 / 재개 조건: `backend-pipeline.md`의 이번 merge 포함 여부 명시

[2026-07-13 07:07 KST] [백엔드] R merge 완결·push — `257f91846`, `82028604d` ancestor exit 0, 사람 위임 GO [R] ([D-012])

[2026-07-13 07:14 KST] [백엔드] [D-012] 후속 정리 완료 — §1.4 baseline 공집합·전체-그린 복귀 / R worktree·로컬 lane 안전 회수(`branch -d`) / release blocker에서 RCA baseline 제거 / P read port 설계로 in_progress 재개

[2026-07-13 07:30 KST] [프론트] APIQ-027 완료 — `submitPrometheusQuery`, `getCommandStatus`, `pollCommand`, `runPrometheusQuery` 앵커 `b92d081eb`; full gate PASS(TypeScript·ESLint, 95 files / 674 tests, design guard 278, shadcn 482, production build).

[2026-07-13 07:32 KST] [백엔드] 브랜치 전수 감사 — canonical `9aa76e4b34c5dd66c4c4ace4bd5b08b2450c1b4e`, 실브랜치 198개(origin/HEAD 별칭 제외), A 21 / B 5 / C 166 / 보호 6

| 브랜치 | 분류 | ancestor exit | 처리 | 근거 |
|---|---:|---:|---|---|
| `codex/cloudflare-token-normalization` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=543; 2026-07-06; fix: EKS rollout 상태 조회 재시도 |
| `codex/f-audit-timeline` | B | 0 | 보존 | 활성 lane; ahead=0; 2026-07-13; docs: BQ-003 앵커 / 프론트 인계 / 결합 주의 |
| `codex/f-auto-revert-pr` | B | 1 | 보존 | 활성 lane; ahead=3; 2026-07-13; chore: dev 동기화 / R 착륙 / P 재개 |
| `codex/f-inprocess-event-bus` | B | 1 | 보존 | 활성 lane; ahead=5; 2026-07-13; test: 지연 재배달 / 타이밍 여유 / flake 제거 |
| `codex/platform-foundation` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=555; 2026-07-06; docs: 운영 검증 용어 정리 |
| `codex/rca-log-evidence-scope-20260710` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=1; 2026-07-10; fix: RCA 시나리오 가용성 / provider 검증 경계 |
| `codex/runtime-hardening-20260710` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=2; 2026-07-10; fix: MinIO 단일 소유자 / 레거시 Deployment 제거 |
| `demo/v1` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=335; 2026-07-01; docs: PR 체크리스트 / worker 계약 / runtime 책임 |
| `dev` | 보호 | 0 | 보존 | 명시 보호 브랜치; ahead=0; 2026-07-13; docs: R 후속 정리 / baseline 공집합 / P 재개 |
| `feat/jcbbbbbb/api-gateway` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/jcbbbbbb/api-gateway |
| `feat/jeonwoohyun-hydromel/command-worker` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/jeonwoohyun-hydromel/command-worker |
| `feat/jeonwoohyun-hydromel/gitops-sync-worker` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/jeonwoohyun-hydromel/gitops-sync-worker |
| `feat/minmings111/node-collector` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/minmings111/node-collector |
| `feat/minmings111/target-cluster-agent` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=300; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/minmings111/target-cluster-agent |
| `feat/ummfieg/audit-timeline-service` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/ummfieg/audit-timeline-service |
| `feat/ummfieg/dashboard-projection-service` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/ummfieg/dashboard-projection-service |
| `feat/ummfieg/rca-worker` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=290; 2026-06-30; Merge remote-tracking branch 'origin/dev' into feat/ummfieg/rca-worker |
| `main` | 보호 | 1 | 보존 | 명시 보호 브랜치; ahead=34; 2026-06-26; refactor: 이벤트 계약 / 구독 선언 / Gateway 계약 |
| `origin/chanbin-authority` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=512; 2026-07-07; fix: workload scale 명령 실행 정책 정합성 |
| `origin/codex/bq-001-command-id-receipt` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-13; docs: BQ-001 계약 완성 / delta-green 앵커 / 프론트 인계 |
| `origin/codex/bq-002-audit-causation` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-13; docs: BQ-002 계약 완성 / delta-green 앵커 / 프론트 인계 |
| `origin/codex/bq-003-remediation-bundle` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-13; feat: RemediationBundle 3계층 조회 계약 추가 |
| `origin/codex/chanbin-dev-infra-base` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=315; 2026-07-05; fix: workspace 관련 제거 |
| `origin/codex/data-dashboard-variants` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=1; 2026-07-09; feat: redesign operations homepage variants |
| `origin/codex/f-auto-revert-pr` | B | 1 | 보존 | 활성 lane; ahead=1; 2026-07-13; feat: rollout 실패 revert PR / 기본 비활성 / 권위 컨텍스트 |
| `origin/codex/f-inprocess-event-bus` | B | 1 | 보존 | 활성 lane; ahead=5; 2026-07-13; test: 지연 재배달 / 타이밍 여유 / flake 제거 |
| `origin/codex/frontt` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=492; 2026-07-07; test: 실백엔드 E2E credential 하드코딩 제거 |
| `origin/codex/gitops-cache-db-crd` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=462; 2026-07-04; feat: add gitops cache db crd rendering |
| `origin/codex/headlamptest` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=607; 2026-07-07; feat(frontend): add headlamp network resource views |
| `origin/codex/platform-foundation` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=555; 2026-07-06; docs: 운영 검증 용어 정리 |
| `origin/codex/radar` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-11; ci: dev 푸시 AWS 직접 배포 활성화 |
| `origin/codex/rca-log-evidence-scope-20260710` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=1; 2026-07-10; fix: RCA 시나리오 가용성 / provider 검증 경계 |
| `origin/codex/release-flow-frontend-safe-pr-144` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=2; 2026-07-10; feat: add production readiness runner |
| `origin/codex/release-flow-gate-contract-check-133` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: enforce release flow production gate contract |
| `origin/codex/release-flow-gate-input-contract-137` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: require production gate inputs in deploy workflows |
| `origin/codex/release-flow-generated-manifest-safe-pr-142` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: add generated release manifest safe pr |
| `origin/codex/release-flow-live-image-guard-140` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: require explicit production live image |
| `origin/codex/release-flow-live-preflight-explicit-inputs-139` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: require explicit live preflight inputs |
| `origin/codex/release-flow-prod-abort-criteria-52` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=49; 2026-07-10; feat: require production abort criteria |
| `origin/codex/release-flow-prod-action-disabled-hints-83` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=82; 2026-07-10; feat: show disabled release action hints |
| `origin/codex/release-flow-prod-action-reason-presets-81` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=80; 2026-07-10; feat: improve release action reason presets |
| `origin/codex/release-flow-prod-active-freeze-filter-103` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=101; 2026-07-10; feat: filter active release freezes |
| `origin/codex/release-flow-prod-active-run-filter-74` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=71; 2026-07-10; feat: filter active release runs |
| `origin/codex/release-flow-prod-advance-verification-gate-58` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=55; 2026-07-10; feat: block advance on verification failure |
| `origin/codex/release-flow-prod-alert-coverage-30` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=27; 2026-07-10; feat: require warning alert coverage for live releases |
| `origin/codex/release-flow-prod-alert-ops-13` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=10; 2026-07-09; feat: surface release alert channels |
| `origin/codex/release-flow-prod-alert-recency-33` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=30; 2026-07-10; feat: expire stale alert channel validations |
| `origin/codex/release-flow-prod-alert-smoke-45` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=42; 2026-07-10; feat: smoke test release alert channels |
| `origin/codex/release-flow-prod-alert-validation-31` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=28; 2026-07-10; feat: persist alert channel validation status |
| `origin/codex/release-flow-prod-alerts-08` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=5; 2026-07-09; feat: emit release flow operational alerts |
| `origin/codex/release-flow-prod-app-context-15` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=12; 2026-07-09; feat: validate release application context |
| `origin/codex/release-flow-prod-approval-card-16` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=13; 2026-07-09; feat: expose release approvals in run view |
| `origin/codex/release-flow-prod-approval-evidence-40` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=37; 2026-07-10; feat: require approval evidence for production releases |
| `origin/codex/release-flow-prod-approval-recency-43` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=40; 2026-07-10; feat: expire stale production approvals |
| `origin/codex/release-flow-prod-attention-alert-26` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=23; 2026-07-10; feat: notify attention release runs |
| `origin/codex/release-flow-prod-attention-reasons-21` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=18; 2026-07-10; feat: explain release run attention reasons |
| `origin/codex/release-flow-prod-audit-09` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=6; 2026-07-09; feat: add release flow audit export |
| `origin/codex/release-flow-prod-audit-copy-91` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=89; 2026-07-10; feat: copy release audit summary |
| `origin/codex/release-flow-prod-audit-event-filter-25` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=22; 2026-07-10; feat: filter release audit events |
| `origin/codex/release-flow-prod-audit-export-ui-14` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=11; 2026-07-09; feat: export release audit from UI |
| `origin/codex/release-flow-prod-audit-operator-filters-69` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=66; 2026-07-10; feat: expose release audit operator filters |
| `origin/codex/release-flow-prod-audit-prefix-filter-67` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=64; 2026-07-10; feat: filter release audit event prefixes |
| `origin/codex/release-flow-prod-audit-row-meta-68` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=65; 2026-07-10; feat: show release audit row metadata |
| `origin/codex/release-flow-prod-change-freeze-smoke-108` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=106; 2026-07-10; feat: preflight release change freezes |
| `origin/codex/release-flow-prod-change-ticket-gate-38` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=35; 2026-07-10; feat: require change tickets for production releases |
| `origin/codex/release-flow-prod-destructive-action-confirm-84` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=83; 2026-07-10; feat: confirm destructive release actions |
| `origin/codex/release-flow-prod-diagnostics-gate-34` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=31; 2026-07-10; feat: require diagnostics pass for live releases |
| `origin/codex/release-flow-prod-diagnostics-override-35` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=32; 2026-07-10; feat: require diagnostics override reasons |
| `origin/codex/release-flow-prod-freeze-handoff-101` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=99; 2026-07-10; feat: surface change freeze in release handoff |
| `origin/codex/release-flow-prod-freeze-run-filter-102` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=100; 2026-07-10; feat: filter release freeze overrides |
| `origin/codex/release-flow-prod-freeze-window-100` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=98; 2026-07-10; feat: block releases during change freeze |
| `origin/codex/release-flow-prod-gate-inputs-12` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=9; 2026-07-09; feat: expose release flow gate inputs |
| `origin/codex/release-flow-prod-guard-snapshot-36` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=33; 2026-07-10; feat: record release dispatch guard snapshots |
| `origin/codex/release-flow-prod-handoff-28` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=25; 2026-07-10; feat: summarize release run handoff |
| `origin/codex/release-flow-prod-handoff-abort-criteria-53` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=50; 2026-07-10; feat: show abort criteria in release handoff |
| `origin/codex/release-flow-prod-handoff-copy-80` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=78; 2026-07-10; feat: copy release handoff markdown |
| `origin/codex/release-flow-prod-handoff-verification-51` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=48; 2026-07-10; feat: show release verification in handoff |
| `origin/codex/release-flow-prod-hardening-04` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=1; 2026-07-09; feat: add production-ready release flow |
| `origin/codex/release-flow-prod-impact-summary-48` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=45; 2026-07-10; feat: summarize release readiness impact |
| `origin/codex/release-flow-prod-live-action-confirm-85` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=84; 2026-07-10; feat: confirm live release actions |
| `origin/codex/release-flow-prod-live-alert-gate-29` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=26; 2026-07-10; feat: require alert channels for live release dispatch |
| `origin/codex/release-flow-prod-live-preflight-smoke-41` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=38; 2026-07-10; feat: preflight live release readiness smoke |
| `origin/codex/release-flow-prod-live-start-confirm-87` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=85; 2026-07-10; feat: confirm live release start actions |
| `origin/codex/release-flow-prod-notify-audit-meta-66` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=63; 2026-07-10; feat: enrich release notify audit metadata |
| `origin/codex/release-flow-prod-notify-cooldown-63` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=60; 2026-07-10; feat: audit release notify cooldowns |
| `origin/codex/release-flow-prod-notify-cooldown-handoff-65` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=62; 2026-07-10; feat: surface release notify cooldowns |
| `origin/codex/release-flow-prod-operator-controls-19` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=16; 2026-07-10; feat: require operator context for release actions |
| `origin/codex/release-flow-prod-ops-observability-06` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=3; 2026-07-09; feat: surface release flow ops signals |
| `origin/codex/release-flow-prod-ops-rehearsal-27` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=24; 2026-07-10; feat: rehearse release flow operator actions |
| `origin/codex/release-flow-prod-ops-smoke-05` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=2; 2026-07-09; test: add release flow smoke check |
| `origin/codex/release-flow-prod-owner-gate-46` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=43; 2026-07-10; feat: require production release owners |
| `origin/codex/release-flow-prod-paused-run-summary-76` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=73; 2026-07-10; feat: summarize paused release runs |
| `origin/codex/release-flow-prod-permission-gates-42` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=39; 2026-07-10; feat: split release flow permission gates |
| `origin/codex/release-flow-prod-policy-override-filter-104` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=102; 2026-07-10; feat: filter release policy overrides |
| `origin/codex/release-flow-prod-policy-override-handoff-105` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=103; 2026-07-10; feat: surface release policy overrides in handoff |
| `origin/codex/release-flow-prod-policy-override-smoke-107` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=105; 2026-07-10; feat: preflight release policy overrides |
| `origin/codex/release-flow-prod-policy-override-source-106` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=104; 2026-07-10; feat: summarize release policy override sources |
| `origin/codex/release-flow-prod-preview-action-hints-88` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=86; 2026-07-10; feat: show release preview action hints |
| `origin/codex/release-flow-prod-preview-copy-90` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=88; 2026-07-10; feat: copy release execution preview |
| `origin/codex/release-flow-prod-production-preflight-109` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=107; 2026-07-10; feat: bundle production release preflights |
| `origin/codex/release-flow-prod-production-preflight-scope-110` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=108; 2026-07-10; feat: scope production release preflights |
| `origin/codex/release-flow-prod-readiness-11` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=8; 2026-07-09; feat: add release flow readiness checks |
| `origin/codex/release-flow-prod-readiness-actions-47` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=44; 2026-07-10; feat: summarize release readiness next actions |
| `origin/codex/release-flow-prod-readiness-copy-89` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=87; 2026-07-10; feat: copy release readiness summary |
| `origin/codex/release-flow-prod-readiness-lock-18` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=15; 2026-07-09; feat: show active release lock in readiness |
| `origin/codex/release-flow-prod-readiness-snapshot-49` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=46; 2026-07-10; feat: snapshot release readiness at dispatch |
| `origin/codex/release-flow-prod-recent-run-shortcuts-78` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=76; 2026-07-10; feat: add recent release run shortcuts |
| `origin/codex/release-flow-prod-redaction-10` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=7; 2026-07-09; feat: redact release flow audit details |
| `origin/codex/release-flow-prod-release-window-39` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=36; 2026-07-10; feat: require release windows for production releases |
| `origin/codex/release-flow-prod-retry-07` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=4; 2026-07-09; feat: retry failed release wave |
| `origin/codex/release-flow-prod-rollback-handoff-reason-82` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=81; 2026-07-10; feat: explain disabled rollback handoff action |
| `origin/codex/release-flow-prod-rollback-override-37` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=34; 2026-07-10; feat: require rollback override reasons |
| `origin/codex/release-flow-prod-run-deeplink-79` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=77; 2026-07-10; feat: deep link release runs |
| `origin/codex/release-flow-prod-run-filters-23` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=20; 2026-07-10; feat: filter release runs by operational state |
| `origin/codex/release-flow-prod-run-health-smoke-71` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=68; 2026-07-10; feat: smoke release run health preflight |
| `origin/codex/release-flow-prod-run-history-20` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=17; 2026-07-10; feat: inspect release run history |
| `origin/codex/release-flow-prod-run-lock-17` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=14; 2026-07-09; feat: block duplicate active release runs |
| `origin/codex/release-flow-prod-run-report-92` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=90; 2026-07-10; feat: copy release run report |
| `origin/codex/release-flow-prod-run-report-api-93` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=91; 2026-07-10; feat: add release run report api |
| `origin/codex/release-flow-prod-run-report-approvals-99` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=97; 2026-07-10; feat: include approvals in release report |
| `origin/codex/release-flow-prod-run-report-audit-summary-98` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=96; 2026-07-10; feat: summarize release report audit events |
| `origin/codex/release-flow-prod-run-report-checks-95` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=93; 2026-07-10; feat: include checks in release run report |
| `origin/codex/release-flow-prod-run-report-context-97` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=95; 2026-07-10; feat: add release report target context |
| `origin/codex/release-flow-prod-run-report-evidence-96` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=94; 2026-07-10; feat: add release report evidence details |
| `origin/codex/release-flow-prod-run-report-export-94` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=92; 2026-07-10; feat: export release run report |
| `origin/codex/release-flow-prod-run-scoped-audit-24` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=21; 2026-07-10; feat: scope release audit to selected run |
| `origin/codex/release-flow-prod-runbook-gate-44` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=41; 2026-07-10; feat: require production release runbooks |
| `origin/codex/release-flow-prod-smoke-annotations-118` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=116; 2026-07-10; feat: annotate failed release smoke checks |
| `origin/codex/release-flow-prod-smoke-ci-bundle-119` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=117; 2026-07-10; feat: bundle release smoke ci artifacts |
| `origin/codex/release-flow-prod-smoke-gh-summary-114` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=112; 2026-07-10; feat: append release smoke action summaries |
| `origin/codex/release-flow-prod-smoke-github-output-117` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=115; 2026-07-10; feat: expose release smoke github outputs |
| `origin/codex/release-flow-prod-smoke-junit-artifact-112` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=110; 2026-07-10; feat: write release smoke junit artifacts |
| `origin/codex/release-flow-prod-smoke-markdown-artifact-113` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=111; 2026-07-10; feat: write release smoke markdown artifacts |
| `origin/codex/release-flow-prod-smoke-redaction-116` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=114; 2026-07-10; feat: redact release smoke artifacts |
| `origin/codex/release-flow-prod-smoke-report-artifact-111` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=109; 2026-07-10; feat: write release smoke report artifacts |
| `origin/codex/release-flow-prod-smoke-safe-retry-115` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=113; 2026-07-10; feat: retry safe release smoke requests |
| `origin/codex/release-flow-prod-smoke-workflow-120` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=118; 2026-07-10; feat: add release flow smoke workflow |
| `origin/codex/release-flow-prod-stale-run-22` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=19; 2026-07-10; feat: flag stale release runs |
| `origin/codex/release-flow-prod-status-summary-shortcuts-75` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=72; 2026-07-10; feat: add status summary shortcuts |
| `origin/codex/release-flow-prod-summary-filter-shortcuts-73` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=70; 2026-07-10; feat: add release summary filter shortcuts |
| `origin/codex/release-flow-prod-terminal-run-summary-77` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=75; 2026-07-10; feat: summarize terminal release runs |
| `origin/codex/release-flow-prod-unhealthy-run-filter-72` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=69; 2026-07-10; feat: filter unhealthy release runs |
| `origin/codex/release-flow-prod-validated-alert-gate-32` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=29; 2026-07-10; feat: require validated alert channels for live releases |
| `origin/codex/release-flow-prod-verification-alert-56` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=53; 2026-07-10; feat: alert on release verification failure |
| `origin/codex/release-flow-prod-verification-filter-60` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=57; 2026-07-10; feat: filter release verification failures |
| `origin/codex/release-flow-prod-verification-gate-50` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=47; 2026-07-10; feat: require production verification evidence |
| `origin/codex/release-flow-prod-verification-jobs-54` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=51; 2026-07-10; feat: snapshot release verification jobs |
| `origin/codex/release-flow-prod-verification-pending-timeout-61` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=58; 2026-07-10; feat: detect release verification timeouts |
| `origin/codex/release-flow-prod-verification-result-55` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=52; 2026-07-10; feat: project release verification results |
| `origin/codex/release-flow-prod-verification-result-ui-57` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=54; 2026-07-10; feat: show verification results in release handoff |
| `origin/codex/release-flow-prod-verification-summary-59` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=56; 2026-07-10; feat: summarize release verification failures |
| `origin/codex/release-flow-prod-verification-timeout-alert-62` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=59; 2026-07-10; feat: escalate release verification timeouts |
| `origin/codex/release-flow-prod-verification-timeout-smoke-70` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=67; 2026-07-10; feat: smoke release verification preflight |
| `origin/codex/release-flow-prod-verification-timeout-status-64` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=61; 2026-07-10; feat: handle release verification timeout status |
| `origin/codex/release-flow-production-deploy-gate-132` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: add release flow production deploy gate |
| `origin/codex/release-flow-production-ownership-guard-136` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: require production ownership evidence |
| `origin/codex/release-flow-production-placeholder-guard-135` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: block production placeholder change tickets |
| `origin/codex/release-flow-production-readiness-check-134` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: add release flow production readiness check |
| `origin/codex/release-flow-safe-pr-evidence-gate-141` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: verify live safe pr evidence |
| `origin/codex/release-flow-smoke-alert-preflight-126` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=124; 2026-07-10; feat: add optional release flow alert preflight |
| `origin/codex/release-flow-smoke-artifact-retention-124` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=122; 2026-07-10; feat: configure release flow smoke artifact retention |
| `origin/codex/release-flow-smoke-concurrency-123` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=121; 2026-07-10; feat: serialize release flow smoke gates |
| `origin/codex/release-flow-smoke-environment-gate-122` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=120; 2026-07-10; feat: protect release flow smoke with github environment |
| `origin/codex/release-flow-smoke-expanded-outputs-128` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=126; 2026-07-10; feat: expose release flow smoke workflow outputs |
| `origin/codex/release-flow-smoke-identity-129` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=127; 2026-07-10; feat: identify release flow smoke runs and artifacts |
| `origin/codex/release-flow-smoke-input-validation-125` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=123; 2026-07-10; feat: validate release flow smoke workflow inputs |
| `origin/codex/release-flow-smoke-live-placeholder-guard-138` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: block direct live smoke placeholders |
| `origin/codex/release-flow-smoke-live-preflight-127` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=125; 2026-07-10; feat: add optional release flow live preflight |
| `origin/codex/release-flow-smoke-request-timeout-130` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=128; 2026-07-10; feat: configure release flow smoke request timeout |
| `origin/codex/release-flow-smoke-retry-policy-131` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=129; 2026-07-10; feat: configure release flow smoke retry policy |
| `origin/codex/release-flow-smoke-reusable-workflow-121` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=119; 2026-07-10; feat: make release flow smoke workflow reusable |
| `origin/codex/release-flow-worker-topology-143` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: harden release flow production operations |
| `origin/codex/team-release-flow-production-evidence-verifier` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; fix: pin production evidence to workflow run ids |
| `origin/codex/testtttt` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-10; feat: emit gitops change context for RCA |
| `origin/codex/ui-layer-lab-references` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=4; 2026-07-09; 문서: 디지털 트윈 데모 색인 연결 |
| `origin/codex/yaml-editor` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=406; 2026-07-04; feat: add yaml editor frontend |
| `origin/dev` | 보호 | 0 | 보존 | 명시 보호 브랜치; ahead=0; 2026-07-13; docs: R 후속 정리 / baseline 공집합 / P 재개 |
| `origin/feat/jeonwoohyun-hydromel/command-worker` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=229; 2026-06-30; Merge remote-tracking branch 'origin/dev' into HEAD |
| `origin/feat/jeonwoohyun-hydromel/gitops-sync-worker` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=228; 2026-06-30; Merge remote-tracking branch 'origin/dev' into HEAD |
| `origin/feat/minmings111/agent-command-k8s` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=459; 2026-07-04; refactor: realtime 계약 상수 / Gateway 필드 / drift 방지 |
| `origin/feat/minmings111/expand-provider-evidence-dev` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-11; fix(target-agent): bound loki and tempo evidence items |
| `origin/feat/minmings111/expand-provider-evidence` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=531; 2026-07-08; test: update telemetry registry metadata source |
| `origin/feat/minmings111/node-collector` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=228; 2026-06-30; Merge remote-tracking branch 'origin/dev' into HEAD |
| `origin/feat/minmings111/remove-provider-raw-payload` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=525; 2026-07-06; fix: remove raw telemetry payloads |
| `origin/feat/ummfieg/audit-timeline-service` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=228; 2026-06-30; Merge remote-tracking branch 'origin/dev' into HEAD |
| `origin/feat/ummfieg/dashboard-projection-service` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=228; 2026-06-30; Merge remote-tracking branch 'origin/dev' into HEAD |
| `origin/feat/ummfieg/rca-evidence-schema-finalization` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-11; RCA evidence window Bruno 요청 추가 |
| `origin/feat/ummfieg/rca-rollout-dependency-rules` | A | 0 | 원격 삭제 완료 | origin/dev ancestor 증명; ahead=0; 2026-07-12; feat: RCA 스케줄링 룰 보강 |
| `origin/feat/ummfieg/rca-workers` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=323; 2026-07-03; refactor: agent pipeline / 죽은 코드 / export 정리 |
| `origin/feat/ummfieg/rca-worker` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=228; 2026-06-30; Merge remote-tracking branch 'origin/dev' into HEAD |
| `origin/main` | 보호 | 1 | 보존 | 명시 보호 브랜치; ahead=1324; 2026-07-11; Merge pull request #585 from Jungle-303-04/codex/cloudflare-mtls-dispatch |
| `origin/practice/jcbbbbbb-event-system-gateway-auth` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=164; 2026-06-30; feat: gateway_auth_event 흐름 실습 |
| `origin/practice/jeonwoohyun-event-test` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=226; 2026-06-30; feat: RCA 빈 이벤트 / 정책 흐름 / 장애 플래그 |
| `origin/practice/ummfieg-event-system-rca-safe-pr` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=211; 2026-06-30; Merge branch 'main' into practice/ummfieg-event-system-rca-safe-pr |
| `origin/woonyong-kr/frontend` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=636; 2026-07-07; refactor: 데이터 접근을 api 계층으로 격리 (mock 어댑터) |
| `origin/woonyong/ui-layer-lab` | 보호 | 1 | 보존 | 명시 보호 브랜치; ahead=220; 2026-07-13; test: 메트릭 명령 재전송 금지 / 상태 추적 계약 |
| `woonyong-kr/frontend` | C | 1 | 사람 판단 대기 | 미착륙·비활성; ahead=609; 2026-07-07; 문서: 외부 콘솔 인스턴스 런북 정합성 보강 |
| `woonyong/ui-layer-lab` | 보호 | 1 | 보존 | 명시 보호 브랜치; ahead=220; 2026-07-13; test: 메트릭 명령 재전송 금지 / 상태 추적 계약 |

- [A]는 이 표가 선행 커밋된 뒤에만 삭제한다. 모든 [A]는 `origin/dev` ancestor exit 0이다.
- [B] 활성 lane과 보호 브랜치는 처리하지 않는다.
- [C]는 미착륙 상태이므로 전부 사람 판단 대기로 보존한다.

[2026-07-13 07:34 KST] [백엔드] 브랜치 회수 완료 — [A] 원격 21개 삭제 / 로컬 대상 0개 / 관련 worktree 0개 / `git worktree prune` 완료

- 삭제 후 `git ls-remote --heads origin` 재검증: 대상 21개 잔존 0개.
- [B] 활성 lane 5개·보호 6개는 유지했다.
- [C] 166개는 사람 판단 대기로 유지했다.

[2026-07-13 07:40 KST] [벤치] oom 2개 + 7da4d6ba7

[2026-07-13 07:40 KST] [벤치] crashloop 2개 + 7ab0d447b

[2026-07-13 07:41 KST] [벤치] imagepull 2개 + 281c636b4

[2026-07-13 07:42 KST] [벤치] probe 2개 + cc0b91ce7

[2026-07-13 07:43 KST] [벤치] service-selector 2개 + dd601b3f8

[2026-07-13 07:46 KST] [벤치] BLOCKED — `bash scripts/test.sh`: 1 failed, 1645 passed,
3 skipped. `tests/test_docs_index.py::test_all_markdown_docs_are_linked_from_docs_root`가 신규
`docs/spec/remediation-bundle-v1alpha1.md`의 `docs/README.md` 링크를 요구함. 해결 파일
`docs/README.md`는 [D-013] 소유 경로 밖이므로 수정 금지. 자체 채점은 10개 전부 PASS,
ruff/import-linter PASS. 질문: B-트랙에 `docs/README.md` 링크 1줄 수정 권한을 추가할지,
백엔드 문서 소유자가 링크를 착륙시킬지 결정 요청.

## 2026-07-13 07:46 KST — C0 완료 증거

- branch: `codex/f-audit-timeline`
- HEAD: `308a6edc1d4f07198aa3b64390af94a690895b11`
- commits: `308a6edc1 feat: 이벤트 테넌트 귀속 / outbox 보존 / 감사 인덱스`
- stat: 27 files changed, 799 insertions(+), 56 deletions(-); 신규 migration·workspace context·테넌시 테스트 포함.
- 신규 테스트: workspace 봉투·outbox/relay·audit 적재·인증 경계·worker 자식·GitHub 권위 binding·구버전 positional ABI·migration up/down/autocommit 경계 `21 passed`.
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken, compileall PASS, pytest `1664 passed, 3 skipped`, manifest PASS(management 68, target 20).
- migration: Alembic 단일 head `20260713_0655`; nullable 컬럼·재시도 가능 DDL·CONCURRENTLY autocommit 경계·downgrade 순서 검증.
- 독립 감사: 계약·보안 최종 P0 0건/P1 0건.
- frozen path·gateway 계약 변경 0건: `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py`, `src/packages/contracts/gateway/**`.

[2026-07-13 07:46 KST] [백엔드] C in_progress — C0 완료 후 workspace-scoped audit timeline 계약 lock 확보

[2026-07-13 07:46 KST] [백엔드] BLOCKED P — 사유: 실제 런타임 GitOps 권위 port 주입에는 frozen `src/services/ai/dispatch-worker/app.py` handler의 `EventContext` 배선이 필수이나 [D-012] 예외는 `src/services/ai/agent/recovery/**`만 허용 / 재현: 무인자 `RecoveryDispatcher()` 운영 경로는 DB authority를 받을 수 없어 모든 실제 patch가 `unsupported` / 질문: `dispatch-worker/app.py`의 handler `(evt, ctx)`·`RecoveryDispatcher(authority=ctx.db)` 최소 배선 예외 승인 여부 / 재개 조건: 해당 파일 3개 논리 변경 승인

## 2026-07-13 08:02 KST — C 완료 증거

- branch: `codex/f-audit-timeline`
- HEAD: `d6ee319e5`
- commits: `8f5f314c7 fix: webhook 상관관계 / poller 계약 / 이벤트 연속성`, `d6ee319e5 feat: 감사 타임라인 / 클러스터 권한 / keyset 커서`.
- stat: C route 12 files changed, 800 insertions(+), 2 deletions(-); 신규 route·Bruno·migration·테스트 포함.
- 인가: session workspace → RCA report/evidence 권위 cluster 단일성 → `RCA_READ`; 미존재·NULL·충돌·거부는 404. 실제 timeline SELECT가 ownership을 동일 snapshot에서 재검증.
- 데이터 경계: raw JSONB 미선택, 알려진 subject의 허용 scalar 21개만 SQL에서 최대 500자 projection; 기본 50/최대 200 keyset 페이지.
- 신규/관련 테스트: 139 passed; 전체 pytest `1675 passed, 3 skipped`.
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken, compileall PASS, manifest PASS(management 68, target 20), Alembic 단일 head `20260713_0750`.
- 독립 감사: 계약·보안 최종 P0 0건/P1 0건.
- frozen path 변경 0건: `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py`.

[2026-07-13 08:02 KST] [백엔드] D in_progress — 신규 `src/domains/rca_changes/` 도메인으로 frozen RCA와 분리; projection·조회 계약 lock 확보

## GO-REQUEST [B] — KubeHealBench v0.1 lane 통합 승인 요청

- 대상: `codex/bench-scenarios` (산출물 HEAD `221207fe0`; 이 블록은 별도 docs 증거 커밋).
- 완료 범위: [D-013]/[D-014] — 실제 cause/recovery 카탈로그 기반 정답 시나리오 10개
  (oom/crashloop/imagepull/probe/service-selector 각 2개), 자기완결 정적 채점기, 공개 지표
  6개 정의, RemediationBundle v1alpha1 공개 규격, docs 색인 링크.
- 커밋: `7da4d6ba7`, `7ab0d447b`, `281c636b4`, `cc0b91ce7`, `dd601b3f8`,
  `8d5442985`, `0ccddaf3f`, `221207fe0`.
- 자체 채점: `python3 benchmark/score.py` → `RESULT PASS (10 scenarios;
  crashloop=2, imagepull=2, oom=2, probe=2, service-selector=2)`; live catalog/recovery 원본
  SHA-256 일치, schema/candidate/named evidence/recovery action/forbidden blast-radius 검증.
- 최종 전체 게이트: `bash scripts/test.sh` → Ruff lint PASS / format
  `470 files already formatted` / import-linter `2 kept, 0 broken` / pytest
  `1646 passed, 3 skipped`.
- 범위 증거: `src/**` 변경 0건. [D-014] 예외 `docs/README.md`는 자기 산출물 링크 1줄
  추가만 존재하며 기존 줄 수정·삭제 0건. 그 외 변경은 `benchmark/**`,
  `docs/spec/remediation-bundle-v1alpha1.md`, 요구된 `docs/auto/night-log.md` 기록뿐.
- 사람 검증 명령(복사 가능):

  ```bash
  git -C /private/tmp/sw-ai-bench-scenarios status --short
  git -C /private/tmp/sw-ai-bench-scenarios diff --name-only f086be51c...codex/bench-scenarios
  git -C /private/tmp/sw-ai-bench-scenarios diff --name-only f086be51c...codex/bench-scenarios -- 'src/**'
  python3 /private/tmp/sw-ai-bench-scenarios/benchmark/score.py
  bash /private/tmp/sw-ai-bench-scenarios/scripts/test.sh
  ```

- 예상 결과: 첫 명령 0줄, 변경은 B-트랙 소유 경로·night-log·[D-014] 색인 1줄뿐,
  `src/**` 명령 0줄, scorer 10개 PASS, 전체 gate PASS.
- 사람 GO 후 통합: dev worktree를 clean 상태로 만든 뒤 `--no-ff` merge와 `origin dev` push.
  이 세션은 merge/push하지 않고 대기한다.
- 실패 시 롤백: push 전 충돌/검증 실패는 merge를 완료하거나 push하지 말고 사람 판단;
  push 후에는 이력 보존형 `git revert -m 1 <merge_commit>` 후 전체 gate 재검증.

[2026-07-13 08:11 KST] [백엔드] B merge 완결·push — 0d0f92cca, 976282faa
ancestor exit 0, 사람 위임 GO [B]

[2026-07-13 08:13 KST] [프론트] API queue batch 앵커 동기화 — `56c689e61`(Applications/GitOps approval/workload action), `c875efb1f`(RCA/evidence/recovery), `004f23d52`(usage/preset/telemetry) 원격 ancestor 확인. targeted API contract 10 files / 70 tests PASS, docs/Bruno 17 tests PASS, manifest-check PASS. untracked feature draft가 남아 있어 full UI gate는 이번 heartbeat 완료 증거로 쓰지 않음.

[2026-07-13 08:17 KST] [프론트] API queue batch full gate 재검증 PASS — Metrics 화면 draft 임시 격리 후 TypeScript·ESLint, 97 files / 710 tests, design guard 286, shadcn 482, production build 통과. 18개 batch anchor의 전체 gate 근거 확정.

[2026-07-13 08:28 KST] [프론트] 테마 첫 페인트 검증 PASS — 저장 테마와 시스템 테마 반대 조건에서 light/dark 각 5회 새로고침, 최초 5프레임의 클래스·colorScheme·불투명 배경 일치, 플래시 0.

[2026-07-13 08:37 KST] [OSS] 공개 준비 초안 9개 해소 — `7c1966a6e` / Apache-2.0
공식 원문 byte 일치, 내부 실명·조직·이메일·도메인·AWS 식별자·비밀 값·클러스터 식별자
자체 스캔 PASS(허용 URL은 Apache 공식 원문 2개뿐) / 전체 게이트: Ruff lint PASS,
format `470 files already formatted`, import-linter `2 kept, 0 broken`, pytest
`1646 passed, 3 skipped`.

## GO-REQUEST [OSS] — 공개 위생 드래프트 lane 통합 승인 요청

- 대상: `codex/oss-hygiene` (산출물 HEAD `7c1966a6e`; 이 블록은 별도 docs 증거 커밋).
- 완료 범위: [D-015] — `docs/oss/**` 신규 초안 9파일과 `docs/README.md` 자기 산출물
  링크 9줄. 저장소 공개·프로젝트명·상표·Apache-2.0 채택·거버넌스·maintainer 지정은
  모두 사람 결정으로 명시했고 실제 공개·정책 채택은 수행하지 않음.
- 산출물: 영문 포지셔닝/3장면 데모 README, Apache-2.0 `LICENSE.draft`, 시나리오 1개
  단위 CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, GOVERNANCE, MAINTAINERS, CHANGELOG,
  사람용 publication checklist.
- 위생 증거: Apache 공식 `LICENSE-2.0.txt`와 `LICENSE.draft` byte 일치. `docs/oss/**`에서
  한글 실명, 이메일, IPv4, AWS key/account/ARN, private-key marker, password/secret/token
  할당값, UUID, 알려진 내부명·내부 도메인 후보 0건. URL 2개는 라이선스 본문의
  `apache.org` 공식 URL만 존재.
- 최종 게이트: `bash scripts/test.sh` → Ruff lint PASS / format
  `470 files already formatted` / import-linter `2 kept, 0 broken` / pytest
  `1646 passed, 3 skipped`.
- 범위 증거: `src/**` 및 타 트랙 경로 변경 0건. 변경은 `docs/oss/**`, 자기 링크만
  추가한 `docs/README.md`, 요구된 `docs/auto/night-log.md` 기록뿐.
- 사람 검증 명령(복사 가능):

  ```bash
  git -C /private/tmp/sw-ai-oss-hygiene status --short
  git -C /private/tmp/sw-ai-oss-hygiene diff --name-only origin/dev...codex/oss-hygiene
  git -C /private/tmp/sw-ai-oss-hygiene diff --name-only origin/dev...codex/oss-hygiene -- 'src/**'
  diff -q <(curl -fsSL https://www.apache.org/licenses/LICENSE-2.0.txt) /private/tmp/sw-ai-oss-hygiene/docs/oss/LICENSE.draft
  bash /private/tmp/sw-ai-oss-hygiene/scripts/test.sh
  ```

- 예상 결과: 첫 명령 0줄, 변경은 위 허용 경로뿐, `src/**` 명령 0줄, license diff 0줄,
  전체 gate PASS.
- 사람 GO 전에는 merge/push·공개 저장소 생성·라이선스 채택을 수행하지 않고 대기한다.

[2026-07-13 09:07 KST] [백엔드] OSS merge 완결·push — 2acd5ccbd, ac2bb5234
ancestor exit 0, 사람 위임 GO [OSS]

[2026-07-13 09:07 KST] [백엔드] [D-016]/BQ-012 우선 계획 — P(BQ-009/010)와
파일 비중첩 병렬 착수; (a)+(b) 조합으로 LLM 제안은 catalog cause ID hypothesis에 한정하고
결정론적 catalog signal 1개 이상 검증 전 `rca.completed`를 차단하며, source-name-only
조작 회귀 테스트를 선행한 뒤 양쪽 전체 게이트로 합류.

## 2026-07-13 09:43 KST — D 완료 증거

- branch: `codex/f-audit-timeline`
- HEAD: `24998dfafd910c6429096b4160e82e667354b4c4`
- commits: `744c12f34 feat: 배포 변경 투영 / 인시던트 조회 / PR 참조`, `24998dfaf test: 마이그레이션 head / 회귀 정합 / 전체 게이트`.
- stat: 기능 커밋 21 files changed, 2,000 insertions(+), 2 deletions(-); 회귀 정합 1 file changed, 1 insertion(+), 1 deletion(-).
- 의미 경계: `WorkflowRunCompletedBody` 중 권위 run·diff/apply step·활성 binding·command 성공이 모두 일치한 실제 적용만 투영; 실패·거절·no-op 제외.
- 인가·시간 경계: session workspace → incident workload 단일성 → `RCA_READ`; 거부·모호성은 404. `audit_log.event_created_at`의 immutable `incident.detected` event-time 이후 변경은 제외.
- PR 경계: workspace/repository/binding/workflow/commit/manifest exact-key LEFT JOIN으로 PR 선행·후행·동시 도착 결과를 동일하게 유지; 허용 GitHub HTTPS origin/repository path만 노출.
- 신규/관련 테스트: `tests/test_rca_changes.py` + migration `25 passed`; 전체 게이트 Ruff lint/format PASS, import-linter 2 kept/0 broken, compileall PASS, pytest `1700 passed, 3 skipped`.
- migration·manifest: Alembic 단일 head `20260713_0820`; concurrent incident index 선행 후 transactional table/column DDL로 재시도 안전; manifest PASS(management 69, target 20).
- 독립 보안 감사: 최종 P0 0건/P1 0건.
- frozen path 변경 0건: `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py`.
- origin/dev merge·push·앵커 0건; H 사람 게이트 전 `done-pending-merge`.

[2026-07-13 09:44 KST] [프론트-D] APIQ-019 in_progress — AI 대화 4함수 strict envelope·open JsonMap·AbortSignal·possibly-sent POST 단일 호출 계약 claim. 코드 커밋과 완료 앵커 전 화면 소비 0 유지.

[2026-07-13 09:46 KST] [백엔드] D-017~019 기준점 영속화 — `4ac003c97`,
docs-only 2파일, BQ-009 `requested` + BQ-012~017 등록, origin/dev push 확인.

[2026-07-13 09:47 KST] [프론트] A2 우선 전환 — APIQ-019 코드는 미커밋 보존하고 claim을 requested로 반환. 최신 origin/dev 충돌 표와 GO-REQUEST 갱신 전까지 D단계·화면 소비 HOLD.

[2026-07-13 09:53 KST] [백엔드] BQ-012 완료 — RED `c882010de`, GREEN/origin
`ea5b3ed20`; (a)+(b) catalog hypothesis 계약으로 source-name-only 조작은
`signal:oom_evidence` 누락·`rca.analysis_blocked`, 실제 signal만 completed, catalog 밖 ID
무발행. 관련 56 passed / 전체 Ruff·format·import-linter PASS, pytest
`1647 passed, 3 skipped` / worker·agent·공개 설명 문서 착륙 — DoD 4조건 충족.

[2026-07-13 09:54 KST] [백엔드] D-020~021 조율 분리 — commit 전
`git diff --name-only`은 `docs/auto/night-directives.md`, `docs/auto/night-log.md` 2파일.
`docs/backend-f-workqueue.md`의 BQ-009 `requested`와 BQ-012~017 행은 `01a3a2e97`
정본에 이미 존재해 중복 편집하지 않았고, 공유 dev worktree의 벤치·기타 변경은 혼입 0건.

## 2026-07-13 09:56 KST — H1 착륙 증거

- lane: `codex/f-audit-timeline`, rebase HEAD `bfaa4bba7`
- canonical merge: `17ac2b7a32413579f2570218a99bf50f34d162c3` (`--no-ff`)
- 시험 merge: `git merge-tree --write-tree origin/dev codex/f-audit-timeline` exit 0
- 전체 게이트: Ruff lint PASS, format `484 files already formatted`, import-linter
  `2 kept, 0 broken`, pytest `1701 passed, 3 skipped`
- ancestor: lane HEAD `bfaa4bba7`, C `66cbe8dec`, D `81969f23e` 모두 origin/dev 기준 exit 0
- 해시 정합: 지시의 `7d74d765c`는 최신 rebase 전 동등 C 커밋으로 ancestor exit 1;
  현행 동등 C 커밋 `66cbe8dec`를 canonical 증거로 갱신
- 경계: frozen `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py`
  변경 0건; Bruno 14/15로 타임라인·최근 변경 route 재현 가능

## 2026-07-13 09:58 KST — H2 착륙 증거

- lane: `codex/f-inprocess-event-bus`, rebase HEAD `6ec2553b7`
- canonical merge: `5f2393667ece3607e75674fcf8c9be9d9c1773b9` (`--no-ff`)
- rebase: dev 대비 61커밋 낙후 상태에서 src/docs 충돌 0건, 재배치 후 `0/5`
- 시험 merge: `git merge-tree --write-tree origin/dev codex/f-inprocess-event-bus` exit 0
- 전체 게이트: Ruff lint PASS, format `486 files already formatted`, import-linter
  `2 kept, 0 broken`, pytest `1708 passed, 3 skipped`
- ancestor: lane HEAD `6ec2553b7`, 기능 commit `b6fac1dd7` 모두 origin/dev 기준 exit 0
- 회귀 경계: NATS 기본값 유지, 명시 주입 시에만 in-memory bus 사용; gateway 계약,
  `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py` 변경 0건

[2026-07-13 09:59 KST] [백엔드] H2 lane 회수·PROMOTE 대기 — worktree 제거 성공,
로컬 branch `git branch -d`는 stale upstream `origin/codex/f-inprocess-event-bus` 기준
미병합 판정으로 거부되어 `-D` 없이 [D-021] 2차 정리 단계로 보류했다. 원격 lab은
`ef9706aca`, dev는 `40d1ed67b`, 앞뒤 `533/236`이며 FE-A2 완료·lab full gate 증거가
아직 없어 GO [PROMOTE]는 실행하지 않는다.

[2026-07-13 10:00 KST] [백엔드] BQ-013 완료 — RED `c89ad5a96`, GREEN
`50df7fe10`, canonical origin/dev `27cb1d95f`; `RECONCILER_MODE=builtin` 기본은 기존
apply를 유지하고 `argocd`는 observer-only로 apply 0건(`StubApplier.applied == []`,
observe 1건)을 증명. 재현: `uv run python -m pytest -q
tests/test_target_policy_control.py -k argocd`; 최신 origin 병합 상태 전체 Ruff·format·
import-linter PASS(2 kept, 0 broken), pytest `1711 passed, 3 skipped`; 서비스 계약 문서와
큐 상태 착륙으로 [D-019] DoD 4조건 충족.

## 2026-07-13 10:07 KST — E/BQ-006 완료 증거

- HEAD/canonical origin: 기능 `308e0bb6b`, merge `8cd0b18e9`; RED `410807eed`.
- 계약: worker와 run API가 `promotion_gate_from_command_result` 단일 판정을 소비.
  `completed`, `applied is not False`, 실패 resource 0건, `rollout.ready is not False`를
  모두 만족할 때만 `eligible=true`; 관측 윈도우는 포함하지 않음.
- 회귀/직렬화: 관련 48 passed. 기존 동적 run 필드를 보존하고 OpenAPI가
  `PromotionGateResponse`를 링크하는 테스트 포함.
- 전체 게이트: Ruff lint/format PASS(`487 files`), import-linter `2 kept, 0 broken`,
  pytest `1720 passed, 3 skipped`.
- 제3자 실측: `docs/api/10-applications/06-list-runs.bru`가 gate 필수 키,
  failed resource count, `eligible` 계산을 응답에서 검산.
- 문서/범위: contracts·workflow-controller·applications·frontend 인계 문서 착륙;
  frozen `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py` 변경 0건.
  origin 착륙·전체 그린·Bruno 실측·관련 문서 4조건 충족.

## 2026-07-13 10:17 KST — [프론트] FE-A2 완료 증거

- merge commit: `4422a68005c668e15227f3c21747579ddf403bc1`
- target parent: lab `f1eb1b5094c5cd3ac897f9d4bef30a5153afb6cf`
- source parent: dev `91633c14e028e48c557eb9a66407e7d4630432f6`
- 충돌 38건 해소: dev 정책 24건, lab 정책 13건, `docs/auto/night-log.md` 양측 보존 1건.
  night-log는 공통 prefix 117행, lab 고유 16블록, dev 고유 40블록 누락 0,
  conflict marker 0으로 KST 순 합성했다.
- broad lab 소유권 적용: 비충돌로 유입된 dev-only `references/ui-layer-lab/**` 예제·style
  26파일을 제거해 lab HEAD subtree를 유지했다. 사전 예외 후보 4건은 적용 0건이다.
- 게이트 수정: 첫 `npm run check`는 dev-only 예제의 미선언 `@xyflow/react` 의존으로 실패해
  broad lab 정책 적용 후 해소했다. 첫 visual gate는 인증 오류 전체 화면에 `h1`이 없는
  접근성 결함을 검출해 `ProductStateScreen.headingLevel`과 auth 회귀 테스트 4파일로 수정했다.
- 최종 `npm run check` PASS: TypeScript·ESLint, Vitest 100 files / 727 tests,
  design guard 303 files, shadcn audit 482 previews, Vite 14,508 modules production build.
- `npm run visual-product` PASS: 인증·홈·리소스·상세·상태·shell 34개 isolated scenario,
  320px reflow, 200% text resize, forced-colors, ko/en locale 포함.
- merge 전 WIP는 `stash@{0}: wip-pre-fe-a2-20260713`으로 보존했으며 이번 merge·문서
  커밋에는 혼입하지 않았다.

## GO-EXECUTION [FE-A2] — H1·H2 착륙 후 최종 충돌 계획

- 사람 위임: `[D-021] GO [FE-A2]`.
- H1: canonical merge `17ac2b7a32413579f2570218a99bf50f34d162c3`, 계약 앵커
  `66cbe8dec7cb478f5b0774bb5e7bbaab5f616894`·`81969f23e46cb40743af08ffbc1affe556bd5c5e`,
  모두 `origin/dev` ancestor exit 0.
- H2: canonical merge `5f2393667ece3607e75674fcf8c9be9d9c1773b9`, 계약 앵커
  `b6fac1dd742f3c5c88fee1db87e3e081fb1bc794`, `origin/dev` ancestor exit 0.
- target: `ef9706aca22e21540ec4d6be3870c52cc6c48047`.
- source: `27cb1d95f27b87f0ff05723bdd9fdd91fc1260ad`.
- merge-base: `9fe235e7b03032af7d7ac3b14d05ab0f17306b02`.
- divergence: target-only 236 / source-only 537.
- `git merge-tree --write-tree origin/woonyong/ui-layer-lab origin/dev`: exit 1,
  conflict message 38개(내용/add-add 20, lab 삭제·dev 수정 17, `frontend` symlink·directory 1).

| 경로 | lab 변경 요약 | dev 변경 요약 | 확정 해소안 |
|---|---|---|---|
| `.gitignore` | `.env.*`, `.env.example` 예외 | `.env*`, Bruno local/cert 제외 | dev |
| `Makefile` | optional Radar target | local `smoke`, Actions smoke 제거 | dev |
| `docs/README.md` | frontend 정본·테마 증거 색인 | backend·OSS·보안·release 색인 | dev |
| `docs/auto/frontend-pipeline.md` | A/B/C 완료, A2 실행 상태 | 초기 frontend pipeline 상태 | 양측 보존: lab의 최신 상태를 정본으로 유지하고 dev 이력은 Git/night-log로 보존 |
| `docs/auto/night-log.md` | frontend API·게이트·테마·A2 기록 | backend C/D/H1/H2·OSS 기록 | 양측 고유 블록 전부 보존, KST 시각 순 합성 |
| `docs/aws-testing-runbook.md` | RCA worker 표 보강 | AWS 운영 런북 전면 갱신 | dev |
| `docs/spec/frontend/chat.md` | legacy spec 삭제 | AI context 규칙 추가 | lab 삭제 유지 |
| `docs/spec/frontend/repo.md` | legacy spec 삭제 | Safe PR context 규칙 추가 | lab 삭제 유지 |
| `docs/spec/frontend/workflow.md` | legacy spec 삭제 | approval context 규칙 추가 | lab 삭제 유지 |
| `frontend/nginx.conf` | legacy tree 삭제 | internal auth header 방어 | dev 파일 유지 |
| `frontend/package-lock.json` | 삭제 | Monaco/ELK lock 갱신 | dev 파일 유지 |
| `frontend/package.json` | 삭제 | Monaco/ELK 의존성 | dev 파일 유지 |
| `frontend/src/app/router.tsx` | 삭제 | release-flow route | dev 파일 유지 |
| `frontend/src/features/chat/context.ts` | 삭제 | application/workflow context | dev 파일 유지 |
| `frontend/src/features/notifications/AlertChannelsView.tsx` | 삭제 | 검증 상태 UI | dev 파일 유지 |
| `frontend/src/features/notifications/api.ts` | 삭제 | 검증 응답·invalidate | dev 파일 유지 |
| `frontend/src/features/repo/RepoDetailView.tsx` | 삭제 | GitOps/Safe PR 설명 UI | dev 파일 유지 |
| `frontend/src/features/repo/api.ts` | 삭제 | release/audit invalidate | dev 파일 유지 |
| `frontend/src/features/workflow/WorkflowGraphView.tsx` | 삭제 | 승인 diff AI 설명 | dev 파일 유지 |
| `frontend/src/features/workflow/WorkflowListView.tsx` | 삭제 | release-flow 이동 | dev 파일 유지 |
| `frontend/src/shared/flow/index.tsx` | 삭제 | ELK layout·pan/zoom | dev 파일 유지 |
| `frontend/src/shared/lib/api.ts` | 삭제 | blob download·blocker 오류 | dev 파일 유지 |
| `frontend/src/shared/lib/types.ts` | 삭제 | release/readiness 타입 | dev 파일 유지 |
| `frontend` 구조 | `references/ui-layer-lab` symlink | 운영 frontend directory | dev directory 유지, symlink 제거 |
| `references/ui-layer-lab/.gitignore` | product output 포함 | 최소 lab ignore | lab |
| `references/ui-layer-lab/README.md` | shadcn snapshot·제품 게이트 | 예제 registry 설명 | lab |
| `references/ui-layer-lab/index.html` | theme/locale prepaint·KubeHeal meta | 최소 lab shell | lab |
| `references/ui-layer-lab/package-lock.json` | React 19·제품 전체 lock | React 18 예제 lock | lab |
| `references/ui-layer-lab/package.json` | product test/design/visual scripts | 최소 build scripts | lab |
| `references/ui-layer-lab/src/App.tsx` | official catalog route | Preview/Code 목록 | lab |
| `references/ui-layer-lab/src/main.tsx` | `/product` ProductApp 분기 | 단일 lab App | lab |
| `references/ui-layer-lab/tsconfig.json` | strict product/shim/fixture 설정 | 최소 Vite 설정 | lab |
| `references/ui-layer-lab/vite.config.ts` | Tailwind·Vitest·proxy·aliases | React·5180·flow chunks | lab |
| `src/domains/target/install_manifest.py` | fast-lane/management 경계 | metrics/catalog RBAC·realtime URL | dev |
| `src/services/gateway/api-gateway/auth.py` | DEV_AUTH_BYPASS | trusted mTLS proxy identity | dev |
| `src/services/gateway/api-gateway/settings.py` | bypass 상수 | root path·metrics fail-closed | dev |
| `tests/test_password_auth.py` | bypass 회귀 | trusted proxy 회귀 | dev |
| `tests/test_target_registration.py` | fast-lane 명칭 회귀 | RBAC·realtime·purge·admin 회귀 | dev |

예외 후보 감사 결과(이번 충돌 해소에는 별도 승인 없이 적용하지 않음):

1. `.gitignore`의 `!.env.example` 1줄.
2. `docs/README.md`의 현재 frontend 정본 색인 블록.
3. dev 최신 target manifest 위의 fast-lane 이름·management exclusion 좁은 hunk.
4. 비충돌 파일 `tests/test_rca_timeline_janitor.py`의 flake 완화 수치.

실행 계획:

```bash
git stash push --include-untracked -m "wip-pre-fe-a2-20260713"
git merge --no-ff origin/dev
# 위 표대로 충돌 해소 후 git add/rm
cd references/ui-layer-lab
npm run check
npm run visual-product
```

예상 밖 충돌 또는 의미가 다른 파일이 나오면 해소를 중단하고 보고한다. push 전 실패·취소는
`git merge --abort`; push 후 롤백은 merge commit을 보존하는 `git revert -m 1 <merge_commit>` 후
전체 게이트 재실행이다. full gate와 visual-product가 모두 PASS하기 전에는 A2 완료·PROMOTE 인계를
기록하지 않는다.

## 2026-07-13 10:31 KST — [프론트] FE-A2 subtree 완전성 보정

- 보정 commit: `2b66dee9c` (`fix: legacy 프론트 전체 복원 / 문서 색인 정합`).
- 원인: symlink-directory 충돌을 파일 충돌 14건만 해소해 source parent
  `91633c14e`의 legacy `frontend/**` 중 71파일이 병합 결과에서 누락됐다.
- 해소: `frontend/**` 전체를 source parent와 byte 동일하게 복원했다. `git diff --quiet
  91633c14e -- frontend` exit 0, symlink 0, 실제 directory 유지.
- 문서: lab 삭제 정본과 충돌한 `docs/README.md`의 존재하지 않는 frontend spec 링크
  12개를 제거했고, 로컬 Markdown target 검사에서 누락 0을 확인했다.
- UI lab full gate: TypeScript·ESLint PASS, Vitest 100 files / 727 tests,
  design guard 303 files, shadcn audit 482 previews, Vite production build PASS.
- UI lab visual gate: 34 isolated scenarios 연속 2회 PASS, unexpected feature network 0,
  websocket 0, 320px reflow·200% text resize·forced-colors·ko/en 포함.
- legacy frontend: `npm ci` 취약점 0, TypeScript+Vite production build PASS,
  ESLint PASS, Node tests 17/17 PASS.
- `outputs/` untracked는 사용자 소유 산출물로 판단해 stage·수정·삭제 0건.

## 2026-07-13 10:48 KST — BQ-016 완료 증거

- canonical origin: `f0c3b4e42f29c4f011d4d70910b083f7acc031e0`; 발견된 40 entrypoint를
  controller 38(worker 32, async 4, HTTP 2)/agent 2로 단일 배정하고 NATS/in-process
  service plan 동등성을 고정했다.
- 안전 기본값/설치: agent read-only, direct command off, PR-only remediation,
  production auto-merge 금지; controller+PostgreSQL+agent 3컴포넌트이며 공개 프로파일에
  NATS/Redis가 없다.
- 실제 기동: PostgreSQL 16에 조립 루트를 연결해 API/realtime gateway의 health/ready
  4개가 모두 HTTP 200. 첫 기동에서 macOS arm64 SQLAlchemy async `greenlet` 누락을 찾아
  RED `605cde8a3`/GREEN `da370200c`로 직접 의존성을 고정했다. SIGINT 취소 로그도
  RED `90906ab41`/GREEN `f0c3b4e42`로 두 Uvicorn 서버의 graceful shutdown으로 수렴했다.
- 실제 `make demo`: `kind-cluster-ready` → `bad-rollout-observed` →
  `mock-rollback-pr-created` → `workload-normalized` 성공 후 cluster 정리.
  RemediationBundle checksum
  `a0b2b2857701655e9c09ef51ad9cdf5a0e04a87d26a17cad6861d4e0bee897c9` 검증.
- 전체 게이트: Ruff lint/format PASS(491 files), import-linter 2 kept/0 broken,
  pytest `1735 passed, 3 skipped`. origin 착륙·전체 그린·make demo 실측·계약/설치/색인
  문서 착륙으로 [D-019] DoD 4조건 충족.

[2026-07-13 10:51 KST] [백엔드] BQ-009 in_progress — `codex/f-auto-revert-pr`를
보존 lane으로 claim; origin/dev 대비 60커밋 낙후를 확인해 [D-021]에 따라 claim 기준점
착륙 직후 rebase하고, [D-019] frozen 예외 범위에서 권위 read port→dispatcher 주입→
실제 patch 6종/unsupported/rollback을 TDD로 수렴한다. BQ-010은 BQ-009 직후 같은 lane.

[이식 대기] BQ-006 promotion_gate 인계 문구: | `useRuns` | `frontend/src/features/repo/api.ts :: useRuns` | GET `/applications/${appId}/runs` with `{timeoutMs: 8_000}` | `retry:false`, select `d.runs.map(adaptRun)`. raw run의 optional `promotion_gate`는 백엔드 자동 승격 조건의 구조화된 read model이다. **적응 폴링**: raw runs 중 상태(대문자화)가 ACTIVE 집합에 있으면 10s, 아니면 60s |

[2026-07-13 10:54 KST] [백엔드] PROMOTE 완결 — 팀 통합점 `0eaaa6637ca46bf29b073bd0dbe274719ffd5ee3`; lab `977329121`, FE-A2 `9b9a81d8b`·`4422a6800` 모두 origin/dev ancestor exit 0. Ruff lint/format PASS, import-linter 2 kept/0 broken, pytest `1735 passed, 3 skipped`, `tests/test_env_defaults.py` `8 passed`.

[교훈] merge에서 한쪽 삭제 + 한쪽 존재는 무충돌 삭제가 된다 — 대량 동기화 merge 후에는 반드시 소유권 밖 경로의 삭제 감사(`diff --stat -- <경로>`)를 exit criteria에 포함할 것.

## 2026-07-13 11:02 KST — PROMOTE 후 브랜치 정리 2차

- canonical `origin/dev`: `75b99d30ff01dd4d509318ad56d62ae8d44bd703`.
- 실브랜치 175개(`origin/HEAD` 별칭 제외): 보호 6 / 활성 보존 2 / literal ancestor 삭제 대상 0 / 사람 판단 대기 167.
- 착륙 lane 회수: 로컬 `codex/f-audit-timeline`은 이미 부재했고, 로컬
  `codex/f-inprocess-event-bus`는 stale upstream을 해제한 뒤 `git branch -d`로 삭제했다.
- 07:32 KST 전수 감사표의 [C]는 모두 보존했다. 아래 표는 PROMOTE 이후 상태가 달라진
  lane만 재판정한 델타이며, force 삭제·원격 삭제는 수행하지 않았다.

| 브랜치 | 분류 | ancestor exit | 처리 | 근거 |
|---|---:|---:|---|---|
| `codex/f-auto-revert-pr` | B | 1 | 보존 | 활성 P lane; 감사 시점 `07cfa1f154`, origin/dev 대비 behind 244 / ahead 6 |
| `origin/codex/f-auto-revert-pr` | B | 1 | 보존 | 활성 P lane 원격; `e6d4df1dc7`, origin/dev 대비 behind 334 / ahead 1 |
| `origin/codex/f-inprocess-event-bus` | C | 1 | 사람 판단 대기 | `88740e523c`; 패치 동등 5커밋은 dev에 있으나 브랜치 자체는 literal ancestor가 아니므로 엄격 삭제 규칙상 보존 |

- `origin/codex/f-inprocess-event-bus`는 `git cherry origin/dev`에서 5개 모두 `-`로
  패치 동등성이 확인됐지만, `git merge-base --is-ancestor` exit 1이므로 원격 삭제하지 않았다.
- BQ-016은 `origin/dev`에 완료 착륙했고, 다음 큐인 BQ-009는
  `codex/f-auto-revert-pr`에서 진행 중이다. 같은 worktree가 감사 중에도 전진했으므로
  조율 세션은 해당 lane에 동시 수정·rebase·테스트를 수행하지 않는다.

## 2026-07-13 11:10 KST — [프론트] PROMOTE 동기화·BQ-006 인계 이식

- `origin/dev` `a65c66c7102fb453e583ed4ec44f1950a9df9ba2`, 팀 통합 merge
  `0eaaa6637ca46bf29b073bd0dbe274719ffd5ee3`, FE-A2 lab HEAD
  `977329121056ebd583481f127a3c0a64f86182fb`의 ancestor 검증은 모두 exit 0이다.
- canonical `woonyong/ui-layer-lab`을 `origin/dev`로 fast-forward하고 동일 HEAD를 원격 lab에
  push했다.
- 847행의 `[이식 대기]` 원문은
  `docs/spec/frontend/verified-pipeline-insertion-map.md`의 VP-005 행과 §1c로 이식했다.
  optional `promotion_gate`, `PromotionGateResponse` 전 필드, 단일 eligible 판정,
  동적 run 필드 보존, 활성 10초/비활성 60초 폴링 규칙을 보존했다.
- VP-005는 BQ-006 앵커 `8cd0b18e96f1266873d1632486472d0d22c18477`의
  `origin/dev` 착륙을 근거로 `backend 선행`에서 `직결`로 갱신했다.

## 2026-07-13 11:10 KST — [프론트] 브랜치·worktree·stash 전수 감사

- frontend 소유 canonical은 `woonyong/ui-layer-lab` 하나다. 기존
  `codex/ui-layer-lab-references`는 2026-07-09 canonical 이름으로 이미 rename되어 잔존 ref가
  없고, 현재 frontend 소유 임시 branch/worktree는 0개다. 따라서 삭제는 0건이다.
- `git worktree prune --dry-run --verbose`는 출력 0줄, exit 0이다. 아래 Codex ref는 frontend
  소유가 아니거나 활성·미착륙 변경이 있어 유지했다.
  - `codex/f-auto-revert-pr` `bce0ce2f6a91513e3f202dead5498af1a980f5f2`: 감사 중에도
    HEAD가 전진한 활성 backend P lane.
  - `codex/rca-log-evidence-scope-20260710`
    `a5ac062fb53752ec64a7ac37e38611ed0f3454d5`: backend RCA worktree.
  - `codex/runtime-hardening-20260710`
    `ae3ee71a229af78f804f88e16ecdc466443bf5f9`: backend runtime worktree, 미착륙 2커밋.
  - `codex/cloudflare-token-normalization`
    `83864abdf0b677660d35d78a1f05d930acb6854a`: infra/backend 이력.
  - `codex/platform-foundation` `63618a4fb81c4acda22ec125fa7934d9ef9d0204`:
    platform/backend 이력.
- 감사 직후 반영 완료 stash 3건과 빈 stash 1건이 다른 세션에서 동시 제거된 것을 감지했다.
  제거 전·후 hash로 대조했으며 이어진 `git stash drop stash@{9}`는 대상 부재로 실패해 남은
  stash에는 변경이 없었다.
  - `26ea8593e090cf20a14ed3538ecac9ea62dace11`: visual gate·no-content export가 후속
    `6a40a5d01` 및 현행 코드에 반영됨.
  - `5932d438212a273fe8f409a6199050edc9157cc8`: no-content 계약 문서·queue·visual 변경이
    `8ef2338c2`, `6a40a5d01` 및 후속 커밋에 반영됨.
  - `51e64ba44982ba07f41e1962d715a7bc4ae79651`: Sidebar 계약이 `6a40a5d01`에 반영됨.
  - `8fd3b12d2677e52a342c6e66d98589ff75fafcff`: 추적 diff가 없는 빈 stash.
- 유지 stash는 다음 8건이다.
  - `a6c68efbea026595a4c6732a5b4173025a8650ce`
    (`wip-pre-fe-a2-20260713`): APIQ-019 conversation ID 검증과 catalog strict-envelope 회귀
    테스트가 아직 canonical에 미반영이며, forward patch check exit 0.
  - `bc2be0b379ab89e30b3a79647b1fc0516a639705`: legacy `frontend/**` 삭제와 lab dependency
    delta가 FE-A2의 legacy 복원 정책과 달라 미반영; 임의 폐기 없이 보존.
  - `de98fea5d5861aaae0180b66a347392d41e76f27`,
    `e28c22ceb9afa3c4ee0e40d95d2570cb0751f42d`: backend provider/event 작업 소유이며 미반영.
  - `556980eeb427040d1bd39354cf2b02477eb6c7a2`,
    `5c00fb04eb117a556c01c2517ae45f553e65c570`,
    `9b121a137bd91d2d8c93a753bd02fdcd6a52cace`,
    `c764ce58b6dddff4cb58067bbf56a99739de0364`: 과거 demo/rename 작업의 미반영 보존분으로,
    현재 frontend canonical과 소유·경로가 달라 유지.

[2026-07-13 11:56 KST] [프론트] D in_progress — VP-007 provider-free 전역 Cluster selector를 URL 단일 권위·셸 단일 목록 요청·화면 로컬 쿼리 격리 기준으로 구현 및 full gate 검증 중.

## 2026-07-13 12:08 KST — [프론트] VP-007 provider-free slice 완료 증거

- 코드 커밋·push: `2c4487d7b` (`feat: 전역 클러스터 범위 선택기 통합`). 이 단위는
  조율 문서 커밋과 분리했다.
- 전역 셸의 `ClusterScopeProvider`가 목록 요청·URL `cluster`·30초 visible polling의 단일
  권위가 됐다. Home·Resources의 중복 selector와 목록 요청은 제거했으며 surface 이동은
  Cluster만 보존하고 `node`·`namespace`·`resource` 등 화면 로컬 query를 제거한다.
- 명시적 unknown·`cluster=`는 자동 fallback하지 않는다. 401은 auth gate로 승격하고, 403은
  검증된 목록 캐시를 제거하며, background offline은 마지막 검증 목록을 유지한다.
- BQ-017 착륙 전 provider·health 필드는 읽거나 추측하지 않고 일반 Server 아이콘만 쓴다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 103 files / 741 tests, design guard 311 files,
  shadcn 482 previews, Vite production build.
- `npm run visual-product` PASS: 35 scenarios, unexpected API/network/WebSocket 요청 0.

[2026-07-13 12:11 KST] [프론트] BQ-017 스키마 호환 완료 + `bfaf03901` —
`ClusterSummary.provider`와 `ClusterConnectionStatus.connection_stage`를 canonical enum의
optional 필드로 strictObject에 명시했다. unknown key 거부는 유지했다. targeted 17 tests 및
full `npm run check` PASS(103 files / 745 tests, design 311 files, shadcn 482 previews, build).

[2026-07-13 12:12 KST] [프론트-D/API] APIQ-019 in_progress — AI conversation 4함수의
strict envelope·open JsonMap·AbortSignal·possibly-sent POST 단일 호출 계약을 재claim했다.
코드 커밋과 exact `API 완성:` 앵커 전 제품 화면 소비는 0으로 유지한다.

## 2026-07-13 12:17 KST — [프론트-D/API] APIQ-019 완료 증거

- claim 조율 커밋 `151d1bc4d`와 코드 커밋 `84dc48a68`을 분리해 push했다.
- exact anchors: `listAiConversations`, `getAiConversation`, `createAiConversation`,
  `appendAiMessage` → `84dc48a68`; canonical ancestor exit 0.
- targeted 2 files / 20 tests PASS. `npm run check` PASS: 104 files / 750 tests,
  design guard 312 files, shadcn 482 previews, Vite production build.
- 화면·adapter 신규 소비는 이 API 단위에 포함하지 않았다.

## 2026-07-13 12:29 KST — [프론트-D] VP-007 ProviderIcon 완료 증거

- BQ-017 백엔드 코드 `db4798d4e`와 canonical merge `d507ca6d4`의 `origin/dev`
  ancestor exit 0 및 response 계약 실물을 확인했다.
- 코드 커밋 `b4d1af3cd`: optional wire provider를 canonical `unknown`으로 정규화하고 단일
  `ClusterProviderIcon`을 전역 selector에 연결했다. EKS/GKE/AKS만 검증된 브랜드 아이콘을,
  on-prem/kind/unknown은 일반 Kubernetes 계열 아이콘을 사용한다. provider 기반 화면 분기 0.
- full `npm run check` PASS: 105 files / 756 tests, design guard 314 files,
  shadcn 482 previews, Vite production build.
- `npm run visual-product` 1·2차는 200% text resize에서 icon 추가로 생긴 42px overflow를
  검출했다. connection label을 시각적으로 compact화하고 셸의 2행 전환점을 `lg`로 올린 뒤
  3차 35 scenarios PASS, unexpected API/network/WebSocket 요청 0.

[2026-07-13 12:30 KST] [프론트-D/API] APIQ-015 in_progress — provider-neutral Catalog의
`listCatalogItems`·`getCatalogItem` 계약을 claim했다. strict list/detail envelope와 open item
JsonMap, AbortSignal, ID 검증을 완료 앵커 전까지 제품 화면에서 소비하지 않는다.

## 2026-07-13 12:34 KST — [프론트-D/API] APIQ-015 완료 증거

- claim 조율 커밋 `e3ab2c458`와 코드 커밋 `1ad595b42`를 분리해 push했다.
- exact anchors: `listCatalogItems`, `getCatalogItem` → `1ad595b42`; canonical ancestor exit 0.
- 백엔드 strict response envelope와 open `JsonMap` item을 대조했다. 목록·상세 외피 drift 거부,
  item 확장 보존, AbortSignal, ID·URL, 404·malformed 계약 5 tests PASS.
- full `npm run check` PASS: 105 files / 757 tests, design guard 314 files,
  shadcn 482 previews, Vite production build.

## 2026-07-13 12:35 KST — [프론트] D 완료 증거

- VP-007 전역 Cluster selector `2c4487d7b`, BQ-017 strict schema 호환 `bfaf03901`,
  검증된 provider icon `b4d1af3cd`가 canonical branch에 착륙했다.
- APIQ-019 코드 `84dc48a68`의 4개 exact anchor와 APIQ-015 코드 `1ad595b42`의 2개
  exact anchor를 기록했다. `api-needs.md`는 0행·0함수, requested/in_progress/blocked 모두 0이다.
- 각 단위 full `npm run check`가 통과했고 마지막 결과는 105 files / 757 tests,
  design guard 314 files, shadcn 482 previews, production build PASS다.

## 2026-07-13 12:37 KST — [프론트] F 완료 증거

```text
명령: cd references/ui-layer-lab && npm run check
결과: PASS
- TypeScript / ESLint: PASS
- Vitest: 105 files, 757 tests PASS
- product design guard: 314 files PASS
- shadcn source audit: 482 previews PASS, upstream 21e4ceb
- Vite production build: PASS, 14,512 modules transformed

명령: cd references/ui-layer-lab && npm run visual-product
결과: PASS
- isolated product scenarios: 35/35 PASS
- light/dark, mobile, 320px reflow, 200% text, forced-colors, en/ko 포함
- exact scenario API requests, unexpected feature network/WebSocket: 0
```

## 2026-07-13 12:39 KST — [프론트] G 완료 증거

- production build: `cd references/ui-layer-lab && npm run build` PASS, 14,512 modules.
- 산출 경로: `references/ui-layer-lab/dist` — 26 MiB, assets 26 MiB, 2,675 files.
- 제품 entry: `ProductApp-Sd31eMe8.js` 279.00 kB / gzip 76.92 kB,
  `ProductApp-CRl--wg1.css` 78.67 kB / gzip 14.00 kB.
- `references/ui-layer-lab/Dockerfile`은 multi-stage build 후 unprivileged nginx:8080으로
  `dist/`를 서빙한다. `nginx.conf`는 `/api/`를 `api-gateway:8000`, `/api/live/`를
  `realtime-gateway:8000`으로 same-origin proxy하고 SPA fallback을 제공한다.
- 배포 실행은 하지 않았다. 기존 `scripts/aws-up.sh`의 console build context는 legacy
  `frontend/`이므로 FE-H에서는 `references/ui-layer-lab/Dockerfile`·context를 명시한 별도
  console image build가 필요하다. 사람 승인 없이 스크립트·클러스터를 수정하지 않는다.

## GO-REQUEST [FE-H]

- frontend branch / gate-build snapshot: `woonyong/ui-layer-lab` /
  `f50c2e8dbb160ac903acb986275ae6a64165ffcd`
- build command: `cd references/ui-layer-lab && npm ci && npm run check && npm run visual-product && npm run build`
- artifact: `references/ui-layer-lab/dist` (26 MiB, 2,675 files)
- image build 제안: `docker build --platform linux/amd64 -f references/ui-layer-lab/Dockerfile -t <immutable-console-image> references/ui-layer-lab`
- 배포 제안: image push 후 management namespace의 `deployment/console` image를 immutable tag로
  교체하고 rollout 완료·`/`·`/api/auth/session`·`/api/healthz`를 확인한다.
- rollback: 직전 immutable console image tag로 재설정하거나 Kubernetes rollout undo 후 같은
  세 endpoint와 인증 쿠키·WebSocket upgrade를 재확인한다.
- gate: `npm run check` PASS(105 files / 757 tests), `npm run visual-product` PASS(35/35,
  unexpected network/WebSocket 0), standalone production build PASS.
- 대기 조건: 백엔드 pipeline I는 `origin/dev`에서 아직 `pending`이다. FE-H 실행은 백엔드 I
  완료와 사람 GO가 모두 확인된 뒤에만 가능하다.
## 2026-07-13 11:22 KST — GO-REQUEST [H3]

- lane: `codex/f-auto-revert-pr`, HEAD `b8188ad38`; 최신 origin/dev
  `95a281e3b`로 18개 고유 commit을 충돌 없이 rebase, behind/ahead `0/18`.
- BQ-007: flag 기본 false의 rollout 실패 auto-revert, 권위 snapshot/원문 image patch,
  rebase fix `87eb0eb88`.
- BQ-009: `GitOpsAuthorityReadPort` 주입, patch 시점 workflow/diff/active binding/repository/
  provenance 교차 검증, exact-base 원문 scalar span patch. `oom_memory`, `image_rollback`,
  `image_tag_fix`, `replica_scale`, `probe_fix`(path/port/timeout), `selector_fix` 6종과
  exact inverse rollback. 권위 부재/불일치/미지원은 `rca.action_required` fail-closed.
- BQ-010: 실제 patch action을 선언 파라미터화하고 `gitops_recovery_review` 문서 action을
  분리·score 하향. 일반 action의 markdown fallback 제거.
- 실측: `uv run python scripts/verify-recovery-patches.py` 6/6 PASS, forward 후 inverse가
  원문 byte 복원. compileall PASS, manifest management 69/target 20.
- 전체 게이트: Ruff lint PASS, format 499 files, import-linter 2 kept/0 broken,
  pytest `1820 passed, 3 skipped`.
- 시험 merge: `git merge-tree --write-tree origin/dev b8188ad38` exit 0, tree
  `f16e81b5df4ccc303f96ab3e6344df5e132c129d`; 예상 충돌 0건.
- merge 명령: dev 통합 worktree에서 `git fetch origin dev` →
  `git merge --no-ff codex/f-auto-revert-pr` → `bash scripts/test.sh` → scorer/compileall/
  manifest 재실행 → merge commit push → `git merge-base --is-ancestor b8188ad38 origin/dev`.
- 범위: gateway 계약 변경 0건. [D-019] 예외인 contracts 신규 read port,
  dispatch-worker 최소 주입, recovery 경로와 기존 F lane의 gitops source/scm/auto-revert만 수정.
- 요청: 사람 GO [H3] 및 merge·push 실행 위임. origin 착륙 전 BQ-007/009/010은
  `done-pending-merge`이며 [D-019] DoD상 완료가 아니다.

## 2026-07-13 11:28 KST — [백엔드] provider 계약 구현·통합 대기

- lane: `codex/f-provider-connection-stage`, HEAD `305ed2b71`.
- TDD: RED `f3428cf90` → GREEN `c5447cafb`; providerID 3사·vendor label 보조,
  구체 등록값 우선, generic 등록 감지 후 `onprem` fallback, 연결 epoch별
  `token_issued/awaiting_install/agent_connected/snapshot_received/ready/expired/error`를 고정했다.
- 성능: 목록의 최신 inventory snapshot을 cluster별 N+1 대신 단일 window query로 조회한다.
- 실측 계약: `docs/api/11-clusters/01-list-clusters.bru`, `02-get-cluster.bru`,
  `03-connection-status.bru`가 provider/stage 허용값을 검산한다.
- 전체 게이트: Ruff lint/format PASS(492 files), import-linter 2 kept/0 broken,
  pytest `1746 passed, 3 skipped`; manifest management 68 / target 20.
- 대기 사유: 최신 lab `37d754cae`의 `clusterSummarySchema`와
  `clusterConnectionStatusSchema`가 `z.strictObject` 상태이며 provider/stage 키가 없다.
  Zod 실측에서 추가 키는 `unrecognized_keys`로 거부돼 backend 단독 착륙 시 기존 UI가
  `invalid-payload`가 된다. 프론트/API 소유자가 두 optional 필드를 허용하거나 양측을
  같은 통합점으로 착륙해야 한다.
- 처리: feature branch push 완료, backend 코드의 origin/dev merge·앵커·completed 표시는
  보류했다. gateway 계약 lock은 유지하고 해당 frontend 소유 파일은 수정하지 않았다.

## 2026-07-13 12:13 KST — [백엔드] H3 완결

- [백엔드] H3 완결 — patch 엔진 canonical 착륙 `6d68325bf1cc47f55810e5dc2189e51a6fe916c0`.
- 사람 위임 GO [H3], 승인 HEAD `33fd5f21c`의 `origin/dev` ancestor exit 0 및
  `git ls-remote` 원격/로컬 hash 일치를 확인했다.
- 전체 게이트: Ruff lint/format PASS(499 files), import-linter 2 kept/0 broken,
  pytest `1820 passed, 3 skipped`; recovery patch scorer 6/6, compileall PASS,
  manifest management 69 / target 20.
- progress 앵커와 프론트 인계(unsupported 3조건, action_type별 파라미터)를
  `docs/backend-f-progress.md`에 기록했다.

## 2026-07-13 12:13 KST — Codex 브랜치 전면 정리 삭제 전 복구 보험

- 기준 canonical: `origin/dev@d507ca6d47a0e953f6d1a0ad6931d576738c18cc`.
- 로컬 `codex/*` 7개, 원격 `codex/*` 140개를 전수 판정했다.
- 아래 hash·ancestor exit를 삭제 전에 영속화한다. exit 1인 Codex 작업 브랜치는 사람의
  1회성 과감 모드 위임에 따라 `-D`/원격 delete 대상이다.
- 사람 소유 가능성이 명시적인 4개 원격 ref는 삭제하지 않는다.

| ref | hash | origin/dev ancestor exit | 예정 |
|---|---|---:|---|
| `codex/cloudflare-token-normalization` | `83864abdf0b677660d35d78a1f05d930acb6854a` | 1 | local -D |
| `codex/f-argocd-observer` | `f5461aa8070a7ba9b088410d0ae5ebe89b8b4e86` | 1 | local -D |
| `codex/f-auto-revert-pr` | `8e28b471172dd9f288bcb8290dd799c7e8309dce` | 1 | local -D |
| `codex/f-provider-connection-stage` | `10e85d9925bd0818ef14ec696d4feabb6f517fe2` | 0 | local -d |
| `codex/platform-foundation` | `63618a4fb81c4acda22ec125fa7934d9ef9d0204` | 1 | local -D |
| `codex/rca-log-evidence-scope-20260710` | `a5ac062fb53752ec64a7ac37e38611ed0f3454d5` | 1 | local -D |
| `codex/runtime-hardening-20260710` | `ae3ee71a229af78f804f88e16ecdc466443bf5f9` | 1 | local -D |
| `origin/codex/chanbin-dev-infra-base` | `f1f4e15a8e22cd48987231f224c67cd5c3a1d6ed` | 1 | 보존(사람 소유 가능) |
| `origin/codex/data-dashboard-variants` | `d21874c42418769c7d7bd05b83ebd235723633fd` | 1 | remote --delete |
| `origin/codex/f-argocd-observer` | `f5461aa8070a7ba9b088410d0ae5ebe89b8b4e86` | 1 | remote --delete |
| `origin/codex/f-auto-revert-pr` | `e6d4df1dc74162925e23048abb00d9a87738a1c6` | 1 | remote --delete |
| `origin/codex/f-provider-connection-stage` | `305ed2b71818aede709af4b474b11e361e01a829` | 1 | remote --delete |
| `origin/codex/frontt` | `6e5b9d42a303b784ce5f58dd358ae38f0cef4c8d` | 1 | 보존(사람 소유 가능) |
| `origin/codex/gitops-cache-db-crd` | `6912e35d0657815a9934f2769f2474e7f93fd2ea` | 1 | remote --delete |
| `origin/codex/headlamptest` | `11d7c879e039243321ce146d7f2124e71f826ae8` | 1 | 보존(사람 소유 가능) |
| `origin/codex/platform-foundation` | `63618a4fb81c4acda22ec125fa7934d9ef9d0204` | 1 | remote --delete |
| `origin/codex/rca-log-evidence-scope-20260710` | `a5ac062fb53752ec64a7ac37e38611ed0f3454d5` | 1 | remote --delete |
| `origin/codex/release-flow-frontend-safe-pr-144` | `ccb27df95ba8d586d01d5b676964b606c57be3e4` | 1 | remote --delete |
| `origin/codex/release-flow-prod-abort-criteria-52` | `3f1b0e67b0567f240d095f9b0e65076ba71afaf4` | 1 | remote --delete |
| `origin/codex/release-flow-prod-action-disabled-hints-83` | `a86e3e9a1977ce63c4ae15c25b2cf4312c8cddff` | 1 | remote --delete |
| `origin/codex/release-flow-prod-action-reason-presets-81` | `0c259d0398f11cd3b03f500d25611bdca80bb758` | 1 | remote --delete |
| `origin/codex/release-flow-prod-active-freeze-filter-103` | `4b6ab7bfffe42acd2d4d67c12e23a9dcd519d1b0` | 1 | remote --delete |
| `origin/codex/release-flow-prod-active-run-filter-74` | `5628961ef03471d16935c2ffb6c3705069e2d39e` | 1 | remote --delete |
| `origin/codex/release-flow-prod-advance-verification-gate-58` | `64a6da31dc01051b819bed6440f2831f74607e62` | 1 | remote --delete |
| `origin/codex/release-flow-prod-alert-coverage-30` | `a9a11f75d311873e3f38c5ba05e5525394913e1c` | 1 | remote --delete |
| `origin/codex/release-flow-prod-alert-ops-13` | `c4e9b46cfd917066da8880b107e9ab9165e19609` | 1 | remote --delete |
| `origin/codex/release-flow-prod-alert-recency-33` | `29c9e01d71e123c8b5b4022830ff6c9b54216364` | 1 | remote --delete |
| `origin/codex/release-flow-prod-alert-smoke-45` | `e2a1c831e16b0f1b6ffd82023fc6df8fcb570ca6` | 1 | remote --delete |
| `origin/codex/release-flow-prod-alert-validation-31` | `13c1d36885cefe3f8de633850097bc5d755b5cd3` | 1 | remote --delete |
| `origin/codex/release-flow-prod-alerts-08` | `825d5530cc7d04b086b6c8643084d098af0dc366` | 1 | remote --delete |
| `origin/codex/release-flow-prod-app-context-15` | `7a440941a3701fa89319bcfb27c859c0b5d661f6` | 1 | remote --delete |
| `origin/codex/release-flow-prod-approval-card-16` | `bcf3c01e6b0f6f4f1164a71256a6bb2343d490f7` | 1 | remote --delete |
| `origin/codex/release-flow-prod-approval-evidence-40` | `98f894a86ab59840a89e124f14cbb76c28b4d020` | 1 | remote --delete |
| `origin/codex/release-flow-prod-approval-recency-43` | `9c403c2eb432252026c0f4a3efb8234c354afbbf` | 1 | remote --delete |
| `origin/codex/release-flow-prod-attention-alert-26` | `a45ee7aa9b35e4dd1c28f18e91a74c4e516a5526` | 1 | remote --delete |
| `origin/codex/release-flow-prod-attention-reasons-21` | `b37da7a4b22987558c3ebe364f6ea1c64ec04e28` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-09` | `f73ba420c4f18978899b7f8e9ffcc389c72623ed` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-copy-91` | `f109fb2f48ff4a2ecccdbe7715bdee6783bf55bd` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-event-filter-25` | `97b61e547437f193ebd0691204c96ec07e1faf69` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-export-ui-14` | `f71bbac7eb82a50327b71c3c81e94062c5b27d07` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-operator-filters-69` | `5866baaf56e6901ac1b14653b4ee6ba86ed56719` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-prefix-filter-67` | `838707682ac9c6186756ede7e71e70ce4825ca24` | 1 | remote --delete |
| `origin/codex/release-flow-prod-audit-row-meta-68` | `09ce0d4434c21923766c6f8afac23765881161b5` | 1 | remote --delete |
| `origin/codex/release-flow-prod-change-freeze-smoke-108` | `8f5c2e115deb639e2a3f64890da816407ec6ed7f` | 1 | remote --delete |
| `origin/codex/release-flow-prod-change-ticket-gate-38` | `a351a48a7f9c269b31d01103eeab19bd2d04f28a` | 1 | remote --delete |
| `origin/codex/release-flow-prod-destructive-action-confirm-84` | `951912a36a9931e484dbcea01278402978f84fa9` | 1 | remote --delete |
| `origin/codex/release-flow-prod-diagnostics-gate-34` | `b2e89cd96bc567b79e16d5e8158d51496030a461` | 1 | remote --delete |
| `origin/codex/release-flow-prod-diagnostics-override-35` | `4233e52ad600f2995033fbf0e9808503b97bc904` | 1 | remote --delete |
| `origin/codex/release-flow-prod-freeze-handoff-101` | `47011d34dd2a69aa3b9d0d753f201f068af53e18` | 1 | remote --delete |
| `origin/codex/release-flow-prod-freeze-run-filter-102` | `26e67cb2ad614a40dd140a6146ce19facf0126b5` | 1 | remote --delete |
| `origin/codex/release-flow-prod-freeze-window-100` | `f26f5ae5e0fc1be3b196272a16997eafcb30aa94` | 1 | remote --delete |
| `origin/codex/release-flow-prod-gate-inputs-12` | `93d988473a2c3ddc85fcd9a9f259660a14ee41e1` | 1 | remote --delete |
| `origin/codex/release-flow-prod-guard-snapshot-36` | `34aa5c2d112080d6136a7e973fe5d781a425b567` | 1 | remote --delete |
| `origin/codex/release-flow-prod-handoff-28` | `c16365765418fe7a155f7cecd4adbd4a597b77ce` | 1 | remote --delete |
| `origin/codex/release-flow-prod-handoff-abort-criteria-53` | `9dd0129cebdc6ef1a54ccce7b7c717d031967210` | 1 | remote --delete |
| `origin/codex/release-flow-prod-handoff-copy-80` | `20ab2dfd6621e4c61443190746575fc9bea36e21` | 1 | remote --delete |
| `origin/codex/release-flow-prod-handoff-verification-51` | `36134309d586b4240c1da8a5611df43462cb93da` | 1 | remote --delete |
| `origin/codex/release-flow-prod-hardening-04` | `2abb1436df06247e8e8e415bdaa7bc7d51bf1e1d` | 1 | remote --delete |
| `origin/codex/release-flow-prod-impact-summary-48` | `080fa305c25b723cf89ed020a3a9eed7c461b4a3` | 1 | remote --delete |
| `origin/codex/release-flow-prod-live-action-confirm-85` | `d75f2e893beeb08a86836f6c67c20126c81e9ad2` | 1 | remote --delete |
| `origin/codex/release-flow-prod-live-alert-gate-29` | `290a129173b96562d95d530e930b021d923d7172` | 1 | remote --delete |
| `origin/codex/release-flow-prod-live-preflight-smoke-41` | `93788e918a7e5933fc5a32c66bda9a8bf9e06f4a` | 1 | remote --delete |
| `origin/codex/release-flow-prod-live-start-confirm-87` | `1494d13c19ff5fa6b8dcd05b5b1bf5ddd1e928e8` | 1 | remote --delete |
| `origin/codex/release-flow-prod-notify-audit-meta-66` | `55b6c970a1f8d411ec8aa00ec362387f137ee6ea` | 1 | remote --delete |
| `origin/codex/release-flow-prod-notify-cooldown-63` | `a34b21ba8f1217db17eb593e3b3205ae02b9710b` | 1 | remote --delete |
| `origin/codex/release-flow-prod-notify-cooldown-handoff-65` | `bb9ac32f109a44802a310c21962e24c9c57f5ca5` | 1 | remote --delete |
| `origin/codex/release-flow-prod-operator-controls-19` | `f934a682294e3243724209491f32bf28bd5a4985` | 1 | remote --delete |
| `origin/codex/release-flow-prod-ops-observability-06` | `d89dcad5a4be6bc043742613439747d8f413655f` | 1 | remote --delete |
| `origin/codex/release-flow-prod-ops-rehearsal-27` | `4d1041ba22679905901038795029ba027d5e19c8` | 1 | remote --delete |
| `origin/codex/release-flow-prod-ops-smoke-05` | `3f07f71cb620952d00c36a48bb1f031eab950e61` | 1 | remote --delete |
| `origin/codex/release-flow-prod-owner-gate-46` | `f0745371373088e03871aba5e02ea324a2bb5cc6` | 1 | remote --delete |
| `origin/codex/release-flow-prod-paused-run-summary-76` | `04833adc9a9071ae4dfe470e753eaad4bf47bb0a` | 1 | remote --delete |
| `origin/codex/release-flow-prod-permission-gates-42` | `b3da258a293d1b681886350b6c711b0920944129` | 1 | remote --delete |
| `origin/codex/release-flow-prod-policy-override-filter-104` | `b1307a501894ca8d9f50bc0d70db3c08b0e82545` | 1 | remote --delete |
| `origin/codex/release-flow-prod-policy-override-handoff-105` | `c57a1535dc2ac2cefea36c1b3f0ae83eb39d934b` | 1 | remote --delete |
| `origin/codex/release-flow-prod-policy-override-smoke-107` | `d985199fe776f8d8e094167aeb8aab435fd23f7f` | 1 | remote --delete |
| `origin/codex/release-flow-prod-policy-override-source-106` | `30fae23144149d7f51955c452cb3058eefab575c` | 1 | remote --delete |
| `origin/codex/release-flow-prod-preview-action-hints-88` | `68902e9b5975ab743507f16e2b1cf5d7d65ea8f7` | 1 | remote --delete |
| `origin/codex/release-flow-prod-preview-copy-90` | `656721285b455f5888d5936e608b31168a505cb8` | 1 | remote --delete |
| `origin/codex/release-flow-prod-production-preflight-109` | `200ba74ff022d27b6cf66e0bfd6c1cfba37d245c` | 1 | remote --delete |
| `origin/codex/release-flow-prod-production-preflight-scope-110` | `62b4968c31fe5246a6440bade921829f950a75f0` | 1 | remote --delete |
| `origin/codex/release-flow-prod-readiness-11` | `043b7171f8ebfa4d54524bc911a8be3ac62d5d62` | 1 | remote --delete |
| `origin/codex/release-flow-prod-readiness-actions-47` | `55257537a7cdf0866feccd218b9f49b985f6eaba` | 1 | remote --delete |
| `origin/codex/release-flow-prod-readiness-copy-89` | `1adf34eaffe1906530b68e71a40bcd614291b521` | 1 | remote --delete |
| `origin/codex/release-flow-prod-readiness-lock-18` | `4ed43c8083464cc8058ef1f0a136770f68110554` | 1 | remote --delete |
| `origin/codex/release-flow-prod-readiness-snapshot-49` | `47fcb520414fa5e85753feaa0c79b31b9d60d426` | 1 | remote --delete |
| `origin/codex/release-flow-prod-recent-run-shortcuts-78` | `699ef1dbc310a091c62e662d06f46945040c419b` | 1 | remote --delete |
| `origin/codex/release-flow-prod-redaction-10` | `9847f73c3a394d38e13d4bab01fe1b38cb3400ca` | 1 | remote --delete |
| `origin/codex/release-flow-prod-release-window-39` | `c85e82f74906c283b4057cf6ef2f5ca5ce615d5d` | 1 | remote --delete |
| `origin/codex/release-flow-prod-retry-07` | `02e512621ecdf9c2e32f91807e674a07fbbbbe03` | 1 | remote --delete |
| `origin/codex/release-flow-prod-rollback-handoff-reason-82` | `bf37e5229c1de881d3091b9905acb39d8517b027` | 1 | remote --delete |
| `origin/codex/release-flow-prod-rollback-override-37` | `5be7fd2c939ee67c5e8c4938665c991490cb66d4` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-deeplink-79` | `e943e075017c1f5bffedf777c79619b95ac285d4` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-filters-23` | `d3553bf8b388bcaa3659dca90488a99f58ae162b` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-health-smoke-71` | `9643ecd22e398f34b9278a9e60930743a8f7403d` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-history-20` | `210ff85d898621b1c8096d43064ffed423bdfde4` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-lock-17` | `4da3b8e8931af9aabe56b583ea5ae80657e4e421` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-92` | `ee1cca7110604f41f7878445e56bab68dea9ab52` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-api-93` | `00cfa083a248e75bee936401d38c01804ae24e29` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-approvals-99` | `229ea664f567436a98b84f0d26b2a88dd3b736f7` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-audit-summary-98` | `702e515f5bd000e4de6c5f5a6d4c3b3ff06bdf9f` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-checks-95` | `07ab0b497678233340a95ace33013dbe375df842` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-context-97` | `44f79583e890131ecfda63be198470eeec933611` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-evidence-96` | `26c41d9aa1b048fcd8f31dcae59a4334314c1fd6` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-report-export-94` | `1ba9f47ac5cd872dadb279d6183c1d82e50d1772` | 1 | remote --delete |
| `origin/codex/release-flow-prod-run-scoped-audit-24` | `9661ccd6d0aff79e6a532a6e3f5a4f59075d9167` | 1 | remote --delete |
| `origin/codex/release-flow-prod-runbook-gate-44` | `128f156b055bb2b139f6e5b13ee27aeaee110d38` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-annotations-118` | `500091122d6ba8c5fa428a6b96424c6294b37d48` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-ci-bundle-119` | `39fc6e8c49a05b2ba10ed3b75352dbef47bb3536` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-gh-summary-114` | `c2f3e0747ee73267b95e05323f5123b7969f2310` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-github-output-117` | `594532d192a2d4546abc1b46ad7659d8724363c2` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-junit-artifact-112` | `37d2c6b08cadcdadb4a1823590d1d34e109d374a` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-markdown-artifact-113` | `cf7d1453ecbf1129101215db0f917077acbbe788` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-redaction-116` | `fb2ee8eff09b3e4c7c1445ab82fe13d0bd352be8` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-report-artifact-111` | `a777e032bfb8771d271f891d019ff441dc38b853` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-safe-retry-115` | `110bc0cc21dc0c178d6e17cce91bbdc1c8f11759` | 1 | remote --delete |
| `origin/codex/release-flow-prod-smoke-workflow-120` | `1dc83dacc532aa31fd1c54a626c04dc2f7b4115b` | 1 | remote --delete |
| `origin/codex/release-flow-prod-stale-run-22` | `437f633f1b79652044236c3d20e674fc5a93723d` | 1 | remote --delete |
| `origin/codex/release-flow-prod-status-summary-shortcuts-75` | `ec63f2f5f1041afe811c5c6173144f36c29d2464` | 1 | remote --delete |
| `origin/codex/release-flow-prod-summary-filter-shortcuts-73` | `728ad1dfff0a2c4248f059a786b50af9326dc514` | 1 | remote --delete |
| `origin/codex/release-flow-prod-terminal-run-summary-77` | `f44bdad543fa839ee4c5dfc6d458503fbf625f50` | 1 | remote --delete |
| `origin/codex/release-flow-prod-unhealthy-run-filter-72` | `e91c53552f3fbcb3fb9845741d7d4fbd027c43bc` | 1 | remote --delete |
| `origin/codex/release-flow-prod-validated-alert-gate-32` | `05778dba0e18216c8c0659672f1b28cabdd78206` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-alert-56` | `bd7f1b64f6cf26ff1384cd858de69b47860af5d3` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-filter-60` | `971b71592bc0177b129bd766a3334fdd600a4e59` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-gate-50` | `da3317366366395aa2a4a5fd2308bbfde29af7b6` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-jobs-54` | `684410e49b6780d103fd3160c5bf696d6b812493` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-pending-timeout-61` | `d5a7bd8aa1472ec520003175b8313efed9be7716` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-result-55` | `c22178c800cffd77a040d7b62626840df125b3ac` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-result-ui-57` | `edc53c8f5deb10a28dda5569e83d73a25de0f9b3` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-summary-59` | `a25ed23a3b2aff30ac1b664b64c1902385435b50` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-timeout-alert-62` | `346ce6a9a54cacc38ed83f2b28e0c8659ece2358` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-timeout-smoke-70` | `587ac3b4cd7e19594ecd44791479b2fda0332663` | 1 | remote --delete |
| `origin/codex/release-flow-prod-verification-timeout-status-64` | `486aac2ad51215e25455cdf10d8a8994eb83fada` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-alert-preflight-126` | `755a822f5346eba4002e8e71ebfaf3f154910c7f` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-artifact-retention-124` | `5937f34633646b4f8ca78f42316142a93ded5324` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-concurrency-123` | `db80ad04932df6820dfb838033896af4e1813ee7` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-environment-gate-122` | `0b4de28d54721f44e272b5b22a1c65de80ddcfe0` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-expanded-outputs-128` | `e34636e1309d68ef4d6f7e6a61893bdb73b84776` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-identity-129` | `8def85608e7b1ebf14d3032d4117727948f29279` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-input-validation-125` | `3ed05004b0e1141722c42d5ed25b0722171d06d1` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-live-preflight-127` | `a06c8c12fad25e03610f9efd73806ce087e8fa1e` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-request-timeout-130` | `0398e5153a418d7aca8b847c760b77aae3a5fa20` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-retry-policy-131` | `41e63b87c65a03720d586ebaf9daf0e55caeb64f` | 1 | remote --delete |
| `origin/codex/release-flow-smoke-reusable-workflow-121` | `8019b27f56add3ab64af46b1399c9d06bb195a35` | 1 | remote --delete |
| `origin/codex/ui-layer-lab-references` | `d18e136937525b13e21a56c7e6814f9c7e67e6d0` | 1 | 보존(사람 소유 가능) |
| `origin/codex/yaml-editor` | `79914c1e91e42f193c007c1652ec2f0c44d3061c` | 1 | remote --delete |

## 2026-07-13 12:15 KST — [백엔드] provider 계약 착륙·잠금 해제

- 프론트 호환 조건: `origin/woonyong/ui-layer-lab@bfaf03901`에서 provider와
  connection_stage optional 스키마 수용을 기록했고 ancestor exit 0을 확인했다.
- 선행 H3: `origin/dev@6d68325bf1cc47f55810e5dc2189e51a6fe916c0` 착륙을 확인했다.
- 코드 `db4798d4e4973ec3d384d71eca08aba6d4e9f6b7`, feature HEAD `10e85d992`,
  canonical merge `d507ca6d47a0e953f6d1a0ad6931d576738c18cc`.
- 재배치 후 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1831 passed, 3 skipped`; manifest management 69, target 20.
- `db4798d4e`와 `10e85d992`의 `origin/dev` ancestor exit 0을 확인했다.
  기존 응답은 additive-only로 보존했고 gateway 계약 lock을 해제한다.
- 일시 저장한 Argo observer lane `codex/f-argocd-observer@f5461aa80`은 최신
  canonical로 재배치한 뒤 전체 게이트를 다시 증명한다.

## 2026-07-13 12:17 KST — Codex 브랜치 전면 정리 완결

- 삭제 전 위 복구 보험 표가 `origin/dev`에 착륙한 뒤 실행했다.
- 로컬: `codex/*` 7개 삭제(ancestor 0인 provider lane은 stale upstream 해제 후 정상
  `-d`, 나머지 6개는 승인된 `-D`), 잔존 0개.
- 원격: 자동 작업 `codex/*` 136개를 `git push origin --delete`로 삭제했다.
  Codex 관련 worktree 5개를 clean 확인 후 정상 remove했고 `git worktree prune`을 완료했다.
- 사람 소유 가능성이 있어 보존한 원격 ref:
  - `codex/chanbin-dev-infra-base@f1f4e15a8e22cd48987231f224c67cd5c3a1d6ed`
  - `codex/frontt@6e5b9d42a303b784ce5f58dd358ae38f0cef4c8d`
  - `codex/headlamptest@11d7c879e039243321ce146d7f2124e71f826ae8`
  - `codex/ui-layer-lab-references@d18e136937525b13e21a56c7e6814f9c7e67e6d0`
- 보존한 로컬 비-Codex branch: `dev`, `main`, `demo/v1`,
  `woonyong/ui-layer-lab`, `woonyong-kr/frontend`, `feat/jcbbbbbb/api-gateway`,
  `feat/jeonwoohyun-hydromel/command-worker`,
  `feat/jeonwoohyun-hydromel/gitops-sync-worker`,
  `feat/minmings111/node-collector`, `feat/minmings111/target-cluster-agent`,
  `feat/ummfieg/audit-timeline-service`, `feat/ummfieg/dashboard-projection-service`,
  `feat/ummfieg/rca-worker`.
- BQ-014는 삭제 전 hash `f5461aa8070a7ba9b088410d0ae5ebe89b8b4e86`을 복구점으로
  남기고 `requested`로 되돌렸다. H3 merge `6d68325bf`와 승인 HEAD `33fd5f21c`는
  계속 `origin/dev` ancestor exit 0이다.

## 2026-07-13 12:19 KST — Codex 브랜치 정리 델타 복구 보험

- 첫 회수 직후 별도 세션이 진행 중 작업 단위를 마치며 로컬
  `codex/f-argocd-observer`를 다시 생성한 것을 최종 검증에서 감지했다.
- 새 HEAD `8127cc973bdf759cfb373c3b50feb3fbfe14656f`, `origin/dev` ancestor exit 1,
  worktree clean. 앞선 복구점 `f5461aa80`을 포함하는 후속 3커밋 작업 단위다.
- 사람의 전면 정리 위임에 따라 이 hash를 최종 복구 보험으로 영속화한 뒤 로컬 `-D`와
  clean worktree remove를 재수행한다. 원격 ref가 생기면 같은 hash를 확인한 뒤 delete한다.

## 2026-07-13 12:19 KST — [백엔드] Argo observer lane 복구·재개

- 최신 사용자 지시가 BQ-014 병행 착수와 BQ-017 선착륙 후 재개를 명시하므로,
  전면 브랜치 정리에서 보존한 `8127cc973bdf759cfb373c3b50feb3fbfe14656f`을 복구점으로
  `codex/f-argocd-observer` worktree를 다시 만들었다.
- 복구점의 3개 커밋은 Application/Rollout 읽기, 읽기 전용 RBAC, 사후 검증 상태 연계만
  포함한다. gateway 계약·Argo 쓰기 경로는 변경하지 않는다.
- 조율 상태를 in_progress로 되돌리고 최신 canonical 위에서 전체 게이트와 manifest를
  다시 증명한다. 앵커는 감독 검증·GO 전에는 기록하지 않는다.

## 2026-07-13 12:27 KST — GO-REQUEST [Argo observer]

- lane `codex/f-argocd-observer`, HEAD
  `eb435b4bd2143c6814e4ede744c2371648f73a94`; `origin/dev@d8b28f76f` 대비
  behind/ahead `0/6`, 시험 merge exit 0, tree `c210a9ab78257e8522a66d80ff64235f17e7ff63`.
- Application repo/revision/path·sync/health와 Rollout `stableRS`를 Kubernetes GET으로만
  읽는다. manifest RBAC도 `applications/rollouts`의 `get/list`만 허용하며 쓰기 호출은 0건이다.
- 독립 리뷰에서 발견한 Application 관측 fail-open, 진행 중 operation ready 판정,
  credential 포함 repository URL 노출을 RED `8afd9ab99` → GREEN `5881bdad8`로 막았다.
  Application unavailable은 종합 `failed`, Rollout CRD unavailable은 선택 상태로 구분한다.
- 관련 회귀 `13 passed`, 전체 게이트 Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1838 passed, 3 skipped`; manifest management 69, target 20.
- 전체 pytest에서 기존 SQLite finalizer의 thread-affinity warning 2건이 노출됐으나 실패는
  0건이며 이번 observer 변경 경로의 동작·게이트 결과에는 영향이 없다.
- gateway 계약, `src/domains/rca/**`, `src/services/ai/**`,
  `src/packages/runtime/worker.py` 변경은 0건이다. 원격 feature branch에 push했으며
  canonical merge·앵커는 사람 GO를 대기한다.

## 2026-07-13 12:29 KST — [백엔드] release flow 분해 사전 조사

- Argo observer 착륙 GO 대기 중 가용한 읽기 전용 작업으로 5,297줄 router의 내부 경계를
  policy/readiness/verification/report/_support로 분류했다. 코드·claim 변경은 없다.
- 허용 의존 방향과 이동 대상, blocker 순서·guard snapshot·verification ID·monkeypatch
  호환 위험을 `docs/release-flow-implementation.md`에 기록했다.
- 신규 microservice나 route 변경은 제안하지 않았고, 실제 분해는 별도 착수·RED/green
  검증 전에는 진행하지 않는다.

## 2026-07-13 13:08 KST — BQ-014 완료 증거

- lane `codex/f-argocd-observer`, rebase HEAD
  `16c58de5634b2ee49a93c884e73bebb2348b04f3`, canonical merge
  `0b4298c4e2dbc57815a4c484ac7efa3491ed01db`.
- commits: `d2c09e512` RED → `08c8cb1cb` GREEN → `449ab2baa` 계약 문서 →
  `98caa28fb` fail-closed RED → `281b0858b` 보안·완료 경계 GREEN → `16c58de56` 문서.
- stat: 14 files, 587 insertions, 10 deletions. 삭제 감사 0건이며 gateway 계약,
  `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py` 변경 0건.
- gate: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1838 passed, 3 skipped`; manifest management 69, target 20. lane과 merge 결과에서
  각각 동일하게 재검증했다.
- 4조건: 전체 그린; merge-tree exit 0/tree `3530cbbd8a484fd2f00ebcad562ccc83b3dd7e8b`;
  삭제 0건; no-ff merge·push 후 feature와 merge commit의 `origin/dev` ancestor exit 0.
- 실물 `docs/auto/night-directives.md`의 최신 번호는 D-021이고 D-024 본문은 아직 없지만,
  활성 목표에 제공된 D-024 상시 착륙 승인·4조건 전체를 적용했다. 배포 실행은 하지 않았다.

## 2026-07-13 13:10 KST — [프론트] dev→lab 동기화 증거

- 동기화 전 `origin/dev...woonyong/ui-layer-lab` divergence는 dev-only 36 / lab-only 16으로
  30커밋 임계값을 초과했다. merge base는 `a65c66c7102fb453e583ed4ec44f1950a9df9ba2`다.
- `git merge-tree --write-tree HEAD origin/dev`의 유일한 충돌은 append-only
  `docs/auto/night-log.md`였다. 양쪽 기록을 모두 보존했고 제품/계약 파일 충돌은 0건이다.
- 삭제 감사: staged merge delta에서 `frontend/**` 삭제 0건, `src/**` 삭제 0건.
  backend `src/**`는 `origin/dev` 내용을 그대로 흡수했으며 프론트 세션의 수동 수정은 0건이다.
- `cd references/ui-layer-lab && npm run check` PASS: TypeScript·ESLint, Vitest 105 files /
  757 tests, design guard 314 files, shadcn 482 previews, Vite production build 14,512 modules.
- 현재 canonical `origin/dev`에는 `[D-024]` 제목 본문이 없음을 확인했다. 본 작업은 사용자가
  제공한 `[D-024]` 4조건(전체 게이트·정책 충돌만 해소·삭제 감사·push/ancestor 증명)을
  직접 정본으로 적용했다.

## 2026-07-13 13:20 KST — [프론트] P1 Opsia 표시 계약 완료

- RED `bdc4721a6`: 브라우저 제목·셸·인증 헤더·영문/한글 로그인·시각 게이트의 기대값을
  `Opsia`로 먼저 고정했다. 런타임이 여전히 `KubeHeal`을 반환해 대상 테스트 7파일이
  실패하고 1파일만 통과하는 RED를 확인했다(11 failed / 38 passed).
- GREEN `4ac637323`: `product.name` 카탈로그 키를 en/ko에 추가하고, 셸과 인증 헤더가
  카탈로그를 소비하도록 연결했다. 문서 title과 로그인 문자열도 `Opsia`로 변경했다.
  대상 회귀는 8 files / 49 tests PASS다.
- 식별자 보존: 대문자 `KubeHeal`은 vendor/dist/output 제외 0건이다. 저장 키
  `kubeheal-theme`, `kubeheal.locale`과 이벤트 `kubeheal:product-shortcut`은 변경하지 않았다.
- 전체 게이트: `npm run check` PASS — TypeScript·ESLint, Vitest 105 files / 757 tests,
  design guard 314 files, shadcn 482 previews, Vite production build 14,512 modules.
- 시각 게이트: `npm run visual-product` PASS — 인증·Home·Resources·셸·상태 화면의
  light/dark, 320px reflow, 200% text resize, forced-colors, en/ko를 포함한 34 scenarios.

## 2026-07-13 13:22 KST — [프론트] P2 VP-002 진입조건 검증·API claim

- `git merge-base --is-ancestor 66cbe8dec7cb478f5b0774bb5e7bbaab5f616894 origin/dev`
  결과 exit 0. `git cat-file -e origin/dev:docs/backend-f-progress.md` 결과 exit 0.
- canonical 실물은 `AUDIT_TIMELINE_PATH = "/audit/timeline"`,
  `AuditTimelineResponse{items,limit,has_more,next_cursor}`이며 route는 필수
  `correlation_id`, 선택 `cursor`, `limit` 1~200을 받는다.
- VP-002를 `직결`로 전환하고 `APIQ-030 getAuditTimeline`을 단독 claim했다.
  workspace/cluster 접근 제어와 시간순 keyset 정렬은 서버 권위이며 프론트 재필터·재정렬은 금지한다.

## 2026-07-13 13:29 KST — [프론트] APIQ-030 완료 증거

- RED `6700875a6` → GREEN `9841a5d95`; 두 hash 모두
  `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- targeted Vitest 1 file / 11 tests PASS. `npm run check` PASS — TypeScript·ESLint,
  Vitest 106 files / 768 tests, design guard 317 files, shadcn 482 previews,
  Vite production build 14,512 modules.
- `API 완성: getAuditTimeline (9841a5d95)`를 기록하고 APIQ-030 행을 제거했다.
  다음 단계는 이 앵커를 소비하는 VP-002 Issues 상세의 독립 감사 섹션이다.

## 2026-07-13 14:02 KST — [프론트] BQ-017 스키마 호환 완료 + bfaf03901

- `ClusterSummary.provider`는 `eks|gke|aks|onprem|kind|unknown`,
  `ClusterConnectionStatus.connection_stage`는
  `token_issued|awaiting_install|agent_connected|snapshot_received|ready|expired|error`를
  각각 optional로 명시한다. 두 외피의 `strictObject`는 유지한다.
- `bfaf03901`은 현재 HEAD와 `origin/woonyong/ui-layer-lab`의 ancestor(exit 0)다.
  targeted `clusters.test.ts` + `cluster-connection.test.ts`는 2 files / 17 tests PASS다.

## 2026-07-13 14:03 KST — [프론트] VP-002 감사 타임라인 화면 완료 증거

- RED `003a9563a` → API 재앵커 `4c2598c4a` → UI GREEN `fdc921c3d` →
  책임 분리 `9bedcdfa5`. 서버 순서 보존, opaque cursor 누적, scope 전환 취소와
  기존 페이지 보존형 실패 상태를 화면·adapter 계약으로 고정했다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 108 files / 773 tests,
  design guard 326 files, shadcn 482 previews, production build 14,529 modules.
- `npm run visual-product` PASS: 35 isolated scenarios, exact scenario API requests,
  unexpected feature network / WebSocket 0건. 증거:
  `references/ui-layer-lab/output/playwright/product-issues-authenticated-detail-desktop-light.png`.
- VP-002 완료 후 파이프라인 E는 VP-003이 남아 `in_progress`를 유지한다.

## 2026-07-13 14:08 KST — [프론트] E BLOCKED: VP-003 인과 식별자·분류 계약 결손

- canonical `origin/dev`의 `AuditTimelineItem`과 serializer는
  `subject/source/created_at/causation_id/payload_summary`만 반환한다.
  `EventEnvelope.causation_id`는 직접 부모의 `event_id`인데 현재 항목의 `event_id`가 응답에
  없어 parent-child 결합이 불가능하다. DB에 실재하는 ID를 배열 index·시각·subject 합성값으로
  추측하지 않는다.
- `docs/backend-f-workqueue.md`는 BQ-004 인계물로 subject 분류 목록을 명시하지만,
  canonical progress와 API 응답에는 그 목록이나 `journey_stage`가 없다. prefix 기반 고정 매핑도
  계약 없는 추측이므로 만들지 않는다.
- `UI-056 TimelineSwimlane`은 `reference-contract-map.md`의 inventory 선언뿐이며 실제 재사용
  컴포넌트는 없다. 따라서 VP-002 시간순 목록을 중복 포장하거나 가짜 인과선을 그리지 않았다.
- 재개 조건: 백엔드가 `AuditTimelineItem.event_id`를 required non-empty stable ID로 additive
  제공하고, subject→journey stage의 canonical 분류 계약(unknown 처리 포함)과 완료 앵커를
  `origin/dev`에 착륙한다. 그 뒤 strict Zod RED→GREEN, 인과 트리/시간순 강등/키보드 목록
  테스트 순서로 재개한다.

## 2026-07-13 14:12 KST — [프론트] P4 진입조건 검증·API claim

- `git merge-base --is-ancestor 81969f23e46cb40743af08ffbc1affe556bd5c5e origin/dev`
  결과 exit 0. `origin/dev`의 `src/domains/rca_changes/router.py`,
  `docs/api/05-rca-dashboard/15-recent-changes.bru` 실물 확인도 exit 0이다.
- canonical 계약은 `GET /api/rca/incidents/{incident_id}/recent-changes?limit=`와
  `RecentChangeListResponse{incident_id,items,limit}`다. item은 event ID·시각·workload identity·
  image before/after·허용된 PR URL·commit·repository·workflow run을 제공한다.
- `origin/dev...HEAD`의 dev-only는 12로 30커밋 선흡수 임계값 미만이다. VP-004를 직결로
  전환하고 `APIQ-031 getIncidentRecentChanges`를 단독 claim했다.

## 2026-07-13 14:20 KST — [프론트] P4 APIQ-031 완료 + 4f602cc86

- RED `c6bd3babe` → GREEN `4f602cc86660a7f8a12583cffc44a53e220d9dbf`.
  GREEN은 API 구현과 contract test를 함께 포함하며 원격 ancestor exit 0이다.
- targeted 2 files / 18 tests PASS. `npm run check` PASS: Vitest 109 files / 788 tests,
  design guard 329 files, shadcn 482 previews, production build 14,531 modules.
- `API 완성: getIncidentRecentChanges (4f602cc86660a7f8a12583cffc44a53e220d9dbf)`를 기록하고
  APIQ-031 행을 제거했다. 다음 단계는 이 앵커를 소비하는 VP-004 UI RED다.

## 2026-07-13 14:40 KST — [프론트] P4 VP-004 완료 증거

- API RED `c6bd3babe` → API GREEN `4f602cc86660a7f8a12583cffc44a53e220d9dbf` →
  UI RED `f9a982f4f` → UI GREEN `78668b32204e3b30d5c50b9338c3593bdebe852a`.
  두 GREEN hash 모두 `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- `npm run check` PASS: Vitest 112 files / 802 tests, design guard 336 files,
  shadcn 482 previews, production build 14,535 modules.
- `npm run visual-product` PASS. 영어 desktop과 320px에서 exact Recent Changes API 1회,
  긴 image·commit·workflow reflow, 외부 PR 링크 격리, unexpected feature network 0을 검증했다.
- 증거: `references/ui-layer-lab/output/playwright/product-issues-authenticated-detail-desktop-light.png`,
  `references/ui-layer-lab/output/playwright/product-issues-authenticated-detail-reflow-320-light.png`.

## 2026-07-13 14:44 KST — [프론트] VP-005 진입조건 검증·API 재검증 claim

- `git merge-base --is-ancestor 8cd0b18e96f1266873d1632486472d0d22c18477 origin/dev`
  결과 exit 0. canonical `PromotionGateResponse`와 `promotion_gate_from_command_result`를
  대조해 9필드·네 가지 eligible 조건·nullable 의미를 확인했다.
- `listApplicationRuns`의 기존 앵커 `56c689e61`은 구조화 gate 도입 전 계약이다.
  `APIQ-032`는 outer strict / run open / `promotion_gate` strict 경계로 재앵커한다.
- `origin/dev...HEAD`의 dev-only는 27로 30커밋 선흡수 임계값 미만이다.

## 2026-07-13 14:50 KST — [프론트] P5 APIQ-032 완료·화면 계약 주차

- RED `1e06706c9` → GREEN `429fb1d9122c6bf264f5ee1beef948107bb5161e`.
  GREEN은 API schema·endpoint·barrel과 contract test를 함께 포함하며 원격 ancestor exit 0이다.
- targeted 1 file / 13 tests PASS. `npm run check` PASS: Vitest 112 files / 808 tests,
  design guard 336 files, shadcn 482 previews, production build 14,535 modules.
- `eligible`은 승격 완료가 아니라 네 조건의 현재 판정이다. applied/rollout의 null은 실패가
  명시되지 않았다는 뜻이며 성공으로 번역하지 않는다.
- Applications와 Runs API에 서버측 `cluster_id` 필터·cursor가 없어 전역 selector와 본문
  completeness를 일치시킬 수 없다. VP-005 UI만 재개 조건과 함께 주차하고 P6으로 계속한다.
## 2026-07-13 13:14 KST — BQ-018 완료 증거

- lane `codex/opsia-docs-name-propagation`, HEAD
  `46ea10f8f0648dd7c29be984b9845ae57938fb5e`, canonical merge
  `ad28cc9457a094dda7ef8ce53d2184845bb25eb1`.
- stat: README와 OSS 문서 12 files, 28 insertions, 26 deletions. 파일 삭제 0건,
  `src/`, `alembic/`, `deploy/`, `tests/`, `frontend/` 변경 0건.
- 제품 표기: Opsia/opsia, OpsiaBench, `oci://ghcr.io/opsia/charts/opsia`.
  코드 식별자·event subject·DB schema와 `~/.radar/kubeheal-timeline.db` 저장 경로는 보존했다.
- gate: docs index 9 passed; Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1838 passed, 3 skipped`; manifest management 69, target 20.
- 4조건: 전체 그린; merge-tree exit 0/tree `4c354fd97af928d7de65d881dc74540517c9cb6a`;
  삭제·비문서 변경 0건; no-ff merge·push 후 feature와 merge commit의
  `origin/dev` ancestor exit 0.

## 2026-07-13 13:43 KST — BQ-015 완료 증거

- lane `codex/remediation-source-contract`, HEAD
  `1300a5fe64c03aa05fe1f8d9cb94a92c2b254962`, canonical merge
  `130e6755dcd4912c0d2e43ffdcc32b4082c74b7c`.
- commits: `bba4170e3` RED → `099b75a34` 계약·adapter GREEN → `4fc82ad46` container
  binding 보강 → `30e0f8c20` exact-base SCM 배선 → `1300a5fe6` 계약 문서.
- stat: 10 files, 1,581 insertions, 41 deletions. 파일 삭제·rename 0건이며 gateway 계약,
  `src/domains/rca/**`, `src/services/ai/**`, `src/packages/runtime/worker.py` 변경 0건.
- gate: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1865 passed, 3 skipped`; manifest management 69, target 20.
- 실측: 기존 recovery patch scorer 6/6, 신규 source-contract scorer 6/6. raw image/replica/
  probe, Helm values image tag, Kustomize named image tag와 미선언 selector no-write를 검증했다.
- 4조건: 전체 그린; merge-tree exit 0/tree `b106cd2887d70042983db7c8d54d92b7c40ba8ae`;
  삭제 0건; no-ff merge·push 후 feature와 merge commit의 `origin/dev` ancestor exit 0.

## 2026-07-13 14:11 KST — BQ-011 완료 증거

- lane `codex/release-flow-modules`, HEAD
  `bd4730d850d21528a161b9f60e8da2905e4b56f8`, canonical no-ff merge
  `37498fc7115b430c86730847d1213affeed6c61d`.
- router의 HTTP route·인가·DB mutation은 유지하고 `_support`/policy/readiness/verification/report를
  내부 모듈로 추출했다. 기존 router helper 208개와 이동 helper object identity는 호환 export로
  유지하며 공개 route·response·DB schema 변경은 없다.
- 줄수: router 5,297→1,821; `_support` 120, policy 1,348, readiness 937,
  verification 297, report 1,110.
- gate: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1868 passed, 3 skipped`; manifest management 69, target 20.
- 4조건: merge-tree exit 0/tree `7ca5eda67e1666744f2a5d0f96f4585d2f7cc29e`;
  삭제 0건; gateway 계약·RCA·AI·runtime worker 변경 0건; feature와 merge commit의
  `origin/dev` ancestor exit 0.

## 2026-07-13 14:14 KST — G·H 통합 단계 완료 증거

- canonical `origin/dev@4731369d6b6739953b917aaf0cd04e0543f7a91d`에서 Ruff lint/format
  PASS, import-linter 8 kept/0 broken, pytest `1868 passed, 3 skipped`, compileall PASS,
  `make manifest-check` management 69/target 20을 재증명했다. BLOCKED 항목은 0건이다.
- 단계적 H 착륙: H1 `17ac2b7a3`, H2 `5f2393667`, H3 `6d68325bf`; PROMOTE 통합점
  `0eaaa6637`; 이후 BQ-014 `0b4298c4e`, BQ-015 `130e6755d`, BQ-011 `37498fc71`도
  각각 canonical ancestor exit 0이다. D-020의 단계적 H가 과거 일괄 H를 대체하므로 G/H를
  실물 기준 done으로 정합화했다.
- 프론트 인계 초안: `AUDIT_TIMELINE_PATH`는 workspace-scoped correlation timeline과 nullable
  `causation_id`; `RCA_RECENT_CHANGES_PATH`는 incident event-time 이전 성공 변경 목록;
  workflow run의 `promotion_gate`는 optional; `provider`와 `connection_stage`도 optional이다.
  auto-revert·권위 patch·source contract·release-flow 내부 분해는 신규 gateway 계약이 없다.

## 2026-07-13 14:32 KST — I단계 배포 준비 완료 증거

- lane `codex/deploy-plan`, HEAD `0cc6af58c90140123dabd943c55b72b7b4b3bed9`,
  canonical no-ff merge `c2e2b552377ba508a535c9bd1b69c9e60fec522a`.
- stat: `docs/auto/deploy-plan.md` 신규 + `docs/README.md` 색인, 2 files,
  737 insertions. 코드·gateway 계약·frozen path 변경 0건, 파일 삭제 0건.
- plan은 backend 공용 image workload 39개를 같은 digest로 수렴하고 migration →
  consumer/worker → target agent → realtime/API gateway 순서를 고정한다. raw
  `scripts/aws-up.sh`의 create-all bootstrap·전체 restart 결합은 incremental production
  rollout에 쓰지 않는다.
- DB 안전 경계: live `alembic_version`이 없거나 repository history와 다르면 stamp 없이
  중단한다. 0140 partial DDL과 네 concurrent index의 valid/ready/live를 검사하고,
  production image에 Alembic asset이 없는 현실을 canonical operator runner 절차로 명시했다.
- 보안·rollback: rendered/live `DEV_AUTH_BYPASS=0`, auto-revert flag false, target 재등록 없는
  read-only Argo RBAC, 이전 immutable digest 복원, production schema downgrade 금지를 명시했다.
- gate: docs index `9 passed`; Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1868 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `62178b35594cff170766c2f307d54ec50da9621d`;
  삭제·소유권 밖 변경 0건; feature와 merge commit의 `origin/dev` ancestor exit 0.

## GO-REQUEST [J] — Opsia backend production 배포

- 상태: `🔒waiting`; 실제 실행은 사람 전용이다. 아래 blocker 증거가 모두 해소되기 전에는
  GO를 발행하지 않는다.
- 대상: `origin/dev@c2e2b552377ba508a535c9bd1b69c9e60fec522a`, 실행 정본
  `docs/auto/deploy-plan.md`.
- 선행 blocker: 최신 SHA GitHub Actions green, `scripts/smoke.sh` credential,
  RemediationBundle/audit timeline/recent changes의 실제 fixture, live DB Alembic baseline,
  네 concurrent index 정상 상태, DB backup, 이전 immutable image digest, 등록 target 전체
  context, 1-replica 위험 수용.
- 실행 명령 골격:

  ```bash
  git fetch origin
  export DEPLOY_SHA="$(git rev-parse origin/dev)"
  test "$DEPLOY_SHA" = "c2e2b552377ba508a535c9bd1b69c9e60fec522a"
  bash scripts/test.sh
  make manifest-check
  uv run alembic heads
  # 이후 docs/auto/deploy-plan.md §5~§11을 순서대로 실행한다.
  ```

- 예상 결과: DB revision `20260713_0820`, 네 concurrent index가 valid/ready/live,
  service-image Deployment 39개가 같은 digest, gateway ready `2/2`, auth bypass `0`,
  auto-revert flag `false`, 모든 target가 snapshot 수신 후 ready.
- 실패 시 rollback: 신규 write worker를 먼저 scale 0하고 `deployment-images.before.tsv`의
  이전 digest를 gateway부터 명시적으로 복원한다. target agent도 context별 이전 digest로
  복원한다. `alembic downgrade`와 DB restore는 기본 rollback에서 실행하지 않는다.
- 검증: `scripts/smoke.sh` PASS, Bruno 13/14/15의 실제 200 응답과 schema,
  cross-workspace 404, outbox/NATS/DLQ·API 5xx·latency 15분 관찰.
- 재개 조건: 위 blocker별 권위 증거와 사람 GO [J].

## 2026-07-13 14:41 KST — [백엔드] RCA 읽기 Bruno 기본 경로 착륙

- lane `codex/bruno-route-runner`, RED `f3d2b4f92`, Runner `31b93edad`, 문서·feature
  HEAD `6d29a87021c9163c659bda548108576c8358e952`, canonical no-ff merge
  `6ea12f2635bf6b49879f93baeed4fa101c2b4bb4`.
- stat: `tests/test_bruno_collection.py` 18줄, `scripts/run-bruno-aws.sh` 3줄,
  `docs/api/README.md` 20줄 추가. 기본 AWS Runner가 Bruno 13→14→15를 실행하고,
  문서는 RemediationBundle·audit timeline·recent changes의 의미와 production 실제 200
  판정 경계를 구분한다.
- gate: `bash -n scripts/run-bruno-aws.sh`, Bruno collection 18 passed, docs index 9 passed,
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1869 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `780b1e170691d3af359059fe08aba67e9840a85e`;
  삭제·소유권 밖 변경·frozen 경로 변경 0건; feature와 merge commit의 `origin/dev`
  ancestor exit 0.

## 2026-07-13 14:54 KST — [프론트] dev→lab 동기화 증거

- 동기화 전 `origin/dev...HEAD` divergence는 dev-only 32 / lab-only 43으로 30커밋
  선흡수 임계값을 초과했다. merge base는 `d1342f8f793f9e05ea617930dbe6ccd1115756f6`다.
- `git merge-tree --write-tree HEAD origin/dev`의 유일한 충돌은 append-only
  `docs/auto/night-log.md`였다. 양쪽 기록을 모두 보존했고 제품·계약 파일 충돌은 0건이다.
- staged merge delta에서 `frontend/**` 삭제 0건, `src/**` 삭제 0건이다. backend `src/**`는
  `origin/dev` 내용을 그대로 흡수했으며 프론트 세션의 수동 수정은 0건이다.
- `cd references/ui-layer-lab && npm run check` PASS: TypeScript·ESLint,
  Vitest 112 files / 808 tests, design guard 336 files, shadcn 482 previews,
  Vite production build 14,535 modules.
- 흡수 기준점 `4328384a64307388284afb8c92f73df5c232f730`은 merge commit
  `0344d9d2f3441898725416d468c4c97d9860ef06`의 ancestor(exit 0)이고, merge commit은
  `origin/woonyong/ui-layer-lab`의 ancestor(exit 0)다. push 직후 병렬 backend가
  `origin/dev`를 `3d1493f8bbce36d9741ea978b57b0c7d20614ab6`까지 7커밋 더 전진시켰으며,
  새 차이는 30커밋 선흡수 임계값 미만이다.

## 2026-07-13 14:58 KST — [프론트] P6 BLOCKED: auto-revert 식별 계약 결손

- `git merge-base --is-ancestor 6d68325bf1cc47f55810e5dc2189e51a6fe916c0 origin/dev`
  결과 exit 0. BQ-007 worker는 flag off에서 무발화하고 flag on에서는 일반
  `safe_pr.requested`를 발행한다.
- RCA timeline과 release/application projection은 generic Safe PR lifecycle은 표현하지만
  auto-revert origin을 구조화해 반환하지 않는다. 내부 `[auto-revert]` 제목 prefix는 계약이 아니다.
- 재개 조건: stable `trigger_kind=auto_revert`, correlation 또는 workflow run exact scope,
  stable event identity/status/time/PR URL/failure reason의 canonical 계약·앵커.
- 해당 항목만 BE-Gap으로 주차했다. APIQ·adapter·disabled placeholder는 만들지 않고 P7으로 계속한다.

[2026-07-13 15:04 KST] [프론트/API] APIQ-033 in_progress — VP-008의 provider catalog·discovery,
target preflight·register 네 함수와 strict Zod 계약을 claim했다. 1회성 install receipt는 메모리
경계 밖으로 내보내지 않고, provider 명령 합성·POST 자동 재전송·workspace 위조를 금지한다.

## 2026-07-13 15:11 KST — [프론트/API] APIQ-033 완료 증거

- claim `3adb92bdd`, API RED `065f84ab1`, stage RED `482009c1f`, GREEN
  `8678d63b0`을 분리해 push했다. GREEN의 canonical ancestor 결과는 exit 0이다.
- exact anchors: `getProviderCatalog`, `getProviderClusterDiscovery`,
  `preflightTargetRegistration`, `registerTarget` → `8678d63b0`.
- targeted 3 files / 30 tests PASS. full `npm run check` PASS: 113 files / 821 tests,
  design guard 340 files, shadcn 482 previews, production build 14,538 modules.
- 완성형 VP-008 표면은 validation·preview/resume·structured error 계약 결손으로 주차했다.
  transport와 기존 Cluster 목록의 `connection_stage` strict 호환만 release했다.

## 2026-07-13 15:22 KST — [프론트] VP-009 provider 표시 판정 증거

- RED `a0e124b92`·`4a0937c54`, GREEN `3fe308f95`을 분리해 push했다.
  `git merge-base --is-ancestor 3fe308f95 origin/woonyong/ui-layer-lab` 결과 exit 0이다.
- Home은 canonical provider를 카드 헤더에 정확히 1회 표시하고 unknown은 일반 Kubernetes glyph를
  사용한다. Issues는 전역 `ClusterScopePicker`의 기존 단일 표시를 권위로 유지해 중복하지 않았다.
- Fleet는 surface·provider contract·완전성 증거가 없어 BE-Gap으로 분리했다. 제한 목록 client join과
  provider 추론은 수행하지 않았다.
- targeted 2 files / 10 tests PASS. `npm run check` PASS: 113 files / 824 tests,
  design guard 340 files, shadcn 482 previews, Vite build 14,538 modules.
- `npm run visual-product` PASS: 36 isolated scenarios, exact scenario API requests,
  unexpected feature network/WebSocket 0건.

## 2026-07-13 15:24 KST — [프론트] P9 전체 게이트·production build 갱신

- 제품 코드 스냅샷 `3fe308f95`, 판정 문서 기준점 `33279272c`에서 검증했다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 113 files / 824 tests,
  design guard 340 files, shadcn 482 previews, Vite production build 14,538 modules.
- `npm run visual-product` PASS: 36 isolated scenarios, exact scenario API requests,
  unexpected feature network/WebSocket 0건.
- standalone `npm run build` PASS: 14,538 modules, `references/ui-layer-lab/dist` 26 MiB,
  assets 26 MiB, 2,675 files. 제품 entry는 `ProductApp-C79itfkb.js` 319 KiB와
  `ProductApp-Dh-KDTNp.css` 77 KiB다.
- backend pipeline I는 `done`, frontend H는 사람 전용 `🔒waiting`이다. 배포는 수행하지 않았다.

## GO-REQUEST [FE-H] — 2026-07-13 15:25 KST 갱신

- frontend branch / evidence snapshot: `woonyong/ui-layer-lab` / `5a463f845`
  (제품 코드 `3fe308f95`, VP-009 판정 `33279272c`).
- build command: `cd references/ui-layer-lab && npm ci && npm run check && npm run visual-product && npm run build`.
- artifact: `references/ui-layer-lab/dist` (26 MiB, 2,675 files).
- image build 제안: `docker build --platform linux/amd64 -f references/ui-layer-lab/Dockerfile -t <immutable-console-image> references/ui-layer-lab`.
- 배포 제안: image push 후 management namespace의 `deployment/console` image를 immutable tag로
  교체하고 rollout 완료·`/`·`/api/auth/session`·`/api/healthz`를 확인한다.
- rollback: 직전 immutable console image tag 복원 또는 Kubernetes rollout undo 후 같은 endpoint와
  인증 쿠키·WebSocket upgrade를 재확인한다.
- gate: `npm run check` PASS(113 files / 824 tests), `npm run visual-product` PASS(36 scenarios,
  unexpected network/WebSocket 0), standalone production build PASS(14,538 modules).
- backend pipeline I는 `done`이다. frontend H 실행은 사람 GO 전용이며 이 세션은 배포를 실행하지 않는다.

## 2026-07-13 15:36 KST — [프론트] S1 Issues 확대·강제색 접근성 게이트 완료

- visual RED `f5413960a`는 Issues 상세의 200% text resize와 forced-colors 시나리오를
  추가하고, 공용 상태 harness가 Issues 화면 계약을 검증하지 못하는 실패를 고정했다.
- GREEN `2693c5c8b`는 Issues 전용 강제색 assertion, Card의 system-color 경계,
  Button의 keyboard focus·disabled·reduced-motion 규칙을 연결했다. GREEN은
  `origin/woonyong/ui-layer-lab` ancestor exit 0이다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 113 files / 824 tests,
  product design guard 340 files, shadcn source audit 482 previews,
  Vite production build 14,538 modules.
- `npm run visual-product` PASS: 38 isolated scenarios, exact scenario API requests,
  unexpected feature network/WebSocket 0건. 신규 증거는
  `output/playwright/product-issues-authenticated-detail-text-resize-200-light.png`와
  `output/playwright/product-issues-authenticated-detail-forced-colors.png`다.
## 2026-07-13 14:52 KST — [백엔드] OpsiaBench scheduling·PVC 착륙

- lane `codex/benchmark-scheduling-pvc`, RED `fe08b641e`, feature HEAD
  `075926e4d5da6dc59e67e865e293efdf00fb1d6c`, canonical no-ff merge
  `43867308ac4e0e38b57cf7d10c2aa5b4856e47fd`.
- stat: 15 files, 179 insertions / 27 deletions. scheduling과 PVC 각 2개를 추가하고
  `score.py`를 7개 category·14~28개 범위로 확장했다. 현재 source hash와 함께 scheduling
  6개, volume mount 4개, volume attach 2개 후보 전체를 snapshot에 고정했다.
- 기존 builtin recovery drift에 맞춰 image rollback, replica scale, probe fix, selector fix의
  gold action 5건을 정합화했다. 공개명은 OpsiaBench로 통일하되 안정적인 scenario schema ID는
  `kubehealbench/v0.1`로 유지한다.
- 고유 검증: 전체 scorer `14 scenarios` PASS, scheduling 2 PASS, PVC 2 PASS, source YAML과
  snapshot candidate/evidence 완전 일치(`6/4/2`) PASS.
- gate: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `1872 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `0ff6d94d6c17b65bc40d05a9fa1965b79ff1061b`;
  삭제·소유권 밖 변경·frozen 경로 변경 0건; feature와 merge commit의 `origin/dev`
  ancestor exit 0.

## 2026-07-13 15:34 KST — [백엔드] rule candidate 상위 10개 안전 계약 착륙

- lane `codex/candidate-contract-batch-one`, feature HEAD
  `0a1a0b99a482d9bfbcaf394a32ec2ca392cd6611`, canonical no-ff merge
  `a77115d411bbc1de03304f190f124f8fbcfc14f2`.
- stat: 6 files, 4,516 insertions / 4 deletions. `candidate-contract-index.json`은 15개
  catalog의 source SHA와 87개 후보 순서를 고정하고, `candidate-contracts.json`은 loader 순서
  1~10의 공개 안전 계약을 담는다. 파일 삭제·소유권 밖 변경·frozen 경로 변경은 0건이다.
- 계약은 required evidence와 live supporting signal, 실제 dispatcher capability, 허용·금지
  remediation, rollback, post-verification을 분리한다. `config_fix`의 `draft_pr` 선언은 실제
  patch capability로 승격하지 않았고, runtime 반증 미모델링은
  `contradiction_policy=not_modeled_v0.1`로 명시했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 10/10 PASS,
  전체 scenario scorer 14 PASS, `tests/test_benchmark_score.py` 30 passed.
- gate: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `1899 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `b5e31047498a18c660a51e184d13b1d25862a5b0`;
  삭제·소유권 밖 변경 0건; feature와 merge commit의 `origin/dev` ancestor exit 0.
- 잔여 범위: 전체 87개 중 10개만 작성 완료했으며 다음 cursor는 11이다. 나머지 77개는
  후속 배치로 계약화하고, malformed snapshot 구조화 오류·복수 fallback·canonical command·
  CRLF SHA 이식성은 비차단 hardening 후보로 함께 추적한다.

## 2026-07-13 15:37 KST — [백엔드] 아침 요약

- canonical 기준점: `origin/dev@54a3c707108752383956d68599b2b261ff566767`.
- 파이프라인: A·B·C0·C·D·E·F·P·G·H·I는 `done`, J는 사람 GO와 실환경 권위
  증거를 기다리는 `🔒waiting`, K는 J 이후 `pending`이다. `backend-pipeline.md` §3의
  04:30 lane 목록은 역사적 시작점이며 현재 상태 판정은 §4와 이 요약을 따른다.
- 작업 큐: BQ-001~018은 모두 canonical 착륙이 증명되어 `landed`로 정규화했다.
  보조 대기열 S1 Bruno 실행 경로, S2 scheduling·PVC 시나리오, S3 후보 계약 1~10도
  각각 canonical merge와 앵커를 보유한다.
- 최신 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1899 passed, 3 skipped`; manifest management 69 / target 20.
- 사람 전용 잔여: J의 GitHub Actions, 실제 smoke credential·fixture, live DB Alembic baseline·
  index 상태, backup·이전 image digest, target context, 1-replica 위험 수용은 미해소다.
  증거 없이 배포나 K 검증으로 전이하지 않는다.
- 백엔드 후속: OpsiaBench 후보 계약은 87개 중 10개만 작성했다. 다음 작업 cursor는 11이며,
  full catalog 계약·fixture 확대를 순차 배치로 계속한다.

## 2026-07-13 15:40 KST — [백엔드] 아침 요약 정합 보충

- `backend-pipeline.md` §3의 BQ-008 미착륙·활성 lane 목록은 04:30 시작 snapshot임을
  명시했다. 현재 판정은 §4의 A~I done, J `🔒waiting`, K pending을 따른다.
- `backend-f-progress.md`의 선언 앵커 수를 실물 19줄과 맞추고, BQ-001~003의 과거
  delta-green 기준과 현재 실패 허용 0건의 full-green 기준을 분리했다.
- 지시 실물 감사: `night-directives.md`에는 D-021 이후 원문이 없고 EOF 번호 순서도
  역전돼 있다. 현재 세션에 직접 전달된 후속 지시는 적용하되, 원문을 추측해 파일에
  만들지 않는다. J 배포는 기존 사람 전용 게이트를 계속 유지한다.
- J 전 사전 hardening 후보: Bruno 13/14/15의 실제 200 강제, management cluster-agent
  scope, smoke image digest 전달, 실행 가능한 rollback 명령을 배포 정본에서 추가 검산한다.
  이는 배포 GO를 대신하지 않으며 현재 배포 실행은 0건이다.

## 2026-07-13 15:41 KST — [프론트] dev 흡수·PROMOTE 완료 증거

- 흡수 직전 divergence는 dev-only 22 / lab-only 60이었다. 최신 dev 변경은 benchmark·backend
  문서·테스트에 한정됐고, 예측·실제 충돌은 append-only `docs/auto/night-log.md` 한 파일뿐이었다.
  양측 기록을 모두 보존했으며 제품·계약 파일 충돌은 0건이다.
- staged merge와 승격 diff의 `frontend/**` 삭제 0건, `src/**` 삭제 0건이다. 두 경로에 대한
  프론트 세션의 수동 수정도 0건이다.
- 통합 상태 `npm run check` PASS: 113 files / 824 tests, design guard 340 files,
  shadcn 482 previews, Vite build 14,538 modules. `npm run visual-product` PASS:
  38 isolated scenarios, exact scenario API requests, unexpected network/WebSocket 0건.
- dev 흡수 merge `a1e37d34308192a6d5c363983a370209ab4813be`를 lab에 push한 뒤 비강제
  fast-forward로 dev에 승격했다. `origin/dev`와 `origin/woonyong/ui-layer-lab`은 모두
  `a1e37d343`이고 양방향 ancestor exit 0, divergence 0/0이다.

## 2026-07-13 15:43 KST — [백엔드] 아침 요약 lane 최신화

- 작업 중 `origin/dev`가 `a1e37d34308192a6d5c363983a370209ab4813be`까지 전진해 S4 lane에
  merge했다. `docs/auto/night-log.md`는 양측 append를 모두 보존했고 충돌은 0건이다.
- 최신 기준 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1901 passed, 3 skipped`; manifest management 69 / target 20.
- S4 자체 변경 경로는 조율 문서 4개와 `tests/test_docs_index.py`뿐이며, canonical에서
  합류한 프론트 파일은 S4 소유 변경으로 재분류하지 않는다.

## 2026-07-13 15:45 KST — [백엔드] 아침 요약·완료 상태 정합 착륙

- lane `codex/morning-summary-consistency`, feature HEAD
  `356bef2e29255fe5f8305fa61522865fb63bf3fc`, canonical no-ff merge
  `5aa8fa006280e7b6191832d0f5fea6d9108438f6`.
- RED `c29f4d3b5`가 미정의 작업 큐 상태 5건을, RED `c000af818`이 선언 앵커 6건과
  실물 19건의 차이를 잡았다. 수정 후 큐는 BQ-001~018과 S1~S4를 `landed`로 구분하고
  앵커 선언은 새 S4 앵커를 포함한 20건과 일치한다.
- gate: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `1901 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `ab67562c43f4c808674b59ff2c8a2393c52e03f2`;
  파일 삭제·소유권 밖 코드·frozen 경로 변경 0건; feature와 merge commit의
  `origin/dev` ancestor exit 0.
- 배포는 실행하지 않았다. J는 실환경 권위 증거와 사람 GO를 기다리는 상태를 유지한다.

## 2026-07-13 15:48 KST — [프론트] Button·Card 접근성 계약 테스트 보강

- 테스트 기준점 `684a9e091`에서 Button slot을 봉인해야 한다는 가정을 먼저 검증했으나,
  typecheck가 `SidebarTrigger`의 의도적인 합성 slot 소유권을 거부해 해당 가정이 제품 계약과
  충돌함을 확인했다. 공용 합성 계약을 깨는 구현 변경은 착륙하지 않았다.
- 정정 `9e4eafb41`은 Button 기본 slot과 wrapper 특화 slot을 함께 고정하고, native type·disabled,
  focus-visible·reduced-motion·forced-colors 클래스 13개를 단위 테스트로 검증한다. Card는
  비대화형 표면이므로 system-color 경계만 검증한다.
- targeted 3 files / 14 tests, typecheck, lint PASS. full `npm run check` PASS:
  114 files / 827 tests, design guard 341 files, shadcn 482 previews, Vite 14,538 modules.
  `npm run visual-product` PASS: 38 isolated scenarios, unexpected network/WebSocket 0건.

## 2026-07-13 15:59 KST — [백엔드] rule candidate 11~20 안전 계약 착륙

- 데이터 lane `codex/candidate-contract-batch-two@d90ccac03`, canonical no-ff merge
  `59a9c460b01e56d03e0f21da0e40999e2d078a36`; terminal hardening lane
  `codex/candidate-contract-terminal-digest@b2b6baeb0`, canonical no-ff merge
  `5bc68f5cd7b6287e499c669c0c507912920debec`.
- index 11~20의 evidence·signal을 exact 투영했다. 모두 live `manual_analysis` fallback만
  허용하고 patch capability와 exact fixture는 빈 배열이다. 후보별 forbidden action은
  cluster/fleet 확장을 차단하며 allowed action과 중복되지 않는다.
- append-only: batch 1·2 canonical JSON digest를 고정하고, 새 완료 배치의 digest 누락을
  거부한다. terminal 배치는 78~87이 아니라 정확히 81~87로 계산한다. 복수 fallback은
  선언 순서대로 누적한다.
- 고유 검증: candidate scorer 20/20 PASS, 전체 scenario 14 PASS, 후보 계약 테스트
  37 passed. 전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1908 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree 두 건 clean(`b46ca873…`, `78592de2…`), 파일 삭제·소유권 밖 변경·
  frozen 경로 변경 0건, 두 feature와 merge commit의 `origin/dev` ancestor exit 0.
- 잔여 범위: 전체 87개 중 20개 완료, 다음 cursor 21. J 배포 실행은 0건이다.

## 2026-07-13 16:02 KST — [프론트] BQ-017 스키마 호환 완료 + `bfaf03901`

- `ClusterSummary.provider`는 `eks|gke|aks|onprem|kind|unknown`의 optional enum으로,
  `ClusterConnectionStatus.connection_stage`는
  `token_issued|awaiting_install|agent_connected|snapshot_received|ready|expired|error`의
  optional enum으로 명시돼 있다. 두 객체의 `z.strictObject` 경계는 유지한다.
- 최초 호환 구현 `bfaf03901`과 공용 연결 단계 schema 통합 `8678d63b0`은 현재
  `origin/dev`와 `origin/woonyong/ui-layer-lab`의 ancestor이며, 두 원격의 해당 API schema와
  계약 테스트 파일은 동일하다.
- targeted API contract PASS: 2 files / 19 tests. full `npm run check` PASS:
  TypeScript·ESLint, Vitest 114 files / 827 tests, design guard 341 files,
  shadcn source audit 482 previews, Vite production build 14,538 modules.

## 2026-07-13 16:06 KST — [백엔드] rule candidate 21~30 안전 계약 착륙

- lane `codex/candidate-contract-batch-three`, RED `3d39b3cf6`, 구현·데이터
  `9df3551d8`, feature HEAD `8f0ee335f1ba947d077c3b16b17267afde123de3`, canonical no-ff merge
  `efdde0a31fb1986c3d30083bf3dc895fd256aafd`.
- loader 순서 21~30의 evidence·signal·recovery를 exact 투영했다. 25번
  `wrong_image_tag`만 실제 `safe_pr` capability가 있고, 26·27번은 approval-only,
  나머지는 `manual_analysis` fallback-only다. fixture는 실존 계약과 일치하는 25·26번뿐이다.
- append-only: 세 번째 batch digest `ba7e92d1…f7ac79`를 `(21, 30)`에 고정하고
  batch 3 변조 회귀를 추가했다. 누적 범위는 30/87, 다음 cursor는 31이다.
- 고유 검증: candidate scorer 30/30 PASS, 후보 계약 테스트 40 passed, 독립 감사
  P0/P1 0건. 전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1911 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `c6d98ec1167434a3a51f3bb0cc77cb5c13350b8e`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·feature·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:11 KST — [프론트] Issues 선택 의미·포커스 계약 완료 증거

- RED `60abe061b`는 선택된 Issue가 상세 region을 소유한다는 `aria-current`·`aria-controls`
  계약과 사용자 선택 후 상세 포커스 이동을 단위·브라우저 게이트에 고정했다.
- GREEN `6ed4424eb`는 React `useId` 기반 단일 region ID와 선택 요청별 포커스 생명주기를
  연결했다. 같은 행 재선택은 다시 상세로 이동하고, 클러스터 전환으로 과거 선택이 복원될
  때는 pending ID가 없으므로 임의 포커스를 만들지 않는다.
- 첫 full gate는 `IssuesSurface.tsx` 302줄을 설계 상한 300줄 위반으로 정확히 차단했다.
  줄 압축 대신 `useIssueDetailFocus` hook으로 책임을 분리한 뒤 재검증했다.
- 최종 `npm run check` PASS: TypeScript·ESLint, Vitest 114 files / 828 tests,
  design guard 342 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 38 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.

## 2026-07-13 16:15 KST — [백엔드] rule candidate 31~40 안전 계약 착륙

- lane `codex/candidate-contract-batch-four`, RED `85f9447c9`, 구현·데이터
  `1497b9bb3`, 의미 교정과 feature HEAD `296e14c383ae949573f2ad5216af8874b1a923b8`,
  canonical no-ff merge `6ebd0f6bd7882bbed2b173d100fb6a26ebe4e0e5`.
- loader 순서 31~40의 exact evidence·signal·recovery를 투영했다. 36·37번은 `command`,
  38번은 `command+safe_pr`, 나머지는 fallback-only다. exact fixture는 0개이며 유사 fixture를
  만들지 않았다.
- forbidden remediation 의미 감사에서 ordinal 35의 재시작 불가능한 Endpoint 표현을 잡아
  cluster 전체 backend workload 재시작 금지로 교정했다. 최종 독립 재감사 P0/P1 0건이다.
- append-only: 네 번째 batch digest `32d4a8b4…ab73d`를 `(31, 40)`에 고정하고
  누락 lock·batch 4 변조 회귀를 추가했다. 누적 범위는 40/87, 다음 cursor는 41이다.
- 고유 검증: candidate scorer 40/40 PASS, 후보 계약 테스트 43 passed. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1914 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `a9c271adfbed401a3dd8f04887c9a9cc765d5185`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·수정·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:21 KST — [프론트] 공용 primitive 모션 감소 계약 완료 증거

- RED `c9cfbf7ef`는 Input·Toggle·TableRow 전환과 Dialog overlay/content·Tooltip의
  open/closed 애니메이션이 primitive 자체 계약에서 누락된 사실을 5개 실패로 고정했다.
- GREEN `9d59a5fd2`는 일반 환경의 기존 모션은 유지하고 `prefers-reduced-motion`일 때만
  transition을 제거하며 popup 양방향 animation과 duration을 0으로 만든다. Base UI의
  Toggle pressed 상태, Dialog focus trap·Escape·focus return, Tooltip hover/focus 생명주기,
  native table 의미는 변경하지 않는다.
- Resources 브라우저 검증은 Input·Toggle·TableRow를 required slot으로 강제하고,
  Home은 실제로 열린 freshness Tooltip의 computed animation/transition 시간이 1ms 이하인지
  확인한다. 모바일 Dialog content/overlay는 기존 shell 계산 검증을 계속 사용한다.
- 최종 `npm run check` PASS: TypeScript·ESLint, Vitest 115 files / 830 tests,
  design guard 343 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 38 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.

## 2026-07-13 16:23 KST — [백엔드] rule candidate 41~50 안전 계약 착륙

- lane `codex/candidate-contract-batch-five`, RED `0a86981fd`, 구현·데이터
  `1b4bfa779`, feature HEAD `5995350c4d95eccade8f24a31870a6a9d2d0fc5d`, canonical no-ff merge
  `910825ec4a90be0403bae7c41d8bc0f09a23e7ee`.
- loader 순서 41~50의 exact evidence·signal·recovery를 투영했다. 41~49는 fallback-only,
  50번 `probe_path_wrong`만 `safe_pr`와 exact probe fixture를 가진다.
- forbidden 의미 감사에서 ordinal 44의 node-wide 조치를 실제 reboot로, ordinal 46의
  manifest 교체 action과 blast radius를 fleet로 정합화했다. 이중 독립 감사 P0/P1 0건이다.
- append-only: 다섯 번째 batch digest `f125aff8…e5fb`를 `(41, 50)`에 고정하고
  누락 lock·batch 5 변조 회귀를 추가했다. 누적 범위는 50/87, 다음 cursor는 51이다.
- 고유 검증: candidate scorer 50/50 PASS, 후보 계약 테스트 46 passed. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1917 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `77dbb5e47763f69b28893631b09d7415464bcdc4`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:27 KST — [프론트] dev→lab 정기 흡수 완료 증거

- 흡수 기준은 `origin/dev@9811cd5f4`이며 직전 divergence는 dev-only 33 / lab-only 11이었다.
  dev-only 변경은 benchmark·backend 조율 문서·테스트에 한정됐고, 프론트 제품 경로 삭제는
  0건이었다.
- append-only `docs/auto/night-log.md` 한 파일만 충돌했으며, 프론트 5개와 백엔드 7개 기록을
  누락 없이 15:37~16:21 시간순으로 병합했다. 제품·계약 파일 충돌은 0건이다.
- 병합 상태 `npm run check` PASS: TypeScript·ESLint, Vitest 115 files / 830 tests,
  design guard 343 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 38 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.
- merge `453d0843d8b8fca1cf798b61309ba3c5da1067f4`를
  `origin/woonyong/ui-layer-lab`에 비강제 push했다. 검증 중 `origin/dev`는 후보 계약 41~50
  배치 `ce50d0fb6`까지 5커밋 전진했으며, 자동 재흡수 임계값 미만이라 다음 주기에 보존한다.

## 2026-07-13 16:30 KST — [백엔드] rule candidate 51~60 안전 계약 착륙

- lane `codex/candidate-contract-batch-six`, RED `defe3751d`, 구현·데이터
  `65f487ea9`, feature HEAD `5ce8132b0598797e73bb675a2ff49c66eef72167`, canonical no-ff merge
  `66115a2d7312ae09e9cf8a06b1369ddf051e7cd2`.
- loader 순서 51~60의 exact evidence·signal·recovery를 투영했다. 51~53번 probe 후보와
  55번 selector 후보만 `safe_pr`다. fixture는 51·55·56번에만 exact 연결했다.
- 54번 실제 health 실패에 probe fix를 추론하지 않고, fixture가 있는 56번도 fallback-only,
  60번도 live OOM recovery 부재를 그대로 보존했다. 독립 의미 감사 P0/P1 0건이다.
- append-only: 여섯 번째 batch digest `cc5f1422…b0ae`를 `(51, 60)`에 고정하고
  누락 lock·batch 6 변조 회귀를 추가했다. 누적 범위는 60/87, 다음 cursor는 61이다.
- 고유 검증: candidate scorer 60/60 PASS, 후보 계약 테스트 49 passed. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1920 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `113e4e5166691df6ab5c2bd940a2b9e86487fb25`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:37 KST — [백엔드] rule candidate 61~70 안전 계약 착륙

- lane `codex/candidate-contract-batch-seven`, RED `5c0d04120`, 구현·데이터
  `95afd8163`, feature HEAD `aed4bf78b4e640af0b5ac55017f6a445b0a5013b`, canonical no-ff merge
  `de0b2760951bd654b597bbfc36ce0004b26bc5fb`.
- loader 순서 61~70의 exact evidence·signal을 투영했다. 전부 fallback-only이며 capability와
  fixture가 없다. 이름만 보고 OOM·rollback·config patch를 추론하지 않았다.
- forbidden은 fleet memory 증설, node data purge, cluster-wide ConfigMap 복제·변조처럼
  기술적으로 성립하는 과잉 대응으로 독립 의미 감사 P0/P1 0건이다.
- append-only: 일곱 번째 batch digest `56882298…8590`를 `(61, 70)`에 고정하고
  누락 lock·batch 7 변조 회귀를 추가했다. 누적 범위는 70/87, 다음 cursor는 71이다.
- 고유 검증: candidate scorer 70/70 PASS, 후보 계약 테스트 52 passed. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1923 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `df15a4c59d352feeab141aa9bc36034e501fea44`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:40 KST — [프론트] Cluster 연결 단계 읽기 전용 전달 완료 증거

- RED `d1f9924ec`는 strict API가 허용한 `connection_stage`가 Home canonical 경계에서
  유실되는 문제와 전역 선택기의 접근 가능한 단계 표기 누락을 4개 실패로 고정했다.
- GREEN `697411628`은 7개 canonical stage를 endpoint→Home choice에 그대로 전달한다.
  optional 필드가 없으면 `null`로 보존하고 단계 문구를 생략하므로 `connection_status`에서
  진행률·완료·실패·복구 동작을 추론하지 않는다. 별도 connection-status 호출도 추가하지 않았다.
- stage는 전역 Cluster 선택기의 ARIA 이름과 freshness Tooltip에만 한 번 표시하고, en/ko
  카탈로그와 완전한 `Record` 매핑으로 봉인했다. API와 canonical union의 타입 동등성도
  contract test로 고정했다. 이는 VP-008 위자드 해제를 의미하지 않는 읽기 전용 선행 단위다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 115 files / 833 tests,
  design guard 343 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 38 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.

## 2026-07-13 16:46 KST — [백엔드] rule candidate 71~80 안전 계약 착륙

- lane `codex/candidate-contract-batch-eight`, RED `3060b5f60`, 구현·데이터
  `895f4185f`, feature HEAD `dd2006904491f22113d4e84329f681a227e85d2e`, canonical no-ff merge
  `cb099e5eb161d740710c2b276b52bc85dc2006d9`.
- loader 순서 71~80의 exact evidence·signal·recovery를 투영했다. 73~75의 `draft_pr`
  선언은 dispatcher allowlist 밖이어서 capability가 없고, 78번도 승인형 수동 action이다.
  fixture는 73·75·78번에만 exact 연결했다.
- forbidden은 fleet node pool 증설, cluster scheduling 제약 제거, PVC 전체 삭제, Secret 전역
  복제·변조처럼 기술적으로 성립하는 과잉 대응으로 독립 의미 감사 P0/P1 0건이다.
- append-only: 여덟 번째 batch digest `7ebd96e2…51d6`를 `(71, 80)`에 고정하고
  누락 lock·batch 8 변조 회귀를 추가했다. 누적 범위는 80/87, 다음 cursor는 81이다.
- 고유 검증: candidate scorer 80/80 PASS, 후보 계약 테스트 54 passed. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1925 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `61250ee0eacdee280fd73e6f223a9273cb994f70`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:52 KST — [프론트] Issues 요청 cursor 불투명 경계 완료 증거

- RED `a869c79fc07c8d2e42d401e45390dbf384d8e884`는 Evidence·RCA report의 요청
  cursor가 adapter와 API query 경계에서 trim·누락되는 문제를 exact byte 회귀로 고정했다.
- GREEN `b251147162b719798590239d367bdfa1985896ba`는 nonblank cursor의 선행·후행
  공백과 URL-safe 문자 원문을 그대로 전달하고, `undefined`와 명시적 빈 문자열·공백 문자열을
  구분해 후자만 요청 오류로 거부한다. 동결된 `client.ts`·`url.ts`는 수정하지 않았다.
- 전용 cursor 계약 테스트를 분리해 기존 adapter 책임을 300줄 설계 상한 안에 유지했다.
  `npm run check` PASS: TypeScript·ESLint, Vitest 116 files / 834 tests,
  design guard 344 files, shadcn source audit 482 previews, Vite build 14,539 modules.
- 응답 `next_cursor`의 nonblank 원문 보존과 `null` 단일 부재 표현은 별도 TDD 단위로
  이어서 검증한다. 이 후속 범위는 현재 요청 cursor 커밋에 섞지 않았다.

## 2026-07-13 16:54 KST — [백엔드] rule candidate 81~87 terminal 안전 계약 착륙

- lane `codex/candidate-contract-terminal`, RED `564deb9a3`, 구현·데이터 `bd7585427`,
  feature HEAD `aafc4a956bc03b85133cb6b46f3ba889dde532dc`, canonical no-ff merge
  `dc0b775ff0b4813e2599ea0c15f7bf574d830b0d`.
- loader 순서 81~87의 exact evidence·signal·fallback을 투영해 87/87 전체를 완결했다.
  7개 모두 capability가 비어 있고, fixture는 82번 `pvc_not_bound`에만 exact 연결했다.
- forbidden은 controller fleet 재시작, cluster volume 강제 detach, RWO 소비자 전역 삭제,
  VolumeAttachment finalizer 전역 제거처럼 기술적으로 성립하는 과잉 대응으로 독립 의미 감사
  P0/P1 0건이다.
- append-only: terminal batch digest `e3f38634…fe22`를 `(81, 87)`에 고정하고 누락 lock·
  batch 9 변조 회귀를 추가했다. 누적 범위는 87/87, cursor는 `null`이다.
- 고유 검증: candidate scorer 87/87 PASS, 후보 계약 테스트 56 passed. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1927 passed, 3 skipped`;
  manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `b2693f8c4aedb9d5004fd178c4435f10e492525f`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 16:59 KST — [프론트] Issues 응답 cursor 불투명 경계 완료 증거

- RED `0000f893661bfc58ab709ec4a43fd80db3847ef6`는 Evidence·RCA report·Audit
  timeline의 마지막 페이지에서 blank `next_cursor`가 통과하는 문제를 2개 실패로 고정했다.
  surrounding-space를 포함한 nonblank cursor의 exact byte 보존과 `null` 정상 부재도 함께 봉인했다.
- GREEN `97a37463376ecca491db9f48efc6db52a2691e4a`는 `has_more` 여부와 cursor
  값 유효성 검사를 분리했다. non-null cursor는 trim하지 않고 blank predicate만 적용하며,
  부재는 `null`만 허용하고 `has_more=true`에서 null인 모순은 계속 거부한다.
- 첫 full gate는 병렬 부하에서 Resources 비동기 라우팅 테스트가 완료 전에 단정해 1회
  간헐 실패했으나 해당 파일 단독 15/15 PASS, 변경 없는 두 번째 전체 실행 PASS로 분류했다.
  최종 `npm run check` PASS: TypeScript·ESLint, Vitest 117 files / 841 tests,
  design guard 345 files, shadcn source audit 482 previews, Vite build 14,539 modules.

## 2026-07-13 17:02 KST — [백엔드] scheduling node selector 시나리오 착륙

- lane `codex/benchmark-scheduling-memory`, 초기 RED `b07dcbb16`, 독립 감사 교정
  `3d9899564`, 구현·데이터 `70d3478ef`, feature HEAD
  `dea2d4babb6882c2cf6b5ff8354060f8472bf6f7`, canonical no-ff merge
  `584e2eda0af8d0d6d862fffe6be836a1c925fbae`.
- 독립 감사에서 memory request보다 외부 용량 가정이 없는 `node_selector_mismatch`를 선택했다.
  정상 `general` ↔ 장애 `retired` selector와 gold·rollback을 결정적으로 고정했다.
- fallback-only라 `manual_analysis`만 허용하고 cluster-wide nodeSelector 제거를 금지했다.
  ordinal 76 exact fixture 연결로 batch 8을 재감사했고 digest는 `8d19d8d9…5521`이다.
- 고유 검증: scheduling 3/3, 전체 scenario 15/15, candidate 87/87, 후보 계약 테스트
  57 passed. 전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1928 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `9cb957b643ac84ccc8dffca6b9151a1569606698`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·교정·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 17:06 KST — [백엔드] AsyncDb 호출 경계 직접 테스트 착륙

- lane `codex/runtime-async-db-tests`, test-only feature HEAD
  `effec9f6d98c0e56fc6bf10e5860b626e5d01077`, canonical no-ff merge
  `b37a94d958b7c56a8df8c8780bc1ff30a63b3d63`.
- 소스 변경 0건으로 async/non-callable passthrough, sync `to_thread`, active connection의
  동일-thread 재사용, 인자·결과·예외·`AttributeError` 전파를 5개 직접 테스트로 고정했다.
- 고유 검증: `tests/test_async_db.py` 5 passed. 전체 게이트는 Ruff lint/format PASS,
  import-linter 8 kept/0 broken, pytest `1933 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `41ae92a7d037bccfab7950b8d5ee70162ce0a39e`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, test·merge commit의 `origin/dev` ancestor exit 0.
  J 배포 실행은 0건이다.

## 2026-07-13 17:11 KST — [백엔드] probe timeout 시나리오 착륙

- lane `codex/benchmark-probe-timeout`, RED `bd864494d`, 구현·데이터 `9171d6005`,
  feature HEAD `b96a6981079a4a144921d391f443d43e4306a05d`, canonical no-ff merge
  `2d9ef3fc2ddb17970d863dcadc995a7d6a6dfe3e`.
- `timeoutSeconds` 5→1→5의 결정적 fault·gold·rollback으로 target workload Safe PR만
  허용하고 fleet 전체 timeout 증가는 금지했다.
- ordinal 52 exact fixture 연결로 batch 6을 재감사했고 digest는 `7920067d…54d3`이다.
- 고유 검증: probe 3/3, 전체 scenario 16/16, candidate 87/87, 후보 계약 테스트 58 passed.
  전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1934 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `3716fbc40341c0cb55b34669634e2d6c0418b90e`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, RED·구현·문서·merge commit의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 17:15 KST — [프론트] Resources 장문 상세·200% 확대 완료 증거

- RED `11f6d0f87d2d2439a2ca87895b35bcb6f3e35f65`는 실제 UID 미노출, 관계
  identity의 `truncate`, Event reason/message의 무공백 장문 줄바꿈 누락을 3개 실패로 고정했다.
- GREEN `06cb48853ece13bbdd119751ff9892d004e82f47`은 API·canonical 계약을
  변경하지 않고 상세 header·DefinitionGrid·관계·Event 표현 경계에 `min-w-0`과
  `overflow-wrap:anywhere`를 적용한다. UID 원문은 en/ko catalog의 단일 `UID` 라벨로 노출하고,
  owner·node·URL 등 fact의 hover-only truncate를 제거했다.
- 200% text resize 시각 장면을 overview·relations·events 세 탭에 각각 추가했다.
  증거는 `references/ui-layer-lab/output/playwright/product-resources-detail-long-overview-text-resize-200-light.png`,
  `product-resources-detail-long-relations-text-resize-200-light.png`,
  `product-resources-detail-long-events-text-resize-200-light.png`이며 모두 exact fixture 원문과
  수평 overflow 0을 확인한다.
- 최종 `npm run check` PASS: TypeScript·ESLint, Vitest 117 files / 844 tests,
  design guard 345 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 41 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.

## 2026-07-13 17:15 KST — [백엔드] kubectl server dry-run adapter 직접 테스트 착륙

- lane `codex/kubernetes-dry-run-tests`, test-only feature HEAD
  `ccdcc1a08aef4d1aa30929dea717f455ea0a447e`, canonical no-ff merge
  `01dc635583f45d058d0d324d70b0c02a42d66889`.
- 소스 변경 0건으로 임시 manifest 내용·정리, SSA apply→live get argv, custom binary·
  field manager·timeout, apply 조기 실패, get 실패의 predicted 보존을 검증했다.
- kubectl 부재·timeout·stderr/stdout·invalid JSON과 import-time timeout binding까지
  직접 테스트 8개로 고정했다.
- 전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1942 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `68cb35ca8dc94ec15299e23824edd86d85e5ead4`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, test·merge commit의 `origin/dev` ancestor exit 0.
  J 배포 실행은 0건이다.

## 2026-07-13 17:29 KST — [프론트] dev→lab 정기 흡수·게이트 완료 증거

- `aef9cda375682742fd909cd2479bb04df5bac58b`에서 프론트 HEAD `531a89bde`와
  당시 canonical `7216f2d2a`를 no-ff로 통합했고, 후속 canonical merge
  `da5330778443902009d45154214ab692da08cb7c`까지 흡수했다.
- `references/ui-layer-lab/**`와 `docs/spec/frontend/**`의 dev측 변경은 0건이었다.
  공유 충돌은 append-only `docs/auto/night-log.md` 1개뿐이며, FE·BE 15개 섹션을 실제
  커밋 시각의 비감소 순서로 배치했다. 각 섹션 1회, conflict marker 0건, 본문 유실 0건이다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 117 files / 844 tests,
  design guard 345 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 41 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.
- 로그 무결성 커밋·push는 `40fda210a64a6f29d76aaabde719672724099c28`이며,
  `origin/woonyong/ui-layer-lab` exact 일치와 `origin/dev` ancestor exit 0을 재확인했다.

## 2026-07-13 17:37 KST — [백엔드] startup probe 시나리오와 capability 교정 착륙

- 최초 lane `codex/benchmark-probe-startup-window`, RED `f811610d1`, 구현 `17cd32648`,
  feature HEAD `67014a028`, 최초 merge `da5330778`이다.
- 5초 초기화, 정상 8초·장애 4초 window로 `startup_window_too_short` exact fixture를
  ordinal 53에 연결했다. probe 4/4, 전체 scenario 17/17, candidate 87/87이다.
- 독립 감사에서 실제 frozen producer의 `probe_replacements`가 readiness/liveness만 생성해
  startup `failureThreshold` Safe PR을 만들 수 없음을 발견했다. frozen 파일은 수정하지 않고
  correction lane `codex/startup-probe-capability-truth`에서 capability를 빈 값으로 고정하고
  scenario를 `manual_analysis` 승인 경로로 교정했다. correction RED `728d23c35`, feature
  `94c419a80`, canonical merge `8f84ecdc0`이다.
- 여섯 번째 batch digest는 `0d53d280…b69aea`다. 전체 게이트는 Ruff lint/format PASS,
  import-linter 8 kept/0 broken, pytest `1943 passed, 3 skipped`; manifest 69/20이다.
  target-agent SQLite destructor의 cross-thread `PytestUnraisableExceptionWarning` 2건이 관찰됐으나
  실패는 아니며 본 lane 변경 경로와 무관하다. 별도 test-only 감사 대상으로 남긴다.
- 4조건: merge-tree clean/tree `c0764350df4849f292bed6b5e4067cbc845121d1`, 삭제·frozen 변경
  0건, `94c419a80`·`8f84ecdc0`의 `origin/dev` ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 17:37 KST — [백엔드] 통합 worktree 오선택 감사·판단 대기

- 최초 merge 명령이 전용 integration worktree가 아니라 루트 `woonyong/ui-layer-lab`에서
  실행돼 `da5330778`의 부모가 `aef9cda37`과 `67014a028`이 됐다.
- `aef9cda37`은 이전 canonical `7216f2d2a` 대비 프론트 소유·문서 51파일,
  `+1107/-153`, 삭제 0건을 포함한다. force/reset/revert나 추가 역변환은 수행하지 않았다.
- 이 UI 변경의 채택 여부는 사람 판단 대기다. 재개 조건은 (a) 현 tree 승인 또는
  (b) 명시적 tree 복원 지시다. 백엔드 보충 작업은 해당 경로를 건드리지 않고 계속한다.
- `codex/startup-probe-safe-pr@962abca9b`는 downstream contract/allowlist만 확장해 실제
  frozen producer 부재를 해결하지 못한 미착륙 local lane이다. merge·push하지 않고 보존하며,
  producer 확장에 대한 명시적 frozen 예외가 없는 한 착륙 대상이 아니다.

## 2026-07-13 17:46 KST — [백엔드] outbound deliver 직접 테스트 착륙

- lane `codex/runtime-outbound-tests`, 기본 test `06cae9347`, identity·호출 횟수 보강
  `52ad0d4db`, feature HEAD `e43920262`, canonical no-ff merge `784996ce7`이다.
- `src/packages/runtime/outbound.py` 소스 변경 0건으로 call 1회, 성공 결과와 일반 예외의
  동일 인스턴스 전달, 성공/실패 body 1건을 고정했다. `CancelledError`는 실패 이벤트로
  변환하지 않고 동일 인스턴스를 전파하며 양 mapper 오류도 숨기지 않는다.
- stale runtime 문서의 실재하지 않는 `Outbound`/`HttpOutbound` 설명을 제거했다.
- 전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1948 passed, 3 skipped`; manifest management 69 / target 20이다.
- 4조건: merge-tree clean/tree `1b237c85086a83fbb53f315644899075db2610fa`, source·삭제·
  frozen 변경 0건, `e43920262`·`784996ce7`의 `origin/dev` ancestor exit 0.
  J 배포 실행은 0건이다.

## 2026-07-13 17:48 KST — [프론트] 초기 로딩 CLS 실측·게이트 완료 증거

- 코드 `a46a4d4ad8f224be6261711a838b2f2145ed03be`는 Home·Resources·Issues에 결정적
  지연 응답과 로딩 skeleton bounds 검증을 추가했다. navigation 전 observer, pending record flush,
  strict `<1초`·`<5초` session window, recent-input 제외, 세 장면 coverage assert를 사용한다.
- CSS 전 `body` 기본 여백 source를 `references/ui-layer-lab/index.html:32`에서 제거해
  Home `0.009743→0.004188`, Resources `0.009722→0.004167`, Issues
  `0.009758→0.004202`로 낮췄다. 모두 release budget `0.1` 미만이다.
- 잔여 source는 Home `HomeClusterHealth.tsx:50`의 StatusMark `0.000021`, Issues
  `IssuesSurface.tsx:212`의 CardContent `0.000035`이며 추가 눈짐작 수정은 하지 않았다.
  navigation 전 200% root font 적용으로 확대 장면의 비결정적 재설정도 제거했다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 117 files / 844 tests,
  design guard 345 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 41 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.

## 2026-07-13 18:06 KST — [프론트] S3 문서 정합 완료·CLS 앵커 정정

- `78524624f38f3019f1d25bb9855b69af02746f60`에서 제품 정본의 공개 표면을
  Home·Resources·Issues 세 화면으로 정합화하고, API 작업 권한을 `api-needs.md`의
  claim 기반 역할 계약으로 갱신했다.
- `frontend-pipeline.md`의 결합돼 있던 E 단계를 실제 착륙 상태에 맞춰 VP-002 감사
  타임라인 `done`과 VP-003 이벤트 여정 `blocked`로 분리했다. VP-003은 안정적인
  `event_id`와 canonical subject→journey-stage 계약이 착륙하기 전까지 추론하지 않는다.
- 17:48 기록의 CLS 코드 전체 해시
  `a46a4d4ad8f224be6261711a838b2f2145ed03be`는 존재하지 않는 오기다. 실제 커밋은
  `a46a4d4adfd4ac2be66531f6bc5c769b8b671668`이며, append-only 원칙에 따라 이전
  기록을 덮어쓰지 않고 이 절에서 정정한다.
- 정합화 직전 전체 `npm run check` PASS: TypeScript·ESLint, Vitest 117 files / 844 tests,
  design guard 345 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 18:06 KST — [백엔드] crashloop 포트 bind 충돌 시나리오 착륙

- lane `codex/benchmark-port-bind`, RED `a2336a05d`·`fc7d32263`·`2d8cff0d7`·
  `0e0d94692`, 구현 `919f7dddd`, 문서 `ac7c9749e`, merge-patch RED `d0fbbc792`,
  feature HEAD `ff3b52812905f09242ab05e2704f816ede52845f`, canonical no-ff merge
  `0dd8a200fbec4ab567c00af2e4e3053541163809`이다.
- ordinal 7 `app_port_bind_failed` exact fixture는 임의 가용 포트에 listener를 만든 뒤 같은
  실제 포트를 다시 bind해 catalog 신호 `address already in use`와 exit code 1을 직접 검증한다.
  crashloop 3/3, 전체 scenario 18/18, candidate contract 87/87이다.
- 실제 patch capability가 없어 승인형 `manual_analysis`만 허용하며 cluster 전체 container port
  개방은 금지한다. gold는 운영자 검토용 정답이고 Safe PR 실행 가능성을 주장하지 않는다.
- 독립 감사가 partial container 배열의 RFC merge-patch 파괴를 차단했다. 완전한 container
  객체로 교정한 뒤 fault runnable 보존, gold=normal, rollback=fault 왕복 테스트와 재감사 PASS다.
- 첫 batch digest는 `c1917f0c…55481`. 전체 게이트는 Ruff lint/format PASS,
  import-linter 8 kept/0 broken, pytest `1951 passed, 3 skipped`; manifest 69/20이다.
- 4조건: merge-tree clean/tree `3739c7061eb0e1df88ebd687879da0af7a3661c7`, 파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, `ff3b52812`·`0dd8a200f`의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 18:18 KST — [프론트] Home Pod drill-in 강제색 시각 회귀 완료

- RED `214abde839eb8a08ceeac569b8762423802f6a19`는 Pod drill-in forced-colors 장면을
  추가하고 기존 Home 단언이 Node 프레임 전용 selector 때문에 `missing:true`로 실패하는
  회귀를 고정했다.
- GREEN `49c3504372af46e6f87de5d2976dcf4d80e171c7`은 제품 DOM·데이터를 바꾸지 않고
  현재 Node/Pod 프레임을 구분한다. 비인터랙티브 리소스 카드의 경계·텍스트 대비와 실제
  키보드 조작 대상(Node 버튼 또는 Pod의 뒤로 버튼)의 포커스 대비를 독립 검증한다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 117 files / 844 tests,
  design guard 345 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 42 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건. CLS는 Home `0.004188`, Resources `0.004167`,
  Issues `0.004202`로 모두 0.1 예산 이하다.
- 시각 증거:
  `references/ui-layer-lab/output/playwright/product-home-authenticated-pod-forced-colors.png`.
  두 커밋 모두 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 18:18 KST — [백엔드] target-agent SQLite 수명주기 테스트 착륙

- lane `codex/target-agent-sqlite-lifecycle`, 결정적 RED `4a2ef9229`, factory·close
  `d05bc826e`, 문서 `ef2757eda`, hook 격리와 feature HEAD
  `720dd55c0d00ec79b61a19bdd5682a2f553c5a96`, canonical no-ff merge
  `13c30723adaf025fd616c166a2507d03f90fef24`다.
- full agent 생성 12곳을 factory 1곳으로 수렴하고 같은 thread teardown에서 두 SQLite store를
  명시적으로 닫는다. 이후 worker-thread cyclic GC가 target destructor 오류 0건을 강제한다.
- 독립 감사가 최초 module autouse hook의 unrelated cycle 오귀속 위험을 발견했다. guard를 factory
  teardown으로 한정하고 두 정확한 destructor `ProgrammingError`만 수집하며 나머지는 기존 pytest
  hook으로 전달하도록 교정했다. unrelated `ValueError` 전달과 hook 복원 회귀 후 재감사 PASS다.
- 프로덕션 source 변경 0건. warning-strict focused 28 passed, 전체 게이트 Ruff lint/format PASS,
  import-linter 8 kept/0 broken, pytest `1953 passed, 3 skipped`; manifest 69/20이다.
- 4조건: merge-tree clean/tree `857ee57075e2260222d78350e5d25eb839579bf6`, source·파일 삭제·
  소유권 밖 변경·frozen 경로 변경 0건, `720dd55c0`·`13c30723a`의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 18:21 KST — [프론트] 감사 타임라인 직접 계약 테스트 보강

- `dc1be1694b595328a064ecc45ff34d139ea69ed9`은 완료된 VP-002 감사 타임라인 패널의
  직접 컴포넌트 테스트 3개를 추가한다. 제품 동작·API 계약·fixture runtime 유입은 0건이다.
- root/causation 표시와 payload Accordion의 객체 직렬화, cursor-backed 다음 페이지
  loading 중 버튼 disabled·기존 데이터 보존·callback 미호출, background refresh 실패 시
  오류 alert와 마지막 성공 페이지의 동시 유지를 검증한다.
- targeted Vitest PASS: 1 file / 3 tests. 전체 `npm run check` PASS:
  TypeScript·ESLint, Vitest 118 files / 847 tests, design guard 346 files,
  shadcn source audit 482 previews, Vite build 14,539 modules.
- 커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다. 동시에 나타난
  다른 작업자의 문서 변경 5건과 사용자 소유 `outputs/`는 stage·수정하지 않고 보존했다.

## 2026-07-13 18:27 KST — [프론트] 영어 인증 화면 시각 계약 보강

- `106d9dc22daa223e43c414a6c352b64864457a34`는 한국어 navigator와 저장된 `en`
  로케일을 함께 주입해 저장 설정 우선순위를 인증 화면에서 직접 검증한다.
- 제목·설명·Email·Password·Sign in·Language control이 모두 영어로 렌더되고 인증
  `main`에 한국어 UI 문자열이 남지 않는지 확인한다. 제품 runtime과 인증 API 계약은
  변경하지 않았다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 118 files / 847 tests,
  design guard 346 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 43 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건.
- 시각 증거:
  `references/ui-layer-lab/output/playwright/product-auth-unauthenticated-desktop-light-en.png`.
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 18:31 KST — [프론트] 시각 증거 manifest 정합 완료

- `9858ffc45cf2b792045d8c27145e7984cefa6367`은 visual gate가 소유하는 ignored
  `output/playwright/product-*.png`만 실행 시작 시 정리하고, 성공 시 현재 시나리오 ID와
  산출물 파일을 1:1로 대조한다. 다른 파일과 루트의 사용자 소유 `outputs/`는 건드리지 않는다.
- 변경 전에는 현재 43개 시나리오와 무관한 과거 이미지가 포함돼 60개였고, 변경 후 full
  visual gate 성공 시 정확히 43개만 남는 것을 실측했다. 누락·잔존 파일이 하나라도 있으면
  manifest mismatch로 게이트가 실패한다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 118 files / 847 tests,
  design guard 346 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 43 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건, artifact count 43.
- 커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 18:34 KST — [백엔드] crashloop 시작 권한 오류 시나리오 착륙

- lane `codex/benchmark-permission-startup`, RED `958baa368`·`be9a6da0a`, 구현
  `85dae710b`, feature HEAD `268ca859e7266ec72780b2080904b5d8ba37c247`, canonical no-ff merge
  `de9e600c7a554b12208b46b022d3ca4b29601ce1`.
- ordinal 8 `permission_denied_startup` exact fixture는 임시 startup script의 실행 bit를
  제거해 실제 POSIX EACCES, `permission denied`, exit code 1을 재현한다. 정상 0700
  경로 exit 0과 last exit code 1인 generic startup 후보와의 동점에서 구체 권한
  후보가 선택되는 현행 catalog 경계도 고정했다.
- full container JSON Merge Patch로 fault runnable → gold=normal → rollback=fault 왕복을
  검증했다. capability는 비어 있으므로 승인형 `manual_analysis`만 허용하고
  cluster-admin 권한 확대를 금지했다.
- crashloop 4/4, 전체 scenario 19/19, candidate 87/87, focused 66 passed,
  독립 재감사 2건 PASS. 전체 게이트는 Ruff lint/format PASS, import-linter
  8 kept/0 broken, pytest `1957 passed, 3 skipped`; manifest 69/20이다.
- 4조건: merge-tree clean/tree `428481b5a7d0bfcd0dc54c1a604c99fb2ca1ed34`,
  파일 삭제·소유권 밖·frozen·gateway 계약 변경 0건, `85dae710b`·`de9e600c7`의
  `origin/dev` ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 18:46 KST — [백엔드] 의존성 기동 재시도 직접 테스트 착륙

- lane `codex/config-retry-tests`, test `82c07b920`, feature HEAD
  `80edc84495468440960f0590b7ca5eb7c5232e67`, canonical no-ff merge
  `d0953f2c6566c5761c5158e5a7a14ef7a54292b5`.
- NATS/PostgreSQL 공용 `retry_dependency()`의 첫 성공, N-1 일시 실패 후 성공,
  정확한 attempt 한도·구조화 warning context, `limit=0`, task cancellation을 직접
  테스트 5개로 고정했다. 소진 경로의 마지막 sleep 횟수는 계약화하지 않았다.
- 성공 종료를 제거한 비커밋 mutation에서 2건 실패를 확인했다. 원복 후 focused
  5 passed, asyncio debug·warning-error, 10회 반복 모두 PASS이고 독립 재감사 2건도 PASS다.
- 프로덕션 source 변경 0건. 전체 게이트는 Ruff lint/format PASS, import-linter
  8 kept/0 broken, pytest `1962 passed, 3 skipped`; manifest 69/20이다.
- 4조건: merge-tree clean/tree `70599e747873268d57d70886d98618cfdffc3cd6`,
  source·파일 삭제·소유권 밖·frozen·gateway 계약 변경 0건, `80edc8449`·`d0953f2c6`의
  `origin/dev` ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 18:48 KST — [프론트] dev 정기 흡수·감사 payload 강제색 보강

- `4a8264081`은 프론트 HEAD와 `origin/dev@de9e600c7`을 no-ff로 통합했다.
  `docs/auto/night-log.md`의 단일 충돌은 프론트 7개·백엔드 6개 섹션을 시각의
  비감소 순서로 각각 한 번씩 보존했으며 conflict marker 0건이다. 통합 후
  `origin/dev` ancestor exit 0과 원격 프론트 브랜치의 HEAD 포함을 확인했다.
- RED `5dbfba927`은 실제 감사 `payload_summary`를 키보드로 펼치는 320px 강제색
  장면을 추가해 payload 목록 경계가 `0px`인 문제를 고정했다. GREEN `55670307d`는
  해당 목록에 강제색 전용 `CanvasText` 경계를 추가하고 기존 API·제품 상태 계약은
  변경하지 않았다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 118 files / 847 tests,
  design guard 346 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 44 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건. CLS는 Home `0.004188`, Resources
  `0.004167`, Issues `0.004202`로 모두 0.1 예산 이하다.
- 시각 증거:
  `references/ui-layer-lab/output/playwright/product-issues-authenticated-audit-payload-reflow-320-forced-colors.png`.
  RED/GREEN 커밋 모두 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 18:55 KST — [프론트] Issues 공용 상태 프레임 직접 테스트

- `23fa57ac5`는 `IssueSectionFrame`의 초기 loading·초기 failure·idle empty·마지막
  성공 데이터와 background failure 공존을 직접 컴포넌트 테스트 4개로 고정했다.
  제품 runtime·API·canonical 상태 계약 변경은 0건이다.
- targeted Vitest PASS: 1 file / 4 tests. 전체 `npm run check` PASS:
  TypeScript·ESLint, Vitest 119 files / 851 tests, design guard 347 files,
  shadcn source audit 482 previews, Vite build 14,539 modules.
- 커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 19:00 KST — [프론트] Resources 카탈로그 접근성 i18n 경계 보강

- RED는 Resources 카탈로그의 항목 접근성 이름이 en·ko 모두 코드 조립 문자열
  `Services 3`으로 고정된 사실을 2개 실패로 확인했다. `17be40da0`은 완전성 검사를 받는
  `resources.catalog.itemAria` 키를 en·ko 카탈로그에 추가하고, label·count의 문법과
  단위를 로케일 템플릿이 소유하게 했다.
- targeted Vitest PASS: 1 file / 2 tests. 영어 접근성 이름은
  `Services, 3 resources`, 한국어는 `Services, 3개`이며 Kubernetes 리소스 명칭과
  실제 count 값은 번역하지 않는다.
- 전체 `npm run check` PASS: TypeScript·ESLint, Vitest 119 files / 851 tests,
  design guard 347 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 19:07 KST — [프론트] Issues 한국어 실데이터 경계 시각 검증

- `4b67dd65e`는 Issues 상세의 한국어 UI 라벨과 번역 금지 대상인 Kubernetes·백엔드
  원문을 한 장면에서 함께 검증한다. 실제 상세 선택, 최근 변경, 감사 payload 펼침,
  근거·RCA·복구 계획까지 동일한 strict API fixture 흐름을 사용하며 요청 횟수와 URL도
  기존 게이트 그대로 검증한다.
- `npm run visual-product` PASS: 45 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건. CLS는 Home `0.004188`, Resources
  `0.004167`, Issues `0.004202`로 모두 0.1 예산 이하다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 119 files / 851 tests,
  design guard 347 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  시각 증거는 `references/ui-layer-lab/output/playwright/product-issues-locale-smoke-ko.png`이며,
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 19:11 KST — [백엔드] 감사 이벤트 여정 계약 착륙

- lane `codex/audit-journey-contract`, RED `1d0be030e`, 코드 `b729ee6e4`, 문서와
  feature HEAD `4432e3ca55ed0026dcc9c17a3b6a48b2555603c2`, canonical no-ff merge
  `29403eb8381280ddb75f3045118794d99b1d9eee`다.
- `AuditTimelineItem`은 required non-empty 자기 `event_id`와 직접 부모 `causation_id`를
  분리 반환한다. `journey_stage`는 exact subject 기반
  `alert/evidence/rca/recovery/command/pr/workflow/cluster/ai/notification/system/unknown`
  중 하나이며 현재 `EventSubject` 65개는 65/65 분류됐다.
- stage는 재정렬 phase가 아닌 표시 lane이다. 프론트는 서버 `(created_at, id)` 순서를 유지하고
  subject prefix를 추측하지 않는다. 미지 subject만 `unknown`이고 raw payload는 계속 비공개다.
- 프론트 폴링 인계: `audit-timeline-schemas.ts`와 `issuesEndpointContract.ts` strict item에
  `event_id`·`journey_stage`를 추가한 뒤 새 백엔드 응답과 결합 배포한다. 그 전에는 strict Zod가
  additive 필드를 거부하므로 backend/frontend 배포를 함께 진행하지 않는다.
- focused 10 passed, 전체 게이트 Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1963 passed, 3 skipped`; manifest 69/20, Bruno 새 필드 검산 PASS다.
- 4조건: merge-tree clean/tree `46b4497f79d6b400003d669aef5779e5b49a45d6`,
  삭제·소유권 밖·frozen 변경 0건, `4432e3ca5`·`29403eb83`의 `origin/dev`
  ancestor exit 0. J 배포 실행은 0건이다.

## 2026-07-13 19:12 KST — [프론트] Resources namespace 폼 직접 테스트

- `33a925f1a`는 외부 스코프가 `shop`에서 `platform`으로 변경될 때 namespace 입력만
  재동기화되고 제출 콜백은 발생하지 않는 계약을 직접 고정했다. 사용자 제출값은 trim하며
  `"  payments  "`는 `"payments"`, 공백만 있는 값은 `null`로 전달한다.
- targeted Vitest PASS: 1 file / 2 tests. 전체 `npm run check` PASS:
  TypeScript·ESLint, Vitest 120 files / 853 tests, design guard 348 files,
  shadcn source audit 482 previews, Vite build 14,539 modules. 제품 runtime 변경은 0건이며,
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 19:18 KST — [프론트] 언어 선택 접근성 문장 i18n 경계

- RED는 언어 선택기의 en·ko 접근성 이름 3개가 코드 조립 문자열에 묶여 있음을 확인했다.
  `2f11696c9`는 `shell.locale.current` 완전 문장 템플릿을 en·ko 카탈로그에 추가해
  현재 언어명·구두점·어순을 활성 로케일이 소유하도록 변경했다.
- targeted Vitest PASS: 4 files / 29 tests. `npm run visual-product` PASS:
  45 isolated scenarios, exact API request counts, unexpected feature network/WebSocket 0건.
  CLS는 Home `0.004188`, Resources `0.004167`, Issues `0.004202`다.
- 전체 `npm run check` PASS: TypeScript·ESLint, Vitest 120 files / 853 tests,
  design guard 348 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 19:24 KST — [프론트] Issues 부분 실패 dark 시각 검증

- `03038146f`는 모바일 dark 화면에서 recent changes API만 503인 경우를 추가했다.
  해당 패널은 unavailable alert로 격리되고 root cause·감사·근거·RCA·복구 계획은 계속
  렌더된다. 503 요청은 1회이며 성공 전용 목록·시각·외부 링크는 노출되지 않는다.
- `npm run visual-product` PASS: 46 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건. CLS는 Home `0.004198`, Resources
  `0.004167`, Issues `0.004202`로 모두 0.1 예산 이하다.
- 전체 `npm run check` PASS: TypeScript·ESLint, Vitest 120 files / 853 tests,
  design guard 348 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  시각 증거는 `references/ui-layer-lab/output/playwright/product-issues-authenticated-recent-changes-unavailable-mobile-dark.png`이며,
  커밋 push 후 `origin/woonyong/ui-layer-lab` ancestor exit 0을 확인했다.

## 2026-07-13 19:44 KST — [프론트] Resources 관측 요약 테스트·dev 즉시 승격

- RED/GREEN `d6447962f`는 `ResourceFactsPanel`의 Pod 관측 whitelist·Intl 단위·nullable
  생략, Node Ready 삼상태, 한국어 제품 문구와 Kubernetes 원문 경계를 직접 테스트 3개로
  고정했다. 최신 `origin/dev@ea6e2b85e`는 `0beb8c02b`에서 즉시 흡수했다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 121 files / 856 tests,
  design guard 349 files, shadcn source audit 482 previews, Vite build 14,539 modules.
  `npm run visual-product` PASS: 46 isolated scenarios, exact API request counts,
  unexpected feature network/WebSocket 0건. CLS는 Home `0.004188`, Resources
  `0.004167`, Issues `0.004202`로 모두 0.1 예산 이하다.
- D-024 4조건: merge-tree clean, 정책상 단일 `night-log` 충돌은 양측 기록을 시간순으로
  보존, 삭제·소유권 밖 최종 차이·frozen 변경 0건, lab push와 `origin/dev` 승격 후
  `0beb8c02b` ancestor exit 0을 확인했다. 이 변경은 dev SHA `0beb8c02b`로 배포 대상이다.
- 회수: clean detached worktree `3d1493f8b`, `03e90ddb6`, `dcd330481`, `ea6e2b85e`
  4개를 제거하고 prune했다. 삭제 가능한 임시 브랜치는 0개다. 고유 커밋 또는 활성
  worktree가 있는 codex 브랜치는 보존했고, stash 8개는 반영 여부가 증명되지 않아
  사유와 함께 유지했다.

## 2026-07-13 20:02 KST — [프론트] VP-010 공용 필터·Label facet 계약 요청

- 소비 정본은 `docs/spec/frontend/vp-010-unified-filter-ia.md`다. 프론트는 먼저 순수 URL
  codec·filter algebra를 구현하되, 서버 계약이 없는 option/count/result 표면은 렌더하지 않는다.
- 공통 필터는 Cluster·Namespace·Application 구조 축과 Kubernetes Label 발견 축이다.
  구조 축 내부는 OR, Label 내부는 AND, 축 사이는 AND다. `labels`는 canonical
  `key=value` equality selector 목록이며 화면 간 유지한다.
- **백엔드 요청 GAP-004:** 현재 workspace·권한·common/surface filter·snapshot을 입력으로
  받는 surface별 Label facet search가 필요하다. 응답은 stable `key=value`, 후보 Label을
  AND로 추가했을 때의 item count, selected Label 재해석 결과, opaque cursor,
  result total·unfiltered total·completeness, snapshot/revision, restricted/redacted 상태를
  제공해야 한다. facet 검색어는 목록만 좁히며 item count 조건에는 포함하지 않는다.
- `Showing N of M`의 N과 M은 동일 snapshot·권한에서 각각 전체 filter 적용 후 결과와
  같은 surface의 filter 적용 전 전체를 뜻한다. 완전성을 증명할 수 없으면 nullable/partial로
  반환해야 하며 프론트는 숫자를 추정하지 않는다. collection 전수 수집·client 집계는 금지한다.
- Label은 top-level stable row를 distinct count한다. Resources=live resource,
  Issues=event-time evidence resource, Applications=live binding resource,
  GitOps=desired manifest resource, Checks=evaluation-time target resource를 source로 한다.
  집계 행에서는 동일한 canonical object 하나가 선택 Label 전체를 가져야 하며 서로 다른
  object의 Label을 합치지 않는다.
- 요청 DTO 후보는 `LabelFacetQuery`, 응답은 `LabelFacetPage`다. 응답에는
  `LabelFacetItem`, `SelectedLabelResolution`, `FilterResultCounts`, `FilterSnapshotMeta`를
  포함하고 cursor를 workspace·authorization revision·surface·filter fingerprint·snapshot에
  묶어야 한다. exact가 아닌 0은 금지하고 partial reason code를 반환해야 한다.
- 그 밖의 요청은 GAP-001 workspace catalog/switch, GAP-002 facet catalog,
  GAP-003 Resources multi-filter/cursor/completeness, GAP-005 Issues filter,
  GAP-006 Applications·GitOps·Checks canonical list, GAP-007 registration resume/error,
  GAP-008 disconnect operation, GAP-009 Git repository wizard, GAP-010 graph snapshot이다.
  각 계약 착륙 전에는 해당 표면만 주차하고 기존 검증된 화면을 유지한다.
## 2026-07-13 20:07 KST — [백엔드] OSS Helm 로컬 설치 기반 실증·완료 판정 정정

- RED `cc367c387`, GREEN `7bb74d71f`: `charts/opsia`와 idempotent bootstrap을 추가하고
  `make demo`가 Opsia chart를 먼저 설치하도록 변경했다. fresh Kind의 Helm release
  `opsia-0.1.0`은 deployed이며 controller/PostgreSQL/agent가 각각 1/1 Ready다.
- 실측은 `kind-cluster-ready → opsia-installed → bad-rollout-observed →
  mock-rollback-pr-created → workload-normalized`를 종료 코드 0으로 통과했다. 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1968 passed, 3 skipped`다.
- 완료 판정은 정정한다. 공개 OCI chart URL은 403이고 외부 container registry `opsia` namespace 권위도 확인되지
  않았으며, 데모 후반은 mock PR와 직접 이미지 복구다. 따라서 이 hash는 설치 기반 증거이지
  BQ-016 완료 앵커가 아니다. 공개 OCI·실제 safe-pr·모드별 동일 결과가 남아 있다.

## 2026-07-13 20:12 KST — [프론트] VP-010 Label 정본 승격·회수

- 소유권 복원 `195a0f228`과 VP-010 정본 `c7aeca4c2`를 lab에 push했다. 후자의 전체
  `npm run check`는 TypeScript·ESLint, Vitest 121 files / 856 tests, design guard 349 files,
  shadcn source audit 482 previews, Vite 14,539 modules production build까지 PASS했다.
- D-024 4조건은 merge-tree clean/tree `b346f981e7bfc0caf008954fc87cfe05acd8cd9d`,
  최종 변경 `docs/auto/night-log.md`·`docs/spec/frontend/verified-pipeline-insertion-map.md`·
  `docs/spec/frontend/vp-010-unified-filter-ia.md` 3개, 삭제·backend/source/frozen 변경 0건,
  lab push 및 `origin/dev@c7aeca4c2` ancestor exit 0으로 증명했다. 이 변경은 dev SHA
  `c7aeca4c2`로 배포 대상이다.
- 회수: 이 사이클에서 만든 임시 branch/worktree/stash는 0개다. 다른 작업자의 활성 OSS
  통합 worktree `d176012cf`, `adce319ed`, 보호 대상 `demo/v1`, dirty legacy `dev` worktree는
  건드리지 않았다. stash 8개는 반영 여부가 증명되지 않아 유지했다.

## 2026-07-13 20:15 KST — [백엔드] OSS Helm 로컬 설치 기반 canonical 착륙

- merge `d86117efc8d00c09e7f75ca01f2b51cb95465a7b`, GREEN `7bb74d71f`, 문서
  `33b0fc9f4`가 모두 `origin/dev` ancestor exit 0이다. 전체 게이트는 Ruff lint/format PASS,
  import-linter 8 kept/0 broken, pytest `1968 passed, 3 skipped`다.
- merge-tree clean, 삭제 0건, gateway/RCA/AI/runtime worker 변경 0건이며 신규 dev 문서의
  누락 색인은 `1fae98ea0`에서 보완했다. lane 삭제 전 복구 hash를 이 기록으로 고정한다.

- [백엔드] lane 회수 — `codex/oss-install-gate` / `1fae98ea0` / ancestor exit 0.
  로컬 branch와 worktree를 제거했고 원격 branch는 존재하지 않았다. 실증 Kind cluster도
  삭제했으며 다른 작업자의 detached AWS worktree와 보호 branch는 건드리지 않았다.

## 2026-07-13 20:20 KST — [백엔드] 이벤트 버스 clean-run 결과 동등성 실측

- RED `0b05061b8`, GREEN `82a7f29f2`: `make event-bus-equivalence`가 격리된 실제
  `nats:2.10-alpine` JetStream과 `InMemoryEventBus`에 동일한 publish→NAK→redelivery→
  child publish→ACK 흐름을 실행한다.
- 양 모드 모두 payload, correlation, causation, workspace, redelivery 원문 보존이 true이고
  결과 JSON의 `equivalent`가 true였다. unit gate 2 passed이며 전체 게이트는 착륙 직전에
  최신 dev 기준으로 다시 실행한다.
- 범위는 clean-run outcome이다. in-process mode는 controller process crash에서 broker
  durability를 제공하지 않으므로 JetStream과 내구성까지 동등하다고 표현하지 않는다.

## 2026-07-13 20:25 KST — [백엔드] 이벤트 버스 결과 동등성 canonical 착륙

- merge `66e8c08e688658e3c41034b6fd8c7e5068edf084`, GREEN `82a7f29f2`, 문서
  `02773227c`가 모두 `origin/dev` ancestor exit 0이다. 전체 게이트는 Ruff lint/format PASS,
  import-linter 8 kept/0 broken, pytest `1970 passed, 3 skipped`; 실제 JetStream 결과
  `equivalent=true`다.
- merge-tree clean, 삭제 0건, frozen 경로 변경 0건이다. lane 삭제 전 복구 hash를 기록했다.

- [백엔드] lane 회수 — `codex/event-bus-mode-equivalence` / `02773227c` /
  ancestor exit 0. 로컬 branch와 worktree를 제거했고 원격 branch는 존재하지 않았다.

## 2026-07-13 20:37 KST — [프론트] VP-010 통합 필터 URL engine GREEN

- RED는 부재 모듈 실패로 시작했고, canonical URL round-trip·legacy `cluster`/`kind`
  dual-read·같은 구조 축 OR·Label AND·화면 이동 시 공통 축 보존·상세 query 제거를
  `a61e01990`에서 GREEN으로 닫았다. 유효하지만 아직 서버가 해석하지 못한 ID와 Label은
  URL에서 보존하며, collection 전수 수집·client count/predicate는 구현하지 않았다.
- 독립 감사에서 Kubernetes Label key DNS prefix의 dot segment 63자 제한 누락을 발견했다.
  64자 segment가 통과하는 RED를 재현한 뒤 `99ebe7850`에서 63 허용/64 거부 및 prefix 전체
  253 허용/254 거부 경계를 분리했다. targeted Vitest는 11/11 PASS다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 122 files / 867 tests, design guard
  354 files, shadcn source audit 482 previews, Vite production build 14,539 modules다.
  최신 `origin/dev@d75f5fdf7`는 통합 commit `954957485`에서 충돌 없이 흡수했다.
- GAP-004의 server Label facet/count/snapshot/completeness 계약 전에는 `[Labels]` popover,
  후보 개수와 `Showing N of M`을 렌더하지 않는다. 다음 안전 단위는 URL을 자동 변경하지 않는
  side-effect-free filter provider이며, legacy selector의 자동 선택 제거와 함께 전환한다.

## 2026-07-13 20:41 KST — [프론트] VP-010 filter engine 승격·lane 회수

- D-024 4조건은 `npm run check` PASS, 최신 `origin/dev@d75f5fdf7`의 ancestor exit 0,
  정책 밖 충돌 0건, 최종 차이 7개 파일·삭제 0건·backend/source/frozen 변경 0건으로
  확인했다. lab과 dev는 동일 SHA `2ee8f0e74`로 fast-forward 되었고 ancestor exit 0이다.
  이 변경은 dev SHA `2ee8f0e74`로 배포 대상이다.
- 회수: 이 통합에만 만든 `codex/vp010-filter-sync-20260713` / `2ee8f0e74`와
  `/private/tmp/opsia-vp010-filter-sync`는 이 기록 착륙 직후 제거하고 `worktree prune`한다.
  신규 stash는 0개다. 기존 stash 8개는 반영 여부가 증명되지 않아 유지하며, 다른 작업자의
  `codex/oss-safe-pr-demo`와 보호 worktree·branch는 건드리지 않는다.

## 2026-07-13 21:02 KST — [프론트] VP-010 passive filter Provider GREEN

- RED는 부재 Provider와 `clear-labels` history intent로 시작했다. GREEN `168b26e50`은
  URL을 유일한 권위로 읽는 `UnifiedFilterProvider`를 추가했다. mount-time effect·자동 write·
  API·로컬 복제 state는 0건이며, 명시적 canonicalize와 atomic updater만 push/replace를 쓴다.
- StrictMode 무기록, legacy·unresolved 보존, explicit replace migration, chip push, typing replace,
  detail/path/hash 보존, history back/forward 권위, cross-surface detail 제거, no-op 무기록,
  Provider 밖 hook 실패를 검증했다. 독립 리뷰가 찾은 mutable updater 유실도 현재 URL을 updater
  호출 전에 직렬화하는 회귀 테스트로 닫았다.
- Resources legacy `full=1|0`은 canonical boolean으로 dual-read하고, 정의되지 않은 boolean/view는
  structured invalid 값으로 격리한다. focused tests 19/19, 전체 `npm run check`는 TypeScript·ESLint,
  Vitest 124 files / 875 tests, design guard 358 files, shadcn 482 previews, Vite 14,539 modules PASS다.
- production mount는 의도적으로 보류한다. 기존 ClusterScope의 첫 Cluster 자동 선택과 셸·shortcut·
  fallback의 legacy navigation이 canonical query를 지우므로, 다음 단위에서 이 writer들을 한 번에
  전환하는 RED 통합 테스트가 선행되어야 한다. GAP-004 전 Label UI/count 미렌더는 유지한다.

## 2026-07-13 21:10 KST — [프론트] VP-010 passive filter Provider 승격 준비

- 공동 lab 변경 `0b5db31c8`을 merge `4fed11a13`에서 충돌 없이 보존했다. 최신
  `origin/dev@b4f0d72e7`와 `origin/woonyong/ui-layer-lab@0b5db31c8`은 모두 merge HEAD의
  ancestor exit 0이며, 삭제·`frontend/**`·backend source·frozen client 변경은 0건이다.
- merge HEAD에서 `npm run check` PASS: TypeScript·ESLint, Vitest 124 files / 875 tests,
  design guard 358 files, shadcn source audit 482 previews, Vite production build 14,539 modules다.
  `npm run visual-product`도 46 scenarios PASS이며 초기 CLS는 Home 0.004188, Resources
  0.004167, Issues 0.004202로 모두 0.1 미만이다.
- 이 기록을 포함한 최종 commit을 lab과 dev에 같은 SHA로 fast-forward한 뒤 ancestor를 재증명한다.
  승격 직후 이 단위 전용 `codex/vp010-filter-provider-20260713`과
  `/private/tmp/opsia-vp010-filter-provider`를 제거하고 prune한다. 신규 stash는 0개이며,
  기존 8개와 다른 작업자의 branch·worktree는 증명 없이 변경하지 않는다.

## 2026-07-13 21:11 KST — [백엔드] OSS Safe PR 리뷰·GitOps 소유권 실측

- RED 10개 커밋 뒤 GREEN `9b107d8e9`은 mock PR·직접 이미지 교체를 제거하고 실제 API →
  outbox → in-process workers → 기존 `GithubScmProvider`/`scm-worker` → `safe_pr.created` →
  분리 reviewer merge → merge SHA manifest 조회 → 외부 GitOps actor 적용 흐름을 완주했다.
- 보안 감사에서 `.git/config` write를 통한 명령 실행 가능성을 재현해 모든 `.git` component를
  차단했다. writer/admin/reviewer token은 상호분리하고 writer의 main reset/commit/merge를
  401로 거부한다. merge는 검토한 base/head SHA 경쟁 변경을 409로 거부한다.
- 최종 Kind 실측은 bad `89b931cb5865582b3084572240e4cf3a7825fa9d`, merge
  `9a66b083b37416ca2d61ff71ccd7b18b9b67f1d4`, workload Ready 1·good image였고 spec
  managedFields Apply writer는 `opsia-demo-gitops` 하나였다. credential artifact는 0건,
  표적 테스트 21건·Ruff lint/format·shell syntax가 통과했다.
- 범위는 local SCM fixture와 외부 GitOps actor 시뮬레이션이다. hosted forge, 실제 Argo
  continuous reconcile, public OCI chart/controller/console은 미증명이라 BQ-016은
  `in_progress`다. 전체 게이트와 D-024 착륙 증거는 최신 dev 재검증 뒤 별도 기록한다.

## 2026-07-13 21:16 KST — [백엔드] OSS Safe PR 로컬 실증 canonical 착륙

- canonical merge `15379d94f`, GREEN `9b107d8e9`, 착륙 전 lane HEAD `16aad904c`는
  모두 `origin/dev` ancestor exit 0이다. merge tree `51c5f6f56c2dac5632a7f106c9dc4b908c3ec12d`는
  사전 계산과 merge 결과가 같았다.
- 전체 게이트는 Ruff lint/format PASS(523 files), import-linter 8 kept/0 broken,
  pytest `1985 passed, 3 skipped`; manifest management 69/target 20, Helm lint PASS다.
  최종 차이는 13파일, 삭제·gateway/RCA/AI/runtime worker 변경 0건이다.
- BQ-016은 공개 OCI·console/access·hosted SCM·실제 Argo continuous reconcile이 남아
  `in_progress`를 유지한다. lane 회수 전 복구 hash는 `16aad904c`로 고정했다.
- [백엔드] lane 회수 — `codex/oss-safe-pr-demo` / `16aad904c` / ancestor exit 0.
  feature worktree와 로컬 branch를 `-d`로 제거했고 원격 branch는 없었다. 실증 Kind
  `opsia-demo` cluster도 삭제했으며 다른 활성 lane·보호 worktree는 건드리지 않았다.

## 2026-07-13 21:57 KST — [백엔드] OSS 접속 계약 로컬 실증

- RED `8051342a5`, GREEN `ae9bc8d63`·`e480b3246`. UI/API/agent는 Service 80의 동일
  origin을 쓰고 metrics 9090·PostgreSQL 5432는 내부 Service로 분리했다.
- access 5모드, server-authoritative external URL, self-only 제한, bootstrap Secret NOTES,
  엄격 URL/port 검증, external TLS 종단 확인, same-origin CSP를 검증했다. Helm 표적 테스트
  18건과 lint가 통과했다.
- fresh Kind `make demo`는 `opsia-installed` → `bad-rollout-observed` → `safe-pr-created` →
  `review-merged` → `gitops-sync-applied` → `workload-normalized` 순서로 exit 0이었다.
  bad revision `6ee9084dfe931f7c70c712b8fc95c32bbfd57ee7`, merge revision
  `39dc05478ddc1ad997296939c654d35485eee945`를 관측했다.
- 공개 `oci://ghcr.io/opsia/charts/opsia`와 controller/console package는 anonymous pull 403이다.
  GHCR chart publish와 package visibility 변경 후 fresh Kind 공개 명령 재실증이 필요하다.
- AWS live 상태는 `docs/auto/deploy-status.md`에 digest를 권위값으로 기록했다. secret 값과
  확인되지 않은 로그인 성공은 문서에 노출하거나 주장하지 않았다.
- 현재는 canonical 착륙 전이므로 완료 앵커를 기록하지 않았다.

## 2026-07-13 22:00 KST — [백엔드] OSS 접속 계약 canonical 착륙

- feature `cf69ffb5b`, canonical merge `e8fc3c878`; 둘 다 `origin/dev` ancestor exit 0이다.
- 전체 게이트는 Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `2006 passed, 3 skipped`; manifest management 69/target 20, Helm lint PASS다.
- merge-tree `9853698702e72a1b384d3ae6b68c28447905caf0`가 실제 merge tree와 같고 파일 삭제,
  RCA/AI/runtime worker 변경, 정책 밖 충돌은 0건이다.
- BQ-021 접속 계약은 착륙했으며 gateway 계약 lock을 해제했다. 공개 OCI 403은 BQ-016의
  완료 블로커로 유지하고 GHCR publish·anonymous pull 허용 뒤 fresh Kind에서 재실증한다.
- 계약 앵커: `ManagementAccessResponse + Helm access modes` / `cf69ffb5b` / `[green]`.
- [백엔드] lane 회수 — `codex/oss-access-contract` / `cf69ffb5b` / ancestor exit 0.

## 2026-07-13 22:02 KST — [백엔드] Resources 필터 코어 claim

- `origin/dev@b8bc27988`에서 GAP-002/003/004만 claim하고 gateway 계약 lock을 획득했다.
- 기존 `/clusters/{cluster_id}/inventory/resources`는 단일 cluster·limit 방식이라 그대로 보존한다.
  새 workspace route만 추가해 기존 소비자 응답을 바꾸지 않는다.
- 빈 권한은 빈 set, 같은 축 OR·축 간 AND·Label 간 AND, 서버 count, snapshot-bound cursor,
  restricted/partial 정직성을 RED에서 먼저 고정한다.

## 2026-07-13 22:14 KST — [프론트] VP-010 canonical writer cutover GREEN

- GREEN `d2f7448b6`에서 `UnifiedFilterProvider`를 production composition 최상위 권위로
  mount하고 Cluster scope, shell link, shortcut, Home, Resources writer를 canonical URL로
  일괄 전환했다. mount/catalog 응답 자동 선택·자동 rewrite는 0건이다.
- 같은 task의 filter/detail mutation은 commit된 URL과 handler-local 최신 값을 직렬화한다.
  Resources detail은 self-contained `v1` identity로 list Cluster/type filter와 분리했으며,
  cross-Cluster forbidden은 detail에만 실패로 기록해 선택된 list를 blank하지 않는다.
- backend가 아직 증명하지 않은 multi-cluster/namespace, Application, Label, health, server q,
  graph list projection은 API 요청 없이 fail-closed한다. filter control은 남겨 사용자가 스스로
  해제할 수 있고, explicit detail read는 차단된 list projection과 독립적으로 동작한다.
- `npm run check` PASS: TypeScript·ESLint, Vitest 126 files / 907 tests, design guard 360 files,
  shadcn source audit 482 previews, Vite production build 14,543 modules다.
- GAP-001~010 착륙 앵커를 재확인했으나 0건이다. 다음 순서는 `002/003/004 → 010 → 005/006
  → 007/008 → 009 → 001`이며, 대기 중 Topology menu 제거·Resources graph shell, 공용 filter
  bar shell, wizard progressive shell, a11y/i18n/visual을 계약 데이터 없이 준비한다.

## 2026-07-13 22:28 KST — [프론트] VP-010 writer cutover 승격 게이트

- source HEAD `040f72b2c`는 최신 `origin/dev@b8bc27988`과
  `origin/woonyong/ui-layer-lab@561ce4e67`을 모두 조상으로 포함한다. dev 병합의 유일한
  충돌은 append-only `night-log.md`였고, 양쪽 기록을 시각 비감소 순서로 한 번씩 보존했다.
  lab의 고유 patch는 `--cherry-pick` 기준 0건이라 현재 트리를 보존한 이력 병합으로 연결했다.
- canonical URL로 전환되지 않았던 visual gate와 ProductShell visual harness를 `040f72b2c`에서
  교정했다. legacy `cluster`·detail identity 기대를 `clusters`·self-contained `v1` identity로
  바꾸고 shell harness에도 production과 같은 `UnifiedFilterProvider`를 배선했다.
- 최종 `npm run check` PASS: TypeScript·ESLint, Vitest 126 files / 907 tests,
  design guard 360 files, shadcn source audit 482 previews, Vite build 14,543 modules다.
  `npm run visual-product`도 46 scenarios, exact API request counts, unexpected network/WebSocket
  0건으로 PASS했다. CLS는 Home 0.004188, Resources 0.004167, Issues 0.004202다.
- 이 기록 커밋까지 동일 HEAD로 lab과 dev에 fast-forward 승격하고, 배포 대상 SHA를 재기록한다.
  승격 후 lane `codex/vp010-filter-cutover-20260713`과 worktree
  `/private/tmp/opsia-vp010-filter-cutover`를 같은 사이클에서 회수한다. 신규 stash는 0건이며
  기존 8개와 사람 소유 branch·worktree는 변경하지 않는다.

## 2026-07-13 22:57 KST — [프론트] VP-010 Resources Graph shell GREEN

- GREEN `f944e4c5b`는 Topology 메뉴·route·shortcut·i18n surface를 제거하고 Resources의
  Table/Graph 전환을 canonical `resources.view` URL history로 연결했다. 전환기는 catalog/list
  경계 밖의 페이지 header에 있어 미선택·다중·unknown Cluster와 403에서도 복구 가능하다.
- GAP-010 미착륙 상태에서 Graph는 Cluster 선택 catalog 외의 inventory catalog/list/graph API와
  TopologyCanvas·WebSocket을 모두 0으로 유지한다. Table in-flight 요청은 Graph 전환 때 abort하며,
  늦은 응답도 Graph DOM에 도달하지 않는다. 브라우저 back/forward는 Table/Graph를 복원한다.
- 전체 `npm run check` PASS: TypeScript·ESLint, Vitest 127 files / 911 tests,
  design guard 363 files, shadcn source audit 482 previews, Vite build 14,546 modules다.
  `npm run visual-product` PASS: 47 isolated scenarios, exact API requests, unexpected feature
  network/WebSocket 0건. 신규 증거는
  `references/ui-layer-lab/output/playwright/product-resources-graph-shell-en-forced-colors.png`이며
  Graph `aria-pressed`, forced-colors, reduced-motion, exact URL과 graph data 미렌더를 검증한다.
- CLS는 Home `0.004188`, Resources `0.004167`, Issues `0.004202`로 모두 0.1 미만이다.
  GAP-002/003/004/010 완료 앵커는 여전히 0건이며 graph snapshot 착륙 전 data 배선은 주차한다.

## 2026-07-13 22:57 KST — [백엔드] Resources 필터 코어 canonical 착륙

- RED `22c9e5d0a`, GREEN `cbf94623c`, 교정 `87c0606e0`, canonical merge
  `d5517ec14`. `RESOURCES_FILTER_FACETS_PATH`, `FILTERED_RESOURCES_PATH`,
  `RESOURCE_LABEL_FACETS_PATH` 세 계약 앵커가 `origin/dev`에 착륙했고 gateway lock을 해제했다.
- workspace fail-closed 인가, same-axis OR/cross-axis AND/Label AND, 동일 snapshot N/M,
  selector별 resolution, HMAC cursor, partial completeness를 제공한다. Label facet은 현재
  Resources만 지원하며 나머지 surface는 후속 투영 전까지 fail-closed다.
- 실 PostgreSQL에서 migration online upgrade/downgrade/upgrade, `pg_trgm`·GIN·keyset index,
  다중 cluster N/M, scoped evidence 비삭제, 과거 cursor 불변을 확인했다. namespace/label 범위
  evidence는 authoritative sweep가 아니므로 completeness를 partial로 유지한다.
- 전체 게이트 `2051 passed, 3 skipped`, Ruff/import contract 8/8, manifest 69/20,
  Helm lint·shell syntax PASS. merge-tree `e0230e10dc598e5f2d6cebf3e6c0579994d13307`,
  삭제·frozen 변경 0건, code/merge 모두 `origin/dev` ancestor exit 0이다.
- 계약 앵커: `RESOURCES_FILTER_FACETS_PATH` / `87c0606e0` / `[green]`.
- 계약 앵커: `FILTERED_RESOURCES_PATH` / `87c0606e0` / `[green]`.
- 계약 앵커: `RESOURCE_LABEL_FACETS_PATH` / `87c0606e0` / `[green]`.
- [백엔드] lane 회수 — `codex/resources-filter-contract` / `87c0606e0` /
  `origin/dev` ancestor exit 0; 로컬 branch와 worktree를 같은 사이클에서 삭제했다.

## 2026-07-13 23:02 KST — [백엔드] Resources 그래프 계약 claim

- `origin/dev@e47b0e984`에서 single-cluster graph snapshot만 claim하고 gateway 계약 lock을
  획득했다. Resources 필터와 같은 권한·revision을 사용하며 cross-cluster edge는 만들지 않는다.
- node는 stable inventory identity와 drill-down target을, edge는 실제 owner reference·node
  assignment·selector 등 보존된 근거만 반환한다. raw payload와 이름 유사도 추론은 금지한다.
- budget/source/relation이 불완전하면 partial reason을 반환하고, 검증되지 않은 관계를 exact로
  가장하지 않는 RED를 먼저 고정한다.

## 2026-07-13 23:12 KST — [프론트] Resources Graph shell 승격 준비

- Graph GREEN `f944e4c5b`와 문서 `52df0c2f2`를 최신 `origin/dev@d6cee2813`에 병합했다.
  `RESOURCES_FILTER_FACETS_PATH`, `FILTERED_RESOURCES_PATH`, `RESOURCE_LABEL_FACETS_PATH`의
  backend GREEN `87c0606e0`이 ancestor임을 확인했고, 다음 사이클에서 API·Zod·adapter를
  RED부터 연결한다. GAP-010 graph snapshot 전 data·TopologyCanvas·WebSocket 미렌더는 유지한다.
- 원격 lab 고유 `7d6193009`는 merge ancestry로 보존하되 정책 밖 `docs/backend-f-progress.md`와
  `docs/spec/oss-profile.md`, 기존 자동 로그 문구의 tree 변경은 `093b7d42b`에서 최신 dev 내용으로
  복구했다. 삭제 파일은 Topology 전용 frontend surface뿐이며 backend source 수동 변경은 0건이다.
- 병합 트리에서 `npm run check` PASS: TypeScript·ESLint, Vitest 127 files / 911 tests,
  design guard 363 files, shadcn source audit 482 previews, Vite build 14,546 modules다.
  `npm run visual-product`도 47 scenarios, exact API requests, unexpected feature network/WebSocket
  0건으로 PASS했다. CLS는 Home `0.004188`, Resources `0.004177`, Issues `0.004202`다.
- 이 기록을 포함한 동일 HEAD를 lab과 dev에 non-force push하고 두 ref의 동일 SHA와 ancestor
  exit 0을 재확인한다. 이후 lane `codex/vp010-graph-shell-20260713`과 worktree를 같은 사이클에서
  회수하며, 신규 stash 0건과 기존 미증명 stash 유지 사유를 기록한다.

## 2026-07-13 23:29 KST — [백엔드] Resources 그래프 계약 canonical 착륙

- RED `86ed85a06`·`721604356`, GREEN `914d34ff6`, canonical merge `95ff11cc6`.
  `RESOURCES_GRAPH_PATH`와 `ResourceGraphSnapshotResponse`가 `origin/dev`에 착륙했고 gateway
  계약 lock을 해제했다. code/merge 모두 ancestor exit 0이다.
- 단일 authorized cluster와 session workspace만 조회한다. table의 global snapshot revision을
  pin할 수 있고 선택 cluster의 실제 cut은 `cluster_projection_revision`으로 분리한다.
  owner UID·node assignment·전체 Kubernetes selector·service-name label 근거만 edge로 만든다.
- compact node/edge, active/historical state, N/M, node/edge budget, partial reason을 제공한다.
  raw labels/annotations/summary, cross-cluster/name-prefix 추론은 0건이다. Bruno는
  `docs/api/17-resources-filter/04-resource-graph.bru`다.
- 전체 게이트 `2064 passed, 3 skipped`, Ruff/import contract 8/8, manifest 69/20,
  merge-tree `9a055ca263e9c215800531d239d1378037054fac`, 삭제·frozen·프론트 소유 변경 0건.
- 계약 앵커: `RESOURCES_GRAPH_PATH + ResourceGraphSnapshotResponse` / `914d34ff6` / `[green]`.
