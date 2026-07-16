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
from packages.contracts.helm.sources import (
    HelmChartSource,
    HelmChartSourcePage,
    HelmChartVersion,
    HelmChartVersionObservation,
)
from packages.runtime.dependencies import get_db


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
) -> TestClient:
    app = FastAPI()
    app.include_router(helm_source_router)
    app.dependency_overrides[require_session] = lambda: _current(admin=admin)
    app.dependency_overrides[require_admin_session] = lambda: _current(admin=True)
    app.dependency_overrides[get_db] = lambda: db
    if provider is not None:
        app.dependency_overrides[get_helm_chart_version_provider] = lambda: provider
    return TestClient(app)


def test_source_list_materializes_per_source_workspace_rbac_before_pagination() -> None:
    class Db:
        source_ids: set[str] | None = None

        def accessible_resource_ids(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            permission: str,
        ) -> set[str]:
            assert (user_id, workspace_id) == ("user-a", "workspace-a")
            assert resource_type == "helm_chart_source"
            assert permission == "catalog.read"
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
    response = _client(db).get("/helm/chart-sources?limit=25")

    assert response.status_code == 200
    assert db.source_ids == {"source-a"}
    assert response.json()["items"][0]["reference"] == "https://charts.example.com/stable"
    assert "credential_ref" not in response.text


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
