from __future__ import annotations

import json
from datetime import UTC, datetime

from scripts import run_release_flow_production_readiness as runner


def test_run_release_flow_production_readiness_requires_token(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    assert runner.main(["--github-repo", "org/repo"]) == 2


def test_dispatches_readiness_workflow_and_verifies_artifact(monkeypatch, tmp_path) -> None:
    calls: dict[str, object] = {}

    def fake_dispatch_workflow(**kwargs: object) -> None:
        calls["dispatch"] = kwargs

    def fake_wait_for_run(**kwargs: object) -> dict:
        calls["wait"] = kwargs
        return {
            "id": 123,
            "status": "completed",
            "conclusion": "success",
            "head_sha": "sha-production",
            "html_url": "https://github.com/org/repo/actions/runs/123",
        }

    def fake_verify_evidence_main(argv: list[str]) -> int:
        calls["verify"] = argv
        return 0

    monkeypatch.setattr(runner, "dispatch_workflow", fake_dispatch_workflow)
    monkeypatch.setattr(runner, "wait_for_run", fake_wait_for_run)
    monkeypatch.setattr(runner, "verify_evidence_main", fake_verify_evidence_main)

    assert (
        runner.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--environment",
                "production",
                "--verify-artifact",
                "--github-output-dir",
                str(tmp_path),
                "--poll-seconds",
                "1",
            ]
        )
        == 0
    )

    dispatch = calls["dispatch"]
    assert isinstance(dispatch, dict)
    assert dispatch["repo"] == "org/repo"
    assert dispatch["branch"] == "release/prod"
    assert dispatch["workflow"] == runner.READINESS_WORKFLOW
    assert dispatch["inputs"] == {
        "github_environment": "production",
        "github_access_preflight": "true",
        "github_environment_preflight": "true",
        "api_smoke_preflight": "true",
        "production_deploy_required": "true",
    }
    wait = calls["wait"]
    assert isinstance(wait, dict)
    assert wait["head_sha"] == "sha-production"
    verify = calls["verify"]
    assert isinstance(verify, list)
    assert "--allow-missing-deploy" in verify
    assert "sha-production" in verify
    assert str(tmp_path) in verify


def test_dispatch_workflow_posts_expected_payload(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class Response:
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

    def fake_urlopen(request: object, *, timeout: int) -> Response:
        captured["url"] = request.full_url  # type: ignore[attr-defined]
        captured["method"] = request.get_method()  # type: ignore[attr-defined]
        captured["body"] = json.loads(request.data.decode("utf-8"))  # type: ignore[attr-defined]
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(runner.urllib.request, "urlopen", fake_urlopen)

    runner.dispatch_workflow(
        api_base="https://api.github.com",
        repo="org/repo",
        workflow="release-flow-production-readiness.yml",
        branch="release/prod",
        token="token-a",
        inputs={"github_environment": "production"},
    )

    assert captured["method"] == "POST"
    assert str(captured["url"]).endswith(
        "/repos/org/repo/actions/workflows/release-flow-production-readiness.yml/dispatches"
    )
    assert captured["body"] == {
        "ref": "release/prod",
        "inputs": {"github_environment": "production"},
    }
    assert captured["timeout"] == 30


def test_wait_for_run_returns_matching_completed_run(monkeypatch) -> None:
    created_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")

    def fake_list_workflow_runs(**_kwargs: object) -> list[dict]:
        return [
            {
                "id": 123,
                "status": "completed",
                "conclusion": "success",
                "head_sha": "sha-production",
                "created_at": created_at,
            }
        ]

    monkeypatch.setattr(runner, "list_workflow_runs", fake_list_workflow_runs)

    run = runner.wait_for_run(
        api_base="https://api.github.com",
        repo="org/repo",
        workflow=runner.READINESS_WORKFLOW,
        branch="release/prod",
        head_sha="sha-production",
        token="token-a",
        started_after=datetime(2026, 1, 1, tzinfo=UTC),
        timeout_seconds=1,
        poll_seconds=1,
    )

    assert run["id"] == 123
    assert run["conclusion"] == "success"
