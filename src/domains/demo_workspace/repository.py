"""Destructive reset boundary for one marker-owned demo workspace."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import delete, select

from domains.demo_workspace.policy import require_demo_workspace_mutation_opt_in
from packages.contracts.demo_workspace import DEMO_SEED_MARKER_KEY
from packages.storage.engine import DatabaseConnection
from packages.storage.schema import metadata


class DemoWorkspaceRepository(DatabaseConnection):
    """Remove a dedicated demo tenant after revalidating its persisted marker."""

    def reset_demo_workspace(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        expected_marker: Mapping[str, object],
        event_source: str,
    ) -> dict[str, int]:
        require_demo_workspace_mutation_opt_in()
        if not workspace_id or not cluster_id:
            raise ValueError("demo reset scope must be non-empty")

        tables = metadata.tables
        registration = tables["cluster_registrations"]
        event = tables["events"]
        event_processing = tables["event_processing"]
        counts: dict[str, int] = {}

        with self.unit_of_work() as conn:
            settings = conn.execute(
                select(registration.c.settings)
                .where(
                    registration.c.workspace_id == workspace_id,
                    registration.c.cluster_id == cluster_id,
                )
                .with_for_update()
            ).scalar_one_or_none()
            actual_marker = (
                settings.get(DEMO_SEED_MARKER_KEY) if isinstance(settings, Mapping) else None
            )
            if actual_marker != dict(expected_marker):
                raise RuntimeError("demo reset refused: persisted descriptor marker does not match")

            seed_event_ids = list(
                conn.execute(
                    select(event.c.event_id).where(
                        event.c.source == event_source,
                        event.c.payload["workspace_id"].as_string() == workspace_id,
                    )
                ).scalars()
            )
            if seed_event_ids:
                self._record_delete(
                    counts,
                    "event_processing",
                    conn.execute(
                        delete(event_processing).where(
                            event_processing.c.event_id.in_(seed_event_ids)
                        )
                    ),
                )

            # Reverse metadata order removes FK children before their parents. This is the
            # reset extension point: later demo projections need only retain workspace_id.
            for table in reversed(metadata.sorted_tables):
                if "workspace_id" not in table.c:
                    continue
                self._record_delete(
                    counts,
                    table.name,
                    conn.execute(delete(table).where(table.c.workspace_id == workspace_id)),
                )

            if seed_event_ids:
                self._record_delete(
                    counts,
                    "events",
                    conn.execute(delete(event).where(event.c.event_id.in_(seed_event_ids))),
                )

            self._delete_identity_scope(conn, workspace_id, counts)

        return dict(sorted(counts.items()))

    @classmethod
    def _delete_identity_scope(
        cls,
        conn: Any,
        organization_id: str,
        counts: dict[str, int],
    ) -> None:
        tables = metadata.tables
        assignment = tables["resource_assignments"]
        member_role = tables["member_resource_roles"]
        group = tables["groups"]
        group_member = tables["group_members"]
        organization_member = tables["organization_members"]
        organization = tables["organizations"]

        assignment_ids = select(assignment.c.resource_assignment_id).where(
            assignment.c.organization_id == organization_id
        )
        group_ids = select(group.c.group_id).where(group.c.organization_id == organization_id)

        for name, statement in (
            (
                "member_resource_roles",
                delete(member_role).where(member_role.c.resource_assignment_id.in_(assignment_ids)),
            ),
            (
                "resource_assignments",
                delete(assignment).where(assignment.c.organization_id == organization_id),
            ),
            ("group_members", delete(group_member).where(group_member.c.group_id.in_(group_ids))),
            ("groups", delete(group).where(group.c.organization_id == organization_id)),
            (
                "organization_members",
                delete(organization_member).where(
                    organization_member.c.organization_id == organization_id
                ),
            ),
            (
                "organizations",
                delete(organization).where(organization.c.organization_id == organization_id),
            ),
        ):
            cls._record_delete(counts, name, conn.execute(statement))

    @staticmethod
    def _record_delete(counts: dict[str, int], name: str, result: Any) -> None:
        deleted = max(0, int(result.rowcount or 0))
        if deleted:
            counts[name] = counts.get(name, 0) + deleted
