from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

KUBERNETES_NAME = re.compile(r"^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$")
RUNTIME_SECRET = "management-runtime-secret"
EXPLICIT_FREEZE_TARGETS = frozenset({"cluster-agent", "pgbouncer"})
EXPLICIT_NON_WRITERS = frozenset({"console-dev"})
REQUIRED_FREEZE_TARGETS = frozenset({"api-gateway", "pgbouncer"})
REQUIRED_RESTORE_TARGETS = frozenset({"api-gateway", "pgbouncer"})


@dataclass(frozen=True)
class FreezeTarget:
    name: str
    replicas: int


@dataclass(frozen=True)
class FreezePlan:
    namespace: str
    targets: tuple[FreezeTarget, ...]


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _container_uses_runtime_secret(container: Any) -> bool:
    value = require_mapping(container, "container")
    for raw_source in value.get("envFrom", []):
        source = require_mapping(raw_source, "envFrom entry")
        secret = source.get("secretRef")
        if isinstance(secret, dict) and secret.get("name") == RUNTIME_SECRET:
            return True
    for raw_env in value.get("env", []):
        env = require_mapping(raw_env, "env entry")
        value_from = env.get("valueFrom")
        if not isinstance(value_from, dict):
            continue
        secret = value_from.get("secretKeyRef")
        if isinstance(secret, dict) and secret.get("name") == RUNTIME_SECRET:
            return True
    return False


def _deployment_uses_runtime_secret(deployment: dict[str, Any]) -> bool:
    spec = require_mapping(deployment.get("spec"), "deployment.spec")
    template = require_mapping(spec.get("template"), "deployment.spec.template")
    pod_spec = require_mapping(template.get("spec"), "deployment.spec.template.spec")
    containers = [*pod_spec.get("initContainers", []), *pod_spec.get("containers", [])]
    return any(_container_uses_runtime_secret(container) for container in containers)


def build_plan(
    document: Any,
    *,
    namespace: str,
    hpa_targets: set[str] | None = None,
) -> FreezePlan:
    if not KUBERNETES_NAME.fullmatch(namespace):
        raise ValueError("namespace is not a Kubernetes name")
    root = require_mapping(document, "deployments")
    items = root.get("items")
    if not isinstance(items, list):
        raise ValueError("deployments.items must be a list")

    targets: list[FreezeTarget] = []
    observed: set[str] = set()
    for index, raw_item in enumerate(items):
        item = require_mapping(raw_item, f"deployments.items[{index}]")
        metadata = require_mapping(item.get("metadata"), f"deployments.items[{index}].metadata")
        name = metadata.get("name")
        if not isinstance(name, str) or not KUBERNETES_NAME.fullmatch(name):
            raise ValueError(f"deployments.items[{index}] has an invalid name")
        if name in observed:
            raise ValueError(f"duplicate live deployment: {name}")
        observed.add(name)
        if name in EXPLICIT_NON_WRITERS:
            continue
        if name not in EXPLICIT_FREEZE_TARGETS and not _deployment_uses_runtime_secret(item):
            continue
        spec = require_mapping(item.get("spec"), f"deployment/{name}.spec")
        replicas = spec.get("replicas", 1)
        if not isinstance(replicas, int) or isinstance(replicas, bool) or replicas < 0:
            raise ValueError(f"deployment/{name}.spec.replicas must be a non-negative integer")
        targets.append(FreezeTarget(name=name, replicas=replicas))

    names = {target.name for target in targets}
    missing = sorted(REQUIRED_FREEZE_TARGETS - names)
    if missing:
        raise ValueError(f"required freeze target is missing: {missing[0]}")
    autoscaled = sorted(names.intersection(hpa_targets or set()))
    if autoscaled:
        raise ValueError(f"horizontal autoscaler prevents deterministic freeze: {autoscaled[0]}")
    return FreezePlan(
        namespace=namespace, targets=tuple(sorted(targets, key=lambda item: item.name))
    )


def _validate_context(context: str) -> None:
    if not context or any(character.isspace() for character in context):
        raise ValueError("context must be a non-empty name without whitespace")
    result = subprocess.run(
        ("kubectl", "config", "get-contexts", context, "-o", "name"),
        check=True,
        capture_output=True,
        text=True,
    )
    if result.stdout.strip() != context:
        raise RuntimeError(f"kubectl context was not found: {context}")


def _kubectl_json(context: str, namespace: str, *arguments: str) -> dict[str, Any]:
    result = subprocess.run(
        ("kubectl", "--context", context, "-n", namespace, *arguments, "-o", "json"),
        check=True,
        capture_output=True,
        text=True,
    )
    return require_mapping(json.loads(result.stdout), "kubectl response")


def _hpa_targets(document: dict[str, Any]) -> set[str]:
    targets: set[str] = set()
    items = document.get("items")
    if not isinstance(items, list):
        raise ValueError("horizontalpodautoscalers.items must be a list")
    for index, raw_item in enumerate(items):
        item = require_mapping(raw_item, f"horizontalpodautoscalers.items[{index}]")
        spec = require_mapping(item.get("spec"), f"horizontalpodautoscalers.items[{index}].spec")
        target = require_mapping(spec.get("scaleTargetRef"), "scaleTargetRef")
        if target.get("kind") == "Deployment" and isinstance(target.get("name"), str):
            targets.add(str(target["name"]))
    return targets


def write_plan(path: Path, plan: FreezePlan) -> None:
    document = {
        "version": 1,
        "namespace": plan.namespace,
        "targets": [asdict(target) for target in plan.targets],
    }
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2, sort_keys=True)
        handle.write("\n")


