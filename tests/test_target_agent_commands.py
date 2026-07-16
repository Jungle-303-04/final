from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from packages.config.constants import Command
from packages.contracts.helm import (
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
    HelmArtifactResult,
)
from packages.contracts.service_access import (
    SERVICE_HTTP_REQUEST_AGENT_CAPABILITY,
    SERVICE_REQUEST_MAX_BODY_BYTES,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_PATH = ROOT_DIR / "src" / "services" / "target" / "cluster-agent" / "agent.py"


def load_agent_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_agent_command_module",
        TARGET_AGENT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {TARGET_AGENT_PATH}")

    module = importlib.util.module_from_spec(spec)
    previous_agent_module = sys.modules.pop(spec.name, None)
    module_names = (
        "config",
        "queries",
        "queries.payloads",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "commands",
        "commands.context",
        "commands.helm",
        "commands.kubernetes",
        "commands.outbox",
        "commands.registry",
        "commands.service_access",
        "control",
        "control.policy",
        "control.reconciler",
        "control.store",
        "providers",
        "providers.base",
        "providers.collection_limits",
        "providers.kubernetes_utils",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.metadata_config_objects",
        "providers.metadata_config_refs",
        "providers.metadata_endpoint_slices",
        "providers.metadata_ownership",
        "providers.metadata_resource_quotas",
        "providers.metadata_providers",
        "providers.metadata_service_selectors",
        "providers.metadata_workload_snapshots",
        "providers.prometheus_analysis",
        "providers.prometheus_providers",
        "providers.tempo_analysis",
        "providers.tempo_providers",
        "kubernetes_api",
        "evidence",
        "evidence.collector",
        "evidence.jobs",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_PATH.parent))
    try:
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(TARGET_AGENT_PATH.parent))
        sys.modules.pop(spec.name, None)
        if previous_agent_module is not None:
            sys.modules[spec.name] = previous_agent_module
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


class StubKubernetesClient:
    def __init__(self) -> None:
        self.patches: list[dict[str, object]] = []
        self.cluster_patches: list[dict[str, object]] = []
        self.creates: list[dict[str, object]] = []
        self.namespaced_deletes: list[dict[str, object]] = []
        self.cluster_deletes: list[dict[str, object]] = []

    async def get_namespaced_resource(self, **_kwargs: object) -> dict[str, object]:
        return {}

    async def patch_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.patches.append(kwargs)
        return {"patched": True}

    async def patch_cluster_resource(self, **kwargs: object) -> dict[str, object]:
        self.cluster_patches.append(kwargs)
        return {"patched": True}

    async def create_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.creates.append(kwargs)
        return {"metadata": {"name": "nightly-manual-abc"}}

    async def delete_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.namespaced_deletes.append(kwargs)
        return {"deleted": True}

    async def delete_cluster_resource(self, **kwargs: object) -> dict[str, object]:
        self.cluster_deletes.append(kwargs)
        return {"deleted": True}


class StubCommandResultClient:
    def __init__(self, *, fail_once: bool = False) -> None:
        self.fail_once = fail_once
        self.completed: list[dict[str, object]] = []

    async def complete_command(
        self,
        command_id: str,
        workspace_id: str,
        lease_id: str,
        agent_id: str,
        result: dict[str, object],
    ) -> None:
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("gateway unavailable")
        self.completed.append(
            {
                "command_id": command_id,
                "workspace_id": workspace_id,
                "lease_id": lease_id,
                "agent_id": agent_id,
                "result": result,
            }
        )


class FailingDeleteKubernetesClient(StubKubernetesClient):
    async def delete_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        if kwargs.get("name") == "target-runtime-config":
            raise RuntimeError("delete forbidden")
        return await super().delete_namespaced_resource(**kwargs)


class RetryingDeploymentDeleteClient(StubKubernetesClient):
    def __init__(self, failures: int) -> None:
        super().__init__()
        self.failures = failures
        self.attempts = 0

    async def delete_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.attempts += 1
        if self.attempts <= self.failures:
            raise RuntimeError("temporary Kubernetes API failure")
        return await super().delete_namespaced_resource(**kwargs)


def register_agent_commands(module: object, agent: object) -> None:
    agent.command_registry = module.AgentCommandRegistry.from_instance(
        agent,
        cluster_id=agent.cluster_id,
        cluster_role=agent.cluster_role,
        kubernetes=agent.kubernetes,
        default_handler=agent.apply_default_command,
    )


class ServiceKubernetesClient(StubKubernetesClient):
    def __init__(self, service: dict[str, object]) -> None:
        super().__init__()
        self.service = service
        self.gets: list[dict[str, object]] = []

    async def get_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.gets.append(kwargs)
        return self.service


class CronJobKubernetesClient(StubKubernetesClient):
    def __init__(self, *, uid: str = "cronjob-uid-1") -> None:
        super().__init__()
        self.gets: list[dict[str, object]] = []
        self.uid = uid

    async def get_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.gets.append(kwargs)
        return {
            "apiVersion": "batch/v1",
            "kind": "CronJob",
            "metadata": {
                "name": "nightly",
                "namespace": str(kwargs["namespace"]),
                "uid": self.uid,
            },
            "spec": {
                "jobTemplate": {
                    "metadata": {"labels": {"job": "nightly"}},
                    "spec": {
                        "template": {
                            "spec": {
                                "restartPolicy": "Never",
                                "containers": [{"name": "job", "image": "example/job:v1"}],
                            }
                        }
                    },
                }
            },
        }


def cronjob_command_payload(
    *,
    namespace: str = "team-jobs",
    uid: str = "cronjob-uid-1",
) -> dict[str, object]:
    return {
        "namespace": namespace,
        "name": "nightly",
        "resource_ref": {
            "api_group": "batch",
            "version": "v1",
            "kind": "CronJob",
            "namespace": namespace,
            "name": "nightly",
            "uid": uid,
        },
    }


def approval_evidence(
    *,
    expires_at: str = "2099-01-01T00:00:00Z",
) -> dict[str, str]:
    return {
        "approval_ref": "approval-1",
        "policy_decision_ref": "policy-decision-1",
        "approval_decided_by": "approver-1",
        "approval_expires_at": expires_at,
    }


def test_agent_unwraps_queued_command_payload() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)

    payload = agent.command_payload(
        {
            "payload": {
                "command_id": "cmd-1",
                "action": module.QUERY_RUN_ACTION,
                "payload": {
                    "query": {
                        "source": "prometheus",
                        "name": "one_off_up",
                        "query": "up",
                    }
                },
            }
        }
    )

    assert payload["query"]["source"] == "prometheus"


def service_http_command(
    module: object,
    *,
    uid: str = "uid-service-1",
    port: int = 80,
    path: str = "/ready",
) -> dict[str, object]:
    return {
        "command_id": "cmd-service-1",
        "action": module.SERVICE_HTTP_REQUEST_ACTION,
        "payload": {
            "resource": {
                "api_group": "",
                "version": "v1",
                "kind": "Service",
                "namespace": "shop",
                "name": "checkout-api",
                "uid": uid,
            },
            "port": port,
            "scheme": "http",
            "path": path,
        },
    }


