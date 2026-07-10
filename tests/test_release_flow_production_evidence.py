import json
import zipfile
from pathlib import Path

from scripts import verify_release_flow_production_evidence as evidence


def readiness_payload(*, github_access: bool = True) -> dict:
    names = set(evidence.REQUIRED_READINESS_CHECKS)
    if not github_access:
        names.remove("runtime.github_access_preflight")
    return {
        "ok": True,
        "checks": [{"name": name, "ok": True, "detail": "ok"} for name in sorted(names)],
    }


def smoke_payload() -> dict:
    return {
        "ok": True,
        "api_base_url": "https://ops.company.internal/api",
        "checks": [
            {"name": name, "ok": True, "detail": "ok"}
            for name in sorted(evidence.REQUIRED_SMOKE_CHECKS)
        ],
    }


def deploy_payload(*, run_id: str = "run-production-1") -> dict:
    checks = [
        {"name": name, "ok": True, "detail": "ok"}
        for name in sorted(evidence.REQUIRED_DEPLOY_CHECKS - {"release-plans.start.production"})
    ]
    checks.append({"name": "release-plans.start.production", "ok": True, "detail": run_id})
    return {
        "ok": True,
        "api_base_url": "https://ops.company.internal/api",
        "plan_id": "plan-production",
        "checks": checks,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_verify_release_flow_production_evidence_accepts_complete_artifacts(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 0


def test_verify_release_flow_production_evidence_requires_github_access_preflight(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload(github_access=False))
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_requires_deploy_run_id(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload(run_id=""))

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_reads_artifact_zip(tmp_path: Path) -> None:
    archive = tmp_path / "release-flow-production-readiness.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr(f"nested/{evidence.READINESS_REPORT}", json.dumps(readiness_payload()))
        zipped.writestr(f"nested/{evidence.SMOKE_REPORT}", json.dumps(smoke_payload()))
        zipped.writestr(f"nested/{evidence.DEPLOY_REPORT}", json.dumps(deploy_payload()))

    assert evidence.main([str(archive)]) == 0


def test_verify_release_flow_production_evidence_rejects_placeholder_urls(tmp_path: Path) -> None:
    smoke = smoke_payload()
    smoke["api_base_url"] = "https://example.com/api"
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke)
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 1
