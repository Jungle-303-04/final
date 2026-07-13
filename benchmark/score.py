#!/usr/bin/env python3
"""Static, dependency-free KubeHealBench v0.1 contract grader."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
REQUIRED_CATEGORIES = {
    "oom",
    "crashloop",
    "imagepull",
    "probe",
    "pvc",
    "scheduling",
    "service-selector",
}
REQUIRED_FIELDS = {
    "schema_version",
    "id",
    "category",
    "title",
    "rule_id",
    "symptom",
    "expected_root_cause",
    "required_evidence",
    "allowed_remediations",
    "forbidden_remediations",
    "normal_manifest",
    "fault_injection_patch",
    "expected_git_patch",
    "rollback_patch",
    "normalization_predicate",
}
BLAST_RADIUS = {"target_workload", "target_namespace", "cluster", "fleet", "unknown"}
DANGEROUS_RADIUS = {"cluster", "fleet"}


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_catalog_sources(catalog: dict[str, Any], errors: list[str]) -> None:
    """Prove the checked-in snapshot still matches this repository's live catalog."""
    repository = ROOT.parent
    for relative, expected in catalog.get("source_sha256", {}).items():
        source = repository / relative
        require(source.is_file(), f"catalog: missing live source {relative}", errors)
        if source.is_file():
            actual = hashlib.sha256(source.read_bytes()).hexdigest()
            require(actual == expected, f"catalog: snapshot drift for {relative}", errors)