def service_api_object() -> dict[str, object]:
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "namespace": "shop",
            "name": "checkout-api",
            "uid": "uid-service-1",
        },
        "spec": {
            "type": "ClusterIP",
            "clusterIP": "10.96.0.10",
            "ports": [
                {
                    "name": "http",
                    "protocol": "TCP",
                    "port": 80,
                    "targetPort": 8080,
                    "appProtocol": "http",
                }
            ],
        },
    }


def configured_service_agent(module: object, transport: httpx.MockTransport):
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = True
    agent.kubernetes = ServiceKubernetesClient(service_api_object())
    agent.service_http_transport = transport
    register_agent_commands(module, agent)
    return agent


def test_service_http_command_revalidates_uid_and_returns_bounded_result() -> None:
    module = load_agent_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            headers={
                "content-type": "application/json",
                "set-cookie": "secret=session",
            },
            json={"ready": True},
        )

    agent = configured_service_agent(module, httpx.MockTransport(handler))
    result = asyncio.run(agent.execute_command(service_http_command(module)))

    assert result["status"] == "completed"
    assert result["service_request"] == {
        "status": 200,
        "status_text": "OK",
        "duration_ms": pytest.approx(result["service_request"]["duration_ms"]),
        "headers": {"content-length": "14", "content-type": "application/json"},
        "body": '{"ready":true}',
        "truncated": False,
        "body_bytes": 14,
        "error": None,
    }
    assert requests[0].url == "http://checkout-api.shop.svc:80/ready"
    assert agent.kubernetes.gets == [
        {
            "api_group": "core",
            "version": "v1",
            "namespace": "shop",
            "resource": "services",
            "name": "checkout-api",
        }
    ]


def test_service_http_command_rejects_stale_uid_before_network_access() -> None:
    module = load_agent_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200)

    agent = configured_service_agent(module, httpx.MockTransport(handler))
    result = asyncio.run(
        agent.execute_command(service_http_command(module, uid="stale-service-uid"))
    )

    assert result["status"] == "failed"
    assert result["error_code"] == "service_identity_changed"
    assert requests == []


def test_service_http_command_truncates_response_and_advertises_capability() -> None:
    module = load_agent_module()
    body = b"x" * (SERVICE_REQUEST_MAX_BODY_BYTES + 32)
    agent = configured_service_agent(
        module,
        httpx.MockTransport(lambda _request: httpx.Response(200, content=body)),
    )

    result = asyncio.run(agent.execute_command(service_http_command(module)))

    assert result["status"] == "completed"
    assert result["service_request"]["truncated"] is True
    assert result["service_request"]["body_bytes"] == SERVICE_REQUEST_MAX_BODY_BYTES
    assert len(result["service_request"]["body"].encode()) == SERVICE_REQUEST_MAX_BODY_BYTES
    assert SERVICE_HTTP_REQUEST_AGENT_CAPABILITY in module.AgentConfig.AGENT_CAPABILITIES


def test_helm_artifact_command_returns_only_the_typed_sanitized_projection(monkeypatch) -> None:
    module = load_agent_module()
    artifact = HelmArtifactResult(
        artifact="manifest",
        format="yaml",
        namespace="storefront",
        release_name="storefront",
        revision=3,
        content="---\nkind: Deployment\n",
        content_sha256="0" * 64,
        content_bytes=21,
        source_bytes=64,
        redaction_applied=True,
    )
    monkeypatch.setattr(
        module,
        "run_helm_artifact_query",
        lambda _payload: SimpleNamespace(succeeded=True, artifact=artifact, error_code=""),
    )
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = False
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "command_id": "cmd-helm-artifact-1",
                "action": HELM_RELEASE_ARTIFACT_READ_ACTION,
                "payload": {
                    "cluster_id": "cluster-1",
                    "namespace": "storefront",
                    "release_name": "storefront",
                    "artifact": "manifest",
                    "revision": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["artifact"] == artifact.model_dump(mode="json", exclude_none=True)
    assert HELM_RELEASE_ARTIFACT_READ_CAPABILITY in module.AgentConfig.AGENT_CAPABILITIES


def test_helm_structured_diff_command_never_emits_raw_hook_manifests(monkeypatch) -> None:
    module = load_agent_module()
    artifact = HelmArtifactResult(
        artifact="hooks_diff",
        format="structured",
        namespace="storefront",
        release_name="storefront",
        revision=2,
        comparison_revision=3,
        source_bytes=200,
        redaction_applied=True,
        projection_sha256="0" * 64,
        projection_bytes=128,
        hooks_diff={
            "revision1": 2,
            "revision2": 3,
            "added": [],
            "removed": [],
            "modified": [
                {
                    "api_version": "batch/v1",
                    "kind": "Job",
                    "name": "migrate",
                    "namespace": "storefront",
                    "events": ["pre-upgrade"],
                    "weight": 1,
                    "delete_policies": [],
                    "output_log_policies": [],
                    "manifest_changed": True,
                }
            ],
            "unchanged": [],
            "parse_error_count": 0,
        },
    )
    monkeypatch.setattr(
        module,
        "run_helm_artifact_query",
        lambda _payload: SimpleNamespace(succeeded=True, artifact=artifact, error_code=""),
    )
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = False
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "command_id": "cmd-helm-hooks-1",
                "action": HELM_RELEASE_ARTIFACT_READ_ACTION,
                "payload": {
                    "cluster_id": "cluster-1",
                    "namespace": "storefront",
                    "release_name": "storefront",
                    "artifact": "hooks_diff",
                    "revision": 2,
                    "comparison_revision": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["artifact"]["hooks_diff"]["modified"][0]["name"] == "migrate"
    assert "manifest" not in result["artifact"]["hooks_diff"]["modified"][0]
    assert "must-not-leak" not in str(result)


def test_apply_manifest_keeps_plan_diff_payload() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    applied: dict[str, object] = {}

    async def stub_apply(manifest: dict[str, object], namespace: str) -> tuple[bool, str, dict]:
        applied["manifest"] = manifest
        applied["namespace"] = namespace
        return True, "manifest applied", {}

    agent.apply_kubernetes_manifest = stub_apply
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.AgentConfig.APPLY_MANIFEST_ACTION,
                **approval_evidence(),
                "payload": {
                    "diff": {
                        "resource": "configmap/demo-target-config",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "v1",
                            "kind": "ConfigMap",
                            "metadata": {
                                "name": "demo-target-config",
                                "namespace": "sandbox",
                            },
                            "data": {"DEMO_MODE": "normal"},
                        },
                    },
                    "payload": {},
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert applied["namespace"] == "sandbox"
    assert applied["manifest"]["kind"] == "ConfigMap"


def test_apply_manifest_reports_each_document_and_partial_failure() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    applied: list[str] = []

    async def stub_apply(
        manifest: dict[str, object],
        namespace: str,
        *,
        expected_uid: str | None = None,
    ) -> tuple[bool, str, dict]:
        metadata = manifest["metadata"]
        assert isinstance(metadata, dict)
        name = str(metadata["name"])
        applied.append(name)
        assert namespace == "sandbox"
        if name == "checkout-api":
            assert expected_uid == "deployment-uid-1"
            return True, "manifest applied", {}
        assert expected_uid is None
        return False, "configmap rejected", {}

    agent.apply_kubernetes_manifest = stub_apply
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.AgentConfig.APPLY_MANIFEST_ACTION,
                "direct_execution": True,
                "payload": {
                    "diff": {
                        "resource": "Deployment/checkout-api",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "apps/v1",
                            "kind": "Deployment",
                            "metadata": {"name": "checkout-api", "namespace": "sandbox"},
                        },
                    },
                    "payload": {
                        "resource_ref": {
                            "kind": "Deployment",
                            "namespace": "sandbox",
                            "name": "checkout-api",
                            "uid": "deployment-uid-1",
                        },
                        "desired_documents": [
                            {
                                "apiVersion": "apps/v1",
                                "kind": "Deployment",
                                "metadata": {
                                    "name": "checkout-api",
                                    "namespace": "sandbox",
                                },
                            },
                            {
                                "apiVersion": "v1",
                                "kind": "ConfigMap",
                                "metadata": {"name": "shared", "namespace": "sandbox"},
                            },
                        ],
                    },
                },
            }
        )
    )

    assert applied == ["checkout-api", "shared"]
    assert result["status"] == "failed"
    assert result["applied"] is True
    assert result["completeness"] == "partial"
    assert [(item["resource"], item["status"]) for item in result["resources"]] == [
        ("Deployment/checkout-api", "completed"),
        ("ConfigMap/shared", "failed"),
    ]


