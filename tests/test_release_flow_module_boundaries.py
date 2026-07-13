from __future__ import annotations

import ast
import importlib
from pathlib import Path

from domains.release_flow import router as release_router

ROOT = Path(__file__).resolve().parents[1]
RELEASE_FLOW_DIR = ROOT / "src" / "domains" / "release_flow"

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


def test_release_flow_internal_modules_do_not_import_router_backwards() -> None:
    for module_name in EXPECTED_EXPORTS:
        source = (RELEASE_FLOW_DIR / f"{module_name}.py").read_text()
        tree = ast.parse(source)
        imported = {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        }
        imported.update(
            node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)
        )
        assert "domains.release_flow.router" not in imported
        assert not any(value.endswith(".release_flow.router") for value in imported)


def test_release_flow_router_is_reduced_to_transport_and_orchestration() -> None:
    assert len((RELEASE_FLOW_DIR / "router.py").read_text().splitlines()) < 2_000
