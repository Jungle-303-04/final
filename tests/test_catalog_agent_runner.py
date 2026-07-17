from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import yaml

from domains.catalog.install import CatalogHelmInstallPayload
from packages.config.helm import HelmArtifactLimits
from packages.contracts.helm import HelmArtifactCommandPayload

ROOT_DIR = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT_DIR / "src" / "services" / "target" / "cluster-agent" / "commands" / "helm.py"


def load_runner_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("test_catalog_helm_runner_module", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {RUNNER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)
    return module


def install_payload(**updates: object) -> CatalogHelmInstallPayload:
    values: dict[str, object] = {
        "auth.database": "orders",
        "primary.persistence.storageClass": "gp2",
        "primary.persistence.size": "16Gi",
    }
    fields: dict[str, object] = {
        "catalog_item_id": "catalog-postgresql",
        "catalog_version": "1.0.0",
        "namespace": "sandbox",
        "application_name": "orders-db",
        "release_name": "orders-db",
        "values": values,
    }
    fields.update(updates)
    return CatalogHelmInstallPayload.model_validate(fields)


def upgrade_guard(*, chart_name: str = "redis", chart_version: str = "22.0.0") -> dict[str, object]:
    return {
        "expected_revision": 3,
        "storage": {
            "api_group": "",
            "version": "v1",
            "kind": "Secret",
            "namespace": "sandbox",
            "name": "sh.helm.release.v1.storefront.v3",
            "uid": "storage-uid-3",
        },
        "storage_resource_version": "1042",
        "chart_name": chart_name,
        "chart_version": chart_version,
    }


def test_helm_runner_uses_explicit_args_private_values_file_and_sanitized_env(
    monkeypatch,
) -> None:
    module = load_runner_module()
    captured: dict[str, object] = {}
    monkeypatch.setenv("AGENT_TOKEN", "agent-token-must-not-leak")
    monkeypatch.setenv("CATALOG_PASSWORD", "password-must-not-leak")
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")

    def fake_run(args: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        values_path = Path(args[args.index("--values") + 1])
        captured.update(
            {
                "args": args,
                "kwargs": kwargs,
                "values": yaml.safe_load(values_path.read_text(encoding="utf-8")),
                "values_path": values_path,
                "mode": values_path.stat().st_mode & 0o777,
            }
        )
        return subprocess.CompletedProcess(args, 0, stdout="release installed", stderr="")

    result = module.run_catalog_helm_install(
        install_payload(),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
    )

    assert result.succeeded is True
    args = captured["args"]
    assert args[:5] == [
        "/usr/local/bin/helm",
        "upgrade",
        "--install",
        "orders-db",
        (
            "oci://registry-1.docker.io/bitnamicharts/postgresql@"
            "sha256:7da9adcf5a0e0ae2cfbe784d789705e737eb97d226026e9ad366bfc927436640"
        ),
    ]
    assert "--version" in args and args[args.index("--version") + 1] == "18.7.13"
    assert "--namespace" in args and args[args.index("--namespace") + 1] == "sandbox"
    assert "orders" not in args
    assert "agent-token-must-not-leak" not in args
    assert captured["values"] == {
        "auth": {"database": "orders"},
        "image": {
            "digest": "sha256:926356130b77d5742d8ce605b258d35db9b62f2f8fd1601f9dbaef0c8a710a8d",
            "registry": "registry-1.docker.io",
            "repository": "bitnamilegacy/postgresql",
        },
        "primary": {"persistence": {"size": "16Gi", "storageClass": "gp2"}},
    }
    assert captured["mode"] == 0o600
    assert not captured["values_path"].exists()
    kwargs = captured["kwargs"]
    assert kwargs["shell"] is False
    assert kwargs["timeout"] == module.HELM_SUBPROCESS_TIMEOUT_SECONDS
    assert kwargs["capture_output"] is True
    assert kwargs["text"] is True
    assert kwargs["env"]["KUBERNETES_SERVICE_HOST"] == "kubernetes.default.svc"
    assert "AGENT_TOKEN" not in kwargs["env"]
    assert "CATALOG_PASSWORD" not in kwargs["env"]


def test_redis_runner_enforces_immutable_standalone_recipe() -> None:
    module = load_runner_module()
    captured: dict[str, object] = {}

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        values_path = Path(args[args.index("--values") + 1])
        captured["values"] = yaml.safe_load(values_path.read_text(encoding="utf-8"))
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    result = module.run_catalog_helm_install(
        install_payload(
            catalog_item_id="catalog-redis",
            values={
                "master.persistence.storageClass": "gp2",
                "master.persistence.size": "1Gi",
            },
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
    )

    assert result.succeeded is True
    assert captured["values"] == {
        "architecture": "standalone",
        "image": {
            "digest": "sha256:25bf63f3caf75af4628c0dfcf39859ad1ac8abe135be85e99699f9637b16dc28",
            "registry": "registry-1.docker.io",
            "repository": "bitnamilegacy/redis",
        },
        "master": {"persistence": {"size": "1Gi", "storageClass": "gp2"}},
    }


def test_helm_upgrade_guard_rejects_a_tampered_recipe_before_any_subprocess() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, stdout="{}", stderr="")

    result = module.run_catalog_helm_install(
        install_payload(
            release_name="storefront",
            application_name="storefront",
            upgrade_guard=upgrade_guard(),
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
    )

    assert result.succeeded is False
    assert result.error_code == "catalog_install_validation_error"
    assert calls == []


def test_helm_upgrade_guard_checks_live_status_immediately_before_upgrade() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args[1] == "status":
            return subprocess.CompletedProcess(
                args,
                0,
                stdout=(
                    '{"name":"storefront","namespace":"sandbox","version":3,'
                    '"chart":{"metadata":{"name":"redis","version":"22.0.0"}}}'
                ),
                stderr="",
            )
        return subprocess.CompletedProcess(args, 0, stdout="upgraded", stderr="")

    result = module.run_catalog_helm_install(
        install_payload(
            catalog_item_id="catalog-redis",
            application_name="storefront",
            release_name="storefront",
            values={"master.persistence.storageClass": "gp3"},
            upgrade_guard=upgrade_guard(),
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
    )

    assert result.succeeded is True
    assert [args[1] for args in calls] == ["status", "upgrade"]


def test_helm_runner_reports_timeout_without_subprocess_output() -> None:
    module = load_runner_module()

    def timeout(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(
            args,
            timeout=module.HELM_SUBPROCESS_TIMEOUT_SECONDS,
            output="password=must-not-leak",
            stderr="token=must-not-leak",
        )

    result = module.run_catalog_helm_install(
        install_payload(),
        helm_binary="/usr/local/bin/helm",
        run=timeout,
    )

    assert result.succeeded is False
    assert result.error_code == "helm_timeout"
    assert "must-not-leak" not in repr(result)


def test_helm_runner_fails_when_binary_or_server_recipe_is_unavailable(monkeypatch) -> None:
    module = load_runner_module()
    calls: list[object] = []
    monkeypatch.setattr(module.shutil, "which", lambda _name: None)

    missing_binary = module.run_catalog_helm_install(
        install_payload(),
        run=lambda *args, **kwargs: calls.append((args, kwargs)),
    )
    unsupported_recipe = module.run_catalog_helm_install(
        install_payload(catalog_version="9.9.9"),
        helm_binary="/usr/local/bin/helm",
        run=lambda *args, **kwargs: calls.append((args, kwargs)),
    )

    assert missing_binary.succeeded is False
    assert missing_binary.error_code == "helm_not_available"
    assert unsupported_recipe.succeeded is False
    assert unsupported_recipe.error_code == "catalog_recipe_unsupported"
    assert calls == []


def test_service_image_installs_checksum_verified_pinned_helm() -> None:
    dockerfile = (ROOT_DIR / "src" / "services" / "Dockerfile").read_text(encoding="utf-8")

    assert "ARG HELM_VERSION=v3.21.2" in dockerfile
    assert 'sha256sum -c "${helm_archive}.sha256sum"' in dockerfile
    assert "COPY --from=tools /usr/local/bin/helm /usr/local/bin/helm" in dockerfile
    assert "helm version --short" in dockerfile


def artifact_payload(**updates: object) -> HelmArtifactCommandPayload:
    values: dict[str, object] = {
        "cluster_id": "cluster-a",
        "namespace": "storefront",
        "release_name": "storefront",
        "artifact": "manifest",
        "revision": 3,
    }
    values.update(updates)
    return HelmArtifactCommandPayload.model_validate(values)


def artifact_limits(*, output_max_bytes: int = 1024 * 1024) -> HelmArtifactLimits:
    return HelmArtifactLimits(
        timeout_seconds=30,
        output_max_bytes=output_max_bytes,
        source_max_bytes=4 * 1024 * 1024,
    )


def test_helm_manifest_artifact_redacts_secret_bodies_and_sensitive_fields() -> None:
    module = load_runner_module()
    captured: list[list[str]] = []
    raw = """
apiVersion: v1
kind: Secret
metadata:
  name: storefront
data:
  username: dXNlcg==
  password: cGFzcw==
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
spec:
  template:
    spec:
      containers:
        - name: app
          env:
            - name: API_TOKEN
              value: token-must-not-leak
"""

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        captured.append(args)
        return subprocess.CompletedProcess(args, 0, stdout=raw, stderr="")

    result = module.run_helm_artifact_query(
        artifact_payload(),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=artifact_limits(),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.redaction_applied is True
    assert "dXNlcg==" not in result.artifact.content
    assert "cGFzcw==" not in result.artifact.content
    assert "token-must-not-leak" not in result.artifact.content
    assert "<redacted>" in result.artifact.content
    assert captured == [
        [
            "/usr/local/bin/helm",
            "get",
            "manifest",
            "storefront",
            "--namespace",
            "storefront",
            "--revision",
            "3",
        ]
    ]


def test_helm_values_diff_runs_exact_revisions_and_never_returns_sensitive_values() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        revision = args[args.index("--revision") + 1]
        return subprocess.CompletedProcess(
            args,
            0,
            stdout=f"replicas: {revision}\npassword: secret-{revision}\n",
            stderr="",
        )

    result = module.run_helm_artifact_query(
        artifact_payload(
            artifact="values_diff",
            revision=2,
            comparison_revision=3,
            all_values=True,
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=artifact_limits(),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.format == "unified_diff"
    assert "--- revision-2.yaml" in result.artifact.content
    assert "+++ revision-3.yaml" in result.artifact.content
    assert "secret-2" not in result.artifact.content
    assert "secret-3" not in result.artifact.content
    assert all("--all" in args for args in calls)
    assert [args[args.index("--revision") + 1] for args in calls] == ["2", "3"]


def test_helm_artifact_projection_is_bounded_after_redaction() -> None:
    module = load_runner_module()

    result = module.run_helm_artifact_query(
        artifact_payload(artifact="values"),
        helm_binary="/usr/local/bin/helm",
        run=lambda args, **_kwargs: subprocess.CompletedProcess(
            args,
            0,
            stdout=f"description: {'가' * 200}\n",
            stderr="",
        ),
        limits=artifact_limits(output_max_bytes=128),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.truncated is True
    assert result.artifact.content_bytes <= 128
    assert "artifact truncated" in result.artifact.content


def test_helm_notes_diff_redacts_freeform_secrets_and_reads_exact_revisions() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        revision = args[args.index("--revision") + 1]
        return subprocess.CompletedProcess(
            args,
            0,
            stdout=(
                f"Revision {revision}\n"
                f"password=notes-secret-{revision}\n"
                f"Authorization: Bearer bearer-secret-{revision}\n"
            ),
            stderr="",
        )

    result = module.run_helm_artifact_query(
        artifact_payload(
            artifact="notes_diff",
            revision=2,
            comparison_revision=3,
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=artifact_limits(),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.artifact == "notes_diff"
    assert result.artifact.format == "unified_diff"
    assert result.artifact.content is not None
    assert "notes-secret-2" not in result.artifact.content
    assert "notes-secret-3" not in result.artifact.content
    assert "bearer-secret-2" not in result.artifact.content
    assert "bearer-secret-3" not in result.artifact.content
    assert "[REDACTED]" in result.artifact.content
    assert [(args[2], args[args.index("--revision") + 1]) for args in calls] == [
        ("notes", "2"),
        ("notes", "3"),
    ]


def test_helm_hooks_diff_returns_typed_metadata_without_raw_manifests() -> None:
    module = load_runner_module()
    calls: list[list[str]] = []
    revision_two = """
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
  namespace: storefront
  annotations:
    helm.sh/hook: pre-upgrade
    helm.sh/hook-weight: "1"
    helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: example/migrate:v1
          env:
            - name: API_TOKEN
              value: hook-token-old
"""
    revision_three = """
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
  namespace: storefront
  annotations:
    helm.sh/hook: pre-upgrade
    helm.sh/hook-weight: "2"
    helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded
    helm.sh/hook-output-log-policy: hook-failed
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: example/migrate:v2
          env:
            - name: API_TOKEN
              value: hook-token-new
---
apiVersion: [
---
apiVersion: batch/v1
kind: Job
metadata:
  name: cleanup
  annotations:
    helm.sh/hook: post-upgrade
spec: {}
"""

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        revision = args[args.index("--revision") + 1]
        return subprocess.CompletedProcess(
            args,
            0,
            stdout=revision_two if revision == "2" else revision_three,
            stderr="",
        )

    result = module.run_helm_artifact_query(
        artifact_payload(
            artifact="hooks_diff",
            revision=2,
            comparison_revision=3,
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=artifact_limits(),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.format == "structured"
    assert result.artifact.content is None
    assert result.artifact.hooks_diff is not None
    assert result.artifact.hooks_diff.parse_error_count == 1
    assert [item.name for item in result.artifact.hooks_diff.added] == ["cleanup"]
    assert [item.name for item in result.artifact.hooks_diff.modified] == ["migrate"]
    modified = result.artifact.hooks_diff.modified[0]
    assert modified.events == ("pre-upgrade",)
    assert modified.weight == 2
    assert modified.manifest_changed is True
    assert modified.output_log_policies == ("hook-failed",)
    serialized = result.artifact.model_dump_json()
    assert "hook-token-old" not in serialized
    assert "hook-token-new" not in serialized
    assert '"manifest"' not in serialized
    assert result.artifact.projection_bytes is not None
    assert result.artifact.projection_bytes <= artifact_limits().output_max_bytes
    assert all(args[2] == "hooks" for args in calls)


def test_helm_resources_diff_is_field_typed_partial_and_bounded() -> None:
    module = load_runner_module()
    revision_two = """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: storefront
  labels:
    helm.sh/chart: storefront-1.0.0
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          image: example/storefront:v1
          env:
            - name: PASSWORD
              value: resource-secret-old
"""
    revision_three = """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storefront
  namespace: storefront
  labels:
    helm.sh/chart: storefront-2.0.0
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: example/storefront:v2
          env:
            - name: PASSWORD
              value: resource-secret-new
---
kind: [
---
apiVersion: v1
kind: Service
metadata:
  name: storefront
  namespace: storefront
spec:
  selector:
    app: storefront
"""

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        revision = args[args.index("--revision") + 1]
        return subprocess.CompletedProcess(
            args,
            0,
            stdout=revision_two if revision == "2" else revision_three,
            stderr="",
        )

    result = module.run_helm_artifact_query(
        artifact_payload(
            artifact="resources_diff",
            revision=2,
            comparison_revision=3,
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=artifact_limits(output_max_bytes=1_200),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.format == "structured"
    assert result.artifact.resources_diff is not None
    diff = result.artifact.resources_diff
    assert diff.parse_error_count == 1
    assert [(item.kind, item.name) for item in diff.added] == [("Service", "storefront")]
    assert [(item.kind, item.name) for item in diff.modified] == [("Deployment", "storefront")]
    paths = {field.path for field in diff.modified[0].fields}
    assert "spec.replicas" in paths
    assert "metadata.labels.helm.sh/chart" not in paths
    serialized = result.artifact.model_dump_json()
    assert "resource-secret-old" not in serialized
    assert "resource-secret-new" not in serialized
    assert result.artifact.projection_bytes is not None
    assert result.artifact.projection_bytes <= 1_200


def test_helm_structured_diff_truncates_collections_to_the_output_budget() -> None:
    module = load_runner_module()

    def fake_run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        revision = args[args.index("--revision") + 1]
        resources = "\n---\n".join(
            (
                "apiVersion: v1\n"
                "kind: ConfigMap\n"
                f"metadata:\n  name: config-{index}\n  namespace: storefront\n"
                f"data:\n  value: revision-{revision}-{'x' * 120}\n"
            )
            for index in range(20)
        )
        return subprocess.CompletedProcess(args, 0, stdout=resources, stderr="")

    result = module.run_helm_artifact_query(
        artifact_payload(
            artifact="resources_diff",
            revision=2,
            comparison_revision=3,
        ),
        helm_binary="/usr/local/bin/helm",
        run=fake_run,
        limits=artifact_limits(output_max_bytes=700),
    )

    assert result.succeeded is True
    assert result.artifact is not None
    assert result.artifact.truncated is True
    assert result.artifact.projection_bytes is not None
    assert result.artifact.projection_bytes <= 700
