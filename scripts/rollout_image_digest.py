from __future__ import annotations

import argparse
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import yaml
from capture_image_digests import image_repository, live_deployment_images, require_mapping
from revert_image_digests import IMAGE_DIGEST, TIMEOUT, RollbackPlan, load_plan

MAX_ROLLOUT_STATUS_WORKERS = 8


def rollout_targets(plan: RollbackPlan) -> tuple[Any, ...]:
    return (*plan.targets, *plan.bootstrap_targets)


def render_bootstrap_manifest(plan: RollbackPlan, *, manifest: Path, image: str) -> str:
    if not IMAGE_DIGEST.fullmatch(image):
        raise ValueError("image must use an immutable sha256 digest")
    expected = {
        (target.namespace, target.resource, target.container) for target in plan.bootstrap_targets
    }
    if not expected:
        return ""

    expected_by_resource: dict[tuple[str, str], set[str]] = {}
    for namespace, resource, container in expected:
        expected_by_resource.setdefault((namespace, resource), set()).add(container)

    rendered: list[dict[str, Any]] = []
    observed: set[tuple[str, str, str]] = set()
    for index, value in enumerate(yaml.safe_load_all(manifest.read_text(encoding="utf-8"))):
        document = require_mapping(value, f"manifest document {index}")
        if document.get("kind") != "Deployment":
            continue
        metadata = require_mapping(document.get("metadata"), f"manifest document {index}.metadata")
        name = metadata.get("name")
        namespace = metadata.get("namespace")
        if not isinstance(name, str):
            raise ValueError(f"manifest document {index} has no deployment name")
        matching_namespaces = {
            target_namespace
            for target_namespace, resource in expected_by_resource
            if resource == f"deployment/{name}"
        }
        if not matching_namespaces:
            continue
        if len(matching_namespaces) != 1:
            raise ValueError(f"bootstrap deployment namespace is ambiguous: {name}")
        expected_namespace = next(iter(matching_namespaces))
        if namespace is None:
            metadata["namespace"] = expected_namespace
        elif namespace != expected_namespace:
            raise ValueError(f"bootstrap deployment namespace mismatch: {name}")

        spec = require_mapping(document.get("spec"), f"deployment/{name}.spec")
        template = require_mapping(spec.get("template"), f"deployment/{name}.template")
        pod_spec = require_mapping(template.get("spec"), f"deployment/{name}.podSpec")
        containers = pod_spec.get("containers")
        if not isinstance(containers, list) or not containers:
            raise ValueError(f"deployment/{name} must contain containers")
        expected_containers = expected_by_resource[(expected_namespace, f"deployment/{name}")]
        for container_index, raw_container in enumerate(containers):
            container = require_mapping(
                raw_container,
                f"deployment/{name}.containers[{container_index}]",
            )
            container_name = container.get("name")
            if container_name not in expected_containers:
                continue
            source_image = container.get("image")
            if not isinstance(source_image, str) or image_repository(
                source_image
            ) != image_repository(image):
                raise ValueError(f"bootstrap manifest repository mismatch: {name}/{container_name}")
            container["image"] = image
            observed.add((expected_namespace, f"deployment/{name}", container_name))
        rendered.append(document)

    if observed != expected:
        missing = sorted(expected - observed)
        extra = sorted(observed - expected)
        raise ValueError(f"bootstrap manifest target mismatch: missing={missing!r} extra={extra!r}")
    resources = [
        (document["metadata"]["namespace"], document["metadata"]["name"]) for document in rendered
    ]
    if len(resources) != len(set(resources)):
        raise ValueError("bootstrap manifest contains duplicate Deployments")
    return yaml.safe_dump_all(rendered, sort_keys=False)


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
        (target.resource.removeprefix("deployment/"), target.container)
        for target in rollout_targets(plan)
    }
    live_images = live_deployment_images(live_document)
    protected = {
        (target.resource.removeprefix("deployment/"), target.container): target.image
        for target in plan.protected_targets
    }
    if any(
        image_repository(protected_image) != repository for protected_image in protected.values()
    ):
        raise ValueError("protected target repository must match rollout repository")
    missing = sorted(expected - set(live_images))
    protected_changes = sorted(
        identity
        for identity, protected_image in protected.items()
        if live_images.get(identity) != protected_image
    )
    unexpected_repository_targets = sorted(
        identity
        for identity, observed_image in live_images.items()
        if image_repository(observed_image) == repository
        and identity not in expected
        and identity not in protected
    )
    if missing or unexpected_repository_targets:
        raise RuntimeError(
            "repository target set changed: "
            f"missing={missing!r} extra={unexpected_repository_targets!r}"
        )
    if protected_changes:
        raise RuntimeError(f"protected repository target changed: {protected_changes!r}")
    if not require_exact_digest:
        return len(expected)
    mismatches = sorted(identity for identity in expected if live_images[identity] != image)
    if mismatches:
        raise RuntimeError(f"repository digest mismatch: {mismatches!r}")
    return len(expected)


