// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installMatchMedia, renderShell } from "./__tests__/ProductShellInteractionSupport";

beforeEach(() => installMatchMedia(false));
afterEach(cleanup);

describe("ProductShell alert navigation", () => {
  it("shows the real unacknowledged occurrence count beside the alert route", async () => {
    renderShell({
      alertEventsPort: {
        list: async () => [{
          event_id: "ale-1",
          rule_id: "alr-1",
          rule_name: "파드 CPU 과부하",
          source: "opsia",
          severity: "high",
          subject: { cluster: "cluster-2", namespace: "sandbox", kind: "Pod", name: "arena-0" },
          fired_at: "2026-07-15T02:00:00Z",
          resolved_at: null,
          status: "firing",
          observed_value: 91,
          threshold: 80,
          evidence: [{
            type: "metric_sample",
            metric: "cpu_pct",
            observed_at: "2026-07-15T02:00:00Z",
            subject: null,
            value: 91,
            summary: null,
            link: null,
          }],
          incident_id: null,
          acknowledged_at: null,
          acknowledged_by: null,
          promoted_at: null,
          promoted_by: null,
        }],
        acknowledge: async () => { throw new Error("not used"); },
        promote: async () => { throw new Error("not used"); },
      },
      releasedSurfaceIds: new Set(["home", "issues", "alerts"]),
    });

    expect(await screen.findByLabelText("미확인 알림 1개")).toBeTruthy();
    expect(screen.getByRole("link", { name: /알림/u }).getAttribute("href"))
      .toBe("/alerts?clusters=cluster-1");
  });
});
