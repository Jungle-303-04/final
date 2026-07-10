#!/usr/bin/env python3
"""Validate release-flow production readiness wiring before enabling deploys."""

from __future__ import annotations

import argparse
import ast
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import yaml

try:
    from validate_release_flow_production_gate import validate_workflows
except ImportError:  # pragma: no cover - used when imported as scripts.*
    from scripts.validate_release_flow_production_gate import validate_workflows


REQUIRED_WORKFLOW_FILES = [
    Path(".github/workflows/release-flow-smoke.yml"),
    Path(".github/workflows/release-flow-production-gate.yml"),
    Path(".github/workflows/release-flow-gate-contract.yml"),
    Path(".github/workflows/release-flow-production-deploy.yml"),
    Path(".github/workflows/release-flow-production-readiness.yml"),
]
REQUIRED_SCRIPT_FILES = [
    Path("scripts/release_flow_smoke.py"),
    Path("scripts/release_flow_deploy.py"),
    Path("scripts/run_release_flow_production_readiness.py"),
    Path("scripts/run_release_flow_production_signoff.py"),
    Path("scripts/verify_release_flow_production_evidence.py"),
    Path("scripts/verify_release_flow_github_environment.py"),
    Path("scripts/validate_release_flow_production_gate.py"),
    Path("scripts/up.sh"),
]
REQUIRED_DOC_FILES = [
    Path("docs/release-flow-production-readiness.md"),
]
REQUIRED_RUNTIME_CONFIG = {
    "api_base_url": ("RELEASE_FLOW_API_BASE_URL", "API_BASE_URL"),
    "auth_email": ("RELEASE_FLOW_AUTH_EMAIL", "AUTH_EMAIL"),
    "auth_password": ("RELEASE_FLOW_AUTH_PASSWORD", "AUTH_PASSWORD"),
}
GITHUB_RUNTIME_CONFIG = {
    "github_token": ("GITHUB_TOKEN_REF", "GITHUB_TOKEN"),
    "scm_repo": ("SCM_REPO",),
    "github_api_base": ("GITHUB_API_BASE",),
}
LIVE_RUNTIME_CONFIG = {
    "live_enabled": ("RELEASE_FLOW_LIVE_ENABLED",),
    "live_workspaces": ("RELEASE_FLOW_LIVE_WORKSPACES",),
}
DEFAULT_GITHUB_API_BASE = "https://api.github.com"
DEFAULT_SCM_BASE_BRANCH = "main"
RUNTIME_PLACEHOLDER_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}
RUNTIME_PLACEHOLDER_PASSWORDS = {"secret", "password", "changeme", "change-me", "replace-me"}
GITHUB_PLACEHOLDER_TOKENS = {"secret", "token", "github-token", "changeme", "replace-me"}
TRUTHY_RUNTIME_VALUES = {"1", "true", "yes", "on", "enabled"}


@dataclass
class ReadinessCheck:
    name: str
    ok: bool
    detail: str


def load_yaml(path: Path) -> dict[str, Any]:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return loaded if isinstance(loaded, dict) else {}


