import { describe, expect, it, vi } from "vitest";

import { createAlertChannelsAdapter } from "./createAlertChannelsAdapter";

describe("createAlertChannelsAdapter", () => {
  it("maps persisted channel state and sends a test through the real endpoint", async () => {
    const deleteAlertChannel = vi.fn(async () => undefined);
    const saveAlertChannel = vi.fn(async (input: { channel_id: string }) => endpointChannel(input.channel_id || "channel-2"));
    const testAlertChannel = vi.fn(async () => ({
      code: null,
      delivered: true,
      detail: "delivered",
      status_code: 204,
      valid: true,
    }));
    const port = createAlertChannelsAdapter({
      deleteAlertChannel,
      listAlertChannels: async () => ({ channels: [endpointChannel("channel-1")] }),
      saveAlertChannel,
      testAlertChannel,
    });

    const [channel] = await port.list();
    expect(channel).toMatchObject({
      id: "channel-1",
      minimumSeverity: "critical",
      name: "SRE",
    });
    await expect(port.test(channel!)).resolves.toEqual({
      delivered: true,
      detail: "delivered",
      statusCode: 204,
      valid: true,
    });
    expect(testAlertChannel).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: "channel-1",
      severity: "critical",
      url: "https://hooks.example/opsia/secret",
    }), undefined);
    await expect(port.save({
      enabled: false,
      id: null,
      kind: "webhook",
      minimumSeverity: "critical",
      name: "SRE",
      url: "https://hooks.example/opsia/secret",
    })).resolves.toMatchObject({ id: "channel-2" });
    await port.remove("channel-2");
    expect(saveAlertChannel).toHaveBeenCalledWith(expect.objectContaining({ channel_id: "" }), undefined);
    expect(deleteAlertChannel).toHaveBeenCalledWith("channel-2", undefined);
  });
});

function endpointChannel(id: string) {
  return {
    channel_id: id,
    enabled: true,
    kind: "webhook",
    last_test_detail: "delivered",
    last_test_status: "passed",
    last_test_status_code: 204,
    last_tested_at: "2026-07-19T01:00:00Z",
    min_severity: "critical",
    name: "SRE",
    url: "https://hooks.example/opsia/secret",
    workspace_id: "workspace-1",
  };
}
