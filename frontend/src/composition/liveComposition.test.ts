import { describe, expect, it, vi } from "vitest";

import { HttpTopologyHierarchyGateway } from "../features/topology/adapters/HttpTopologyHierarchyGateway";
import {
  createLiveTopologyGateway,
  resolveLiveTopologyConfig,
} from "./liveComposition";

describe("live topology composition", () => {
  it("reports every missing required public runtime variable", () => {
    expect(resolveLiveTopologyConfig({})).toEqual({
      state: "unconfigured",
      missing: [
        "VITE_TOPOLOGY_API_BASE_URL",
        "VITE_TOPOLOGY_WORKSPACE_ID",
      ],
    });
  });

  it("rejects unknown browser credential modes", () => {
    expect(
      resolveLiveTopologyConfig({
        VITE_TOPOLOGY_API_BASE_URL: "/",
        VITE_TOPOLOGY_WORKSPACE_ID: "workspace-1",
        VITE_TOPOLOGY_API_CREDENTIALS: "sometimes",
      }),
    ).toEqual({
      state: "invalid",
      reason:
        "VITE_TOPOLOGY_API_CREDENTIALS must be omit, same-origin, or include",
    });
  });

  it("constructs only the HTTP live adapter when configuration is complete", () => {
    const result = createLiveTopologyGateway(
      { fetchImpl: vi.fn<typeof fetch>() },
      {
        VITE_TOPOLOGY_API_BASE_URL: "https://api.example.test",
        VITE_TOPOLOGY_WORKSPACE_ID: "workspace-1",
      },
    );

    expect(result).toBeInstanceOf(HttpTopologyHierarchyGateway);
    expect(result.dataOrigin).toEqual({
      kind: "live",
      adapterId: "http-topology-hierarchy/v1",
    });
  });

  it("keeps missing configuration as an explicit error without demo fallback", async () => {
    const result = createLiveTopologyGateway({}, {});

    await expect(
      result.getSnapshot(new AbortController().signal),
    ).rejects.toMatchObject({ code: "unconfigured" });
    expect(result.dataOrigin.kind).toBe("live");
  });
});

