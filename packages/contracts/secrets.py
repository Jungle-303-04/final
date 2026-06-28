from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SecretRef:
    """외부 secret 위치를 가리키는 내부 계약.

    provider는 env, kubernetes, vault, aws-secrets-manager처럼 구현체가
    해석한다. 오픈소스 사용자는 이 계약에 맞는 provider만 끼우면 된다.
    """

    name: str
    provider: str = "env"
    key: str | None = None

    @classmethod
    def env(cls, name: str) -> SecretRef:
        return cls(name=name, provider="env")


class SecretProvider(Protocol):
    def get(self, ref: SecretRef) -> str | None: ...

    def require(self, ref: SecretRef) -> str: ...


class MissingSecretError(RuntimeError):
    pass
