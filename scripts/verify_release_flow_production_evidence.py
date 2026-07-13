"""Verify downloaded release-flow production evidence artifacts."""

from __future__ import annotations

import argparse
import hashlib
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
ENVIRONMENT_REPORT = "release-flow-github-environment.json"
SMOKE_REPORT = "release-flow-smoke.json"
DEPLOY_REPORT = "release-flow-deploy.json"
PREFLIGHT_REPORT = "release-flow-production-preflight.json"
SIGNOFF_REPORT = "release-flow-production-signoff.json"
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

REQUIRED_ENVIRONMENT_CHECKS = {
    "secret.RELEASE_FLOW_API_BASE_URL",
    "secret.RELEASE_FLOW_AUTH_EMAIL",
    "secret.RELEASE_FLOW_AUTH_PASSWORD",
    "secret.github_token",
    "value.RELEASE_FLOW_SCM_REPO",
    "value.RELEASE_FLOW_LIVE_ENABLED",
    "value.RELEASE_FLOW_LIVE_WORKSPACES",
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
    parser.add_argument(
        "--github-sha", default="", help="Require successful workflow runs for this head SHA."
    )
    parser.add_argument(
        "--github-readiness-run-id",
        default="",
        help="Download readiness evidence from this exact GitHub Actions run id.",
    )
    parser.add_argument(
        "--github-deploy-run-id",
        default="",
        help="Download deploy evidence from this exact GitHub Actions run id.",
    )
    parser.add_argument(
        "--allow-latest-github-run",
        action="store_true",
        help="Allow GitHub artifact lookup without --github-sha. Use only for exploratory checks.",
    )
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
        "--allow-missing-environment",
        action="store_true",
        help="Do not require the GitHub Environment verification report.",
    )
    parser.add_argument(
        "--allow-missing-deploy",
        action="store_true",
        help="Do not require the production deploy report.",
    )
    parser.add_argument(
        "--require-signoff-report",
        action="store_true",
        help="Require and validate release-flow-production-signoff.json.",
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
        raise GitHubEvidenceError(
            f"GitHub artifact download failed: HTTP {exc.code} {detail}"
        ) from exc
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


def find_workflow_run_by_id(
    *,
    api_base: str,
    repo: str,
    workflow: str,
    branch: str,
    head_sha: str,
    run_id: str,
    token: str,
) -> dict[str, Any]:
    normalized_run_id = str(run_id or "").strip()
    if not normalized_run_id.isdigit():
        raise GitHubEvidenceError(f"{workflow} run id must be numeric")
    run = github_json(github_api_url(api_base, repo, f"actions/runs/{normalized_run_id}"), token)
    if str(run.get("id") or "") != normalized_run_id:
        raise GitHubEvidenceError(
            f"GitHub run {normalized_run_id} response did not match requested id"
        )
    if run.get("conclusion") != "success":
        raise GitHubEvidenceError(f"GitHub run {normalized_run_id} did not conclude success")
    if head_sha and str(run.get("head_sha") or "") != head_sha:
        raise GitHubEvidenceError(
            f"GitHub run {normalized_run_id} does not match required sha {head_sha}"
        )
    if branch and str(run.get("head_branch") or branch) != branch:
        raise GitHubEvidenceError(f"GitHub run {normalized_run_id} does not match branch {branch}")
    path = str(run.get("path") or "")
    if path and not path.endswith(f"/{workflow}") and path != workflow:
        raise GitHubEvidenceError(f"GitHub run {normalized_run_id} is not {workflow}")
    return run


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
        raise GitHubEvidenceError(
            f"workflow run {run_id} is missing artifacts: {', '.join(missing)}"
        )
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for name in sorted(artifact_names):
        artifact = by_name[name]
        if artifact.get("expired") is True:
            raise GitHubEvidenceError(f"artifact {name} from workflow run {run_id} is expired")
        download_url = str(artifact.get("archive_download_url") or "")
        if not download_url:
            raise GitHubEvidenceError(
                f"artifact {name} from workflow run {run_id} is missing download URL"
            )
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
    if not head_sha and not args.allow_latest_github_run:
        raise GitHubEvidenceError("--github-sha is required when downloading GitHub artifacts")
    readiness_run_id = str(args.github_readiness_run_id or "").strip()
    deploy_run_id = str(args.github_deploy_run_id or "").strip()
    if readiness_run_id:
        readiness_run = find_workflow_run_by_id(
            api_base=api_base,
            repo=repo,
            workflow=READINESS_WORKFLOW,
            branch=branch,
            head_sha=head_sha,
            run_id=readiness_run_id,
            token=token,
        )
    else:
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
        if deploy_run_id:
            deploy_run = find_workflow_run_by_id(
                api_base=api_base,
                repo=repo,
                workflow=DEPLOY_WORKFLOW,
                branch=branch,
                head_sha=head_sha,
                run_id=deploy_run_id,
                token=token,
            )
        else:
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
            "readiness report passed"
            if payload.get("ok") is True
            else "readiness report did not pass",
        )
    ]
    checks.extend(validate_named_checks("readiness", payload, REQUIRED_READINESS_CHECKS))
    return checks


