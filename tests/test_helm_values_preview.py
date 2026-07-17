from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import yaml

from packages.config.helm import HelmArtifactLimits
from packages.contracts.helm import (
    HelmReleaseGuard,
    HelmValuesPreviewCommandPayload,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT_DIR / "src" / "services" / "target" / "cluster-agent" / "commands" / "helm.py"


def load_runner_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("test_helm_values_preview_runner", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {RUNNER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)
    return module


def preview_payload() -> HelmValuesPreviewCommandPayload:
    return HelmValuesPreviewCommandPayload(
        namespace="sandbox",
        release_name="storefront",
        catalog_item_id="catalog-redis",
        catalog_version="1.0.0",
        values={"master.persistence.storageClass": "gp3"},
        guard=HelmReleaseGuard(
            expected_revision=3,
            storage={
                "api_group": "",
                "version": "v1",
                "kind": "Secret",
                "namespace": "sandbox",
                "name": "sh.helm.release.v1.storefront.v3",
                "uid": "storage-uid-3",
            },
            storage_resource_version="1042",
            chart_name="redis",
            chart_version="22.0.0",
        ),
    )


def helm_status() -> str:
    return json.dumps(
        {
            "name": "storefront",
            "namespace": "sandbox",
            "version": 3,
            "chart": {"metadata": {"name": "redis", "version": "22.0.0"}},
        }
    )


def current_manifest() -> str:
    return """\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: sandbox
spec:
  replicas: 1
---
apiVersion: v1
kind: Secret
metadata:
  name: storefront-auth
  namespace: sandbox
data:
  password: current-secret-must-not-leak
"""


def candidate_manifest() -> str:
    return """\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: sandbox
spec:
  replicas: 3
---
apiVersion: v1
kind: Secret
metadata:
  name: storefront-auth
  namespace: sandbox
data:
  password: candidate-secret-must-not-leak
---
apiVersion: v1
kind: Service
metadata:
  name: storefront
  namespace: sandbox
spec:
  selector:
    app: storefront
"""


def test_preview_revalidates_live_status_and_compares_real_template_to_current_manifest() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []
    captured_values: list[object] = []

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args[1] == "status":
            return subprocess.CompletedProcess(args, 0, stdout=helm_status(), stderr="")
        if args[1:3] == ["get", "manifest"]:
            return subprocess.CompletedProcess(args, 0, stdout=current_manifest(), stderr="")
        assert args[1] == "template"
        values_path = Path(args[args.index("--values") + 1])
        captured_values.append(yaml.safe_load(values_path.read_text(encoding="utf-8")))
        return subprocess.CompletedProcess(args, 0, stdout=candidate_manifest(), stderr="")

    result = module.run_helm_values_preview(
        preview_payload(),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=HelmArtifactLimits(
            timeout_seconds=30,
            output_max_bytes=128 * 1024,
            source_max_bytes=512 * 1024,
        ),
    )

    assert result.succeeded is True
    assert result.preview is not None
    assert [args[1:3] for args in calls] == [
        ["status", "storefront"],
        ["get", "manifest"],
        ["template", "storefront"],
    ]
    template_args = calls[2]
    assert template_args[3].startswith("oci://registry-1.docker.io/bitnamicharts/redis@sha256:")
    assert "--is-upgrade" in template_args
    assert "--include-crds" in template_args
    assert "gp3" not in template_args
    assert captured_values == [
        {
            "architecture": "standalone",
            "image": {
                "digest": "sha256:25bf63f3caf75af4628c0dfcf39859ad1ac8abe135be85e99699f9637b16dc28",
                "registry": "registry-1.docker.io",
                "repository": "bitnamilegacy/redis",
            },
            "master": {"persistence": {"storageClass": "gp3"}},
        }
    ]
    preview = result.preview.model_dump(mode="json")
    assert preview["expected_revision"] == 3
    assert preview["chart_name"] == "redis"
    assert preview["chart_version"] == "23.1.1"
    assert [item["kind"] for item in preview["resources"]["added"]] == ["Service"]
    assert preview["resources"]["modified"][0]["fields"] == [
        {"path": "spec.replicas", "old_value": 1, "new_value": 3}
    ]
    serialized = json.dumps(preview)
    assert "current-secret-must-not-leak" not in serialized
    assert "candidate-secret-must-not-leak" not in serialized
    assert preview["redaction_applied"] is True


def test_preview_rejects_oversized_real_manifest_before_candidate_render() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args[1] == "status":
            return subprocess.CompletedProcess(args, 0, stdout=helm_status(), stderr="")
        return subprocess.CompletedProcess(args, 0, stdout="x" * 129, stderr="")

    result = module.run_helm_values_preview(
        preview_payload(),
        helm_binary="helm",
        run=fake_run,
        limits=HelmArtifactLimits(
            timeout_seconds=30,
            output_max_bytes=128,
            source_max_bytes=128,
        ),
    )

    assert result.succeeded is False
    assert result.error_code == "helm_values_preview_source_too_large"
    assert [args[1] for args in calls] == ["status", "get"]
