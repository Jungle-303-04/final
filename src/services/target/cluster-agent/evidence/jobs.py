from __future__ import annotations

import asyncio
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Protocol

from queries import SOURCE_EVIDENCE_KEYS, TelemetryQueryDefinition

from packages.config.constants import CommandStatus
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import ManagementPlaneClient

DEFAULT_JOB_POLL_SECONDS = 1.0
DEFAULT_JOB_POLL_TIMEOUT_SECONDS = 10


class EvidenceSource(Protocol):
    async def collect(self, *evidence_keys: str) -> JsonObject: ...


SOURCE_BY_PROVIDER = {provider_key: source for source, provider_key in SOURCE_EVIDENCE_KEYS.items()}


class EvidenceJobScheduler:
    def __init__(
        self,
        *,
        cluster_id: str,
        workspace_id: str,
        agent_id: str,
        source_id: str,
        collector: EvidenceSource,
        provider_keys: tuple[str, ...],
        provider_worker_counts: Mapping[str, int],
        interval_seconds: int,
    ) -> None:
        self.cluster_id = cluster_id
        self.workspace_id = workspace_id
        self.agent_id = agent_id
        self.source_id = source_id
        self.collector = collector
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
        self._client: ManagementPlaneClient | None = None
        self._worker_tasks: dict[str, list[asyncio.Task[None]]] = {
            provider_key: [] for provider_key in provider_keys
        }
        self._worker_serials = {provider_key: 0 for provider_key in provider_keys}
        self._workers_started = False

    async def run(self, client: ManagementPlaneClient) -> None:
        self._client = client
        self._workers_started = True
        self.reconcile_worker_pools(client)
        try:
            await self.schedule_forever(client)
        finally:
            self._workers_started = False
            self._client = None
            await self.stop_workers()

    async def schedule_forever(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await self.schedule_once(client)
            except Exception as exc:
                print(f"evidence schedule failed: {exc}", flush=True)
            await asyncio.sleep(1)

    async def schedule_once(
        self,
        client: ManagementPlaneClient,
        now: float | None = None,
    ) -> str | None:
        now = time.time() if now is None else now
        due_provider_keys = self.due_provider_keys(now)
        if not due_provider_keys:
            return None

        window_start = self.new_window_start(now)
        response = await client.schedule_evidence_jobs(
            self.source_id,
            window_start,
            list(due_provider_keys),
        )
        for provider_key in due_provider_keys:
            self.next_provider_runs[provider_key] = now + self.provider_intervals[provider_key]
        return str(response.get(Gateway.EVIDENCE_KEY) or window_start)

    def due_provider_keys(self, now: float) -> tuple[str, ...]:
        return tuple(
            provider_key
            for provider_key in self.provider_keys
            if provider_key in self.enabled_provider_keys
            and now >= self.next_provider_runs[provider_key]
        )

    async def work_forever(
        self,
        client: ManagementPlaneClient,
        provider_key: str,
        worker_id: str,
    ) -> None:
        while True:
            try:
                processed = await self.work_once(client, provider_key, worker_id)
            except Exception as exc:
                print(f"evidence worker failed: {worker_id}: {exc}", flush=True)
                processed = False
            if not processed:
                await asyncio.sleep(DEFAULT_JOB_POLL_SECONDS)

    async def work_once(
        self,
        client: ManagementPlaneClient,
        provider_key: str,
        worker_id: str,
    ) -> bool:
        job = await client.poll_evidence_job(
            provider_key,
            self.agent_id,
            DEFAULT_JOB_POLL_TIMEOUT_SECONDS,
        )
        if job is None:
            return False

        job_id = str(job[Gateway.JOB_ID])
        lease_id = str(job[Gateway.LEASE_ID])
        try:
            result = await self.collect_job(job, provider_key)
        except Exception as exc:
            await client.complete_evidence_job(
                job_id,
                self.agent_id,
                lease_id,
                CommandStatus.FAILED,
                {},
                str(exc),
            )
            return True

        await client.complete_evidence_job(
            job_id,
            self.agent_id,
            lease_id,
            CommandStatus.COMPLETED,
            result,
            "",
        )
        return True

    async def collect_job(self, job: JsonObject, provider_key: str) -> JsonObject:
        definitions = self.job_query_definitions(job, provider_key)
        if hasattr(self.collector, "collect_query_policy"):
            return await self.collector.collect_query_policy(provider_key, definitions)
        return await self.collector.collect(provider_key)

    def job_query_definitions(
        self,
        job: JsonObject,
        provider_key: str,
    ) -> tuple[TelemetryQueryDefinition, ...]:
        source = SOURCE_BY_PROVIDER.get(provider_key)
        if source is None:
            return ()
        provider_policy = job.get(Gateway.PROVIDER_POLICY, {})
        if not isinstance(provider_policy, Mapping):
            return ()
        query_rows = provider_policy.get("queries", [])
        if not isinstance(query_rows, list):
            return ()
        definitions: list[TelemetryQueryDefinition] = []
        for query in query_rows:
            if not isinstance(query, Mapping):
                continue
            payload = dict(query)
            payload.setdefault("source", source)
            definitions.append(TelemetryQueryDefinition.from_mapping(payload))
        return tuple(definitions)

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

    def set_worker_counts(
        self,
        provider_worker_counts: Mapping[str, int],
    ) -> None:
        for provider_key in self.provider_keys:
            self.provider_worker_counts[provider_key] = max(
                0,
                provider_worker_counts.get(provider_key, self.provider_worker_counts[provider_key]),
            )
            if self._client is not None:
                self.reconcile_worker_pool(provider_key, self._client)

    def current_worker_counts(self) -> dict[str, int]:
        self.prune_finished_workers()
        if not self._workers_started:
            return dict(self.provider_worker_counts)
        return {
            provider_key: len(self._worker_tasks[provider_key])
            for provider_key in self.provider_keys
        }

    def reconcile_worker_pools(self, client: ManagementPlaneClient) -> None:
        for provider_key in self.provider_keys:
            self.reconcile_worker_pool(provider_key, client)

    def reconcile_worker_pool(
        self,
        provider_key: str,
        client: ManagementPlaneClient,
    ) -> None:
        self.prune_finished_workers()
        if not self._workers_started:
            return

        tasks = self._worker_tasks[provider_key]
        desired_count = self.provider_worker_counts[provider_key]
        while len(tasks) < desired_count:
            worker_id = self.next_worker_id(provider_key)
            task = asyncio.create_task(
                self.work_forever(client, provider_key, worker_id),
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
        tasks = [task for provider_tasks in self._worker_tasks.values() for task in provider_tasks]
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

    def new_window_start(self, now: float) -> str:
        interval = max(1, self.interval_seconds)
        current = int(now)
        window_start = current - (current % interval)
        return datetime.fromtimestamp(window_start, UTC).isoformat()