def verify_pre_rollout_state(plan: RollbackPlan, *, image: str, live_document: Any) -> int:
    repository = image_repository(image)
    live_images = live_deployment_images(live_document)
    existing = {
        (target.resource.removeprefix("deployment/"), target.container) for target in plan.targets
    }
    missing_existing = sorted(existing - set(live_images))
    if missing_existing:
        raise RuntimeError(f"captured deployment target disappeared: {missing_existing!r}")

    live_deployment_names = {deployment for deployment, _container in live_images}
    present_bootstrap_deployments = sorted(
        {
            target.resource.removeprefix("deployment/")
            for target in plan.bootstrap_targets
            if target.resource.removeprefix("deployment/") in live_deployment_names
        }
    )
    if present_bootstrap_deployments:
        raise RuntimeError(
            f"bootstrap deployment appeared after capture: {present_bootstrap_deployments!r}"
        )

    expected = {
        (target.resource.removeprefix("deployment/"), target.container)
        for target in rollout_targets(plan)
    }
    protected = {
        (target.resource.removeprefix("deployment/"), target.container): target.image
        for target in plan.protected_targets
    }
    protected_changes = sorted(
        identity
        for identity, protected_image in protected.items()
        if live_images.get(identity) != protected_image
    )
    if protected_changes:
        raise RuntimeError(f"protected repository target changed: {protected_changes!r}")
    unexpected_repository_targets = sorted(
        identity
        for identity, observed_image in live_images.items()
        if image_repository(observed_image) == repository
        and identity not in expected
        and identity not in protected
    )
    if unexpected_repository_targets:
        raise RuntimeError(
            f"repository target set changed: extra={unexpected_repository_targets!r}"
        )
    return len(existing)


def create_bootstrap_deployments(
    plan: RollbackPlan,
    *,
    context: str,
    image: str,
    manifest: Path | None,
) -> None:
    if not plan.bootstrap_targets:
        return
    if manifest is None:
        raise ValueError("manifest is required when the plan contains bootstrap targets")
    namespaces = {target.namespace for target in plan.bootstrap_targets}
    if len(namespaces) != 1:
        raise ValueError("bootstrap plan must target exactly one namespace")
    namespace = next(iter(namespaces))
    rendered = render_bootstrap_manifest(plan, manifest=manifest, image=image)
    subprocess.run(
        (
            "kubectl",
            "--context",
            context,
            "-n",
            namespace,
            "create",
            "--filename",
            "-",
        ),
        check=True,
        input=rendered,
        text=True,
    )


def rollout_commands(
    plan: RollbackPlan, *, context: str, image: str, timeout: str
) -> tuple[tuple[str, ...], ...]:
    if not context or any(character.isspace() for character in context):
        raise ValueError("context must be a non-empty name without whitespace")
    if not IMAGE_DIGEST.fullmatch(image):
        raise ValueError("image must use an immutable sha256 digest")
    if not TIMEOUT.fullmatch(timeout):
        raise ValueError("timeout must be a positive Kubernetes duration such as 300s")

    context_command = ("kubectl", "config", "get-contexts", context, "-o", "name")
    set_image_commands: list[tuple[str, ...]] = []
    rollout_status_commands: list[tuple[str, ...]] = []
    for target in rollout_targets(plan):
        prefix = ("kubectl", "--context", context, "-n", target.namespace)
        set_image_commands.append(
            (*prefix, "set", "image", target.resource, f"{target.container}={image}")
        )
        rollout_status_commands.append(
            (*prefix, "rollout", "status", target.resource, f"--timeout={timeout}")
        )
    return (context_command, *set_image_commands, *rollout_status_commands)


def wait_for_rollout_statuses(
    commands: tuple[tuple[str, ...], ...],
    *,
    max_workers: int = MAX_ROLLOUT_STATUS_WORKERS,
) -> None:
    if not commands:
        return
    worker_count = min(max_workers, len(commands))
    if worker_count < 1:
        raise ValueError("max_workers must be positive")

    failures: list[tuple[tuple[str, ...], Exception]] = []
    with ThreadPoolExecutor(
        max_workers=worker_count,
        thread_name_prefix="rollout-status",
    ) as executor:
        futures = {
            executor.submit(subprocess.run, command, check=True): command for command in commands
        }
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as error:  # noqa: BLE001 - aggregate every kubectl failure
                failures.append((futures[future], error))

    if failures:
        failures.sort(key=lambda failure: failure[0])
        resources = [command[-2] for command, _error in failures]
        raise RuntimeError(f"rollout status failed for {resources!r}") from failures[0][1]


def rollout(
    plan: RollbackPlan,
    *,
    context: str,
    image: str,
    timeout: str,
    manifest: Path | None = None,
) -> None:
    commands = rollout_commands(plan, context=context, image=image, timeout=timeout)
    context_result = subprocess.run(commands[0], check=True, capture_output=True, text=True)
    if context_result.stdout.strip() != context:
        raise RuntimeError(f"kubectl context was not found: {context}")
    targets = rollout_targets(plan)
    namespaces = {target.namespace for target in targets}
    if len(namespaces) != 1:
        raise ValueError("rollout plan must target exactly one namespace")
    namespace = next(iter(namespaces))
    live_before = live_deployments(context=context, namespace=namespace)
    if plan.bootstrap_targets:
        verify_pre_rollout_state(plan, image=image, live_document=live_before)
        create_bootstrap_deployments(
            plan,
            context=context,
            image=image,
            manifest=manifest,
        )
        live_before = live_deployments(context=context, namespace=namespace)
    verify_repository_rollout(
        plan,
        image=image,
        live_document=live_before,
        require_exact_digest=False,
    )
    target_count = len(targets)
    set_image_commands = commands[1 : 1 + target_count]
    rollout_status_commands = commands[1 + target_count :]
    for command in set_image_commands:
        subprocess.run(command, check=True)
    wait_for_rollout_statuses(rollout_status_commands)
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
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--timeout", default="300s")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan = load_plan(args.plan)
    rollout(
        plan,
        context=args.context,
        image=args.image,
        timeout=args.timeout,
        manifest=args.manifest,
    )
    print(f"rolled out immutable digest to {len(rollout_targets(plan))} deployment container(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
