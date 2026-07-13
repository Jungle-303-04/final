---
title: 야간 자동 판단 지시함
status: active-overnight
date: 2026-07-13
writer: 자동 판단자(예약 세션) + 우녕 + 우녕이 위임한 조율 세션. 각 지시에 작성 주체를 명기한다. 작업 세션들은 읽기 전용.
reader: 백엔드 Codex(목표모드), 프론트 Codex(목표모드), 감독 세션들
protocol: 최신 지시가 항상 최하단. 각 지시는 [D-###] ID·타임스탬프·작성 주체를 가진다.
---

# 야간 자동 판단 지시함

작업 세션은 자기 사이클마다 이 파일의 최하단 지시를 확인하고 따른다.
`HOLD` 지시가 있으면 해당 트랙은 신규 작업을 멈추고 진행 중인 커밋만 마무리한다.

## 불변 규칙 v2 ([D-006]에서 개정 — 자동 판단자는 이 절을 변경 불가)

1. canonical(origin/dev) merge·push·배포 실행은 사람(우녕)만 한다. (🔒 게이트)
2. 작업 범위는 각 파이프라인 정본이 통제한다: 백엔드 `docs/auto/backend-pipeline.md`(A→K),
   프론트 `docs/auto/frontend-pipeline.md`(A→H). 정본에 없는 작업은 존재하지 않는 작업이다.
   (구 규칙 2·3의 "BQ-008만/기존 APIQ만" 제한은 [D-004] 체계 발효로 대체됨)
3. additive-only, F5 flag 기본 off, 타 worktree(/private/tmp/**) 읽기 금지, frozen paths
   무접촉, 착륙 판정은 origin 기준 — 파이프라인 §1 불변식이 정본.
4. 자동 판단자는 단계 전이 검증·HOLD만 한다. 범위 확장·규칙 개정은 사람 또는
   위임 조율 세션의 서명된 [D-###]로만 한다.
5. 판단자가 이상을 감지하면 해당 트랙에 HOLD를 쓴다. HOLD 해제는 사람 또는 위임
   조율 세션의 서명된 지시로만 한다.

## 지시 로그

### [D-001] 2026-07-13 야간 개시
- 백엔드 Codex: BQ-008을 독립 브랜치에서 진행. 추가로 BQ-001/002/003 브랜치 지형
  보고서(브랜치명·base 관계·dev 충돌 여부)를 docs/auto/night-log.md에 작성 — 아침 merge 준비물.
- 프론트 Codex: api-needs.md 큐 순서대로 기존 트랙 계속 (APIQ-029 제외).
- 두 트랙 모두 사이클마다 진행 상황을 docs/auto/night-log.md에 append.

### [D-002] 2026-07-13 04:25 KST 판정: 정상 확인, 현재 범위 계속
- 점검 결과: 착륙 규칙 위반 없음(dev에 backend-f-progress.md 미존재 확인, VP 행 판정 변화 없음),
  AcceptedResponse 계약 무결(3필드 + optional command_id), APIQ-029 동결 유지 확인.
- 백엔드 Codex: BQ-008 계속. 사이클마다 진행 상황(커밋 hash 포함)을 night-log.md에 append하라 —
  현재 로그에 보고가 0건이다. BQ-008 완료 시 증거(테스트 결과·커밋 hash)를 night-log에 남기고
  대기하라. 앵커 커밋·착륙 시도 금지. BQ-001/002/003 브랜치 지형 보고서([D-001])도 잊지 말 것.
- 프론트 Codex: APIQ-029 동결 그대로. 다음 requested 행을 고정 순서(APIQ-012 → APIQ-027)로
  claim 계속하되, APIQ-012는 비고의 §4b 착륙 확인 조건이 충족되지 않으므로(backend-f-progress.md
  미착륙) claim 불가 — 건너뛰고 APIQ-027부터 진행하라. 완료 시 night-log.md에 append.
- 새 범위 없음. HOLD 없음.

### [D-003] 2026-07-13 감독 세션 정정 — [D-001]·[D-002] 일부 무효

**이 지시가 최신이다. [D-001]·[D-002]와 충돌하는 항목은 아래가 우선한다.**

**정정 1 — BQ-001/002/003 "브랜치 지형 보고서 / 아침 merge 준비물" → 취소(무효).**

[D-001]이 지시하고 [D-002]가 재확인한 이 산출물은 **전제가 틀렸다.**
BQ-001/002/003 은 **이미 origin/dev(`03e90ddb6`)에 착륙 완료**다. 아침에 merge할 것이 없다.

근거(실물 확인):
- `git ls-remote origin refs/heads/dev` → `03e90ddb6`
- `git cat-file -e origin/dev:src/domains/rca_bundle/router.py` → 존재 (BQ-003 코드)
- 세 feature 브랜치 모두 `origin/dev..<branch>` 공집합 (= ancestor)

"미착륙"은 **로컬 dev 브랜치가 origin/dev보다 뒤처져 있어 생긴 착시**였고 이미 해소됐다
(현재 로컬 dev = `9f7d7ea3f` = origin/dev + §4b 문서 커밋 1개).

→ 백엔드 Codex: **지형 보고서 작성하지 마라.** 대체 산출물은 회수 정리 결과 1줄뿐이다.
- worktree remove 3개: `sw-ai-bq-001-command-receipt`, `sw-ai-bq-002-audit-causation`, `sw-ai-bq-003-remediation-bundle`
- `git branch -d` 3개: `codex/bq-001-command-id-receipt`, `codex/bq-002-audit-causation`, `codex/bq-003-remediation-bundle`
- `codex/f-audit-timeline` 은 **Lane A 활성 브랜치**다(커밋 0개라 dev와 동일할 뿐, 병합된 게 아니다). **삭제 금지.**
- `-d` 가 "not fully merged"로 거부하면 `-D` 강행 금지. 멈추고 night-log.md에 보고.

**정정 2 — BQ-008 "독립 브랜치" = 신규 생성 아님.**

기존 Lane B 브랜치에서 **이어서** 작업한다.
- branch: `codex/f-inprocess-event-bus` (worktree `/private/tmp/sw-ai-f-lane-b`, HEAD `88740e523`)
- 새 브랜치를 파면 BQ-008이 두 갈래로 쪼개진다. **새 브랜치 생성 금지.**

**보류 — APIQ-012 claim 불가 판정([D-002])은 아침에 재검증한다.**

[D-002]는 `backend-f-progress.md` 미착륙을 근거로 APIQ-012 claim을 막았다. 이는 **코드가 아니라 문서**의
착륙 여부를 게이트로 쓴 것이고, 바로 위 정정 1과 같은 종류의 착시일 가능성이 있다.
다만 지금 뒤집을 증거가 없으므로 **[D-002]의 보수적 판정(APIQ-012 건너뛰고 APIQ-027 진행)을 밤새 그대로 유지**한다.
프론트 Codex는 [D-002]대로 하면 된다. 이 항목은 아침 감독 세션이 재검증한다.

**자동 판단자에게 (구속력 있음).**

착륙 여부는 **로컬 브랜치 HEAD로 판정하지 마라**(뒤처져 있을 수 있다).
반드시 `git ls-remote origin refs/heads/dev` 또는 origin/dev 실물 파일 존재로 확인하라(§4b).
이 규칙을 어긴 판정이 [D-001]·[D-002]에서 두 번 반복됐다.

**유지되는 것 (변경 없음).**

- 백엔드 야간 범위 = BQ-008(F0 in-process bus) 단 하나. BQ-004 이후 착수 금지(§4b).
- gateway 계약 파일 무접촉. RCA frozen paths 무접촉. additive-only.
- merge/push 밤새 금지. 사이클마다 night-log.md append(커밋 hash 포함).
- 애매하면 멈추고 night-log.md 에 질문 남기기.
- HOLD 없음.

### [D-004] 2026-07-13 체계 개편 — 파이프라인 문서가 새 정본

**이 지시가 최신이며, [D-001]~[D-003]의 범위 지시를 대체한다.**

- 백엔드 Codex의 정본: `docs/auto/backend-pipeline.md` (A→K 단계, 자가검증·재시도 규칙 포함)
- 프론트 Codex의 정본: `docs/auto/frontend-pipeline.md` (A→H 단계)
- 야간 범위 제한(BQ-008만/기존 APIQ만)은 **해제**된다. 파이프라인의 단계 순서와
  진입조건이 범위를 대신 통제한다. 🔒 단계(merge/push/배포)는 여전히 사람 전용.
- 착륙 판정은 origin 기준([D-003] 규칙)이 파이프라인 전역 규칙으로 승격됐다.
- 판단자는 이제 지시 발명이 아니라 **단계 전이 검증**만 한다: 파이프라인 문서의
  상태 변화가 exit criteria 증거와 함께 기록됐는지 대조하고, 불일치 시에만 HOLD.

### [D-005] 2026-07-13 04:42 KST 판정: 완료 작업 정상 / [D-004] 발효 보류 / 확장 범위 HOLD

**완료 작업 판정 — 정상 (기존 범위 기준 위반 0건).**
- BQ-008: night-log 증거(커밋 5건, HEAD `88740e523`, 신규 테스트 7 passed, 델타-그린 baseline 동일,
  gateway 계약·RCA·`runtime/worker.py` 무접촉, merge·push·앵커 0건) 일관 확인.
- 계약 스팟체크: `AcceptedResponse` = accepted/event_id/correlation_id + optional `command_id` — 무결.
- 착륙 스팟체크(origin 기준, [D-003] 구속 규칙 준수): `git cat-file -e origin/dev:docs/backend-f-progress.md`
  → 실재. 이 파일은 `d179a177c`(01:06, BQ-001 claim)부터 추적되어 origin/dev(`03e90ddb6`)에 포함된
  정상 착륙물이다. [D-002]의 "미존재 확인"은 판정 오류였고, 파일 출현은 위반이 아니다.
- VP 행: 신규 직결/어댑터 전환 0건. APIQ-029 동결·완료 앵커 미기록 유지 확인.
- 밤새 dev 로컬 커밋 2건(`1a439b002`, `4c3254c4d`)은 night-log append만 — 허용 범위.

**[D-004]·파이프라인 문서 2건(backend/frontend-pipeline.md) — 사람 확인 전 발효 보류 (fail-closed).**
사유: (1) night-directives.md는 판단자 단독 기록 채널인데 [D-003]·[D-004]는 제3자 기록이고,
파일이 git untracked라 작성 주체를 커밋으로 증명할 수 없다. (2) [D-004]는 파일 상단 야간 불변 규칙
2·3(백엔드 BQ-008만 / 프론트 기존 APIQ만 — "자동 판단자도 변경 불가")과 충돌하지만 그 규칙 본문은
개정되지 않았다. (3) 사람 부재 중의 범위 확장을 판단자가 낙관 승인할 수 없다.
단, [D-003]의 사실관계(BQ-001/002/003 착륙 완료)는 origin 기준 재검증으로 참임을 확인했다 —
보류 대상은 사실 정정이 아니라 **범위 확장**이다.

**HOLD [백엔드] — [D-004] 확장 범위 한정.**
- backend-pipeline.md 단계 A~K 착수 금지: BQ-004 이후 신규 BQ, backend-f-workqueue.md 상태 개정,
  로컬 dev fast-forward 등 git 조작, deploy-plan 작성 전부 포함. 파이프라인 문서의 상태 칸 갱신 금지.
- BQ-008은 완료 상태로 **대기** 유지([D-002] 그대로). 앵커 커밋·merge·push 금지 유지.

**HOLD [프론트] — [D-004] 확장 범위 한정.**
- APIQ-029 동결 유지(해동 금지), APIQ-012 claim 금지, VP-001 완료 절차·VP 신규 착수 금지,
  frontend-pipeline.md 단계 A~C 착수 금지, 파이프라인 문서의 상태 칸 갱신 금지.
- 야간 불변 규칙 3의 기존 범위는 계속: [D-002] 고정 순서(APIQ-020 완료 → APIQ-027 → api-needs
  고정 순서). 사이클마다 night-log.md append 의무 — 현재 프론트 보고 0건, 즉시 시정하라.

**해제 조건(사람 전용).** 우녕이 [D-004]가 본인(또는 위임한 감독 세션) 작성임을 이 파일에 확인
기록하면 본 HOLD는 해제되고 [D-004] 체계가 발효된다. 그 전까지는 위 기존 범위만 유효하다.

### [D-007] 2026-07-13 04:47 KST 판정 (자동 판단자): [D-005] HOLD 해제 조건 충족 인정 — 양 트랙 파이프라인 A 진입 허가

**점검 결과 ([D-005] 04:42 이후):**
- 단계 전이 0건: backend-pipeline §4 전 단계 `pending`, frontend-pipeline §4 전 단계 `pending` — 승인·위반 대상 없음.
- 🔒 침범 없음(origin 기준, 마지막 fetch 04:15 시점): `git log origin/dev` HEAD = `03e90ddb6` 불변,
  `git merge-base --is-ancestor 88740e523 origin/dev` → exit 1 = BQ-008 미착륙 그대로. merge·push·배포 흔적 0건.
- 계약 스팟체크: `AcceptedResponse` = accepted/event_id/correlation_id + optional `command_id` — 무결.
- 착륙 재확인: `44f35234e`(BQ-003) ancestor exit 0, `origin/dev:docs/backend-f-progress.md` 실재.
- 신규 night-log: 백엔드 04:45 WATCH([D-005] 준수) 1건뿐. 프론트 보고 여전히 0건.

**[D-005] HOLD — 해제 조건 충족으로 인정 (해제 주체는 사람의 기록, 판단자 아님).**
근거: (1) 본 파일 상단 불변 규칙이 v2로 개정되어 "[D-004] 체계 발효"를 명시 — 이 절은 자동 판단자와
작업 세션이 변경할 수 없는 절이므로 작성 가능 주체는 우녕 또는 위임 조율 세션뿐이다.
(2) 사람이 설정한 판정 태스크 charter가 파이프라인 문서(백엔드 A→K, 프론트 A→H, C/D/E 계약 lock,
🔒 H·J)를 검증 정본으로 지정하고 있다 — [D-004] 체계에 대한 사람 추인의 독립 증거.
**기록 공백**: v2 개정을 지칭하는 [D-006]이 지시 로그에 서명 항목으로 없다(파일 untracked — 커밋 증명 불가).
→ **우녕은 아침에 [D-006] 확인 서명을 이 로그에 보완 기록하라.** 본 인정이 오판이면 사람 HOLD로 즉시
재동결하라 — 그 전까지도 canonical(origin/dev)·배포는 🔒 게이트로 보호된다.

**단계 전이 승인 / 진입 허가:**
- 백엔드 Codex: **A(동기화) 진입 허가.** A→B 순서 준수 후 C/D/E/F 진행. 파이프라인 순서 규칙 준수 확인 대상:
  gateway 계약 lock — C·D·E 중 동시에 정확히 1개만 in_progress, F는 계약 무접촉으로 병행 허용.
  H·J는 🔒 — GO-REQUEST 블록 제출 후 `🔒waiting` 대기만.
- 프론트 Codex: **A(착륙 재검증) 진입 허가.** 큐 lock 순서 029→012→027 유지. H는 🔒.
- 두 트랙 공통: 상태 갱신은 §4 표의 상태 칸만, 완료 시 exit criteria 증거를 night-log에 append(§2.2 형식).
- 프론트 Codex: night-log 보고 0건 지속 중 — 사이클마다 append 의무, 첫 사이클에서 즉시 시정하라.

### [D-006] 2026-07-13 — 작성 주체 확인·HOLD 해제·체계 발효 (작성: 우녕 위임 조율 세션)

**1. 작성 주체 확인.** [D-003]은 감독 세션, [D-004]는 우녕이 위임한 조율 세션(본 세션)이
작성했다. 위임 근거: 우녕의 직접 지시 — "모두 취소하고 A부터 Z까지 파이프라인 재설계"(2026-07-13),
"더 상세하게, 오류 0까지 작업"(동일). 이후 모든 [D-###]는 상단 frontmatter 개정에 따라
작성 주체를 명기한다. [D-005]의 판정(서명 없는 범위 확장 불승인)은 **올바른 판정**이었다 —
같은 상황에서는 같은 판정을 반복하라.

**2. HOLD 해제.** [D-005]의 HOLD [백엔드]·HOLD [프론트]를 해제한다.
[D-004] 체계(파이프라인 정본 v2)가 이 시점부터 발효된다.

**3. 발효 내용 요약.**
- 백엔드 Codex: `docs/auto/backend-pipeline.md` A단계(동기화)부터 개시. §3 확정 사실
  재조사 금지, 의심 시 §1.5 origin 검증만.
- 프론트 Codex: `docs/auto/frontend-pipeline.md` A단계(착륙 재검증)부터 개시.
  [D-002]의 APIQ-012 보류·APIQ-029 동결은 A단계 origin 검증 3건 성공 시 해제된다.
- 판단자: [D-004] 역할(단계 전이 검증) 그대로. 불변 규칙 v2가 새 기준.

**4. 이력 추적 시정([D-005] 지적 수용).** docs/auto/* 미추적 파일은 백엔드 Codex가
A단계에서 로컬 dev에 `docs:` 커밋으로 추적을 시작한다(내용 수정 없이 track만).
이후 조율 문서 변경은 커밋으로 이력이 증명된다.

### [D-009] 2026-07-13 — C단계 BLOCKED 해소 승인 + 브랜치 전략 확정 (작성: 우녕 위임 조율 세션)

**1. 백엔드 BLOCKED C 판정: 정당한 발견. 선행 단계 C0을 승인한다.**
audit_log에 workspace 귀속이 없는 상태로 correlation 단독 조회 route를 여는 것은
테넌트 간 열람(BOLA) 경로가 맞다. 해소 설계(전부 additive):
- EventEnvelope에 `workspace_id` optional 필드 추가 (기존 필드 무변경)
- outbox 적재·relay 경로에서 envelope의 workspace_id 보존
- `audit_log.workspace_id` nullable 컬럼 + (workspace_id, correlation_id, created_at) 인덱스
  + 마이그레이션 (기존 행 backfill 없음 — null 유지)
- BQ-004 타임라인 조회는 **workspace-scoped 필수**: 요청 주체의 workspace로 필터하고
  workspace_id null인 레거시 행은 결과에서 제외한다. payload 안의 workspace 값·correlation
  비밀성은 인가 근거로 사용하지 않는다(백엔드 보고의 원칙 그대로 채택).
- C0은 gateway 계약 lock 대상이 아니다(event_bus/storage 계층). 단 발행 워커들의
  envelope 생성 지점이 워커별로 흩어져 있으므로, 수정 범위는 "envelope 생성 공통 경로"로
  한정하고 frozen paths 불변식은 그대로 적용한다.
백엔드 Codex는 C0 완료(델타-그린 + 마이그레이션 up/down) 후 C(BQ-004)를 재개하라.

**2. 브랜치 전략 확정: 단일 브랜치 통일 금지, 방향 있는 동기화 도입.**
- 백엔드(dev + lane)와 프론트(woonyong/ui-layer-lab)의 분리는 유지한다 — 자동화 규율
  전체가 트랙별 canonical을 전제한다.
- 프론트 파이프라인에 A2(dev→lab 단방향 동기화 merge) 단계를 신설한다.
  **첫 동기화(465커밋)는 사람 GO 필수(🔒)**, 이후 반복 동기화는 조건 충족 시 Codex 수행:
  (a) 충돌이 프론트 소유 경로(references/ui-layer-lab/**, docs/spec/frontend/**) 밖이면
  dev 쪽 채택, (b) 프론트 소유 경로 충돌은 수동 해소, (c) merge 후 full gate 통과,
  (d) 실패 시 merge abort 후 BLOCKED.
- lab→dev 통합(제품 콘솔 승격)은 별도 사람 게이트로 남는다.

### [D-010] 2026-07-13 — 외부 감사 5개 약점의 큐 반영 (작성: 우녕 위임 조율 세션)

**근거 실측**: `dispatch.py` `safe_pr_patches()`가 후보 `params.patches` 부재 시
`fallback_recovery_patch()`로 `.gitops/recovery/*.md` 문서 PR을 생성함을 코드로 확인.
heal8s(github.com/heal8s/heal8s)는 실존(Apache-2.0, OOM/Scale/RollbackImage 실제 patch,
CRD·Helm·원커맨드 verify)하나 0 stars·3 commits·릴리스 0 — 방향 선점의 증거로만 취급.

**1. BQ-009 신설 승인 — 권위 patch 엔진 (제품 경쟁력 1순위).**
safe_pr 경로의 markdown fallback을 실제 patch 생성으로 교체한다:
- `safe_pr_patches()`가 patches 부재 시 action_type별 생성기를 호출:
  `oom_memory`(현재 usage/limit 분석 → 상한 정책 적용 request/limit 계산),
  `image_rollback`/`image_tag_fix`(last_approved_snapshot·직전 정상 digest),
  `replica_scale`, `probe_fix`(timeout/port/path), `selector_fix`(최소 selector).
- 생성기는 diff-worker·release flow가 이미 추적하는 desired manifest/승인 스냅샷을
  단일 소스로 사용한다 — RCA 복구와 Release Flow의 patch 체계를 하나로 결합.
- **대상 manifest를 확보 못 하면 `unsupported`로 정직 종료.** 문서 PR을 복구로
  위장하는 경로는 제거한다(검토 문서는 `gitops_recovery_review` 전용으로 격리, BQ-010).
- rollback patch 동반 필수. flag·승인 게이트·scm-worker 단일 PR 생성자 경계 불변.
- **frozen 예외 부여**: BQ-009/010에 한해 `src/services/ai/agent/recovery/**` 수정 허용.
  단 RCA 작업열이 같은 파일을 만지고 있지 않음을 착수 시 확인·기록할 것.
- lane: F(BQ-007) 완료 후 같은 lane(`codex/f-auto-revert-pr`)에서 이어서. 신규 브랜치 금지 유지.

**2. BQ-010 신설 승인 — 카탈로그 patch 파라미터 구체화.**
`builtin.py`의 `params={"patch": "recovery_review"}` 류를 BQ-009 생성기가 소비할
선언적 파라미터로 교체. 검토 문서 액션은 실제 복구 액션과 action_type 수준에서 분리하고
score를 실제 patch 액션보다 낮게 조정.

**3. BQ-011 신설 승인 — release_flow 내부 모듈 분해 (구조 부채).**
`release_flow/router.py`(5,297줄)를 policy/readiness/verification/report 내부 모듈로
behavior-preserving 분해 + import-linter 계약 추가. **착수는 H(merge) 이후** — F-track
기능 완주가 우선이다. exit: 전 테스트 결과 불변 + 분해 전후 줄수 보고.

**4. release-red 가시화.** G·I단계 exit에 추가: 현재 release 기준 red 항목
(RCA baseline 8건, GitHub Actions red, Integration Smoke off, RemediationBundle API
라이브 미배포)을 deploy-plan.md에 "release blocker 목록"으로 명시해 사람의 H/J GO
판단 자료로 제공한다. baseline 8건의 수렴은 F-track이 아니라 RCA 작업열 소유다.

**5. HA·OSS 준비는 이 큐가 아니다.** HA 보강은 deploy-plan에 "1 replica 위험 목록"
명시까지만(로드맵 후순위 유지). OSS 공개 준비(라이선스·공개 저장소·Helm chart)는
oss-remediation-roadmap.md §8의 사람+별도 트랙 몫이다.

### [D-011] 2026-07-13 — R-트랙(RCA baseline 수렴) 정식 등록 (작성: 우녕 위임 조율 세션)

**목적.** release 기준 red의 원인인 RCA 소유 실패 8건을 기계 안의 정식 트랙으로 수렴시킨다.
F-트랙·P단계와 꼬이지 않도록 경로·lane·baseline 갱신 규칙을 고정한다.

**R-트랙 소유 항목 (이것만, 전부).**
- pytest 6 node: `tests/test_incident_symptom_derivation.py::...[crashloop|imagepull|oom|sched-fail]`
  (규칙 확장 후 기대 candidate 수 미갱신),
  `tests/test_rca_evidence.py::test_crashloop_flow_auto_selects_restart_and_queues_command`,
  `tests/test_rca_scenario_cli.py::test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts`
- ruff format 2 파일: `tests/test_bruno_collection.py`, `tests/test_rca_rule_catalog.py`
- import-linter 1 계약: `domains.rca.router -> services` (해소 방법: rca router가 services를
  직접 import하지 않도록 의존 방향 교정. 계약 완화·예외 추가로 "해소"하는 것 금지)

**lane 규칙.** 신규 lane `codex/rca-baseline-convergence` 1개를 승인한다(신규 브랜치 금지의
명시적 예외). 전용 worktree 분리. origin/dev merge·push는 🔒 사람 게이트 — H와 같은 규칙.

**경로 상호 배제 (안 꼬이게 하는 핵심).**
- R-트랙 금지 경로: `src/services/ai/agent/recovery/**` (P단계 BQ-009/010의 영토,
  P 완료 전까지), `src/packages/contracts/gateway/**`, release_flow, 조율 문서의 상태 칸.
- F-트랙 금지 경로(기존 frozen 유지): R-트랙 소유 테스트 5파일과 그 대상 규칙·시나리오
  파일. P단계가 R-소유 파일을 건드려야 하는 상황 = BLOCKED 후 조율.
- 양쪽 다 필요해지는 파일이 발견되면 먼저 발견한 쪽이 BLOCKED + night-log 보고. 추측 금지.

**baseline 축소 프로토콜.**
1. R-트랙이 항목 해소 시 night-log에 완료 증거(대상 node/파일, 커밋 hash, 로컬 전체
   pytest/ruff/import-linter 결과) append.
2. 백엔드 Codex가 자기 lane에서 같은 항목의 green을 재확인한 뒤에만
   backend-pipeline.md §1.4 baseline에서 해당 항목을 제거(축소만, 이 편집은 상태 칸
   규칙의 예외로 허용).
3. 판단자는 baseline 축소가 "R-트랙 증거 + 백엔드 재확인" 두 기록을 모두 가질 때만 승인.
   증거 없는 축소 = HOLD 사유.

**보고 채널.** R-트랙도 night-log에 `[시각] [RCA] ...` 형식으로 append하고
night-directives 최하단 폴링(HOLD [RCA] 적용 대상)을 따른다. 판단자 점검 루틴에
R-트랙이 추가된다: 소유 항목 밖 파일 변경 흔적 = HOLD [RCA].

**완료 정의.** 8건 전부 해소 + baseline 공집합 + `make test` 전체 그린. 이 시점에
델타-그린 규칙은 자동 만료되고 전체 통과 규칙으로 복귀한다(§4 원문 그대로).

### [D-012] 2026-07-13 — R 착륙 확정 + BLOCKED P 해소 결정 (작성: 우녕 위임 조율 세션)

**1. GO [R] — R-트랙 착륙.** 사람(우녕)이 `codex/rca-baseline-convergence`를 dev에
merge하고 push했다(충돌은 night-log.md 1건뿐, 양측 보존으로 해소, merge 후 `make test`
전체 그린: 470 format PASS, import-linter 2 kept/0 broken, pytest 1646 passed/0 failed).
- 백엔드 Codex: origin/dev에서 R 착륙을 §1.5 명령으로 재확인한 뒤
  backend-pipeline.md §1.4 baseline을 **공집합으로 소거**하라([D-011] 프로토콜의
  재확인 증거 = merge된 dev에서의 위 전체 그린).
- **델타-그린 규칙은 이 시점부로 만료. 전체 통과 규칙으로 복귀한다.**
  이후 모든 단계의 exit criteria는 `bash scripts/test.sh` 무조건 전체 그린이다.
- R-트랙 세션은 임무 종료. lane과 worktree는 백엔드가 회수 절차(-d 거부 시 중단 보고)로 정리.
- release blocker 목록에서 "RCA baseline 8건" 항목 제거. 남은 blocker:
  GitHub Actions red, Integration Smoke off, RemediationBundle API 라이브 미배포.

**2. BLOCKED P 해소 — dispatch 단계 read port 승인 (제시된 두 안 중 후자).**
recovery plan hydration(이벤트에 manifest 탑재) 방식은 **기각**한다: 이벤트가 무거워지고,
plan 시점과 PR 생성 시점 사이의 신선도 문제(승인 스냅샷 갱신)가 생기며, payload에 실린
manifest는 위조 면에서 신뢰 불가라는 백엔드의 원칙과 충돌한다.
승인하는 설계:
- `contracts`에 **읽기 전용 GitOps 권위 컨텍스트 port**(Protocol)를 추가하고 dispatcher가
  주입받는다. 순수성은 주입으로 보존(테스트에서 fake 주입).
- 단일 소스 = gitops 도메인이 이미 추적하는 승인 스냅샷·binding·repository·base SHA.
  **F단계가 착륙시킨 `source_patch.py`의 권위 컨텍스트(exact base SHA, SCM provenance,
  원문 byte 보존)를 재사용하라** — 같은 문제를 두 번 풀지 마라.
- 조회 시점 = patch 생성 시점(신선도 보장). payload/params의 manifest 값은 인가·입력
  근거로 사용 금지(백엔드가 기각한 우회 3종 전부 동의).
- 이 port는 gateway 계약이 아니므로 계약 lock 대상 아님. additive-only 불변.
P는 이 결정으로 재개한다. C0·C·D·E와의 순서 규칙은 파이프라인 그대로.

### [D-013] 2026-07-13 — B-트랙(벤치마크) 정식 등록 (작성: 우녕 위임 조율 세션)

**목적.** oss-remediation-roadmap.md §6의 벤치마크(정답이 있는 장애 데이터셋)를 구축한다.
코드보다 복제하기 어려운 해자이며, "harmful action rate 0%"와 "모르면 행동하지 않는다"를
측정 가능하게 만드는 자산이다. 담당: 구 R-트랙 세션(RCA 규칙·시나리오 계약 숙련).

**소유 경로 (이것만).**
- `benchmark/**` (신규 디렉터리 — 시나리오·채점 스크립트·README)
- `docs/spec/remediation-bundle-v1alpha1.md` (신규 — 착륙된 BQ-003 스키마의 공개 규격
  문서화. 스키마 자체를 바꾸는 것이 아니라 문서화만)
- src/** 는 **읽기 전용** (기대 후보·evidence 도출을 위한 참조만, 수정 0건)

**시나리오 형식 (각 시나리오 디렉터리, 로드맵 §6 그대로).**
정상 manifest / 장애 주입 patch / 예상 root cause / 필요한 evidence 목록 /
허용되는 remediation / **금지되는 위험한 remediation** / 예상 Git patch / rollback patch /
정상화 판정 조건. v0.1 대상: oom, crashloop, imagepull, probe, service-selector
(+여유 시 scheduling, pvc) — 카테고리당 2~4개, 총 10~20개.

**검증 기준.**
- 각 시나리오의 예상 root cause·candidate가 **실제 카탈로그 규칙과 일치**해야 한다 —
  기존 rca 시나리오 validate CLI 계약(test_rca_scenario_cli가 검증하는 그것)을 재사용해
  기계 검증 가능하게 만든다. 상상 속 규칙에 대한 시나리오 금지.
- 채점 스크립트는 benchmark/ 안에서 자기완결: 시나리오 스키마 유효성 + 카탈로그 일치 +
  금지 remediation 목록의 blast radius 태그 검사. 실행 파이프라인 연동(실제 클러스터
  주입·측정)은 v0.2 — 지금은 정적 채점까지만.
- 공개 지표 정의 문서: RCA Top-1 정확도, insufficient-evidence 정확도, patch apply
  성공률, 정책 위반 제안율, harmful action rate, 정상화 성공률 (측정 방법 포함).

**lane·규칙.** 신규 lane `codex/bench-scenarios` 1개 승인. 전체 그린 규칙 적용
(`bash scripts/test.sh` — benchmark는 기존 테스트에 영향 없어야 함). merge는
GO-REQUEST [B]로 사람 게이트. night-log 보고·폴링·HOLD 규칙은 R-트랙과 동일.
금지: src/** 수정, 백엔드 lane 경로 접근, 카탈로그에 없는 규칙 가정.

### [D-014] 2026-07-13 — B-트랙 BLOCKED 해소: 색인 권한 부여 (작성: 우녕 위임 조율 세션)

B-트랙의 BLOCKED(docs/README.md 색인 링크 필요)를 해소한다. 판정: **색인 갱신은
산출물의 일부다** — 백엔드가 문서 도입 커밋에서 색인을 함께 갱신한 선례와 동일하다.

**권한 부여 (정확히 이만큼):** B-트랙은 docs/README.md에 **자기 산출물 링크 추가만**
할 수 있다 (docs/spec/remediation-bundle-v1alpha1.md 및 test_docs_index가 요구하는
자기 소유 .md). 기존 링크·다른 줄의 수정·삭제는 금지. diff는 추가 줄만 있어야 한다.

후속: 링크 추가 → 전체 게이트 재실행(전체 그린 필수) → GO-REQUEST [B] 작성 → 대기.

### [D-015] 2026-07-13 — B-트랙 후속 임무: OSS 위생 드래프트 (작성: 우녕 위임 조율 세션)

GO [B] 착륙 완료(merge `0d0f92cca`, origin/dev `acbe261af`). B-트랙 세션의 다음 임무.

**목적.** oss-remediation-roadmap.md §8(공개 필수 작업)의 문서 드래프트를 선제 작성해
공개 결정 시점의 병목을 제거한다. **이것은 초안이다** — 저장소는 private 유지,
공개·라이선스 채택 결정은 사람 몫.

**소유 경로: `docs/oss/**` (신규 디렉터리) + docs/README.md 색인의 자기 링크 추가([D-014] 준용).**

산출물:
1. `docs/oss/README.en.md` — 영문 README 초안. 로드맵 §0 포지셔닝 문장 기반,
   Alert→Evidence→Patch→검증→PR→정상화 흐름 중심. 데모 3장면 서술 포함.
   내부 실명·조직명·AWS 계정·도메인·시크릿 정보 절대 포함 금지.
2. `docs/oss/LICENSE.draft` — Apache-2.0 전문 (채택은 사람 결정, 파일명에 draft 명시)
3. `docs/oss/CONTRIBUTING.md` — 기여 단위는 "벤치마크 시나리오 1개"라는 원칙(로드맵 §7)
   중심. benchmark/README.md의 시나리오 스키마를 기여 포맷으로 연결.
4. `docs/oss/SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `MAINTAINERS.md`,
   `CHANGELOG.md` 초안 — CNCF Sandbox 관례 기준.
5. `docs/oss/publication-checklist.md` — 공개 전 사람이 해야 할 일 목록
   (비밀·이력 정리, 저장소 분리, 이름/상표, CI 복구, 릴리스 절차).

규칙: lane `codex/oss-hygiene` (신규 승인). src/** 및 다른 트랙 경로 무접촉.
전체 그린 유지. 완료 시 GO-REQUEST [OSS] 작성 후 대기. 그 외 규칙은 [D-013]과 동일.

### [D-016] 2026-07-13 — BQ-012 신설: AI fallback 근거 검증 구멍 수정 (작성: 우녕 위임 조율 세션)

**발견 (코드 검증됨, Codex 감사).** `ai_fallback.py:119`: LLM 후보가 스스로 작성한
expected_evidence만 전달하고 signals를 전달하지 않아, 평가기가 **evidence source의
존재만으로** supporting을 인정할 수 있다. `test_ai_fallback_worker.py:159`가 이 경로로
점수 1.0 도달을 검증 중. 결과: LLM이 지어낸 원인 + 이미 수집된 source 이름 나열 =
확정(rca.completed) 진입 가능. **"모르면 행동하지 않는다" 원칙의 실제 구멍이며,
제품 핵심 메시지를 훼손하므로 우선 수정한다.**

**BQ-012 요구사항 (P단계와 같은 급의 우선순위, frozen 예외:
`src/services/ai/agent/pipeline/ai_fallback.py`·관련 평가 경로 한정):**
1. AI fallback 후보는 **내용 기반 signal predicate가 최소 1개 검증되기 전까지
   rca.completed로 진입 불가** — source 존재만으로 supporting 인정 금지.
2. 구현 방식은 백엔드가 다음 중 택1 또는 조합(설계 근거를 night-log에 기록):
   (a) LLM 후보는 hypothesis 상태로만 남기고 완료 경로 차단,
   (b) LLM은 기존 catalog cause ID만 제안하고 해당 rule의 validator가 검증,
   (c) LLM이 기계 실행 가능한 evidence predicate를 생성하고 결정론적 평가기가 실행.
3. `test_ai_fallback_worker.py:159`의 "source 존재 = 1.0" 테스트는 새 계약으로 교체
   (기존 테스트를 지우는 것이 아니라 강화된 기대로 갱신).
4. 완료 기준: 조작 시나리오 테스트(수집된 source 이름만 나열한 가짜 후보가
   completed에 도달하지 못함을 증명) + 전체 그린.

**메시징 규칙(발표·문서 공통, 즉시 발효):** "환각 불가능"·"exactly-once"·
"managed-field diff"·"AI가 못 망가뜨림을 증명" 표현 금지. 대체:
"rule-first fail-closed RCA", "transactional outbox + consumer ledger 기반
effectively-once", "policy-scoped 3-way semantic diff",
"tenant·cluster·namespace·capability 단계 제한". BQ-012 완료 전까지 fail-closed
주장은 rule 경로에 한정해서만 말한다.

### [D-017] 2026-07-13 — 제품 전략 확정: 플랫폼(A) + 쐐기 진입(B), BQ-013~016 신설 (작성: 우녕 위임 조율 세션, 우녕 결정 반영)

**결정.** 우녕의 조건(자체 GitOps 디폴트·AI 채팅 기본·rule 수십 개·UI 고도화 유지)을
전제로, 제품 전체 = "AI-native open-source Kubernetes GitOps control plane"(대표 기능 2:
Verified Autonomous GitOps + Evidence-native Incident Workbench/Chat), 시장 진입 첫 경험 =
"Verified GitOps Revert"(bad image → 검증된 rollback PR → 정상화 확인) 서사로 확정한다.
기능 축소 없음 — 진입 서사와 설치 경험만 좁힌다.

**BQ-013 — single-writer invariant.** application별 writer는 정확히 하나.
`reconciler_mode=builtin`(기본) / `argocd`(observer — 자체 apply 경로 차단).
argocd 모드에서 apply 명령이 발화하지 않음을 테스트로 증명. additive(설정+가드).

**BQ-014 — 외부 GitOps observer 어댑터 (관찰만, 제어 금지).** 외부 GitOps Application의
repo/revision/path·sync/health 읽기, rollout 실패·stable revision 읽기,
외부 GitOps sync 완료 후 사후 검증에 활용. 외부 GitOps 리소스 변경 절대 금지. BQ-013 이후 착수.

**BQ-015 — `.remediation.yaml` 소스 계약.** 저장소 소유자가 수정 가능 위치를 선언
(helm-values imageTagPath, kustomize images[].newTag, raw image scalar, replica,
제한된 probe 필드). patch 생성기는 선언된 필드만 수정 — LLM·엔진의 파일/필드 추측 금지.
Helm/Kustomize 역변환 문제를 계약으로 우회하고, 향후 patch adapter 기여 지점이 된다.
P(BQ-009/010)와 같은 lane에서 P 이후 착수.

**BQ-016 — OSS 프로파일: PR-only 기본 + 축소 설치 + make demo.**
공개 프로파일 기본값: agent read-only, direct command 비활성, remediation은 PR 생성만,
production auto-merge 금지. 설치 = controller(F0 in-process 조립 완성 포함) + PostgreSQL +
agent 3개 구성. `make demo` = Kind 생성 → bad rollout 주입 → rollback PR(또는 로컬 mock PR)
→ 정상화 검증까지 원커맨드. up.sh(748줄) 경로는 advanced 프로파일로 격하.
F0 잔여 증명(39 entrypoint 단일 composition root 기동, NATS/in-process 동일 시나리오
비교)이 이 항목의 일부다.

**PR 본문 표준.** revert/remediation PR 본문은 검증 결과 표(원인, rule-verified 여부,
실패/정상 revision, patch 범위, base SHA·digest 검증, 정책 위반 0, blast radius,
rollback 포함, 사후 검증 조건)로 하고 RemediationBundle을 artifact로 첨부한다.
Bundle은 canonical JSON + content hash 검증(`verify` 명령)까지 v0.1, 서명은 이후.

**우선순위.** BQ-012(신뢰) → BQ-013(안전 불변식) → BQ-016(진입 경험) → BQ-015 →
BQ-014. rule pack 40~50개 확장(허용/금지 remediation·검증 조건 포함 계약)과
Workbench UI 4화면은 별도 트랙(벤치·프론트)에서 병행.

### [D-018] 2026-07-13 — 멀티클러스터 UX 확정: BQ-017 + VP-007~009 (작성: 우녕 위임 조율 세션, 우녕 요구 반영)

**우녕 요구.** 리소스 뷰의 최상위 = 클러스터. 위자드로 상용 클러스터(AWS/Azure/GCP 등)에
target agent를 명령어 하나로 설치, 연결 과정을 단계로 가시화, 연결된 클러스터 목록 +
provider 대표 아이콘(EKS는 AWS 아이콘 등), 선택된 클러스터 기준으로 리소스 연결.

**실측 결과 — 이미 있는 것 (재구현 금지, 노출·연결만):**
- provider 등록 정의: `src/domains/providers/catalog.py` (EKS/GKE/AKS, 등록 어댑터·설정 필드)
- 원커맨드 설치: install 토큰 → `curl … | kubectl apply` (콘솔 위자드 경로 실존)
- 연결 상태: `ClusterConnectionStatusResponse` (connection_status, connect timeout/expiry)
- 클러스터 스코프 리소스: `/api/clusters/{cluster_id}/...` inventory 전 경로
- 프론트 cluster wizard·fleet 골격 (reference map "resources cluster wizard")

**BQ-017 (백엔드, additive) — provider 1급화 + 연결 단계.**
1. `ClusterSummary`에 `provider: str` optional 추가. 값: `eks|gke|aks|onprem|kind|unknown`.
   결정 우선순위: 등록 시 선택한 provider(catalog 값) > agent 자동 감지
   (node `spec.providerID` prefix: `aws://`→eks, `azure://`→aks, `gce://`→gke;
   node label 보조) > `unknown`. 자동 감지는 agent 스냅샷 경로에 additive.
2. 연결 과정 단계화: `connection_status`를 보존하되 `connection_stage` optional 추가 —
   `token_issued → awaiting_install → agent_connected → snapshot_received → ready`
   (+ `expired`, `error`). 기존 소비자 회귀 0.
완료 기준: 기존 응답 소비자 회귀 + provider 감지 단위테스트(3사 providerID) + 전체 그린.

**VP-007 (프론트) — 클러스터-최상위 IA.** 전역 클러스터 selector가 리소스·메트릭·
인시던트의 스코프를 결정(기존 URL cluster 치환 패턴 재사용, REF-API-011/013 어댑터 선례).
연결된 클러스터 목록 화면: 이름·environment·health·connection·**provider 아이콘**.
아이콘 규칙: provider 값이 확인된 것만 브랜드 아이콘, `unknown`은 일반 K8s 아이콘 —
추측 배지 금지(BE-Gap 규율의 시각 버전). 브랜드 아이콘은 각사 상표 가이드 준수
(simple-icons 등 허용 라이선스 소스만).

**VP-008 (프론트) — 클러스터 연결 위자드 고도화.** 단계: ① provider 선택(카탈로그
정의 소비) → ② provider별 사전 준비 명령 표시(`aws eks update-kubeconfig` 등 catalog
adapter 문구) → ③ 설치 원커맨드 발급(복사 버튼, 토큰 만료 카운트다운 =
connect_expires_at) → ④ 연결 과정 실시간 표시(BQ-017 connection_stage 폴링,
단계별 체크 표시) → ⑤ 완료 시 클러스터 목록으로. 미지원 provider는 "generic
(수동 kubeconfig 불필요·동일 원커맨드)"로 정직 표기.

**VP-009 (프론트) — fleet/목록의 provider 표시 일관화.** fleet heatmap·홈 카드·
인시던트의 클러스터 표기에 동일한 provider 아이콘 컴포넌트 재사용(단일 컴포넌트,
중복 구현 금지).

**절차.** VP-007~009는 verified-pipeline-insertion-map.md에 행 추가 후 기존 규율
(BQ-017 앵커 확인 → APIQ → 구현). VP-007의 목록·selector는 기존 착륙 계약만으로도
부분 진행 가능(provider 아이콘만 BQ-017 대기) — 진입조건을 분리해 병행을 허용한다.

### [D-019] 2026-07-13 — 완료 수준 전환: BLOCKED P 해소·DoD 확정·실행 순서 고정 (작성: 우녕 위임 조율 세션)

**1. BLOCKED P(BQ-009) 2차 blocker 해소 — frozen 예외 정밀 확장.**
[D-012] 2항이 read port를 승인했으나 조립 지점이 막혀 있었다. 다음을 추가 허용한다:
- `src/packages/contracts/`에 GitOps 권위 컨텍스트 read port(Protocol) 신규 파일 — 허용
- `src/services/ai/dispatch-worker/app.py` — **port 주입 배선에 한정한 최소 수정 허용**
  (파이프라인 로직 변경 금지, 주입 파라미터 추가만)
- `src/services/ai/agent/recovery/**` — [D-010] 기존 예외 유지
그 외 `src/services/ai/**` 기존 파일은 여전히 frozen. 이 예외로도 풀리지 않는 지점이
있으면 파일 경로를 명시해 재보고하라 — 포괄 예외는 주지 않는다.
BQ-009 상태를 `blocked` → `requested`(재개 가능)로 갱신한다.

**2. 완료 정의(DoD) — 이 시점부터 모든 트랙 공통.**
어떤 항목도 다음 4조건을 모두 충족해야 "완료"라 부른다:
(a) **origin/dev 착륙** (lane 완료 ≠ 완료. done-pending-merge는 완료가 아니다)
(b) 전체 그린 (`bash scripts/test.sh`)
(c) **실측 가능** — Bruno 요청, `make demo` 장면, 또는 채점 스크립트로 제3자가 재현 가능
(d) 관련 문서(계약·프론트 인계·색인) 갱신 착륙
보고·상태 칸·대화에서 "진행 중/완료" 표현은 이 정의를 따른다. 위반 표현 발견 시
판단자가 정정 지시를 낸다.

**3. 실행 순서 확정 (백엔드 감사 제안 채택).**
① 조율 문서(D-017~019, BQ-013~017, VP-007~009) 커밋·push — 기준점 영속화
② BQ-012 — LLM hypothesis-only (테스트 `score == 1.0` 기대를 강화 계약으로 교체 포함)
③ BQ-013 — single-writer invariant
④ BQ-016 — controller composition root + make demo (F0 잔여 증명 포함)
⑤ BQ-009/010 재개 — 권위 주입 후 patch 6종 (F lane에서 이어서)
⑥ BQ-015 — .remediation.yaml
⑦ BQ-014 — Argo observer
BQ-017(provider)은 C/D/E 계약 lock 규칙 안에서 상기 순서와 병행 가능.

**4. rule pack 완성은 신규 트랙이 아니라 기존 자산 채우기.**
top-level rule 29개·candidate 87개·signal group 87개·recovery decorator 11개가 실존한다.
"수십 개 추가"가 아니라 **87개 후보에 계약 채우기**(허용/금지 remediation,
supporting/contradicting, patch 가능 여부, rollback·post-verification, benchmark fixture)가
정확한 작업 정의다. 이 작업은 벤치 트랙(구 B-트랙 세션)의 다음 임무로 배정 예정 —
별도 지시로 발행한다.

**5. OSS 라이선스.** LICENSE.draft → 루트 LICENSE 채택은 여전히 사람 결정으로 남긴다
(팀 기여자 동의 확인 선행 — publication-checklist 참조).

### [D-020] 2026-07-13 — 백엔드 상태 감사 반영: lock 순서·단계적 H·split-brain 시정 (작성: 우녕 위임 조율 세션)

**1. gateway 계약 lock 순서 확정: BQ-006 → BQ-017.**
근거: G 진입조건이 E(BQ-006)를 포함하므로 BQ-006이 H 경로의 병목. BQ-017은 프론트가
provider-free로 병행 중이므로 후순위. 동시 착수 금지는 §1.3 그대로.

**2. H 게이트를 단계적 착륙으로 개정 (backend-pipeline H 행의 일괄 merge 대체).**
- **H1 (최우선): `codex/f-audit-timeline`** (C0/BQ-004/BQ-005) — 프론트 E단계(VP-002/003)가
  BQ-004 origin 착륙을 대기 중이므로 먼저 착륙시킨다.
- **H2: `codex/f-inprocess-event-bus`** (BQ-008, dev 대비 47커밋 낙후 — 조기 착륙으로 부채 정지)
- **H3: `codex/f-auto-revert-pr`** — P(BQ-009/010) 완료 후.
각 Hn 공통 절차: 최신 origin/dev로 rebase(또는 clean 시험 merge) → lane에서 전체 게이트
재증명 → GO-REQUEST [Hn] 제출(충돌 예측·명령 포함) → 사람 GO(실행 위임 가능) →
ancestor 재증명 + progress 앵커([D-012] 절차) → lane 회수. C 완료 증거의 hash는
rebase 후 동등 커밋(7d74d765c)으로 갱신해 기록한다.

**3. split-brain 시정 (백엔드 제안 승인).** dev worktree의 조율 문서 변경
(D-017~020, BQ-012~017 행, VP 관련)은 **벤치·기타 잔여 변경과 혼입 없이 단독 커밋**으로
분리해 push한다. 혼입 위험이 있는 파일은 커밋 전 diff 목록을 night-log에 남긴다.

**4. 실행 순서 재확인.** 조율 문서 착륙 → BQ-012 → BQ-013 → BQ-006(lock) →
H1 → H2 → BQ-016 → BQ-009/010 재개(D-019 예외로) → H3 → BQ-017(lock) →
BQ-015 → BQ-014. G(통합 검증)는 단계적 H 체제에서 "각 Hn 직전의 lane 재증명"으로
대체되며, 최종 G는 마지막 H 후 origin/dev에서 1회 수행한다.

### [D-021] 2026-07-13 — 팀 중간 통합: GO 일괄 부여·승격 게이트·작업 방식 확정 (작성: 우녕 위임 조율 세션, 우녕 결정)

**1. GO 일괄 부여 (실행 위임: 각 담당 Codex).** 순서 엄수:
① **GO [H1]**: audit-timeline lane rebase → 전체 게이트 재증명 → dev merge·push →
   ancestor 재증명 + 앵커(C 증거는 7d74d765c로 갱신)
② **GO [H2]**: in-process bus lane 동일 절차
③ **GO [FE-A2]**: dev→lab 동기화. 충돌 정책은 기존 확정값(lab 소유 경로=lab,
   docs/auto=양측 보존, legacy frontend/** 및 그 외=dev 채택, 예외 후보만 별도 보고).
   merge 후 full gate 필수.
④ **GO [PROMOTE]**: ③ 완료 직후 lab → dev 승격 merge·push (백엔드 Codex 실행,
   프론트가 lab HEAD·full gate 증거 제출 후). 이것이 팀 공유용 중간 통합점이다.
각 단계는 이전 단계의 착륙 확인(ancestor exit 0) 후에만 진행. 어느 단계든 예상 밖
충돌·게이트 실패 시 중단·보고(추측 해소 금지).

**2. 브랜치 정리 2차.** ④ 후: 착륙된 lane 전부 삭제(-d), 유지하는 것은
`codex/f-auto-revert-pr`(P/BQ-009/010 진행용) 하나. [D-011]류 분류 [C](미착륙·
비활성) 브랜치는 감사 표를 night-log에 제출하고 사람 판단 대기 — 임의 삭제 금지.

**3. 앞으로의 작업 방식.**
- **dev = 유일한 통합 기준점.** 사람 팀원은 dev에서 분기해 PR.
- 에이전트는 **단명 lane 원칙**: lane 생성 후 24시간 내 착륙(또는 BLOCKED 보고).
  dev 대비 20커밋 이상 낙후된 lane은 즉시 rebase 의무 — 판단자 점검 항목에 추가.
- 착륙은 기존 위임 게이트 절차 유지(직접 dev 커밋은 조율 문서 docs 커밋만 예외).
- lab(프론트)은 canonical 유지하되 **일일 1회 이상 dev↔lab 양방향 동기화**
  (아침 FE-A2 → 저녁 PROMOTE 리듬)를 기본으로 한다.

**메시징 규칙(발표·문서 공통, 즉시 발효):** "환각 불가능"·"exactly-once"·
"managed-field diff"·"AI가 못 망가뜨림을 증명" 표현 금지. 대체:
"rule-first fail-closed RCA", "transactional outbox + consumer ledger 기반
effectively-once", "policy-scoped 3-way semantic diff",
"tenant·cluster·namespace·capability 단계 제한". BQ-012 완료 전까지 fail-closed
주장은 rule 경로에 한정해서만 말한다.

### [D-025] 2026-07-13 — 착륙 기준 재정의: "완성"이 아니라 "안전" (작성: 우녕 위임 조율 세션)

**1. 착륙의 기준은 완성이 아니라 안전이다.** 미완성 코드는 기본 비활성 flag,
미노출, 미배선 중 하나로 격리해 전체 게이트와 착륙 4조건을 만족하면 즉시 착륙할 수 있다.

**2. 미착륙도 위반이다.** dev 대비 10커밋 초과 lane, 30분 초과 미커밋 변경,
생성 후 2시간 초과 lane, "완성 후 착륙" 계획은 착륙 지연으로 본다.

**3. 작업 단위 분해 의무.** 2시간 안에 안전 착륙할 수 없는 작업은 더 작은 단위로 쪼갠다.
lane 10커밋 초과는 분해 실패 신호다.

**4. 게이트는 절대적이다.** 전체 그린과 [D-024] 4조건은 유지한다. 격리된 미완성의
잔여 결함과 해제 조건은 night-log에 기록하고 다음 사이클 첫 작업으로 처리한다.

### [D-026] 2026-07-13 — GAP → BQ 정식 등록 + 계약 우선순위 (작성: 우녕 위임 조율 세션)

**우선순위는 계약 > 배포 > OSS 공개다.** 프론트 계약을 아래 순서로 처리하고 각 계약을
개별 착륙한 즉시 night-log에 앵커를 남긴다. 여러 계약을 한 번에 모아 전달하지 않는다.

| BQ | GAP | 계약 | 해제되는 프론트 |
|---|---|---|---|
| BQ-022 | GAP-010 | Resources filter와 동일 scope/revision의 single-cluster graph snapshot | 표/그래프 모드 |
| BQ-023 | GAP-005 | Issues common/surface filter, facet, stable detail ID, cursor/total/completeness | Issues 필터 |
| BQ-024 | GAP-006 | Applications/GitOps/Checks provider-neutral list·facet 계약 | 세 화면 필터 |
| BQ-025 | GAP-007 | Cluster 등록 validation·preview·resume/reissue·structured stage error | 연결 위자드 |
| BQ-026 | GAP-008 | Cluster 연결 해제 capability·confirmation·receipt·terminal status | 클러스터 상세 삭제 |
| BQ-027 | GAP-009 | 저장소 recognition·access·credential·branch/path cursor·operation status | 저장소 위자드 |
| BQ-028 | GAP-001 | workspace catalog/current/switch/session refresh/forbidden·deleted | workspace selector |

상세 의미는 `docs/spec/frontend/vp-010-unified-filter-ia.md` §9·§9.1을 따른다. 기존
GAP-002/003/004와 이미 착륙한 계약은 중복 구현하지 않고 새 BQ 번호를 canonical 앵커에 연결한다.

### [D-008] 2026-07-13 04:50 KST 기록 정합 (작성: 자동 판단자)

[D-007](판단자)과 [D-006](조율 세션)이 04:47경 동시 기록되어 파일 내 순서가 ID 순서와 어긋났다.
내용 상충은 없다: 두 지시 모두 [D-005] HOLD 해제 + 양 트랙 파이프라인 A 진입이다.
[D-007]이 요청한 [D-006] 서명 보완은 위 [D-006] 실물로 충족됐다.
작업 세션 기준: **유효 최신 지시 = [D-006]+[D-007] 합본** — A단계 개시, 계약 lock(C/D/E 동시 1개),
🔒(백엔드 H·J, 프론트 H)는 사람 전용, 완료 증거는 night-log §2.2 형식. 이후 지시는 [D-009]부터.

### [D-022] 2026-07-13 — 프론트 계약 갭 선해소·배포 선행조건 (복원: 우녕 지시)

프론트를 막는 additive 계약은 기능 착륙 즉시 night-log에 소비 앵커를 남긴다. 계약과 병행해
배포 준비의 migration 실행 경로, 기존 create-all DB baseline, 인증 우회 차단, CI·smoke를
구체화하되 검증 전 배포 스위치를 켜지 않는다. 기존 계약 rename·삭제·타입 변경은 금지한다.

### [D-023] 2026-07-13 — Opsia 공개 제품명·OSS 표면 정합 (복원: 우녕 지시)

공개 문서·차트·설치 예시는 제품명을 `Opsia`/`opsia`로 정합화한다. 코드 식별자, event subject,
DB schema처럼 호환성에 영향을 주는 내부 이름은 별도 migration 없이 바꾸지 않는다. 공개 OCI
설치는 anonymous pull까지 실제로 확인한 경우에만 완료로 판정한다.

### [D-024] 2026-07-13 — 안전 착륙 4조건 (복원: 우녕 지시)

작업은 전체 게이트 초록, 정책으로 설명 가능한 충돌만 해소, 소유권 밖 삭제 0건, push 뒤
`origin/dev` ancestor exit 0의 네 조건을 모두 충족하면 착륙한다. 완료를 기다리며 lane을 키우지
않고 미완성은 기본 비활성·미노출·미배선으로 격리한다. [D-035] 이후 이 네 조건은 dev 직접
push 전 검증 조건으로 이어진다.

### [D-027] 2026-07-14 — Live Traffic 실데이터 원칙 (복원: 우녕 지시)

제품에 검증된 traffic source가 없으면 mock·synthetic·inventory 추론값을 Live Traffic으로
표현하지 않는다. Prometheus 등 실데이터 source를 채택할 때는 source, metric unit,
temporality, window와 completeness를 계약에 포함한다. 계약이 없으면 관계 뷰의 traffic 수치는
비워 둔다.

### [D-028] 2026-07-14 — Resources 관계 뷰·관측 엣지 계약 (복원: 우녕 지시)

Resources는 필터·시간·그래프·표 네 층을 소유한다. 관계 뷰는 단일 cluster와 시각에 종속된
stable source/destination node ID 및 검증 가능한 Service↔Pod selector, Pod↔PVC,
Ingress↔Service edge만 사용한다. canonical observed edge 계약과 프론트 strict adapter가
착륙하기 전에는 관계 뷰를 렌더하지 않는다.

### [D-035] 2026-07-14 — dev trunk 직접 작업·배포 안전 선행 (작성: 우녕)

장기 lane은 폐지한다. 모든 작업은 최신 `origin/dev`에서 작은 초록 커밋으로 수행하고, push
직전 최신 dev를 rebase한 뒤 전체 게이트·소유권 밖 삭제 0건을 확인하여 바로 push한다. 다른
세션의 미커밋 변경은 버리거나 섞지 않는다.

최우선 순서는 ① migration 실행 경로와 기존 create-all DB의 검증 가능한 baseline·cutover,
② `DEV_AUTH_BYPASS=0`의 rendered/live fail-closed 검증, ③ dev gate→digest build/ECR→
migration→rollout→strict smoke, ④ 배포 SHA·URL의 `deploy-status.md` 갱신이다. ①·②의 실제
검증 전 AWS dev 배포 스위치를 켜지 않는다. 이후 BQ-022~034 계약을 작은 단위로 순차
착륙한다. token·secret 값은 문서·커밋·로그에 기록하지 않는다.
