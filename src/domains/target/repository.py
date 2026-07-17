"""target 도메인 repository — agent lease와 evidence dedupe."""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import cast, delete, func, or_, select, tuple_, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.identity.models import ClusterRegistration
from domains.target.evidence_jobs import (
    DEFAULT_EVIDENCE_JOB_LEASE_SECONDS,
    DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS,
    EVIDENCE_JOB_STATUS_COMPLETED,
    EVIDENCE_JOB_STATUS_FAILED,
    EVIDENCE_JOB_STATUS_LEASED,
    EVIDENCE_JOB_STATUS_QUEUED,
    PENDING_EVIDENCE_EVENT_ID_PREFIX,
    aggregate_evidence_payload,
    evidence_job_id,
    evidence_key,
    normalize_evidence_provider_result,
)
from domains.target.models import (
    AgentPolicyRecord,
    AgentPolicyStatusRecord,
    AgentReconcileStatusRecord,
    ClusterAgentStatusRecord,
    EvidenceJob,
    EvidenceWindow,
    TargetDesiredState,
    TargetReconcileRecord,
)
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.identity import ClusterRegistrationStatus
from packages.contracts.target import TargetComponent, TargetDesiredStateStatus
from packages.storage.engine import DatabaseConnection, iso_or_none
from packages.storage.schema import EventModel, OutboxModel

if TYPE_CHECKING:
    from domains.target.policy_upgrade import TargetUpgradePlan

AGENT_STATUS_RETENTION_SECONDS_ENV = "AGENT_STATUS_RETENTION_SECONDS"
DEFAULT_AGENT_STATUS_RETENTION_SECONDS = 3600


def agent_status_retention_seconds() -> int:
    """종료된 agent pod 상태를 보존할 최대 시간을 반환한다."""
    try:
        configured = int(
            env(
                AGENT_STATUS_RETENTION_SECONDS_ENV,
                str(DEFAULT_AGENT_STATUS_RETENTION_SECONDS),
            )
        )
    except ValueError:
        return DEFAULT_AGENT_STATUS_RETENTION_SECONDS
    return max(300, configured)


