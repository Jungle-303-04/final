from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

KUBERNETES_NAME = re.compile(r"^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$")
DEPLOYMENT_RESOURCE = re.compile(r"^deployment/[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$")
IMAGE_DIGEST = re.compile(r"^[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}$")
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")
TIMEOUT = re.compile(r"^[1-9][0-9]*[smh]$")


@dataclass(frozen=True)
class RollbackTarget:
    namespace: str
    resource: str
    container: str
    image: str


@dataclass(frozen=True)
class RollbackPlan:
    previous_release_sha: str
    targets: tuple[RollbackTarget, ...]


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def require_text(mapping: dict[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{key} must be a non-empty string")
    return value


def parse_target(value: Any, index: int) -> RollbackTarget:
    mapping = require_mapping(value, f"targets[{index}]")
    expected = {"namespace", "resource", "container", "image"}
    if set(mapping) != expected:
        raise ValueError(f"targets[{index}] must contain exactly {sorted(expected)}")

    target = RollbackTarget(
        namespace=require_text(mapping, "namespace"),
        resource=require_text(mapping, "resource"),
        container=require_text(mapping, "container"),
        image=require_text(mapping, "image"),
    )
    if not KUBERNETES_NAME.fullmatch(target.namespace):
        raise ValueError(f"targets[{index}].namespace is not a Kubernetes name")
    if not DEPLOYMENT_RESOURCE.fullmatch(target.resource):
        raise ValueError(f"targets[{index}].resource must be deployment/<name>")
    if not KUBERNETES_NAME.fullmatch(target.container):
        raise ValueError(f"targets[{index}].container is not a Kubernetes name")
    if not IMAGE_DIGEST.fullmatch(target.image):
        raise ValueError(f"targets[{index}].image must use an immutable sha256 digest")
    return target


def load_plan(path: Path) -> RollbackPlan:
    document = require_mapping(json.loads(path.read_text(encoding="utf-8")), "plan")
    if set(document) != {"version", "previous_release_sha", "targets"}:
        raise ValueError("plan must contain exactly version, previous_release_sha, and targets")
    if document["version"] != 1:
        raise ValueError("plan version must be 1")

    previous_release_sha = require_text(document, "previous_release_sha")
    if not GIT_SHA.fullmatch(previous_release_sha):
        raise ValueError("previous_release_sha must be a full lowercase Git SHA")

    raw_targets = document["targets"]
    if not isinstance(raw_targets, list) or not raw_targets:
        raise ValueError("targets must be a non-empty list")
    targets = tuple(parse_target(value, index) for index, value in enumerate(raw_targets))
    identities = [(target.namespace, target.resource, target.container) for target in targets]
    if len(identities) != len(set(identities)):
        raise ValueError("targets must not contain duplicate deployment containers")
    return RollbackPlan(previous_release_sha=previous_release_sha, targets=targets)


def kubectl_commands(
    plan: RollbackPlan, *, context: str, timeout: str
) -> tuple[tuple[str, ...], ...]:
    if not context or any(character.isspace() for character in context):
        raise ValueError("context must be a non-empty name without whitespace")
    if not TIMEOUT.fullmatch(timeout):
        raise ValueError("timeout must be a positive Kubernetes duration such as 300s")

    commands: list[tuple[str, ...]] = [("kubectl", "config", "get-contexts", context, "-o", "name")]
    for target in plan.targets:
        prefix = ("kubectl", "--context", context, "-n", target.namespace)
        commands.append(
            (*prefix, "set", "image", target.resource, f"{target.container}={target.image}")
        )
        commands.append((*prefix, "rollout", "status", target.resource, f"--timeout={timeout}"))
    return tuple(commands)


def apply_plan(plan: RollbackPlan, *, context: str, timeout: str) -> None:
    commands = kubectl_commands(plan, context=context, timeout=timeout)
    context_result = subprocess.run(commands[0], check=True, capture_output=True, text=True)
    if context_result.stdout.strip() != context:
        raise RuntimeError(f"kubectl context was not found: {context}")
    for command in commands[1:]:
        subprocess.run(command, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Restore Kubernetes deployments to explicitly recorded image digests."
    )
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--context", required=True)
    parser.add_argument("--timeout", default="300s")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Run kubectl. Without this flag the validated command plan is printed only.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan = load_plan(args.plan)
    commands = kubectl_commands(plan, context=args.context, timeout=args.timeout)
    if args.apply:
        apply_plan(plan, context=args.context, timeout=args.timeout)
        print(
            f"restored {len(plan.targets)} deployment container(s) for {plan.previous_release_sha}"
        )
        return 0

    print(
        json.dumps(
            {
                "mode": "dry-run",
                "previous_release_sha": plan.previous_release_sha,
                "commands": [list(command) for command in commands],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
