from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs

from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.security import SecretRef, SecretVaultPort, TokenVaultPort

SECRET_VAULT_PROVIDER_ENV = "SECRET_VAULT_PROVIDER"
TOKEN_VAULT_PROVIDER_ENV = "TOKEN_VAULT_PROVIDER"
SECRET_VAULT_AWS_REGION_ENV = "SECRET_VAULT_AWS_REGION"

PROVIDER_AUTO = "auto"
PROVIDER_ENV = "env"
PROVIDER_AWS_SECRETS_MANAGER = "aws-secrets-manager"
ENV_REF_PREFIX = "env:"
AWS_SECRETS_MANAGER_REF_PREFIX = "aws-sm:"
AWS_PROVIDER_ALIASES = {
    PROVIDER_AWS_SECRETS_MANAGER,
    "aws",
    "aws-sm",
    "secretsmanager",
    "secrets-manager",
}

LOGGER = get_logger(__name__)


class SecretNotFound(RuntimeError):
    pass


class SecretProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ParsedSecretRef:
    provider: str
    name: str
    field: str | None = None
    version_stage: str | None = None


class EnvSecretVault(SecretVaultPort):
    """개발/배포 공통 fallback: secret ref를 환경변수 이름으로 해석한다."""

    def read_secret(self, ref: SecretRef) -> str:
        parsed = parse_secret_ref(ref, default_provider=PROVIDER_ENV)
        if parsed.provider != PROVIDER_ENV:
            raise SecretNotFound(f"unsupported env secret ref provider: {parsed.provider}")
        value = env(parsed.name, "").strip()
        if not value:
            raise SecretNotFound(f"secret ref not found: {parsed.name}")
        log_secret_read(PROVIDER_ENV, parsed.name, parsed.field, parsed.version_stage)
        return value


class AwsSecretsManagerSecretVault(SecretVaultPort):
    """AWS Secrets Manager adapter.

    Ref examples:
    - aws-sm:/my-app/prod/github-token
    - aws-sm:/my-app/prod/github#token
    - aws-sm:/my-app/prod/github?stage=AWSPREVIOUS#token
    """

    def __init__(self, client: Any | None = None, region_name: str | None = None) -> None:
        self._client = client
        self.region_name = region_name or env(SECRET_VAULT_AWS_REGION_ENV, "")

    def read_secret(self, ref: SecretRef) -> str:
        parsed = parse_secret_ref(ref, default_provider=PROVIDER_AWS_SECRETS_MANAGER)
        if parsed.provider != PROVIDER_AWS_SECRETS_MANAGER:
            raise SecretNotFound(f"unsupported aws secret ref provider: {parsed.provider}")
        request: dict[str, Any] = {"SecretId": parsed.name}
        if parsed.version_stage:
            request["VersionStage"] = parsed.version_stage
        try:
            response = self.client().get_secret_value(**request)
        except Exception as exc:
            raise SecretNotFound(f"aws secret ref not found: {redacted_ref(parsed.name)}") from exc
        value = secret_value_from_aws_response(response)
        if parsed.field:
            value = extract_json_field(value, parsed.field)
        log_secret_read(
            PROVIDER_AWS_SECRETS_MANAGER, parsed.name, parsed.field, parsed.version_stage
        )
        return value

    def client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import boto3  # type: ignore[import-not-found]
        except ImportError as exc:
            raise SecretProviderUnavailable(
                "boto3 is required for aws-sm secret refs; install the aws optional dependency"
            ) from exc
        kwargs = {"region_name": self.region_name} if self.region_name else {}
        self._client = boto3.client("secretsmanager", **kwargs)
        return self._client


class RoutingSecretVault(SecretVaultPort):
    """Prefix based vault router.

    Unprefixed refs and env: refs resolve through environment variables for backwards
    compatibility. aws-sm: refs resolve through AWS Secrets Manager.
    """

    def __init__(
        self,
        env_vault: SecretVaultPort | None = None,
        aws_vault: SecretVaultPort | None = None,
    ) -> None:
        self.env_vault = env_vault or EnvSecretVault()
        self.aws_vault = aws_vault

    def read_secret(self, ref: SecretRef) -> str:
        parsed = parse_secret_ref(ref, default_provider=PROVIDER_ENV)
        if parsed.provider == PROVIDER_AWS_SECRETS_MANAGER:
            if self.aws_vault is None:
                self.aws_vault = AwsSecretsManagerSecretVault()
            return self.aws_vault.read_secret(ref)
        return self.env_vault.read_secret(ref)


