// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesSurface } from "./IssuesSurface";
import { IssuesPortFailure } from "./issuesContract";
import { COPY, issuesPort, renderSurface } from "./IssuesSurface.testSupport";
afterEach(cleanup);
describe("IssuesSurface", () => {
  it("exposes selection semantics and moves focus to the controlled detail region", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    const issue = await screen.findByRole("button", { name: "Elevated response latency" });
    expect(issue.getAttribute("aria-current")).toBeNull();
    expect(issue.getAttribute("aria-controls")).toBeNull();

    fireEvent.click(issue);

    const detail = await screen.findByRole("region", { name: "Incident detail" });
    const controlledId = issue.getAttribute("aria-controls");
    expect(controlledId).not.toBeNull();
    expect(detail.id).toBe(controlledId);
    expect(issue.getAttribute("aria-current")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(detail));

    issue.focus();
    expect(document.activeElement).toBe(issue);
    fireEvent.click(issue);
    await waitFor(() => expect(document.activeElement).toBe(detail));
  });
  it("opens at 480px, expands without a second sheet, and closes back to the list", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    expect(document.querySelector('[data-detail-layout="peek"]')).toBeTruthy();
    expect(screen.getByRole("region", { name: "Incidents" })).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "Open incident detail full screen" }));
    expect(document.querySelector('[data-detail-layout="full"]')).toBeTruthy();
    expect(screen.getByRole("region", { name: "Incidents" }).className).toContain("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Show incident list and detail" }));
    expect(document.querySelector('[data-detail-layout="peek"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close incident detail" }));
    expect(document.querySelector('[data-detail-layout="closed"]')).toBeTruthy();
  });

  it("keeps incident, evidence, analysis, and recovery loads independently observable", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    expect(await screen.findAllByText("Memory pressure")).toHaveLength(2);
    expect(await screen.findByText("Pod restart and OOMKilled events")).toBeTruthy();
    expect(await screen.findByText("incident.detected")).toBeTruthy();
    expect(await screen.findByText("Root event")).toBeTruthy();
    expect(await screen.findByText("Increase the memory limit after approval")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Increase memory limit" })).toBeTruthy();
    expect(port.loadIssue).toHaveBeenCalledWith("incident-1", "cluster-1", expect.any(AbortSignal));
    expect(port.loadEvidence).toHaveBeenCalledWith(
      "correlation-1",
      {},
      expect.any(AbortSignal),
    );
    expect(port.loadReports).toHaveBeenCalledWith(
      "correlation-1",
      {},
      expect.any(AbortSignal),
    );
    expect(port.loadAuditTimeline).toHaveBeenCalledWith(
      "correlation-1",
      {},
      expect.any(AbortSignal),
    );
    expect(port.loadRecoveryPlan).toHaveBeenCalledWith(
      "correlation-1",
      expect.any(AbortSignal),
    );
  });
  it("shows a receipt then refreshes from the server without optimistic selection", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    fireEvent.click(await screen.findByRole("button", { name: "Increase memory limit" }));
    expect(await screen.findByText("Selection received · event-1")).toBeTruthy();
    await waitFor(() => expect(port.loadRecoveryPlan).toHaveBeenCalledTimes(2));
    expect(port.selectRecoveryAction).toHaveBeenCalledWith({
      correlationId: "correlation-1",
      planId: "plan-1",
      actionId: "increase-memory",
    }, expect.any(AbortSignal));
    expect(screen.getByText("selection_requested")).toBeTruthy();
  });
  it("renders a section failure without removing successful incident content", async () => {
    const port = issuesPort({
      loadEvidence: vi.fn().mockRejectedValue(new IssuesPortFailure("forbidden")),
    });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    expect(await screen.findAllByText("Memory pressure")).toHaveLength(2);
    expect(await screen.findByText("Evidence unavailable")).toBeTruthy();
    expect(await screen.findByText("Increase the memory limit after approval")).toBeTruthy();
  });
  it("appends the next audit page in server order", async () => {
    const loadAuditTimeline = vi.fn()
      .mockResolvedValueOnce({
        correlationId: "correlation-1",
        items: [{
          subject: "incident.detected",
          source: "dashboard-projection",
          createdAt: "2026-07-13T01:10:00Z",
          causationId: null,
          payloadSummary: {},
        }],
        limit: 1,
        hasMore: true,
        nextCursor: "audit-cursor-2",
      })
      .mockResolvedValueOnce({
        correlationId: "correlation-1",
        items: [{
          subject: "rca.completed",
          source: "rca-worker",
          createdAt: "2026-07-13T01:30:00Z",
          causationId: "event-parent-1",
          payloadSummary: {},
        }],
        limit: 1,
        hasMore: false,
        nextCursor: null,
      });
    const port = issuesPort({ loadAuditTimeline });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more events" }));
    await screen.findByText("rca.completed");

    const subjects = screen.getAllByTestId("audit-event-subject").map((node) => node.textContent);
    expect(subjects).toEqual(["incident.detected", "rca.completed"]);
    expect(loadAuditTimeline).toHaveBeenNthCalledWith(2, "correlation-1", {
      cursor: "audit-cursor-2",
      limit: 1,
    }, expect.any(AbortSignal));
  });
  it("disables recovery mutation when capability is not allowed", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "disabled", reason: "Read-only target" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    const action = await screen.findByRole("button", { name: "Increase memory limit" });
    expect(action.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Read-only target")).toBeTruthy();
    expect(port.selectRecoveryAction).not.toHaveBeenCalled();
  });
  it("hides a recovery mutation that is not meaningful for the target", async () => {
    const port = issuesPort();
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "hidden" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    await screen.findByText("selection_requested");
    expect(screen.queryByRole("button", { name: "Increase memory limit" })).toBeNull();
    expect(port.selectRecoveryAction).not.toHaveBeenCalled();
  });
});
