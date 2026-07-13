from __future__ import annotations

import pytest
from packages.contracts.remediation_source import (
    RemediationSourceContractError,
    parse_remediation_source_contract,
)

from domains.gitops.source_patch import (
    ManifestScalarPatchPlan,
    RemediationSourcePatchUnsupported,
    ScalarFieldReplacement,
    declared_scalar_patch,
    materialize_declared_scalar_patch,
)

BASE_SHA = "a" * 40
SOURCE_DIGEST = "sha256:" + "b" * 64


def contract_content() -> str:
    return """\
apiVersion: remediation.opsia.dev/v1alpha1
kind: RemediationSource
spec:
  sources:
    - manifestPath: deploy/app.yaml
      sourceType: raw-yaml
      path: deploy/app.yaml
      imagePath: spec.template.spec.containers[name=checkout-api].image
      replicaPath: spec.replicas
      probePaths:
        readinessProbe.timeoutSeconds: spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds
    - manifestPath: charts/checkout/Chart.yaml
      sourceType: helm-values
      path: charts/checkout/values.yaml
      imageTagPath: image.tag
      replicaPath: replicaCount
      probePaths:
        readinessProbe.timeoutSeconds: probes.readiness.timeoutSeconds
    - manifestPath: overlays/prod/kustomization.yaml
      sourceType: kustomize
      path: overlays/prod/kustomization.yaml
      images:
        - name: ghcr.io/project/checkout-api
"""


def plan(
    action_type: str,
    manifest_path: str,
    field_path: str,
    current: str | int,
    desired: str | int,
) -> ManifestScalarPatchPlan:
    return ManifestScalarPatchPlan(
        action_type=action_type,
        source_type="raw-yaml",
        source_manifest_sha256=SOURCE_DIGEST,
        expected_base_sha=BASE_SHA,
        manifest_path=manifest_path,
        replacements=(ScalarFieldReplacement(field_path, current, desired),),
        rollback_replacements=(ScalarFieldReplacement(field_path, desired, current),),
    )


def test_contract_parses_explicit_raw_helm_and_kustomize_sources() -> None:
    contract = parse_remediation_source_contract(contract_content())

    assert [source.source_type for source in contract.sources] == [
        "raw-yaml",
        "helm-values",
        "kustomize",
    ]
    assert contract.sources[0].image_path.endswith(".image")
    assert contract.sources[1].image_tag_path == "image.tag"
    assert contract.sources[2].image_names == ("ghcr.io/project/checkout-api",)


@pytest.mark.parametrize(
    "content",
    [
        contract_content().replace("path: deploy/app.yaml", "path: ../app.yaml", 1),
        contract_content().replace("      imagePath:", "      guessedPath:", 1),
        contract_content().replace(
            "path: deploy/app.yaml",
            "path: &target deploy/app.yaml\n      imagePath: *target",
            1,
        ),
    ],
)
def test_contract_rejects_traversal_unknown_keys_and_yaml_aliases(content: str) -> None:
    with pytest.raises(RemediationSourceContractError):
        parse_remediation_source_contract(content)


def test_undeclared_field_patch_is_unsupported_without_mutating_source() -> None:
    source = """\
apiVersion: apps/v1
kind: Deployment
spec:
  selector:
    matchLabels:
      app: old
"""
    patch_plan = plan(
        "selector_fix",
        "deploy/app.yaml",
        "spec.selector.matchLabels.app",
        "old",
        "new",
    )

    with pytest.raises(RemediationSourcePatchUnsupported, match="unsupported"):
        declared_scalar_patch(patch_plan, parse_remediation_source_contract(contract_content()))

    assert "app: old" in source
    assert "app: new" not in source


@pytest.mark.parametrize(
    ("patch_plan", "source", "before", "after"),
    [
        (
            plan(
                "image_rollback",
                "deploy/app.yaml",
                "spec.template.spec.containers[name=checkout-api].image",
                "ghcr.io/project/checkout-api:v2",
                "ghcr.io/project/checkout-api:v1",
            ),
            """\
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/project/checkout-api:v2
""",
            "image: ghcr.io/project/checkout-api:v2",
            "image: ghcr.io/project/checkout-api:v1",
        ),
        (
            plan("replica_scale", "deploy/app.yaml", "spec.replicas", 2, 3),
            "kind: Deployment\nspec:\n  replicas: 2 # keep\n",
            "replicas: 2 # keep",
            "replicas: 3 # keep",
        ),
        (
            plan(
                "probe_fix",
                "deploy/app.yaml",
                "spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds",
                1,
                3,
            ),
            """\
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: checkout-api
          readinessProbe:
            timeoutSeconds: 1
""",
            "timeoutSeconds: 1",
            "timeoutSeconds: 3",
        ),
    ],
)
def test_raw_contract_materializes_only_declared_scalar(
    patch_plan: ManifestScalarPatchPlan,
    source: str,
    before: str,
    after: str,
) -> None:
    declared = declared_scalar_patch(
        patch_plan,
        parse_remediation_source_contract(contract_content()),
    )

    patched = materialize_declared_scalar_patch(source, declared)

    assert declared.source_path == "deploy/app.yaml"
    assert patched == source.replace(before, after, 1)


def test_helm_values_contract_changes_only_declared_image_tag() -> None:
    patch_plan = plan(
        "image_rollback",
        "charts/checkout/Chart.yaml",
        "spec.template.spec.containers[name=checkout-api].image",
        "ghcr.io/project/checkout-api:v2",
        "ghcr.io/project/checkout-api:v1",
    )
    source = "image:\n  repository: ghcr.io/project/checkout-api\n  tag: v2 # keep\n"

    declared = declared_scalar_patch(
        patch_plan,
        parse_remediation_source_contract(contract_content()),
    )

    assert materialize_declared_scalar_patch(source, declared) == source.replace(
        "tag: v2 # keep", "tag: v1 # keep", 1
    )
    assert declared.source_path == "charts/checkout/values.yaml"


def test_kustomize_contract_changes_only_named_image_new_tag() -> None:
    patch_plan = plan(
        "image_rollback",
        "overlays/prod/kustomization.yaml",
        "spec.template.spec.containers[name=checkout-api].image",
        "ghcr.io/project/checkout-api:v2",
        "ghcr.io/project/checkout-api:v1",
    )
    source = """\
images:
  - name: ghcr.io/project/checkout-api
    newTag: v2
  - name: ghcr.io/project/sidecar
    newTag: stable
"""

    declared = declared_scalar_patch(
        patch_plan,
        parse_remediation_source_contract(contract_content()),
    )

    patched = materialize_declared_scalar_patch(source, declared)
    assert patched == source.replace("newTag: v2", "newTag: v1", 1)
    assert "newTag: stable" in patched


@pytest.mark.parametrize(
    ("current", "desired"),
    [
        ("ghcr.io/project/checkout-api:v2", "ghcr.io/other/checkout-api:v1"),
        (
            "ghcr.io/project/checkout-api:v2",
            "ghcr.io/project/checkout-api@sha256:" + "c" * 64,
        ),
    ],
)
def test_tag_adapters_reject_repository_or_digest_changes(current: str, desired: str) -> None:
    patch_plan = plan(
        "image_rollback",
        "charts/checkout/Chart.yaml",
        "spec.template.spec.containers[name=checkout-api].image",
        current,
        desired,
    )

    with pytest.raises(RemediationSourcePatchUnsupported, match="unsupported"):
        declared_scalar_patch(patch_plan, parse_remediation_source_contract(contract_content()))
