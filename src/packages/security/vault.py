from __future__ import annotations

from packages.config.settings import env
from packages.contracts.security import SecretRef, SecretVaultPort, TokenVaultPort


class SecretNotFound(RuntimeError):
    pass


class EnvSecretVault(SecretVaultPort):
    """개발/배포 공통 fallback: secret ref를 환경변수 이름으로 해석한다."""

    def read_secret(self, ref: SecretRef) -> str:
        value = env(ref.value, "").strip()
        if not value:
            raise SecretNotFound(f"secret ref not found: {ref.value}")
        return value


class EnvTokenVault(TokenVaultPort):
    def __init__(self, secret_vault: SecretVaultPort | None = None) -> None:
        self.secret_vault = secret_vault or EnvSecretVault()

    def read_token(self, ref: SecretRef) -> str:
        return self.secret_vault.read_secret(ref)
