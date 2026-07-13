---
title: 백엔드 F 작업 큐
status: active-work-queue
date: 2026-07-13
owners: 백엔드 세션 claim·처리 / 사람 승인
governing: docs/f-coordination-plan.md (공통 불변식) · docs/oss-remediation-roadmap.md §7 (F 정의)
anchor_format: "계약 완성: <route 상수 또는 기능명> (<commit hash>)"
---

# 백엔드 F 작업 큐

api-needs.md와 같은 규율로 운영한다. 작업 상태는 `requested`/`in_progress`/`completed`/`blocked`,
착륙 상태는 `landed`/`done-pending-merge`를 쓴다.
`src/packages/contracts/gateway/**`를 수정하는 행은 **동시에 1행만 in_progress** 허용
(공유 계약 파일 lock). F0은 gateway 계약을 건드리지 않으므로 병행 가능.

모든 행 공통 완료 기준:
(1) additive-only 준수 (기존 필드 rename·삭제·타입변경 0건)
(2) 단위 테스트 추가 + `bash scripts/test.sh` 전체 통과. [D-012]에서 RCA baseline이
    공집합이 되어 델타-그린은 만료됐으며 이후 예외 없이 전체 통과만 인정한다.
(3) 신규 route는 Bruno collection(docs/api)에 요청 추가
(4) DB 변경은 마이그레이션 동반
(5) progress 파일 EOF에 앵커 기록. 앵커 없이는 프론트가 소비하지 않는다.

R-트랙([D-011])은 dev merge `257f91846`으로 landed/closed 되었고, 전용 worktree와
로컬 `codex/rca-baseline-convergence` 브랜치는 [D-012] 회수 절차로 삭제 완료했다.

## 큐 (권장 순서대로)