def test_create_manifest_dry_run_reports_per_document_partial_without_applied_state() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    calls: list[tuple[str, bool, bool]] = []

    async def stub_create(
        manifest: dict[str, object],
        namespace: str,
        *,
        dry_run: bool,
        force: bool,
        field_manager: str,
    ) -> tuple[bool, str, dict[str, object]]:
        metadata = manifest["metadata"]
        assert isinstance(metadata, dict)
        name = str(metadata["name"])
        assert namespace == "sandbox"
        assert field_manager == "opsia-resource-create"
        calls.append((name, dry_run, force))
        return (name == "checkout-api", f"validated {name}", {})

    agent.create_kubernetes_manifest = stub_create
    register_agent_commands(module, agent)
    desired_sha256 = "sha256:" + "d" * 64

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.AgentConfig.APPLY_MANIFEST_ACTION,
                "direct_execution": True,
                "payload": {
                    "diff": {"namespace": "sandbox"},
                    "payload": {
                        "create_mode": True,
                        "dry_run": True,
                        "force": False,
                        "force_confirmation": False,
                        "field_manager": "opsia-resource-create",
                        "desired_sha256": desired_sha256,
                        "desired_documents": [
                            {
                                "apiVersion": "apps/v1",
                                "kind": "Deployment",
                                "metadata": {
                                    "name": "checkout-api",
                                    "namespace": "sandbox",
                                },
                            },
                            {
                                "apiVersion": "v1",
                                "kind": "ConfigMap",
                                "metadata": {"name": "shared", "namespace": "sandbox"},
                            },
                        ],
                    },
                },
            }
        )
    )

    assert calls == [("checkout-api", True, False), ("shared", True, False)]
    assert result["status"] == "failed"
    assert result["applied"] is False
    assert result["dry_run"] is True
    assert result["desired_sha256"] == desired_sha256
    assert result["completeness"] == "partial"


