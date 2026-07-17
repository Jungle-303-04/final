// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChecksPortFailure, type ChecksPort } from "../../features/checks/checksContract";
import { HomePortFailure } from "../../features/home/homeContract";
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

  it("shows safe availability copy rather than internal reason codes, clean scores, or zero findings", async () => {
    const port = checksPort();
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Checks" })).toBeTruthy();
    expect(screen.getByText("Check findings are unavailable until an agent-backed evaluation collector is integrated.")).toBeTruthy();
    expect(screen.getByText("Some selected inventory snapshots are incomplete.")).toBeTruthy();
    expect(screen.queryByText("agent_snapshot_truncated")).toBeNull();
    expect(screen.queryByText("checks_result_projection_not_integrated")).toBeNull();
    expect(screen.queryByText("checks_catalog_not_integrated")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    await waitFor(() => expect(port.getOverview).toHaveBeenCalledWith({
      clusterIds: ["cluster-a"],
      namespaces: ["cluster-a/storefront"],
    }, expect.any(AbortSignal)));
  });

  it("renders namespace-scoped findings and collector visibility reported by the agent", async () => {
    const port = checksPort();
    port.getOverview.mockResolvedValueOnce(observedOverview());

    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(await screen.findByText("Container limits are not observed.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Deployment/checkout" }).getAttribute("href")).toBe(
      "/resources?clusters=cluster-a&resources.types=deployment&detail=Deployment%2Fstorefront%2Fcheckout",
    );
    expect(screen.getByText("Workload limits")).toBeTruthy();
    expect(screen.getByText("cluster-a · storefront")).toBeTruthy();
    expect(screen.getByText("Optional kinds not observed: Gateway")).toBeTruthy();
    expect(screen.queryByText(CHECKS_RESULT_INTERNAL_REASON)).toBeNull();
  });

  it("resolves a direct check detail URL as unavailable without rendering fabricated finding details", async () => {
    filterState.value = {
      detail: { detail: "check:workload-limits" },
      state: { common: { namespaces: [] } },
    };
    const port = checksPort();
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect(await screen.findByText("This requested check cannot be resolved until the catalog and result collector are integrated.")).toBeTruthy();
    expect(screen.queryByText("checks_catalog_not_integrated")).toBeNull();
    expect(screen.queryByText("checks_result_projection_not_integrated")).toBeNull();
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

  it("uses generic safe copy for an unknown availability reason", async () => {
    const port = checksPort({ scopeReasons: ["internal_probe:secret-cluster"] });
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    expect((await screen.findAllByText("Some scope evidence is unavailable.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("internal_probe:secret-cluster")).toBeNull();
  });

  it("does not expose scope failure codes or requested cluster IDs", async () => {
    scopeState.value = { selection: { kind: "unavailable", failure: new HomePortFailure("offline") } };
    const unavailablePort = checksPort();
    render(<MemoryRouter><ChecksPage port={unavailablePort} /></MemoryRouter>);

    expect(await screen.findByText("The selected cluster scope cannot be resolved.")).toBeTruthy();
    expect(screen.queryByText("offline")).toBeNull();
    expect(unavailablePort.getOverview).not.toHaveBeenCalled();

    cleanup();
    scopeState.value = { selection: { kind: "unknown", requestedId: "cluster-private" } };
    const unknownPort = checksPort();
    render(<MemoryRouter><ChecksPage port={unknownPort} /></MemoryRouter>);

    expect(await screen.findByText("The selected cluster scope cannot be resolved.")).toBeTruthy();
    expect(screen.queryByText("cluster-private")).toBeNull();
    expect(unknownPort.getOverview).not.toHaveBeenCalled();
  });

  it("loads revisioned settings on demand and refreshes overview after an audited save", async () => {
    const port = checksPort();
    port.getOverview.mockResolvedValue(observedOverview());
    render(<MemoryRouter><ChecksPage port={port} /></MemoryRouter>);

    await screen.findByText("Container limits are not observed.");
    fireEvent.click(screen.getByRole("button", { name: "Checks settings" }));
    expect(await screen.findByRole("heading", { name: "Checks settings" })).toBeTruthy();
    expect(port.getSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Workload limits/ }));
    fireEvent.change(screen.getByPlaceholderText("cluster-id/namespace"), {
      target: { value: "cluster-a/storefront" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(port.updateSettings).toHaveBeenCalledWith({
      hiddenCheckIds: ["workload-limits"],
      hiddenCategories: [],
      hiddenNamespaces: ["cluster-a/storefront"],
    }, 4));
    await waitFor(() => expect(port.getOverview.mock.calls.length).toBeGreaterThan(1));
  });
});

function checksPort(options: { scopeReasons?: readonly string[] } = {}): ChecksPort & {
  getOverview: ReturnType<typeof vi.fn>;
  getDetail: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
} {
  return {
    loadRefreshPolicy: vi.fn().mockResolvedValue(refreshPolicy()),
    getOverview: vi.fn().mockResolvedValue({
      scopeCoverage: {
        availability: "partial",
        scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["storefront"], freshness: "partial" }],
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: options.scopeReasons ?? ["agent_snapshot_truncated"],
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
      visibility: { availability: "unavailable", clusters: [], reasonCodes: ["checks_visibility_not_observed"] },
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
    getSettings: vi.fn().mockResolvedValue({
      workspaceId: "workspace-a",
      userId: "user-a",
      policy: { hiddenCheckIds: [], hiddenCategories: [], hiddenNamespaces: [] },
      revision: 4,
      invalidationGeneration: 7,
      canEdit: true,
      updatedAt: "2026-07-17T10:00:00Z",
    }),
    updateSettings: vi.fn().mockResolvedValue({
      workspaceId: "workspace-a",
      userId: "user-a",
      policy: { hiddenCheckIds: ["workload-limits"], hiddenCategories: [], hiddenNamespaces: [] },
      revision: 5,
      invalidationGeneration: 8,
      canEdit: true,
      updatedAt: "2026-07-17T10:01:00Z",
      eventId: "event-5",
      auditEventId: "event-5",
    }),
  };
}

const CHECKS_RESULT_INTERNAL_REASON = "checks_observation_partial:cluster-a";

function observedOverview() {
  return {
    scopeCoverage: {
      availability: "available" as const,
      scopes: [{ workspaceId: "workspace-a", clusterId: "cluster-a", namespaces: ["storefront"], freshness: "live" as const }],
      observedAt: "2026-07-17T05:59:30+00:00",
      reasonCodes: [],
    },
    resultSet: {
      availability: "available" as const,
      evaluatedAt: "2026-07-17T05:59:30+00:00",
      checks: [finding()],
      totalCheckCount: 1,
      totalFindingCount: 1,
      reasonCodes: [],
    },
    catalog: {
      availability: "available" as const,
      entries: [{
        checkId: "workload-limits",
        title: "Workload limits",
        category: "resources",
        severity: "warning" as const,
        description: "Checks container resource limits.",
        remediation: "Set explicit resource limits.",
      }],
      reasonCodes: [],
    },
    visibility: {
      availability: "available" as const,
      clusters: [{
        clusterId: "cluster-a",
        state: "limited" as const,
        namespaceScope: ["storefront"],
        core: { deployments: "allowed" as const },
        missingOptionalKinds: ["Gateway"],
      }],
      reasonCodes: [],
    },
  };
}

function finding() {
  return {
    findingId: "finding-a",
    clusterId: "cluster-a",
    checkId: "workload-limits",
    category: "resources",
    severity: "warning" as const,
    message: "Container limits are not observed.",
    resource: {
      apiGroup: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "storefront",
      name: "checkout",
      uid: "uid-checkout",
    },
  };
}

function refreshPolicy() {
  return {
    staleAfterSeconds: 30,
    refreshAfterSeconds: 60,
    keepLastSuccess: true as const,
    pauseWhenHidden: true as const,
    eventInvalidation: false,
    retryAfterSeconds: null,
    retryLimit: null,
    postMutationRefreshAfterSeconds: null,
  };
}
