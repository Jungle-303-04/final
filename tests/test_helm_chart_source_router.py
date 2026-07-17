from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.helm.source_router import (
    get_helm_chart_version_provider,
)
from domains.helm.source_router import (
    router as helm_source_router,
)
from domains.identity.dependencies import require_admin_session, require_session
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.helm.sources import (
    HelmChartSource,
    HelmChartSourcePage,
    HelmChartVersion,
    HelmChartVersionObservation,
    HelmRepositoryRefreshResult,
)
from packages.runtime.dependencies import get_db, get_events


def _current(*, admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("service_admin",) if admin else ("user",),
    )


def _source(*, credentials_configured: bool = False) -> HelmChartSource:
    return HelmChartSource(
        source_id="source-a",
        provider="repository",
        name="stable",
        reference="https://charts.example.com/stable",
        status="active",
        credentials_configured=credentials_configured,
        observed_at="2026-07-16T09:00:00+00:00",
    )


def _client(
    db: object,
    *,
    provider: object | None = None,
    admin: bool = False,
    events: object | None = None,
) -> TestClient:
    app = FastAPI()
    app.include_router(helm_source_router)
    app.dependency_overrides[require_session] = lambda: _current(admin=admin)
    app.dependency_overrides[require_admin_session] = lambda: _current(admin=True)
    app.dependency_overrides[get_db] = lambda: db
    if events is not None:
        app.dependency_overrides[get_events] = lambda: events
    if provider is not None:
        app.dependency_overrides[get_helm_chart_version_provider] = lambda: provider
    return TestClient(app)


class _AcceptedEvents:
    def __init__(self) -> None:
        self.body: object | None = None
        self.actor: object | None = None
        self.stage_calls = 0

    async def accept_body(
        self,
        body: object,
        *,
        actor: object,
        transactional_stage: object,
    ) -> object:
        self.body = body
        self.actor = actor
        event = EventEnvelope(
            event_id="event-delete-source-a",
            subject="helm.chart_source.deleted",
            source="api-gateway",
            correlation_id="correlation-delete-source-a",
            causation_id=None,
            created_at="2026-07-17T09:00:00+00:00",
            workspace_id="workspace-a",
            payload=body.to_body(),  # type: ignore[attr-defined]
        )
        self.stage_calls += 1
        transactional_stage(object(), event)
        return SimpleNamespace(event=event)


def test_source_list_materializes_per_source_workspace_rbac_before_pagination() -> None:
    class Db:
        source_ids: set[str] | None = None
        permissions: list[str] = []

        def accessible_resource_ids(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            permission: str,
        ) -> set[str]:
            assert (user_id, workspace_id) == ("user-a", "workspace-a")
            assert resource_type == "helm_chart_source"
            self.permissions.append(permission)
            assert permission in {"catalog.read", "config.update"}
            return {"source-a"}

        def list_helm_chart_sources(
            self,
            *,
            workspace_id: str,
            limit: int,
            cursor: str | None,
            source_ids: set[str] | None,
        ) -> HelmChartSourcePage:
            assert workspace_id == "workspace-a"
            assert limit == 25
            assert cursor is None
            self.source_ids = source_ids
            return HelmChartSourcePage(
                items=(_source(),),
                limit=25,
                has_more=False,
                next_cursor=None,
            )

    db = Db()
    response = _client(db, admin=True).get("/helm/chart-sources?limit=25")

    assert response.status_code == 200
    assert db.source_ids == {"source-a"}
    assert db.permissions == ["catalog.read", "config.update"]
    assert response.json()["items"][0]["reference"] == "https://charts.example.com/stable"
    assert response.json()["items"][0]["actions"] == ["delete"]
    assert "credential_ref" not in response.text