def validate_environment(
    payload: dict[str, Any] | None, source: str, *, required: bool
) -> list[EvidenceCheck]:
    if payload is None:
        return [
            EvidenceCheck(
                "environment.artifact_present",
                not required,
                f"{source} not found" if required else "environment report not required",
            )
        ]
    checks = [
        EvidenceCheck(
            "environment.ok",
            payload.get("ok") is True,
            "GitHub Environment verification passed"
            if payload.get("ok") is True
            else "GitHub Environment verification did not pass",
        )
    ]
    checks.extend(validate_named_checks("environment", payload, REQUIRED_ENVIRONMENT_CHECKS))
    return checks


def validate_smoke(
    payload: dict[str, Any] | None, source: str, *, required: bool
) -> list[EvidenceCheck]:
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
            "production smoke passed"
            if payload.get("ok") is True
            else "production smoke did not pass",
        ),
        validate_https_url("smoke.api_base_url", str(payload.get("api_base_url") or "")),
    ]
    checks.extend(validate_named_checks("smoke", payload, REQUIRED_SMOKE_CHECKS))
    return checks


def validate_deploy(
    payload: dict[str, Any] | None, source: str, *, required: bool
) -> list[EvidenceCheck]:
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
            "production deploy passed"
            if payload.get("ok") is True
            else "production deploy did not pass",
        ),
        validate_https_url("deploy.api_base_url", str(payload.get("api_base_url") or "")),
        EvidenceCheck(
            "deploy.plan_id",
            bool(plan_id),
            "production deploy recorded a plan id"
            if plan_id
            else "production deploy report is missing plan_id",
        ),
    ]
    checks.extend(validate_named_checks("deploy", payload, REQUIRED_DEPLOY_CHECKS))
    start = check_by_name(payload, "release-plans.start.production")
    run_id = str((start or {}).get("detail") or "").strip()
    checks.append(
        EvidenceCheck(
            "deploy.run_id",
            bool(start and start.get("ok") is True and run_id),
            f"production run started: {run_id}"
            if run_id
            else "deploy report is missing production run id",
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


def validate_signoff(
    payload: dict[str, Any] | None,
    source: str,
    *,
    required: bool,
    github_branch: str,
    github_sha: str,
    readiness_source: str,
    deploy_source: str,
    deploy: dict[str, Any] | None,
    preflight: dict[str, Any] | None,
    preflight_source: str,
) -> list[EvidenceCheck]:
    if payload is None:
        return [
            EvidenceCheck(
                "signoff.artifact_present",
                not required,
                f"{source} not found" if required else "signoff report not required",
            )
        ]
    readiness_run = payload.get("readiness_run")
    deploy_run = payload.get("deploy_run")
    readiness_run_id = (
        str((readiness_run or {}).get("id") or "").strip()
        if isinstance(readiness_run, dict)
        else ""
    )
    deploy_run_id = (
        str((deploy_run or {}).get("id") or "").strip() if isinstance(deploy_run, dict) else ""
    )
    checks = [
        EvidenceCheck(
            "signoff.status",
            payload.get("status") == "passed" and payload.get("evidence_verification_status") == 0,
            "signoff report recorded passed evidence verification"
            if payload.get("status") == "passed"
            and payload.get("evidence_verification_status") == 0
            else "signoff report did not record passed evidence verification",
        ),
        EvidenceCheck(
            "signoff.github_sha",
            not github_sha or str(payload.get("github_sha") or "") == github_sha,
            "signoff report matches requested commit SHA"
            if not github_sha or str(payload.get("github_sha") or "") == github_sha
            else "signoff report commit SHA differs from requested commit SHA",
        ),
        EvidenceCheck(
            "signoff.github_branch",
            not github_branch or str(payload.get("github_branch") or "") == github_branch,
            "signoff report matches requested GitHub branch"
            if not github_branch or str(payload.get("github_branch") or "") == github_branch
            else "signoff report GitHub branch differs from requested branch",
        ),
        EvidenceCheck(
            "signoff.readiness_run_id",
            source_matches_run_id(readiness_source, readiness_run_id),
            "signoff report references the verified readiness artifact run"
            if source_matches_run_id(readiness_source, readiness_run_id)
            else "signoff report readiness run id does not match verified artifact",
        ),
        EvidenceCheck(
            "signoff.deploy_run_id",
            (deploy is None and not required)
            or source_matches_run_id(deploy_source, deploy_run_id),
            "signoff report references the verified deploy artifact run"
            if source_matches_run_id(deploy_source, deploy_run_id)
            else "signoff report deploy run id does not match verified artifact",
        ),
        EvidenceCheck(
            "signoff.distinct_workflow_runs",
            not required
            or (
                bool(readiness_run_id) and bool(deploy_run_id) and readiness_run_id != deploy_run_id
            ),
            "signoff report references distinct readiness and deploy runs"
            if bool(readiness_run_id) and bool(deploy_run_id) and readiness_run_id != deploy_run_id
            else "signoff report readiness and deploy run ids must be distinct",
        ),
    ]
    checks.extend(validate_signoff_run_summary("signoff.readiness_run", readiness_run, github_sha))
    checks.extend(validate_signoff_run_summary("signoff.deploy_run", deploy_run, github_sha))
    checks.extend(
        validate_signoff_preflight_summary(
            payload,
            github_branch,
            github_sha,
            preflight,
            preflight_source,
        )
    )
    if deploy is not None:
        plan_id = str(deploy.get("plan_id") or "")
        checks.append(
            EvidenceCheck(
                "signoff.release_plan_id",
                bool(payload.get("release_plan_id"))
                and str(payload.get("release_plan_id")) == plan_id,
                "signoff report plan id matches deploy evidence"
                if str(payload.get("release_plan_id") or "") == plan_id
                else "signoff report plan id differs from deploy evidence",
            )
        )
    return checks


def validate_signoff_preflight_summary(
    payload: dict[str, Any],
    github_branch: str,
    github_sha: str,
    preflight: dict[str, Any] | None,
    preflight_source: str,
) -> list[EvidenceCheck]:
    summary = payload.get("preflight_report")
    if not isinstance(summary, dict):
        return [
            EvidenceCheck(
                "signoff.preflight_report",
                False,
                "signoff report is missing preflight report summary",
            )
        ]
    if summary.get("skipped") is True:
        return [
            EvidenceCheck(
                "signoff.preflight_report.not_skipped",
                False,
                "preflight report check was skipped",
            )
        ]

    sha256 = str(summary.get("sha256") or "")
    checks = [
        EvidenceCheck(
            "signoff.preflight_report.not_skipped",
            True,
            "preflight report was required before signoff",
        ),
        EvidenceCheck(
            "signoff.preflight_report.sha256",
            len(sha256) == 64,
            "preflight report has a sha256 digest"
            if len(sha256) == 64
            else "preflight report sha256 digest is missing or invalid",
        ),
        EvidenceCheck(
            "signoff.preflight_report.artifact_present",
            preflight is not None,
            "preflight report artifact was included in final evidence"
            if preflight is not None
            else f"{PREFLIGHT_REPORT} not found",
        ),
        EvidenceCheck(
            "signoff.preflight_report.artifact_sha256",
            preflight is not None and sha256 == report_payload_sha256(preflight),
            "preflight report digest matches included artifact"
            if preflight is not None and sha256 == report_payload_sha256(preflight)
            else "preflight report digest does not match included artifact",
        ),
        EvidenceCheck(
            "signoff.preflight_report.status",
            summary.get("status") == "passed"
            and summary.get("mode") == "preflight_only"
            and summary.get("dispatch_performed") is False,
            "preflight report passed in preflight_only mode without dispatch"
            if summary.get("status") == "passed"
            and summary.get("mode") == "preflight_only"
            and summary.get("dispatch_performed") is False
            else "preflight report did not pass in preflight_only mode without dispatch",
        ),
        EvidenceCheck(
            "signoff.preflight_report.github_sha",
            not github_sha or str(summary.get("github_sha") or "") == github_sha,
            "preflight report matches requested commit SHA"
            if not github_sha or str(summary.get("github_sha") or "") == github_sha
            else "preflight report commit SHA differs from requested commit SHA",
        ),
        EvidenceCheck(
            "signoff.preflight_report.github_branch",
            not github_branch or str(summary.get("github_branch") or "") == github_branch,
            "preflight report matches requested GitHub branch"
            if not github_branch or str(summary.get("github_branch") or "") == github_branch
            else "preflight report GitHub branch differs from requested branch",
        ),
        EvidenceCheck(
            "signoff.preflight_report.release_plan_id",
            str(summary.get("release_plan_id") or "") == str(payload.get("release_plan_id") or ""),
            "preflight report matches signoff plan id"
            if str(summary.get("release_plan_id") or "")
            == str(payload.get("release_plan_id") or "")
            else "preflight report plan id differs from signoff report",
        ),
        EvidenceCheck(
            "signoff.preflight_report.safe_pr_run_id",
            str(summary.get("live_safe_pr_workflow_run_id") or "")
            == str(payload.get("live_safe_pr_workflow_run_id") or ""),
            "preflight report matches signoff Safe PR run id"
            if str(summary.get("live_safe_pr_workflow_run_id") or "")
            == str(payload.get("live_safe_pr_workflow_run_id") or "")
            else "preflight report Safe PR run id differs from signoff report",
        ),
    ]
    if preflight is not None:
        checks.extend(
            validate_preflight_artifact_matches_summary(summary, preflight, preflight_source)
        )
    expected_checks = {
        "input_validation",
        "local_sha",
        "github_branch_sha",
        "safe_pr_run",
        "production_workflow_access",
    }
    actual_checks = {str(item) for item in summary.get("checks", []) if isinstance(item, str)}
    checks.append(
        EvidenceCheck(
            "signoff.preflight_report.checks",
            expected_checks <= actual_checks,
            "preflight report includes all required no-dispatch checks"
            if expected_checks <= actual_checks
            else "preflight report is missing required no-dispatch checks",
        )
    )
    return checks


def report_payload_sha256(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def validate_preflight_artifact_matches_summary(
    summary: dict[str, Any],
    preflight: dict[str, Any],
    source: str,
) -> list[EvidenceCheck]:
    checks = []
    for field in (
        "status",
        "mode",
        "github_repo",
        "github_branch",
        "github_branch_head_sha",
        "github_sha",
        "release_plan_id",
        "live_safe_pr_workflow_run_id",
        "dispatch_performed",
    ):
        checks.append(
            EvidenceCheck(
                f"signoff.preflight_report.artifact.{field}",
                str(summary.get(field) or "") == str(preflight.get(field) or ""),
                f"preflight artifact {field} matches summary"
                if str(summary.get(field) or "") == str(preflight.get(field) or "")
                else f"preflight artifact {field} differs from summary in {source}",
            )
        )
    return checks


def source_matches_run_id(source: str, run_id: str) -> bool:
    run_id = str(run_id or "").strip()
    if not run_id:
        return False
    normalized = source.replace("\\", "/")
    parts: list[str] = []
    for segment in normalized.split("!"):
        parts.extend(part for part in segment.split("/") if part)
    return any(part == run_id or part.startswith(f"{run_id}-") for part in parts)


def validate_signoff_run_summary(
    prefix: str,
    run: Any,
    github_sha: str,
) -> list[EvidenceCheck]:
    if not isinstance(run, dict):
        return [
            EvidenceCheck(
                prefix,
                False,
                "signoff report is missing run summary",
            )
        ]
    run_id = str(run.get("id") or "").strip()
    status = str(run.get("status") or "").strip()
    conclusion = str(run.get("conclusion") or "").strip()
    head_sha = str(run.get("head_sha") or "").strip()
    return [
        EvidenceCheck(
            f"{prefix}.id",
            run_id.isdigit(),
            "signoff run summary has a numeric GitHub Actions run id"
            if run_id.isdigit()
            else "signoff run summary is missing a numeric GitHub Actions run id",
        ),
        EvidenceCheck(
            f"{prefix}.status",
            status == "completed",
            "signoff run summary completed"
            if status == "completed"
            else "signoff run summary did not complete",
        ),
        EvidenceCheck(
            f"{prefix}.conclusion",
            conclusion == "success",
            "signoff run summary succeeded"
            if conclusion == "success"
            else "signoff run summary did not succeed",
        ),
        EvidenceCheck(
            f"{prefix}.head_sha",
            not github_sha or head_sha == github_sha,
            "signoff run summary matches requested commit SHA"
            if not github_sha or head_sha == github_sha
            else "signoff run summary commit SHA differs from requested commit SHA",
        ),
    ]


def validate_named_checks(
    prefix: str, payload: dict[str, Any], required_names: set[str]
) -> list[EvidenceCheck]:
    actual = {str(item.get("name") or ""): item for item in payload_checks(payload)}
    missing = sorted(name for name in required_names if name not in actual)
    failed = sorted(
        name for name in required_names if name in actual and actual[name].get("ok") is not True
    )
    return [
        EvidenceCheck(
            f"{prefix}.required_checks_present",
            not missing,
            "required checks are present"
            if not missing
            else "missing checks: " + ", ".join(missing),
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
            signoff_path = output_dir / SIGNOFF_REPORT
            if args.require_signoff_report and signoff_path.is_file():
                github_paths.append(signoff_path)
            preflight_path = output_dir / PREFLIGHT_REPORT
            if args.require_signoff_report and preflight_path.is_file():
                github_paths.append(preflight_path)
        paths = [*args.artifacts, *github_paths]
        readiness, readiness_source = load_named_report(paths, READINESS_REPORT)
        environment, environment_source = load_named_report(paths, ENVIRONMENT_REPORT)
        smoke, smoke_source = load_named_report(paths, SMOKE_REPORT)
        deploy, deploy_source = load_named_report(paths, DEPLOY_REPORT)
        preflight, preflight_source = load_named_report(paths, PREFLIGHT_REPORT)
        signoff, signoff_source = load_named_report(paths, SIGNOFF_REPORT)
        checks: list[EvidenceCheck] = []
        checks.extend(validate_readiness(readiness, readiness_source))
        checks.extend(
            validate_environment(
                environment,
                environment_source,
                required=not args.allow_missing_environment,
            )
        )
        checks.extend(validate_smoke(smoke, smoke_source, required=not args.allow_missing_smoke))
        checks.extend(
            validate_deploy(deploy, deploy_source, required=not args.allow_missing_deploy)
        )
        checks.extend(validate_artifact_consistency(smoke, deploy))
        checks.extend(
            validate_signoff(
                signoff,
                signoff_source,
                required=args.require_signoff_report,
                github_branch=str(args.github_branch or ""),
                github_sha=str(args.github_sha or ""),
                readiness_source=readiness_source,
                deploy_source=deploy_source,
                deploy=deploy,
                preflight=preflight,
                preflight_source=preflight_source,
            )
        )
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