| ID | 상태 | 기능 | 작업 내용 | 신규 계약(제안 — 백엔드가 확정) | 완료 기준 추가분 |
|---|---|---|---|---|---|
| BQ-001 | landed | 배관 | `AcceptedResponse`에 `command_id` optional 필드 추가, command 제출 경로에서 채움 (Cross-Gap-001)<br>담당: Codex 백엔드 세션<br>브랜치: `codex/bq-001-command-id-receipt` | 기존 `COMMANDS_PATH` 응답 확장(additive) | 기존 응답 소비자 회귀 테스트 |
| BQ-002 | landed | F2 배관 | `audit_log`에 `causation_id` 컬럼 추가 + envelope에서 적재 + correlation_id/created_at 복합 인덱스<br>담당: Codex 백엔드 세션<br>브랜치: `codex/bq-002-audit-causation` | (route 없음) | 마이그레이션 up/down 검증 |
| BQ-003 | landed | F1 | RemediationBundle serializer: rca_reports·evidence·recovery candidate 기존 필드를 재조합해 단일 문서로. supporting/missing 2분류(반증 없음). JSON Schema 문서 동반<br>담당: Codex 백엔드 세션<br>브랜치: `codex/bq-003-remediation-bundle` | `RCA_BUNDLE_PATH` `GET /api/rca/bundles/{correlation_id}` → `RemediationBundleResponse` | 신규 저장 모델 0개 (투영만) |
| BQ-004 | landed | F2 | correlation 타임라인 조회: C0의 신뢰 `workspace_id` 귀속을 기준으로 audit_log를 correlation_id 시간순 반환 (subject, source, created_at, causation_id, payload 요약)<br>담당: Codex 백엔드 세션<br>착륙 merge: `17ac2b7a3`<br>코드: `66cbe8dec` | `AUDIT_TIMELINE_PATH` `GET /api/audit/timeline?correlation_id=` → `AuditTimelineResponse` | 커서 페이지네이션 |
| BQ-005 | landed | F4 | 변경↔장애 상관 projection: 성공 배포만 워크로드 키 `(workspace, cluster, ns, kind, name)`로 인덱싱하는 테이블+신규 projection 워커 + 인시던트 event-time 이전 최근 변경 조회 route<br>담당: Codex 백엔드 세션<br>착륙 merge: `17ac2b7a3`<br>코드: `81969f23e`, 회귀 정합: `616ef652c` | `RCA_RECENT_CHANGES_PATH` `GET /api/rca/incidents/{incident_id}/recent-changes` → `RecentChangeListResponse` | 기존 워커 수정 0건 (신규 구독자만) |
| BQ-006 | landed | F3 | 승격 게이트 노출: `on_run_completed_promote` 현행 조건(rollout health 포함)을 응답/문서로 노출. 관측 윈도우 게이트는 별도 후속 행으로 분리(지금 하지 않음) | 기존 workflow run 응답에 `promotion_gate` 필드 추가(additive) | `308e0bb6b` (canonical merge `8cd0b18e9`) |
| BQ-007 | landed | F5 | RolloutDiagnosed(next_action≠observe) → 직전 정상 이미지 patch 생성 → SafePrRequested 발행 배선. **`RECOVERY_ENABLE_AUTO_REVERT_PR` flag(기본 false) 필수**<br>담당: Codex 백엔드 세션<br>canonical merge: `6d68325bf` | (신규 route 없음, 이벤트 배선) | flag off에서 무발화 테스트 / on에서 sandbox E2E, 전체 `1820 passed, 3 skipped` |
| BQ-008 | landed | F0 (병행 가능) | in-process event bus: `EventConsumerBus` Protocol 구현(내부 큐 + ack/nak/재배달 에뮬) + `WorkerService`/`App.run()` bus 파라미터 배선. NATS 기본값 유지<br>담당: Codex 백엔드 세션<br>착륙 merge: `5f2393667`<br>코드: `b6fac1dd7`, 회귀 정합 HEAD: `6ec2553b7` | (계약 변경 없음 — 기존 Protocol 구현 추가) | 기존 NATS 경로 회귀 테스트 |
| BQ-009 | landed | 권위 patch 엔진 ([D-010] 1항, [D-012] read port 승인, [D-019] 배선 예외 승인) | `GitOpsAuthorityReadPort`를 dispatcher에 주입하고 patch 시점에 workflow/diff/active binding/repository/provenance를 재검증. exact base 원문의 scalar span만 바꾸는 `GitOpsScalarPatch` 6종과 exact inverse rollback, 권위 부재/불일치/미지원 fail-closed 구현.<br>코드: `a5f7c9a3d`, scorer: `73f4b8b51`<br>canonical merge: `6d68325bf` | (gateway 계약 변경 없음; read-only port는 계약 lock 비대상) | scorer 6/6 PASS, 전체 `1820 passed, 3 skipped`; `33fd5f21c` origin/dev ancestor exit 0 |
| BQ-010 | landed | 카탈로그 정비 ([D-010] 2항) | `oom_memory`/`replica_scale`/`image_rollback`/`image_tag_fix`/`probe_fix`/`selector_fix` 선언 파라미터화. `gitops_recovery_review`만 문서 action으로 격리하고 실제 patch보다 score 하향.<br>코드: `15d28020b`<br>canonical merge: `6d68325bf` | (gateway 계약 변경 없음) | 카탈로그 계약 + 전체 `1820 passed, 3 skipped`; scorer 6/6 PASS |
| BQ-011 | landed | release_flow 분해 ([D-010] 3항, **H 이후 착수**) | `release_flow/router.py`를 `_support`/policy/readiness/verification/report 내부 모듈로 behavior-preserving 분해하고 router 호환 export와 import-linter 방향 계약을 유지.<br>담당: Codex 백엔드 세션<br>착륙 merge: `37498fc71`<br>코드: `bd4730d85` | (계약 변경 없음 — 내부 구조만) | router 5,297→1,821줄, 전체 `1868 passed, 3 skipped`, import-linter 8 kept/0 broken, manifest 69/20 |
| BQ-012 | landed | **AI fallback 근거 검증 구멍 수정 ([D-016] — P급 우선순위)** | LLM은 실제 catalog cause ID만 hypothesis로 제안하고 title/evidence/check/signal은 catalog에서 복원. catalog 밖·signal 없는 ID는 무발행, 내용 signal 미검증은 `insufficient_evidence`, 검증된 signal만 completion 허용. RED `c882010de`, GREEN/origin `ea5b3ed20` | (gateway 계약 변경 없음) | 조작 source-name-only blocked + 실제 OOM signal completed + catalog 밖 ID 거부, 관련 56 passed, 전체 `1647 passed, 3 skipped`, 계약 문서 착륙 |
| BQ-013 | landed | single-writer invariant ([D-017]) | `reconciler_mode=builtin`(기본)/`argocd`(observer). argocd 모드에서 자체 apply 경로 차단 + 무발화 테스트 | `50df7fe10` (canonical merge `27cb1d95f`) | argocd 모드 apply 0건 증명 + 전체 그린 |
| BQ-014 | landed | Argo observer 어댑터 ([D-017], BQ-013 이후) | Application repo/revision/path·sync/health, Rollouts stable revision 읽기 전용. Argo 리소스 변경 금지. 사후 검증 연계.<br>담당: Codex 백엔드 세션<br>착륙 merge: `0b4298c4e`<br>코드: `16c58de56` | (읽기 전용 어댑터; gateway 계약 무접촉) | GET·get/list 전용, apply 0건, 전체 `1838 passed, 3 skipped`; manifest 69/20 |
| BQ-015 | landed | `.remediation.yaml` 소스 계약 ([D-017], P 이후 같은 lane) | 저장소 소유자 선언 필드만 patch(helm-values/kustomize/raw/replica/probe). 추측 금지, 미선언 = unsupported<br>담당: Codex 백엔드 세션<br>착륙 merge: `130e6755d`<br>코드·문서: `1300a5fe6` | `packages.contracts.remediation_source` strict parser + SCM declared adapter | 미선언 no-write, raw/Helm/Kustomize scorer 6/6, 전체 `1865 passed, 3 skipped` |
| BQ-016 | landed | OSS 프로파일 ([D-017]) | PR-only 기본(agent read-only, direct command off), controller+PG+agent 3컴포넌트 설치. BQ-016 착륙 당시 40개였고 H3 auto-revert 합류 후 현재 41 entrypoint(controller 39/agent 2). `make demo`가 Kind→bad rollout→로컬 mock rollback PR/Bundle→정상화를 재현 | `f0c3b4e42` (조립 기능 `6abbbc8f4`, H3 정합 `f4b02ee95`) | 실제 controller+PostgreSQL 기동 및 health/ready 4개 200, graceful shutdown, 실제 `make demo` 성공, NATS/in-process service plan 동등성 |
| BQ-017 | landed | provider 1급화 + 연결 단계 ([D-018]) | `ClusterSummary.provider` optional(eks/gke/aks/onprem/kind/unknown; 등록값>providerID 자동감지>unknown) + `connection_stage` optional(token_issued→awaiting_install→agent_connected→snapshot_received→ready, +expired/error). 전부 additive<br>담당: Codex 백엔드 세션<br>착륙 merge: `d507ca6d4`<br>코드: `db4798d4e` | (기존 응답 확장; gateway 계약 lock 해제) | 프론트 호환 `bfaf03901`, 기존 소비자 회귀 + providerID 3사 감지, 전체 `1831 passed, 3 skipped` |
| BQ-018 | landed | Opsia 이름 전파 ([D-023]) | `docs/oss/**` 공개 제품명을 Opsia/opsia로 정리하고 roadmap·README 표기와 Helm OCI 예시를 정합화.<br>담당: Codex 백엔드 세션<br>착륙 merge: `ad28cc945`<br>문서: `46ea10f8f` | (docs-only; 코드 식별자·event subject·DB schema 변경 없음) | 전체 `1838 passed, 3 skipped`, manifest 69/20, 삭제·금지 rename 0건 |

