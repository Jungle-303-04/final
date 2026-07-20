from __future__ import annotations

import importlib

from domains.release_flow import router as release_router

EXPECTED_EXPORTS = {
    "_support": {
        "first_environment",
        "int_field",
        "plan_settings_value",
        "step_config",
    },
    "policy": {
        "active_release_run_blockers",
        "release_execution_blockers",
        "release_production_change_ticket_blockers",
        "release_rollback_policy_blockers",
        "release_safe_pr_evidence_blockers",
    },
    "readiness": {
        "readiness_check",
        "release_dispatch_guard_snapshot",
        "release_dispatch_readiness_snapshot",
        "release_readiness_from_plan",
        "release_readiness_next_actions",
    },
    "report": {
        "filter_release_runs",
        "release_audit_csv",
        "release_run_handoff",
        "release_run_report",
        "release_run_summary_from_runs",
    },
    "verification": {
        "release_verification_job_advance_blockers",
        "release_verification_job_id",
        "release_verification_job_specs",
        "release_verification_job_status",
        "release_verification_job_pending_timeouts",
    },
}


def test_release_flow_internal_modules_are_router_compatible_facades() -> None:
    for module_name, names in EXPECTED_EXPORTS.items():
        module = importlib.import_module(f"domains.release_flow.{module_name}")
        for name in names:
            assert getattr(release_router, name) is getattr(module, name)
