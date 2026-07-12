---
title: 백엔드 F 진행 현황
status: active-progress
date: 2026-07-13
governing: docs/f-coordination-plan.md · docs/backend-f-workqueue.md
---

# 백엔드 F 진행 현황

현재 상태: **앵커 2건**

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
