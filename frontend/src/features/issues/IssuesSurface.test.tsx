// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuesSurface } from "./IssuesSurface";
import type { IssuesPort } from "./issuesContract";
import { COPY, issuesPort, renderSurface } from "./IssuesSurface.testSupport";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
describe("IssuesSurface", () => {
  it("opens the canonical URL-selected issue after the list arrives", async () => {
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        initialIssueId="issue:workspace-1/correlation-1"
        port={issuesPort()}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    const issue = await screen.findByRole("button", { name: "Elevated response latency" });
    await screen.findByRole("region", { name: "Incident detail" });
    expect(issue.getAttribute("aria-current")).toBe("true");
  });

  it("refreshes the incident queue on the exact issues audit cadence only while visible", async () => {
    vi.useFakeTimers();
    const baseline = issuesPort();
    const listIssues = vi.fn().mockImplementation(baseline.listIssues);
    const loadIssuesAuditRefreshPolicy = vi.fn().mockResolvedValue({
      staleAfterSeconds: 30,
      refreshAfterSeconds: 7,
      keepLastSuccess: true as const,
      pauseWhenHidden: true as const,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={issuesPort({ listIssues, loadIssuesAuditRefreshPolicy })}
        recoverySelection={{ state: "enabled" }}
      />,
    );
    await act(async () => Promise.resolve());
    expect(listIssues).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(6_999));
    expect(listIssues).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(listIssues).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => vi.advanceTimersByTimeAsync(70_000));
    expect(listIssues).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(listIssues).toHaveBeenCalledTimes(3);
  });

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

  it("renders a verified two-tier severity without inventing one for unavailable data", async () => {
    const baseline = issuesPort();
    const initial = await baseline.listIssues("cluster-1");
    const port = issuesPort({
      listIssues: vi.fn().mockResolvedValue({
        ...initial,
        items: [
          { ...initial.items[0], severity: "critical" as const, severityAvailability: "available" as const },
          { ...initial.items[0], id: "issue:unavailable", correlationId: "unavailable", symptom: "No source tier", severity: null, severityAvailability: "unavailable" as const },
        ],
        returned: 2,
      }),
    });
    renderSurface(
      <IssuesSurface clusterId="cluster-1" copy={COPY} port={port} recoverySelection={{ state: "enabled" }} />,
    );

    expect(await screen.findByText("critical")).toBeTruthy();
    expect(screen.queryByText("warning")).toBeNull();
  });

  it("keeps the incident workspace on one surface without nested cards", async () => {
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        port={issuesPort()}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Elevated response latency" }));
    await screen.findByRole("tab", { name: /^Incident detail/u });
    await screen.findByText("Increase the memory limit after approval");

    const workspace = document.querySelector<HTMLElement>("[data-detail-layout]");
    expect(workspace).not.toBeNull();
    expect(workspace?.getAttribute("data-slot")).toBe("surface");
    expect(workspace?.querySelectorAll('[data-slot="card"]')).toHaveLength(0);
    expect(workspace?.querySelectorAll('[data-slot="surface"]')).toHaveLength(0);
  });

  it("shows exact matched counts and incomplete visibility without discarding the last result", async () => {
    const baseline = issuesPort();
    const initial = await baseline.listIssues("cluster-1");
    const listIssues = vi.fn().mockResolvedValue({
      ...initial,
      total: 1,
      totalMatched: 9,
      completeness: "partial",
      visibility: {
        state: "partial" as const,
        completeness: "partial" as const,
        authorizedClusterCount: 1,
        requestedNamespaces: ["cluster-1/payments"],
        reasonCodes: ["legacy_category_projection_incomplete"],
      },
    });
    renderSurface(
      <IssuesSurface
        clusterId="cluster-1"
        copy={COPY}
        filters={{
          namespaces: ["cluster-1/payments"],
          severities: ["critical"],
          categories: ["container_restart"],
        }}
        port={issuesPort({ listIssues })}
        recoverySelection={{ state: "enabled" }}
      />,
    );

    expect(await screen.findByText("1 of 9")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Limited issue visibility" })).toBeTruthy();
    expect(listIssues).toHaveBeenCalledWith(
      "cluster-1",
      50,
      expect.any(AbortSignal),
      {
        namespaces: ["cluster-1/payments"],
        severities: ["critical"],
        categories: ["container_restart"],
      },
    );
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
        total: 0,
        totalMatched: 0,
        returned: 0,
        filters: { namespaces: [], severities: [], categories: [] },
        visibility: {
          state: "complete",
          completeness: "exact",
          authorizedClusterCount: 1,
          requestedNamespaces: [],
          reasonCodes: [],
        },
        facets: { namespaces: [], severities: [], categories: [] },
        recentChanges: [],
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
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}
