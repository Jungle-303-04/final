from __future__ import annotations

from typing import Any

from packages.contracts.event_bus.interfaces import JsonObject


def items(payload: Any) -> list[JsonObject]:
    """Return list items from a Kubernetes list response."""
    if not isinstance(payload, dict):
        return []
    raw_items = payload.get("items", [])
    if not isinstance(raw_items, list):
        return []
    return [item for item in raw_items if isinstance(item, dict)]


def metadata(item: JsonObject) -> JsonObject:
    """Return object metadata, or an empty dict."""
    value = item.get("metadata", {})
    return value if isinstance(value, dict) else {}


def spec(item: JsonObject) -> JsonObject:
    """Return object spec, or an empty dict."""
    value = item.get("spec", {})
    return value if isinstance(value, dict) else {}


def status(item: JsonObject) -> JsonObject:
    """Return object status, or an empty dict."""
    value = item.get("status", {})
    return value if isinstance(value, dict) else {}
