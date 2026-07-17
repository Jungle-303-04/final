from __future__ import annotations

from datetime import UTC, datetime

from domains.inventory.certificate_expiry import certificate_expiry_summary

CLUSTER_ID = "cluster-a"
CONTEXT = {
    "snapshot_revision": 42,
    "observed_at": "2026-07-16T09:00:00+00:00",
    "resources_complete": True,
    "partial_reason_codes": [],
}
NOW = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)
WARNING_SECONDS = 30 * 24 * 60 * 60


def _observation(
    name: str,
    *,
    not_after: str | None,
    certificate: bool = True,
) -> dict[str, object]:
    return {
        "secret": {
            "inventory_key": f"secret:{name}",
            "api_version": "v1",
            "kind": "Secret",
            "namespace": "shop",
            "name": name,
            "uid": f"secret-uid:{name}",
            "observed_at": "2026-07-16T09:00:00+00:00",
        },
        "certificate": (
            {
                "inventory_key": f"certificate:{name}",
                "api_version": "cert-manager.io/v1",
                "kind": "Certificate",
                "namespace": "shop",
                "name": f"{name}-certificate",
                "uid": f"certificate-uid:{name}",
                "raw": {
                    "spec": {
                        "secretName": name,
                        "dnsNames": [f"{name}.example.test"],
                        "privateKey": {"algorithm": "ECDSA"},
                    },
                    "status": {
                        **({"notAfter": not_after} if not_after is not None else {}),
                        "conditions": [{"type": "Ready", "status": "True"}],
                    },
                },
                "observed_at": "2026-07-16T09:00:00+00:00",
            }
            if certificate
            else None
        ),
    }


def test_certificate_expiry_projects_server_health_without_secret_material() -> None:
    response = certificate_expiry_summary(
        [
            _observation("expired-tls", not_after="2026-07-15T12:00:00Z"),
            _observation("expiring-tls", not_after="2026-07-25T12:00:00Z"),
            _observation("valid-tls", not_after="2026-10-16T12:00:00Z"),
        ],
        cluster_id=CLUSTER_ID,
        context=CONTEXT,
        scan_truncated=False,
        warning_before_seconds=WARNING_SECONDS,
        now=NOW,
    )

    assert response.coverage.availability == "available"
    assert response.tls_secret_count == 3
    assert response.observed_expiry_count == 3
    assert response.expired_count == 1
    assert response.expiring_count == 1
    assert [item.status for item in response.items] == ["expired", "expiring", "valid"]
    assert response.items[0].secret.model_dump() == {
        "api_group": "",
        "version": "v1",
        "kind": "Secret",
        "namespace": "shop",
        "name": "expired-tls",
        "uid": "secret-uid:expired-tls",
    }
    payload = response.model_dump_json()
    assert "tls.crt" not in payload
    assert "privateKey" not in payload
    assert "dnsNames" not in payload
    assert "example.test" not in payload


def test_certificate_expiry_marks_unmanaged_tls_secret_partial() -> None:
    response = certificate_expiry_summary(
        [
            _observation("managed-tls", not_after="2026-10-16T12:00:00Z"),
            _observation("unmanaged-tls", not_after=None, certificate=False),
        ],
        cluster_id=CLUSTER_ID,
        context=CONTEXT,
        scan_truncated=False,
        warning_before_seconds=WARNING_SECONDS,
        now=NOW,
    )

    assert response.coverage.availability == "partial"
    assert response.coverage.reason_codes == ("certificate_expiry_unavailable",)
    assert response.tls_secret_count == 2
    assert response.observed_expiry_count == 1
    assert [item.secret.name for item in response.items] == ["managed-tls"]


def test_certificate_expiry_keeps_absent_tls_observation_unavailable() -> None:
    response = certificate_expiry_summary(
        [],
        cluster_id=CLUSTER_ID,
        context=CONTEXT,
        scan_truncated=False,
        warning_before_seconds=WARNING_SECONDS,
        now=NOW,
    )

    assert response.coverage.availability == "unavailable"
    assert response.coverage.reason_codes == ("tls_secret_observation_unavailable",)
    assert response.tls_secret_count is None
    assert response.observed_expiry_count is None
    assert response.items == ()
