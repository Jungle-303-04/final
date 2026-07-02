from __future__ import annotations

import asyncio
import time
from collections.abc import Mapping
from typing import Protocol

from evidence.store import EvidenceTaskStore
from evidence.uploader import (
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_POLL_SECONDS,
    FAILURE_POLICY_ALLOW_PARTIAL,
    EvidenceUploader,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.interfaces import ManagementPlaneClient


class EvidenceSource(Protocol):
    async def collect(self, *evidence_keys: str) -> JsonObject: ...


class EvidenceScheduler:
    def __init__(
        self,
        *,
        cluster_id: str,
        collector: EvidenceSource,
        store: EvidenceTaskStore,
        provider_keys: tuple[str, ...],
        provider_worker_counts: Mapping[str, int],
        failure_policy: str = FAILURE_POLICY_ALLOW_PARTIAL,
        interval_seconds: int,
        lease_seconds: int,
        worker_pool_authority: object | None = None,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    ) -> None:
        self.cluster_id = cluster_id
        self.collector = collector
        self.store = store
        self.uploader = EvidenceUploader(store, failure_policy)
        self.provider_keys = provider_keys
        self.provider_worker_counts = {
            provider_key: max(0, provider_worker_counts.get(provider_key, 1))
            for provider_key in provider_keys
        }
        self.provider_intervals = {
            provider_key: max(1, interval_seconds) for provider_key in provider_keys
        }
        self.enabled_provider_keys = set(provider_keys)
        self.next_provider_runs = {provider_key: 0.0 for provider_key in provider_keys}
        self.interval_seconds = interval_seconds
        self.lease_seconds = lease_seconds
        self.max_attempts = max_attempts
        self._worker_pool_authority = worker_pool_authority or object()
        self._worker_tasks: dict[str, list[asyncio.Task[None]]] = {
            provider_key: [] for provider_key in provider_keys
        }
        self._worker_serials = {provider_key: 0 for provider_key in provider_keys}
        self._workers_started = False

    async def run(self, client: ManagementPlaneClient) -> None:
        self.store.recover_expired_leases(time.time())
        self._workers_started = True
        self.reconcile_worker_pools()
        try:
            await asyncio.gather(
                self.schedule_forever(),
                self.uploader.run(client),
            )
        finally:
            self._workers_started = False
            await self.stop_workers()

    async def schedule_forever(self) -> None:
        while True:
            self.schedule_once()
            await asyncio.sleep(1)

    def schedule_once(self, now: float | None = None) -> str | None:
        now = time.time() if now is None else now
        self.store.recover_expired_leases(now)
        due_provider_keys = self.due_provider_keys(now)
        if not due_provider_keys:
            return None

        collection_id = self.new_collection_id(now)
        created = self.store.create_collection(
            collection_id=collection_id,
            cluster_id=self.cluster_id,
            provider_keys=due_provider_keys,
            scheduled_for=now,
            now=now,
        )
        if created:
            for provider_key in due_provider_keys:
                self.next_provider_runs[provider_key] = (
                    now + self.provider_intervals[provider_key]
                )
        return collection_id if created else None

    def due_provider_keys(self, now: float) -> tuple[str, ...]:
        return tuple(
            provider_key
            for provider_key in self.provider_keys
            if provider_key in self.enabled_provider_keys
            and now >= self.next_provider_runs[provider_key]
        )

    async def work_forever(self, provider_key: str, worker_id: str) -> None:
        while True:
            if not await self.work_once(provider_key, worker_id):
                await asyncio.sleep(DEFAULT_POLL_SECONDS)

    async def work_once(self, provider_key: str, worker_id: str) -> bool:
        task = self.store.lease_task(provider_key, worker_id, self.lease_seconds, time.time())
        if task is None:
            return False

        try:
            result = await self.collector.collect(task.provider_key)
            self.store.complete_task(task, result, time.time())
        except Exception as exc:
            self.store.fail_task(task, str(exc), self.max_attempts, time.time())
        return True

    async def upload_once(self, client: ManagementPlaneClient) -> str:
        return await self.uploader.upload_once(client)

    def configure_schedule(
        self,
        *,
        provider_intervals: Mapping[str, int],
        enabled_provider_keys: set[str],
    ) -> None:
        unknown_keys = set(provider_intervals) - set(self.provider_keys)
        if unknown_keys:
            raise ValueError(f"unknown evidence providers in schedule: {sorted(unknown_keys)}")
        self.enabled_provider_keys = {
            provider_key
            for provider_key in enabled_provider_keys
            if provider_key in self.provider_keys
        }
        for provider_key, interval_seconds in provider_intervals.items():
            self.provider_intervals[provider_key] = max(1, interval_seconds)
            self.next_provider_runs.setdefault(provider_key, 0.0)

    def set_failure_policy(self, failure_policy: str) -> None:
        self.uploader.set_failure_policy(failure_policy)

    def current_worker_counts(self) -> dict[str, int]:
        self.prune_finished_workers()
        if not self._workers_started:
            return dict(self.provider_worker_counts)
        return {
            provider_key: len(self._worker_tasks[provider_key])
            for provider_key in self.provider_keys
        }

    def resize_provider_workers(
        self,
        provider_key: str,
        worker_count: int,
        *,
        authority: object,
    ) -> int:
        if authority is not self._worker_pool_authority:
            raise PermissionError("worker pool resize is limited to ClusterWorkloadController")
        if provider_key not in self.provider_worker_counts:
            raise ValueError(f"unknown evidence provider worker pool: {provider_key}")
        self.provider_worker_counts[provider_key] = max(0, worker_count)
        self.reconcile_worker_pool(provider_key)
        return self.provider_worker_counts[provider_key]

    def reconcile_worker_pools(self) -> None:
        for provider_key in self.provider_keys:
            self.reconcile_worker_pool(provider_key)

    def reconcile_worker_pool(self, provider_key: str) -> None:
        self.prune_finished_workers()
        if not self._workers_started:
            return

        tasks = self._worker_tasks[provider_key]
        desired_count = self.provider_worker_counts[provider_key]
        while len(tasks) < desired_count:
            worker_id = self.next_worker_id(provider_key)
            task = asyncio.create_task(
                self.work_forever(provider_key, worker_id),
                name=f"evidence-{worker_id}",
            )
            tasks.append(task)

        while len(tasks) > desired_count:
            task = tasks.pop()
            task.cancel()

    def prune_finished_workers(self) -> None:
        for provider_key, tasks in self._worker_tasks.items():
            self._worker_tasks[provider_key] = [task for task in tasks if not task.done()]

    async def stop_workers(self) -> None:
        tasks = [
            task
            for provider_tasks in self._worker_tasks.values()
            for task in provider_tasks
        ]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        for provider_key in self.provider_keys:
            self._worker_tasks[provider_key] = []

    def next_worker_id(self, provider_key: str) -> str:
        worker_index = self._worker_serials[provider_key]
        self._worker_serials[provider_key] += 1
        return f"{provider_key}-worker-{worker_index}"

    def new_collection_id(self, now: float) -> str:
        return f"{self.cluster_id}:{int(now * 1000)}"
