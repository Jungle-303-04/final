import json
import zipfile
from io import BytesIO
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


def environment_payload(*, ok: bool = True) -> dict:
    return {
        "ok": ok,
        "checks": [
            {"name": name, "ok": ok, "detail": "ok" if ok else "failed"}
            for name in sorted(evidence.REQUIRED_ENVIRONMENT_CHECKS)
        ],
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


def deploy_payload(
    *,
    run_id: str = "run-production-1",
    api_base_url: str = "https://ops.company.internal/api",
) -> dict:
    checks = [
        {"name": name, "ok": True, "detail": "ok"}
        for name in sorted(evidence.REQUIRED_DEPLOY_CHECKS - {"release-plans.start.production"})
    ]
    checks.append({"name": "release-plans.start.production", "ok": True, "detail": run_id})
    return {
        "ok": True,
        "api_base_url": api_base_url,
        "plan_id": "plan-production",
        "checks": checks,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def report_zip(filename: str, payload: dict) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as zipped:
        zipped.writestr(filename, json.dumps(payload))
    return buffer.getvalue()


def reports_zip(reports: dict[str, dict]) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as zipped:
        for filename, payload in reports.items():
            zipped.writestr(filename, json.dumps(payload))
    return buffer.getvalue()


def test_verify_release_flow_production_evidence_accepts_complete_artifacts(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.ENVIRONMENT_REPORT, environment_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 0


def test_verify_release_flow_production_evidence_requires_github_access_preflight(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload(github_access=False))
    write_json(tmp_path / evidence.ENVIRONMENT_REPORT, environment_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_requires_deploy_run_id(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.ENVIRONMENT_REPORT, environment_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload(run_id=""))

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_requires_environment_report(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_requires_environment_success(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.ENVIRONMENT_REPORT, environment_payload(ok=False))
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_requires_matching_api_base_urls(tmp_path: Path) -> None:
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.ENVIRONMENT_REPORT, environment_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke_payload())
    write_json(
        tmp_path / evidence.DEPLOY_REPORT,
        deploy_payload(api_base_url="https://other-ops.company.internal/api"),
    )

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_reads_artifact_zip(tmp_path: Path) -> None:
    archive = tmp_path / "release-flow-production-readiness.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr(f"nested/{evidence.READINESS_REPORT}", json.dumps(readiness_payload()))
        zipped.writestr(f"nested/{evidence.ENVIRONMENT_REPORT}", json.dumps(environment_payload()))
        zipped.writestr(f"nested/{evidence.SMOKE_REPORT}", json.dumps(smoke_payload()))
        zipped.writestr(f"nested/{evidence.DEPLOY_REPORT}", json.dumps(deploy_payload()))

    assert evidence.main([str(archive)]) == 0


def test_verify_release_flow_production_evidence_rejects_placeholder_urls(tmp_path: Path) -> None:
    smoke = smoke_payload()
    smoke["api_base_url"] = "https://api.example.com/api"
    write_json(tmp_path / evidence.READINESS_REPORT, readiness_payload())
    write_json(tmp_path / evidence.ENVIRONMENT_REPORT, environment_payload())
    write_json(tmp_path / evidence.SMOKE_REPORT, smoke)
    write_json(tmp_path / evidence.DEPLOY_REPORT, deploy_payload())

    assert evidence.main([str(tmp_path)]) == 1


def test_verify_release_flow_production_evidence_downloads_github_artifacts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def fake_github_json(url: str, token: str) -> dict:
        assert token == "token-a"
        if "release-flow-production-readiness.yml" in url:
            return {"workflow_runs": [{"id": 101, "conclusion": "success", "head_sha": "sha-a"}]}
        if "release-flow-production-deploy.yml" in url:
            return {"workflow_runs": [{"id": 202, "conclusion": "success", "head_sha": "sha-a"}]}
        if "actions/runs/101/artifacts" in url:
            return {
                "artifacts": [
                    {
                        "name": "release-flow-production-readiness",
                        "expired": False,
                        "archive_download_url": "https://artifacts/readiness.zip",
                    }
                ]
            }
        if "actions/runs/202/artifacts" in url:
            return {
                "artifacts": [
                    {
                        "name": "release-flow-smoke-production",
                        "expired": False,
                        "archive_download_url": "https://artifacts/smoke.zip",
                    },
                    {
                        "name": "release-flow-production-deploy",
                        "expired": False,
                        "archive_download_url": "https://artifacts/deploy.zip",
                    },
                ]
            }
        raise AssertionError(f"unexpected GitHub URL: {url}")

    def fake_download(url: str, token: str) -> bytes:
        assert token == "token-a"
        if url.endswith("readiness.zip"):
            return reports_zip(
                {
                    evidence.READINESS_REPORT: readiness_payload(),
                    evidence.ENVIRONMENT_REPORT: environment_payload(),
                }
            )
        if url.endswith("smoke.zip"):
            return report_zip(evidence.SMOKE_REPORT, smoke_payload())
        if url.endswith("deploy.zip"):
            return report_zip(evidence.DEPLOY_REPORT, deploy_payload())
        raise AssertionError(f"unexpected artifact URL: {url}")

    monkeypatch.setattr(evidence, "github_json", fake_github_json)
    monkeypatch.setattr(evidence, "github_download", fake_download)

    assert (
        evidence.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "dev",
                "--github-sha",
                "sha-a",
                "--github-output-dir",
                str(tmp_path),
            ]
        )
        == 0
    )
    assert (tmp_path / "101-release-flow-production-readiness.zip").is_file()
    assert (tmp_path / "202-release-flow-smoke-production.zip").is_file()
    assert (tmp_path / "202-release-flow-production-deploy.zip").is_file()


def test_verify_release_flow_production_evidence_requires_github_token() -> None:
    assert evidence.main(["--github-repo", "org/repo"]) == 1


def test_verify_release_flow_production_evidence_downloads_exact_run_ids(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def fake_github_json(url: str, token: str) -> dict:
        assert token == "token-a"
        if url.endswith("/actions/runs/101"):
            return {
                "id": 101,
                "conclusion": "success",
                "head_sha": "sha-a",
                "head_branch": "dev",
                "path": ".github/workflows/release-flow-production-readiness.yml",
            }
        if url.endswith("/actions/runs/202"):
            return {
                "id": 202,
                "conclusion": "success",
                "head_sha": "sha-a",
                "head_branch": "dev",
                "path": ".github/workflows/release-flow-production-deploy.yml",
            }
        if "actions/runs/101/artifacts" in url:
            return {
                "artifacts": [
                    {
                        "name": "release-flow-production-readiness",
                        "expired": False,
                        "archive_download_url": "https://artifacts/readiness.zip",
                    }
                ]
            }
        if "actions/runs/202/artifacts" in url:
            return {
                "artifacts": [
                    {
                        "name": "release-flow-smoke-production",
                        "expired": False,
                        "archive_download_url": "https://artifacts/smoke.zip",
                    },
                    {
                        "name": "release-flow-production-deploy",
                        "expired": False,
                        "archive_download_url": "https://artifacts/deploy.zip",
                    },
                ]
            }
        raise AssertionError(f"unexpected GitHub URL: {url}")

    def fake_download(url: str, _token: str) -> bytes:
        if url.endswith("readiness.zip"):
            return reports_zip(
                {
                    evidence.READINESS_REPORT: readiness_payload(),
                    evidence.ENVIRONMENT_REPORT: environment_payload(),
                }
            )
        if url.endswith("smoke.zip"):
            return report_zip(evidence.SMOKE_REPORT, smoke_payload())
        if url.endswith("deploy.zip"):
            return report_zip(evidence.DEPLOY_REPORT, deploy_payload())
        raise AssertionError(f"unexpected artifact URL: {url}")

    monkeypatch.setattr(evidence, "github_json", fake_github_json)
    monkeypatch.setattr(evidence, "github_download", fake_download)

    assert (
        evidence.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "dev",
                "--github-sha",
                "sha-a",
                "--github-readiness-run-id",
                "101",
                "--github-deploy-run-id",
                "202",
                "--github-output-dir",
                str(tmp_path),
            ]
        )
        == 0
    )
    assert (tmp_path / "101-release-flow-production-readiness.zip").is_file()
    assert (tmp_path / "202-release-flow-smoke-production.zip").is_file()
    assert (tmp_path / "202-release-flow-production-deploy.zip").is_file()


def test_verify_release_flow_production_evidence_rejects_exact_run_id_wrong_sha(monkeypatch) -> None:
    def fake_github_json(url: str, _token: str) -> dict:
        if url.endswith("/actions/runs/101"):
            return {
                "id": 101,
                "conclusion": "success",
                "head_sha": "sha-other",
                "head_branch": "dev",
                "path": ".github/workflows/release-flow-production-readiness.yml",
            }
        raise AssertionError(f"unexpected GitHub URL: {url}")

    monkeypatch.setattr(evidence, "github_json", fake_github_json)

    assert (
        evidence.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "dev",
                "--github-sha",
                "sha-a",
                "--github-readiness-run-id",
                "101",
                "--allow-missing-deploy",
            ]
        )
        == 1
    )


