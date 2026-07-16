from __future__ import annotations

import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from collections.abc import Callable, Mapping, Sequence
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
from packages.contracts.helm import (
    HelmArtifactCommandPayload,
    HelmArtifactResult,
    HelmHookDiffItem,
    HelmHooksDiff,
    HelmRenderedResourceChange,
    HelmRenderedResourceRef,
    HelmResourceFieldChange,
    HelmResourcesDiff,
)
from packages.security.log_lines import redact_log_line

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


@dataclass(frozen=True)
class _HookSnapshot:
    item: HelmHookDiffItem
    manifest_digest: str


@dataclass(frozen=True)
class _RenderedResource:
    ref: HelmRenderedResourceRef
    document: dict[str, Any]


_YAML_DOCUMENT_SEPARATOR = re.compile(r"(?m)^---[ \t]*(?:#.*)?$")
_MISSING = object()
_MAX_DIFF_VALUE_LENGTH = 1024


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
    raw_artifacts: list[str] = []
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
            raw_artifacts.append(raw)

    if payload.artifact == "hooks_diff":
        return _helm_hooks_diff_result(
            payload,
            raw_artifacts,
            source_bytes=source_bytes,
            output_max_bytes=effective_limits.output_max_bytes,
        )
    if payload.artifact == "resources_diff":
        return _helm_resources_diff_result(
            payload,
            raw_artifacts,
            source_bytes=source_bytes,
            output_max_bytes=effective_limits.output_max_bytes,
        )

    try:
        sanitized = [_sanitize_helm_artifact(payload.artifact, raw) for raw in raw_artifacts]
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
    if payload.artifact in {"manifest", "manifest_diff", "resources_diff"}:
        target = "manifest"
    elif payload.artifact == "notes_diff":
        target = "notes"
    elif payload.artifact == "hooks_diff":
        target = "hooks"
    else:
        target = "values"
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
    if artifact == "notes_diff":
        return "".join(f"{redact_log_line(line)}\n" for line in raw.splitlines()).rstrip("\n")
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
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _unified_artifact_diff(left: str, right: str, left_revision: int, right_revision: int) -> str:
    return "".join(
        difflib.unified_diff(
            left.splitlines(keepends=True),
            right.splitlines(keepends=True),
            fromfile=f"revision-{left_revision}.yaml",
            tofile=f"revision-{right_revision}.yaml",
        )
    )


def _helm_hooks_diff_result(
    payload: HelmArtifactCommandPayload,
    raw_artifacts: Sequence[str],
    *,
    source_bytes: int,
    output_max_bytes: int,
) -> HelmArtifactRunResult:
    if len(raw_artifacts) != 2 or payload.comparison_revision is None:
        return HelmArtifactRunResult(False, error_code="helm_artifact_invalid_revisions")
    left_documents, left_errors = _sanitized_yaml_documents(raw_artifacts[0])
    right_documents, right_errors = _sanitized_yaml_documents(raw_artifacts[1])
    left = _hook_snapshots(left_documents, payload.namespace)
    right = _hook_snapshots(right_documents, payload.namespace)
    hook_diff = _diff_hooks(
        left,
        right,
        revision1=payload.revision,
        revision2=payload.comparison_revision,
        parse_error_count=left_errors + right_errors,
    )
    bounded = _bounded_structured_projection(
        "hooks_diff",
        hook_diff.model_dump(mode="json"),
        output_max_bytes,
    )
    if bounded is None:
        return HelmArtifactRunResult(False, error_code="helm_artifact_projection_too_large")
    projection, encoded, truncated = bounded
    artifact = HelmArtifactResult(
        artifact="hooks_diff",
        format="structured",
        namespace=payload.namespace,
        release_name=payload.release_name,
        revision=payload.revision,
        comparison_revision=payload.comparison_revision,
        hooks_diff=HelmHooksDiff.model_validate(projection),
        projection_sha256=hashlib.sha256(encoded).hexdigest(),
        projection_bytes=len(encoded),
        source_bytes=source_bytes,
        redaction_applied=True,
        truncated=truncated,
    )
    return HelmArtifactRunResult(True, artifact=artifact)


