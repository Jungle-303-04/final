from __future__ import annotations

import pytest

from packages.config.secrets import EnvSecretProvider
from packages.contracts.secrets import MissingSecretError, SecretRef


def test_env_secret_provider_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    provider = EnvSecretProvider()

    assert provider.get(SecretRef.env("GITHUB_TOKEN")) == "token-1"
    assert provider.require(SecretRef.env("GITHUB_TOKEN")) == "token-1"


def test_env_secret_provider_requires_existing_secret() -> None:
    provider = EnvSecretProvider()

    with pytest.raises(MissingSecretError):
        provider.require(SecretRef.env("MISSING_TOKEN"))
