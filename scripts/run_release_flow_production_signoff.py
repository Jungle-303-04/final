#!/usr/bin/env python3
"""Run the full release-flow production sign-off path."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.parse
from datetime import UTC, datetime, timedelta
from pathlib import Path

DEFAULT_PREFLIGHT_REPORT_MAX_AGE_MINUTES = 60

try:
    from run_release_flow_production_readiness import dispatch_workflow, wait_for_run
    from verify_release_flow_production_evidence import (
        DEFAULT_GITHUB_API_BASE,
        DEPLOY_WORKFLOW,
        READINESS_WORKFLOW,
        GitHubEvidenceError,
        github_api_url,
        github_json,
    )
    from verify_release_flow_production_evidence import (
        main as verify_evidence_main,
    )
except ImportError:  # pragma: no cover - used when imported as scripts.*
    from scripts.run_release_flow_production_readiness import dispatch_workflow, wait_for_run
    from scripts.verify_release_flow_production_evidence import (
        DEFAULT_GITHUB_API_BASE,
        DEPLOY_WORKFLOW,
        READINESS_WORKFLOW,
        GitHubEvidenceError,
        github_api_url,
        github_json,
    )
    from scripts.verify_release_flow_production_evidence import (
        main as verify_evidence_main,
    )


PLACEHOLDER_CHANGE_TICKETS = {"CHG-PREFLIGHT"}
PLACEHOLDER_IMAGES = {"ghcr.io/example/release-flow-smoke:live-preflight"}
PLACEHOLDER_OPERATOR_VALUES = {"release-operator", "release-oncall@example.com"}
PLACEHOLDER_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}
SAFE_PLAN_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--github-repo", required=True, help="GitHub repository in owner/repo form."
    )
    parser.add_argument(
        "--github-token", default="", help="GitHub token with Actions workflow access."
    )
    parser.add_argument(
        "--github-token-env",
        default="GITHUB_TOKEN",
        help="Environment variable that contains the GitHub token when --github-token is omitted.",
    )
    parser.add_argument("--github-api-base", default=DEFAULT_GITHUB_API_BASE)
    parser.add_argument("--github-branch", default="dev", help="Branch/ref to dispatch and poll.")
    parser.add_argument("--github-sha", required=True, help="Exact production commit SHA to prove.")
    parser.add_argument(
        "--skip-local-sha-check",
        action="store_true",
        help="Skip checking that the local git checkout matches --github-sha.",
    )
    parser.add_argument(
        "--skip-github-branch-sha-check",
        action="store_true",
        help="Skip checking that --github-branch currently points at --github-sha.",
    )
    parser.add_argument("--environment", default="production", help="GitHub Environment input.")
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument(
        "--github-output-dir", type=Path, default=Path("release-flow-production-evidence")
    )
    parser.add_argument(
        "--signoff-report-path",
        type=Path,
        default=None,
        help="Write the final sign-off summary JSON. Defaults under --github-output-dir.",
    )
    parser.add_argument(
        "--preflight-report-path",
        type=Path,
        default=None,
        help="Write the preflight-only summary JSON. Defaults under --github-output-dir.",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Validate sign-off inputs, branch SHA, Safe PR run, and workflow access without dispatching workflows.",
    )
    parser.add_argument(
        "--skip-preflight-report-check",
        action="store_true",
        help="Skip requiring release-flow-production-preflight.json before full sign-off dispatch.",
    )
    parser.add_argument(
        "--preflight-report-max-age-minutes",
        type=int,
        default=DEFAULT_PREFLIGHT_REPORT_MAX_AGE_MINUTES,
        help="Maximum age for release-flow-production-preflight.json before full sign-off dispatch.",
    )
    parser.add_argument("--release-plan-id", required=True)
    parser.add_argument("--api-base-url", default="")
    parser.add_argument("--live-change-ticket", required=True)
    parser.add_argument("--live-runbook-url", required=True)
    parser.add_argument("--live-release-owner", default="")
    parser.add_argument("--live-oncall-contact", default="")
    parser.add_argument("--live-image", required=True)
    parser.add_argument("--live-verification-url", required=True)
    parser.add_argument("--live-safe-pr-workflow-run-id", required=True)
    parser.add_argument("--live-safe-pr-url", required=True)
    parser.add_argument("--production-preflight-run-limit", default="20")
    parser.add_argument("--request-timeout-seconds", default="30")
    parser.add_argument("--retry-attempts", default="3")
    parser.add_argument("--retry-delay-seconds", default="1")
    return parser.parse_args(argv)


def is_placeholder_host(host: str) -> bool:
    host = host.strip().lower().strip("[]")
    return (
        host in PLACEHOLDER_HOSTS
        or host.endswith(".localhost")
        or host.endswith(".example.com")
        or host.endswith(".example.test")
    )


def validate_live_https_url(field_name: str, value: str) -> str | None:
    parsed = urllib.parse.urlparse(str(value or "").strip())
    if parsed.scheme != "https":
        return f"{field_name} must use https"
    if not parsed.netloc:
        return f"{field_name} must include a host"
    if is_placeholder_host(parsed.hostname or ""):
        return f"{field_name} must not use localhost or example hosts"
    return None


def validate_release_plan_id(plan_id: str) -> str | None:
    plan_id = str(plan_id or "").strip()
    if not plan_id:
        return "release_plan_id is required"
    if plan_id[0] not in SAFE_PLAN_ID_CHARS or any(
        char not in SAFE_PLAN_ID_CHARS for char in plan_id
    ):
        return "release_plan_id must be path-safe: letters, numbers, dot, underscore, colon, or hyphen only"
    if len(plan_id) > 128:
        return "release_plan_id must be 128 characters or fewer"
    return None


def validate_image(value: str) -> str | None:
    image = str(value or "").strip()
    if image in PLACEHOLDER_IMAGES:
        return f"live_image must not use production placeholder value {image}"
    if image.endswith(":latest"):
        return "live_image must not use mutable latest tag"
    if ":" not in image.rsplit("/", 1)[-1] and "@" not in image:
        return "live_image must include an immutable tag or digest"
    return None


def current_git_sha() -> str:
    if not Path(".git").exists():
        return ""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip()


def github_branch_head_sha(args: argparse.Namespace, token: str) -> str:
    branch = str(args.github_branch or "").strip()
    if branch.startswith("refs/heads/"):
        branch = branch.removeprefix("refs/heads/")
    if not branch:
        raise GitHubEvidenceError("--github-branch is required for production sign-off")
    branch_ref = urllib.parse.quote(branch, safe="/")
    payload = github_json(
        github_api_url(args.github_api_base, args.github_repo, f"git/ref/heads/{branch_ref}"),
        token,
    )
    ref_object = payload.get("object") if isinstance(payload.get("object"), dict) else {}
    sha = str(ref_object.get("sha") or "").strip()
    if not sha:
        raise GitHubEvidenceError(f"GitHub branch {args.github_branch} did not report a head sha")
    return sha


def verify_github_branch_sha(args: argparse.Namespace, token: str) -> str:
    if args.skip_github_branch_sha_check:
        return ""
    expected_sha = str(args.github_sha or "").strip()
    actual_sha = github_branch_head_sha(args, token)
    if actual_sha != expected_sha:
        raise GitHubEvidenceError(
            f"GitHub branch {args.github_branch} head {actual_sha} must match --github-sha {expected_sha}"
        )
    print(f"ok signoff.branch: {args.github_branch} matches {expected_sha}")
    return actual_sha


def verify_workflow_access(args: argparse.Namespace, token: str) -> list[dict[str, str]]:
    workflows: list[dict[str, str]] = []
    for workflow in (READINESS_WORKFLOW, DEPLOY_WORKFLOW):
        workflow_ref = urllib.parse.quote(workflow, safe="")
        payload = github_json(
            github_api_url(
                args.github_api_base,
                args.github_repo,
                f"actions/workflows/{workflow_ref}",
            ),
            token,
        )
        state = str(payload.get("state") or "").strip()
        workflow_id = str(payload.get("id") or "").strip()
        if state and state != "active":
            raise GitHubEvidenceError(f"{workflow} is {state}, not active")
        if not workflow_id:
            raise GitHubEvidenceError(f"{workflow} was not readable through GitHub Actions API")
        workflows.append(
            {
                "workflow": workflow,
                "id": workflow_id,
                "state": state or "active",
                "path": str(payload.get("path") or ""),
            }
        )
        print(f"ok signoff.workflow: {workflow} is readable")
    return workflows


def validate_safe_pr_url(args: argparse.Namespace) -> str | None:
    run_id = str(args.live_safe_pr_workflow_run_id or "").strip()
    if not run_id.isdigit():
        return None
    parsed = urllib.parse.urlparse(str(args.live_safe_pr_url or "").strip())
    parts = [urllib.parse.unquote(part) for part in parsed.path.split("/") if part]
    repo_parts = str(args.github_repo or "").strip().split("/")
    expected_prefix = [*repo_parts, "actions", "runs"]
    if len(repo_parts) != 2 or len(parts) < 5 or parts[:4] != expected_prefix:
        return "live_safe_pr_url must point to the configured repo actions run"
    if parts[4] != run_id:
        return "live_safe_pr_url run id must match live_safe_pr_workflow_run_id"
    return None


def verify_safe_pr_run(args: argparse.Namespace, token: str) -> dict:
    run_id = str(args.live_safe_pr_workflow_run_id or "").strip()
    run = github_json(
        github_api_url(args.github_api_base, args.github_repo, f"actions/runs/{run_id}"),
        token,
    )
    if str(run.get("id") or "") != run_id:
        raise GitHubEvidenceError(f"Safe PR run {run_id} response did not match requested id")
    conclusion = str(run.get("conclusion") or "").strip()
    if conclusion != "success":
        raise GitHubEvidenceError(f"Safe PR run {run_id} did not conclude success")
    head_sha = str(run.get("head_sha") or "").strip()
    expected_sha = str(args.github_sha or "").strip()
    if head_sha != expected_sha:
        raise GitHubEvidenceError(
            f"Safe PR run {run_id} head {head_sha or '<missing>'} must match --github-sha {expected_sha}"
        )
    print(f"ok signoff.safe_pr: run {run_id} succeeded for {expected_sha}")
    return run


def validate_signoff_inputs(args: argparse.Namespace) -> list[str]:
    errors: list[str] = []
    repo = str(args.github_repo or "").strip()
    if "/" not in repo or repo.startswith(("http://", "https://")) or repo.count("/") != 1:
        errors.append("--github-repo must be in owner/repo form")
    plan_error = validate_release_plan_id(str(args.release_plan_id or ""))
    if plan_error:
        errors.append(plan_error)
    for field_name, value in (
        ("live_runbook_url", args.live_runbook_url),
        ("live_verification_url", args.live_verification_url),
        ("live_safe_pr_url", args.live_safe_pr_url),
    ):
        error = validate_live_https_url(field_name, str(value or ""))
        if error:
            errors.append(error)
    if args.api_base_url:
        error = validate_live_https_url("api_base_url", str(args.api_base_url or ""))
        if error:
            errors.append(error)
    image_error = validate_image(str(args.live_image or ""))
    if image_error:
        errors.append(image_error)
    if str(args.live_change_ticket or "").strip() in PLACEHOLDER_CHANGE_TICKETS:
        errors.append("live_change_ticket must not use placeholder CHG-PREFLIGHT")
    owner = str(args.live_release_owner or "").strip()
    oncall = str(args.live_oncall_contact or "").strip()
    if not owner and not oncall:
        errors.append("live_release_owner or live_oncall_contact is required")
    if owner in PLACEHOLDER_OPERATOR_VALUES or oncall in PLACEHOLDER_OPERATOR_VALUES:
        errors.append(
            "live_release_owner/live_oncall_contact must not use placeholder operator values"
        )
    if not str(args.live_safe_pr_workflow_run_id or "").strip().isdigit():
        errors.append("live_safe_pr_workflow_run_id must be a numeric GitHub Actions run id")
    if int(args.preflight_report_max_age_minutes or 0) <= 0:
        errors.append("preflight_report_max_age_minutes must be positive")
    safe_pr_url_error = validate_safe_pr_url(args)
    if safe_pr_url_error:
        errors.append(safe_pr_url_error)
    local_sha = "" if args.skip_local_sha_check else current_git_sha()
    if local_sha and str(args.github_sha or "").strip() != local_sha:
        errors.append("local git HEAD must match --github-sha for production sign-off")
    return errors


def readiness_inputs(args: argparse.Namespace) -> dict[str, str]:
    return {
        "github_environment": args.environment,
        "github_access_preflight": "true",
        "github_environment_preflight": "true",
        "api_smoke_preflight": "true",
        "production_deploy_required": "true",
    }


def deploy_inputs(args: argparse.Namespace) -> dict[str, str]:
    return {
        "api_base_url": str(args.api_base_url or ""),
        "release_plan_id": args.release_plan_id,
        "live_change_ticket": args.live_change_ticket,
        "live_runbook_url": args.live_runbook_url,
        "live_release_owner": str(args.live_release_owner or ""),
        "live_oncall_contact": str(args.live_oncall_contact or ""),
        "live_image": args.live_image,
        "live_verification_url": args.live_verification_url,
        "live_safe_pr_workflow_run_id": args.live_safe_pr_workflow_run_id,
        "live_safe_pr_url": args.live_safe_pr_url,
        "production_preflight_run_limit": str(args.production_preflight_run_limit),
        "request_timeout_seconds": str(args.request_timeout_seconds),
        "retry_attempts": str(args.retry_attempts),
        "retry_delay_seconds": str(args.retry_delay_seconds),
    }


def verify_artifacts(
    args: argparse.Namespace,
    token: str,
    *,
    allow_missing_deploy: bool,
    readiness_run_id: str,
    deploy_run_id: str = "",
    require_signoff_report: bool = False,
) -> int:
    argv = [
        "--github-repo",
        args.github_repo,
        "--github-token",
        token,
        "--github-api-base",
        args.github_api_base,
        "--github-branch",
        args.github_branch,
        "--github-sha",
        args.github_sha,
        "--github-output-dir",
        str(args.github_output_dir),
        "--github-readiness-run-id",
        readiness_run_id,
    ]
    if deploy_run_id:
        argv.extend(["--github-deploy-run-id", deploy_run_id])
    if allow_missing_deploy:
        argv.append("--allow-missing-deploy")
    if require_signoff_report:
        argv.append("--require-signoff-report")
    return verify_evidence_main(argv)


def dispatch_and_wait(
    *,
    args: argparse.Namespace,
    token: str,
    workflow: str,
    inputs: dict[str, str],
    started_after: datetime,
) -> dict:
    dispatch_workflow(
        api_base=args.github_api_base,
        repo=args.github_repo,
        workflow=workflow,
        branch=args.github_branch,
        token=token,
        inputs=inputs,
    )
    print(f"ok signoff.dispatch: {workflow} on {args.github_branch}")
    run = wait_for_run(
        api_base=args.github_api_base,
        repo=args.github_repo,
        workflow=workflow,
        branch=args.github_branch,
        head_sha=args.github_sha,
        token=token,
        started_after=started_after,
        timeout_seconds=args.timeout_seconds,
        poll_seconds=args.poll_seconds,
    )
    run_id = str(run.get("id") or "")
    conclusion = str(run.get("conclusion") or "")
    url = str(run.get("html_url") or "")
    if not run_id.isdigit():
        raise GitHubEvidenceError(f"{workflow} completed run did not report a numeric run id")
    if conclusion != "success":
        raise GitHubEvidenceError(
            f"{workflow} run {run_id} concluded {conclusion or '<missing>'} {url}".rstrip()
        )
    print(f"ok signoff.run: {workflow} run {run_id} succeeded {url}".rstrip())
    return run


def run_summary(run: dict) -> dict[str, str]:
    return {
        "id": str(run.get("id") or ""),
        "status": str(run.get("status") or ""),
        "conclusion": str(run.get("conclusion") or ""),
        "head_sha": str(run.get("head_sha") or ""),
        "html_url": str(run.get("html_url") or ""),
    }


def signoff_report_path(args: argparse.Namespace) -> Path:
    if args.signoff_report_path:
        return Path(args.signoff_report_path)
    return Path(args.github_output_dir) / "release-flow-production-signoff.json"


def preflight_report_path(args: argparse.Namespace) -> Path:
    if args.preflight_report_path:
        return Path(args.preflight_report_path)
    return Path(args.github_output_dir) / "release-flow-production-preflight.json"


def write_preflight_report(
    args: argparse.Namespace,
    *,
    github_branch_head_sha: str,
    safe_pr_run: dict,
    workflows: list[dict[str, str]],
) -> Path:
    path = preflight_report_path(args)
    path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC)
    payload = {
        "status": "passed",
        "mode": "preflight_only",
        "generated_at": generated_at.isoformat(),
        "expires_at": (
            generated_at + timedelta(minutes=int(args.preflight_report_max_age_minutes))
        ).isoformat(),
        "github_repo": args.github_repo,
        "github_branch": args.github_branch,
        "github_branch_head_sha": github_branch_head_sha,
        "github_sha": args.github_sha,
        "github_environment": args.environment,
        "release_plan_id": args.release_plan_id,
        "live_change_ticket": args.live_change_ticket,
        "live_runbook_url": args.live_runbook_url,
        "live_release_owner": str(args.live_release_owner or ""),
        "live_oncall_contact": str(args.live_oncall_contact or ""),
        "live_image": args.live_image,
        "live_verification_url": args.live_verification_url,
        "live_safe_pr_workflow_run_id": args.live_safe_pr_workflow_run_id,
        "live_safe_pr_url": args.live_safe_pr_url,
        "safe_pr_run": run_summary(safe_pr_run),
        "workflows": workflows,
        "dispatch_performed": False,
        "checks": [
            "input_validation",
            "local_sha",
            "github_branch_sha",
            "safe_pr_run",
            "production_workflow_access",
        ],
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"ok signoff.preflight_report: {path}")
    return path


def report_payload_sha256(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def preflight_report_summary(args: argparse.Namespace) -> dict[str, object]:
    if args.skip_preflight_report_check:
        return {"skipped": True}
    path = preflight_report_path(args)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {"path": str(path), "sha256": ""}
    return {
        "path": str(path),
        "sha256": report_payload_sha256(payload),
        "status": payload.get("status"),
        "mode": payload.get("mode"),
        "dispatch_performed": payload.get("dispatch_performed"),
        "generated_at": payload.get("generated_at"),
        "expires_at": payload.get("expires_at"),
        "github_repo": payload.get("github_repo"),
        "github_branch": payload.get("github_branch"),
        "github_branch_head_sha": payload.get("github_branch_head_sha"),
        "github_sha": payload.get("github_sha"),
        "release_plan_id": payload.get("release_plan_id"),
        "live_safe_pr_workflow_run_id": payload.get("live_safe_pr_workflow_run_id"),
        "checks": payload.get("checks", []),
    }


def parse_report_timestamp(value: object, field_name: str) -> datetime:
    try:
        timestamp = datetime.fromisoformat(str(value or ""))
    except ValueError as exc:
        raise GitHubEvidenceError(f"preflight report {field_name} is invalid") from exc
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC)


def verify_preflight_report(args: argparse.Namespace) -> None:
    if args.skip_preflight_report_check:
        return
    path = preflight_report_path(args)
    if not path.is_file():
        raise GitHubEvidenceError(
            f"preflight report is required before full sign-off dispatch: {path}"
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GitHubEvidenceError(f"preflight report is not valid JSON: {path}") from exc
    if not isinstance(payload, dict):
        raise GitHubEvidenceError(f"preflight report must be a JSON object: {path}")
    if (
        payload.get("status") != "passed"
        or payload.get("mode") != "preflight_only"
        or payload.get("dispatch_performed") is not False
    ):
        raise GitHubEvidenceError(
            "preflight report did not pass in preflight_only mode without dispatch"
        )

    now = datetime.now(UTC)
    generated_at = parse_report_timestamp(payload.get("generated_at"), "generated_at")
    max_age = timedelta(minutes=int(args.preflight_report_max_age_minutes))
    if generated_at > now + timedelta(minutes=5):
        raise GitHubEvidenceError("preflight report generated_at is in the future")
    if now - generated_at > max_age:
        raise GitHubEvidenceError("preflight report is too old for full sign-off dispatch")
    if payload.get("expires_at"):
        expires_at = parse_report_timestamp(payload.get("expires_at"), "expires_at")
        if expires_at < now:
            raise GitHubEvidenceError("preflight report has expired")
    expected_checks = {
        "input_validation",
        "local_sha",
        "github_branch_sha",
        "safe_pr_run",
        "production_workflow_access",
    }
    actual_checks = {str(item) for item in payload.get("checks", []) if isinstance(item, str)}
    if not expected_checks <= actual_checks:
        missing = ", ".join(sorted(expected_checks - actual_checks))
        raise GitHubEvidenceError(f"preflight report is missing checks: {missing}")

    expected_inputs = {
        "github_repo": args.github_repo,
        "github_branch": args.github_branch,
        "github_sha": args.github_sha,
        "github_environment": args.environment,
        "release_plan_id": args.release_plan_id,
        "live_change_ticket": args.live_change_ticket,
        "live_runbook_url": args.live_runbook_url,
        "live_release_owner": str(args.live_release_owner or ""),
        "live_oncall_contact": str(args.live_oncall_contact or ""),
        "live_image": args.live_image,
        "live_verification_url": args.live_verification_url,
        "live_safe_pr_workflow_run_id": args.live_safe_pr_workflow_run_id,
        "live_safe_pr_url": args.live_safe_pr_url,
    }
    mismatched = [
        key
        for key, value in expected_inputs.items()
        if str(payload.get(key) or "") != str(value or "")
    ]
    if mismatched:
        raise GitHubEvidenceError(
            "preflight report does not match full sign-off inputs: " + ", ".join(mismatched)
        )
    if str(payload.get("github_branch_head_sha") or "") != str(args.github_sha or ""):
        raise GitHubEvidenceError("preflight report branch head does not match --github-sha")

    safe_pr_run = payload.get("safe_pr_run") if isinstance(payload.get("safe_pr_run"), dict) else {}
    if str(safe_pr_run.get("id") or "") != str(args.live_safe_pr_workflow_run_id):
        raise GitHubEvidenceError("preflight report Safe PR run id does not match inputs")
    if str(safe_pr_run.get("conclusion") or "") != "success":
        raise GitHubEvidenceError("preflight report Safe PR run did not conclude success")
    if str(safe_pr_run.get("head_sha") or "") != str(args.github_sha):
        raise GitHubEvidenceError("preflight report Safe PR run head does not match --github-sha")

    workflows = payload.get("workflows") if isinstance(payload.get("workflows"), list) else []
    workflow_names = {
        str(item.get("workflow") or "")
        for item in workflows
        if isinstance(item, dict) and str(item.get("state") or "") == "active"
    }
    missing_workflows = sorted({READINESS_WORKFLOW, DEPLOY_WORKFLOW} - workflow_names)
    if missing_workflows:
        raise GitHubEvidenceError(
            "preflight report is missing active workflows: " + ", ".join(missing_workflows)
        )
    print(f"ok signoff.preflight_report: {path} matches full sign-off inputs")


def write_signoff_report(
    args: argparse.Namespace,
    *,
    readiness_run: dict,
    deploy_run: dict,
    evidence_status: int,
) -> Path:
    path = signoff_report_path(args)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "passed" if evidence_status == 0 else "failed",
        "generated_at": datetime.now(UTC).isoformat(),
        "github_repo": args.github_repo,
        "github_branch": args.github_branch,
        "github_sha": args.github_sha,
        "github_environment": args.environment,
        "release_plan_id": args.release_plan_id,
        "live_change_ticket": args.live_change_ticket,
        "live_runbook_url": args.live_runbook_url,
        "live_release_owner": str(args.live_release_owner or ""),
        "live_oncall_contact": str(args.live_oncall_contact or ""),
        "live_image": args.live_image,
        "live_verification_url": args.live_verification_url,
        "live_safe_pr_workflow_run_id": args.live_safe_pr_workflow_run_id,
        "live_safe_pr_url": args.live_safe_pr_url,
        "readiness_run": run_summary(readiness_run),
        "deploy_run": run_summary(deploy_run),
        "preflight_report": preflight_report_summary(args),
        "evidence_verification_status": evidence_status,
        "evidence_output_dir": str(args.github_output_dir),
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"ok signoff.report: {path}")
    return path


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    token = str(args.github_token or os.getenv(str(args.github_token_env or "")) or "").strip()
    if not token:
        print(
            "fail signoff.inputs: --github-token or configured --github-token-env is required",
            file=sys.stderr,
        )
        return 2
    input_errors = validate_signoff_inputs(args)
    if input_errors:
        print("fail signoff.inputs: " + "; ".join(input_errors), file=sys.stderr)
        return 2

    try:
        branch_head_sha = verify_github_branch_sha(args, token)
        safe_pr_run = verify_safe_pr_run(args, token)
        if args.preflight_only:
            workflows = verify_workflow_access(args, token)
            write_preflight_report(
                args,
                github_branch_head_sha=branch_head_sha,
                safe_pr_run=safe_pr_run,
                workflows=workflows,
            )
            print(
                "ok signoff.preflight: inputs, branch SHA, Safe PR run, and workflow access passed"
            )
            return 0
        verify_preflight_report(args)
        started_after = datetime.now(UTC) - timedelta(seconds=10)
        readiness_run = dispatch_and_wait(
            args=args,
            token=token,
            workflow=READINESS_WORKFLOW,
            inputs=readiness_inputs(args),
            started_after=started_after,
        )
        readiness_run_id = str(readiness_run.get("id") or "")
        readiness_status = verify_artifacts(
            args,
            token,
            allow_missing_deploy=True,
            readiness_run_id=readiness_run_id,
        )
        if readiness_status != 0:
            return readiness_status
        started_after = datetime.now(UTC) - timedelta(seconds=10)
        deploy_run = dispatch_and_wait(
            args=args,
            token=token,
            workflow=DEPLOY_WORKFLOW,
            inputs=deploy_inputs(args),
            started_after=started_after,
        )
        deploy_run_id = str(deploy_run.get("id") or "")
        final_status = verify_artifacts(
            args,
            token,
            allow_missing_deploy=False,
            readiness_run_id=readiness_run_id,
            deploy_run_id=deploy_run_id,
        )
        write_signoff_report(
            args, readiness_run=readiness_run, deploy_run=deploy_run, evidence_status=final_status
        )
        if final_status != 0:
            return final_status
        return verify_artifacts(
            args,
            token,
            allow_missing_deploy=False,
            readiness_run_id=readiness_run_id,
            deploy_run_id=deploy_run_id,
            require_signoff_report=True,
        )
    except GitHubEvidenceError as exc:
        print(f"fail signoff.github: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
