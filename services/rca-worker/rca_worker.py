from __future__ import annotations

import time
from typing import Any

from settings import (
    EVIDENCE_KIND,
    MISSING_GITHUB_TOKEN_REF,
    OBJECT_EVIDENCE_PREFIX,
    PR_MODE,
    PR_NUMBER_MODULO,
    PR_STATUS_CREATED,
    PR_TITLE,
    PR_URL_PREFIX,
    RECOMMENDED_ACTION,
    ROOT_CAUSE,
    SERVICE_NAME,
)

from packages.config.constants import DEFAULT_TARGET_CLUSTER_ID, GITHUB_PROVIDER, EventSubject
from packages.contracts.interfaces import EventClient, OAuthAccountStore, RcaStore


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

    async def handle(self, evt: dict[str, Any]) -> None:
        evidence = {
            "cluster_id": evt["payload"].get("cluster_id", DEFAULT_TARGET_CLUSTER_ID),
            "kubernetes": evt["payload"].get("kubernetes", {}),
            "metrics": evt["payload"].get("metrics", {}),
            "logs": evt["payload"].get("logs", []),
            "traces": evt["payload"].get("traces", {}),
            "object_ref": f"{OBJECT_EVIDENCE_PREFIX}/{evt['correlation_id']}.json",
        }
        pr_number = int(time.time()) % PR_NUMBER_MODULO
        pr_url = f"{PR_URL_PREFIX}/{pr_number}"
        token_ref = self.oauth_accounts.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF

        self.rca_store.save_evidence(evt["correlation_id"], EVIDENCE_KIND, evidence)
        self.rca_store.save_rca_report(
            evt["correlation_id"],
            ROOT_CAUSE,
            RECOMMENDED_ACTION,
            {"evidence_ref": evidence["object_ref"]},
        )
        self.rca_store.save_pull_request(
            evt["correlation_id"],
            pr_url,
            PR_TITLE,
            f"RCA: {ROOT_CAUSE}\n\nAction: {RECOMMENDED_ACTION}",
            PR_STATUS_CREATED,
        )

        await self.events.publish(
            EventSubject.EVIDENCE_BUILT,
            SERVICE_NAME,
            {"evidence": evidence},
            evt["correlation_id"],
        )
        await self.events.publish(
            EventSubject.RCA_COMPLETED,
            SERVICE_NAME,
            {
                "root_cause": ROOT_CAUSE,
                "action": RECOMMENDED_ACTION,
                "evidence_ref": evidence["object_ref"],
            },
            evt["correlation_id"],
        )
        await self.events.publish(
            EventSubject.SAFE_PR_CREATED,
            SERVICE_NAME,
            {
                "pr_url": pr_url,
                "provider": GITHUB_PROVIDER,
                "token_ref": token_ref,
                "mode": PR_MODE,
            },
            evt["correlation_id"],
        )
