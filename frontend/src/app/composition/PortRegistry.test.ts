import { describe, expect, it } from "vitest";
import { createOperationStatusStore } from "../../features/operations/OperationStatusStore";
import { EMPTY_OPERATION_EVENTS_PORT } from "../../features/operations/operationEventsContract";
import type { HomePort } from "../../features/home/homeContract";
import { createPortRegistry } from "./PortRegistry";

const EmptySurface = () => null;
const homePort: HomePort = {
  loadDashboardRefreshPolicy: async () => ({
    staleAfterSeconds: 15,
    refreshAfterSeconds: 30,
    keepLastSuccess: true,
    pauseWhenHidden: true,
    eventInvalidation: true,
    retryAfterSeconds: null,
    retryLimit: null,
    postMutationRefreshAfterSeconds: null,
  }),
  listClusterChoices: async () => ({ clusters: [], completeness: "unknown" }),
  loadClusterOverview: async () => { throw new Error("not used"); },
  loadInsights: async () => { throw new Error("not used"); },
  loadNodes: async () => { throw new Error("not used"); },
  loadNodePods: async () => { throw new Error("not used"); },
  subscribeDashboardInvalidations: () => ({
    async *[Symbol.asyncIterator]() {
      yield* [];
    },
  }),
};

describe("authenticated port registry", () => {
  it("rejects new surface module work after the authenticated session is disposed", async () => {
    const registry = createPortRegistry({
      homePort,
      operationStatusStore: createOperationStatusStore(EMPTY_OPERATION_EVENTS_PORT),
    });
    const loader = registry.createSurfaceLoader(async () => ({ default: EmptySurface }));

    await expect(loader.load()).resolves.toEqual({ default: EmptySurface });
    registry.dispose();
    loader.reset();

    await expect(loader.load()).rejects.toThrow("authenticated composition session is disposed");
  });
});
