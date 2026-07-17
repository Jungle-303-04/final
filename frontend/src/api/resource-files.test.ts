import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseResourceFileResult,
  RESOURCE_FILE_COMMANDS_PATH,
  startResourceFileCommand,
} from "./resource-files";

describe("resource filesystem API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("submits an audited resource file command", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
    }));

    await expect(startResourceFileCommand({
      capability_id: "pod.filesystem",
      capability_revision: "a".repeat(64),
      resource_id: "pod:shop/checkout-api-0",
      snapshot_id: "snapshot-1",
      resource: {
        api_group: "",
        version: "v1",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api-0",
        uid: "pod-uid-1",
      },
      operation: "pod.list",
      container: "app",
      path: "/var/log",
      confirmation: true,
      idempotency_key: "resource-files-test-1",
    })).resolves.toMatchObject({ command_id: "command-1" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(RESOURCE_FILE_COMMANDS_PATH);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("validates streamed resource file results at the API boundary", () => {
    expect(parseResourceFileResult({
      operation: "pod.list",
      path: "/var/log",
      entries: [],
      cursor: 0,
      next_cursor: null,
      total_entries: 0,
      truncated: false,
      artifact_id: null,
    })).toMatchObject({ operation: "pod.list", path: "/var/log" });

    expect(() => parseResourceFileResult({
      operation: "pod.list",
      path: "relative/path",
      entries: [],
    })).toThrow();
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