class TargetAgentRepository(DatabaseConnection):
    def list_target_runtime_upgrade_candidates(
        self,
        *,
        after_id: int,
        limit: int,
    ) -> list[JsonObject]:
        """Read one keyset page with policy, desired state, and latest RBAC proof.

        The fixed query count avoids a per-cluster policy/status lookup while keeping
        memory bounded for installations with many workspaces.
        """

        registration = ClusterRegistration.__table__
        page_size = max(1, min(limit, 500))
        registration_statement = (
            select(
                registration.c.id,
                registration.c.workspace_id,
                registration.c.cluster_id,
                registration.c.name,
                registration.c.environment,
                registration.c.status,
                registration.c.settings,
            )
            .where(
                registration.c.id > after_id,
                registration.c.status.in_(
                    (
                        ClusterRegistrationStatus.PENDING_INSTALL.value,
                        ClusterRegistrationStatus.REGISTERED.value,
                    )
                ),
            )
            .order_by(registration.c.id)
            .limit(page_size)
        )
        with self.connection() as conn:
            registrations = [dict(row) for row in conn.execute(registration_statement).mappings()]
            if not registrations:
                return []

            identities = [
                (str(item["workspace_id"]), str(item["cluster_id"])) for item in registrations
            ]
            policy = AgentPolicyRecord.__table__
            policies = {
                (str(row["workspace_id"]), str(row["cluster_id"])): dict(row["policy"])
                for row in conn.execute(
                    select(
                        policy.c.workspace_id,
                        policy.c.cluster_id,
                        policy.c.policy,
                    ).where(tuple_(policy.c.workspace_id, policy.c.cluster_id).in_(identities))
                ).mappings()
            }

            desired = TargetDesiredState.__table__
            desired_by_cluster: dict[tuple[str, str], list[JsonObject]] = {}
            for row in conn.execute(
                select(
                    desired.c.workspace_id,
                    desired.c.cluster_id,
                    desired.c.component,
                    desired.c.namespace,
                    desired.c.version,
                    desired.c.status,
                    desired.c.updated_by,
                    desired.c.spec,
                )
                .where(tuple_(desired.c.workspace_id, desired.c.cluster_id).in_(identities))
                .order_by(desired.c.workspace_id, desired.c.cluster_id, desired.c.component)
            ).mappings():
                identity = (str(row["workspace_id"]), str(row["cluster_id"]))
                desired_by_cluster.setdefault(identity, []).append(dict(row))

            status = AgentPolicyStatusRecord.__table__
            ranked_status = (
                select(
                    status.c.workspace_id,
                    status.c.cluster_id,
                    status.c.generation,
                    status.c.status,
                    status.c.details,
                    func.row_number()
                    .over(
                        partition_by=(status.c.workspace_id, status.c.cluster_id),
                        order_by=status.c.id.desc(),
                    )
                    .label("position"),
                )
                .where(tuple_(status.c.workspace_id, status.c.cluster_id).in_(identities))
                .subquery("latest_target_policy_status")
            )
            statuses = {
                (str(row["workspace_id"]), str(row["cluster_id"])): dict(row)
                for row in conn.execute(
                    select(ranked_status).where(ranked_status.c.position == 1)
                ).mappings()
            }

        results: list[JsonObject] = []
        for item in registrations:
            identity = (str(item["workspace_id"]), str(item["cluster_id"]))
            results.append(
                {
                    "registration": item,
                    "policy": policies.get(identity),
                    "desired_states": desired_by_cluster.get(identity, []),
                    "policy_status": statuses.get(identity),
                }
            )
        return results

    def apply_target_runtime_upgrade(self, plan: TargetUpgradePlan) -> None:
        """Apply one planned upgrade with policy generation compare-and-swap."""

        from domains.target.policy_upgrade import UPGRADE_ACTOR

        if not plan.changed or plan.policy is None:
            return
        policy = AgentPolicyRecord.__table__
        registration = ClusterRegistration.__table__
        with self.connection() as conn:
            if plan.next_generation > plan.current_generation:
                values = {
                    "generation": plan.next_generation,
                    "policy": plan.policy.model_dump(),
                    "updated_at": func.now(),
                }
                if plan.policy_existed:
                    changed = conn.execute(
                        update(policy)
                        .where(
                            policy.c.workspace_id == plan.workspace_id,
                            policy.c.cluster_id == plan.cluster_id,
                            policy.c.generation == plan.current_generation,
                        )
                        .values(**values)
                        .returning(policy.c.generation)
                    ).scalar_one_or_none()
                else:
                    changed = conn.execute(
                        pg_insert(policy)
                        .values(
                            workspace_id=plan.workspace_id,
                            cluster_id=plan.cluster_id,
                            **values,
                        )
                        .on_conflict_do_nothing(
                            index_elements=[policy.c.workspace_id, policy.c.cluster_id]
                        )
                        .returning(policy.c.generation)
                    ).scalar_one_or_none()
                if changed != plan.next_generation:
                    raise RuntimeError("target policy generation changed during upgrade")

            if plan.settings_patch:
                updated_registration = conn.execute(
                    update(registration)
                    .where(
                        registration.c.id == plan.registration_id,
                        registration.c.workspace_id == plan.workspace_id,
                        registration.c.cluster_id == plan.cluster_id,
                        registration.c.status.in_(
                            (
                                ClusterRegistrationStatus.PENDING_INSTALL.value,
                                ClusterRegistrationStatus.REGISTERED.value,
                            )
                        ),
                    )
                    .values(
                        settings=registration.c.settings.op("||")(cast(plan.settings_patch, JSONB)),
                        updated_at=func.now(),
                    )
                    .returning(registration.c.id)
                ).scalar_one_or_none()
                if updated_registration != plan.registration_id:
                    raise RuntimeError("target registration changed during upgrade")

            self.upsert_target_desired_states(
                plan.workspace_id,
                plan.cluster_id,
                [
                    item
                    for item in plan.desired_states
                    if item.get("component")
                    in {
                        TargetComponent.CLUSTER_AGENT.value,
                        TargetComponent.NODE_COLLECTOR.value,
                    }
                ],
                UPGRADE_ACTOR,
                preserve_spec=True,
            )

    def save_cluster_agent_status(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        agent_id: str,
        capabilities: list[str] | None,
        status: str = "connected",
        details: JsonObject | None = None,
    ) -> JsonObject:
        table = ClusterAgentStatusRecord.__table__
        normalized_capabilities = (
            list(dict.fromkeys(capabilities)) if capabilities is not None else None
        )
        update_values: dict[str, Any] = {
            "status": status,
            "details": details or {},
            "last_seen_at": func.now(),
            "updated_at": func.now(),
        }
        if normalized_capabilities is not None:
            update_values["capabilities"] = normalized_capabilities
        statement = (
            pg_insert(table)
            .values(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                agent_id=agent_id,
                status=status,
                capabilities=normalized_capabilities or [],
                details=details or {},
                last_seen_at=func.now(),
                updated_at=func.now(),
            )
            .on_conflict_do_update(
                index_elements=[table.c.workspace_id, table.c.cluster_id, table.c.agent_id],
                set_=update_values,
            )
            .returning(table)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
            stale_before = datetime.now(UTC) - timedelta(seconds=agent_status_retention_seconds())
            conn.execute(
                delete(table).where(
                    table.c.workspace_id == workspace_id,
                    table.c.cluster_id == cluster_id,
                    table.c.agent_id != agent_id,
                    table.c.last_seen_at < stale_before,
                )
            )
        return self.serialize_cluster_agent_status(dict(row))

    def list_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> list[JsonObject]:
        table = ClusterAgentStatusRecord.__table__
        statement = (
            select(table)
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id)
            .order_by(table.c.last_seen_at.desc(), table.c.agent_id)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [self.serialize_cluster_agent_status(dict(row)) for row in rows]

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str] | None,
    ) -> dict[str, JsonObject]:
        if cluster_ids is not None and not cluster_ids:
            return {}

        table = ClusterAgentStatusRecord.__table__
        statement = select(table).where(table.c.workspace_id == workspace_id)
        if cluster_ids is not None:
            statement = statement.where(table.c.cluster_id.in_(cluster_ids))
        statement = statement.order_by(table.c.cluster_id, table.c.last_seen_at.desc())

        latest: dict[str, JsonObject] = {}
        with self.connection() as conn:
            for row in conn.execute(statement).mappings():
                cluster_id = str(row["cluster_id"])
                if cluster_id not in latest:
                    latest[cluster_id] = self.serialize_cluster_agent_status(dict(row))
        return latest

    def upsert_cluster_policy(
        self,
        workspace_id: str,
        cluster_id: str,
        policy: JsonObject,
    ) -> JsonObject:
        generation = int(policy.get("generation", 1))
        table = AgentPolicyRecord.__table__
        with self.connection() as conn:
            existing = (
                conn.execute(
                    select(table.c.generation).where(
                        table.c.workspace_id == workspace_id,
                        table.c.cluster_id == cluster_id,
                    )
                )
                .mappings()
                .first()
            )
            if existing and int(existing["generation"]) >= generation:
                raise ValueError("policy generation must be greater than the current generation")

            statement = (
                pg_insert(table)
                .values(
                    workspace_id=workspace_id,
                    cluster_id=cluster_id,
                    generation=generation,
                    policy=policy,
                    updated_at=func.now(),
                )
                .on_conflict_do_update(
                    index_elements=[table.c.workspace_id, table.c.cluster_id],
                    set_={
                        "generation": generation,
                        "policy": policy,
                        "updated_at": func.now(),
                    },
                )
                .returning(table.c.policy)
            )
            row = conn.execute(statement).mappings().one()
        return dict(row["policy"])

    def get_cluster_policy(self, workspace_id: str, cluster_id: str) -> JsonObject | None:
        table = AgentPolicyRecord.__table__
        statement = select(table.c.policy).where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id == cluster_id,
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row["policy"]) if row else None

    def save_agent_policy_status(
        self,
        workspace_id: str,
        payload: JsonObject,
    ) -> None:
        table = AgentPolicyStatusRecord.__table__
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            cluster_id=payload["cluster_id"],
            generation=payload["generation"],
            status=payload["status"],
            message=payload.get("message", ""),
            details=payload.get("details", {}),
        )
        with self.connection() as conn:
            conn.execute(statement)

    def save_agent_reconcile_status(
        self,
        workspace_id: str,
        payload: JsonObject,
    ) -> None:
        table = AgentReconcileStatusRecord.__table__
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            cluster_id=payload["cluster_id"],
            generation=payload["generation"],
            status=payload["status"],
            message=payload.get("message", ""),
            details=payload.get("details", {}),
        )
        with self.connection() as conn:
            conn.execute(statement)

    def upsert_target_desired_states(
        self,
        workspace_id: str,
        cluster_id: str,
        components: list[JsonObject],
        updated_by: str | None,
        *,
        preserve_spec: bool = False,
    ) -> list[JsonObject]:
        table = TargetDesiredState.__table__
        records: list[JsonObject] = []
        with self.connection() as conn:
            for component in components:
                update_values: dict[str, Any] = {
                    "namespace": component["namespace"],
                    "version": component["version"],
                    "status": TargetDesiredStateStatus.ACTIVE.value,
                    "updated_by": updated_by,
                    "updated_at": func.now(),
                }
                if not preserve_spec:
                    update_values["spec"] = component["spec"]
                statement = (
                    pg_insert(table)
                    .values(
                        workspace_id=workspace_id,
                        cluster_id=cluster_id,
                        component=component["component"],
                        namespace=component["namespace"],
                        version=component["version"],
                        status=TargetDesiredStateStatus.ACTIVE.value,
                        updated_by=updated_by,
                        spec=component["spec"],
                        updated_at=func.now(),
                    )
                    .on_conflict_do_update(
                        index_elements=[
                            table.c.workspace_id,
                            table.c.cluster_id,
                            table.c.component,
                        ],
                        set_=update_values,
                    )
                    .returning(
                        table.c.workspace_id,
                        table.c.cluster_id,
                        table.c.component,
                        table.c.namespace,
                        table.c.version,
                        table.c.status,
                        table.c.updated_by,
                        table.c.spec,
                    )
                )
                row = conn.execute(statement).mappings().one()
                records.append(dict(row))
        return records

    def list_target_desired_states(self, workspace_id: str, cluster_id: str) -> list[JsonObject]:
        table = TargetDesiredState.__table__
        statement = (
            select(
                table.c.workspace_id,
                table.c.cluster_id,
                table.c.component,
                table.c.namespace,
                table.c.version,
                table.c.status,
                table.c.updated_by,
                table.c.spec,
            )
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id)
            .order_by(table.c.component)
        )
        with self.connection() as conn:
            return [dict(row) for row in conn.execute(statement).mappings()]

    def record_target_reconcile_result(self, payload: JsonObject) -> JsonObject:
        table = TargetReconcileRecord.__table__
        reconcile_id = str(payload.get("reconcile_id") or uuid.uuid4())
        statement = (
            pg_insert(table)
            .values(
                reconcile_id=reconcile_id,
                workspace_id=payload["workspace_id"],
                cluster_id=payload["cluster_id"],
                desired_state_version=payload["desired_state_version"],
                status=payload["status"],
                drifted=payload["drifted"],
                applied=payload["applied"],
                message=payload["message"],
                details=payload.get("details", {}),
                updated_at=func.now(),
            )
            .returning(
                table.c.reconcile_id,
                table.c.workspace_id,
                table.c.cluster_id,
                table.c.desired_state_version,
                table.c.status,
                table.c.drifted,
                table.c.applied,
                table.c.message,
                table.c.details,
            )
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return dict(row)

    def queue_evidence_jobs(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        source_id: str,
        window_start: str,
        provider_keys: list[str],
        failure_policy: str,
        max_attempts: int,
        policy_generation: int,
        provider_policies: dict[str, JsonObject],
    ) -> JsonObject:
        table = EvidenceJob.__table__
        parent_key = evidence_key(workspace_id, cluster_id, source_id, window_start)
        job_ids: list[str] = []
        with self.connection() as conn:
            for provider_key in dict.fromkeys(provider_keys):
                job_id = evidence_job_id(
                    workspace_id,
                    cluster_id,
                    source_id,
                    window_start,
                    provider_key,
                )
                statement = (
                    pg_insert(table)
                    .values(
                        job_id=job_id,
                        evidence_key=parent_key,
                        workspace_id=workspace_id,
                        cluster_id=cluster_id,
                        source_id=source_id,
                        provider_key=provider_key,
                        window_start=window_start,
                        policy_generation=policy_generation,
                        provider_policy=provider_policies.get(provider_key, {}),
                        status=EVIDENCE_JOB_STATUS_QUEUED,
                        lease_id=None,
                        agent_id=None,
                        leased_until=None,
                        attempt_count=0,
                        max_attempts=max_attempts,
                        failure_policy=failure_policy,
                        result=None,
                        error=None,
                        updated_at=func.now(),
                    )
                    .on_conflict_do_nothing(index_elements=[table.c.job_id])
                    .returning(table.c.job_id)
                )
                row = conn.execute(statement).mappings().first()
                if row:
                    job_ids.append(str(row["job_id"]))
        return {
            "accepted": True,
            "evidence_key": parent_key,
            "queued": len(job_ids),
            "job_ids": job_ids,
        }

    async def lease_evidence_job(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        provider_key: str,
        agent_id: str,
        lease_seconds: int = DEFAULT_EVIDENCE_JOB_LEASE_SECONDS,
    ) -> JsonObject | None:
        table = EvidenceJob.__table__
        lease_id = str(uuid.uuid4())
        leased_until = datetime.now(UTC) + timedelta(seconds=lease_seconds)
        columns = (
            table.c.job_id,
            table.c.evidence_key,
            table.c.workspace_id,
            table.c.cluster_id,
            table.c.source_id,
            table.c.provider_key,
            table.c.window_start,
            table.c.policy_generation,
            table.c.provider_policy,
            table.c.status,
            table.c.lease_id,
            table.c.agent_id,
            table.c.leased_until,
            table.c.attempt_count,
            table.c.max_attempts,
            table.c.failure_policy,
        )
        available = or_(
            table.c.status == EVIDENCE_JOB_STATUS_QUEUED,
            (table.c.status == EVIDENCE_JOB_STATUS_LEASED) & (table.c.leased_until < func.now()),
        )
        candidate = (
            select(table.c.job_id)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.provider_key == provider_key,
                available,
            )
            .order_by(table.c.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )
        async with self.async_connection() as conn:
            statement = (
                update(table)
                .where(table.c.job_id == candidate)
                .values(
                    status=EVIDENCE_JOB_STATUS_LEASED,
                    lease_id=lease_id,
                    agent_id=agent_id,
                    leased_until=leased_until,
                    attempt_count=table.c.attempt_count + 1,
                    error=None,
                    updated_at=func.now(),
                )
                .returning(*columns)
            )
            row = (await conn.execute(statement)).mappings().first()
        return self.serialize_evidence_job(dict(row)) if row else None

    def complete_evidence_job(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        job_id: str,
        lease_id: str,
        agent_id: str,
        status: str,
        result: JsonObject,
        error: str,
    ) -> JsonObject | None:
        table = EvidenceJob.__table__
        with self.connection() as conn:
            active = (
                conn.execute(
                    select(
                        table.c.job_id,
                        table.c.evidence_key,
                        table.c.provider_key,
                        table.c.attempt_count,
                        table.c.max_attempts,
                    )
                    .where(
                        table.c.job_id == job_id,
                        table.c.workspace_id == workspace_id,
                        table.c.cluster_id == cluster_id,
                        table.c.lease_id == lease_id,
                        table.c.agent_id == agent_id,
                        table.c.status == EVIDENCE_JOB_STATUS_LEASED,
                        table.c.leased_until >= func.now(),
                    )
                    .with_for_update()
                )
                .mappings()
                .first()
            )
            if active is None:
                existing = (
                    conn.execute(
                        select(
                            table.c.job_id,
                            table.c.evidence_key,
                            table.c.provider_key,
                            table.c.source_id,
                            table.c.window_start,
                            table.c.status,
                        ).where(
                            table.c.job_id == job_id,
                            table.c.workspace_id == workspace_id,
                            table.c.cluster_id == cluster_id,
                            table.c.lease_id == lease_id,
                            table.c.agent_id == agent_id,
                            table.c.status.in_(
                                (
                                    EVIDENCE_JOB_STATUS_COMPLETED,
                                    EVIDENCE_JOB_STATUS_FAILED,
                                    EVIDENCE_JOB_STATUS_QUEUED,
                                )
                            ),
                        )
                    )
                    .mappings()
                    .first()
                )
                return dict(existing) if existing else None

            next_status = EVIDENCE_JOB_STATUS_COMPLETED
            if status == EVIDENCE_JOB_STATUS_FAILED:
                next_status = (
                    EVIDENCE_JOB_STATUS_FAILED
                    if int(active["attempt_count"]) >= int(active["max_attempts"])
                    else EVIDENCE_JOB_STATUS_QUEUED
                )

            row = (
                conn.execute(
                    update(table)
                    .where(table.c.job_id == job_id)
                    .values(
                        status=next_status,
                        result=(
                            normalize_evidence_provider_result(str(active["provider_key"]), result)
                            if next_status == EVIDENCE_JOB_STATUS_COMPLETED
                            else None
                        ),
                        error=error or None,
                        updated_at=func.now(),
                    )
                    .returning(
                        table.c.job_id,
                        table.c.evidence_key,
                        table.c.provider_key,
                        table.c.source_id,
                        table.c.window_start,
                        table.c.status,
                    )
                )
                .mappings()
                .one()
            )
            return dict(row)

    def evidence_payload_if_ready(self, evidence_key_value: str) -> JsonObject | None:
        table = EvidenceJob.__table__
        statement = (
            select(
                table.c.evidence_key,
                table.c.workspace_id,
                table.c.cluster_id,
                table.c.source_id,
                table.c.provider_key,
                table.c.provider_policy,
                table.c.window_start,
                table.c.status,
                table.c.failure_policy,
                table.c.agent_id,
                table.c.result,
            )
            .where(table.c.evidence_key == evidence_key_value)
            .order_by(table.c.provider_key)
        )
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings()]
        return aggregate_evidence_payload(rows)

    def list_evidence_jobs_for_window(
        self,
        evidence_key_value: str,
        workspace_id: str,
    ) -> list[JsonObject]:
        table = EvidenceJob.__table__
        statement = (
            select(
                table.c.job_id,
                table.c.provider_key,
                table.c.status,
                table.c.error,
                table.c.attempt_count,
                table.c.max_attempts,
            )
            .where(
                table.c.evidence_key == evidence_key_value,
                table.c.workspace_id == workspace_id,
            )
            .order_by(table.c.provider_key)
        )
        with self.connection() as conn:
            return [dict(row) for row in conn.execute(statement).mappings()]

    def evidence_job_status_counts(self) -> dict[str, int]:
        table = EvidenceJob.__table__
        statement = select(table.c.status, func.count().label("count")).group_by(table.c.status)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {row["status"]: int(row["count"]) for row in rows}

    def oldest_evidence_job_age_seconds(self, status: str) -> float:
        table = EvidenceJob.__table__
        statement = select(func.extract("epoch", func.now() - func.min(table.c.created_at))).where(
            table.c.status == status
        )
        with self.connection() as conn:
            age = conn.execute(statement).scalar()
        return float(age or 0)

    def serialize_evidence_job(self, row: JsonObject) -> JsonObject:
        item = dict(row)
        item["leased_until"] = iso_or_none(item.get("leased_until"))
        return item

    def serialize_cluster_agent_status(self, row: JsonObject) -> JsonObject:
        item = dict(row)
        item["last_seen_at"] = iso_or_none(item.get("last_seen_at"))
        item["created_at"] = iso_or_none(item.get("created_at"))
        item["updated_at"] = iso_or_none(item.get("updated_at"))
        return item

    def get_evidence_window(self, evidence_key: str) -> JsonObject | None:
        table = EvidenceWindow.__table__
        statement = select(
            table.c.event_id,
            table.c.correlation_id,
            table.c.updated_at,
        ).where(table.c.evidence_key == evidence_key)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def get_evidence_window_payload(self, evidence_key: str) -> JsonObject | None:
        table = EvidenceWindow.__table__
        statement = select(table.c.payload).where(table.c.evidence_key == evidence_key)
        with self.connection() as conn:
            payload = conn.execute(statement).scalar_one_or_none()
        return payload if isinstance(payload, dict) else None

    def get_evidence_window_payload_for_workspace(
        self, workspace_id: str, evidence_key: str
    ) -> JsonObject | None:
        table = EvidenceWindow.__table__
        statement = select(table.c.payload).where(
            table.c.workspace_id == workspace_id,
            table.c.evidence_key == evidence_key,
        )
        with self.connection() as conn:
            payload = conn.execute(statement).scalar_one_or_none()
        return payload if isinstance(payload, dict) else None

    def list_evidence_windows_for_workspace(
        self,
        workspace_id: str,
        *,
        limit: int,
        offset: int = 0,
    ) -> list[JsonObject]:
        table = EvidenceWindow.__table__
        statement = (
            select(
                table.c.evidence_key,
                table.c.workspace_id,
                table.c.cluster_id,
                table.c.source_id,
                table.c.window_start,
                table.c.agent_id,
                table.c.correlation_id,
                table.c.payload,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.updated_at.desc(), table.c.evidence_key.desc())
            .limit(limit)
            .offset(offset)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [dict(row) for row in rows]

    def record_evidence_event_once(
        self,
        *,
        evidence_key: str,
        workspace_id: str,
        cluster_id: str,
        source_id: str,
        window_start: str,
        agent_id: str | None,
        event_envelope: EventEnvelope,
        payload: JsonObject,
    ) -> JsonObject:
        window_table = EvidenceWindow.__table__
        event_table = EventModel.__table__
        outbox_table = OutboxModel.__table__
        with self.connection() as conn:
            inserted = (
                conn.execute(
                    pg_insert(window_table)
                    .values(
                        evidence_key=evidence_key,
                        workspace_id=workspace_id,
                        cluster_id=cluster_id,
                        source_id=source_id,
                        window_start=window_start,
                        agent_id=agent_id,
                        event_id=event_envelope.event_id,
                        correlation_id=event_envelope.correlation_id,
                        payload=payload,
                        updated_at=func.now(),
                    )
                    .on_conflict_do_nothing(index_elements=[window_table.c.evidence_key])
                    .returning(window_table.c.event_id, window_table.c.correlation_id)
                )
                .mappings()
                .first()
            )
            if inserted is None:
                existing = (
                    conn.execute(
                        select(window_table.c.event_id, window_table.c.correlation_id).where(
                            window_table.c.evidence_key == evidence_key
                        )
                    )
                    .mappings()
                    .one()
                )
                return {"duplicate": True, **dict(existing)}

            trusted_envelope = replace(event_envelope, workspace_id=workspace_id)
            self.stage_event_envelope(conn, event_table, outbox_table, trusted_envelope)
        return {"duplicate": False, **dict(inserted)}

    def stage_event_envelope(
        self,
        conn: Any,
        event_table: Any,
        outbox_table: Any,
        event_envelope: EventEnvelope,
    ) -> None:
        conn.execute(
            pg_insert(event_table)
            .values(
                event_id=event_envelope.event_id,
                subject=event_envelope.subject,
                source=event_envelope.source,
                correlation_id=event_envelope.correlation_id,
                causation_id=event_envelope.causation_id,
                payload=event_envelope.payload,
            )
            .on_conflict_do_nothing(index_elements=[event_table.c.event_id])
        )
        conn.execute(
            pg_insert(outbox_table)
            .values(
                event_id=event_envelope.event_id,
                subject=event_envelope.subject,
                source=event_envelope.source,
                correlation_id=event_envelope.correlation_id,
                causation_id=event_envelope.causation_id,
                workspace_id=event_envelope.workspace_id,
                occurred_at=event_envelope.created_at,
                payload=event_envelope.payload,
                lease_id=None,
                leased_until=None,
            )
            .on_conflict_do_nothing(index_elements=[outbox_table.c.event_id])
        )

    def release_stale_pending_evidence_window(
        self,
        evidence_key: str,
        stale_after_seconds: int = DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS,
    ) -> bool:
        table = EvidenceWindow.__table__
        stale_before = datetime.now(UTC) - timedelta(seconds=stale_after_seconds)
        statement = (
            table.delete()
            .where(
                table.c.evidence_key == evidence_key,
                table.c.event_id.like(f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}%"),
                table.c.updated_at < stale_before,
            )
            .returning(table.c.evidence_key)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return row is not None
