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

from packages.config.constants import DEFAULT_TARGET_CLUSTER_ID, GITHUB_PROVIDER
from packages.contracts.event_bus.fields import CORRELATION_ID, PAYLOAD
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import fields as gateway_fields
from packages.contracts.interfaces import OAuthAccountStore, RcaStore

ACTION_FIELD = "action"
EVIDENCE_FIELD = "evidence"
EVIDENCE_REF_FIELD = "evidence_ref"
KUBERNETES_FIELD = "kubernetes"
LOGS_FIELD = "logs"
METRICS_FIELD = "metrics"
MODE_FIELD = "mode"
OBJECT_REF_FIELD = "object_ref"
ROOT_CAUSE_FIELD = "root_cause"
TRACES_FIELD = "traces"


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
            gateway_fields.CLUSTER_ID: evt[PAYLOAD].get(
                gateway_fields.CLUSTER_ID,
                DEFAULT_TARGET_CLUSTER_ID,
            ),
            KUBERNETES_FIELD: evt[PAYLOAD].get(KUBERNETES_FIELD, {}),
            METRICS_FIELD: evt[PAYLOAD].get(METRICS_FIELD, {}),
            LOGS_FIELD: evt[PAYLOAD].get(LOGS_FIELD, []),
            TRACES_FIELD: evt[PAYLOAD].get(TRACES_FIELD, {}),
            OBJECT_REF_FIELD: f"{OBJECT_EVIDENCE_PREFIX}/{evt[CORRELATION_ID]}.json",
        }
        pr_number = int(time.time()) % PR_NUMBER_MODULO
        pr_url = f"{PR_URL_PREFIX}/{pr_number}"
        token_ref = self.oauth_accounts.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF

        self.rca_store.save_evidence(evt[CORRELATION_ID], EVIDENCE_KIND, evidence)
        self.rca_store.save_rca_report(
            evt[CORRELATION_ID],
            ROOT_CAUSE,
            RECOMMENDED_ACTION,
            {EVIDENCE_REF_FIELD: evidence[OBJECT_REF_FIELD]},
        )
        self.rca_store.save_pull_request(
            evt[CORRELATION_ID],
            pr_url,
            PR_TITLE,
            f"RCA: {ROOT_CAUSE}\n\nAction: {RECOMMENDED_ACTION}",
            PR_STATUS_CREATED,
        )

        await self.events.publish(
            EventSubject.EVIDENCE_BUILT,
            SERVICE_NAME,
            {EVIDENCE_FIELD: evidence},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.RCA_COMPLETED,
            SERVICE_NAME,
            {
                ROOT_CAUSE_FIELD: ROOT_CAUSE,
                ACTION_FIELD: RECOMMENDED_ACTION,
                EVIDENCE_REF_FIELD: evidence[OBJECT_REF_FIELD],
            },
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.SAFE_PR_CREATED,
            SERVICE_NAME,
            {
                "pr_url": pr_url,
                gateway_fields.PROVIDER: GITHUB_PROVIDER,
                gateway_fields.TOKEN_REF: token_ref,
                MODE_FIELD: PR_MODE,
            },
            evt[CORRELATION_ID],
        )
