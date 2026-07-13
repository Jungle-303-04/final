#!/usr/bin/env python3
"""Static OpsiaBench v0.1 contract grader."""

from __future__ import annotations

import argparse
import ast
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
CANDIDATE_CONTRACT_FIELDS = {
    "ordinal",
    "catalog_source",
    "rule_id",
    "candidate_id",
    "required_evidence",
    "supporting_signals",
    "contradicting_signals",
    "contradiction_policy",
    "missing_evidence_policy",
    "patch_capabilities",
    "allowed_remediations",
    "forbidden_remediations",
    "benchmark_fixtures",
}
ALLOWED_REMEDIATION_FIELDS = {
    "action_type",
    "route",
    "blast_radius",
    "approval_required",
    "rollback",
    "post_verification",
}
FORBIDDEN_REMEDIATION_FIELDS = {"action_type", "blast_radius", "reason"}
PATCH_CAPABILITIES = {"command", "safe_pr"}
ACTION_ROUTES = {"auto", "draft_pr", "approval_required"}
CANDIDATE_ORDERING = "catalog_path_lexical_then_rule_then_candidate"
CANDIDATE_INDEX_FIELDS = {"schema_version", "ordering", "source_sha256", "candidates"}
CANDIDATE_INDEX_ENTRY_FIELDS = {
    "ordinal",
    "catalog_source",
    "rule_id",
    "candidate_id",
    "required_evidence",
    "supporting_signals",
}
CANDIDATE_INDEX_SOURCE_COUNT = 15
CANDIDATE_INDEX_COUNT = 87
CANDIDATE_BATCH_SHA256 = {
    (1, 10): "8af3efce17c994f3ac0e97a5864ddbf9ea2b28ab0050be0a9cd201b58aca4476",
    (11, 20): "3ffa57f4abe30241469185e6d3c182605157cf7a42facf678128016184f43bb0",
    (21, 30): "ba7e92d1b4468fa7a96d7e0256dab39509c8bd859114e52fd83967c394f7ac79",
    (31, 40): "42509103abf663e8be22804454471099b33a50474cc4370fbdb38240f4521ce2",
}
CONTRADICTION_POLICY = "not_modeled_v0.1"
MISSING_EVIDENCE_POLICY = "all_required_evidence_and_supporting_signal_groups"
SIGNAL_MATCHER_KEYS = {"fact", "log_pattern", "event_pattern"}
RECOVERY_SOURCE = ROOT.parent / "src/services/ai/agent/recovery/builtin.py"
RECOVERY_DISPATCH_SOURCE = ROOT.parent / "src/services/ai/agent/recovery/dispatch.py"
COMMAND_ACTION_SOURCE = ROOT.parent / "src/domains/command/builtin_actions.py"
RECOVERY_ROUTE_VALUES = {
    "auto": "auto",
    "safe_pr": "draft_pr",
    "approval_required": "approval_required",
}


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc


def _call_keyword(call: ast.Call, name: str) -> ast.expr:
    for keyword in call.keywords:
        if keyword.arg == name:
            return keyword.value
    raise ValueError(f"{RECOVERY_SOURCE}: RecoveryActionSpec missing {name}")


def _assignment_value(tree: ast.Module, name: str, source: Path) -> ast.expr:
    for node in tree.body:
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            if node.value is None:
                break
            return node.value
    raise ValueError(f"{source}: assignment {name} is missing")


def _recovery_action_contract(call: ast.Call) -> dict[str, Any]:
    route_node = _call_keyword(call, "route")
    if not (
        isinstance(route_node, ast.Attribute)
        and isinstance(route_node.value, ast.Name)
        and route_node.value.id == "routes"
        and route_node.attr in RECOVERY_ROUTE_VALUES
    ):
        raise ValueError(f"{RECOVERY_SOURCE}: unsupported recovery route expression")
    return {
        "action_type": ast.literal_eval(_call_keyword(call, "action_type")),
        "route": RECOVERY_ROUTE_VALUES[route_node.attr],
        "blast_radius": ast.literal_eval(_call_keyword(call, "blast_radius")),
        "approval_required": ast.literal_eval(_call_keyword(call, "approval_required")),
        "rollback": ast.literal_eval(_call_keyword(call, "rollback_plan")),
        "post_verification": list(ast.literal_eval(_call_keyword(call, "validation_checks"))),
    }


