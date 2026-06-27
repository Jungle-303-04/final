"""payload 베이스 + 직렬화.

to_payload(): 객체 → wire dict(발행할 때).
from_payload(): wire dict → 객체(구독해서 받을 때, FROM dict 복사 패턴).
필드 이름이 곧 wire 키. 카멜케이스는 field(metadata={"payload_name": ...}) 별칭.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields
from typing import Any

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
        values: JsonObject = {}
        for item in fields(cls):
            key = item.metadata.get("payload_name", item.name)
            values[item.name] = raw.get(key)
        return cls(**values)


def _to_payload_value(value: Any) -> Any:
    if isinstance(value, EventPayload):
        return value.to_payload()
    if isinstance(value, Mapping):
        return {key: _to_payload_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [_to_payload_value(item) for item in value]
    return value
