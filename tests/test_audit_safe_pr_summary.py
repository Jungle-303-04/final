from domains.audit.router import summarize_payload


def test_safe_pr_audit_summary_keeps_operator_reference_fields() -> None:
    summary = summarize_payload(
        "safe_pr.created",
        {
            "pr_url": "https://github.com/kyro/platform/pull/17",
            "provider": "github",
            "mode": "pull_request",
            "patch_sha256": "patch-sha",
        },
    )

    assert summary == {
        "pr_url": "https://github.com/kyro/platform/pull/17",
        "provider": "github",
        "mode": "pull_request",
        "patch_sha256": "patch-sha",
    }


def test_recovery_audit_summary_keeps_operator_result_fields() -> None:
    summary = summarize_payload(
        "rollout.diagnosed",
        {
            "diagnosis": "rollout command applied and reported healthy",
            "next_action": "observe",
            "reason": "unused when diagnosis is present",
            "summary": "rollout health completed",
        },
    )

    assert summary == {
        "reason": "unused when diagnosis is present",
        "diagnosis": "rollout command applied and reported healthy",
        "next_action": "observe",
        "summary": "rollout health completed",
    }


def test_command_rejection_summary_keeps_stable_reason_code() -> None:
    summary = summarize_payload(
        "command.rejected",
        {
            "reason_code": "control_namespace_not_allowed",
            "reason": "backend wording can change independently",
        },
    )

    assert summary == {
        "reason_code": "control_namespace_not_allowed",
        "reason": "backend wording can change independently",
    }