def _helm_resources_diff_result(
    payload: HelmArtifactCommandPayload,
    raw_artifacts: Sequence[str],
    *,
    source_bytes: int,
    output_max_bytes: int,
) -> HelmArtifactRunResult:
    if len(raw_artifacts) != 2 or payload.comparison_revision is None:
        return HelmArtifactRunResult(False, error_code="helm_artifact_invalid_revisions")
    left_documents, left_errors = _sanitized_yaml_documents(raw_artifacts[0])
    right_documents, right_errors = _sanitized_yaml_documents(raw_artifacts[1])
    resource_diff = _diff_rendered_resources(
        _rendered_resources(left_documents),
        _rendered_resources(right_documents),
        revision1=payload.revision,
        revision2=payload.comparison_revision,
        parse_error_count=left_errors + right_errors,
    )
    bounded = _bounded_structured_projection(
        "resources_diff",
        resource_diff.model_dump(mode="json"),
        output_max_bytes,
    )
    if bounded is None:
        return HelmArtifactRunResult(False, error_code="helm_artifact_projection_too_large")
    projection, encoded, truncated = bounded
    artifact = HelmArtifactResult(
        artifact="resources_diff",
        format="structured",
        namespace=payload.namespace,
        release_name=payload.release_name,
        revision=payload.revision,
        comparison_revision=payload.comparison_revision,
        resources_diff=HelmResourcesDiff.model_validate(projection),
        projection_sha256=hashlib.sha256(encoded).hexdigest(),
        projection_bytes=len(encoded),
        source_bytes=source_bytes,
        redaction_applied=True,
        truncated=truncated,
    )
    return HelmArtifactRunResult(True, artifact=artifact)


def _sanitized_yaml_documents(raw: str) -> tuple[list[dict[str, Any]], int]:
    documents: list[dict[str, Any]] = []
    parse_error_count = 0
    for source in _YAML_DOCUMENT_SEPARATOR.split(raw):
        if not source.strip():
            continue
        try:
            loaded = yaml.safe_load(source)
        except yaml.YAMLError:
            parse_error_count += 1
            continue
        if loaded is None:
            continue
        if not isinstance(loaded, dict):
            parse_error_count += 1
            continue
        redacted = _redact_manifest_document(loaded)
        if not isinstance(redacted, dict):
            parse_error_count += 1
            continue
        documents.append(redacted)
    return documents, parse_error_count


def _hook_snapshots(
    documents: Sequence[Mapping[str, Any]],
    default_namespace: str,
) -> tuple[_HookSnapshot, ...]:
    snapshots: list[_HookSnapshot] = []
    for document in documents:
        metadata = _mapping(document.get("metadata"))
        annotations = _mapping(metadata.get("annotations"))
        events = _csv_values(annotations.get("helm.sh/hook"))
        name = _clean_text(metadata.get("name"))
        kind = _clean_text(document.get("kind"))
        if not events or not name or not kind:
            continue
        item = HelmHookDiffItem(
            api_version=_clean_text(document.get("apiVersion")),
            kind=kind,
            name=name,
            namespace=_clean_text(metadata.get("namespace")) or default_namespace,
            events=events,
            weight=_safe_int(annotations.get("helm.sh/hook-weight")),
            delete_policies=_csv_values(annotations.get("helm.sh/hook-delete-policy")),
            output_log_policies=_csv_values(annotations.get("helm.sh/hook-output-log-policy")),
        )
        snapshots.append(
            _HookSnapshot(
                item=item,
                manifest_digest=hashlib.sha256(_canonical_json(document)).hexdigest(),
            )
        )
    return tuple(sorted(snapshots, key=lambda item: _hook_key(item.item)))


