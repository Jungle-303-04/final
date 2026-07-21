// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listClustersMock = vi.hoisted(() => vi.fn());

vi.mock("../api/clusters", () => ({ listClusters: listClustersMock }));

import { DevpreviewContractProvider, useDevpreviewContracts } from "./contracts";

const CLUSTER = {
  workspace_id: "workspace-1",
  cluster_id: "cluster-1",
  name: "cluster-1",
  environment: "production",
  provider: "eks",
  observation_mode: "agent",
  status: "registered",
  settings: {
    name: "Production",
    cluster_role: "target",
    provider_config: { eks_cluster_name: "cluster-1" },
  },
  connection_status: "online",
  connection_stage: "ready",
  last_agent_id: "agent-1",
  last_agent_seen_at: "2026-07-21T00:00:00.000Z",
  node_count: 3,
  pod_count: 36,
  namespace_count: 12,
  kubernetes_version: "v1.32.0-eks",
  crd_discovery_status: "exact",
  incident_count: 0,
  server_count: null,
  app_count: null,
  open_incidents: 0,
  last_seen_at: "2026-07-21T00:00:00.000Z",
  created_at: "2026-07-21T00:00:00.000Z",
  updated_at: "2026-07-21T00:00:00.000Z",
};

function ContractProbe() {
  const state = useDevpreviewContracts();
  return (
    <output data-testid="contract-state">
      {state.status}:{state.workspaceId}:{state.clusters[0]?.displayName ?? "none"}
    </output>
  );
}

describe("DevpreviewContractProvider cluster boundary", () => {
  beforeEach(() => {
    listClustersMock.mockReset();
  });

  it("preserves the canonical options, projection, and unmount abort contract", async () => {
    listClustersMock.mockResolvedValue({ clusters: [CLUSTER] });

    const rendered = render(
      <DevpreviewContractProvider>
        <ContractProbe />
      </DevpreviewContractProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("contract-state").textContent)
        .toBe("ready:workspace-1:cluster-1");
    });

    expect(listClustersMock).toHaveBeenCalledOnce();
    expect(listClustersMock).toHaveBeenCalledWith({}, expect.any(AbortSignal));
    const signal = listClustersMock.mock.calls[0]?.[1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    rendered.unmount();

    expect(signal.aborted).toBe(true);
  });
});
