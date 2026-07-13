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
| BQ-016 | in_progress | OSS 프로파일 ([D-017]) | controller+PostgreSQL+agent 로컬 Helm/Kind 설치 `7bb74d71f`, JetStream/in-process clean-run 결과 동등성 `82a7f29f2`, production `GithubScmProvider`·outbox·worker chain을 통한 실제 Git Safe PR 생성/분리 reviewer 병합/외부 GitOps actor 정상화 `9b107d8e9`까지 실증. local fixture이고 공개 OCI는 403 | 기존 조립 `f0c3b4e42`, 로컬 Helm `7bb74d71f`, 버스 실측 `82a7f29f2`, Safe PR 실측 `9b107d8e9` | 동일 artifact OCI 공개 설치와 console/access, hosted SCM review, 실제 Argo 계열 continuous reconcile을 실증한 뒤에만 landed 복귀. 프로세스 crash 내구성은 두 bus mode가 동등하지 않음을 명시 |
| BQ-017 | landed | provider 1급화 + 연결 단계 ([D-018]) | `ClusterSummary.provider` optional(eks/gke/aks/onprem/kind/unknown; 등록값>providerID 자동감지>unknown) + `connection_stage` optional(token_issued→awaiting_install→agent_connected→snapshot_received→ready, +expired/error). 전부 additive<br>담당: Codex 백엔드 세션<br>착륙 merge: `d507ca6d4`<br>코드: `db4798d4e` | (기존 응답 확장; gateway 계약 lock 해제) | 프론트 호환 `bfaf03901`, 기존 소비자 회귀 + providerID 3사 감지, 전체 `1831 passed, 3 skipped` |
| BQ-018 | landed | Opsia 이름 전파 ([D-023]) | `docs/oss/**` 공개 제품명을 Opsia/opsia로 정리하고 roadmap·README 표기와 Helm OCI 예시를 정합화.<br>담당: Codex 백엔드 세션<br>착륙 merge: `ad28cc945`<br>문서: `46ea10f8f` | (docs-only; 코드 식별자·event subject·DB schema 변경 없음) | 전체 `1838 passed, 3 skipped`, manifest 69/20, 삭제·금지 rename 0건 |
| BQ-019 | landed | VP-003 이벤트 여정 계약 | `AuditTimelineItem`에 자기 `event_id`와 서버 권위의 `journey_stage`를 additive로 노출한다. 현재 `EventSubject` 65개는 exact map으로 전부 분류하며 미지 subject만 `unknown`으로 강등한다.<br>담당: Codex 백엔드 세션<br>착륙 merge: `29403eb83`<br>코드: `b729ee6e4` | 기존 `AUDIT_TIMELINE_PATH` 응답 확장(additive) | 부모 `causation_id`와 자기 `event_id` 구분, 65/65 subject 분류, Bruno, 전체 `1963 passed, 3 skipped`; 프론트 strict schema 인계 필요 |
| BQ-021 | landed | OSS 접속 계약 | UI/API/agent 동일 origin, access 5모드, server-authoritative external URL, self-only 제한, bootstrap Secret·NOTES, edge 보안 경계를 additive로 제공.<br>담당: Codex 백엔드 세션<br>코드: `ae9bc8d63`, 보안 교정: `e480b3246`<br>canonical merge: `e8fc3c878` | `ManagementAccessResponse`를 preflight/install 응답에 optional 추가, Helm values 계약 확장 | 로컬 Kind `make demo` exit 0, 전체 `2006 passed, 3 skipped`, 공개 OCI 403은 BQ-016의 외부 블로커로 유지 |
| GAP-002/003/004 | landed | Resources 필터 코어 | workspace-scoped facet catalog, multi-cluster resource query, 서버 Label facet/count를 additive route로 제공.<br>담당: Codex 백엔드 세션<br>코드: `87c0606e0`<br>canonical merge: `d5517ec14` | gateway 계약 lock 해제. 같은 축 OR, 다른 축 AND, Label 전부 AND, opaque cursor, total/completeness/snapshot metadata | 기존 route 무변경, 빈 권한 0건, PostgreSQL online up/down, 실제 다중 cluster·부분 snapshot 검증, 전체 `2051 passed, 3 skipped`; Label facet은 Resources 표면만 착륙 |
| GAP-010 | landed | Resources 단일 cluster 그래프 | Resources 필터와 같은 권한·snapshot revision에서 stable node·검증된 relation edge·drill-down identity를 additive route로 제공.<br>담당: Codex 백엔드 세션<br>코드: `914d34ff6`<br>canonical merge: `95ff11cc6` | gateway 계약 lock 해제. single-cluster만 허용, raw payload·cross-cluster edge 금지, relation 근거와 completeness 노출 | UID owner 근거·selector 3-state·snapshot pin·budget partial, Bruno, 전체 `2064 passed, 3 skipped`; Ruff/import 8/8/manifest 69·20 |
| GAP-005 | landed | Issues 필터 계약 | 기존 RCA timeline 응답은 유지하고, session workspace와 구체 `RCA_READ` cluster 집합 안에서 common/surface 축을 서버 조회하는 strict canonical route를 추가한다.<br>담당: Codex 백엔드 세션<br>코드: `d63498d5f`<br>canonical merge: `e2504278d` | gateway 계약 lock 해제. stable issue/detail identity, 같은 축 OR·축간 AND, opaque cursor, total/facet/completeness. 권위 source가 없는 값은 unavailable로 반환 | payload를 인가·필터 근거로 사용하지 않음, 빈 권한 0건, 비인가 scope 404, legacy row와 mutable projection의 partial 정직성, Bruno·migration·전체 `2100 passed, 3 skipped` |

