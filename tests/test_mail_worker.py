from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import EmailVerificationRequestedBody


def test_mail_worker_logs_email_verification_without_smtp(monkeypatch) -> None:
    monkeypatch.delenv("SMTP_HOST", raising=False)
    mail = load_service("mail/worker")

    outs = run_handler(
        mail.on_email_verification_requested,
        EmailVerificationRequestedBody(
            email="local@example.com",
            verification_url="https://app.example.test/auth/verify-email?token=t",
            expires_in_seconds=3600,
        ),
    )

    assert subjects_of(outs) == ["mail.email_verification.sent"]
    assert outs[0].email == "local@example.com"
    assert outs[0].mode == "log"
