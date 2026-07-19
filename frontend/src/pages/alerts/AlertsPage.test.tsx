// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AlertChannelInput,
  AlertChannelsPort,
} from "../../features/alerts/alertChannelsContract";
import { AlertEventsProvider } from "../../features/alerts/AlertEventsProvider";
import type { AlertEvent, AlertEventsPort } from "../../features/alerts/alertEventsContract";
import { EMPTY_ALERT_RULES_PORT } from "../../features/alerts/alertRulesContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { AlertsPage } from "./AlertsPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AlertsPage", () => {
  it("renders the compact demo-v3 event grammar and lands a row on its real resource", async () => {
    renderPage(eventsPort([EVENT]));

    expect(await screen.findByText("redis-0 · redis restart threshold")).toBeTruthy();
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText("최근")).toBeTruthy();
    expect(screen.getByRole("region", { name: "알림 발생 목록" })).toBeTruthy();

    await userEvent.setup().click(screen.getByRole("button", {
      name: /장애 · redis-0 · redis restart threshold · 이슈/u,
    }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toContain(
      "/resources?clusters=prod&resources.types=pod&detail=Pod%2Fplatform%2Fredis-0",
    ));
  });

  it("preserves acknowledgement, rule management, and channel delivery testing", async () => {
    const acknowledge = vi.fn(async () => ({
      ...EVENT,
      acknowledged_at: "2026-07-19T02:01:00Z",
      acknowledged_by: "operator",
      status: "acked" as const,
    }));
    const test = vi.fn(async () => ({ delivered: true, detail: "ok", statusCode: 204, valid: true }));
    const remove = vi.fn(async () => undefined);
    const savedChannel = {
      enabled: true,
      id: "channel-1",
      kind: "webhook",
      lastTestDetail: "ok",
      lastTestStatus: "passed",
      lastTestStatusCode: 204,
      lastTestedAt: "2026-07-19T01:00:00Z",
      minimumSeverity: "critical" as const,
      name: "SRE webhook",
      url: "https://hooks.example/private/path",
    };
    const save = vi.fn(async (input: AlertChannelInput) => ({ ...savedChannel, ...input, id: input.id ?? "channel-2" }));
    const channels: AlertChannelsPort = {
      list: async () => [savedChannel],
      remove,
      save,
      test,
    };
    renderPage({ ...eventsPort([EVENT]), acknowledge }, channels);

    await userEvent.setup().click(await screen.findByRole("button", { name: /알림 작업/u }));
    await userEvent.setup().click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith("ale-1"));

    await userEvent.setup().click(screen.getByRole("tab", { name: "채널" }));
    expect(await screen.findByText("SRE webhook")).toBeTruthy();
    expect(screen.getByText("https://hooks.example/•••")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "테스트 알림 전송" }));
    await waitFor(() => expect(test).toHaveBeenCalledWith(expect.objectContaining({ id: "channel-1" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "채널 수정" }).hasAttribute("disabled")).toBe(false));

    await userEvent.setup().click(screen.getByRole("button", { name: "채널 수정" }));
    await userEvent.setup().clear(screen.getByLabelText("채널 이름"));
    await userEvent.setup().type(screen.getByLabelText("채널 이름"), "Platform webhook");
    await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      id: "channel-1",
      name: "Platform webhook",
    })));

    await userEvent.setup().click(screen.getByRole("button", { name: "채널 삭제" }));
    const confirm = screen.getByRole("dialog", { name: "알림 채널 삭제" });
    await userEvent.setup().click(within(confirm).getByRole("button", { name: "채널 삭제" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("channel-1"));
  });
});

const EVENT: AlertEvent = {
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

function eventsPort(events: readonly AlertEvent[]): AlertEventsPort {
  return {
    acknowledge: async () => { throw new Error("not used"); },
    list: async () => events,
    promote: async () => { throw new Error("not used"); },
  };
}

function renderPage(alertEvents: AlertEventsPort, channels?: AlertChannelsPort) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter initialEntries={["/alerts"]}>
        <UnifiedFilterProvider>
          <AlertEventsProvider port={alertEvents}>
            <AlertsPage channelsPort={channels} rulesPort={EMPTY_ALERT_RULES_PORT} />
            <LocationProbe />
          </AlertEventsProvider>
        </UnifiedFilterProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}
