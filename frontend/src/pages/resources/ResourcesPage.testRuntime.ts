import { vi } from "vitest";

import type {
  ResourceActionsPort,
  ResourceCapabilitiesPort,
} from "../../features/resources/resourceCapabilitiesContract";

export function resourcesCapabilitiesPort(
  overrides: Partial<ResourceCapabilitiesPort> = {},
): ResourceCapabilitiesPort {
  return {
    loadResourceCapabilities: vi.fn().mockImplementation((resourceId: string) =>
      Promise.resolve({
        subject: {
          resourceId,
          snapshotId: "snapshot-42",
          clusterId: "cluster-1",
          resourceType: "pod",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
        },
        revision: "a".repeat(64),
        capabilities: [],
      }),
    ),
    ...overrides,
  };
}

export function resourcesActionsPort(
  overrides: Partial<ResourceActionsPort> = {},
): ResourceActionsPort {
  const receipt = {
    accepted: true,
    eventId: "event-1",
    correlationId: "correlation-1",
    commandId: "command-1",
  };
  return {
    previewDeletion: vi.fn(),
    execute: vi.fn().mockResolvedValue(receipt),
    ...overrides,
  };
}
