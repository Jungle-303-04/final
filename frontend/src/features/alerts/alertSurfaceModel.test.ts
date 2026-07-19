import { describe, expect, it } from "vitest";

import type { ProductNotification } from "../notifications/ProductNotificationsProvider";
import type { OperationStatusSnapshot } from "../operations/OperationStatusStore";
import type { AlertEvent } from "./alertEventsContract";
import { buildAlertSurfaceData } from "./alertSurfaceModel";

describe("alert surface model", () => {
  it("combines actual alert, operation, and local records without inventing counts", () => {
    const active = operation("deploy-1", "running", {
      completed: 3,
      href: "/deploy",
      title: "production rollout",
      total: 5,
    });
    const completed = operation("config-1", "completed", {
      href: "/settings",
      title: "channel updated",
    });
    const local: ProductNotification = {
      description: "release",
      href: "/deploy",
      id: "release-failed",
      occurredAt: "2026-07-19T02:02:00Z",
      title: "release failed",
      tone: "critical",
    };

    const data = buildAlertSurfaceData([alert()], [active, completed], [local]);

    expect(data.inProgress).toEqual([expect.objectContaining({
      completed: 3,
      href: "/deploy",
      progress: 60,
      total: 5,
    })]);
    expect(data.rows.map(({ category, id, tone }) => ({ category, id, tone }))).toEqual([
      { category: "deployment", id: "local:release-failed", tone: "critical" },
      { category: "configuration", id: "operation:config-1", tone: "healthy" },
      { category: "issue", id: "alert:ale-1", tone: "critical" },
    ]);
    expect(data.criticalCount).toBe(2);
  });

  it("lands a workflow event on its stable run workspace instead of a generic timeline", () => {
    const workflow = operation("command-77", "completed", {
      category: "workflow",
      title: "canary approval completed",
      workflow_run_id: "run-77",
    });

    const data = buildAlertSurfaceData([], [workflow], []);

    expect(data.rows).toEqual([expect.objectContaining({
      category: "deployment",
      href: "/deploy?section=workflows&view=runs&detail=run-77",
      id: "operation:command-77",
    })]);
  });

  it("rejects a corrupted local timestamp before it can break relative-time rendering", () => {
    const corrupt: ProductNotification = {
      description: "stale browser entry",
      href: "/settings",
      id: "corrupt",
      occurredAt: "not-a-date",
      title: "corrupt entry",
      tone: "warning",
    };

    expect(buildAlertSurfaceData([], [], [corrupt]).rows).toEqual([]);
  });
});

function alert(): AlertEvent {
  return {
    acknowledged_at: null,
    acknowledged_by: null,
    event_id: "ale-1",
    evidence: [{
      link: null,
      metric: "restart_count",
      observed_at: "2026-07-19T02:00:00Z",
      subject: null,
      summary: "restart threshold crossed",
      type: "metric_sample",
      value: 3,
    }],
    fired_at: "2026-07-19T02:00:00Z",
    incident_id: null,
    observed_value: 3,
    promoted_at: null,
    promoted_by: null,
    resolved_at: null,
    rule_id: "rule-1",
    rule_name: "redis restart threshold",
    severity: "critical",
    source: "opsia",
    status: "firing",
    subject: { cluster: "prod", kind: "Pod", name: "redis-0", namespace: "platform" },
    threshold: 2,
  };
}

function operation(
  commandId: string,
  status: OperationStatusSnapshot["status"],
  payload: Record<string, unknown>,
): OperationStatusSnapshot {
  return {
    commandId,
    event: {
      commandId,
      kind: status === "completed" ? "completed" : "progress",
      occurredAt: status === "completed" ? "2026-07-19T02:01:00Z" : "2026-07-19T02:03:00Z",
      payload,
      sequence: 1,
    },
    failure: null,
    retry: null,
    sequence: 1,
    status,
    updatedAt: status === "completed" ? 2 : 3,
  };
}