def validate_scenario(path: Path, data: Any, catalog: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    prefix = str(path.relative_to(ROOT))
    require(isinstance(data, dict), f"{prefix}: root must be an object", errors)
    if not isinstance(data, dict):
        return errors
    require(set(data) == REQUIRED_FIELDS, f"{prefix}: fields must exactly match schema", errors)
    require(
        data.get("schema_version") == "kubehealbench/v0.1", f"{prefix}: bad schema_version", errors
    )
    for key in ("id", "category", "title", "rule_id", "symptom", "expected_root_cause"):
        require(
            isinstance(data.get(key), str) and bool(data[key].strip()),
            f"{prefix}: {key} must be non-empty string",
            errors,
        )

    rule = catalog["rules"].get(data.get("rule_id"), {})
    require(bool(rule), f"{prefix}: unknown rule_id {data.get('rule_id')!r}", errors)
    if rule:
        require(
            data.get("symptom") in rule["symptoms"], f"{prefix}: symptom not in cause rule", errors
        )
        expected = rule["candidates"].get(data.get("expected_root_cause"))
        require(expected is not None, f"{prefix}: root cause is not a rule candidate", errors)
        require(
            data.get("required_evidence") == expected,
            f"{prefix}: evidence must exactly match catalog order/content",
            errors,
        )

    allowed = data.get("allowed_remediations")
    require(
        isinstance(allowed, list) and bool(allowed),
        f"{prefix}: allowed_remediations must be non-empty list",
        errors,
    )
    valid_actions = set(
        catalog["recovery_actions"].get(
            data.get("expected_root_cause"), catalog["fallback_actions"]
        )
    )
    if isinstance(allowed, list):
        for item in allowed:
            require(isinstance(item, dict), f"{prefix}: allowed remediation must be object", errors)
            if isinstance(item, dict):
                require(
                    item.get("action_type") in valid_actions,
                    f"{prefix}: action {item.get('action_type')!r} not in recovery catalog",
                    errors,
                )
                require(
                    item.get("blast_radius") in BLAST_RADIUS,
                    f"{prefix}: invalid allowed blast_radius",
                    errors,
                )
                require(
                    isinstance(item.get("auto_apply"), bool),
                    f"{prefix}: auto_apply must be boolean",
                    errors,
                )

    forbidden = data.get("forbidden_remediations")
    require(
        isinstance(forbidden, list) and bool(forbidden),
        f"{prefix}: forbidden_remediations must be non-empty list",
        errors,
    )
    if isinstance(forbidden, list):
        for item in forbidden:
            require(
                isinstance(item, dict), f"{prefix}: forbidden remediation must be object", errors
            )
            if isinstance(item, dict):
                require(
                    isinstance(item.get("action_type"), str) and bool(item["action_type"]),
                    f"{prefix}: forbidden action_type required",
                    errors,
                )
                require(
                    item.get("blast_radius") in DANGEROUS_RADIUS,
                    f"{prefix}: forbidden action must declare cluster/fleet blast_radius",
                    errors,
                )
                require(
                    isinstance(item.get("reason"), str) and bool(item["reason"]),
                    f"{prefix}: forbidden reason required",
                    errors,
                )

    manifest = data.get("normal_manifest")
    require(isinstance(manifest, dict), f"{prefix}: normal_manifest must be object", errors)
    if isinstance(manifest, dict):
        require(
            manifest.get("apiVersion") and manifest.get("kind"),
            f"{prefix}: manifest requires apiVersion/kind",
            errors,
        )
        require(
            isinstance(manifest.get("metadata"), dict) and manifest["metadata"].get("name"),
            f"{prefix}: manifest requires metadata.name",
            errors,
        )
    for key in ("fault_injection_patch", "expected_git_patch", "rollback_patch"):
        require(
            isinstance(data.get(key), dict) and bool(data[key]),
            f"{prefix}: {key} must be non-empty object",
            errors,
        )
    predicate = data.get("normalization_predicate")
    require(
        isinstance(predicate, dict) and predicate.get("type") == "all",
        f"{prefix}: normalization_predicate.type must be all",
        errors,
    )
    if isinstance(predicate, dict):
        checks = predicate.get("checks")
        require(
            isinstance(checks, list) and bool(checks),
            f"{prefix}: normalization checks required",
            errors,
        )
        if isinstance(checks, list):
            for check in checks:
                require(
                    isinstance(check, dict) and set(check) == {"field", "operator", "value"},
                    f"{prefix}: each normalization check needs field/operator/value",
                    errors,
                )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--category", choices=sorted(REQUIRED_CATEGORIES), help="validate one completed category"
    )
    args = parser.parse_args()
    catalog = load_json(ROOT / "catalog-snapshot.json")
    pattern = f"{args.category}/*/scenario.json" if args.category else "*/*/scenario.json"
    paths = sorted((ROOT / "scenarios").glob(pattern))
    errors: list[str] = []
    validate_catalog_sources(catalog, errors)
    scenarios: list[dict[str, Any]] = []
    for path in paths:
        data = load_json(path)
        errors.extend(validate_scenario(path, data, catalog))
        if isinstance(data, dict):
            scenarios.append(data)
    counts = Counter(item.get("category") for item in scenarios)
    if args.category:
        require(
            2 <= len(scenarios) <= 4,
            f"suite: {args.category} needs 2..4 scenarios, got {len(scenarios)}",
            errors,
        )
    else:
        minimum = 2 * len(REQUIRED_CATEGORIES)
        maximum = 4 * len(REQUIRED_CATEGORIES)
        require(
            minimum <= len(scenarios) <= maximum,
            f"suite: expected {minimum}..{maximum} scenarios, got {len(scenarios)}",
            errors,
        )
        require(
            REQUIRED_CATEGORIES <= set(counts),
            f"suite: missing categories {sorted(REQUIRED_CATEGORIES - set(counts))}",
            errors,
        )
        for category in REQUIRED_CATEGORIES:
            require(
                2 <= counts[category] <= 4,
                f"suite: {category} needs 2..4 scenarios, got {counts[category]}",
                errors,
            )
    ids = [item.get("id") for item in scenarios]
    require(len(ids) == len(set(ids)), "suite: scenario ids must be unique", errors)
    if errors:
        for error in errors:
            print(f"FAIL {error}")
        print(f"RESULT FAIL ({len(errors)} errors, {len(scenarios)} scenarios)")
        return 1
    print(
        f"RESULT PASS ({len(scenarios)} scenarios; "
        + ", ".join(f"{key}={counts[key]}" for key in sorted(counts))
        + ")"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