def test_rollout_restart_keeps_plan_diff_payload() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    restarted: dict[str, object] = {}

    async def stub_patch(
        namespace: str, deployment: str, patch: dict[str, object]
    ) -> tuple[bool, str, dict[str, object]]:
        restarted.update(
            namespace=namespace,
            deployment=deployment,
            patch=patch,
        )
        return True, "deployment restarted", {"ready": True}

    agent.patch_deployment = stub_patch
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.AgentConfig.ROLLOUT_RESTART_ACTION,
                "payload": {
                    "diff": {
                        "resource": "deployment/report-generator",
                        "namespace": "sandbox",
                    },
                    "payload": {},
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert restarted["namespace"] == "sandbox"
    assert restarted["deployment"] == "report-generator"
    assert restarted["patch"] == module.build_rollout_restart_patch()


def test_rollout_restart_requires_recorded_approval_outside_sandbox(monkeypatch) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,color-turf")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.AgentConfig.ROLLOUT_RESTART_ACTION,
                "payload": {
                    "diff": {
                        "resource": "deployment/color-turf-server",
                        "namespace": "color-turf",
                    },
                    "payload": {},
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "requires approval_ref" in result["message"]
    assert agent.kubernetes.patches == []


def test_catalog_helm_install_command_reports_only_real_runner_success(monkeypatch) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    calls: list[object] = []

    def fake_runner(payload: object) -> SimpleNamespace:
        calls.append(payload)
        return SimpleNamespace(succeeded=True, error_code="", returncode=0)

    monkeypatch.setattr(module, "run_catalog_helm_install", fake_runner, raising=False)
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.CATALOG_HELM_INSTALL_ACTION,
                "payload": {
                    "catalog_item_id": "catalog-postgresql",
                    "catalog_version": "1.0.0",
                    "namespace": "sandbox",
                    "application_name": "orders-db",
                    "release_name": "orders-db",
                    "values": {"auth.database": "orders"},
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert result["message"] == "catalog Helm install completed"
    assert result["catalog_item_id"] == "catalog-postgresql"
    assert result["catalog_version"] == "1.0.0"
    assert result["release_name"] == "orders-db"
    assert len(calls) == 1
    assert calls[0].namespace == "sandbox"


def test_target_agent_advertises_catalog_helm_runner_capability() -> None:
    module = load_agent_module()

    assert "catalog_helm_install" in module.AgentConfig.AGENT_CAPABILITIES


def test_catalog_helm_install_command_preserves_runner_failure(monkeypatch) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()

    monkeypatch.setattr(
        module,
        "run_catalog_helm_install",
        lambda _payload: SimpleNamespace(
            succeeded=False,
            error_code="helm_timeout",
            returncode=None,
        ),
        raising=False,
    )
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.CATALOG_HELM_INSTALL_ACTION,
                "payload": {
                    "catalog_item_id": "catalog-postgresql",
                    "catalog_version": "1.0.0",
                    "namespace": "sandbox",
                    "application_name": "orders-db",
                    "release_name": "orders-db",
                    "values": {"auth.database": "orders"},
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["applied"] is False
    assert result["message"] == "catalog Helm install failed: helm_timeout"
    assert "orders" not in result["stdout"]
    assert "orders" not in result["stderr"]


def test_management_agent_blocks_catalog_runner_before_subprocess(monkeypatch) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.agent_id = "agent-1"
    agent.cluster_role = "management"
    agent.kubernetes = StubKubernetesClient()
    calls: list[object] = []
    monkeypatch.setattr(
        module,
        "run_catalog_helm_install",
        lambda payload: calls.append(payload),
        raising=False,
    )
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.CATALOG_HELM_INSTALL_ACTION,
                "payload": {
                    "catalog_item_id": "catalog-postgresql",
                    "catalog_version": "1.0.0",
                    "namespace": "sandbox",
                    "application_name": "orders-db",
                    "release_name": "orders-db",
                    "values": {"auth.database": "orders"},
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "management_readonly"
    assert calls == []


def test_rca_test_inject_command_returns_real_fault_observation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    calls: list[tuple[str, str]] = []

    expires_at = "2099-01-01T00:00:00+00:00"

    async def stub_inject(
        scenario: object, run_id: str, authoritative_expires_at: str
    ) -> dict[str, object]:
        calls.append((scenario.scenario_id, f"{run_id}:{authoritative_expires_at}"))
        return {
            "fault_observed": True,
            "namespace": "sandbox",
            "resource_kind": "Deployment",
            "resource_name": "rca-test-image-wrong-tag",
            "label_selector": f"kubeheal.io/rca-test-run={run_id}",
            "pod_names": ["rca-test-image-wrong-tag-7f8d9c6b5-x2k4m"],
        }

    agent.inject_rca_test_scenario = stub_inject
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.RCA_TEST_SCENARIO_INJECT_ACTION,
                "payload": {
                    "run_id": "run-1",
                    "scenario_id": "image.wrong-tag",
                    "scenario_version": 1,
                    "namespace": "sandbox",
                    "resource_name": "rca-test-image-wrong-tag",
                    "expected_root_cause": "wrong_image_tag",
                    "expected_symptom": "ImagePullBackOff",
                    "expires_at": expires_at,
                },
            }
        )
    )

    assert calls == [("image.wrong-tag", f"run-1:{expires_at}")]
    assert result["status"] == "completed"
    assert result["applied"] is True
    assert result["rca_test"]["fault_observed"] is True
    assert result["rca_test"]["scenario_id"] == "image.wrong-tag"
    assert result["rca_test"]["evidence_sources"] == ["kubernetes"]
    assert result["rca_test"]["pod_names"] == ["rca-test-image-wrong-tag-7f8d9c6b5-x2k4m"]


def test_rca_test_injection_uses_registered_adapter_trigger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    scenario = module.test_scenario_by_id("image.wrong-tag")
    assert scenario is not None
    calls: list[tuple[str, object]] = []

    class SpyAdapter:
        def build_trigger(
            self,
            selected: object,
            run_id: str,
            expires_at: str,
        ) -> list[dict[str, object]]:
            calls.append(("build_trigger", (selected, run_id, expires_at)))
            return [{"apiVersion": "v1", "kind": "SpyFixture", "metadata": {}}]

    class SpyRegistry:
        def adapter_for(self, selected: object) -> SpyAdapter:
            calls.append(("adapter_for", selected))
            return SpyAdapter()

    monkeypatch.setattr(
        module,
        "default_test_scenario_adapter_registry",
        lambda: SpyRegistry(),
    )
    agent = object.__new__(module.TargetClusterAgent)

    async def fixture_available(_scenario: object, _run_id: str) -> None:
        return None

    async def apply_manifest(
        manifest: object,
        namespace: str,
    ) -> tuple[bool, str, dict[str, object]]:
        calls.append(("apply", (manifest, namespace)))
        return True, "applied", {}

    async def observed(_scenario: object, _run_id: str) -> list[str]:
        return ["spy-pod"]

    agent.ensure_rca_test_fixture_available = fixture_available
    agent.apply_kubernetes_manifest = apply_manifest
    agent.wait_for_rca_test_observation = observed

    result = asyncio.run(
        agent.inject_rca_test_scenario(
            scenario,
            "run-spy",
            "2099-01-01T00:00:00+00:00",
        )
    )

    assert [name for name, _value in calls] == ["adapter_for", "build_trigger", "apply"]
    assert result["pod_names"] == ["spy-pod"]


def test_target_agent_requires_verification_mode_for_pending_scenario() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    payload = {
        "run_id": "run-pending",
        "scenario_id": "image.registry-down",
        "scenario_version": 1,
        "namespace": "sandbox",
        "resource_name": "rca-test-image-registry-down",
        "expected_root_cause": "registry_unavailable",
        "expected_symptom": "ImagePullBackOff",
        "cleanup_adapter": "kubernetes.manifest_delete",
        "expires_at": "2099-01-01T00:00:00+00:00",
        "verification_mode": False,
    }

    with pytest.raises(ValueError, match="verification mode"):
        agent.rca_test_command_scenario(payload)

    payload["verification_mode"] = True
    run_id, scenario, expires_at = agent.rca_test_command_scenario(payload)

    assert run_id == "run-pending"
    assert scenario.scenario_id == "image.registry-down"
    assert expires_at == "2099-01-01T00:00:00+00:00"


def test_expired_rca_test_inject_fails_before_manifest_apply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    apply_calls: list[object] = []

    async def must_not_apply(
        *args: object, **kwargs: object
    ) -> tuple[bool, str, dict[str, object]]:
        apply_calls.append((args, kwargs))
        return True, "applied", {}

    async def fixture_available(*_args: object) -> None:
        return None

    agent.apply_kubernetes_manifest = must_not_apply
    agent.ensure_rca_test_fixture_available = fixture_available
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.RCA_TEST_SCENARIO_INJECT_ACTION,
                "payload": {
                    "run_id": "run-1",
                    "scenario_id": "image.wrong-tag",
                    "scenario_version": 1,
                    "namespace": "sandbox",
                    "resource_name": "rca-test-image-wrong-tag",
                    "expected_root_cause": "wrong_image_tag",
                    "expected_symptom": "ImagePullBackOff",
                    "expires_at": "2000-01-01T00:00:00+00:00",
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["applied"] is False
    assert result["message"] == "RCA test inject command is expired"
    assert apply_calls == []


def test_rca_test_cleanup_uses_immutable_target_without_loading_current_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    calls: list[tuple[str, str, str, str]] = []

    def catalog_must_not_be_loaded(_scenario_id: str) -> object:
        raise AssertionError("cleanup must not depend on the current scenario catalog")

    async def atomic_cleanup(
        namespace: str,
        resource_name: str,
        run_id: str,
        *,
        cleanup_adapter: str,
    ) -> bool:
        calls.append((namespace, resource_name, run_id, cleanup_adapter))
        return True

    monkeypatch.setattr(module, "test_scenario_by_id", catalog_must_not_be_loaded)
    agent.cleanup_rca_test_fixture_if_owned = atomic_cleanup
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.RCA_TEST_SCENARIO_CLEANUP_ACTION,
                "payload": {
                    "run_id": "run-1",
                    "scenario_id": "image.wrong-tag",
                    "scenario_version": 99,
                    "namespace": "sandbox",
                    "resource_name": "rca-test-image-wrong-tag",
                    "cleanup_adapter": "kubernetes.manifest_delete",
                },
            }
        )
    )

    assert calls == [
        (
            "sandbox",
            "rca-test-image-wrong-tag",
            "run-1",
            "kubernetes.manifest_delete",
        )
    ]
    assert result["status"] == "completed"
    assert result["rca_test"]["cleanup_completed"] is True


