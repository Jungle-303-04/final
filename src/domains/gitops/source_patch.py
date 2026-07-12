"""Commit-pinned raw manifest를 재직렬화 없이 제한적으로 수정한다."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

import yaml
from yaml.nodes import MappingNode, Node, ScalarNode, SequenceNode
from yaml.tokens import AliasToken, AnchorToken

RAW_JSON = "raw-json"
RAW_YAML = "raw-yaml"
SUPPORTED_SOURCE_TYPES = frozenset({RAW_JSON, RAW_YAML})
IMAGE_PATCH_API_VERSION = "gitops.krafton.dev/v1alpha1"
IMAGE_PATCH_KIND = "GitOpsImagePatch"
CONTAINER_LIST_KEYS = ("containers", "initContainers", "ephemeralContainers")
PLAIN_IMAGE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/@:+-]*$")


class ManifestSourcePatchError(ValueError):
    """원문이 승인 snapshot과 다르거나 단일 image 치환을 보장할 수 없음."""


@dataclass(frozen=True)
class ImageScalarReplacement:
    container_name: str
    current_image: str
    previous_image: str


@dataclass(frozen=True)
class ManifestImagePatchPlan:
    source_type: str
    source_manifest_sha256: str
    expected_base_sha: str
    manifest_path: str
    replacements: tuple[ImageScalarReplacement, ...]


def image_patch_content(plan: ManifestImagePatchPlan) -> str:
    """구버전 provider도 안전한 별도 파일로만 쓰는 비밀 없는 instruction 문서."""

    validate_image_patch_plan(plan)
    return yaml.safe_dump(
        {
            "apiVersion": IMAGE_PATCH_API_VERSION,
            "kind": IMAGE_PATCH_KIND,
            "spec": {
                "sourceType": plan.source_type,
                "sourceManifestSha256": plan.source_manifest_sha256,
                "expectedBaseSha": plan.expected_base_sha,
                "manifestPath": plan.manifest_path,
                "replacements": [
                    {
                        "containerName": item.container_name,
                        "currentImage": item.current_image,
                        "previousImage": item.previous_image,
                    }
                    for item in plan.replacements
                ],
            },
        },
        sort_keys=False,
        allow_unicode=True,
    )


def parse_image_patch_plan(content: str) -> ManifestImagePatchPlan | None:
    try:
        payload = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise ManifestSourcePatchError("structured image patch document is invalid") from exc
    if not isinstance(payload, dict) or payload.get("kind") != IMAGE_PATCH_KIND:
        return None
    if payload.get("apiVersion") != IMAGE_PATCH_API_VERSION or set(payload) != {
        "apiVersion",
        "kind",
        "spec",
    }:
        raise ManifestSourcePatchError("structured image patch document is invalid")
    spec = payload.get("spec")
    if not isinstance(spec, dict) or set(spec) != {
        "sourceType",
        "sourceManifestSha256",
        "expectedBaseSha",
        "manifestPath",
        "replacements",
    }:
        raise ManifestSourcePatchError("structured image patch document is invalid")
    raw_replacements = spec["replacements"]
    if not isinstance(raw_replacements, list):
        raise ManifestSourcePatchError("structured image patch document is invalid")
    replacements: list[ImageScalarReplacement] = []
    for raw in raw_replacements:
        if not isinstance(raw, dict) or set(raw) != {
            "containerName",
            "currentImage",
            "previousImage",
        }:
            raise ManifestSourcePatchError("structured image patch document is invalid")
        if not all(isinstance(raw[key], str) for key in raw):
            raise ManifestSourcePatchError("structured image patch document is invalid")
        replacements.append(
            ImageScalarReplacement(
                container_name=raw["containerName"],
                current_image=raw["currentImage"],
                previous_image=raw["previousImage"],
            )
        )
    plan = ManifestImagePatchPlan(
        source_type=spec["sourceType"] if isinstance(spec["sourceType"], str) else "",
        source_manifest_sha256=(
            spec["sourceManifestSha256"] if isinstance(spec["sourceManifestSha256"], str) else ""
        ),
        expected_base_sha=(
            spec["expectedBaseSha"] if isinstance(spec["expectedBaseSha"], str) else ""
        ),
        manifest_path=spec["manifestPath"] if isinstance(spec["manifestPath"], str) else "",
        replacements=tuple(replacements),
    )
    validate_image_patch_plan(plan)
    return plan


def validate_image_patch_plan(plan: ManifestImagePatchPlan) -> None:
    if (
        plan.source_type != RAW_YAML
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", plan.source_manifest_sha256)
        or not re.fullmatch(r"[0-9a-f]{40,64}", plan.expected_base_sha)
        or not safe_manifest_path(plan.manifest_path)
        or len(plan.replacements) != 1
    ):
        raise ManifestSourcePatchError("structured image patch metadata is incomplete")
    replacement = plan.replacements[0]
    if (
        not replacement.container_name
        or not replacement.current_image
        or not replacement.previous_image
        or replacement.current_image == replacement.previous_image
    ):
        raise ManifestSourcePatchError("structured image patch metadata is incomplete")


def safe_manifest_path(value: str) -> bool:
    path = PurePosixPath(value)
    return bool(
        value and not value.startswith("/") and "\\" not in value and ".." not in path.parts
    )


def canonical_manifest_digest(value: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        dict(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}"


def parse_single_manifest(source: str, source_type: str) -> dict[str, Any]:
    if source_type not in SUPPORTED_SOURCE_TYPES:
        raise ManifestSourcePatchError("unsupported manifest source type")
    try:
        if source_type == RAW_JSON:
            value = json.loads(source)
        else:
            documents = list(yaml.safe_load_all(source))
            if len(documents) != 1:
                raise ManifestSourcePatchError("manifest source must contain one document")
            value = documents[0]
    except (json.JSONDecodeError, yaml.YAMLError) as exc:
        raise ManifestSourcePatchError("manifest source is invalid") from exc
    if not isinstance(value, dict):
        raise ManifestSourcePatchError("manifest source must be one object")
    return value


def materialize_image_patch(
    source: str,
    *,
    source_type: str,
    expected_source_sha256: str,
    replacements: Sequence[ImageScalarReplacement],
) -> str:
    """검증된 원문에서 이름 있는 container image scalar만 byte-span 치환한다."""

    original = parse_single_manifest(source, source_type)
    if original.get("kind") != "Deployment":
        raise ManifestSourcePatchError("manifest source must be a Deployment")
    if canonical_manifest_digest(original) != expected_source_sha256:
        raise ManifestSourcePatchError("manifest source digest does not match approved artifact")
    if not replacements:
        raise ManifestSourcePatchError("manifest image replacement is missing")
    try:
        if any(isinstance(token, AnchorToken | AliasToken) for token in yaml.scan(source)):
            raise ManifestSourcePatchError("manifest anchors and aliases are not patchable")
        nodes = list(yaml.compose_all(source))
    except yaml.YAMLError as exc:
        raise ManifestSourcePatchError("manifest source is invalid") from exc
    if len(nodes) != 1 or not isinstance(nodes[0], MappingNode):
        raise ManifestSourcePatchError("manifest source must contain one object")

    node_containers = deployment_container_nodes(nodes[0])
    expected = deepcopy(original)
    object_containers = deployment_container_objects(expected)
    spans: list[tuple[int, int, str]] = []
    used_names: set[str] = set()
    for replacement in replacements:
        if (
            not replacement.container_name
            or not replacement.current_image
            or not replacement.previous_image
            or replacement.current_image == replacement.previous_image
            or replacement.container_name in used_names
        ):
            raise ManifestSourcePatchError("manifest image replacement is ambiguous")
        used_names.add(replacement.container_name)

        node_matches = [
            image
            for name, image in node_containers
            if name == replacement.container_name and image.value == replacement.current_image
        ]
        object_matches = [
            container
            for container in object_containers
            if container.get("name") == replacement.container_name
            and container.get("image") == replacement.current_image
        ]
        if len(node_matches) != 1 or len(object_matches) != 1:
            raise ManifestSourcePatchError("manifest image target is not unique")
        image_node = node_matches[0]
        encoded = encoded_scalar(image_node, replacement.previous_image)
        spans.append((image_node.start_mark.index, image_node.end_mark.index, encoded))
        object_matches[0]["image"] = replacement.previous_image

    if len({(start, end) for start, end, _ in spans}) != len(spans):
        raise ManifestSourcePatchError("manifest image target overlaps")
    patched = source
    for start, end, encoded in sorted(spans, reverse=True):
        patched = f"{patched[:start]}{encoded}{patched[end:]}"
    if parse_single_manifest(patched, source_type) != expected:
        raise ManifestSourcePatchError("manifest patch changed fields outside approved images")
    return patched


def mapping_value(node: MappingNode, key: str) -> Node | None:
    for key_node, value_node in node.value:
        if isinstance(key_node, ScalarNode) and key_node.value == key:
            return value_node
    return None


def deployment_container_nodes(root: MappingNode) -> list[tuple[str, ScalarNode]]:
    spec = mapping_value(root, "spec")
    template = mapping_value(spec, "template") if isinstance(spec, MappingNode) else None
    pod_spec = mapping_value(template, "spec") if isinstance(template, MappingNode) else None
    if not isinstance(pod_spec, MappingNode):
        return []
    result: list[tuple[str, ScalarNode]] = []
    for key in CONTAINER_LIST_KEYS:
        sequence = mapping_value(pod_spec, key)
        if not isinstance(sequence, SequenceNode):
            continue
        for item in sequence.value:
            if not isinstance(item, MappingNode):
                continue
            name = mapping_value(item, "name")
            image = mapping_value(item, "image")
            if isinstance(name, ScalarNode) and isinstance(image, ScalarNode):
                result.append((name.value, image))
    return result


def deployment_container_objects(root: dict[str, Any]) -> list[dict[str, Any]]:
    spec = root.get("spec")
    template = spec.get("template") if isinstance(spec, dict) else None
    pod_spec = template.get("spec") if isinstance(template, dict) else None
    if not isinstance(pod_spec, dict):
        return []
    result: list[dict[str, Any]] = []
    for key in CONTAINER_LIST_KEYS:
        containers = pod_spec.get(key)
        if isinstance(containers, list):
            result.extend(item for item in containers if isinstance(item, dict))
    return result


def encoded_scalar(node: ScalarNode, value: str) -> str:
    if node.style is None and PLAIN_IMAGE_PATTERN.fullmatch(value):
        return value
    if node.style == "'":
        return f"'{value.replace(chr(39), chr(39) * 2)}'"
    if node.style == '"':
        return json.dumps(value, ensure_ascii=False)
    raise ManifestSourcePatchError("manifest image scalar style is not patchable")
