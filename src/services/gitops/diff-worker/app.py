"""diff-worker: manifest.rendered -> desired.diff.detected."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from os import getenv
from typing import Any

from kubernetes_dry_run import DryRunObjects, load_dry_run_objects

from domains.gitops.diffing import (
    ManagedFieldSnapshot,
    build_adoption_required_changes,
    build_diff_basis,
    compare_managed_fields,
    extract_declared_field_paths,
    rendered_manifest_to_object,
    snapshot_from_kubernetes_object,
    snapshot_from_rendered_manifest,
    summarize_status,
)
from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import (
    Diff,
    DiffDetectedBody,
    EventBody,
    ManifestRenderedBody,
    RenderedManifest,
)
from packages.runtime.app import App, EventContext

app = App("diff-worker")

UNKNOWN_ACTUAL_IMAGE = "unknown"
RESOURCE_NOT_INSPECTED = "resource-not-inspected"
ENABLE_SSA_DRY_RUN_ENV = "GITOPS_ENABLE_SSA_DRY_RUN"
FIELD_MANAGER_ENV = "GITOPS_FIELD_MANAGER"
DEFAULT_FIELD_MANAGER = "myjob-gitops"
REVIEW_REQUIRED_RISK = "review-required"


@dataclass(frozen=True)
class FieldPolicy:
    declared_fields: list[str]
    managed_fields: list[str]
    ignored_fields: list[str]
    unknown_fields: list[str]
    last_approved_snapshot: dict[str, object]
    source: str


async def load_actual_resource_image(evt: ManifestRenderedBody, ctx: EventContext[Any]) -> str:
    try:
        reader = ctx.db.get_actual_resource_image
    except AttributeError:
        return UNKNOWN_ACTUAL_IMAGE
    actual = await reader(
        evt.workspace_id,
        evt.cluster_id,
        evt.rendered_manifest.metadata.namespace or Sandbox.NAMESPACE,
        resource_ref(evt.rendered_manifest.kind, evt.rendered_manifest.metadata.name),
    )
    return str(actual) if actual else UNKNOWN_ACTUAL_IMAGE


def resource_ref(kind: str, name: str) -> str:
    return f"{kind.lower()}/{name}"


def build_desired_diff(evt: ManifestRenderedBody, actual_image: str) -> Diff:
    rendered = evt.rendered_manifest
    namespace = rendered.metadata.namespace or Sandbox.NAMESPACE
    policy = load_field_policy(rendered)
    new_desired, dry_run, dry_run_meta = load_new_desired_snapshot(rendered)
    live = load_live_snapshot(rendered, dry_run, actual_image)
    old_desired = load_previous_desired_snapshot(live, policy)
    changes = compare_managed_fields(
        old_desired=old_desired.fields,
        live=live.fields,
        new_desired=new_desired.fields,
        managed_fields=policy.managed_fields,
        ignored_fields=policy.ignored_fields,
    )
    changes.extend(
        build_adoption_required_changes(
            live=live.fields,
            new_desired=new_desired.fields,
            unknown_fields=policy.unknown_fields,
        )
    )
    status = summarize_status(changes)
    basis = build_diff_basis(
        old_desired=old_desired,
        live=live,
        new_desired=new_desired,
        declared_fields=policy.declared_fields,
        policy_managed_fields=policy.managed_fields,
        ignored_fields=policy.ignored_fields,
        unknown_fields=policy.unknown_fields,
        policy_source=policy.source,
    )
    basis.update(dry_run_meta)
    image_path = managed_image_path(rendered)
    return Diff(
        resource=new_desired.resource or resource_ref(rendered.kind, rendered.metadata.name),
        namespace=namespace,
        desired_image=str(new_desired.fields.get(image_path, rendered.spec.image)),
        actual_image=str(live.fields.get(image_path, actual_image)),
        risk=risk_for_diff(namespace, status),
        workspace_id=evt.workspace_id,
        repository_id=evt.repository_id,
        watch_target_id=evt.watch_target_id,
        binding_id=evt.binding_id,
        application_id=evt.application_id,
        workflow_run_id=evt.workflow_run_id,
        environment=evt.environment,
        cluster_id=evt.cluster_id,
        manifest_path=evt.manifest_path,
        resource_class=rendered.resource_class,
        desired_manifest=rendered.manifest,
        status=status,
        has_changes=has_actionable_changes(changes),
        changes=changes,
        basis=basis,
    )


def load_field_policy(rendered: RenderedManifest) -> FieldPolicy:
    declared_fields = sorted(
        set(
            rendered.declared_fields
            or extract_declared_field_paths(rendered_manifest_to_object(rendered))
        )
    )
    ignored_fields = sorted(set(rendered.ignored_fields))
    has_explicit_policy = bool(
        rendered.managed_fields or rendered.ignored_fields or rendered.last_approved_snapshot
    )
    if has_explicit_policy:
        managed_fields = sorted(set(rendered.managed_fields))
        source = "rendered_policy"
    else:
        # Demo fallback until manifest.rendered carries a persisted policy id/snapshot.
        managed_fields = declared_fields
        source = "demo_declared_fields"
    unknown_fields = sorted(set(declared_fields) - set(managed_fields) - set(ignored_fields))
    return FieldPolicy(
        declared_fields=declared_fields,
        managed_fields=managed_fields,
        ignored_fields=ignored_fields,
        unknown_fields=unknown_fields,
        last_approved_snapshot=dict(rendered.last_approved_snapshot),
        source=source,
    )


def load_new_desired_snapshot(
    rendered: RenderedManifest,
) -> tuple[ManagedFieldSnapshot, DryRunObjects | None, dict[str, object]]:
    if not env_enabled(ENABLE_SSA_DRY_RUN_ENV):
        return (
            snapshot_from_rendered_manifest(rendered),
            None,
            {"ssa_dry_run": "disabled"},
        )

    dry_run = load_dry_run_objects(
        rendered,
        field_manager=getenv(FIELD_MANAGER_ENV, DEFAULT_FIELD_MANAGER),
    )
    if dry_run.predicted is None:
        return (
            snapshot_from_rendered_manifest(rendered),
            dry_run,
            {"ssa_dry_run": "failed", "ssa_error": dry_run.error or "unknown"},
        )
    return (
        snapshot_from_kubernetes_object(dry_run.predicted, source="ssa_dry_run_predicted"),
        dry_run,
        {"ssa_dry_run": "ok"},
    )


def load_live_snapshot(
    rendered: RenderedManifest, dry_run: DryRunObjects | None, actual_image: str
) -> ManagedFieldSnapshot:
    if dry_run and dry_run.live is not None:
        return snapshot_from_kubernetes_object(dry_run.live, source="cluster_live")

    live = rendered_manifest_to_object(rendered)
    if rendered.kind == "Deployment" and rendered.spec.image:
        containers = (
            live.setdefault("spec", {})
            .setdefault("template", {})
            .setdefault("spec", {})
            .setdefault("containers", [])
        )
        if containers and isinstance(containers[0], dict):
            containers[0]["image"] = actual_image
    return snapshot_from_kubernetes_object(live, source="observed_actual_image")


def load_previous_desired_snapshot(
    live: ManagedFieldSnapshot, policy: FieldPolicy
) -> ManagedFieldSnapshot:
    if policy.last_approved_snapshot:
        return ManagedFieldSnapshot(
            resource=live.resource,
            namespace=live.namespace,
            fields=dict(policy.last_approved_snapshot),
            source="last_approved_snapshot",
        )

    # TODO(gitops): replace demo fallback with an approved managed-field snapshot from storage.
    return ManagedFieldSnapshot(
        resource=live.resource,
        namespace=live.namespace,
        fields=dict(live.fields),
        source="demo_previous_approved_fields",
    )


def managed_image_path(rendered: RenderedManifest) -> str:
    return f"spec.template.spec.containers[name={rendered.metadata.name}].image"


def env_enabled(name: str) -> bool:
    return getenv(name, "").lower() in {"1", "true", "yes", "on"}


def risk_for_diff(namespace: str, status: str) -> str:
    if namespace != Sandbox.NAMESPACE:
        return Sandbox.UNSAFE_NAMESPACE_RISK_TAG
    if status in {"review_required", "adoption_required"}:
        return REVIEW_REQUIRED_RISK
    return Sandbox.RISK_TAG


def has_actionable_changes(changes: list[dict[str, object]]) -> bool:
    return any(change.get("classification") != "already_converged" for change in changes)


@app.on(ManifestRenderedBody)
async def on_manifest_rendered(
    evt: ManifestRenderedBody, ctx: EventContext
) -> AsyncIterator[EventBody]:
    actual_image = (
        await load_actual_resource_image(evt, ctx)
        if evt.rendered_manifest.spec.image
        else RESOURCE_NOT_INSPECTED
    )
    diff = build_desired_diff(evt, actual_image)
    yield DiffDetectedBody(diff=diff)


if __name__ == "__main__":
    app.run()
