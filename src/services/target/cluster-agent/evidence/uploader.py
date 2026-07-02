from __future__ import annotations

import asyncio
import time

from evidence.store import EvidenceTaskStore
from packages.contracts.interfaces import ManagementPlaneClient

UPLOAD_DONE = "done"
UPLOAD_FAILED = "failed"
UPLOAD_IDLE = "idle"
UPLOAD_SKIPPED = "skipped"

FAILURE_POLICY_ALLOW_PARTIAL = "allow_partial"
FAILURE_POLICY_STRICT = "strict"

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_MAX_UPLOAD_ATTEMPTS = 3
DEFAULT_POLL_SECONDS = 1.0
DEFAULT_UPLOAD_RETRY_SECONDS = 5.0
SUCCESS_STATUS_MIN = 200
SUCCESS_STATUS_MAX = 300


class EvidenceUploader:
    def __init__(
        self,
        store: EvidenceTaskStore,
        failure_policy: str,
        *,
        cluster_id: str,
        workspace_id: str,
        agent_id: str,
        source_id: str,
        source_lease_seconds: int,
        max_upload_attempts: int = DEFAULT_MAX_UPLOAD_ATTEMPTS,
    ) -> None:
        self.store = store
        self.failure_policy = self.validate_failure_policy(failure_policy)
        self.cluster_id = cluster_id
        self.workspace_id = workspace_id
        self.agent_id = agent_id
        self.source_id = source_id
        self.source_lease_seconds = source_lease_seconds
        self.max_upload_attempts = max(1, max_upload_attempts)

    def set_failure_policy(self, failure_policy: str) -> None:
        self.failure_policy = self.validate_failure_policy(failure_policy)

    async def run(self, client: ManagementPlaneClient) -> None:
        while True:
            result = await self.upload_once(client)
            if result == UPLOAD_IDLE:
                await asyncio.sleep(DEFAULT_POLL_SECONDS)
            elif result == UPLOAD_FAILED:
                await asyncio.sleep(DEFAULT_UPLOAD_RETRY_SECONDS)

    async def upload_once(self, client: ManagementPlaneClient) -> str:
        collection_id = self.store.next_uploadable_collection()
        if collection_id is None:
            return UPLOAD_IDLE

        lease = await client.acquire_evidence_source_lease(
            self.cluster_id,
            self.workspace_id,
            self.agent_id,
            self.source_id,
            collection_id,
            self.source_lease_seconds,
        )
        if not lease.get("leased"):
            return UPLOAD_IDLE

        if self.failure_policy == FAILURE_POLICY_STRICT and self.store.collection_has_failed_task(
            collection_id
        ):
            self.store.mark_failed(collection_id, time.time())
            print(
                f"evidence collection failed id={collection_id} policy=strict",
                flush=True,
            )
            return UPLOAD_SKIPPED

        try:
            evidence = self.store.evidence_payload(collection_id)
            evidence.update(
                {
                    "workspace_id": self.workspace_id,
                    "agent_id": self.agent_id,
                    "source_id": self.source_id,
                    "window_start": collection_id,
                    "evidence_key": collection_id,
                }
            )
            status_code = await client.ship_evidence(evidence)
            self.ensure_successful_upload(collection_id, status_code)
            self.store.mark_uploaded(collection_id, time.time())
            print(
                f"evidence collection uploaded id={collection_id} status={status_code}",
                flush=True,
            )
            return UPLOAD_DONE
        except Exception as exc:
            print(f"evidence upload failed collection={collection_id}: {exc}", flush=True)
            exhausted = self.store.record_upload_failure(
                collection_id,
                str(exc),
                self.max_upload_attempts,
                time.time(),
            )
            if exhausted:
                print(
                    f"evidence collection failed id={collection_id} reason=upload_exhausted",
                    flush=True,
                )
            return UPLOAD_FAILED

    def validate_failure_policy(self, failure_policy: str) -> str:
        if failure_policy in (FAILURE_POLICY_ALLOW_PARTIAL, FAILURE_POLICY_STRICT):
            return failure_policy
        raise ValueError(f"unsupported evidence failure policy: {failure_policy}")

    def ensure_successful_upload(self, collection_id: str, status_code: int) -> None:
        if SUCCESS_STATUS_MIN <= status_code < SUCCESS_STATUS_MAX:
            return
        raise RuntimeError(
            f"evidence upload rejected collection={collection_id} status={status_code}"
        )
