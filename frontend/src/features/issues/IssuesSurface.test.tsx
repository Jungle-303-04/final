// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesSurface } from "./IssuesSurface";
import { IssuesPortFailure, type IssuesPort } from "./issuesContract";
import { COPY, issuesPort, renderSurface } from "./IssuesSurface.testSupport";
afterEach(cleanup);
describe("IssuesSurface", () => {
  it("uses motion-safe refresh feedback while the incident list is loading", () => {
    const pending = deferred<Awaited<ReturnType<IssuesPort["listIssues"]>>>();
    const port = issuesPort({ listIssues: vi.fn(() => pending.promise) });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    const refresh = screen.getByRole("button", { name: COPY.refresh });
    expect(refresh.querySelector("svg")?.getAttribute("class")).toContain("motion-safe:animate-spin");
    expect(refresh.querySelector("svg")?.getAttribute("class")).not.toContain(" animate-spin");
  });

  it("keeps recovery selection feedback inside the shared reduced-motion-safe spinner", async () => {
    const pending = deferred<Awaited<ReturnType<IssuesPort["selectRecoveryAction"]>>>();
    const port = issuesPort({ selectRecoveryAction: vi.fn(() => pending.promise) });
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

    const pendingButton = (await screen.findByText(COPY.selectionPending)).closest("button");
    const spinner = pendingButton?.querySelector<HTMLElement>('[data-slot="spinner"]');
    expect(spinner?.classList.contains("motion-safe:animate-spin")).toBe(true);
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a compact healthy empty state with scoped next actions", async () => {
    const port = issuesPort({
      listIssues: vi.fn().mockResolvedValue({
        clusterId: "cluster-1",
        completeness: "complete",
        dataQualityWarnings: [],
        excludedCount: 0,
        items: [],
        limit: 50,
        limitReached: false,
        returned: 0,
      }),
    });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    expect(await screen.findByText("No incidents")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse resources" }).getAttribute("href"))
      .toBe("/resources?clusters=cluster-1");
    expect(screen.getByRole("link", { name: "Review alerts" }).getAttribute("href"))
      .toBe("/alerts?clusters=cluster-1");
  });
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
    expect((await screen.findAllByText("Memory pressure")).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole("tab", { name: /Evidence/u }));
    expect(await screen.findByText("Pod restart and OOMKilled events")).toBeTruthy();
    fireEvent.click(await screen.findByRole("tab", { name: /Audit timeline/u }));
    expect(await screen.findByText("incident.detected")).toBeTruthy();
    expect(await screen.findByText("Root event")).toBeTruthy();
    fireEvent.click(await screen.findByRole("tab", { name: /^Incident detail/u }));
    expect(await screen.findByText("Increase the memory limit after approval")).toBeTruthy();
    expect(await screen.findByText("AI-authored analysis")).toBeTruthy();
    expect(await screen.findByText("The Pod repeatedly restarted after exceeding its memory limit.")).toBeTruthy();
    expect(await screen.findByText("Monitor OOMKilled together with memory utilization.")).toBeTruthy();
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
  it("does not invent a narrative section when the backend has none", async () => {
    const baselinePort = issuesPort();
    const reportPage = await baselinePort.loadReports("correlation-1");
    const port = issuesPort({
      loadReports: vi.fn().mockResolvedValue({
        ...reportPage,
        items: reportPage.items.map((item) => ({
          ...item,
          narrative: null,
          narrativeStatus: "unavailable" as const,
        })),
      }),
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
    expect(await screen.findByText("Increase the memory limit after approval")).toBeTruthy();
    expect(screen.queryByText("AI-authored analysis")).toBeNull();
  });
  it("explains when the backend has not generated an RCA report yet", async () => {
    const port = issuesPort({
      loadReports: vi.fn().mockResolvedValue({
        correlationId: "correlation-1",
        items: [],
        limit: 50,
        offset: 0,
        hasMore: false,
        nextCursor: null,
      }),
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
    expect(await screen.findByText("Analysis is still being generated")).toBeTruthy();
  });
  it("shows concise localized evidence while preserving raw technical values as titles", async () => {
    const rawSummary = "entries=5, queries=color_turf_runtime_failures,node_collector_runtime_saturation";
    const port = issuesPort({
      loadEvidence: vi.fn().mockResolvedValue({
        correlationId: "correlation-1",
        items: [{
          id: "evidence:workspace-1/7",
          correlationId: "correlation-1",
          kind: "rca_bundle",
          clusterId: "cluster-1",
          evidenceRef: "object://evidence/correlation-1.json",
          summary: "cluster-1: kubernetes, metrics, logs, traces",
          sources: [{
            source: "logs",
            summary: rawSummary,
            schemaVersion: 1,
            collector: "cluster-agent",
            collectorVersion: "unknown",
            sourceVersion: "loki",
            queryVersion: null,
            collectedAt: null,
            evidenceKey: "logs",
            sourceId: null,
            agentId: "agent-1",
            windowStart: null,
          }],
          createdAt: null,
        }],
        limit: 50,
        offset: 0,
        hasMore: false,
        nextCursor: null,
      }),
    });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={{
          ...COPY,
          evidenceRecordLabel: () => "cluster-1 · Kubernetes 리소스 · 메트릭 · 로그 · 트레이스",
          evidenceKindLabel: () => "RCA 근거 묶음",
          evidenceSourceLabel: () => "로그",
          evidenceCollectorLabel: () => "클러스터 에이전트",
          evidenceSummaryLabel: () => "로그 5건 · 검색 조건 2개",
        }}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    fireEvent.click(await screen.findByRole("tab", { name: /Evidence/u }));
    expect(await screen.findByText("RCA 근거 묶음")).toBeTruthy();
    expect(screen.getByText("로그 5건 · 검색 조건 2개").getAttribute("title")).toBe(rawSummary);
    expect(screen.queryByText(rawSummary)).toBeNull();
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
    await waitFor(() => {
      expect(vi.mocked(port.loadRecoveryPlan).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(port.selectRecoveryAction).toHaveBeenCalledWith({
      correlationId: "correlation-1",
      planId: "plan-1",
      actionId: "increase-memory",
    }, expect.any(AbortSignal));
    expect(screen.getByText("selection_requested")).toBeTruthy();
    expect(screen.getByText("Approval received · waiting for agent dispatch")).toBeTruthy();
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
    expect((await screen.findAllByText("Memory pressure")).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole("tab", { name: /Evidence/u }));
    expect(await screen.findByText("Evidence unavailable")).toBeTruthy();
    fireEvent.click(await screen.findByRole("tab", { name: /^Incident detail/u }));
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
    fireEvent.click(await screen.findByRole("tab", { name: /Audit timeline/u }));
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}
