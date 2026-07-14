// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesPortFailure, type IssueAuditTimelinePage } from "./issuesContract";
import { IssueAuditTimelinePanel } from "./IssueAuditTimelinePanel";
import { COPY } from "./IssuesSurface.testSupport";

afterEach(cleanup);

const PAGE: IssueAuditTimelinePage = {
  correlationId: "correlation-1",
  items: [
    {
      subject: "incident.detected",
      source: "dashboard-projection",
      createdAt: "2026-07-13T01:10:00Z",
      causationId: null,
      payloadSummary: {
        incident_id: "incident-1",
        snapshot: { attempt: 2, ready: false },
      },
    },
    {
      subject: "rca.completed",
      source: "rca-worker",
      createdAt: "2026-07-13T01:30:00Z",
      causationId: "event-parent-1",
      payloadSummary: {},
    },
  ],
  limit: 2,
  hasMore: true,
  nextCursor: "audit-cursor-2",
};

describe("IssueAuditTimelinePanel", () => {
  it("keeps root and causation facts while expanding serialized payload details", async () => {
    const user = userEvent.setup();
    render(
      <IssueAuditTimelinePanel
        copy={COPY}
        onLoadMore={vi.fn()}
        state={{ data: PAGE, failure: null, loading: false }}
      />,
    );

    expect(screen.getByText("Root event")).toBeTruthy();
    expect(screen.getByText("Caused by event-parent-1")).toBeTruthy();

    const payloadTrigger = screen.getByRole("button", { name: "Payload summary" });
    expect(payloadTrigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(payloadTrigger);

    expect(payloadTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("incident_id")).toBeTruthy();
    expect(screen.getByText("incident-1")).toBeTruthy();
    expect(screen.getByText("snapshot")).toBeTruthy();
    expect(screen.getByText('{"attempt":2,"ready":false}')).toBeTruthy();
  });

  it("disables pagination while a next page is loading and preserves the cursor-backed page", () => {
    const onLoadMore = vi.fn();
    render(
      <IssueAuditTimelinePanel
        copy={COPY}
        onLoadMore={onLoadMore}
        state={{ data: PAGE, failure: null, loading: true }}
      />,
    );

    const button = screen.getByRole("button", { name: "Loading more events" });
    expect(button.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(button);
    expect(onLoadMore).not.toHaveBeenCalled();
    expect(screen.getByText("incident.detected")).toBeTruthy();
    expect(screen.getByText("rca.completed")).toBeTruthy();
  });

  it("shows a refresh failure without removing the last successful audit page", () => {
    render(
      <IssueAuditTimelinePanel
        copy={COPY}
        onLoadMore={vi.fn()}
        state={{
          data: PAGE,
          failure: new IssuesPortFailure("offline"),
          loading: false,
        }}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Audit timeline unavailable")).toBeTruthy();
    expect(screen.getByText("offline")).toBeTruthy();
    expect(screen.getByText("incident.detected")).toBeTruthy();
    expect(screen.getByText("rca.completed")).toBeTruthy();
  });
});