## 보조 대기열 착륙 현황

| ID | 상태 | 기능 | 착륙 증거 | 완료 기준 |
|---|---|---|---|---|
| S1 | landed | RCA 읽기 route의 Bruno 기본 실행 경로 | feature `6d29a8702`, canonical merge `6ea12f263` | Runner 13→14→15 순서, 의미·실제 200 기준 문서화, 전체 `1869 passed, 3 skipped`, manifest 69/20 |
| S2 | landed | OpsiaBench scheduling·PVC 시나리오 | feature `075926e4d`, canonical merge `43867308a` | 각 2개, 전체 14개 scorer PASS, 실제 catalog snapshot 정합, 전체 `1872 passed, 3 skipped`, manifest 69/20 |
| S3 | landed | rule candidate 상위 10개 안전 계약 | feature `0a1a0b99a`, canonical merge `a77115d41` | 10/87 후보의 required evidence·실제 signal·실행 capability·허용/금지 remediation·rollback·사후 검증을 공개 scorer로 검산, 전체 `1899 passed, 3 skipped`, manifest 69/20 |
| S4 | landed | 아침 요약·완료 상태 문서 정합 | feature `356bef2e2`, canonical merge `5aa8fa006` | 큐 상태 허용 어휘·실물 앵커 수 회귀, A~K/J 경계와 04:30 snapshot 구분, 전체 `1901 passed, 3 skipped`, manifest 69/20 |
| S5 | landed | rule candidate 11~20 안전 계약 | feature `b2b6baeb0`, canonical merge `59a9c460b` + hardening merge `5bc68f5cd` | fallback-only 10개 exact 계약, 두 배치 digest·누락 잠금·81~87 terminal 범위 검증, 전체 `1908 passed, 3 skipped`, manifest 69/20 |
| S6 | landed | rule candidate 21~30 안전 계약 | feature `8f0ee335f`, canonical merge `efdde0a31` | 25번만 `safe_pr`, 26·27번은 approval-only, exact fixture 25·26번, 세 번째 digest 잠금, 전체 `1911 passed, 3 skipped`, manifest 69/20 |
| S7 | landed | rule candidate 31~40 안전 계약 | feature `296e14c38`, canonical merge `6ebd0f6bd` | 36·37번 `command`, 38번 `command+safe_pr`, fixture gap 보존, 네 번째 digest 잠금, 전체 `1914 passed, 3 skipped`, manifest 69/20 |
| S8 | landed | rule candidate 41~50 안전 계약 | feature `5995350c4`, canonical merge `910825ec4` | 41~49 fallback-only, 50번 `safe_pr`+exact probe fixture, 다섯 번째 digest 잠금, 전체 `1917 passed, 3 skipped`, manifest 69/20 |
| S9 | landed | rule candidate 51~60 안전 계약 | feature `5ce8132b0`, canonical merge `66115a2d7`, capability correction `94c419a80` | 51·52·55 `safe_pr`; 53은 producer 부재로 capability 없음, fixture 51·52·53·55·56, 전체 `1943 passed, 3 skipped`, manifest 69/20 |
| S10 | landed | rule candidate 61~70 안전 계약 | feature `aed4bf78b`, canonical merge `de0b27609` | 10개 fallback-only, resource/config 추론 금지와 일곱 번째 digest, 전체 `1923 passed, 3 skipped`, manifest 69/20 |
| S11 | landed | rule candidate 71~80 안전 계약 | feature `dd2006904`, canonical merge `cb099e5eb` | scheduling 선언과 dispatcher 경계, fixture 73·75·78, 여덟 번째 digest, 전체 `1925 passed, 3 skipped`, manifest 69/20 |
| S12 | landed | rule candidate 81~87 terminal 안전 계약 | feature `aafc4a956`, canonical merge `dc0b775ff` | 87/87 완결, 7개 fallback-only, fixture 82번, terminal digest, 전체 `1927 passed, 3 skipped`, manifest 69/20 |
| S13 | landed | scheduling node selector 시나리오 | feature `dea2d4bab`, canonical merge `584e2eda0` | scheduling 3개·전체 15개, ordinal 76 fallback fixture, 여덟 번째 digest 재감사, 전체 `1928 passed, 3 skipped`, manifest 69/20 |
| S14 | landed | AsyncDb 호출 경계 직접 테스트 | feature `effec9f6d`, canonical merge `b37a94d95` | test-only 5개, thread hop·active connection 재사용·예외 전파, 전체 `1933 passed, 3 skipped`, manifest 69/20 |
| S15 | landed | probe timeout 시나리오 | feature `b96a69810`, canonical merge `2d9ef3fc2` | probe 3개·전체 16개, ordinal 52 safe-pr fixture, 여섯 번째 digest 재감사, 전체 `1934 passed, 3 skipped`, manifest 69/20 |
| S16 | landed | kubectl server dry-run adapter 직접 테스트 | feature `ccdcc1a08`, canonical merge `01dc63558` | test-only 8개, apply→get·tmp cleanup·오류/timeout 매핑, 전체 `1942 passed, 3 skipped`, manifest 69/20 |
| S17 | landed | OpsiaBench probe startup window 시나리오 | feature `67014a028`, correction `94c419a80`, canonical `8f84ecdc0` | probe 4개·전체 17개, ordinal 53 exact fixture, producer-aware manual 경계, 전체 `1943 passed, 3 skipped`, manifest 69/20 |

