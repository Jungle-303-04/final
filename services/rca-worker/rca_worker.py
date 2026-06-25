from __future__ import annotations

import json
import time
from typing import Any

from packages.shared.constants import DEFAULT_TARGET_CLUSTER_ID, GITHUB_PROVIDER, EventSubject
from packages.shared.core import Database, EventBus, publish_and_record

SERVICE_NAME = "rca-worker"
ROOT_CAUSE = "Image rollout introduced failing readiness checks"
RECOMMENDED_ACTION = "Open a safe PR to pin the previous image tag"
PR_TITLE = "Safe rollback proposal for checkout-api"
PR_MODE = "fake_github_api_call"
MISSING_GITHUB_TOKEN_REF = "missing-github-oauth-fallback"
OBJECT_EVIDENCE_PREFIX = "object://evidence"
EVIDENCE_KIND = "rca_bundle"
PR_URL_PREFIX = "https://github.example.local/project/repo/pull"
PR_NUMBER_MODULO = 100000
PR_STATUS_CREATED = "created"


class RcaWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

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
        token_ref = self.db.latest_github_token_ref() or MISSING_GITHUB_TOKEN_REF

        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "insert into evidence (correlation_id, kind, payload) values (%s, %s, %s)",
                    (evt["correlation_id"], EVIDENCE_KIND, json.dumps(evidence)),
                )
                cur.execute(
                    """
                    insert into rca_reports (correlation_id, root_cause, action, payload)
                    values (%s, %s, %s, %s)
                    """,
                    (
                        evt["correlation_id"],
                        ROOT_CAUSE,
                        RECOMMENDED_ACTION,
                        json.dumps({"evidence_ref": evidence["object_ref"]}),
                    ),
                )
                cur.execute(
                    """
                    insert into pull_requests (correlation_id, pr_url, title, body, status)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (
                        evt["correlation_id"],
                        pr_url,
                        PR_TITLE,
                        f"RCA: {ROOT_CAUSE}\n\nAction: {RECOMMENDED_ACTION}",
                        PR_STATUS_CREATED,
                    ),
                )

        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.EVIDENCE_BUILT,
            SERVICE_NAME,
            {"evidence": evidence},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.RCA_COMPLETED,
            SERVICE_NAME,
            {
                "root_cause": ROOT_CAUSE,
                "action": RECOMMENDED_ACTION,
                "evidence_ref": evidence["object_ref"],
            },
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
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
