import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { HomePort } from "../../../features/home/homeContract";

const surfaceMocks = vi.hoisted(() => ({
  createTopologyPorts: vi.fn(),
  createTopologySurface: vi.fn(),
}));

vi.mock("../topologyPorts", () => ({
  createTopologyPorts: surfaceMocks.createTopologyPorts,
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
    const realtimePort = { connect: vi.fn() };
    surfaceMocks.createTopologyPorts.mockReturnValueOnce({
      physical: physicalPort,
      realtime: realtimePort,
      relation: relationPort,
    });
    surfaceMocks.createTopologySurface.mockReturnValueOnce(Surface);

    expect(loadTopologySurface(homePort)).toBe(Surface);
    expect(surfaceMocks.createTopologySurface).toHaveBeenCalledWith(
      physicalPort,
      realtimePort,
      relationPort,
      homePort,
    );
  });
});