def load_recovery_contracts() -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    """Read static recovery metadata without importing the frozen AI package."""
    tree = ast.parse(RECOVERY_SOURCE.read_text(encoding="utf-8"), filename=str(RECOVERY_SOURCE))
    explicit: dict[str, list[dict[str, Any]]] = {}
    fallback: list[dict[str, Any]] = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        for decorator in node.decorator_list:
            if not (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "rca"
                and decorator.func.attr in {"recovery", "fallback"}
            ):
                continue
            actions_node = _call_keyword(decorator, "actions")
            if not isinstance(actions_node, (ast.Tuple, ast.List)):
                raise ValueError(f"{RECOVERY_SOURCE}: actions must be a static tuple/list")
            actions = [
                _recovery_action_contract(action)
                for action in actions_node.elts
                if isinstance(action, ast.Call)
            ]
            if len(actions) != len(actions_node.elts):
                raise ValueError(f"{RECOVERY_SOURCE}: actions must contain static calls")
            if decorator.func.attr == "fallback":
                fallback.extend(actions)
                continue
            root_causes = ast.literal_eval(_call_keyword(decorator, "root_causes"))
            for candidate_id in root_causes:
                explicit.setdefault(candidate_id, []).extend(actions)
    if not fallback:
        raise ValueError(f"{RECOVERY_SOURCE}: fallback recovery contract is missing")
    return explicit, fallback


def load_dispatch_capabilities() -> tuple[frozenset[str], frozenset[str]]:
    """Read actual command and Safe PR action allowlists without importing runtime modules."""
    dispatch_tree = ast.parse(
        RECOVERY_DISPATCH_SOURCE.read_text(encoding="utf-8"),
        filename=str(RECOVERY_DISPATCH_SOURCE),
    )
    patch_node = _assignment_value(
        dispatch_tree, "AUTHORITY_PATCH_ACTIONS", RECOVERY_DISPATCH_SOURCE
    )
    if not (
        isinstance(patch_node, ast.Call)
        and isinstance(patch_node.func, ast.Name)
        and patch_node.func.id == "frozenset"
        and len(patch_node.args) == 1
    ):
        raise ValueError(
            f"{RECOVERY_DISPATCH_SOURCE}: AUTHORITY_PATCH_ACTIONS must be a static frozenset"
        )
    safe_pr_actions = set(ast.literal_eval(patch_node.args[0]))
    review_action = ast.literal_eval(
        _assignment_value(dispatch_tree, "GITOPS_REVIEW_ACTION", RECOVERY_DISPATCH_SOURCE)
    )
    if not isinstance(review_action, str):
        raise ValueError(f"{RECOVERY_DISPATCH_SOURCE}: GITOPS_REVIEW_ACTION must be a string")
    safe_pr_actions.add(review_action)

    command_tree = ast.parse(
        COMMAND_ACTION_SOURCE.read_text(encoding="utf-8"),
        filename=str(COMMAND_ACTION_SOURCE),
    )
    command_actions: set[str] = set()
    for node in command_tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        for decorator in node.decorator_list:
            if not (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "command"
                and decorator.func.attr == "action"
            ):
                continue
            for keyword in decorator.keywords:
                if keyword.arg != "recovery_aliases":
                    continue
                aliases = ast.literal_eval(keyword.value)
                if not isinstance(aliases, tuple) or not all(
                    isinstance(alias, str) for alias in aliases
                ):
                    raise ValueError(
                        f"{COMMAND_ACTION_SOURCE}: recovery_aliases must be a static string tuple"
                    )
                command_actions.update(aliases)
    if not command_actions:
        raise ValueError(f"{COMMAND_ACTION_SOURCE}: no recovery command aliases found")
    return frozenset(command_actions), frozenset(safe_pr_actions)


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def is_strict_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


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