## claim 규칙

0. **최초 claim 커밋에서 `docs/backend-f-progress.md`를 생성한다** (헤더 + "앵커 0건" 상태로).
   프론트 세션이 이 파일의 존재를 루틴으로 확인하므로, 완료 시점이 아니라 착수 시점에 만든다.
1. claim 전 이 파일 최신본 확인. `requested` 1행을 `in_progress`로 바꾸고 담당/브랜치를 적는 조율 커밋을 먼저 push.
2. BQ-001~BQ-007은 동시에 1행만. BQ-008은 예외적으로 병행 가능.
3. 기존 계약을 변경해야만 풀리는 문제를 만나면 작업 중단 → `blocked` + 사유 기록 → 사람 판단 대기.
4. 완료 후 앵커 기록, 행 제거는 프론트가 해당 앵커를 소비 확인한 뒤에만.

## 프론트 인계물 (앵커와 함께 전달되는 것)

- BQ-003: Bundle JSON Schema 파일 경로
- BQ-004: 타임라인 응답의 subject 분류 목록 (여정 뷰 렌더링용)
- BQ-005: RecentChange 항목의 필드 정의 (PR 링크·image·시각)
- BQ-007: revert PR의 safe_pr 이벤트 식별 방법 (기존 SafePrStatus 재사용)
