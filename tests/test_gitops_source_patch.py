from __future__ import annotations

import json

import pytest

from domains.gitops.source_patch import (
    ImageScalarReplacement,
    ManifestImagePatchPlan,
    ManifestScalarPatchPlan,
    ManifestSourcePatchError,
    ScalarFieldReplacement,
    canonical_manifest_digest,
    image_patch_content,
    materialize_image_patch,
    materialize_scalar_patch,
    parse_image_patch_plan,
    parse_scalar_patch_plan,
    parse_single_manifest,
    scalar_patch_content,
)


def replacement() -> ImageScalarReplacement:
    return ImageScalarReplacement(
        container_name="checkout-api",
        current_image="ghcr.io/project/checkout-api:v2",
        previous_image="ghcr.io/project/checkout-api:v1",
    )


def test_versioned_image_patch_document_roundtrips_without_event_schema_change() -> None:
    plan = ManifestImagePatchPlan(
        source_type="raw-yaml",
        source_manifest_sha256="sha256:" + "a" * 64,
        expected_base_sha="b" * 40,
        manifest_path="deploy/app.yaml",
        replacements=(replacement(),),
    )

    content = image_patch_content(plan)

    assert parse_image_patch_plan(content) == plan
    assert "apiVersion: gitops.krafton.dev/v1alpha1" in content
    assert "kind: GitOpsImagePatch" in content


def test_versioned_image_patch_document_rejects_metadata_tamper() -> None:
    plan = ManifestImagePatchPlan(
        source_type="raw-yaml",
        source_manifest_sha256="sha256:" + "a" * 64,
        expected_base_sha="b" * 40,
        manifest_path="deploy/app.yaml",
        replacements=(replacement(),),
    )
    content = image_patch_content(plan)
    tampered = content.replace("expectedBaseSha: ", "expectedBaseSha: not-a-sha-", 1)

    with pytest.raises(ManifestSourcePatchError):
        parse_image_patch_plan(tampered)


def yaml_source() -> str:
    return (
        "apiVersion: apps/v1\r\n"
        "kind: Deployment\r\n"
        "metadata:\r\n"
        "  name: checkout-api\r\n"
        "spec:\r\n"
        "  template:\r\n"
        "    spec:\r\n"
        "      automountServiceAccountToken: false\r\n"
        "      containers:\r\n"
        "        - name: checkout-api\r\n"
        '          image: "ghcr.io/project/checkout-api:v2" # approved target\r\n'
        "        - name: sidecar\r\n"
        "          image: ghcr.io/project/checkout-api:v2\r\n"
    )


def test_materialize_image_patch_preserves_yaml_outside_exact_scalar() -> None:
    source = yaml_source()
    expected = source.replace(
        '"ghcr.io/project/checkout-api:v2" # approved target',
        '"ghcr.io/project/checkout-api:v1" # approved target',
        1,
    )

    patched = materialize_image_patch(
        source,
        source_type="raw-yaml",
        expected_source_sha256=canonical_manifest_digest(parse_single_manifest(source, "raw-yaml")),
        replacements=[replacement()],
    )

    assert patched == expected
    assert "namespace:" not in patched
    assert patched.endswith("\r\n")
    assert "sidecar\r\n          image: ghcr.io/project/checkout-api:v2" in patched


def test_materialize_image_patch_preserves_json_formatting() -> None:
    source = json.dumps(
        {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout-api"},
            "spec": {
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "checkout-api",
                                "image": "ghcr.io/project/checkout-api:v2",
                            }
                        ]
                    }
                }
            },
        },
        ensure_ascii=False,
        separators=(", ", ": "),
    )
    expected = source.replace("checkout-api:v2", "checkout-api:v1", 1)

    patched = materialize_image_patch(
        source,
        source_type="raw-json",
        expected_source_sha256=canonical_manifest_digest(parse_single_manifest(source, "raw-json")),
        replacements=[replacement()],
    )

    assert patched == expected


@pytest.mark.parametrize(
    "source",
    [
        yaml_source().replace(
            "automountServiceAccountToken: false",
            "shared: &shared checkout\n      automountServiceAccountToken: *shared",
        ),
        yaml_source().replace(
            'image: "ghcr.io/project/checkout-api:v2"',
            "image: |\n            ghcr.io/project/checkout-api:v2",
            1,
        ),
    ],
)
def test_materialize_image_patch_rejects_nonlocal_yaml_scalar_semantics(source: str) -> None:
    with pytest.raises(ManifestSourcePatchError):
        materialize_image_patch(
            source,
            source_type="raw-yaml",
            expected_source_sha256=canonical_manifest_digest(
                parse_single_manifest(source, "raw-yaml")
            ),
            replacements=[replacement()],
        )


