import { vi } from "vitest";

export function completedOperationStore(artifact: Record<string, unknown>) {
  const projection = artifact.hooks_diff ?? artifact.resources_diff;
  const normalizedArtifact = projection && typeof projection === "object"
    ? {
      ...artifact,
      projection_bytes: new TextEncoder().encode(JSON.stringify(projection)).byteLength,
    }
    : artifact;
  const snapshot = {
    commandId: "cmd-helm-1",
    event: {
      commandId: "cmd-helm-1",
      sequence: 2,
      kind: "completed" as const,
      occurredAt: "2026-07-16T09:02:00Z",
      payload: { result: { artifact: normalizedArtifact } },
    },
    failure: null,
    retry: null,
    sequence: 2,
    status: "completed" as const,
    updatedAt: 1,
  };
  return {
    start: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => snapshot),
  };
}
