"""Bounded Kubernetes API discovery contracts shared by agent and gateway."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from packages.contracts.modeling import StrictModel

MAX_API_DISCOVERY_DOCUMENTS = 128
MAX_API_RESOURCES = 2_000
MAX_API_RESOURCE_VERBS = 32

ApiResourceDiscoveryCompleteness = Literal["exact", "partial", "unavailable"]


class ApiResourceDescriptor(StrictModel):
    group: str = Field(max_length=253)
    version: str = Field(min_length=1, max_length=63)
    api_version: str = Field(min_length=1, max_length=317)
    name: str = Field(min_length=1, max_length=253)
    singular_name: str = Field(max_length=253)
    kind: str = Field(min_length=1, max_length=253)
    namespaced: bool
    is_crd: bool | None
    verbs: list[str] = Field(default_factory=list, max_length=MAX_API_RESOURCE_VERBS)


class ApiResourceDiscoveryObservation(StrictModel):
    observed_at: datetime
    completeness: ApiResourceDiscoveryCompleteness
    reason_codes: list[str] = Field(
        default_factory=list, max_length=MAX_API_DISCOVERY_DOCUMENTS + 4
    )
    resources: list[ApiResourceDescriptor] = Field(
        default_factory=list,
        max_length=MAX_API_RESOURCES,
    )


def normalize_api_resource_discovery(
    *,
    documents: Sequence[Mapping[str, Any]],
    custom_resource_definitions: Sequence[Mapping[str, Any]] | None,
    observed_at: str | datetime,
    reason_codes: Sequence[str] = (),
    truncated: bool = False,
) -> ApiResourceDiscoveryObservation:
    """Normalize discovery documents without guessing unavailable CRD identity."""

    normalized_reasons = {
        reason.strip() for reason in reason_codes if isinstance(reason, str) and reason.strip()
    }
    bounded_documents = list(documents[:MAX_API_DISCOVERY_DOCUMENTS])
    if len(documents) > MAX_API_DISCOVERY_DOCUMENTS:
        truncated = True

    crd_identities = (
        _custom_resource_identities(custom_resource_definitions)
        if custom_resource_definitions is not None
        else None
    )
    if custom_resource_definitions is None and not any(
        reason.startswith("crd_discovery_") for reason in normalized_reasons
    ):
        normalized_reasons.add("crd_discovery_unavailable")

    resources: dict[tuple[str, str, str], ApiResourceDescriptor] = {}
    for document in bounded_documents:
        group_version = _text(document.get("groupVersion"))
        group, version = _split_api_version(group_version)
        if not version:
            normalized_reasons.add("invalid_discovery_document")
            continue
        raw_resources = document.get("resources")
        if not isinstance(raw_resources, list):
            normalized_reasons.add(f"invalid_group_version:{group_version}")
            continue
        for raw_resource in raw_resources:
            if not isinstance(raw_resource, Mapping):
                normalized_reasons.add(f"invalid_group_version:{group_version}")
                continue
            name = _text(raw_resource.get("name"))
            kind = _text(raw_resource.get("kind"))
            if not name or "/" in name or not kind:
                continue
            namespaced = raw_resource.get("namespaced")
            if not isinstance(namespaced, bool):
                normalized_reasons.add(f"invalid_resource:{group_version}:{name}")
                continue
            key = (group, version, name)
            descriptor = ApiResourceDescriptor(
                group=group,
                version=version,
                api_version=group_version,
                name=name,
                singular_name=_text(raw_resource.get("singularName")),
                kind=kind,
                namespaced=namespaced,
                is_crd=_is_custom_resource(
                    group=group,
                    version=version,
                    name=name,
                    identities=crd_identities,
                ),
                verbs=_verbs(raw_resource.get("verbs")),
            )
            previous = resources.get(key)
            if previous is None:
                resources[key] = descriptor
                continue
            if (
                previous.kind != descriptor.kind
                or previous.namespaced != descriptor.namespaced
                or previous.is_crd != descriptor.is_crd
            ):
                normalized_reasons.add(f"resource_identity_conflict:{group_version}:{name}")
            resources[key] = previous.model_copy(
                update={"verbs": sorted(set(previous.verbs) | set(descriptor.verbs))}
            )

    ordered = sorted(
        resources.values(),
        key=lambda item: (item.group, item.version, item.name, item.kind),
    )
    if len(ordered) > MAX_API_RESOURCES:
        ordered = ordered[:MAX_API_RESOURCES]
        truncated = True
    if truncated:
        normalized_reasons.add("catalog_truncated")
    ordered_reasons = sorted(normalized_reasons)
    completeness: ApiResourceDiscoveryCompleteness = "exact" if not ordered_reasons else "partial"
    return ApiResourceDiscoveryObservation(
        observed_at=observed_at,
        completeness=completeness,
        reason_codes=ordered_reasons,
        resources=ordered,
    )


def _custom_resource_identities(
    definitions: Sequence[Mapping[str, Any]],
) -> set[tuple[str, str, str]]:
    identities: set[tuple[str, str, str]] = set()
    for definition in definitions:
        spec = definition.get("spec")
        if not isinstance(spec, Mapping):
            continue
        group = _text(spec.get("group"))
        names = spec.get("names")
        plural = _text(names.get("plural")) if isinstance(names, Mapping) else ""
        versions = spec.get("versions")
        if not group or not plural or not isinstance(versions, list):
            continue
        for version in versions:
            if not isinstance(version, Mapping) or version.get("served") is not True:
                continue
            version_name = _text(version.get("name"))
            if version_name:
                identities.add((group, version_name, plural))
    return identities


def _is_custom_resource(
    *,
    group: str,
    version: str,
    name: str,
    identities: set[tuple[str, str, str]] | None,
) -> bool | None:
    if group == "":
        return False
    if identities is None:
        return None
    return (group, version, name) in identities


def _split_api_version(value: str) -> tuple[str, str]:
    if "/" not in value:
        return "", value
    group, version = value.rsplit("/", 1)
    return group, version


def _verbs(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    verbs = sorted({verb.strip() for verb in value if isinstance(verb, str) and verb.strip()})
    return verbs[:MAX_API_RESOURCE_VERBS]


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""
