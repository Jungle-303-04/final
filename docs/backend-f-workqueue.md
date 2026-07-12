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
(2) 단위 테스트 추가 + `bash scripts/test.sh` 전체 통과 — 단, 다른 작업열 소유의
    기존 실패가 있는 동안은 f-coordination-plan.md §4의 **델타-그린 규칙** 적용
    (baseline 대비 신규 실패 0건 + 해당 BQ 신규 테스트 전부 통과)
(3) 신규 route는 Bruno collection(docs/api)에 요청 추가
(4) DB 변경은 마이그레이션 동반
(5) progress 파일 EOF에 앵커 기록. 앵커 없이는 프론트가 소비하지 않는다.

## 큐 (권장 순서대로)

| ID | 상태 | 기능 | 작업 내용 | 신규 계약(제안 — 백엔드가 확정) | 완료 기준 추가분 |
|---|---|---|---|---|---|
| BQ-001 | landed | 배관 | `AcceptedResponse`에 `command_id` optional 필드 추가, command 제출 경로에서 채움 (Cross-Gap-001)<br>담당: Codex 백엔드 세션<br>브랜치: `codex/bq-001-command-id-receipt` | 기존 `COMMANDS_PATH` 응답 확장(additive) | 기존 응답 소비자 회귀 테스트 |
| BQ-002 | landed | F2 배관 | `audit_log`에 `causation_id` 컬럼 추가 + envelope에서 적재 + correlation_id/created_at 복합 인덱스<br>담당: Codex 백엔드 세션<br>브랜치: `codex/bq-002-audit-causation` | (route 없음) | 마이그레이션 up/down 검증 |
| BQ-003 | landed | F1 | RemediationBundle serializer: rca_reports·evidence·recovery candidate 기존 필드를 재조합해 단일 문서로. supporting/missing 2분류(반증 없음). JSON Schema 문서 동반<br>담당: Codex 백엔드 세션<br>브랜치: `codex/bq-003-remediation-bundle` | `RCA_BUNDLE_PATH` `GET /api/rca/bundles/{correlation_id}` → `RemediationBundleResponse` | 신규 저장 모델 0개 (투영만) |
| BQ-004 | requested | F2 | correlation 타임라인 조회: audit_log를 correlation_id로 시간순 반환 (subject, source, created_at, causation_id, payload 요약) | `AUDIT_TIMELINE_PATH` `GET /api/audit/timeline?correlation_id=` → `AuditTimelineResponse` | 커서 페이지네이션 |
| BQ-005 | requested | F4 | 변경↔장애 상관 projection: gitops 배포 이벤트를 워크로드 키 `(workspace, cluster, ns, kind, name)`로 인덱싱하는 projection 워커(신규 구독자) + 인시던트의 워크로드 키로 직전 N개 변경 조회 route | `RCA_RECENT_CHANGES_PATH` `GET /api/rca/incidents/{incident_id}/recent-changes` → `RecentChangeListResponse` | 기존 워커 수정 0건 (신규 구독자만) |
| BQ-006 | requested | F3 | 승격 게이트 노출: `on_run_completed_promote` 현행 조건(rollout health 포함)을 응답/문서로 노출. 관측 윈도우 게이트는 별도 후속 행으로 분리(지금 하지 않음) | 기존 workflow run 응답에 `promotion_gate` 필드 추가(additive) | — |
| BQ-007 | requested | F5 | RolloutDiagnosed(next_action≠observe) → 직전 정상 이미지 patch 생성 → SafePrRequested 발행 배선. **`RECOVERY_ENABLE_AUTO_REVERT_PR` flag(기본 false) 필수** | (신규 route 없음, 이벤트 배선) | flag off에서 무발화 테스트 / on에서 sandbox E2E |
| BQ-008 | done-pending-merge | F0 (병행 가능) | in-process event bus: `EventConsumerBus` Protocol 구현(내부 큐 + ack/nak/재배달 에뮬) + `WorkerService`/`App.run()` bus 파라미터 배선. NATS 기본값 유지<br>담당: Codex 백엔드 세션<br>브랜치: `codex/f-inprocess-event-bus` | (계약 변경 없음 — 기존 Protocol 구현 추가) | 기존 NATS 경로 회귀 테스트 |

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
