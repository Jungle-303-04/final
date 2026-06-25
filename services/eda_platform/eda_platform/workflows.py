from __future__ import annotations

import asyncio
import json
import signal
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from eda_platform.core import Database, EventBus, env, publish_and_record, wait_for_database

Handler = Callable[[dict[str, Any]], Awaitable[None]]


class WorkerRuntime:
    def __init__(self, role: str, subject: str, handler_factory: Callable[[EventBus, Database], Handler]) -> None:
        self.role = role
        self.subject = subject
        self.db = Database()
        self.bus = EventBus()
        self.handler_factory = handler_factory

    async def run(self) -> None:
        await wait_for_database(self.db)
        await self.bus.connect()
        sub = await self.bus.subscribe(self.subject, durable=self.role)
        handler = self.handler_factory(self.bus, self.db)
        stopping = asyncio.Event()
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
        print(f"{self.role} subscribed to {self.subject}", flush=True)

        while not stopping.is_set():
            try:
                messages = await sub.fetch(1, timeout=1)
            except TimeoutError:
                continue
            except Exception as exc:
                print(f"{self.role} fetch error: {exc}", flush=True)
                await asyncio.sleep(1)
                continue

            for message in messages:
                try:
                    evt = json.loads(message.data.decode())
                    self.db.record_event(evt)
                    await handler(evt)
                    await message.ack()
                except Exception as exc:
                    print(f"{self.role} handler error: {exc}", flush=True)
                    await message.nak(delay=2)

        await self.bus.close()


class GitOpsSyncWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        commit_sha = payload.get("commit_sha") or str(uuid.uuid4())[:8]
        manifest = {
            "app": "checkout-api",
            "image": payload.get("image", "ghcr.io/project/checkout-api:bad"),
            "replicas": payload.get("replicas", 2),
            "namespace": "sandbox",
        }
        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "insert into repo_changes (correlation_id, commit_sha, manifest) values (%s, %s, %s)",
                    (evt["correlation_id"], commit_sha, json.dumps(manifest)),
                )

        rendered = {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": manifest["app"], "namespace": manifest["namespace"]},
            "spec": {"replicas": manifest["replicas"], "image": manifest["image"]},
        }
        diff = {
            "resource": "deployment/checkout-api",
            "namespace": "sandbox",
            "desired_image": rendered["spec"]["image"],
            "actual_image": "ghcr.io/project/checkout-api:previous",
            "risk": "sandbox-only",
        }
        await publish_and_record(self.bus, self.db, "git.changed", "gitops-sync-worker", {"commit_sha": commit_sha, "manifest": manifest}, evt["correlation_id"])
        await publish_and_record(self.bus, self.db, "manifest.rendered", "gitops-sync-worker", {"rendered_manifest": rendered}, evt["correlation_id"])
        await publish_and_record(self.bus, self.db, "desired.diff.detected", "gitops-sync-worker", {"diff": diff}, evt["correlation_id"])
        await publish_and_record(
            self.bus,
            self.db,
            "command.requested",
            "gitops-sync-worker",
            {
                "cluster_id": env("TARGET_CLUSTER_ID", "target-cluster-01"),
                "action": "apply_sandbox_manifest",
                "namespace": "sandbox",
                "reason": "sync rendered manifest to sandbox namespace",
                "diff": diff,
            },
            evt["correlation_id"],
        )


class CommandWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        namespace = payload.get("namespace", "sandbox")
        if namespace != "sandbox":
            await publish_and_record(
                self.bus,
                self.db,
                "command.rejected",
                "command-worker",
                {"reason": "only sandbox namespace writes are allowed", "requested": payload},
                evt["correlation_id"],
            )
            return

        plan = {
            "command_id": str(uuid.uuid4()),
            "cluster_id": payload.get("cluster_id", "target-cluster-01"),
            "action": payload.get("action", "rollout_restart"),
            "namespace": namespace,
            "steps": ["validate policy", "route target cluster", "queue for agent"],
        }
        await publish_and_record(self.bus, self.db, "command.dispatch.ready", "command-worker", {"plan": plan}, evt["correlation_id"])
        await publish_and_record(
            self.bus,
            self.db,
            "command.dispatched",
            "command-worker",
            {"plan": plan, "route": {"channel": "agent-poll", "cluster_id": plan["cluster_id"]}},
            evt["correlation_id"],
        )
        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into agent_commands
                        (command_id, correlation_id, cluster_id, action, payload, status, updated_at)
                    values (%s, %s, %s, %s, %s, 'queued', now())
                    on conflict (command_id) do nothing
                    """,
                    (
                        plan["command_id"],
                        evt["correlation_id"],
                        plan["cluster_id"],
                        plan["action"],
                        json.dumps(plan),
                    ),
                )
        await publish_and_record(
            self.bus,
            self.db,
            "command.queued_for_agent",
            "command-worker",
            {"command_id": plan["command_id"], "cluster_id": plan["cluster_id"]},
            evt["correlation_id"],
        )


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
                cur.execute("insert into evidence (correlation_id, kind, payload) values (%s, %s, %s)", (evt["correlation_id"], "rca_bundle", json.dumps(evidence)))
                cur.execute(
                    "insert into rca_reports (correlation_id, root_cause, action, payload) values (%s, %s, %s, %s)",
                    (evt["correlation_id"], root_cause, action, json.dumps({"evidence_ref": evidence["object_ref"]})),
                )
                cur.execute(
                    "insert into pull_requests (correlation_id, pr_url, title, body, status) values (%s, %s, %s, %s, 'created')",
                    (evt["correlation_id"], pr_url, "Safe rollback proposal for checkout-api", f"RCA: {root_cause}\n\nAction: {action}"),
                )

        await publish_and_record(self.bus, self.db, "evidence.built", "rca-worker", {"evidence": evidence}, evt["correlation_id"])
        await publish_and_record(self.bus, self.db, "rca.completed", "rca-worker", {"root_cause": root_cause, "action": action, "evidence_ref": evidence["object_ref"]}, evt["correlation_id"])
        await publish_and_record(
            self.bus,
            self.db,
            "safe_pr.created",
            "rca-worker",
            {"pr_url": pr_url, "provider": "github", "token_ref": token_ref, "mode": "fake_github_api_call"},
            evt["correlation_id"],
        )


class DashboardProjectionWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        if evt["subject"] == "dashboard.updated":
            return
        status = "done" if evt["subject"] in {"safe_pr.created", "command.completed"} else "running"
        if evt["subject"].endswith("rejected") or evt["subject"].endswith("failed"):
            status = "attention"
        summary = f"{evt['subject']} from {evt['source']}"
        self.db.upsert_dashboard(evt, status, summary)
        await publish_and_record(self.bus, self.db, "dashboard.updated", "dashboard-projection-service", {"summary": summary, "status": status}, evt["correlation_id"])


class AuditTimelineWorkflow:
    def __init__(self, _bus: EventBus, db: Database) -> None:
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into audit_log (event_id, subject, source, correlation_id, payload)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (evt["event_id"], evt["subject"], evt["source"], evt["correlation_id"], json.dumps(evt["payload"])),
                )


WORKERS: dict[str, tuple[str, Callable[[EventBus, Database], Handler]]] = {
    "gitops-sync-worker": ("git.webhook.received", lambda bus, db: GitOpsSyncWorkflow(bus, db).handle),
    "command-worker": ("command.requested", lambda bus, db: CommandWorkflow(bus, db).handle),
    "rca-worker": ("cluster.evidence.received", lambda bus, db: RcaWorkflow(bus, db).handle),
    "dashboard-projection-service": (">", lambda bus, db: DashboardProjectionWorkflow(bus, db).handle),
    "audit-timeline-service": (">", lambda bus, db: AuditTimelineWorkflow(bus, db).handle),
}

