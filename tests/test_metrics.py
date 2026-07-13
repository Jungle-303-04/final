from packages.runtime.metrics import (
    render_labeled_counter,
    render_labeled_gauge,
    render_multi_labeled_gauge,
    render_prometheus_metrics,
)


def test_prometheus_metric_rendering() -> None:
    body = render_prometheus_metrics({"outbox_pending_total": 3})

    assert "# TYPE outbox_pending_total gauge" in body
    assert "outbox_pending_total 3" in body


def test_prometheus_labeled_counter_escapes_label_values() -> None:
    body = render_labeled_counter("command_status_total", {'queued"now': 2}, "status")

    assert 'command_status_total{status="queued\\"now"} 2' in body


def test_prometheus_labeled_gauge_renders_float_values() -> None:
    body = render_labeled_gauge(
        "event_processing_duration_avg_ms", {"command-worker": 12.5}, "consumer"
    )

    assert "# TYPE event_processing_duration_avg_ms gauge" in body
    assert 'event_processing_duration_avg_ms{consumer="command-worker"} 12.5' in body


def test_prometheus_multi_labeled_gauge_renders_labels() -> None:
    body = render_multi_labeled_gauge(
        "nats_consumer_pending_events",
        {("command-worker", "command.requested"): 4},
        ("consumer", "subject"),
    )

    assert "# TYPE nats_consumer_pending_events gauge" in body
    assert (
        'nats_consumer_pending_events{consumer="command-worker",subject="command.requested"} 4'
        in body
    )
