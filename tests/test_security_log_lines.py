from __future__ import annotations

from packages.security.log_lines import (
    MAX_LOG_LINE_LENGTH,
    REDACTED_VALUE,
    TRUNCATED_LOG_LINE_SUFFIX,
    TRUNCATED_MAPPING_KEY,
    TRUNCATED_VALUE,
    redact_sensitive_value,
)


def test_redact_sensitive_value_redacts_nested_sensitive_content_and_bounds_strings() -> None:
    value = {
        "cluster_id": "cluster-1",
        "api_key": "plain-secret",
        "details": {
            "message": (
                "authorization: Bearer response-secret admin@example.com "
                + ("x" * MAX_LOG_LINE_LENGTH)
            ),
        },
    }

    redacted = redact_sensitive_value(value)

    assert redacted["cluster_id"] == "cluster-1"
    assert redacted["api_key"] == REDACTED_VALUE
    message = redacted["details"]["message"]
    assert "plain-secret" not in str(redacted)
    assert "response-secret" not in message
    assert "admin@example.com" not in message
    assert len(message) == MAX_LOG_LINE_LENGTH
    assert message.endswith(TRUNCATED_LOG_LINE_SUFFIX)


def test_redact_sensitive_value_bounds_depth_mapping_items_and_sequence_items() -> None:
    deep = {"level1": {"level2": {"level3": "kept only if depth allows"}}}
    many_mapping_items = {f"k{index}": index for index in range(4)}
    many_sequence_items = [1, 2, 3, 4]

    assert redact_sensitive_value(deep, max_depth=2) == {"level1": {"level2": TRUNCATED_VALUE}}

    redacted_mapping = redact_sensitive_value(many_mapping_items, max_mapping_items=2)
    assert redacted_mapping == {"k0": 0, "k1": 1, TRUNCATED_MAPPING_KEY: True}

    redacted_sequence = redact_sensitive_value(many_sequence_items, max_sequence_items=2)
    assert redacted_sequence == [1, 2, TRUNCATED_VALUE]
