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

[2026-07-13 06:25 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[crashloop]` 해소 — 판정: 규칙은 옳고 기대가 낡음(`app_port_bind_failed`, `permission_denied_startup`은 독립 signal/evidence/checks를 가진 정식 CrashLoop 후보이며 기존 순서 보존) / 커밋 `67ce9d700` / 전체 게이트: pytest `1641 passed, 3 skipped, 5 baseline failed`(해소 node 제외), Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 `domains.rca.router -> services` 1계약만 실패

[2026-07-13 06:28 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[imagepull]` 해소 — 판정: 규칙은 옳고 기대가 낡음(`registry_rate_limited`, `image_platform_mismatch`는 서로 다른 registry 신호를 요구하는 정식 후보이며 기존 3후보 순서 보존) / 커밋 `841617f41` / 전체 게이트: pytest `1642 passed, 3 skipped, 4 baseline failed`(중간에 범위 밖 janitor timing flake 1회는 단독 3/3 PASS 후 전체 재실행 PASS), Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:30 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[oom]` 해소 — 판정: 규칙은 옳고 기대가 낡음(OOM snapshot은 `CrashLoopBackOff` 룰로 수렴하므로 동일한 7후보 전체를 계획하며 OOM 판별은 `oom_evidence` signal 평가 단계가 담당) / 커밋 `6cfa9c6aa` / 전체 게이트: pytest `1643 passed, 3 skipped, 3 baseline failed`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:32 KST] [RCA] `test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[sched-fail]` 해소 — 판정: 규칙은 옳고 기대가 낡음(`node_selector_mismatch`, `untolerated_taint`는 포괄 affinity/taint 후보를 실제 이벤트·metadata 신호로 세분화한 정식 후보이며 `pvc_pending` 앞 카탈로그 순서 보존) / 커밋 `5dcb2f633` / 전체 게이트: pytest `1644 passed, 3 skipped, 2 baseline failed`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:33 KST] [RCA] `test_crashloop_flow_auto_selects_restart_and_queues_command` 해소 — 판정: 규칙은 옳고 기대가 낡음(계획 후보는 7개로 확장됐지만 기존 우선순위 `oom_killed`, `bad_image_rollout`와 OOM 자동 선택·restart 명령 계약은 그대로 통과) / 커밋 `da90c79a7` / 전체 게이트: pytest `1645 passed, 3 skipped, 1 baseline failed`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:40 KST] [RCA] `test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts` 해소 — 판정: 기대가 옳고 검증 규칙이 버그(scenario는 provider `kubernetes`를 선언하고 candidate는 그 하위 named evidence `kubernetes:cluster_resource_state`를 요구하므로 provider 계층으로 비교해야 함; 누락 provider 거부 테스트 유지) / 커밋 `58d9b1ba0` / 전체 게이트: pytest `1646 passed, 3 skipped`, Ruff check PASS·format 기존 2파일만 실패, import-linter 기존 1계약만 실패

[2026-07-13 06:44 KST] [RCA] Ruff format `tests/test_bruno_collection.py`, `tests/test_rca_rule_catalog.py` 해소 — 판정: formatter canonical output과 불일치한 순수 표현 형식(문자열 quote·줄바꿈·comprehension 배치)이며 assertion 의미 불변 / 커밋 `5a9e46a21` / 전체 게이트: pytest `1646 passed, 3 skipped`, Ruff check PASS·format `470 files already formatted`, import-linter 기존 1계약만 실패

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

[2026-07-13 06:47 KST] [백엔드] C0 in_progress — 신뢰 workspace 봉투·outbox 보존·audit 귀속·가역 마이그레이션 사전 검증

[2026-07-13 06:54 KST] [백엔드] BLOCKED P — 사유: 현재 `RecoveryActionSelectedBody`와 순수 `RecoveryDispatcher`에는 desired manifest·승인 snapshot·source digest/base SHA·repository/binding/workflow 권위 컨텍스트가 없어 실제 patch 6종은 모두 `unsupported`가 됨 / 재현: `safe_pr_patches()` 입력은 선택된 action params뿐이고 dispatcher DB 의존성 0건 / 질문: recovery plan hydration 계약을 선행할지, dispatch 단계의 repository 조회 포트를 승인할지 / 재개 조건: 정적 builtin params나 payload 위조 없이 GitOps 권위 컨텍스트를 전달하는 단일 소스 계약 확정

- RCA 작업열 충돌 확인: R-track과 `src/services/ai/agent/recovery/{dispatch,builtin,catalog}.py` blob 동일, recovery 경로 변경 0건.
- 기각한 우회: 정적 카탈로그에 manifest/snapshot 삽입, markdown fallback 유지, 권위 입력 없는 합성 patch.

[2026-07-13 07:02 KST] [백엔드] BLOCKED R merge step 2 — merge 진행 중(`MERGE_HEAD=82028604d`), 충돌 잔여·night-log 마커 0건 확인 후 허용된 `night-log.md`·`night-directives.md` 외 예상 밖 unstaged `docs/auto/backend-pipeline.md` 발견(D-011 축소 프로토콜 3줄) / 지시대로 임의 add·commit·push 0건 / 질문: 이 기존 unstaged 변경을 merge commit에 포함할지 별도 처리할지 확인 필요 / 재개 조건: `backend-pipeline.md`의 이번 merge 포함 여부 명시

[2026-07-13 07:07 KST] [백엔드] R merge 완결·push — `257f91846`, `82028604d` ancestor exit 0, 사람 위임 GO [R] ([D-012])

[2026-07-13 07:14 KST] [백엔드] [D-012] 후속 정리 완료 — §1.4 baseline 공집합·전체-그린 복귀 / R worktree·로컬 lane 안전 회수(`branch -d`) / release blocker에서 RCA baseline 제거 / P read port 설계로 in_progress 재개
