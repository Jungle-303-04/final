"""auto-revert-worker — rollout.diagnosed -> guarded revert Safe PR request."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator, Mapping
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Protocol

import yaml

from domains.rca.events import RolloutDiagnosedBody
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from packages.config.constants import GitHub
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import JsonObject
from packages.runtime.app import App, EventContext

app = App("auto-revert-worker")

AUTO_REVERT_ENABLED_ENV = "RECOVERY_ENABLE_AUTO_REVERT_PR"
AUTO_REVERT_TITLE_PREFIX = "[auto-revert]"
AUTO_REVERT_PATCH_DESCRIPTION = "automated revert to the previous healthy image"
NEXT_OBSERVE = "observe"
TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
UNUSABLE_PREVIOUS_IMAGES = frozenset({"unknown", "resource-not-inspected"})
IMAGE_FIELD_PATTERN = re.compile(
    r"(?:containers|initContainers|ephemeralContainers)\[name=([^\]]+)]\.image$"
)


class AutoRevertStore(Protocol):
    async def get_workflow_identity_for_command(self, command_id: str) -> JsonObject | None: ...

    async def get_workflow_step_details(
        self, workflow_run_id: str, name: str
    ) -> JsonObject | None: ...

    async def get_application(
        self, workspace_id: str, application_id: str
    ) -> JsonObject | None: ...


@dataclass(frozen=True)
class RevertContext:
    resource: str
    current_image: str
    previous_image: str
    desired_manifest: JsonObject
    changes: list[dict[str, object]]
    workspace_id: str
    repository_id: str
    binding_id: str
    application_id: str
    workflow_run_id: str
    environment: str
    manifest_path: str
    repo_ref: str
    base_branch: str
    commit_sha: str


def auto_revert_enabled() -> bool:
    """Fail closed unless the opt-in flag has an explicit true value."""

    return env(AUTO_REVERT_ENABLED_ENV, "").strip().lower() in TRUE_VALUES


def mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def first_text(*values: object) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


async def load_revert_context(
    evt: RolloutDiagnosedBody,
    ctx: EventContext[AutoRevertStore],
) -> RevertContext | None:
    command_id = first_text(evt.details.get("command_id"))
    if not command_id or ctx.db is None:
        return None
    loaded_identity = await ctx.db.get_workflow_identity_for_command(command_id)
    if not isinstance(loaded_identity, Mapping):
        return None
    identity = dict(loaded_identity)
    identity_workspace_id = first_text(identity.get("workspace_id"))
    if not identity_workspace_id or identity_workspace_id != evt.workspace_id:
        return None
    workflow_run_id = first_text(identity.get("workflow_run_id"))
    if not workflow_run_id:
        return None
    loaded_diff = await ctx.db.get_workflow_step_details(workflow_run_id, "diff")
    if not isinstance(loaded_diff, Mapping):
        return None
    application_id = first_text(identity.get("application_id"))
    if not application_id:
        return None
    loaded_application = await ctx.db.get_application(identity_workspace_id, application_id)
    if not isinstance(loaded_application, Mapping):
        return None
    return revert_context_from(dict(loaded_diff), identity, dict(loaded_application), evt)


def revert_context_from(
    payload: Mapping[str, object],
    identity: Mapping[str, object],
    application: Mapping[str, object],
    evt: RolloutDiagnosedBody,
) -> RevertContext | None:
    basis = mapping(payload.get("basis"))
    image = mapping(payload.get("image"))
    gitops = mapping(payload.get("gitops"))
    desired_manifest = mapping(
        payload.get("desired_manifest") or payload.get("manifest") or payload.get("manifest_body")
    )
    current_image = first_text(
        payload.get("desired_image"), payload.get("current_image"), image.get("current")
    )
    previous_image = first_text(
        payload.get("actual_image"), payload.get("previous_image"), image.get("previous")
    )
    workspace_id = first_text(identity.get("workspace_id"))
    payload_workspace_id = first_text(payload.get("workspace_id"))
    application_id = first_text(identity.get("application_id"))
    binding_id = first_text(identity.get("binding_id"))
    workflow_run_id = first_text(identity.get("workflow_run_id"))
    commit_sha = first_text(identity.get("commit_sha"))
    repository_id = first_text(application.get("repository_id"))
    manifest_path = first_text(application.get("manifest_path"))
    repo_ref = first_text(application.get("repo_ref"))
    base_branch = first_text(application.get("default_branch"))
    application_workspace_id = first_text(application.get("workspace_id"))
    registered_application_id = first_text(application.get("application_id"))
    payload_repository_id = first_text(payload.get("repository_id"), gitops.get("repository_id"))
    payload_manifest_path = first_text(payload.get("manifest_path"), gitops.get("manifest_path"))
    payload_repo_ref = first_text(
        payload.get("repo_ref"), gitops.get("repository"), basis.get("repo_ref")
    )
    payload_base_branch = first_text(
        payload.get("base_branch"),
        payload.get("branch"),
        gitops.get("branch"),
        basis.get("branch"),
    )
    payload_application_id = first_text(payload.get("application_id"), gitops.get("application_id"))
    payload_binding_id = first_text(payload.get("binding_id"), gitops.get("binding_id"))
    payload_workflow_run_id = first_text(
        payload.get("workflow_run_id"), gitops.get("workflow_run_id")
    )
    payload_commit_sha = first_text(
        payload.get("commit_sha"), gitops.get("commit_sha"), basis.get("commit_sha")
    )
    if (
        not desired_manifest
        or not current_image
        or not previous_image
        or previous_image in UNUSABLE_PREVIOUS_IMAGES
        or current_image == previous_image
        or not manifest_path
        or workspace_id != evt.workspace_id
        or application_workspace_id != workspace_id
        or registered_application_id != application_id
        or (payload_workspace_id and payload_workspace_id != workspace_id)
        or (payload_repository_id and payload_repository_id != repository_id)
        or (payload_manifest_path and payload_manifest_path != manifest_path)
        or (payload_repo_ref and payload_repo_ref != repo_ref)
        or (payload_base_branch and payload_base_branch != base_branch)
        or (payload_application_id and payload_application_id != application_id)
        or (payload_binding_id and payload_binding_id != binding_id)
        or (payload_workflow_run_id and payload_workflow_run_id != workflow_run_id)
        or (payload_commit_sha and payload_commit_sha != commit_sha)
    ):
        return None

    raw_changes = payload.get("changes")
    changes = (
        [dict(item) for item in raw_changes if isinstance(item, Mapping)]
        if isinstance(raw_changes, list)
        else []
    )
    context = RevertContext(
        resource=first_text(payload.get("resource"), identity.get("application_id"), "deployment"),
        current_image=current_image,
        previous_image=previous_image,
        desired_manifest=desired_manifest,
        changes=changes,
        workspace_id=workspace_id,
        repository_id=repository_id,
        binding_id=binding_id,
        application_id=application_id,
        workflow_run_id=workflow_run_id,
        environment=first_text(
            payload.get("environment"), gitops.get("environment"), identity.get("environment")
        ),
        manifest_path=manifest_path,
        repo_ref=repo_ref,
        base_branch=base_branch,
        commit_sha=commit_sha,
    )
    required_pr_target = (
        context.repository_id,
        context.binding_id,
        context.application_id,
        context.workflow_run_id,
        context.manifest_path,
        context.repo_ref,
        context.base_branch,
        context.commit_sha,
    )
    return context if all(required_pr_target) else None


def image_revert_pairs(context: RevertContext) -> list[tuple[str, str, str]]:
    pairs: list[tuple[str, str, str]] = []
    for change in context.changes:
        field_path = first_text(change.get("field_path"))
        if not field_path.endswith(".image"):
            continue
        previous = first_text(change.get("before"), change.get("live"))
        current = first_text(change.get("after"), change.get("new_desired"), context.current_image)
        if not previous or not current or previous == current:
            continue
        match = IMAGE_FIELD_PATTERN.search(field_path)
        pairs.append((match.group(1) if match else "", current, previous))
    if not pairs:
        pairs.append(("", context.current_image, context.previous_image))
    return pairs


def replace_image(
    value: object,
    *,
    container_name: str,
    current_image: str,
    previous_image: str,
) -> int:
    replaced = 0
    if isinstance(value, dict):
        image_value = value.get("image")
        name_matches = not container_name or str(value.get("name") or "") == container_name
        if name_matches and image_value == current_image:
            value["image"] = previous_image
            replaced += 1
        for child in value.values():
            replaced += replace_image(
                child,
                container_name=container_name,
                current_image=current_image,
                previous_image=previous_image,
            )
    elif isinstance(value, list):
        for child in value:
            replaced += replace_image(
                child,
                container_name=container_name,
                current_image=current_image,
                previous_image=previous_image,
            )
    return replaced


def previous_image_manifest(context: RevertContext) -> JsonObject | None:
    manifest = deepcopy(context.desired_manifest)
    replaced = 0
    for container_name, current_image, previous_image in image_revert_pairs(context):
        replaced += replace_image(
            manifest,
            container_name=container_name,
            current_image=current_image,
            previous_image=previous_image,
        )
    return manifest if replaced else None


def safe_pr_request(
    evt: RolloutDiagnosedBody,
    context: RevertContext,
    manifest: JsonObject,
) -> SafePrRequestedBody:
    resource_name = context.resource.rsplit("/", 1)[-1] or "deployment"
    command_id = first_text(evt.details.get("command_id"))
    body = (
        "Rollout verification failed; this PR restores the previous healthy image.\n\n"
        "## Diagnosis\n\n"
        f"- diagnosis: {evt.diagnosis}\n"
        f"- next_action: {evt.next_action}\n"
        f"- command_id: {command_id}\n"
        f"- failed_image: `{context.current_image}`\n"
        f"- previous_healthy_image: `{context.previous_image}`\n"
    )
    return SafePrRequestedBody(
        title=f"{AUTO_REVERT_TITLE_PREFIX} {resource_name} rollout recovery",
        body=body,
        provider=GitHub.PROVIDER,
        patches=[
            SafePrFilePatch(
                path=context.manifest_path,
                content=yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True),
                description=AUTO_REVERT_PATCH_DESCRIPTION,
            )
        ],
        workspace_id=context.workspace_id,
        repository_id=context.repository_id,
        binding_id=context.binding_id,
        application_id=context.application_id,
        workflow_run_id=context.workflow_run_id,
        environment=context.environment,
        manifest_path=context.manifest_path,
        repo_ref=context.repo_ref,
        base_branch=context.base_branch,
        commit_sha=context.commit_sha,
    )


@app.on(RolloutDiagnosedBody)
async def on_rollout_diagnosed(
    evt: RolloutDiagnosedBody,
    ctx: EventContext[AutoRevertStore],
) -> AsyncIterator[EventBody]:
    if not auto_revert_enabled() or evt.next_action == NEXT_OBSERVE:
        return
    context = await load_revert_context(evt, ctx)
    if context is None:
        return
    manifest = previous_image_manifest(context)
    if manifest is None:
        return
    yield safe_pr_request(evt, context, manifest)


if __name__ == "__main__":
    app.run()
