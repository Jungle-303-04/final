"""Copy a frozen unversioned database into an isolated versioned target.

The source is never modified.  A separate guard connection takes SHARE locks
with NOWAIT while a repeatable-read, read-only snapshot is copied.  The target
must already be at the exact Alembic head and contain no application rows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Mapping, Sequence, Set
from dataclasses import asdict, dataclass
from enum import StrEnum
from typing import Any

import psycopg
from psycopg import sql
from psycopg.connection import Connection

from packages.config.settings import required_env
from packages.contracts.identity import (
    DEFAULT_GROUP_ID,
    DEFAULT_ORGANIZATION_ID,
    DEFAULT_WORKSPACE_ID,
    AccessStatus,
    GroupRole,
    OrganizationRole,
    ResourceRole,
    ServiceRole,
    UserStatus,
)
from packages.storage.baseline import BASELINE_TARGET_DATABASE_URL_ENV
from packages.storage.engine import SCHEMA_INIT_LOCK_KEY, SCHEMA_INIT_LOCK_NAMESPACE
from packages.storage.migration import EXPECTED_HEAD_ENV, alembic_config, revisions

BASELINE_SOURCE_DATABASE_URL_ENV = "BASELINE_SOURCE_DATABASE_URL"
BASELINE_CONFIRM_SOURCE_FROZEN_ENV = "BASELINE_CONFIRM_SOURCE_FROZEN"
BASELINE_CONFIRM_TARGET_ISOLATED_ENV = "BASELINE_CONFIRM_TARGET_ISOLATED"
BASELINE_SOURCE_FROZEN_CONFIRMATION = "source-writes-disabled"
BASELINE_TARGET_ISOLATED_CONFIRMATION = "isolated-versioned-target"
SCHEMA = "public"
VERSION_TABLE = "alembic_version"
LEGACY_WORKSPACE_MEMBERS_TABLE = "workspace_members"
LEGACY_RESOURCE_ACCESS_GRANTS_TABLE = "resource_access_grants"
RETIRED_SOURCE_TABLES = frozenset(
    {LEGACY_WORKSPACE_MEMBERS_TABLE, LEGACY_RESOURCE_ACCESS_GRANTS_TABLE}
)
TRANSFORMED_IDENTITY_TABLES = frozenset({"user_accounts", "organization_members", "group_members"})
LEGACY_ADMIN_ROLE = "admin"
LEGACY_WORKSPACE_PERMISSIONS = {"target": ["register", "install"]}


class CutoverDecision(StrEnum):
    """Allowed and blocked states before copying any application row."""

    READY = "ready"
    BLOCKED_SOURCE_VERSIONED = "blocked_source_versioned"
    BLOCKED_TARGET_NOT_CURRENT = "blocked_target_not_current"
    BLOCKED_TARGET_NOT_EMPTY = "blocked_target_not_empty"


@dataclass(frozen=True)
class ColumnShape:
    """Relevant information-schema properties for additive copying."""

    data_type: str
    nullable: bool
    default: str | None
    identity: bool


@dataclass(frozen=True)
class TableProof:
    """Deterministic source and committed-target proofs ordered by the primary key."""

    rows: int
    source_sha256: str
    target_sha256: str
    pre_transform_copy_verified: bool


@dataclass(frozen=True)
class LegacyIdentityContract:
    """Validated live-only identity row used inside the target transaction."""

    user_id: str
    source_sha256: str


@dataclass(frozen=True)
class LegacyIdentityProof:
    """Non-secret evidence for the one-time canonical identity transformation."""

    resource_access_grants: int
    workspace_members: int
    source_sha256: str
    workspace_id: str
    workspace_role: str
    workspace_status: str
    workspace_permissions: tuple[str, ...]
    migrated_users: int
    canonical_transform_verified: bool
    user_role: str
    organization_role: str
    group_role: str
    cluster_steward_status: str


@dataclass(frozen=True)
class CutoverReport:
    """Non-secret evidence emitted after the target transaction commits."""

    head: str
    source_tables: int
    copied_tables: int
    target_tables: int
    catalog_sha256: str
    tables: dict[str, TableProof]
    legacy_identity: LegacyIdentityProof


def validate_legacy_source_contract(
    resource_access_grants: int,
    workspace_members: Sequence[Sequence[Any]],
) -> LegacyIdentityContract:
    """Accept only the exact read-only live observation approved for first deploy."""
    if resource_access_grants != 0:
        raise RuntimeError("legacy resource_access_grants must contain exactly zero rows")
    if len(workspace_members) != 1:
        raise RuntimeError("legacy workspace_members must contain exactly one row")

    row = workspace_members[0]
    if len(row) != 5:
        raise RuntimeError("legacy workspace_members projection is invalid")
    workspace_id, user_id, role, permissions, status = row
    if (
        workspace_id != DEFAULT_WORKSPACE_ID
        or not isinstance(user_id, str)
        or not user_id
        or role != OrganizationRole.OWNER.value
        or permissions != LEGACY_WORKSPACE_PERMISSIONS
        or status != AccessStatus.ACTIVE.value
    ):
        raise RuntimeError("legacy workspace_members row does not match the approved contract")

    encoded = json.dumps(
        {
            "permissions": permissions,
            "role": role,
            "status": status,
            "user_id": user_id,
            "workspace_id": workspace_id,
        },
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return LegacyIdentityContract(
        user_id=user_id, source_sha256=hashlib.sha256(encoded).hexdigest()
    )


def validate_canonical_identity_contract(
    *,
    user_rows: Sequence[Sequence[Any]],
    organization_member_rows: Sequence[Sequence[Any]],
    group_member_rows: Sequence[Sequence[Any]],
    resource_role_rows: Sequence[Sequence[Any]],
    transformed: bool,
) -> None:
    """Require the exact canonical state before and after the explicit role mapping."""
    expected_user_role = ServiceRole.SERVICE_ADMIN.value if transformed else LEGACY_ADMIN_ROLE
    expected = (
        ("user account", user_rows, [(expected_user_role, UserStatus.ACTIVE.value)]),
        (
            "default organization membership",
            organization_member_rows,
            [
                (
                    OrganizationRole.OWNER.value if transformed else OrganizationRole.MEMBER.value,
                    AccessStatus.ACTIVE.value,
                )
            ],
        ),
        (
            "default group membership",
            group_member_rows,
            [
                (
                    GroupRole.MANAGER.value if transformed else GroupRole.MEMBER.value,
                    AccessStatus.ACTIVE.value,
                )
            ],
        ),
        (
            "member resource role",
            resource_role_rows,
            [(ResourceRole.CLUSTER_STEWARD.value, AccessStatus.DISABLED.value)],
        ),
    )
    for label, observed, required in expected:
        if [tuple(row) for row in observed] != required:
            raise RuntimeError(f"{label} does not match the approved legacy identity contract")


def decide_copy(
    *,
    source_version_exists: bool,
    target_revisions: Sequence[str],
    expected_head: str,
    target_nonempty_tables: Sequence[str],
) -> CutoverDecision:
    """Reject in-place adoption, wrong target lineage, and dirty targets."""
    if source_version_exists:
        return CutoverDecision.BLOCKED_SOURCE_VERSIONED
    if list(target_revisions) != [expected_head]:
        return CutoverDecision.BLOCKED_TARGET_NOT_CURRENT
    if target_nonempty_tables:
        return CutoverDecision.BLOCKED_TARGET_NOT_EMPTY
    return CutoverDecision.READY


def validate_table_contract(
    table_name: str,
    source: Mapping[str, ColumnShape],
    target: Mapping[str, ColumnShape],
) -> tuple[str, ...]:
    """Return copy columns after enforcing an additive target schema."""
    for name, source_column in source.items():
        target_column = target.get(name)
        if target_column is None:
            raise RuntimeError(f"target is missing source column: {table_name}.{name}")
        if source_column.data_type != target_column.data_type:
            raise RuntimeError(f"column type mismatch: {table_name}.{name}")
        if source_column.nullable and not target_column.nullable:
            raise RuntimeError(f"target column is more restrictive: {table_name}.{name}")

    for name, target_column in target.items():
        if name in source:
            continue
        if not (
            target_column.nullable or target_column.default is not None or target_column.identity
        ):
            raise RuntimeError(f"target-only column has no safe value: {table_name}.{name}")
    return tuple(source)


def topological_tables(table_names: Set[str], foreign_keys: Mapping[str, Set[str]]) -> list[str]:
    """Order parent tables before children and fail on cross-table cycles."""
    dependencies = {
        table: {parent for parent in foreign_keys.get(table, set()) if parent != table}
        for table in table_names
    }
    ordered: list[str] = []
    while dependencies:
        ready = sorted(table for table, parents in dependencies.items() if not parents)
        if not ready:
            cycle_tables = ",".join(sorted(dependencies))
            raise RuntimeError(f"foreign-key cycle blocks data-only copy: {cycle_tables}")
        ordered.extend(ready)
        for table in ready:
            dependencies.pop(table)
        for parents in dependencies.values():
            parents.difference_update(ready)
    return ordered


def _table_names(connection: Connection[Any]) -> list[str]:
    rows = connection.execute(
        """
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = %s
          AND tablename <> %s
        ORDER BY tablename
        """,
        (SCHEMA, VERSION_TABLE),
    ).fetchall()
    return [str(row[0]) for row in rows]


def _version_revisions(connection: Connection[Any]) -> tuple[bool, list[str]]:
    exists = connection.execute(
        "SELECT to_regclass(%s) IS NOT NULL",
        (f"{SCHEMA}.{VERSION_TABLE}",),
    ).fetchone()[0]
    if not exists:
        return False, []
    rows = connection.execute(f"SELECT version_num FROM {VERSION_TABLE} ORDER BY version_num")
    return True, [str(row[0]) for row in rows]


def _row_count(connection: Connection[Any], table_name: str) -> int:
    statement = sql.SQL("SELECT count(*) FROM {}.{}").format(
        sql.Identifier(SCHEMA), sql.Identifier(table_name)
    )
    return int(connection.execute(statement).fetchone()[0])


def _nonempty_tables(connection: Connection[Any], table_names: Sequence[str]) -> list[str]:
    return [table for table in table_names if _row_count(connection, table) != 0]


def _column_shapes(connection: Connection[Any], table_name: str) -> dict[str, ColumnShape]:
    rows = connection.execute(
        """
        SELECT column_name,
               udt_schema || '.' || udt_name AS data_type,
               is_nullable = 'YES' AS nullable,
               column_default,
               is_identity = 'YES' OR is_generated <> 'NEVER' AS identity
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
        """,
        (SCHEMA, table_name),
    ).fetchall()
    return {
        str(name): ColumnShape(str(data_type), bool(nullable), default, bool(identity))
        for name, data_type, nullable, default, identity in rows
    }


def _primary_key_columns(connection: Connection[Any], table_name: str) -> tuple[str, ...]:
    rows = connection.execute(
        """
        SELECT attribute.attname
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, position) ON TRUE
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
        WHERE namespace.nspname = %s
          AND relation.relname = %s
          AND constraint_row.contype = 'p'
        ORDER BY key.position
        """,
        (SCHEMA, table_name),
    ).fetchall()
    return tuple(str(row[0]) for row in rows)


def _foreign_key_dependencies(
    connection: Connection[Any], table_names: Set[str]
) -> dict[str, set[str]]:
    rows = connection.execute(
        """
        SELECT child.relname, parent.relname
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS child ON child.oid = constraint_row.conrelid
        JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
        JOIN pg_namespace AS namespace ON namespace.oid = child.relnamespace
        WHERE namespace.nspname = %s AND constraint_row.contype = 'f'
        ORDER BY child.relname, parent.relname
        """,
        (SCHEMA,),
    ).fetchall()
    dependencies = {table: set() for table in table_names}
    for child, parent in rows:
        child_name = str(child)
        parent_name = str(parent)
        if child_name in table_names and parent_name in table_names:
            dependencies[child_name].add(parent_name)
    return dependencies


def _lock_source_tables(connection: Connection[Any], table_names: Sequence[str]) -> None:
    if not table_names:
        return
    relations = sql.SQL(", ").join(
        sql.SQL("{}.{}").format(sql.Identifier(SCHEMA), sql.Identifier(table))
        for table in table_names
    )
    connection.execute(sql.SQL("LOCK TABLE {} IN SHARE MODE NOWAIT").format(relations))


def _acquire_schema_lock(connection: Connection[Any], label: str) -> None:
    acquired = connection.execute(
        "SELECT pg_try_advisory_xact_lock(%s, %s)",
        (SCHEMA_INIT_LOCK_NAMESPACE, SCHEMA_INIT_LOCK_KEY),
    ).fetchone()[0]
    if not acquired:
        raise RuntimeError(f"{label} schema lock is held by another process")


def _copy_table(
    source: Connection[Any],
    target: Connection[Any],
    table_name: str,
    columns: Sequence[str],
) -> None:
    identifiers = sql.SQL(", ").join(sql.Identifier(column) for column in columns)
    export = sql.SQL("COPY (SELECT {} FROM {}.{}) TO STDOUT (FORMAT text)").format(
        identifiers,
        sql.Identifier(SCHEMA),
        sql.Identifier(table_name),
    )
    load = sql.SQL("COPY {}.{} ({}) FROM STDIN (FORMAT text)").format(
        sql.Identifier(SCHEMA),
        sql.Identifier(table_name),
        identifiers,
    )
    with source.cursor().copy(export) as source_copy, target.cursor().copy(load) as target_copy:
        for chunk in source_copy:
            target_copy.write(chunk)


def _table_digest(
    connection: Connection[Any],
    table_name: str,
    columns: Sequence[str],
    primary_key: Sequence[str],
) -> str:
    identifiers = sql.SQL(", ").join(sql.Identifier(column) for column in columns)
    ordering = sql.SQL(", ").join(sql.Identifier(column) for column in primary_key)
    export = sql.SQL("COPY (SELECT {} FROM {}.{} ORDER BY {}) TO STDOUT (FORMAT text)").format(
        identifiers,
        sql.Identifier(SCHEMA),
        sql.Identifier(table_name),
        ordering,
    )
    digest = hashlib.sha256()
    with connection.cursor().copy(export) as copy:
        for chunk in copy:
            digest.update(bytes(chunk))
    return digest.hexdigest()


def _sync_sequences(
    source: Connection[Any], target: Connection[Any], table_names: Sequence[str]
) -> None:
    rows = target.execute(
        """
        SELECT table_name,
               column_name,
               pg_get_serial_sequence(format('%%I.%%I', table_schema, table_name), column_name)
        FROM information_schema.columns
        WHERE table_schema = %s
          AND table_name = ANY(%s)
          AND (is_identity = 'YES' OR column_default LIKE 'nextval(%%')
        ORDER BY table_name, ordinal_position
        """,
        (SCHEMA, list(table_names)),
    ).fetchall()
    for table_name, column_name, target_sequence in rows:
        if target_sequence is None:
            continue
        source_sequence = source.execute(
            "SELECT pg_get_serial_sequence(%s, %s)",
            (f"{SCHEMA}.{table_name}", column_name),
        ).fetchone()[0]
        maximum = target.execute(
            sql.SQL("SELECT max({}) FROM {}.{}").format(
                sql.Identifier(str(column_name)),
                sql.Identifier(SCHEMA),
                sql.Identifier(str(table_name)),
            )
        ).fetchone()[0]
        sequence_value = maximum if maximum is not None else 1
        is_called = maximum is not None
        if source_sequence is not None:
            source_row = source.execute(
                sql.SQL("SELECT last_value, is_called FROM {}").format(
                    sql.Identifier(*str(source_sequence).split("."))
                )
            ).fetchone()
            if maximum is None or int(source_row[0]) >= int(maximum):
                sequence_value = source_row[0]
                is_called = bool(source_row[1])
        target.execute(
            "SELECT setval(%s::regclass, %s, %s)",
            (target_sequence, sequence_value, is_called),
        )


def _catalog_digest(connection: Connection[Any]) -> str:
    rows = connection.execute(
        """
        SELECT object_type, object_name, definition
        FROM (
            SELECT 'column' AS object_type,
                   table_name || '.' || column_name AS object_name,
                   udt_schema || '.' || udt_name || ':' || is_nullable || ':' ||
                       coalesce(column_default, '') AS definition
            FROM information_schema.columns
            WHERE table_schema = %s
            UNION ALL
            SELECT 'constraint', relation.relname || '.' || constraint_row.conname,
                   pg_get_constraintdef(constraint_row.oid, true)
            FROM pg_constraint AS constraint_row
            JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = %s
            UNION ALL
            SELECT 'index', tablename || '.' || indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = %s
        ) AS catalog
        ORDER BY object_type, object_name, definition
        """,
        (SCHEMA, SCHEMA, SCHEMA),
    ).fetchall()
    encoded = json.dumps(rows, ensure_ascii=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _verify_target_catalog(connection: Connection[Any]) -> None:
    invalid_indexes = connection.execute(
        """
        SELECT index_relation.relname
        FROM pg_index AS index_row
        JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
        JOIN pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
        WHERE namespace.nspname = %s AND NOT index_row.indisvalid
        ORDER BY index_relation.relname
        """,
        (SCHEMA,),
    ).fetchall()
    if invalid_indexes:
        raise RuntimeError("target contains invalid indexes")
    unvalidated_constraints = connection.execute(
        """
        SELECT constraint_row.conname
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = %s AND NOT constraint_row.convalidated
        ORDER BY constraint_row.conname
        """,
        (SCHEMA,),
    ).fetchall()
    if unvalidated_constraints:
        raise RuntimeError("target contains unvalidated constraints")


def _database_identity(connection: Connection[Any]) -> tuple[str, str | None, int | None]:
    row = connection.execute(
        "SELECT current_database(), inet_server_addr()::text, inet_server_port()"
    ).fetchone()
    return str(row[0]), row[1], row[2]


def _legacy_source_identity(connection: Connection[Any]) -> LegacyIdentityContract:
    workspace_members = connection.execute(
        """
        SELECT workspace_id, user_id, role, permissions, status
        FROM workspace_members
        ORDER BY id
        """
    ).fetchall()
    return validate_legacy_source_contract(
        _row_count(connection, LEGACY_RESOURCE_ACCESS_GRANTS_TABLE),
        workspace_members,
    )


def _canonical_identity_rows(
    connection: Connection[Any], user_id: str
) -> tuple[list[Any], list[Any], list[Any], list[Any]]:
    user_rows = connection.execute(
        "SELECT role, status FROM user_accounts WHERE user_id = %s",
        (user_id,),
    ).fetchall()
    organization_member_rows = connection.execute(
        """
        SELECT role, status
        FROM organization_members
        WHERE organization_id = %s AND user_id = %s
        ORDER BY id
        """,
        (DEFAULT_ORGANIZATION_ID, user_id),
    ).fetchall()
    group_member_rows = connection.execute(
        """
        SELECT role, status
        FROM group_members
        WHERE group_id = %s AND user_id = %s
        ORDER BY id
        """,
        (DEFAULT_GROUP_ID, user_id),
    ).fetchall()
    resource_role_rows = connection.execute(
        """
        SELECT role, status
        FROM member_resource_roles
        WHERE user_id = %s
        ORDER BY resource_assignment_id, id
        """,
        (user_id,),
    ).fetchall()
    return user_rows, organization_member_rows, group_member_rows, resource_role_rows


def _validate_target_identity(
    connection: Connection[Any], contract: LegacyIdentityContract, *, transformed: bool
) -> None:
    user_rows, organization_rows, group_rows, resource_role_rows = _canonical_identity_rows(
        connection, contract.user_id
    )
    validate_canonical_identity_contract(
        user_rows=user_rows,
        organization_member_rows=organization_rows,
        group_member_rows=group_rows,
        resource_role_rows=resource_role_rows,
        transformed=transformed,
    )


def _migrate_legacy_identity(
    connection: Connection[Any], contract: LegacyIdentityContract
) -> LegacyIdentityProof:
    _validate_target_identity(connection, contract, transformed=False)
    updates = (
        connection.execute(
            """
            UPDATE user_accounts
            SET role = %s, status = %s, updated_at = now()
            WHERE user_id = %s AND role = %s AND status = %s
            """,
            (
                ServiceRole.SERVICE_ADMIN.value,
                UserStatus.ACTIVE.value,
                contract.user_id,
                LEGACY_ADMIN_ROLE,
                UserStatus.ACTIVE.value,
            ),
        ),
        connection.execute(
            """
            UPDATE organization_members
            SET role = %s, status = %s, updated_at = now()
            WHERE organization_id = %s AND user_id = %s AND role = %s AND status = %s
            """,
            (
                OrganizationRole.OWNER.value,
                AccessStatus.ACTIVE.value,
                DEFAULT_ORGANIZATION_ID,
                contract.user_id,
                OrganizationRole.MEMBER.value,
                AccessStatus.ACTIVE.value,
            ),
        ),
        connection.execute(
            """
            UPDATE group_members
            SET role = %s, status = %s, updated_at = now()
            WHERE group_id = %s AND user_id = %s AND role = %s AND status = %s
            """,
            (
                GroupRole.MANAGER.value,
                AccessStatus.ACTIVE.value,
                DEFAULT_GROUP_ID,
                contract.user_id,
                GroupRole.MEMBER.value,
                AccessStatus.ACTIVE.value,
            ),
        ),
    )
    if any(cursor.rowcount != 1 for cursor in updates):
        raise RuntimeError("canonical legacy identity update did not affect exactly one row")
    _validate_target_identity(connection, contract, transformed=True)
    return LegacyIdentityProof(
        resource_access_grants=0,
        workspace_members=1,
        source_sha256=contract.source_sha256,
        workspace_id=DEFAULT_WORKSPACE_ID,
        workspace_role=OrganizationRole.OWNER.value,
        workspace_status=AccessStatus.ACTIVE.value,
        workspace_permissions=("target.register", "target.install"),
        migrated_users=1,
        canonical_transform_verified=True,
        user_role=ServiceRole.SERVICE_ADMIN.value,
        organization_role=OrganizationRole.OWNER.value,
        group_role=GroupRole.MANAGER.value,
        cluster_steward_status=AccessStatus.DISABLED.value,
    )


def _validate_operator_confirmations() -> None:
    if required_env(BASELINE_CONFIRM_SOURCE_FROZEN_ENV) != BASELINE_SOURCE_FROZEN_CONFIRMATION:
        raise RuntimeError("frozen source confirmation mismatch")
    if required_env(BASELINE_CONFIRM_TARGET_ISOLATED_ENV) != BASELINE_TARGET_ISOLATED_CONFIRMATION:
        raise RuntimeError("isolated target confirmation mismatch")


def run_copy() -> CutoverReport:
    """Copy and verify one frozen source snapshot as a single target transaction."""
    _validate_operator_confirmations()
    source_url = required_env(BASELINE_SOURCE_DATABASE_URL_ENV)
    target_url = required_env(BASELINE_TARGET_DATABASE_URL_ENV)
    if source_url == target_url:
        raise RuntimeError("source and target URLs must differ")
    configured_head = required_env(EXPECTED_HEAD_ENV)
    image_head, _ = revisions(alembic_config())
    if configured_head != image_head:
        raise RuntimeError("migration image head mismatch")

    with (
        psycopg.connect(source_url) as source_guard,
        psycopg.connect(source_url) as source,
        psycopg.connect(target_url) as target,
    ):
        source_guard.execute("SET lock_timeout = '5s'")
        _acquire_schema_lock(source_guard, "source")
        guarded_source_tables = _table_names(source_guard)
        _lock_source_tables(source_guard, guarded_source_tables)

        _acquire_schema_lock(target, "target")
        source.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        source.execute("SET TRANSACTION READ ONLY")
        if _database_identity(source) == _database_identity(target):
            raise RuntimeError("source and target resolve to the same database")

        source_tables = _table_names(source)
        if source_tables != guarded_source_tables:
            raise RuntimeError("source table set changed before the frozen snapshot")
        missing_retired_tables = sorted(RETIRED_SOURCE_TABLES - set(source_tables))
        if missing_retired_tables:
            raise RuntimeError(
                "source is missing retired identity tables: " + ",".join(missing_retired_tables)
            )
        legacy_identity = _legacy_source_identity(source)
        copied_source_tables = sorted(set(source_tables) - RETIRED_SOURCE_TABLES)
        target_tables = _table_names(target)
        retained_target_tables = sorted(RETIRED_SOURCE_TABLES & set(target_tables))
        if retained_target_tables:
            raise RuntimeError(
                "target must not retain retired identity tables: "
                + ",".join(retained_target_tables)
            )
        source_version_exists, _ = _version_revisions(source)
        target_version_exists, target_revisions = _version_revisions(target)
        decision = decide_copy(
            source_version_exists=source_version_exists,
            target_revisions=target_revisions if target_version_exists else [],
            expected_head=image_head,
            target_nonempty_tables=_nonempty_tables(target, target_tables),
        )
        if decision is not CutoverDecision.READY:
            raise RuntimeError(f"data-only copy refused: {decision.value}")

        missing_tables = sorted(set(copied_source_tables) - set(target_tables))
        if missing_tables:
            raise RuntimeError(f"target is missing source tables: {','.join(missing_tables)}")

        contracts: dict[str, tuple[str, ...]] = {}
        primary_keys: dict[str, tuple[str, ...]] = {}
        for table_name in copied_source_tables:
            contracts[table_name] = validate_table_contract(
                table_name,
                _column_shapes(source, table_name),
                _column_shapes(target, table_name),
            )
            primary_keys[table_name] = _primary_key_columns(source, table_name)
            target_primary_key = _primary_key_columns(target, table_name)
            if primary_keys[table_name] != target_primary_key:
                raise RuntimeError(f"primary key mismatch: {table_name}")
            if _row_count(source, table_name) and not primary_keys[table_name]:
                raise RuntimeError(f"non-empty source table has no primary key: {table_name}")

        copy_order = topological_tables(
            set(copied_source_tables),
            _foreign_key_dependencies(target, set(copied_source_tables)),
        )

        source_counts = {table: _row_count(source, table) for table in copied_source_tables}
        for table_name in copy_order:
            _copy_table(source, target, table_name, contracts[table_name])
        _sync_sequences(source, target, copied_source_tables)

        proofs: dict[str, TableProof] = {}
        for table_name in copied_source_tables:
            target_count = _row_count(target, table_name)
            if target_count != source_counts[table_name]:
                raise RuntimeError(f"row count mismatch: {table_name}")
            if target_count == 0:
                source_digest = hashlib.sha256(b"").hexdigest()
                target_digest = source_digest
            else:
                source_digest = _table_digest(
                    source, table_name, contracts[table_name], primary_keys[table_name]
                )
                target_digest = _table_digest(
                    target, table_name, contracts[table_name], primary_keys[table_name]
                )
                if target_digest != source_digest:
                    raise RuntimeError(f"data checksum mismatch: {table_name}")
            proofs[table_name] = TableProof(
                rows=target_count,
                source_sha256=source_digest,
                target_sha256=target_digest,
                pre_transform_copy_verified=True,
            )

        legacy_proof = _migrate_legacy_identity(target, legacy_identity)
        for table_name in TRANSFORMED_IDENTITY_TABLES:
            proof = proofs[table_name]
            proofs[table_name] = TableProof(
                rows=proof.rows,
                source_sha256=proof.source_sha256,
                target_sha256=_table_digest(
                    target, table_name, contracts[table_name], primary_keys[table_name]
                ),
                pre_transform_copy_verified=proof.pre_transform_copy_verified,
            )

        extra_target_tables = sorted(set(target_tables) - set(copied_source_tables))
        if _nonempty_tables(target, extra_target_tables):
            raise RuntimeError("copy populated target-only tables")
        _verify_target_catalog(target)
        catalog_digest = _catalog_digest(target)
        target.commit()
        source.rollback()
        source_guard.rollback()
        return CutoverReport(
            head=image_head,
            source_tables=len(source_tables),
            copied_tables=len(copied_source_tables),
            target_tables=len(target_tables),
            catalog_sha256=catalog_digest,
            tables=proofs,
            legacy_identity=legacy_proof,
        )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Copy a frozen legacy database")
    parser.add_argument("action", choices=("copy",))
    args = parser.parse_args(argv)
    if args.action == "copy":
        report = run_copy()
        print(json.dumps(asdict(report), sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
