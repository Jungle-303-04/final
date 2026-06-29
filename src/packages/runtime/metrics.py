from __future__ import annotations

from collections.abc import Mapping


def render_prometheus_metrics(metrics: Mapping[str, float | int]) -> str:
    lines: list[str] = []
    for name, value in sorted(metrics.items()):
        lines.append(f"# TYPE {name} gauge")
        lines.append(f"{name} {value}")
    return "\n".join(lines) + "\n"


def render_labeled_counter(name: str, values: Mapping[str, int], label: str) -> str:
    lines = [f"# TYPE {name} gauge"]
    for key, value in sorted(values.items()):
        safe_key = str(key).replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'{name}{{{label}="{safe_key}"}} {value}')
    return "\n".join(lines) + "\n"