def validate_signal_groups(value: Any, prefix: str, errors: list[str]) -> None:
    require(
        isinstance(value, list) and bool(value),
        f"{prefix}: supporting_signals must be a non-empty list",
        errors,
    )
    if not isinstance(value, list):
        return
    seen_ids: set[str] = set()
    for position, group in enumerate(value, start=1):
        group_prefix = f"{prefix}: signal group {position}"
        require(isinstance(group, dict), f"{group_prefix} must be an object", errors)
        if not isinstance(group, dict):
            continue
        require(set(group) == {"id", "any_of"}, f"{group_prefix}: invalid fields", errors)
        group_id = group.get("id")
        valid_group_id = isinstance(group_id, str) and bool(group_id.strip())
        require(valid_group_id, f"{group_prefix}: id is required", errors)
        if valid_group_id:
            require(group_id not in seen_ids, f"{group_prefix}: duplicate id", errors)
            seen_ids.add(group_id)
        matchers = group.get("any_of")
        require(
            isinstance(matchers, list) and bool(matchers),
            f"{group_prefix}: any_of must be a non-empty list",
            errors,
        )
        if not isinstance(matchers, list):
            continue
        for matcher in matchers:
            require(
                isinstance(matcher, dict)
                and len(matcher) == 1
                and set(matcher) <= SIGNAL_MATCHER_KEYS
                and all(
                    isinstance(matcher_value, str) and bool(matcher_value.strip())
                    for matcher_value in matcher.values()
                ),
                f"{group_prefix}: matcher must contain one supported non-empty predicate",
                errors,
            )


def validate_candidate_index(data: Any) -> list[str]:
    """Validate the hash-pinned loader order used to assign stable contract ordinals."""
    errors: list[str] = []
    prefix = "candidate-contract-index.json"
    require(isinstance(data, dict), f"{prefix}: root must be an object", errors)
    if not isinstance(data, dict):
        return errors
    require(set(data) == CANDIDATE_INDEX_FIELDS, f"{prefix}: fields must match schema", errors)
    require(
        data.get("schema_version") == "opsiabench/candidate-index/v0.1",
        f"{prefix}: bad schema_version",
        errors,
    )
    require(data.get("ordering") == CANDIDATE_ORDERING, f"{prefix}: bad ordering", errors)
    sources = data.get("source_sha256")
    require(isinstance(sources, dict), f"{prefix}: source_sha256 must be object", errors)
    if isinstance(sources, dict):
        require(
            len(sources) == CANDIDATE_INDEX_SOURCE_COUNT,
            f"{prefix}: expected {CANDIDATE_INDEX_SOURCE_COUNT} catalog sources",
            errors,
        )
        for relative, expected in sources.items():
            valid_source = (
                isinstance(relative, str)
                and bool(relative.strip())
                and isinstance(expected, str)
                and len(expected) == 64
                and all(character in "0123456789abcdef" for character in expected)
            )
            require(valid_source, f"{prefix}: source hash entry is invalid", errors)
            if not valid_source:
                continue
            source = ROOT.parent / relative
            require(source.is_file(), f"{prefix}: missing source {relative}", errors)
            if source.is_file():
                actual = hashlib.sha256(source.read_bytes()).hexdigest()
                require(actual == expected, f"{prefix}: source drift for {relative}", errors)

    candidates = data.get("candidates")
    require(isinstance(candidates, list), f"{prefix}: candidates must be list", errors)
    if not isinstance(candidates, list):
        return errors
    require(
        len(candidates) == CANDIDATE_INDEX_COUNT,
        f"{prefix}: expected {CANDIDATE_INDEX_COUNT} candidates",
        errors,
    )
    identities: set[tuple[Any, Any]] = set()
    candidate_ids: set[Any] = set()
    for ordinal, item in enumerate(candidates, start=1):
        item_prefix = f"{prefix}: candidate {ordinal}"
        require(isinstance(item, dict), f"{item_prefix} must be object", errors)
        if not isinstance(item, dict):
            continue
        require(
            set(item) == CANDIDATE_INDEX_ENTRY_FIELDS,
            f"{item_prefix}: fields must match schema",
            errors,
        )
        require(
            is_strict_int(item.get("ordinal")) and item.get("ordinal") == ordinal,
            f"{item_prefix}: ordinal must be integer {ordinal}",
            errors,
        )
        relative = item.get("catalog_source")
        require(
            isinstance(relative, str) and isinstance(sources, dict) and relative in sources,
            f"{item_prefix}: catalog_source is not hash-pinned",
            errors,
        )
        rule_id = item.get("rule_id")
        candidate_id = item.get("candidate_id")
        require(
            isinstance(rule_id, str) and bool(rule_id.strip()),
            f"{item_prefix}: rule_id is required",
            errors,
        )
        require(
            isinstance(candidate_id, str) and bool(candidate_id.strip()),
            f"{item_prefix}: candidate_id is required",
            errors,
        )
        if isinstance(rule_id, str) and isinstance(candidate_id, str):
            identity = (rule_id, candidate_id)
            require(identity not in identities, f"{item_prefix}: duplicate rule candidate", errors)
            identities.add(identity)
            require(
                candidate_id not in candidate_ids,
                f"{item_prefix}: duplicate candidate_id",
                errors,
            )
            candidate_ids.add(candidate_id)
        evidence = item.get("required_evidence")
        require(
            isinstance(evidence, list)
            and bool(evidence)
            and all(isinstance(value, str) and bool(value.strip()) for value in evidence),
            f"{item_prefix}: required_evidence requires non-empty strings",
            errors,
        )
        validate_signal_groups(item.get("supporting_signals"), item_prefix, errors)
    return errors


