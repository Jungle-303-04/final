// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlertEvent } from "../features/alerts/alertEventsContract";
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

  it("opens the header notification inbox collapsed and expands newest to oldest", async () => {
    const newest = alertEvent({
      event_id: "ale-newest",
      rule_name: "최신 CPU 알림",
      fired_at: "2026-07-15T03:00:00Z",
    });
    const oldest = alertEvent({
      event_id: "ale-oldest",
      rule_name: "과거 메모리 알림",
      fired_at: "2026-07-15T02:00:00Z",
    });
    renderShell({
      alertEventsPort: {
        list: async () => [oldest, newest],
        acknowledge: async () => { throw new Error("not used"); },
        promote: async () => { throw new Error("not used"); },
      },
      releasedSurfaceIds: new Set(["home", "issues", "alerts"]),
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", {
      name: "알림 열기, 읽지 않은 알림 2개",
    }));
    expect(screen.getByText("최신 CPU 알림")).toBeTruthy();
    expect(screen.queryByText("과거 메모리 알림")).toBeNull();

    await user.click(screen.getByRole("button", { name: "+1개 더 보기" }));
    const labels = screen.getAllByText(/알림$/u).map((node) => node.textContent);
    expect(labels.indexOf("최신 CPU 알림")).toBeLessThan(labels.indexOf("과거 메모리 알림"));

    await user.click(screen.getByRole("button", { name: "모두 읽음" }));
    expect(screen.getByText("아직 발생한 알림이 없습니다")).toBeTruthy();
  });

  it("moves a new alert to the shaking header button while the AI panel is open", async () => {
    let events: readonly AlertEvent[] = [];
    const testEvent = alertEvent({
      event_id: "ale-ai-panel",
      rule_name: "payment-api CPU 임계치 초과",
      subject: {
        cluster: "cluster-1",
        namespace: "default",
        kind: "Pod",
        name: "payment-api-0",
      },
    });
    const list = vi.fn(async () => events);
    const createTest = vi.fn(async () => {
      events = [testEvent];
      return testEvent;
    });
    renderShell({
      alertEventsPort: {
        list,
        createTest,
        acknowledge: async () => { throw new Error("not used"); },
        promote: async () => { throw new Error("not used"); },
      },
      releasedSurfaceIds: new Set(["home", "alerts"]),
    });
    const user = userEvent.setup();

    await waitFor(() => expect(list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Opsia AI 열기" }));
    await user.click(screen.getByRole("button", {
      name: "알림 열기, 읽지 않은 알림 0개",
    }));
    await user.click(await screen.findByRole("button", { name: "테스트 알림 발생" }));

    const previewTitle = "payment-api CPU 임계치 초과 · cluster-1 · default · payment-api-0";
    const preview = await screen.findByTitle(previewTitle);
    const notificationButton = screen.getByRole("button", {
      name: "알림 열기, 읽지 않은 알림 1개",
    });
    expect(notificationButton.querySelector(".motion-notification-bell-ring")).toBeTruthy();
    expect(document.querySelector("[data-sonner-toast]")).toBeNull();

    await waitFor(() => expect(screen.queryByTitle(previewTitle)).toBeNull(), { timeout: 4_000 });
    expect(preview).toBeTruthy();
    expect(screen.getByRole("button", {
      name: "알림 열기, 읽지 않은 알림 1개",
    })).toBeTruthy();
  }, 10_000);
});

function alertEvent(overrides: Partial<AlertEvent>): AlertEvent {
  return {
    event_id: "ale-1",
    rule_id: "alr-1",
    rule_name: "Pod CPU 과부하",
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
    ...overrides,
  };
}