def _diff_hooks(
    left: Sequence[_HookSnapshot],
    right: Sequence[_HookSnapshot],
    *,
    revision1: int,
    revision2: int,
    parse_error_count: int,
) -> HelmHooksDiff:
    left_by_key = {_hook_key(snapshot.item): snapshot for snapshot in left}
    right_by_key = {_hook_key(snapshot.item): snapshot for snapshot in right}
    added: list[HelmHookDiffItem] = []
    removed: list[HelmHookDiffItem] = []
    modified: list[HelmHookDiffItem] = []
    unchanged: list[HelmHookDiffItem] = []
    for key in sorted(set(left_by_key) | set(right_by_key)):
        previous = left_by_key.get(key)
        current = right_by_key.get(key)
        if previous is None and current is not None:
            added.append(current.item)
        elif current is None and previous is not None:
            removed.append(previous.item)
        elif previous is not None and current is not None:
            if previous == current:
                unchanged.append(current.item)
            else:
                modified.append(
                    current.item.model_copy(
                        update={
                            "manifest_changed": (
                                previous.manifest_digest != current.manifest_digest
                            )
                        }
                    )
                )
    return HelmHooksDiff(
        revision1=revision1,
        revision2=revision2,
        added=tuple(added),
        removed=tuple(removed),
        modified=tuple(modified),
        unchanged=tuple(unchanged),
        parse_error_count=parse_error_count,
    )


def _hook_key(item: HelmHookDiffItem) -> tuple[str, str, str, str]:
    return (item.api_version, item.kind, item.namespace, item.name)


def _rendered_resources(
    documents: Sequence[Mapping[str, Any]],
) -> tuple[_RenderedResource, ...]:
    resources: list[_RenderedResource] = []
    for source in documents:
        document = _normalized_rendered_resource(source)
        metadata = _mapping(document.get("metadata"))
        name = _clean_text(metadata.get("name"))
        kind = _clean_text(document.get("kind"))
        if not name or not kind:
            continue
        ref = HelmRenderedResourceRef(
            api_version=_clean_text(document.get("apiVersion")),
            kind=kind,
            name=name,
            namespace=_clean_text(metadata.get("namespace")),
        )
        resources.append(_RenderedResource(ref=ref, document=document))
    return tuple(sorted(resources, key=lambda item: _resource_key(item.ref)))


def _normalized_rendered_resource(source: Mapping[str, Any]) -> dict[str, Any]:
    document = json.loads(_canonical_json(source))
    metadata = document.get("metadata")
    if not isinstance(metadata, dict):
        return document
    labels = metadata.get("labels")
    if not isinstance(labels, dict):
        return document
    labels.pop("helm.sh/chart", None)
    if not labels:
        metadata.pop("labels", None)
    return document


def _diff_rendered_resources(
    left: Sequence[_RenderedResource],
    right: Sequence[_RenderedResource],
    *,
    revision1: int,
    revision2: int,
    parse_error_count: int,
) -> HelmResourcesDiff:
    left_by_key = {_resource_key(resource.ref): resource for resource in left}
    right_by_key = {_resource_key(resource.ref): resource for resource in right}
    added: list[HelmRenderedResourceRef] = []
    removed: list[HelmRenderedResourceRef] = []
    modified: list[HelmRenderedResourceChange] = []
    unchanged: list[HelmRenderedResourceRef] = []
    for key in sorted(set(left_by_key) | set(right_by_key)):
        previous = left_by_key.get(key)
        current = right_by_key.get(key)
        if previous is None and current is not None:
            added.append(current.ref)
            continue
        if current is None and previous is not None:
            removed.append(previous.ref)
            continue
        if previous is None or current is None:
            continue
        fields = _resource_field_changes(previous.document, current.document)
        if not fields:
            unchanged.append(current.ref)
            continue
        modified.append(
            HelmRenderedResourceChange(
                **current.ref.model_dump(),
                summary=f"{len(fields)} fields changed",
                field_count=len(fields),
                fields=tuple(fields),
            )
        )
    return HelmResourcesDiff(
        revision1=revision1,
        revision2=revision2,
        added=tuple(added),
        removed=tuple(removed),
        modified=tuple(modified),
        unchanged=tuple(unchanged),
        parse_error_count=parse_error_count,
    )


