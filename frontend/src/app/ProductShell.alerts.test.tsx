// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AlertEventsPort } from "../features/alerts/alertEventsContract";
import { installMatchMedia, renderShell } from "./__tests__/ProductShellInteractionSupport";

beforeEach(() => {
  installMatchMedia(false);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ProductShell notification center", () => {
  it("owns unread state in the Bell, groups today, deep-links the resource, and clears locally", async () => {
    const user = userEvent.setup();
    renderShell({
      alertEventsPort: alertPort(),
      releasedSurfaceIds: new Set(["home", "issues"]),
    });

    const bell = await screen.findByRole("button", { name: "알림 센터 · 미확인 1개" });
    expect(screen.queryByLabelText("미확인 알림 1개")).toBeNull();
    await user.click(bell);

    expect(screen.getByRole("heading", { name: "알림 센터" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "오늘" })).toBeTruthy();
    const alert = screen.getByRole("link", { name: /파드 CPU 과부하/u });
    expect(alert.getAttribute("href")).toBe(
      "/resources?clusters=cluster-2&resources.types=pod&detail=Pod%2Fsandbox%2Farena-0",
    );
    expect(screen.getByRole("button", { name: "알림 센터 · 미확인 0개" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "모두 지우기" }));
    expect(screen.getByText("확인할 알림이 없습니다.")).toBeTruthy();
  });
});

function alertPort(): AlertEventsPort {
  return {
    list: async () => [{
      event_id: "ale-1",
      rule_id: "alr-1",
      rule_name: "파드 CPU 과부하",
      source: "opsia",
      severity: "critical",
      subject: { cluster: "cluster-2", namespace: "sandbox", kind: "Pod", name: "arena-0" },
      fired_at: new Date().toISOString(),
      resolved_at: null,
      status: "firing",
      observed_value: 91,
      threshold: 80,
      evidence: [],
      incident_id: null,
      acknowledged_at: null,
      acknowledged_by: null,
      promoted_at: null,
      promoted_by: null,
    }],
    acknowledge: async () => { throw new Error("not used"); },
    promote: async () => { throw new Error("not used"); },
  };
}
