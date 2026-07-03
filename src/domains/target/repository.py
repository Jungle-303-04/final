"""target 도메인 repository — agent lease와 evidence dedupe."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.target.evidence_jobs import (
    DEFAULT_EVIDENCE_JOB_LEASE_SECONDS,
    EVIDENCE_JOB_STATUS_COMPLETED,
    EVIDENCE_JOB_STATUS_FAILED,
    EVIDENCE_JOB_STATUS_LEASED,
    EVIDENCE_JOB_STATUS_QUEUED,
    aggregate_evidence_payload,
    evidence_job_id,
    evidence_key,
)
from domains.target.models import (
    AgentPolicyRecord,
    AgentPolicyStatusRecord,
    AgentReconcileStatusRecord,
    EvidenceJob,
    EvidenceWindow,
    TargetDesiredState,
    TargetReconcileRecord,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.target import TargetDesiredStateStatus
from packages.storage.engine import DatabaseConnection, iso_or_none

PENDING_EVIDENCE_EVENT_ID_PREFIX = "pending:"


class TargetAgentRepository(DatabaseConnection):
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
    ) -> list[JsonObject]:
        table = TargetDesiredState.__table__
        records: list[JsonObject] = []
        with self.connection() as conn:
            for component in components:
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
                        set_={
                            "namespace": component["namespace"],
                            "version": component["version"],
                            "status": TargetDesiredStateStatus.ACTIVE.value,
                            "updated_by": updated_by,
                            "spec": component["spec"],
                            "updated_at": func.now(),
                        },
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
                        result=result if next_status == EVIDENCE_JOB_STATUS_COMPLETED else None,
                        error=error or None,
                        updated_at=func.now(),
                    )
                    .returning(table.c.job_id, table.c.evidence_key, table.c.status)
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

    def serialize_evidence_job(self, row: JsonObject) -> JsonObject:
        item = dict(row)
        item["leased_until"] = iso_or_none(item.get("leased_until"))
        return item

    def get_evidence_window(self, evidence_key: str) -> JsonObject | None:
        table = EvidenceWindow.__table__
        statement = select(table.c.event_id, table.c.correlation_id).where(
            table.c.evidence_key == evidence_key
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def record_evidence_window(
        self,
        evidence_key: str,
        workspace_id: str,
        cluster_id: str,
        source_id: str,
        window_start: str,
        agent_id: str | None,
        event_id: str,
        correlation_id: str,
        payload: JsonObject,
    ) -> JsonObject:
        table = EvidenceWindow.__table__
        statement = (
            pg_insert(table)
            .values(
                evidence_key=evidence_key,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                source_id=source_id,
                window_start=window_start,
                agent_id=agent_id,
                event_id=event_id,
                correlation_id=correlation_id,
                payload=payload,
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.evidence_key])
            .returning(table.c.event_id, table.c.correlation_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
            if row:
                return {"duplicate": False, **dict(row)}
            existing = (
                conn.execute(
                    select(table.c.event_id, table.c.correlation_id).where(
                        table.c.evidence_key == evidence_key
                    )
                )
                .mappings()
                .one()
            )
        return {"duplicate": True, **dict(existing)}

    def claim_evidence_window(
        self,
        evidence_key: str,
        workspace_id: str,
        cluster_id: str,
        source_id: str,
        window_start: str,
        agent_id: str | None,
        payload: JsonObject,
    ) -> JsonObject:
        pending_id = f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}{uuid.uuid4()}"
        table = EvidenceWindow.__table__
        statement = (
            pg_insert(table)
            .values(
                evidence_key=evidence_key,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                source_id=source_id,
                window_start=window_start,
                agent_id=agent_id,
                event_id=pending_id,
                correlation_id=pending_id,
                payload=payload,
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.evidence_key])
            .returning(table.c.event_id, table.c.correlation_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
            if row:
                return {"claimed": True, "duplicate": False, **dict(row)}
            existing = (
                conn.execute(
                    select(table.c.event_id, table.c.correlation_id).where(
                        table.c.evidence_key == evidence_key
                    )
                )
                .mappings()
                .one()
            )
        return {"claimed": False, "duplicate": True, **dict(existing)}

    def complete_evidence_window(
        self,
        evidence_key: str,
        event_id: str,
        correlation_id: str,
        payload: JsonObject,
    ) -> JsonObject:
        table = EvidenceWindow.__table__
        statement = (
            table.update()
            .where(table.c.evidence_key == evidence_key)
            .values(
                event_id=event_id,
                correlation_id=correlation_id,
                payload=payload,
                updated_at=func.now(),
            )
            .returning(table.c.event_id, table.c.correlation_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return dict(row)

    def release_pending_evidence_window(self, evidence_key: str) -> None:
        table = EvidenceWindow.__table__
        statement = table.delete().where(
            table.c.evidence_key == evidence_key,
            table.c.event_id.like(f"{PENDING_EVIDENCE_EVENT_ID_PREFIX}%"),
        )
        with self.connection() as conn:
            conn.execute(statement)
