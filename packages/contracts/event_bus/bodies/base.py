"""body 베이스 + 직렬화.

to_body(): 객체 → wire dict(발행할 때).
from_body(): wire dict → 객체(구독해서 받을 때, FROM dict 복사 패턴).
필드 이름이 곧 wire 키. 카멜케이스는 field(metadata={"payload_name": ...}) 별칭.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields
from typing import Any, get_type_hints

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class EventBody:
    def to_body(self) -> JsonObject:
        data: JsonObject = {}
        for item in fields(self):
            key = item.metadata.get("payload_name", item.name)
            data[key] = _to_body_value(getattr(self, item.name))
        return data

    @classmethod
    def from_body(cls, raw: Mapping[str, Any]) -> EventBody:
        # 중첩 body(예: rendered_manifest: RenderedManifest)는 dict 가
        # 아니라 그 타입 객체로 복원 → 워커가 evt.x.y 로 접근.
        hints = get_type_hints(cls)
        values: JsonObject = {}
        for item in fields(cls):
            key = item.metadata.get("payload_name", item.name)
            value = raw.get(key)
            field_type = hints.get(item.name)
            if isinstance(value, Mapping) and isinstance(field_type, type) and issubclass(field_type, EventBody):
                value = field_type.from_body(value)
            values[item.name] = value
        return cls(**values)


def _to_body_value(value: Any) -> Any:
    if isinstance(value, EventBody):
        return value.to_body()
    if isinstance(value, Mapping):
        return {key: _to_body_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [_to_body_value(item) for item in value]
    return value
