"""서버 소유 catalog install recipe와 입력 검증."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from pydantic import Field

from domains.catalog.repository import BOOTSTRAP_CATALOG_ITEMS
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ResourceRef

DNS_LABEL_PATTERN = re.compile(r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$")
HELM_RELEASE_PATTERN = DNS_LABEL_PATTERN
OCI_DIGEST_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
MAX_KUBERNETES_NAME_LENGTH = 63
MAX_HELM_RELEASE_LENGTH = 53
SERVER_HELM_REGISTRY_PREFIX = "oci://registry-1.docker.io/bitnamicharts/"


class CatalogInstallValidationError(ValueError):
    pass


class CatalogRecipeUnsupported(ValueError):
    pass


class CatalogHelmUpgradeGuard(StrictModel):
    expected_revision: int = Field(ge=1)
    storage: ResourceRef
    storage_resource_version: str = Field(min_length=1, max_length=253)
    chart_name: str = Field(min_length=1, max_length=512)
    chart_version: str = Field(min_length=1, max_length=256)

    def validate_target(self, *, namespace: str, release_name: str) -> None:
        if (
            self.expected_revision < 1
            or not self.storage_resource_version
            or not self.chart_name
            or not self.chart_version
            or self.storage.api_group
            or self.storage.version != "v1"
            or self.storage.kind.casefold() != "secret"
            or self.storage.namespace != namespace
            or not self.storage.name
            or not self.storage.uid
            or not release_name
        ):
            raise CatalogInstallValidationError("Helm upgrade guard is invalid")


class CatalogHelmInstallPayload(StrictModel):
    catalog_item_id: str
    catalog_version: str
    namespace: str
    application_name: str
    release_name: str
    values: dict[str, Any]
    upgrade_guard: CatalogHelmUpgradeGuard | None = None


@dataclass(frozen=True)
class ServerHelmRecipe:
    item_id: str
    display_name: str
    version: str
    package_ref: str
    chart_version: str
    chart_digest: str
    values_schema: JsonObject
    fixed_values: JsonObject

    @property
    def digest_reference(self) -> str:
        return f"{self.package_ref}@{self.chart_digest}"

    @property
    def chart_name(self) -> str:
        """Return the exact OCI chart segment owned by this server recipe."""

        return self.package_ref.rsplit("/", maxsplit=1)[-1]


def server_helm_recipe(item_id: str, version: str) -> ServerHelmRecipe:
    for recipe in server_helm_recipes():
        if recipe.item_id == item_id and recipe.version == version:
            return recipe
    raise CatalogRecipeUnsupported("catalog recipe is not executable by the target Agent")


def server_helm_recipes() -> tuple[ServerHelmRecipe, ...]:
    """Return the exact bounded recipes executable by the target Agent."""

    recipes: list[ServerHelmRecipe] = []
    for item in BOOTSTRAP_CATALOG_ITEMS:
        for candidate in item.get("versions", []):
            template = candidate.get("template")
            package_ref = candidate.get("package_ref")
            if (
                candidate.get("package_type") != "helm"
                or not isinstance(template, dict)
                or template.get("runner") != "helm"
                or not isinstance(package_ref, str)
                or not package_ref.startswith(SERVER_HELM_REGISTRY_PREFIX)
            ):
                continue
            chart_version = template.get("chart_version")
            chart_digest = template.get("chart_digest")
            if not isinstance(chart_version, str) or not chart_version:
                continue
            if not isinstance(chart_digest, str) or not OCI_DIGEST_PATTERN.fullmatch(chart_digest):
                continue
            recipes.append(
                ServerHelmRecipe(
                    item_id=str(item["item_id"]),
                    display_name=str(item.get("name") or item["item_id"]),
                    version=str(candidate["version"]),
                    package_ref=package_ref,
                    chart_version=chart_version,
                    chart_digest=chart_digest,
                    values_schema=dict(candidate.get("values_schema") or {}),
                    fixed_values=dict(template.get("fixed_values") or {}),
                )
            )
    return tuple(sorted(recipes, key=lambda item: (item.display_name, item.version)))


def validate_install_name(field: str, value: str, *, max_length: int) -> None:
    if len(value) > max_length or DNS_LABEL_PATTERN.fullmatch(value) is None:
        raise CatalogInstallValidationError(f"{field} must be a safe DNS label")


def validate_install_names(
    *,
    application_name: str,
    namespace: str,
    release_name: str,
) -> None:
    validate_install_name(
        "application_name", application_name, max_length=MAX_KUBERNETES_NAME_LENGTH
    )
    validate_install_name("namespace", namespace, max_length=MAX_KUBERNETES_NAME_LENGTH)
    if (
        len(release_name) > MAX_HELM_RELEASE_LENGTH
        or HELM_RELEASE_PATTERN.fullmatch(release_name) is None
    ):
        raise CatalogInstallValidationError("release_name must be a safe Helm release name")


def is_kubernetes_dns_subdomain(value: str) -> bool:
    if not value or len(value) > 253:
        return False
    labels = value.split(".")
    return all(
        len(label) <= MAX_KUBERNETES_NAME_LENGTH and DNS_LABEL_PATTERN.fullmatch(label) is not None
        for label in labels
    )


def value_matches_type(value: object, expected: str) -> bool:
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    return False


def validate_catalog_values(schema: JsonObject, values: JsonObject) -> JsonObject:
    properties = schema.get("properties")
    declared = properties if isinstance(properties, dict) else {}
    required_value = schema.get("required")
    required = required_value if isinstance(required_value, list) else []

    unknown = sorted(set(values) - set(declared))
    if unknown:
        raise CatalogInstallValidationError(f"catalog value is not declared: {unknown[0]}")
    missing = sorted(str(name) for name in required if name not in values)
    if missing:
        raise CatalogInstallValidationError(f"required catalog value is missing: {missing[0]}")

    validated = dict(values)
    for name, rule_value in declared.items():
        rule = rule_value if isinstance(rule_value, dict) else {}
        if name not in validated:
            continue
        expected = rule.get("type")
        if not isinstance(expected, str) or not value_matches_type(validated[name], expected):
            raise CatalogInstallValidationError(f"catalog value has invalid type: {name}")
        allowed = rule.get("enum")
        if isinstance(allowed, list) and validated[name] not in allowed:
            raise CatalogInstallValidationError(f"catalog value is not an allowed option: {name}")
        if (
            rule.get("format") == "kubernetes-dns-subdomain"
            and isinstance(validated[name], str)
            and not is_kubernetes_dns_subdomain(validated[name])
        ):
            raise CatalogInstallValidationError(
                f"catalog value is not a Kubernetes DNS subdomain: {name}"
            )
    return validated