class EnvTokenVault(TokenVaultPort):
    def __init__(self, secret_vault: SecretVaultPort | None = None) -> None:
        self.secret_vault = secret_vault or EnvSecretVault()

    def read_token(self, ref: SecretRef) -> str:
        return self.secret_vault.read_secret(ref)


def build_secret_vault(provider: str | None = None) -> SecretVaultPort:
    selected = normalize_provider(provider or env(SECRET_VAULT_PROVIDER_ENV, PROVIDER_AUTO))
    if selected == PROVIDER_AUTO:
        return RoutingSecretVault()
    if selected == PROVIDER_ENV:
        return EnvSecretVault()
    if selected == PROVIDER_AWS_SECRETS_MANAGER:
        return AwsSecretsManagerSecretVault()
    raise ValueError(f"unsupported secret vault provider: {selected}")


def build_token_vault(provider: str | None = None) -> TokenVaultPort:
    selected = provider or env(TOKEN_VAULT_PROVIDER_ENV, "")
    secret_vault = build_secret_vault(selected or None)
    return EnvTokenVault(secret_vault)


def normalize_provider(value: str) -> str:
    provider = value.strip().lower() or PROVIDER_AUTO
    if provider in AWS_PROVIDER_ALIASES:
        return PROVIDER_AWS_SECRETS_MANAGER
    if provider in {PROVIDER_AUTO, PROVIDER_ENV}:
        return provider
    return provider


def parse_secret_ref(ref: SecretRef, *, default_provider: str) -> ParsedSecretRef:
    raw = ref.value.strip()
    if not raw:
        raise SecretNotFound("secret ref is empty")
    if raw.startswith(ENV_REF_PREFIX):
        return ParsedSecretRef(PROVIDER_ENV, raw.removeprefix(ENV_REF_PREFIX))
    if raw.startswith(AWS_SECRETS_MANAGER_REF_PREFIX):
        return parse_aws_secret_ref(raw.removeprefix(AWS_SECRETS_MANAGER_REF_PREFIX))
    return ParsedSecretRef(normalize_provider(default_provider), raw)


def parse_aws_secret_ref(raw: str) -> ParsedSecretRef:
    locator, _, field = raw.partition("#")
    name, _, query = locator.partition("?")
    if not name:
        raise SecretNotFound("aws secret ref is empty")
    params = parse_qs(query, keep_blank_values=False)
    stage = first_query_value(params, "stage") or first_query_value(params, "version_stage")
    return ParsedSecretRef(
        PROVIDER_AWS_SECRETS_MANAGER,
        name,
        field.strip() or None,
        stage.strip() if stage else None,
    )


def first_query_value(params: dict[str, list[str]], key: str) -> str | None:
    values = params.get(key) or []
    return values[0] if values else None


def secret_value_from_aws_response(response: dict[str, Any]) -> str:
    if "SecretString" in response and response["SecretString"] is not None:
        return str(response["SecretString"])
    if "SecretBinary" in response and response["SecretBinary"] is not None:
        data = response["SecretBinary"]
        if isinstance(data, str):
            data = base64.b64decode(data)
        return bytes(data).decode("utf-8")
    raise SecretNotFound("aws secret response did not include SecretString or SecretBinary")


def extract_json_field(secret: str, field: str) -> str:
    try:
        value: Any = json.loads(secret)
    except json.JSONDecodeError as exc:
        raise SecretNotFound(f"secret field requested but value is not JSON: {field}") from exc
    for part in field.split("."):
        if not isinstance(value, dict) or part not in value:
            raise SecretNotFound(f"secret field not found: {field}")
        value = value[part]
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def log_secret_read(provider: str, name: str, field: str | None, version_stage: str | None) -> None:
    LOGGER.info(
        "secret_vault_read",
        extra={
            "context": {
                "provider": provider,
                "ref_hash": redacted_ref(name),
                "field": bool(field),
                "version_stage": version_stage or "",
            }
        },
    )


def redacted_ref(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]
