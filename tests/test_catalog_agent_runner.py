from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import yaml

from domains.catalog.install import CatalogHelmInstallPayload

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
