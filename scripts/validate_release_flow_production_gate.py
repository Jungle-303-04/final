#!/usr/bin/env python3
"""Validate that production deploy workflow jobs depend on release-flow gate."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

WORKFLOW_SUFFIXES = {".yml", ".yaml"}
GATE_WORKFLOW_PATH = "./.github/workflows/release-flow-production-gate.yml"
REQUIRED_GATE_INPUTS = (
    "live_change_ticket",
    "live_runbook_url",
    "live_image",
    "live_verification_url",
    "live_safe_pr_workflow_run_id",
    "live_safe_pr_url",
)
ONE_OF_GATE_INPUTS = ("live_release_owner", "live_oncall_contact")
PLACEHOLDER_INPUT_VALUES = {
    "live_change_ticket": {"CHG-PREFLIGHT"},
    "live_runbook_url": {"https://example.com/runbooks/release-flow"},
    "live_verification_url": {"https://example.com/verify/release-flow"},
    "live_release_owner": {"release-operator"},
    "live_oncall_contact": {"release-oncall@example.com"},
    "live_image": {"ghcr.io/example/release-flow-smoke:live-preflight"},
}
HTTPS_GATE_INPUTS = ("live_runbook_url", "live_verification_url", "live_safe_pr_url")
PLACEHOLDER_URL_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}
IGNORED_WORKFLOW_NAMES = {
    "release-flow-smoke.yml",
    "release-flow-production-gate.yml",
    "release-flow-gate-contract.yml",
}
PRODUCTION_TOKEN_PATTERN = re.compile(r"(^|[^a-z0-9])(prod|production)([^a-z0-9]|$)")


@dataclass
class DeployCandidate:
    workflow: Path
    job_id: str
    reason: str

    @property
    def label(self) -> str:
        return f"{self.workflow}:{self.job_id}"


@dataclass
class GateViolation:
    workflow: Path
    job_id: str
    message: str

    @property
    def label(self) -> str:
        return f"{self.workflow}:{self.job_id}"


@dataclass
class ValidationResult:
    candidates: list[DeployCandidate] = field(default_factory=list)
    violations: list[GateViolation] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.violations


def workflow_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(
                candidate
                for candidate in sorted(path.iterdir())
                if candidate.is_file() and candidate.suffix.lower() in WORKFLOW_SUFFIXES
            )
        elif path.is_file() and path.suffix.lower() in WORKFLOW_SUFFIXES:
            files.append(path)
    return files


def load_yaml(path: Path) -> dict[str, Any]:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(loaded, dict):
        return {}
    return loaded


def validate_workflows(
    paths: list[Path], *, require_production_deploy: bool = False
) -> ValidationResult:
    result = ValidationResult()
    files = workflow_files(paths)
    for path in files:
        if path.name in IGNORED_WORKFLOW_NAMES:
            continue
        workflow = load_yaml(path)
        jobs = workflow.get("jobs", {})
        if not isinstance(jobs, dict):
            continue
        gate_jobs = gate_job_ids(jobs)
        for job_id, job in jobs.items():
            if not isinstance(job, dict) or calls_release_flow_gate(job):
                continue
            reason = production_deploy_reason(path, workflow, job_id, job)
            if not reason:
                continue
            candidate = DeployCandidate(path, str(job_id), reason)
            result.candidates.append(candidate)
            result.violations.extend(validate_candidate(candidate, job, gate_jobs, jobs))

    if require_production_deploy and not result.candidates:
        result.violations.append(
            GateViolation(
                Path("<workflows>"),
                "production-deploy",
                "no production deploy jobs were found to validate",
            )
        )
    return result


def gate_job_ids(jobs: dict[str, Any]) -> set[str]:
    return {
        str(job_id)
        for job_id, job in jobs.items()
        if isinstance(job, dict) and calls_release_flow_gate(job)
    }


def calls_release_flow_gate(job: dict[str, Any]) -> bool:
    uses = str(job.get("uses", "")).strip()
    return uses == GATE_WORKFLOW_PATH or uses.endswith(
        "/.github/workflows/release-flow-production-gate.yml"
    )


def production_deploy_reason(
    path: Path, workflow: dict[str, Any], job_id: str, job: dict[str, Any]
) -> str | None:
    job_text = " ".join(
        str(value).lower()
        for value in (
            job_id,
            job.get("name", ""),
            job.get("environment", ""),
            workflow.get("name", ""),
            path.stem,
        )
    )
    if "deploy" not in job_text:
        return None
    if PRODUCTION_TOKEN_PATTERN.search(job_text):
        return "job name/id/workflow/environment looks like production deploy"
    environment = job.get("environment")
    if isinstance(environment, dict) and "production" in str(environment.get("name", "")).lower():
        return "job environment is production"
    return None


def validate_candidate(
    candidate: DeployCandidate,
    job: dict[str, Any],
    gate_jobs: set[str],
    jobs: dict[str, Any],
) -> list[GateViolation]:
    violations: list[GateViolation] = []
    needs = normalize_needs(job.get("needs"))
    gate_needs = needs & gate_jobs
    if not gate_jobs:
        violations.append(
            GateViolation(
                candidate.workflow,
                candidate.job_id,
                "production deploy job has no sibling job calling release-flow-production-gate.yml",
            )
        )
    elif not gate_needs:
        violations.append(
            GateViolation(
                candidate.workflow,
                candidate.job_id,
                f"production deploy job must need one of the release-flow gate jobs: {', '.join(sorted(gate_jobs))}",
            )
        )

    if_condition = str(job.get("if", ""))
    if not has_release_gate_success_condition(if_condition, gate_needs):
        expected = ", ".join(sorted(gate_needs or gate_jobs)) or "release_flow_production_gate"
        violations.append(
            GateViolation(
                candidate.workflow,
                candidate.job_id,
                f"production deploy job must check needs.{expected}.outputs.release_gate_ok == 'true'",
            )
        )

    for gate_id in gate_needs:
        gate_job = jobs.get(gate_id, {})
        if isinstance(gate_job, dict):
            violations.extend(validate_gate_job_inputs(candidate.workflow, gate_id, gate_job))
        if isinstance(gate_job, dict) and gate_job.get("secrets") != "inherit":
            # Explicit secret mapping is allowed. This branch only keeps the rule obvious for future expansion.
            continue
    return violations


def validate_gate_job_inputs(
    workflow: Path, gate_id: str, gate_job: dict[str, Any]
) -> list[GateViolation]:
    violations: list[GateViolation] = []
    with_values = gate_job.get("with", {})
    if not isinstance(with_values, dict):
        with_values = {}
    for input_name in REQUIRED_GATE_INPUTS:
        value = with_values.get(input_name)
        if not meaningful_input(value):
            violations.append(
                GateViolation(
                    workflow,
                    gate_id,
                    f"release-flow production gate job must pass {input_name}",
                )
            )
        elif is_placeholder_input(input_name, value):
            violations.append(
                GateViolation(
                    workflow,
                    gate_id,
                    f"release-flow production gate job must not pass placeholder {input_name}",
                )
            )
        else:
            violations.extend(validate_literal_url_input(workflow, gate_id, input_name, value))

    owner_values = {input_name: with_values.get(input_name) for input_name in ONE_OF_GATE_INPUTS}
    if not any(meaningful_input(value) for value in owner_values.values()):
        violations.append(
            GateViolation(
                workflow,
                gate_id,
                "release-flow production gate job must pass live_release_owner or live_oncall_contact",
            )
        )
    for input_name, value in owner_values.items():
        if meaningful_input(value) and is_placeholder_input(input_name, value):
            violations.append(
                GateViolation(
                    workflow,
                    gate_id,
                    f"release-flow production gate job must not pass placeholder {input_name}",
                )
            )
    return violations


def meaningful_input(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return bool(str(value).strip())


def is_placeholder_input(input_name: str, value: Any) -> bool:
    normalized = str(value).strip()
    placeholders = PLACEHOLDER_INPUT_VALUES.get(input_name, set())
    return normalized in placeholders


def validate_literal_url_input(
    workflow: Path,
    gate_id: str,
    input_name: str,
    value: Any,
) -> list[GateViolation]:
    if input_name not in HTTPS_GATE_INPUTS:
        return []
    raw = str(value).strip()
    if not raw or raw.startswith("${{"):
        return []
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return [
            GateViolation(
                workflow,
                gate_id,
                f"release-flow production gate job must pass https {input_name}",
            )
        ]
    if (
        host in PLACEHOLDER_URL_HOSTS
        or host.endswith(".localhost")
        or host.endswith(".example.com")
        or host.endswith(".example.test")
    ):
        return [
            GateViolation(
                workflow,
                gate_id,
                f"release-flow production gate job must not pass placeholder {input_name}",
            )
        ]
    return []


def normalize_needs(value: Any) -> set[str]:
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return {str(item) for item in value}
    return set()


def has_release_gate_success_condition(if_condition: str, gate_needs: set[str]) -> bool:
    normalized = " ".join(if_condition.replace('"', "'").split())
    if "release_gate_ok" not in normalized:
        return False
    if "== 'true'" not in normalized and "== true" not in normalized:
        return False
    if not gate_needs:
        return "needs." in normalized
    return any(f"needs.{gate_id}.outputs.release_gate_ok" in normalized for gate_id in gate_needs)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        default=[Path(".github/workflows")],
        help="workflow files or directories to inspect",
    )
    parser.add_argument(
        "--require-production-deploy",
        action="store_true",
        help="fail when no production deploy job is found",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    result = validate_workflows(
        args.paths, require_production_deploy=args.require_production_deploy
    )
    if result.candidates:
        print("production deploy candidates:")
        for candidate in result.candidates:
            print(f"- {candidate.label}: {candidate.reason}")
    else:
        print("no production deploy candidates found")

    if result.violations:
        print("release-flow production gate violations:", file=sys.stderr)
        for violation in result.violations:
            print(f"- {violation.label}: {violation.message}", file=sys.stderr)
        return 1

    print("release-flow production gate contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