def test_rca_test_cleanup_rejects_unregistered_payload_adapter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    cleanup_calls: list[object] = []

    async def must_not_cleanup(*args: object, **kwargs: object) -> bool:
        cleanup_calls.append((args, kwargs))
        return True

    agent.cleanup_rca_test_fixture_if_owned = must_not_cleanup
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.RCA_TEST_SCENARIO_CLEANUP_ACTION,
                "payload": {
                    "run_id": "run-1",
                    "scenario_id": "image.wrong-tag",
                    "scenario_version": 1,
                    "namespace": "sandbox",
                    "resource_name": "rca-test-image-wrong-tag",
                    "cleanup_adapter": "unregistered.delete",
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "not registered" in result["message"]
    assert cleanup_calls == []


def test_rca_test_cleanup_uses_registered_resource_plan_and_propagation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from domains.rca.test_scenario_adapters import (
        RcaTestCleanupPlan,
        RcaTestCleanupResource,
    )

    module = load_agent_module()
    requests: list[httpx.Request] = []
    deleted = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal deleted
        requests.append(request)
        path = request.url.path
        if "/services/" in path:
            raise AssertionError("cleanup must use only resources from the adapter plan")
        if request.method == "GET" and "/deployments/" in path:
            if deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-uid-spy",
                        "resourceVersion": "31",
                        "annotations": {"kubeheal.io/rca-test-run": "run-spy"},
                    }
                },
            )
        if request.method == "DELETE":
            deleted = True
            return httpx.Response(200, json={})
        if request.method == "GET" and path.endswith("/pods"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and path.endswith("/endpointslices"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and "/endpoints/" in path:
            return httpx.Response(404)
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    cleanup_plan = RcaTestCleanupPlan(
        adapter="spy.manifest_delete",
        propagation_policy="Orphan",
        resources=(RcaTestCleanupResource("Deployment", "apis/apps/v1", "deployments"),),
    )

    class SpyAdapter:
        def build_cleanup(self, namespace: str, resource_name: str) -> RcaTestCleanupPlan:
            assert (namespace, resource_name) == ("sandbox", "rca-test-image-wrong-tag")
            return cleanup_plan

    class SpyRegistry:
        def cleanup_adapter(self, adapter_name: str) -> SpyAdapter:
            assert adapter_name == "spy.manifest_delete"
            return SpyAdapter()

    monkeypatch.setattr(
        module,
        "default_test_scenario_adapter_registry",
        lambda: SpyRegistry(),
    )
    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    cleaned = asyncio.run(
        agent.cleanup_rca_test_fixture_if_owned(
            "sandbox",
            "rca-test-image-wrong-tag",
            "run-spy",
            cleanup_adapter="spy.manifest_delete",
        )
    )

    assert cleaned is True
    deletion = next(request for request in requests if request.method == "DELETE")
    assert json.loads(deletion.content) == {
        "apiVersion": "v1",
        "kind": "DeleteOptions",
        "propagationPolicy": "Orphan",
        "preconditions": {"uid": "deployment-uid-spy", "resourceVersion": "31"},
    }


@pytest.mark.parametrize("conflict_status", [409, 422])
def test_atomic_rca_test_cleanup_conflict_is_a_safe_noop(
    monkeypatch: pytest.MonkeyPatch,
    conflict_status: int,
) -> None:
    module = load_agent_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": f"{request.url.path}-uid",
                        "resourceVersion": "1",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        return httpx.Response(conflict_status, json={"message": "owner changed"})

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    cleaned = asyncio.run(
        agent.cleanup_rca_test_fixture_if_owned(
            "sandbox",
            "rca-test-image-wrong-tag",
            "run-1",
        )
    )

    assert cleaned is False
    assert [request.method for request in requests] == ["GET", "GET", "DELETE"]
    assert requests[-1].headers["content-type"] == "application/json"
    assert json.loads(requests[-1].content)["preconditions"]["resourceVersion"] == "1"


def test_atomic_rca_test_cleanup_deletes_only_the_matching_owner_and_verifies_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    deleted: set[str] = set()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "GET" and "/services/" in path:
            return httpx.Response(404)
        if request.method == "GET" and "/deployments/" in path:
            if "Deployment" in deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-uid-1",
                        "resourceVersion": "7",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        if request.method == "DELETE":
            deleted.add("Deployment")
            return httpx.Response(200, json={})
        if request.method == "GET" and path.endswith("/pods"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and path.endswith("/endpointslices"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and "/endpoints/" in path:
            return httpx.Response(404)
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    assert (
        asyncio.run(
            agent.cleanup_rca_test_fixture_if_owned(
                "sandbox",
                "rca-test-image-wrong-tag",
                "run-1",
            )
        )
        is True
    )
    assert deleted == {"Deployment"}


def test_rca_test_cleanup_deletes_run_owned_service_with_resource_version_cas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    requests: list[httpx.Request] = []
    deleted: set[str] = set()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if request.method == "GET" and "/services/" in path:
            if "Service" in deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "name": "rca-test-ingress-readiness",
                        "uid": "service-uid-1",
                        "resourceVersion": "17",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        if request.method == "GET" and "/deployments/" in path:
            if "Deployment" in deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-uid-1",
                        "resourceVersion": "18",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        if request.method == "DELETE":
            deleted.add("Service" if "/services/" in path else "Deployment")
            return httpx.Response(200, json={})
        if request.method == "GET" and path.endswith("/pods"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and path.endswith("/endpointslices"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and "/endpoints/" in path:
            return httpx.Response(404)
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    cleaned = asyncio.run(
        agent.cleanup_rca_test_fixture_if_owned(
            "sandbox",
            "rca-test-ingress-readiness",
            "run-1",
        )
    )

    assert cleaned is True
    deletion = next(request for request in requests if request.method == "DELETE")
    assert json.loads(deletion.content) == {
        "apiVersion": "v1",
        "kind": "DeleteOptions",
        "propagationPolicy": "Foreground",
        "preconditions": {"uid": "service-uid-1", "resourceVersion": "17"},
    }
    assert deleted == {"Deployment", "Service"}


def test_stale_rca_test_cleanup_cannot_delete_new_run_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "name": "rca-test-ingress-readiness",
                        "uid": "service-uid-new",
                        "resourceVersion": "22",
                        "annotations": {"kubeheal.io/rca-test-run": "run-new"},
                    }
                },
            )
        raise AssertionError("stale cleanup must not issue a Service DELETE")

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    cleaned = asyncio.run(
        agent.cleanup_rca_test_fixture_if_owned(
            "sandbox",
            "rca-test-ingress-readiness",
            "run-old",
        )
    )

    assert cleaned is False
    assert [request.method for request in requests] == ["GET"]


def test_stale_rca_test_cleanup_cannot_delete_new_run_deployment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "/services/" in request.url.path:
            return httpx.Response(404)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-uid-new",
                        "resourceVersion": "23",
                        "annotations": {"kubeheal.io/rca-test-run": "run-new"},
                    }
                },
            )
        raise AssertionError("stale cleanup must not issue a Deployment DELETE")

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    cleaned = asyncio.run(
        agent.cleanup_rca_test_fixture_if_owned(
            "sandbox",
            "rca-test-image-wrong-tag",
            "run-old",
        )
    )

    assert cleaned is False
    assert [request.method for request in requests] == ["GET", "GET"]


