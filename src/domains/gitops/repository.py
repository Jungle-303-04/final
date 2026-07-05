"""gitops 도메인 repository(SQL)."""

from __future__ import annotations

import hashlib
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.command.models import AgentCommand
from domains.gitops.models import (
    Application,
    Approval,
    DeploymentBinding,
    GitRepository,
    GitWatchTarget,
    ManifestArtifact,
    RepoChange,
    WorkflowRun,
    WorkflowRunStep,
)
from packages.config.constants import Target
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPO_REF,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
    DEFAULT_WORKFLOW_RUN_ID,
    ApplicationStatus,
    ApprovalStatus,
    DeploymentBindingStatus,
    GitProvider,
    ManifestArtifactStatus,
    RepositoryStatus,
    ResourceClass,
    WatchTargetStatus,
    WorkflowRunStatus,
    WorkflowStepName,
    WorkflowStepStatus,
)
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    ResourceRole,
)
from packages.storage.engine import DatabaseConnection, iso_or_none, row_dict

# 원자 해결 대상으로 열림으로 간주하는 승인 상태 — 라우터의 open 판정과 동일해야 함
OPEN_APPROVAL_STATUSES = (
    ApprovalStatus.REQUESTED.value,
    ApprovalStatus.NOT_REQUIRED.value,
)

# 워크플로 상태 전이 순위 — 숫자가 클수록 뒤 단계. 같은 순위 재기록은 허용(멱등 재갱신).
# 재배달·지연 이벤트가 뒤 단계 상태를 앞 단계로 되돌리는 회귀(SUCCEEDED→APPLYING 등) 차단 기준.
WORKFLOW_STATUS_RANKS: dict[str, int] = {
    WorkflowRunStatus.STARTED.value: 1,
    WorkflowRunStatus.RENDERING.value: 2,
    WorkflowRunStatus.DIFFING.value: 3,
    WorkflowRunStatus.POLICY_CHECKING.value: 4,
    WorkflowRunStatus.WAITING_FOR_APPROVAL.value: 5,
    WorkflowRunStatus.APPLYING.value: 6,
    WorkflowRunStatus.ROLLOUT_WAITING.value: 7,
    WorkflowRunStatus.SUCCEEDED.value: 8,
    WorkflowRunStatus.FAILED.value: 8,  # 실패는 어느 단계에서도 도달 가능 → 최고 순위
}
# 종결 상태 — 어떤 상태로도 다시 갱신되지 않음(회귀 불가)
TERMINAL_WORKFLOW_STATUSES = (
    WorkflowRunStatus.SUCCEEDED.value,
    WorkflowRunStatus.FAILED.value,
)


def workflow_status_rank(column: Any) -> Any:
    """상태 컬럼을 전이 순위로 바꾸는 CASE 식 — guarded UPDATE 의 비교 기준."""
    return case(
        *[(column == status, rank) for status, rank in WORKFLOW_STATUS_RANKS.items()],
        else_=0,
    )


def workflow_transition_guard(table: Any, new_status: Any) -> Any:
    """허용 전이 조건: 현재가 종결이 아니고 새 상태 순위가 현재 순위 이상임.

    new_status 는 문자열(guarded UPDATE) 또는 excluded 컬럼(upsert) 모두 가능.
    """
    new_rank = (
        WORKFLOW_STATUS_RANKS.get(str(new_status), 0)
        if isinstance(new_status, str)
        else workflow_status_rank(new_status)
    )
    return and_(
        table.c.status.not_in(TERMINAL_WORKFLOW_STATUSES),
        workflow_status_rank(table.c.status) <= new_rank,
    )


