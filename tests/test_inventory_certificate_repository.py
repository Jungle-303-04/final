from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.inventory.repository import InventoryRepository


class _MappedResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> _MappedResult:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows


def _sql(statement: Any) -> str:
    return " ".join(
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )


def test_tls_secret_certificate_query_returns_no_secret_raw_payload() -> None:
    observed_at = datetime(2026, 7, 16, 9, 0, tzinfo=UTC)
    rows = [
        {
            "secret_inventory_key": "secret-key",
            "secret_api_version": "v1",
            "secret_kind": "Secret",
            "secret_namespace": "shop",
            "secret_name": "api-tls",
            "secret_uid": "secret-uid",
            "secret_observed_at": observed_at,
            "certificate_inventory_key": "certificate-key",
            "certificate_api_version": "cert-manager.io/v1",
            "certificate_kind": "Certificate",
            "certificate_namespace": "shop",
            "certificate_name": "api-certificate",
            "certificate_uid": "certificate-uid",
            "certificate_raw": {
                "spec": {"secretName": "api-tls"},
                "status": {"notAfter": "2026-10-16T12:00:00Z"},
            },
            "certificate_observed_at": observed_at,
        }
    ]

    class Connection:
        statement: Any | None = None

        def execute(self, statement: Any) -> _MappedResult:
            self.statement = statement
            return _MappedResult(rows)

    connection_instance = Connection()

    @contextmanager
    def connection() -> Iterator[Connection]:
        yield connection_instance

    repository = object.__new__(InventoryRepository)
    repository.connection = connection  # type: ignore[method-assign]

    result = repository.list_tls_secret_certificate_observations(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        limit=8,
    )

    assert result == {
        "items": [
            {
                "secret": {
                    "inventory_key": "secret-key",
                    "api_version": "v1",
                    "kind": "Secret",
                    "namespace": "shop",
                    "name": "api-tls",
                    "uid": "secret-uid",
                    "observed_at": "2026-07-16T09:00:00+00:00",
                },
                "certificate": {
                    "inventory_key": "certificate-key",
                    "api_version": "cert-manager.io/v1",
                    "kind": "Certificate",
                    "namespace": "shop",
                    "name": "api-certificate",
                    "uid": "certificate-uid",
                    "raw": {
                        "spec": {"secretName": "api-tls"},
                        "status": {"notAfter": "2026-10-16T12:00:00Z"},
                    },
                    "observed_at": "2026-07-16T09:00:00+00:00",
                },
            }
        ],
        "has_more": False,
    }
    assert "tls.crt" not in str(result)
    sql = _sql(connection_instance.statement)
    assert "kubernetes.io/tls" in sql
    assert "cert-manager.io" in sql
    assert "certificate_expiry_secret.raw as" not in sql
    assert "limit 9" in sql
