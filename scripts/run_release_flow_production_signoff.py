#!/usr/bin/env python3
"""Run the full release-flow production sign-off path."""

from __future__ import annotations

import argparse
import os
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from run_release_flow_production_readiness import dispatch_workflow, wait_for_run
    from verify_release_flow_production_evidence import (
        DEFAULT_GITHUB_API_BASE,
        DEPLOY_WORKFLOW,
        READINESS_WORKFLOW,
        GitHubEvidenceError,
        main as verify_evidence_main,
    )
except ImportError:  # pragma: no cover - used when imported as scripts.*
    from scripts.run_release_flow_production_readiness import dispatch_workflow, wait_for_run
    from scripts.verify_release_flow_production_evidence import (
        DEFAULT_GITHUB_API_BASE,
        DEPLOY_WORKFLOW,
        READINESS_WORKFLOW,
        GitHubEvidenceError,
        main as verify_evidence_main,
    )


PLACEHOLDER_CHANGE_TICKETS = {"CHG-PREFLIGHT"}
PLACEHOLDER_IMAGES = {"ghcr.io/example/release-flow-smoke:live-preflight"}
PLACEHOLDER_OPERATOR_VALUES = {"release-operator", "release-oncall@example.com"}
PLACEHOLDER_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}
SAFE_PLAN_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--github-repo", required=True, help="GitHub repository in owner/repo form.")
    parser.add_argument("--github-token", default="", help="GitHub token with Actions workflow access.")
    parser.add_argument(
        "--github-token-env",
        default="GITHUB_TOKEN",
        help="Environment variable that contains the GitHub token when --github-token is omitted.",
    )
    parser.add_argument("--github-api-base", default=DEFAULT_GITHUB_API_BASE)
    parser.add_argument("--github-branch", default="dev", help="Branch/ref to dispatch and poll.")
    parser.add_argument("--github-sha", required=True, help="Exact production commit SHA to prove.")
    parser.add_argument("--environment", default="production", help="GitHub Environment input.")
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument("--github-output-dir", type=Path, default=Path("release-flow-production-evidence"))
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
    if plan_id[0] not in SAFE_PLAN_ID_CHARS or any(char not in SAFE_PLAN_ID_CHARS for char in plan_id):
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
        errors.append("live_release_owner/live_oncall_contact must not use placeholder operator values")
    if not str(args.live_safe_pr_workflow_run_id or "").strip().isdigit():
        errors.append("live_safe_pr_workflow_run_id must be a numeric GitHub Actions run id")
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


def verify_artifacts(args: argparse.Namespace, token: str, *, allow_missing_deploy: bool) -> int:
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
    ]
    if allow_missing_deploy:
        argv.append("--allow-missing-deploy")
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
    if conclusion != "success":
        raise GitHubEvidenceError(f"{workflow} run {run_id} concluded {conclusion or '<missing>'} {url}".rstrip())
    print(f"ok signoff.run: {workflow} run {run_id} succeeded {url}".rstrip())
    return run


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    token = str(args.github_token or os.getenv(str(args.github_token_env or "")) or "").strip()
    if not token:
        print("fail signoff.inputs: --github-token or configured --github-token-env is required", file=sys.stderr)
        return 2
    input_errors = validate_signoff_inputs(args)
    if input_errors:
        print("fail signoff.inputs: " + "; ".join(input_errors), file=sys.stderr)
        return 2

    try:
        started_after = datetime.now(timezone.utc) - timedelta(seconds=10)
        dispatch_and_wait(
            args=args,
            token=token,
            workflow=READINESS_WORKFLOW,
            inputs=readiness_inputs(args),
            started_after=started_after,
        )
        readiness_status = verify_artifacts(args, token, allow_missing_deploy=True)
        if readiness_status != 0:
            return readiness_status
        started_after = datetime.now(timezone.utc) - timedelta(seconds=10)
        dispatch_and_wait(
            args=args,
            token=token,
            workflow=DEPLOY_WORKFLOW,
            inputs=deploy_inputs(args),
            started_after=started_after,
        )
        return verify_artifacts(args, token, allow_missing_deploy=False)
    except GitHubEvidenceError as exc:
        print(f"fail signoff.github: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
