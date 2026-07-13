import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  appendAiMessage,
  createAiConversation,
  deleteAiConversation,
  getAiConversation,
  listAiConversations,
} from "./ai-conversations";

const ACCEPTED = {
  accepted: true,
  conversation_id: "aic-123",
  message_id: "aim-123",
  event_id: "evt-123",
  correlation_id: "corr-123",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

describe("AI conversation API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists conversations without message bodies", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ conversations: [{ conversation_id: "aic-123" }] }));

    await expect(listAiConversations()).resolves.toEqual({
      conversations: [{ conversation_id: "aic-123" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("loads one conversation with messages", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          conversation: { conversation_id: "aic/123", status: "waiting" },
          messages: [{ role: "user", content: "Why is the Pod restarting?" }],
        }),
      );

    await getAiConversation("aic/123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations/aic%2F123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a conversation with context", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await expect(
      createAiConversation({
        message: "Why is payment-api restarting?",
        title: "Payment incident",
        context: { cluster_id: "prod-seoul-01", incident_id: "inc-456" },
      }),
    ).resolves.toEqual(ACCEPTED);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "Why is payment-api restarting?",
          title: "Payment incident",
          context: { cluster_id: "prod-seoul-01", incident_id: "inc-456" },
        }),
      }),
    );
  });

  it("appends a message without sending a title", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(ACCEPTED));

    await appendAiMessage("aic-123", {
      message: "What evidence supports that conclusion?",
      context: { correlation_id: "corr-123" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations/aic-123/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          message: "What evidence supports that conclusion?",
          context: { correlation_id: "corr-123" },
        }),
      }),
    );
  });

  it("passes AbortSignal to reads and does not retry a possibly-sent POST", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    controller.abort();

    await expect(listAiConversations(controller.signal)).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/ai/conversations",
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await expect(appendAiMessage(
      "aic-123",
      { message: "Continue" },
      controller.signal,
    )).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/ai/conversations/aic-123/messages",
      expect.objectContaining({ method: "POST", signal: controller.signal }),
    );
  });

  it("rejects empty read and append identifiers before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(() => getAiConversation(" ")).toThrow("conversationId must not be empty");
    await expect(appendAiMessage(" ", { message: "Continue" })).rejects.toThrow(
      "conversationId must not be empty",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a conversation and accepts the 204 response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(emptyResponse());
    const controller = new AbortController();

    await expect(deleteAiConversation("aic/123", controller.signal)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(path).toBe("/api/ai/conversations/aic%2F123");
    expect(init).toMatchObject({
      method: "DELETE",
      credentials: "include",
      signal: controller.signal,
    });
    expect(init?.body).toBeUndefined();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-service-csrf")).toBe("same-origin");
  });

  it("preserves AbortError and does not retry a possibly-sent deletion", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    const controller = new AbortController();
    controller.abort();

    await expect(
      deleteAiConversation("aic-123", controller.signal),
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations/aic-123",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects an empty conversation id before making a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(() => deleteAiConversation(" ")).toThrow(
      "conversationId must not be empty",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates message length before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(createAiConversation({ message: "   " })).rejects.toThrow(
      "AI message must not be empty",
    );
    await expect(
      appendAiMessage("aic-123", { message: "x".repeat(16_001) }),
    ).rejects.toThrow("AI message must be at most 16000 characters");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a missing conversation error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "conversation not found" }, 404),
    );

    await expect(getAiConversation("missing")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "conversation not found",
    } satisfies Partial<ApiError>);
  });

  it("preserves a delete error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "conversation not found" }, 404),
    );

    await expect(deleteAiConversation("missing")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      detail: "conversation not found",
    } satisfies Partial<ApiError>);
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "http"],
    [422, "invalid-request"],
    [429, "rate-limited"],
  ] as const)(
    "preserves a structured %i delete error",
    async (status, kind) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({
          detail: {
            code: `delete_${status}`,
            detail: `delete failed with ${status}`,
            ...(status === 429 ? { retry_after: 7 } : {}),
          },
        }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );

      await expect(deleteAiConversation("aic-123")).rejects.toMatchObject({
        code: `delete_${status}`,
        detail: `delete failed with ${status}`,
        kind,
        retryAfter: status === 429 ? 7 : null,
        status,
      } satisfies Partial<ApiError>);
    },
  );
});