def test_source_list_omits_delete_capability_for_non_admin_or_denied_source() -> None:
    class Db:
        def accessible_resource_ids(
            self,
            _user_id: str,
            _workspace_id: str,
            _resource_type: str,
            permission: str,
        ) -> set[str]:
            return {"source-a"} if permission == "catalog.read" else set()

        def list_helm_chart_sources(self, **_payload: object) -> HelmChartSourcePage:
            return HelmChartSourcePage(
                items=(_source(),),
                limit=50,
                has_more=False,
                next_cursor=None,
            )

    response = _client(Db(), admin=False).get("/helm/chart-sources")

    assert response.status_code == 200
    assert response.json()["items"][0]["actions"] == []


def test_admin_source_registration_reuses_encrypted_workspace_credential(
    monkeypatch,
) -> None:
    stored: dict[str, object] = {}

    class Db:
        @contextmanager
        def unit_of_work(self):
            yield

        def lock_workspace_credential_scope(
            self,
            workspace_id: str,
            provider: str,
            scope: str,
        ) -> None:
            stored["lock"] = (workspace_id, provider, scope)

        def upsert_workspace_credential(self, payload: dict[str, object]) -> dict[str, object]:
            stored["credential"] = payload
            return payload

        def register_helm_chart_source(self, **payload: object) -> HelmChartSource:
            stored["source"] = payload
            return _source(credentials_configured=True)

    monkeypatch.setattr(
        "domains.helm.source_router.encrypt_credential",
        lambda value: f"encrypted:{len(value)}",
    )
    response = _client(Db(), admin=True).post(
        "/helm/chart-sources",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
            "credential": {"kind": "bearer", "token": "top-secret-token"},
        },
    )

    assert response.status_code == 201
    assert response.json() == _source(credentials_configured=True).model_dump(mode="json")
    assert "top-secret-token" not in response.text
    credential = stored["credential"]
    assert isinstance(credential, dict)
    assert credential["encrypted_value"] != "top-secret-token"
    assert credential["provider"] == "helm_repository"
    source = stored["source"]
    assert isinstance(source, dict)
    assert str(source["credential_ref"]).startswith(
        "db:helm_repository:helm-chart-source/helm-source-"
    )


def test_admin_deletes_exact_workspace_source_and_credential_with_durable_audit_receipt() -> None:
    deleted: dict[str, object] = {}

    class Db:
        def can_access(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            resource_id: str,
            permission: str,
        ) -> bool:
            deleted["access"] = (
                user_id,
                workspace_id,
                resource_type,
                resource_id,
                permission,
            )
            return True

        def delete_helm_chart_source(self, **payload: object) -> dict[str, object]:
            deleted["source"] = payload
            return {
                "source_id": "source-a",
                "workspace_id": "workspace-a",
                "provider": "repository",
                "name": "stable",
                "canonical_ref": "https://charts.example.com/stable",
                "credential_ref": "db:helm_repository:helm-chart-source/source-a",
            }

        def delete_workspace_credential(
            self,
            workspace_id: str,
            provider: str,
            scope: str,
        ) -> bool:
            deleted["credential"] = (workspace_id, provider, scope)
            return True

    events = _AcceptedEvents()
    response = _client(Db(), admin=True, events=events).request(
        "DELETE",
        "/helm/chart-sources/source-a",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "accepted": True,
        "event_id": "event-delete-source-a",
        "correlation_id": "correlation-delete-source-a",
        "command_id": None,
    }
    assert deleted["access"] == (
        "user-a",
        "workspace-a",
        "helm_chart_source",
        "source-a",
        "config.update",
    )
    assert deleted["source"] == {
        "workspace_id": "workspace-a",
        "source_id": "source-a",
        "expected_provider": "repository",
        "expected_name": "stable",
        "expected_reference": "https://charts.example.com/stable",
    }
    assert deleted["credential"] == (
        "workspace-a",
        "helm_repository",
        "helm-chart-source/source-a",
    )
    assert events.stage_calls == 1
    assert events.body is not None
    assert events.body.to_body() == {  # type: ignore[attr-defined]
        "workspace_id": "workspace-a",
        "source_id": "source-a",
        "provider": "repository",
        "name": "stable",
        "reference": "https://charts.example.com/stable",
    }
    assert "credential" not in response.text


