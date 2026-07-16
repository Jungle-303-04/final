from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from domains.helm.repository import (
    HelmChartSourceConflict,
    HelmChartSourceIdentityConflict,
    HelmChartSourceNotFound,
    HelmReleaseRepository,
)
from domains.helm.source_provider import (
    helm_chart_credential_scope,
    helm_chart_source_from_row,
    helm_chart_source_id,
    normalize_helm_chart_source_reference,
    resolve_helm_chart_versions,
)
from packages.contracts.helm.sources import (
    HELM_CHART_SOURCE_PAGE_MAX,
    HELM_CHART_VERSION_PAGE_MAX,
    HelmChartSource,
    HelmChartVersion,
    HelmChartVersionObservation,
)
from packages.runtime.keyset_cursor import decode_keyset_cursor


def _source(
    *,
    source_id: str = "source-a",
    provider: str = "repository",
    reference: str = "https://charts.example.com/stable",
) -> HelmChartSource:
    return HelmChartSource(
        source_id=source_id,
        provider=provider,
        name=source_id,
        reference=reference,
        status="active",
        credentials_configured=True,
        observed_at="2026-07-16T09:00:00+00:00",
    )


def _observation(
    *,
    source: HelmChartSource | None = None,
    versions: tuple[str, ...] = ("1.2.0", "1.1.0"),
    availability: str = "available",
    reason_codes: tuple[str, ...] = (),
    truncated: bool = False,
) -> HelmChartVersionObservation:
    return HelmChartVersionObservation(
        source=source or _source(),
        chart_name="storefront",
        availability=availability,
        versions=tuple(HelmChartVersion(version=version) for version in versions),
        observed_at="2026-07-16T09:01:00+00:00",
        truncated=truncated,
        reason_codes=reason_codes,
    )


def test_chart_source_projection_never_exposes_credential_storage_fields() -> None:
    source = helm_chart_source_from_row(
        {
            "source_id": "source-a",
            "workspace_id": "workspace-a",
            "provider": "repository",
            "name": "stable",
            "canonical_ref": "https://charts.example.com/stable",
            "credential_ref": "db:helm_repository:workspace-a/stable",
            "encrypted_value": "must-never-leak",
            "status": "active",
            "updated_at": datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
        }
    ).model_dump(mode="json")

    assert source == {
        "source_id": "source-a",
        "provider": "repository",
        "name": "stable",
        "reference": "https://charts.example.com/stable",
        "status": "active",
        "actions": [],
        "credentials_configured": True,
        "observed_at": "2026-07-16T09:00:00+00:00",
    }
    assert "credential_ref" not in source
    assert "encrypted_value" not in source
    assert "workspace_id" not in source


@pytest.mark.parametrize(
    ("provider", "raw", "expected"),
    [
        ("repository", "https://charts.example.com/stable/", "https://charts.example.com/stable"),
        (
            "oci",
            "oci://registry.example.com/platform/charts/",
            "oci://registry.example.com/platform/charts",
        ),
    ],
)
def test_chart_source_reference_is_canonical_and_secret_free(
    provider: str,
    raw: str,
    expected: str,
) -> None:
    assert normalize_helm_chart_source_reference(provider, raw) == expected


@pytest.mark.parametrize(
    ("provider", "reference"),
    [
        ("repository", "http://charts.example.com/stable"),
        ("repository", "https://user:token@charts.example.com/stable"),
        ("repository", "https://charts.example.com/stable?token=secret"),
        ("oci", "oci://user:token@registry.example.com/charts"),
        ("oci", "oci://registry.example.com"),
        ("unknown", "https://charts.example.com/stable"),
    ],
)
def test_chart_source_reference_rejects_unsafe_or_credential_bearing_values(
    provider: str,
    reference: str,
) -> None:
    with pytest.raises(ValueError, match="invalid Helm chart source"):
        normalize_helm_chart_source_reference(provider, reference)


def test_version_observation_is_bounded_and_partial_failures_are_explicit() -> None:
    with pytest.raises(ValidationError, match="reason"):
        _observation(availability="partial")

    partial = _observation(
        availability="partial",
        reason_codes=("helm_chart_versions_truncated",),
        truncated=True,
    )
    assert [item.version for item in partial.versions] == ["1.2.0", "1.1.0"]

    with pytest.raises(ValidationError):
        _observation(
            versions=tuple(f"1.0.{index}" for index in range(HELM_CHART_VERSION_PAGE_MAX + 1))
        )


