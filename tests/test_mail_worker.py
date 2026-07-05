from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from domains.mail.events import EmailVerificationRequestedBody


def test_mail_worker_fails_closed_without_smtp(monkeypatch) -> None:
    monkeypatch.delenv("MAIL_DELIVERY_MODE", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    mail = load_service("mail/mail-worker")

    outs = run_handler(
        mail.on_email_verification_requested,
        EmailVerificationRequestedBody(
            email="local@example.com",
            verification_url="https://app.example.test/auth/verify-email?token=t",
            expires_in_seconds=3600,
        ),
    )

    assert subjects_of(outs) == ["mail.email_verification.failed"]
    assert outs[0].email == "local@example.com"
    assert outs[0].mode == "smtp"
    assert outs[0].reason_code == "smtp_config_missing"


def test_mail_worker_fails_closed_without_smtp_sender(monkeypatch) -> None:
    monkeypatch.delenv("MAIL_DELIVERY_MODE", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.delenv("SMTP_FROM", raising=False)
    mail = load_service("mail/mail-worker")

    outs = run_handler(
        mail.on_email_verification_requested,
        EmailVerificationRequestedBody(
            email="local@example.com",
            verification_url="https://app.example.test/auth/verify-email?token=t",
            expires_in_seconds=3600,
        ),
    )

    assert subjects_of(outs) == ["mail.email_verification.failed"]
    assert outs[0].mode == "smtp"
    assert outs[0].reason_code == "smtp_from_missing"


def test_mail_worker_logs_email_verification_when_explicit(monkeypatch) -> None:
    monkeypatch.setenv("MAIL_DELIVERY_MODE", "log")
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    mail = load_service("mail/mail-worker")

    outs = run_handler(
        mail.on_email_verification_requested,
        EmailVerificationRequestedBody(
            email="local@example.com",
            verification_url="https://app.example.test/auth/verify-email?token=t",
            expires_in_seconds=3600,
        ),
    )

    assert subjects_of(outs) == ["mail.email_verification.sent"]
    assert outs[0].mode == "log"
