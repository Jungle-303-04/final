from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from scripts import run_release_flow_production_signoff as signoff


def write_preflight_report(
    tmp_path,
    *,
    github_sha: str = "sha-production",
    generated_at: datetime | None = None,
) -> None:
    generated_at = generated_at or datetime.now(UTC)
    (tmp_path / "release-flow-production-preflight.json").write_text(
        json.dumps(
            {
                "status": "passed",
                "mode": "preflight_only",
                "generated_at": generated_at.isoformat(),
                "expires_at": (generated_at + timedelta(minutes=60)).isoformat(),
                "github_repo": "org/repo",
                "github_branch": "release/prod",
                "github_branch_head_sha": github_sha,
                "github_sha": github_sha,
                "github_environment": "production",
                "release_plan_id": "plan-1",
                "live_change_ticket": "CHG-123",
                "live_runbook_url": "https://ops.example.internal/runbook",
                "live_release_owner": "ops-owner",
                "live_oncall_contact": "",
                "live_image": "ghcr.io/org/app:sha-production",
                "live_verification_url": "https://ops.example.internal/verify",
                "live_safe_pr_workflow_run_id": "456",
                "live_safe_pr_url": "https://github.com/org/repo/actions/runs/456",
                "safe_pr_run": {
                    "id": "456",
                    "status": "completed",
                    "conclusion": "success",
                    "head_sha": github_sha,
                    "html_url": "https://github.com/org/repo/actions/runs/456",
                },
                "workflows": [
                    {"workflow": signoff.READINESS_WORKFLOW, "id": "1", "state": "active"},
                    {"workflow": signoff.DEPLOY_WORKFLOW, "id": "2", "state": "active"},
                ],
                "dispatch_performed": False,
                "checks": [
                    "input_validation",
                    "local_sha",
                    "github_branch_sha",
                    "safe_pr_run",
                    "production_workflow_access",
                ],
            }
        )
        + "\n",
        encoding="utf-8",
    )


def test_run_release_flow_production_signoff_requires_token(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 2
    )


def test_run_release_flow_production_signoff_rejects_placeholder_inputs(
    monkeypatch, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("placeholder signoff inputs must fail before workflow dispatch")

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)

    assert (
        signoff.main(
            [
                "--github-repo",
                "https://github.com/org/repo",
                "--github-token",
                "token-a",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--release-plan-id",
                "../bad-plan",
                "--api-base-url",
                "http://localhost:8000/api",
                "--live-change-ticket",
                "CHG-PREFLIGHT",
                "--live-runbook-url",
                "https://example.com/runbooks/release-flow",
                "--live-release-owner",
                "release-operator",
                "--live-image",
                "ghcr.io/org/app:latest",
                "--live-verification-url",
                "http://localhost/verify",
                "--live-safe-pr-workflow-run-id",
                "not-a-run-id",
                "--live-safe-pr-url",
                "https://example.com/org/repo/actions/runs/456",
            ]
        )
        == 2
    )

    captured = capsys.readouterr()
    assert "--github-repo must be in owner/repo form" in captured.err
    assert "release_plan_id must be path-safe" in captured.err
    assert "api_base_url must use https" in captured.err
    assert "live_change_ticket must not use placeholder CHG-PREFLIGHT" in captured.err
    assert "live_runbook_url must not use localhost or example hosts" in captured.err
    assert "live_image must not use mutable latest tag" in captured.err
    assert "live_verification_url must use https" in captured.err
    assert "live_safe_pr_url must not use localhost or example hosts" in captured.err
    assert (
        "live_release_owner/live_oncall_contact must not use placeholder operator values"
        in captured.err
    )
    assert "live_safe_pr_workflow_run_id must be a numeric GitHub Actions run id" in captured.err


