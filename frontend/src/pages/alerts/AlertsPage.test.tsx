// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlertEvent } from "../../api";
import { AlertEventsProvider } from "../../features/alerts/AlertEventsProvider";
import type { AlertEventsPort } from "../../features/alerts/alertEventsContract";
import { I18nProvider } from "../../shared/i18n";
import { AlertsPage } from "./AlertsPage";

const FIRING: AlertEvent = {
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
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AlertsPage", () => {
  it("keeps resolved occurrences and renders measured evidence newest first", async () => {
    const resolved: AlertEvent = {
      ...FIRING,
      event_id: "ale-resolved",
      fired_at: "2026-07-15T01:00:00Z",
      resolved_at: "2026-07-15T01:02:00Z",
      status: "resolved",
    };
    renderPage(port([resolved, FIRING]));

    const list = await screen.findByRole("region", { name: "알림 발생 목록" });
    expect(list.textContent?.indexOf("파드 CPU 과부하")).toBeLessThan(
      list.textContent?.lastIndexOf("파드 CPU 과부하") ?? -1,
    );
    expect(screen.getAllByText("91% / 80%")).toHaveLength(2);
    expect(document.querySelector("[data-alert-status='resolved']")).toBeTruthy();
    expect(screen.getAllByText("근거 1개")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /리소스 보기/u })[0]?.getAttribute("href"))
      .toBe("/resources?clusters=cluster-2&resources.types=pod&detail=Pod%2Fsandbox%2Farena-0");
  });

  it("uses the real acknowledgement and incident promotion mutations", async () => {
    const acknowledge = vi.fn(async () => ({
      ...FIRING,
      status: "acked" as const,
      acknowledged_at: "2026-07-15T02:01:00Z",
      acknowledged_by: "admin",
    }));
    const promote = vi.fn(async () => ({ incident_id: "inc-alert-1" }));
    renderPage({
      list: async () => [FIRING],
      acknowledge,
      promote,
    });

    await userEvent.setup().click(await screen.findByRole("button", { name: "확인" }));
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith("ale-1"));
    expect(await screen.findByText("확인됨")).toBeTruthy();

    await userEvent.setup().click(screen.getByRole("button", { name: "인시던트로 승격" }));
    await waitFor(() => expect(promote).toHaveBeenCalledWith("ale-1"));
    expect(await screen.findByText("인시던트 연결됨")).toBeTruthy();
  });
});

function port(events: readonly AlertEvent[]): AlertEventsPort {
  return {
    list: async () => events,
    acknowledge: async () => { throw new Error("not used"); },
    promote: async () => { throw new Error("not used"); },
  };
}

function renderPage(alertEvents: AlertEventsPort) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter initialEntries={["/alerts"]}>
        <AlertEventsProvider port={alertEvents}>
          <AlertsPage />
        </AlertEventsProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}
