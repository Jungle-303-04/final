from __future__ import annotations

import asyncio
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from evidence.store import EvidenceTaskStore, ProviderQueueStats
from span import get_tracer

TRACER = get_tracer("target-cluster-agent.workload")


@dataclass(frozen=True)
class WorkerPoolDecision:
    provider_key: str
    current_workers: int
    desired_workers: int
    queued_tasks: int
    leased_tasks: int
    oldest_queued_age_seconds: float
    reason: str


class ResizableWorkerPool(Protocol):
    provider_keys: tuple[str, ...]

    def current_worker_counts(self) -> dict[str, int]: ...

    def resize_provider_workers(
        self,
        provider_key: str,
        worker_count: int,
        *,
        authority: object,
    ) -> int: ...


class ClusterWorkloadController:
    def __init__(
        self,
        *,
        worker_pool: ResizableWorkerPool,
        store: EvidenceTaskStore,
        authority: object,
        min_worker_counts: Mapping[str, int],
        max_worker_counts: Mapping[str, int],
        interval_seconds: int,
        queue_age_target_seconds: int,
    ) -> None:
        self.worker_pool = worker_pool
        self.store = store
        self._authority = authority
        self.provider_keys = worker_pool.provider_keys
        self.min_worker_counts = {
            provider_key: max(0, min_worker_counts.get(provider_key, 1))
            for provider_key in self.provider_keys
        }
        self.max_worker_counts = {
            provider_key: max(
                self.min_worker_counts[provider_key],
                max_worker_counts.get(provider_key, self.min_worker_counts[provider_key]),
            )
            for provider_key in self.provider_keys
        }
        self.interval_seconds = interval_seconds
        self.queue_age_targets = {
            provider_key: queue_age_target_seconds for provider_key in self.provider_keys
        }

    async def run(self) -> None:
        while True:
            self.reconcile_once()
            await asyncio.sleep(self.interval_seconds)

    def reconcile_once(self, now: float | None = None) -> dict[str, WorkerPoolDecision]:
        now = time.time() if now is None else now
        stats_by_provider = self.store.provider_queue_stats(self.provider_keys, now)
        current_counts = self.worker_pool.current_worker_counts()
        decisions: dict[str, WorkerPoolDecision] = {}

        with TRACER.start_as_current_span("workload.reconcile") as span:
            span.attr("workload.scope", "target-agent")
            for provider_key in self.provider_keys:
                stats = stats_by_provider[provider_key]
                current_workers = current_counts.get(
                    provider_key,
                    self.min_worker_counts[provider_key],
                )
                desired_workers, reason = self.desired_worker_count(
                    provider_key,
                    current_workers,
                    stats,
                )
                applied_workers = current_workers
                if desired_workers != current_workers:
                    applied_workers = self.worker_pool.resize_provider_workers(
                        provider_key,
                        desired_workers,
                        authority=self._authority,
                    )

                span.attr(f"workload.{provider_key}.workers", applied_workers)
                span.attr(f"workload.{provider_key}.queued", stats.queued)
                span.attr(f"workload.{provider_key}.leased", stats.leased)
                span.attr(
                    f"workload.{provider_key}.oldest_queued_age_seconds",
                    stats.oldest_queued_age_seconds,
                )
                decisions[provider_key] = WorkerPoolDecision(
                    provider_key=provider_key,
                    current_workers=current_workers,
                    desired_workers=applied_workers,
                    queued_tasks=stats.queued,
                    leased_tasks=stats.leased,
                    oldest_queued_age_seconds=stats.oldest_queued_age_seconds,
                    reason=reason,
                )
        return decisions

    def desired_worker_count(
        self,
        provider_key: str,
        current_workers: int,
        stats: ProviderQueueStats,
    ) -> tuple[int, str]:
        minimum = self.min_worker_counts[provider_key]
        maximum = self.max_worker_counts[provider_key]

        if stats.queued > current_workers:
            return min(maximum, current_workers + 1), "queued_tasks_exceed_workers"
        if stats.oldest_queued_age_seconds > self.queue_age_targets[provider_key]:
            return min(maximum, current_workers + 1), "queued_task_waited_too_long"
        if stats.queued == 0 and stats.leased == 0 and current_workers > minimum:
            return max(minimum, current_workers - 1), "idle_worker_pool"
        return current_workers, "within_target"

    def configure_worker_policy(
        self,
        *,
        min_worker_counts: Mapping[str, int],
        max_worker_counts: Mapping[str, int],
        queue_age_targets: Mapping[str, int],
    ) -> None:
        for provider_key in self.provider_keys:
            minimum = max(
                0,
                min_worker_counts.get(provider_key, self.min_worker_counts[provider_key]),
            )
            maximum = max(minimum, max_worker_counts.get(provider_key, minimum))
            self.min_worker_counts[provider_key] = minimum
            self.max_worker_counts[provider_key] = maximum
            self.queue_age_targets[provider_key] = max(
                1,
                queue_age_targets.get(provider_key, self.queue_age_targets[provider_key]),
            )
