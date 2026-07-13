from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from domains.catalog.install import (
    CatalogHelmInstallPayload,
    CatalogInstallValidationError,
    CatalogRecipeUnsupported,
    server_helm_recipe,
    validate_catalog_values,
    validate_install_names,
)
from packages.config.constants import Sandbox
from packages.config.control import control_namespace_allowed

HELM_OPERATION_TIMEOUT_SECONDS = 300
HELM_SUBPROCESS_TIMEOUT_SECONDS = 330
HELM_ENV_ALLOWLIST = (
    "PATH",
    "LANG",
    "LC_ALL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "KUBERNETES_SERVICE_HOST",
    "KUBERNETES_SERVICE_PORT",
    "KUBERNETES_SERVICE_PORT_HTTPS",
)
RunCommand = Callable[..., subprocess.CompletedProcess[str]]


@dataclass(frozen=True)
class HelmRunResult:
    succeeded: bool
    error_code: str = ""
    returncode: int | None = None


def nested_helm_values(values: dict[str, Any]) -> dict[str, Any]:
    nested: dict[str, Any] = {}
    for name, value in values.items():
        parts = name.split(".")
        if any(not part for part in parts):
            raise CatalogInstallValidationError("catalog value path is invalid")
        current = nested
        for part in parts[:-1]:
            existing = current.setdefault(part, {})
            if not isinstance(existing, dict):
                raise CatalogInstallValidationError("catalog value paths conflict")
            current = existing
        leaf = parts[-1]
        if leaf in current:
            raise CatalogInstallValidationError("catalog value paths conflict")
        current[leaf] = value
    return nested


def merge_helm_values(base: dict[str, Any], enforced: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for name, value in enforced.items():
        existing = merged.get(name)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[name] = merge_helm_values(existing, value)
        else:
            merged[name] = value
    return merged


def helm_subprocess_env(runtime_dir: Path) -> dict[str, str]:
    child_env = {name: os.environ[name] for name in HELM_ENV_ALLOWLIST if name in os.environ}
    child_env.update(
        {
            "HELM_CACHE_HOME": str(runtime_dir / "cache"),
            "HELM_CONFIG_HOME": str(runtime_dir / "config"),
            "HELM_DATA_HOME": str(runtime_dir / "data"),
        }
    )
    return child_env


def run_catalog_helm_install(
    payload: CatalogHelmInstallPayload,
    *,
    helm_binary: str | None = None,
    run: RunCommand = subprocess.run,
) -> HelmRunResult:
    executable = helm_binary or shutil.which("helm")
    if not executable:
        return HelmRunResult(False, "helm_not_available")

    try:
        recipe = server_helm_recipe(payload.catalog_item_id, payload.catalog_version)
        validate_install_names(
            application_name=payload.application_name,
            namespace=payload.namespace,
            release_name=payload.release_name,
        )
        if payload.namespace != Sandbox.NAMESPACE or not control_namespace_allowed(
            payload.namespace
        ):
            raise CatalogInstallValidationError(
                "catalog installs are limited to the sandbox control namespace"
            )
        user_values = nested_helm_values(
            validate_catalog_values(recipe.values_schema, payload.values)
        )
        fixed_values = nested_helm_values(dict(recipe.fixed_values))
        values = merge_helm_values(user_values, fixed_values)
    except CatalogRecipeUnsupported:
        return HelmRunResult(False, "catalog_recipe_unsupported")
    except CatalogInstallValidationError:
        return HelmRunResult(False, "catalog_install_validation_error")

    with tempfile.TemporaryDirectory(prefix="catalog-helm-") as tmp:
        runtime_dir = Path(tmp)
        runtime_dir.chmod(0o700)
        values_path = runtime_dir / "values.yaml"
        values_path.write_text(
            yaml.safe_dump(values, sort_keys=True, allow_unicode=False),
            encoding="utf-8",
        )
        values_path.chmod(0o600)
        args = [
            executable,
            "upgrade",
            "--install",
            payload.release_name,
            recipe.digest_reference,
            "--version",
            recipe.chart_version,
            "--namespace",
            payload.namespace,
            "--values",
            str(values_path),
            "--wait",
            "--atomic",
            "--timeout",
            f"{HELM_OPERATION_TIMEOUT_SECONDS}s",
        ]
        try:
            completed = run(
                args,
                check=False,
                capture_output=True,
                text=True,
                timeout=HELM_SUBPROCESS_TIMEOUT_SECONDS,
                shell=False,
                env=helm_subprocess_env(runtime_dir),
            )
        except subprocess.TimeoutExpired:
            return HelmRunResult(False, "helm_timeout")
        except (FileNotFoundError, PermissionError):
            return HelmRunResult(False, "helm_not_available")
        except OSError:
            return HelmRunResult(False, "helm_execution_error")

    if completed.returncode != 0:
        return HelmRunResult(False, "helm_exit_nonzero", completed.returncode)
    return HelmRunResult(True, returncode=completed.returncode)
