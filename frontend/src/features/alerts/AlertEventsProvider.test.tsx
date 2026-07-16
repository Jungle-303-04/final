// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { AlertEvent, AlertEventsPort } from "./alertEventsContract";
import { AlertEventsProvider, useAlertEvents } from "./AlertEventsProvider";

const toastSpies = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("../../shared/ui/primitives/sonner", () => ({
  toast: toastSpies,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AlertEventsProvider notifications", () => {
  it("keeps the inbox newest first while enqueueing new toasts oldest to newest", async () => {
    const oldest = alertEvent({
      event_id: "ale-oldest",
      rule_name: "과거 알림",
      fired_at: "2026-07-15T01:00:00Z",
    });
    const middle = alertEvent({
      event_id: "ale-middle",
      rule_name: "중간 알림",
      fired_at: "2026-07-15T02:00:00Z",
    });
    const newest = alertEvent({
      event_id: "ale-newest",
      rule_name: "최신 알림",
      fired_at: "2026-07-15T03:00:00Z",
    });
    const list = vi.fn()
      .mockResolvedValueOnce([oldest])
      .mockResolvedValue([oldest, newest, middle]);
    renderProvider({
      list,
      acknowledge: async () => { throw new Error("not used"); },
      promote: async () => { throw new Error("not used"); },
    });

    expect(await screen.findByText("과거 알림")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => expect(toastSpies.error).toHaveBeenCalledTimes(2));
    expect(toastSpies.error.mock.calls.map(([title]) => title)).toEqual([
      "중간 알림",
      "최신 알림",
    ]);
    expect(toastSpies.error.mock.calls[1]?.[1]).toMatchObject({
      duration: 5_000,
      id: "ale-newest",
    });
    expect(await screen.findByText("최신 알림|중간 알림|과거 알림")).toBeTruthy();
  });

  it("stores a test event and reloads it through the normal polling path", async () => {
    const testEvent = alertEvent({ event_id: "ale-test-1", rule_name: "실시간 알림 테스트" });
    const list = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([testEvent]);
    const createTest = vi.fn().mockResolvedValue(testEvent);
    renderProvider({
      list,
      createTest,
      acknowledge: async () => { throw new Error("not used"); },
      promote: async () => { throw new Error("not used"); },
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await userEvent.setup().click(screen.getByRole("button", { name: "test" }));

    await waitFor(() => expect(createTest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastSpies.error).toHaveBeenCalledWith(
      "실시간 알림 테스트",
      expect.objectContaining({ id: "ale-test-1" }),
    ));
  });
});

function NotificationProbe() {
  const alerts = useAlertEvents();
  return (
    <div>
      <button onClick={alerts.refresh} type="button">refresh</button>
      <button onClick={() => void alerts.createTestEvent()} type="button">test</button>
      <p>{alerts.notifications.map((event) => event.rule_name).join("|")}</p>
    </div>
  );
}

function renderProvider(port: AlertEventsPort) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter>
        <AlertEventsProvider port={port}>
          <NotificationProbe />
        </AlertEventsProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function alertEvent(overrides: Partial<AlertEvent>): AlertEvent {
  return {
    event_id: "ale-1",
    rule_id: "alr-1",
    rule_name: "알림",
    source: "opsia",
    severity: "high",
    subject: { cluster: "cluster-1", namespace: "default", kind: "Pod", name: "api-0" },
    fired_at: "2026-07-15T00:00:00Z",
    resolved_at: null,
    status: "firing",
    observed_value: 91,
    threshold: 80,
    evidence: [{
      type: "metric_sample",
      metric: "cpu_pct",
      observed_at: "2026-07-15T00:00:00Z",
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
