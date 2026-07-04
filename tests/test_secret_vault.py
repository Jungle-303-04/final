from __future__ import annotations

import pytest

from packages.contracts.security import SecretRef
from packages.security import (
    AwsSecretsManagerSecretVault,
    EnvSecretVault,
    RoutingSecretVault,
    SecretNotFound,
    build_secret_vault,
    build_token_vault,
)


class FakeSecretsManagerClient:
    def __init__(self, response: dict[str, object]) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    def get_secret_value(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        return self.response


def test_env_secret_vault_reads_plain_and_prefixed_env_refs(monkeypatch) -> None:
    monkeypatch.setenv("TOKEN_VALUE", "secret-token")
    vault = EnvSecretVault()

    assert vault.read_secret(SecretRef("TOKEN_VALUE")) == "secret-token"
    assert vault.read_secret(SecretRef("env:TOKEN_VALUE")) == "secret-token"


def test_routing_secret_vault_keeps_unprefixed_refs_env_compatible(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    vault = RoutingSecretVault()

    assert vault.read_secret(SecretRef("GITHUB_TOKEN")) == "token-1"


def test_aws_secret_vault_reads_json_field_and_version_stage() -> None:
    client = FakeSecretsManagerClient({"SecretString": '{"token": "ghs_123", "nested": {"x": 7}}'})
    vault = AwsSecretsManagerSecretVault(client=client)

    value = vault.read_secret(SecretRef("aws-sm:/kubeheal/prod/github?stage=AWSPREVIOUS#token"))

    assert value == "ghs_123"
    assert client.calls == [{"SecretId": "/kubeheal/prod/github", "VersionStage": "AWSPREVIOUS"}]


def test_aws_secret_vault_returns_serialized_json_for_non_string_field() -> None:
    client = FakeSecretsManagerClient({"SecretString": '{"nested": {"x": 7}}'})
    vault = AwsSecretsManagerSecretVault(client=client)

    assert vault.read_secret(SecretRef("aws-sm:/kubeheal/prod/github#nested")) == '{"x": 7}'


def test_aws_secret_vault_rejects_missing_field() -> None:
    client = FakeSecretsManagerClient({"SecretString": '{"token": "ghs_123"}'})
    vault = AwsSecretsManagerSecretVault(client=client)

    with pytest.raises(SecretNotFound, match="secret field not found"):
        vault.read_secret(SecretRef("aws-sm:/kubeheal/prod/github#missing"))


def test_build_vault_auto_routes_env_refs_without_aws_dependency(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_VAULT_PROVIDER", "auto")
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")

    assert build_secret_vault().read_secret(SecretRef("env:GITHUB_TOKEN")) == "token-1"


def test_build_token_vault_accepts_env_provider(monkeypatch) -> None:
    monkeypatch.setenv("TOKEN_VAULT_PROVIDER", "env")
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")

    assert build_token_vault().read_token(SecretRef("GITHUB_TOKEN")) == "token-1"
