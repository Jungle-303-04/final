"""G3 D7 real connection-stage polling contracts."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from domains.applications.router import get_repository_connection_status
from domains.applications.router import router as applications_router
from packages.contracts.gateway.responses import (
    ClusterConnectionStatusResponse,
    RepositoryConnectionStatusResponse,
)


def test_cluster_connection_status_rejects_unknown_or_client_timed_stages() -> None:
    base = {
        "cluster_id": "cluster-a",
        "connection_status": "pending_install",
        "connection_stage": "awaiting_install",
        "refresh_after_seconds": 0.5,
    }

    assert ClusterConnectionStatusResponse.model_validate(base).connection_stage == (
        "awaiting_install"
    )
    with pytest.raises(ValidationError):
        ClusterConnectionStatusResponse.model_validate(
            {**base, "connection_stage": "fake_progress"}
        )
    with pytest.raises(ValidationError):
        ClusterConnectionStatusResponse.model_validate(
            {
                **base,
                "connection_status": "install_failed",
                "connection_stage": "error",
                "refresh_after_seconds": 1,
            }
        )
    ready = {
        **base,
        "connection_status": "online",
        "connection_stage": "ready",
        "refresh_after_seconds": None,
    }
    assert ClusterConnectionStatusResponse.model_validate(ready).connection_stage == "ready"
    with pytest.raises(ValidationError):
        ClusterConnectionStatusResponse.model_validate({**ready, "refresh_after_seconds": 0.5})


def test_repository_connection_status_has_server_owned_terminal_semantics() -> None:
    waiting = RepositoryConnectionStatusResponse(
        repo_ref="org/checkout",
        repository_id=None,
        repository_status="unregistered",
        connection_stage="awaiting_validation",
        terminal=False,
        refresh_after_seconds=1,
    )
    ready = RepositoryConnectionStatusResponse(
        repo_ref="org/checkout",
        repository_id="repo-a",
        repository_status="active",
        connection_stage="ready",
        terminal=True,
        refresh_after_seconds=None,
    )

    assert waiting.refresh_after_seconds == 1
    assert ready.terminal is True
    with pytest.raises(ValidationError):
        RepositoryConnectionStatusResponse.model_validate({**ready.model_dump(), "terminal": False})


def test_repository_connection_poll_is_published_in_openapi() -> None:
    app = FastAPI()
    app.include_router(applications_router)

    operation = app.openapi()["paths"]["/repositories/connection-status"]["get"]

    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/RepositoryConnectionStatusResponse"
    }


class _RepositoryDb:
    def __init__(self, repository: dict[str, object] | None) -> None:
        self.repository = repository

    def get_repository_by_ref(
        self,
        workspace_id: str,
        repo_ref: str,
    ) -> dict[str, object] | None:
        assert workspace_id == "workspace-a"
        assert repo_ref == "org/checkout"
        return self.repository


@pytest.mark.parametrize(
    ("repository", "expected_stage", "terminal"),
    [
        (None, "awaiting_validation", False),
        (
            {
                "repository_id": "repo-a",
                "repo_ref": "org/checkout",
                "status": "active",
            },
            "ready",
            True,
        ),
        (
            {
                "repository_id": "repo-a",
                "repo_ref": "org/checkout",
                "status": "invalid_credential",
            },
            "error",
            True,
        ),
    ],
)
def test_repository_connection_poll_reads_persisted_registration_state(
    repository: dict[str, object] | None,
    expected_stage: str,
    terminal: bool,
) -> None:
    response = asyncio.run(
        get_repository_connection_status(
            repo_ref="org/checkout",
            current=SimpleNamespace(
                user_id="admin-a",
                workspace_id="workspace-a",
                roles=("service_admin",),
            ),
            db=_RepositoryDb(repository),
        )
    )

    assert response.connection_stage == expected_stage
    assert response.terminal is terminal
    assert (response.refresh_after_seconds is not None) is (not terminal)
