from packages.runtime.metrics import render_labeled_counter, render_prometheus_metrics


def test_prometheus_metric_rendering() -> None:
    body = render_prometheus_metrics({"outbox_pending_total": 3})

    assert "# TYPE outbox_pending_total gauge" in body
    assert "outbox_pending_total 3" in body


def test_prometheus_labeled_counter_escapes_label_values() -> None:
    body = render_labeled_counter("command_status_total", {'queued"now': 2}, "status")

    assert 'command_status_total{status="queued\\"now"} 2' in body