def load_plan(path: Path) -> FreezePlan:
    document = require_mapping(json.loads(path.read_text(encoding="utf-8")), "plan")
    if set(document) != {"version", "namespace", "targets"} or document["version"] != 1:
        raise ValueError("freeze plan has an unsupported shape or version")
    namespace = document["namespace"]
    if not isinstance(namespace, str) or not KUBERNETES_NAME.fullmatch(namespace):
        raise ValueError("freeze plan namespace is invalid")
    raw_targets = document["targets"]
    if not isinstance(raw_targets, list) or not raw_targets:
        raise ValueError("freeze plan targets must be a non-empty list")
    targets: list[FreezeTarget] = []
    for index, raw_target in enumerate(raw_targets):
        target = require_mapping(raw_target, f"targets[{index}]")
        if set(target) != {"name", "replicas"}:
            raise ValueError(f"targets[{index}] has an unsupported shape")
        name = target["name"]
        replicas = target["replicas"]
        if not isinstance(name, str) or not KUBERNETES_NAME.fullmatch(name):
            raise ValueError(f"targets[{index}].name is invalid")
        if not isinstance(replicas, int) or isinstance(replicas, bool) or replicas < 0:
            raise ValueError(f"targets[{index}].replicas is invalid")
        targets.append(FreezeTarget(name=name, replicas=replicas))
    names = [target.name for target in targets]
    if len(names) != len(set(names)):
        raise ValueError("freeze plan targets must be unique")
    if not REQUIRED_FREEZE_TARGETS.issubset(names):
        raise ValueError("freeze plan omits a required target")
    return FreezePlan(namespace=namespace, targets=tuple(targets))


def capture(*, context: str, namespace: str, output: Path) -> FreezePlan:
    _validate_context(context)
    deployments = _kubectl_json(context, namespace, "get", "deployments")
    hpas = _kubectl_json(context, namespace, "get", "horizontalpodautoscalers")
    plan = build_plan(deployments, namespace=namespace, hpa_targets=_hpa_targets(hpas))
    write_plan(output, plan)
    return plan


def _scale(context: str, plan: FreezePlan, replicas: dict[str, int]) -> None:
    for target in plan.targets:
        subprocess.run(
            (
                "kubectl",
                "--context",
                context,
                "-n",
                plan.namespace,
                "scale",
                f"deployment/{target.name}",
                f"--replicas={replicas[target.name]}",
            ),
            check=True,
        )


def _is_stopped(document: dict[str, Any]) -> bool:
    spec = require_mapping(document.get("spec"), "deployment.spec")
    status = require_mapping(document.get("status", {}), "deployment.status")
    replica_fields = ("replicas", "readyReplicas", "availableReplicas", "updatedReplicas")
    return spec.get("replicas") == 0 and all(
        int(status.get(field, 0)) == 0 for field in replica_fields
    )


def freeze(*, context: str, plan: FreezePlan, timeout_seconds: int) -> None:
    _validate_context(context)
    _scale(context, plan, {target.name: 0 for target in plan.targets})
    deadline = time.monotonic() + timeout_seconds
    pending = {target.name for target in plan.targets}
    while pending and time.monotonic() < deadline:
        pending = {
            name
            for name in pending
            if not _is_stopped(_kubectl_json(context, plan.namespace, "get", f"deployment/{name}"))
        }
        if pending:
            time.sleep(2)
    if pending:
        raise RuntimeError(f"database writer freeze timed out: {','.join(sorted(pending))}")


def restore(*, context: str, plan: FreezePlan, timeout: str) -> None:
    _validate_context(context)
    _scale(context, plan, {target.name: target.replicas for target in plan.targets})
    for target in plan.targets:
        if target.replicas == 0 or target.name not in REQUIRED_RESTORE_TARGETS:
            continue
        subprocess.run(
            (
                "kubectl",
                "--context",
                context,
                "-n",
                plan.namespace,
                "rollout",
                "status",
                f"deployment/{target.name}",
                f"--timeout={timeout}",
            ),
            check=True,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture and freeze all management DB writers")
    subparsers = parser.add_subparsers(dest="action", required=True)
    capture_parser = subparsers.add_parser("capture")
    capture_parser.add_argument("--context", required=True)
    capture_parser.add_argument("--namespace", required=True)
    capture_parser.add_argument("--output", type=Path, required=True)
    for action in ("freeze", "restore"):
        action_parser = subparsers.add_parser(action)
        action_parser.add_argument("--context", required=True)
        action_parser.add_argument("--plan", type=Path, required=True)
        action_parser.add_argument("--timeout", default="600s")
    args = parser.parse_args()
    if args.action == "capture":
        plan = capture(context=args.context, namespace=args.namespace, output=args.output)
        print(f"captured {len(plan.targets)} database writer replica target(s)")
        return 0
    plan = load_plan(args.plan)
    timeout_seconds = int(args.timeout.removesuffix("s"))
    if timeout_seconds <= 0 or not args.timeout.endswith("s"):
        raise ValueError("timeout must be a positive number of seconds")
    if args.action == "freeze":
        freeze(context=args.context, plan=plan, timeout_seconds=timeout_seconds)
        print(f"froze {len(plan.targets)} database writer deployment(s)")
    else:
        restore(context=args.context, plan=plan, timeout=args.timeout)
        print(f"restored {len(plan.targets)} database writer deployment(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