def test_version_resolution_never_unions_multiple_source_results() -> None:
    selected = resolve_helm_chart_versions((_observation(),))
    assert selected.availability == "available"
    assert selected.source is not None
    assert [item.version for item in selected.versions] == ["1.2.0", "1.1.0"]

    ambiguous = resolve_helm_chart_versions(
        (
            _observation(),
            _observation(
                source=_source(
                    source_id="source-b",
                    provider="oci",
                    reference="oci://registry.example.com/platform/charts",
                ),
                versions=("2.0.0",),
            ),
        )
    )
    assert ambiguous.availability == "unavailable"
    assert ambiguous.source is None
    assert ambiguous.versions == ()
    assert ambiguous.reason_codes == ("helm_chart_source_ambiguous",)


def test_duplicate_provider_observations_fail_closed_without_version_union() -> None:
    duplicate = resolve_helm_chart_versions((_observation(), _observation(versions=("9.9.9",))))

    assert duplicate.availability == "unavailable"
    assert duplicate.versions == ()
    assert duplicate.reason_codes == ("helm_chart_source_duplicate_observation",)


def test_workspace_source_listing_is_bounded_keyset_paginated_and_safe() -> None:
    now = datetime(2026, 7, 16, 9, 0, tzinfo=UTC)
    rows = [
        {
            "source_id": f"source-{index}",
            "workspace_id": "workspace-a",
            "provider": "repository",
            "name": f"source-{index}",
            "canonical_ref": f"https://charts{index}.example.com/stable",
            "credential_ref": None if index == 0 else f"db:helm_repository:source-{index}",
            "status": "active",
            "updated_at": now - timedelta(seconds=index),
        }
        for index in range(3)
    ]

    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return rows

    class Connection:
        statement: object | None = None

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    page = repository.list_helm_chart_sources(workspace_id="workspace-a", limit=2)

    assert page.limit == 2
    assert page.has_more is True
    assert len(page.items) == 2
    assert page.items[0].credentials_configured is False
    assert page.items[1].credentials_configured is True
    assert page.next_cursor is not None
    cursor = decode_keyset_cursor(
        page.next_cursor,
        expected_scope="helm-chart-sources:workspace-a",
    )
    assert cursor.tie_breaker == "source-1"
    assert connection.statement is not None
    sql = str(
        connection.statement.compile(  # type: ignore[union-attr]
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "workspace-a" in sql
    assert "LIMIT 3" in sql


def test_workspace_source_page_limit_is_clamped_to_contract_maximum() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class Connection:
        statement: object | None = None

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    page = repository.list_helm_chart_sources(workspace_id="workspace-a", limit=10_000)

    assert page.limit == HELM_CHART_SOURCE_PAGE_MAX
    assert connection.statement is not None
    sql = str(
        connection.statement.compile(  # type: ignore[union-attr]
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert f"LIMIT {HELM_CHART_SOURCE_PAGE_MAX + 1}" in sql


def test_source_registration_is_atomic_and_duplicate_provider_identity_fails_closed() -> None:
    now = datetime(2026, 7, 16, 9, 0, tzinfo=UTC)

    class Result:
        def __init__(self, row: dict[str, object] | None) -> None:
            self.row = row

        def mappings(self) -> Result:
            return self

        def one_or_none(self) -> dict[str, object] | None:
            return self.row

    class Connection:
        statements: list[object]

        def __init__(self, row: dict[str, object] | None) -> None:
            self.row = row
            self.statements = []

        def execute(self, statement: object) -> Result:
            self.statements.append(statement)
            return Result(self.row)

    row = {
        "source_id": "helm-source-a",
        "workspace_id": "workspace-a",
        "provider": "repository",
        "name": "stable",
        "canonical_ref": "https://charts.example.com/stable",
        "credential_ref": None,
        "status": "active",
        "access_policy": {"roles": ["operator"]},
        "created_at": now,
        "updated_at": now,
    }
    connection = Connection(row)

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    source = repository.register_helm_chart_source(
        workspace_id="workspace-a",
        provider="repository",
        name="stable",
        reference="https://charts.example.com/stable/",
        access_policy={"roles": ["operator"]},
    )

    assert source.reference == "https://charts.example.com/stable"
    assert source.credentials_configured is False
    compiled = connection.statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "ON CONFLICT DO NOTHING" in sql
    assert "workspace-a" in compiled.params.values()
    assert "https://charts.example.com/stable" in compiled.params.values()

    duplicate_connection = Connection(None)

    @contextmanager
    def duplicate_connect() -> Iterator[Connection]:
        yield duplicate_connection

    repository.connection = duplicate_connect
    with pytest.raises(HelmChartSourceConflict, match="already exists"):
        repository.register_helm_chart_source(
            workspace_id="workspace-a",
            provider="repository",
            name="duplicate",
            reference="https://charts.example.com/stable",
        )


def test_repository_registration_rejects_cross_source_credential_scope_before_write() -> None:
    calls = 0

    @contextmanager
    def connect() -> Iterator[object]:
        nonlocal calls
        calls += 1
        yield object()

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    source_id = helm_chart_source_id(
        "workspace-a",
        "repository",
        "https://charts.example.com/stable",
    )
    other_scope = helm_chart_credential_scope(f"{source_id}-other")

    with pytest.raises(ValueError, match="invalid Helm chart source credential reference"):
        repository.register_helm_chart_source(
            workspace_id="workspace-a",
            provider="repository",
            name="stable",
            reference="https://charts.example.com/stable",
            credential_ref=f"db:helm_repository:{other_scope}",
        )

    assert calls == 0


def test_single_permission_denied_provider_is_explicitly_unavailable() -> None:
    denied = resolve_helm_chart_versions(
        (
            _observation(
                versions=(),
                availability="unavailable",
                reason_codes=("helm_chart_source_permission_denied",),
            ),
        )
    )

    assert denied.availability == "unavailable"
    assert denied.source is not None
    assert denied.versions == ()
    assert denied.reason_codes == ("helm_chart_source_permission_denied",)


def test_source_repository_applies_authorized_ids_before_page_limit() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class Connection:
        statement: object | None = None

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    page = repository.list_helm_chart_sources(
        workspace_id="workspace-a",
        limit=10,
        source_ids={"source-a", "source-b"},
    )

    assert page.items == ()
    assert connection.statement is not None
    sql = str(
        connection.statement.compile(  # type: ignore[union-attr]
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "helm_chart_sources.source_id IN ('source-a', 'source-b')" in sql
    assert "LIMIT 11" in sql


def test_internal_source_lookup_never_selects_workspace_credential_secret() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def first(self) -> None:
            return None

    class Connection:
        statement: object | None = None

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    assert (
        repository.get_helm_chart_source_record(
            workspace_id="workspace-a",
            source_id="source-a",
        )
        is None
    )

    assert connection.statement is not None
    selected = set(connection.statement.selected_columns.keys())  # type: ignore[union-attr]
    assert "credential_ref" in selected
    assert "encrypted_value" not in selected
    assert "metadata" not in selected


def test_source_delete_locks_workspace_row_and_removes_only_exact_optimistic_identity() -> None:
    statements: list[object] = []

    class Result:
        def __init__(self, row: dict[str, object] | None = None) -> None:
            self.row = row

        def mappings(self) -> Result:
            return self

        def first(self) -> dict[str, object] | None:
            return self.row

    class Connection:
        def execute(self, statement: object) -> Result:
            statements.append(statement)
            if len(statements) == 1:
                return Result(
                    {
                        "source_id": "source-a",
                        "workspace_id": "workspace-a",
                        "provider": "repository",
                        "name": "stable",
                        "canonical_ref": "https://charts.example.com/stable",
                        "credential_ref": None,
                    }
                )
            return Result()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield Connection()

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    deleted = repository.delete_helm_chart_source(
        workspace_id="workspace-a",
        source_id="source-a",
        expected_provider="repository",
        expected_name="stable",
        expected_reference="https://charts.example.com/stable/",
    )

    assert deleted["source_id"] == "source-a"
    assert len(statements) == 2
    locked_sql = str(statements[0].compile(dialect=postgresql.dialect()))
    deleted_sql = str(statements[1].compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in locked_sql
    assert "helm_chart_sources.workspace_id" in locked_sql
    assert "helm_chart_sources.source_id" in locked_sql
    assert deleted_sql.startswith("DELETE FROM helm_chart_sources")


def test_source_delete_distinguishes_absent_from_changed_identity_without_deleting() -> None:
    def repository_for(row: dict[str, object] | None) -> HelmReleaseRepository:
        class Result:
            def mappings(self) -> Result:
                return self

            def first(self) -> dict[str, object] | None:
                return row

        class Connection:
            calls = 0

            def execute(self, _statement: object) -> Result:
                self.calls += 1
                if self.calls > 1:
                    raise AssertionError("non-matching source must not be deleted")
                return Result()

        @contextmanager
        def connect() -> Iterator[Connection]:
            yield Connection()

        repository = object.__new__(HelmReleaseRepository)
        repository.connection = connect
        return repository

    with pytest.raises(HelmChartSourceNotFound):
        repository_for(None).delete_helm_chart_source(
            workspace_id="workspace-a",
            source_id="source-a",
            expected_provider="repository",
            expected_name="stable",
            expected_reference="https://charts.example.com/stable",
        )

    with pytest.raises(HelmChartSourceIdentityConflict):
        repository_for(
            {
                "source_id": "source-a",
                "workspace_id": "workspace-a",
                "provider": "repository",
                "name": "renamed",
                "canonical_ref": "https://charts.example.com/stable",
                "credential_ref": None,
            }
        ).delete_helm_chart_source(
            workspace_id="workspace-a",
            source_id="source-a",
            expected_provider="repository",
            expected_name="stable",
            expected_reference="https://charts.example.com/stable",
        )