def test_source_delete_requires_resource_config_update_even_for_admin() -> None:
    class Db:
        def can_access(self, *_args: object) -> bool:
            return False

        def delete_helm_chart_source(self, **_payload: object) -> object:
            raise AssertionError("forbidden source must not be deleted")

    events = _AcceptedEvents()
    response = _client(Db(), admin=True, events=events).request(
        "DELETE",
        "/helm/chart-sources/source-a",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
        },
    )

    assert response.status_code == 403
    assert events.stage_calls == 0


def test_source_delete_identity_conflict_is_atomic_and_does_not_emit_receipt() -> None:
    from domains.helm.repository import HelmChartSourceIdentityConflict

    class Db:
        def can_access(self, *_args: object) -> bool:
            return True

        def delete_helm_chart_source(self, **_payload: object) -> object:
            raise HelmChartSourceIdentityConflict

    events = _AcceptedEvents()
    response = _client(Db(), admin=True, events=events).request(
        "DELETE",
        "/helm/chart-sources/source-a",
        json={
            "provider": "repository",
            "name": "stale-name",
            "reference": "https://charts.example.com/stable",
        },
    )

    assert response.status_code == 409
    assert events.stage_calls == 1
    assert response.json()["detail"] == "Helm chart source identity changed"


def test_source_delete_absence_is_idempotent_and_does_not_revoke_unrelated_credentials() -> None:
    from domains.helm.repository import HelmChartSourceNotFound

    class Db:
        def can_access(self, *_args: object) -> bool:
            return True

        def delete_helm_chart_source(self, **_payload: object) -> object:
            raise HelmChartSourceNotFound

        def delete_workspace_credential(self, *_args: object) -> object:
            raise AssertionError("an absent source has no credential to revoke")

    response = _client(Db(), admin=True, events=_AcceptedEvents()).request(
        "DELETE",
        "/helm/chart-sources/source-a",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Helm chart source not found"


def test_source_delete_stages_workspace_audit_event_in_the_mutation_unit_of_work() -> None:
    from packages.runtime.gateway import ApiEventGateway

    class Publisher:
        async def emit(self, *_args: object, **_kwargs: object) -> object:
            raise AssertionError("durable mutation must use the transactional outbox")

    class Db:
        def __init__(self) -> None:
            self.recorded: list[EventEnvelope] = []
            self.staged: list[EventEnvelope] = []
            self.mutated = False
            self.active = False

        @contextmanager
        def unit_of_work(self):
            assert not self.active
            self.active = True
            try:
                yield self
            finally:
                self.active = False

        def record_event(self, event: EventEnvelope) -> None:
            assert self.active
            self.recorded.append(event)

        def stage_events(self, conn: object, events: list[EventEnvelope]) -> None:
            assert self.active and conn is self
            self.staged.extend(events)

        def can_access(self, *_args: object) -> bool:
            return True

        def delete_helm_chart_source(self, **_payload: object) -> dict[str, object]:
            assert self.active
            self.mutated = True
            return {"credential_ref": None}

    db = Db()
    events = ApiEventGateway(Publisher(), db, "api-gateway")
    response = _client(db, admin=True, events=events).request(
        "DELETE",
        "/helm/chart-sources/source-a",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
        },
    )

    assert response.status_code == 200
    assert db.mutated is True
    assert db.recorded == db.staged
    assert len(db.recorded) == 1
    assert db.recorded[0].workspace_id == "workspace-a"
    assert str(db.recorded[0].subject) == "helm.chart_source.deleted"
    assert db.recorded[0].event_id == response.json()["event_id"]
    assert db.recorded[0].payload["requested_by"] == "user-a"
    assert db.recorded[0].payload["actor"] == {
        "user_id": "user-a",
        "roles": ["service_admin"],
    }
    assert "credential" not in db.recorded[0].payload