def test_run_release_flow_production_signoff_dispatches_and_verifies(monkeypatch, tmp_path) -> None:
    calls: dict[str, object] = {"dispatches": [], "verifies": []}
    write_preflight_report(tmp_path)

    def fake_dispatch_workflow(**kwargs: object) -> None:
        dispatches = calls["dispatches"]
        assert isinstance(dispatches, list)
        dispatches.append(kwargs)

    def fake_wait_for_run(**kwargs: object) -> dict:
        run_id = 101 if kwargs["workflow"] == signoff.READINESS_WORKFLOW else 202
        return {
            "id": run_id,
            "status": "completed",
            "conclusion": "success",
            "head_sha": "sha-production",
            "html_url": f"https://github.com/org/repo/actions/runs/{kwargs['workflow']}",
        }

    def fake_verify_evidence_main(argv: list[str]) -> int:
        verifies = calls["verifies"]
        assert isinstance(verifies, list)
        verifies.append(argv)
        return 0

    monkeypatch.setattr(signoff, "dispatch_workflow", fake_dispatch_workflow)
    monkeypatch.setattr(signoff, "wait_for_run", fake_wait_for_run)
    monkeypatch.setattr(signoff, "verify_evidence_main", fake_verify_evidence_main)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(signoff, "verify_safe_pr_run", lambda _args, _token: None)

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--github-output-dir",
                str(tmp_path),
                "--release-plan-id",
                "plan-1",
                "--api-base-url",
                "https://ops.example.internal/api",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
                "--poll-seconds",
                "1",
            ]
        )
        == 0
    )

    dispatches = calls["dispatches"]
    assert isinstance(dispatches, list)
    assert [item["workflow"] for item in dispatches] == [
        signoff.READINESS_WORKFLOW,
        signoff.DEPLOY_WORKFLOW,
    ]
    assert dispatches[0]["inputs"]["production_deploy_required"] == "true"
    assert dispatches[1]["inputs"]["release_plan_id"] == "plan-1"
    assert dispatches[1]["inputs"]["live_safe_pr_workflow_run_id"] == "456"

    verifies = calls["verifies"]
    assert isinstance(verifies, list)
    assert len(verifies) == 3
    assert "--allow-missing-deploy" in verifies[0]
    assert "--github-readiness-run-id" in verifies[0]
    assert "101" in verifies[0]
    assert "--allow-missing-deploy" not in verifies[1]
    assert "--github-readiness-run-id" in verifies[1]
    assert "101" in verifies[1]
    assert "--github-deploy-run-id" in verifies[1]
    assert "202" in verifies[1]
    assert "sha-production" in verifies[1]
    assert "--require-signoff-report" in verifies[2]
    assert "--github-readiness-run-id" in verifies[2]
    assert "--github-deploy-run-id" in verifies[2]
    assert "101" in verifies[2]
    assert "202" in verifies[2]

    report = json.loads(
        (tmp_path / "release-flow-production-signoff.json").read_text(encoding="utf-8")
    )
    assert report["status"] == "passed"
    assert report["github_repo"] == "org/repo"
    assert report["github_sha"] == "sha-production"
    assert report["release_plan_id"] == "plan-1"
    assert report["readiness_run"]["id"] == "101"
    assert report["deploy_run"]["id"] == "202"
    assert report["preflight_report"]["status"] == "passed"
    assert report["preflight_report"]["mode"] == "preflight_only"
    assert report["preflight_report"]["dispatch_performed"] is False
    assert len(report["preflight_report"]["sha256"]) == 64
    assert report["preflight_report"]["github_sha"] == "sha-production"
    assert report["preflight_report"]["github_branch_head_sha"] == "sha-production"
    assert report["preflight_report"]["live_safe_pr_workflow_run_id"] == "456"
    assert report["evidence_verification_status"] == 0


def test_run_release_flow_production_signoff_preflight_only_checks_workflows(
    monkeypatch, capsys, tmp_path
) -> None:
    workflow_urls: list[str] = []

    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("preflight-only must not dispatch workflows")

    def fake_github_json(url: str, token: str) -> dict:
        assert token == "token-a"
        if url.endswith("/actions/runs/456"):
            return {
                "id": 456,
                "status": "completed",
                "conclusion": "success",
                "head_sha": "sha-production",
                "html_url": "https://github.com/org/repo/actions/runs/456",
            }
        workflow_urls.append(url)
        return {"id": len(workflow_urls), "state": "active", "path": ".github/workflows/test.yml"}

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(signoff, "github_json", fake_github_json)

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--preflight-only",
                "--github-output-dir",
                str(tmp_path),
                "--release-plan-id",
                "plan-1",
                "--api-base-url",
                "https://ops.example.internal/api",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 0
    )

    assert len(workflow_urls) == 2
    assert "release-flow-production-readiness.yml" in workflow_urls[0]
    assert "release-flow-production-deploy.yml" in workflow_urls[1]
    assert "ok signoff.preflight" in capsys.readouterr().out
    report = json.loads(
        (tmp_path / "release-flow-production-preflight.json").read_text(encoding="utf-8")
    )
    assert report["status"] == "passed"
    assert report["mode"] == "preflight_only"
    assert report["dispatch_performed"] is False
    assert "production_workflow_access" in report["checks"]
    assert "expires_at" in report
    assert report["github_branch_head_sha"] == "sha-production"
    assert report["safe_pr_run"]["id"] == "456"
    assert report["safe_pr_run"]["conclusion"] == "success"
    assert [item["workflow"] for item in report["workflows"]] == [
        signoff.READINESS_WORKFLOW,
        signoff.DEPLOY_WORKFLOW,
    ]