## 프론트 계약 트랙 ([D-026] — 최우선)

**우선순위: 배포 P0 → 기존 계약(BQ-022~034) → BQ-035~038.** 계약 하나를 개별 착륙한
즉시 night-log에 앵커를 남긴다.

| ID | 상태 | GAP | 계약 내용 | 해제되는 프론트 단계 |
|---|---|---|---|---|
| BQ-022 | landed | GAP-010 | Resources filter와 동일 scope/revision의 single-cluster graph snapshot, 노드·검증된 edge, partial/restricted/completeness, drill-down identity.<br>기존 code: `914d34ff6`<br>canonical merge: `95ff11cc6` | 표/그래프 모드 — 기존 GAP-010 앵커 연결, 추가 source·gateway 계약 변경 0건 |
| BQ-023 | landed | GAP-005 | Issues common 3축 + severity/status/environment, facet payload, stable detail ID, cursor/total/completeness.<br>기존 code: `d63498d5f`<br>canonical merge: `e2504278d` | Issues 필터 — 기존 GAP-005 앵커 연결, 추가 source·gateway 계약 변경 0건 |
| BQ-024 | in_progress | GAP-006 | Applications/GitOps/Checks provider-neutral canonical list DTO + common/surface axes + cursor/facet/completeness.<br>Applications 하위 계약 착륙: code `e7196ea7f`, canonical merge `cbba9d28e`.<br>다음 안전 착륙 단위: GitOps strict list/facet. Checks와 Applications Label/cursor revision은 미노출·fail-closed 유지.<br>담당: Codex 백엔드 세션 | 세 화면 필터 — Applications 단계 해제, legacy `/applications` 유지. GitOps/Checks 잔여 |
| BQ-025 | requested | GAP-007 | Cluster 등록 preflight/register validation, command preview, resume/reissue, structured stage reason/error | 연결 위자드 |
| BQ-026 | requested | GAP-008 | Cluster 연결 해제 capability/permission, confirmation, operation receipt, terminal status | 클러스터 상세 삭제 |
| BQ-027 | requested | GAP-009 | 저장소 recognition, access, credential challenge, branch/default, manifest/remediation path cursor, operation status | 저장소 위자드 |
| BQ-028 | requested | GAP-001 | workspace catalog/current/switch receipt/session refresh/forbidden·deleted | workspace selector(최후순위) |
| BQ-029 | requested | GAP-011 | 필터 범위와 시간 범위·해상도를 받는 리소스 시계열 스냅샷. 없는 구간은 `gap`으로 반환하고 보간하지 않으며 opaque cursor를 사용 | 시간 슬라이더·그래프 재생 |
| BQ-030 | requested | GAP-012 | 필터된 워크로드 CPU·메모리 시계열 서버 집계. 데이터 없음은 `null`, completeness 3값, client fan-out 금지 | 표 스파크라인·상세 차트 |
| BQ-031 | requested | GAP-013 | 특정 시각의 node↔pod 배치와 노드 이름·용량·상태. 단일 cluster scope와 시각 종속을 강제 | 물리 뷰 그래프 |
| BQ-032 | requested | GAP-014 | 특정 workload·시각 ±N분의 bounded log window 조회. tail/stream 계약과 분리 | 우측 패널 로그 |
| BQ-033 | requested | GAP-015 | 시간 범위 안의 incident marker 목록. 기존 RCA projection 재사용 가능성을 먼저 검증 | 시간 슬라이더 marker |
| BQ-034 | requested | observed relation edge | 단일 cluster·시각 종속의 stable source/destination node ID와 Service↔Pod selector, Pod↔PVC, Ingress↔Service 검증 edge. traffic metric은 검증된 관측 source·unit·temporality·window가 있을 때만 additive로 포함 | Resources 관계 뷰 |
| BQ-035 | requested | dashboard capability catalog | `GET /dashboard/catalog`. 엔티티·측정·쪼개기·필터축·표현·크기 제약·프리셋의 정본. 프론트는 여기에 없는 조합을 제시하지 않는다. `gauge_max`가 `null`이면 게이지 표현이 목록에서 빠진다. | VP-011 위젯 조합 편집기 |
| BQ-036 | requested | dashboard defaults | `GET /settings/dashboard`. 저장 전이면 404가 아니라 서버 기본 배치를 반환한다. | VP-011 기본 대시보드 |
| BQ-037 | requested | dashboard persistence | `PUT /settings/dashboard`. 카탈로그 대조 검증(무효 조합 400), `order`·`widgets` 일치, workspace 격리(BOLA 방지), `revision` 낙관적 동시성(409)을 강제한다. | VP-011 배치 저장·동시성 |
| BQ-038 | requested | dashboard batch query | `POST /dashboard/query`. 위젯 배치 질의에서 **shape를 서버가 선언**하고 프론트는 추측하지 않는다. completeness 3값, **`scope_empty`와 `value: 0` 구분**, 시계열 결측의 명시적 gap(보간 금지), 위젯 하나 실패 시 나머지 반환(전체 500 금지)을 보장한다. **대시보드 필터 ∩ 위젯 필터의 교집합 연산은 서버가 수행**해 합성 규칙이 두 곳에 생기지 않게 한다. | VP-011 위젯 데이터·표현 파생 |

