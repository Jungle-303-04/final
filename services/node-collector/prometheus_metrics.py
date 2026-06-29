from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class MetricSample:
    # One Prometheus sample plus the metadata needed to render HELP/TYPE lines.
    # Adding a new metric mostly means appending another MetricSample.
    name: str
    help: str
    value: float | int
    labels: dict[str, str]
    type: Literal["gauge", "counter"] = "gauge"


def render_labels(labels: dict[str, str]) -> str:
    # Prometheus labels are rendered after the metric name:
    # metric_name{node="target-control-plane",runtime="containerd"} 1
    if not labels:
        return ""

    label_pairs = ",".join(f'{key}="{value}"' for key, value in labels.items())
    # Double braces escape literal Prometheus label braces inside an f-string.
    return f"{{{label_pairs}}}"


def render_metric_sample(sample: MetricSample) -> list[str]:
    # Prometheus text exposition expects HELP/TYPE metadata lines before the sample.
    labels = render_labels(sample.labels)
    return [
        f"# HELP {sample.name} {sample.help}",
        f"# TYPE {sample.name} {sample.type}",
        f"{sample.name}{labels} {sample.value}",
    ]


def render_prometheus_metrics(samples: list[MetricSample]) -> str:
    lines = []
    for sample in samples:
        lines.extend(render_metric_sample(sample))

    lines.append("")
    return "\n".join(lines)
