from __future__ import annotations

import os

from packages.contracts.secrets import (
    MissingSecretError,
    SecretRef,
)


class EnvSecretProvider:
    """우리 내부 기본값: env/Kubernetes Secret 주입을 그대로 읽는다."""

    def get(self, ref: SecretRef) -> str | None:
        if ref.provider != "env":
            return None
        return os.getenv(ref.name)

    def require(self, ref: SecretRef) -> str:
        value = self.get(ref)
        if value is None:
            name = f"{ref.provider}:{ref.name}"
            raise MissingSecretError(f"missing secret: {name}")
        return value
