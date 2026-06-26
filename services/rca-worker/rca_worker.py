from __future__ import annotations

import time
from typing import Any, Final

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
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import OAuthAccountStore, RcaStore


class Field:
    ACTION: Final[str] = "action"
    EVIDENCE: Final[str] = "evidence"
    EVIDENCE_REF: Final[str] = "evidence_ref"
    KUBERNETES: Final[str] = "kubernetes"
    LOGS: Final[str] = "logs"
    METRICS: Final[str] = "metrics"
    MODE: Final[str] = "mode"
    OBJECT_REF: Final[str] = "object_ref"
    PR_URL: Final[str] = "pr_url"
    ROOT_CAUSE: Final[str] = "root_cause"
    TRACES: Final[str] = "traces"


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
            Gateway.CLUSTER_ID: evt[PAYLOAD].get(
                Gateway.CLUSTER_ID,
                DEFAULT_TARGET_CLUSTER_ID,
            ),
            Field.KUBERNETES: evt[PAYLOAD].get(Field.KUBERNETES, {}),
            Field.METRICS: evt[PAYLOAD].get(Field.METRICS, {}),
            Field.LOGS: evt[PAYLOAD].get(Field.LOGS, []),
            Field.TRACES: evt[PAYLOAD].get(Field.TRACES, {}),
            Field.OBJECT_REF: f"{OBJECT_EVIDENCE_PREFIX}/{evt[CORRELATION_ID]}.json",
        }
        pr_number = int(time.time()) % PR_NUMBER_MODULO
        pr_url = f"{PR_URL_PREFIX}/{pr_number}"
        token_ref = self.oauth_accounts.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF

        self.rca_store.save_evidence(evt[CORRELATION_ID], EVIDENCE_KIND, evidence)
        self.rca_store.save_rca_report(
            evt[CORRELATION_ID],
            ROOT_CAUSE,
            RECOMMENDED_ACTION,
            {Field.EVIDENCE_REF: evidence[Field.OBJECT_REF]},
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
            {Field.EVIDENCE: evidence},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.RCA_COMPLETED,
            SERVICE_NAME,
            {
                Field.ROOT_CAUSE: ROOT_CAUSE,
                Field.ACTION: RECOMMENDED_ACTION,
                Field.EVIDENCE_REF: evidence[Field.OBJECT_REF],
            },
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.SAFE_PR_CREATED,
            SERVICE_NAME,
            {
                Field.PR_URL: pr_url,
                Gateway.PROVIDER: GITHUB_PROVIDER,
                Gateway.TOKEN_REF: token_ref,
                Field.MODE: PR_MODE,
            },
            evt[CORRELATION_ID],
        )
