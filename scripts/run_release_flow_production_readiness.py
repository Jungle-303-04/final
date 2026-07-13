#!/usr/bin/env python3
"""Dispatch and verify the release-flow production readiness workflow."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

try:
    from verify_release_flow_production_evidence import (
        DEFAULT_GITHUB_API_BASE,
        READINESS_WORKFLOW,
        GitHubEvidenceError,
        github_api_url,
        github_headers,
        github_json,
    )
    from verify_release_flow_production_evidence import (
        main as verify_evidence_main,
    )
except ImportError:  # pragma: no cover - used when imported as scripts.*
    from scripts.verify_release_flow_production_evidence import (
        DEFAULT_GITHUB_API_BASE,
        READINESS_WORKFLOW,
        GitHubEvidenceError,
        github_api_url,
        github_headers,
        github_json,
    )
    from scripts.verify_release_flow_production_evidence import (
        main as verify_evidence_main,
    )


FINAL_CONCLUSIONS = {"success", "failure", "cancelled", "skipped", "timed_out", "action_required"}


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
    parser.add_argument(
        "--github-sha", default="", help="Require the completed run to use this head SHA."
    )
    parser.add_argument("--environment", default="production", help="GitHub Environment input.")
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument(
        "--started-after-minutes",
        type=int,
        default=5,
        help="When --skip-dispatch is used, only poll runs created within this window.",
    )
    parser.add_argument(
        "--skip-dispatch",
        action="store_true",
        help="Do not trigger a new run; only poll for an existing matching run.",
    )
    parser.add_argument(
        "--verify-artifact",
        action="store_true",
        help="After the readiness run succeeds, download and verify its readiness artifact.",
    )
    parser.add_argument(
        "--github-output-dir", type=Path, default=Path("release-flow-production-evidence")
    )
    parser.add_argument("--github-access-preflight", choices=("true", "false"), default="true")
    parser.add_argument("--github-environment-preflight", choices=("true", "false"), default="true")
    parser.add_argument("--api-smoke-preflight", choices=("true", "false"), default="true")
    parser.add_argument("--production-deploy-required", choices=("true", "false"), default="true")
    return parser.parse_args(argv)


def dispatch_workflow(
    *, api_base: str, repo: str, workflow: str, branch: str, token: str, inputs: dict[str, str]
) -> None:
    workflow_ref = quote(workflow, safe="")
    url = github_api_url(api_base, repo, f"actions/workflows/{workflow_ref}/dispatches")
    payload = json.dumps({"ref": branch, "inputs": inputs}).encode("utf-8")
    headers = github_headers(token)
    headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30):
            return
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GitHubEvidenceError(f"workflow dispatch failed: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise GitHubEvidenceError(f"workflow dispatch failed: {exc.reason}") from exc


def list_workflow_runs(
    *, api_base: str, repo: str, workflow: str, branch: str, token: str
) -> list[dict[str, Any]]:
    workflow_ref = quote(workflow, safe="")
    query = {"branch": branch, "event": "workflow_dispatch", "per_page": "20"}
    payload = github_json(
        github_api_url(api_base, repo, f"actions/workflows/{workflow_ref}/runs", query), token
    )
    return [item for item in payload.get("workflow_runs", []) if isinstance(item, dict)]


def parse_github_time(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def matching_run(run: dict[str, Any], *, started_after: datetime, head_sha: str) -> bool:
    created_at = parse_github_time(run.get("created_at"))
    if created_at is None or created_at < started_after:
        return False
    if head_sha and str(run.get("head_sha") or "") != head_sha:
        return False
    return True


def wait_for_run(
    *,
    api_base: str,
    repo: str,
    workflow: str,
    branch: str,
    head_sha: str,
    token: str,
    started_after: datetime,
    timeout_seconds: int,
    poll_seconds: int,
) -> dict[str, Any]:
    deadline = time.monotonic() + max(timeout_seconds, 1)
    interval = max(poll_seconds, 1)
    last_seen = "no matching run yet"
    while True:
        runs = list_workflow_runs(
            api_base=api_base, repo=repo, workflow=workflow, branch=branch, token=token
        )
        candidates = [
            run for run in runs if matching_run(run, started_after=started_after, head_sha=head_sha)
        ]
        if candidates:
            run = sorted(
                candidates, key=lambda item: str(item.get("created_at") or ""), reverse=True
            )[0]
            status = str(run.get("status") or "")
            conclusion = str(run.get("conclusion") or "")
            run_id = str(run.get("id") or "")
            last_seen = f"run {run_id} status={status} conclusion={conclusion or '<pending>'}"
            print(
                f"poll readiness.{run_id}: status={status} conclusion={conclusion or '<pending>'}"
            )
            if status == "completed" or conclusion in FINAL_CONCLUSIONS:
                return run
        if time.monotonic() >= deadline:
            raise GitHubEvidenceError(f"timed out waiting for {workflow}: {last_seen}")
        time.sleep(interval)


def verify_readiness_artifact(args: argparse.Namespace, run: dict[str, Any], token: str) -> int:
    head_sha = str(run.get("head_sha") or "").strip()
    if not head_sha:
        print(
            "fail readiness.artifact_verify: completed run did not report head_sha", file=sys.stderr
        )
        return 1
    return verify_evidence_main(
        [
            "--github-repo",
            args.github_repo,
            "--github-token",
            token,
            "--github-api-base",
            args.github_api_base,
            "--github-branch",
            args.github_branch,
            "--github-sha",
            head_sha,
            "--github-output-dir",
            str(args.github_output_dir),
            "--allow-missing-deploy",
        ]
    )


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    token = str(args.github_token or os.getenv(str(args.github_token_env or "")) or "").strip()
    if not token:
        print(
            "fail readiness.inputs: --github-token or configured --github-token-env is required",
            file=sys.stderr,
        )
        return 2
    if "/" not in args.github_repo:
        print("fail readiness.inputs: --github-repo must be in owner/repo form", file=sys.stderr)
        return 2
    inputs = {
        "github_environment": args.environment,
        "github_access_preflight": args.github_access_preflight,
        "github_environment_preflight": args.github_environment_preflight,
        "api_smoke_preflight": args.api_smoke_preflight,
        "production_deploy_required": args.production_deploy_required,
    }
    started_after = datetime.now(UTC) - timedelta(
        minutes=max(args.started_after_minutes, 1) if args.skip_dispatch else 0,
        seconds=10 if not args.skip_dispatch else 0,
    )
    try:
        if not args.skip_dispatch:
            dispatch_workflow(
                api_base=args.github_api_base,
                repo=args.github_repo,
                workflow=READINESS_WORKFLOW,
                branch=args.github_branch,
                token=token,
                inputs=inputs,
            )
            print(f"ok readiness.dispatch: {READINESS_WORKFLOW} on {args.github_branch}")
        run = wait_for_run(
            api_base=args.github_api_base,
            repo=args.github_repo,
            workflow=READINESS_WORKFLOW,
            branch=args.github_branch,
            head_sha=str(args.github_sha or ""),
            token=token,
            started_after=started_after,
            timeout_seconds=args.timeout_seconds,
            poll_seconds=args.poll_seconds,
        )
        run_id = str(run.get("id") or "")
        conclusion = str(run.get("conclusion") or "")
        url = str(run.get("html_url") or "")
        if conclusion != "success":
            print(
                f"fail readiness.run: run {run_id} concluded {conclusion or '<missing>'} {url}".rstrip()
            )
            return 1
        print(f"ok readiness.run: run {run_id} succeeded {url}".rstrip())
        if args.verify_artifact:
            return verify_readiness_artifact(args, run, token)
        return 0
    except GitHubEvidenceError as exc:
        print(f"fail readiness.github: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
