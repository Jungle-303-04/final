from __future__ import annotations

import json
import time
from typing import Any

from service.shared.core import Database, EventBus, publish_and_record


class RcaWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        evidence = {
            "cluster_id": evt["payload"].get("cluster_id", "target-cluster-01"),
            "kubernetes": evt["payload"].get("kubernetes", {}),
            "metrics": evt["payload"].get("metrics", {}),
            "logs": evt["payload"].get("logs", []),
            "traces": evt["payload"].get("traces", {}),
            "object_ref": f"object://evidence/{evt['correlation_id']}.json",
        }
        root_cause = "Image rollout introduced failing readiness checks"
        action = "Open a safe PR to pin the previous image tag"
        pr_number = int(time.time()) % 100000
        pr_url = f"https://github.example.local/project/repo/pull/{pr_number}"
        token_ref = self.db.latest_github_token_ref() or "missing-github-oauth-fallback"

        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "insert into evidence (correlation_id, kind, payload) values (%s, %s, %s)",
                    (evt["correlation_id"], "rca_bundle", json.dumps(evidence)),
                )
                cur.execute(
                    """
                    insert into rca_reports (correlation_id, root_cause, action, payload)
                    values (%s, %s, %s, %s)
                    """,
                    (
                        evt["correlation_id"],
                        root_cause,
                        action,
                        json.dumps({"evidence_ref": evidence["object_ref"]}),
                    ),
                )
                cur.execute(
                    """
                    insert into pull_requests (correlation_id, pr_url, title, body, status)
                    values (%s, %s, %s, %s, 'created')
                    """,
                    (
                        evt["correlation_id"],
                        pr_url,
                        "Safe rollback proposal for checkout-api",
                        f"RCA: {root_cause}\n\nAction: {action}",
                    ),
                )

        await publish_and_record(
            self.bus,
            self.db,
            "evidence.built",
            "rca-worker",
            {"evidence": evidence},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            "rca.completed",
            "rca-worker",
            {"root_cause": root_cause, "action": action, "evidence_ref": evidence["object_ref"]},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            "safe_pr.created",
            "rca-worker",
            {
                "pr_url": pr_url,
                "provider": "github",
                "token_ref": token_ref,
                "mode": "fake_github_api_call",
            },
            evt["correlation_id"],
        )
