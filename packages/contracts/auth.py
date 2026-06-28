from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Permission(StrEnum):
    """API/event 흐름에서 확인할 권한 이름.

    지금은 fake 구조만 고정한다. 실제 인증/인가 구현은 이 문자열 계약에
    맞춰 세션, OAuth, 조직 RBAC 어디에서든 채워 넣을 수 있다.
    """

    COMMAND_REQUEST = "command.request"
    DEAD_LETTER_REPLAY = "dead_letter.replay"
    SAFE_PR_REQUEST = "safe_pr.request"


@dataclass(frozen=True)
class Actor:
    """요청 주체. 로그인 구현과 독립적인 내부 표현."""

    user_id: str
    roles: tuple[str, ...] = ("owner",)
    permissions: tuple[str | Permission, ...] = ()

    @classmethod
    def fake_owner(cls, user_id: str = "local-user") -> Actor:
        return cls(
            user_id=user_id, roles=("owner",), permissions=tuple(item.value for item in Permission)
        )

    def to_body(self) -> dict[str, object]:
        return {
            "user_id": self.user_id,
            "roles": list(self.roles),
            "permissions": [str(item) for item in self.permissions],
        }