def test_expired_rca_test_janitor_deletes_owned_manifest_and_verifies_residuals(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    module = load_agent_module()
    requests: list[httpx.Request] = []
    expired_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    deleted: set[str] = set()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if request.method == "GET" and path.endswith("/deployments"):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "name": "rca-test-ingress-readiness",
                                "annotations": {
                                    "kubeheal.io/rca-test-run": "run-1",
                                    "kubeheal.io/rca-test-expires-at": expired_at,
                                },
                            },
                            "spec": {"replicas": 1},
                        }
                    ]
                },
            )
        if request.method == "GET" and path.endswith("/services"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and "/services/" in path:
            if "Service" in deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "service-uid-1",
                        "resourceVersion": "17",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        if request.method == "GET" and "/deployments/" in path:
            if "Deployment" in deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-uid-1",
                        "resourceVersion": "18",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        if request.method == "DELETE":
            deleted.add("Service" if "/services/" in path else "Deployment")
            return httpx.Response(200, json={})
        if request.method == "GET" and path.endswith("/pods"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and path.endswith("/endpointslices"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and "/endpoints/" in path:
            return httpx.Response(404)
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes_transport = httpx.MockTransport(handler)

    assert asyncio.run(agent.cleanup_expired_rca_test_fixtures_once()) == 1
    assert deleted == {"Deployment", "Service"}


def test_rca_test_cleanup_fails_when_pods_remain_after_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    monkeypatch.setattr(module, "RCA_TEST_CLEANUP_TIMEOUT_SECONDS", 0)
    deleted = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal deleted
        path = request.url.path
        if request.method == "GET" and "/services/" in path:
            return httpx.Response(404)
        if request.method == "GET" and "/deployments/" in path:
            if deleted:
                return httpx.Response(404)
            return httpx.Response(
                200,
                json={
                    "metadata": {
                        "uid": "deployment-uid-1",
                        "resourceVersion": "7",
                        "annotations": {"kubeheal.io/rca-test-run": "run-1"},
                    }
                },
            )
        if request.method == "DELETE":
            deleted = True
            return httpx.Response(200, json={})
        if request.method == "GET" and path.endswith("/pods"):
            return httpx.Response(200, json={"items": [{"metadata": {"name": "pod-1"}}]})
        if request.method == "GET" and path.endswith("/endpointslices"):
            return httpx.Response(200, json={"items": []})
        if request.method == "GET" and "/endpoints/" in path:
            return httpx.Response(404)
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    monkeypatch.setattr(module, "kubernetes_api_base_url", lambda: "https://kubernetes.test")
    monkeypatch.setattr(module, "service_account_token", lambda: "token")
    agent = object.__new__(module.TargetClusterAgent)
    agent.kubernetes_transport = httpx.MockTransport(handler)

    with pytest.raises(TimeoutError, match="Pod"):
        asyncio.run(
            agent.cleanup_rca_test_fixture_if_owned(
                "sandbox",
                "rca-test-image-wrong-tag",
                "run-1",
            )
        )


def test_rca_test_observation_queries_only_the_current_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = load_agent_module()
    run_id = "72b5f320-46e9-4dbd-9251-aedb8db52993"
    scenario = module.test_scenario_by_id("image.wrong-tag")
    assert scenario is not None
    provider = module.KubernetesSnapshotProvider(cluster_id="cluster-1")
    selectors: list[str | None] = []

    async def query(_client: object, telemetry_query: object) -> dict[str, object]:
        selectors.append(telemetry_query.label_selector)
        return {}

    def normalize(_payload: object, _telemetry_query: object) -> dict[str, object]:
        return {
            "pods": [
                {
                    "name": "rca-test-image-wrong-tag-pod",
                    "labels": {"kubeheal.io/rca-test-run": run_id},
                    "waiting_reasons": ["ImagePullBackOff"],
                    "terminated_reasons": [],
                }
            ],
            "events": [
                {
                    "involved_name": "rca-test-image-wrong-tag-pod",
                    "reason": "Failed",
                    "message": "manifest unknown: image not found",
                }
            ],
        }

    monkeypatch.setattr(provider, "query", query)
    monkeypatch.setattr(provider, "normalize_payload", normalize)
    agent = object.__new__(module.TargetClusterAgent)
    agent.evidence_collector = SimpleNamespace(providers={"kubernetes": provider})

    pod_names = asyncio.run(agent.wait_for_rca_test_observation(scenario, run_id))

    assert selectors == [f"kubeheal.io/rca-test-run={run_id}"]
    assert pod_names == ["rca-test-image-wrong-tag-pod"]


@pytest.mark.parametrize(
    "enabled",
    [
        "0",
        "",
    ],
)
@pytest.mark.parametrize(
    "action",
    [
        "rca.test.inject",
        "rca.test.cleanup",
    ],
)
def test_rca_test_commands_fail_closed_on_target_agent(
    monkeypatch: pytest.MonkeyPatch,
    enabled: str,
    action: str,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", enabled)
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": action,
                "payload": {
                    "run_id": "run-1",
                    "scenario_id": "image.wrong-tag",
                    "scenario_version": 1,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["applied"] is False
    assert "RCA_TEST_RUNS_ENABLED=1" in result["message"]
    assert agent.kubernetes.patches == []


def test_expired_rca_test_fixture_cleanup_is_disabled_without_capability(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "0")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"

    assert asyncio.run(agent.cleanup_expired_rca_test_fixtures_once()) == 0
    assert asyncio.run(agent.cleanup_expired_rca_test_fixtures_forever()) is None


def test_command_result_outbox_retries_until_gateway_accepts(tmp_path: Path) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.agent_id = "agent-1"
    agent.command_outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    agent.command_outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={"status": "completed", "cluster_id": "cluster-1"},
    )
    client = StubCommandResultClient(fail_once=True)

    assert asyncio.run(agent.flush_command_results_once(client)) is False
    assert agent.command_outbox.pending_count() == 1
    assert asyncio.run(agent.flush_command_results_once(client)) is True

    assert agent.command_outbox.pending_count() == 0
    assert client.completed[0]["command_id"] == "cmd-1"


def test_command_result_outbox_keeps_distinct_logical_command_attempts(tmp_path: Path) -> None:
    module = load_agent_module()
    outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    for attempt_id, lease_id in (("attempt-1", "lease-1"), ("attempt-2", "lease-2")):
        outbox.enqueue_result(
            command_id="cmd-1",
            attempt_id=attempt_id,
            workspace_id="default",
            lease_id=lease_id,
            agent_id="agent-1",
            result={"status": "failed", "cluster_id": "cluster-1"},
        )

    first = outbox.next_result()
    assert first is not None
    assert first.attempt_id == "attempt-1"
    outbox.mark_sent(first.command_id, first.attempt_id)
    second = outbox.next_result()
    assert second is not None
    assert second.attempt_id == "attempt-2"


def test_command_result_outbox_logs_result_summary(tmp_path: Path, caplog) -> None:
    module = load_agent_module()
    outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    caplog.set_level(logging.INFO)

    outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={
            "status": "completed",
            "cluster_id": "cluster-1",
            "applied": True,
            "retryable": False,
            "resources": [{"resource": "deployment/checkout-api"}],
        },
    )

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "agent_command_result_enqueued"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["command_id"] == "cmd-1"
    assert contexts[-1]["workspace_id"] == "default"
    assert contexts[-1]["lease_id"] == "lease-1"
    assert contexts[-1]["agent_id"] == "agent-1"
    assert contexts[-1]["status"] == "completed"
    assert contexts[-1]["cluster_id"] == "cluster-1"
    assert contexts[-1]["applied"] is True
    assert contexts[-1]["retryable"] is False
    assert contexts[-1]["resource_count"] == 1


def test_command_result_flush_logs_success(tmp_path: Path, caplog) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.agent_id = "agent-1"
    agent.command_outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    agent.command_outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={"status": "completed", "cluster_id": "cluster-1", "applied": True},
    )
    client = StubCommandResultClient()
    caplog.set_level(logging.INFO)

    assert asyncio.run(agent.flush_command_results_once(client)) is True

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "command_result_flushed"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["command_id"] == "cmd-1"
    assert contexts[-1]["workspace_id"] == "default"
    assert contexts[-1]["lease_id"] == "lease-1"
    assert contexts[-1]["agent_id"] == "agent-1"
    assert contexts[-1]["cluster_id"] == "cluster-1"
    assert contexts[-1]["status"] == "completed"
    assert contexts[-1]["applied"] is True


def test_command_result_outbox_abandons_poison_result(tmp_path: Path, caplog) -> None:
    module = load_agent_module()
    outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={"status": "completed", "cluster_id": "cluster-1"},
    )
    caplog.set_level(logging.WARNING)

    assert outbox.record_failure("cmd-1", "lease expired", max_attempts=1) is True

    assert outbox.pending_count() == 0
    assert outbox.abandoned_count() == 1
    assert outbox.next_result() is None
    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "agent_command_result_outbox_abandoned"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["command_id"] == "cmd-1"
    assert contexts[-1]["attempt_count"] == 1
    assert contexts[-1]["max_attempts"] == 1


def test_agent_routes_unknown_command_to_default_handler() -> None:
    module = load_agent_module()
    module.COMMAND_EXECUTION_DELAY_SECONDS = 0
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(agent.execute_command({"action": "unknown.action", "payload": {}}))

    assert result["status"] == "failed"
    assert result["applied"] is False


def test_agent_uninstall_cleans_allowlist_before_completed_ack() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = True
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.CLUSTER_AGENT_UNINSTALL_ACTION,
                "payload": {"cluster_id": "cluster-1", "contract_version": 1},
            }
        )
    )

    assert result["status"] == "completed"
    assert result["cleanup_completed"] is True
    assert agent.kubernetes.namespaced_deletes
    assert agent.kubernetes.cluster_deletes
    assert all(
        item.get("name") != "cluster-agent" or item.get("resource") != "deployments"
        for item in agent.kubernetes.namespaced_deletes
    )


