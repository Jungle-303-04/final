// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChecksPortFailure, type ChecksPort } from "../../features/checks/checksContract";
import { ChecksPage } from "./ChecksPage";

const scopeState = vi.hoisted(() => ({ value: null as unknown }));
const filterState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../features/cluster-scope/ClusterScopeProvider", () => ({
  useClusterScope: () => scopeState.value,
}));
vi.mock("../../features/filters/UnifiedFilterProvider", () => ({
  useUnifiedFilter: () => filterState.value,
}));

afterEach(() => cleanup());

beforeEach(() => {
  scopeState.value = { selection: { kind: "selected", cluster: { id: "cluster-a" } } };
  filterState.value = {
    detail: { detail: null },
    state: { common: { namespaces: [{ clusterId: "cluster-a", namespace: "storefront" }] } },
  };
});

describe("ChecksPage", () => {
  it("does not query an unbounded scope while authority is resolving", () => {
    scopeState.value = { selection: { kind: "resolving", requestedIds: [] } };
    const port = checksPort();

    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(port.getOverview).not.toHaveBeenCalled();
  });

  it("shows a partial scope and explicit unavailable result rather than a clean score or zero findings", async () => {
    const port = checksPort();
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Checks" })).toBeTruthy();
    expect(screen.getByText("Check findings are unavailable until an agent-backed evaluation collector is integrated.")).toBeTruthy();
    expect(screen.getAllByText("checks_result_projection_not_integrated").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).toBeNull();
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/storefront"],
    }, expect.any(AbortSignal)));
  });

  it("resolves a direct check detail URL as unavailable without rendering fabricated finding details", async () => {
    filterState.value = {
      detail: { detail: "check:workload-limits" },
      state: { common: { namespaces: [] } },
    };
    const port = checksPort();
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(await screen.findByText("This requested check cannot be resolved until the catalog and result collector are integrated.")).toBeTruthy();
    await waitFor(() => expect(port.getDetail).toHaveBeenCalledWith(
      "workload-limits",
      { clusterIds: ["cluster-a"], namespaces: [] },
      expect.any(AbortSignal),
    ));
  });

  it("renders a forbidden state when the bound contract denies the read", async () => {
    const port = checksPort();
    port.getOverview.mockRejectedValue(new ChecksPortFailure("forbidden"));
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(await screen.findByText("You cannot access this scope")).toBeTruthy();
  });
});

function checksPort(): ChecksPort & {
  getOverview: ReturnType<typeof vi.fn>;
  getDetail: ReturnType<typeof vi.fn>;
} {
  return {
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "partial",
        scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["storefront"], freshness: "partial" }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: ["agent_snapshot_truncated"],
      },
      resultSet: {
        availability: "unavailable",
        evaluatedAt: null,
        checks: null,
        totalCheckCount: null,
        totalFindingCount: null,
        reasonCodes: ["checks_result_projection_not_integrated"],
      },
      catalog: { availability: "unavailable", entries: null, reasonCodes: ["checks_catalog_not_integrated"] },
    }),
    getDetail: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "available",
        scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: [], freshness: "live" }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [],
      },
      detail: {
        requestedCheckId: "workload-limits",
        availability: "unavailable",
        title: null,
        category: null,
        effectiveSeverity: null,
        message: null,
        remediation: null,
        affectedResourceCount: null,
        findings: null,
        reasonCodes: ["checks_catalog_not_integrated", "checks_result_projection_not_integrated"],
      },
    }),
  };
}