def validate_candidate_contract_progress(contract_count: int, next_ordinal: Any) -> list[str]:
    """Allow complete 10-item batches and the final 7-item catalog tail."""
    errors: list[str] = []
    valid_count_type = is_strict_int(contract_count)
    require(
        valid_count_type,
        "candidate-contracts.json: contract count must be an integer",
        errors,
    )
    terminal = valid_count_type and contract_count == CANDIDATE_INDEX_COUNT
    require(
        (
            valid_count_type
            and 0 < contract_count < CANDIDATE_INDEX_COUNT
            and contract_count % 10 == 0
        )
        or terminal,
        "candidate-contracts.json: contracts must end at a 10-item batch or catalog terminal",
        errors,
    )
    expected_next = None if terminal or not valid_count_type else contract_count + 1
    require(
        next_ordinal is None if terminal else is_strict_int(next_ordinal),
        "candidate-contracts.json: next_ordinal must be an integer or null at terminal",
        errors,
    )
    require(
        (next_ordinal is None and terminal)
        or (is_strict_int(next_ordinal) and next_ordinal == expected_next),
        "candidate-contracts.json: next_ordinal must identify the next candidate or be null at terminal",
        errors,
    )
    return errors


def candidate_contract_batch_ranges(contract_count: int) -> tuple[tuple[int, int], ...]:
    """Return completed 10-item ranges plus the terminal 81..87 tail."""
    if not is_strict_int(contract_count) or contract_count <= 0:
        return ()
    full_batch_limit = min(contract_count, 80)
    ranges = [
        (start_ordinal, start_ordinal + 9)
        for start_ordinal in range(1, full_batch_limit + 1, 10)
        if start_ordinal + 9 <= contract_count
    ]
    if contract_count == CANDIDATE_INDEX_COUNT:
        ranges.append((81, CANDIDATE_INDEX_COUNT))
    return tuple(ranges)


