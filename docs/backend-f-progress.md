---
title: 백엔드 F 진행 현황
status: active-progress
date: 2026-07-13
governing: docs/f-coordination-plan.md · docs/backend-f-workqueue.md
---

# 백엔드 F 진행 현황

현재 상태: **앵커 0건**

## Delta-green baseline

- 측정 기준 commit: `29421ab04091335477949b74b5f52a124ff998d5`
- 측정 명령: `uv run python -m pytest -q`
- 측정 결과: `6 failed, 1622 passed, 3 skipped`
- 판정 규칙: 완료 후 실패 node 집합이 아래 목록과 동일하거나 축소돼야 한다.

### 허용된 기존 실패 node

- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[crashloop]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[imagepull]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[oom]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[sched-fail]` — RCA 작업열
- `tests/test_rca_evidence.py::test_crashloop_flow_auto_selects_restart_and_queues_command` — RCA 작업열
- `tests/test_rca_scenario_cli.py::test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts` — RCA 작업열

## 완료 앵커

앵커 0건