class RepoChangeRepository(DatabaseConnection):
    def register_repository(self, payload: JsonObject) -> JsonObject:
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        repository_id = derive_repository_id(payload)
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
        repository_id = derive_repository_id(payload)
        watch_target_id = derive_watch_target_id({**payload, "repository_id": repository_id})
        table = GitWatchTarget.__table__
        insert = pg_insert(table).values(
            watch_target_id=watch_target_id,
            workspace_id=workspace_id,
            repository_id=repository_id,
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
        return {
            **payload,
            "workspace_id": workspace_id,
            "repository_id": repository_id,
            "watch_target_id": watch_target_id,
        }

    def register_deployment_binding(self, payload: JsonObject) -> JsonObject:
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        repository_id = derive_repository_id(payload)
        watch_target_id = derive_watch_target_id({**payload, "repository_id": repository_id})
        binding_id = derive_deployment_binding_id(
            {**payload, "repository_id": repository_id, "watch_target_id": watch_target_id}
        )
        user_id = payload.get("user_id")
        table = DeploymentBinding.__table__
        insert = pg_insert(table).values(
            binding_id=binding_id,
            workspace_id=workspace_id,
            repository_id=repository_id,
            watch_target_id=watch_target_id,
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
        return {
            **payload,
            "workspace_id": workspace_id,
            "repository_id": repository_id,
            "watch_target_id": watch_target_id,
            "binding_id": binding_id,
        }

    def upsert_application(self, payload: JsonObject) -> JsonObject:
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        repository_id = derive_repository_id(payload)
        application_id = derive_application_id(payload)
        name = derive_application_name(payload) or DEFAULT_APPLICATION_ID
        table = Application.__table__
        existing_application_id_statement = (
            select(table.c.application_id)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.repository_id == repository_id,
                table.c.name == name,
            )
            .limit(1)
        )
        update_values = {
            "repository_id": repository_id,
            "name": name,
            "manifest_path": str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            "status": str(payload.get("status", ApplicationStatus.ACTIVE.value)),
            "metadata": dict(payload.get("metadata", {})),
            "updated_at": func.now(),
        }
        insert = pg_insert(table).values(
            application_id=application_id,
            workspace_id=workspace_id,
            repository_id=repository_id,
            name=name,
            manifest_path=str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            status=str(payload.get("status", ApplicationStatus.ACTIVE.value)),
            metadata=dict(payload.get("metadata", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.application_id],
            set_={
                "repository_id": insert.excluded.repository_id,
                "name": insert.excluded.name,
                "manifest_path": insert.excluded.manifest_path,
                "status": insert.excluded.status,
                "metadata": insert.excluded.metadata,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            existing_application_id = conn.execute(
                existing_application_id_statement
            ).scalar_one_or_none()
            if existing_application_id and str(existing_application_id) != application_id:
                resolved_application_id = str(existing_application_id)
                conn.execute(
                    table.update()
                    .where(table.c.application_id == resolved_application_id)
                    .values(**update_values)
                )
            else:
                conn.execute(statement)
                resolved_application_id = application_id
        self._grant_owner_if_present(
            workspace_id,
            payload.get("user_id"),
            AccessResourceType.APPLICATION.value,
            resolved_application_id,
        )
        return {**payload, "workspace_id": workspace_id, "application_id": resolved_application_id}

    def list_applications(
        self,
        workspace_id: str,
        *,
        application_ids: set[str] | None = None,
        limit: int = 100,
    ) -> list[JsonObject]:
        if application_ids is not None and not application_ids:
            return []
        table = Application.__table__
        statement = (
            select(
                table.c.application_id,
                table.c.workspace_id,
                table.c.repository_id,
                table.c.name,
                table.c.manifest_path,
                table.c.status,
                table.c.metadata,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.name, table.c.application_id)
            .limit(max(1, min(limit, 500)))
        )
        if application_ids is not None:
            statement = statement.where(table.c.application_id.in_(application_ids))
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_application(row) for row in rows]

    def get_application(self, workspace_id: str, application_id: str) -> JsonObject | None:
        table = Application.__table__
        statement = (
            select(
                table.c.application_id,
                table.c.workspace_id,
                table.c.repository_id,
                table.c.name,
                table.c.manifest_path,
                table.c.status,
                table.c.metadata,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(table.c.workspace_id == workspace_id, table.c.application_id == application_id)
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_application(row) if row else None

    def list_application_deployment_bindings(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int = 100,
    ) -> list[JsonObject]:
        application = self.get_application(workspace_id, application_id)
        if application is None:
            return []
        table = DeploymentBinding.__table__
        statement = (
            select(
                table.c.binding_id,
                table.c.workspace_id,
                table.c.repository_id,
                table.c.watch_target_id,
                table.c.cluster_id,
                table.c.namespace,
                table.c.app_name,
                table.c.manifest_path,
                table.c.environment,
                table.c.resource_class,
                table.c.status,
                table.c.deploy_policy,
                table.c.access_policy,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.repository_id == application["repository_id"],
                table.c.app_name == application["name"],
            )
            .order_by(table.c.environment, table.c.cluster_id, table.c.namespace)
            .limit(max(1, min(limit, 500)))
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_deployment_binding(row) for row in rows]

    def list_application_workflow_runs(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int = 100,
    ) -> list[JsonObject]:
        table = WorkflowRun.__table__
        statement = (
            select(
                table.c.workflow_run_id,
                table.c.workspace_id,
                table.c.application_id,
                table.c.binding_id,
                table.c.environment,
                table.c.cluster_id,
                table.c.commit_sha,
                table.c.status,
                table.c.current_step,
                table.c.summary,
                table.c.command_id,
                table.c.metadata,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(table.c.workspace_id == workspace_id, table.c.application_id == application_id)
            .order_by(table.c.created_at.desc())
            .limit(max(1, min(limit, 500)))
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_workflow_run(row) for row in rows]

    def start_workflow_run(self, payload: JsonObject) -> JsonObject:
        workflow_run_id = derive_workflow_run_id(payload)
        workspace_id = str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID))
        application_id = derive_application_id(payload)
        binding_id = derive_deployment_binding_id(payload)
        table = WorkflowRun.__table__
        insert = pg_insert(table).values(
            workflow_run_id=workflow_run_id,
            workspace_id=workspace_id,
            application_id=application_id,
            binding_id=binding_id,
            environment=str(payload.get("environment", DEFAULT_ENVIRONMENT)),
            cluster_id=str(payload.get("cluster_id", "")),
            commit_sha=str(payload.get("commit_sha", "")),
            status=str(payload.get("status", WorkflowRunStatus.STARTED.value)),
            current_step=str(payload.get("current_step", WorkflowStepName.GIT.value)),
            summary=payload.get("summary"),
            command_id=payload.get("command_id"),
            metadata=dict(payload.get("metadata", {})),
            updated_at=func.now(),
        )
        # 생성은 무조건, 기존 행 갱신은 허용 전이일 때만(종결 회귀·역행 차단)
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.workflow_run_id],
            set_={
                "status": insert.excluded.status,
                "current_step": insert.excluded.current_step,
                "summary": insert.excluded.summary,
                "command_id": insert.excluded.command_id,
                "metadata": insert.excluded.metadata,
                "updated_at": func.now(),
            },
            where=workflow_transition_guard(table, insert.excluded.status),
        )
        with self.connection() as conn:
            conn.execute(statement)
        return {
            **payload,
            "workspace_id": workspace_id,
            "application_id": application_id,
            "binding_id": binding_id,
            "workflow_run_id": workflow_run_id,
        }

    def update_workflow_run(self, payload: JsonObject) -> JsonObject:
        workflow_run_id = derive_workflow_run_id(payload)
        values: JsonObject = {"updated_at": func.now()}
        for key in ("status", "current_step", "summary", "command_id"):
            if key in payload:
                values[key] = payload[key]
        if "metadata" in payload:
            values["metadata"] = dict(payload["metadata"])
        table = WorkflowRun.__table__
        statement = table.update().where(table.c.workflow_run_id == workflow_run_id)
        if "status" in values:
            # 상태 변경은 허용 전이일 때만 반영 — 재배달 이벤트의 상태 회귀 차단
            statement = statement.where(workflow_transition_guard(table, str(values["status"])))
        statement = statement.values(**values)
        with self.connection() as conn:
            conn.execute(statement)
        return {**payload, "workflow_run_id": workflow_run_id}

    def record_workflow_step(self, payload: JsonObject) -> JsonObject:
        workflow_run_id = derive_workflow_run_id(payload)
        step_name = str(payload.get("name") or payload.get("step") or WorkflowStepName.GIT.value)
        step_id = str(payload.get("step_id") or derive_workflow_step_id(workflow_run_id, step_name))
        table = WorkflowRunStep.__table__
        insert = pg_insert(table).values(
            step_id=step_id,
            workflow_run_id=workflow_run_id,
            workspace_id=str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            application_id=derive_application_id(payload),
            binding_id=derive_deployment_binding_id(payload),
            environment=str(payload.get("environment", DEFAULT_ENVIRONMENT)),
            name=step_name,
            status=str(payload.get("status", WorkflowStepStatus.SUCCEEDED.value)),
            message=payload.get("message"),
            details=dict(payload.get("details", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.workflow_run_id, table.c.name],
            set_={
                "status": insert.excluded.status,
                "message": insert.excluded.message,
                "details": insert.excluded.details,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)
        return {
            **payload,
            "workflow_run_id": workflow_run_id,
            "step_id": step_id,
            "name": step_name,
        }

    def request_workflow_approval(self, payload: JsonObject) -> JsonObject:
        workflow_run_id = derive_workflow_run_id(payload)
        approval_id = str(payload.get("approval_id") or derive_approval_id(workflow_run_id))
        table = Approval.__table__
        insert = pg_insert(table).values(
            approval_id=approval_id,
            workflow_run_id=workflow_run_id,
            workspace_id=str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            application_id=derive_application_id(payload),
            binding_id=derive_deployment_binding_id(payload),
            environment=str(payload.get("environment", DEFAULT_ENVIRONMENT)),
            status=str(payload.get("status", ApprovalStatus.REQUESTED.value)),
            reason=str(payload.get("reason", "")),
            requested_role=str(payload.get("requested_role", ResourceRole.RELEASE_OPERATOR.value)),
            requested_by=payload.get("requested_by"),
            decided_by=payload.get("decided_by"),
            decision=payload.get("decision"),
            details=dict(payload.get("details", {})),
            expires_at=payload.get("expires_at"),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.approval_id],
            set_={
                "status": insert.excluded.status,
                "reason": insert.excluded.reason,
                "requested_role": insert.excluded.requested_role,
                "requested_by": insert.excluded.requested_by,
                "decided_by": insert.excluded.decided_by,
                "decision": insert.excluded.decision,
                "details": insert.excluded.details,
                "expires_at": insert.excluded.expires_at,
                "updated_at": func.now(),
            },
            where=table.c.status.in_(OPEN_APPROVAL_STATUSES),
        )
        with self.connection() as conn:
            conn.execute(statement)
        return {**payload, "workflow_run_id": workflow_run_id, "approval_id": approval_id}

    def resolve_workflow_approval_if_open(
        self,
        approval_id: str,
        workspace_id: str,
        status: str,
        decided_by: str | None,
        decision: str | None,
        details: JsonObject,
    ) -> bool:
        """열린 승인만 원자적으로 해결함 — 동시 grant/reject 중 첫 요청만 성공.

        검사(open 여부)와 갱신이 한 UPDATE 라 read-then-write 경합이 없음.
        False 반환 = 이미 해결됨(호출자는 409 로 응답).
        """
        table = Approval.__table__
        statement = (
            table.update()
            .where(
                table.c.approval_id == approval_id,
                table.c.workspace_id == workspace_id,
                table.c.status.in_(OPEN_APPROVAL_STATUSES),
            )
            .values(
                status=status,
                decided_by=decided_by,
                decision=decision,
                details=dict(details),
                updated_at=func.now(),
            )
            .returning(table.c.approval_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).first()
        return row is not None

    def resolve_workflow_approval(self, payload: JsonObject) -> JsonObject:
        workflow_run_id = derive_workflow_run_id(payload)
        approval_id = str(payload.get("approval_id") or derive_approval_id(workflow_run_id))
        table = Approval.__table__
        statement = (
            table.update()
            .where(table.c.approval_id == approval_id)
            .values(
                status=str(payload.get("status", ApprovalStatus.GRANTED.value)),
                decided_by=payload.get("decided_by"),
                decision=payload.get("decision"),
                details=dict(payload.get("details", {})),
                updated_at=func.now(),
            )
        )
        with self.connection() as conn:
            conn.execute(statement)
        return {**payload, "workflow_run_id": workflow_run_id, "approval_id": approval_id}

    def get_workflow_approval(
        self, approval_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID
    ) -> JsonObject | None:
        table = Approval.__table__
        statement = (
            select(
                table.c.approval_id,
                table.c.workflow_run_id,
                table.c.workspace_id,
                table.c.application_id,
                table.c.binding_id,
                table.c.environment,
                table.c.status,
                table.c.reason,
                table.c.requested_role,
                table.c.details,
            )
            .where(table.c.approval_id == approval_id, table.c.workspace_id == workspace_id)
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def attach_workflow_command(self, workflow_run_id: str, command_id: str) -> None:
        table = WorkflowRun.__table__
        statement = (
            table.update()
            .where(table.c.workflow_run_id == workflow_run_id)
            .values(command_id=command_id, updated_at=func.now())
        )
        with self.connection() as conn:
            conn.execute(statement)

    def update_workflow_run_for_command(self, payload: JsonObject) -> JsonObject:
        command_id = str(payload["command_id"])
        values: JsonObject = {"updated_at": func.now()}
        for key in ("status", "current_step", "summary"):
            if key in payload:
                values[key] = payload[key]
        if "metadata" in payload:
            values["metadata"] = dict(payload["metadata"])
        table = WorkflowRun.__table__
        statement = table.update().where(table.c.command_id == command_id)
        if "status" in values:
            # 상태 변경은 허용 전이일 때만 반영 — 재배달 완료 이벤트의 상태 회귀 차단
            statement = statement.where(workflow_transition_guard(table, str(values["status"])))
        statement = statement.values(**values)
        with self.connection() as conn:
            conn.execute(statement)
        return payload

    def get_workflow_identity_for_command(self, command_id: str) -> JsonObject | None:
        table = WorkflowRun.__table__
        statement = (
            select(
                table.c.workflow_run_id,
                table.c.workspace_id,
                table.c.application_id,
                table.c.binding_id,
                table.c.environment,
                table.c.cluster_id,
                table.c.commit_sha,
            )
            .where(table.c.command_id == command_id)
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        if row:
            return dict(row)
        return self._workflow_identity_from_queued_command(command_id)

    def _workflow_identity_from_queued_command(self, command_id: str) -> JsonObject | None:
        table = AgentCommand.__table__
        statement = select(table.c.payload).where(table.c.command_id == command_id).limit(1)
        with self.connection() as conn:
            payload = conn.execute(statement).scalar_one_or_none()
        if not isinstance(payload, dict):
            return None
        workflow_run_id = payload.get("workflow_run_id")
        application_id = payload.get("application_id")
        if not workflow_run_id or not application_id:
            return None
        return {
            "workflow_run_id": str(workflow_run_id),
            "workspace_id": str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            "application_id": str(application_id),
            "binding_id": str(payload.get("binding_id", DEFAULT_DEPLOYMENT_BINDING_ID)),
            "environment": str(payload.get("environment", DEFAULT_ENVIRONMENT)),
            "cluster_id": str(payload.get("cluster_id", Target.DEFAULT_CLUSTER_ID)),
            "commit_sha": str(payload.get("commit_sha", "")),
        }

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
        repository_id = derive_repository_id(payload)
        watch_target_id = derive_watch_target_id({**payload, "repository_id": repository_id})
        binding_id = derive_deployment_binding_id(payload)
        artifact_id = str(
            payload.get("artifact_id")
            or manifest_artifact_id({**payload, "binding_id": binding_id})
        )
        table = ManifestArtifact.__table__
        insert = pg_insert(table).values(
            artifact_id=artifact_id,
            workspace_id=str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            repository_id=repository_id,
            watch_target_id=watch_target_id,
            binding_id=binding_id,
            commit_sha=str(payload["commit_sha"]),
            manifest_path=str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            status=str(payload.get("status", ManifestArtifactStatus.RENDERED.value)),
            status_reason=payload.get("status_reason"),
            rendered_manifest=payload.get("rendered_manifest"),
            source_summary=dict(payload.get("source_summary", {})),
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[
                table.c.workspace_id,
                table.c.binding_id,
                table.c.commit_sha,
                table.c.manifest_path,
            ],
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
        return {
            **payload,
            "artifact_id": artifact_id,
            "repository_id": repository_id,
            "watch_target_id": watch_target_id,
            "binding_id": binding_id,
        }

    def find_rendered_manifest_artifacts(
        self,
        workspace_id: str,
        binding_id: str,
        commit_sha: str,
        manifest_path: str,
        renderer_version: str,
    ) -> list[JsonObject]:
        table = ManifestArtifact.__table__
        prefix = f"{manifest_path}#"
        statement = (
            select(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.binding_id == binding_id,
                table.c.commit_sha == commit_sha,
                table.c.status == ManifestArtifactStatus.RENDERED.value,
                table.c.rendered_manifest.is_not(None),
                or_(
                    table.c.manifest_path == manifest_path,
                    table.c.manifest_path.like(f"{prefix}%"),
                ),
            )
            .order_by(table.c.manifest_path.asc())
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()

        artifacts: list[JsonObject] = []
        for row in rows:
            artifact = row_dict(row)
            source_summary = artifact.get("source_summary", {})
            if not isinstance(source_summary, dict):
                continue
            if source_summary.get("renderer_version") != renderer_version:
                continue
            artifacts.append(artifact)
        return artifacts

    def mark_watch_observed(
        self,
        watch_target_id: str,
        commit_sha: str,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
        repository_id: str = DEFAULT_REPOSITORY_ID,
        branch: str = DEFAULT_REPO_BRANCH,
        manifest_path: str = DEFAULT_MANIFEST_PATH,
    ) -> None:
        table = GitWatchTarget.__table__
        insert = pg_insert(table).values(
            watch_target_id=watch_target_id,
            workspace_id=workspace_id,
            repository_id=repository_id,
            branch=branch,
            manifest_path=manifest_path,
            interval_seconds=30,
            last_seen_commit_sha=commit_sha,
            last_polled_at=func.now(),
            status=WatchTargetStatus.ACTIVE.value,
            settings={},
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.watch_target_id],
            set_={
                "last_seen_commit_sha": insert.excluded.last_seen_commit_sha,
                "last_polled_at": func.now(),
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def get_watch_last_seen_commit_sha(
        self, watch_target_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID
    ) -> str | None:
        table = GitWatchTarget.__table__
        statement = (
            select(table.c.last_seen_commit_sha)
            .where(table.c.watch_target_id == watch_target_id, table.c.workspace_id == workspace_id)
            .limit(1)
        )
        with self.connection() as conn:
            value = conn.execute(statement).scalar_one_or_none()
        return str(value) if value else None

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
                    "role": ResourceRole.CLUSTER_STEWARD.value,
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


def derive_repository_id(payload: JsonObject) -> str:
    explicit = payload.get("repository_id")
    if explicit and explicit != DEFAULT_REPOSITORY_ID:
        return str(explicit)
    raw = "|".join(
        [
            str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            str(payload.get("repo_ref", DEFAULT_REPO_REF)),
        ]
    )
    return f"repo-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def derive_watch_target_id(payload: JsonObject) -> str:
    explicit = payload.get("watch_target_id")
    if explicit and explicit != DEFAULT_WATCH_TARGET_ID:
        return str(explicit)
    raw = "|".join(
        [
            str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            derive_repository_id(payload),
            str(payload.get("branch", DEFAULT_REPO_BRANCH)),
            str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
        ]
    )
    return f"watch-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def derive_deployment_binding_id(payload: JsonObject) -> str:
    explicit = payload.get("binding_id")
    if explicit and explicit != DEFAULT_DEPLOYMENT_BINDING_ID:
        return str(explicit)
    raw = "|".join(
        [
            str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            derive_repository_id(payload),
            str(payload.get("cluster_id", Target.DEFAULT_CLUSTER_ID)),
            str(payload.get("namespace", "sandbox")),
            str(payload.get("app_name", DEFAULT_APPLICATION_ID)),
        ]
    )
    return f"binding-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def derive_application_id(payload: JsonObject) -> str:
    explicit = payload.get("application_id")
    if explicit and explicit != DEFAULT_APPLICATION_ID:
        return str(explicit)
    application_name = derive_application_name(payload) or DEFAULT_APPLICATION_ID
    raw = "|".join(
        [
            str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            derive_repository_id(payload),
            str(payload.get("manifest_path", DEFAULT_MANIFEST_PATH)),
            application_name,
        ]
    )
    return f"app-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def derive_application_name(payload: JsonObject) -> str:
    explicit = payload.get("name") or payload.get("app_name")
    if explicit:
        return str(explicit)
    resource = str(payload.get("resource", ""))
    if "/" in resource:
        return resource.split("/", 1)[1]
    repo_ref = str(payload.get("repo_ref", ""))
    if "/" in repo_ref:
        return repo_ref.rsplit("/", 1)[1]
    return ""


def derive_workflow_run_id(payload: JsonObject) -> str:
    explicit = payload.get("workflow_run_id")
    if explicit and explicit != DEFAULT_WORKFLOW_RUN_ID:
        return str(explicit)
    raw = "|".join(
        [
            str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
            derive_application_id(payload),
            derive_deployment_binding_id(payload),
            str(payload.get("environment", DEFAULT_ENVIRONMENT)),
            str(payload.get("commit_sha", "")),
        ]
    )
    return f"workflow-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def derive_workflow_step_id(workflow_run_id: str, step_name: str) -> str:
    raw = f"{workflow_run_id}|{step_name}"
    return f"step-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def derive_approval_id(workflow_run_id: str) -> str:
    raw = f"{workflow_run_id}|deploy-approval"
    return f"approval-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def serialize_application(row: Any) -> JsonObject:
    item = dict(row)
    item["metadata"] = dict(item.get("metadata") or {})
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


def serialize_deployment_binding(row: Any) -> JsonObject:
    item = dict(row)
    item["deploy_policy"] = dict(item.get("deploy_policy") or {})
    item["access_policy"] = dict(item.get("access_policy") or {})
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


def serialize_workflow_run(row: Any) -> JsonObject:
    item = dict(row)
    item["metadata"] = dict(item.get("metadata") or {})
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item
