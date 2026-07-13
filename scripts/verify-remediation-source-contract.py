#!/usr/bin/env python3
"""Statically score declared remediation source adapters and fail-closed behavior."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from domains.gitops.source_patch import (  # noqa: E402
    ManifestScalarPatchPlan,
    RemediationSourcePatchUnsupported,
    ScalarFieldReplacement,
    declared_scalar_patch,
    materialize_declared_scalar_patch,
)
from packages.contracts.remediation_source import (  # noqa: E402
    parse_remediation_source_contract,
)

BASE_SHA = "a" * 40
SOURCE_DIGEST = "sha256:" + "b" * 64
CONTRACT = """\
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
    - manifestPath: overlays/prod/kustomization.yaml
      sourceType: kustomize
      path: overlays/prod/kustomization.yaml
      images:
        - name: ghcr.io/project/checkout-api
"""


def patch_plan(
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


def supported_cases() -> tuple[tuple[str, ManifestScalarPatchPlan, str, str], ...]:
    image_path = "spec.template.spec.containers[name=checkout-api].image"
    probe_path = "spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds"
    return (
        (
            "raw-image",
            patch_plan(
                "image_rollback",
                "deploy/app.yaml",
                image_path,
                "ghcr.io/project/checkout-api:v2",
                "ghcr.io/project/checkout-api:v1",
            ),
            "kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n"
            "        - name: checkout-api\n"
            "          image: ghcr.io/project/checkout-api:v2\n",
            "ghcr.io/project/checkout-api:v1",
        ),
        (
            "raw-replica",
            patch_plan("replica_scale", "deploy/app.yaml", "spec.replicas", 2, 3),
            "kind: Deployment\nspec:\n  replicas: 2\n",
            "replicas: 3",
        ),
        (
            "raw-probe",
            patch_plan("probe_fix", "deploy/app.yaml", probe_path, 1, 3),
            "kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n"
            "        - name: checkout-api\n"
            "          readinessProbe:\n"
            "            timeoutSeconds: 1\n",
            "timeoutSeconds: 3",
        ),
        (
            "helm-image-tag",
            patch_plan(
                "image_rollback",
                "charts/checkout/Chart.yaml",
                image_path,
                "ghcr.io/project/checkout-api:v2",
                "ghcr.io/project/checkout-api:v1",
            ),
            "image:\n  repository: ghcr.io/project/checkout-api\n  tag: v2\n",
            "tag: v1",
        ),
        (
            "kustomize-image-tag",
            patch_plan(
                "image_rollback",
                "overlays/prod/kustomization.yaml",
                image_path,
                "ghcr.io/project/checkout-api:v2",
                "ghcr.io/project/checkout-api:v1",
            ),
            "images:\n  - name: ghcr.io/project/checkout-api\n    newTag: v2\n",
            "newTag: v1",
        ),
    )


def verify_supported() -> int:
    contract = parse_remediation_source_contract(CONTRACT)
    passed = 0
    for name, plan, source, expected in supported_cases():
        try:
            declared = declared_scalar_patch(plan, contract)
            patched = materialize_declared_scalar_patch(source, declared)
            if expected not in patched or patched == source:
                raise AssertionError("declared patch did not change the expected scalar")
        except Exception as exc:
            print(f"[FAIL] {name}: {type(exc).__name__}: {exc}")
            continue
        passed += 1
        print(f"[PASS] {name}")
    return passed


def verify_undeclared() -> bool:
    contract = parse_remediation_source_contract(CONTRACT)
    plan = patch_plan(
        "selector_fix",
        "deploy/app.yaml",
        "spec.selector.matchLabels.app",
        "old",
        "new",
    )
    try:
        declared_scalar_patch(plan, contract)
    except RemediationSourcePatchUnsupported:
        print("[PASS] undeclared-selector")
        return True
    print("[FAIL] undeclared-selector: patch was accepted")
    return False


def main() -> int:
    passed = verify_supported() + int(verify_undeclared())
    total = len(supported_cases()) + 1
    summary = {"failed": total - passed, "passed": passed, "total": total}
    print(json.dumps(summary, sort_keys=True))
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
