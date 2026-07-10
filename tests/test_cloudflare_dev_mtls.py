from __future__ import annotations

import base64
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "cloudflare" / "configure_dev_mtls.py"


def load_module() -> Any:
    spec = importlib.util.spec_from_file_location("configure_dev_mtls", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["configure_dev_mtls"] = module
    spec.loader.exec_module(module)
    return module


cloudflare = load_module()
CSRRequest = cloudflare.CSRRequest
ConfigurationError = cloudflare.ConfigurationError
decode_csr_batch = cloudflare.decode_csr_batch
desired_dns_record = cloudflare.desired_dns_record
desired_waf_rule = cloudflare.desired_waf_rule
find_reusable_certificate = cloudflare.find_reusable_certificate
merge_hostname_associations = cloudflare.merge_hostname_associations
merge_tunnel_ingress = cloudflare.merge_tunnel_ingress
plan_dns_record = cloudflare.plan_dns_record
plan_waf_rule = cloudflare.plan_waf_rule
preflight = cloudflare.preflight
write_certificate_artifact = cloudflare.write_certificate_artifact
PreflightState = cloudflare.PreflightState
apply_configuration = cloudflare.apply_configuration
issue_certificates = cloudflare.issue_certificates


def pem(label: str, suffix: int = 0) -> str:
    request_info = b"\x30\x09\x02\x01\x00\x30\x00\x30\x00\xa0\x00"
    algorithm = b"\x30\x00"
    signature = bytes([0x03, 0x02, 0x00, suffix])
    der = (
        bytes([0x30, len(request_info + algorithm + signature)])
        + request_info
        + algorithm
        + signature
    )
    body = base64.b64encode(der).decode("ascii")
    return f"-----BEGIN {label}-----\n{body}\n-----END {label}-----"


def encoded_batch() -> str:
    payload = [
        {"name": f"operator-{index}", "csr": pem("CERTIFICATE REQUEST", index)}
        for index in range(5)
    ]
    return base64.b64encode(json.dumps(payload).encode()).decode()


def test_decode_csr_batch_requires_exactly_five_strict_entries() -> None:
    requests = decode_csr_batch(encoded_batch())

    assert [request.name for request in requests] == [f"operator-{index}" for index in range(5)]
    assert all(request.csr.endswith("\n") for request in requests)

    bad = base64.b64encode(
        json.dumps([{"name": "one", "csr": pem("CERTIFICATE REQUEST")}]).encode()
    ).decode()
    with pytest.raises(ConfigurationError, match="exactly five"):
        decode_csr_batch(bad)


def test_decode_csr_batch_rejects_extra_fields_and_private_key_material() -> None:
    payload = [
        {"name": f"operator-{index}", "csr": pem("CERTIFICATE REQUEST", index)}
        for index in range(5)
    ]
    payload[0]["private_key"] = "forbidden"
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()

    with pytest.raises(ConfigurationError, match="only name and csr"):
        decode_csr_batch(encoded)

    payload[0] = {
        "name": "operator-0",
        "csr": "-----BEGIN PRIVATE KEY-----\nMA==\n-----END PRIVATE KEY-----",
    }
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    with pytest.raises(ConfigurationError):
        decode_csr_batch(encoded)


def test_decode_csr_batch_rejects_duplicate_csr_material() -> None:
    payload = [
        {"name": f"operator-{index}", "csr": pem("CERTIFICATE REQUEST", index)}
        for index in range(5)
    ]
    payload[4]["csr"] = payload[0]["csr"]
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()

    with pytest.raises(ConfigurationError, match="duplicate CSR material"):
        decode_csr_batch(encoded)


def test_decode_csr_batch_rejects_private_key_der_with_a_csr_label() -> None:
    private_key_info = b"\x30\x07\x02\x01\x00\x30\x00\x04\x00"
    mislabeled = (
        "-----BEGIN CERTIFICATE REQUEST-----\n"
        + base64.b64encode(private_key_info).decode()
        + "\n-----END CERTIFICATE REQUEST-----"
    )
    payload = [
        {"name": f"operator-{index}", "csr": pem("CERTIFICATE REQUEST", index)}
        for index in range(5)
    ]
    payload[0]["csr"] = mislabeled
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()

    with pytest.raises(ConfigurationError, match="signed-object structure"):
        decode_csr_batch(encoded)


def test_merge_tunnel_ingress_preserves_rules_and_inserts_before_fallback() -> None:
    current = {
        "originRequest": {"connectTimeout": 30},
        "ingress": [
            {"hostname": "existing.example.com", "service": "http://old:80"},
            {"service": "http_status:404"},
        ],
    }

    merged, action = merge_tunnel_ingress(
        current, "dev-k8s.woonyong.org", "http://console.management.svc.cluster.local:80"
    )

    assert action == "create"
    assert merged["originRequest"] == current["originRequest"]
    assert merged["ingress"][0] == current["ingress"][0]
    assert merged["ingress"][1]["hostname"] == "dev-k8s.woonyong.org"
    assert merged["ingress"][2] == {"service": "http_status:404"}
    assert current["ingress"][-1] == {"service": "http_status:404"}


def test_merge_tunnel_ingress_updates_only_managed_full_host_rule() -> None:
    current = {
        "ingress": [
            {
                "hostname": "dev-k8s.woonyong.org",
                "path": "/health",
                "service": "http://health:80",
            },
            {
                "hostname": "dev-k8s.woonyong.org",
                "service": "http://old:80",
                "originRequest": {"httpHostHeader": "console"},
            },
            {"service": "http_status:404"},
        ]
    }

    merged, action = merge_tunnel_ingress(current, "dev-k8s.woonyong.org", "http://new:80")
    unchanged, second_action = merge_tunnel_ingress(merged, "dev-k8s.woonyong.org", "http://new:80")

    assert action == "update"
    assert merged["ingress"][0] == current["ingress"][0]
    assert merged["ingress"][1]["originRequest"] == {"httpHostHeader": "console"}
    assert second_action == "unchanged"
    assert unchanged == merged


def test_dns_plan_is_create_update_or_unchanged_and_rejects_conflicts() -> None:
    desired = desired_dns_record("123e4567-e89b-12d3-a456-426614174000")
    assert plan_dns_record([], desired) == ("create", None)
    assert plan_dns_record([{**desired, "id": "record-id"}], desired) == (
        "unchanged",
        "record-id",
    )
    assert plan_dns_record([{**desired, "id": "record-id", "proxied": False}], desired) == (
        "update",
        "record-id",
    )
    with pytest.raises(ConfigurationError, match="conflicting"):
        plan_dns_record([{"name": desired["name"], "type": "A"}], desired)


def test_hostname_association_preserves_existing_hosts() -> None:
    merged, action = merge_hostname_associations(["api.example.com"])
    assert action == "update"
    assert merged == ["api.example.com", "dev-k8s.woonyong.org"]
    assert merge_hostname_associations(merged) == (merged, "unchanged")


def test_waf_plan_uses_stable_ref_for_idempotent_create_update() -> None:
    desired = desired_waf_rule()
    assert plan_waf_rule(None).action == "create_ruleset"
    assert plan_waf_rule({"id": "ruleset", "rules": []}).action == "create_rule"
    plan = plan_waf_rule({"id": "ruleset", "rules": [{**desired, "id": "rule", "enabled": False}]})
    assert (plan.action, plan.ruleset_id, plan.rule_id) == ("update_rule", "ruleset", "rule")
    assert plan_waf_rule({"id": "ruleset", "rules": [{**desired, "id": "rule"}]}).action == (
        "unchanged"
    )
    reordered = plan_waf_rule(
        {
            "id": "ruleset",
            "rules": [
                {"id": "skip", "ref": "existing_skip"},
                {**desired, "id": "rule"},
            ],
        }
    )
    assert (reordered.action, reordered.rule_id) == ("update_rule", "rule")
    assert desired["expression"] == (
        '(http.host eq "dev-k8s.woonyong.org" and not cf.tls_client_auth.cert_verified)'
    )


def test_matching_active_certificate_is_reused_by_csr_and_validity() -> None:
    request = CSRRequest("operator-1", pem("CERTIFICATE REQUEST") + "\n")
    certificate = {
        "id": "cert-id",
        "csr": request.csr,
        "status": "active",
        "validity_days": 365,
        "issued_on": "2026-01-01T00:00:00Z",
    }

    assert find_reusable_certificate([certificate], request, 365) == certificate
    assert find_reusable_certificate([certificate], request, 90) is None
    assert find_reusable_certificate([{**certificate, "status": "revoked"}], request, 365) is None


def test_artifact_contains_only_public_certificate_outputs(tmp_path: Path) -> None:
    certificates = [
        {
            "name": f"operator-{index}",
            "id": f"cert-{index}",
            "certificate": pem("CERTIFICATE", index),
            "csr": pem("CERTIFICATE REQUEST", index),
            "status": "active",
            "fingerprint_sha256": f"fingerprint-{index}",
        }
        for index in range(5)
    ]
    output = tmp_path / "artifact"

    write_certificate_artifact(certificates, output)

    files = sorted(path.name for path in output.iterdir())
    assert files == ["manifest.json", *[f"operator-{index}.pem" for index in range(5)]]
    combined = "\n".join(path.read_text() for path in output.iterdir())
    assert "CERTIFICATE REQUEST" not in combined
    assert "PRIVATE KEY" not in combined
    manifest = json.loads((output / "manifest.json").read_text())
    assert all(
        set(item)
        <= {
            "name",
            "file",
            "id",
            "status",
            "issued_on",
            "expires_on",
            "fingerprint_sha256",
            "serial_number",
        }
        for item in manifest["certificates"]
    )


def test_dry_run_performs_no_mutating_api_calls_or_file_writes(tmp_path: Path) -> None:
    class NoWriteAPI:
        def request(self, *_args: object, **_kwargs: object) -> object:
            raise AssertionError("dry-run attempted an API request")

    requests = decode_csr_batch(encoded_batch())
    state = PreflightState(
        tunnel_config={"ingress": [{"service": "http_status:404"}]},
        dns_records=[],
        hostname_associations=[],
        waf_ruleset=None,
        client_certificates=[],
    )
    api = NoWriteAPI()

    actions = apply_configuration(
        api,
        state,
        account_id="a" * 32,
        zone_id="b" * 32,
        tunnel_id="123e4567-e89b-12d3-a456-426614174000",
        origin_service="http://console.management.svc.cluster.local:80",
        dry_run=True,
    )
    certificates, certificate_actions = issue_certificates(
        api,
        requests,
        [],
        zone_id="b" * 32,
        validity_days=365,
        dry_run=True,
    )

    assert any(action.endswith("create") for action in actions)
    assert all(action.endswith("issue") for action in certificate_actions)
    assert certificates == []
    assert list(tmp_path.iterdir()) == []


def test_apply_is_noop_when_cloudflare_state_already_matches() -> None:
    class NoWriteAPI:
        def request(self, *_args: object, **_kwargs: object) -> object:
            raise AssertionError("idempotent apply attempted an API request")

    tunnel_id = "123e4567-e89b-12d3-a456-426614174000"
    rule = desired_waf_rule()
    state = PreflightState(
        tunnel_config={
            "ingress": [
                {
                    "hostname": "dev-k8s.woonyong.org",
                    "service": "http://console.management.svc.cluster.local:80",
                },
                {"service": "http_status:404"},
            ]
        },
        dns_records=[{**desired_dns_record(tunnel_id), "id": "record-id"}],
        hostname_associations=["dev-k8s.woonyong.org"],
        waf_ruleset={"id": "ruleset-id", "rules": [{**rule, "id": "rule-id"}]},
        client_certificates=[],
    )

    actions = apply_configuration(
        NoWriteAPI(),
        state,
        account_id="a" * 32,
        zone_id="b" * 32,
        tunnel_id=tunnel_id,
        origin_service="http://console.management.svc.cluster.local:80",
        dry_run=False,
    )

    assert all(action.endswith("unchanged") for action in actions)


def test_apply_validates_every_plan_before_first_write() -> None:
    class RecordingAPI:
        def __init__(self) -> None:
            self.calls: list[tuple[object, ...]] = []

        def request(self, *args: object, **_kwargs: object) -> object:
            self.calls.append(args)
            return {}

    api = RecordingAPI()
    state = PreflightState(
        tunnel_config={"ingress": [{"service": "http_status:404"}]},
        dns_records=[{"name": "dev-k8s.woonyong.org", "type": "A", "id": "conflict"}],
        hostname_associations=[],
        waf_ruleset=None,
        client_certificates=[],
    )

    with pytest.raises(ConfigurationError, match="conflicting"):
        apply_configuration(
            api,
            state,
            account_id="a" * 32,
            zone_id="b" * 32,
            tunnel_id="123e4567-e89b-12d3-a456-426614174000",
            origin_service="http://console.management.svc.cluster.local:80",
            dry_run=False,
        )

    assert api.calls == []


def test_preflight_accepts_empty_hostname_association_from_account_token() -> None:
    class PreflightAPI:
        def __init__(self) -> None:
            self.paths: list[str] = []

        def request(self, _method: str, path: str, **_kwargs: object) -> object:
            self.paths.append(path)
            responses: dict[str, object] = {
                f"/accounts/{'a' * 32}/tokens/verify": {"status": "active"},
                f"/zones/{'b' * 32}": {
                    "name": "woonyong.org",
                    "account": {"id": "a" * 32},
                    "status": "active",
                },
                f"/accounts/{'a' * 32}/cfd_tunnel/123e4567-e89b-12d3-a456-426614174000": {
                    "account_tag": "a" * 32,
                    "config_src": "cloudflare",
                },
                f"/accounts/{'a' * 32}/cfd_tunnel/123e4567-e89b-12d3-a456-426614174000/configurations": {
                    "config": {"ingress": [{"service": "http_status:404"}]}
                },
                f"/zones/{'b' * 32}/certificate_authorities/hostname_associations": {
                    "hostnames": None
                },
            }
            return responses[path]

        def list_all(self, _path: str, **_kwargs: object) -> list[dict[str, object]]:
            return []

    api = PreflightAPI()

    state = preflight(
        api,
        "a" * 32,
        "b" * 32,
        "123e4567-e89b-12d3-a456-426614174000",
    )

    assert state.hostname_associations == []
    assert api.paths[0] == f"/accounts/{'a' * 32}/tokens/verify"


def test_waf_content_update_keeps_existing_first_position() -> None:
    class RecordingAPI:
        def __init__(self) -> None:
            self.calls: list[tuple[tuple[object, ...], dict[str, object]]] = []

        def request(self, *args: object, **kwargs: object) -> object:
            self.calls.append((args, kwargs))
            return {}

    tunnel_id = "123e4567-e89b-12d3-a456-426614174000"
    stale_rule = {**desired_waf_rule(), "id": "rule-id", "expression": "false"}
    state = PreflightState(
        tunnel_config={
            "ingress": [
                {
                    "hostname": "dev-k8s.woonyong.org",
                    "service": "http://console.management.svc.cluster.local:80",
                },
                {"service": "http_status:404"},
            ]
        },
        dns_records=[{**desired_dns_record(tunnel_id), "id": "record-id"}],
        hostname_associations=["dev-k8s.woonyong.org"],
        waf_ruleset={"id": "ruleset-id", "rules": [stale_rule]},
        client_certificates=[],
    )
    api = RecordingAPI()

    apply_configuration(
        api,
        state,
        account_id="a" * 32,
        zone_id="b" * 32,
        tunnel_id=tunnel_id,
        origin_service="http://console.management.svc.cluster.local:80",
        dry_run=False,
    )

    assert len(api.calls) == 1
    assert api.calls[0][0][0] == "PATCH"
    assert "position" not in api.calls[0][1]["body"]
