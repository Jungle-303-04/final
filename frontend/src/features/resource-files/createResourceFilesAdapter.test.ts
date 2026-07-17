import { describe, expect, it, vi } from "vitest";

import { createResourceFilesAdapter } from "./createResourceFilesAdapter";
import type { ResourceFileCommandInput } from "./resourceFilesContract";

const INPUT: ResourceFileCommandInput = {
  capabilityId: "pod.filesystem",
  capabilityRevision: "a".repeat(64),
  resourceId: "pod:shop/checkout-api-0",
  snapshotId: "snapshot-42",
  resource: {
    apiGroup: "",
    version: "v1",
    kind: "Pod",
    namespace: "shop",
    name: "checkout-api-0",
    uid: "pod-uid-1",
  },
  operation: "pod.list",
  container: "app",
  path: "/var/log",
  cursor: 0,
  limit: 40,
};

describe("resource files adapter", () => {
  it("waits for the audited SSE completion and validates its typed result", async () => {
    const startResourceFileCommand = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      audit_event_id: "event-1",
      correlation_id: "correlation-1",
      command_id: "command-1",
      status: "queued",
    });
    const subscribeCommandOperationEvents = vi.fn(async function* () {
      yield {
        command_id: "command-1",
        sequence: 1,
        kind: "progress" as const,
        payload: { status: "queued" },
        occurred_at: "2026-07-18T00:00:00.000Z",
      };
      yield {
        command_id: "command-1",
        sequence: 2,
        kind: "completed" as const,
        payload: {
          status: "completed",
          result: {
            resource_file: {
              operation: "pod.list",
              path: "/var/log",
              entries: [{
                name: "app.log",
                path: "/var/log/app.log",
                type: "file",
                size: 12,
                permissions: "-rw-r--r--",
                modified_at: null,
                link_target: null,
              }],
              cursor: 0,
              next_cursor: null,
              total_entries: 1,
              truncated: false,
              artifact_id: null,
            },
          },
        },
        occurred_at: "2026-07-18T00:00:01.000Z",
      };
    });
    const port = createResourceFilesAdapter({
      startResourceFileCommand,
      subscribeCommandOperationEvents,
    });

    await expect(port.run(INPUT)).resolves.toMatchObject({
      operation: "pod.list",
      path: "/var/log",
      entries: [{ name: "app.log" }],
    });
    expect(startResourceFileCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "pod.list",
        confirmation: true,
        idempotency_key: expect.stringMatching(/^resource-files-/u),
      }),
      undefined,
    );
    expect(subscribeCommandOperationEvents).toHaveBeenCalledWith(
      "command-1",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("reads sequential chunks with browser backpressure and verifies the digest", async () => {
    const port = createResourceFilesAdapter({
      startResourceFileCommand: vi.fn()
        .mockResolvedValueOnce(receipt("command-1"))
        .mockResolvedValueOnce(receipt("command-2")),
      subscribeCommandOperationEvents: vi.fn((commandId: string) => eventsFor(
        commandId,
        commandId === "command-1"
          ? chunk("aGVsbG8g", 0, 6, false, "f6a6263167c92de8644ac998b3c4e4d1a5b03df5f4a09bd2770e408bafba5b0e")
          : chunk("d29ybGQ=", 6, 11, true, "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7"),
      )),
    });

    const blob = await port.download({
      ...INPUT,
      operation: "pod.read",
      path: "/var/log/app.log",
      cursor: null,
      limit: 65_536,
    });

    expect(await blob.text()).toBe("hello world");
  });
});

function receipt(commandId: string) {
  return {
    accepted: true as const,
    event_id: `${commandId}-event`,
    audit_event_id: `${commandId}-event`,
    correlation_id: `${commandId}-correlation`,
    command_id: commandId,
    status: "queued" as const,
  };
}

function chunk(
  data_base64: string,
  offset: number,
  next_offset: number,
  eof: boolean,
  sha256: string,
) {
  return {
    operation: "pod.read" as const,
    path: "/var/log/app.log",
    data_base64,
    offset,
    next_offset,
    eof,
    total_size: eof ? next_offset : null,
    sha256,
    artifact_id: null,
    media_type: "application/octet-stream",
    filename: "app.log",
  };
}

async function* eventsFor(commandId: string, resource_file: ReturnType<typeof chunk>) {
  yield {
    command_id: commandId,
    sequence: 1,
    kind: "completed" as const,
    payload: { status: "completed", result: { resource_file } },
    occurred_at: "2026-07-18T00:00:00.000Z",
  };
}
