from __future__ import annotations

ALL_EVENTS_SUBJECT = ">"


def durable_name(service_name: str, name: str | None = None) -> str:
    # durable = NATS consumer 이름. 같은 서비스의 여러 구독이 충돌하지 않게 service 로 namespace.
    if name is None:
        return service_name
    return f"{service_name}-{name}"
