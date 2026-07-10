"""Verify downloaded release-flow production evidence artifacts."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode, urlparse


READINESS_REPORT = "release-flow-readiness.json"
SMOKE_REPORT = "release-flow-smoke.json"
DEPLOY_REPORT = "release-flow-deploy.json"
PLACEHOLDER_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}
DEFAULT_GITHUB_API_BASE = "https://api.github.com"
READINESS_WORKFLOW = "release-flow-production-readiness.yml"
DEPLOY_WORKFLOW = "release-flow-production-deploy.yml"
READINESS_ARTIFACTS = {"release-flow-production-readiness"}
DEPLOY_ARTIFACTS = {"release-flow-smoke-production", "release-flow-production-deploy"}

REQUIRED_READINESS_CHECKS = {
    "workflow.production_readiness.github_access_preflight",
    "workflow.production_readiness.api_smoke_preflight",
    "workflow.production_readiness.production_deploy_required",
    "workflow.production_gate.production_live_preflight_required",
    "workflow.production_gate.safe_pr_evidence_required",
    "workflow.production_gate.change_ticket_required",
    "workflow.production_gate.runbook_required",
    "workflow.production_gate.verification_url_required",
    "workflow.production_deploy.gates_start",
    "runtime.api_base_url",
    "runtime.auth_email",
    "runtime.auth_password",
    "runtime.github_token",
    "runtime.scm_repo",
    "runtime.live_enabled",
    "runtime.live_workspaces",
    "runtime.github_access_preflight",
}

REQUIRED_SMOKE_CHECKS = {
    "healthz",
    "readyz",
    "auth.session",
    "applications",
    "release-plans",
    "release-runs.summary",
    "release-runs.run-health-preflight",
    "release-runs.verification-preflight",
    "release-runs.policy-override-preflight",
    "release-runs.change-freeze-preflight",
    "release-plans.generated-manifest",
}

REQUIRED_DEPLOY_CHECKS = {
    "auth.session",
    "release-plan.production-contract",
    "release-plans.start.production",
}


@dataclass
class EvidenceCheck:
    name: str
    ok: bool
    detail: str


class GitHubEvidenceError(RuntimeError):
    pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "artifacts",
        nargs="*",
        type=Path,
        help="Downloaded artifact directories, JSON files, or artifact ZIP files.",
    )
    parser.add_argument(
        "--github-repo",
        default="",
        help="Fetch evidence artifacts from GitHub Actions for this owner/repo before verifying.",
    )
    parser.add_argument(
        "--github-token",
        default="",
        help="GitHub token used to read workflow runs and artifacts. Defaults to --github-token-env.",
    )
    parser.add_argument(
        "--github-token-env",
        default="GITHUB_TOKEN",
        help="Environment variable that contains the GitHub token when --github-token is omitted.",
    )
    parser.add_argument("--github-api-base", default=DEFAULT_GITHUB_API_BASE)
    parser.add_argument("--github-branch", default="dev")
    parser.add_argument("--github-sha", default="", help="Require successful workflow runs for this head SHA.")
    parser.add_argument(
        "--github-output-dir",
        type=Path,
        default=None,
        help="Directory where downloaded GitHub artifact ZIP files should be stored.",
    )
    parser.add_argument(
        "--allow-missing-smoke",
        action="store_true",
        help="Do not require the production readiness smoke report.",
    )
    parser.add_argument(
        "--allow-missing-deploy",
        action="store_true",
        help="Do not require the production deploy report.",
    )
    return parser.parse_args(argv)


def github_headers(token: str) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "release-flow-production-evidence-verifier",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def github_json(url: str, token: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=github_headers(token))
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GitHubEvidenceError(f"GitHub API request failed: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise GitHubEvidenceError(f"GitHub API request failed: {exc.reason}") from exc
    return payload if isinstance(payload, dict) else {}


def github_download(url: str, token: str) -> bytes:
    request = urllib.request.Request(url, headers=github_headers(token))
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GitHubEvidenceError(f"GitHub artifact download failed: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise GitHubEvidenceError(f"GitHub artifact download failed: {exc.reason}") from exc


def github_api_url(api_base: str, repo: str, path: str, query: dict[str, str] | None = None) -> str:
    base = api_base.rstrip("/")
    suffix = f"/repos/{repo.strip('/')}/{path.lstrip('/')}"
    if query:
        suffix += "?" + urlencode(query)
    return base + suffix


def find_successful_workflow_run(
    *,
    api_base: str,
    repo: str,
    workflow: str,
    branch: str,
    head_sha: str,
    token: str,
) -> dict[str, Any]:
    query = {"status": "completed", "per_page": "20"}
    if branch:
        query["branch"] = branch
    workflow_ref = quote(workflow, safe="")
    payload = github_json(
        github_api_url(api_base, repo, f"actions/workflows/{workflow_ref}/runs", query),
        token,
    )
    runs = [item for item in payload.get("workflow_runs", []) if isinstance(item, dict)]
    if head_sha:
        runs = [run for run in runs if str(run.get("head_sha") or "") == head_sha]
    for run in runs:
        if run.get("conclusion") == "success":
            return run
    qualifier = f" for {head_sha}" if head_sha else ""
    raise GitHubEvidenceError(f"no successful {workflow} run found on {branch}{qualifier}")


def download_run_artifacts(
    *,
    api_base: str,
    repo: str,
    run: dict[str, Any],
    artifact_names: set[str],
    output_dir: Path,
    token: str,
) -> list[Path]:
    run_id = str(run.get("id") or "").strip()
    if not run_id:
        raise GitHubEvidenceError("workflow run is missing id")
    payload = github_json(
        github_api_url(api_base, repo, f"actions/runs/{run_id}/artifacts", {"per_page": "100"}),
        token,
    )
    artifacts = [item for item in payload.get("artifacts", []) if isinstance(item, dict)]
    by_name = {str(item.get("name") or ""): item for item in artifacts}
    missing = sorted(name for name in artifact_names if name not in by_name)
    if missing:
        raise GitHubEvidenceError(f"workflow run {run_id} is missing artifacts: {', '.join(missing)}")
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for name in sorted(artifact_names):
        artifact = by_name[name]
        if artifact.get("expired") is True:
            raise GitHubEvidenceError(f"artifact {name} from workflow run {run_id} is expired")
        download_url = str(artifact.get("archive_download_url") or "")
        if not download_url:
            raise GitHubEvidenceError(f"artifact {name} from workflow run {run_id} is missing download URL")
        destination = output_dir / f"{run_id}-{name}.zip"
        destination.write_bytes(github_download(download_url, token))
        paths.append(destination)
    return paths


def fetch_github_artifacts(args: argparse.Namespace, output_dir: Path) -> list[Path]:
    repo = str(args.github_repo or "").strip()
    if not repo:
        return []
    if "/" not in repo:
        raise GitHubEvidenceError("--github-repo must be in owner/repo form")
    token = str(args.github_token or os.getenv(str(args.github_token_env or "")) or "").strip()
    if not token:
        raise GitHubEvidenceError("--github-token or configured --github-token-env is required")
    api_base = str(args.github_api_base or DEFAULT_GITHUB_API_BASE).strip()
    branch = str(args.github_branch or "dev").strip()
    head_sha = str(args.github_sha or "").strip()
    readiness_run = find_successful_workflow_run(
        api_base=api_base,
        repo=repo,
        workflow=READINESS_WORKFLOW,
        branch=branch,
        head_sha=head_sha,
        token=token,
    )
    paths = download_run_artifacts(
        api_base=api_base,
        repo=repo,
        run=readiness_run,
        artifact_names=READINESS_ARTIFACTS,
        output_dir=output_dir,
        token=token,
    )
    if not args.allow_missing_deploy:
        deploy_run = find_successful_workflow_run(
            api_base=api_base,
            repo=repo,
            workflow=DEPLOY_WORKFLOW,
            branch=branch,
            head_sha=head_sha,
            token=token,
        )
        paths.extend(
            download_run_artifacts(
                api_base=api_base,
                repo=repo,
                run=deploy_run,
                artifact_names=DEPLOY_ARTIFACTS,
                output_dir=output_dir,
                token=token,
            )
        )
    return paths


def load_named_report(paths: list[Path], filename: str) -> tuple[dict[str, Any] | None, str]:
    for path in paths:
        loaded = load_named_report_from_path(path, filename)
        if loaded is not None:
            return loaded
    return None, filename


def load_named_report_from_path(path: Path, filename: str) -> tuple[dict[str, Any], str] | None:
    if path.is_dir():
        for candidate in sorted(path.rglob(filename)):
            return load_json(candidate), str(candidate)
        return None
    if path.is_file() and path.name == filename:
        return load_json(path), str(path)
    if path.is_file() and path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            for name in sorted(archive.namelist()):
                if Path(name).name != filename:
                    continue
                with archive.open(name) as member:
                    return json.loads(member.read().decode("utf-8")), f"{path}!{name}"
    return None


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def validate_readiness(payload: dict[str, Any] | None, source: str) -> list[EvidenceCheck]:
    if payload is None:
        return [EvidenceCheck("readiness.artifact_present", False, f"{source} not found")]
    checks = [
        EvidenceCheck(
            "readiness.ok",
            payload.get("ok") is True,
            "readiness report passed" if payload.get("ok") is True else "readiness report did not pass",
        )
    ]
    checks.extend(validate_named_checks("readiness", payload, REQUIRED_READINESS_CHECKS))
    return checks


def validate_smoke(payload: dict[str, Any] | None, source: str, *, required: bool) -> list[EvidenceCheck]:
    if payload is None:
        return [
            EvidenceCheck(
                "smoke.artifact_present",
                not required,
                f"{source} not found" if required else "smoke report not required",
            )
        ]
    checks = [
        EvidenceCheck(
            "smoke.ok",
            payload.get("ok") is True,
            "production smoke passed" if payload.get("ok") is True else "production smoke did not pass",
        ),
        validate_https_url("smoke.api_base_url", str(payload.get("api_base_url") or "")),
    ]
    checks.extend(validate_named_checks("smoke", payload, REQUIRED_SMOKE_CHECKS))
    return checks


def validate_deploy(payload: dict[str, Any] | None, source: str, *, required: bool) -> list[EvidenceCheck]:
    if payload is None:
        return [
            EvidenceCheck(
                "deploy.artifact_present",
                not required,
                f"{source} not found" if required else "deploy report not required",
            )
        ]
    plan_id = str(payload.get("plan_id") or "").strip()
    checks = [
        EvidenceCheck(
            "deploy.ok",
            payload.get("ok") is True,
            "production deploy passed" if payload.get("ok") is True else "production deploy did not pass",
        ),
        validate_https_url("deploy.api_base_url", str(payload.get("api_base_url") or "")),
        EvidenceCheck(
            "deploy.plan_id",
            bool(plan_id),
            "production deploy recorded a plan id" if plan_id else "production deploy report is missing plan_id",
        ),
    ]
    checks.extend(validate_named_checks("deploy", payload, REQUIRED_DEPLOY_CHECKS))
    start = check_by_name(payload, "release-plans.start.production")
    run_id = str((start or {}).get("detail") or "").strip()
    checks.append(
        EvidenceCheck(
            "deploy.run_id",
            bool(start and start.get("ok") is True and run_id),
            f"production run started: {run_id}" if run_id else "deploy report is missing production run id",
        )
    )
    return checks


def validate_artifact_consistency(
    smoke: dict[str, Any] | None,
    deploy: dict[str, Any] | None,
) -> list[EvidenceCheck]:
    if smoke is None or deploy is None:
        return []
    smoke_api = str(smoke.get("api_base_url") or "").strip()
    deploy_api = str(deploy.get("api_base_url") or "").strip()
    return [
        EvidenceCheck(
            "evidence.api_base_url_consistent",
            bool(smoke_api) and smoke_api == deploy_api,
            "smoke and deploy used the same API base URL"
            if smoke_api and smoke_api == deploy_api
            else "smoke and deploy API base URLs differ",
        )
    ]


def validate_named_checks(prefix: str, payload: dict[str, Any], required_names: set[str]) -> list[EvidenceCheck]:
    actual = {str(item.get("name") or ""): item for item in payload_checks(payload)}
    missing = sorted(name for name in required_names if name not in actual)
    failed = sorted(name for name in required_names if name in actual and actual[name].get("ok") is not True)
    return [
        EvidenceCheck(
            f"{prefix}.required_checks_present",
            not missing,
            "required checks are present" if not missing else "missing checks: " + ", ".join(missing),
        ),
        EvidenceCheck(
            f"{prefix}.required_checks_passed",
            not failed,
            "required checks passed" if not failed else "failed checks: " + ", ".join(failed),
        ),
    ]


def payload_checks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    checks = payload.get("checks")
    return [item for item in checks if isinstance(item, dict)] if isinstance(checks, list) else []


def check_by_name(payload: dict[str, Any], name: str) -> dict[str, Any] | None:
    for check in payload_checks(payload):
        if str(check.get("name") or "") == name:
            return check
    return None


def validate_https_url(name: str, value: str) -> EvidenceCheck:
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    ok = parsed.scheme == "https" and bool(host) and not placeholder_host(host)
    return EvidenceCheck(
        name,
        ok,
        "concrete https URL" if ok else f"invalid or placeholder URL: {value or '<missing>'}",
    )


def placeholder_host(host: str) -> bool:
    return (
        host in PLACEHOLDER_HOSTS
        or host.endswith(".localhost")
        or host.endswith(".example.com")
        or host.endswith(".example.test")
    )


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if not args.artifacts and not args.github_repo:
        print("fail evidence.inputs: provide artifact paths or --github-repo", file=sys.stderr)
        return 2
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    try:
        github_paths: list[Path] = []
        if args.github_repo:
            output_dir = args.github_output_dir
            if output_dir is None:
                temp_dir = tempfile.TemporaryDirectory()
                output_dir = Path(temp_dir.name)
            github_paths = fetch_github_artifacts(args, output_dir)
        paths = [*args.artifacts, *github_paths]
        readiness, readiness_source = load_named_report(paths, READINESS_REPORT)
        smoke, smoke_source = load_named_report(paths, SMOKE_REPORT)
        deploy, deploy_source = load_named_report(paths, DEPLOY_REPORT)
        checks: list[EvidenceCheck] = []
        checks.extend(validate_readiness(readiness, readiness_source))
        checks.extend(validate_smoke(smoke, smoke_source, required=not args.allow_missing_smoke))
        checks.extend(validate_deploy(deploy, deploy_source, required=not args.allow_missing_deploy))
        checks.extend(validate_artifact_consistency(smoke, deploy))
        for check in checks:
            print(f"{'ok' if check.ok else 'fail'} {check.name}: {check.detail}")
        return 0 if all(check.ok for check in checks) else 1
    except GitHubEvidenceError as exc:
        print(f"fail github.artifacts: {exc}")
        return 1
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
