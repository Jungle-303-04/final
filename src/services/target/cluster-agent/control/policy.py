from __future__ import annotations

import asyncio
from collections.abc import Callable

from span import get_tracer

from control.store import AgentControlStore
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.requests import (
    AgentPolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)
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
            self.merge_policy(self.default_policy, stored_policy)
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
                policy = self.merge_policy(
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

    def merge_policy(self, base: AgentPolicy, incoming: AgentPolicy) -> AgentPolicy:
        payload = base.model_dump()
        payload["generation"] = incoming.generation
        if "cluster_id" in incoming.model_fields_set:
            payload["cluster_id"] = incoming.cluster_id
        if "cluster_role" in incoming.model_fields_set:
            payload["cluster_role"] = incoming.cluster_role

        if "evidence" in incoming.model_fields_set:
            payload["evidence"] = self.merge_evidence_policy(
                base.evidence,
                incoming.evidence,
            ).model_dump()
        if "bootstrap" in incoming.model_fields_set:
            payload["bootstrap"] = incoming.bootstrap.model_dump()
        if "desired_state" in incoming.model_fields_set:
            payload["desired_state"] = incoming.desired_state.model_dump()
        return AgentPolicy.model_validate(payload)

    def merge_evidence_policy(
        self,
        base: EvidenceRuntimePolicy,
        incoming: EvidenceRuntimePolicy,
    ) -> EvidenceRuntimePolicy:
        payload = base.model_dump()
        if "failure_policy" in incoming.model_fields_set:
            payload["failure_policy"] = incoming.failure_policy
        providers = dict(payload.get("providers", {}))
        if "providers" in incoming.model_fields_set:
            for provider_key, provider_policy in incoming.providers.items():
                base_provider = base.providers.get(provider_key, EvidenceProviderPolicy())
                providers[provider_key] = self.merge_provider_policy(
                    base_provider,
                    provider_policy,
                ).model_dump()
        payload["providers"] = providers
        return EvidenceRuntimePolicy.model_validate(payload)

    def merge_provider_policy(
        self,
        base: EvidenceProviderPolicy,
        incoming: EvidenceProviderPolicy,
    ) -> EvidenceProviderPolicy:
        payload = base.model_dump()
        for field_name in incoming.model_fields_set:
            payload[field_name] = getattr(incoming, field_name)
        return EvidenceProviderPolicy.model_validate(payload)

    def payload_generation(self, payload: JsonObject, fallback: int) -> int:
        raw_generation = payload.get("generation")
        return raw_generation if isinstance(raw_generation, int) else fallback
