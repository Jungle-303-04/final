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
    Path("scripts/up.sh"),
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
    checks.extend(check_worker_topology_contract())
    checks.extend(check_metrics_scrape_contract())
    checks.extend(check_trace_correlation_contract())
    checks.extend(check_safe_pr_patch_contract())
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
            "workflow.smoke.live_approval_gate",
            "live_approval_gate" in inputs and "--live-approval-gate" in run,
            "live preflight approval gate is configurable",
        ),
        ReadinessCheck(
            "workflow.smoke.safe_pr_evidence_inputs",
            "live_safe_pr_workflow_run_id" in inputs
            and "live_safe_pr_url" in inputs
            and "--live-safe-pr-workflow-run-id" in run
            and "--live-safe-pr-url" in run,
            "live preflight can target existing Safe PR evidence",
        ),
        ReadinessCheck(
            "workflow.smoke.safe_pr_evidence_required",
            "live_safe_pr_workflow_run_id is required when live_approval_gate is safe_pr" in run
            and "live_safe_pr_url is required when live_approval_gate is safe_pr" in run
            and "live_safe_pr_url must not use example.com when live_approval_gate is safe_pr" in run,
            "live safe_pr preflight fails before API calls without concrete Safe PR evidence",
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
        ),
        ReadinessCheck(
            "script.smoke.live_image_required",
            '"live_image": getattr(args, "live_image", "")' in source
            and '"image": args.live_image' in source
            and "ghcr.io/example/release-flow-smoke:live-preflight" in source,
            "direct production live preflight requires an explicit non-demo image",
        ),
        ReadinessCheck(
            "script.smoke.generated_manifest_render",
            "run_generated_manifest_check" in source
            and '"/release-plans/render-manifest"' in source
            and "release-plans.generated-manifest.live-preflight" in source,
            "generated manifest render API is exercised before release start or live readiness",
        ),
        ReadinessCheck(
            "script.smoke.live_approval_gate",
            "--live-approval-gate" in source
            and "LIVE_PREFLIGHT_APPROVAL_GATE" in source
            and '"approval_gate": args.live_approval_gate' in source,
            "direct live preflight can exercise safe_pr approval gates",
        ),
        ReadinessCheck(
            "script.smoke.safe_pr_evidence_inputs",
            "--live-safe-pr-workflow-run-id" in source
            and "LIVE_PREFLIGHT_SAFE_PR_WORKFLOW_RUN_ID" in source
            and '"safe_pr_workflow_run_id"] = args.live_safe_pr_workflow_run_id' in source
            and "--live-safe-pr-url" in source
            and "LIVE_PREFLIGHT_SAFE_PR_URL" in source,
            "direct live preflight can pass existing Safe PR evidence",
        ),
        ReadinessCheck(
            "script.smoke.safe_pr_evidence_required",
            "live_safe_pr_workflow_run_id is required when live_approval_gate is safe_pr" in source
            and "live_safe_pr_url is required when live_approval_gate is safe_pr" in source
            and "live_safe_pr_url must not use example.com placeholder value" in source,
            "direct live safe_pr preflight requires concrete Safe PR evidence before readiness calls",
        ),
        ReadinessCheck(
            "script.smoke.safe_pr_ready_server_verified",
            '"safe_pr_ready"] = True' not in source,
            "direct live preflight does not mark Safe PR ready without server-side evidence",
        ),
    ]


def check_worker_topology_contract() -> list[ReadinessCheck]:
    services_path = Path("deploy/management/services.yaml")
    up_path = Path("scripts/up.sh")
    if not services_path.is_file() or not up_path.is_file():
        return [
            ReadinessCheck(
                "worker_topology.files",
                False,
                "deploy/management/services.yaml or scripts/up.sh is missing",
            )
        ]
    services = services_path.read_text(encoding="utf-8")
    up_script = up_path.read_text(encoding="utf-8")
    required_workers = {
        "safe-pr-worker",
        "scm-worker",
        "release-flow-worker",
        "outbox-relay",
    }
    deployed = {
        worker
        for worker in required_workers
        if f"name: {worker}" in services and f"app: {worker}" in services
    }
    started = {
        worker
        for worker in required_workers
        if f"\n  {worker}\n" in up_script
    }
    return [
        ReadinessCheck(
            "worker_topology.deployments",
            deployed == required_workers,
            "required live release workers are deployed"
            if deployed == required_workers
            else f"missing deployments: {', '.join(sorted(required_workers - deployed))}",
        ),
        ReadinessCheck(
            "worker_topology.local_startup",
            started == required_workers,
            "local startup includes safe PR, SCM, projection, and outbox workers"
            if started == required_workers
            else f"missing startup workers: {', '.join(sorted(required_workers - started))}",
        ),
    ]


