---
title: 백엔드 F 진행 현황
status: active-progress
date: 2026-07-13
governing: docs/f-coordination-plan.md · docs/backend-f-workqueue.md
---

# 백엔드 F 진행 현황

현재 상태: **앵커 5건**

## Delta-green baseline

- 측정 기준 commit: `e3c1de4a8eeb49a4630bab816d2bbd18444c80a5`
- pytest: `uv run python -m pytest -q` → `6 failed, 1630 passed, 3 skipped`
- Ruff lint: `uv run ruff check src scripts tests` → PASS
- Ruff format: `uv run ruff format --check src scripts tests` → 기존 대상 2개
- import-linter: `PYTHONPATH=src uv run lint-imports --config .importlinter` → 기존 위반 계약 1개
- compileall: `uv run python -m compileall -q src scripts` → PASS
- manifest: `bash scripts/manifest-check.sh` → PASS (management 68개, target 20개)
- 판정 규칙: 완료 후 전 게이트 실패 집합이 아래 목록과 동일하거나 축소돼야 한다.

### 허용된 기존 실패 node

- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[crashloop]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[imagepull]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[oom]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[sched-fail]` — RCA 작업열
- `tests/test_rca_evidence.py::test_crashloop_flow_auto_selects_restart_and_queues_command` — RCA 작업열
- `tests/test_rca_scenario_cli.py::test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts` — RCA 작업열

### 허용된 기존 Ruff format 대상

- `tests/test_bruno_collection.py` — Bruno/API 계약 작업열
- `tests/test_rca_rule_catalog.py` — RCA 작업열

### 허용된 기존 import-linter 위반 계약

- `domains.rca.router -> services (l.77)` — RCA 작업열

### Manifest baseline

- `scripts/manifest-check.sh` PASS — 배포 manifest 작업열, 실패 0건

## 완료 앵커

### BQ-001

- 완료 후 측정: `6 failed, 1626 passed, 3 skipped`
- delta-green 판정: baseline 실패 node 6개 동일, 신규 실패 0건
- `command_id` non-null: recorded approval이 필요하지 않은 command 제출 경로
- `command_id` null: recorded approval이 필요한 경로. 제출 시점에는 worker가 확정하는
  `approval_decided_by`와 `approval_expires_at`가 없어 정확한 ID를 파생할 수 없다.

계약 완성: AcceptedResponse.command_id receipt (4e6216052f4505fa247d9ed8be033477447696d7) [delta-green]

### BQ-002

- canonical 착륙 commit: `1080363a735e42a4cf542a11400a32ddaa0e9437`
- 완료 후 측정: `6 failed, 1630 passed, 3 skipped`
- delta-green 판정: 상단 RCA pytest 6개, Ruff format 2파일, import-linter 1계약과
  실패 집합이 동일하며 신규 실패 0건
- 프론트 인계: `ix_audit_log_correlation_id_created_at`는 BQ-004 correlation 타임라인
  조회의 선행 조건이다. `causation_id`는 nullable이므로 기존 행은 `null`이다.
- API 영향: 신규 route가 없어 Bruno 변경 없음
- 후속 검증: 실 PostgreSQL online upgrade/downgrade/upgrade는 Alembic revision 전환
  작업의 필수 게이트로 이관한다. 현재 스키마 부트스트랩은 `create_all` 경로를 사용한다.

계약 완성: audit_log.causation_id + ix_audit_log_correlation_id_created_at (1080363a735e42a4cf542a11400a32ddaa0e9437) [delta-green]

### BQ-003

- canonical 착륙 commit: `44f35234e7dcd9c8d221242d7688556e2d30e819`
- 완료 후 측정: `6 failed, 1640 passed, 3 skipped`
- delta-green 판정: 상단 RCA pytest 6개, Ruff format 2파일, import-linter 1계약과
  실패 집합이 동일하며 신규 실패 0건
- gateway 계약 lock: BQ-003을 `completed`로 전환해 해제
- route: `GET /api/rca/bundles/{correlation_id}`
- JSON Schema: `docs/spec/remediation-bundle.schema.json`
- Bruno: `docs/api/05-rca-dashboard/13-remediation-bundle.bru`

#### 프론트 인계 — RemediationBundleResponse 3계층

- `meta`
  - `correlation_id: string`
  - `incident_id: string | null`
  - `cluster_id: string`
  - `workspace_id: string`
  - `created_at: string | null`
- `diagnosis`
  - `root_cause: string`
  - `confidence: number | null`
  - `supporting_evidence: string[]`
  - `missing_evidence: string[]`
  - `supporting_evidence_refs: RcaEvidenceRefItem[]`
  - `missing_evidence_checks: RcaMissingCheckItem[]`
  - `selected_candidate_id: string | null`
- `RcaEvidenceRefItem`
  - 필수: `source: string`, `name: string`
  - 선택: `check_id`, `summary`, `query`, `evidence_ref`, `source_version`, `collector`,
    `collector_version`, `query_version`, `collected_at`, `evidence_key`, `source_id`,
    `agent_id`, `window_start`는 `string | null`
  - 선택: `schema_version: integer | null`
- `RcaMissingCheckItem`
  - `check_id: string`
  - `source: string | null`
  - `status: string | null`
  - `reason: string | null`
- `remediation: null | object`
  - `status: string`
  - `selected_action_id: string | null`
  - `selected_by: string | null`
  - `candidates: RemediationBundleRecoveryCandidate[]`
  - `evidence_ref: string`
- `RemediationBundleRecoveryCandidate`
  - `action_id: string`
  - `title: string`
  - `description: string`
  - `route: string`
  - `rank: integer`
  - `score: number`
  - `risk_level: string`
  - `blast_radius: string`
  - `approval_required: boolean`
  - `prerequisites: string[]`
  - `validation_checks: string[]`
  - `rollback_plan: string`
  - `evidence_refs: string[]`
  - `draft.action_type: string`
  - `draft.namespace: string`

  - `draft.resource_kind: string`
  - `draft.resource_name: string`
  - `draft.reason: string`
  - `draft.risk_level: string`
  - `draft.dry_run: boolean`
  - `draft.source_evidence: string[]`
  - `draft.params: JSON object`

`diagnosis.selected_candidate_id`는 RCA 진단 후보 선택이고,
`remediation.selected_action_id`는 복구 실행 후보 선택이다. 서로 다른 계층이므로 병합하거나
대체하지 않는다. recovery plan이 생성되지 않은 정상 상태에서는 `remediation`이 `null`이며
Bundle route는 200을 반환한다.

#### 알려진 결합 및 후속 전달

`RemediationBundleRecoveryCandidate`의 shape는
`recovery_plans.payload.candidates`를 그대로 투영한다. 이 payload 구조는 RCA 작업열이 쓰므로
가인 님이 candidate payload 구조를 바꾸면 프론트에 노출된 Bundle 계약의 breaking change가
된다. 후속 전달 항목: 가인 님에게 "recovery candidate payload 구조 변경은 BQ-003 Bundle
계약의 breaking change"임을 전달한다. 이 앵커에서는 RCA 작업열 코드를 변경하지 않는다.

계약 완성: RCA_BUNDLE_PATH + RemediationBundleResponse (44f35234e7dcd9c8d221242d7688556e2d30e819) [delta-green]

### H1 — 이벤트 테넌시·감사 타임라인·변경 상관

- canonical merge: `17ac2b7a32413579f2570218a99bf50f34d162c3`
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1701 passed, 3 skipped`
- 실측 계약: `docs/api/05-rca-dashboard/14-audit-timeline.bru`,
  `docs/api/05-rca-dashboard/15-recent-changes.bru`
