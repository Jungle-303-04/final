"""연결 전 desired vs live 프리뷰 엔드포인트 — 생성/변경/유지/겹침 분류(라우터 단위)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from domains.applications import router as app_router
from domains.applications.ownership import resource_identity_key
from domains.applications.router import connect_application_preview
from packages.contracts.gateway.requests import RepositoryConnectionPreviewRequest


def _deployment_desired(name: str, image: str, replicas: int = 2):
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "namespace": "prod"},
        "spec": {
            "replicas": replicas,
            "template": {"spec": {"containers": [{"name": name, "image": image}]}},
        },
    }


def _service_desired(name: str):
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "namespace": "prod"},
        "spec": {"type": "ClusterIP", "selector": {"app": name}, "ports": [{"port": 80}]},
    }


def _deployment_raw(name: str, image: str, replicas: int = 2):
    return {
        "kind": "Deployment",
        "api_version": "apps/v1",
        "name": name,
        "namespace": "prod",
        "desired_replicas": replicas,
        "pod_template": {"spec": {"containers": [{"name": name, "image": image}]}},
    }


class _FakeDiscovery:
    def __init__(self, objects: list[dict]) -> None:
        self._objects = objects

    async def render_desired_objects(self, _payload):
        return "a" * 40, list(self._objects), ["render warning"]


class _StubPreviewDb:
    def __init__(self, live: dict[str, dict], owned: dict[str, dict]) -> None:
        self._live = live
        self._owned = owned

    def list_owned_resource_identities(self, workspace_id, cluster_id, *, exclude_application_id=None):
        return self._owned

    def get_actual_resource_manifest(self, workspace_id, cluster_id, namespace, resource):
        return self._live.get(resource)


@pytest.fixture(autouse=True)
def _bypass_guards(monkeypatch):
    # 인가/자격증명 가드는 프리뷰 diff 로직과 무관하므로 무력화(단위 테스트 격리).
    monkeypatch.setattr(app_router, "require_deployment_target_cluster", lambda *a, **k: None)
    monkeypatch.setattr(app_router, "require_cluster_access", lambda *a, **k: None)
    monkeypatch.setattr(app_router, "require_repository_manage_if_registered", lambda *a, **k: None)
    monkeypatch.setattr(app_router, "authorized_stored_repo_credential_ref", lambda *a, **k: None)


def _run(*, objects, live, owned):
    request = RepositoryConnectionPreviewRequest(
        repo_ref="o/app",
        branch="main",
        manifest_path="k8s/app.yaml",
        source_type="raw-yaml",
        cluster_id="c-1",
        namespace="prod",
    )
    return asyncio.run(
        connect_application_preview(
            payload=request,
            current=SimpleNamespace(user_id="u", roles=("user",), workspace_id="ws-1"),
            db=_StubPreviewDb(live, owned),
            discovery=_FakeDiscovery(objects),
        )
    )


def test_classifies_create_update_in_sync_and_conflict() -> None:
    objects = [
        _deployment_desired("api", "repo/api:v2"),  # live v1 → update
        _deployment_desired("worker", "repo/worker:v1"),  # live v1 → in_sync
        _service_desired("api-svc"),  # live 없음 → create
        _deployment_desired("shared", "repo/shared:v1"),  # 다른 앱 소유 → conflict
    ]
    live = {
        "deployment/api": {"raw": _deployment_raw("api", "repo/api:v1")},
        "deployment/worker": {"raw": _deployment_raw("worker", "repo/worker:v1")},
    }
    owned = {
        resource_identity_key("apps/v1", "Deployment", "prod", "shared"): {
            "application_id": "app-x",
            "app_name": "OwnerApp",
        }
    }
    response = _run(objects=objects, live=live, owned=owned)

    by_name = {r.name: r for r in response.resources}
    assert by_name["api"].change == "update"
    assert by_name["worker"].change == "in_sync"
    assert by_name["api-svc"].change == "create"
    assert by_name["shared"].change == "conflict"
    assert by_name["shared"].owned_by == "OwnerApp"

    assert response.create_count == 1
    assert response.update_count == 1
    assert response.in_sync_count == 1
    assert response.conflict_count == 1
    assert response.live_observed is True
    assert response.revision == "a" * 40
    assert "render warning" in response.warnings

    # update 리소스는 이미지 before/after 필드 변경을 담는다.
    image_change = next(
        c for c in by_name["api"].field_changes if c.field_path.endswith(".image")
    )
    assert image_change.before == "repo/api:v1"
    assert image_change.after == "repo/api:v2"


def test_all_create_when_no_live_observation() -> None:
    # get_actual_resource_manifest 가 아무것도 못 찾으면 전부 생성 예정, live_observed=False.
    objects = [_deployment_desired("api", "repo/api:v2"), _service_desired("api-svc")]
    response = _run(objects=objects, live={}, owned={})
    assert response.create_count == 2
    assert response.live_observed is False
    assert all(r.change == "create" for r in response.resources)
