"""mail-worker — mail.email_verification.requested → 인증 메일 전송."""

from __future__ import annotations

import smtplib
from collections.abc import AsyncIterator
from email.message import EmailMessage

from domains.mail.events import EmailVerificationRequestedBody, EmailVerificationSentBody
from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext

app = App("mail-worker")
LOGGER = get_logger(__name__)

SMTP_HOST_ENV = "SMTP_HOST"
SMTP_PORT_ENV = "SMTP_PORT"
SMTP_USERNAME_ENV = "SMTP_USERNAME"
SMTP_PASSWORD_ENV = "SMTP_PASSWORD"
SMTP_FROM_ENV = "SMTP_FROM"
SMTP_STARTTLS_ENV = "SMTP_STARTTLS"

DEFAULT_SMTP_PORT = "587"
DEFAULT_SMTP_FROM = "noreply@example.local"
SMTP_MODE = "smtp"
LOG_MODE = "log"


def build_email_message(evt: EmailVerificationRequestedBody) -> EmailMessage:
    message = EmailMessage()
    message["From"] = env(SMTP_FROM_ENV, DEFAULT_SMTP_FROM)
    message["To"] = evt.email
    message["Subject"] = "Verify your email"
    message.set_content(
        "\n".join(
            [
                "Verify your email address to finish creating your account.",
                "",
                evt.verification_url,
                "",
                f"This link expires in {evt.expires_in_seconds // 60} minutes.",
            ]
        )
    )
    return message


def send_email_verification(evt: EmailVerificationRequestedBody) -> str:
    host = env(SMTP_HOST_ENV, "")
    if not host:
        LOGGER.info(
            "email verification requested",
            extra={"context": {"email": evt.email, "mode": LOG_MODE}},
        )
        return LOG_MODE

    message = build_email_message(evt)
    port = int(env(SMTP_PORT_ENV, DEFAULT_SMTP_PORT))
    username = env(SMTP_USERNAME_ENV, "")
    password = env(SMTP_PASSWORD_ENV, "")
    with smtplib.SMTP(host, port, timeout=10) as client:
        if env(SMTP_STARTTLS_ENV, "1") != "0":
            client.starttls()
        if username:
            client.login(username, password)
        client.send_message(message)
    return SMTP_MODE


@app.on(EmailVerificationRequestedBody)
async def on_email_verification_requested(
    evt: EmailVerificationRequestedBody, ctx: EventContext[object]
) -> AsyncIterator[EventBody]:
    mode = send_email_verification(evt)
    yield EmailVerificationSentBody(email=evt.email, mode=mode)


if __name__ == "__main__":
    app.run()
