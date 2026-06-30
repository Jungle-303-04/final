"""gitops 도메인 repository(SQL)."""

from __future__ import annotations

import hashlib

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.gitops.models import (
    DeploymentBinding,
    GitRepository,
    GitWatchTarget,
    ManifestArtifact,
    RepoChange,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPO_REF,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
    DeploymentBindingStatus,
    GitProvider,
    ManifestArtifactStatus,
    RepositoryStatus,
    ResourceClass,
    WatchTargetStatus,
)
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    AccessRole,
)
from packages.storage.engine import DatabaseConnection


class RepoChangeRepository(DatabaseConnection):
    def register_repository(self, payload: JsonObject) -> JsonObject:
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        repository_id = str(payload.get("repository_id", DEFAULT_REPOSITORY_ID))
        user_id = payload.get("user_id")
        table = GitRepository.__table__
        insert = pg_insert(table).values(
            repository_id=repository_id,
            workspace_id=workspace_id,
            provider=str(payload.get("provider", GitProvider.GITHUB.value)),
            repo_ref=str(payload.get("repo_ref", DEFAULT_REPO_REF)),
            default_branch=str(payload.get("default_branch", DEFAULT_REPO_BRANCH)),
            credential_ref=payload.get("credential_ref"),
            status=str(payload.get("status", RepositoryStatus.ACTIVE.value)),
            access_policy=dict(payload.get("access_policy", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.repository_id],
            set_={
                "provider": insert.excluded.provider,
                "repo_ref": insert.excluded.repo_ref,
                "default_branch": insert.excluded.default_branch,
                "credential_ref": insert.excluded.credential_ref,
                "status": insert.excluded.status,
                "access_policy": insert.excluded.access_policy,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)
        self._grant_owner_if_present(
            workspace_id, user_id, AccessResourceType.REPOSITORY.value, repository_id
        )
        return {**payload, "workspace_id": workspace_id, "repository_id": repository_id}

    def register_watch_target(self, payload: JsonObject) -> JsonObject:
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        watch_target_id = str(payload.get("watch_target_id", DEFAULT_WATCH_TARGET_ID))
        table = GitWatchTarget.__table__
        insert = pg_insert(table).values(
            watch_target_id=watch_target_id,
            workspace_id=workspace_id,
            repository_id=str(payload.get("repository_id", DEFAULT_REPOSITORY_ID)),
            branch=str(payload.get("branch", DEFAULT_REPO_BRANCH)),
            manifest_path=str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            interval_seconds=int(payload.get("interval_seconds", 30)),
            last_seen_commit_sha=payload.get("last_seen_commit_sha"),
            last_polled_at=payload.get("last_polled_at"),
            status=str(payload.get("status", WatchTargetStatus.ACTIVE.value)),
            settings=dict(payload.get("settings", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.watch_target_id],
            set_={
                "branch": insert.excluded.branch,
                "manifest_path": insert.excluded.manifest_path,
                "interval_seconds": insert.excluded.interval_seconds,
                "last_seen_commit_sha": insert.excluded.last_seen_commit_sha,
                "last_polled_at": insert.excluded.last_polled_at,
                "status": insert.excluded.status,
                "settings": insert.excluded.settings,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)
        return {**payload, "workspace_id": workspace_id, "watch_target_id": watch_target_id}

    def register_deployment_binding(self, payload: JsonObject) -> JsonObject:
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        binding_id = str(payload.get("binding_id", DEFAULT_DEPLOYMENT_BINDING_ID))
        user_id = payload.get("user_id")
        table = DeploymentBinding.__table__
        insert = pg_insert(table).values(
            binding_id=binding_id,
            workspace_id=workspace_id,
            repository_id=str(payload.get("repository_id", DEFAULT_REPOSITORY_ID)),
            watch_target_id=payload.get("watch_target_id", DEFAULT_WATCH_TARGET_ID),
            cluster_id=str(payload["cluster_id"]),
            namespace=str(payload["namespace"]),
            app_name=str(payload["app_name"]),
            manifest_path=str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            environment=str(payload.get("environment", "sandbox")),
            resource_class=str(payload.get("resource_class", ResourceClass.APPLICATION.value)),
            status=str(payload.get("status", DeploymentBindingStatus.ACTIVE.value)),
            deploy_policy=dict(payload.get("deploy_policy", {})),
            access_policy=dict(payload.get("access_policy", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.binding_id],
            set_={
                "watch_target_id": insert.excluded.watch_target_id,
                "cluster_id": insert.excluded.cluster_id,
                "namespace": insert.excluded.namespace,
                "app_name": insert.excluded.app_name,
                "manifest_path": insert.excluded.manifest_path,
                "environment": insert.excluded.environment,
                "resource_class": insert.excluded.resource_class,
                "status": insert.excluded.status,
                "deploy_policy": insert.excluded.deploy_policy,
                "access_policy": insert.excluded.access_policy,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)
        self._grant_owner_if_present(
            workspace_id, user_id, AccessResourceType.DEPLOYMENT_BINDING.value, binding_id
        )
        return {**payload, "workspace_id": workspace_id, "binding_id": binding_id}

    def save_repo_change(
        self,
        correlation_id: str,
        commit_sha: str,
        manifest: JsonObject,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
        repository_id: str | None = None,
        watch_target_id: str | None = None,
        binding_id: str | None = None,
        manifest_path: str | None = None,
    ) -> None:
        table = RepoChange.__table__
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            commit_sha=commit_sha,
            repository_id=repository_id,
            watch_target_id=watch_target_id,
            binding_id=binding_id,
            manifest_path=manifest_path,
            manifest=manifest,
        )
        with self.connection() as conn:
            conn.execute(statement)

    def record_manifest_artifact(self, payload: JsonObject) -> JsonObject:
        artifact_id = str(payload.get("artifact_id") or manifest_artifact_id(payload))
        table = ManifestArtifact.__table__
        insert = pg_insert(table).values(
            artifact_id=artifact_id,
            workspace_id=str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            repository_id=str(payload.get("repository_id", DEFAULT_REPOSITORY_ID)),
            watch_target_id=payload.get("watch_target_id"),
            binding_id=str(payload.get("binding_id", DEFAULT_DEPLOYMENT_BINDING_ID)),
            commit_sha=str(payload["commit_sha"]),
            manifest_path=str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            status=str(payload.get("status", ManifestArtifactStatus.RENDERED.value)),
            status_reason=payload.get("status_reason"),
            rendered_manifest=payload.get("rendered_manifest"),
            source_summary=dict(payload.get("source_summary", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.binding_id, table.c.commit_sha, table.c.manifest_path],
            set_={
                "status": insert.excluded.status,
                "status_reason": insert.excluded.status_reason,
                "rendered_manifest": insert.excluded.rendered_manifest,
                "source_summary": insert.excluded.source_summary,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)
        return {**payload, "artifact_id": artifact_id}

    def mark_watch_observed(
        self, watch_target_id: str, commit_sha: str, workspace_id: str = DEFAULT_WORKSPACE_ID
    ) -> None:
        table = GitWatchTarget.__table__
        statement = (
            table.update()
            .where(table.c.watch_target_id == watch_target_id, table.c.workspace_id == workspace_id)
            .values(
                last_seen_commit_sha=commit_sha, last_polled_at=func.now(), updated_at=func.now()
            )
        )
        with self.connection() as conn:
            conn.execute(statement)

    def _grant_owner_if_present(
        self,
        workspace_id: str,
        user_id: object,
        resource_type: str,
        resource_id: str,
    ) -> None:
        if not user_id:
            return
        grant = getattr(self, "grant_resource_access", None)
        if callable(grant):
            grant(
                {
                    "workspace_id": workspace_id,
                    "subject_id": str(user_id),
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "role": AccessRole.OWNER.value,
                }
            )


def manifest_artifact_id(payload: JsonObject) -> str:
    raw = "|".join(
        [
            str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            str(payload.get("binding_id", DEFAULT_DEPLOYMENT_BINDING_ID)),
            str(payload["commit_sha"]),
            str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
        ]
    )
    return f"manifest-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"