def check_metrics_scrape_contract() -> list[ReadinessCheck]:
    services_path = Path("deploy/management/services.yaml")
    gateway_path = Path("src/services/gateway/api-gateway/gateway.py")
    if not services_path.is_file() or not gateway_path.is_file():
        return [
            ReadinessCheck(
                "metrics.scrape_contract.files",
                False,
                "management services manifest or api-gateway source is missing",
            )
        ]
    services = services_path.read_text(encoding="utf-8")
    gateway = gateway_path.read_text(encoding="utf-8")
    return [
        ReadinessCheck(
            "metrics.api_gateway_endpoint",
            '@app.get("/metrics")' in gateway
            and "llm_invocation_latency_avg_ms" in gateway
            and "gitops_workflow_running_total" in gateway
            and "nats_consumer_pending_events" in gateway,
            "api-gateway exposes control-plane, NATS, GitOps, and LLM metrics",
        ),
        ReadinessCheck(
            "metrics.api_gateway_scrape_annotations",
            'prometheus.io/scrape: "true"' in services
            and "prometheus.io/path: /metrics" in services
            and 'prometheus.io/port: "8000"' in services
            and "name: api-gateway" in services,
            "api-gateway pod is annotated for Prometheus /metrics scrape",
        ),
    ]


def source_contains(path: Path, *needles: str) -> bool:
    if not path.is_file():
        return False
    source = path.read_text(encoding="utf-8")
    return all(needle in source for needle in needles)


def check_trace_correlation_contract() -> list[ReadinessCheck]:
    return [
        ReadinessCheck(
            "trace.gateway_request_logs",
            source_contains(
                Path("src/services/gateway/api-gateway/gateway.py"),
                "gateway_request_completed",
                "gateway_request_failed",
                "request_correlation_id",
                "duration_ms",
            ),
            "Gateway request boundary logs preserve method/path/status/duration and request correlation",
        ),
        ReadinessCheck(
            "trace.gateway_event_acceptance_logs",
            source_contains(
                Path("src/packages/runtime/gateway.py"),
                "gateway_event_accepted",
                "correlation_id",
                "causation_id",
                "durable_outbox",
            ),
            "Gateway event acceptance logs preserve event/correlation identifiers",
        ),
        ReadinessCheck(
            "trace.db_write_logs",
            source_contains(
                Path("src/packages/storage/repositories/event.py"),
                "db_event_recorded",
                "db_event_processing_claimed",
                "db_event_processing_finished",
                "db_event_processing_failed",
            )
            and source_contains(
                Path("src/packages/storage/repositories/outbox.py"),
                "db_outbox_event_staged",
                "db_outbox_events_sent",
                "db_outbox_event_dead_lettered",
            ),
            "event, event_processing, and outbox DB writes emit correlation-aware logs",
        ),
        ReadinessCheck(
            "trace.github_provider_logs",
            source_contains(
                Path("src/services/gitops/scm-worker/github_provider.py"),
                "github_provider_started",
                "github_provider_response",
                "github_provider_completed",
                "workflow_run_id",
                "head_branch",
            ),
            "GitHub Safe PR provider REST steps emit correlation-aware logs",
        ),
        ReadinessCheck(
            "trace.target_agent_result_logs",
            source_contains(
                Path("src/services/target/cluster-agent/commands/outbox.py"),
                "agent_command_result_enqueued",
                "agent_command_result_outbox_sent",
                "agent_command_result_outbox_abandoned",
                "resource_count",
            )
            and source_contains(
                Path("src/services/target/cluster-agent/agent.py"),
                "command_result_flushed",
                "attempt_count",
            ),
            "target-agent command result enqueue, flush, retry, and abandon paths are logged",
        ),
    ]