def test_materialize_image_patch_rejects_stale_source_digest() -> None:
    with pytest.raises(ManifestSourcePatchError, match="digest"):
        materialize_image_patch(
            yaml_source(),
            source_type="raw-yaml",
            expected_source_sha256="sha256:" + "0" * 64,
            replacements=[replacement()],
        )


def test_materialize_image_patch_rejects_duplicate_target_container() -> None:
    source = yaml_source().replace("name: sidecar", "name: checkout-api")

    with pytest.raises(ManifestSourcePatchError, match="unique"):
        materialize_image_patch(
            source,
            source_type="raw-yaml",
            expected_source_sha256=canonical_manifest_digest(
                parse_single_manifest(source, "raw-yaml")
            ),
            replacements=[replacement()],
        )


def scalar_yaml_source() -> str:
    return (
        "apiVersion: apps/v1\n"
        "kind: Deployment\n"
        "metadata:\n"
        "  name: checkout-api\n"
        "spec:\n"
        "  replicas: 2 # approved replica count\n"
        "  selector:\n"
        "    matchLabels:\n"
        "      app: checkout-old\n"
        "  template:\n"
        "    metadata:\n"
        "      labels:\n"
        "        app: checkout-old\n"
        "    spec:\n"
        "      containers:\n"
        "        - name: checkout-api\n"
        "          image: ghcr.io/project/checkout-api:v2\n"
        "          resources:\n"
        "            requests:\n"
        "              memory: 256Mi\n"
        "            limits:\n"
        "              memory: 512Mi\n"
        "          readinessProbe:\n"
        "            httpGet:\n"
        "              path: /health\n"
        "              port: 8080\n"
        "            timeoutSeconds: 1\n"
    )


def test_versioned_scalar_patch_roundtrips_with_inverse_rollback() -> None:
    plan = ManifestScalarPatchPlan(
        action_type="replica_scale",
        source_type="raw-yaml",
        source_manifest_sha256="sha256:" + "a" * 64,
        expected_base_sha="b" * 40,
        manifest_path="deploy/app.yaml",
        replacements=(ScalarFieldReplacement("spec.replicas", 2, 3),),
        rollback_replacements=(ScalarFieldReplacement("spec.replicas", 3, 2),),
    )

    content = scalar_patch_content(plan)

    assert parse_scalar_patch_plan(content) == plan
    assert "kind: GitOpsScalarPatch" in content
    assert "rollbackReplacements:" in content


def test_materialize_scalar_patch_preserves_bytes_outside_exact_field() -> None:
    source = scalar_yaml_source()
    plan = ManifestScalarPatchPlan(
        action_type="probe_fix",
        source_type="raw-yaml",
        source_manifest_sha256=canonical_manifest_digest(parse_single_manifest(source, "raw-yaml")),
        expected_base_sha="b" * 40,
        manifest_path="deploy/app.yaml",
        replacements=(
            ScalarFieldReplacement(
                "spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds",
                1,
                3,
            ),
        ),
        rollback_replacements=(
            ScalarFieldReplacement(
                "spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds",
                3,
                1,
            ),
        ),
    )

    patched = materialize_scalar_patch(source, plan)

    assert patched == source.replace("timeoutSeconds: 1", "timeoutSeconds: 3", 1)
    assert "replicas: 2 # approved replica count" in patched


def test_scalar_patch_rejects_rollback_that_is_not_exact_inverse() -> None:
    plan = ManifestScalarPatchPlan(
        action_type="replica_scale",
        source_type="raw-yaml",
        source_manifest_sha256="sha256:" + "a" * 64,
        expected_base_sha="b" * 40,
        manifest_path="deploy/app.yaml",
        replacements=(ScalarFieldReplacement("spec.replicas", 2, 3),),
        rollback_replacements=(ScalarFieldReplacement("spec.replicas", 3, 1),),
    )

    with pytest.raises(ManifestSourcePatchError, match="rollback"):
        scalar_patch_content(plan)