def has_python_call_with_first_literal(source: str, function_name: str, literal: str) -> bool:
    """포맷과 무관하게 지정 함수의 첫 문자열 인자를 확인한다."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return False
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not node.args:
            continue
        called_name = (
            node.func.id
            if isinstance(node.func, ast.Name)
            else node.func.attr
            if isinstance(node.func, ast.Attribute)
            else ""
        )
        first_arg = node.args[0]
        if (
            called_name == function_name
            and isinstance(first_arg, ast.Constant)
            and first_arg.value == literal
        ):
            return True
    return False


def validate_readiness(
    *,
    require_runtime_config: bool = False,
    check_github_access: bool = False,
    require_production_deploy: bool = False,
) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    checks.extend(check_required_files())
    checks.extend(check_production_readiness_workflow_contract())
    checks.extend(check_smoke_workflow_contract())
    checks.extend(check_smoke_script_contract())
    checks.extend(check_operator_documentation_contract())
    checks.extend(check_worker_topology_contract())
    checks.extend(check_gitops_poll_observability_contract())
    checks.extend(check_metrics_scrape_contract())
    checks.extend(check_trace_correlation_contract())
    checks.extend(check_safe_pr_patch_contract())
    checks.extend(check_production_gate_contract())
    checks.extend(check_production_deploy_workflow_contract())
    checks.extend(check_deploy_script_contract())
    checks.extend(check_readiness_runner_contract())
    checks.extend(check_production_signoff_runner_contract())
    checks.extend(check_github_environment_verifier_contract())
    checks.extend(check_evidence_verifier_contract())
    checks.extend(check_gate_contract_script_contract())
    checks.extend(check_gate_contract_workflow(require_production_deploy=require_production_deploy))
    checks.extend(check_runtime_config(require_runtime_config=require_runtime_config))
    checks.extend(check_github_runtime_config(require_runtime_config=require_runtime_config))
    checks.extend(check_live_runtime_config(require_runtime_config=require_runtime_config))
    if check_github_access:
        checks.extend(check_github_access_preflight())
    return checks


def check_required_files() -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    for path in [*REQUIRED_WORKFLOW_FILES, *REQUIRED_SCRIPT_FILES, *REQUIRED_DOC_FILES]:
        checks.append(
            ReadinessCheck(
                f"file.{path.as_posix()}",
                path.is_file(),
                "present" if path.is_file() else "missing",
            )
        )
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
    run = "\n".join(
        str(step.get("run", "")) for step in job.get("steps", []) if isinstance(step, dict)
    )
    return [
        ReadinessCheck(
            "workflow.smoke.reusable",
            set(workflow.get("on", {})) == {"workflow_dispatch", "workflow_call"},
            "manual and reusable"
            if set(workflow.get("on", {})) == {"workflow_dispatch", "workflow_call"}
            else "missing trigger",
        ),
        ReadinessCheck(
            "workflow.smoke.outputs",
            {
                "release_smoke_ok",
                "release_smoke_failed_checks",
                "release_smoke_failed_count",
                "release_smoke_error",
            }
            <= set(call.get("outputs", {})),
            "gate outputs exported",
        ),
        ReadinessCheck(
            "workflow.smoke.secret_aliases",
            {"RELEASE_FLOW_API_BASE_URL", "RELEASE_FLOW_AUTH_EMAIL", "RELEASE_FLOW_AUTH_PASSWORD"}
            <= set(secrets),
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
            and "live_safe_pr_url must use https when live_approval_gate is safe_pr" in run
            and "live_safe_pr_url must not use localhost or example hosts when live_approval_gate is safe_pr"
            in run,
            "live safe_pr preflight fails before API calls without concrete Safe PR evidence",
        ),
        ReadinessCheck(
            "workflow.smoke.runtime_config_preflight",
            "Missing release-flow API URL" in run
            and "release-flow production smoke requires an https API base URL" in run
            and "release-flow production smoke must not target localhost or example hosts" in run
            and "Missing release-flow auth email" in run
            and "Missing release-flow auth password" in run,
            "runtime config fails before API calls",
        ),
        ReadinessCheck(
            "workflow.smoke.live_verification_url_required",
            "live_verification_url" in inputs
            and "LIVE_PREFLIGHT_VERIFICATION_URL" in run
            and "live_verification_url is required for production live_preflight" in run
            and "live_verification_url must use https for production live_preflight" in run
            and "live_verification_url must not use localhost or example hosts" in run,
            "production live preflight requires a concrete https verification URL",
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
            and "LIVE_PREFLIGHT_PLACEHOLDER_HOSTS" in source
            and "example.test" in source
            and 'host.endswith(".localhost")' in source
            and "CHG-PREFLIGHT" in source
            and "https://example.com/runbooks/release-flow" in source
            and "https://example.com/verify/release-flow" in source
            and "release-oncall@example.com" in source,
            "direct live preflight placeholder values are rejected",
        ),
        ReadinessCheck(
            "script.smoke.live_runbook_url_required",
            '"live_runbook_url": getattr(args, "live_runbook_url", "")' in source
            and has_python_call_with_first_literal(
                source, "validate_live_https_url", "live_runbook_url"
            )
            and "LIVE_PREFLIGHT_PLACEHOLDER_HOSTS" in source
            and 'host.endswith(".example.test")' in source,
            "direct production live preflight requires a concrete https runbook URL",
        ),
        ReadinessCheck(
            "script.smoke.live_image_required",
            '"live_image": getattr(args, "live_image", "")' in source
            and '"image": args.live_image' in source
            and "ghcr.io/example/release-flow-smoke:live-preflight" in source,
            "direct production live preflight requires an explicit non-demo image",
        ),
        ReadinessCheck(
            "script.smoke.live_verification_url_required",
            '"live_verification_url": getattr(args, "live_verification_url", "")' in source
            and "is required for production live preflight" in source
            and has_python_call_with_first_literal(
                source, "validate_live_https_url", "live_verification_url"
            )
            and "LIVE_PREFLIGHT_PLACEHOLDER_HOSTS" in source
            and 'host.endswith(".example.test")' in source,
            "direct production live preflight requires a concrete https verification URL",
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
            "script.smoke.production_verification_url_required",
            '"live_verification_url": getattr(args, "live_verification_url", "")' in source
            and "is required for production live preflight" in source
            and has_python_call_with_first_literal(
                source, "validate_live_https_url", "live_verification_url"
            )
            and "LIVE_PREFLIGHT_PLACEHOLDER_HOSTS" in source
            and 'host.endswith(".example.test")' in source,
            "direct production live preflight requires concrete post-deploy verification URL evidence",
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
            and 'validate_live_https_url(\n            "live_safe_pr_url"' in source
            and "LIVE_PREFLIGHT_PLACEHOLDER_HOSTS" in source
            and 'host.endswith(".example.test")' in source,
            "direct live safe_pr preflight requires concrete Safe PR evidence before readiness calls",
        ),
        ReadinessCheck(
            "script.smoke.safe_pr_ready_server_verified",
            '"safe_pr_ready"] = True' not in source,
            "direct live preflight does not mark Safe PR ready without server-side evidence",
        ),
        ReadinessCheck(
            "script.smoke.ci_github_summary",
            "def apply_ci_defaults" in source
            and 'if os.getenv("GITHUB_STEP_SUMMARY"):' in source
            and "args.github_step_summary = True" in source
            and "append_github_step_summary" in source,
            "CI smoke reports are appended to the GitHub Actions job summary when available",
        ),
    ]


def check_operator_documentation_contract() -> list[ReadinessCheck]:
    path = Path("docs/release-flow-production-readiness.md")
    if not path.is_file():
        return [
            ReadinessCheck(
                "docs.production_readiness",
                False,
                "release-flow production readiness operator guide is missing",
            )
        ]
    source = path.read_text(encoding="utf-8")
    required_terms = {
        "RELEASE_FLOW_API_BASE_URL",
        "RELEASE_FLOW_AUTH_EMAIL",
        "RELEASE_FLOW_AUTH_PASSWORD",
        "RELEASE_FLOW_GITHUB_TOKEN_REF",
        "RELEASE_FLOW_GITHUB_TOKEN",
        "RELEASE_FLOW_SCM_REPO",
        "RELEASE_FLOW_SCM_BASE_BRANCH",
        "RELEASE_FLOW_GITHUB_API_BASE",
        "RELEASE_FLOW_LIVE_ENABLED",
        "RELEASE_FLOW_LIVE_WORKSPACES",
        "Required live control-plane runtime settings",
        "avoid `*` for production",
        "non-env vault ref",
        "aws-sm:",
        "k8s-secret:",
        "--check-github-access",
        "github_access_preflight",
        "validate_release_flow_production_readiness.py --require-runtime-config",
        "Release Flow Production Readiness",
        "release-flow-production-readiness",
        "release-flow-production-gate.yml",
        "api_smoke_preflight",
        "release_flow_smoke.py --production-preflight --ci",
        "release-flow-smoke.md",
        "live_verification_url",
        "live_safe_pr_workflow_run_id",
        "live_safe_pr_url",
        "verify_release_flow_production_evidence.py",
    }
    missing = sorted(term for term in required_terms if term not in source)
    return [
        ReadinessCheck(
            "docs.production_readiness.operator_guide",
            not missing,
            "operator guide lists runtime config, readiness workflow, artifact, and Safe PR gate evidence"
            if not missing
            else f"operator guide missing: {', '.join(missing)}",
        )
    ]


def check_evidence_verifier_contract() -> list[ReadinessCheck]:
    path = Path("scripts/verify_release_flow_production_evidence.py")
    docs_path = Path("docs/release-flow-production-readiness.md")
    if not path.is_file():
        return [
            ReadinessCheck(
                "script.evidence_verifier", False, "production evidence verifier is missing"
            )
        ]
    source = path.read_text(encoding="utf-8")
    docs = docs_path.read_text(encoding="utf-8") if docs_path.is_file() else ""
    return [
        ReadinessCheck(
            "script.evidence_verifier.required_artifacts",
            "release-flow-readiness.json" in source
            and "release-flow-github-environment.json" in source
            and "release-flow-smoke.json" in source
            and "release-flow-deploy.json" in source
            and "release-flow-production-preflight.json" in source
            and "release-flow-production-signoff.json" in source
            and "signoff.distinct_workflow_runs" in source
            and "readiness and deploy run ids must be distinct" in source
            and "runtime.github_access_preflight" in source
            and "secret.RELEASE_FLOW_API_BASE_URL" in source
            and "release-plans.start.production" in source,
            "downloaded readiness, environment, smoke, deploy, and signoff artifacts are verified before completion",
        ),
        ReadinessCheck(
            "script.evidence_verifier.github_artifacts",
            "--github-repo" in source
            and "actions/workflows" in source
            and "actions/runs" in source
            and "archive_download_url" in source
            and "release-flow-smoke-production" in source
            and "release-flow-production-deploy" in source
            and "--github-sha is required when downloading GitHub artifacts" in source
            and "evidence.api_base_url_consistent" in source,
            "production evidence verifier can download GitHub Actions artifacts and require API consistency",
        ),
        ReadinessCheck(
            "script.evidence_verifier.signoff_preflight_summary",
            "validate_signoff_preflight_summary" in source
            and "signoff.preflight_report.sha256" in source
            and "signoff.preflight_report.artifact_present" in source
            and "report_payload_sha256" in source
            and "preflight report matches requested commit SHA" in source,
            "production evidence verifier validates the final signoff preflight report artifact",
        ),
        ReadinessCheck(
            "docs.production_readiness.evidence_verifier",
            "verify_release_flow_production_evidence.py" in docs
            and "release-flow-production-readiness" in docs
            and "release-flow-production-deploy" in docs,
            "operator guide documents final evidence artifact verification",
        ),
        ReadinessCheck(
            "docs.production_readiness.github_evidence_verifier",
            "--github-repo owner/repo" in docs
            and "--github-sha" in docs
            and "exact deployed commit" in docs
            and "--github-output-dir" in docs
            and "same concrete HTTPS API base URL" in docs,
            "operator guide documents GitHub artifact download verification and API consistency",
        ),
    ]


def check_readiness_runner_contract() -> list[ReadinessCheck]:
    path = Path("scripts/run_release_flow_production_readiness.py")
    docs_path = Path("docs/release-flow-production-readiness.md")
    if not path.is_file():
        return [
            ReadinessCheck(
                "script.readiness_runner", False, "production readiness runner is missing"
            )
        ]
    source = path.read_text(encoding="utf-8")
    docs = docs_path.read_text(encoding="utf-8") if docs_path.is_file() else ""
    return [
        ReadinessCheck(
            "script.readiness_runner.dispatches_workflow",
            "actions/workflows" in source
            and "dispatches" in source
            and "workflow_dispatch" in source
            and "github_environment_preflight" in source
            and "production_deploy_required" in source,
            "operator runner dispatches the production readiness workflow with final gates enabled",
        ),
        ReadinessCheck(
            "script.readiness_runner.polls_and_verifies",
            "wait_for_run" in source
            and "--verify-artifact" in source
            and "--allow-missing-deploy" in source
            and "verify_evidence_main" in source,
            "operator runner polls the workflow and can verify the readiness artifact",
        ),
        ReadinessCheck(
            "docs.production_readiness.runner",
            "run_release_flow_production_readiness.py" in docs
            and "--verify-artifact" in docs
            and "--github-sha <production-commit-sha>" in docs,
            "operator guide documents dispatch, polling, and artifact verification",
        ),
    ]


def check_production_signoff_runner_contract() -> list[ReadinessCheck]:
    path = Path("scripts/run_release_flow_production_signoff.py")
    docs_path = Path("docs/release-flow-production-readiness.md")
    if not path.is_file():
        return [
            ReadinessCheck(
                "script.production_signoff_runner", False, "production signoff runner is missing"
            )
        ]
    source = path.read_text(encoding="utf-8")
    docs = docs_path.read_text(encoding="utf-8") if docs_path.is_file() else ""
    return [
        ReadinessCheck(
            "script.production_signoff_runner.dispatches_readiness_and_deploy",
            "READINESS_WORKFLOW" in source
            and "DEPLOY_WORKFLOW" in source
            and "dispatch_and_wait" in source
            and "production_deploy_required" in source
            and "release_plan_id" in source,
            "operator signoff runner dispatches readiness before production deploy",
        ),
        ReadinessCheck(
            "script.production_signoff_runner.validates_live_inputs",
            "validate_signoff_inputs" in source
            and "live_change_ticket must not use placeholder" in source
            and "live_image must not use mutable latest tag" in source
            and "live_safe_pr_workflow_run_id must be a numeric GitHub Actions run id" in source
            and "live_safe_pr_url run id must match live_safe_pr_workflow_run_id" in source,
            "operator signoff runner rejects placeholder production inputs before dispatch",
        ),
        ReadinessCheck(
            "script.production_signoff_runner.verifies_final_evidence",
            "--allow-missing-deploy" in source
            and "allow_missing_deploy=False" in source
            and "--require-signoff-report" in source
            and "--github-readiness-run-id" in source
            and "--github-deploy-run-id" in source
            and "completed run did not report a numeric run id" in source
            and "local git HEAD must match --github-sha" in source
            and "GitHub branch" in source
            and "must match --github-sha" in source
            and "verify_safe_pr_run" in source
            and "Safe PR run" in source
            and "verify_workflow_access" in source
            and "--preflight-only" in source
            and "release-flow-production-preflight.json" in source
            and "write_preflight_report" in source
            and "--github-sha" in source
            and "--github-output-dir" in source,
            "operator signoff runner verifies the exact readiness and deploy run artifacts",
        ),
        ReadinessCheck(
            "script.production_signoff_runner.requires_preflight_report",
            "verify_preflight_report" in source
            and "skip_preflight_report_check" in source
            and "preflight report is required before full sign-off dispatch" in source
            and "preflight report does not match full sign-off inputs" in source
            and "preflight_report_max_age_minutes" in source
            and "preflight report is too old for full sign-off dispatch" in source
            and "--skip-preflight-report-check" in docs,
            "operator signoff runner requires a matching no-dispatch preflight report before full dispatch",
        ),
        ReadinessCheck(
            "script.production_signoff_runner.writes_signoff_report",
            "release-flow-production-signoff.json" in source
            and "write_signoff_report" in source
            and "readiness_run" in source
            and "deploy_run" in source
            and "preflight_report" in source
            and "report_payload_sha256" in source
            and "evidence_verification_status" in source,
            "operator signoff runner writes a final auditable sign-off report",
        ),
        ReadinessCheck(
            "docs.production_readiness.signoff_runner",
            "run_release_flow_production_signoff.py" in docs
            and "--release-plan-id" in docs
            and "--live-safe-pr-workflow-run-id" in docs
            and "release-flow-production-signoff.json" in docs
            and "full production sign-off" in docs
            and "--preflight-only" in docs
            and "release-flow-production-preflight.json" in docs
            and "--preflight-report-max-age-minutes" in docs
            and "Safe PR GitHub Actions run" in docs,
            "operator guide documents one-command production sign-off",
        ),
    ]


def check_github_environment_verifier_contract() -> list[ReadinessCheck]:
    path = Path("scripts/verify_release_flow_github_environment.py")
    docs_path = Path("docs/release-flow-production-readiness.md")
    if not path.is_file():
        return [
            ReadinessCheck(
                "script.github_environment_verifier",
                False,
                "GitHub environment verifier is missing",
            )
        ]
    source = path.read_text(encoding="utf-8")
    docs = docs_path.read_text(encoding="utf-8") if docs_path.is_file() else ""
    return [
        ReadinessCheck(
            "script.github_environment_verifier.required_config",
            "RELEASE_FLOW_API_BASE_URL" in source
            and "RELEASE_FLOW_AUTH_EMAIL" in source
            and "RELEASE_FLOW_AUTH_PASSWORD" in source
            and "RELEASE_FLOW_GITHUB_TOKEN" in source
            and "RELEASE_FLOW_SCM_REPO" in source
            and "RELEASE_FLOW_LIVE_ENABLED" in source
            and "RELEASE_FLOW_LIVE_WORKSPACES" in source,
            "GitHub environment verifier checks required release-flow config names",
        ),
        ReadinessCheck(
            "script.github_environment_verifier.value_guards",
            "must not use wildcard workspace allow-list" in source
            and "must be owner/repo" in source
            and "must enable live dispatch" in source
            and "must not use localhost or example hosts" in source,
            "GitHub environment verifier validates inspectable production variable values",
        ),
        ReadinessCheck(
            "docs.production_readiness.github_environment_verifier",
            "verify_release_flow_github_environment.py" in docs
            and "--github-repo owner/repo" in docs
            and "--environment production" in docs,
            "operator guide documents GitHub environment verification",
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
    started = {worker for worker in required_workers if f"\n  {worker}\n" in up_script}
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


def check_gitops_poll_observability_contract() -> list[ReadinessCheck]:
    repository_path = Path("src/domains/gitops/repository.py")
    poller_path = Path("src/services/gitops/github-poll-worker/poller.py")
    if not repository_path.is_file() or not poller_path.is_file():
        return [
            ReadinessCheck(
                "gitops.poll_status_recording",
                False,
                "GitOps repository or GitHub poller source is missing",
            )
        ]
    repository = repository_path.read_text(encoding="utf-8")
    poller = poller_path.read_text(encoding="utf-8")
    return [
        ReadinessCheck(
            "gitops.poll_status_recording",
            "record_watch_poll_result" in repository
            and "poll_status" in repository
            and "poll_error_kind" in repository
            and "last_polled_at" in repository
            and "record_poll_result" in poller
            and "github_poll_target_unavailable" in poller
            and "target_errors" in poller,
            "GitHub poll success/failure is recorded per watch target",
        ),
        ReadinessCheck(
            "gitops.poll_status_api",
            "gitops_poll" in repository
            and "watch_last_polled_at" in repository
            and "watch_settings" in repository,
            "GitHub poll status is included in deployment binding API rows",
        ),
        ReadinessCheck(
            "gitops.poll_status_api_source_lookup",
            "binding_watch_by_id" in repository
            and "binding_watch_by_source" in repository
            and "watch_by_id.c.watch_target_id.is_(None)" in repository
            and "watch_by_source.c.manifest_path == table.c.manifest_path" in repository,
            "deployment binding API poll status falls back to source identity when watch ids differ",
        ),
        ReadinessCheck(
            "gitops.watch_source_identity_upsert",
            "table.c.workspace_id" in repository
            and "table.c.repository_id" in repository
            and "table.c.branch" in repository
            and "table.c.manifest_path" in repository
            and repository.count("index_elements=[\n                table.c.workspace_id,") >= 2,
            "watch observe and poll status upserts use source identity, not only watch_target_id",
        ),
        ReadinessCheck(
            "gitops.watch_source_identity_lookup",
            "watch_target_id = func.coalesce(" in repository
            and "watch_by_source.c.branch == repo_table.c.default_branch" in repository
            and "watch_by_source.c.manifest_path == binding_manifest_path" in repository,
            "GitHub poll target lookup falls back to source identity when watch ids differ",
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
        ReadinessCheck(
            "safe_pr.dispatch_uses_server_evidence",
            source_contains(
                Path("src/domains/release_flow/router.py"),
                "dispatch_plan = plan_with_safe_pr_evidence",
                "release_dispatch_context_blockers(dispatch_plan",
                "release_execution_blockers(dispatch_plan",
                "release_dispatch_guard_snapshot(dispatch_plan",
                "dispatch_request_for_step(dispatch_plan",
            ),
            "live dispatch validates Safe PR readiness from server-side safe_pr.created evidence",
        ),
        ReadinessCheck(
            "safe_pr.execution_requires_created_evidence",
            source_contains(
                Path("src/domains/release_flow/execution.py"),
                "def safe_pr_evidence_ready",
                "safe_pr_evidence",
                '"workflow_run_id", "pr_url", "created_at"',
                "configured_url == evidence_url",
            ),
            "live execution blockers require server-injected Safe PR evidence, not a user-supplied URL",
        ),
        ReadinessCheck(
            "safe_pr.github_branch_ref_validation",
            source_contains(
                Path("src/services/gitops/scm-worker/github_provider.py"),
                "def normalize_branch_ref",
                "INVALID_BRANCH_REF_MESSAGE",
                "GITHUB_BRANCH_REF_RE",
                "request_base_branch",
                'return normalize_branch_ref(f"{BRANCH_PREFIX}/{request.workflow_run_id}")',
            ),
            "GitHub Safe PR provider validates base/head branch refs before outbound writes",
        ),
    ]


def check_production_readiness_workflow_contract() -> list[ReadinessCheck]:
    path = Path(".github/workflows/release-flow-production-readiness.yml")
    if not path.is_file():
        return [
            ReadinessCheck(
                "workflow.production_readiness",
                False,
                "release-flow-production-readiness.yml is missing",
            )
        ]
    workflow = load_yaml(path)
    workflow_source = path.read_text(encoding="utf-8")
    dispatch = workflow.get("on", {}).get("workflow_dispatch", {})
    inputs = dispatch.get("inputs", {}) if isinstance(dispatch, dict) else {}
    jobs = workflow.get("jobs", {})
    job = jobs.get("release_flow_production_readiness", {}) if isinstance(jobs, dict) else {}
    env: dict[str, Any] = {}
    run = ""
    for step in job.get("steps", []):
        if not isinstance(step, dict) or step.get("name") != "Validate production readiness":
            continue
        env = step.get("env", {}) if isinstance(step.get("env"), dict) else {}
        run = str(step.get("run") or "")
        break
    return [
        ReadinessCheck(
            "workflow.production_readiness.require_runtime_config",
            "--require-runtime-config" in run,
            "production readiness requires concrete runtime config",
        ),
        ReadinessCheck(
            "workflow.production_readiness.requires_runtime_config",
            "--require-runtime-config" in run,
            "production readiness validates concrete runtime configuration",
        ),
        ReadinessCheck(
            "workflow.production_readiness.runtime_env",
            "RELEASE_FLOW_API_BASE_URL" in env
            and "RELEASE_FLOW_AUTH_EMAIL" in env
            and "RELEASE_FLOW_AUTH_PASSWORD" in env
            and "RELEASE_FLOW_LIVE_ENABLED" in env
            and "RELEASE_FLOW_LIVE_WORKSPACES" in env
            and "GITHUB_TOKEN_REF" in env
            and "GITHUB_TOKEN" in env
            and "SCM_REPO" in env,
            "production readiness receives API and GitHub runtime env",
        ),
        ReadinessCheck(
            "workflow.production_readiness.github_provider_env",
            "GITHUB_TOKEN_REF" in env
            and "GITHUB_TOKEN" in env
            and "SCM_REPO" in env
            and "SCM_BASE_BRANCH" in env
            and "GITHUB_API_BASE" in env,
            "production readiness receives GitHub Safe PR provider env",
        ),
        ReadinessCheck(
            "workflow.production_readiness.live_runtime_env",
            "RELEASE_FLOW_LIVE_ENABLED" in env
            and "RELEASE_FLOW_LIVE_WORKSPACES" in env
            and "RELEASE_FLOW_LIVE_ENABLED" in str(env.get("RELEASE_FLOW_LIVE_ENABLED") or "")
            and "RELEASE_FLOW_LIVE_WORKSPACES"
            in str(env.get("RELEASE_FLOW_LIVE_WORKSPACES") or ""),
            "production readiness receives live dispatch enablement and workspace allow-list env",
        ),
        ReadinessCheck(
            "workflow.production_readiness.github_access_preflight",
            "github_access_preflight" in inputs
            and inputs.get("github_access_preflight", {}).get("default") is True
            and "GITHUB_ACCESS_PREFLIGHT" in env
            and str(env.get("GITHUB_ACCESS_PREFLIGHT") or "")
            == "${{ inputs.github_access_preflight }}"
            and "--check-github-access" in run,
            "production readiness verifies GitHub repo access by default",
        ),
        ReadinessCheck(
            "workflow.production_readiness.github_environment_preflight",
            "github_environment_preflight" in inputs
            and inputs.get("github_environment_preflight", {}).get("default") is True
            and "GITHUB_ENVIRONMENT_PREFLIGHT" in env
            and str(env.get("GITHUB_ENVIRONMENT_PREFLIGHT") or "")
            == "${{ inputs.github_environment_preflight }}"
            and "RELEASE_FLOW_GITHUB_ENVIRONMENT_TOKEN" in env
            and "GITHUB_ENVIRONMENT_NAME" in env
            and "GITHUB_ENVIRONMENT_REPO" in env
            and "scripts/verify_release_flow_github_environment.py" in run
            and "artifacts/release-flow-github-environment.json" in run,
            "production readiness verifies GitHub Environment config and uploads the report by default",
        ),
        ReadinessCheck(
            "workflow.production_readiness.api_smoke_preflight",
            "api_smoke_preflight" in inputs
            and inputs.get("api_smoke_preflight", {}).get("default") is True
            and "API_SMOKE_PREFLIGHT" in env
            and str(env.get("API_SMOKE_PREFLIGHT") or "") == "${{ inputs.api_smoke_preflight }}"
            and "scripts/release_flow_smoke.py" in run
            and "--ci" in run
            and "--production-preflight" in run
            and "--ci-artifacts-dir artifacts" in run
            and 'API_BASE_URL="$RELEASE_FLOW_API_BASE_URL"' in run
            and 'AUTH_EMAIL="$RELEASE_FLOW_AUTH_EMAIL"' in run
            and 'AUTH_PASSWORD="$RELEASE_FLOW_AUTH_PASSWORD"' in run
            and "artifacts/release-flow-*.*" in workflow_source,
            "production readiness runs live API smoke by default without release dispatch",
        ),
        ReadinessCheck(
            "workflow.production_readiness.production_deploy_required",
            "production_deploy_required" in inputs
            and inputs.get("production_deploy_required", {}).get("default") is True
            and "PRODUCTION_DEPLOY_REQUIRED" in env
            and "--require-production-deploy" in run,
            "production readiness can require at least one gated production deploy workflow",
        ),
        ReadinessCheck(
            "workflow.production_readiness.github_api_base",
            "GITHUB_API_BASE" in env
            and "RELEASE_FLOW_GITHUB_API_BASE" in str(env.get("GITHUB_API_BASE") or ""),
            "production readiness can target GitHub Enterprise API base",
        ),
        ReadinessCheck(
            "workflow.production_readiness.github_secret_names",
            "RELEASE_FLOW_GITHUB_TOKEN_REF" in str(env.get("GITHUB_TOKEN_REF") or "")
            and "RELEASE_FLOW_GITHUB_TOKEN" in str(env.get("GITHUB_TOKEN") or "")
            and "RELEASE_FLOW_SCM_REPO" in str(env.get("SCM_REPO") or ""),
            "production readiness uses release-flow scoped GitHub secret names",
        ),
        ReadinessCheck(
            "workflow.production_readiness.failure_report",
            "if: always()" in workflow_source
            and "release-flow-production-readiness" in workflow_source
            and "artifacts/release-flow-readiness" in run
            and "readiness_status=$?" in run
            and 'cat artifacts/release-flow-readiness.md >> "$GITHUB_STEP_SUMMARY"' in run
            and 'exit "$readiness_status"' in run,
            "production readiness publishes and uploads reports even when validation fails",
        ),
    ]


def check_production_gate_contract() -> list[ReadinessCheck]:
    path = Path(".github/workflows/release-flow-production-gate.yml")
    if not path.is_file():
        return [
            ReadinessCheck(
                "workflow.production_gate", False, "release-flow-production-gate.yml is missing"
            )
        ]
    workflow = load_yaml(path)
    jobs = workflow.get("jobs", {})
    validate_job = jobs.get("validate_production_gate_inputs", {}) if isinstance(jobs, dict) else {}
    smoke_job = jobs.get("release_flow_smoke", {}) if isinstance(jobs, dict) else {}
    gate_job = jobs.get("production_gate", {}) if isinstance(jobs, dict) else {}
    validate_run = "\n".join(
        str(step.get("run", "")) for step in validate_job.get("steps", []) if isinstance(step, dict)
    )
    gate_run = "\n".join(
        str(step.get("run", "")) for step in gate_job.get("steps", []) if isinstance(step, dict)
    )
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
            "workflow.production_gate.production_live_preflight_required",
            'LIVE_PREFLIGHT" != "true"' in validate_run
            and "live_preflight must be true for production release gates" in validate_run,
            "production gate cannot bypass live preflight for production environments",
        ),
        ReadinessCheck(
            "workflow.production_gate.safe_pr_gate_default",
            call.get("inputs", {}).get("live_approval_gate", {}).get("default") == "safe_pr"
            and smoke_job.get("with", {}).get("live_approval_gate")
            == "${{ inputs.live_approval_gate || 'safe_pr' }}",
            "production live preflight defaults to Safe PR approval gate",
        ),
        ReadinessCheck(
            "workflow.production_gate.safe_pr_evidence_inputs",
            "live_safe_pr_workflow_run_id" in inputs
            and "live_safe_pr_url" in inputs
            and smoke_job.get("with", {}).get("live_safe_pr_workflow_run_id")
            == "${{ inputs.live_safe_pr_workflow_run_id }}"
            and smoke_job.get("with", {}).get("live_safe_pr_url")
            == "${{ inputs.live_safe_pr_url }}",
            "production live preflight can receive existing Safe PR evidence",
        ),
        ReadinessCheck(
            "workflow.production_gate.safe_pr_evidence_required",
            "LIVE_PREFLIGHT_APPROVAL_GATE" in validate_job.get("env", {})
            and "LIVE_PREFLIGHT_SAFE_PR_WORKFLOW_RUN_ID" in validate_job.get("env", {})
            and "LIVE_PREFLIGHT_SAFE_PR_URL" in validate_job.get("env", {})
            and "live_safe_pr_workflow_run_id is required when live_approval_gate is safe_pr"
            in validate_run
            and "live_safe_pr_url is required when live_approval_gate is safe_pr" in validate_run
            and "live_safe_pr_url must use https when live_approval_gate is safe_pr" in validate_run
            and "live_safe_pr_url must not use localhost or example hosts when live_approval_gate is safe_pr"
            in validate_run,
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
            and "live_runbook_url must use https for production live_preflight" in validate_run
            and "live_runbook_url must not use localhost or example hosts" in validate_run,
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
            "workflow.production_gate.verification_url_required",
            "LIVE_PREFLIGHT_VERIFICATION_URL" in validate_job.get("env", {})
            and "live_verification_url is required for production live_preflight" in validate_run
            and "live_verification_url must use https for production live_preflight" in validate_run
            and "live_verification_url must not use localhost or example hosts" in validate_run,
            "production gate requires concrete post-deploy verification URL evidence",
        ),
        ReadinessCheck(
            "workflow.production_gate.validates_before_smoke",
            smoke_job.get("needs") == "validate_production_gate_inputs",
            "input validation runs before smoke",
        ),
        ReadinessCheck(
            "workflow.production_gate.output",
            outputs.get("release_gate_ok", {}).get("value")
            == "${{ jobs.production_gate.outputs.release_gate_ok }}",
            "release_gate_ok exported",
        ),
        ReadinessCheck(
            "workflow.production_gate.fail_closed",
            gate_job.get("if") == "always()"
            and "release_gate_ok=false" in gate_run
            and "exit 1" in gate_run,
            "fails closed when smoke failed",
        ),
    ]


def check_production_deploy_workflow_contract() -> list[ReadinessCheck]:
    path = Path(".github/workflows/release-flow-production-deploy.yml")
    if not path.is_file():
        return [
            ReadinessCheck(
                "workflow.production_deploy", False, "release-flow-production-deploy.yml is missing"
            )
        ]
    workflow = load_yaml(path)
    inputs = workflow.get("on", {}).get("workflow_dispatch", {}).get("inputs", {})
    concurrency = workflow.get("concurrency", {})
    jobs = workflow.get("jobs", {})
    gate_job = jobs.get("release_flow_production_gate", {}) if isinstance(jobs, dict) else {}
    deploy_job = jobs.get("deploy-production", {}) if isinstance(jobs, dict) else {}
    deploy_steps = deploy_job.get("steps", []) if isinstance(deploy_job.get("steps"), list) else []
    deploy_run = "\n".join(
        str(step.get("run", "")) for step in deploy_job.get("steps", []) if isinstance(step, dict)
    )
    deploy_env = {}
    setup_python_step = next(
        (
            step
            for step in deploy_steps
            if isinstance(step, dict) and step.get("uses") == "actions/setup-python@v5"
        ),
        {},
    )
    for step in deploy_steps:
        if isinstance(step, dict) and step.get("id") == "release_flow_deploy":
            deploy_env = step.get("env", {}) if isinstance(step.get("env"), dict) else {}
    return [
        ReadinessCheck(
            "workflow.production_deploy.required_inputs",
            all(
                inputs.get(name, {}).get("required") is True
                for name in (
                    "release_plan_id",
                    "live_change_ticket",
                    "live_runbook_url",
                    "live_image",
                    "live_verification_url",
                    "live_safe_pr_workflow_run_id",
                    "live_safe_pr_url",
                )
            ),
            "production deploy workflow requires plan id and live evidence inputs",
        ),
        ReadinessCheck(
            "workflow.production_deploy.calls_gate",
            gate_job.get("uses") == "./.github/workflows/release-flow-production-gate.yml"
            and gate_job.get("with", {}).get("github_environment") == "production"
            and gate_job.get("with", {}).get("live_preflight") is True
            and gate_job.get("with", {}).get("live_approval_gate") == "safe_pr"
            and gate_job.get("with", {}).get("live_safe_pr_workflow_run_id")
            == "${{ inputs.live_safe_pr_workflow_run_id }}"
            and gate_job.get("with", {}).get("live_safe_pr_url") == "${{ inputs.live_safe_pr_url }}"
            and gate_job.get("secrets") == "inherit",
            "production deploy must call the reusable production gate with Safe PR evidence",
        ),
        ReadinessCheck(
            "workflow.production_deploy.gates_start",
            deploy_job.get("needs") == "release_flow_production_gate"
            and deploy_job.get("environment") == "production"
            and deploy_job.get("if")
            == "needs.release_flow_production_gate.outputs.release_gate_ok == 'true'",
            "production release start is gated by release_gate_ok",
        ),
        ReadinessCheck(
            "workflow.production_deploy.concurrency",
            concurrency.get("group") == "release-flow-production-deploy"
            and concurrency.get("cancel-in-progress") is False,
            "production deploy workflow serializes production release starts",
        ),
        ReadinessCheck(
            "workflow.production_deploy.python_runtime",
            setup_python_step.get("with", {}).get("python-version") == "3.13",
            "production deploy pins the Python runtime before running deploy scripts",
        ),
        ReadinessCheck(
            "workflow.production_deploy.starts_release_flow",
            "python scripts/release_flow_deploy.py" in deploy_run
            and "--plan-id" in deploy_run
            and "RELEASE_FLOW_DEPLOY_PLAN_ID" in deploy_run
            and "RELEASE_FLOW_AUTH_EMAIL" in deploy_env
            and "RELEASE_FLOW_AUTH_PASSWORD" in deploy_env
            and deploy_env.get("RELEASE_FLOW_DEPLOY_CHANGE_TICKET")
            == "${{ inputs.live_change_ticket }}"
            and deploy_env.get("RELEASE_FLOW_DEPLOY_RUNBOOK_URL")
            == "${{ inputs.live_runbook_url }}"
            and deploy_env.get("RELEASE_FLOW_DEPLOY_IMAGE") == "${{ inputs.live_image }}"
            and deploy_env.get("RELEASE_FLOW_DEPLOY_VERIFICATION_URL")
            == "${{ inputs.live_verification_url }}"
            and deploy_env.get("RELEASE_FLOW_DEPLOY_SAFE_PR_WORKFLOW_RUN_ID")
            == "${{ inputs.live_safe_pr_workflow_run_id }}"
            and deploy_env.get("RELEASE_FLOW_DEPLOY_SAFE_PR_URL")
            == "${{ inputs.live_safe_pr_url }}",
            "production deploy starts a release-flow run using release-flow credentials",
        ),
    ]


def check_deploy_script_contract() -> list[ReadinessCheck]:
    path = Path("scripts/release_flow_deploy.py")
    if not path.is_file():
        return [ReadinessCheck("script.deploy", False, "release_flow_deploy.py is missing")]
    source = path.read_text(encoding="utf-8")
    return [
        ReadinessCheck(
            "script.deploy.fetches_saved_plan",
            '"/release-plans/{args.plan_id}"' in source
            and "release_plan_start_payload" in source
            and "validate_production_plan" in source,
            "deploy script fetches and validates the saved release plan before start",
        ),
        ReadinessCheck(
            "script.deploy.api_base_url_guard",
            'validate_live_https_url("api_base_url"' in source
            and "for production deploy" in source,
            "deploy script rejects non-production API URLs before API calls",
        ),
        ReadinessCheck(
            "script.deploy.plan_id_guard",
            "RELEASE_PLAN_ID_PATTERN" in source
            and "validate_release_plan_id" in source
            and "release-plan.id" in source,
            "deploy script rejects unsafe release plan ids before API calls",
        ),
        ReadinessCheck(
            "script.deploy.auth_guard",
            "PLACEHOLDER_AUTH_EMAILS" in source
            and "PLACEHOLDER_AUTH_PASSWORDS" in source
            and "validate_deploy_auth" in source
            and "real operator account" in source
            and "non-placeholder secret" in source,
            "deploy script rejects placeholder auth before API calls",
        ),
        ReadinessCheck(
            "script.deploy.rollback_guard",
            'settings.get("rollback_policy") != "safe_pr"' in source
            and "settings.rollback_policy must be safe_pr" in source,
            "deploy script requires Safe PR rollback policy for gated production starts",
        ),
        ReadinessCheck(
            "script.deploy.gate_input_guard",
            "REQUIRED_GATE_EVIDENCE_FIELDS" in source
            and "validate_deploy_gate_inputs" in source
            and "release-flow deploy requires gated evidence inputs" in source
            and "for production deploy evidence" in source,
            "deploy script requires live gate evidence inputs before API calls",
        ),
        ReadinessCheck(
            "script.deploy.matches_gate_evidence",
            "expected_plan_values" in source
            and "RELEASE_FLOW_DEPLOY_CHANGE_TICKET" in source
            and "RELEASE_FLOW_DEPLOY_SAFE_PR_WORKFLOW_RUN_ID" in source
            and "must match gated deploy input" in source,
            "deploy script requires saved plan evidence to match gated workflow inputs",
        ),
        ReadinessCheck(
            "script.deploy.requires_live_production_plan",
            "settings.runtime_mode must be live" in source
            and "environment must be production" in source
            and "release plan must contain at least one step" in source,
            "deploy script refuses demo or non-production plans before side effects",
        ),
        ReadinessCheck(
            "script.deploy.starts_release",
            '"/release-plans/start"' in source
            and "release-plans.start.production" in source
            and "validate_start_response" in source
            and "FAILED_RUN_STATES" in source
            and "release start response must include run_id" in source
            and "release start response must include every planned step" in source
            and "must confirm side_effects" in source,
            "deploy script starts the release and verifies live side-effect evidence",
        ),
    ]


def check_gate_contract_workflow(
    *, require_production_deploy: bool = False
) -> list[ReadinessCheck]:
    result = validate_workflows(
        [Path(".github/workflows")], require_production_deploy=require_production_deploy
    )
    return [
        ReadinessCheck(
            "workflow.gate_contract.static_scan",
            result.ok,
            "contract passed"
            if result.ok
            else "; ".join(item.message for item in result.violations),
        )
    ]


def check_gate_contract_script_contract() -> list[ReadinessCheck]:
    path = Path("scripts/validate_release_flow_production_gate.py")
    if not path.is_file():
        return [
            ReadinessCheck(
                "script.gate_contract", False, "release-flow production gate validator is missing"
            )
        ]
    source = path.read_text(encoding="utf-8")
    return [
        ReadinessCheck(
            "script.gate_contract.required_live_inputs",
            "REQUIRED_GATE_INPUTS" in source
            and '"live_change_ticket"' in source
            and '"live_runbook_url"' in source
            and '"live_image"' in source
            and '"live_verification_url"' in source
            and '"live_safe_pr_workflow_run_id"' in source
            and '"live_safe_pr_url"' in source
            and '"live_release_owner"' in source
            and '"live_oncall_contact"' in source,
            "production deploy workflows must pass live evidence inputs to the gate",
        ),
        ReadinessCheck(
            "script.gate_contract.literal_url_guard",
            "HTTPS_GATE_INPUTS" in source
            and "PLACEHOLDER_URL_HOSTS" in source
            and "validate_literal_url_input" in source
            and 'parsed.scheme != "https"' in source
            and 'host.endswith(".localhost")' in source
            and 'host.endswith(".example.test")' in source,
            "production deploy workflows cannot hard-code non-https or placeholder live URLs",
        ),
    ]


def check_runtime_config(*, require_runtime_config: bool) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    for name, env_names in REQUIRED_RUNTIME_CONFIG.items():
        value = runtime_config_value(env_names)
        configured = bool(value)
        valid, invalid_detail = runtime_config_validity(name, value)
        ok = (configured and valid) if require_runtime_config else True
        checks.append(
            ReadinessCheck(
                f"runtime.{name}",
                ok,
                runtime_config_detail(
                    configured=configured,
                    valid=valid,
                    invalid_detail=invalid_detail,
                    env_names=env_names,
                    require_runtime_config=require_runtime_config,
                ),
            )
        )
    return checks


def check_github_runtime_config(*, require_runtime_config: bool) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    for name, env_names in GITHUB_RUNTIME_CONFIG.items():
        value = runtime_config_value(env_names)
        configured, valid, detail = github_runtime_config_state(name, value)
        if require_runtime_config and name != "github_api_base":
            ok = configured and valid
        elif configured:
            ok = valid
        else:
            ok = True
        checks.append(
            ReadinessCheck(
                f"runtime.{name}",
                ok,
                runtime_config_detail(
                    configured=configured,
                    valid=valid,
                    invalid_detail=detail,
                    env_names=env_names,
                    require_runtime_config=require_runtime_config and name != "github_api_base",
                ),
            )
        )
    return checks


def check_live_runtime_config(*, require_runtime_config: bool) -> list[ReadinessCheck]:
    checks: list[ReadinessCheck] = []
    for name, env_names in LIVE_RUNTIME_CONFIG.items():
        value = runtime_config_value(env_names)
        configured, valid, detail = live_runtime_config_state(name, value)
        checks.append(
            ReadinessCheck(
                f"runtime.{name}",
                (configured and valid)
                if require_runtime_config
                else (valid if configured else True),
                runtime_config_detail(
                    configured=configured,
                    valid=valid,
                    invalid_detail=detail,
                    env_names=env_names,
                    require_runtime_config=require_runtime_config,
                ),
            )
        )
    return checks


def check_github_access_preflight() -> list[ReadinessCheck]:
    prerequisite_failures = [
        check
        for check in check_github_runtime_config(require_runtime_config=True)
        if not check.ok
        and check.name in {"runtime.github_token", "runtime.scm_repo", "runtime.github_api_base"}
    ]
    if prerequisite_failures:
        return [
            ReadinessCheck(
                "runtime.github_access_preflight",
                False,
                "GitHub access preflight requires valid token, repo, and API base config first: "
                + ", ".join(check.name for check in prerequisite_failures),
            )
        ]
    token, token_detail = github_access_token()
    if not token:
        return [ReadinessCheck("runtime.github_access_preflight", False, token_detail)]
    repo = os.getenv("SCM_REPO", "").strip()
    base_branch = (
        os.getenv("SCM_BASE_BRANCH", DEFAULT_SCM_BASE_BRANCH).strip() or DEFAULT_SCM_BASE_BRANCH
    )
    api_base = (
        os.getenv("GITHUB_API_BASE", DEFAULT_GITHUB_API_BASE).strip().rstrip("/")
        or DEFAULT_GITHUB_API_BASE
    )
    headers = github_access_headers(token)
    try:
        repo_payload = github_json_get(f"{api_base}/repos/{repo}", headers=headers)
        if not github_repo_allows_safe_pr_write(repo_payload):
            return [
                ReadinessCheck(
                    "runtime.github_access_preflight",
                    False,
                    f"GitHub token can read {repo}, but repo permissions do not indicate write access for Safe PR branches",
                )
            ]
        github_json_get(
            f"{api_base}/repos/{repo}/git/ref/heads/{quote(base_branch, safe='/')}", headers=headers
        )
        return [
            ReadinessCheck(
                "runtime.github_access_preflight",
                True,
                f"GitHub repo {repo} allows Safe PR writes and base branch {base_branch} is readable",
            )
        ]
    except urllib.error.HTTPError as exc:
        return [
            ReadinessCheck(
                "runtime.github_access_preflight",
                False,
                f"GitHub access preflight returned HTTP {exc.code} for {repo}@{base_branch}",
            )
        ]
    except (TimeoutError, urllib.error.URLError, OSError) as exc:
        return [
            ReadinessCheck(
                "runtime.github_access_preflight",
                False,
                f"GitHub access preflight failed before PR creation: {type(exc).__name__}",
            )
        ]


def github_access_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "release-flow-production-readiness",
    }


def github_json_get(url: str, *, headers: dict[str, str]) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(request, timeout=10) as response:
        status = int(response.getcode())
        if status != 200:
            raise urllib.error.HTTPError(
                url, status, f"unexpected status {status}", hdrs=None, fp=None
            )
        payload = json.loads(response.read().decode("utf-8") or "{}")
        return payload if isinstance(payload, dict) else {}


def github_repo_allows_safe_pr_write(payload: dict[str, Any]) -> bool:
    permissions = payload.get("permissions")
    if not isinstance(permissions, dict):
        return False
    return any(bool(permissions.get(field)) for field in ("push", "maintain", "admin"))


def github_access_token() -> tuple[str, str]:
    token_ref = os.getenv("GITHUB_TOKEN_REF", "").strip()
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token_ref:
        lowered = token_ref.lower()
        if lowered.startswith("aws-sm:") or lowered.startswith("k8s-secret:"):
            if token:
                return token, "resolved from GITHUB_TOKEN fallback"
            return (
                "",
                "GitHub access preflight needs a resolvable token; provide GITHUB_TOKEN "
                "(or the RELEASE_FLOW_GITHUB_TOKEN workflow secret) for non-env token refs",
            )
        env_name = token_ref.removeprefix("env:").strip()
        value = os.getenv(env_name, "").strip()
        if value:
            return value, f"resolved from {env_name}"
        if token:
            return token, "resolved from GITHUB_TOKEN fallback"
        return "", f"GitHub access preflight token ref {env_name} is not set"
    if token:
        return token, "resolved from GITHUB_TOKEN"
    return "", "GitHub access preflight requires GITHUB_TOKEN or env-resolvable GITHUB_TOKEN_REF"


def github_runtime_config_state(name: str, value: str) -> tuple[bool, bool, str]:
    if name == "github_token":
        return github_token_config_state()
    if name == "scm_repo":
        if not value:
            return False, False, "missing"
        if not github_repo_ref_valid(value):
            return True, False, "must be an owner/repo GitHub repository path"
        return True, True, ""
    if name == "github_api_base":
        if not value:
            return True, True, "using default https://api.github.com"
        valid, detail = https_url_validity(value)
        return True, valid, detail
    return bool(value), bool(value), "" if value else "missing"


def github_token_config_state() -> tuple[bool, bool, str]:
    token_ref = os.getenv("GITHUB_TOKEN_REF", "").strip()
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token_ref:
        valid, detail = github_token_ref_validity(token_ref)
        return True, valid, detail
    if token:
        valid, detail = secret_value_validity(token)
        return True, valid, detail
    return False, False, "missing"


def github_token_ref_validity(ref: str) -> tuple[bool, str]:
    lowered = ref.lower()
    if lowered in GITHUB_PLACEHOLDER_TOKENS:
        return False, "must not use a placeholder token ref"
    if lowered.startswith("aws-sm:"):
        return (len(ref.removeprefix("aws-sm:").strip()) > 0, "aws-sm ref is empty")
    if lowered.startswith("k8s-secret:"):
        value = ref.removeprefix("k8s-secret:").strip()
        if "/" not in value or "#" not in value:
            return False, "k8s-secret ref must be namespace/name#key"
        return True, ""
    env_name = ref.removeprefix("env:").strip()
    if not env_name:
        return False, "env token ref is empty"
    if not os.getenv(env_name, "").strip():
        return False, f"env token ref {env_name} is not set"
    return secret_value_validity(os.getenv(env_name, "").strip())


def secret_value_validity(value: str) -> tuple[bool, str]:
    if len(value) < 20 or value.lower() in GITHUB_PLACEHOLDER_TOKENS:
        return False, "must be a non-placeholder token of at least 20 characters"
    return True, ""


def github_repo_ref_valid(value: str) -> bool:
    parts = value.strip().split("/")
    if len(parts) != 2:
        return False
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-")
    return all(part and set(part) <= allowed for part in parts)


def live_runtime_config_state(name: str, value: str) -> tuple[bool, bool, str]:
    if name == "live_enabled":
        if not value:
            return False, False, "missing"
        if value.strip().lower() not in TRUTHY_RUNTIME_VALUES:
            return True, False, "must be enabled with one of 1, true, yes, on, enabled"
        return True, True, ""
    if name == "live_workspaces":
        workspaces = [item.strip() for item in value.split(",") if item.strip()]
        if not workspaces:
            return False, False, "missing"
        if "*" in workspaces:
            return (
                True,
                False,
                "must name explicit production workspace ids; wildcard * is not accepted",
            )
        return True, True, ""
    return bool(value), bool(value), "" if value else "missing"


def runtime_config_value(env_names: tuple[str, ...]) -> str:
    for env_name in env_names:
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return ""


def runtime_config_validity(name: str, value: str) -> tuple[bool, str]:
    if not value:
        return False, "missing"
    if name == "api_base_url":
        return https_url_validity(value)
    if name == "auth_email":
        lowered = value.lower()
        if (
            "@" not in value
            or lowered.endswith("@example.com")
            or lowered == "release-oncall@example.com"
        ):
            return False, "must be a real operator account email"
        return True, ""
    if name == "auth_password":
        if len(value) < 12 or value.lower() in RUNTIME_PLACEHOLDER_PASSWORDS:
            return False, "must be a non-placeholder secret of at least 12 characters"
        return True, ""
    return True, ""


def https_url_validity(value: str) -> tuple[bool, str]:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return False, "must use https"
    if (
        host in RUNTIME_PLACEHOLDER_HOSTS
        or host.endswith(".localhost")
        or host.endswith(".example.com")
        or host.endswith(".example.test")
    ):
        return False, "must not point at localhost or example hosts"
    return True, ""


def runtime_config_detail(
    *,
    configured: bool,
    valid: bool,
    invalid_detail: str,
    env_names: tuple[str, ...],
    require_runtime_config: bool,
) -> str:
    if configured and valid:
        if invalid_detail:
            return invalid_detail
        return "configured"
    if configured:
        prefix = "invalid" if require_runtime_config else "not checked"
        return f"{prefix}; {invalid_detail}"
    return f"not checked; set one of {', '.join(env_names)}"


def write_report(path: Path, checks: list[ReadinessCheck]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ok": all(check.ok for check in checks),
        "checks": [asdict(check) for check in checks],
    }
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
    parser.add_argument("--check-github-access", action="store_true")
    parser.add_argument("--require-production-deploy", action="store_true")
    parser.add_argument("--report-path", type=Path)
    parser.add_argument("--markdown-path", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    checks = validate_readiness(
        require_runtime_config=args.require_runtime_config,
        check_github_access=args.check_github_access,
        require_production_deploy=args.require_production_deploy,
    )
    if args.report_path:
        write_report(args.report_path, checks)
    if args.markdown_path:
        write_markdown(args.markdown_path, checks)
    for check in checks:
        print(f"{'ok' if check.ok else 'fail'} {check.name}: {check.detail}")
    return 0 if all(check.ok for check in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
