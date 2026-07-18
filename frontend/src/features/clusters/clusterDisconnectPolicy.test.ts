import { describe, expect, it, vi } from "vitest";

import type { HomeClusterChoice } from "../home/homeContract";
import {
  activeClusterChoices,
  canOfferClusterDisconnect,
  refreshAfterClusterDisconnect,
} from "./clusterDisconnectPolicy";

const TARGET: HomeClusterChoice = {
  id: "target-1",
  workspaceId: "workspace-main",
  name: "Target",
  environment: "production",
  provider: "eks",
  connectionStage: "ready",
  registrationState: "active",
  connectionState: "online",
  lastObservedAt: null,
  nodeCount: null,
  podCount: null,
  incidentCount: null,
};

describe("cluster disconnect policy", () => {
  it("offers the destructive action only to a known service admin on a target cluster", () => {
    expect(canOfferClusterDisconnect(["service_admin"], TARGET)).toBe(true);
    expect(canOfferClusterDisconnect(undefined, TARGET)).toBe(false);
    expect(canOfferClusterDisconnect([], TARGET)).toBe(false);
    expect(canOfferClusterDisconnect(["service_admin"], {
      ...TARGET,
      environment: "management",
    })).toBe(false);
    expect(canOfferClusterDisconnect(["service_admin"], {
      ...TARGET,
      observationMode: "simulation",
    })).toBe(false);
  });

  it("removes soft-unregistered expired registrations from the active card list", () => {
    expect(activeClusterChoices([
      TARGET,
      { ...TARGET, id: "expired", registrationState: "expired" },
    ]).map((cluster) => cluster.id)).toEqual(["target-1"]);
  });

  it("removes a disconnected current scope before refreshing the real collection", () => {
    const toggleCluster = vi.fn();
    const refresh = vi.fn();
    refreshAfterClusterDisconnect({
      requestedClusterIds: ["target-1"],
      toggleCluster,
      refresh,
    }, "target-1");
    expect(toggleCluster).toHaveBeenCalledWith("target-1");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("leaves an unrelated scope intact while still refreshing", () => {
    const toggleCluster = vi.fn();
    const refresh = vi.fn();
    refreshAfterClusterDisconnect({
      requestedClusterIds: ["target-2"],
      toggleCluster,
      refresh,
    }, "target-1");
    expect(toggleCluster).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
