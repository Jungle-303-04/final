from __future__ import annotations

import difflib
import hashlib
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
from domains.release_flow.redaction import (
    REDACTED_VALUE,
    is_sensitive_key,
    redact_release_value,
)
from packages.config.constants import Sandbox
from packages.config.control import control_namespace_allowed
from packages.config.helm import HelmArtifactLimits, helm_artifact_limits
from packages.contracts.helm import HelmArtifactCommandPayload, HelmArtifactResult

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


@dataclass(frozen=True)
class HelmArtifactRunResult:
    succeeded: bool
    artifact: HelmArtifactResult | None = None
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


def run_helm_artifact_query(
    payload: HelmArtifactCommandPayload,
    *,
    helm_binary: str | None = None,
    run: RunCommand = subprocess.run,
    limits: HelmArtifactLimits | None = None,
) -> HelmArtifactRunResult:
    """Read revision artifacts locally and return only a bounded redacted projection."""

    executable = helm_binary or shutil.which("helm")
    if not executable:
        return HelmArtifactRunResult(False, error_code="helm_not_available")
    effective_limits = limits or helm_artifact_limits()
    revisions = [payload.revision]
    if payload.comparison_revision is not None:
        revisions.append(payload.comparison_revision)
    sanitized: list[str] = []
    source_bytes = 0
    with tempfile.TemporaryDirectory(prefix="helm-artifact-") as tmp:
        runtime_dir = Path(tmp)
        runtime_dir.chmod(0o700)
        for revision in revisions:
            args = _helm_artifact_args(executable, payload, revision)
            try:
                completed = run(
                    args,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=effective_limits.timeout_seconds,
                    shell=False,
                    env=helm_subprocess_env(runtime_dir),
                )
            except subprocess.TimeoutExpired:
                return HelmArtifactRunResult(False, error_code="helm_artifact_timeout")
            except (FileNotFoundError, PermissionError):
                return HelmArtifactRunResult(False, error_code="helm_not_available")
            except OSError:
                return HelmArtifactRunResult(False, error_code="helm_artifact_execution_error")
            if completed.returncode != 0:
                return HelmArtifactRunResult(
                    False,
                    error_code="helm_artifact_exit_nonzero",
                    returncode=completed.returncode,
                )
            raw = completed.stdout or ""
            raw_bytes = len(raw.encode("utf-8"))
            source_bytes += raw_bytes
            if raw_bytes > effective_limits.source_max_bytes:
                return HelmArtifactRunResult(False, error_code="helm_artifact_source_too_large")
            try:
                sanitized.append(_sanitize_helm_artifact(payload.artifact, raw))
            except (TypeError, ValueError, yaml.YAMLError):
                return HelmArtifactRunResult(False, error_code="helm_artifact_invalid_yaml")

    content = (
        _unified_artifact_diff(
            sanitized[0],
            sanitized[1],
            payload.revision,
            payload.comparison_revision or payload.revision,
        )
        if payload.artifact.endswith("_diff")
        else sanitized[0]
    )
    bounded, truncated = _bounded_utf8(content, effective_limits.output_max_bytes)
    encoded = bounded.encode("utf-8")
    artifact = HelmArtifactResult(
        artifact=payload.artifact,
        format="unified_diff" if payload.artifact.endswith("_diff") else "yaml",
        namespace=payload.namespace,
        release_name=payload.release_name,
        revision=payload.revision,
        comparison_revision=payload.comparison_revision,
        all_values=payload.all_values,
        content=bounded,
        content_sha256=hashlib.sha256(encoded).hexdigest(),
        content_bytes=len(encoded),
        source_bytes=source_bytes,
        redaction_applied=True,
        truncated=truncated,
    )
    return HelmArtifactRunResult(True, artifact=artifact)


def _helm_artifact_args(
    executable: str,
    payload: HelmArtifactCommandPayload,
    revision: int,
) -> list[str]:
    target = "manifest" if payload.artifact in {"manifest", "manifest_diff"} else "values"
    args = [
        executable,
        "get",
        target,
        payload.release_name,
        "--namespace",
        payload.namespace,
        "--revision",
        str(revision),
    ]
    if target == "values":
        args.extend(("--output", "yaml"))
        if payload.all_values:
            args.append("--all")
    return args


def _sanitize_helm_artifact(artifact: str, raw: str) -> str:
    documents = list(yaml.safe_load_all(raw))
    sanitized = [
        _redact_manifest_document(document)
        if artifact in {"manifest", "manifest_diff"}
        else redact_release_value(document)
        for document in documents
        if document is not None
    ]
    if artifact in {"manifest", "manifest_diff"}:
        return yaml.safe_dump_all(
            sanitized,
            allow_unicode=True,
            explicit_start=True,
            sort_keys=True,
        )
    value = sanitized[0] if len(sanitized) == 1 else sanitized
    return yaml.safe_dump(value, allow_unicode=True, sort_keys=True)


def _redact_manifest_document(document: object) -> object:
    if not isinstance(document, dict):
        return _redact_manifest_value(document)
    copied = dict(document)
    if str(copied.get("kind") or "").casefold() == "secret":
        for field in ("data", "stringData"):
            values = copied.get(field)
            if isinstance(values, dict):
                copied[field] = {str(key): REDACTED_VALUE for key in values}
    return _redact_manifest_value(copied)


def _redact_manifest_value(value: object) -> object:
    if isinstance(value, dict):
        redacted: dict[str, object] = {}
        named_secret = is_sensitive_key(str(value.get("name") or ""))
        for key, item in value.items():
            key_text = str(key)
            if is_sensitive_key(key_text) or (named_secret and key_text == "value"):
                redacted[key_text] = REDACTED_VALUE
            else:
                redacted[key_text] = _redact_manifest_value(item)
        return redacted
    if isinstance(value, list):
        return [_redact_manifest_value(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_manifest_value(item) for item in value]
    return value


def _unified_artifact_diff(left: str, right: str, left_revision: int, right_revision: int) -> str:
    return "".join(
        difflib.unified_diff(
            left.splitlines(keepends=True),
            right.splitlines(keepends=True),
            fromfile=f"revision-{left_revision}.yaml",
            tofile=f"revision-{right_revision}.yaml",
        )
    )


def _bounded_utf8(value: str, limit: int) -> tuple[str, bool]:
    encoded = value.encode("utf-8")
    if len(encoded) <= limit:
        return value, False
    suffix = "\n# artifact truncated\n"
    budget = max(0, limit - len(suffix.encode("utf-8")))
    prefix = encoded[:budget].decode("utf-8", errors="ignore")
    bounded = f"{prefix}{suffix}"
    while len(bounded.encode("utf-8")) > limit and prefix:
        prefix = prefix[:-1]
        bounded = f"{prefix}{suffix}"
    return bounded, True