def _resource_key(item: HelmRenderedResourceRef) -> tuple[str, str, str, str]:
    return (item.api_version, item.kind, item.namespace, item.name)


def _resource_field_changes(
    previous: object,
    current: object,
    path: str = "",
) -> list[HelmResourceFieldChange]:
    if isinstance(previous, Mapping) and isinstance(current, Mapping):
        changes: list[HelmResourceFieldChange] = []
        for key in sorted(set(previous) | set(current), key=str):
            child_path = f"{path}.{key}" if path else str(key)
            changes.extend(
                _resource_field_changes(
                    previous.get(key, _MISSING),
                    current.get(key, _MISSING),
                    child_path,
                )
            )
        return changes
    if (
        isinstance(previous, Sequence)
        and not isinstance(previous, (str, bytes, bytearray))
        and isinstance(current, Sequence)
        and not isinstance(current, (str, bytes, bytearray))
    ):
        changes = []
        for index in range(max(len(previous), len(current))):
            changes.extend(
                _resource_field_changes(
                    previous[index] if index < len(previous) else _MISSING,
                    current[index] if index < len(current) else _MISSING,
                    f"{path}[{index}]",
                )
            )
        return changes
    if previous == current:
        return []
    return [
        HelmResourceFieldChange(
            path=path or "$",
            old_value=_resource_field_value(previous),
            new_value=_resource_field_value(current),
        )
    ]


def _resource_field_value(value: object) -> str | int | bool | None:
    if value is _MISSING or value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return _bounded_text(value, _MAX_DIFF_VALUE_LENGTH)
    if isinstance(value, float):
        return _bounded_text(repr(value), _MAX_DIFF_VALUE_LENGTH)
    return _bounded_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        _MAX_DIFF_VALUE_LENGTH,
    )


def _bounded_structured_projection(
    kind: str,
    projection: dict[str, Any],
    limit: int,
) -> tuple[dict[str, Any], bytes, bool] | None:
    bounded = json.loads(_canonical_json(projection))
    encoded = _canonical_json(bounded)
    if len(encoded) <= limit:
        return bounded, encoded, False
    while len(encoded) > limit:
        changed = (
            _trim_hook_projection(bounded)
            if kind == "hooks_diff"
            else _trim_resource_projection(bounded)
        )
        if not changed:
            return None
        encoded = _canonical_json(bounded)
    return bounded, encoded, True


def _trim_hook_projection(projection: dict[str, Any]) -> bool:
    for key in ("unchanged", "modified", "added", "removed"):
        values = projection.get(key)
        if isinstance(values, list) and values:
            values.pop()
            return True
    return False


def _trim_resource_projection(projection: dict[str, Any]) -> bool:
    unchanged = projection.get("unchanged")
    if isinstance(unchanged, list) and unchanged:
        unchanged.pop()
        return True
    modified = projection.get("modified")
    if isinstance(modified, list):
        for item in reversed(modified):
            if isinstance(item, dict):
                fields = item.get("fields")
                if isinstance(fields, list) and fields:
                    fields.pop()
                    return True
    for key in ("added", "removed", "modified"):
        values = projection.get(key)
        if isinstance(values, list) and values:
            values.pop()
            return True
    return False


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _csv_values(value: object) -> tuple[str, ...]:
    return tuple(sorted({item.strip() for item in str(value or "").split(",") if item.strip()}))


def _safe_int(value: object) -> int:
    try:
        return int(str(value or "0").strip())
    except ValueError:
        return 0


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _bounded_text(value: str, limit: int) -> str:
    encoded = value.encode("utf-8")
    if len(encoded) <= limit:
        return value
    return encoded[:limit].decode("utf-8", errors="ignore")


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