def test_agent_cleanup_never_deletes_namespaces_or_user_workloads() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.kubernetes = StubKubernetesClient()

    asyncio.run(agent.prepare_agent_installation_cleanup())

    deletes = [*agent.kubernetes.namespaced_deletes, *agent.kubernetes.cluster_deletes]
    assert all(item["resource"] != "namespaces" for item in deletes)
    assert all(
        item.get("name") not in {"color-turf-server", "report-generator"} for item in deletes
    )
    assert all(item["resource"] != "deployments" for item in agent.kubernetes.namespaced_deletes)


def test_agent_deletes_own_deployment_only_after_ack_path() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.kubernetes = StubKubernetesClient()

    asyncio.run(agent.delete_agent_deployment_after_ack())

    assert agent.kubernetes.namespaced_deletes == [
        {
            "api_group": "apps",
            "version": "v1",
            "namespace": "target",
            "resource": "deployments",
            "name": "cluster-agent",
        }
    ]


def test_agent_final_deployment_delete_retries_bounded_failures(monkeypatch) -> None:
    module = load_agent_module()
    monkeypatch.setattr(module, "AGENT_UNINSTALL_FINAL_DELETE_RETRY_DELAYS", (0, 0, 0))
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.kubernetes = RetryingDeploymentDeleteClient(failures=2)

    deleted = asyncio.run(agent.delete_agent_deployment_after_ack())

    assert deleted is True
    assert agent.kubernetes.attempts == 3
    assert agent.kubernetes.namespaced_deletes[-1]["name"] == "cluster-agent"


def test_agent_uninstall_cleanup_failure_returns_failed_and_keeps_deployment() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = True
    agent.kubernetes = FailingDeleteKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.CLUSTER_AGENT_UNINSTALL_ACTION,
                "payload": {"cluster_id": "cluster-1", "contract_version": 1},
            }
        )
    )

    assert result["status"] == "failed"
    assert "cleanup_completed" not in result
    assert all(
        item.get("name") != "cluster-agent" or item.get("resource") != "deployments"
        for item in agent.kubernetes.namespaced_deletes
    )


def test_kubernetes_command_uses_typed_payload_and_client() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["replicas"] == 3
    assert agent.kubernetes.patches[0]["subresource"] == "scale"
    assert agent.kubernetes.patches[0]["body"] == {"spec": {"replicas": 3}}


@pytest.mark.parametrize(
    ("action", "resource", "replicas"),
    [
        (Command.KUBERNETES_STATEFULSET_SCALE_ACTION, "statefulsets", 3),
        (Command.KUBERNETES_STATEFULSET_RESTART_ACTION, "statefulsets", None),
        (Command.KUBERNETES_DAEMONSET_RESTART_ACTION, "daemonsets", None),
    ],
)
def test_workload_commands_use_exact_registered_kubernetes_resource(
    action: str,
    resource: str,
    replicas: int | None,
) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)
    payload: dict[str, object] = {"namespace": "sandbox", "name": "checkout"}
    if replicas is not None:
        payload["replicas"] = replicas

    result = asyncio.run(
        agent.execute_command(
            {
                "action": action,
                "direct_execution": True,
                "payload": payload,
            }
        )
    )

    assert result["status"] == "completed"
    patch = agent.kubernetes.patches[0]
    assert patch["resource"] == resource
    if replicas is None:
        assert patch["body"] == module.build_rollout_restart_patch()
        assert patch.get("subresource") is None
    else:
        assert patch["body"] == {"spec": {"replicas": replicas}}
        assert patch["subresource"] == "scale"


