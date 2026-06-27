from __future__ import annotations

import time

from settings import Settings

from packages.config.constants import GitHub
from packages.contracts.event_bus.interfaces import EventClient, EventEnvelope
from packages.contracts.event_bus.payloads import (
    Evidence,
    EvidenceBuiltPayload,
    RcaCompletedPayload,
    SafePrCreatedPayload,
)
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway.requests import AgentEvidenceRequest
from packages.contracts.interfaces import OAuthAccountStore, RcaStore


class RcaWorkflow:
    def __init__(
        self,
        events: EventClient,
        rca_store: RcaStore,
        oauth_accounts: OAuthAccountStore,
    ) -> None:
        self.events = events
        self.rca_store = rca_store
        self.oauth_accounts = oauth_accounts

    async def handle(self, evt: EventEnvelope) -> None:
        evidence_ref = (
            f"{Settings.OBJECT_EVIDENCE_PREFIX}/{evt.correlation_id}.json"
        )
        data = AgentEvidenceRequest.model_validate(evt.payload)
        evidence = Evidence(
            cluster_id=data.cluster_id,
            kubernetes=data.kubernetes,
            metrics=data.metrics,
            logs=data.logs,
            traces=data.traces,
            object_ref=evidence_ref,
        )
        pr_number = int(time.time()) % Settings.PR_NUMBER_MODULO
        pr_url = f"{Settings.PR_URL_PREFIX}/{pr_number}"
        token_ref = (
            self.oauth_accounts.latest_github_token_ref()
            or Settings.MISSING_GITHUB_TOKEN_REF
        )

        self.rca_store.save_evidence(
            evt.correlation_id, Settings.EVIDENCE_KIND, evidence.to_payload()
        )
        self.rca_store.save_rca_report(
            evt.correlation_id,
            Settings.ROOT_CAUSE,
            Settings.RECOMMENDED_ACTION,
            RcaCompletedPayload(
                root_cause=Settings.ROOT_CAUSE,
                action=Settings.RECOMMENDED_ACTION,
                evidence_ref=evidence.object_ref,
            ).to_payload(),
        )
        self.rca_store.save_pull_request(
            evt.correlation_id,
            pr_url,
            Settings.PR_TITLE,
            "\n\n".join(
                (
                    f"RCA: {Settings.ROOT_CAUSE}",
                    f"Action: {Settings.RECOMMENDED_ACTION}",
                )
            ),
            Settings.PR_STATUS_CREATED,
        )

        await self.events.publish(
            EventSubject.EVIDENCE_BUILT,
            Settings.SERVICE_NAME,
            EvidenceBuiltPayload(evidence=evidence).to_payload(),
            evt.correlation_id,
        )
        await self.events.publish(
            EventSubject.RCA_COMPLETED,
            Settings.SERVICE_NAME,
            RcaCompletedPayload(
                root_cause=Settings.ROOT_CAUSE,
                action=Settings.RECOMMENDED_ACTION,
                evidence_ref=evidence.object_ref,
            ).to_payload(),
            evt.correlation_id,
        )
        await self.events.publish(
            EventSubject.SAFE_PR_CREATED,
            Settings.SERVICE_NAME,
            SafePrCreatedPayload(
                pr_url=pr_url,
                provider=GitHub.PROVIDER,
                token_ref=token_ref,
                mode=Settings.PR_MODE,
            ).to_payload(),
            evt.correlation_id,
        )
