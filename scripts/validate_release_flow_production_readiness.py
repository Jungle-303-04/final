#!/usr/bin/env python3
"""Validate release-flow production readiness wiring before enabling deploys."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import yaml

try:
    from validate_release_flow_production_gate import validate_workflows
except ImportError:  # pragma: no cover - used when imported as scripts.*
    from scripts.validate_release_flow_production_gate import validate_workflows


REQUIRED_WORKFLOW_FILES = [
    Path(".github/workflows/release-flow-smoke.yml"),
    Path(".github/workflows/release-flow-production-gate.yml"),
    Path(".github/workflows/release-flow-gate-contract.yml"),
    Path(".github/workflows/release-flow-production-readiness.yml"),
]
REQUIRED_SCRIPT_FILES = [
    Path("scripts/release_flow_smoke.py"),
    Path("scripts/validate_release_flow_production_gate.py"),
]
REQUIRED_RUNTIME_CONFIG = {
    "api_base_url": ("RELEASE_FLOW_API_BASE_URL", "API_BASE_URL"),
    "auth_email": ("RELEASE_FLOW_AUTH_EMAIL", "AUTH_EMAIL"),
    "auth_password": ("RELEASE_FLOW_AUTH_PASSWORD", "AUTH_PASSWORD"),
}


@dataclass
class ReadinessCheck:
    name: str
    ok: bool
    detail: str


def load_yaml(path: Path) -> dict[str, Any]:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return loaded if isinstance(loaded, dict) else {}


def validate_readiness(*, require_runtime_config: bool = False) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    checks.extend(check_required_files())
    checks.extend(check_smoke_workflow_contract())
    checks.extend(check_smoke_script_contract())
    checks.extend(check_production_gate_contract())
    checks.extend(check_gate_contract_workflow())
    checks.extend(check_runtime_config(require_runtime_config=require_runtime_config))
    return checks


def check_required_files() -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    for path in [*REQUIRED_WORKFLOW_FILES, *REQUIRED_SCRIPT_FILES]:
        checks.append(ReadinessCheck(f"file.{path.as_posix()}", path.is_file(), "present" if path.is_file() else "missing"))
    return checks


def check_smoke_workflow_contract() -> list[ReadinessCheck]:
    path = Path(".github/workflows/release-flow-smoke.yml")
    if not path.is_file():
        return [ReadinessCheck("workflow.smoke", False, "release-flow-smoke.yml is missing")]
    workflow = load_yaml(path)
    call = workflow.get("on", {}).get("workflow_call", {})
    inputs = call.get("inputs", {}) if isinstance(call, dict) else {}
    secrets = call.get("secrets", {}) if isinstance(call, dict) else {}
    jobs = workflow.get("jobs", {})
    job = jobs.get("release_flow_smoke", {}) if isinstance(jobs, dict) else {}
    run = "\n".join(str(step.get("run", "")) for step in job.get("steps", []) if isinstance(step, dict))
    return [
        ReadinessCheck(
            "workflow.smoke.reusable",
            set(workflow.get("on", {})) == {"workflow_dispatch", "workflow_call"},
            "manual and reusable" if set(workflow.get("on", {})) == {"workflow_dispatch", "workflow_call"} else "missing trigger",
        ),
        ReadinessCheck(
            "workflow.smoke.outputs",
            {"release_smoke_ok", "release_smoke_failed_checks", "release_smoke_failed_count", "release_smoke_error"}
            <= set(call.get("outputs", {})),
            "gate outputs exported",
        ),
        ReadinessCheck(
            "workflow.smoke.secret_aliases",
            {"RELEASE_FLOW_API_BASE_URL", "RELEASE_FLOW_AUTH_EMAIL", "RELEASE_FLOW_AUTH_PASSWORD"} <= set(secrets),
            "uppercase repo secret aliases accepted",
        ),
        ReadinessCheck(
            "workflow.smoke.production_preflight",
            "production_preflight_run_limit" in inputs and "--production-preflight" in run,
            "production preflight is wired",
        ),
        ReadinessCheck(
            "workflow.smoke.runtime_config_preflight",
            "Missing release-flow API URL" in run
            and "Missing release-flow auth email" in run
            and "Missing release-flow auth password" in run,
            "runtime config fails before API calls",
        ),
    ]


def check_smoke_script_contract() -> list[ReadinessCheck]:
    path = Path("scripts/release_flow_smoke.py")
    if not path.is_file():
        return [ReadinessCheck("script.smoke", False, "release_flow_smoke.py is missing")]
    source = path.read_text(encoding="utf-8")
    return [
        ReadinessCheck(
            "script.smoke.live_placeholder_guard",
            "validate_live_preflight_inputs" in source
            and "LIVE_PREFLIGHT_PLACEHOLDERS" in source
            and "CHG-PREFLIGHT" in source
            and "https://example.com/runbooks/release-flow" in source
            and "release-oncall@example.com" in source,
            "direct live preflight placeholder values are rejected",
        )
    ]


def check_production_gate_contract() -> list[ReadinessCheck]:
    path = Path(".github/workflows/release-flow-production-gate.yml")
    if not path.is_file():
        return [ReadinessCheck("workflow.production_gate", False, "release-flow-production-gate.yml is missing")]
    workflow = load_yaml(path)
    jobs = workflow.get("jobs", {})
    validate_job = jobs.get("validate_production_gate_inputs", {}) if isinstance(jobs, dict) else {}
    smoke_job = jobs.get("release_flow_smoke", {}) if isinstance(jobs, dict) else {}
    gate_job = jobs.get("production_gate", {}) if isinstance(jobs, dict) else {}
    validate_run = "\n".join(str(step.get("run", "")) for step in validate_job.get("steps", []) if isinstance(step, dict))
    gate_run = "\n".join(str(step.get("run", "")) for step in gate_job.get("steps", []) if isinstance(step, dict))
    call = workflow.get("on", {}).get("workflow_call", {})
    outputs = call.get("outputs", {}) if isinstance(call, dict) else {}
    inputs = call.get("inputs", {}) if isinstance(call, dict) else {}
    return [
        ReadinessCheck(
            "workflow.production_gate.calls_smoke",
            smoke_job.get("uses") == "./.github/workflows/release-flow-smoke.yml",
            "calls reusable smoke workflow",
        ),
        ReadinessCheck(
            "workflow.production_gate.live_preflight_default",
            call.get("inputs", {}).get("live_preflight", {}).get("default") is True,
            "live readiness preflight defaults on",
        ),
        ReadinessCheck(
            "workflow.production_gate.change_ticket_required",
            "default" not in inputs.get("live_change_ticket", {})
            and "CHG-PREFLIGHT" in validate_run
            and "real production change ticket" in validate_run,
            "production placeholder change ticket is blocked",
        ),
        ReadinessCheck(
            "workflow.production_gate.runbook_required",
            "default" not in inputs.get("live_runbook_url", {})
            and "live_runbook_url is required" in validate_run
            and "real production runbook" in validate_run,
            "production runbook URL is required",
        ),
        ReadinessCheck(
            "workflow.production_gate.owner_required",
            "live_release_owner or live_oncall_contact is required" in validate_run
            and "real production owner" in validate_run
            and "real on-call contact" in validate_run,
            "production owner or on-call contact is required",
        ),
        ReadinessCheck(
            "workflow.production_gate.validates_before_smoke",
            smoke_job.get("needs") == "validate_production_gate_inputs",
            "input validation runs before smoke",
        ),
        ReadinessCheck(
            "workflow.production_gate.output",
            outputs.get("release_gate_ok", {}).get("value") == "${{ jobs.production_gate.outputs.release_gate_ok }}",
            "release_gate_ok exported",
        ),
        ReadinessCheck(
            "workflow.production_gate.fail_closed",
            gate_job.get("if") == "always()" and "release_gate_ok=false" in gate_run and "exit 1" in gate_run,
            "fails closed when smoke failed",
        ),
    ]


def check_gate_contract_workflow() -> list[ReadinessCheck]:
    result = validate_workflows([Path(".github/workflows")])
    return [
        ReadinessCheck(
            "workflow.gate_contract.static_scan",
            result.ok,
            "contract passed" if result.ok else "; ".join(item.message for item in result.violations),
        )
    ]


def check_runtime_config(*, require_runtime_config: bool) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    for name, env_names in REQUIRED_RUNTIME_CONFIG.items():
        configured = any(os.getenv(env_name) for env_name in env_names)
        checks.append(
            ReadinessCheck(
                f"runtime.{name}",
                configured or not require_runtime_config,
                "configured" if configured else f"not checked; set one of {', '.join(env_names)}",
            )
        )
    return checks


def write_report(path: Path, checks: list[ReadinessCheck]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"ok": all(check.ok for check in checks), "checks": [asdict(check) for check in checks]}
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: Path, checks: list[ReadinessCheck]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Release Flow Production Readiness",
        "",
        f"- Result: {'passed' if all(check.ok for check in checks) else 'failed'}",
        "",
        "| Check | Result | Detail |",
        "| --- | --- | --- |",
    ]
    for check in checks:
        lines.append(f"| `{check.name}` | {'pass' if check.ok else 'fail'} | {check.detail} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-runtime-config", action="store_true")
    parser.add_argument("--report-path", type=Path)
    parser.add_argument("--markdown-path", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    checks = validate_readiness(require_runtime_config=args.require_runtime_config)
    if args.report_path:
        write_report(args.report_path, checks)
    if args.markdown_path:
        write_markdown(args.markdown_path, checks)
    for check in checks:
        print(f"{'ok' if check.ok else 'fail'} {check.name}: {check.detail}")
    return 0 if all(check.ok for check in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