def candidate_contract_batch_digest(
    contracts: list[Any], start_ordinal: int, end_ordinal: int
) -> str:
    """Hash one completed batch range using canonical JSON."""
    encoded = json.dumps(
        contracts[start_ordinal - 1 : end_ordinal],
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def validate_candidate_batch_commitments(contracts: list[Any]) -> list[str]:
    """Require one immutable digest lock for every completed contract batch."""
    errors: list[str] = []
    prefix = "candidate-contracts.json"
    expected_ranges = set(candidate_contract_batch_ranges(len(contracts)))
    configured_ranges = set(CANDIDATE_BATCH_SHA256)
    require(
        configured_ranges == expected_ranges,
        f"{prefix}: completed batch digest coverage mismatch",
        errors,
    )
    for batch_range in sorted(expected_ranges & configured_ranges):
        start_ordinal, end_ordinal = batch_range
        batch_number = (start_ordinal - 1) // 10 + 1
        try:
            actual_digest = candidate_contract_batch_digest(contracts, start_ordinal, end_ordinal)
        except (TypeError, ValueError) as exc:
            errors.append(f"{prefix}: completed batch {batch_number} is not canonical JSON: {exc}")
            continue
        require(
            actual_digest == CANDIDATE_BATCH_SHA256[batch_range],
            f"{prefix}: completed batch {batch_number} digest mismatch",
            errors,
        )
    return errors


def validate_candidate_contracts(
    data: Any,
    catalog: dict[str, Any],
    candidate_index: dict[str, Any],
    recovery_contracts: dict[str, list[dict[str, Any]]],
    fallback_contracts: list[dict[str, Any]],
) -> list[str]:
    """Validate append-only candidate safety annotations against the catalog snapshot."""
    errors: list[str] = []
    prefix = "candidate-contracts.json"
    require(isinstance(data, dict), f"{prefix}: root must be an object", errors)
    if not isinstance(data, dict):
        return errors
    require(
        set(data) == {"schema_version", "ordering", "batch_size", "next_ordinal", "contracts"},
        f"{prefix}: fields must exactly match schema",
        errors,
    )
    require(
        data.get("schema_version") == "opsiabench/candidate-contracts/v0.1",
        f"{prefix}: bad schema_version",
        errors,
    )
    require(data.get("ordering") == CANDIDATE_ORDERING, f"{prefix}: bad ordering", errors)
    require(
        is_strict_int(data.get("batch_size")) and data.get("batch_size") == 10,
        f"{prefix}: batch_size must be integer 10",
        errors,
    )
    contracts = data.get("contracts")
    require(
        isinstance(contracts, list) and bool(contracts),
        f"{prefix}: contracts must be non-empty list",
        errors,
    )
    if not isinstance(contracts, list):
        return errors
    errors.extend(validate_candidate_contract_progress(len(contracts), data.get("next_ordinal")))
    errors.extend(validate_candidate_batch_commitments(contracts))

    index_document = candidate_index if isinstance(candidate_index, dict) else {}
    require(
        isinstance(candidate_index, dict),
        f"{prefix}: candidate index must be an object",
        errors,
    )
    raw_index_items = index_document.get("candidates")
    index_items = raw_index_items if isinstance(raw_index_items, list) else []
    raw_index_sources = index_document.get("source_sha256")
    index_sources = raw_index_sources if isinstance(raw_index_sources, dict) else {}
    catalog_document = catalog if isinstance(catalog, dict) else {}
    require(isinstance(catalog, dict), f"{prefix}: catalog must be an object", errors)
    try:
        command_actions, safe_pr_actions = load_dispatch_capabilities()
    except (OSError, SyntaxError, ValueError) as exc:
        errors.append(f"{prefix}: cannot read dispatch capabilities: {exc}")
        command_actions = frozenset()
        safe_pr_actions = frozenset()

    seen: set[tuple[Any, Any]] = set()
    for index, item in enumerate(contracts, start=1):
        item_prefix = f"{prefix}: contract {index}"
        require(isinstance(item, dict), f"{item_prefix} must be object", errors)
        if not isinstance(item, dict):
            continue
        require(
            set(item) == CANDIDATE_CONTRACT_FIELDS,
            f"{item_prefix}: fields must exactly match schema",
            errors,
        )
        require(
            is_strict_int(item.get("ordinal")) and item.get("ordinal") == index,
            f"{item_prefix}: ordinal must be integer {index}",
            errors,
        )
        catalog_source = item.get("catalog_source")
        indexed_value = index_items[index - 1] if index <= len(index_items) else {}
        indexed = indexed_value if isinstance(indexed_value, dict) else {}
        require(
            isinstance(catalog_source, str) and catalog_source in index_sources,
            f"{item_prefix}: catalog_source is not hash-pinned",
            errors,
        )
        rule_id = item.get("rule_id")
        candidate_id = item.get("candidate_id")
        valid_rule_id = isinstance(rule_id, str) and bool(rule_id.strip())
        valid_candidate_id = isinstance(candidate_id, str) and bool(candidate_id.strip())
        require(valid_rule_id, f"{item_prefix}: rule_id is required", errors)
        require(valid_candidate_id, f"{item_prefix}: candidate_id is required", errors)
        if valid_rule_id and valid_candidate_id:
            identity = (rule_id, candidate_id)
            require(identity not in seen, f"{item_prefix}: duplicate candidate contract", errors)
            seen.add(identity)
        for field in (
            "ordinal",
            "catalog_source",
            "rule_id",
            "candidate_id",
            "required_evidence",
            "supporting_signals",
        ):
            require(
                item.get(field) == indexed.get(field),
                f"{item_prefix}: {field} does not match the loader-order index",
                errors,
            )
        required_evidence = item.get("required_evidence")
        require(
            isinstance(required_evidence, list)
            and bool(required_evidence)
            and all(
                isinstance(evidence_key, str) and bool(evidence_key.strip())
                for evidence_key in required_evidence
            ),
            f"{item_prefix}: required_evidence requires non-empty strings",
            errors,
        )
        validate_signal_groups(item.get("supporting_signals"), item_prefix, errors)
        require(
            item.get("contradicting_signals") == [],
            f"{item_prefix}: contradicting_signals must remain empty while unmodeled",
            errors,
        )
        require(
            item.get("contradiction_policy") == CONTRADICTION_POLICY,
            f"{item_prefix}: contradiction_policy must disclose the unmodeled boundary",
            errors,
        )
        require(
            item.get("missing_evidence_policy") == MISSING_EVIDENCE_POLICY,
            f"{item_prefix}: missing_evidence_policy must match RCA completion semantics",
            errors,
        )

        expected_allowed = [
            *(recovery_contracts.get(candidate_id, []) if valid_candidate_id else []),
            *fallback_contracts,
        ]
        expected_capabilities = [
            capability
            for capability, supported_actions, route in (
                ("command", command_actions, "auto"),
                ("safe_pr", safe_pr_actions, "draft_pr"),
            )
            if any(
                action["route"] == route and action["action_type"] in supported_actions
                for action in expected_allowed
            )
        ]
        capabilities = item.get("patch_capabilities")
        valid_capabilities = isinstance(capabilities, list) and all(
            isinstance(capability, str) for capability in capabilities
        )
        require(
            isinstance(capabilities, list),
            f"{item_prefix}: patch_capabilities must be list",
            errors,
        )
        require(
            valid_capabilities,
            f"{item_prefix}: patch_capabilities require unique strings",
            errors,
        )
        if valid_capabilities:
            require(
                len(capabilities) == len(set(capabilities)),
                f"{item_prefix}: patch_capabilities require unique strings",
                errors,
            )
            require(
                set(capabilities) <= PATCH_CAPABILITIES,
                f"{item_prefix}: invalid patch capability",
                errors,
            )
            require(
                capabilities == expected_capabilities,
                f"{item_prefix}: patch_capabilities must match dispatch allowlists",
                errors,
            )

        allowed = item.get("allowed_remediations")
        require(
            isinstance(allowed, list) and bool(allowed),
            f"{item_prefix}: allowed_remediations must be non-empty list",
            errors,
        )
        require(
            allowed == expected_allowed,
            f"{item_prefix}: allowed_remediations must exactly match live recovery and fallback",
            errors,
        )
        if isinstance(allowed, list):
            for action in allowed:
                action_prefix = f"{item_prefix}: allowed remediation"
                require(isinstance(action, dict), f"{action_prefix} must be object", errors)
                if not isinstance(action, dict):
                    continue
                require(
                    set(action) == ALLOWED_REMEDIATION_FIELDS,
                    f"{action_prefix}: fields must exactly match schema",
                    errors,
                )
                require(
                    isinstance(action.get("action_type"), str)
                    and bool(action["action_type"].strip()),
                    f"{action_prefix}: action_type is required",
                    errors,
                )
                route = action.get("route")
                require(
                    isinstance(route, str) and route in ACTION_ROUTES,
                    f"{action_prefix}: invalid route",
                    errors,
                )
                require(
                    isinstance(action.get("blast_radius"), str)
                    and action.get("blast_radius") in BLAST_RADIUS,
                    f"{action_prefix}: invalid blast_radius",
                    errors,
                )
                approval_required = action.get("approval_required")
                require(
                    isinstance(approval_required, bool),
                    f"{action_prefix}: approval_required must be boolean",
                    errors,
                )
                require(
                    isinstance(action.get("rollback"), str) and bool(action["rollback"].strip()),
                    f"{action_prefix}: rollback is required",
                    errors,
                )
                verification = action.get("post_verification")
                require(
                    isinstance(verification, list)
                    and bool(verification)
                    and all(
                        isinstance(check, str) and bool(check.strip()) for check in verification
                    ),
                    f"{action_prefix}: post_verification requires non-empty strings",
                    errors,
                )
        forbidden = item.get("forbidden_remediations")
        require(
            isinstance(forbidden, list) and bool(forbidden),
            f"{item_prefix}: forbidden_remediations must be non-empty list",
            errors,
        )
        if isinstance(forbidden, list):
            for action in forbidden:
                action_prefix = f"{item_prefix}: forbidden remediation"
                require(isinstance(action, dict), f"{action_prefix} must be object", errors)
                if not isinstance(action, dict):
                    continue
                require(
                    set(action) == FORBIDDEN_REMEDIATION_FIELDS,
                    f"{action_prefix}: fields must exactly match schema",
                    errors,
                )
                require(
                    isinstance(action.get("action_type"), str)
                    and bool(action["action_type"].strip()),
                    f"{action_prefix}: action_type is required",
                    errors,
                )
                require(
                    isinstance(action.get("blast_radius"), str)
                    and action.get("blast_radius") in DANGEROUS_RADIUS,
                    f"{action_prefix}: blast_radius must be cluster/fleet",
                    errors,
                )
                require(
                    isinstance(action.get("reason"), str) and bool(action["reason"].strip()),
                    f"{action_prefix}: reason is required",
                    errors,
                )
            allowed_types = {
                action.get("action_type")
                for action in allowed or []
                if isinstance(action, dict) and isinstance(action.get("action_type"), str)
            }
            forbidden_types = {
                action.get("action_type")
                for action in forbidden
                if isinstance(action, dict) and isinstance(action.get("action_type"), str)
            }
            require(
                allowed_types.isdisjoint(forbidden_types),
                f"{item_prefix}: allowed and forbidden actions must be disjoint",
                errors,
            )

        fixtures = item.get("benchmark_fixtures")
        require(
            isinstance(fixtures, list), f"{item_prefix}: benchmark_fixtures must be list", errors
        )
        if isinstance(fixtures, list):
            require(
                len(fixtures) == len(set(fixtures))
                if all(isinstance(v, str) for v in fixtures)
                else False,
                f"{item_prefix}: benchmark_fixtures must be unique strings",
                errors,
            )
            scenario_root = (ROOT / "scenarios").resolve()
            for relative in fixtures:
                fixture = (ROOT.parent / relative).resolve() if isinstance(relative, str) else ROOT
                in_scenario_tree = (
                    isinstance(relative, str)
                    and fixture.is_relative_to(scenario_root)
                    and fixture.name == "scenario.json"
                )
                require(
                    in_scenario_tree,
                    f"{item_prefix}: fixture path must remain under benchmark/scenarios",
                    errors,
                )
                require(
                    in_scenario_tree and fixture.is_file(),
                    f"{item_prefix}: benchmark fixture must exist under benchmark/scenarios",
                    errors,
                )
                if in_scenario_tree and fixture.is_file():
                    fixture_data = load_json(fixture)
                    require(
                        isinstance(fixture_data, dict)
                        and fixture_data.get("expected_root_cause") == candidate_id,
                        f"{item_prefix}: benchmark fixture targets another candidate",
                        errors,
                    )
                    require(
                        isinstance(fixture_data, dict) and fixture_data.get("rule_id") == rule_id,
                        f"{item_prefix}: benchmark fixture targets another rule",
                        errors,
                    )
                    for fixture_error in validate_scenario(fixture, fixture_data, catalog_document):
                        errors.append(f"{item_prefix}: invalid benchmark fixture: {fixture_error}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--category", choices=sorted(REQUIRED_CATEGORIES), help="validate one completed category"
    )
    mode.add_argument(
        "--candidate-contracts",
        action="store_true",
        help="validate candidate remediation safety annotations",
    )
    args = parser.parse_args()
    catalog = load_json(ROOT / "catalog-snapshot.json")
    candidate_index = load_json(ROOT / "candidate-contract-index.json")
    candidate_contracts = load_json(ROOT / "candidate-contracts.json")
    recovery_contracts, fallback_contracts = load_recovery_contracts()
    errors: list[str] = []
    validate_catalog_sources(catalog, errors)
    errors.extend(validate_candidate_index(candidate_index))
    errors.extend(
        validate_candidate_contracts(
            candidate_contracts,
            catalog,
            candidate_index,
            recovery_contracts,
            fallback_contracts,
        )
    )
    if args.candidate_contracts:
        if errors:
            for error in errors:
                print(f"FAIL {error}")
            print(f"RESULT FAIL ({len(errors)} errors)")
            return 1
        count = len(candidate_contracts["contracts"])
        print(f"RESULT PASS ({count} candidate contracts; ordinals=1..{count})")
        return 0
    pattern = f"{args.category}/*/scenario.json" if args.category else "*/*/scenario.json"
    paths = sorted((ROOT / "scenarios").glob(pattern))
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
