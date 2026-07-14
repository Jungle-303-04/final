from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
route = importlib.import_module("scripts.cloudflare.reconcile_tunnel_route")


class FakeAPI:
    def __init__(self) -> None:
        self.requests: list[tuple[str, str, dict[str, Any] | None]] = []

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        del query
        self.requests.append((method, path, body))
        return {}


def test_route_plan_replaces_dangling_origin_dns_and_preserves_fallback() -> None:
    tunnel_id = "123e4567-e89b-12d3-a456-426614174000"
    state = route.RouteState(
        tunnel_config={
            "ingress": [
                {"hostname": "other.example.com", "service": "http://other:80"},
                {"service": "http_status:404"},
            ]
        },
        dns_records=[
            {
                "id": "record-id",
                "type": "CNAME",
                "name": "k8s.woonyong.org",
                "content": "deleted-console.elb.amazonaws.com",
                "ttl": 1,
                "proxied": True,
            }
        ],
    )

    plan = route.build_route_plan(
        state,
        hostname="k8s.woonyong.org",
        origin_service="http://console-dev.management.svc.cluster.local:80",
        tunnel_id=tunnel_id,
    )

    assert plan.tunnel_action == "create"
    assert plan.dns_action == "update"
    assert plan.dns_record["content"] == f"{tunnel_id}.cfargotunnel.com"
    assert plan.tunnel_config["ingress"] == [
        {"hostname": "other.example.com", "service": "http://other:80"},
        {
            "hostname": "k8s.woonyong.org",
            "service": "http://console-dev.management.svc.cluster.local:80",
        },
        {"service": "http_status:404"},
    ]


def test_apply_route_plan_updates_tunnel_before_dns() -> None:
    api = FakeAPI()
    plan = route.RoutePlan(
        tunnel_action="update",
        tunnel_config={"ingress": [{"service": "http_status:404"}]},
        dns_action="update",
        dns_record_id="record-id",
        dns_record={"type": "CNAME", "name": "k8s.woonyong.org"},
    )

    route.apply_route_plan(
        api,
        plan,
        account_id="a" * 32,
        zone_id="z" * 32,
        tunnel_id="123e4567-e89b-12d3-a456-426614174000",
    )

    assert [request[:2] for request in api.requests] == [
        (
            "PUT",
            "/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cfd_tunnel/"
            "123e4567-e89b-12d3-a456-426614174000/configurations",
        ),
        ("PUT", "/zones/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/dns_records/record-id"),
    ]


def test_manifest_and_workflow_lock_the_canonical_cloudflare_route() -> None:
    documents = list(yaml.safe_load_all((ROOT / "deploy/management/cloudflared.yaml").read_text()))
    deployment = next(document for document in documents if document["kind"] == "Deployment")
    annotations = deployment["metadata"]["annotations"]
    workflow = yaml.safe_load(
        (ROOT / ".github/workflows/cloudflare-route-reconcile.yml").read_text()
    )
    command = workflow["jobs"]["reconcile"]["steps"][-1]["run"]

    assert annotations == {
        "opsia.io/cloudflare-hostname": "k8s.woonyong.org",
        "opsia.io/cloudflare-origin-service": (
            "http://console-dev.management.svc.cluster.local:80"
        ),
    }
    assert '--hostname "k8s.woonyong.org"' in command
    assert '--origin-service "http://console-dev.management.svc.cluster.local:80"' in command
