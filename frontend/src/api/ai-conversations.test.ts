import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./client";
import {
  appendAiMessage,
  createAiConversation,
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
          limit: 100,
          has_more: false,
          next_cursor: null,
          messages_completeness: "complete",
          partial_reason_codes: [],
        }),
      );

    await getAiConversation("aic/123");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations/aic%2F123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("passes bounded message pagination without changing the conversation identity", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          conversation: { conversation_id: "aic-123" },
          messages: [],
          limit: 50,
          has_more: true,
          next_cursor: "next-page",
          messages_completeness: "partial",
          partial_reason_codes: ["bounded_message_history"],
        }),
      );

    await getAiConversation("aic-123", undefined, {
      limit: 50,
      cursor: "current/page",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/conversations/aic-123?limit=50&cursor=current%2Fpage",
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
    expect(() => getAiConversation("aic-123", undefined, { limit: 201 })).toThrow(
      "AI conversation page limit must be between 1 and 200",
    );
    expect(() => getAiConversation("aic-123", undefined, { cursor: " " })).toThrow(
      "AI conversation cursor must not be empty",
    );
    await expect(appendAiMessage(" ", { message: "Continue" })).rejects.toThrow(
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

});
