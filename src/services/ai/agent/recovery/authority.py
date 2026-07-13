"""DB read model을 교차 검증해 recovery용 GitOps 권위 context를 만든다."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from domains.gitops.source_patch import RAW_YAML, canonical_manifest_digest
from packages.contracts.gitops_authority import (
    GitOpsAuthorityContext,
    GitOpsAuthorityQuery,
    GitOpsAuthorityReadPort,
)

GITOPS_CHANGE_CONTEXT_EVIDENCE_KIND = "gitops_change_context"
RCA_EVIDENCE_KIND = "rca_bundle"
TRUSTED_SOURCE_ORIGINS = frozenset({"git_cache", "github_contents", "git_repo_path"})


class DatabaseGitOpsAuthorityReadPort(GitOpsAuthorityReadPort):
    """AsyncDb의 기존 read 메서드를 조합하며 새 저장 모델은 만들지 않는다."""

    def __init__(self, db: Any) -> None:
        self.db = db

    async def load_authority(
        self,
        query: GitOpsAuthorityQuery,
    ) -> GitOpsAuthorityContext | None:
        if self.db is None:
            return None
        gitops = await self.db.get_evidence_payload(
            query.workspace_id,
            query.correlation_id,
            GITOPS_CHANGE_CONTEXT_EVIDENCE_KIND,
        )
        if not isinstance(gitops, Mapping):
            return None
        identity = identity_from_evidence(gitops)
        if not identity_matches_query(identity, query):
            return None

        workflow_run_id = text(identity, "workflow_run_id")
        application_id = text(identity, "application_id")
        binding_id = text(identity, "binding_id")
        commit_sha = text(identity, "commit_sha")
        manifest_path = text(identity, "manifest_path")
        run = await self.db.get_workflow_run(workflow_run_id)
        diff = await self.db.get_workflow_step_details(workflow_run_id, "diff")
        application = await self.db.get_application(query.workspace_id, application_id)
        binding = await self.db.get_deployment_binding(query.workspace_id, binding_id)
        if not all(isinstance(value, Mapping) for value in (run, diff, application, binding)):
            return None
        run = dict(run)
        diff = dict(diff)
        application = dict(application)
        binding = dict(binding)
        basis = mapping(diff.get("basis"))
        desired = mapping(diff.get("desired_manifest"))
        resource = text(diff, "resource")
        artifact_digest = text(basis, "artifact_digest")
        provenance = await self.db.get_manifest_artifact_provenance(
            query.workspace_id,
            binding_id,
            commit_sha,
            manifest_path,
            resource,
            artifact_digest,
        )
        if not isinstance(provenance, Mapping):
            return None
        provenance = dict(provenance)
        evidence = await self.db.get_evidence_payload(
            query.workspace_id,
            query.correlation_id,
            RCA_EVIDENCE_KIND,
        )
        evidence = dict(evidence) if isinstance(evidence, Mapping) else {}
        if not authority_rows_match(
            query,
            identity,
            run,
            diff,
            application,
            binding,
            provenance,
            desired,
            artifact_digest,
        ):
            return None
        changes = diff.get("changes")
        if not isinstance(changes, list):
            return None
        return GitOpsAuthorityContext(
            workspace_id=query.workspace_id,
            repository_id=text(identity, "repository_id"),
            binding_id=binding_id,
            application_id=application_id,
            workflow_run_id=workflow_run_id,
            environment=text(identity, "environment"),
            cluster_id=query.cluster_id,
            manifest_path=manifest_path,
            repo_ref=text(identity, "repo_ref"),
            base_branch=text(identity, "branch"),
            commit_sha=commit_sha,
            source_type=text(provenance, "source_type"),
            source_manifest_sha256=text(provenance, "source_manifest_sha256"),
            resource=resource,
            desired_manifest=desired,
            changes=tuple(dict(item) for item in changes if isinstance(item, Mapping)),
            evidence=evidence,
        )


def identity_from_evidence(payload: Mapping[str, object]) -> dict[str, object]:
    return {
        key: payload.get(key)
        for key in (
            "workspace_id",
            "repository_id",
            "binding_id",
            "application_id",
            "workflow_run_id",
            "environment",
            "cluster_id",
            "commit_sha",
            "manifest_path",
            "repo_ref",
            "branch",
            "resource",
        )
    }


def identity_matches_query(
    identity: Mapping[str, object],
    query: GitOpsAuthorityQuery,
) -> bool:
    resource_kind, _, resource_name = text(identity, "resource").partition("/")
    return bool(
        text(identity, "workspace_id") == query.workspace_id
        and text(identity, "cluster_id") == query.cluster_id
        and resource_kind.casefold() == query.resource_kind.casefold()
        and resource_name == query.resource_name
        and all(
            text(identity, key)
            for key in (
                "repository_id",
                "binding_id",
                "application_id",
                "workflow_run_id",
                "environment",
                "commit_sha",
                "manifest_path",
                "repo_ref",
                "branch",
            )
        )
    )


def authority_rows_match(
    query: GitOpsAuthorityQuery,
    identity: Mapping[str, object],
    run: Mapping[str, object],
    diff: Mapping[str, object],
    application: Mapping[str, object],
    binding: Mapping[str, object],
    provenance: Mapping[str, object],
    desired: Mapping[str, object],
    artifact_digest: str,
) -> bool:
    exact = {
        "workspace_id": query.workspace_id,
        "repository_id": text(identity, "repository_id"),
        "binding_id": text(identity, "binding_id"),
        "application_id": text(identity, "application_id"),
        "workflow_run_id": text(identity, "workflow_run_id"),
        "environment": text(identity, "environment"),
        "commit_sha": text(identity, "commit_sha"),
        "manifest_path": text(identity, "manifest_path"),
    }
    run_exact = {key: value for key, value in exact.items() if key in run}
    diff_exact = {key: value for key, value in exact.items() if key in diff}
    provenance_exact = {
        key: value
        for key, value in exact.items()
        if key
        in {
            "workspace_id",
            "repository_id",
            "binding_id",
            "application_id",
            "workflow_run_id",
            "environment",
            "commit_sha",
            "manifest_path",
        }
    }
    source_count = provenance.get("source_document_count")
    artifact_count = provenance.get("artifact_count")
    return bool(
        desired.get("kind") == "Deployment"
        and canonical_manifest_digest(desired) == artifact_digest
        and mapping(diff.get("basis")).get("old_desired_source") == "last_approved_snapshot"
        and text(diff, "resource") == text(identity, "resource")
        and text(diff, "namespace") == query.namespace
        and all(text(run, key) == value for key, value in run_exact.items())
        and all(text(diff, key) == value for key, value in diff_exact.items())
        and text(application, "application_id") == exact["application_id"]
        and text(application, "workspace_id") == query.workspace_id
        and text(application, "repository_id") == exact["repository_id"]
        and text(application, "manifest_path") == exact["manifest_path"]
        and text(application, "repo_ref") == text(identity, "repo_ref")
        and text(application, "default_branch") == text(identity, "branch")
        and text(binding, "workspace_id") == query.workspace_id
        and text(binding, "binding_id") == exact["binding_id"]
        and text(binding, "repository_id") == exact["repository_id"]
        and text(binding, "cluster_id") == query.cluster_id
        and text(binding, "namespace") == query.namespace
        and text(binding, "manifest_path") == exact["manifest_path"]
        and text(binding, "environment") == exact["environment"]
        and text(binding, "status") == "active"
        and all(text(provenance, key) == value for key, value in provenance_exact.items())
        and text(provenance, "artifact_digest") == artifact_digest
        and text(provenance, "repo_ref") == text(identity, "repo_ref")
        and text(provenance, "branch") == text(identity, "branch")
        and text(provenance, "source_type") == RAW_YAML
        and text(provenance, "source_origin") in TRUSTED_SOURCE_ORIGINS
        and provenance.get("source_is_file") is True
        and type(source_count) is int
        and source_count == 1
        and type(artifact_count) is int
        and artifact_count == 1
        and text(provenance, "source_manifest_sha256").startswith("sha256:")
    )


def mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def text(value: Mapping[str, object], key: str) -> str:
    item = value.get(key)
    return item.strip() if isinstance(item, str) else ""
