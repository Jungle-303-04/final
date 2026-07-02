from __future__ import annotations

from typing import Any

from conftest import ROOT, load_file


def load_store_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "store.py",
        "test_store_module",
    )


def test_store_leases_command_and_telemetry_jobs_independently() -> None:
    module = load_store_module()
    store = module.LocalStore(":memory:")
    store.init()

    command_id = store.enqueue_job(
        module.QueueName.COMMAND_JOBS,
        "command:cmd-1",
        {"command_id": "cmd-1"},
        priority=module.LocalStoreConfig.HIGH_PRIORITY,
    )
    telemetry_id = store.enqueue_job(
        module.QueueName.TELEMETRY_JOBS,
        "evidence:window-1",
        {"window_start": "window-1"},
    )

    command = store.lease_job(module.QueueName.COMMAND_JOBS, "worker-a")
    telemetry = store.lease_job(module.QueueName.TELEMETRY_JOBS, "worker-b")

    assert command is not None
    assert command.id == command_id
    assert command.queue_name == "command_jobs"
    assert command.payload["command_id"] == "cmd-1"
    assert command.locked_by == "worker-a"
    assert telemetry is not None
    assert telemetry.id == telemetry_id
    assert telemetry.queue_name == "telemetry_jobs"
    assert telemetry.payload["window_start"] == "window-1"
    assert telemetry.locked_by == "worker-b"

    store.complete_job(command.id)

    assert store.get_job(command.id).status == "completed"
    assert store.queue_depths()["telemetry_jobs"] == 1


def test_store_keeps_job_key_idempotent() -> None:
    module = load_store_module()
    store = module.LocalStore(":memory:")
    store.init()

    first_id = store.enqueue_job(
        module.QueueName.COMMAND_JOBS,
        "command:cmd-1",
        {"command_id": "cmd-1"},
    )
    second_id = store.enqueue_job(
        module.QueueName.COMMAND_JOBS,
        "command:cmd-1",
        {"command_id": "cmd-1", "duplicate": True},
    )

    assert second_id == first_id

    job = store.lease_job(module.QueueName.COMMAND_JOBS, "worker-a")
    assert job is not None
    store.complete_job(job.id)

    assert store.lease_job(module.QueueName.COMMAND_JOBS, "worker-b") is None
    assert store.get_job(first_id).payload == {"command_id": "cmd-1"}


def test_store_retries_failed_outbound_spool_item() -> None:
    module = load_store_module()
    store = module.LocalStore(":memory:")
    store.init()

    item_id = store.enqueue_outbound(
        module.OutboundKind.COMMAND_RESULT,
        "result:cmd-1:lease-1",
        {"command_id": "cmd-1", "lease_id": "lease-1"},
        priority=module.LocalStoreConfig.HIGH_PRIORITY,
    )

    item = store.lease_outbound("sender-a")
    assert item is not None
    assert item.id == item_id
    assert item.kind == "command_result"
    assert item.attempts == 1

    store.fail_outbound(item.id, "gateway down", retry_delay_seconds=0)

    retry = store.lease_outbound("sender-b")
    assert retry is not None
    assert retry.id == item_id
    assert retry.attempts == 2
    assert retry.last_error == "gateway down"

    store.complete_outbound(retry.id)
    assert store.get_outbound(item_id).status == "completed"
