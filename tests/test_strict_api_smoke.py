from __future__ import annotations

import http.cookiejar
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "strict_api_smoke", ROOT / "scripts/strict_api_smoke.py"
)
assert SPEC is not None and SPEC.loader is not None
strict_api_smoke = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = strict_api_smoke
SPEC.loader.exec_module(strict_api_smoke)
assert isinstance(strict_api_smoke, ModuleType)


def bundle() -> dict[str, object]:
    return {
        "meta": {
            "correlation_id": "corr / 1",
            "incident_id": "inc/1",
            "cluster_id": "cluster-1",
        },
        "diagnosis": {"root_cause": "ImagePullBackOff"},
        "remediation": None,
    }


def audit() -> dict[str, object]:
    return {
        "items": [
            {
                "event_id": "evt-1",
                "subject": "incident.opened",
                "journey_stage": "alert",
                "payload_summary": {},
            }
        ],
        "limit": 1,
        "has_more": False,
        "next_cursor": None,
    }


def recent() -> dict[str, object]:
    return {"incident_id": "inc/1", "items": [], "limit": 1}


def test_strict_smoke_calls_all_three_encoded_read_routes() -> None:
    responses = [bundle(), audit(), recent()]
    urls: list[str] = []

    def fetcher(url: str, jar: http.cookiejar.CookieJar) -> object:
        urls.append(url)
        return responses.pop(0)

    strict_api_smoke.run_smoke(
        base_url="https://opsia.example/api/",
        correlation_id="corr / 1",
        incident_id="inc/1",
        cookie_jar=http.cookiejar.CookieJar(),
        fetcher=fetcher,
    )

    assert urls == [
        "https://opsia.example/api/rca/bundles/corr%20%2F%201",
        "https://opsia.example/api/audit/timeline?correlation_id=corr+%2F+1&limit=1",
        "https://opsia.example/api/rca/incidents/inc%2F1/recent-changes?limit=1",
    ]


def test_strict_smoke_rejects_missing_journey_and_fixture_mismatch() -> None:
    with pytest.raises(RuntimeError, match="must contain"):
        strict_api_smoke.validate_audit({"items": [], "limit": 1, "has_more": False})

    value = bundle()
    value["meta"]["incident_id"] = "different"  # type: ignore[index]
    with pytest.raises(RuntimeError, match="does not match"):
        strict_api_smoke.validate_bundle(value, "corr / 1", "inc/1")


def test_smoke_shell_requires_fixtures_and_invokes_strict_validator() -> None:
    source = (ROOT / "scripts/smoke.sh").read_text()

    assert "require_env SMOKE_RCA_CORRELATION_ID" in source
    assert "require_env SMOKE_RCA_INCIDENT_ID" in source
    assert 'python3 "${SCRIPT_DIR}/strict_api_smoke.py"' in source
    assert '--cookie-jar "${COOKIE_JAR}"' in source
