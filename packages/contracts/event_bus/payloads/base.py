"""payload 베이스 + 직렬화.

to_payload(): 객체 → wire dict(발행할 때).
from_payload(): wire dict → 객체(구독해서 받을 때, FROM dict 복사 패턴).
필드 이름이 곧 wire 키. 카멜케이스는 field(metadata={"payload_name": ...}) 별칭.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields
from typing import Any, get_type_hints

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class EventPayload:
    def to_payload(self) -> JsonObject:
        payload: JsonObject = {}
        for item in fields(self):
            key = item.metadata.get("payload_name", item.name)
            payload[key] = _to_payload_value(getattr(self, item.name))
        return payload

    @classmethod
    def from_payload(cls, raw: Mapping[str, Any]) -> EventPayload:
        # 중첩 payload(예: rendered_manifest: RenderedManifest)는 dict 가
        # 아니라 그 타입 객체로 복원해 워커가 evt.x.y 로 쓰게 한다.
        hints = get_type_hints(cls)
        values: JsonObject = {}
        for item in fields(cls):
            key = item.metadata.get("payload_name", item.name)
            value = raw.get(key)
            field_type = hints.get(item.name)
            if (
                isinstance(value, Mapping)
                and isinstance(field_type, type)
                and issubclass(field_type, EventPayload)
            ):
                value = field_type.from_payload(value)
            values[item.name] = value
        return cls(**values)


def _to_payload_value(value: Any) -> Any:
    if isinstance(value, EventPayload):
        return value.to_payload()
    if isinstance(value, Mapping):
        return {key: _to_payload_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [_to_payload_value(item) for item in value]
    return value