상세 의미는 `docs/spec/frontend/vp-010-unified-filter-ia.md` §9·§9.1과
`docs/spec/frontend/vp-012-timeline-graph-table.md` §2를 따른다.

## AWS dev 배포 P0

| 단계 | 상태 | 범위 | 안전 경계 |
|---|---|---|---|
| P0-0 | in_progress | dev 전체 gate 단일 진입점 + 로컬 pre-push + dev push CI. target preflight 회귀는 `4ea76988d`, gate 계약은 `753558ef2`, CI·hook은 `acaadc485`, 격리는 `5c5ea9481`, 20.44초 fast gate와 전체 pre-push 유지 가드는 `37dbd9673`로 착륙 | 로컬 pre-push 전체 gate는 PASS. GitHub Actions run `29271435680`은 runner 시작 전 결제·spending limit로 실패해 서버 강제는 미완료. 서버 gate가 실제로 복구되기 전에는 pre-push를 fast gate로 강등하거나 배포를 켜지 않음 |
| P0-1a | in_progress | service image Alembic runtime + direct PostgreSQL migration Job + versioned-only runner | unversioned/create-all DB 거부, AWS 경로 미배선. legacy baseline·fresh DB 경로는 다음 단위 |
| P0-1b | in_progress | immutable pre-Alembic snapshot bootstrap `b2786060d`와 create-all data-only 이관·metric lineage·cutover 불변식 `c8b75c2c6`, 회귀 `a94b64e25` 착륙 | 임의 stamp·기존 revision 수정·live 쓰기 금지. 로컬 코드·테스트는 착륙했지만 AWS catalog/data invariant, restore rehearsal, DBA 확인, connection cutover는 미실증이므로 완료 아님 |
| P0-2 | in_progress | `DEV_AUTH_BYPASS=0` base 강제 + rendered/live 공통 fail-closed 검증기 `7d4e6750f` 착륙 | 렌더 검증은 gate 편입 완료. 만료된 AWS 세션 복구 후 live Deployment가 0임을 실증하고 배포 파이프라인에 live 모드를 배선하기 전까지 배포 중단 |
| P0-3 | in_progress | dev gate → digest build/ECR → migration → 단계적 rollout. 명시 context·immutable digest만 허용하고 DB downgrade 없이 이전 이미지를 복원하는 경계 `3cf0b694a`, manifest 전체 기대 집합과 live digest를 대조해 private plan을 만드는 capture `b22edd791` 착륙 | `AWS_DEV_DEPLOY_ENABLED=1` exact opt-in, P0-1/P0-2 선행. migration Job·단계적 rollout·strict smoke workflow 배선은 잔여 |
| P0-4 | in_progress | smoke 기본 활성과 boolean 입력 정규화 `ba46caf49` 착륙 + Bundle/audit/recent-changes strict 200 | 기본 smoke는 활성화됐으며, 인증된 fixture 부재를 skip하지 않는 신규 API 실측과 실패 시 digest rollback 배선은 다음 단위 |
| P0-5 | requested | 배포 SHA·digest·URL `deploy-status.md` 갱신 | secret 값 기록 금지, status commit 재귀 방지 |

