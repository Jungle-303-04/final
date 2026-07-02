from __future__ import annotations

import asyncio
from collections.abc import Callable

from span import get_tracer

from control.store import AgentControlStore
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.policy_merge import merge_agent_policy
from packages.contracts.gateway.requests import AgentPolicy
from packages.contracts.interfaces import ManagementPlaneClient

TRACER = get_tracer("target-cluster-agent.policy")

PolicyApplier = Callable[[AgentPolicy], JsonObject]


class AgentPolicySync:
    def __init__(
        self,
        *,
        cluster_id: str,
        store: AgentControlStore,
        default_policy: AgentPolicy,
        apply_policy: PolicyApplier,
        interval_seconds: int,
    ) -> None:
        self.cluster_id = cluster_id
        self.store = store
        self.default_policy = default_policy
        self.apply_policy = apply_policy
        self.interval_seconds = interval_seconds

    def apply_stored_or_default(self) -> JsonObject:
        stored_policy = self.store.load_policy()
        policy = (
            merge_agent_policy(self.default_policy, stored_policy)
            if stored_policy is not None
            else self.default_policy
        )
        details = self.apply_policy(policy)
        self.store.save_policy(policy)
        return details

    async def run(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await self.sync_once(client)
            except Exception as exc:
                print(f"policy sync failed: {exc}", flush=True)
            await asyncio.sleep(self.interval_seconds)

    async def sync_once(self, client: ManagementPlaneClient) -> str:
        with TRACER.start_as_current_span("policy.sync") as span:
            generation = self.store.active_generation()
            span.attr("policy.generation", generation)
            payload = await client.fetch_policy(self.cluster_id, generation)
            if payload is None:
                await client.report_policy_status(
                    {
                        "cluster_id": self.cluster_id,
                        "generation": generation,
                        "status": "unchanged",
                        "message": "policy unchanged",
                        "details": {},
                    }
                )
                return "unchanged"

            attempted_generation = self.payload_generation(payload, generation)
            try:
                incoming_policy = AgentPolicy.model_validate(payload)
                policy = merge_agent_policy(
                    self.store.load_policy() or self.default_policy,
                    incoming_policy,
                )
                details = self.apply_policy(policy)
                self.store.save_policy(policy)
                await client.report_policy_status(
                    {
                        "cluster_id": self.cluster_id,
                        "generation": policy.generation,
                        "status": "applied",
                        "message": "policy applied",
                        "details": details,
                    }
                )
                return "applied"
            except Exception as exc:
                span.error(exc)
                await client.report_policy_status(
                    {
                        "cluster_id": self.cluster_id,
                        "generation": attempted_generation,
                        "status": "failed",
                        "message": str(exc),
                        "details": {},
                    }
                )
                return "failed"

    def payload_generation(self, payload: JsonObject, fallback: int) -> int:
        raw_generation = payload.get("generation")
        return raw_generation if isinstance(raw_generation, int) else fallback
