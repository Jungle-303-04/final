import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { HomePort } from "../../../features/home/homeContract";

const surfaceMocks = vi.hoisted(() => ({
  createPhysicalTopologyAdapter: vi.fn(),
  createRelationTopologyAdapter: vi.fn(),
  createTopologySurface: vi.fn(),
}));

vi.mock("../../../api", () => ({
  createRealtimeClient: vi.fn(),
  getPhysicalTopology: vi.fn(),
  getRelationTopology: vi.fn(),
}));
vi.mock("../../../features/resources/createPhysicalTopologyAdapter", () => ({
  createPhysicalTopologyAdapter: surfaceMocks.createPhysicalTopologyAdapter,
}));
vi.mock("../../../features/resources/createRelationTopologyAdapter", () => ({
  createRelationTopologyAdapter: surfaceMocks.createRelationTopologyAdapter,
}));
vi.mock("../../../pages/topology/createTopologySurface", () => ({
  createTopologySurface: surfaceMocks.createTopologySurface,
}));

import { loadTopologySurface } from "./topology";

describe("topology composition surface", () => {
  it("builds a page loader that is independent from the Resources page factory", () => {
    const Surface = (() => null) as ComponentType;
    const homePort = {} as HomePort;
    const physicalPort = { kind: "physical" };
    const relationPort = { kind: "relations" };
    surfaceMocks.createPhysicalTopologyAdapter.mockReturnValueOnce(physicalPort);
    surfaceMocks.createRelationTopologyAdapter.mockReturnValueOnce(relationPort);
    surfaceMocks.createTopologySurface.mockReturnValueOnce(Surface);

    expect(loadTopologySurface(homePort)).toBe(Surface);
    expect(surfaceMocks.createTopologySurface).toHaveBeenCalledWith(
      physicalPort,
      expect.objectContaining({ connect: expect.any(Function) }),
      relationPort,
      homePort,
    );
  });
});
