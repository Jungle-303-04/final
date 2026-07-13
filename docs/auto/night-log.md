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

[2026-07-13 06:31:17 KST] [프론트] C in_progress — APIQ-012 receipt claim; APIQ-027 앵커 전 getCommandStatus 소비는 보류

[2026-07-13 06:44 KST] [프론트] APIQ-012 receipt 완료 — `submitCommand` nullable ID 계약 `d763ab682`; C는 APIQ-027 선행 앵커 대기

[2026-07-13 06:46 KST] [문서] APIQ-012 완료 문서 재검증 — `commands.test.ts` targeted PASS, root `make check` PASS(838 passed, 3 skipped + manifest-check). 별도 UI `npm run check` 재실행은 `apiBoundary` timeout과 `ResourcesPage` 표 조회 실패로 FAIL이므로 full UI PASS로 기록하지 않는다.

[2026-07-13 06:57 KST] [프론트] C 후속 full gate 재검증 PASS — TypeScript·ESLint, 94 files / 663 tests, design guard 275, shadcn 482, production build 전부 통과. 앞선 두 실패는 재현·격리 후 안정화 트랙으로 분리했다.

[2026-07-13 06:57 KST] [프론트] D in_progress — APIQ-027 command polling 계약 claim; API-owned fixture와 failure·terminal·abort·barrel 회귀를 앵커 전에 보강한다.

[2026-07-13 07:30 KST] [프론트] APIQ-027 완료 — `submitPrometheusQuery`, `getCommandStatus`, `pollCommand`, `runPrometheusQuery` 앵커 `b92d081eb`; full gate PASS(TypeScript·ESLint, 95 files / 674 tests, design guard 278, shadcn 482, production build).

[2026-07-13 08:13 KST] [프론트] API queue batch 앵커 동기화 — `56c689e61`(Applications/GitOps approval/workload action), `c875efb1f`(RCA/evidence/recovery), `004f23d52`(usage/preset/telemetry) 원격 ancestor 확인. targeted API contract 10 files / 70 tests PASS, docs/Bruno 17 tests PASS, manifest-check PASS. untracked feature draft가 남아 있어 full UI gate는 이번 heartbeat 완료 증거로 쓰지 않음.
[2026-07-13 08:17 KST] [프론트] API queue batch full gate 재검증 PASS — Metrics 화면 draft 임시 격리 후 TypeScript·ESLint, 97 files / 710 tests, design guard 286, shadcn 482, production build 통과. 18개 batch anchor의 전체 gate 근거 확정.
[2026-07-13 08:28 KST] [프론트] 테마 첫 페인트 검증 PASS — 저장 테마와 시스템 테마 반대 조건에서 light/dark 각 5회 새로고침, 최초 5프레임의 클래스·colorScheme·불투명 배경 일치, 플래시 0.
[2026-07-13 09:44 KST] [프론트-D] APIQ-019 in_progress — AI 대화 4함수 strict envelope·open JsonMap·AbortSignal·possibly-sent POST 단일 호출 계약 claim. 코드 커밋과 완료 앵커 전 화면 소비 0 유지.
[2026-07-13 09:47 KST] [프론트] A2 우선 전환 — APIQ-019 코드는 미커밋 보존하고 claim을 requested로 반환. 최신 origin/dev 충돌 표와 GO-REQUEST 갱신 전까지 D단계·화면 소비 HOLD.

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
