"""공용 outbound URL guard의 SSRF 차단 경계를 검증한다."""

from __future__ import annotations

import asyncio

import pytest

from packages.security.outbound_url import (
    ALERT_WEBHOOK_ALLOWED_HOSTS_ENV,
    UnsafeOutboundUrlError,
    validate_outbound_url,
    validate_outbound_url_syntax,
)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/hook",
        "https:///hook",
        "https://localhost/hook",
        "https://127.0.0.1/hook",
        "https://169.254.169.254/latest/meta-data",
        "https://10.0.0.8/hook",
        "https://224.0.0.1/hook",
        "https://[ff02::1]/hook",
        "https://240.0.0.1/hook",
        "https://user:secret@example.com/hook",
        "https://example.com/hook#fragment",
    ],
)
def test_outbound_url_syntax_rejects_unsafe_destinations(url: str) -> None:
    with pytest.raises(UnsafeOutboundUrlError):
        validate_outbound_url_syntax(url, allowed_hosts="")


@pytest.mark.parametrize(
    "addresses",
    [
        ("10.0.0.8",),
        ("93.184.216.34", "192.168.1.8"),
        ("224.0.0.1",),
    ],
)
def test_outbound_url_rejects_private_or_mixed_dns(addresses: tuple[str, ...]) -> None:
    async def resolver(_hostname: str) -> tuple[str, ...]:
        return addresses

    with pytest.raises(UnsafeOutboundUrlError):
        asyncio.run(
            validate_outbound_url(
                "https://hooks.example/path",
                resolver=resolver,
                allowed_hosts="",
            )
        )


def test_outbound_url_allows_public_https_destination() -> None:
    async def resolver(_hostname: str) -> tuple[str, ...]:
        return ("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946")

    asyncio.run(
        validate_outbound_url(
            "https://hooks.example/path?event=alert",
            resolver=resolver,
            allowed_hosts="",
        )
    )


@pytest.mark.parametrize(
    ("url", "allowed_hosts", "allowed"),
    [
        ("https://hooks.example/path", "hooks.example", True),
        ("https://api.example.com/path", "*.example.com", True),
        ("https://example.com/path", "*.example.com", False),
        ("https://attacker.example/path", "hooks.example,*.trusted.example", False),
    ],
)
def test_outbound_url_allowed_hosts_uses_exact_or_explicit_wildcard_rules(
    url: str,
    allowed_hosts: str,
    allowed: bool,
) -> None:
    if allowed:
        assert validate_outbound_url_syntax(url, allowed_hosts=allowed_hosts)
        return
    with pytest.raises(UnsafeOutboundUrlError):
        validate_outbound_url_syntax(url, allowed_hosts=allowed_hosts)


def test_outbound_url_reads_allowed_hosts_from_env(monkeypatch) -> None:
    monkeypatch.setenv(ALERT_WEBHOOK_ALLOWED_HOSTS_ENV, "hooks.example,*.trusted.example")

    assert validate_outbound_url_syntax("https://api.trusted.example/path")
    with pytest.raises(UnsafeOutboundUrlError):
        validate_outbound_url_syntax("https://attacker.example/path")