def check_safe_pr_patch_contract() -> list[ReadinessCheck]:
    return [
        ReadinessCheck(
            "safe_pr.provider_commits_patches",
            source_contains(
                Path("src/services/gitops/scm-worker/github_provider.py"),
                "put_manifest_patches",
                "for patch in request.patches",
                "PATCH_COMMIT_MESSAGE_PREFIX",
                "put_content_file",
            ),
            "GitHub Safe PR provider commits every requested manifest patch file",
        ),
        ReadinessCheck(
            "safe_pr.generated_manifest_rollback_patch",
            source_contains(
                Path("src/domains/release_flow/router.py"),
                "generated_manifest_rollback_patches",
                "Generated rollback manifest from current application state",
                ".gitops/rollback/",
                "safe_pr_patch_sha256(patches)",
            ),
            "generated release Safe PR includes rollback patch content in the signed patch digest",
        ),
        ReadinessCheck(
            "safe_pr.production_generated_manifest_rollback_required",
            source_contains(
                Path("src/domains/release_flow/router.py"),
                "generated_manifest_safe_pr_blockers",
                "release_step_targets_production",
                "production generated Safe PR requires rollback_image",
                "safe_pr_blockers",
            ),
            "production generated release Safe PR fails closed when rollback patch evidence is missing",
        ),
        ReadinessCheck(
            "safe_pr.production_evidence_rollback_required",
            source_contains(
                Path("src/domains/release_flow/router.py"),
                '"rollback_required": rollback_required',
                "generated_safe_pr_rollback_patch_available",
                'expected.get("rollback_required")',
                'expected.get("rollback_available")',
            ),
            "production release readiness rejects Safe PR evidence when rollback patch source is unavailable",
        ),
        ReadinessCheck(
            "safe_pr.evidence_candidate_matching",
            source_contains(
                Path("src/domains/release_flow/router.py"),
                "SAFE_PR_EVIDENCE_LOOKUP_LIMIT",
                "list_release_safe_pr_evidence",
                "safe_pr_evidence_candidates",
                "safe_pr_evidence_matches(candidate, expected)",
            )
            and source_contains(
                Path("src/domains/release_flow/repository.py"),
                "def list_release_safe_pr_evidence",
                'table.c.subject == "safe_pr.created"',
                ".order_by(table.c.created_at.desc())",
            ),
            "release readiness scans recent Safe PR evidence candidates before accepting a gate",
        ),
        ReadinessCheck(
            "safe_pr.evidence_mismatch_diagnostics",
            source_contains(
                Path("src/domains/release_flow/router.py"),
                "release_safe_pr_evidence_blockers",
                "safe_pr_evidence_mismatch_reasons",
                "safe_pr_evidence_field_reason",
                "no safe_pr.created event was found",
                "but none matched",
                'for field in ("provider", "repo_ref", "base_branch", "commit_sha", "patch_sha256")',
                "pr_url path does not match the expected GitHub repo_ref",
            ),
            "release readiness explains missing or mismatched Safe PR evidence",
        ),
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
            "workflow.production_gate.safe_pr_gate_default",
            call.get("inputs", {}).get("live_approval_gate", {}).get("default") == "safe_pr"
            and smoke_job.get("with", {}).get("live_approval_gate") == "${{ inputs.live_approval_gate || 'safe_pr' }}",
            "production live preflight defaults to Safe PR approval gate",
        ),
        ReadinessCheck(
            "workflow.production_gate.safe_pr_evidence_inputs",
            "live_safe_pr_workflow_run_id" in inputs
            and "live_safe_pr_url" in inputs
            and smoke_job.get("with", {}).get("live_safe_pr_workflow_run_id") == "${{ inputs.live_safe_pr_workflow_run_id }}"
            and smoke_job.get("with", {}).get("live_safe_pr_url") == "${{ inputs.live_safe_pr_url }}",
            "production live preflight can receive existing Safe PR evidence",
        ),
        ReadinessCheck(
            "workflow.production_gate.safe_pr_evidence_required",
            "LIVE_PREFLIGHT_APPROVAL_GATE" in validate_job.get("env", {})
            and "LIVE_PREFLIGHT_SAFE_PR_WORKFLOW_RUN_ID" in validate_job.get("env", {})
            and "LIVE_PREFLIGHT_SAFE_PR_URL" in validate_job.get("env", {})
            and "live_safe_pr_workflow_run_id is required when live_approval_gate is safe_pr" in validate_run
            and "live_safe_pr_url is required when live_approval_gate is safe_pr" in validate_run
            and "live_safe_pr_url must not use example.com when live_approval_gate is safe_pr" in validate_run,
            "production gate rejects safe_pr mode without existing Safe PR evidence before smoke calls",
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
            "workflow.production_gate.image_required",
            "LIVE_PREFLIGHT_IMAGE" in validate_job.get("env", {})
            and "live_image is required for production live_preflight" in validate_run
            and "real production image" in validate_run,
            "production image is required",
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
