from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from revert_image_digests import IMAGE_DIGEST, TIMEOUT, RollbackPlan, load_plan


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
    for command in commands[1:]:
        subprocess.run(command, check=True)


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