- C 증거 해시 정합: [D-020]에 기록된 `7d74d765c`는 이전 rebase의 동등 커밋이며
  최신 `origin/dev` 재배치 후 실물은 `66cbe8dec`다. `7d74d765c`는 canonical ancestor가
  아니고 `66cbe8dec`는 ancestor exit 0이므로 후자를 유효 증거로 사용한다.
- 프론트 인계: 감사 타임라인은 subject/source/created_at/causation_id와 allowlist payload
  요약을 keyset cursor로 반환한다. 최근 변경은 incident event-time 이전의 성공 배포만
  반환하며 image before/after, commit, workflow run, 허용된 repository/PR 참조를 포함한다.

계약 완성: EventEnvelope.workspace_id + audit_log.workspace_id (625c382941f81b28d95bc4cde4e3c47155ef1eec) [green]

계약 완성: AUDIT_TIMELINE_PATH + AuditTimelineResponse (66cbe8dec7cb478f5b0774bb5e7bbaab5f616894) [green]

계약 완성: RCA_RECENT_CHANGES_PATH + RecentChangeListResponse (81969f23e46cb40743af08ffbc1affe556bd5c5e) [green]

### H2 — in-process event bus

- canonical merge: `5f2393667ece3607e75674fcf8c9be9d9c1773b9`
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1708 passed, 3 skipped`
- 기존 NATS 기본 경로는 유지하고 명시적으로 bus를 주입한 단일 프로세스 실행만
  in-memory 구현을 사용한다. ack/nak, 지연 재배달, 구독 생명주기, 기본 App 경로를
  `tests/test_in_memory_event_bus.py`에서 재현한다.
- 신규 route·DB 변경이 없어 Bruno·migration 변경 없음.

계약 완성: InMemoryEventBus + App.run bus injection (b6fac1dd742f3c5c88fee1db87e3e081fb1bc794) [green]

### BQ-006

- canonical 착륙 commit: `8cd0b18e96f1266873d1632486472d0d22c18477`
- 판정 단일 원천: `packages.contracts.gitops.promotion_gate_from_command_result`
- 공개 필드: workflow run의 optional `promotion_gate` — completed/applied/failed resources/
  rollout ready 검사와 `eligible`을 구조화
- 전체 게이트: Ruff·format PASS, import-linter 2 kept/0 broken, pytest
  `1720 passed, 3 skipped`
- 실측: `docs/api/10-applications/06-list-runs.bru`가 구조와 eligible 계산을 검산

계약 완성: WorkflowRun.promotion_gate (8cd0b18e96f1266873d1632486472d0d22c18477) [green]

### BQ-016 — OSS 안전 프로파일과 단일 controller 조립

- canonical origin: `f0c3b4e42f29c4f011d4d70910b083f7acc031e0`
- 공개 기본값: in-process event bus, agent read-only/direct command off, remediation PR-only,
  production auto-merge 금지
- 조립: 발견된 40 entrypoint를 controller 38(worker 32, async 4, HTTP 2)과 agent 2에
  정확히 한 번 배정. NATS/in-process 모드의 service signature는 동일하다.
- 설치: `deploy/oss/kubeheal-oss.yaml`의 controller Deployment + PostgreSQL StatefulSet +
  agent DaemonSet 3컴포넌트. NATS/Redis 의존은 공개 프로파일에 없다.
- 실제 기동: PostgreSQL 16과 controller 조립 루트를 연결해 API/realtime gateway의
  `/healthz`, `/readyz` 4개 응답이 모두 HTTP 200이고 SIGINT 후 두 서버가 graceful
  shutdown 되는 것을 확인했다. macOS arm64에서 드러난 SQLAlchemy async `greenlet`
  marker 누락은 직접 런타임 의존성으로 고정했다.
- 실측: 실제 `make demo`가 `kind-cluster-ready` → `bad-rollout-observed` →
  `mock-rollback-pr-created` → `workload-normalized`를 완료하고 cluster를 정리했다.
  canonical RemediationBundle checksum은
  `a0b2b2857701655e9c09ef51ad9cdf5a0e04a87d26a17cad6861d4e0bee897c9`다.
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken, pytest
  `1735 passed, 3 skipped`.

계약 완성: OSS PR-only profile + ControllerRuntime + make demo (f0c3b4e42f29c4f011d4d70910b083f7acc031e0) [green]
