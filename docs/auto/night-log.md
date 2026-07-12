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
