from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from capture_image_digests import image_repository, live_deployment_images
from revert_image_digests import IMAGE_DIGEST, TIMEOUT, RollbackPlan, load_plan


def live_deployments(*, context: str, namespace: str) -> Any:
    result = subprocess.run(
        (
            "kubectl",
            "--context",
            context,
            "-n",
            namespace,
            "get",
            "deployments",
            "-o",
            "json",
        ),
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def verify_repository_rollout(
    plan: RollbackPlan,
    *,
    image: str,
    live_document: Any,
    require_exact_digest: bool,
) -> int:
    repository = image_repository(image)
    expected = {
        (target.resource.removeprefix("deployment/"), target.container) for target in plan.targets
    }
    observed_images = {
        identity: observed_image
        for identity, observed_image in live_deployment_images(live_document).items()
        if image_repository(observed_image) == repository
    }
    observed = set(observed_images)
    if observed != expected:
        missing = sorted(expected - observed)
        extra = sorted(observed - expected)
        raise RuntimeError(f"repository target set changed: missing={missing!r} extra={extra!r}")
    if require_exact_digest:
        mismatches = sorted(
            identity
            for identity, observed_image in observed_images.items()
            if observed_image != image
        )
        if mismatches:
            raise RuntimeError(f"repository digest mismatch: {mismatches!r}")
    return len(observed)


def rollout_commands(
    plan: RollbackPlan, *, context: str, image: str, timeout: str
) -> tuple[tuple[str, ...], ...]:
    if not context or any(character.isspace() for character in context):
        raise ValueError("context must be a non-empty name without whitespace")
    if not IMAGE_DIGEST.fullmatch(image):
        raise ValueError("image must use an immutable sha256 digest")
    if not TIMEOUT.fullmatch(timeout):
        raise ValueError("timeout must be a positive Kubernetes duration such as 300s")

    commands: list[tuple[str, ...]] = [("kubectl", "config", "get-contexts", context, "-o", "name")]
    for target in plan.targets:
        prefix = ("kubectl", "--context", context, "-n", target.namespace)
        commands.append((*prefix, "set", "image", target.resource, f"{target.container}={image}"))
        commands.append((*prefix, "rollout", "status", target.resource, f"--timeout={timeout}"))
    return tuple(commands)


def rollout(plan: RollbackPlan, *, context: str, image: str, timeout: str) -> None:
    commands = rollout_commands(plan, context=context, image=image, timeout=timeout)
    context_result = subprocess.run(commands[0], check=True, capture_output=True, text=True)
    if context_result.stdout.strip() != context:
        raise RuntimeError(f"kubectl context was not found: {context}")
    namespaces = {target.namespace for target in plan.targets}
    if len(namespaces) != 1:
        raise ValueError("rollout plan must target exactly one namespace")
    namespace = next(iter(namespaces))
    verify_repository_rollout(
        plan,
        image=image,
        live_document=live_deployments(context=context, namespace=namespace),
        require_exact_digest=False,
    )
    for command in commands[1:]:
        subprocess.run(command, check=True)
    count = verify_repository_rollout(
        plan,
        image=image,
        live_document=live_deployments(context=context, namespace=namespace),
        require_exact_digest=True,
    )
    print(f"verified {count} repository-matched deployment container(s) at {image}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Roll out one immutable service digest to a captured deployment set."
    )
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--context", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--timeout", default="300s")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan = load_plan(args.plan)
    rollout(plan, context=args.context, image=args.image, timeout=args.timeout)
    print(f"rolled out immutable digest to {len(plan.targets)} deployment container(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
