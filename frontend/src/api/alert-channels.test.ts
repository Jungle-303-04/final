import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import { listAlertChannels, testAlertChannel } from "./alert-channels";

const CHANNEL = {
  channel_id: "chan-ops",
  workspace_id: "workspace-1",
  name: "운영 웹훅",
  kind: "webhook",
  url: "https://hooks.example/ops",
  min_severity: "warning",
  enabled: false,
  last_tested_at: "2026-07-15T00:00:00Z",
  last_test_status: "passed",
  last_test_detail: "테스트 알림을 전송했습니다.",
  last_test_status_code: 204,
  created_at: "2026-07-15T00:00:00Z",
  updated_at: "2026-07-15T00:00:00Z",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("alert channel API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists saved channels and forwards cancellation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ channels: [CHANNEL] }),
    );
    const controller = new AbortController();

    await expect(listAlertChannels(controller.signal)).resolves.toEqual({ channels: [CHANNEL] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alert-channels",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        signal: controller.signal,
      }),
    );
  });

  it("tests a channel with the backend defaults and one POST", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      valid: true,
      delivered: true,
      code: null,
      detail: "테스트 알림을 전송했습니다.",
      status_code: 204,
      channel: CHANNEL,
    }));

    await expect(testAlertChannel({
      channel_id: "chan-ops",
      name: "운영 웹훅",
      url: "https://hooks.example/ops",
    })).resolves.toMatchObject({ valid: true, delivered: true, channel: CHANNEL });

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/alert-channels/test");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        channel_id: "chan-ops",
        name: "운영 웹훅",
        kind: "webhook",
        url: "https://hooks.example/ops",
        min_severity: "warning",
        severity: "warning",
        message: "알림 채널 테스트",
      }),
    });
    expect(new Headers(init?.headers).get("x-service-csrf")).toBe("same-origin");
  });

  it("keeps an unsuccessful real delivery result instead of inventing success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      valid: false,
      delivered: false,
      code: "timeout",
      detail: "테스트 알림 전송에 실패했습니다.",
      status_code: null,
      channel: null,
    }));

    await expect(testAlertChannel({
      url: "https://hooks.example/ops",
      severity: "critical",
    })).resolves.toEqual({
      valid: false,
      delivered: false,
      code: "timeout",
      detail: "테스트 알림 전송에 실패했습니다.",
      status_code: null,
      channel: null,
    });
  });

  it("rejects malformed channel state and test responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ channels: [{ ...CHANNEL, last_tested_at: "yesterday" }] }),
    );

    await expect(listAlertChannels()).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      valid: true,
      detail: "missing delivery evidence",
      status_code: 204,
      channel: null,
    }));
    await expect(testAlertChannel({ url: "https://hooks.example/ops" })).rejects.toMatchObject({
      kind: "invalid-payload",
      status: 200,
    } satisfies Partial<ApiError>);
  });

  it("does not retry a channel test that may already have been delivered", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("connection closed after send"),
    );

    await expect(testAlertChannel({
      url: "https://hooks.example/ops",
    })).rejects.toMatchObject({ kind: "network" } satisfies Partial<ApiError>);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
