"""evidence-worker — cluster.evidence.received -> evidence.built."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime

from domains.gitops.events import GitOpsChangeContextDetectedBody
from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    compact_evidence_built_body,
)
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.pipeline import EvidencePipeline
from services.ai.agent.workload_target import WorkloadTarget, resolve_workload_target

app = App("evidence-worker")
pipeline = EvidencePipeline()
GITOPS_CHANGE_CONTEXT_EVIDENCE_KIND = "gitops_change_context"
RECENT_CHANGE_LIMIT = 5


@app.on(ClusterEvidenceReceivedBody)
async def on_cluster_evidence(
    evt: ClusterEvidenceReceivedBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    evt = await hydrate_evidence(evt, ctx)
    evt = await attach_gitops_change_context(evt, ctx)
    evidence = pipeline.build_evidence(evt, ctx.correlation_id)
    await ctx.db.save_evidence(
        ctx.correlation_id,
        evidence.workspace_id,
        pipeline.kind,
        evidence.to_body(),
    )
    yield compact_evidence_built_body(evidence, ctx.correlation_id, pipeline.kind)


@app.on(GitOpsChangeContextDetectedBody)
async def on_gitops_change_context(
    evt: GitOpsChangeContextDetectedBody,
    ctx: EventContext[RcaStore],
) -> None:
    await ctx.db.save_evidence(
        ctx.correlation_id,
        evt.workspace_id,
        GITOPS_CHANGE_CONTEXT_EVIDENCE_KIND,
        evt.to_body(),
    )


async def hydrate_evidence(
    evt: ClusterEvidenceReceivedBody,
    ctx: EventContext[RcaStore],
) -> ClusterEvidenceReceivedBody:
    """reference 이벤트면 evidence_windows.payload의 원문으로 복원한다."""
    if has_inline_evidence(evt) or not evt.evidence_key:
        return evt
    payload = await ctx.db.get_evidence_window_payload(evt.evidence_key)
    if not isinstance(payload, dict):
        return evt
    return ClusterEvidenceReceivedBody.from_body(payload)  # type: ignore[return-value]


def has_inline_evidence(evt: ClusterEvidenceReceivedBody) -> bool:
    return bool(evt.kubernetes or evt.metrics or evt.logs or evt.traces)


async def attach_gitops_change_context(
    evt: ClusterEvidenceReceivedBody,
    ctx: EventContext[RcaStore],
) -> ClusterEvidenceReceivedBody:
    resource = evidence_resource(evt.kubernetes)
    target = resolve_workload_target(
        resource.get("namespace"),
        resource.get("kind"),
        resource.get("name"),
        evt.metadata,
    )
    changed_before = evt.window_start or ctx.created_at or datetime.now(UTC).isoformat()
    if not all(
        [
            evt.workspace_id,
            evt.cluster_id,
            target.namespace,
            target.resource_kind,
            target.resource_name,
            changed_before,
        ]
    ):
        return evt
    changes = await ctx.db.list_recent_workload_changes_for_evidence(
        evt.workspace_id,
        evt.cluster_id,
        target.namespace,
        target.resource_kind,
        target.resource_name,
        changed_before,
        limit=RECENT_CHANGE_LIMIT,
    )
    if not changes:
        return evt
    metadata = merge_gitops_change_context(evt.metadata, changes, target=target)
    return replace(evt, metadata=metadata)


def evidence_resource(kubernetes: JsonObject) -> JsonObject:
    resource = kubernetes.get("resource")
    if not isinstance(resource, dict):
        return {}
    return {
        key: str(value).strip()
        for key, value in resource.items()
        if key in {"kind", "name", "namespace"} and str(value).strip()
    }


def merge_gitops_change_context(
    metadata: JsonObject,
    changes: list[JsonObject],
    *,
    target: WorkloadTarget | None = None,
) -> JsonObject:
    merged = dict(metadata)
    change_context = (
        dict(merged.get("change_context")) if isinstance(merged.get("change_context"), dict) else {}
    )
    existing_changes = change_context.get("recent_changes")
    recent_changes = list(existing_changes) if isinstance(existing_changes, list) else []
    recent_changes.extend(recent_change_payload(change) for change in changes)
    change_context["recent_changes"] = recent_changes
    latest = changes[0]
    # GitOps identity와 target lineage는 agent 입력이 아니라 서버의 exact
    # workload-change 조회 결과만 권위로 사용한다.
    change_context["gitops"] = gitops_context_payload(latest)
    for key in ("gitops_target", "original_target", "gitops_target_resolution"):
        change_context.pop(key, None)
    if target is not None:
        change_context.update(target.resolution_metadata())
    image_context = image_context_payload(latest)
    if image_context:
        change_context.setdefault("image", image_context)
    merged["change_context"] = change_context
    return merged


def recent_change_payload(change: JsonObject) -> JsonObject:
    image_before = optional_text(change.get("image_before"))
    image_after = optional_text(change.get("image_after"))
    payload: JsonObject = {
        "change_type": "image" if image_before or image_after else "manifest",
        "changed_at": timestamp_text(change.get("changed_at")),
        "target_resource": (f"{change.get('resource_kind')}/{change.get('resource_name')}"),
        "field": "image" if image_before or image_after else "manifest",
        "source": "gitops",
        "repository_id": optional_text(change.get("repository_id")),
        "repo_ref": optional_text(change.get("repo_ref")),
        "manifest_path": optional_text(change.get("manifest_path")),
        "commit_sha": optional_text(change.get("commit_sha")),
        "workflow_run_id": optional_text(change.get("workflow_run_id")),
        "pr_url": optional_text(change.get("pr_url")),
    }
    if image_before:
        payload["before"] = image_before
    if image_after:
        payload["after"] = image_after
    return {key: value for key, value in payload.items() if value not in (None, "", [], {})}


def gitops_context_payload(change: JsonObject) -> JsonObject:
    payload: JsonObject = {
        "workspace_id": optional_text(change.get("workspace_id")),
        "cluster_id": optional_text(change.get("cluster_id")),
        "namespace": optional_text(change.get("namespace")),
        "resource_kind": optional_text(change.get("resource_kind")),
        "resource_name": optional_text(change.get("resource_name")),
        "repository_id": optional_text(change.get("repository_id")),
        "binding_id": optional_text(change.get("binding_id")),
        "repo_ref": optional_text(change.get("repo_ref")),
        "manifest_path": optional_text(change.get("manifest_path")),
        "commit_sha": optional_text(change.get("commit_sha")),
        "workflow_run_id": optional_text(change.get("workflow_run_id")),
        "pr_url": optional_text(change.get("pr_url")),
    }
    return {key: value for key, value in payload.items() if value not in (None, "", [], {})}


def image_context_payload(change: JsonObject) -> JsonObject:
    previous = optional_text(change.get("image_before"))
    current = optional_text(change.get("image_after"))
    if not previous and not current:
        return {}
    return {
        key: value
        for key, value in {
            "previous": previous,
            "current": current,
            "changed": previous != current,
        }.items()
        if value not in (None, "", [], {})
    }


def optional_text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def timestamp_text(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return optional_text(value)


if __name__ == "__main__":
    app.run()
