from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "cloudflare-dev-mtls.yml"


def load_workflow() -> dict:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_workflow_is_manual_least_privilege_and_serialized() -> None:
    workflow = load_workflow()

    assert set(workflow["on"]) == {"workflow_dispatch"}
    assert workflow["permissions"] == {"contents": "read"}
    assert workflow["concurrency"] == {
        "group": "cloudflare-dev-k8s-mtls",
        "cancel-in-progress": False,
    }
    assert workflow["jobs"]["configure"]["environment"] == "development"


def test_workflow_requires_five_csr_batch_and_defaults_to_dry_run() -> None:
    inputs = load_workflow()["on"]["workflow_dispatch"]["inputs"]

    assert set(inputs) == {
        "origin_service",
        "csr_batch_b64",
        "certificate_validity_days",
        "dry_run",
    }
    assert inputs["csr_batch_b64"]["required"] is True
    assert "exactly five" in inputs["csr_batch_b64"]["description"]
    assert inputs["dry_run"]["default"] is True
    assert inputs["origin_service"]["default"] == (
        "http://console-dev.management.svc.cluster.local:80"
    )
    assert "coordinated rename" in inputs["origin_service"]["description"]


def test_workflow_masks_secrets_and_only_uploads_apply_certificate_directory() -> None:
    steps = load_workflow()["jobs"]["configure"]["steps"]
    mask = next(step for step in steps if step["name"] == "Mask Cloudflare and CSR inputs")
    configure = next(step for step in steps if step["name"] == "Configure Cloudflare resources")
    upload = next(
        step for step in steps if step["name"] == "Upload signed public client certificates"
    )

    for name in (
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_ZONE_ID",
        "CLOUDFLARE_TUNNEL_ID",
        "CLOUDFLARE_CSR_BATCH_B64",
    ):
        expected = f'::add-mask::%s\\n\' "${name}"'
        assert expected in mask["run"]
    assert configure["env"]["CLOUDFLARE_API_TOKEN"] == ("${{ secrets.CLOUDFLARE_API_TOKEN }}")
    assert "--csr-batch-env" not in configure["run"]
    assert "CLOUDFLARE_CSR_BATCH_B64" not in configure["run"]
    assert upload["if"] == "${{ success() && inputs.dry_run == false }}"
    assert upload["with"]["path"] == "artifacts/cloudflare-client-certificates"
    assert upload["with"]["retention-days"] == 7


def test_workflow_never_requests_private_key_material() -> None:
    source = WORKFLOW.read_text(encoding="utf-8").lower()

    assert "private_key" not in source
    assert "private-key" not in source
    assert "openssl" not in source
    assert "ssh-keygen" not in source
