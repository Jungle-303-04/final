"""Verify downloaded release-flow production evidence artifacts."""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


READINESS_REPORT = "release-flow-readiness.json"
SMOKE_REPORT = "release-flow-smoke.json"
DEPLOY_REPORT = "release-flow-deploy.json"
PLACEHOLDER_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}

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


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "artifacts",
        nargs="+",
        type=Path,
        help="Downloaded artifact directories, JSON files, or artifact ZIP files.",
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
    return host in PLACEHOLDER_HOSTS or host.endswith(".localhost") or host.endswith(".example.test")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    readiness, readiness_source = load_named_report(args.artifacts, READINESS_REPORT)
    smoke, smoke_source = load_named_report(args.artifacts, SMOKE_REPORT)
    deploy, deploy_source = load_named_report(args.artifacts, DEPLOY_REPORT)
    checks: list[EvidenceCheck] = []
    checks.extend(validate_readiness(readiness, readiness_source))
    checks.extend(validate_smoke(smoke, smoke_source, required=not args.allow_missing_smoke))
    checks.extend(validate_deploy(deploy, deploy_source, required=not args.allow_missing_deploy))
    for check in checks:
        print(f"{'ok' if check.ok else 'fail'} {check.name}: {check.detail}")
    return 0 if all(check.ok for check in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
