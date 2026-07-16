// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import type { ActivityNotificationsPort } from "./activityNotificationsContract";
import type { HeaderNotificationAttentionHandler } from "./headerNotificationAttention";
import {
  ActivityNotificationsProvider,
  useActivityNotifications,
} from "./ActivityNotificationsProvider";

const toastSpies = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("../../shared/ui/primitives/sonner", () => ({
  toast: toastSpies,
}));

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityNotificationsProvider", () => {
  it("stores completed workflow runs in the header and floats failed runs", async () => {
    const loadWorkflowEvents = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{
        eventId: "audit-failed",
        eventType: "workflow.run.failed" as const,
        message: "Readiness verification timed out.",
        createdAt: "2026-07-17T05:00:00Z",
        runId: "run-1",
        planId: "plan-1",
        planName: "payment-api",
        applicationIds: ["payment-api"],
        details: {},
      }, {
        eventId: "audit-completed",
        eventType: "workflow.run.completed" as const,
        message: "Workflow run completed.",
        createdAt: "2026-07-17T05:01:00Z",
        runId: "run-2",
        planId: "plan-2",
        planName: "catalog-api",
        applicationIds: ["catalog-api"],
        details: {},
      }]);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    renderProvider({
      loadIncidentEvents: async () => [],
      loadSafePrEvents: async () => [],
      loadWorkflowEvents,
    });

    await waitFor(() => expect(loadWorkflowEvents).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(screen.getByTestId("activity-state").textContent)
      .toContain("workflow:failed:1"));
    expect(screen.getByTestId("activity-state").textContent).toContain("workflow:succeeded:1");
    expect(toastSpies.error).toHaveBeenCalledWith(
      expect.stringContaining("payment-api"),
      expect.objectContaining({ duration: 5_000, id: "workflow:audit-failed" }),
    );
    expect(toastSpies.success).not.toHaveBeenCalled();
  });

  it("updates one incident analysis notification through the audit timeline", async () => {
    const loadIncidentEvents = vi.fn().mockResolvedValue([{
      eventId: "evt-ready",
      subject: "recovery.planned",
      createdAt: "2026-07-16T05:00:00Z",
      payloadSummary: {},
    }]);
    renderProvider({
      loadIncidentEvents,
      loadSafePrEvents: async () => [],
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "incident" }));

    await waitFor(() => expect(loadIncidentEvents).toHaveBeenCalledWith(
      "correlation-1",
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(screen.getByTestId("activity-state").textContent)
      .toContain("incident-analysis:succeeded:3"));
    expect(toastSpies.loading).toHaveBeenCalledTimes(1);
    expect(toastSpies.success).toHaveBeenCalledWith(
      expect.stringContaining("payment-api"),
      expect.objectContaining({ id: "incident-analysis:correlation-1", duration: 5_000 }),
    );
  });

  it("tracks Safe PR creation as one four-step notification", async () => {
    const loadSafePrEvents = vi.fn().mockResolvedValue([{
      eventId: "audit-created",
      eventType: "safe_pr.created",
      message: "created",
      createdAt: "2026-07-16T05:01:00Z",
      details: { pr_number: 128 },
    }]);
    renderProvider({
      loadIncidentEvents: async () => [],
      loadSafePrEvents,
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "safe-pr" }));

    await waitFor(() => expect(loadSafePrEvents).toHaveBeenCalledWith(
      "correlation-2",
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(screen.getByTestId("activity-state").textContent)
      .toContain("safe-pr:succeeded:4"));
    expect(toastSpies.success).toHaveBeenCalledWith(
      expect.stringContaining("payment-api"),
      expect.objectContaining({ duration: 5_000 }),
    );
  });

  it("keeps AI progress inside the panel until the panel is closed", async () => {
    renderProvider({
      loadIncidentEvents: async () => [],
      loadSafePrEvents: async () => [],
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "ai-start" }));
    expect(toastSpies.loading).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "ai-close" }));
    expect(toastSpies.loading).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ duration: Infinity }),
    );

    await user.click(screen.getByRole("button", { name: "ai-complete" }));
    expect(toastSpies.success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ duration: 5_000 }),
    );
    expect(screen.getByTestId("activity-state").textContent).toContain("ai:succeeded:1");
  });

  it("keeps background progress in the header while floating notifications are suppressed", async () => {
    const onSuppressedNotification = vi.fn();
    renderProvider({
      loadIncidentEvents: async () => [],
      loadSafePrEvents: async () => [],
    }, {
      onSuppressedNotification,
      suppressFloatingNotifications: true,
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "incident" }));

    expect(onSuppressedNotification).toHaveBeenCalledWith(expect.objectContaining({
      id: "incident-analysis:correlation-1",
      tone: "progress",
    }));
    expect(toastSpies.loading).not.toHaveBeenCalled();
  });
});

function ActivityProbe() {
  const activity = useActivityNotifications();
  const aiId = activity.activities.find((item) => item.kind === "ai")?.id;
  return (
    <div>
      <button
        onClick={() => activity.beginIncidentAnalysis({
          correlationId: "correlation-1",
          href: "/issues/incident-1",
          target: "payment-api",
        })}
        type="button"
      >
        incident
      </button>
      <button
        onClick={() => {
          const id = activity.beginSafePr({ href: "/gitops", target: "payment-api" });
          activity.observeSafePr(id, "correlation-2", "workflow-1");
        }}
        type="button"
      >
        safe-pr
      </button>
      <button onClick={() => activity.beginAi("왜 장애가 발생했어?")} type="button">
        ai-start
      </button>
      <button
        disabled={!aiId}
        onClick={() => aiId && activity.setActivityMuted(aiId, false)}
        type="button"
      >
        ai-close
      </button>
      <button
        disabled={!aiId}
        onClick={() => aiId && activity.completeAi(aiId)}
        type="button"
      >
        ai-complete
      </button>
      <output data-testid="activity-state">
        {activity.activities.map((item) => (
          `${item.kind}:${item.status}:${item.currentStep}`
        )).join("|")}
      </output>
    </div>
  );
}

function renderProvider(
  port: ActivityNotificationsPort,
  options: {
    onSuppressedNotification?: HeaderNotificationAttentionHandler;
    suppressFloatingNotifications?: boolean;
  } = {},
) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter>
        <ActivityNotificationsProvider port={port} storageScope="test" {...options}>
          <ActivityProbe />
        </ActivityNotificationsProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}
