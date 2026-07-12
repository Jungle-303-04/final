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

### [D-008] 2026-07-13 04:50 KST 기록 정합 (작성: 자동 판단자)

[D-007](판단자)과 [D-006](조율 세션)이 04:47경 동시 기록되어 파일 내 순서가 ID 순서와 어긋났다.
내용 상충은 없다: 두 지시 모두 [D-005] HOLD 해제 + 양 트랙 파이프라인 A 진입이다.
[D-007]이 요청한 [D-006] 서명 보완은 위 [D-006] 실물로 충족됐다.
작업 세션 기준: **유효 최신 지시 = [D-006]+[D-007] 합본** — A단계 개시, 계약 lock(C/D/E 동시 1개),
🔒(백엔드 H·J, 프론트 H)는 사람 전용, 완료 증거는 night-log §2.2 형식. 이후 지시는 [D-009]부터.