def test_malformed_credential_validation_never_echoes_token_or_password() -> None:
    class Db:
        pass

    token = "raw-bearer-token-must-never-echo"
    password = "raw-basic-password-must-never-echo"
    response = _client(Db(), admin=True).post(
        "/helm/chart-sources",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
            "credential": {
                "kind": "bearer",
                "token": token,
                "username": "unexpected",
                "password": password,
            },
        },
    )

    assert response.status_code == 422
    assert token not in response.text
    assert password not in response.text

    oversized_marker = "oversized-secret-marker"
    oversized = f"{oversized_marker}{'x' * 16_384}"
    response = _client(Db(), admin=True).post(
        "/helm/chart-sources",
        json={
            "provider": "oci",
            "name": "registry",
            "reference": "oci://registry.example.com/charts",
            "credential": {"kind": "bearer", "token": oversized},
        },
    )

    assert response.status_code == 422
    assert oversized_marker not in response.text


def test_registration_rejects_mismatched_credential_store_binding(monkeypatch) -> None:
    registered = False

    class Db:
        @contextmanager
        def unit_of_work(self):
            yield

        def lock_workspace_credential_scope(
            self,
            _workspace_id: str,
            _provider: str,
            _scope: str,
        ) -> None:
            return None

        def upsert_workspace_credential(self, payload: dict[str, object]) -> dict[str, object]:
            return {
                **payload,
                "workspace_id": "other-workspace",
            }

        def register_helm_chart_source(self, **_payload: object) -> HelmChartSource:
            nonlocal registered
            registered = True
            return _source(credentials_configured=True)

    monkeypatch.setattr(
        "domains.helm.source_router.encrypt_credential",
        lambda value: f"encrypted:{len(value)}",
    )
    response = _client(Db(), admin=True).post(
        "/helm/chart-sources",
        json={
            "provider": "repository",
            "name": "stable",
            "reference": "https://charts.example.com/stable",
            "credential": {"kind": "bearer", "token": "secret"},
        },
    )

    assert response.status_code == 503
    assert registered is False