@pytest.mark.parametrize(
    ("action", "unschedulable"),
    [
        (Command.KUBERNETES_NODE_CORDON_ACTION, True),
        (Command.KUBERNETES_NODE_UNCORDON_ACTION, False),
    ],
)
def test_node_scheduling_command_uses_exact_cluster_resource_patch(
    action: str,
    unschedulable: bool,
) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = True
    agent.node_control_enabled = True
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": action,
                "direct_execution": True,
                "payload": {
                    "name": "worker-a",
                    "unschedulable": unschedulable,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["unschedulable"] is unschedulable
    assert agent.kubernetes.cluster_patches == [
        {
            "api_group": "core",
            "version": "v1",
            "resource": "nodes",
            "name": "worker-a",
            "body": {"spec": {"unschedulable": unschedulable}},
        }
    ]


def test_node_scheduling_command_fails_closed_when_profile_is_disabled() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.direct_commands_enabled = True
    agent.node_control_enabled = False
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": Command.KUBERNETES_NODE_CORDON_ACTION,
                "direct_execution": True,
                "payload": {"name": "worker-a", "unschedulable": True},
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "node control is disabled by agent profile"
    assert agent.kubernetes.cluster_patches == []


def test_node_control_capability_is_advertised_only_when_enabled() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.direct_commands_enabled = True
    agent.node_control_enabled = False
    assert module.Command.KUBERNETES_NODE_CONTROL_CAPABILITY not in agent.advertised_capabilities()

    agent.node_control_enabled = True
    assert module.Command.KUBERNETES_NODE_CONTROL_CAPABILITY in agent.advertised_capabilities()
    agent.direct_commands_enabled = False
    assert module.Command.KUBERNETES_NODE_CONTROL_CAPABILITY not in agent.advertised_capabilities()


def test_cronjob_trigger_uses_observed_template_and_advertised_capability(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,team-jobs")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = CronJobKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.KUBERNETES_CRONJOB_TRIGGER_ACTION,
                "direct_execution": True,
                "payload": cronjob_command_payload(),
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert module.Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY in (
        module.AgentConfig.AGENT_CAPABILITIES
    )
    registered = agent.command_registry.handlers[module.Command.KUBERNETES_CRONJOB_TRIGGER_ACTION]
    assert registered.spec.kubernetes.resource == "jobs"
    assert registered.spec.kubernetes.verb == "create"
    assert agent.kubernetes.gets == [
        {
            "api_group": "batch",
            "version": "v1",
            "namespace": "team-jobs",
            "resource": "cronjobs",
            "name": "nightly",
        }
    ]
    created = agent.kubernetes.creates[0]
    assert created["resource"] == "jobs"
    assert created["namespace"] == "team-jobs"
    assert created["body"]["metadata"]["generateName"] == "nightly-manual-"
    assert (
        created["body"]["metadata"]["annotations"]["opsia.io/source-cronjob-uid"] == "cronjob-uid-1"
    )
    assert created["body"]["spec"]["template"]["spec"]["restartPolicy"] == "Never"


def test_cronjob_trigger_generate_name_reserves_the_kubernetes_suffix_boundary() -> None:
    module = load_agent_module()
    cronjob_name = "a" * 52
    cronjob = {
        "metadata": {
            "name": cronjob_name,
            "namespace": "team-jobs",
            "uid": "cronjob-uid-1",
        },
        "spec": {
            "jobTemplate": {
                "spec": {
                    "template": {
                        "spec": {
                            "restartPolicy": "Never",
                            "containers": [{"name": "job", "image": "example/job:v1"}],
                        }
                    }
                }
            }
        },
    }

    body = module.cronjob_job_body(
        cronjob,
        namespace="team-jobs",
        name=cronjob_name,
    )
    prefix = body["metadata"]["generateName"]

    assert prefix.endswith("-manual-")
    assert len(prefix) == 58
    assert len(f"{prefix}abcde") == 63


def test_cronjob_capability_is_hidden_when_direct_commands_are_disabled() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.direct_commands_enabled = False

    assert (
        module.Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY not in agent.advertised_capabilities()
    )


@pytest.mark.parametrize(
    ("action", "suspended"),
    [
        ("KUBERNETES_CRONJOB_SUSPEND_ACTION", True),
        ("KUBERNETES_CRONJOB_RESUME_ACTION", False),
    ],
)
def test_cronjob_schedule_control_is_typed_and_namespace_scoped(
    monkeypatch: pytest.MonkeyPatch,
    action: str,
    suspended: bool,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,team-jobs")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.cluster_role = "management"
    agent.kubernetes = CronJobKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": getattr(module.Command, action),
                "direct_execution": True,
                "payload": cronjob_command_payload(),
            }
        )
    )

    assert result["status"] == "completed"
    assert agent.kubernetes.patches == [
        {
            "api_group": "batch",
            "version": "v1",
            "namespace": "team-jobs",
            "resource": "cronjobs",
            "name": "nightly",
            "body": {"spec": {"suspend": suspended}},
        }
    ]
    assert agent.kubernetes.gets == [
        {
            "api_group": "batch",
            "version": "v1",
            "namespace": "team-jobs",
            "resource": "cronjobs",
            "name": "nightly",
        }
    ]


@pytest.mark.parametrize(
    "action",
    [
        "KUBERNETES_CRONJOB_TRIGGER_ACTION",
        "KUBERNETES_CRONJOB_SUSPEND_ACTION",
        "KUBERNETES_CRONJOB_RESUME_ACTION",
    ],
)
def test_cronjob_control_rejects_a_recreated_uid_before_any_write(
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,team-jobs")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = CronJobKubernetesClient(uid="cronjob-uid-recreated")
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": getattr(module.Command, action),
                "direct_execution": True,
                "payload": cronjob_command_payload(),
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "selected CronJob identity is stale"
    assert agent.kubernetes.creates == []
    assert agent.kubernetes.patches == []


def test_cronjob_control_rejects_namespace_outside_agent_policy() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = CronJobKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.Command.KUBERNETES_CRONJOB_TRIGGER_ACTION,
                "direct_execution": True,
                "payload": cronjob_command_payload(namespace="kube-system"),
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "namespace is not allowed by control policy"
    assert agent.kubernetes.gets == []
    assert agent.kubernetes.creates == []


def test_kubernetes_scale_requires_approval_evidence() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "requires approval_ref" in result["message"]
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_rejects_expired_approval_evidence() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(expires_at="2000-01-01T00:00:00Z"),
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "write command approval_expires_at is expired"
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_exempts_approval_in_sandbox_environment() -> None:
    # sandbox 허용 rule — plan 메타데이터 environment=sandbox 면 승인 증적 없이 실행.
    # namespace/resource 가드는 그대로 적용된다.
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "environment": "sandbox",
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert len(agent.kubernetes.patches) == 1


def test_kubernetes_scale_does_not_auto_approve_cross_namespace_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,staging")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "environment": "sandbox",
                "payload": {
                    "namespace": "staging",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "requires approval_ref" in result["message"]
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_rejects_namespace_outside_control_policy() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "kube-system",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "namespace is not allowed by control policy"
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_rejects_management_namespace_even_if_allowlisted(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,management")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "management",
                    "name": "api-gateway",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "namespace is not allowed by control policy"
    assert agent.kubernetes.patches == []


def test_management_agent_ignores_write_command_before_kubernetes_call() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.agent_id = "agent-1"
    agent.cluster_role = "management"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "management_readonly"
    assert agent.kubernetes.patches == []


def test_management_agent_executes_explicit_direct_workload_command() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.agent_id = "agent-1"
    agent.cluster_role = "management"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "direct_execution": True,
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert agent.kubernetes.patches[0]["name"] == "checkout-api"


def test_management_agent_policy_rejects_self_patch_if_top_guard_is_bypassed() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.cluster_role = "management"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)
    registered = agent.command_registry.handlers[module.KUBERNETES_DEPLOYMENT_PATCH_ACTION]
    payload = module.KubernetesPatchPayload(
        namespace="management",
        name="cluster-agent",
        patch={"spec": {"replicas": 0}},
    )

    with pytest.raises(
        PermissionError, match="management agent cannot control management workloads"
    ):
        agent.command_registry.kubernetes_policy.ensure_allowed(registered.spec.kubernetes, payload)

    assert agent.kubernetes.patches == []


def test_management_agent_default_policy_enables_only_kubernetes_provider() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.cluster_role = "management"
    agent.bootstrap_mode = "management"
    agent.interval = 15
    agent.evidence_failure_policy = "allow_partial"
    agent.evidence_provider_worker_counts = {}
    agent.evidence_provider_max_worker_counts = {}
    agent.evidence_collector = type(
        "Collector",
        (),
        {"providers": {"kubernetes": object(), "metrics": object(), "logs": object()}},
    )()

    policy = agent.build_default_policy()
    enabled = {
        provider_key
        for provider_key, provider_policy in policy.evidence.providers.items()
        if provider_policy.enabled
    }

    assert enabled == {"kubernetes"}