def test_verify_release_flow_production_evidence_requires_github_sha(monkeypatch) -> None:
    def fake_github_json(_url: str, _token: str) -> dict:
        raise AssertionError("GitHub API should not be called before sha validation")

    monkeypatch.setattr(evidence, "github_json", fake_github_json)

    assert evidence.main(["--github-repo", "org/repo", "--github-token", "token-a"]) == 1


def test_verify_release_flow_production_evidence_can_allow_latest_github_run(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def fake_github_json(url: str, _token: str) -> dict:
        if "release-flow-production-readiness.yml" in url:
            return {"workflow_runs": [{"id": 101, "conclusion": "success", "head_sha": "sha-a"}]}
        if "release-flow-production-deploy.yml" in url:
            return {"workflow_runs": [{"id": 202, "conclusion": "success", "head_sha": "sha-a"}]}
        if "actions/runs/101/artifacts" in url:
            return {
                "artifacts": [
                    {
                        "name": "release-flow-production-readiness",
                        "expired": False,
                        "archive_download_url": "https://artifacts/readiness.zip",
                    }
                ]
            }
        if "actions/runs/202/artifacts" in url:
            return {
                "artifacts": [
                    {
                        "name": "release-flow-smoke-production",
                        "expired": False,
                        "archive_download_url": "https://artifacts/smoke.zip",
                    },
                    {
                        "name": "release-flow-production-deploy",
                        "expired": False,
                        "archive_download_url": "https://artifacts/deploy.zip",
                    },
                ]
            }
        raise AssertionError(f"unexpected GitHub URL: {url}")

    def fake_download(url: str, _token: str) -> bytes:
        if url.endswith("readiness.zip"):
            return reports_zip(
                {
                    evidence.READINESS_REPORT: readiness_payload(),
                    evidence.ENVIRONMENT_REPORT: environment_payload(),
                }
            )
        if url.endswith("smoke.zip"):
            return report_zip(evidence.SMOKE_REPORT, smoke_payload())
        if url.endswith("deploy.zip"):
            return report_zip(evidence.DEPLOY_REPORT, deploy_payload())
        raise AssertionError(f"unexpected artifact URL: {url}")

    monkeypatch.setattr(evidence, "github_json", fake_github_json)
    monkeypatch.setattr(evidence, "github_download", fake_download)

    assert (
        evidence.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--allow-latest-github-run",
                "--github-output-dir",
                str(tmp_path),
            ]
        )
        == 0
    )