def test_version_route_requires_source_access_and_decrypts_only_for_provider(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class Db:
        def can_access(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            resource_id: str,
            permission: str,
        ) -> bool:
            captured["access"] = (
                user_id,
                workspace_id,
                resource_type,
                resource_id,
                permission,
            )
            return True

        def get_helm_chart_source_record(
            self,
            *,
            workspace_id: str,
            source_id: str,
        ) -> dict[str, object]:
            return {
                "source_id": source_id,
                "workspace_id": workspace_id,
                "provider": "repository",
                "name": "stable",
                "canonical_ref": "https://charts.example.com/stable",
                "credential_ref": "db:helm_repository:helm-chart-source/source-a",
                "status": "active",
                "access_policy": {},
                "updated_at": datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
            }

        def get_workspace_credential(
            self,
            workspace_id: str,
            provider: str,
            scope: str,
        ) -> dict[str, object]:
            return {
                "workspace_id": workspace_id,
                "provider": provider,
                "scope": scope,
                "encrypted_value": "encrypted",
                "status": "active",
            }

    class Provider:
        async def fetch_versions(
            self,
            source: HelmChartSource,
            chart_name: str,
            *,
            credential: object | None = None,
        ) -> HelmChartVersionObservation:
            captured["provider"] = (source, chart_name, credential)
            return HelmChartVersionObservation(
                source=source,
                chart_name=chart_name,
                availability="available",
                versions=(HelmChartVersion(version="2.0.0"),),
                observed_at="2026-07-16T09:01:00+00:00",
            )

    monkeypatch.setattr(
        "domains.helm.source_router.decrypt_credential",
        lambda value: (
            '{"kind":"bearer","token":"provider-only-secret"}' if value == "encrypted" else value
        ),
    )
    response = _client(Db(), provider=Provider()).get(
        "/helm/chart-sources/source-a/charts/storefront/versions"
    )

    assert response.status_code == 200
    assert response.json()["versions"][0]["version"] == "2.0.0"
    assert "provider-only-secret" not in response.text
    assert captured["access"] == (
        "user-a",
        "workspace-a",
        "helm_chart_source",
        "source-a",
        "catalog.read",
    )
    provider_call = captured["provider"]
    assert isinstance(provider_call, tuple)
    assert provider_call[1] == "storefront"
    assert provider_call[2].token == "provider-only-secret"


def test_version_route_rejects_cross_source_credential_scope(monkeypatch) -> None:
    provider_called = False

    class Db:
        def can_access(self, *_args: object) -> bool:
            return True

        def get_helm_chart_source_record(
            self,
            *,
            workspace_id: str,
            source_id: str,
        ) -> dict[str, object]:
            return {
                "source_id": source_id,
                "workspace_id": workspace_id,
                "provider": "repository",
                "name": "stable",
                "canonical_ref": "https://charts.example.com/stable",
                "credential_ref": ("db:helm_repository:helm-chart-source/another-source"),
                "status": "active",
                "access_policy": {},
                "updated_at": datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
            }

        def get_workspace_credential(self, *_args: object) -> dict[str, object]:
            raise AssertionError("cross-source credential must not be loaded")

    class Provider:
        async def fetch_versions(self, *_args: object, **_kwargs: object) -> object:
            nonlocal provider_called
            provider_called = True
            raise AssertionError("provider must not receive a cross-source credential")

    monkeypatch.setattr(
        "domains.helm.source_router.decrypt_credential",
        lambda value: value,
    )
    response = _client(Db(), provider=Provider()).get(
        "/helm/chart-sources/source-a/charts/storefront/versions"
    )

    assert response.status_code == 200
    assert response.json()["availability"] == "unavailable"
    assert response.json()["reason_codes"] == ["helm_chart_source_credential_unavailable"]
    assert provider_called is False


def test_repository_update_refreshes_one_authorized_source_and_emits_audit() -> None:
    captured: dict[str, object] = {}

    class Db:
        def accessible_resource_ids(
            self,
            _user_id: str,
            workspace_id: str,
            resource_type: str,
            permission: str,
        ) -> set[str]:
            assert workspace_id == "workspace-a"
            assert resource_type == "helm_chart_source"
            assert permission == "config.update"
            return {"source-a"}

        def list_helm_chart_source_records(self, **_kwargs: object) -> SimpleNamespace:
            return SimpleNamespace(
                rows=(
                    {
                        "source_id": "source-a",
                        "workspace_id": "workspace-a",
                        "provider": "repository",
                        "name": "stable",
                        "canonical_ref": "https://charts.example.com/stable",
                        "credential_ref": None,
                        "status": "active",
                        "updated_at": datetime(2026, 7, 17, tzinfo=UTC),
                    },
                ),
                truncated=False,
            )

    class Provider:
        async def refresh_repository(
            self,
            source: HelmChartSource,
            *,
            credential: object | None = None,
        ) -> HelmRepositoryRefreshResult:
            captured["provider"] = (source, credential)
            return HelmRepositoryRefreshResult(
                source_id="source-a",
                chart_count=27,
                observed_at="2026-07-17T09:00:00+00:00",
            )

    class Events:
        async def accept_body(self, body: object, *, actor: object) -> object:
            captured["event"] = (body, actor)
            return SimpleNamespace(
                event=SimpleNamespace(
                    event_id="event-refresh-source-a",
                    correlation_id="correlation-refresh-source-a",
                )
            )

    response = _client(
        Db(),
        provider=Provider(),
        admin=True,
        events=Events(),
    ).post("/helm/repositories/stable/update")

    assert response.status_code == 200
    assert response.json() == {
        "source_id": "source-a",
        "chart_count": 27,
        "observed_at": "2026-07-17T09:00:00+00:00",
        "event_id": "event-refresh-source-a",
        "correlation_id": "correlation-refresh-source-a",
    }
    source, credential = captured["provider"]
    assert source.source_id == "source-a"
    assert credential is None
    body, actor = captured["event"]
    assert body.to_body() == {
        "workspace_id": "workspace-a",
        "source_id": "source-a",
        "name": "stable",
        "chart_count": 27,
        "observed_at": "2026-07-17T09:00:00+00:00",
    }
    assert actor.user_id == "user-a"