레거시 `main` AWS CD 변수 `AWS_AUTO_DEPLOY`는 2026-07-14에 `1→0`으로 닫았다. 새 dev
배포 스위치는 P0-1·P0-2의 live 증명이 끝나기 전에는 만들거나 켜지 않는다.

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
| S18 | landed | outbound deliver 직접 테스트 | feature `e43920262`, canonical `784996ce7` | test-only 5개, 성공·실패·취소·mapper 오류 원형 전파, source 0건, 전체 `1948 passed, 3 skipped`, manifest 69/20 |
| S19 | landed | OpsiaBench crashloop 포트 bind 충돌 시나리오 | feature `ff3b52812`, canonical `0dd8a200f` | crashloop 3개·전체 18개, ordinal 7 manual-only fixture, runnable JSON merge-patch 왕복, 전체 `1951 passed, 3 skipped`, manifest 69/20 |
| S20 | landed | target-agent SQLite 수명주기 테스트 | feature `720dd55c0`, canonical `13c30723a` | test-only, full-agent factory same-thread close·target-only GC guard·unrelated hook 전달, warning-strict 28 passed, 전체 `1953 passed, 3 skipped`, manifest 69/20 |
| S21 | landed | OpsiaBench crashloop 시작 권한 오류 시나리오 | feature `268ca859e`, canonical `de9e600c7` | crashloop 4개·전체 19개, ordinal 8 manual-only fixture, 실제 POSIX EACCES·generic 동점 선택·full-container merge-patch 왕복, 전체 `1957 passed, 3 skipped`, manifest 69/20 |
| S22 | landed | 의존성 기동 재시도 직접 테스트 | feature `80edc8449`, canonical `d0953f2c6` | test-only 5개, 첫 성공·N-1 재시도·한도·zero limit·task cancel, source 0건, 전체 `1962 passed, 3 skipped`, manifest 69/20 |

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