def test_run_release_flow_production_signoff_preflight_rejects_inactive_workflow(
    monkeypatch, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("inactive workflow must fail before dispatch")

    def fake_github_json(url: str, _token: str) -> dict:
        if url.endswith("/actions/runs/456"):
            return {"id": 456, "conclusion": "success", "head_sha": "sha-production"}
        return {"id": 1, "state": "disabled_manually"}

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(signoff, "github_json", fake_github_json)

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--preflight-only",
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 1
    )

    assert "is disabled_manually, not active" in capsys.readouterr().err


def test_run_release_flow_production_signoff_rejects_safe_pr_url_run_id_mismatch(
    monkeypatch, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("safe pr URL mismatch must fail before workflow dispatch")

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/999",
            ]
        )
        == 2
    )

    assert "live_safe_pr_url run id must match" in capsys.readouterr().err


def test_run_release_flow_production_signoff_rejects_failed_safe_pr_run(
    monkeypatch, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("failed safe pr run must fail before workflow dispatch")

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(
        signoff,
        "github_json",
        lambda _url, _token: {"id": 456, "conclusion": "failure", "head_sha": "sha-production"},
    )

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 1
    )

    assert "Safe PR run 456 did not conclude success" in capsys.readouterr().err


def test_run_release_flow_production_signoff_requires_matching_preflight_report(
    monkeypatch, tmp_path, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("missing preflight report must fail before workflow dispatch")

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(
        signoff,
        "github_json",
        lambda _url, _token: {
            "id": 456,
            "status": "completed",
            "conclusion": "success",
            "head_sha": "sha-production",
        },
    )

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--github-output-dir",
                str(tmp_path),
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 1
    )

    assert "preflight report is required" in capsys.readouterr().err


def test_run_release_flow_production_signoff_rejects_mismatched_preflight_report(
    monkeypatch, tmp_path, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("mismatched preflight report must fail before workflow dispatch")

    write_preflight_report(tmp_path, github_sha="other-sha")
    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(
        signoff,
        "github_json",
        lambda _url, _token: {
            "id": 456,
            "status": "completed",
            "conclusion": "success",
            "head_sha": "sha-production",
        },
    )

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--github-output-dir",
                str(tmp_path),
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 1
    )

    assert (
        "preflight report does not match full sign-off inputs: github_sha"
        in capsys.readouterr().err
    )


def test_run_release_flow_production_signoff_rejects_stale_preflight_report(
    monkeypatch, tmp_path, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("stale preflight report must fail before workflow dispatch")

    write_preflight_report(tmp_path, generated_at=datetime.now(UTC) - timedelta(hours=2))
    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "sha-production")
    monkeypatch.setattr(
        signoff,
        "github_json",
        lambda _url, _token: {
            "id": 456,
            "status": "completed",
            "conclusion": "success",
            "head_sha": "sha-production",
        },
    )

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--github-output-dir",
                str(tmp_path),
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 1
    )

    assert "preflight report is too old" in capsys.readouterr().err


def test_run_release_flow_production_signoff_rejects_local_sha_mismatch(
    monkeypatch, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("sha mismatch must fail before workflow dispatch")

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "current_git_sha", lambda: "actual-sha")

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-sha",
                "sha-production",
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 2
    )

    assert "local git HEAD must match --github-sha" in capsys.readouterr().err


def test_run_release_flow_production_signoff_rejects_github_branch_sha_mismatch(
    monkeypatch, capsys
) -> None:
    def fail_dispatch_workflow(**_kwargs: object) -> None:
        raise AssertionError("branch sha mismatch must fail before workflow dispatch")

    monkeypatch.setattr(signoff, "dispatch_workflow", fail_dispatch_workflow)
    monkeypatch.setattr(signoff, "github_branch_head_sha", lambda _args, _token: "actual-sha")

    assert (
        signoff.main(
            [
                "--github-repo",
                "org/repo",
                "--github-token",
                "token-a",
                "--github-branch",
                "release/prod",
                "--github-sha",
                "sha-production",
                "--skip-local-sha-check",
                "--release-plan-id",
                "plan-1",
                "--live-change-ticket",
                "CHG-123",
                "--live-runbook-url",
                "https://ops.example.internal/runbook",
                "--live-release-owner",
                "ops-owner",
                "--live-image",
                "ghcr.io/org/app:sha-production",
                "--live-verification-url",
                "https://ops.example.internal/verify",
                "--live-safe-pr-workflow-run-id",
                "456",
                "--live-safe-pr-url",
                "https://github.com/org/repo/actions/runs/456",
            ]
        )
        == 1
    )

    assert (
        "GitHub branch release/prod head actual-sha must match --github-sha"
        in capsys.readouterr().err
    )
