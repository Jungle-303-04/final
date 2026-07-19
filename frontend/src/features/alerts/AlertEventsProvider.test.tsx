// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import { I18nProvider, useI18n } from "../../shared/i18n";
import { toast } from "../../shared/ui/primitives/sonner";
import type { AlertEventsPort } from "./alertEventsContract";
import { AlertEventsProvider } from "./AlertEventsProvider";

afterEach(() => cleanup());

describe("AlertEventsProvider locale lifecycle", () => {
  it("keeps one polling session when the user changes locale", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const port = {
      list,
      acknowledge: vi.fn(),
      promote: vi.fn(),
    } as AlertEventsPort;

    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter>
          <AlertEventsProvider port={port}>
            <LocaleProbe />
          </AlertEventsProvider>
        </MemoryRouter>
      </I18nProvider>,
    );

    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "locale-probe" }));
    await waitFor(() => expect(screen.getByText("en")).toBeTruthy());
    await Promise.resolve();

    expect(list).toHaveBeenCalledTimes(1);
  });

  it("toasts one critical event id once and lands on its canonical resource detail", async () => {
    const warning = vi.spyOn(toast, "warning");
    const list = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue(criticalAndWarningEvents());
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <MemoryRouter>
          <AlertEventsProvider port={{
            list,
            acknowledge: vi.fn(),
            promote: vi.fn(),
          }}>
            <LocationProbe />
          </AlertEventsProvider>
        </MemoryRouter>
      </I18nProvider>,
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));

    const action = warning.mock.calls[0]?.[1]?.action;
    if (typeof action !== "object" || action === null || !("onClick" in action)) {
      throw new Error("Expected the critical alert toast to expose its detail action.");
    }
    action.onClick?.({} as never);
    const location = await screen.findByTestId("alert-location");
    await waitFor(() => expect(location.textContent).toBe(
      "/resources?clusters=cluster-2&resources.types=pod&detail=Pod%2Fsandbox%2Farena-0",
    ));
    const readsBeforeRepeat = list.mock.calls.length;
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(readsBeforeRepeat));
    expect(warning).toHaveBeenCalledTimes(1);
  });
});

function LocaleProbe() {
  const { locale, setLocale } = useI18n();
  return (
    <button aria-label="locale-probe" onClick={() => setLocale("en")} type="button">
      {locale}
    </button>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="alert-location">{`${location.pathname}${location.search}`}</output>;
}

function criticalAndWarningEvents() {
  const event = {
    event_id: "critical-1",
    rule_id: "rule-1",
    rule_name: "Pod CPU critical",
    source: "opsia" as const,
    severity: "critical" as const,
    subject: { cluster: "cluster-2", namespace: "sandbox", kind: "Pod", name: "arena-0" },
    fired_at: "2026-07-19T00:00:00Z",
    resolved_at: null,
    status: "firing" as const,
    observed_value: 95,
    threshold: 90,
    evidence: [],
    incident_id: null,
    acknowledged_at: null,
    acknowledged_by: null,
    promoted_at: null,
    promoted_by: null,
  };
  return [
    event,
    { ...event },
    { ...event, event_id: "warning-1", severity: "warning" as const },
  ];
}
