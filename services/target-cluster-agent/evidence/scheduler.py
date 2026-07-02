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
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    ) -> None:
        self.cluster_id = cluster_id
        self.collector = collector
        self.store = store
        self.uploader = EvidenceUploader(store, failure_policy)
        self.provider_keys = provider_keys
        self.provider_worker_counts = {
            provider_key: max(1, provider_worker_counts.get(provider_key, 1))
            for provider_key in provider_keys
        }
        self.interval_seconds = interval_seconds
        self.lease_seconds = lease_seconds
        self.max_attempts = max_attempts

    async def run(self, client: ManagementPlaneClient) -> None:
        self.store.recover_expired_leases(time.time())
        await asyncio.gather(
            self.schedule_forever(),
            self.uploader.run(client),
            *self.worker_loops(),
        )

    def worker_loops(self) -> tuple[object, ...]:
        return tuple(
            self.work_forever(provider_key, f"{provider_key}-worker-{index}")
            for provider_key in self.provider_keys
            for index in range(self.provider_worker_counts[provider_key])
        )

    async def schedule_forever(self) -> None:
        while True:
            self.schedule_once()
            await asyncio.sleep(self.interval_seconds)

    def schedule_once(self, now: float | None = None) -> str | None:
        now = time.time() if now is None else now
        self.store.recover_expired_leases(now)
        collection_id = self.new_collection_id(now)
        created = self.store.create_collection(
            collection_id=collection_id,
            cluster_id=self.cluster_id,
            provider_keys=self.provider_keys,
            scheduled_for=now,
            now=now,
        )
        return collection_id if created else None

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

    def new_collection_id(self, now: float) -> str:
        return f"{self.cluster_id}:{int(now * 1000)}"
